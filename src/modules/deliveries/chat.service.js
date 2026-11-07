// Customer–rider chat during a delivery. Reference: foodie-fe src/mocks/handlers/support.js.
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/index.js';
import { models, withTransaction } from '../../db/index.js';
import { emitAfterCommit } from '../../realtime/emit.js';
import { rooms } from '../../realtime/rooms.js';
import { notify } from '../notifications/notifications.service.js';

const { ChatMessage, Order, Rider } = models;

const OPEN_STATUSES = ['rider_assigned', 'picked_up'];

/** `chat:message` and the REST shape. */
export const toChatMessageDto = (m) => ({
  id: m.id,
  orderId: m.orderId,
  senderId: m.senderId,
  senderRole: m.senderRole,
  senderName: m.senderName,
  body: m.body,
  createdAt: m.createdAt.toISOString(),
});

/** The order when `user` is its customer or its assigned rider; anyone else gets a 404. */
const chatOrder = async (user, orderId, { transaction } = {}) => {
  const order = await Order.findByPk(orderId, { transaction });
  let party = false;
  if (order && user.role === 'customer') party = order.customerId === user.id;
  if (order && user.role === 'rider' && order.riderId) {
    const rider = await Rider.findOne({ where: { userId: user.id }, attributes: ['id'], transaction });
    party = rider?.id === order.riderId;
  }
  if (!party) throw new NotFoundError("We couldn't find that order.");
  return order;
};

/** GET /orders/{id}/chat: `{ isOpen, messages }`. */
export const getChat = async (user, orderId) => {
  const order = await chatOrder(user, orderId);
  const messages = await ChatMessage.findAll({ where: { orderId: order.id }, order: [['createdAt', 'ASC']] });
  return { isOpen: OPEN_STATUSES.includes(order.status), messages: messages.map(toChatMessageDto) };
};

/**
 * POST /orders/{id}/chat `{ body }`: only while the rider is on the way (409 after). The other
 * side gets an in-app notification and `chat:message` goes to the order's room and both people.
 */
export const sendMessage = async (user, orderId, { body }) => {
  const text = String(body ?? '').trim();
  if (!text) throw new ValidationError({ body: 'Write a message first' });
  if (text.length > 500) throw new ValidationError({ body: 'Keep it under 500 characters' });

  return withTransaction(async (transaction) => {
    const order = await chatOrder(user, orderId, { transaction });
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new ConflictError('INVALID_STATUS', 'Chat is only open while the order is on its way.');
    }
    const message = await ChatMessage.create(
      {
        orderId: order.id,
        senderId: user.id,
        senderRole: user.role,
        senderName: user.role === 'rider' ? user.name : user.firstName,
        body: text,
      },
      { transaction },
    );

    const rider = await Rider.findByPk(order.riderId, { attributes: ['id', 'userId'], transaction });
    const fromCustomer = user.role === 'customer';
    await notify(
      fromCustomer ? rider?.userId : order.customerId,
      {
        type: 'order',
        title: fromCustomer ? 'Message from your customer' : 'Message from your rider',
        body: text.slice(0, 80),
        link: fromCustomer ? '/rider/delivery' : `/account/orders/${order.id}`,
      },
      { transaction },
    );
    const dto = toChatMessageDto(message);
    // One emit to several rooms reaches each socket once
    emitAfterCommit(
      transaction,
      [rooms.order(order.id), rooms.user(order.customerId), ...(rider ? [rooms.user(rider.userId)] : [])],
      'chat:message',
      dto,
    );
    return dto;
  });
};
