import { randomUUID } from 'node:crypto';

const VALID_ID = /^[\w-]{8,64}$/;

// Reuses a sane incoming X-Request-Id (e.g. from a load balancer) or creates one
export const requestId = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
