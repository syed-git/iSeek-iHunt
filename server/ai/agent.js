const engine = require('./engine');
const llm = require('./llm');
const { detectCategories, detectColors, tokens } = require('./keywords');
const { db, toBlob, fromBlob } = require('../db');
const path = require('path');
const { CATEGORY_NAMES, CATEGORIES, COLORS } = require('../categories');
const { UPLOAD_DIR, OPENAI_MODEL } = require('../config');

const PHOTO_SAME_CATEGORY_MIN = 0.66;
const PHOTO_ANY_CATEGORY_MIN = 0.8;
const TEXT_IMAGE_MIN = 0.235;
const MAX_RESULTS = 8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pct = (p) => `${Math.round(p * 100)}%`;
const iconFor = (cat) => (CATEGORIES.find((c) => c.name === cat) || {}).icon || '📦';

function photoConfidence(vis) {
  return clamp(Math.round(50 + ((vis - PHOTO_SAME_CATEGORY_MIN) / 0.29) * 50), 35, 99);
}

function textConfidence(score) {
  return clamp(Math.round(40 + (score - 0.22) * 420), 30, 97);
}

function loadIndex({ statuses = ['available'], itemId = null } = {}) {
  const where = itemId ? 'i.id = ?' : `i.status IN (${statuses.map(() => '?').join(',')})`;
  const rows = db
    .prepare(
      `SELECT i.*, s.name AS station_name, s.type AS station_type, s.address AS station_address, s.city AS station_city,
              s.phone AS station_phone, s.email AS station_email, s.hours AS station_hours, s.lat AS station_lat, s.lng AS station_lng
         FROM items i JOIN stations s ON s.id = i.station_id WHERE ${where}`
    )
    .all(...(itemId ? [itemId] : statuses));
  const photoStmt = db.prepare('SELECT id, path, embedding FROM item_photos WHERE item_id = ? ORDER BY id');
  return rows.map((r) => {
    const photos = photoStmt.all(r.id).map((p) => ({ id: p.id, path: p.path, emb: fromBlob(p.embedding) }));
    return { ...r, photos, textEmb: fromBlob(r.text_embedding), tags: r.ai_tags ? JSON.parse(r.ai_tags) : {} };
  });
}

function publicItem(it, extra = {}) {
  return {
    id: it.id,
    title: it.title,
    category: it.category,
    icon: iconFor(it.category),
    description: it.description,
    found_location: it.found_location,
    found_at: it.found_at,
    status: it.status,
    ai_caption: it.ai_caption,
    colors: (it.tags && it.tags.colors) || [],
    photos: it.photos.map((p) => `/uploads/${p.path}`),
    station: {
      id: it.station_id,
      name: it.station_name,
      type: it.station_type,
      address: it.station_address,
      city: it.station_city,
      phone: it.station_phone,
      email: it.station_email,
      hours: it.station_hours,
      lat: it.station_lat,
      lng: it.station_lng,
    },
    ...extra,
  };
}

function aggregateLabels(lists) {
  const acc = new Map();
  lists.forEach((list) => list.forEach((l) => acc.set(l.name, (acc.get(l.name) || 0) + l.prob / lists.length)));
  return [...acc.entries()].map(([name, prob]) => ({ name, prob })).sort((a, b) => b.prob - a.prob);
}

async function analyzePhotos(filePaths) {
  const embeddings = [];
  const perPhoto = [];
  for (const fp of filePaths) {
    const emb = await engine.embedImage(fp);
    embeddings.push(emb);
    perPhoto.push({ categories: engine.classifyCategory(emb, 3), colors: engine.classifyColor(emb, 2) });
  }
  const categories = aggregateLabels(perPhoto.map((p) => p.categories)).slice(0, 3);
  const colors = aggregateLabels(perPhoto.map((p) => p.colors)).slice(0, 2);
  const topCat = categories[0].name;
  const noun = (CATEGORIES.find((c) => c.name === topCat) || { prompts: ['an item'] }).prompts[0].replace(/^(a|an)\s+/, '');
  const caption = `${colors[0].name} ${noun}`;
  const result = { embeddings, perPhoto, categories, colors, caption, llm: null };
  if (llm.enabled()) {
    try {
      result.llm = await llm.describePhotos(filePaths, CATEGORY_NAMES);
    } catch (err) {
      console.warn('[ai] LLM describe failed:', err.message);
    }
  }
  return result;
}

function queryCategories(analysis) {
  const cats = analysis.categories.filter((c, i) => i === 0 || c.prob >= 0.15).map((c) => c.name);
  if (analysis.llm && CATEGORY_NAMES.includes(analysis.llm.category) && !cats.includes(analysis.llm.category)) {
    cats.unshift(analysis.llm.category);
  }
  return cats;
}

function scorePhotoMatch(queryEmbs, item, cats, colors) {
  let vis = 0;
  let bestPhoto = 0;
  queryEmbs.forEach((q) =>
    item.photos.forEach((p, idx) => {
      const s = engine.cosine(q, p.emb);
      if (s > vis) {
        vis = s;
        bestPhoto = idx;
      }
    })
  );
  const catMatch = cats.includes(item.category);
  const itemColors = (item.tags && item.tags.colors) || [];
  const colorMatch = colors.some((c) => itemColors.includes(c));
  const ok = (catMatch && vis >= PHOTO_SAME_CATEGORY_MIN) || vis >= PHOTO_ANY_CATEGORY_MIN;
  const score = vis + (catMatch ? 0.03 : 0) + (colorMatch ? 0.01 : 0);
  return { ok, vis, score, catMatch, colorMatch, bestPhoto };
}

function reasonFor(m, kind) {
  const bits = [];
  if (kind === 'photo') bits.push(`${pct(m.vis)} visual similarity`);
  else bits.push(`${pct(m.vis)} text-to-image alignment`);
  if (m.catMatch) bits.push('category agrees');
  if (m.colorMatch) bits.push('colour agrees');
  if (m.keywordHits && m.keywordHits.length) bits.push(`keywords: ${m.keywordHits.slice(0, 4).join(', ')}`);
  return bits.join(' · ');
}

async function llmRerank(queryPaths, queryText, matches, trace) {
  if (!llm.enabled() || !matches.length) return matches;
  try {
    const verdicts = await llm.verifyCandidates(
      queryPaths,
      queryText,
      matches.slice(0, 6).map((m) => ({ id: m.id, title: m.title, description: m.description, photoPath: m._bestPhotoPath }))
    );
    const byId = new Map(verdicts.map((v) => [Number(v.id), v]));
    matches.forEach((m) => {
      const v = byId.get(m.id);
      if (v) {
        m.confidence = Math.round(m.confidence * 0.4 + clamp(Number(v.confidence) || 0, 0, 100) * 0.6);
        m.reason = `${v.reason} (${m.reason})`;
      }
    });
    matches.sort((a, b) => b.confidence - a.confidence);
    trace.push({ icon: '🧠', title: 'GPT vision agent verified candidates', detail: `Cross-checked top ${Math.min(6, matches.length)} candidates with ${OPENAI_MODEL}` });
    return matches.filter((m) => m.confidence >= 35);
  } catch (err) {
    console.warn('[ai] LLM rerank failed:', err.message);
    return matches;
  }
}

async function searchByPhotos(filePaths) {
  const t0 = Date.now();
  const trace = [{ icon: '📥', title: `Vision agent received ${filePaths.length} photo${filePaths.length > 1 ? 's' : ''}`, detail: 'Normalising and resizing to 224×224 for the CLIP ViT-B/32 encoder' }];
  const analysis = await analyzePhotos(filePaths);
  analysis.perPhoto.forEach((p, i) =>
    trace.push({
      icon: '👁️',
      title: `Photo ${i + 1}: looks like ${p.categories[0].name} (${pct(p.categories[0].prob)})`,
      detail: `Dominant colour: ${p.colors.map((c) => c.name).join(' / ')} · runner-up: ${p.categories[1].name} (${pct(p.categories[1].prob)})`,
    })
  );
  if (analysis.llm) trace.push({ icon: '📝', title: `GPT vision caption: ${analysis.llm.title}`, detail: analysis.llm.description || '' });
  trace.push({ icon: '🧬', title: 'Generated visual fingerprint', detail: `${analysis.embeddings.length} × 512-dimensional embedding${analysis.embeddings.length > 1 ? 's' : ''}` });

  const cats = queryCategories(analysis);
  const colors = analysis.colors.map((c) => c.name);
  const index = loadIndex();
  const photoCount = index.reduce((n, it) => n + it.photos.length, 0);
  const locations = new Set(index.map((it) => it.station_id)).size;
  trace.push({ icon: '🔎', title: `Compared against ${photoCount} photos of ${index.length} found items`, detail: `Across ${locations} police stations, airports and offices` });

  let matches = index
    .map((it) => ({ it, m: scorePhotoMatch(analysis.embeddings, it, cats, colors) }))
    .filter(({ m }) => m.ok)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, MAX_RESULTS)
    .map(({ it, m }) =>
      publicItem(it, {
        confidence: photoConfidence(m.vis),
        similarity: Number(m.vis.toFixed(4)),
        reason: reasonFor(m, 'photo'),
        best_photo: m.bestPhoto,
        _bestPhotoPath: it.photos[m.bestPhoto] && path.join(UPLOAD_DIR, it.photos[m.bestPhoto].path),
      })
    );
  matches = await llmRerank(filePaths, null, matches, trace);
  matches.forEach((m) => delete m._bestPhotoPath);
  trace.push({
    icon: matches.length ? '✅' : '🕵️',
    title: matches.length ? `${matches.length} probable match${matches.length > 1 ? 'es' : ''} found` : 'No confident match yet',
    detail: matches.length ? `Ranked by visual similarity, category (${cats.join(', ')}) and colour agreement` : `Nothing in the ${cats[0]} inventory looks close enough`,
  });
  return {
    matches,
    analysis: { categories: analysis.categories, colors: analysis.colors, caption: analysis.llm ? analysis.llm.title : analysis.caption, llm: analysis.llm },
    embeddings: analysis.embeddings,
    trace,
    ms: Date.now() - t0,
  };
}

function textCategory(qEmb) {
  const ranked = engine.classifyCategory(qEmb, 2);
  return ranked[0].prob >= 0.35 ? [ranked[0].name] : [];
}

function haystack(it) {
  return `${it.title} ${it.description || ''} ${it.category} ${it.ai_caption || ''} ${((it.tags && it.tags.colors) || []).join(' ')}`.toLowerCase();
}

function scoreTextMatch(query, it) {
  if (query.cats.length && !query.cats.includes(it.category)) return null;
  let vis = 0;
  let bestPhoto = 0;
  it.photos.forEach((p, idx) => {
    const s = engine.cosine(query.emb, p.emb);
    if (s > vis) {
      vis = s;
      bestPhoto = idx;
    }
  });
  const txt = engine.cosine(query.emb, it.textEmb);
  const hay = haystack(it);
  const keywordHits = query.tokens.filter((w) => hay.includes(w));
  const kw = query.tokens.length ? keywordHits.length / query.tokens.length : 0;
  const itemColors = new Set([...((it.tags && it.tags.colors) || []), ...query.allColors.filter((c) => hay.includes(c))]);
  const colorMatch = query.colors.length > 0 && query.colors.some((c) => itemColors.has(c));
  const colorMiss = query.colors.length > 0 && !colorMatch;
  const score = vis + 0.08 * kw + 0.03 * txt + (colorMatch ? 0.03 : 0) - (colorMiss ? 0.03 : 0);
  const ok = vis >= TEXT_IMAGE_MIN || kw >= 0.5;
  return { ok, vis, txt, kw, score, keywordHits, colorMatch, catMatch: query.cats.includes(it.category), bestPhoto };
}

async function buildTextQuery(text) {
  let visualText = text;
  let llmOut = null;
  if (llm.enabled()) {
    try {
      llmOut = await llm.parseDescription(text, CATEGORY_NAMES);
      if (llmOut && llmOut.visual_query) visualText = llmOut.visual_query;
    } catch (err) {
      console.warn('[ai] LLM parse failed:', err.message);
    }
  }
  const emb = await engine.embedText(`a photo of ${visualText}`);
  let cats = detectCategories(text);
  let catSource = 'keywords';
  if (llmOut && CATEGORY_NAMES.includes(llmOut.category) && !cats.includes(llmOut.category)) cats.unshift(llmOut.category);
  if (!cats.length) {
    cats = textCategory(emb);
    catSource = 'semantic';
  }
  const colors = detectColors(text);
  return { text, emb, cats, catSource, colors, allColors: COLORS, tokens: [...new Set(tokens(text))], llm: llmOut };
}

async function searchByText(text) {
  const t0 = Date.now();
  const trace = [{ icon: '📥', title: 'Language agent read your description', detail: `"${text.slice(0, 140)}${text.length > 140 ? '…' : ''}"` }];
  const query = await buildTextQuery(text);
  if (query.llm) trace.push({ icon: '🧠', title: 'GPT extracted attributes', detail: JSON.stringify({ category: query.llm.category, colors: query.llm.colors, brand: query.llm.brand }) });
  trace.push({
    icon: '🏷️',
    title: query.cats.length ? `Understood item type: ${query.cats.join(', ')}` : 'Item type unclear — searching every category',
    detail: `${query.catSource === 'keywords' ? 'From keywords' : 'From semantic understanding'}${query.colors.length ? ` · colour: ${query.colors.join(', ')}` : ''}${query.tokens.length ? ` · key terms: ${query.tokens.slice(0, 6).join(', ')}` : ''}`,
  });
  trace.push({ icon: '🎨', title: 'Imagined what the item looks like', detail: 'Projected the description into the same 512-d visual space as the found-item photos (CLIP)' });
  const index = loadIndex();
  trace.push({ icon: '🔎', title: `Visually compared against ${index.reduce((n, it) => n + it.photos.length, 0)} photos of ${index.length} found items`, detail: 'Text-to-image similarity + keyword and colour agreement' });

  let matches = index
    .map((it) => ({ it, m: scoreTextMatch(query, it) }))
    .filter(({ m }) => m && m.ok)
    .sort((a, b) => b.m.score - a.m.score)
    .slice(0, MAX_RESULTS)
    .map(({ it, m }) =>
      publicItem(it, {
        confidence: textConfidence(m.score),
        similarity: Number(m.vis.toFixed(4)),
        reason: reasonFor(m, 'text'),
        best_photo: m.bestPhoto,
        _score: m.score,
      })
    );
  if (matches.length > 1) {
    const top = matches[0].confidence;
    const topScore = matches[0]._score;
    matches.forEach((m) => {
      m.confidence = Math.min(m.confidence, Math.round(top * (m._score / topScore) ** 3));
    });
    matches = matches.filter((m) => m.confidence >= top - 35);
  }
  matches.forEach((m) => delete m._score);
  trace.push({
    icon: matches.length ? '✅' : '🕵️',
    title: matches.length ? `${matches.length} probable match${matches.length > 1 ? 'es' : ''} found` : 'No confident match yet',
    detail: matches.length ? 'Ranked by how well each photo matches your description' : 'Nothing in the inventory matches this description',
  });
  return { matches, analysis: { categories: query.cats, colors: query.colors, tokens: query.tokens, llm: query.llm }, textEmbedding: query.emb, trace, ms: Date.now() - t0 };
}

async function indexItem(itemId, photoFullPaths) {
  const embs = [];
  const photoRows = db.prepare('SELECT id, path FROM item_photos WHERE item_id = ? ORDER BY id').all(itemId);
  const update = db.prepare('UPDATE item_photos SET embedding = ? WHERE id = ?');
  for (let i = 0; i < photoRows.length; i++) {
    const emb = await engine.embedImage(photoFullPaths[i]);
    update.run(toBlob(emb), photoRows[i].id);
    embs.push(emb);
  }
  const cats = aggregateLabels(embs.map((e) => engine.classifyCategory(e, 3))).slice(0, 3);
  const colors = aggregateLabels(embs.map((e) => engine.classifyColor(e, 2))).slice(0, 2);
  const item = db.prepare('SELECT title, description, category FROM items WHERE id = ?').get(itemId);
  const textEmb = await engine.embedText(`a photo of ${item.title}. ${item.description || ''}`);
  const tags = { categories: cats.map((c) => ({ name: c.name, prob: Number(c.prob.toFixed(3)) })), colors: colors.map((c) => c.name) };
  const noun = (CATEGORIES.find((c) => c.name === cats[0].name) || { prompts: ['an item'] }).prompts[0].replace(/^(a|an)\s+/, '');
  db.prepare('UPDATE items SET ai_tags = ?, ai_caption = ?, text_embedding = ? WHERE id = ?').run(
    JSON.stringify(tags),
    `${colors[0].name} ${noun}`,
    toBlob(textEmb),
    itemId
  );
}

function notifyMatchingReports(itemId) {
  const [item] = loadIndex({ itemId });
  if (!item || item.status !== 'available') return [];
  const reports = db.prepare("SELECT * FROM lost_reports WHERE status = 'searching'").all();
  const photoStmt = db.prepare('SELECT embedding FROM lost_report_photos WHERE report_id = ?');
  const created = [];
  for (const r of reports) {
    let confidence = 0;
    let reason = '';
    if (r.mode === 'photo') {
      const embs = photoStmt.all(r.id).map((p) => fromBlob(p.embedding)).filter(Boolean);
      if (!embs.length) continue;
      const cats = r.category ? r.category.split('|') : [];
      const m = scorePhotoMatch(embs, item, cats, []);
      if (!m.ok) continue;
      confidence = photoConfidence(m.vis);
      reason = reasonFor(m, 'photo');
    } else {
      const emb = fromBlob(r.text_embedding);
      if (!emb) continue;
      const cats = r.category ? r.category.split('|') : [];
      const query = { emb, cats, colors: detectColors(r.description), allColors: COLORS, tokens: [...new Set(tokens(r.description))] };
      const m = scoreTextMatch(query, item);
      if (!m || !m.ok || textConfidence(m.score) < 60) continue;
      confidence = textConfidence(m.score);
      reason = reasonFor(m, 'text');
    }
    db.prepare("UPDATE lost_reports SET status = 'matched', matched_item_id = ? WHERE id = ?").run(item.id, r.id);
    const info = db
      .prepare('INSERT INTO notifications (user_id, type, title, body, item_id, report_id, score) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(
        r.user_id,
        'match',
        `Good news! A possible match for your lost item was found`,
        `"${item.title}" was handed in at ${item.station_name} (${confidence}% AI match — ${reason}). Book an appointment to collect it.`,
        item.id,
        r.id,
        confidence
      );
    created.push({ notificationId: info.lastInsertRowid, userId: r.user_id, reportId: r.id, confidence });
  }
  return created;
}

async function suggestForPolice(filePaths) {
  const analysis = await analyzePhotos(filePaths);
  const top = analysis.categories[0];
  const noun = analysis.caption.split(' ').slice(1).join(' ');
  const sure = analysis.colors.filter((c) => c.prob >= 0.2).map((c) => c.name);
  const color = analysis.colors[0].prob >= 0.25 ? analysis.colors[0].name : '';
  const base = color ? `${color} ${noun}` : noun;
  const title = analysis.llm && analysis.llm.title ? analysis.llm.title : `${base[0].toUpperCase()}${base.slice(1)}`;
  return {
    category: analysis.llm && CATEGORY_NAMES.includes(analysis.llm.category) ? analysis.llm.category : top.name,
    categories: analysis.categories.map((c) => ({ name: c.name, prob: Number(c.prob.toFixed(3)) })),
    colors: analysis.colors.map((c) => c.name),
    title,
    description: analysis.llm && analysis.llm.description ? analysis.llm.description : `${title}.${sure.length ? ` Detected colours: ${sure.join(', ')}.` : ''}`,
    llm: Boolean(analysis.llm),
  };
}

module.exports = { searchByPhotos, searchByText, indexItem, notifyMatchingReports, suggestForPolice, loadIndex, publicItem, queryCategories };
