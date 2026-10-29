import { respond } from '../../core/http/index.js';
import * as service from './addresses.service.js';

export const list = async (req, res) => respond.ok(res, await service.listAddresses(req.user.id));

export const create = async (req, res) => respond.created(res, await service.createAddress(req.user.id, req.body));

export const update = async (req, res) =>
  respond.ok(res, await service.updateAddress(req.user.id, req.params.id, req.body));

export const setDefault = async (req, res) =>
  respond.ok(res, await service.setDefaultAddress(req.user.id, req.params.id));

// The contract returns 200 { id, deleted: true } here (not the usual 204), like the mock
export const remove = async (req, res) => respond.ok(res, await service.deleteAddress(req.user.id, req.params.id));
