import { respond } from '../../core/http/index.js';
import * as refunds from './refunds.service.js';

export const listRefunds = async (req, res) => respond.paginated(res, await refunds.listRefunds(req.user, req.query));
export const getRefund = async (req, res) => respond.ok(res, await refunds.getRefund(req.user, req.params.id));
export const createRefund = async (req, res) => respond.created(res, await refunds.createRefund(req.user, req.body));
export const confirmRefund = async (req, res) => respond.ok(res, await refunds.confirmRefund(req.user, req.params.id));
export const disputeRefund = async (req, res) =>
  respond.ok(res, await refunds.disputeRefund(req.user, req.params.id, req.body));
export const respondToRefund = async (req, res) =>
  respond.ok(res, await refunds.respondToRefund(req.user, req.params.id, req.body));
export const markRefundPaid = async (req, res) =>
  respond.ok(res, await refunds.markRefundPaid(req.user, req.params.id, req.body));
export const addComment = async (req, res) =>
  respond.ok(res, await refunds.addComment(req.user, req.params.id, req.body));
export const escalateRefund = async (req, res) =>
  respond.ok(res, await refunds.escalateRefund(req.user, req.params.id, req.body, req));
