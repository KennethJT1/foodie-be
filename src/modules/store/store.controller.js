import { respond } from '../../core/http/index.js';
import * as menu from './menu.service.js';
import * as store from './store.service.js';

export const listMenu = async (req, res) => respond.paginated(res, await menu.listMenu(req.user, req.query));
export const createMenuItem = async (req, res) => respond.created(res, await menu.createMenuItem(req.user, req.body));
export const getMenuItem = async (req, res) => respond.ok(res, await menu.getMenuItem(req.user, req.params.id));
export const updateMenuItem = async (req, res) =>
  respond.ok(res, await menu.updateMenuItem(req.user, req.params.id, req.body));
export const deleteMenuItem = async (req, res) => {
  await menu.deleteMenuItem(req.user, req.params.id);
  respond.noContent(res);
};

export const getStore = async (req, res) => respond.ok(res, await store.getStore(req.user));
export const updateStore = async (req, res) => respond.ok(res, await store.updateStore(req.user, req.body));
export const requestBankChange = async (req, res) =>
  respond.ok(res, await store.requestBankChange(req.user, req.body, req));

export const listStaff = async (req, res) => respond.ok(res, await store.listStaff(req.user));
export const addStaff = async (req, res) => respond.created(res, await store.addStaff(req.user, req.body));
export const removeStaff = async (req, res) => {
  await store.removeStaff(req.user, req.params.id);
  respond.noContent(res);
};
