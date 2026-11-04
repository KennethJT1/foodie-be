import { respond } from '../../core/http/index.js';
import * as adminRiders from './adminRiders.service.js';
import * as onboarding from './onboarding.service.js';

export const getOnboarding = async (req, res) => respond.ok(res, await onboarding.getOnboarding(req.user));
export const saveStep = async (req, res) => respond.ok(res, await onboarding.saveStep(req.user, req.body));
export const submit = async (req, res) => respond.ok(res, await onboarding.submit(req.user));
export const attachDocument = async (req, res) =>
  respond.created(res, await onboarding.attachDocument(req.user, req.body));
export const removeDocument = async (req, res) => {
  await onboarding.removeDocument(req.user, req.params.id);
  respond.noContent(res);
};
export const getProfile = async (req, res) => respond.ok(res, await onboarding.getProfile(req.user));

export const listRiders = async (req, res) => respond.paginated(res, await adminRiders.listRiders(req.query));
export const getRider = async (req, res) => respond.ok(res, await adminRiders.riderDetail(req.params.id));
export const decide = (action) => async (req, res) =>
  respond.ok(res, await adminRiders.decideRider(req.user, req.params.id, action, req.body, req));
