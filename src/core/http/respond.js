// Success envelopes shared with the frontend mock API (05-backend-handoff.md, section 2 "Envelopes")
export const respond = {
  ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
  },

  created(res, data) {
    return respond.ok(res, data, 201);
  },

  // DELETE returns 204 with no body
  noContent(res) {
    return res.status(204).end();
  },

  // result comes from paginate() (offset) or a cursor helper: { data, meta }
  paginated(res, { data, meta }) {
    return res.status(200).json({ success: true, data, meta });
  },
};
