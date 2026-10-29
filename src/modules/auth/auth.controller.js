import { respond } from '../../core/http/index.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth.cookies.js';
import * as auth from './auth.service.js';
import { endSession, rotateSession } from './sessions.service.js';

const context = (req) => ({ ip: req.ip, userAgent: req.get('User-Agent') });

// Session endpoints set the refresh cookie and return { accessToken, user }
const sendSession = (res, { refreshToken, body }) => {
  setRefreshCookie(res, refreshToken);
  return respond.ok(res, body);
};

export const register = async (req, res) => respond.created(res, await auth.register(req.body));

export const login = async (req, res) => sendSession(res, await auth.login(req.body, context(req)));

export const requestOtp = async (req, res) => respond.ok(res, await auth.requestOtp(req.body));

export const verifyOtp = async (req, res) => sendSession(res, await auth.verifyOtp(req.body, context(req)));

export const google = async (req, res) => sendSession(res, await auth.googleSignIn(req.body, context(req)));

export const refresh = async (req, res) => {
  try {
    return sendSession(res, await rotateSession(readRefreshCookie(req), context(req)));
  } catch (err) {
    // Any refusal means "signed out": drop the cookie so the browser stops sending it
    clearRefreshCookie(res);
    throw err;
  }
};

export const logout = async (req, res) => {
  await endSession(readRefreshCookie(req));
  clearRefreshCookie(res);
  return respond.noContent(res);
};

export const forgotPassword = async (req, res) => respond.ok(res, await auth.forgotPassword(req.body));

export const resetPassword = async (req, res) => respond.ok(res, await auth.resetPassword(req.body));
