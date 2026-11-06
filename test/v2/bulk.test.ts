// Quy ước chung của các route chọn nhiều: 1–200 phần tử, không trùng, mỗi phần tử một kết quả done hoặc failed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BULK_MAX, BadRequestError, ConflictError, bulkFailureOf, requireBulkIds, requireBulkItems, runBulk } from '../../src/common';

const invalid = (e: unknown) => e instanceof BadRequestError && e.details?.code === 'INVALID_IDS';

describe('requireBulkIds', () => {
  it('accepts 1 to 200 distinct non-empty strings and trims them', () => {
    assert.deepEqual(requireBulkIds(['a', ' b ']), ['a', 'b']);
    assert.equal(requireBulkIds(Array.from({ length: BULK_MAX }, (_, i) => `id${i}`)).length, BULK_MAX);
  });

  it('refuses empty, over-long, wrong-typed and duplicate lists with INVALID_IDS', () => {
    for (const bad of [[], undefined, null, 'a', { 0: 'a' }, [1], [''], ['a', ' '], ['a', 'a'], ['a', ' a '], Array.from({ length: BULK_MAX + 1 }, (_, i) => `id${i}`)]) {
      assert.throws(() => requireBulkIds(bad), invalid, JSON.stringify(bad)?.slice(0, 40));
    }
  });
});

describe('requireBulkItems', () => {
  const keyOf = (item: any) => (typeof item.employeeId === 'string' && typeof item.date === 'string' ? `${item.employeeId}|${item.date}` : null);

  it('accepts distinct objects the key function understands', () => {
    const items = [{ employeeId: 'a', date: '2026-11-01' }, { employeeId: 'a', date: '2026-11-02' }];
    assert.deepEqual(requireBulkItems(items, keyOf), items);
  });

  it('refuses an element without a key, a non-object, a duplicate key, or a bad list size', () => {
    for (const bad of [[], [null], ['x'], [{ employeeId: 'a' }], [{ employeeId: 'a', date: 'd' }, { employeeId: 'a', date: 'd' }], undefined]) {
      assert.throws(() => requireBulkItems(bad, keyOf), invalid);
    }
  });
});

describe('runBulk', () => {
  const failureOf = (err: unknown) => ({ code: (err as any).code ?? 'ERR', message: (err as Error).message });

  it('runs in order, collects done and failed, and one failure does not stop the others', async () => {
    const order: string[] = [];
    const out = await runBulk(
      ['a', 'b', 'c'],
      id => id,
      async id => {
        order.push(id);
        if (id === 'b') throw Object.assign(new Error('Hỏng b'), { code: 'BOOM' });
        return { id, ok: true };
      },
      failureOf
    );
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.deepEqual(out.done, [{ id: 'a', ok: true }, { id: 'c', ok: true }]);
    assert.deepEqual(out.failed, [{ id: 'b', code: 'BOOM', message: 'Hỏng b' }]);
  });
});

describe('bulkFailureOf', () => {
  it('reads the code of an HTTP error and falls back to BAD_REQUEST for a plain error', () => {
    assert.deepEqual(bulkFailureOf(new ConflictError('Kỳ đã khoá', { code: 'PERIOD_LOCKED' })), { code: 'PERIOD_LOCKED', message: 'Kỳ đã khoá' });
    assert.deepEqual(bulkFailureOf(new Error('Lý do')), { code: 'BAD_REQUEST', message: 'Lý do' });
  });
});
