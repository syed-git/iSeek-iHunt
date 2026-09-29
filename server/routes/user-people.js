const express = require('express');
const { db, toBlob } = require('../db');
const people = require('../ai/people');
const { photosField, savePhotos } = require('../uploads');
const { asyncH, slotsFor, DATETIME_RE } = require('./common');

const router = express.Router();
const NOT_FOUND_MESSAGE = 'This person has not been found yet. We will let you know as soon as they are found by sending a notification.';

function reportFields(b) {
  const age = Number(b.age);
  return {
    name: String(b.name || '').trim().slice(0, 80) || null,
    age: Number.isFinite(age) && age > 0 && age < 110 ? Math.round(age) : null,
    gender: ['male', 'female'].includes(b.gender) ? b.gender : null,
    description: String(b.description || '').trim().slice(0, 1000) || null,
    last_seen_location: String(b.last_seen_location || '').trim().slice(0, 200) || null,
    last_seen_at: DATETIME_RE.test(b.last_seen_at || '') ? b.last_seen_at : null,
    relation: String(b.relation || '').trim().slice(0, 60) || null,
  };
}

function insertReport(userId, mode, f, status, textEmb = null) {
  return db
    .prepare('INSERT INTO missing_reports (user_id, mode, name, age, gender, description, last_seen_location, last_seen_at, relation, text_embedding, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(userId, mode, f.name, f.age, f.gender, f.description, f.last_seen_location, f.last_seen_at, f.relation, toBlob(textEmb), status).lastInsertRowid;
}

function recordMatches(reportId, matches) {
  const st = db.prepare('INSERT OR REPLACE INTO person_matches (report_id, person_id, score, distance) VALUES (?,?,?,?)');
  matches.forEach((m) => st.run(reportId, m.id, m.confidence, m.distance ?? null));
}

router.post(
  '/search/photo',
  photosField,
  asyncH(async (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Upload at least one photo of the person' });
    const t = Date.now();
    const saved = await savePhotos(req.files, 'missing');
    const analyses = await people.analyzeFiles(saved.map((s) => s.full));
    if (!analyses.some((a) => a.faces.length)) return res.status(400).json({ error: "We couldn't detect a face in these photos. Please use a clear, front-facing photo of the person." });
    const result = people.searchByFaces(analyses);
    const f = reportFields(req.body || {});
    const reportId = insertReport(req.auth.id, 'photo', f, result.matches.length ? 'draft' : 'searching');
    const ph = db.prepare('INSERT INTO missing_report_photos (report_id, path) VALUES (?, ?)');
    for (let i = 0; i < saved.length; i++) {
      const photoId = ph.run(reportId, saved[i].rel).lastInsertRowid;
      await people.indexReportPhoto(photoId, analyses[i]);
    }
    recordMatches(reportId, result.matches);
    res.json({
      found: result.matches.length > 0,
      matches: result.matches,
      analyses: analyses.map((a, i) => people.publicAnalysis(a, `/uploads/${saved[i].rel}`)),
      report_id: reportId,
      message: result.matches.length ? null : NOT_FOUND_MESSAGE,
      trace: result.trace,
      ms: Date.now() - t,
    });
  })
);

router.post(
  '/search/text',
  asyncH(async (req, res) => {
    const f = reportFields(req.body || {});
    if (!f.description || f.description.length < 3) return res.status(400).json({ error: 'Describe the person in a few words' });
    const result = await people.searchByText(f.description, f);
    const reportId = insertReport(req.auth.id, 'text', { ...f, age: f.age || result.attrs.age, gender: f.gender || result.attrs.gender }, result.matches.length ? 'draft' : 'searching', result.emb);
    recordMatches(reportId, result.matches);
    res.json({
      found: result.matches.length > 0,
      matches: result.matches,
      attrs: result.attrs,
      report_id: reportId,
      message: result.matches.length ? null : NOT_FOUND_MESSAGE,
      trace: result.trace,
      ms: result.ms,
    });
  })
);

function ownReport(req) {
  return db.prepare('SELECT * FROM missing_reports WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.auth.id);
}

router.post('/reports/:id/activate', (req, res) => {
  const r = ownReport(req);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE missing_reports SET status = 'searching' WHERE id = ?").run(r.id);
  res.json({ ok: true, message: NOT_FOUND_MESSAGE });
});

router.post('/reports/:id/cancel', (req, res) => {
  const r = ownReport(req);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  db.prepare("UPDATE missing_reports SET status = 'closed' WHERE id = ?").run(r.id);
  res.json({ ok: true });
});

router.get('/reports', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.mode, r.name, r.age, r.gender, r.description, r.last_seen_location, r.last_seen_at, r.relation, r.status, r.matched_person_id, r.created_at
         FROM missing_reports r WHERE r.user_id = ? AND r.status != 'draft' ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(req.auth.id);
  const ph = db.prepare('SELECT * FROM missing_report_photos WHERE report_id = ? ORDER BY id');
  res.json({ reports: rows.map((r) => ({ ...r, photos: ph.all(r.id).map((p) => ({ url: `/uploads/${p.path}`, width: p.width, height: p.height, faces: people.parseJSON(p.faces, []) })) })) });
});

// Families can only open people the AI matched to one of their own reports (or who they have a reunion request for).
function canView(userId, personId) {
  return Boolean(
    db.prepare('SELECT 1 FROM person_matches m JOIN missing_reports r ON r.id = m.report_id WHERE r.user_id = ? AND m.person_id = ?').get(userId, personId) ||
      db.prepare('SELECT 1 FROM notifications WHERE user_id = ? AND person_id = ?').get(userId, personId) ||
      db.prepare('SELECT 1 FROM reunions WHERE user_id = ? AND person_id = ?').get(userId, personId)
  );
}

function matchInfo(userId, personId) {
  return db
    .prepare('SELECT m.report_id, m.score, m.distance FROM person_matches m JOIN missing_reports r ON r.id = m.report_id WHERE r.user_id = ? AND m.person_id = ? ORDER BY m.created_at DESC LIMIT 1')
    .get(userId, personId);
}

router.get('/persons/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!canView(req.auth.id, id)) return res.status(404).json({ error: 'Person not found' });
  const [p] = people.loadPersons({ personId: id });
  if (!p) return res.status(404).json({ error: 'Person not found' });
  const m = matchInfo(req.auth.id, id);
  res.json({ person: people.publicPerson(p, m ? { confidence: m.score, distance: m.distance, report_id: m.report_id } : {}) });
});

function reunionRows(where, params) {
  return db
    .prepare(
      `SELECT r.*, s.name AS station_name, s.address AS station_address, s.phone AS station_phone, s.type AS station_type, o.name AS decided_by_name,
              p.name AS person_name, p.status AS person_status,
              (SELECT path FROM person_photos WHERE person_id = p.id ORDER BY id LIMIT 1) AS person_photo
         FROM reunions r JOIN persons p ON p.id = r.person_id JOIN stations s ON s.id = r.station_id LEFT JOIN officers o ON o.id = r.decided_by
        WHERE ${where} ORDER BY r.scheduled_at DESC`
    )
    .all(...params)
    .map((r) => ({ ...r, person_photo: r.person_photo ? `/uploads/${r.person_photo}` : null, person_display: r.person_name || 'Unidentified person' }));
}

router.post('/reunions', (req, res) => {
  const b = req.body || {};
  const personId = Number(b.person_id);
  if (!canView(req.auth.id, personId)) return res.status(404).json({ error: 'Person not found' });
  const [p] = people.loadPersons({ personId });
  if (!p || p.status !== 'in_care') return res.status(409).json({ error: 'This person is no longer in care at the station' });
  if (!DATETIME_RE.test(b.scheduled_at || '')) return res.status(400).json({ error: 'Choose a date and time for the meeting' });
  if (b.now && DATETIME_RE.test(b.now) && b.scheduled_at <= b.now) return res.status(400).json({ error: 'The meeting must be in the future' });
  const slot = slotsFor(p.station_id, b.scheduled_at.slice(0, 10)).find((s) => s.time === b.scheduled_at.slice(11, 16));
  if (!slot) return res.status(400).json({ error: `Pick a time within ${p.station_name} opening hours (${p.station_hours})` });
  if (!slot.available) return res.status(409).json({ error: 'That slot is fully booked, please choose another time' });
  const relation = String(b.relation || '').trim();
  const proof = String(b.proof || '').trim();
  if (!relation) return res.status(400).json({ error: 'Tell the officers how you are related to this person' });
  if (proof.length < 5) return res.status(400).json({ error: 'Describe the proof of identity / relationship you will bring' });
  const dup = db.prepare("SELECT id FROM reunions WHERE user_id = ? AND person_id = ? AND status IN ('pending','approved')").get(req.auth.id, personId);
  if (dup) return res.status(409).json({ error: 'You already have an active reunion request for this person' });
  const m = matchInfo(req.auth.id, personId);
  const reportId = Number(b.report_id) || (m && m.report_id) || null;
  const info = db
    .prepare('INSERT INTO reunions (user_id, person_id, station_id, report_id, scheduled_at, relation, proof, contact_phone, match_score) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(req.auth.id, personId, p.station_id, reportId, b.scheduled_at, relation.slice(0, 60), proof.slice(0, 1000), String(b.contact_phone || '').slice(0, 30), Number(b.match_score) || (m && m.score) || null);
  if (reportId) db.prepare("UPDATE missing_reports SET status = 'matched', matched_person_id = ? WHERE id = ? AND user_id = ?").run(personId, reportId, req.auth.id);
  res.status(201).json({ reunion: reunionRows('r.id = ?', [info.lastInsertRowid])[0] });
});

router.get('/reunions', (req, res) => res.json({ reunions: reunionRows('r.user_id = ?', [req.auth.id]) }));

router.post('/reunions/:id/cancel', (req, res) => {
  const r = db.prepare('SELECT * FROM reunions WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.auth.id);
  if (!r) return res.status(404).json({ error: 'Request not found' });
  if (!['pending', 'approved'].includes(r.status)) return res.status(409).json({ error: `Request is already ${r.status}` });
  db.prepare("UPDATE reunions SET status = 'cancelled' WHERE id = ?").run(r.id);
  res.json({ ok: true });
});

module.exports = router;
