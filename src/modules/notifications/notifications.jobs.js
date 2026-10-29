import { sendEmail } from '../../integrations/email/email.client.js';
import { sendSms } from '../../integrations/termii/termii.client.js';
import { createNotification } from './notifications.service.js';

// Processors for the `notifications` queue, by job name. Each is safe to run twice.
export const notificationProcessors = {
  'sms.send': ({ to, text }) => sendSms({ to, text }),
  'email.send': ({ to, subject, text }) => sendEmail({ to, subject, text }),
  'inapp.create': async (data) => ({ id: (await createNotification(data)).id }),
};
