const fs = require('fs');
const express = require('express');
const { db } = require('../db');
const people = require('../ai/people');
const { photosField, savePhotos } = require('../uploads');
const { asyncH, notify, DATETIME_RE } = require('./common');

const router = express.Router();

function stationFilter(req) {
  const raw = req.query.station_id;
  if (!raw || raw === 'all') return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function reunionRows(where, params) {
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS user_name, u.username AS user_username, u.phone AS user_phone, u.email AS user_email,
              s.name AS station_name, s.type AS station_type, o.name AS decided_by_name
         FROM reunions r JOIN users u ON u.id = r.user_id JOIN stations s ON s.id = r.station_id LEFT JOIN officers o ON o.id = r.decided_by
        WHERE ${where} ORDER BY r.scheduled_at`
    )
    .all(...params);
  return rows.map((r) => {
    const [p] = people.loadPersons({ personId: r.person_id });
    const report = r.report_id ? db.prepare('SELECT * FROM missing_reports WHERE id = ?').get(r.report_id) : null;
    const reportPhotos = report ? db.prepare('SELECT * FROM missing_report_photos WHERE report_id = ? ORDER BY id').all(report.id) : [];
    return {
      ...r,
      person: p ? people.publicPerson(p) : null,
      report: report
        ? {
            id: report.id,
            name: report.name,
            age: report.age,
            description: report.description,
            last_seen_location: report.last_seen_location,
            photos: reportPhotos.map((ph) => ({ url: `/uploads/${ph.path}`, width: ph.width, height: ph.height, faces: people.parseJSON(ph.faces, []) })),
          }
        : null,
    };
  });
}

router.get('/stats', (req, res) => {
  const sid = stationFilter(req);
  const w = sid ? ' AND station_id = ?' : '';
  const p = sid ? [sid] : [];
  const one = (sql, ...args) => db.prepare(sql).get(...args).n;
  res.json({
    in_care: one(`SELECT COUNT(*) n FROM persons WHERE status = 'in_care'${w}`, ...p),
    reunited: one(`SELECT COUNT(*) n FROM persons WHERE status = 'reunited'${w}`, ...p),
    reunions_pending: one(`SELECT COUNT(*) n FROM reunions WHERE status = 'pending'${w}`, ...p),
    reunions_approved: one(`SELECT COUNT(*) n FROM reunions WHERE status = 'approved'${w}`, ...p),
    missing_open: one("SELECT COUNT(*) n FROM missing_reports WHERE status IN ('searching','matched')"),
  });
});

router.post(
  '/analyze',
  photosField,
  asyncH(async (req, res) => {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Add at least one photo' });
    const saved = await savePhotos(req.files, 'tmp');
    const analyses = await people.analyzeFiles(saved.map((s) => s.full));
    saved.forEach((f) => fs.rmSync(f.full, { force: true }));
    res.json({ analyses: analyses.map((a) => people.publicAnalysis(a, null)) });
  })
);

router.post(
  '/persons',
  photosField,
  asyncH(async (req, res) => {
    const b = req.body || {};
    const stationId = Number(b.station_id);
    if (!db.prepare('SELECT id FROM stations WHERE id = ?').get(stationId)) return res.status(400).json({ error: 'Choose a valid station' });
    if (!DATETIME_RE.test(b.found_at || '')) return res.status(400).json({ error: 'Enter the date and time the person was found' });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Upload at least one photo of the person' });
    const gender = ['male', 'female'].includes(b.gender) ? b.gender : null;
    const age = Number(b.approx_age);
    const approxAge = Number.isFinite(age) && age > 0 && age < 110 ? Math.round(age) : null;
    const saved = await savePhotos(req.files, 'persons');
    const analyses = await people.analyzeFiles(saved.map((s) => s.full));
    if (!analyses.some((a) => a.faces.length)) return res.status(400).json({ error: 'No face was detected in these photos — please add a clear, front-facing photo' });
    const info = db
      .prepare('INSERT INTO persons (station_id, officer_id, name, gender, approx_age, description, found_location, found_at, condition) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        stationId,
        req.auth.id,
        String(b.name || '').trim().slice(0, 80) || null,
        gender,
        approxAge,
        String(b.description || '').trim().slice(0, 1000) || null,
        String(b.found_location || '').trim().slice(0, 200) || null,
        b.found_at,
        String(b.condition || '').trim().slice(0, 200) || null
      );
    const personId = info.lastInsertRowid;
    const ph = db.prepare('INSERT INTO person_photos (person_id, path) VALUES (?, ?)');
    saved.forEach((s) => ph.run(personId, s.rel));
    await people.indexPerson(personId, Object.fromEntries(saved.map((s, i) => [s.full, analyses[i]])));
    const matches = await people.matchOpenReports(personId);
    const [person] = people.loadPersons({ personId });
    res.status(201).json({ person: people.publicPerson(person), matches, notified: matches.length });
  })
);

router.get('/persons', (req, res) => {
  const status = ['in_care', 'reunited'].includes(req.query.status) ? [req.query.status] : ['in_care', 'reunited'];
  res.json({ persons: people.loadPersons({ statuses: status, stationId: stationFilter(req) }).map((p) => people.publicPerson(p)) });
});

router.get('/persons/:id', (req, res) => {
  const [p] = people.loadPersons({ personId: Number(req.params.id) });
  if (!p) return res.status(404).json({ error: 'Person not found' });
  res.json({ person: people.publicPerson(p) });
});

router.post('/persons/:id/reunited', (req, res) => {
  const [p] = people.loadPersons({ personId: Number(req.params.id) });
  if (!p) return res.status(404).json({ error: 'Person not found' });
  db.prepare("UPDATE persons SET status = 'reunited' WHERE id = ?").run(p.id);
  res.json({ ok: true });
});

router.get('/missing', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.mode, r.name, r.age, r.gender, r.description, r.last_seen_location, r.last_seen_at, r.relation, r.status, r.matched_person_id, r.created_at,
              u.name AS user_name, u.phone AS user_phone, u.email AS user_email
         FROM missing_reports r JOIN users u ON u.id = r.user_id
        WHERE r.status IN ('searching','matched') ORDER BY r.created_at DESC, r.id DESC`
    )
    .all();
  const ph = db.prepare('SELECT * FROM missing_report_photos WHERE report_id = ? ORDER BY id');
  res.json({
    reports: rows.map((r) => ({ ...r, photos: ph.all(r.id).map((p) => ({ url: `/uploads/${p.path}`, width: p.width, height: p.height, faces: people.parseJSON(p.faces, []) })) })),
  });
});

router.get('/reunions', (req, res) => {
  const sid = stationFilter(req);
  const status = ['pending', 'approved', 'completed', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const where = `r.status = ?${sid ? ' AND r.station_id = ?' : ''}`;
  res.json({ reunions: reunionRows(where, sid ? [status, sid] : [status]) });
});

function loadReunion(req, res) {
  const r = db.prepare('SELECT * FROM reunions WHERE id = ?').get(Number(req.params.id));
  if (!r) res.status(404).json({ error: 'Reunion request not found' });
  return r;
}

const personLabel = (id) => {
  const p = db.prepare('SELECT name FROM persons WHERE id = ?').get(id);
  return p && p.name ? p.name : 'the person you reported';
};

router.post('/reunions/:id/approve', (req, res) => {
  const r = loadReunion(req, res);
  if (!r) return undefined;
  if (r.status !== 'pending') return res.status(409).json({ error: `Request is already ${r.status}` });
  const note = String((req.body && req.body.note) || '').slice(0, 500) || null;
  db.prepare("UPDATE reunions SET status = 'approved', police_note = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(note, req.auth.id, r.id);
  const st = db.prepare('SELECT name FROM stations WHERE id = ?').get(r.station_id);
  notify(r.user_id, 'reunion_approved', 'Reunion meeting approved', `Your meeting to verify and reunite with ${personLabel(r.person_id)} at ${st.name} is approved for ${r.scheduled_at.replace('T', ' ')}. Bring a photo ID and proof of relationship.${note ? ` Note: ${note}` : ''}`, null, r.person_id);
  res.json({ reunion: reunionRows('r.id = ?', [r.id])[0] });
});

router.post('/reunions/:id/reject', (req, res) => {
  const r = loadReunion(req, res);
  if (!r) return undefined;
  if (r.status !== 'pending') return res.status(409).json({ error: `Request is already ${r.status}` });
  const note = String((req.body && req.body.note) || '').slice(0, 500) || null;
  db.prepare("UPDATE reunions SET status = 'rejected', police_note = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(note, req.auth.id, r.id);
  notify(r.user_id, 'reunion_rejected', 'Reunion request declined', `Officers could not approve your reunion request${note ? `: ${note}` : '.'}`, null, r.person_id);
  res.json({ reunion: reunionRows('r.id = ?', [r.id])[0] });
});

router.post('/reunions/:id/complete', (req, res) => {
  const r = loadReunion(req, res);
  if (!r) return undefined;
  if (r.status !== 'approved') return res.status(409).json({ error: 'Only approved meetings can be completed' });
  db.transaction(() => {
    db.prepare("UPDATE reunions SET status = 'completed', decided_by = ?, decided_at = datetime('now') WHERE id = ?").run(req.auth.id, r.id);
    db.prepare("UPDATE persons SET status = 'reunited' WHERE id = ?").run(r.person_id);
    db.prepare("UPDATE reunions SET status = 'rejected', police_note = 'Person already reunited' WHERE person_id = ? AND id != ? AND status IN ('pending','approved')").run(r.person_id, r.id);
    if (r.report_id) db.prepare("UPDATE missing_reports SET status = 'closed', matched_person_id = ? WHERE id = ?").run(r.person_id, r.report_id);
  })();
  notify(r.user_id, 'reunited', 'Reunited 🎉', `Identity was verified by officers and ${personLabel(r.person_id)} has been reunited with you. Thank you for using iSeek.`, null, r.person_id);
  res.json({ reunion: reunionRows('r.id = ?', [r.id])[0] });
});

module.exports = router;
