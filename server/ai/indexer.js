const path = require('path');
const engine = require('./engine');
const agent = require('./agent');
const { db, toBlob } = require('../db');
const { UPLOAD_DIR } = require('../config');

const status = { total: 0, done: 0, running: false };

async function indexPending() {
  if (status.running) return;
  status.running = true;
  try {
    await engine.load();
    const items = db.prepare('SELECT DISTINCT i.id FROM items i JOIN item_photos p ON p.item_id = i.id WHERE p.embedding IS NULL OR i.text_embedding IS NULL').all();
    const reportPhotos = db.prepare('SELECT id, path FROM lost_report_photos WHERE embedding IS NULL').all();
    const textReports = db.prepare("SELECT id, description FROM lost_reports WHERE mode = 'text' AND text_embedding IS NULL AND description IS NOT NULL").all();
    status.total = items.length + reportPhotos.length + textReports.length;
    status.done = 0;
    for (const { id } of items) {
      const photos = db.prepare('SELECT path FROM item_photos WHERE item_id = ? ORDER BY id').all(id);
      await agent.indexItem(id, photos.map((p) => path.join(UPLOAD_DIR, p.path)));
      status.done++;
    }
    for (const p of reportPhotos) {
      const emb = await engine.embedImage(path.join(UPLOAD_DIR, p.path));
      db.prepare('UPDATE lost_report_photos SET embedding = ? WHERE id = ?').run(toBlob(emb), p.id);
      status.done++;
    }
    for (const r of textReports) {
      const emb = await engine.embedText(`a photo of ${r.description}`);
      db.prepare('UPDATE lost_reports SET text_embedding = ? WHERE id = ?').run(toBlob(emb), r.id);
      status.done++;
    }
    if (status.total) console.log(`[ai] indexed ${status.total} pending records`);
  } finally {
    status.running = false;
  }
}

module.exports = { indexPending, status };
