#!/usr/bin/env node
const pool = require('../db');

async function inspect() {
  const tables = ['setor','bairro','medico','vaga','historico_auditoria','especialidade'];
  for (const t of tables) {
    try {
      const [cols] = await pool.query(`SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [t]);
      console.log('---', t, '---');
      if (!cols || cols.length === 0) console.log('not found');
      else cols.forEach(c => console.log(c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT, c.EXTRA));
    } catch (e) {
      console.log(t, 'err', e.message);
    }
  }
  process.exit(0);
}

inspect();
