// Màn Tài khoản (Cài đặt › Phân quyền) từ GET /api/v2/roles và /employees, đổi về hai phản hồi kiểu V1 mà
// builders/admin-perm/accounts đọc. BE chưa có số phiên bản cho tài khoản: rev là 0.
import type { EmployeeDTO } from './staff';

export type RoleDTO = { code: string; label: string; isDefault: boolean };

export function accountSourcesFromApi(roles: RoleDTO[], employees: EmployeeDTO[]) {
  const rolesOf = (e: EmployeeDTO) => (e.account.roles?.length ? [...e.account.roles] : ['staff']);
  return {
    rolesRes: {
      roles: roles.map(r => ({ code: r.code, label: r.label, deprecated: false })),
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
        payrollSubject: !rolesOf(e).includes('admin'),
        rev: 0
      }))
    }
  };
}
