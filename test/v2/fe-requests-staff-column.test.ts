import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { peopleOf } from '../../web/src/builders/api/staff';
import {
  advanceResponseFromRequests,
  approvalRowsFromRequests,
  explanationsResponseFromRequests
} from '../../web/src/builders/api/requests';
import { buildRequestRow } from '../../web/src/builders/admin-requests/requests';
import { buildAdvanceRows } from '../../web/src/builders/admin-requests/advance';
import { buildExplanationRows } from '../../web/src/builders/admin-requests/explanations';

// Hồ sơ GET /employees của một nhân viên có uuid khác tên đăng nhập (như mọi tài khoản trên DB thật).
const nam = {
  profile: { uuid: 'uuid-nam', fullName: 'Lê Hoàng Nam', birthday: null, dependants: 0 },
  account: { username: 'nam', roles: [], isLocked: false, lockedAt: null, createdAt: '2026-01-01T00:00:00Z' },
  contract: { position: { type: 'nv', level: 2, jobTitle: 'Kinh doanh' } }
} as any;

const base = { reason: 'x', createdAt: '2026-11-05T01:00:00Z', reviewedAt: null, reviewNote: null };
const leave = (employeeId: string) =>
  ({ ...base, id: 'l1', employeeId, type: 'LEAVE', status: 'PENDING', leaveType: 'ANNUAL', leaveStartDate: '2026-11-09' }) as any;

describe('Cột loại · bậc của màn Yêu cầu', () => {
  const people = peopleOf([nam]);

  it('a request stored under the uuid shows the type and level', () => {
    const [raw] = approvalRowsFromRequests([leave('uuid-nam')], people);
    const row = buildRequestRow(raw, people);
    assert.deepEqual([row.name, row.type, row.position], ['Lê Hoàng Nam', 'NV', 'Bậc 2']);
  });

  it('an older request stored under the username shows them too', () => {
    const [raw] = approvalRowsFromRequests([leave('nam')], people);
    const row = buildRequestRow(raw, people);
    assert.deepEqual([row.name, row.type, row.position], ['Lê Hoàng Nam', 'NV', 'Bậc 2']);
  });

  it('advance rows show the type and level, not the uuid', () => {
    const res = advanceResponseFromRequests(
      [{ ...base, id: 'a1', employeeId: 'uuid-nam', type: 'ADVANCE', status: 'PENDING', advancePeriod: '2026-11', advanceAmount: 1_000_000 }] as any,
      people,
      '2026-11'
    );
    const [row] = buildAdvanceRows(res).items;
    assert.deepEqual([row.name, row.type, row.position], ['Lê Hoàng Nam', 'NV', 'Bậc 2']);
  });

  it('explanation rows show the type and level, not the uuid', () => {
    const res = explanationsResponseFromRequests(
      [{ ...base, id: 'e1', employeeId: 'uuid-nam', type: 'EXPLANATION', status: 'PENDING', explanationDate: '2026-11-03' }] as any,
      people
    );
    const [row] = buildExplanationRows(res, '2026-11').items;
    assert.deepEqual([row.name, row.type, row.position], ['Lê Hoàng Nam', 'NV', 'Bậc 2']);
  });

  it('someone missing from the staff list keeps an empty type and level', () => {
    const [raw] = approvalRowsFromRequests([leave('uuid-la')], people);
    const row = buildRequestRow(raw, people);
    assert.deepEqual([row.name, row.type, row.position], ['uuid-la', '', '']);
  });
});
