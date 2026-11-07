// Socket.IO rooms (handoff section 5): events only reach the people allowed to see them.
export const rooms = Object.freeze({
  user: (id) => `user:${id}`,
  vendor: (id) => `vendor:${id}`,
  rider: (id) => `rider:${id}`,
  order: (id) => `order:${id}`,
  adminLiveMap: 'admin:live-map',
});
