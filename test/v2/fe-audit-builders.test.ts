// Hàm dựng màn "Nhật ký thay đổi" của FE: nhãn tiếng Việt, đổi phản hồi BE, gộp một thao tác thành × N, đếm trang thật.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACTION_LABELS, actionLabel, personLabel } from '../../web/src/builders/admin-config/audit-labels';
import { auditFromResponse, verifyMessage, type AuditItemDTO } from '../../web/src/builders/api/audit';
import { buildAuditPage } from '../../web/src/builders/admin-config/audit';

function item(id: number, at: string, over: Partial<AuditItemDTO> = {}): AuditItemDTO {
  return {
    id,
    at,
    actor: 'admin',
    actorName: 'Quản trị viên',
    action: 'holiday.add',
    entityKind: 'holiday',
    entityId: 'd' + id,
    subject: null,
    month: null,
    before: null,
    after: { name: 'Lễ' },
    reason: null,
    sensitivity: 'normal',
    requestId: null,
    ...over
  };
}

const page = (items: AuditItemDTO[], total: number, p = 1, size = 25) =>
  buildAuditPage(auditFromResponse({ items, total, limit: size, offset: (p - 1) * size, people: [], actions: [] }), { page: p, size });

describe('Nhật ký: nhãn và tên người', () => {
  it('labels actions in Vietnamese and keeps unknown codes', () => {
    assert.equal(actionLabel('param.set'), 'Sửa tham số lương');
    assert.equal(actionLabel('request.decide', { status: 'APPROVED' }), 'Duyệt đơn');
    assert.equal(actionLabel('request.decide', { status: 'REJECTED' }), 'Từ chối đơn');
    assert.equal(actionLabel('request.decide'), 'Duyệt / từ chối đơn');
    assert.equal(actionLabel('foo.bar'), 'foo.bar');
    assert.equal(Object.keys(ACTION_LABELS).length, 17);
  });

  it('names people and the system', () => {
    assert.equal(personLabel('admin', 'Quản trị viên'), 'Quản trị viên');
    assert.equal(personLabel('system', null), 'Hệ thống');
    assert.equal(personLabel('old-user', null), 'old-user');
  });
});

describe('Nhật ký: đổi phản hồi và dựng trang', () => {
  it('maps dropdown options from the response', () => {
    const out = auditFromResponse({
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
      people: [{ username: 'system', name: null }],
      actions: ['param.set', 'x.y', 'period.lock', 'holiday.add']
    });
    assert.deepEqual(out.people, [{ value: 'system', label: 'Hệ thống' }]);
    assert.deepEqual(out.actions, [
      { value: 'period.lock', label: 'Chốt công' },
      { value: 'param.set', label: 'Sửa tham số lương' },
      { value: 'holiday.add', label: 'Thêm ngày lễ' },
      { value: 'x.y', label: 'x.y' }
    ]);
  });

  it('groups one operation into × N', () => {
    const at = '2026-10-26T03:00:00.000Z';
    const view = page(
      [
        item(9, at, { requestId: 'rq-1' }),
        item(8, at, { requestId: 'rq-1' }),
        item(7, at, { requestId: 'rq-1' }),
        item(6, at, { requestId: 'rq-2' })
      ],
      4
    );
    assert.equal(view.days[0].rows.length, 2);
    const first = view.days[0].rows[0];
    assert.equal(first.count, 3);
    assert.equal(first.id, '9');
    assert.deepEqual(first.rows.map(r => r.id), ['9', '8', '7']);
    assert.equal(view.days[0].rows[1].count, 1);
  });

  it('does not group without a request id, across days, or across people', () => {
    const at = '2026-10-26T03:00:00.000Z';
    const none = page([item(2, at), item(1, at)], 2);
    assert.equal(none.days[0].rows.length, 2);

    const days = page(
      [
        item(2, '2026-10-26T17:01:00.000Z', { requestId: 'rq' }),
        item(1, '2026-10-26T16:59:00.000Z', { requestId: 'rq' })
      ],
      2
    );
    assert.equal(days.days.length, 2);
    assert.deepEqual(days.days.map(d => d.rows.length), [1, 1]);

    const people = page(
      [item(2, at, { requestId: 'rq' }), item(1, at, { requestId: 'rq', actor: 'ha', actorName: 'Hà' })],
      2
    );
    assert.equal(people.days[0].rows.length, 2);
  });

  it('counts pages from the real total', () => {
    const at = '2026-10-26T03:00:00.000Z';
    const mk = (n: number) => Array.from({ length: n }, (_, i) => item(100 - i, at));
    const second = page(mk(20), 45, 2);
    assert.equal(second.pages, 2);
    assert.equal(second.rangeLabel, 'Dòng 26–45 trên 45');
    assert.equal(page(mk(25), 45, 1).rangeLabel, '25 dòng đầu trên 45');
    const empty = page([], 0);
    assert.equal(empty.pages, 1);
    assert.equal(empty.rangeLabel, 'Không có dòng nào');
  });

  it('shows the Vietnamese action and person name on each line', () => {
    const view = page(
      [item(3, '2026-10-26T03:00:00.000Z', { action: 'request.decide', after: { status: 'REJECTED' } })],
      1
    );
    const line = view.days[0].rows[0];
    assert.equal(line.action, 'Từ chối đơn');
    assert.equal(line.who, 'admin');
    assert.equal(line.whoName, 'Quản trị viên');
    assert.equal(line.reason, '—');
  });
});

describe('Nhật ký: kiểm chuỗi băm', () => {
  it('verifyMessage speaks Vietnamese', () => {
    assert.equal(verifyMessage({ ok: true, checked: 3, firstBadId: null, reason: null }), null);
    assert.equal(verifyMessage({ ok: false, checked: 41, firstBadId: 42, reason: 'HASH' }), 'Dòng 42 đã bị sửa nội dung');
    assert.equal(
      verifyMessage({ ok: false, checked: 41, firstBadId: 42, reason: 'PREV_HASH' }),
      'Dòng 42 không nối với dòng trước: có dòng bị chèn hoặc bị xoá'
    );
    assert.equal(verifyMessage({ ok: false, checked: 41, firstBadId: 42, reason: 'ID_GAP' }), 'Thiếu dòng ngay trước dòng 42');
    assert.equal(verifyMessage({ ok: false, checked: 41, firstBadId: 42, reason: 'X' }), 'Dòng 42 không khớp');
  });
});
