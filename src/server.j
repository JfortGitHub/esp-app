'use strict';

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const db = require('./db');
const { login, requireAuth, requireRole } = require('./auth');
const normsRouter = require('./api/norms');
const cardsRouter = require('./api/cards');
const workflowRouter = require('./api/workflow');
const versionsRouter = require('./api/versions');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ═══ AUTH ═══
app.post('/api/login', (req, res) => {
  const { login: l, password } = req.body;
  const r = login(l, password);
  if (!r) return res.status(401).json({ ok: false, msg: 'Неверный логин или пароль' });
  res.json({ ok: true, ...r });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});
app.post('/api/me/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ ok: false, msg: 'Укажите старый и новый пароль' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ ok: false, msg: 'Новый пароль минимум 6 символов' });
  }
  const u = db.prepare('SELECT * FROM users WHERE login = ?').get(req.user.login);
  if (!u) return res.status(404).json({ ok: false, msg: 'Пользователь не найден' });
  if (!bcrypt.compareSync(oldPassword, u.password)) {
    return res.status(400).json({ ok: false, msg: 'Текущий пароль неверен' });
  }
  db.prepare('UPDATE users SET password = ? WHERE login = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.user.login);
  res.json({ ok: true });
});
// ═══ USERS (только admin) ═══
app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT login, name, role, created_at FROM users ORDER BY created_at').all();
  res.json({ ok: true, users: rows });
});

app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { login: l, password, name, role } = req.body;
  if (!l || !password || !name || !role) return res.status(400).json({ ok: false, msg: 'Все поля обязательны' });
  if (password.length < 6) return res.status(400).json({ ok: false, msg: 'Пароль минимум 6 символов' });
  if (!['admin', 'engineer', 'user'].includes(role)) return res.status(400).json({ ok: false, msg: 'Неверная роль' });
  const exists = db.prepare('SELECT login FROM users WHERE login = ?').get(l);
  if (exists) return res.status(409).json({ ok: false, msg: 'Пользователь уже существует' });
  db.prepare('INSERT INTO users (login, password, name, role) VALUES (?, ?, ?, ?)')
    .run(l, bcrypt.hashSync(password, 10), name, role);
  res.json({ ok: true });
});

app.delete('/api/users/:login', requireAuth, requireRole('admin'), (req, res) => {
  if (req.params.login === req.user.login) return res.status(400).json({ ok: false, msg: 'Нельзя удалить себя' });
  db.prepare('DELETE FROM users WHERE login = ?').run(req.params.login);
  res.json({ ok: true });
});

app.post('/api/users/:login/reset-password', requireAuth, requireRole('admin'), (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ ok: false, msg: 'Пароль минимум 6 символов' });
  const r = db.prepare('UPDATE users SET password = ? WHERE login = ?').run(bcrypt.hashSync(password, 10), req.params.login);
  if (r.changes === 0) return res.status(404).json({ ok: false, msg: 'Пользователь не найден' });
  res.json({ ok: true });
});

// ═══ EQUIPMENT ═══
app.get('/api/equipment', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM equipment ORDER BY code').all();
  res.json({ ok: true, equipment: rows });
});

app.post('/api/equipment', requireAuth, requireRole('engineer'), (req, res) => {
  const e = req.body;
  if (!e.code || !e.section || !e.category || !e.type || !e.unit) {
    return res.status(400).json({ ok: false, msg: 'code, section, category, type, unit обязательны' });
  }
  const exists = db.prepare('SELECT id FROM equipment WHERE code = ?').get(e.code);
  if (exists) return res.status(409).json({ ok: false, msg: 'Код уже существует' });
  const id = 'eq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  db.prepare(`
    INSERT INTO equipment (id, code, section, category, type, unit, tm, manufacturer, inv_number, year, specs, notes, author)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, e.code, e.section, e.category, e.type, e.unit, e.tm || '', e.manufacturer || '',
    e.invNumber || '', e.year || '', e.specs || '', e.notes || '', req.user.login);
  res.json({ ok: true, id });
});

app.delete('/api/equipment/:id', requireAuth, requireRole('engineer'), (req, res) => {
  db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ═══ HEALTH ═══
app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: '1.0.0' });
});

// ═══ МАРШРУТЫ ═══
app.use('/api/norms', normsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/workflow', workflowRouter);
app.use('/api/versions', versionsRouter);

// ═══ SPA FALLBACK ═══
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, msg: 'Не найдено' });
  res.sendFile(path.join(__dirname, 'public', 'esp-full.html'));
});

app.listen(PORT, () => {
  console.log(`[esp-app] Сервер запущен на http://0.0.0.0:${PORT}`);
});
