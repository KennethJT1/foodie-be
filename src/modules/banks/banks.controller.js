import { respond } from '../../core/http/index.js';
import * as banks from './banks.service.js';

export const list = async (req, res) => respond.ok(res, await banks.listBanks());
export const resolve = async (req, res) => respond.ok(res, await banks.resolveAccount(req.user, req.body));
