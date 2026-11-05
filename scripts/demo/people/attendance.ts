// Người của mảng 'attendance' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên attendance sửa file này. Username bắt đầu bằng 'cc-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/attendance.ts).
import type { DemoPerson } from './types';

export const ATTENDANCE: DemoPerson[] = [];
