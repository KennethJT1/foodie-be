import { respond } from '../../core/http/index.js';
import * as admin from './adminDispatch.service.js';
import * as chat from './chat.service.js';
import * as deliveries from './deliveries.service.js';

export const setStatus = async (req, res) => respond.ok(res, await deliveries.setStatus(req.user, req.body));
export const listOffers = async (req, res) => respond.ok(res, await deliveries.listOffers(req.user));
export const acceptOffer = async (req, res) => respond.ok(res, await deliveries.acceptOffer(req.user, req.params.id));
export const declineOffer = async (req, res) => respond.ok(res, await deliveries.declineOffer(req.user, req.params.id));
export const currentDelivery = async (req, res) => respond.ok(res, await deliveries.currentDelivery(req.user));
export const pickup = async (req, res) => respond.ok(res, await deliveries.pickup(req.user, req.params.id));
export const complete = async (req, res) =>
  respond.ok(res, await deliveries.complete(req.user, req.params.id, req.body));

export const getChat = async (req, res) => respond.ok(res, await chat.getChat(req.user, req.params.id));
export const sendMessage = async (req, res) =>
  respond.created(res, await chat.sendMessage(req.user, req.params.id, req.body));

export const liveMap = async (req, res) => respond.ok(res, await admin.liveMapSnapshot());
export const reassign = async (req, res) =>
  respond.ok(res, await admin.reassignOrder(req.user, req.params.id, req.body, req));
