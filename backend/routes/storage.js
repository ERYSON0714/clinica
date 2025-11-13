const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /storage/describe - describe the table
router.get('/describe', async (req, res) => {
  try {
    const [rows] = await pool.query('DESCRIBE client_storage');
    res.json(rows);
  } catch (err) {
    console.error('storage describe route error:', err && (err.stack || err.message || err));
    res.status(500).json({ error: err && err.message ? err.message : 'unknown error', stack: err && err.stack ? err.stack : null });
  }
});

// GET /storage/all - retorna todas as chaves e valores como objeto
router.get('/all', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM client_storage');
    const storage = {};
    rows.forEach(row => {
      try {
        storage[row.storage_key] = JSON.parse(row.storage_value);
      } catch (e) {
        storage[row.storage_key] = row.storage_value; // fallback se não for JSON
      }
    });
    res.json(storage);
  } catch (err) {
    console.error('storage all route error:', err && (err.stack || err.message || err));
    res.status(500).json({ error: err && err.message ? err.message : 'unknown error', stack: err && err.stack ? err.stack : null });
  }
});

// POST /storage/:key - salva o valor para a chave
router.post('/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    const valueStr = JSON.stringify(value);
    await pool.query(
      'INSERT INTO client_storage (`storage_key`, `storage_value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `storage_value` = VALUES(`storage_value`)',
      [key, valueStr]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('storage post route error:', err && (err.stack || err.message || err));
    res.status(500).json({ error: err && err.message ? err.message : 'unknown error', stack: err && err.stack ? err.stack : null });
  }
});

module.exports = router;
