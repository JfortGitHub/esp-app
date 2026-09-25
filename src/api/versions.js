'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();

router.get('/:normId', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM versions WHERE norm_id = ? ORDER BY version_number').all(req.params.normId);
  res.json({
    ok: true,
    versions: rows.map(r => ({
      ...JSON.parse(r.data),
      _versionNumber: r.version_number,
      _versionAt: r.at,
      _versionBy: r.by_user,
      _versionComment: r.comment,
      _statusSnapshot: r.status_snapshot
    }))
  });
});

router.post('/:normId', requireAuth, (req, res) => {
  const { normId } = req.params;
  const { data, comment, statusSnapshot } = req.body;
  if (!data) return res.status(400).json({ ok: false, msg: 'data обязателен' });

  const last = db.prepare('SELECT MAX(version_number) AS m FROM versions WHERE norm_id = ?').get(normId);
  const num = (last.m || 0) + 1;

  db.prepare(`
    INSERT INTO versions (norm_id, version_number, data, status_snapshot, comment, by_user)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(normId, num, JSON.stringify(data), statusSnapshot || null, comment || '', req.user.login);

  res.json({ ok: true, versionNumber: num });
});

router.post('/:normId/revert/:num', requireAuth, (req, res) => {
  const { normId, num } = req.params;
  const target = db.prepare('SELECT * FROM versions WHERE norm_id = ? AND version_number = ?').get(normId, num);
  if (!target) return res.status(404).json({ ok: false, msg: 'Версия не найдена' });

  const last = db.prepare('SELECT MAX(version_number) AS m FROM versions WHERE norm_id = ?').get(normId);
  const newNum = (last.m || 0) + 1;

  db.prepare(`
    INSERT INTO versions (norm_id, version_number, data, status_snapshot, comment, by_user)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(normId, newNum, target.data, 'draft', `Откат к версии ${num}`, req.user.login);

  res.json({ ok: true, versionNumber: newNum });
});

module.exports = router;
