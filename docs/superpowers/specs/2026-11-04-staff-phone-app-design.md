# App nhân viên trên điện thoại (`/nv/*`) trên dữ liệu giả

- Ngày: 04/11/2026
- Loại: Architectural. Thay cả hệ thống con `/nv/*`: 5 màn, 2 hộp trượt, layout, service và dữ liệu giả mới.
- Trạng thái: tự duyệt theo ủy quyền trong `docs/superpowers/PROGRAM.md`; người dùng xem sau.
- Concept đã duyệt: hàng "Đợt 6" trên canvas, 7 board J1–J7. Người dùng duyệt ngày 04/11/2026 ("oke đó, duyệt").
  - Board: `PhoneHome`, `PhoneAttendance`, `PhoneDay`, `PhoneRequests`, `PhoneRequest`, `PhoneIncome`, `PhoneMe` (`.dc.html`).
  - Mọi câu chữ, con số và CSS nằm trong bộ sinh `gen-mobile.js`. Mục 2–8 chép lại từ đó.
  - Ảnh: `preview/phonehome.png`, `phoneattendance.png`, `phoneday.png`, `phonerequests.png`, `phonerequest.png`, `phoneincome.png`, `phoneme.png`.
  - Cả hai nằm trong scratchpad của session concept: `C:\Users\52.AI UD\AppData\Local\Temp\claude\C--Users-52-AI-UD-Project-Vladilena-Milize--claude-worktrees-admin-ui-concept-6445c9\e0f113d9-fd93-45b7-a7d6-cbcee0c30c32\scratchpad\`.
- Nền móng: `mock/clock.ts` (09:40 thứ Tư 28/10/2026), `mock/respond.ts`, phiên giả `mock/accounts.ts`.
- Chạy song song với ba nhánh Admin (`feat/admin-bell-attendance`, `feat/admin-payroll-kpi`, `feat/admin-staff-list`). Lead gộp ở cuối.

## Mục tiêu

1. Năm màn `/nv/hom-nay`, `/nv/cham-cong`, `/nv/yeu-cau`, `/nv/thu-nhap`, `/nv/toi` theo J1, J2, J4, J6, J7. Hai hộp trượt theo J3 (một ngày) và J5 (một yêu cầu). Thanh tab nổi 5 mục ở mọi màn.
2. Chạy hoàn toàn trên dữ liệu giả và không gọi `/api`. Mã cũ theo BE của app điện thoại bị thay hẳn.
3. Giữ đăng nhập staff ở `/dang-nhap`, đổi mật khẩu và đăng xuất ở màn Tôi.

## Quyết định đã có (người dùng, chuyển qua điều phối 04/11/2026)

1. Làm J1–J7 như board đã duyệt.
2. Chưa làm luồng **tạo** yêu cầu; người dùng sẽ chỉ điểm sau. J4 chỉ có nút "Tạo yêu cầu", chưa có luồng phía sau.
3. Chỉ hiện thông tin cốt lõi: mỗi dòng danh sách một giá trị chính. Lý do, khoảng ngày, người duyệt chỉ có trong hộp chi tiết (memory list-shows-essentials-only).
4. Không có ô nhập hay nhãn giá trị dạng viên thuốc trong nội dung. Ô nhập bo 8px; kết quả là chữ thường kèm chấm màu (memory no-pill-shaped-fields).
5. "Nghỉ ốm", "Phép năm" là **hình thức** nghỉ. **Lý do** là chữ tự do, một trường riêng. Nhóm gọi là "Đơn nghỉ" (memory leave-type-vs-reason).
6. Mọi người làm thứ Hai – thứ Bảy, công chuẩn 26 (memory mock-saturday-workday).
7. Design system GFT:
   - không đổ bóng;
   - vàng không làm chữ hay viền trên nền sáng;
   - mỗi màn tối đa một khối nền vàng;
   - Geist cho chữ; League Spartan 600 cho tiêu đề trang 28px.
8. Chỉ cài luật đã xác nhận. Thứ gì board có mà chưa ai quyết thì ghi phán quyết kèm lý do (mục 11), hoặc thành câu hỏi mở (mục 10).
9. Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc, không đọc `spec/` gốc. Không sửa file Admin.
10. Xác minh chỉ bằng test: `npm --prefix web run test:ui` (Playwright, cổng riêng `PW_PORT=4194`), và `npm test` ở gốc một lần cuối. Không có bước typecheck hay prettier.

## Ngoài phạm vi

- Luồng tạo yêu cầu: xin nghỉ, giải trình, tạm ứng, OT.
- Tháng khác tháng 10/2026. Dữ liệu giả chỉ có một kỳ (R4).
- Phiếu lương đầy đủ cho nhân viên. Trang in A4 `/in/phieu-luong/…` còn gọi `api()` (R6).
- Kịch bản `?kb=` cũ (ca đêm, CTV, TTS, quên Check-out) và các hộp trượt cũ (xin nghỉ, khai OT, khai ngày khác, tạm ứng, giải trình, KPI tự đánh giá).
- App nhân viên trên máy tính (`/nv-may-tinh`). Nó giữ nguyên và vẫn gọi `api()`.

## 1. Người và đồng hồ

- Người đăng nhập mẫu: **Lê Hoàng Nam**, chữ tắt `HN`, `nam.le@gft.vn`.
  - Mã GFT-0142, phòng Kinh doanh, chức danh Nhân viên kinh doanh.
  - Trạng thái Chính thức, vào làm 04/03/2024.
  - Ca HC 08:00–17:00, thứ Hai – thứ Bảy. Phép năm còn lại 11 ngày.
- App điện thoại luôn hiện hồ sơ của Nam, dù tên đăng nhập là gì (R2). `mock/accounts.ts` không đổi.
- Đồng hồ giả: `MOCK_NOW` (09:40 thứ Tư 28/10/2026), `MOCK_TODAY`, `MOCK_MONTH` của `mock/clock.ts`.

## 2. Dữ liệu giả (`web/src/mock/staff-phone.ts`, mới)

Một module giữ toàn bộ dữ liệu của Nam và các hàm dựng dữ liệu cho từng màn. Dữ liệu nằm trong bộ nhớ. Chỉ Check-out (mục 4.2) sửa được nó; tải lại trang thì về như cũ.

### 2.1 Ngày công tháng 10/2026

01/10 là thứ Năm. Chủ nhật (4, 11, 18, 25) không có ca. 29–31/10 chưa tới.

| Ngày | Nhóm | Vào – ra | Ghi chú |
|------|------|----------|---------|
| 01 | Đi làm | 07:55 – 17:05 | |
| 02 | Đi làm | 07:57 – 17:03 | |
| 03 | Đi làm | 07:50 – 17:08 | |
| 05 | Đi làm | 07:58 – 17:02 | |
| 06 | Đi làm | 07:54 – 17:06 | |
| 07 | Đi làm | 07:56 – 17:04 | |
| 08 | Đi làm | 07:59 – 17:01 | |
| 09 | Đi làm | 07:53 – 17:07 | |
| 10 | Đi làm | 07:51 – 17:05 | |
| 12 | Nghỉ có lương | — | Hình thức Phép năm, Cả ngày |
| 13 | Đi làm | 07:57 – 17:03 | |
| 14 | Đi làm | 07:55 – 17:09 | |
| 15 | Đi làm | 07:58 – 17:02 | |
| 16 | Đi làm | 07:52 – 17:06 | |
| 17 | Nghỉ có lương | — | Hình thức iSAT, Cả ngày |
| 19 | Đi làm | 07:56 – 17:04 | |
| 20 | Đi làm | 07:54 – 17:05 | |
| 21 | Đi làm | 07:57 – 17:03 | |
| 22 | Đi làm | 07:59 – 17:08 | |
| 23 | Đi làm | 07:58 – 17:02 | board |
| 24 | Đi làm | 07:52 – 17:04 | board |
| 26 | Đi làm | 07:56 – 17:10 | board |
| 27 | Cần xử lý | 08:12 – (chưa có) | Đi muộn 12 phút; giải trình gửi 20:14, giờ ra khai 17:30, chờ Admin duyệt |
| 28 | Hôm nay | 07:59 – (đang làm) | |

- Giờ của các ngày không có trên board là số giả. Giờ vào nằm trong 07:45–08:00, giờ ra trong 17:00–17:15, nên không ngày nào thành ngày cần giải trình theo luật đã chốt.
- Năm nhóm màu như bảng tuần của Admin:
  - Đi làm: nền `--surface-dark`, chữ trắng;
  - Đi muộn: nền `--gold`;
  - Nghỉ có lương: nền `--status-done` (#2f5aa8), chữ trắng;
  - Vắng: nền `--status-rejected` (#b43f3f), chữ trắng;
  - Cần xử lý: nền trắng, viền 2px `--status-pending` (#eb973d).
  - Thêm hai trạng thái phụ: chưa tới (nền `--page`, chữ đậm 500) và không có ca (chữ #9e9e9e, không nền). Hôm nay có thêm vòng 2px `--surface-dark` cách 2px.
- Dữ liệu tháng 10 không có ngày Đi muộn hay Vắng. Kiểu và CSS vẫn có đủ năm nhóm.

### 2.2 Bốn yêu cầu

Thứ tự mới nhất trước. Ngày giờ "Đã gửi" và "đã duyệt" của r1, r3, r4 là số giả (board không ghi).

| id | Tiêu đề | Loại (dòng phụ của hộp) | Biểu tượng | Trạng thái | Tháng |
|----|---------|-------------------------|-----------|------------|-------|
| `giai-trinh-2710` | Thiếu giờ ra 27/10 | Giải trình | clock | Chờ duyệt | 10 |
| `phep-1210` | Phép năm 12/10 | Đơn nghỉ | leave | Đã duyệt | 10 |
| `tam-ung-09` | Tạm ứng 1.500.000 ₫ | Tạm ứng lương | coin | Đã duyệt | 9 |
| `gio-vao-0909` | Khai giờ vào 09/09 | Giải trình | clock | Từ chối | 9 |

Chi tiết từng yêu cầu (mục 7):

- `giai-trinh-2710`:
  - Ngày: Thứ Ba 27/10/2026. Giờ vào: 08:12. Giờ ra khai: 17:30. Lý do: “Quên bấm Check-out khi về.”
  - Bước: Đã gửi (27/10 20:14, xong) → Chờ Admin duyệt (đang chờ, không có giờ).
- `phep-1210` (đúng board J5):
  - Ngày nghỉ: Thứ Hai 12/10/2026. Thời gian: Cả ngày. Hình thức: Phép năm. Lý do: “Việc gia đình.” Phép năm còn lại: 11 ngày.
  - Bước: Đã gửi (08/10 09:12) → Trưởng phòng Kinh doanh đã duyệt (09/10 10:30).
- `tam-ung-09`:
  - Số tiền: 1.500.000 ₫. Trừ vào lương: Tháng 9/2026.
  - Bước: Đã gửi (15/09 16:20) → Admin đã duyệt (16/09 09:05).
- `gio-vao-0909`:
  - Ngày: Thứ Tư 09/09/2026. Giờ vào khai: 08:00. Lý do: “Máy chấm công không nhận.”
  - Bước: Đã gửi (09/09 17:45) → Admin đã từ chối (10/09 10:15).

Nhãn trạng thái: Chờ duyệt (chấm `--status-pending`), Đã duyệt (chấm `--status-done`), Từ chối (chấm `--status-rejected`).

### 2.3 Thu nhập tháng 10/2026 (tạm tính, Admin đang duyệt phiếu)

- Thực nhận dự kiến 14.278.183 ₫. Tổng thu nhập 15.538.183. Khấu trừ 1.260.000.
- KPI: tổng điểm 66,14%. Lương KPI 1.322.800. Mức đề xuất 2.000.000.
  - Năm phần: Wework 62, Người dùng 70, Đồng nghiệp 68, Quản lý 65, Tự đánh giá 75.
  - Số khớp luật đã chốt: trọng số 40/24/18/12/6 cho ra 66,14%, nhân với 2.000.000 được 1.322.800. Màn không hiện trọng số.
- Các khoản:
  - Lương ngày công 11.076.923;
  - Nghỉ phép, iSAT 923.076;
  - Phụ cấp 2.215.384;
  - Lương KPI 1.322.800;
  - Bảo hiểm bắt buộc −1.260.000;
  - Thuế TNCN 0.
- Thực nhận 14.278.183 ₫.

## 3. Khung chung

### 3.1 Layout (`layouts/PhoneLayout.vue`, viết lại)

- Cột nội dung tối đa 430px giữa màn hình, nền `--ground` (#f5f5f5). Màn rộng hơn 430px: hai bên nền #e9e9e9, cột có viền 1px `--border` (như hiện có, không bóng).
- Mỗi màn tự dựng gốc `.ph`: đệm 20px 16px 112px, cột dọc, khoảng cách 16px, chữ 14px/20px, `tabular-nums`.
- Thanh tab nổi (`nav` tên "Điều hướng"):
  - cố định cách đáy 16px, rộng bằng cột trừ 16px mỗi bên, cao 68px;
  - nền trắng, viền 1px `--border`, bo 50px, không bóng.
- Năm liên kết, theo thứ tự:
  - Hôm nay (home), `/nv/hom-nay`;
  - Chấm công (cal), `/nv/cham-cong`;
  - Yêu cầu (doc), `/nv/yeu-cau`;
  - Thu nhập (wallet), `/nv/thu-nhap`;
  - Tôi (user), `/nv/toi`.
- Mỗi mục: biểu tượng 20px trong ô 44×30 bo 50px, nhãn 11px/14px `--muted`.
  - Mục đang mở có `aria-current="page"`. Nhãn đậm 600 màu `--text`; ô biểu tượng nền `--surface-dark`, biểu tượng `--gold`.

### 3.2 Biểu tượng (`components/PhIcon.vue`, mới)

- Bộ biểu tượng riêng của app điện thoại, chép nguyên đường vẽ trong `ICON` của `gen-mobile.js`: home, cal, doc, wallet, user, left, right, plus, pin, out, clock, leave, coin, lock, target, shield, gift, x.
- Nét 24×24 `currentColor`, `aria-hidden`.
- Prop `name`, `size` (mặc định 20), `stroke` (mặc định 1.8).

### 3.3 Chữ, màu, focus

- Tiêu đề trang (h1): League Spartan 600, 28px/32px. Tiêu đề khối (h2): Geist 600, 18px/24px. Chữ phụ `--muted` (#616161); chữ nhỏ 12px/16px.
- Thẻ trắng bo 24px. Không đổ bóng ở đâu cả.
- Focus: `outline: 2px solid var(--text); outline-offset: 2px`. Trên nền tối (thẻ đen ở J1, J6) dùng viền trắng (R9).
- Vàng chỉ làm nền (nút Check-out, dải đầu màn Tôi, ô ngày Đi muộn, đoạn đi muộn trên thanh giờ), hoặc làm chữ, biểu tượng trên nền tối.
- Mỗi màn tối đa một khối nền vàng: J1 nút Check-out, J7 dải đầu màn.

### 3.4 Lớp dùng chung (`styles/phone.css`, viết lại)

- Đặt dưới `.ph-app` (gốc layout) và `.ph-sheet` (hộp trượt teleport ra `body`).
- Các lớp chép từ CSS của `gen-mobile.js`: `.card`, `.sh`, `.lk`, `.rb`, `.dn` (+ năm nhóm, `fu`, `off`, `today`), `.dot` (+ `work`, `late`, `leave`, `absent`, `todo`, `pend`, `done`, `rej`), `.st`, `.ls`, `.ro`, `.ti`, `.kv`, `.b2`, `.mut`, `.sm`.

### 3.5 Hộp trượt (`components/BottomSheet.vue`, sửa)

- Giữ hành vi:
  - teleport vào `body`;
  - khoá cuộn;
  - bẫy focus;
  - Esc chỉ đóng hộp trên cùng;
  - bấm nền mờ thì đóng;
  - kéo thanh nắm xuống quá 90px thì đóng;
  - trả focus về phần tử đã mở hộp.
- Đổi hình theo board:
  - nền mờ `rgba(28, 28, 28, 0.4)`;
  - hộp trắng bo 24px phía trên, đệm 8px 20px 24px, khoảng cách 16px;
  - thanh nắm 40×4 #e0e0e0;
  - không có nút ×.
- Đầu hộp:
  - trái: h2 18px/24px, dưới là dòng phụ `--muted`;
  - phải: slot `badge` cho nhãn trạng thái.
  - `aria-label` của dialog là tiêu đề.
- Thân hộp ở slot mặc định. Nút đóng của từng hộp nằm ở thân (nút "Đóng" của J3, J5; "Huỷ" của Đổi mật khẩu).
- Ô nhập trong hộp bo 8px (đang là 12px).

### 3.6 Chọn tháng (`components/MonthSwitch.vue`, viết lại)

- Hàng ba phần:
  - nút tròn 40px "Tháng trước" (left);
  - giữa: nhãn 16px/22px đậm ("Tháng 10/2026"), dưới là trạng thái 12px `--muted`;
  - nút tròn "Tháng sau" (right).
- Dữ liệu chỉ có tháng 10, nên cả hai nút đều `disabled` (R4). Biểu tượng nút tắt màu #bdbdbd.

### 3.7 Dòng yêu cầu (`components/RequestRow.vue`, mới)

- Dùng ở J1 và J4. Là `RouterLink` tới `/nv/yeu-cau?yc=<id>` (R5). Chiều cao tối thiểu 56px.
- Bên trong:
  - ô biểu tượng 40px bo 12px nền `--page`;
  - tiêu đề một dòng, cắt bằng dấu ba chấm;
  - nhãn trạng thái: chấm 8px + chữ 13px.
- Tên truy cập là "<tiêu đề>, <trạng thái>".

### 3.8 Route (`router/routes/staff-phone.ts`)

- Năm route giữ đường dẫn, tên và tiêu đề như cũ: Hôm nay, Chấm công, Yêu cầu, Thu nhập, Tôi.
- Hộp trượt mở theo tham số:
  - `/nv/cham-cong?ngay=YYYY-MM-DD`;
  - `/nv/yeu-cau?yc=<id>`;
  - `/nv/toi?hop=doi-mat-khau`.
- Tham số lạ (ngày không có dữ liệu, id không có) thì bỏ khỏi URL bằng `replace` và không mở gì.
- Đóng hộp thì bỏ tham số bằng `replace`.

## 4. J1 · Hôm nay (`views/staff-phone/HomeView.vue`)

Từ trên xuống:

### 4.1 Lời chào

- Ô chữ tắt 48px nền `--gold-light` (#fce8b2) chữ "HN".
- Giữa: "Chào buổi sáng" (`--muted`), dưới là "Lê Hoàng Nam" 18px/24px đậm.
- Phải: "Thứ Tư" xuống dòng "28/10/2026", 12px `--muted`, canh phải.

### 4.2 Thẻ ca hôm nay

- Thẻ nền `--surface-dark`, bo 24px, đệm 20px, chữ trắng, `aria-label` "Ca hôm nay".
- Hàng đầu: trái "Ca HC · 08:00–17:00" (#9e9e9e); phải là chấm vàng 8px + "Đang trong ca" (trắng, 13px).
- Vòng cung SVG 240×132:
  - nền nét #2a2a2a dày 14;
  - phần đã làm nét `--gold`, dài theo tỉ lệ phút đã làm / 540;
  - núm tròn r9 vàng viền `--surface-dark`.
- Giữa vòng cung: "1g 41p" (32px/40px đậm). Dưới: "đã làm · vào 07:59" (#9e9e9e).
  - Phút đã làm = giờ đồng hồ giả − giờ vào = 09:40 − 07:59 = 101 phút.
- Dưới vòng cung: "08:00" và "17:00" ở hai đầu, 12px #9e9e9e.
- Nút "Check-out" (`button`): cao 52px, bo 8px, nền `--gold`, chữ `--text` 16px đậm, biểu tượng out.
  - Theo sau là "· 09:40" (14px thường), giờ của đồng hồ giả.
  - Tên truy cập: "Check-out lúc 09:40".
- Dòng cuối: biểu tượng pin + "Đúng vị trí văn phòng GFT", 13px #9e9e9e.
- Bấm Check-out (R7):
  - mock ghi giờ ra 09:40 cho 28/10;
  - phải hàng đầu đổi thành "Đã check-out", không chấm vàng;
  - dòng dưới số đổi thành "đã làm · vào 07:59 · ra 09:40"; vòng cung giữ 101 phút;
  - nút và dòng vị trí biến mất.
  - Các màn khác đọc cùng dữ liệu: J3 của 28/10 và dòng "Gần đây" hiện giờ ra 09:40. Tải lại trang thì về như cũ.

### 4.3 Thẻ "Tuần này"

- Thẻ trắng, đệm 16px. Hàng đầu: h2 "Tuần này"; phải là "26/10 – 01/11" (`--muted`).
- Lưới 7 cột. Mỗi cột có nhãn thứ T2…CN (12px `--muted`) và ô ngày 40px:
  - 26 Đi làm;
  - 27 Cần xử lý;
  - 28 Đi làm + hôm nay;
  - 29, 30, 31 chưa tới;
  - 01 không có ca.
- Ngày có dữ liệu (26, 27, 28) là liên kết tới `/nv/cham-cong?ngay=<ngày>`. Ngày chưa tới và không có ca là `span role="img"`.
- `aria-label` mỗi ô:
  - "Thứ Hai 26/10: đi làm";
  - "Thứ Ba 27/10: cần xử lý";
  - "Hôm nay, thứ Tư 28/10: đang làm";
  - "Thứ Năm 29/10: chưa tới" (tương tự 30, 31);
  - "Chủ nhật 01/11: không có ca".
- Dưới lưới là một liên kết nhắc việc:
  - cao ≥ 48px, bo 12px, nền `--page`;
  - chấm Cần xử lý + "27/10 thiếu giờ ra · chờ duyệt giải trình" + mũi tên right;
  - tới `/nv/cham-cong?ngay=2026-10-27`.

### 4.4 Thẻ thu nhập

- Cả thẻ là liên kết tới `/nv/thu-nhap`.
- Trái: "Thu nhập tháng 10 · tạm tính" (`--muted`), dưới là "14.278.183" 24px/32px đậm + " ₫" 16px `--muted`.
- Phải: mũi tên right.

### 4.5 "Yêu cầu của tôi"

- Hàng đầu: h2 "Yêu cầu của tôi"; phải là liên kết gạch chân "Xem tất cả" tới `/nv/yeu-cau`.
- Thẻ danh sách 2 dòng `RequestRow` mới nhất: "Thiếu giờ ra 27/10 · Chờ duyệt", "Phép năm 12/10 · Đã duyệt".

## 5. J2 · Chấm công (`views/staff-phone/AttendanceView.vue`)

- Đầu trang: h1 "Chấm công"; dưới là "Ca HC 08:00–17:00 · thứ Hai – thứ Bảy" (`--muted`).
- `MonthSwitch`: "Tháng 10/2026", trạng thái "Kỳ công đang mở".
- Ba ô số (lưới 3 cột, khoảng 8px; ô trắng bo 16px, đệm 14px 14px 12px; `role="group"` tên "Chỉ số tháng 10"):
  - "21" + " / 26" (16px `--muted`) — Ngày công;
  - "1" — Lần đi muộn;
  - "2" — Ngày nghỉ có lương.
  - Số 24px/30px đậm, nhãn 12px `--muted`. Ba số là hằng số của board (R8).
- Thẻ lịch (`aria-label` "Lịch tháng 10"):
  - lưới 7 cột: hàng nhãn T2…CN, ba ô trống, rồi 31 ngày tô theo mục 2.1;
  - ngày có dữ liệu là `button` mở J3, tên truy cập kiểu "Thứ Hai 26/10: đi làm" (hôm nay là "Hôm nay, thứ Tư 28/10: đang làm");
  - Chủ nhật và ngày chưa tới là `span role="img"` cùng kiểu nhãn ("Chủ nhật 04/10: không có ca", "Thứ Năm 29/10: chưa tới").
- Chú giải dưới lịch (ngăn bằng đường kẻ 1px `--border`, 12px `--muted`): Đi làm, Đi muộn, Nghỉ có lương, Cần xử lý, mỗi mục một chấm màu.
- "Gần đây": h2, rồi thẻ danh sách 5 dòng `button`. Mỗi dòng: chấm nhóm, ngày (cắt dấu ba chấm), giờ (đậm).
  - Thứ Tư 28/10 · 07:59 – … (hoặc 07:59 – 09:40 sau Check-out)
  - Thứ Ba 27/10 · 08:12 – ?
  - Thứ Hai 26/10 · 07:56 – 17:10
  - Thứ Bảy 24/10 · 07:52 – 17:04
  - Thứ Sáu 23/10 · 07:58 – 17:02
  - Bấm dòng mở J3 của ngày đó.
- Mở J3: `router.replace` thêm `?ngay=<ngày>`. Đóng thì bỏ `ngay`.

## 6. J3 · Hộp trượt một ngày (`components/DaySheet.vue`)

Mở trên J2. Board là ngày 27/10. Các ngày khác dùng cùng khuôn.

- Đầu hộp:
  - tiêu đề "Thứ Ba 27/10/2026";
  - dòng phụ "Ca HC 08:00–17:00";
  - nhãn trạng thái phải: chấm + chữ. Đi làm, Đang làm (hôm nay), Cần xử lý, Nghỉ có lương, Đi muộn, Vắng.
- Thanh giờ (ngày có giờ vào):
  - thanh cao 12px bo 50px nền `--page`, trục 08:00–17:00;
  - đoạn đi muộn (từ 08:00 tới giờ vào) nền `--gold`;
  - đoạn đã làm (từ max(giờ vào, 08:00) tới min(giờ ra, 17:00)) nền `--surface-dark`;
  - chưa có giờ ra:
    - ngày đã qua: đoạn từ giờ vào tới 17:00 là sọc `repeating-linear-gradient(90deg, #1c1c1c 0 6px, transparent 6px 10px)`, độ mờ 0.35;
    - hôm nay: đoạn đã làm dừng ở giờ đồng hồ giả.
  - Dưới thanh: "08:00", "12:30", "17:00" (12px `--muted`). Thanh có `aria-hidden`.
- Các dòng khoá–giá trị (`.kv`):
  - ngày có giờ vào: Giờ vào; Giờ ra ("Chưa có" khi chưa có); Đi muộn ("12 phút", chỉ khi có);
  - ngày nghỉ: Hình thức (Phép năm / iSAT); Thời gian (Cả ngày). Không có thanh giờ.
- Hộp giải trình (chỉ ngày có giải trình, ở đây 27/10):
  - nền `--gold-pale`, bo 12px, đệm 12px 14px, chấm Chờ duyệt;
  - "Đã gửi giải trình lúc 20:14" (đậm), dưới là "Giờ ra khai 17:30 · chờ Admin duyệt" (`--muted`).
- Nút "Đóng" (`.b2`): cao 48px, bo 8px, viền 1px `--control` (#8a8a8a), chữ đậm.

## 7. J4 · Yêu cầu của tôi (`views/staff-phone/RequestsView.vue`) và J5 · Hộp trượt một yêu cầu (`components/RequestSheet.vue`)

### 7.1 J4

- Đầu trang: h1 "Yêu cầu". Phải là nút "Tạo yêu cầu":
  - cao 40px, bo 8px, nền `--surface-dark`, chữ trắng đậm, biểu tượng plus;
  - bấm thì hiện thông báo nổi "Chưa có luồng tạo yêu cầu trong bản mockup." (R3).
- Thanh lọc `role="tablist"` tên "Lọc theo trạng thái":
  - nền trắng bo 50px, đệm 4px;
  - bốn `role="tab"`: "Tất cả 4", "Chờ duyệt 1", "Đã duyệt 2", "Từ chối 1". Số đếm tính từ dữ liệu;
  - tab chọn nền `--surface-dark` chữ trắng đậm; các tab khác chữ `--muted` 13px;
  - phím trái / phải chuyển tab, Home / End về đầu / cuối; chỉ tab chọn có `tabindex=0`.
- Danh sách nằm trong `role="tabpanel"`, nhóm theo tháng gửi:
  - nhãn nhóm "Tháng 10", "Tháng 9" (12px đậm `--muted`, chữ hoa, giãn 0.04em);
  - mỗi nhóm một thẻ danh sách `RequestRow`;
  - nhóm không còn dòng sau khi lọc thì ẩn.
- Tab đang chọn chỉ nằm trong màn, không ghi lên URL.
- Bấm dòng thì `router.replace` thêm `?yc=<id>` và mở J5. Đóng thì bỏ `yc`.

### 7.2 J5

- Đầu hộp: tiêu đề (vd. "Phép năm 12/10"), dòng phụ là loại ("Đơn nghỉ"), nhãn trạng thái phải.
- Các dòng khoá–giá trị theo mục 2.2. Lý do đặt trong ngoặc kép cong như board.
- Các bước (`aria-label` "Các bước"):
  - mỗi bước một chấm 12px trên đường dọc 2px `--border` nối các bước;
  - chấm theo trạng thái bước: xong `--status-done`, đang chờ `--status-pending`, từ chối `--status-rejected`;
  - chữ bước đậm, dưới là thời điểm (`--muted`). Bước đang chờ không có thời điểm.
- Nút "Đóng".

## 8. J6 · Thu nhập (`views/staff-phone/IncomeView.vue`) và J7 · Tôi (`views/staff-phone/ProfileView.vue`)

### 8.1 J6

- Đầu trang: h1 "Thu nhập"; dưới là "Phiếu chính thức có khi Admin duyệt".
- `MonthSwitch`: "Tháng 10/2026", trạng thái "Tạm tính".
- Thẻ đen (`aria-label` "Thực nhận tháng 10"):
  - "Thực nhận dự kiến" (#9e9e9e);
  - "14.278.183" 32px/40px đậm + " ₫" 20px #9e9e9e;
  - chấm Chờ duyệt + "Admin đang duyệt phiếu" (13px trắng);
  - lưới 2 ô nền #2a2a2a bo 16px: "Tổng thu nhập" 15.538.183, "Khấu trừ" 1.260.000 (nhãn 12px #9e9e9e, số 16px đậm).
- Thẻ KPI (`aria-label` "KPI tháng 10"):
  - hàng đầu: h2 "KPI tháng 10"; phải là "5 phần" (`--muted`);
  - bán nguyệt chấm SVG 248×124: ba vòng bán kính 78/94/110, mỗi vòng 14/17/20 chấm r4.6. Chấm có vị trí ≤ 66,14% tô `--surface-dark`, còn lại #e0e0e0;
  - giữa: "66,14%" 28px đậm, dưới là "Tổng điểm" (12px `--muted`);
  - hai dòng: "Lương KPI" `--muted` / 1.322.800 đậm; "Mức đề xuất" `--muted` / 2.000.000;
  - lưới 5 cột: số điểm 16px đậm, dưới là tên phần 12px `--muted`. Ngăn với phần trên bằng đường kẻ.
- "Các khoản":
  - h2, rồi thẻ danh sách 6 dòng. Mỗi dòng: ô biểu tượng, tên, số đậm;
  - Thuế TNCN 0 viết chữ thường màu #757575;
  - dòng cuối kẻ trên 1px `--text`: "Thực nhận" / "14.278.183 ₫", 16px đậm.
- Không có liên kết "Xem phiếu lương đầy đủ" (R6).

### 8.2 J7

- Dải đầu màn:
  - nền `--gold`, cao 150px, bo dưới 32px, tràn hết bề ngang cột;
  - h1 "Tôi" 22px/28px League Spartan, giữa, cách trên 20px (R10).
  - Màn này gốc `.ph` không có đệm trên.
- Khối định danh, chồng lên dải (lề trên −76px), canh giữa:
  - ô chữ tắt 96px nền `--gold-light` viền 4px màu nền trang, chữ "HN" 28px;
  - "Lê Hoàng Nam" 20px/28px đậm;
  - "nam.le@gft.vn" (`--muted`);
  - chấm Đi làm + "Chính thức".
- "Công việc":
  - h2, rồi thẻ khoá–giá trị: Mã nhân viên GFT-0142; Phòng ban Kinh doanh; Chức danh Nhân viên kinh doanh; Ca làm HC 08:00–17:00; Ngày vào làm 04/03/2024; Phép năm còn lại 11 ngày;
  - dưới thẻ: "Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa." (12px `--muted`).
- Thẻ thao tác, hai `button` cao ≥ 56px:
  - "Đổi mật khẩu" (lock, mũi tên right): mở `ChangePasswordSheet`, URL thêm `?hop=doi-mat-khau`;
  - "Đăng xuất" (out, chữ và biểu tượng #b43f3f): gọi `logout()` rồi về `/dang-nhap`.
- `ChangePasswordSheet` giữ như cũ:
  - ba ô mật khẩu, mật khẩu mới ≥ 6 ký tự, hai lần nhập phải giống;
  - "Huỷ" / "Đổi mật khẩu"; mockup luôn thành công;
  - dòng phụ "Tài khoản <tên đăng nhập của phiên>".

## 9. Mã cũ, service, mục lục, test

### 9.1 Service (`web/src/services/staff-phone.ts`, viết lại)

- Mọi hàm trả `respond(...)` của dữ liệu ở mục 2:
  - `getHome()`, `getAttendance(month)`, `getDay(date)` (null khi không có);
  - `getRequests()`, `getRequest(id)` (null khi không có);
  - `getIncome(month)`, `getProfile()`, `checkOut()`.
- Đổi mật khẩu và đăng xuất dùng lại `services/session.ts`.
- Không có `api(` hay `fetch(`.
- `getSelfKpi` và `saveSelfKpi` (màn máy tính còn dùng) chuyển nguyên văn sang `services/staff-desktop.ts` (R11).

### 9.2 Xoá

- `builders/staff-phone/` (cả thư mục).
- Các file trong `views/staff-phone/components/`: `AdvanceSheet.vue`, `AttendanceCalendar.vue`, `DayDetailSheet.vue`, `DayRequestSheet.vue`, `ExplanationSheet.vue`, `IncomeSlip.vue`, `KpiSelf.vue`, `LoadFeedback.vue`. `MonthSwitch.vue` được viết lại.
- Chỉ màn điện thoại dùng các file này. `builders/staff-requests/` và `services/staff-requests.ts` giữ nguyên vì màn máy tính còn dùng.

### 9.3 Mục lục thiết kế (`design-index/staff-phone.ts`)

Thay 21 dòng cũ bằng 8 dòng (`file` là tên board):

- J1 `PhoneHome.dc.html`: "Hôm nay · đang trong ca" → `/nv/hom-nay`.
- J2 `PhoneAttendance.dc.html`: "Chấm công · tháng 10" → `/nv/cham-cong`.
- J3 `PhoneDay.dc.html`: "Hộp trượt · một ngày chấm công (27/10)" → `/nv/cham-cong?ngay=2026-10-27`.
- J4 `PhoneRequests.dc.html`: "Yêu cầu của tôi" → `/nv/yeu-cau`.
- J5 `PhoneRequest.dc.html`: "Hộp trượt · một yêu cầu (Phép năm 12/10)" → `/nv/yeu-cau?yc=phep-1210`.
- J6 `PhoneIncome.dc.html`: "Thu nhập · tháng 10 tạm tính" → `/nv/thu-nhap`.
- J7 `PhoneMe.dc.html`: "Tôi" → `/nv/toi`.
- `nv-sheet-doi-mat-khau.html`: "Hộp trượt · đổi mật khẩu" → `/nv/toi?hop=doi-mat-khau`.

### 9.4 Test

- Test mới: Playwright, khung 390×844.
  - Phiên giả là nhân viên: `localStorage['aicb.mock.session'] = 'nhanvien'` qua `addInitScript`.
  - Mỗi file một nhóm màn. Mỗi file có test đầu kiểm bộ ghi request `/api` rỗng.
  - Không dùng `page.route`.
- Kiểm theo tên truy cập và chữ thấy được: số, nhãn, liên kết, hộp trượt mở / đóng, focus trả về, tham số URL.
- `tests/staff-ux.spec.ts`: bỏ các test `fixme` của app điện thoại cũ và dữ liệu giả của chúng. Giữ vòng test `fixme` của màn máy tính cùng hàm `mockStaffApi` nó dùng.
- `tests/auth-mock.spec.ts` phải xanh nguyên văn, đặc biệt "staff login on a phone can sign out from the Tôi tab".

## 10. Câu hỏi còn mở (hỏi người dùng một lần, chưa tự chốt)

1. **Nhân viên có được xem điểm KPI từng phần không?**
   - Bối cảnh: J6 cho Nam thấy tổng 66,14% và năm điểm. Wework 62, Người dùng 70, Đồng nghiệp 68, Quản lý 65, Tự đánh giá 75.
   - App cũ chỉ cho nhân viên nhập điểm Tự đánh giá.
   - Hai hướng: (a) hiện như board; (b) chỉ hiện tổng 66,14% và Lương KPI 1.322.800.
   - Bản này làm theo (a).
2. **Có giữ ô "Tự đánh giá" cho nhân viên tự nhập như app cũ (`KpiSelf.vue`) không?**
   - Bối cảnh: app cũ có ô để Nam tự chấm, ví dụ 75, trước khi kỳ chốt. Board đã bỏ ô này, nên điểm 75 do Admin nhập ở phiếu lương.
   - Bản này bỏ ô.
3. **Luồng tạo yêu cầu.** Người dùng sẽ chỉ điểm sau. Hiện nút "Tạo yêu cầu" chỉ hiện thông báo nổi.
4. **Check-out sớm.**
   - Bối cảnh: luật đã chốt nói về sớm bao nhiêu cũng phải giải trình. Ví dụ Nam bấm Check-out lúc 09:40 thì sớm 7 giờ 20 phút.
   - Hai hướng: (a) app hỏi xác nhận rồi mở ngay hộp giải trình; (b) cứ ghi giờ ra, ngày thành "Cần xử lý", Nam giải trình sau.
   - Bản này chỉ ghi giờ ra trong bộ nhớ, chưa đổi nhóm của ngày (R7). Câu này thuộc luồng tạo yêu cầu.
5. **"Xem phiếu lương đầy đủ" mở gì?** Ví dụ: trang in A4 của Admin, hay một hộp trượt phiếu GFT rút gọn trên điện thoại. Bản này bỏ liên kết (R6).

## 11. Phán quyết đã ghi

- Ruling: R1 — 5 màn viết lại tại chỗ (cùng tên file, cùng route). `BottomSheet`, `ChangePasswordSheet`, `useHop` giữ và sửa nhẹ. Phần còn lại của `components/` và `builders/staff-phone/` bị xoá (mục 9.2) — mọi file đó dựng dữ liệu theo định dạng BE, không còn ai gọi — rủi ro nếu sai: lấy lại từ git khi làm luồng tạo yêu cầu.
- Ruling: R2 — app điện thoại luôn hiện hồ sơ Lê Hoàng Nam, không đọc tên của phiên giả. `mock/accounts.ts` giữ "Nguyễn Thu Hà" cho mọi nhân viên — board dùng Nam; `mock/accounts.ts` là file đăng nhập dùng chung với màn máy tính và test đăng nhập — rủi ro nếu sai: sau khi gộp, đổi tên mặc định của nhân viên trong `accounts.ts` thành Nam.
- Ruling: R3 — "Tạo yêu cầu" là nút thật, bấm hiện thông báo nổi (`toast`), không mở hộp nào — quyết định 2 yêu cầu có nút mà chưa có luồng; nút không phản hồi gì thì người dùng tưởng hỏng — rủi ro nếu sai: bỏ một dòng gọi `toast`.
- Ruling: R4 — dữ liệu giả chỉ có tháng 10/2026. Hai nút chọn tháng của J2, J6 đều tắt — board vẽ "Tháng trước" bật, nhưng tháng 9 cần cả lịch công lẫn phiếu lương bịa thêm; nút bật mà không có dữ liệu là nút giả — rủi ro nếu sai: thêm dữ liệu tháng 9 và bật nút.
- Ruling: R5 — mọi dòng yêu cầu (J1, J4) mở J5 theo `?yc=<id>`, kể cả giải trình 27/10. Board J4 cho r1 sang J3, board J1 cho r1 sang J4 — một quy tắc cho mọi dòng dễ đoán hơn; J5 của r1 có đủ ngày, giờ khai, lý do; J3 vẫn có hộp giải trình — rủi ro nếu sai: đổi `to` của dòng giải trình sang `/nv/cham-cong?ngay=…`.
- Ruling: R6 — bỏ liên kết "Xem phiếu lương đầy đủ" ở J6 — trang in A4 còn gọi `api()`, vi phạm mục tiêu 2; chưa có phiếu nhân viên trên dữ liệu giả (câu hỏi 5) — rủi ro nếu sai: thêm lại liên kết sau khi gộp `mock/payroll.ts`.
- Ruling: R7 — Check-out ghi giờ ra 09:40 vào dữ liệu trong bộ nhớ và đổi thẻ ca sang trạng thái đã ra. Nhóm của ngày không đổi, không hỏi xác nhận — board chỉ vẽ trạng thái đang trong ca; giải trình về sớm thuộc luồng tạo yêu cầu (câu hỏi 4); nút chính của màn mà không làm gì là nút giả — rủi ro nếu sai: thêm bước xác nhận hoặc mở hộp giải trình khi có luồng.
- Ruling: R8 — ba ô số của J2 và các tổng của J6 là hằng số chép từ board, không tính từ bảng ngày — "21 / 26", "1 lần đi muộn" là số của Bảng lương; cách tính ngày công khi còn giải trình chờ duyệt chưa chốt cho màn nhân viên — rủi ro nếu sai: viết hàm tính khi luật chốt.
- Ruling: R9 — focus 2px `--text`; phần tử trên nền tối dùng viền trắng — viền #212121 trên thẻ #1c1c1c không thấy được; lệ của Admin là 2px `--text` — rủi ro nếu sai: một luật CSS.
- Ruling: R10 — h1 "Tôi" trong dải vàng giữ 22px/28px như board, không phải 28px — board đã duyệt đặt cỡ này cho dải 150px — rủi ro nếu sai: đổi một cỡ chữ.
- Ruling: R11 — `getSelfKpi`, `saveSelfKpi` chuyển nguyên văn sang `services/staff-desktop.ts` — màn máy tính import hai hàm này từ `staff-phone.ts`; viết lại `staff-phone.ts` sẽ làm gãy màn máy tính, mà màn máy tính ngoài phạm vi — rủi ro nếu sai: không có, hành vi giữ nguyên.
- Ruling: R12 — biểu tượng của app điện thoại nằm trong `PhIcon.vue` riêng, không thêm vào `components/ui/icons.ts` — board có doc, wallet, leave, coin mà bộ chung không có; `icons.ts` là file chung với Admin, ba nhánh Admin có thể cùng sửa — rủi ro nếu sai: gộp vào `icons.ts` sau, đổi `PhIcon` thành `Icon`.
- Ruling: R13 — hộp trượt mở qua tham số riêng `?ngay=`, `?yc=` thay vì `?hop=` — một khoá mang luôn đối tượng cần mở, như `?nv=` của Nhân sự; `?hop=` giữ cho đổi mật khẩu — rủi ro nếu sai: đổi tên khoá ở hai màn.
- Ruling: R14 — số liệu của app điện thoại là dữ liệu giả riêng (`mock/staff-phone.ts`), không đọc `mock/attendance.ts`, `mock/payroll.ts` — hai file đó thuộc nhánh Admin chưa gộp; nhánh chuông còn ghi 17/10 đi làm và 5 ngày phép, lệch board — rủi ro nếu sai: lệch số giữa Admin và nhân viên cho tới khi lead nối hai nguồn (plan, mục "Xung đột khi gộp").
- Ruling: R15 — model worker Luna (`gpt-6-luna`) của `skills/superpowers-luna-workers` không có trong Claude Code. Implementer và reviewer là subagent của tool Agent; lead không sửa mã — điều phối yêu cầu subagent-driven-development; skill nói không có Luna thì báo, không tự làm, nên lead báo ở đây và giao cho subagent — rủi ro nếu sai: không có cho mã; chỉ khác người làm.
