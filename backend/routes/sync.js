const express = require('express');
const pool = require('../db');
const router = express.Router();

// Helper function to get table name from entity
const getTableName = (entity) => {
  const tableMap = {
    pacientes: 'pacientes',
    especialistas: 'especialistas',
    agendamentos: 'agendamentos',
    clinica_config: 'clinica_config',
    historico: 'historico',
    comunicados: 'comunicados'
  };
  return tableMap[entity] || entity;
};

// Helper function to convert database row to frontend format
const convertRowToFrontend = (row, table) => {
  const converted = { ...row };

  // Convert database column names to frontend format
  if (table === 'especialistas') {
    converted.vagasManha = row.vagas_manha;
    converted.vagasTarde = row.vagas_tarde;
    delete converted.vagas_manha;
    delete converted.vagas_tarde;
  }

  if (table === 'clinica_config') {
    converted.nomeClinica = row.nome_clinica;
    delete converted.nome_clinica;
  }

  // Convert JSON fields
  if (row.dias && typeof row.dias === 'string') {
    try {
      converted.dias = JSON.parse(row.dias);
    } catch (e) {
      converted.dias = [];
    }
  }

  if (row.clinic_snapshot && typeof row.clinic_snapshot === 'string') {
    try {
      converted.clinicSnapshot = JSON.parse(row.clinic_snapshot);
    } catch (e) {
      converted.clinicSnapshot = null;
    }
  }

  if (row.payload && typeof row.payload === 'string') {
    try {
      converted.payload = JSON.parse(row.payload);
    } catch (e) {
      converted.payload = null;
    }
  }

  // Remove database-specific fields
  delete converted.sync_status;
  delete converted.last_modified;
  delete converted.created_at;

  return converted;
};

// Helper function to convert frontend data to database format
const convertToDatabase = (data, table) => {
  const converted = { ...data };

  // Convert frontend field names to database column names
  if (table === 'especialistas') {
    converted.vagas_manha = data.vagasManha;
    converted.vagas_tarde = data.vagasTarde;
    delete converted.vagasManha;
    delete converted.vagasTarde;
  }

  if (table === 'clinica_config') {
    converted.nome_clinica = data.nomeClinica;
    delete converted.nomeClinica;
  }

  // Convert JSON fields to strings
  if (converted.dias && Array.isArray(converted.dias)) {
    converted.dias = JSON.stringify(converted.dias);
  }

  if (converted.clinicSnapshot) {
    converted.clinic_snapshot = JSON.stringify(converted.clinicSnapshot);
    delete converted.clinicSnapshot;
  }

  if (converted.payload) {
    converted.payload = JSON.stringify(converted.payload);
  }

  // Add sync metadata
  converted.sync_status = 'synced';
  converted.last_modified = Date.now();

  return converted;
};

// GET /sync/status - verifica status de sincronização
router.get('/status', async (req, res) => {
  try {
    // Count pending sync items across all tables
    const tables = ['pacientes', 'especialistas', 'agendamentos', 'clinica_config', 'historico', 'comunicados'];
    let totalPending = 0;

    for (const table of tables) {
      try {
        const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table} WHERE sync_status = 'pending'`);
        totalPending += rows[0].count;
      } catch (e) {
        // Table might not exist yet, skip
      }
    }

    res.json({ pending: totalPending });
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
      // Process each entity
      for (const [entity, items] of Object.entries(data)) {
        const table = getTableName(entity);

        if (Array.isArray(items)) {
          // Handle arrays (pacientes, especialistas, agendamentos, etc.)
          for (const item of items) {
            if (item.id) {
              const dbData = convertToDatabase(item, table);
              const columns = Object.keys(dbData);
              const values = Object.values(dbData);
              const placeholders = columns.map(() => '?').join(', ');

              const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                             ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

              await connection.query(query, values);
            }
          }
        } else {
          // Handle single objects (clinica_config)
          const dbData = convertToDatabase(items, table);
          const columns = Object.keys(dbData);
          const values = Object.values(dbData);
          const placeholders = columns.map(() => '?').join(', ');

          const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                         ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

          await connection.query(query, values);
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
      // 1. Upload dos dados locais para a nuvem (se fornecidos)
      const localData = req.query.localData ? JSON.parse(req.query.localData) : {};
      const lastSync = req.query.lastSync;

      if (Object.keys(localData).length > 0) {
        for (const [entity, items] of Object.entries(localData)) {
          const table = getTableName(entity);

          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.id) {
                const dbData = convertToDatabase(item, table);
                const columns = Object.keys(dbData);
                const values = Object.values(dbData);
                const placeholders = columns.map(() => '?').join(', ');

                const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                               ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

                await connection.query(query, values);
              }
            }
          } else {
            const dbData = convertToDatabase(items, table);
            const columns = Object.keys(dbData);
            const values = Object.values(dbData);
            const placeholders = columns.map(() => '?').join(', ');

            const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                           ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

            await connection.query(query, values);
          }
        }
      }

      // 2. Download dos dados da nuvem (apenas alterações desde lastSync)
      const cloudData = {};
      const tables = ['pacientes', 'especialistas', 'agendamentos', 'clinica_config', 'historico', 'comunicados'];

      for (const table of tables) {
        try {
          let query = `SELECT * FROM ${table}`;
          let params = [];

          if (lastSync) {
            query += ' WHERE last_modified > ?';
            params.push(new Date(lastSync).getTime());
          }

          query += ' ORDER BY last_modified DESC';

          const [rows] = await connection.query(query, params);

          // Convert rows to frontend format
          const convertedRows = rows.map(row => convertRowToFrontend(row, table));

          // Group by entity name
          const entityName = Object.keys({pacientes:'pacientes',especialistas:'especialistas',agendamentos:'agendamentos',clinica_config:'clinica_config',historico:'historico',comunicados:'comunicados'}).find(key => getTableName(key) === table) || table;
          cloudData[entityName] = convertedRows;
        } catch (e) {
          // Table might not exist yet, skip
          console.warn(`Table ${table} not found, skipping`);
        }
      }

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
      if (localData && Object.keys(localData).length > 0) {
        for (const [entity, items] of Object.entries(localData)) {
          const table = getTableName(entity);

          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.id) {
                const dbData = convertToDatabase(item, table);
                const columns = Object.keys(dbData);
                const values = Object.values(dbData);
                const placeholders = columns.map(() => '?').join(', ');

                const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                               ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

                await connection.query(query, values);
              }
            }
          } else {
            const dbData = convertToDatabase(items, table);
            const columns = Object.keys(dbData);
            const values = Object.values(dbData);
            const placeholders = columns.map(() => '?').join(', ');

            const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                           ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

            await connection.query(query, values);
          }
        }
      }

      // 2. Download dos dados da nuvem (apenas alterações desde lastSync)
      const cloudData = {};
      const tables = ['pacientes', 'especialistas', 'agendamentos', 'clinica_config', 'historico', 'comunicados'];

      for (const table of tables) {
        try {
          let query = `SELECT * FROM ${table}`;
          let params = [];

          if (lastSync) {
            query += ' WHERE last_modified > ?';
            params.push(new Date(lastSync).getTime());
          }

          query += ' ORDER BY last_modified DESC';

          const [rows] = await connection.query(query, params);

          // Convert rows to frontend format
          const convertedRows = rows.map(row => convertRowToFrontend(row, table));

          // Group by entity name
          const entityName = Object.keys({pacientes:'pacientes',especialistas:'especialistas',agendamentos:'agendamentos',clinica_config:'clinica_config',historico:'historico',comunicados:'comunicados'}).find(key => getTableName(key) === table) || table;
          cloudData[entityName] = convertedRows;
        } catch (e) {
          // Table might not exist yet, skip
          console.warn(`Table ${table} not found, skipping`);
        }
      }

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
