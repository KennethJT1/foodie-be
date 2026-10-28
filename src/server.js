import { env } from './config/env.js';
import app from './app.js';
import { connectDatabase, sequelize } from './db/index.js';
import './integrations/cloudinary/cloudinary.client.js';

const start = async () => {
  await connectDatabase();
  console.log(`MySQL connected (${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME})`);

  const server = app.listen(env.PORT, () => {
    console.log(`KJT Foodie API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
