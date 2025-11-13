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
app.listen(port, () => console.log(`Clinica backend running on http://localhost:${port}`));
