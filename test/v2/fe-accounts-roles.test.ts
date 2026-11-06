// Màn Tài khoản (Cài đặt › Phân quyền): vai trò hiện ra và vai trò gửi đi phải theo đúng quy ước của BE v2 —
// vai trò chính là roles[0] (cột staff.role, nơi đăng nhập và quyền đọc). BUG-staff-8: FE cũ gửi ['staff', 'admin'].
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAccounts, nextRoles } from '../../web/src/builders/admin-perm/accounts';
import { accountSourcesFromApi } from '../../web/src/builders/api/accounts';

function employee(username: string, name: string, roles: string[]) {
  return {
    profile: { uuid: `u-${username}`, familyName: '', givenName: '', fullName: name, birthday: null, dependants: 0 },
    account: { username, roles, primaryRole: roles[0], isLocked: false, lockedAt: null, lockedBy: null, createdAt: '2026-01-01T00:00:00Z' },
    contract: {
      position: { type: 'nv', level: 2, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0 },
      leave: { totalDays: 12, usedDays: 0, remainingDays: 12 },
      status: 'nv',
      term: null,
      effectiveFrom: '2026-01-01',
      resignedOn: null,
      hasInsurance: null
    }
  };
}

const ROLES = [
  { code: 'admin', label: 'Quản trị viên (Admin)', isDefault: true },
  { code: 'manager', label: 'Quản lý (Manager)', isDefault: true },
  { code: 'staff', label: 'Nhân viên (Staff)', isDefault: true }
];

function accounts(people: any[], me = 'admin') {
  const { rolesRes, staffRes } = accountSourcesFromApi(ROLES, people as any);
  return buildAccounts(rolesRes, staffRes, null, me, {});
}

describe('Tài khoản: vai trò theo quy ước roles[0] của BE', () => {
  it('a role change sends exactly the new role, so BE stores it as the main role', () => {
    assert.deepEqual(nextRoles('admin'), ['admin']);
    assert.deepEqual(nextRoles('staff'), ['staff']);
  });

  it('shows the role that login and caps read (roles[0]), not the first role other than staff', () => {
    // Trạng thái mà lỗi cũ để lại trong DB: staff.role = 'staff', staff_roles có thêm 'admin'.
    const view = accounts([employee('admin', 'Quản trị', ['admin']), employee('ns-vaitro', 'Đinh Văn Trò', ['staff', 'admin'])]);
    const tro = view.rows.find((r: any) => r.username === 'ns-vaitro');
    assert.equal(tro.role, 'Nhân viên (Staff)');
    assert.equal(view.summary.admins, 1);
  });

  it('counts each account once, under its main role', () => {
    const view = accounts([
      employee('admin', 'Quản trị', ['admin', 'staff']),
      employee('an', 'Nguyễn Văn An', ['staff']),
      employee('binh', 'Trần Bình', ['staff', 'admin'])
    ]);
    const count = (label: string) => view.chips.find((c: any) => c.key === label)?.count;
    assert.equal(count('Tất cả'), undefined); // chip "Tất cả" có key 'all'
    assert.equal(view.chips.find((c: any) => c.key === 'all').count, 3);
    assert.equal(count('Quản trị viên (Admin)'), 1);
    assert.equal(count('Nhân viên (Staff)'), 2);
  });

  it('offers only Admin and Nhân viên, the two roles v2 grants rights for', () => {
    const view = accounts([employee('admin', 'Quản trị', ['admin']), employee('an', 'Nguyễn Văn An', ['staff'])]);
    assert.deepEqual(view.roles, ['Quản trị viên (Admin)', 'Nhân viên (Staff)']);
    assert.deepEqual(
      view.chips.map((c: any) => c.key),
      ['all', 'Quản trị viên (Admin)', 'Nhân viên (Staff)']
    );
  });

  it('filters by the main role', () => {
    const people = [employee('admin', 'Quản trị', ['admin']), employee('binh', 'Trần Bình', ['staff', 'admin'])];
    const { rolesRes, staffRes } = accountSourcesFromApi(ROLES, people as any);
    const view = buildAccounts(rolesRes, staffRes, null, 'admin', { role: 'Quản trị viên (Admin)' });
    assert.deepEqual(view.rows.map((r: any) => r.username), ['admin']);
  });
});
