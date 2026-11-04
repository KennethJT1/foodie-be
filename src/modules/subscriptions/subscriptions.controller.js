import { respond } from '../../core/http/index.js';
import * as plans from './plans.service.js';
import * as subscriptions from './subscriptions.service.js';

export const listPlans = async (req, res) => respond.paginated(res, await plans.listPublicPlans());

export const getSubscription = async (req, res) => respond.ok(res, await subscriptions.getSubscription(req.user));
export const listInvoices = async (req, res) =>
  respond.paginated(res, await subscriptions.listInvoices(req.user, req.query));
export const startTrial = async (req, res) => respond.ok(res, await subscriptions.startTrial(req.user, req.body));
export const initialize = async (req, res) =>
  respond.ok(res, await subscriptions.initializePayment(req.user, req.body));
export const verify = async (req, res) => respond.ok(res, await subscriptions.verifyPayment(req.user, req.body, req));
export const change = async (req, res) => respond.ok(res, await subscriptions.scheduleChange(req.user, req.body));
export const cancel = async (req, res) => respond.ok(res, await subscriptions.setCancelAtPeriodEnd(req.user, true));
export const resume = async (req, res) => respond.ok(res, await subscriptions.setCancelAtPeriodEnd(req.user, false));

export const listAdminPlans = async (req, res) => respond.paginated(res, await plans.listAdminPlans());
export const createPlan = async (req, res) =>
  respond.created(res, (await plans.savePlan(req.user, null, req.body, req)).plan);
export const updatePlan = async (req, res) =>
  respond.ok(res, (await plans.savePlan(req.user, req.params.id, req.body, req)).plan);
export const listAdminSubscriptions = async (req, res) =>
  respond.paginated(res, await subscriptions.listAdminSubscriptions(req.query));
export const extend = async (req, res) =>
  respond.ok(res, await subscriptions.extendSubscription(req.user, req.params.id, req.body, req));
