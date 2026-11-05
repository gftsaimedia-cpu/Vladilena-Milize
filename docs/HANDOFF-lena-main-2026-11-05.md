# Bàn giao nhánh `lena-main` (05/11/2026, ca đêm)

## Trạng thái
- 8 commit local trên `lena-main` sau `8ffc12a` (chưa push). Cây làm việc sạch.
- BE `npm test`: 1590/1590. FE mock `npm run test:ui`: 644/644. FE với BE thật `npm run test:api`: 45/45. `npm run build` và `vue-tsc` sạch.
- Chạy local: xem `docs/postgres-local.md`. Test với BE thật cần DB dev trống mỗi lần: `npm run db:reset-dev` (quy trình trong `web/tests/README.md`).

## Đã làm
- Kỳ lương trên FE: Chốt công, Mở lại công, Phê duyệt, Huỷ phê duyệt, Đã trả lương nối API thật; ngăn kéo phiếu khoá Duyệt/Từ chối và KPI theo trạng thái kỳ. Đã chạy tay trọn luồng trên BE thật.
- BE: tính lương và danh sách "thiếu phiếu" bỏ tài khoản không thuộc diện tính lương (admin), nên kỳ phê duyệt được. API mới: `GET /attendance/week`, `/attendance/employees/:username`, `/overview`. Tạm ứng trả `windowEnd`, `ordersThisMonth`; đơn có `dates[]`; ngày giải trình có `checkIn`/`checkOut`.
- FE: phân trang Bảng lương, sửa lưới chấm công (ngày ngoài tuần làm việc hiện nghỉ), căn hộp thoại/ngăn kéo/lịch/phiếu lương theo board, bổ sung chữ tĩnh còn thiếu so với 45 board.
- Công cụ: `scripts/design-compare/` (dựng board kể cả dc-import rồi chụp cạnh FE mock), `npm run db:reset-dev`, `docs/design-route-map.md`, `docs/plan-task-audit-1.md`, `docs/plan-task-audit-2.md`.

## Cần bro quyết
1. **Push** 8 commit lên `origin/lena-main`? (`CLAUDE.md` ghi push nhánh chung phải hỏi trước.)
2. **Ma trận vai trò / quy tắc xử lý yêu cầu (Phân quyền):** D3 (spec auth-foundation) chốt đợt đầu chỉ có admin và staff, design không có board. Muốn làm thì bỏ D3 và thêm board.
3. **Tuỳ chọn:** làm cho test với BE thật chịu được DB đã dùng (hiện cần reset DB), thêm dữ liệu mẫu cho DB dev để mở FE thấy ngay số liệu.

## Giới hạn đã biết
- Không so pixel tự động: font và ảnh `/_blob/...` của board không có trong repo; so bằng mắt, sửa lệch đáng kể. Giữ lệch có chủ đích theo spec: mật độ bảng "Gọn", bỏ "Xuất báo cáo", "Khai thay", "Nhập Excel", huỷ đơn xác nhận tại chỗ.
- 23 plan (186 task) đối chiếu bằng symbol/route/test; 6 mục "thiếu" đều là đã chuyển chỗ hoặc bỏ có chủ đích (xem `docs/plan-task-audit-*.md`).
- `ordersThisMonth` cố định 1 theo board; câu "ngày được trả lại" có thể nhắc cả cuối tuần nếu đơn trải qua.
