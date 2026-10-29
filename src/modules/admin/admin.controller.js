import { respond } from '../../core/http/index.js';
import * as auditLog from '../audit/audit.service.js';
import * as settings from '../settings/settings.service.js';
import * as adminUsers from './adminUsers.service.js';
import * as roles from './roles.service.js';

export const listAdmins = async (req, res) => respond.paginated(res, await adminUsers.listAdmins(req.query));
export const createAdmin = async (req, res) =>
  respond.created(res, await adminUsers.createAdmin(req.user, req.body, req));
export const updateAdmin = async (req, res) =>
  respond.ok(res, await adminUsers.updateAdmin(req.user, req.params.id, req.body, req));

export const listRoles = async (req, res) => respond.ok(res, await roles.listRoles());
export const updateRole = async (req, res) =>
  respond.ok(res, await roles.updateRole(req.user, req.params.id, req.body, req));
export const resetRole = async (req, res) => respond.ok(res, await roles.resetRole(req.user, req.params.id, req));

export const listAuditLog = async (req, res) => respond.paginated(res, await auditLog.listAuditLog(req.query));

export const getSettings = async (req, res) => respond.ok(res, await settings.getSettings());
export const updateSettings = async (req, res) =>
  respond.ok(res, await settings.updateSettings(req.user, req.body, req));
