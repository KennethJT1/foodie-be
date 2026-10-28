import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { loadOpenApiSpec } from './config/openapi.js';
import { errorHandler, generalRateLimit, notFound, requestId } from './core/middlewares/index.js';
import healthRoutes from './modules/health/health.routes.js';
import apiRoutes from './routes.js';

const app = express();

app.disable('x-powered-by');
// Behind a load balancer in production: trust its X-Forwarded-For for client IPs
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Global middleware chain (Backend Architecture, section 4) — order matters
app.use(requestId);
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  }),
);
app.use(compression());
// Paystack signatures are computed over the raw body, so it must not be JSON-parsed
app.use('/api/v1/webhooks/paystack', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    // Keep request logs to the fields support actually needs
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => req.url.startsWith('/health') },
  }),
);
app.use(generalRateLimit);

app.use('/health', healthRoutes);

const openApiSpec = loadOpenApiSpec();
app.get('/docs/openapi.json', (req, res) => res.json(openApiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'KJT Foodie API' }));

app.use('/api/v1', apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
