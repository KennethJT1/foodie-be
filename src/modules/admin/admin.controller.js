import { respond } from '../../core/http/index.js';
import * as adminUsers from './adminUsers.service.js';
import * as roles from './roles.service.js';

export const listAdmins = async (req, res) => respond.paginated(res, await adminUsers.listAdmins(req.query));
export const createAdmin = async (req, res) => respond.created(res, await adminUsers.createAdmin(req.body));
export const updateAdmin = async (req, res) =>
  respond.ok(res, await adminUsers.updateAdmin(req.user, req.params.id, req.body));

export const listRoles = async (req, res) => respond.ok(res, await roles.listRoles());
export const updateRole = async (req, res) => respond.ok(res, await roles.updateRole(req.params.id, req.body));
export const resetRole = async (req, res) => respond.ok(res, await roles.resetRole(req.params.id));
