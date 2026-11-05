# Bảng lương: nút "In tất cả"

Viết theo main `19bdf03`. Đường dẫn và số dòng dưới đây là của commit đó (các tệp của Bảng lương không đổi so với nhánh hiện tại; `services/payslip.ts` và trang in là của 19bdf03).

Bảng lương chưa có cách in cả kỳ. Việc cần làm: một nút "In tất cả" mở trang in gồm mọi phiếu đã duyệt của kỳ, mỗi phiếu hai tờ A4.

## 1. Người dùng đã chốt (2026-11-05)

- Có "In tất cả" ở Bảng lương.
- Chỉ in các phiếu đã duyệt (`status = 'approved'`).
- BE tính sẵn mọi số vào phiếu; FE chỉ trình bày. Branch BE này không sửa mã FE; tài liệu này giao cho agent FE.

### Gợi ý thiết kế (agent thiết kế tự quyết)

- Nút mở một tab mới tới `/in/phieu-luong/:month?in=1`; trang đó tự mở hộp in khi các phiếu dựng xong.
- Nút bị khoá khi số phiếu đã duyệt của kỳ bằng 0 (luật chung của dự án: ngăn thay vì báo lỗi); chữ giải thích khi khoá do agent thiết kế viết.
- Nút lấy mọi phiếu đã duyệt của cả kỳ, không đổi theo bộ lọc hay ô tìm đang chọn (đề xuất; người dùng chưa nói).
- Nút mới theo luật chung: góc 8px, chấm + chữ, không viên thuốc.

## 2. Dữ liệu BE

`GET /api/v2/payroll/:month` trả `{ month, items }`; mỗi phần tử là một bản ghi phiếu có `username`, `status` (`draft` | `approved` | `rejected`) và `details` đầy đủ. Trang in giữ các phần tử `status === 'approved'` và dựng mỗi phiếu thành `A4Sheet` như phiếu lẻ (ánh xạ trường: `in-phieu-luong-a4--noi-api-v2.md`). Không cần gọi lại từng người. Kỳ chưa tính thì `items` rỗng.

Số phiếu đã duyệt để bật hoặc khoá nút đã có trên màn: `board.counts.done` (`web/src/builders/api/payroll.ts:72`; trạng thái BE `approved` hoặc `final` thành `done`, dòng 35–36). Đây là số của cả kỳ, không đổi theo bộ lọc.

## 3. Mã cần đổi / xoá

- `web/src/views/admin/payroll/PayrollView.vue`: thêm nút. Chỗ đặt do agent thiết kế chọn: hàng tiêu đề cạnh "Tính lương / Tính lại lương" (dòng 158–160) hoặc hàng công cụ cạnh nút xuất Excel (`parts/PayToolbar.vue:53`). Đường dẫn dựng từ `board.month`; mở bằng `window.open` (có `noopener`). Khoá khi `board.counts.done === 0`.
- `web/src/services/payslip.ts:83-91` `getApprovedSheets`: hiện gọi `approvedRows` (`:61-69`) qua API v1 `/periods/...`, nên báo lỗi ở mọi chế độ. Viết lại: nhánh thật gọi `GET /payroll/:month`, lọc `approved`, dựng `A4Sheet`; nhánh `__MOCK__` trả các phiếu mẫu đã duyệt (ít nhất hai phiếu, để thấy ngắt trang giữa các phiếu). Mã v1 liên quan xoá cùng đợt: `approvedRows`, `getPrintBatch` (`:71-81`) và phần còn lại liệt kê ở `in-phieu-luong-a4--noi-api-v2.md`.
- `web/src/mock/payslip-a4.ts:251` `payslipSheet(month)` chỉ trả một phiếu: thêm hàm trả danh sách phiếu đã duyệt của tháng mẫu (mock Bảng lương ghi "Đã duyệt 86" nhưng chỉ vài phiếu mẫu có chi tiết; chỉ cần các phiếu mẫu đó).
- `web/src/views/print/PayslipPrint.vue:52`: `:key="s.username"`; kiểu `A4Sheet` cần có `username` (xem file in A4) để mỗi phiếu có khoá riêng. Dòng 51 đã có câu "Chưa có phiếu đã phê duyệt trong kỳ này." cho lô rỗng; dòng 90–94 đã bỏ ngắt trang sau tờ cuối.

## 4. Cách kiểm

Thấy được:

- Kỳ có phiếu đã duyệt: nút "In tất cả" bấm được. Bấm thì tab mới mở, hiện lần lượt các phiếu đã duyệt (hai tờ mỗi phiếu, không có phiếu Nháp hay Từ chối), rồi mở hộp in. Tab Bảng lương không đổi.
- Kỳ không có phiếu đã duyệt (hoặc chưa tính): nút khoá; không mở được tab.
- Đổi bộ lọc sang "Nháp" hay gõ ô tìm (theo gợi ý trên): nút vẫn bấm được nếu cả kỳ có phiếu đã duyệt, và lô in không đổi.
- Không có tờ trắng thừa ở cuối lô.

Test UI nên có (`PW_PORT=<cổng> npm --prefix web run test:ui`):

- giả `window.open`; bấm "In tất cả" ở kỳ mẫu 2026-10 thì được gọi đúng một lần với `/in/phieu-luong/2026-10?in=1`; đổi bộ lọc rồi bấm vẫn cùng URL;
- trang `/in/phieu-luong/2026-10?in=1` có số tờ `.pl-a4` bằng 2 nhân số phiếu mẫu đã duyệt và gọi `window.print` đúng một lần;
- nút khoá khi `board.counts.done` bằng 0: nếu mock không có kỳ nào như vậy thì kiểm bằng fixture riêng (kiểu `web/tests/fixtures/slip-summary.html`) hoặc kiểm hàm quyết định khoá trong Node.
