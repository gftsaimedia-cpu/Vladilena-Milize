import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuditEntryError, toAuditFields, type AuditEntry } from '../../src/modules/audit/domain/audit-entry';

const base = { actor: 'admin', action: 'param.set', entityKind: 'param', entityId: 'ot.rate' };

describe('toAuditFields', () => {
  it('fills nulls and the normal sensitivity', () => {
    assert.deepEqual(toAuditFields(base), {
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
      request_id: null
    });
  });

  it('stringifies JSON, sorts roles, turns a numeric id into text', () => {
    const fields = toAuditFields({
      ...base,
      entityId: 42,
      actorRoles: ['b', 'a'],
      before: { v: 150 },
      after: { v: 200 },
      reason: '',
      month: '2026-11',
      requestId: 'rq-1'
    });
    assert.equal(fields.entity_id, '42');
    assert.equal(fields.actor_roles, '["a","b"]');
    assert.equal(fields.before_json, '{"v":150}');
    assert.equal(fields.after_json, '{"v":200}');
    assert.equal(fields.reason, null);
    assert.equal(fields.month, '2026-11');
    assert.equal(fields.request_id, 'rq-1');
  });

  it('rejects bad entries with AuditEntryError', () => {
    const bad: unknown[] = [
      { action: 'param.set', entityKind: 'param', entityId: 'ot.rate' },
      { ...base, action: '' },
      { ...base, entityKind: 'k'.repeat(201) },
      { ...base, reason: 'r'.repeat(1001) },
      { ...base, month: '2026-13' },
      { ...base, sensitivity: 'secret' },
      { ...base, actorRoles: 'admin' },
      { ...base, after: { blob: 'x'.repeat(65536) } },
      { ...base, after: { pass_hash: 'x' } },
      { ...base, before: { hash: 'scrypt$ab$cd' } },
      { ...base, after: { password_hash: 'x' } },
      { ...base, after: { lat: 10.7, lng: 106.6 } }
    ];
    for (const entry of bad) {
      assert.throws(() => toAuditFields(entry as AuditEntry), AuditEntryError);
    }
  });

  it('starts the message with the action', () => {
    assert.throws(
      () => toAuditFields({ ...base, month: 'x' }),
      (e: any) => e.name === 'AuditEntryError' && e.message.startsWith('Nhật ký param.set: ')
    );
  });

  it('replaces a lone surrogate the way PG would store it', () => {
    const half = 'Lý do 😀'.slice(0, 7);
    assert.equal(toAuditFields({ ...base, reason: half }).reason, 'Lý do �');
    assert.equal(toAuditFields({ ...base, entityId: half }).entity_id, 'Lý do �');
    assert.equal(toAuditFields({ ...base, subject: half }).subject, 'Lý do �');
  });

  it('rejects NUL in a text field or the reason', () => {
    assert.throws(() => toAuditFields({ ...base, subject: 'a\u0000b' }), AuditEntryError);
    assert.throws(() => toAuditFields({ ...base, reason: 'a\u0000' }), AuditEntryError);
    assert.throws(() => toAuditFields({ ...base, actor: '\u0000' }), AuditEntryError);
  });

  it('allows a passwordSet flag', () => {
    assert.doesNotThrow(() => toAuditFields({ ...base, after: { passwordSet: true } }));
  });
});
