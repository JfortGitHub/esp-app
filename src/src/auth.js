'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = '12h';

function login(login, password) {
  const u = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!u) return null;
  if (!bcrypt.compareSync(password, u.password)) return null;
  const token = jwt.sign({ login: u.login, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return { token, user: { login: u.login, name: u.name, role: u.role } };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Middleware
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, msg: 'Требуется авторизация' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ ok: false, msg: 'Сессия истекла' });
  req.user = payload;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, msg: 'Не авторизован' });
    const levels = { admin: 3, engineer: 2, user: 1 };
    const need = Math.max(...roles.map(r => levels[r] || 0));
    if ((levels[req.user.role] || 0) < need) return res.status(403).json({ ok: false, msg: 'Недостаточно прав' });
    next();
  };
}

module.exports = { login, verifyToken, requireAuth, requireRole };
