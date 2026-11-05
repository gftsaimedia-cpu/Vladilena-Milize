# Ngăn kéo phiếu lương: nút In

Viết theo main `19bdf03`. Đường dẫn và số dòng dưới đây là của commit đó (các tệp của Bảng lương không đổi so với nhánh hiện tại).

Nút In trong ngăn kéo phiếu lương hiện gọi hộp in của trình duyệt trên chính ngăn kéo (`window.print()`), nên in ra ngăn kéo chứ không phải phiếu A4. Việc cần làm: nút mở bản in A4 hai trang của đúng phiếu đó.

## 1. Người dùng đã chốt (2026-11-05)

- Bấm vào dòng trong Bảng lương mở ngăn kéo; bấm nút In trong ngăn kéo ra bản A4 hai trang.
- Nút In in được phiếu ở mọi trạng thái (Nháp, Chờ duyệt, Đã duyệt, Từ chối). Không khoá nút theo trạng thái.
- Nút mở một tab mới tới `/in/phieu-luong/:month/:id?in=1`. Trang đó tự mở hộp in khi phiếu dựng xong (đã có sẵn, `?in=1`).
- Ô Tình trạng trên bản in ghi đúng trạng thái của phiếu (xem `in-phieu-luong-a4--noi-api-v2.md`).
- Bỏ CSS in của ngăn kéo, vì ngăn kéo không còn được in.

## 2. Dữ liệu BE

Không có lời gọi mới. Đường dẫn dựng từ dữ liệu ngăn kéo đã có:

- `:month` là `YYYY-MM` của Bảng lương (`board.month`, truyền vào ngăn kéo qua prop `month`), ví dụ `2026-10`.
- `:id` là `slip.id`: trên BE thật là `username` của nhân sự (`web/src/builders/api/payroll.ts`, `lineOf`, `id: r.username`), trên dữ liệu giả là mã mẫu như `GFT-0142`. Mã hoá bằng `encodeURIComponent`.

Ví dụ: `/in/phieu-luong/2026-10/nguyen-thu-ha?in=1`. Trang in đọc `GET /api/v2/payroll/2026-10/nguyen-thu-ha` (BE thật) hoặc tháng mẫu (dữ liệu giả; chỉ có tháng 10/2026).

## 3. Mã cần đổi / xoá

- `web/src/views/admin/payroll/payslip/PayslipDrawer.vue`:
  - dòng 68 `const print = () => window.print();`: đổi thành mở tab mới (`window.open` tới đường dẫn trên, có `noopener`);
  - dòng 127 nút `aria-label="In phiếu"`: giữ nhãn;
  - dòng 7: sửa chú thích "In phiếu gọi hộp thoại in của trình duyệt…";
  - dòng 296–323: xoá cả khối `<style>` không scoped dành cho in (và dòng chú thích 296).
- `web/tests/payroll-ux.spec.ts:665-678`: test `print calls the browser dialog and prints only the slip` kiểm hành vi cũ (`window.print` được gọi, bảng ẩn khi in). Viết lại theo mục 4.

## 4. Cách kiểm

Thấy được:

- Mở ngăn kéo một phiếu, bấm In: tab mới mở tới `/in/phieu-luong/<tháng>/<id>?in=1`, tab đó hiện phiếu A4 và mở hộp in. Ngăn kéo và Bảng lương ở tab cũ không đổi, không có hộp in nào mở ở tab cũ.
- Nút In bấm được ở phiếu Nháp, Chờ duyệt, Đã duyệt và Từ chối.

Test UI nên có (`PW_PORT=<cổng> npm --prefix web run test:ui`):

- thay test `:665`: giả `window.open` và `window.print` trước khi vào trang; bấm "In phiếu" của Lê Hoàng Nam (`GFT-0142`, đang Chờ duyệt) thì `window.open` được gọi đúng một lần với `/in/phieu-luong/2026-10/GFT-0142?in=1` và `window.print` không được gọi;
- lặp lại với một phiếu đã duyệt (`GFT-0101`) và một phiếu bị từ chối (`GFT-0156`): nút bấm được, URL đúng;
- trang in với `?in=1` gọi `window.print` đúng một lần (đã có ở `web/tests/payslip-a4.spec.ts`, không cần thêm).
