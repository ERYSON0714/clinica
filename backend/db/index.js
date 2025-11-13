const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'clinica',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? {} : false
});

// Test connection and initialize database (call manually via initDb)
const initDb = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database.');

    // Create specific tables for each entity
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pacientes (
        id VARCHAR(255) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        nascimento DATE,
        cpf VARCHAR(14) UNIQUE,
        sus VARCHAR(19),
        bairro VARCHAR(255),
        setor VARCHAR(10),
        created_by VARCHAR(50) DEFAULT 'gestor',
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000),
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS especialistas (
        id VARCHAR(255) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        especialidade VARCHAR(255) NOT NULL,
        conselho VARCHAR(50),
        turno ENUM('manhã', 'tarde', 'ambos') DEFAULT 'manhã',
        vagas_manha INT DEFAULT 20,
        vagas_tarde INT DEFAULT 20,
        dias JSON,
        ativo BOOLEAN DEFAULT TRUE,
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000),
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS agendamentos (
        id VARCHAR(255) PRIMARY KEY,
        paciente_id VARCHAR(255),
        paciente_nome VARCHAR(255) NOT NULL,
        paciente_cpf VARCHAR(14),
        paciente_sus VARCHAR(19),
        especialista_id VARCHAR(255),
        especialista_nome VARCHAR(255) NOT NULL,
        especialidade VARCHAR(255) NOT NULL,
        data DATE NOT NULL,
        hora VARCHAR(10) NOT NULL,
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000),
        status ENUM('Pendente', 'Confirmado', 'Cancelado') DEFAULT 'Pendente',
        cancel_reason TEXT,
        agendado_por_gestor BOOLEAN DEFAULT FALSE,
        clinic_snapshot JSON,
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS clinica_config (
        id VARCHAR(50) PRIMARY KEY DEFAULT 'main_config',
        nome_clinica VARCHAR(255),
        endereco TEXT,
        telefone VARCHAR(20),
        setor VARCHAR(10),
        master_hash VARCHAR(255),
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS historico (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        actor VARCHAR(50) NOT NULL,
        timestamp BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000),
        summary TEXT,
        payload JSON,
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS comunicados (
        id VARCHAR(255) PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        mensagem TEXT NOT NULL,
        setor VARCHAR(10),
        created_at BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000),
        sync_status ENUM('pending', 'synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    // Generic key/value storage for frontend (localStorage bridge)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS client_storage (
        ` + "`key`" + ` VARCHAR(255) PRIMARY KEY,
        value TEXT,
        sync_status ENUM('pending','synced') DEFAULT 'pending',
        last_modified BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
      )
    `);

    // Create indexes for better performance
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_pacientes_cpf ON pacientes(cpf)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_pacientes_sus ON pacientes(sus)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_pacientes_setor ON pacientes(setor)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_especialistas_especialidade ON especialistas(especialidade)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos(data)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_cpf ON agendamentos(paciente_cpf)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_sync_status ON pacientes(sync_status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_sync_status_esp ON especialistas(sync_status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_sync_status_ag ON agendamentos(sync_status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_sync_status_hist ON historico(sync_status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_sync_status_com ON comunicados(sync_status)`);
    await connection.execute(`CREATE INDEX IF NOT EXISTS idx_client_storage_sync ON client_storage(sync_status)`);

    connection.release();
    console.log('Database tables initialized.');
  } catch (err) {
    console.error('Error initializing database:', err);
    // Don't exit process, just log error - allow app to run without DB for offline mode
  }
};

// Do not run initDb on import to avoid hard failures when DB credentials
// are missing or incorrect. Export initDb so the app can call it at startup.
module.exports = pool;
module.exports.initDb = initDb;
