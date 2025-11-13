const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET /sync/status - verifica status de sincronização
router.get('/status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as pending FROM sync_queue WHERE synced = 0');
    res.json({ pending: rows[0].pending });
  } catch (err) {
    console.error('sync status route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /sync/upload - upload de dados locais para nuvem
router.post('/upload', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Sincronizar cada chave
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          // Para arrays (como pacientes, especialistas), sobrescrever se mais recente
          for (const item of value) {
            if (item.id && item.lastModified) {
              await connection.query(
                `INSERT INTO client_storage (storage_key, storage_value, last_modified)
                 VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
                [`${key}_${item.id}`, JSON.stringify(item), item.lastModified]
              );
            }
          }
        } else {
          // Para objetos simples
          await connection.query(
            `INSERT INTO client_storage (storage_key, storage_value, last_modified)
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
            [key, JSON.stringify(value), Date.now()]
          );
        }
      }

      await connection.commit();
      res.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('sync upload route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /sync/download - download de dados da nuvem para local
router.get('/download', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Upload dos dados locais para a nuvem
      const localData = req.query.localData ? JSON.parse(req.query.localData) : {};
      const lastSync = req.query.lastSync;

      for (const [key, items] of Object.entries(localData)) {
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item.id && item.lastModified) {
              await connection.query(
                `INSERT INTO client_storage (storage_key, storage_value, last_modified)
                 VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
                [`${key}_${item.id}`, JSON.stringify(item), item.lastModified]
              );
            }
          }
        } else {
          await connection.query(
            `INSERT INTO client_storage (storage_key, storage_value, last_modified)
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
            [key, JSON.stringify(items), Date.now()]
          );
        }
      }

      // 2. Download dos dados da nuvem (apenas alterações desde lastSync)
      let query = 'SELECT storage_key, storage_value, last_modified FROM client_storage';
      let params = [];
      if (lastSync) {
        query += ' WHERE last_modified > ?';
        params.push(new Date(lastSync).getTime());
      }

      const [rows] = await connection.query(query, params);
      const cloudData = {};
      rows.forEach(row => {
        try {
          const key = row.storage_key;
          const value = JSON.parse(row.storage_value);
          if (key.includes('_')) {
            const parts = key.split('_');
            const id = parts.pop();
            const baseKey = parts.join('_');
            if (!cloudData[baseKey]) cloudData[baseKey] = [];
            cloudData[baseKey].push({ ...value, id, lastModified: row.last_modified });
          } else {
            cloudData[key] = { ...value, lastModified: row.last_modified };
          }
        } catch (e) {
          console.warn('Erro ao parsear storage_value:', e);
        }
      });

      await connection.commit();
      res.json({
        success: true,
        cloudData,
        lastSync: new Date().toISOString()
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('sync download route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /sync/sync - sincronização bidirecional completa
router.post('/sync', async (req, res) => {
  try {
    const { localData, lastSync } = req.body;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Upload dos dados locais
      if (localData) {
        for (const [key, items] of Object.entries(localData)) {
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.id && item.lastModified) {
                await connection.query(
                  `INSERT INTO client_storage (storage_key, storage_value, last_modified)
                   VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
                  [`${key}_${item.id}`, JSON.stringify(item), item.lastModified]
                );
              }
            }
          } else {
            await connection.query(
              `INSERT INTO client_storage (storage_key, storage_value, last_modified)
               VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE storage_value = VALUES(storage_value), last_modified = VALUES(last_modified)`,
              [key, JSON.stringify(items), Date.now()]
            );
          }
        }
      }

      // 2. Download dos dados da nuvem (apenas alterações desde lastSync)
      let query = 'SELECT storage_key, storage_value, last_modified FROM client_storage';
      let params = [];
      if (lastSync) {
        query += ' WHERE last_modified > ?';
        params.push(new Date(lastSync).getTime());
      }

      const [rows] = await connection.query(query, params);
      const cloudData = {};
      rows.forEach(row => {
        try {
          const key = row.storage_key;
          const value = JSON.parse(row.storage_value);
          if (key.includes('_')) {
            const parts = key.split('_');
            const id = parts.pop();
            const baseKey = parts.join('_');
            if (!cloudData[baseKey]) cloudData[baseKey] = [];
            cloudData[baseKey].push({ ...value, id, lastModified: row.last_modified });
          } else {
            cloudData[key] = { ...value, lastModified: row.last_modified };
          }
        } catch (e) {
          console.warn('Erro ao parsear storage_value:', e);
        }
      });

      await connection.commit();
      res.json({
        success: true,
        cloudData,
        lastSync: new Date().toISOString()
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('sync route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
