const { db } = require('../db');
const { CATEGORIES } = require('../categories');

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function stations() {
  return db.prepare('SELECT * FROM stations ORDER BY id').all();
}

function categories() {
  return CATEGORIES.map(({ name, icon }) => ({ name, icon }));
}

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function appointmentRows(where, params) {
  return db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.username AS user_username, u.email AS user_email, u.phone AS user_phone,
              i.title AS item_title, i.category AS item_category, i.description AS item_description, i.found_location AS item_found_location,
              i.found_at AS item_found_at, i.status AS item_status,
              s.name AS station_name, s.address AS station_address, s.phone AS station_phone, s.hours AS station_hours, s.type AS station_type,
              o.name AS decided_by_name,
              (SELECT path FROM item_photos WHERE item_id = i.id ORDER BY id LIMIT 1) AS item_photo
         FROM appointments a
         JOIN users u ON u.id = a.user_id
         JOIN items i ON i.id = a.item_id
         JOIN stations s ON s.id = a.station_id
         LEFT JOIN officers o ON o.id = a.decided_by
        WHERE ${where}
        ORDER BY a.scheduled_at`
    )
    .all(...params)
    .map((a) => ({ ...a, item_photo: a.item_photo ? `/uploads/${a.item_photo}` : null }));
}

function notify(userId, type, title, body, itemId = null, personId = null) {
  db.prepare('INSERT INTO notifications (user_id, type, title, body, item_id, person_id) VALUES (?,?,?,?,?,?)').run(userId, type, title, body, itemId, personId);
}

function slotsFor(stationId, date) {
  const st = db.prepare('SELECT open_time, close_time FROM stations WHERE id = ?').get(stationId);
  if (!st) return [];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const open = Math.max(toMin(st.open_time), 8 * 60);
  const close = Math.min(toMin(st.close_time), 21 * 60);
  const taken = db
    .prepare(
      `SELECT t, SUM(n) n FROM (
         SELECT substr(scheduled_at,12,5) t, COUNT(*) n FROM appointments WHERE station_id = ? AND substr(scheduled_at,1,10) = ? AND status IN ('pending','approved') GROUP BY t
         UNION ALL
         SELECT substr(scheduled_at,12,5) t, COUNT(*) n FROM reunions WHERE station_id = ? AND substr(scheduled_at,1,10) = ? AND status IN ('pending','approved') GROUP BY t
       ) GROUP BY t`
    )
    .all(stationId, date, stationId, date);
  const load = Object.fromEntries(taken.map((t) => [t.t, t.n]));
  const out = [];
  for (let m = open; m + 30 <= close; m += 30) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    out.push({ time: t, available: (load[t] || 0) < 3 });
  }
  return out;
}

module.exports = { asyncH, stations, categories, appointmentRows, notify, slotsFor, DATETIME_RE, DATE_RE };
