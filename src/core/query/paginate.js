// Runs a list query and builds the standard `meta` (05-backend-handoff.md, section 2 "Envelopes").

/** Offset-list meta; `page` is already clamped. */
export const pageMeta = ({ page, limit, total }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
};

/**
 * Counts, clamps `page` to the last page, then fetches that page.
 * `listQuery` comes from buildListQuery(); `options` adds find options such as `attributes` or
 * `transaction`. Returns `{ data, meta }` for respond.paginated(); map `data` to the API shape first.
 */
export const paginate = async (Model, listQuery, options = {}) => {
  const { where, order, include, limit } = listQuery;

  // distinct keeps hasMany includes from inflating the count
  const total = await Model.count({ where, include, distinct: true, col: 'id', ...options });
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(listQuery.page, totalPages);

  const data =
    total === 0 ? [] : await Model.findAll({ where, order, include, limit, offset: (page - 1) * limit, ...options });
  return { data, meta: pageMeta({ page, limit, total }) };
};
