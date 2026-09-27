const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { UPLOAD_DIR, MAX_PHOTOS, MAX_PHOTO_BYTES } = require('./config');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

function photosField(req, res, next) {
  upload.array('photos', MAX_PHOTOS)(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `You can upload at most ${MAX_PHOTOS} photos` : err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 10 MB' : err.message;
    return res.status(400).json({ error: msg });
  });
}

async function savePhotos(files, subdir) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const f of files) {
    const name = `${crypto.randomUUID()}.jpg`;
    const full = path.join(dir, name);
    try {
      await sharp(f.buffer).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(full);
    } catch {
      throw Object.assign(new Error(`Could not read "${f.originalname}" as an image`), { status: 400 });
    }
    saved.push({ rel: `${subdir}/${name}`, full });
  }
  return saved;
}

module.exports = { photosField, savePhotos };
