import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../../core/errors/index.js';
import { userFromAccessToken } from '../../core/middlewares/index.js';
import { QUEUES, getQueue } from '../../core/queue/index.js';

// Bull Board (Backend Architecture, section 6): super admins only. A browser can't send a Bearer
// header when opening a page, so /admin/queues?token=<access token> moves the token into an
// httpOnly cookie sent only to this path, then redirects to drop it from the URL. The token
// expires with the access token (15 min); open the link again with a fresh one.
export const BOARD_PATH = '/admin/queues';
const COOKIE = 'kjt_board';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: BOARD_PATH,
});

const requireSuperAdmin = async (req, res, next) => {
  try {
    const [scheme, bearer] = (req.get('Authorization') ?? '').split(' ');
    const fromLink = typeof req.query.token === 'string' ? req.query.token : null;
    const token = fromLink ?? (scheme === 'Bearer' ? bearer : req.cookies?.[COOKIE]);
    const user = await userFromAccessToken(token);
    if (user.role !== 'admin' || user.adminRole !== 'super_admin') throw new ForbiddenError();
    if (!fromLink) return next();
    res.cookie(COOKIE, fromLink, cookieOptions());
    res.redirect(`${BOARD_PATH}/`);
  } catch (err) {
    res.clearCookie(COOKIE, cookieOptions());
    next(err);
  }
};

/** Router for app.use(BOARD_PATH, …). Queues (and their Redis connection) open on the first visit. */
export const queueBoard = () => {
  let boardRouter;
  const board = () => {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(BOARD_PATH);
    createBullBoard({
      queues: Object.keys(QUEUES).map((name) => new BullMQAdapter(getQueue(name))),
      serverAdapter,
    });
    return serverAdapter.getRouter();
  };

  const router = Router();
  router.use(requireSuperAdmin, (req, res, next) => {
    boardRouter ??= board();
    boardRouter(req, res, next);
  });
  return router;
};
