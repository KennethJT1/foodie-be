import multer from 'multer';
import { BadRequestError, PayloadTooLargeError } from '../../core/errors/index.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
}).single('file');

/** Multipart `file` (kept in memory, max 8 MB) + text fields into req.body. */
export const parseUpload = (req, res, next) =>
  parser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE')
      return next(new PayloadTooLargeError('That file is too large. The limit is 8 MB.'));
    if (err instanceof multer.MulterError) return next(new BadRequestError('Send one file in the "file" field.'));
    next(new BadRequestError("We couldn't read that upload. Please try again."));
  });
