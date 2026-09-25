'use strict';

const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();

function rowToNorm(r) {
  return {
    id: r.id,
    operationCode: r.operation_code,
    operationName: r.operation_name,
    section: r.section,
    equipmentCategory: r.equipment_category,
    equipmentType: r.equipment_type,
    equipmentUnit: r.equipment_unit,
    tm: r.tm || '',
    normValue: r.norm_value,
    unit: r.unit,
    teamSize: r.team_size,
    qualification: r.qualification,
    complexity: r.complexity,
    sourceType: r.source_type,
    sourceCode: r.source_code,
    sourceTitle: r.source_title,
    confidenceLevel: r.confidence_level,
    repairType: r.repair_type,
    toolsRequired: r.tools_required ? JSON.parse(r.tools_required) : [],
    safetyRequirements: r.safety_requirements ? JSON.parse(r.safety_requirements) : [],
    description: r.description,
    isCustom: !!r.is_custom,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// GET /api/norms — список всех нормативов
router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM norms ORDER BY operation_code').all();
  res.json({ ok: true, norms: rows.map(rowToNorm) });
});

// POST /api/norms — создать норматив
router.post('/', requireAuth, requireRole('engineer'), (req, res) => {
  const n = req.body;
  if (!n.operationCode || !n.operationName || !n.normValue) {
    return res.status(400).json({ ok: false, msg: 'operationCode, operationName, normValue обязательны' });
  }
  // Проверка дубликата кода
  const exists = db.prepare('SELECT id FROM norms WHERE operation_code = ?').get(n.operationCode);
  if (exists) {
    return res.status(409).json({ ok: false, msg: `Код "${n.operationCode}" уже существует` });
  }
  const id = 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  db.prepare(`
    INSERT INTO norms (id, operation_code, operation_name, section, equipment_category, equipment_type,
      equipment_unit, tm, norm_value, unit, team_size, qualification, complexity, source_type,
      source_code, source_title, confidence_level, repair_type, tools_required, safety_requirements,
      description, is_custom, author)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    id, n.operationCode, n.operationName, n.section, n.equipmentCategory, n.equipmentType || '',
    n.equipmentUnit || '', n.tm || '', n.normValue, n.unit || 'чел-час', n.teamSize || 2,
    n.qualification || '', n.complexity || 3, n.sourceType || 'federal', n.sourceCode || '',
    n.sourceTitle || '', n.confidenceLevel || 0.7, n.repairType || 'ТР',
    JSON.stringify(n.toolsRequired || []), JSON.stringify(n.safetyRequirements || []),
    n.description || '', req.user.login
  );
  res.json({ ok: true, id });
});

// PUT /api/norms/:id — обновить норматив
router.put('/:id', requireAuth, requireRole('engineer'), (req, res) => {
  const { id } = req.params;
  const n = req.body;
  const exists = db.prepare('SELECT id FROM norms WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ ok: false, msg: 'Норматив не найден' });

  db.prepare(`
    UPDATE norms SET
      operation_code = COALESCE(?, operation_code),
      operation_name = COALESCE(?, operation_name),
      section = COALESCE(?, section),
      equipment_category = COALESCE(?, equipment_category),
      equipment_type = COALESCE(?, equipment_type),
      equipment_unit = COALESCE(?, equipment_unit),
      tm = COALESCE(?, tm),
      norm_value = COALESCE(?, norm_value),
      team_size = COALESCE(?, team_size),
      complexity = COALESCE(?, complexity),
      repair_type = COALESCE(?, repair_type),
      description = COALESCE(?, description),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    n.operationCode, n.operationName, n.section, n.equipmentCategory, n.equipmentType,
    n.equipmentUnit, n.tm, n.normValue, n.teamSize, n.complexity, n.repairType,
    n.description, id
  );
  res.json({ ok: true });
});

// DELETE /api/norms/:id — удалить норматив
router.delete('/:id', requireAuth, requireRole('engineer'), (req, res) => {
  const { id } = req.params;
  const result = db.prepare('DELETE FROM norms WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ ok: false, msg: 'Норматив не найден' });
  res.json({ ok: true });
});

module.exports = router;
