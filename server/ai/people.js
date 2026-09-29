// Missing-person agent: face descriptors for photo search, CLIP + attributes for descriptions, watchlist notifications.
const path = require('path');
const face = require('./face');
const engine = require('./engine');
const { tokens } = require('./keywords');
const { db, toBlob, fromBlob } = require('../db');
const { UPLOAD_DIR } = require('../config');

const MATCH_DISTANCE = 0.55;
const STRONG_DISTANCE = 0.42;
const TEXT_SHOW = 45;
const TEXT_NOTIFY = 62;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const faceConfidence = (d) => Math.round(clamp(100 - (d - 0.2) * 120, 0, 99));

function parseJSON(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

async function analyzeFiles(fullPaths) {
  const out = [];
  for (const full of fullPaths) out.push(await face.analyze(full));
  return out;
}

function publicAnalysis(a, url) {
  return { url, width: a.width, height: a.height, ms: a.ms, faces: a.faces.map(face.publicFace) };
}

async function clipFor(full) {
  try {
    return await engine.embedImage(full);
  } catch (err) {
    console.error('[people] CLIP embedding failed', err.message);
    return null;
  }
}

function summarizeFaces(analyses) {
  const primaries = analyses.map((a) => a.faces[0]).filter(Boolean);
  if (!primaries.length) return { age: null, gender: null };
  const age = Math.round(primaries.reduce((s, f) => s + f.age, 0) / primaries.length);
  const male = primaries.reduce((s, f) => s + (f.gender === 'male' ? f.gender_p : 1 - f.gender_p), 0) / primaries.length;
  return { age, gender: male >= 0.5 ? 'male' : 'female' };
}

async function indexPerson(personId, analysesByPath = {}) {
  const photos = db.prepare('SELECT * FROM person_photos WHERE person_id = ? ORDER BY id').all(personId);
  const upd = db.prepare('UPDATE person_photos SET width = ?, height = ?, faces = ?, descriptor = ?, clip_embedding = ? WHERE id = ?');
  const analyses = [];
  for (const p of photos) {
    const full = path.join(UPLOAD_DIR, p.path);
    let a = analysesByPath[full];
    if (!a && p.faces != null && p.clip_embedding) {
      analyses.push({ faces: parseJSON(p.faces, []) });
      continue;
    }
    if (!a) a = await face.analyze(full);
    const clip = p.clip_embedding ? fromBlob(p.clip_embedding) : await clipFor(full);
    upd.run(a.width, a.height, JSON.stringify(a.faces.map(face.publicFace)), a.faces[0] ? toBlob(a.faces[0].descriptor) : null, toBlob(clip), p.id);
    analyses.push(a);
  }
  const s = summarizeFaces(analyses);
  db.prepare('UPDATE persons SET ai_age = ?, ai_gender = ? WHERE id = ?').run(s.age, s.gender, personId);
}

async function indexReportPhoto(photoId, analysis = null) {
  const p = db.prepare('SELECT * FROM missing_report_photos WHERE id = ?').get(photoId);
  if (!p) return null;
  const a = analysis || (await face.analyze(path.join(UPLOAD_DIR, p.path)));
  db.prepare('UPDATE missing_report_photos SET width = ?, height = ?, faces = ?, descriptor = ? WHERE id = ?').run(
    a.width,
    a.height,
    JSON.stringify(a.faces.map(face.publicFace)),
    a.faces[0] ? toBlob(a.faces[0].descriptor) : null,
    p.id
  );
  return a;
}

function loadPersons({ statuses = ['in_care'], personId = null, stationId = null } = {}) {
  const where = [];
  const params = [];
  if (personId) {
    where.push('p.id = ?');
    params.push(personId);
  } else if (statuses) {
    where.push(`p.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (stationId) {
    where.push('p.station_id = ?');
    params.push(stationId);
  }
  const rows = db
    .prepare(
      `SELECT p.*, s.name AS station_name, s.type AS station_type, s.address AS station_address, s.city AS station_city, s.phone AS station_phone,
              s.email AS station_email, s.hours AS station_hours, s.lat AS station_lat, s.lng AS station_lng, o.name AS officer_name, o.badge AS officer_badge
         FROM persons p JOIN stations s ON s.id = p.station_id LEFT JOIN officers o ON o.id = p.officer_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.found_at DESC, p.id DESC`
    )
    .all(...params);
  const ph = db.prepare('SELECT * FROM person_photos WHERE person_id = ? ORDER BY id');
  return rows.map((r) => ({
    ...r,
    photos: ph.all(r.id).map((p) => ({
      id: p.id,
      path: p.path,
      width: p.width,
      height: p.height,
      faces: parseJSON(p.faces, null),
      descriptor: fromBlob(p.descriptor),
      clip: fromBlob(p.clip_embedding),
    })),
  }));
}

function publicPerson(p, extra = {}) {
  return {
    id: p.id,
    display_name: p.name || 'Unidentified person',
    name: p.name,
    gender: p.gender || p.ai_gender,
    gender_source: p.gender ? 'officer' : p.ai_gender ? 'ai' : null,
    age: p.approx_age || p.ai_age,
    age_source: p.approx_age ? 'officer' : p.ai_age ? 'ai' : null,
    ai_age: p.ai_age,
    ai_gender: p.ai_gender,
    description: p.description,
    condition: p.condition,
    found_location: p.found_location,
    found_at: p.found_at,
    status: p.status,
    created_at: p.created_at,
    officer: p.officer_name ? { name: p.officer_name, badge: p.officer_badge } : null,
    photos: p.photos.map((ph) => ({ url: `/uploads/${ph.path}`, width: ph.width, height: ph.height, faces: ph.faces || [] })),
    station: {
      id: p.station_id,
      name: p.station_name,
      type: p.station_type,
      address: p.station_address,
      city: p.station_city,
      phone: p.station_phone,
      email: p.station_email,
      hours: p.station_hours,
      lat: p.station_lat,
      lng: p.station_lng,
    },
    ...extra,
  };
}

function faceMatch(queries, person) {
  let best = null;
  queries.forEach((q) => {
    person.photos.forEach((ph, pi) => {
      if (!ph.descriptor) return;
      const d = face.distance(q.face.descriptor, ph.descriptor);
      if (!best || d < best.distance) best = { distance: d, query: q, photoIndex: pi, target: (ph.faces || [])[0] };
    });
  });
  return best;
}

function faceReason(best, person) {
  const q = best.query.face;
  const bits = [`Face-embedding distance ${best.distance.toFixed(2)} (≤ ${MATCH_DISTANCE} is flagged as a possible match)`];
  const age = person.approx_age || person.ai_age;
  if (age) bits.push(`AI age estimate ${q.age} vs ${person.approx_age ? 'recorded' : 'estimated'} ~${age}`);
  const g = person.gender || person.ai_gender;
  if (g) bits.push(q.gender === g ? `gender presentation agrees (${g})` : `gender estimate differs (${q.gender} vs ${g}) — check manually`);
  return bits.join(' · ');
}

function faceResult(best, person, extra = {}) {
  const confidence = faceConfidence(best.distance);
  return {
    confidence,
    distance: Math.round(best.distance * 1000) / 1000,
    strength: best.distance <= STRONG_DISTANCE ? 'strong' : 'possible',
    best_photo: best.photoIndex,
    query_photo: best.query.photoIndex,
    query_face: face.publicFace(best.query.face),
    target_face: best.target || null,
    geometry: face.compareGeometry(best.query.face.geometry, best.target && best.target.geometry),
    reason: faceReason(best, person),
    ...extra,
  };
}

function queriesFrom(analyses) {
  return analyses.map((a, photoIndex) => ({ photoIndex, face: a.faces[0] })).filter((q) => q.face);
}

function searchByFaces(analyses) {
  const t = Date.now();
  const queries = queriesFrom(analyses);
  const persons = loadPersons();
  const matches = [];
  if (queries.length) {
    persons.forEach((p) => {
      const best = faceMatch(queries, p);
      if (best && best.distance <= MATCH_DISTANCE) matches.push(publicPerson(p, faceResult(best, p)));
    });
  }
  matches.sort((a, b) => a.distance - b.distance);
  const faceCount = analyses.reduce((s, a) => s + a.faces.length, 0);
  const q0 = queries[0] && queries[0].face;
  const trace = [
    { icon: '🧠', title: 'Face detector (SSD-MobileNetV1)', detail: `${faceCount} face${faceCount === 1 ? '' : 's'} found in ${analyses.length} photo${analyses.length === 1 ? '' : 's'}` },
    { icon: '📍', title: '68 facial landmarks mapped', detail: 'Jawline, eyebrows, eyes, nose and mouth located on each face' },
    { icon: '🧬', title: '128-d face descriptor computed', detail: 'A numeric signature of facial structure, robust to lighting and expression' },
    q0 && { icon: '🔎', title: 'AI estimates', detail: `~${q0.age} yrs · ${q0.gender} (${Math.round(q0.gender_p * 100)}%) · ${q0.expression} · ${q0.geometry.face_shape} face · ${q0.geometry.pose}` },
    { icon: '👥', title: `Compared with ${persons.length} people in care`, detail: `Across police stations, airport, railway and security desks · ${matches.length} within the match threshold` },
  ].filter(Boolean);
  return { matches: matches.slice(0, 8), trace, ms: Date.now() - t, faces: faceCount };
}

const MALE = /\b(man|male|boy|gentleman|husband|father|dad|son|brother|grandfather|grandpa|uncle|he|his|him|guy)\b/i;
const FEMALE = /\b(woman|female|girl|lady|wife|mother|mom|mum|daughter|sister|grandmother|grandma|aunt|she|her)\b/i;

function parseAttributes(text, fields = {}) {
  const t = String(text || '');
  let gender = ['male', 'female'].includes(fields.gender) ? fields.gender : null;
  if (!gender) {
    const m = MALE.test(t);
    const f = FEMALE.test(t);
    if (m !== f) gender = m ? 'male' : 'female';
  }
  let age = Number(fields.age) || null;
  if (!age) {
    const m =
      t.match(/\b(\d{1,2})\s*(?:-|\s)?(?:years?|yrs?|y\/?o)\b/i) ||
      t.match(/\b(?:aged?|age)\s*(\d{1,2})\b/i) ||
      t.match(/,\s*(\d{1,2})\s*(?:,|\.|;|$)/);
    const dec = t.match(/\b(?:in\s+(?:his|her|their)\s+|early\s+|late\s+|mid[-\s]?)(\d)0s\b/i);
    if (m) age = Number(m[1]);
    else if (dec) age = Number(dec[1]) * 10 + 5;
    else if (/\b(toddler|baby)\b/i.test(t)) age = 3;
    else if (/\b(teen|teenager|teenage)\b/i.test(t)) age = 16;
    else if (/\b(boy|girl|kid|child)\b/i.test(t)) age = 9;
    else if (/\b(elderly|senior|grandfather|grandmother|grandpa|grandma|old (?:man|woman|lady))\b/i.test(t)) age = 72;
  }
  return { gender, age: age && age > 0 && age < 110 ? age : null };
}

function textScore(ctx, p) {
  const pg = p.gender || p.ai_gender;
  const pa = p.approx_age || p.ai_age;
  if (ctx.attrs.gender && pg && ctx.attrs.gender !== pg) return null;
  let ageFit = 0.45;
  if (ctx.attrs.age && pa) {
    const tol = Math.max(10, ctx.attrs.age * 0.35);
    const diff = Math.abs(ctx.attrs.age - pa);
    if (diff > tol) return null;
    ageFit = 1 - diff / tol;
  }
  let clip = 0;
  if (ctx.emb) p.photos.forEach((ph) => { if (ph.clip) clip = Math.max(clip, engine.cosine(ctx.emb, ph.clip)); });
  const clipNorm = ctx.emb ? clamp((clip - 0.19) / 0.11, 0, 1) : 0.4;
  const hay = new Set(tokens(`${p.name || ''} ${p.description || ''} ${p.found_location || ''} ${p.condition || ''}`));
  const kws = [...new Set(ctx.tokens)].filter((w) => hay.has(w));
  const nameHit = ctx.nameTokens.length && p.name ? ctx.nameTokens.some((w) => tokens(p.name).includes(w)) : false;
  const score = clipNorm * 0.45 + ageFit * 0.22 + (ctx.attrs.gender && pg ? 0.13 : 0.04) + Math.min(0.2, kws.length * 0.06) + (nameHit ? 0.35 : 0);
  const confidence = Math.round(clamp(score, 0, 0.9) * 100);
  const reason = [
    `Visual similarity of the description to the photos ${Math.round(clipNorm * 100)}%`,
    ctx.attrs.age && pa ? `age ${ctx.attrs.age} vs ~${pa}` : null,
    ctx.attrs.gender && pg ? `gender ${pg}` : null,
    kws.length ? `matching details: ${kws.slice(0, 5).join(', ')}` : null,
    nameHit ? `name matches "${p.name}"` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { confidence, clip: Math.round(clip * 1000) / 1000, keywords: kws, reason };
}

async function textContext(text, fields = {}) {
  const attrs = parseAttributes(`${text} ${fields.name || ''}`, fields);
  let emb = null;
  try {
    emb = await engine.embedText(`a photo of ${text}`);
  } catch (err) {
    console.error('[people] text embedding failed', err.message);
  }
  return { attrs, emb, tokens: tokens(text), nameTokens: tokens(fields.name || '') };
}

async function searchByText(text, fields = {}) {
  const t = Date.now();
  const ctx = await textContext(text, fields);
  const persons = loadPersons();
  const matches = [];
  persons.forEach((p) => {
    const s = textScore(ctx, p);
    if (s && s.confidence >= TEXT_SHOW) matches.push(publicPerson(p, { ...s, best_photo: 0 }));
  });
  matches.sort((a, b) => b.confidence - a.confidence);
  const trace = [
    { icon: '📖', title: 'Language AI read the description', detail: `Gender: ${ctx.attrs.gender || 'not stated'} · Age: ${ctx.attrs.age || 'not stated'}` },
    { icon: '🎨', title: 'Imagined the person (CLIP text → image space)', detail: 'Hair, clothing, glasses, facial hair and other visual cues' },
    { icon: '👥', title: `Compared with ${persons.length} people in care`, detail: `${matches.length} plausible candidate${matches.length === 1 ? '' : 's'}` },
  ];
  return { matches: matches.slice(0, 6), trace, attrs: ctx.attrs, emb: ctx.emb, ms: Date.now() - t };
}

// When iHunt registers a person, compare them with every open family report and notify on a possible match.
async function matchOpenReports(personId) {
  const [person] = loadPersons({ personId });
  if (!person) return [];
  const reports = db
    .prepare("SELECT r.*, u.name AS user_name, u.phone AS user_phone FROM missing_reports r JOIN users u ON u.id = r.user_id WHERE r.status = 'searching'")
    .all();
  const phStmt = db.prepare('SELECT * FROM missing_report_photos WHERE report_id = ? ORDER BY id');
  const out = [];
  for (const r of reports) {
    const photos = phStmt.all(r.id);
    let result = null;
    if (r.mode === 'photo') {
      const queries = photos
        .map((ph, photoIndex) => {
          const faces = parseJSON(ph.faces, []);
          const descriptor = fromBlob(ph.descriptor);
          return descriptor && faces[0] ? { photoIndex, face: { ...faces[0], descriptor } } : null;
        })
        .filter(Boolean);
      const best = queries.length ? faceMatch(queries, person) : null;
      if (best && best.distance <= MATCH_DISTANCE) result = faceResult(best, person);
    } else if (r.description) {
      const ctx = {
        attrs: parseAttributes(`${r.description} ${r.name || ''}`, { age: r.age, gender: r.gender }),
        emb: fromBlob(r.text_embedding),
        tokens: tokens(r.description),
        nameTokens: tokens(r.name || ''),
      };
      const s = textScore(ctx, person);
      if (s && s.confidence >= TEXT_NOTIFY) result = s;
    }
    if (!result) continue;
    db.prepare('INSERT OR REPLACE INTO person_matches (report_id, person_id, score, distance) VALUES (?,?,?,?)').run(r.id, person.id, result.confidence, result.distance ?? null);
    db.prepare("UPDATE missing_reports SET status = 'matched', matched_person_id = ? WHERE id = ?").run(person.id, r.id);
    const who = r.name ? `"${r.name}"` : 'the person you reported missing';
    db.prepare('INSERT INTO notifications (user_id, type, title, body, person_id, report_id, score) VALUES (?,?,?,?,?,?,?)').run(
      r.user_id,
      'person_match',
      'Possible match for your missing-person report',
      `The face AI found a possible match (${result.confidence}%) for ${who} at ${person.station_name}. Please review the photos and request a verified reunion.`,
      person.id,
      null,
      result.confidence
    );
    out.push({
      report: { id: r.id, mode: r.mode, name: r.name, age: r.age, gender: r.gender, description: r.description, last_seen_location: r.last_seen_location, relation: r.relation, user_name: r.user_name, user_phone: r.user_phone, photos: photos.map((ph) => ({ url: `/uploads/${ph.path}`, width: ph.width, height: ph.height, faces: parseJSON(ph.faces, []) })) },
      ...result,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

module.exports = {
  MATCH_DISTANCE,
  analyzeFiles,
  publicAnalysis,
  indexPerson,
  indexReportPhoto,
  loadPersons,
  publicPerson,
  searchByFaces,
  searchByText,
  parseAttributes,
  matchOpenReports,
  parseJSON,
};
