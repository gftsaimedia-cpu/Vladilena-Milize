// Người của mảng 'requests' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên requests sửa file này. Username bắt đầu bằng 'dt-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/requests.ts).
import type { DemoPerson } from './types';

export const REQUESTS: DemoPerson[] = [];
