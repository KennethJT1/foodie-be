import cloudinary, { cloudinaryFolder } from './cloudinary.client.js';

/**
 * File storage on Cloudinary. An object so tests can replace `put` / `signedUrl` without a
 * network call. Private files (`type: 'private'`) can only be read through signed URLs.
 */
export const storage = {
  /** Stores `buffer`; returns { publicId, url } (url is null for private files: sign one instead). */
  put(buffer, { folder, resourceType, isPrivate }) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${cloudinaryFolder}/${folder}`,
            resource_type: resourceType,
            type: isPrivate ? 'private' : 'upload',
          },
          (err, result) =>
            err ? reject(err) : resolve({ publicId: result.public_id, url: isPrivate ? null : result.secure_url }),
        )
        .end(buffer);
    });
  },

  /** A download URL for a private file that stops working after `expiresInSec`. */
  signedUrl(publicId, { resourceType, format, expiresInSec }) {
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: 'private',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
    });
  },
};
