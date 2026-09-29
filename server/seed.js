const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { hash } = require('./auth');
const { SEED_DIR, UPLOAD_DIR } = require('./config');

const STATIONS = [
  { name: 'Central Police Station', type: 'police', address: '1 Justice Avenue, Downtown', city: 'Metro City', phone: '+1 555-0100', email: 'central@metropolice.gov', hours: 'Mon–Sun · 09:00–18:00', open: '09:00', close: '18:00', lat: 40.7128, lng: -74.006 },
  { name: 'Northside Police Station', type: 'police', address: '48 Maple Road, Northside', city: 'Metro City', phone: '+1 555-0111', email: 'northside@metropolice.gov', hours: 'Mon–Sat · 09:00–18:00', open: '09:00', close: '18:00', lat: 40.7831, lng: -73.9712 },
  { name: 'Harbor Point Police Station', type: 'police', address: '7 Dockside Street, Harbor Point', city: 'Metro City', phone: '+1 555-0122', email: 'harbor@metropolice.gov', hours: 'Mon–Sun · 08:00–20:00', open: '08:00', close: '20:00', lat: 40.7033, lng: -74.017 },
  { name: 'Westfield Police Station', type: 'police', address: '220 Westfield Boulevard', city: 'Metro City', phone: '+1 555-0133', email: 'westfield@metropolice.gov', hours: 'Mon–Sat · 09:00–18:00', open: '09:00', close: '18:00', lat: 40.7306, lng: -74.0652 },
  { name: 'Riverside Police Station', type: 'police', address: '15 River Walk, Riverside', city: 'Metro City', phone: '+1 555-0144', email: 'riverside@metropolice.gov', hours: 'Mon–Sun · 09:00–18:00', open: '09:00', close: '18:00', lat: 40.8, lng: -73.97 },
  { name: 'Metro International Airport — Lost & Found', type: 'airport', address: 'Terminal 1, Arrivals Level, Desk L4', city: 'Metro City', phone: '+1 555-0200', email: 'lostfound@metroairport.com', hours: 'Open 24 × 7', open: '00:00', close: '23:59', lat: 40.6413, lng: -73.7781 },
  { name: 'TechPark One — Corporate Security Desk', type: 'corporate', address: 'Tower B Lobby, TechPark One', city: 'Metro City', phone: '+1 555-0300', email: 'security@techparkone.com', hours: 'Mon–Fri · 08:00–20:00', open: '08:00', close: '20:00', lat: 40.7484, lng: -73.9857 },
  { name: 'Grand Central Railway — Lost Property Office', type: 'transit', address: 'Main Concourse, Gate 3', city: 'Metro City', phone: '+1 555-0400', email: 'lostproperty@metrorail.com', hours: 'Mon–Sun · 07:00–22:00', open: '07:00', close: '22:00', lat: 40.7527, lng: -73.9772 },
];

const OFFICERS = [
  { username: 'officer.james', name: 'James Carter', badge: 'MPD-1021', rank: 'Inspector', station: 1 },
  { username: 'officer.anita', name: 'Anita Sharma', badge: 'MPD-1147', rank: 'Sub-Inspector', station: 1 },
  { username: 'officer.omar', name: 'Omar Farooq', badge: 'MPD-2210', rank: 'Sergeant', station: 2 },
  { username: 'officer.lena', name: 'Lena Brooks', badge: 'MPD-3305', rank: 'Officer', station: 3 },
  { username: 'officer.diego', name: 'Diego Alvarez', badge: 'MPD-4418', rank: 'Officer', station: 4 },
  { username: 'officer.kate', name: 'Kate Nguyen', badge: 'MPD-5520', rank: 'Sergeant', station: 5 },
  { username: 'airport.desk', name: 'Ravi Menon', badge: 'MIA-LF-07', rank: 'Lost & Found Supervisor', station: 6 },
  { username: 'techpark.security', name: 'Grace Lee', badge: 'TP1-SEC-12', rank: 'Security Lead', station: 7 },
  { username: 'railway.office', name: 'Samuel Okafor', badge: 'MR-LPO-03', rank: 'Station Officer', station: 8 },
];
const OFFICER_PASSWORD = 'ihunt@123';

const USERS = [
  { username: 'john', name: 'John Miller', email: 'john.miller@example.com', phone: '+1 555-1001' },
  { username: 'priya', name: 'Priya Patel', email: 'priya.patel@example.com', phone: '+1 555-1002' },
  { username: 'ahmed', name: 'Ahmed Khan', email: 'ahmed.khan@example.com', phone: '+1 555-1003' },
  { username: 'maria', name: 'Maria Garcia', email: 'maria.garcia@example.com', phone: '+1 555-1004' },
  { username: 'chen', name: 'Chen Wei', email: 'chen.wei@example.com', phone: '+1 555-1005' },
  { username: 'sara', name: 'Sara Johnson', email: 'sara.johnson@example.com', phone: '+1 555-1006' },
];
const USER_PASSWORD = 'iseek@123';

const pad = (n) => String(n).padStart(2, '0');
function localDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysFromToday(days, time) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${localDate(d)}T${time}`;
}

function copySeedPhoto(file) {
  const dir = path.join(UPLOAD_DIR, 'seed');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, file);
  if (!fs.existsSync(dest)) fs.copyFileSync(path.join(SEED_DIR, 'images', file), dest);
  return `seed/${file}`;
}

function copyDemoPhoto(file) {
  const dir = path.join(UPLOAD_DIR, 'lost');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `seed-${file}`);
  if (!fs.existsSync(dest)) fs.copyFileSync(path.join(SEED_DIR, '..', 'demo-photos', file), dest);
  return `lost/seed-${file}`;
}

function copyDemoTo(file, subdir) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `seed-${file}`);
  if (!fs.existsSync(dest)) fs.copyFileSync(path.join(SEED_DIR, '..', 'demo-photos', file), dest);
  return `${subdir}/seed-${file}`;
}

// All faces are StyleGAN-generated portraits of people who do not exist (see seed/ATTRIBUTION.md).
const PERSONS = [
  {
    station: 6, name: 'Leo (first name only)', gender: 'male', age: 8, days_ago: 0, time: '11:20', photo: 'person-boy.jpg',
    found_location: 'Arrivals Hall, near Gate B baggage belt 4',
    condition: 'Safe — with airport child-care staff',
    description: 'Unaccompanied boy, white polo shirt and dark trousers. Speaks English, says his name is Leo and that he arrived with his mother.',
  },
  {
    station: 8, name: null, gender: 'male', age: 40, days_ago: 1, time: '19:05', photo: 'person-man.jpg',
    found_location: 'Platform 6 waiting room',
    condition: 'Disoriented, unable to recall his address — medically checked, resting at the station office',
    description: 'Adult man with short dark hair and a trimmed beard, dark jacket, lanyard without an ID card.',
  },
  {
    station: 3, name: null, gender: 'male', age: 23, days_ago: 0, time: '08:40', photo: 'person-young-man.jpg',
    found_location: 'Harbor Point ferry terminal',
    condition: 'Well — separated from his tour group, phone battery dead',
    description: 'Young man with short brown hair, light-blue t-shirt, limited English, carrying a backpack with a hostel key card.',
  },
  {
    station: 1, name: null, gender: 'female', age: 40, days_ago: 2, time: '16:30', photo: 'person-woman.jpg',
    found_location: 'Central Market, flower stalls',
    condition: 'Memory loss — in care at the Central PS family room',
    description: 'Woman with long dark wavy hair, warm smile, rust-coloured top. Remembers only the first name of her daughter.',
  },
];

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM stations').get();
  if (n > 0) return false;
  console.log('[seed] seeding demo data…');
  const items = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'items.json'), 'utf8'));

  db.transaction(() => {
    const st = db.prepare('INSERT INTO stations (name, type, address, city, phone, email, hours, open_time, close_time, lat, lng) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    STATIONS.forEach((s) => st.run(s.name, s.type, s.address, s.city, s.phone, s.email, s.hours, s.open, s.close, s.lat, s.lng));

    const ofPw = hash(OFFICER_PASSWORD);
    const of = db.prepare('INSERT INTO officers (username, password_hash, name, badge, rank, station_id) VALUES (?,?,?,?,?,?)');
    OFFICERS.forEach((o) => of.run(o.username, ofPw, o.name, o.badge, o.rank, o.station));

    const usPw = hash(USER_PASSWORD);
    const us = db.prepare('INSERT INTO users (username, password_hash, name, email, phone) VALUES (?,?,?,?,?)');
    USERS.forEach((u) => us.run(u.username, usPw, u.name, u.email, u.phone));

    const officerFor = (stationId) => OFFICERS.findIndex((o) => o.station === stationId) + 1;
    const it = db.prepare('INSERT INTO items (station_id, officer_id, category, title, description, found_location, found_at) VALUES (?,?,?,?,?,?,?)');
    const ph = db.prepare('INSERT INTO item_photos (item_id, path) VALUES (?, ?)');
    const slugToId = {};
    items.forEach((x) => {
      const info = it.run(x.station, officerFor(x.station), x.category, x.title, x.description, x.found_location, daysFromToday(-x.days_ago, x.time));
      slugToId[x.slug] = info.lastInsertRowid;
      x.photos.forEach((p) => ph.run(info.lastInsertRowid, copySeedPhoto(p)));
    });

    const itemStation = (slug) => items.find((x) => x.slug === slug).station;
    const ap = db.prepare(
      'INSERT INTO appointments (user_id, item_id, station_id, scheduled_at, ownership_proof, contact_phone, match_score, status, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    const approved = [
      ['john', 'red-iphone-se', 0, '10:30', 'Crack on the back glass bottom-left, lock screen is a photo of my dog.', 93],
      ['maria', 'brown-leather-wallet', 0, '12:00', 'Contains my library card in the name Maria Garcia and a gym membership card.', 88],
      ['ahmed', 'airpods-pro', 0, '15:30', 'Case has a small scratch near the hinge; paired with my iPhone named "Ahmed’s iPhone".', 81],
      ['chen', 'turquoise-suitcase', 0, '17:00', 'Name tag inside front pocket: Chen Wei, flight AI-202. Lock code 314.', 90],
    ];
    const completed = [
      ['sara', 'pilot-watch', -1, '11:00', 'Engraving on the back: "S.J. 2019".', 86],
      ['priya', 'national-id-card', -1, '15:00', 'It is my national ID; I can show my passport as secondary proof.', 97],
    ];
    const pending = [
      ['sara', 'grey-vespa', 1, '11:30', 'Registration MC-4471, the key is on my ring with a red tag; I have the insurance papers.', 89],
      ['priya', 'red-honda-civic', 0, '16:30', 'Plate ends in 7XR, a child seat is in the back and there is a dent on the rear bumper.', 90],
      ['priya', 'blue-jansport-backpack', 1, '10:00', 'My name is written on the inside label; there is a maths notebook and a green water bottle.', 91],
      ['john', 'gold-macbook-air', 1, '14:30', 'Serial number C02XK1ABJG5J, stickers were removed recently.', 84],
      ['maria', 'black-leather-handbag', 2, '16:00', 'Inside zip pocket has a receipt from Westfield Pharmacy.', 79],
      ['ahmed', 'nikon-dslr', 1, '13:00', 'Nikon D850, serial 3021447, small dent on the top plate.', 92],
      ['chen', 'teddy-bear-sweater', 0, '18:30', "My daughter's teddy — the sweater has a small tear at the left sleeve.", 95],
      ['sara', 'red-champion-backpack', 2, '09:30', 'Has a keychain shaped like a star on the zip.', 77],
      ['john', 'ford-car-key', 1, '11:30', 'Ford Focus key; I can bring the car registration.', 80],
    ];
    const uid = (u) => USERS.findIndex((x) => x.username === u) + 1;
    approved.forEach(([u, slug, d, t, proof, score]) => {
      const stationId = itemStation(slug);
      ap.run(uid(u), slugToId[slug], stationId, daysFromToday(d, t), proof, USERS[uid(u) - 1].phone, score, 'approved', officerFor(stationId), new Date().toISOString());
      db.prepare("UPDATE items SET status = 'reserved' WHERE id = ?").run(slugToId[slug]);
    });
    completed.forEach(([u, slug, d, t, proof, score]) => {
      const stationId = itemStation(slug);
      ap.run(uid(u), slugToId[slug], stationId, daysFromToday(d, t), proof, USERS[uid(u) - 1].phone, score, 'completed', officerFor(stationId), new Date().toISOString());
      db.prepare("UPDATE items SET status = 'returned' WHERE id = ?").run(slugToId[slug]);
    });
    pending.forEach(([u, slug, d, t, proof, score]) => {
      ap.run(uid(u), slugToId[slug], itemStation(slug), daysFromToday(d, t), proof, USERS[uid(u) - 1].phone, score, 'pending', null, null);
    });

    const lr = db.prepare('INSERT INTO lost_reports (user_id, mode, description, category, status) VALUES (?,?,?,?,?)');
    const lrp = db.prepare('INSERT INTO lost_report_photos (report_id, path) VALUES (?, ?)');
    const report = lr.run(uid('priya'), 'photo', null, 'Drones', 'searching');
    lrp.run(report.lastInsertRowid, copyDemoPhoto('lost-dji-drone.jpg'));
    lr.run(uid('sara'), 'text', 'Brown leather cowboy boots, size 8, lost in a yellow taxi', 'Clothing', 'searching');

    const ps = db.prepare('INSERT INTO persons (station_id, officer_id, name, gender, approx_age, description, found_location, found_at, condition) VALUES (?,?,?,?,?,?,?,?,?)');
    const pp = db.prepare('INSERT INTO person_photos (person_id, path) VALUES (?, ?)');
    PERSONS.forEach((x) => {
      const info = ps.run(x.station, officerFor(x.station), x.name, x.gender, x.age, x.description, x.found_location, daysFromToday(-x.days_ago, x.time), x.condition);
      pp.run(info.lastInsertRowid, copySeedPhoto(x.photo));
    });
    const mr = db.prepare('INSERT INTO missing_reports (user_id, mode, name, age, gender, description, last_seen_location, last_seen_at, relation, status) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const riya = mr.run(uid('priya'), 'photo', 'Riya Patel', 22, 'female', 'Long brown hair with a fringe, grey hoodie.', 'Westfield Mall food court', daysFromToday(-1, '18:30'), 'Sister', 'searching');
    db.prepare('INSERT INTO missing_report_photos (report_id, path) VALUES (?, ?)').run(riya.lastInsertRowid, copyDemoTo('missing-riya.jpg', 'missing'));
    mr.run(uid('sara'), 'text', 'Harold Johnson', 78, 'male', 'My grandfather, 78 years old, grey hair, glasses, brown cardigan. He has early dementia.', 'Riverside park', daysFromToday(-1, '10:00'), 'Grandson / granddaughter', 'searching');

    const nt = db.prepare('INSERT INTO notifications (user_id, type, title, body, item_id) VALUES (?,?,?,?,?)');
    approved.forEach(([u, slug]) => {
      const s = STATIONS[itemStation(slug) - 1];
      nt.run(uid(u), 'approved', 'Appointment approved', `Your appointment to collect "${items.find((x) => x.slug === slug).title}" at ${s.name} has been approved. Please bring a photo ID.`, slugToId[slug]);
    });
  })();
  console.log(`[seed] ${STATIONS.length} stations, ${OFFICERS.length} officers, ${USERS.length} users, ${items.length} found items, ${PERSONS.length} people in care`);
  return true;
}

module.exports = { seedIfEmpty, STATIONS, OFFICERS, USERS, OFFICER_PASSWORD, USER_PASSWORD, localDate };
