import store = require('../lib/db');
import Roles = require('../lib/roles');
import { monthParams, typeParam } from '../lib/request-rules';

/** Việc khởi tạo cấp ứng dụng, chạy một lần khi dựng máy chủ (kể cả khi test nạp server). */
export function initApp(): void {
  // Hợp đồng mặc định của chức vụ mới đọc type.<mã>.defaultContract của tháng hiện tại (lỗi hoặc giá trị lạ thì db dùng mặc định của nó)
  store.setDefaultContractResolver(async (type: string) => typeParam(await monthParams(), type, 'defaultContract'));
  // tài khoản đã gán vai trò staff mà payrollSubject còn false thì bật (staff = nhân sự được trả lương)
  Roles.reconcileStaffRole().catch((error: unknown) => console.error('reconcileStaffRole:', error));
}
