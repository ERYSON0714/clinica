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

// GET /storage/:entity - retorna todos os registros da entidade
router.get('/:entity', async (req, res) => {
  try {
    const entity = req.params.entity;
    const table = getTableName(entity);

    const [rows] = await pool.query(`SELECT * FROM ${table} ORDER BY last_modified DESC`);

    // Convert rows to frontend format
    const convertedRows = rows.map(row => convertRowToFrontend(row, table));

    res.json(convertedRows);
  } catch (err) {
    console.error('storage get route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /storage/:entity - salva um registro na entidade
router.post('/:entity', async (req, res) => {
  try {
    const entity = req.params.entity;
    const table = getTableName(entity);
    const data = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    const dbData = convertToDatabase(data, table);

    // Build INSERT query dynamically
    const columns = Object.keys(dbData);
    const values = Object.values(dbData);
    const placeholders = columns.map(() => '?').join(', ');

    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                   ON DUPLICATE KEY UPDATE ${columns.map(col => `${col} = VALUES(${col})`).join(', ')}`;

    await pool.query(query, values);
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('storage post route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /storage/:entity/:id - atualiza um registro específico
router.put('/:entity/:id', async (req, res) => {
  try {
    const entity = req.params.entity;
    const id = req.params.id;
    const table = getTableName(entity);
    const data = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object required' });
    }

    const dbData = convertToDatabase(data, table);
    dbData.id = id; // Ensure ID is set

    // Build UPDATE query dynamically
    const columns = Object.keys(dbData).filter(col => col !== 'id');
    const values = columns.map(col => dbData[col]);
    values.push(id); // Add ID for WHERE clause

    const setClause = columns.map(col => `${col} = ?`).join(', ');
    const query = `UPDATE ${table} SET ${setClause} WHERE id = ?`;

    const [result] = await pool.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('storage put route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /storage/:entity/:id - deleta um registro específico
router.delete('/:entity/:id', async (req, res) => {
  try {
    const entity = req.params.entity;
    const id = req.params.id;
    const table = getTableName(entity);

    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('storage delete route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /storage/:entity/search - busca registros com filtros
router.get('/:entity/search', async (req, res) => {
  try {
    const entity = req.params.entity;
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

    const [rows] = await pool.query(query, params);

    // Convert rows to frontend format
    const convertedRows = rows.map(row => convertRowToFrontend(row, table));

    res.json(convertedRows);
  } catch (err) {
    console.error('storage search route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
