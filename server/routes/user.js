const express = require('express');
const { db, toBlob } = require('../db');
const auth = require('../auth');
const agent = require('../ai/agent');
const { photosField, savePhotos } = require('../uploads');
const { asyncH, stations, categories, appointmentRows, slotsFor, DATETIME_RE, DATE_RE } = require('./common');

const router = express.Router();
const requireUser = auth.requireRole('user');
const NOT_FOUND_MESSAGE = 'Your item has not been found yet. We will let you know when the item is found by sending a notification.';

function profile(id) {
  return db.prepare('SELECT id, username, name, email, phone, created_at FROM users WHERE id = ?').get(id);
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!row || !auth.verify(String(password || ''), row.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });
  auth.issue(res, 'user', row.id);
  return res.json({ user: profile(row.id) });
});

router.post('/register', (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, . _ -)' });
  if (!name) return res.status(400).json({ error: 'Please enter your full name' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'That username is taken' });
  const info = db
    .prepare('INSERT INTO users (username, password_hash, name, email, phone) VALUES (?,?,?,?,?)')
    .run(username, auth.hash(password), name.slice(0, 80), String(b.email || '').slice(0, 120), String(b.phone || '').slice(0, 30));
  auth.issue(res, 'user', info.lastInsertRowid);
  return res.status(201).json({ user: profile(info.lastInsertRowid) });
});

router.post('/logout', (req, res) => {
  auth.clear(res, 'user');
  res.json({ ok: true });
});

router.use(requireUser);

router.get('/me', (req, res) => {
  const user = profile(req.auth.id);
  if (!user) return res.status(401).json({ error: 'Unknown user' });
  const unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0').get(req.auth.id).n;
  return res.json({ user, unread });
});

router.get('/meta', (req, res) => res.json({ stations: stations(), categories: categories() }));

router.post(
  '/search/photo',
  photosField,
  asyncH(async (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Upload at least one photo of your item' });
    const saved = await savePhotos(req.files, 'lost');
    const result = await agent.searchByPhotos(saved.map((s) => s.full));
    const cats = agent.queryCategories({ categories: result.analysis.categories, llm: result.analysis.llm });
    const found = result.matches.length > 0;
    const report = db
      .prepare('INSERT INTO lost_reports (user_id, mode, category, ai_caption, status) VALUES (?,?,?,?,?)')
      .run(req.auth.id, 'photo', cats.join('|'), result.analysis.caption, found ? 'draft' : 'searching');
    const ph = db.prepare('INSERT INTO lost_report_photos (report_id, path, embedding) VALUES (?,?,?)');
    saved.forEach((s, i) => ph.run(report.lastInsertRowid, s.rel, toBlob(result.embeddings[i])));
    res.json({
      found,
      message: found ? null : NOT_FOUND_MESSAGE,
      report_id: report.lastInsertRowid,
      query_photos: saved.map((s) => `/uploads/${s.rel}`),
      matches: result.matches,
      analysis: result.analysis,
      trace: result.trace,
      ms: result.ms,
    });
  })
);

router.post(
  '/search/text',
  asyncH(async (req, res) => {
    const description = String((req.body && req.body.description) || '').trim();
    if (description.length < 3) return res.status(400).json({ error: 'Please describe your item in a few words' });
    const result = await agent.searchByText(description.slice(0, 1000));
    const found = result.matches.length > 0;
    const report = db
      .prepare('INSERT INTO lost_reports (user_id, mode, description, category, text_embedding, status) VALUES (?,?,?,?,?,?)')
      .run(req.auth.id, 'text', description.slice(0, 1000), result.analysis.categories.join('|'), toBlob(result.textEmbedding), found ? 'draft' : 'searching');
    res.json({
      found,
      message: found ? null : NOT_FOUND_MESSAGE,
      report_id: report.lastInsertRowid,
      matches: result.matches,
      analysis: result.analysis,
      trace: result.trace,
      ms: result.ms,
    });
  })
);

function ownReport(req) {
  return db.prepare('SELECT * FROM lost_reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.auth.id);
}

router.post('/reports/:id/activate', (req, res) => {
  const r = ownReport(req);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE lost_reports SET status = 'searching' WHERE id = ?").run(r.id);
  res.json({ ok: true, message: NOT_FOUND_MESSAGE });
});

router.post('/reports/:id/cancel', (req, res) => {
  const r = ownReport(req);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE lost_reports SET status = 'closed' WHERE id = ?").run(r.id);
  res.json({ ok: true });
});

router.get('/reports', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.mode, r.description, r.category, r.ai_caption, r.status, r.matched_item_id, r.created_at, i.title AS matched_item_title
         FROM lost_reports r LEFT JOIN items i ON i.id = r.matched_item_id
        WHERE r.user_id = ? AND r.status != 'draft' ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(req.auth.id);
  const ph = db.prepare('SELECT path FROM lost_report_photos WHERE report_id = ? ORDER BY id');
  res.json({ reports: rows.map((r) => ({ ...r, photos: ph.all(r.id).map((p) => `/uploads/${p.path}`) })) });
});

router.get('/items/:id', (req, res) => {
  const [item] = agent.loadIndex({ itemId: Number(req.params.id) });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  return res.json({ item: agent.publicItem(item) });
});

router.get('/stations/:id/slots', (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : null;
  if (!date) return res.status(400).json({ error: 'Pick a date' });
  res.json({ date, slots: slotsFor(Number(req.params.id), date) });
});

router.post('/appointments', (req, res) => {
  const b = req.body || {};
  const [item] = agent.loadIndex({ itemId: Number(b.item_id) });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.status !== 'available') return res.status(409).json({ error: 'This item is no longer available for collection' });
  if (!DATETIME_RE.test(b.scheduled_at || '')) return res.status(400).json({ error: 'Choose a date and time for your appointment' });
  if (b.now && DATETIME_RE.test(b.now) && b.scheduled_at <= b.now) return res.status(400).json({ error: 'Appointment must be in the future' });
  const slot = slotsFor(item.station_id, b.scheduled_at.slice(0, 10)).find((s) => s.time === b.scheduled_at.slice(11, 16));
  if (!slot) return res.status(400).json({ error: `Pick a time within ${item.station_name} opening hours (${item.station_hours})` });
  if (!slot.available) return res.status(409).json({ error: 'That slot is fully booked, please choose another time' });
  const proof = String(b.ownership_proof || '').trim();
  if (proof.length < 5) return res.status(400).json({ error: 'Tell the officers how you can prove the item is yours' });
  const dup = db.prepare("SELECT id FROM appointments WHERE user_id = ? AND item_id = ? AND status IN ('pending','approved')").get(req.auth.id, item.id);
  if (dup) return res.status(409).json({ error: 'You already have an active request for this item' });
  const info = db
    .prepare('INSERT INTO appointments (user_id, item_id, station_id, scheduled_at, ownership_proof, contact_phone, match_score) VALUES (?,?,?,?,?,?,?)')
    .run(req.auth.id, item.id, item.station_id, b.scheduled_at, proof.slice(0, 1000), String(b.contact_phone || '').slice(0, 30), Number(b.match_score) || null);
  if (b.report_id) db.prepare("UPDATE lost_reports SET status = 'closed', matched_item_id = ? WHERE id = ? AND user_id = ?").run(item.id, Number(b.report_id), req.auth.id);
  res.status(201).json({ appointment: appointmentRows('a.id = ?', [info.lastInsertRowid])[0] });
});

router.get('/appointments', (req, res) => {
  res.json({ appointments: appointmentRows('a.user_id = ?', [req.auth.id]).reverse() });
});

router.post('/appointments/:id/cancel', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.auth.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (!['pending', 'approved'].includes(a.status)) return res.status(409).json({ error: `Appointment is already ${a.status}` });
  db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").run(a.id);
    if (a.status === 'approved') db.prepare("UPDATE items SET status = 'available' WHERE id = ? AND status = 'reserved'").run(a.item_id);
  })();
  res.json({ ok: true });
});

router.get('/notifications', (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.auth.id);
  res.json({ notifications: rows, unread: rows.filter((n) => !n.is_read).length });
});

router.post('/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.auth.id);
  res.json({ ok: true });
});

router.get('/categories', (req, res) => res.json({ categories: categories() }));

router.use('/people', require('./user-people'));

module.exports = router;
