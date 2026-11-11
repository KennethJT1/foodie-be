import { respond } from '../../core/http/index.js';
import { clearRefreshCookie } from '../auth/auth.cookies.js';
import * as service from './users.service.js';

export const getMe = async (req, res) => respond.ok(res, await service.getMe(req.user));

export const updateMe = async (req, res) => respond.ok(res, await service.updateMe(req.user, req.body));

export const requestPhoneChange = async (req, res) =>
  respond.ok(res, await service.requestPhoneChange(req.user, req.body));

export const verifyPhoneChange = async (req, res) =>
  respond.ok(res, await service.verifyPhoneChange(req.user, req.body));

export const deleteMe = async (req, res) => {
  await service.deleteMe(req.user);
  clearRefreshCookie(res);
  return respond.noContent(res);
};
