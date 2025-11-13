const express = require('express');
const router = express.Router();

function getPool() {
  try { return require('../db'); } catch (e) { return null; }
}

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

// Helper to check if a table exists in current database
const tableExists = async (table) => {
  try {
    const pool = getPool();
    if (!pool) return false;
    const [rows] = await pool.query(`SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]);
    return rows && rows[0] && rows[0].c > 0;
  } catch (e) {
    return false;
  }
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
    converted.endereco = row.endereco;
    converted.telefone = row.telefone;
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

const storageBackend = require('../lib/storage_backend');

// GET /storage/:entity - retorna todos os registros da entidade
router.get('/:entity', async (req, res) => {
  try {
    const entity = req.params.entity;
    // if DB unavailable, always use adapter (filesystem fallback)
    const dbOk = await storageBackend.dbAvailable();
    if (!dbOk) {
      const item = await storageBackend.getKey(entity);
      if (!item) return res.json({ key: entity, value: null });
      return res.json(item);
    }
    const table = getTableName(entity);
    let exists = false;
    try { exists = await tableExists(table); } catch (e) { exists = false; }
    if (!exists) {
      const item = await storageBackend.getKey(entity);
      if (!item) return res.json({ key: entity, value: null });
      return res.json(item);
    }

    const pool = getPool();
    const [rows] = pool ? await pool.query(`SELECT * FROM ${table} ORDER BY last_modified DESC`) : [ [] ];
    const convertedRows = (rows || []).map(row => convertRowToFrontend(row, table));
    res.json(convertedRows);
  } catch (err) {
    console.error('storage get route error:', err);
    // fallback to filesystem adapter on DB auth/availability errors
    try {
      const item = await storageBackend.getKey(req.params.entity);
      if (!item) return res.json({ key: req.params.entity, value: null });
      return res.json(item);
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /storage/:entity - salva um registro na entidade
router.post('/:entity', async (req, res) => {
  try {
    const entity = req.params.entity;
    const data = req.body;
    // if DB unavailable, use adapter
    const dbOk = await storageBackend.dbAvailable();
    if (!dbOk) {
      const item = await storageBackend.setKey(entity, data);
      return res.json({ success: true, key: item.key, last_modified: item.last_modified });
    }
    const table = getTableName(entity);

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    let exists = false;
    try { exists = await tableExists(table); } catch (e) { exists = false; }
    if (!exists) {
      // upsert into client_storage using key = entity (db or filesystem fallback)
      const item = await storageBackend.setKey(entity, data);
      return res.json({ success: true, key: item.key, last_modified: item.last_modified });
    }

    const dbData = convertToDatabase(data, table);
    const columns = Object.keys(dbData);
    const values = Object.values(dbData);
    const placeholders = columns.map(() => '?').join(', ');

    const pool = getPool();
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;
    if (!pool) throw new Error('Database pool not available');
    await pool.query(query, values);
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('storage post route error:', err);
    // fallback to adapter
    try {
      const item = await storageBackend.setKey(req.params.entity, req.body);
      return res.json({ success: true, key: item.key, last_modified: item.last_modified });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

// PUT /storage/:entity/:id - atualiza um registro específico
router.put('/:entity/:id', async (req, res) => {
  try {
    const entity = req.params.entity;
    const id = req.params.id;
    const data = req.body;
    const dbOk = await storageBackend.dbAvailable();
    const table = getTableName(entity);

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    let exists = false;
    try { exists = await tableExists(table); } catch (e) { exists = false; }
    if (!exists || !dbOk) {
      // update client_storage entry (db or filesystem fallback)
      const current = await storageBackend.getKey(entity);
      if (!current) return res.status(404).json({ error: 'Record not found' });
      await storageBackend.setKey(entity, data);
      return res.json({ success: true });
    }

    const dbData = convertToDatabase(data, table);
    dbData.id = id; // Ensure ID is set

    const columns = Object.keys(dbData).filter(col => col !== 'id');
    const values = columns.map(col => dbData[col]);
    values.push(id); // Add ID for WHERE clause

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

    const pool = getPool();
    if (!pool) throw new Error('Database pool not available');
    const [result] = await pool.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('storage put route error:', err);
    try {
      await storageBackend.setKey(req.params.entity, req.body);
      return res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

// DELETE /storage/:entity/:id - deleta um registro específico
router.delete('/:entity/:id', async (req, res) => {
  try {
    const entity = req.params.entity;
    const id = req.params.id;
    const table = getTableName(entity);
    const dbOk = await storageBackend.dbAvailable();
    let exists = false;
    try { exists = await tableExists(table); } catch (e) { exists = false; }
    if (!exists || !dbOk) {
      // delete a client_storage key (db or filesystem fallback)
      const ok = await storageBackend.deleteKey(entity);
      if (!ok) return res.status(404).json({ error: 'Record not found' });
      return res.json({ success: true });
    }

    const pool = getPool();
    if (!pool) throw new Error('Database pool not available');
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('storage delete route error:', err);
    try {
      const ok = await storageBackend.deleteKey(req.params.entity);
      if (!ok) return res.status(404).json({ error: 'Record not found' });
      return res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

// GET /storage/:entity/search - busca registros com filtros
router.get('/:entity/search', async (req, res) => {
  try {
    const entity = req.params.entity;
    const dbOk = await storageBackend.dbAvailable();
    const table = getTableName(entity);
    const { q, ...filters } = req.query;

    let query = `SELECT * FROM ${table} WHERE 1=1`;
    const params = [];

    // Add search query
    if (q) {
      const searchFields = {
        pacientes: ['nome', 'cpf', 'sus'],
        especialistas: ['nome', 'especialidade', 'conselho'],
        agendamentos: ['paciente_nome', 'especialista_nome', 'especialidade']
      };

      const fields = searchFields[entity] || ['nome'];
      const searchConditions = fields.map(field => `${field} LIKE ?`).join(' OR ');
      query += ` AND (${searchConditions})`;
      params.push(...fields.map(() => `%${q}%`));
    }

    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        // Convert frontend field names to database column names
        let dbKey = key;
        if (table === 'especialistas' && key === 'vagasManha') dbKey = 'vagas_manha';
        if (table === 'especialistas' && key === 'vagasTarde') dbKey = 'vagas_tarde';
        if (table === 'clinica_config' && key === 'nomeClinica') dbKey = 'nome_clinica';

        query += ` AND ${dbKey} = ?`;
        params.push(value);
      }
    });

    query += ' ORDER BY last_modified DESC';
    let exists = false;
    try { exists = await tableExists(table); } catch (e) { exists = false; }
    if (!exists || !dbOk) {
      // for client_storage, use adapter to search or return all
      if (q) {
        const all = await storageBackend.listAll();
        const filtered = all.filter(i => i.key && i.key.includes(q));
        return res.json(filtered);
      }
      const all = await storageBackend.listAll();
      return res.json(all);
    }

    const pool = getPool();
    if (!pool) throw new Error('Database pool not available');
    const [rows] = await pool.query(query, params);

    // Convert rows to frontend format
    const convertedRows = rows.map(row => convertRowToFrontend(row, table));

    res.json(convertedRows);
  } catch (err) {
    console.error('storage search route error:', err);
    try {
      const all = await storageBackend.listAll();
      return res.json(all);
    } catch (e) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
