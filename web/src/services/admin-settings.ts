// Dịch vụ dữ liệu của nhóm Cài đặt (Admin): các hàm tham số, lịch, nhật ký ở admin-config.js; vai trò, tài khoản, quy tắc yêu cầu ở admin-perm.js.

// ---------- Phân quyền ----------
// Vai trò và tài khoản gọi máy chủ thật (services/admin-perm.js).
export {
  createRole,
  getAccounts,
  getPermSummary,
  getRequestRules,
  getRoles,
  resetAccountPassword,
  saveRequestRules,
  saveRoles,
  setAccountLocked,
  setAccountRole
} from './admin-perm';

// ---------- Bản nối máy chủ thật (services/admin-config.js) ----------
export {
  getSettingsBadges,
  getBenefits,
  benefitChangesAt,
  saveBenefits,
  getAllSettings,
  saveAllSettings,
  getCalendar,
  addHoliday,
  quickAddHolidays,
  removeHoliday,
  getAuditLog,
  verifyAuditLog
} from './admin-config';
