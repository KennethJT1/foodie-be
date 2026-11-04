import { respond } from '../../core/http/index.js';
import * as catalogue from './catalogue.service.js';

export const listCategories = async (req, res) => respond.paginated(res, await catalogue.listCategories(req.query));
export const listFoodItems = async (req, res) =>
  respond.paginated(res, await catalogue.listFoodItems(req.user, req.query));
export const getFoodItem = async (req, res) =>
  respond.ok(res, await catalogue.getFoodItem(req.user, req.params.id, req.query));
export const listVendors = async (req, res) => respond.paginated(res, await catalogue.listVendors(req.user, req.query));
export const getVendor = async (req, res) =>
  respond.ok(res, await catalogue.getVendor(req.user, req.params.slugOrId, req.query));
