import { NotFoundError } from '../errors/index.js';

// Unknown routes get the same friendly 404 as missing resources
export const notFound = (req, res, next) => {
  next(new NotFoundError());
};
