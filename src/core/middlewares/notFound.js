import { NotFoundError } from '../errors/index.js';

export const notFound = (req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};
