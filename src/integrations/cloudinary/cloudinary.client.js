import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const cloudinaryFolder = env.CLOUDINARY_UPLOAD_FOLDER;

// Confirms the credentials are valid (used by /health/ready)
export const pingCloudinary = () => cloudinary.api.ping();

export default cloudinary;
