import { respond } from '../../core/http/index.js';
import * as moderation from './moderation.service.js';
import * as social from './social.service.js';

export const feed = async (req, res) => respond.paginated(res, await social.feed(req.user, req.query));

export const like = async (req, res) => respond.ok(res, await social.setLike(req.user, req.params.id, true));
export const unlike = async (req, res) => respond.ok(res, await social.setLike(req.user, req.params.id, false));
export const myLikes = async (req, res) => respond.paginated(res, await social.listMyLikes(req.user, req.query));

export const follow = async (req, res) => respond.ok(res, await social.setFollow(req.user, req.params.id, true));
export const unfollow = async (req, res) => respond.ok(res, await social.setFollow(req.user, req.params.id, false));
export const myFollows = async (req, res) => respond.paginated(res, await social.listMyFollows(req.user, req.query));

export const listComments = async (req, res) =>
  respond.paginated(res, await social.listComments(req.user, req.params.id, req.query));
export const addComment = async (req, res) =>
  respond.created(res, await social.addComment(req.user, req.params.id, req.body));
export const editComment = async (req, res) =>
  respond.ok(res, await social.editComment(req.user, req.params.id, req.body));
export const deleteComment = async (req, res) => respond.ok(res, await social.deleteComment(req.user, req.params.id));

export const report = async (req, res) => {
  const { report: row, created } = await social.createReport(req.user, req.body);
  return created ? respond.created(res, row) : respond.ok(res, row);
};

export const engagement = async (req, res) => respond.ok(res, await moderation.engagement(req.user));
export const vendorComments = async (req, res) =>
  respond.paginated(res, await moderation.vendorComments(req.user, req.query));

export const listReports = async (req, res) => respond.paginated(res, await moderation.listReports(req.query));
export const resolveReport = async (req, res) =>
  respond.ok(res, await moderation.resolveReport(req.user, req.params.id, req.body, req));
