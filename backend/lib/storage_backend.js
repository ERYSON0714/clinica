const fs = require('fs');
const path = require('path');
let pool;
try { pool = require('../db'); } catch (e) { pool = null; }

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'client_storage.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify({}), 'utf8');
}

function readFile() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function writeFile(obj) {
  ensureDataFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

async function dbAvailable() {
  if (!pool) return false;
  try {
    // quick test
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    return false;
  }
}

async function getKey(key) {
  if (await dbAvailable()) {
    const [rows] = await pool.query('SELECT `key`, `value`, `last_modified` FROM client_storage WHERE `key` = ?', [key]);
    if (!rows || rows.length === 0) return null;
    let val = rows[0].value;
    try { val = JSON.parse(val); } catch (e) { /* keep */ }
    return { key: rows[0].key, value: val, last_modified: rows[0].last_modified };
  }

  // filesystem fallback
  const obj = readFile();
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return null;
  return obj[key];
}

async function setKey(key, value) {
  const now = Date.now();
  if (await dbAvailable()) {
    const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await pool.query('INSERT INTO client_storage (`key`,`value`,`last_modified`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), last_modified = VALUES(last_modified)', [key, val, now]);
    return { key, value, last_modified: now };
  }

  // filesystem fallback
  const obj = readFile();
  obj[key] = { key, value, last_modified: now };
  writeFile(obj);
  return obj[key];
}

async function deleteKey(key) {
  if (await dbAvailable()) {
    const [r] = await pool.query('DELETE FROM client_storage WHERE `key` = ?', [key]);
    return r.affectedRows > 0;
  }
  const obj = readFile();
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return false;
  delete obj[key];
  writeFile(obj);
  return true;
}

async function listAll() {
  if (await dbAvailable()) {
    const [rows] = await pool.query('SELECT `key`, `value`, `last_modified` FROM client_storage ORDER BY last_modified DESC');
    return rows.map(r => ({ key: r.key, value: (function(){ try{ return JSON.parse(r.value); }catch(e){ return r.value } })(), last_modified: r.last_modified }));
  }
  const obj = readFile();
  return Object.values(obj).sort((a,b)=> (b.last_modified||0)-(a.last_modified||0));
}

module.exports = { getKey, setKey, deleteKey, listAll, dbAvailable };
