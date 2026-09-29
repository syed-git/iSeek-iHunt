const express = require('express');
const { db } = require('../db');
const auth = require('../auth');
const agent = require('../ai/agent');
const engine = require('../ai/engine');
const { photosField, savePhotos } = require('../uploads');
const { CATEGORY_NAMES } = require('../categories');
const { asyncH, stations, categories, appointmentRows, notify, DATETIME_RE, DATE_RE } = require('./common');

const { localDate } = require('../seed');

const router = express.Router();
const requirePolice = auth.requireRole('police');

function officerProfile(id) {
  return db
    .prepare(
      `SELECT o.id, o.username, o.name, o.badge, o.rank, o.station_id, s.name AS station_name, s.type AS station_type
         FROM officers o JOIN stations s ON s.id = o.station_id WHERE o.id = ?`
    )
    .get(id);
}

function stationFilter(req) {
  const raw = req.query.station_id;
  if (!raw || raw === 'all') return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM officers WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!row || !auth.verify(String(password || ''), row.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });
  auth.issue(res, 'police', row.id);
  return res.json({ officer: officerProfile(row.id) });
});

router.post('/logout', (req, res) => {
  auth.clear(res, 'police');
  res.json({ ok: true });
});

router.use(requirePolice);

router.get('/me', (req, res) => {
  const officer = officerProfile(req.auth.id);
  if (!officer) return res.status(401).json({ error: 'Unknown officer' });
  return res.json({ officer });
});

router.get('/meta', (req, res) => res.json({ stations: stations(), categories: categories() }));

router.get('/stats', (req, res) => {
  const sid = stationFilter(req);
  const w = sid ? ' AND station_id = ?' : '';
  const p = sid ? [sid] : [];
  const today = DATE_RE.test(req.query.date || '') ? req.query.date : localDate(new Date());
  const one = (sql, ...args) => db.prepare(sql).get(...args).n;
  res.json({
    available: one(`SELECT COUNT(*) n FROM items WHERE status = 'available'${w}`, ...p),
    reserved: one(`SELECT COUNT(*) n FROM items WHERE status = 'reserved'${w}`, ...p),
    returned: one(`SELECT COUNT(*) n FROM items WHERE status = 'returned'${w}`, ...p),
    pending: one(`SELECT COUNT(*) n FROM appointments WHERE status = 'pending'${w}`, ...p),
    today: one(`SELECT COUNT(*) n FROM appointments WHERE status IN ('approved','completed','no_show') AND substr(scheduled_at,1,10) = ?${w}`, today, ...p),
    searching: one("SELECT COUNT(*) n FROM lost_reports WHERE status = 'searching'"),
  });
});

router.post(
  '/ai/suggest',
  photosField,
  asyncH(async (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Add at least one photo' });
    const saved = await savePhotos(req.files, 'tmp');
    const suggestion = await agent.suggestForPolice(saved.map((s) => s.full));
    res.json({ suggestion });
  })
);

router.post(
  '/items',
  photosField,
  asyncH(async (req, res) => {
    const b = req.body || {};
    const stationId = Number(b.station_id);
    const errors = [];
    if (!db.prepare('SELECT id FROM stations WHERE id = ?').get(stationId)) errors.push('Choose a police station');
    if (!CATEGORY_NAMES.includes(b.category)) errors.push('Choose an item category');
    if (!DATETIME_RE.test(b.found_at || '')) errors.push('Pick the date and time the item was found');
    if (!req.files || !req.files.length) errors.push('Upload at least one photo');
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const title = String(b.title || '').trim() || `${b.category} item`;

    const saved = await savePhotos(req.files, 'items');
    const info = db
      .prepare('INSERT INTO items (station_id, officer_id, category, title, description, found_location, found_at) VALUES (?,?,?,?,?,?,?)')
      .run(stationId, req.auth.id, b.category, title.slice(0, 120), String(b.description || '').slice(0, 1000), String(b.found_location || '').slice(0, 200), b.found_at);
    const itemId = info.lastInsertRowid;
    const ph = db.prepare('INSERT INTO item_photos (item_id, path) VALUES (?, ?)');
    saved.forEach((s) => ph.run(itemId, s.rel));

    await agent.indexItem(itemId, saved.map((s) => s.full));
    const notified = agent.notifyMatchingReports(itemId);
    const [item] = agent.loadIndex({ itemId });
    res.status(201).json({ item: agent.publicItem(item), notified: notified.length });
  })
);

router.get('/items', (req, res) => {
  const sid = stationFilter(req);
  const status = ['available', 'reserved', 'returned'].includes(req.query.status) ? req.query.status : null;
  const rows = db
    .prepare(
      `SELECT i.id, i.title, i.category, i.description, i.found_location, i.found_at, i.status, i.ai_caption, i.created_at,
              s.name AS station_name, o.name AS officer_name,
              (SELECT path FROM item_photos WHERE item_id = i.id ORDER BY id LIMIT 1) AS photo,
              (SELECT COUNT(*) FROM item_photos WHERE item_id = i.id) AS photo_count,
              (SELECT COUNT(*) FROM appointments WHERE item_id = i.id AND status = 'pending') AS pending_requests
         FROM items i JOIN stations s ON s.id = i.station_id LEFT JOIN officers o ON o.id = i.officer_id
        WHERE (? IS NULL OR i.station_id = ?) AND (? IS NULL OR i.status = ?)
        ORDER BY i.found_at DESC`
    )
    .all(sid, sid, status, status)
    .map((r) => ({ ...r, photo: r.photo ? `/uploads/${r.photo}` : null }));
  res.json({ items: rows });
});

router.get('/items/:id', (req, res) => {
  const [item] = agent.loadIndex({ itemId: Number(req.params.id) });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  return res.json({ item: agent.publicItem(item) });
});

router.get('/appointments/today', (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : localDate(new Date());
  const sid = stationFilter(req);
  const rows = appointmentRows(`a.status IN ('approved','completed','no_show') AND substr(a.scheduled_at,1,10) = ?${sid ? ' AND a.station_id = ?' : ''}`, sid ? [date, sid] : [date]);
  res.json({ date, appointments: rows });
});

router.get('/appointments/pending', (req, res) => {
  const sid = stationFilter(req);
  const rows = appointmentRows(`a.status = 'pending'${sid ? ' AND a.station_id = ?' : ''}`, sid ? [sid] : []);
  res.json({ appointments: rows });
});

function loadAppointment(id) {
  return appointmentRows('a.id = ?', [Number(id)])[0];
}

router.post('/appointments/:id/approve', (req, res) => {
  const a = loadAppointment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (a.status !== 'pending') return res.status(409).json({ error: `Appointment is already ${a.status}` });
  if (a.item_status !== 'available') return res.status(409).json({ error: 'This item has already been reserved for another claimant' });
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'approved', police_note = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(note, req.auth.id, now, a.id);
    db.prepare("UPDATE items SET status = 'reserved' WHERE id = ?").run(a.item_id);
    notify(
      a.user_id,
      'approved',
      'Appointment approved',
      `Your appointment to collect "${a.item_title}" at ${a.station_name} on ${a.scheduled_at.replace('T', ' at ')} is approved. Please bring a photo ID.${note ? ` Note from officer: ${note}` : ''}`,
      a.item_id
    );
    const others = db.prepare("SELECT id, user_id FROM appointments WHERE item_id = ? AND status = 'pending' AND id != ?").all(a.item_id, a.id);
    others.forEach((o) => {
      db.prepare("UPDATE appointments SET status = 'rejected', police_note = ?, decided_by = ?, decided_at = ? WHERE id = ?").run('Item released to its verified owner', req.auth.id, now, o.id);
      notify(o.user_id, 'rejected', 'Appointment request declined', `Your request for "${a.item_title}" was declined: the item has been released to its verified owner.`, a.item_id);
    });
  })();
  res.json({ appointment: loadAppointment(a.id) });
});

router.post('/appointments/:id/reject', (req, res) => {
  const a = loadAppointment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (a.status !== 'pending') return res.status(409).json({ error: `Appointment is already ${a.status}` });
  const note = String((req.body && req.body.note) || '').slice(0, 500);
  db.prepare("UPDATE appointments SET status = 'rejected', police_note = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(note, req.auth.id, new Date().toISOString(), a.id);
  notify(a.user_id, 'rejected', 'Appointment request declined', `Your request to collect "${a.item_title}" at ${a.station_name} was declined.${note ? ` Reason: ${note}` : ''}`, a.item_id);
  res.json({ appointment: loadAppointment(a.id) });
});

router.post('/appointments/:id/complete', (req, res) => {
  const a = loadAppointment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (a.status !== 'approved') return res.status(409).json({ error: 'Only approved appointments can be completed' });
  db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'completed', decided_by = ?, decided_at = ? WHERE id = ?").run(req.auth.id, new Date().toISOString(), a.id);
    db.prepare("UPDATE items SET status = 'returned' WHERE id = ?").run(a.item_id);
    db.prepare("UPDATE lost_reports SET status = 'closed' WHERE user_id = ? AND matched_item_id = ?").run(a.user_id, a.item_id);
    notify(a.user_id, 'completed', 'Item handed over 🎉', `"${a.item_title}" has been returned to you. Thank you for using iSeek!`, a.item_id);
  })();
  res.json({ appointment: loadAppointment(a.id) });
});

router.post('/appointments/:id/no-show', (req, res) => {
  const a = loadAppointment(req.params.id);
  if (!a) return res.status(404).json({ error: 'Appointment not found' });
  if (a.status !== 'approved') return res.status(409).json({ error: 'Only approved appointments can be marked as no-show' });
  db.transaction(() => {
    db.prepare("UPDATE appointments SET status = 'no_show', decided_by = ?, decided_at = ? WHERE id = ?").run(req.auth.id, new Date().toISOString(), a.id);
    db.prepare("UPDATE items SET status = 'available' WHERE id = ?").run(a.item_id);
    notify(a.user_id, 'no_show', 'Missed appointment', `You missed your appointment for "${a.item_title}" at ${a.station_name}. Please book a new slot.`, a.item_id);
  })();
  res.json({ appointment: loadAppointment(a.id) });
});

router.get('/ai/status', (req, res) => res.json({ ready: engine.state.ready, model: engine.state.model }));

router.use('/people', require('./police-people'));

module.exports = router;
