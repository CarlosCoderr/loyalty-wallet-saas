import express from 'express';
import cors from 'cors';
import { env } from './env.js';

const app = express();

app.use(cors());
app.use(express.json());

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Loyalty SaaS API Multi-Tenant' });
});

app.listen(env.PORT, () => {
  console.log(`🚀 API Server corriendo en http://localhost:${env.PORT}`);
});
