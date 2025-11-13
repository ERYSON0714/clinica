#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');

async function check() {
  const conf = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clinica',
    ssl: process.env.DB_SSL === 'true' ? {} : false,
    connectTimeout: 5000
  };

  console.log('DB check config:', { host: conf.host, port: conf.port, user: conf.user, database: conf.database, ssl: !!conf.ssl });

  try {
    const pool = mysql.createPool(conf);
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('DB_OK', rows && rows[0]);
    await pool.end();
    process.exit(0);
  } catch (e) {
    console.error('DB_ERR', e && e.message);
    process.exit(2);
  }
}

check();
