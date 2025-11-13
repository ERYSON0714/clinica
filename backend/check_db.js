const pool = require('./db');

async function checkTable() {
  try {
    const [rows] = await pool.query('PRAGMA table_info(client_storage)');
    console.log('Estrutura da tabela client_storage:');
    console.log(rows);
  } catch (err) {
    console.error('Erro:', err.message);
  } finally {
    process.exit();
  }
}

checkTable();
