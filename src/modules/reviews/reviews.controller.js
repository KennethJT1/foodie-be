import { respond } from '../../core/http/index.js';
import * as reviews from './reviews.service.js';

export const listReviews = async (req, res) => respond.paginated(res, await reviews.listReviews(req.query));
export const createReview = async (req, res) =>
  respond.created(res, await reviews.createReview(req.user, req.params.id, req.body));
export const replyToReview = async (req, res) =>
  respond.ok(res, await reviews.replyToReview(req.user, req.params.id, req.body));
