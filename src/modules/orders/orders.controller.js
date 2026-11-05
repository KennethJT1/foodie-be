import { respond } from '../../core/http/index.js';
import * as checkout from '../checkout/checkout.service.js';
import * as adminPayments from '../payments/adminPayments.service.js';
import * as orders from './orders.service.js';
import * as sales from './vendorSales.service.js';

export const quote = async (req, res) => respond.ok(res, await checkout.quote(req.user, req.body));
export const initializePayment = async (req, res) =>
  respond.ok(res, await checkout.initializePayment(req.user, req.body));
export const verifyPayment = async (req, res) => respond.ok(res, await checkout.verifyPayment(req.user, req.body));
export const myPayments = async (req, res) =>
  respond.paginated(res, await checkout.listMyPayments(req.user, req.query));

export const listOrders = async (req, res) => respond.paginated(res, await orders.listOrders(req.user, req.query));
export const getOrder = async (req, res) => respond.ok(res, await orders.getOrder(req.user, req.params.id));
export const cancelOrder = async (req, res) =>
  respond.ok(res, await orders.cancelOrder(req.user, req.params.id, req.body));
export const vendorMove = (action) => async (req, res) =>
  respond.ok(res, await orders.vendorMove(req.user, req.params.id, action));
export const rejectOrder = async (req, res) =>
  respond.ok(res, await orders.vendorReject(req.user, req.params.id, req.body));

export const stats = async (req, res) => respond.ok(res, await sales.stats(req.user, req.query));
export const vendorSales = async (req, res) => respond.paginated(res, await sales.sales(req.user, req.query));
export const dailySales = async (req, res) => respond.ok(res, await sales.dailySales(req.user, req.query));

export const listCustomers = async (req, res) => respond.paginated(res, await adminPayments.listCustomers(req.query));
export const setCustomerStatus = async (req, res) =>
  respond.ok(res, await adminPayments.setCustomerStatus(req.user, req.params.id, req.body, req));
export const listPayments = async (req, res) => respond.paginated(res, await adminPayments.listPayments(req.query));
export const reconcilePayment = async (req, res) =>
  respond.ok(res, await adminPayments.reconcilePayment(req.user, req.params.id, req.body, req));
