import { respond } from '../../core/http/index.js';
import * as service from './notifications.service.js';

export const list = async (req, res) => respond.paginated(res, await service.listNotifications(req.user.id, req.query));

export const unreadCount = async (req, res) => respond.ok(res, await service.unreadCount(req.user.id));

export const markRead = async (req, res) => respond.ok(res, await service.markRead(req.user.id, req.params.id));

export const markAllRead = async (req, res) => respond.ok(res, await service.markAllRead(req.user.id));
