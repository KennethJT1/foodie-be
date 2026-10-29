import { respond } from '../../core/http/index.js';
import * as uploads from './uploads.service.js';

export const create = async (req, res) =>
  respond.created(res, await uploads.createUpload(req.user, req.body, req.file));
