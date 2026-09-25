'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function rowToCard(r) {
  return {
    id: r.id,
    cardNumber: r.card_number,
    equipmentName: r.equipment_name,
    tm: r.tm || '',
    repairType: r.repair_type,
    operations: JSON.parse(r.operations),
    totalHours: r.total_hours,
    calendarDays: r.calendar_days,
    status: r.status,
    author: r.author,
    createdAt: r.created_at
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all();
  res.json({ ok: true, cards: rows.map(rowToCard) });
});

router.post('/', requireAuth, requireRole('user'), (req, res) => {
  const c = req.body;
  if (!c.cardNumber || !c.equipmentName || !Array.isArray(c.operations)) {
    return res.status(400).json({ ok: false, msg: 'cardNumber, equipmentName, operations обязательны' });
  }
  const id = 'card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  db.prepare(`
    INSERT INTO cards (id, card_number, equipment_name, tm, repair_type, operations, total_hours, calendar_days, status, author)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(id, c.cardNumber, c.equipmentName, c.tm || '', c.repairType || 'СР',
    JSON.stringify(c.operations), c.totalHours || 0, c.calendarDays || 1, req.user.login);
  res.json({ ok: true, id });
});

router.delete('/:id', requireAuth, requireRole('engineer'), (req, res) => {
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ ok: false, msg: 'Карта не найдена' });
  res.json({ ok: true });
});

module.exports = router;
