# Ngăn kéo phiếu lương: Từ chối kèm lý do

Viết theo main `19bdf03`. Đường dẫn và số dòng dưới đây là của commit đó (các tệp của Bảng lương không đổi so với nhánh hiện tại).

Hiện bấm "Từ chối" là từ chối ngay, không có chỗ ghi lý do. Việc cần làm: hỏi lý do (không bắt buộc), gửi lý do cho BE và hiện lại lý do trên dòng trạng thái.

## 1. Người dùng đã chốt (2026-11-05)

- Có ô lý do khi Từ chối, không bắt buộc. Để trống vẫn từ chối được.
- Bấm "Từ chối" thì hiện ô "Lý do từ chối (không bắt buộc)", nút "Xác nhận từ chối" và nút "Huỷ". Chưa gửi gì cho tới khi bấm "Xác nhận từ chối".
- "Huỷ" đóng ô lý do, xoá chữ đã gõ, ngăn kéo trở lại như trước.
- Sau khi từ chối, dòng trạng thái ghi "Đã từ chối phiếu lương của <tên>." và, nếu có lý do, thêm lý do.
- Ô nhập có góc 8px, không dạng viên thuốc. Chỉ cho thao tác hợp lệ: sau khi phiếu đã Duyệt hoặc Từ chối thì không còn hai nút (đã đúng như hiện nay).

## 2. Dữ liệu BE

`POST /api/v2/payroll/:month/:username/decision`

```json
{ "decision": "reject", "note": "Thiếu giờ ra ngày 07/10, nhờ nhân viên giải trình." }
```

- `decision`: `approve` hoặc `reject`. `note` tuỳ chọn cho cả hai; BE tự cắt khoảng trắng hai đầu, để trống hoặc toàn khoảng trắng thì lưu `null`. Với "Từ chối" để trống thì có thể không gửi `note`.
- Phản hồi 200: `{ month, payslip }`, trong `payslip`: `status` (`rejected`), `note` (chuỗi hoặc `null`), `decidedBy`, `decidedAt` (ISO 8601 UTC hoặc `null`).
- Lỗi: `400 INVALID_DECISION`, `404 PAYSLIP_NOT_FOUND`, `409 PAYROLL_FINALIZED` (kỳ đã chốt, không đổi quyết định được). Nếu màn đã biết kỳ đã chốt thì ẩn hai nút; chưa biết thì để câu của BE hiện như các lỗi khác.
- Cũng đọc được `note` / `decidedBy` / `decidedAt` ở `GET /api/v2/payroll/:month/:employeeId` và `GET /api/v2/payroll/:month`, nên mở lại phiếu đã từ chối vẫn thấy lý do.

## 3. Mã cần đổi / xoá

- `web/src/views/admin/payroll/payslip/PayslipDrawer.vue`:
  - dòng 27: kiểu prop `decide` thêm tham số `note?: string`;
  - dòng 81–87 (`decided`): thêm lý do vào câu khi `status === 'rejected'` và phiếu có lý do;
  - dòng 88–103 (`decideNow`): "Từ chối" chỉ mở ô lý do; gọi `props.decide(id, 'reject', note)` ở nút "Xác nhận từ chối". Giữ cơ chế `deciding` chống bấm đúp và việc đưa tiêu điểm sang dòng trạng thái;
  - dòng 170–174 (chân ngăn kéo): thêm ô lý do, nút "Xác nhận từ chối", nút "Huỷ"; bố cục do agent thiết kế quyết định.
- `web/src/views/admin/payroll/PayrollView.vue:141-143` (`decide`): nhận và truyền `note`.
- `web/src/services/admin-payroll.ts:57-61` (`decidePayslip`): thêm tham số `note`; nhánh thật gửi `{ decision, note }` (bỏ `note` khi trống); nhánh `__MOCK__` truyền `note` cho `decideMock`.
- `web/src/builders/api/payroll.ts`: kiểu `PayslipRecordDTO` (đầu tệp, dòng 8–) thêm `note`, `decidedBy`, `decidedAt`; `payslipFromRecord` (dòng 157–) đưa lý do vào `Payslip` ở một trường có tên mới, vì `Payslip.note` đã dùng cho "Công chuẩn: N ngày" (dòng 179).
- `web/src/mock/payroll.ts`: kiểu `Payslip` (dòng 15–40) thêm trường lý do; `decidePayslip` (dòng 361–366) nhận `note`, lưu vào trạng thái trong bộ nhớ, `payslipView` trả lại. Cho một phiếu mẫu đã bị từ chối có lý do, để xem trạng thái đã từ chối khi mở ngăn kéo.

## 4. Cách kiểm

Thấy được:

- Phiếu Nháp hoặc Chờ duyệt: bấm "Từ chối" thì hiện ô "Lý do từ chối (không bắt buộc)" cùng "Xác nhận từ chối" và "Huỷ". Chưa có gì bị từ chối.
- Gõ lý do rồi "Xác nhận từ chối": dòng trạng thái ghi đã từ chối kèm lý do; trong Bảng lương số phiếu "Từ chối" tăng 1.
- Để trống rồi "Xác nhận từ chối": vẫn từ chối được; dòng trạng thái không có phần lý do.
- "Huỷ": ô đóng, chữ đã gõ bị xoá; mở lại ô thì trống.
- Trong lúc chờ BE: nút "Xác nhận từ chối" và "Huỷ" bị khoá, bấm đúp chỉ gửi một lần.
- Đóng rồi mở lại ngăn kéo phiếu đã từ chối: vẫn thấy lý do.

Test UI nên có (`PW_PORT=<cổng> npm --prefix web run test:ui`; sửa trong `web/tests/payroll-ux.spec.ts`):

- sửa `:651-654` (hiện bấm "Từ chối" là từ chối ngay): thêm bước gõ lý do và bấm "Xác nhận từ chối", rồi kiểm dòng trạng thái và số "Từ chối 2";
- thêm: từ chối không lý do; "Huỷ" xoá chữ; sửa `:689` (nút bị khoá khi đang gửi) cho nút "Xác nhận từ chối";
- thêm: mock lưu `note` đúng (lý do hiện lại sau khi đóng và mở lại ngăn kéo).
