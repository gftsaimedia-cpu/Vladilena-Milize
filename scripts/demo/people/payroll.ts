// Người của mảng 'payroll' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên payroll sửa file này. Username bắt đầu bằng 'lg-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/payroll.ts).
import type { DemoPerson } from './types';

export const PAYROLL: DemoPerson[] = [];
