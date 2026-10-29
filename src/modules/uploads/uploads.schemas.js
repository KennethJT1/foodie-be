import { z } from 'zod';
import { UPLOAD_PURPOSES } from '../../db/models/upload.model.js';

export const uploadBody = z.object({
  purpose: z.enum(UPLOAD_PURPOSES, { error: 'Pick what the file is for' }),
});
