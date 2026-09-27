const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'iseek-ihunt-test-'));
let server;

function client() {
  const jar = {};
  return async function call(url, { body, form, method } = {}) {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    let payload;
    if (form) payload = form;
    else if (body) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, { method: method || (payload ? 'POST' : 'GET'), headers, body: payload });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      jar[k] = v;
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

function photoForm(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append('photos', new Blob([fs.readFileSync(path.join(ROOT, 'demo-photos', f))], { type: 'image/jpeg' }), f));
  return fd;
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR }, stdio: 'pipe' });
  server.stderr.on('data', (d) => process.stderr.write(d));
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const h = await (await fetch(`${BASE}/api/health`)).json();
      if (h.ai.ready && !h.ai.indexing.running && h.ai.indexing.done === h.ai.indexing.total && h.ai.indexing.total > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become ready');
});

after(() => {
  server.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('serves both apps and the landing page', async () => {
  for (const p of ['/', '/ihunt/', '/iseek/', '/shared/ui.js', '/demo-photos/lost-guitar.jpg']) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, p);
  }
  const h = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(h.ai.gpt, false);
});

test('police and civilian logins are separate and validated', async () => {
  const police = client();
  assert.equal((await police('/api/police/login', { body: { username: 'officer.james', password: 'wrong' } })).status, 401);
  const ok = await police('/api/police/login', { body: { username: 'officer.james', password: 'ihunt@123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.officer.station_name, 'Central Police Station');
  assert.equal((await police('/api/user/me')).status, 401);

  const user = client();
  const u = await user('/api/user/login', { body: { username: 'john', password: 'iseek@123' } });
  assert.equal(u.data.user.name, 'John Miller');
  assert.equal((await user('/api/police/me')).status, 401);
});

test('photo search finds the matching found item with station details', async () => {
  const user = client();
  await user('/api/user/login', { body: { username: 'maria', password: 'iseek@123' } });
  const r = await user('/api/user/search/photo', { form: photoForm(['lost-green-iphone.jpg']) });
  assert.equal(r.status, 200);
  const top = r.data.matches[0];
  assert.match(top.title, /green iphone/i);
  assert.ok(top.confidence >= 70);
  assert.ok(top.station.name && top.station.phone && top.station.address);
});

test('rejects more than five photos', async () => {
  const user = client();
  await user('/api/user/login', { body: { username: 'maria', password: 'iseek@123' } });
  const r = await user('/api/user/search/photo', { form: photoForm(Array(6).fill('lost-guitar.jpg')) });
  assert.equal(r.status, 400);
});

test('description search ranks semantically matching items', async () => {
  const user = client();
  await user('/api/user/login', { body: { username: 'chen', password: 'iseek@123' } });
  const r = await user('/api/user/search/text', { body: { description: 'Nikon DSLR camera' } });
  assert.equal(r.status, 200);
  assert.match(r.data.matches[0].title, /nikon/i);
});

test('unmatched search goes on the watchlist and is notified when police log the item', async () => {
  const user = client();
  await user('/api/user/login', { body: { username: 'ahmed', password: 'iseek@123' } });
  const r = await user('/api/user/search/text', { body: { description: 'a white quadcopter drone with four propellers and a camera gimbal' } });
  assert.equal(r.status, 200);
  if (r.data.matches.length) await user(`/api/user/reports/${r.data.report_id}/activate`, { method: 'POST' });
  else assert.match(r.data.message, /not been found yet/i);
  const reports = await user('/api/user/reports');
  assert.ok(reports.data.reports.some((x) => x.id === r.data.report_id && x.status === 'searching'));

  const police = client();
  await police('/api/police/login', { body: { username: 'officer.omar', password: 'ihunt@123' } });
  const sug = await police('/api/police/ai/suggest', { form: photoForm(['police-found-dji-drone.jpg']) });
  assert.equal(sug.data.suggestion.category, 'Drones');

  const fd = photoForm(['police-found-dji-drone.jpg', 'police-found-drone-2.jpg']);
  fd.append('station_id', '2');
  fd.append('category', 'Drones');
  fd.append('title', 'White quadcopter drone');
  fd.append('found_at', `${localDate()}T09:15`);
  fd.append('found_location', 'Riverside park');
  const created = await police('/api/police/items', { form: fd });
  assert.equal(created.status, 201);
  assert.ok(created.data.notified >= 1);

  const n = await user('/api/user/notifications');
  assert.ok(n.data.notifications.some((x) => x.type === 'match' && x.item_id === created.data.item.id));
});

test('booking → police approval → completion flow', async () => {
  const user = client();
  await user('/api/user/login', { body: { username: 'sara', password: 'iseek@123' } });
  const s = await user('/api/user/search/text', { body: { description: 'acoustic guitar' } });
  const item = s.data.matches.find((m) => /guitar/i.test(m.title));
  assert.ok(item);
  const tomorrow = localDate(new Date(Date.now() + 86400000));
  const slots = await user(`/api/user/stations/${item.station.id}/slots?date=${tomorrow}`);
  const slot = slots.data.slots.find((x) => x.available);
  const booked = await user('/api/user/appointments', {
    body: { item_id: item.id, scheduled_at: `${tomorrow}T${slot.time}`, ownership_proof: 'Scratch on the headstock and my initials inside', contact_phone: '+1 555-1006' },
  });
  assert.equal(booked.status, 201);
  assert.equal(booked.data.appointment.status, 'pending');

  const police = client();
  const officers = { 8: 'railway.office' };
  const login = await police('/api/police/login', { body: { username: officers[item.station.id] || 'officer.james', password: 'ihunt@123' } });
  assert.equal(login.status, 200);
  const pending = await police(`/api/police/appointments/pending?station_id=${item.station.id}`);
  assert.ok(pending.data.appointments.some((a) => a.id === booked.data.appointment.id));
  const ap = await police(`/api/police/appointments/${booked.data.appointment.id}/approve`, { body: { note: 'Bring ID' } });
  assert.equal(ap.data.appointment.status, 'approved');

  const again = await user('/api/user/appointments', {
    body: { item_id: item.id, scheduled_at: `${tomorrow}T${slot.time}`, ownership_proof: 'duplicate request' },
  });
  assert.equal(again.status, 409);

  const done = await police(`/api/police/appointments/${booked.data.appointment.id}/complete`, { method: 'POST' });
  assert.equal(done.status, 200);
  const n = await user('/api/user/notifications');
  assert.ok(n.data.notifications.some((x) => x.type === 'approved'));
});

test("today's appointments list approved pickups for the officer's station", async () => {
  const police = client();
  await police('/api/police/login', { body: { username: 'officer.james', password: 'ihunt@123' } });
  const r = await police('/api/police/appointments/today?station_id=1');
  assert.ok(r.data.appointments.length >= 3);
  assert.ok(r.data.appointments.every((a) => a.scheduled_at.startsWith(localDate())));
});
