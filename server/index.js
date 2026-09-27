const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { PORT, ROOT, UPLOAD_DIR } = require('./config');
require('./db');
const { seedIfEmpty } = require('./seed');
const engine = require('./ai/engine');
const indexer = require('./ai/indexer');
const llm = require('./ai/llm');
const { stations, categories } = require('./routes/common');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    ai: { ready: engine.state.ready, model: engine.state.model, error: engine.state.error, gpt: llm.enabled(), indexing: indexer.status },
  })
);
app.get('/api/public/meta', (req, res) => res.json({ stations: stations(), categories: categories() }));
app.use('/api/police', require('./routes/police'));
app.use('/api/user', require('./routes/user'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use('/demo-photos', express.static(path.join(ROOT, 'demo-photos'), { maxAge: '1d', index: false }));
const pub = path.join(ROOT, 'public');
app.use(express.static(pub, { extensions: ['html'] }));
app.get(['/ihunt', '/ihunt/*splat'], (req, res) => res.sendFile(path.join(pub, 'ihunt', 'index.html')));
app.get(['/iseek', '/iseek/*splat'], (req, res) => res.sendFile(path.join(pub, 'iseek', 'index.html')));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: status >= 500 ? 'Something went wrong, please try again' : err.message });
});

seedIfEmpty();
app.listen(PORT, () => {
  console.log(`iSeek · iHunt running on http://localhost:${PORT}  (iHunt: /ihunt  ·  iSeek: /iseek)`);
  indexer.indexPending().catch((err) => console.error('[ai] indexing failed', err));
});
