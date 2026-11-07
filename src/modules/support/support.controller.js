import { respond } from '../../core/http/index.js';
import * as support from './support.service.js';

export const listMyTickets = async (req, res) =>
  respond.paginated(res, await support.listMyTickets(req.user, req.query));
export const createTicket = async (req, res) => respond.created(res, await support.createTicket(req.user, req.body));
export const getMyTicket = async (req, res) => respond.ok(res, await support.getMyTicket(req.user, req.params.id));
export const replyToMyTicket = async (req, res) =>
  respond.ok(res, await support.replyToMyTicket(req.user, req.params.id, req.body));
export const resolveMyTicket = async (req, res) =>
  respond.ok(res, await support.resolveMyTicket(req.user, req.params.id));

export const listInbox = async (req, res) => respond.paginated(res, await support.listInbox(req.user, req.query));
export const getTicket = async (req, res) => respond.ok(res, await support.getTicket(req.params.id));
export const updateTicket = async (req, res) =>
  respond.ok(res, await support.updateTicket(req.user, req.params.id, req.body, req));
export const replyAsAgent = async (req, res) =>
  respond.ok(res, await support.replyAsAgent(req.user, req.params.id, req.body));
export const listAgents = async (req, res) => respond.ok(res, await support.listAgents());
