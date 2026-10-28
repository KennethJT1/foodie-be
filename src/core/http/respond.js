// Success envelopes shared with the frontend mock API (Backend Architecture, section 5)
export const respond = {
  ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
  },

  created(res, data) {
    return respond.ok(res, data, 201);
  },

  // result comes from paginate() (offset) or a cursor helper: { data, meta }
  paginated(res, { data, meta }) {
    return res.status(200).json({ success: true, data, meta });
  },
};
