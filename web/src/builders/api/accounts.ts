// Màn Tài khoản (Cài đặt › Phân quyền) từ GET /api/v2/roles và /employees, đổi về hai phản hồi kiểu V1 mà
// builders/admin-perm/accounts đọc. BE chưa có số phiên bản cho tài khoản: rev là 0.
// GET /roles còn trả "manager", nhưng v2 chỉ cấp quyền cho admin và staff (spec fe-be-auth-foundation, D3): vai trò khác
// coi như ngừng dùng, chỉ hiện khi có người đang giữ.
import type { EmployeeDTO } from './staff';

export type RoleDTO = { code: string; label: string; isDefault: boolean };

const GRANTED_ROLES = ['admin', 'staff'];

export function accountSourcesFromApi(roles: RoleDTO[], employees: EmployeeDTO[]) {
  const rolesOf = (e: EmployeeDTO) => (e.account.roles?.length ? [...e.account.roles] : ['staff']);
  return {
    rolesRes: {
      roles: roles.map(r => ({ code: r.code, label: r.label, deprecated: !GRANTED_ROLES.includes(r.code) })),
      staff: employees.map(e => ({
        username: e.account.username,
        name: e.profile.fullName || e.account.username,
        roles: rolesOf(e),
        locked: e.account.isLocked,
        rev: 0
      }))
    },
    staffRes: {
      staff: employees.map(e => ({
        username: e.account.username,
        type: e.contract.position.type,
        level: e.contract.position.level,
        levelName: `Bậc ${e.contract.position.level}`,
        payrollSubject: rolesOf(e)[0] !== 'admin',
        rev: 0
      }))
    }
  };
}
