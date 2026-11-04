import { z } from 'zod';

// Plan choices are checked against the plans table in the service (422 planId / interval)
export const planChoiceBody = z.looseObject({});

export const verifyBody = z.object({
  reference: z.string({ error: 'Missing payment reference' }).trim().min(1, 'Missing payment reference').max(64),
});

// PlanInput: partial on PATCH; the service validates against the current plan
export const planBody = z.looseObject({});

export const extendBody = z.object({
  days: z
    .number({ error: 'Between 1 and 365 days' })
    .int('Between 1 and 365 days')
    .min(1, 'Between 1 and 365 days')
    .max(365, 'Between 1 and 365 days'),
  reason: z.string({ error: 'Give a reason' }).trim().min(1, 'Give a reason').max(300, 'Keep it under 300 characters'),
});
