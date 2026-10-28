import express from 'express';
import { sequelize } from './db/index.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// Ready only when MySQL is reachable
app.get('/health/ready', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ success: true, data: { status: 'ready', mysql: 'up' } });
  } catch {
    res.status(503).json({ success: false, data: { status: 'not_ready', mysql: 'down' } });
  }
});

export default app;
