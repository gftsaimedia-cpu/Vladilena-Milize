import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { peopleOf } from '../../web/src/builders/api/staff';

// Hồ sơ GET /employees của một nhân viên có uuid khác tên đăng nhập (như mọi tài khoản trên DB thật).
const nam = {
  profile: { uuid: 'uuid-nam', fullName: 'Lê Hoàng Nam', birthday: null, dependants: 0 },
  account: { username: 'nam', roles: [], isLocked: false, lockedAt: null, createdAt: '2026-01-01T00:00:00Z' },
  contract: { position: { type: 'nv', level: 2, jobTitle: 'Kinh doanh' } }
} as any;

describe('Bảng tra nhân sự cho chuông và đơn từ (peopleOf)', () => {
  const people = peopleOf([nam]);
  const card = { name: 'Lê Hoàng Nam', title: 'Kinh doanh', type: 'nv', levelName: 'Bậc 2', dept: '—', ps: 'ok' };

  it('finds a person by uuid, the key new requests are stored under', () => {
    assert.deepEqual(people.get('uuid-nam'), card);
  });

  it('finds the same person by username, the key of older requests', () => {
    assert.deepEqual(people.get('nam'), card);
  });

  it('someone missing from the staff list is not in the map', () => {
    assert.equal(people.get('uuid-la'), undefined);
  });
});
