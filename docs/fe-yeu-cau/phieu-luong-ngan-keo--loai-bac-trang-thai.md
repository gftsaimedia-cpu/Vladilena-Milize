# Ngăn kéo phiếu lương: Loại, bậc, trạng thái nhân sự, phép còn lại

Viết theo main `19bdf03`. Đường dẫn và số dòng dưới đây là của commit đó (các tệp của Bảng lương không đổi so với nhánh hiện tại).

Trên BE thật, ngăn kéo luôn ghi "NV · Bậc 0" cho mọi người, và ô "Ngày phép năm còn lại" có thể ghi "null ngày". Việc cần làm: đọc loại, bậc, trạng thái nhân sự và phép còn lại từ phiếu BE.

## 1. Người dùng đã chốt (2026-11-05)

- Ngày phép năm còn lại tính tới hết tháng của phiếu.
- BE tính sẵn mọi số vào phiếu; FE chỉ trình bày. Branch BE này không sửa mã FE; tài liệu này giao cho agent FE.

### Gợi ý thiết kế (agent thiết kế tự quyết)

- Đầu phiếu ghi loại, bậc và trạng thái nhân sự thật của người đó (BE nay trả các trường này).
- Người thuộc loại không có tài khoản phép (ví dụ `tts`) có `remainingAnnualLeaveDays` là `null`: hiện "—", không ghi "null ngày".
- Phiếu đã lưu trước khi BE thêm trường mới thiếu các trường này: hiện "—".

## 2. Dữ liệu BE

Trong `payslip.details` của `GET /api/v2/payroll/:month/:employeeId`:

```json
{
  "employeeType": "tts",
  "level": 1,
  "employmentStatus": "probation",
  "contractStatusText": "Dưới 3 tháng",
  "remainingAnnualLeaveDays": null
}
```

- `employeeType`: `nv`, `ctv`, `tts`; `null` khi nhân sự chưa có loại.
- `level`: số nguyên, mặc định 1.
- `employmentStatus`: `probation` (Thử việc), `official` (Chính thức), hoặc `null`. Khác với `contractStatusText` (nhãn hợp đồng "HĐLĐ từ 3 tháng" / "Dưới 3 tháng").
- `remainingAnnualLeaveDays`: số (có thể 0 hoặc âm nếu đã dùng quá số dư), hoặc `null` khi loại nhân sự không có tài khoản phép. Trước đây BE ghi cứng 22.
- Phiếu cũ không có ba trường đầu (giá trị `undefined`).

## 3. Mã cần đổi / xoá

- `web/src/builders/api/payroll.ts`:
  - dòng 175–176: `kind: 'NV'`, `level: 0` ghi cứng. Đổi sang `employeeType` (`nv` thành NV, `ctv` thành CTV, `tts` thành TTS; thiếu thì "—") và `level`;
  - kiểu `PayslipDetailDTO` (dòng 133 và quanh đó): thêm `employeeType`, `level`, `employmentStatus`; `remainingAnnualLeaveDays: number` thành `number | null`;
  - dòng 200 `leaveLeft: d.remainingAnnualLeaveDays`: giữ `null`;
  - thêm `employmentStatus` vào `Payslip` (Thử việc / Chính thức / không có).
- `web/src/mock/payroll.ts`: dòng 22 `kind: 'NV'` đổi thành `kind: string`; dòng 34 `leaveLeft: number` thành `number | null`; dòng 257 (`kind: 'NV'` trong dữ liệu mẫu) theo kiểu mới. Cho phiếu mẫu có `employmentStatus` khác nhau và một phiếu `leaveLeft: null`.
- `web/src/views/admin/payroll/payslip/PayslipDrawer.vue`: dòng 149 `{{ slip.kind }} · Bậc {{ slip.level }}` giữ cách ghi nhưng nay có giá trị thật; dòng 151–154 ô "Tình trạng" đang ghi nhãn hợp đồng (`slip.contract`): thêm trạng thái nhân sự vào ngăn kéo (cạnh nhãn hợp đồng hoặc ô riêng; agent thiết kế chọn; không hiện khi không có).
- `web/src/views/admin/payroll/payslip/SlipSummary.vue:159` `{{ slip.leaveLeft }} ngày`: khi `leaveLeft` là `null` in "—" (không kèm chữ "ngày").
- Nơi khác đọc `leaveLeft` hay `kind` của `Payslip`: tìm bằng `git grep -n "leaveLeft" -- web/src/views/admin/payroll` rồi theo kiểu mới.
- Bản in A4 có phần tương ứng riêng, xem `in-phieu-luong-a4--noi-api-v2.md`.

## 4. Cách kiểm

Thấy được:

- Ngăn kéo của người `nv` bậc 2 ghi "NV · Bậc 2"; của `tts` bậc 1 ghi "TTS · Bậc 1"; người chưa có loại ghi "—".
- Trạng thái nhân sự hiện đúng: Thử việc / Chính thức; không có thì không hiện ô.
- "Ngày phép năm còn lại": số ngày thật, hoặc "—" khi `null`; không bao giờ có chữ "null".
- Phiếu cũ thiếu trường mới: các ô đó "—", ngăn kéo vẫn mở được.

Test UI nên có (`PW_PORT=<cổng> npm --prefix web run test:ui`):

- kiểm hàm `payslipFromRecord` trong Node, cùng kiểu `web/tests/payroll-mock.spec.ts`, với bản ghi nhỏ: `employeeType: 'tts'`, `level: 1`, `employmentStatus: 'probation'`, `remainingAnnualLeaveDays: null` cho `kind` "TTS", `level` 1, trạng thái Thử việc, `leaveLeft` `null`; và bản ghi thiếu cả ba trường cho "—";
- giao diện (mock): ngăn kéo có `leaveLeft: null` không chứa chữ "null"; `web/tests/payroll-ux.spec.ts:295` (`NV · Bậc 2`) vẫn xanh.
