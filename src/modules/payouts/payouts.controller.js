import { respond } from '../../core/http/index.js';
import * as payouts from './payouts.service.js';

export const listTrips = async (req, res) => respond.paginated(res, await payouts.listTrips(req.user, req.query));
export const earnings = async (req, res) => respond.ok(res, await payouts.earnings(req.user));
export const listStatements = async (req, res) => respond.ok(res, await payouts.listStatements(req.user));

export const listPayouts = async (req, res) => respond.paginated(res, await payouts.listPayouts(req.query));
export const approvePayout = async (req, res) =>
  respond.ok(res, await payouts.approvePayout(req.user, req.params.id, req));
export const markPayoutPaid = async (req, res) =>
  respond.ok(res, await payouts.markPayoutPaid(req.user, req.params.id, req.body, req));
