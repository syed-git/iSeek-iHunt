const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { JWT_SECRET } = require('./config');

const COOKIES = { police: 'ihunt_token', user: 'iseek_token' };
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

function issue(res, role, id) {
  const token = jwt.sign({ role, id }, JWT_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIES[role], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  });
}

function clear(res, role) {
  res.clearCookie(COOKIES[role]);
}

function requireRole(role) {
  return (req, res, next) => {
    const token = req.cookies && req.cookies[COOKIES[role]];
    if (!token) return res.status(401).json({ error: 'Please sign in' });
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.role !== role) throw new Error('wrong role');
      req.auth = payload;
      return next();
    } catch {
      clear(res, role);
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }
  };
}

const hash = (pw) => bcrypt.hashSync(pw, 10);
const verify = (pw, h) => bcrypt.compareSync(pw, h);

module.exports = { issue, clear, requireRole, hash, verify };
