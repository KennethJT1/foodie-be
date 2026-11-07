import { z } from 'zod';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../db/models/supportTicket.model.js';

// Lengths are checked after trimming in the service, with the mock's messages
export const ticketBody = z.looseObject({
  subject: z.string().max(500).optional(),
  body: z.string().max(5000).optional(),
  orderId: z.string().max(64).nullish(),
});

export const messageBody = z.looseObject({ body: z.string().max(5000).optional() });

export const agentMessageBody = z.looseObject({
  body: z.string().max(5000).optional(),
  internal: z.boolean().optional(),
});

export const updateTicketBody = z.object({
  status: z.enum(TICKET_STATUSES, { error: 'Pick a status' }).optional(),
  priority: z.enum(TICKET_PRIORITIES, { error: 'Pick a priority' }).optional(),
  assigneeId: z.string().max(64).nullable().optional(),
});
