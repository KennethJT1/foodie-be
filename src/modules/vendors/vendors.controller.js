import { respond } from '../../core/http/index.js';
import * as adminVendors from './adminVendors.service.js';
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

export const listVendors = async (req, res) => respond.paginated(res, await adminVendors.listVendors(req.query));
export const getVendor = async (req, res) => respond.ok(res, await adminVendors.vendorDetail(req.params.id));
export const decide = (action) => async (req, res) =>
  respond.ok(res, await adminVendors.decideVendor(req.user, req.params.id, action, req.body, req));
export const decideBankChange = async (req, res) =>
  respond.ok(res, await adminVendors.decideBankChange(req.user, req.params.id, req.params.decision, req));
