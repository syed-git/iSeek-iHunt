const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

module.exports = {
  ROOT,
  DATA_DIR,
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  DB_FILE: path.join(DATA_DIR, 'iseek-ihunt.db'),
  MODEL_DIR: process.env.MODEL_DIR ? path.resolve(process.env.MODEL_DIR) : path.join(ROOT, 'models'),
  SEED_DIR: path.join(ROOT, 'seed'),
  PORT: Number(process.env.PORT) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'iseek-ihunt-dev-secret-change-me',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  MAX_PHOTOS: 5,
  MAX_PHOTO_BYTES: 10 * 1024 * 1024,
};
