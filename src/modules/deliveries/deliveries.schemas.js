import { z } from 'zod';

const coordinate = (max) => z.number().min(-max).max(max).optional();

export const statusBody = z.object({
  isOnline: z.boolean({ error: 'Say whether you are going online' }),
  lat: coordinate(90),
  lng: coordinate(180),
});

export const completeBody = z.object({
  code: z.string({ error: 'Enter the 4-digit code' }).regex(/^\d{4}$/, 'Enter the 4-digit code'),
});

export const reassignBody = z.object({
  riderId: z.string({ error: 'Pick a rider' }).trim().min(1, 'Pick a rider').max(64),
});

// Length and emptiness are checked in the service so the messages match the mock
export const chatBody = z.object({ body: z.string({ error: 'Write a message first' }).max(2000) });
