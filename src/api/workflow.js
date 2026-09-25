'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

const STATUSES = {
  draft:    { name: 'Черновик',    color: 'gray',   icon: '📝' },
  review:   { name: 'На проверке', color: 'yellow', icon: '🔍' },
  approved: { name: 'Утверждён',   color: 'green',  icon: '✅' },
  rejected: { name: 'Отклонён',    color: 'red',    icon: '❌' },
  archived: { name: 'В архиве',    color: 'gray',   icon: '📦' }
};

const RIGHTS = {
  'draft->review':      ['user', 'engineer', 'admin'],
  'review->approved':   ['engineer', 'admin'],
  'review->rejected':   ['engineer', 'admin'],
  'approved->archived': ['admin'],
  'rejected->draft':    ['user', 'engineer', 'admin'],
  'archived->draft':    ['admin'],
  'approved->draft':    ['engineer', 'admin'],
  'approved->review':   ['engineer', 'admin'],
  'rejected->review':   ['engineer', 'admin']
};

function canTransition(from, to, role) {
  const allowed = RIGHTS[`${from}->${to}`];
  return allowed ? allowed.includes(role) : false;
}

router.get('/states', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM workflow_states').all();
  const states = {};
  rows.forEach(r => { states[r.norm_id] = { status: r.status, updatedAt: r.updated_at, updatedBy: r.updated_by }; });
  res.json({ ok: true, states });
});

router.get('/state/:normId', requireAuth, (req, res) => {
  const r = db.prepare('SELECT * FROM workflow_states WHERE norm_id = ?').get(req.params.normId);
  res.json({ ok: true, state: r ? { status: r.status, updatedAt: r.updated_at, updatedBy: r.updated_by } : { status: 'draft' } });
});

router.post('/transition', requireAuth, (req, res) => {
  const { normId, to, comment } = req.body;
  if (!normId || !to || !STATUSES[to]) return res.status(400).json({ ok: false, msg: 'normId и to обязательны' });

  const cur = db.prepare('SELECT status FROM workflow_states WHERE norm_id = ?').get(normId);
  const from = cur ? cur.status : 'draft';

  if (from === to) return res.status(400).json({ ok: false, msg: 'Уже в этом статусе' });
  if (!canTransition(from, to, req.user.role)) {
    return res.status(403).json({ ok: false, msg: `Нет прав: ${req.user.role} не может ${from} → ${to}` });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO workflow_states (norm_id, status, updated_at, updated_by)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(norm_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).run(normId, to, req.user.login);

    db.prepare(`
      INSERT INTO workflow_history (norm_id, from_state, to_state, by_user, role, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(normId, from, to, req.user.login, req.user.role, comment || '');
  });
  tx();

  res.json({ ok: true, from, to });
});

router.get('/history/:normId', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM workflow_history WHERE norm_id = ? ORDER BY at DESC').all(req.params.normId);
  res.json({ ok: true, history: rows.map(r => ({ from: r.from_state, to: r.to_state, by: r.by_user, role: r.role, comment: r.comment, at: r.at })) });
});

router.get('/stats', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS c FROM workflow_states GROUP BY status').all();
  const stats = { draft: 0, review: 0, approved: 0, rejected: 0, archived: 0 };
  rows.forEach(r => { if (stats[r.status] != null) stats[r.status] = r.c; });
  res.json({ ok: true, stats });
});

module.exports = router;
