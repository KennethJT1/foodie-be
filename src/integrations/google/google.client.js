import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { UnauthenticatedError } from '../../core/errors/index.js';

const client = new OAuth2Client();

/**
 * Verifies a Google Identity Services ID token (signature, expiry, audience = our client id).
 * An object so tests can replace `verifyIdToken` without a network call.
 */
export const google = {
  async verifyIdToken(credential) {
    if (!env.GOOGLE_CLIENT_ID) throw new UnauthenticatedError('UNAUTHENTICATED', "Google sign-in isn't set up yet.");
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      return {
        googleId: p.sub,
        email: p.email?.toLowerCase() ?? null,
        emailVerified: Boolean(p.email_verified),
        firstName: p.given_name ?? p.name?.split(' ')[0] ?? 'Google',
        lastName: p.family_name ?? p.name?.split(' ').slice(1).join(' ') ?? 'User',
        avatarUrl: p.picture ?? null,
      };
    } catch {
      throw new UnauthenticatedError('UNAUTHENTICATED', "We couldn't sign you in with Google. Please try again.");
    }
  },
};
