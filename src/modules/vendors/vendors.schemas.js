import { z } from 'zod';

// Each wizard step sends its own fields; the service validates them per step
export const onboardingStepBody = z.looseObject({
  step: z.string({ error: 'Unknown step' }),
});

export const documentBody = z.object({
  type: z.string({ error: 'Pick which document this is' }).trim().min(1, 'Pick which document this is').max(40),
  url: z.string({ error: 'Add a photo or scan of the document' }).trim().min(1, 'Add a photo or scan of the document'),
});

export const idParams = z.object({ id: z.string().min(1).max(64) });

// Reject / suspend need a reason; approve / reinstate send nothing (the service checks per action)
export const decisionBody = z.looseObject({ reason: z.string().optional() });

export const bankChangeParams = z.object({ id: z.string().min(1).max(64), decision: z.string() });
