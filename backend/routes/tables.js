const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    res.json(rows);
  } catch (err) {
    console.error('tables route error:', err && (err.stack || err.message || err));
    res.status(500).json({ error: err && err.message ? err.message : 'unknown error', stack: err && err.stack ? err.stack : null });
  }
});

module.exports = router;
