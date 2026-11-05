import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAIN_START,
  canonicalOf,
  checkPage,
  finish,
  hashOf,
  type AuditChainRow,
  type StoredAuditRow
} from '../../src/modules/audit/domain/audit-chain';

// Dòng mẫu chưa băm.
function row(id: number, prevHash: string, over: Partial<AuditChainRow> = {}): AuditChainRow {
  return {
    id,
    prev_hash: prevHash,
    at: '2026-11-05T03:00:00.000Z',
    actor: 'admin',
    actor_uuid: null,
    actor_roles: null,
    action: 'param.set',
    entity_kind: 'param',
    entity_id: 'ot.rate',
    subject: null,
    subject_uuid: null,
    month: null,
    before_json: null,
    after_json: null,
    reason: null,
    sensitivity: 'normal',
    request_id: null,
    ...over
  };
}

// Dựng n dòng đã băm nối nhau.
function chain(n: number): StoredAuditRow[] {
  const rows: StoredAuditRow[] = [];
  let prev = '';
  for (let id = 1; id <= n; id += 1) {
    const base = row(id, prev);
    const hash = hashOf(base);
    rows.push({ ...base, hash });
    prev = hash;
  }
  return rows;
}

describe('canonicalOf', () => {
  it('lists every column but hash in the spec order', () => {
    assert.equal(
      canonicalOf(row(1, '')),
      JSON.stringify([1, '', '2026-11-05T03:00:00.000Z', 'admin', null, null, 'param.set', 'param', 'ot.rate', null, null, null, null, null, null, 'normal', null])
    );
  });

  it('keeps the stored JSON text verbatim', () => {
    const canonical = canonicalOf(row(1, '', { before_json: '{"b":1,"a":2}' }));
    assert.ok(canonical.includes('{\\"b\\":1,\\"a\\":2}'));
  });
});

describe('hashOf', () => {
  it('is sha256-prefixed and stable', () => {
    const r = row(1, '');
    assert.match(hashOf(r), /^sha256:[0-9a-f]{64}$/);
    assert.equal(hashOf(r), hashOf(r));
    assert.notEqual(hashOf(r), hashOf(row(1, '', { reason: 'khác' })));
  });
});

describe('checkPage', () => {
  it('accepts a good chain across two pages', () => {
    const rows = chain(5);
    const first = checkPage(CHAIN_START, rows.slice(0, 2));
    assert.ok(first.ok);
    if (!first.ok) return;
    const second = checkPage(first.cursor, rows.slice(2));
    assert.ok(second.ok);
    if (!second.ok) return;
    assert.deepEqual(finish(second.cursor), { ok: true, checked: 5, firstBadId: null, reason: null });
  });

  it('an empty table verifies', () => {
    assert.deepEqual(finish(CHAIN_START), { ok: true, checked: 0, firstBadId: null, reason: null });
  });

  it('detects PREV_HASH', () => {
    const rows = chain(2);
    const bad = row(3, 'sha256:00');
    rows.push({ ...bad, hash: hashOf(bad) });
    const step = checkPage(CHAIN_START, rows);
    assert.deepEqual(step, { ok: false, result: { ok: false, checked: 2, firstBadId: 3, reason: 'PREV_HASH' } });
  });

  it('detects ID_GAP', () => {
    const rows = chain(4);
    const kept = rows.filter((r) => r.id !== 3);
    const four = row(4, rows[1].hash);
    kept[2] = { ...four, hash: hashOf(four) };
    const step = checkPage(CHAIN_START, kept);
    assert.deepEqual(step, { ok: false, result: { ok: false, checked: 2, firstBadId: 4, reason: 'ID_GAP' } });
  });

  it('detects HASH', () => {
    const rows = chain(3);
    rows[1] = { ...rows[1], reason: 'sửa lén' };
    const step = checkPage(CHAIN_START, rows);
    assert.deepEqual(step, { ok: false, result: { ok: false, checked: 1, firstBadId: 2, reason: 'HASH' } });
  });

  it('treats a non-sha256 hash as HASH', () => {
    const rows = chain(2);
    rows[1] = { ...rows[1], hash: 'hmac-sha256:abc' };
    const step = checkPage(CHAIN_START, rows);
    assert.deepEqual(step, { ok: false, result: { ok: false, checked: 1, firstBadId: 2, reason: 'HASH' } });
  });
});
