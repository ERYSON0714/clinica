require('dotenv').config();
const express = require('express');
const cors = require('cors');
const healthRouter = require('./routes/health');
const tablesRouter = require('./routes/tables');
const storageRouter = require('./routes/storage');
const syncRouter = require('./routes/sync');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/tables', tablesRouter);
app.use('/storage', storageRouter);
app.use('/sync', syncRouter);

app.get('/', (req, res) => res.json({ ok: true, msg: 'Clinica backend minimal' }));

const port = process.env.PORT || 3000;

// Try to initialize DB in background; do not block server start.
try {
	const db = require('./db');
	if (db && typeof db.initDb === 'function') {
		db.initDb().then(() => console.log('DB init attempted')).catch(e => console.log('DB init error (non-fatal):', e && e.message));
	}
} catch (e) {
	console.log('DB module load skipped:', e && e.message);
}

app.listen(port, () => console.log(`Clinica backend running on http://localhost:${port}`));
