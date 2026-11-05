// Người của mảng 'requests' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên requests sửa file này. Username bắt đầu bằng 'dt-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/requests.ts).
// Bảng tình huống của từng người: docs/demo-db/requests.md.
import type { DemoPerson } from './types';

const NV = { status: 'nv', position: { type: 'nv', level: 1 } };
const FROM_M2 = { monthOffset: -2, day: 1 };

export const REQUESTS: DemoPerson[] = [
  {
    username: 'dt-an',
    familyName: 'Lê Thị',
    givenName: 'An',
    area: 'requests',
    start: FROM_M2,
    contract: { ...NV, leave: { totalDays: 12, usedDays: 0 } },
    note: 'Đơn nghỉ đủ 4 trạng thái (Admin nộp thay và tự nộp). Người xem chính ở app nhân viên.'
  },
  {
    username: 'dt-binh',
    familyName: 'Phạm Văn',
    givenName: 'Bình',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn làm thêm giờ (OT) đủ 4 trạng thái.'
  },
  {
    username: 'dt-chi',
    familyName: 'Ngô Thị',
    givenName: 'Chi',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn đổi ca đủ 4 trạng thái.'
  },
  {
    username: 'dt-dung',
    familyName: 'Trần Văn',
    givenName: 'Dũng',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn giải trình đủ 4 trạng thái.'
  },
  {
    username: 'dt-giang',
    familyName: 'Đỗ Thị',
    givenName: 'Giang',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn tạm ứng đủ 4 trạng thái.'
  },
  {
    username: 'dt-hoa',
    familyName: 'Vũ Thị',
    givenName: 'Hoa',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn nghỉ có làm bù đủ 4 trạng thái.'
  },
  {
    username: 'dt-khoa',
    familyName: 'Hoàng Văn',
    givenName: 'Khoa',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn iSAT đủ 4 trạng thái, thêm một đơn tự đánh giá chưa đạt (máy tự từ chối).'
  },
  {
    username: 'dt-lam',
    familyName: 'Bùi Văn',
    givenName: 'Lâm',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Trùng ngày và ngày lễ: đơn nghỉ chờ duyệt, iSAT chờ và đã duyệt, nghỉ có làm bù chờ duyệt. Test thêm ngày lễ rồi xoá.'
  },
  {
    username: 'dt-mai',
    familyName: 'Đặng Thị',
    givenName: 'Mai',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đơn chờ duyệt rơi vào tháng trước; test chốt công tháng đó rồi duyệt và nộp thêm.'
  },
  {
    username: 'dt-nam',
    familyName: 'Lý Văn',
    givenName: 'Nam',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Đã nghỉ việc (DELETE /employees) sau khi có một đơn đã duyệt và một đơn chờ duyệt.'
  },
  {
    username: 'dt-oanh',
    familyName: 'Mai Thị',
    givenName: 'Oanh',
    area: 'requests',
    start: FROM_M2,
    contract: { status: 'tts', position: { type: 'tts', level: 1 } },
    note: 'Thực tập sinh: không có quyền lợi OT và iSAT. Không có đơn seed.'
  },
  {
    username: 'dt-phu',
    familyName: 'Cao Văn',
    givenName: 'Phú',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Chỗ thử luật nhân viên tự nộp qua /me (ngày quá khứ, quá tháng sau, giờ lẻ, tạm ứng, huỷ). Không có đơn seed.'
  },
  {
    username: 'dt-quan',
    familyName: 'Tạ Văn',
    givenName: 'Quân',
    area: 'requests',
    start: FROM_M2,
    contract: NV,
    note: 'Bốn đơn chờ duyệt để test duyệt và từ chối trên giao diện Admin (thẻ Tổng quan, hộp duyệt, chuông, tab Cần xử lý).'
  }
];
