import { describe, expect, it } from '@jest/globals';
import { cursorMeta, parseCursor } from '../../../../src/core/query/cursor.js';
import { pageMeta } from '../../../../src/core/query/paginate.js';

describe('pageMeta', () => {
  it('builds the standard meta', () => {
    expect(pageMeta({ page: 2, limit: 20, total: 134 })).toEqual({
      page: 2,
      limit: 20,
      total: 134,
      totalPages: 7,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it('has one page when empty', () => {
    expect(pageMeta({ page: 1, limit: 20, total: 0 })).toMatchObject({
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });
});

describe('cursor', () => {
  it('parses cursor and limit (default 10, max 50)', () => {
    expect(parseCursor({})).toEqual({ offset: 0, limit: 10 });
    expect(parseCursor({ cursor: '20', limit: '15' })).toEqual({ offset: 20, limit: 15 });
    expect(parseCursor({ limit: '500' }).limit).toBe(50);
  });

  it('starts from the top for a bad cursor', () => {
    expect(parseCursor({ cursor: '-5' }).offset).toBe(0);
    expect(parseCursor({ cursor: 'abc' }).offset).toBe(0);
    expect(parseCursor({ cursor: ['10'] }).offset).toBe(0);
  });

  it('nextCursor is the next offset, null at the end', () => {
    expect(cursorMeta({ offset: 0, limit: 10, total: 134 })).toMatchObject({ nextCursor: '10', limit: 10, total: 134 });
    expect(cursorMeta({ offset: 130, limit: 10, total: 134 }).nextCursor).toBeNull();
    expect(cursorMeta({ offset: 0, limit: 10, total: 10 }).nextCursor).toBeNull();
  });

  it('accepts page instead of cursor and reports page / totalPages', () => {
    expect(parseCursor({ page: '3', limit: '12' })).toEqual({ offset: 24, limit: 12 });
    expect(parseCursor({ page: 'x' })).toEqual({ offset: 0, limit: 10 });
    expect(parseCursor({ page: '3', cursor: '5' }).offset).toBe(5);
    expect(cursorMeta({ offset: 24, limit: 12, total: 30 })).toMatchObject({
      page: 3,
      totalPages: 3,
      hasNextPage: false,
      hasPrevPage: true,
    });
    expect(cursorMeta({ offset: 0, limit: 12, total: 0 })).toMatchObject({ page: 1, totalPages: 1 });
  });
});
