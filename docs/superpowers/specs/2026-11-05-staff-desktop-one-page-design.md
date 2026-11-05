# Nhân viên trên máy tính: một trang ba cột, mốc 1136px, trên dữ liệu giả

- Ngày: 05/11/2026
- Loại: Architectural. Thay cả hệ thống con `/nv-may-tinh` bằng một trang máy tính dùng chung đường dẫn `/nv/*` với app điện thoại. Có layout mới, cách chọn giao diện theo bề ngang, ngăn kéo phải, và xoá mã cũ theo BE.
- Trạng thái: chờ người dùng duyệt spec.
- Concept: canvas "Admin Dashboard Concept" (https://claude.ai/artifact/6ro7y3NXoqxGWHfVsBr1Hd), bản 1793866489-81bc.
  - Đợt 7: K1 `StaffDesktop.dc.html` (trang ba cột), K2 `StaffDesktopDay.dc.html` (ngăn kéo một ngày), ghi chú n7 (mốc 1136px).
  - Đợt 10: K3b `StaffDesktopRequest.dc.html` (ngăn kéo một yêu cầu bị từ chối, có lý do của Admin), J5b `PhoneRequestRejected.dc.html` (cùng nội dung trên điện thoại).
  - Người dùng chốt mốc: "Chốt 1136px" (memory staff-desktop-breakpoint).
- Nền móng: app điện thoại J1–J7 đã gộp (spec `2026-11-04-staff-phone-app-design.md`, gọi tắt là **spec ĐT**). Trang này dùng lại dữ liệu giả, service và phần lớn component của nó.

## Mục tiêu

1. Từ 1136px trở lên, mọi đường dẫn `/nv/*` hiện **một trang máy tính** theo K1:
   - thanh trên tối;
   - ba cột cao bằng nhau: Hôm nay + Yêu cầu | Chấm công | Thu nhập;
   - màn Tôi nằm trong menu avatar.
2. Chi tiết mở bằng **ngăn kéo bên phải** thay cho hộp trượt: một ngày (K2), một yêu cầu (K3b), đổi mật khẩu.
3. Dưới 1136px là app điện thoại J1–J7 như hiện có. Không có kiểu dồn một cột.
4. Hai giao diện dùng chung đường dẫn và tham số. Kéo cửa sổ qua mốc thì đổi ngay, không tải lại trang.
5. Bỏ hẳn `/nv-may-tinh` cùng mã cũ gọi `api()`. Mọi thứ chạy trên dữ liệu giả.

## Quyết định đã có (người dùng)

1. Một mốc duy nhất 1136px:
   - từ 1136px: trang máy tính ba cột (K1, K2);
   - dưới 1136px: app điện thoại. iPad dọc và điện thoại xoay ngang cũng vào đây.
2. Đường dẫn chung `/nv/…`. Ví dụ `/nv/cham-cong?ngay=2026-10-27` mở ngăn kéo ngày trên máy tính và hộp trượt ngày trên điện thoại.
3. Đổi giao diện khi kéo qua mốc là việc của FE, không tải lại trang, không liên quan BE.
4. Danh sách yêu cầu cuộn trong ô của nó, không đẩy trang dài thêm.
5. Mọi luật của spec ĐT, mục "Quyết định đã có", vẫn giữ:
   - chỉ hiện thông tin cốt lõi;
   - không có ô nhập hay nhãn giá trị dạng viên thuốc;
   - "Nghỉ ốm", "Phép năm" là hình thức nghỉ;
   - làm thứ Hai – thứ Bảy, công chuẩn 26;
   - design system GFT: không đổ bóng, vàng chỉ làm nền trên nền sáng, tối đa một khối nền vàng mỗi màn.
6. Người duyệt ghi chú, nhân viên đọc được (ghi chú n10, Đợt 10):
   - lý do từ chối hiện ngay dưới bước "Admin đã từ chối";
   - đơn được duyệt có ghi chú cũng hiện ở chỗ đó.
7. Ràng buộc kỹ thuật:
   - không thêm phụ thuộc npm;
   - không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc; không sửa file Admin.
   - Xác minh chỉ bằng `npm --prefix web run test:ui` (cổng riêng `PW_PORT`). Không typecheck, không prettier, không `npm test` ở gốc (memory fe-mock-verify-ui-tests-only).

## Ngoài phạm vi

- Luồng tạo yêu cầu (K3, J8–J10). Người dùng sẽ gửi trường của từng form. Nút "Tạo yêu cầu" giữ hành vi R3 của spec ĐT: hiện thông báo nổi.
- Đổi nhãn và số tiền của Tạm ứng theo luật 80% lương ngày công 01–15 (memory advance-rule-confirmed). Việc này đi cùng đợt form yêu cầu.
- Tháng khác tháng 10/2026 (R4 của spec ĐT).
- Lựa chọn "Nền kem" và "Nhiều (thử cuộn)" của board K1 (D14, D7).
- Phân trang danh sách yêu cầu và số đếm theo trạng thái từ BE (mục 9).

## 1. Chọn giao diện theo bề ngang

### 1.1 `composables/useStaffDesktop.ts` (mới)

- `export const STAFF_DESKTOP_MIN = 1136`.
- `useStaffDesktop(): Readonly<Ref<boolean>>`:
  - `true` khi `matchMedia('(min-width: 1136px)')` khớp;
  - nghe sự kiện `change` của media query nên đổi ngay khi kéo cửa sổ;
  - dùng chung một media query và một ref cho cả app (module-level), không gắn listener mới mỗi lần gọi.

### 1.2 `layouts/StaffLayout.vue` (mới)

- Thay `PhoneLayout` và `StaffDesktopLayout` ở vai trò khung của `/nv/*`.
- Dưới mốc: render `<PhoneLayout><slot /></PhoneLayout>`. Slot là `RouterView` do `App.vue` truyền vào: màn J1–J7 của route hiện tại.
- Từ mốc: render `<StaffDesktopPage />` và bỏ qua slot. Trang máy tính tự đọc `route.path` và `route.query` (mục 3.3).
- Kéo qua mốc:
  - phần tử của giao diện cũ unmount, của giao diện mới mount;
  - hộp hay ngăn kéo đang mở theo URL được mở lại ở giao diện mới (D2);
  - trạng thái chỉ nằm trong màn mất đi: tab lọc yêu cầu về "Tất cả";
  - dữ liệu trong bộ nhớ của mock giữ nguyên, ví dụ giờ Check-out đã bấm.

### 1.3 Route và cổng vào

- `router/routes/staff-phone.ts`: năm route giữ đường dẫn, tên và tiêu đề. Đổi `meta.layout` từ `'phone'` sang `'staff'`.
- `App.vue`: `LAYOUTS = { admin, staff: StaffLayout, blank }`. Bỏ `phone` và `staffDesktop`.
- `router/index.ts`:
  - bỏ `PHONE_MAX`;
  - `/nhan-vien` chuyển thẳng tới `/nv/hom-nay`, không xét bề ngang;
  - cổng `beforeEach` xét `layout === 'staff'` thay cho hai giá trị cũ. Luật giữ nguyên: tài khoản quản trị không thuộc bảng lương bị đưa về khu Admin.
  - Sửa dòng chú thích quy ước `meta.layout` ở đầu file.
- `router/routes/staff-desktop.ts`:
  - giữ `/dang-nhap`;
  - `/nv-may-tinh` thành `redirect: '/nv/hom-nay'` để liên kết cũ vẫn chạy (D12).
- `stores/session.ts`: `STAFF_HOME = '/nv/hom-nay'`.

## 2. Dữ liệu và service

- Dữ liệu là của spec ĐT mục 1–2: Lê Hoàng Nam, tháng 10/2026, đồng hồ giả 09:40 thứ Tư 28/10/2026. Không có dữ liệu giả mới cho máy tính.
- `services/staff-phone.ts` là nguồn duy nhất của cả hai giao diện. Hai thay đổi:
  1. `getAttendance(recent = 5)` (hàm hiện không nhận tháng). `attendanceView(recent)` trả `recent` dòng "Gần đây" mới nhất. Máy tính gọi với 7 (D6). Điện thoại không đổi.
  2. `RequestStep` có thêm `note: { label: string; text: string } | null` (D9).
     - `gio-vao-0909`, bước "Admin đã từ chối": `{ label: 'Lý do từ chối', text: '“Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”' }`.
     - Mọi bước khác `null`.
- Bảy dòng "Gần đây" lấy từ bảng ngày của spec ĐT mục 2.1:

  | Ngày | Giờ |
  |------|-----|
  | Thứ Tư 28/10 | 07:59 – … (07:59 – 09:40 sau Check-out) |
  | Thứ Ba 27/10 | 08:12 – ? |
  | Thứ Hai 26/10 | 07:56 – 17:10 |
  | Thứ Bảy 24/10 | 07:52 – 17:04 |
  | Thứ Sáu 23/10 | 07:58 – 17:02 |
  | Thứ Năm 22/10 | 07:59 – 17:08 |
  | Thứ Tư 21/10 | 07:57 – 17:03 |

## 3. Khung trang máy tính (`views/staff-desktop/StaffDesktopPage.vue`, mới)

### 3.1 Bố cục

- Gốc `.sd-app`:
  - đệm 16px, nền `--ground` (#f5f5f5), cao tối thiểu 100vh;
  - chữ Geist 14px/20px, `tabular-nums`.
- Thanh trên (mục 3.2), rồi `main`, là lưới ba cột:
  - `grid-template-columns: minmax(300px, 3fr) minmax(400px, 5fr) minmax(300px, 3fr)`;
  - khoảng cách 24px, `align-items: stretch`;
  - cách thanh trên 24px, đệm `0 16px 24px`.
- Mỗi cột là cột dọc, khoảng cách 16px, `min-width: 0`. Khối cuối mỗi cột giãn cho kín đáy (`.grow`), nên ba cột luôn cao bằng nhau.
- Bề rộng tối thiểu của nội dung: 300 + 400 + 300 + 2×24 + 2×16 + 2×16 = 1112px. Tại 1136px, kể cả khi Windows chiếm 17px cho thanh cuộn dọc (1112 + 17 = 1129), vẫn không có cuộn ngang (D16).
- Tiêu đề:
  - h1 duy nhất là tên ở cột 1;
  - ba tiêu đề cột (Yêu cầu, Chấm công, Thu nhập) là h2 League Spartan 600 28px/32px;
  - tiêu đề khối (Tuần này) là h2 Geist 600 18px/24px; Gần đây, KPI tháng 10, Các khoản là h3 cùng cỡ.

### 3.2 Thanh trên và menu tài khoản (`views/staff-desktop/parts/DesktopBar.vue`)

- `header`:
  - cao 64px, bo 24px, nền `--surface-dark`, chữ trắng;
  - đệm `0 8px 0 24px`, khoảng cách 16px.
- Trái:
  - logo trắng `assets/img/gft-logo-light.png` rộng 52px, `alt="GFT"`;
  - chữ "Nhân viên" 18px/24px đậm.
- Phải: nút tài khoản.
  - Hình: cao 48px, nền #2a2a2a, bo 50px, đệm `0 14px 0 6px`.
  - Bên trong: ô chữ tắt 36px nền `--gold-light` chữ "HN", rồi tên "Lê Hoàng Nam" đậm, rồi mũi tên xuống. Tên và chữ tắt lấy từ `getProfile()`, không lấy từ phiên (R2 của spec ĐT).
  - Tên truy cập "Lê Hoàng Nam". Có `aria-expanded` và `aria-controls` trỏ tới vùng menu. Focus viền `--gold`.
- Vùng menu `section role="region"` tên "Tài khoản của tôi":
  - Vị trí: tuyệt đối, cách đỉnh thanh 72px, sát phải, rộng 360px (tối đa `100vw − 32px`).
  - Hình: đệm 16px, khoảng cách 12px, nền trắng, viền 1px `--border`, bo 24px, không bóng.
  - Nội dung lấy từ `getProfile()`, giống J7:
    - hàng định danh: ô chữ tắt 48px, tên 18px/24px đậm, email `--muted`; phải là chấm Đi làm + "Chính thức";
    - khối khoá–giá trị nền `--page` bo 16px, sáu dòng của J7 (Mã nhân viên … Phép năm còn lại);
    - "Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa." (12px `--muted`).
  - Hai `button` cao ≥ 52px:
    - "Đổi mật khẩu": biểu tượng lock, mũi tên phải. Mở ngăn kéo đổi mật khẩu (mục 7).
    - "Đăng xuất": chữ và biểu tượng #b43f3f. Gọi `logout()` rồi về `/dang-nhap`.
- Menu mở khi và chỉ khi đường dẫn là `/nv/toi` và không có `hop` (D3):
  - bấm nút tài khoản lúc menu đóng: `router.replace('/nv/toi')`;
  - bấm lại nút, bấm ra ngoài vùng menu, hay Esc: `router.replace('/nv/hom-nay')`. Esc trả focus về nút tài khoản.
  - Bấm ra ngoài trúng một liên kết (ví dụ ô ngày) thì liên kết vẫn chạy. Đường dẫn đổi khác `/nv/toi` nên menu đóng.

### 3.3 Đọc URL

Trang máy tính đọc đúng các cặp đường dẫn–tham số của điện thoại (spec ĐT mục 3.8):

| URL | Máy tính mở |
|-----|-------------|
| `/nv/hom-nay`, `/nv/cham-cong`, `/nv/yeu-cau`, `/nv/thu-nhap` | Trang ba cột, không mở gì thêm |
| `/nv/toi` | Trang + menu tài khoản |
| `/nv/cham-cong?ngay=YYYY-MM-DD` | Trang + ngăn kéo một ngày (mục 5) |
| `/nv/yeu-cau?yc=<id>` | Trang + ngăn kéo một yêu cầu (mục 6) |
| `/nv/toi?hop=doi-mat-khau` | Trang + ngăn kéo đổi mật khẩu (mục 7) |

- Mở chi tiết từ trang: `router.replace` sang đúng đường dẫn và tham số của bảng trên (D2). Ví dụ bấm ô 27 ở thẻ "Tuần này" dẫn tới `/nv/cham-cong?ngay=2026-10-27`.
- Đóng ngăn kéo: `router.replace` bỏ tham số, giữ đường dẫn.
- Tham số lạ (ngày không có dữ liệu, id không có, `hop` khác `doi-mat-khau`) thì bỏ khỏi URL bằng `replace` và không mở gì, như điện thoại.
- Tham số đúng tên nhưng sai đường dẫn (ví dụ `/nv/hom-nay?ngay=…`) thì bỏ qua, như điện thoại.
- Tiêu đề tab theo `meta.title` của route, như hiện có.

## 4. Ba cột

Ba file con trong `views/staff-desktop/parts/`: `TodayColumn.vue`, `AttendanceColumn.vue`, `IncomeColumn.vue`. Nơi nào ghi "như J…" thì chữ, số, tên truy cập và hành vi chép theo mục tương ứng của spec ĐT.

### 4.1 Cột 1 · Hôm nay + Yêu cầu

1. Đầu cột, canh đáy, cao tối thiểu 52px:
   - trái: "Chào buổi sáng" (`--muted`), dưới là h1 "Lê Hoàng Nam" League Spartan 28px/32px;
   - phải: "Thứ Tư" xuống dòng "28/10/2026" (`--muted`, canh phải);
   - không có ô chữ tắt (đã có trên thanh).
2. Thẻ ca hôm nay: như J1 mục 4.2, kể cả Check-out (R7 của spec ĐT).
3. Thẻ "Tuần này": như J1 mục 4.3.
   - Ô ngày có dữ liệu và liên kết nhắc việc mở ngăn kéo ngày, qua `/nv/cham-cong?ngay=…`.
4. Khối "Yêu cầu" (`.grow`, `aria-label` "Yêu cầu"):
   - Hàng đầu:
     - h2 "Yêu cầu" 28px;
     - phải là nút "Tạo yêu cầu": cao 40px, bo 8px, nền `--surface-dark`, chữ trắng đậm, biểu tượng plus. Bấm hiện thông báo nổi như R3 của spec ĐT.
   - Thanh lọc `role="tablist"` tên "Lọc yêu cầu theo trạng thái":
     - nền trắng bo 50px, đệm 4px, bốn tab "Tất cả 4", "Chờ duyệt 1", "Đã duyệt 2", "Từ chối 1";
     - hình và phím như J4 mục 7.1. Tab đang chọn không lên URL.
   - Ô danh sách (D15):
     - `role="tabpanel"`, `tabindex="0"`, tên "Danh sách yêu cầu, cuộn để xem thêm";
     - `flex: 1 1 0; height: 0; min-height: 288px; overflow-y: auto; overscroll-behavior: contain`.
     - Ô lấp phần còn lại của cột và không làm trang dài thêm. Có nhiều dòng thì cuộn bên trong.
   - Trong ô:
     - nhóm theo tháng gửi như J4: nhãn "Tháng 10", "Tháng 9" (12px đậm `--muted`, chữ hoa), dính đầu ô khi cuộn (`position: sticky`, nền `--page`);
     - mỗi nhóm một thẻ danh sách `RequestRow`;
     - nhóm không còn dòng sau khi lọc thì ẩn.
   - Bấm dòng mở ngăn kéo yêu cầu qua `/nv/yeu-cau?yc=<id>`. Mọi dòng như nhau, kể cả giải trình 27/10 (D8).

Cột 1 không có thẻ thu nhập và khối "Yêu cầu của tôi" 2 dòng của J1: cột 3 và khối Yêu cầu đầy đủ đã thay chúng.

### 4.2 Cột 2 · Chấm công

1. Đầu cột: h2 "Chấm công" 28px; dưới là "Ca HC 08:00–17:00 · thứ Hai – thứ Bảy" (`--muted`).
2. `MonthSwitch`: "Tháng 10/2026", "Kỳ công đang mở". Hai nút đều tắt (D10).
3. Ba ô số như J2: "21 / 26" Ngày công, "1" Lần đi muộn, "2" Ngày nghỉ có lương.
4. Thẻ lịch tháng 10, có chú giải bốn mục: như J2. Ô có dữ liệu mở ngăn kéo ngày.
5. Khối "Gần đây" (`.grow`):
   - h3, rồi thẻ danh sách 7 dòng `button` theo mục 2. Mỗi dòng: chấm nhóm, ngày, giờ đậm.
   - Thẻ giãn kín đáy cột. Bấm dòng mở ngăn kéo ngày.

### 4.3 Cột 3 · Thu nhập

1. Đầu cột: h2 "Thu nhập" 28px; dưới là "Tháng 10/2026 · tạm tính" (`--muted`). Không có `MonthSwitch`, không có dòng "Phiếu chính thức có khi Admin duyệt".
2. Thẻ đen "Thực nhận tháng 10": như J6 mục 8.1.
3. Thẻ KPI tháng 10: như J6, gồm bán nguyệt chấm, 66,14%, Lương KPI, Mức đề xuất và năm điểm.
4. Khối "Các khoản" (`.grow`):
   - h3, rồi thẻ danh sách 6 dòng như J6;
   - dòng "Thực nhận 14.278.183 ₫" dính đáy thẻ (`margin-top: auto`), kẻ trên 1px `--text`.

## 5. Ngăn kéo phải (`views/staff-desktop/parts/SideDrawer.vue`, mới) và K2 · một ngày

### 5.1 `SideDrawer`

Hành vi giống `BottomSheet` của spec ĐT mục 3.5:

- teleport vào `body`;
- khoá cuộn qua `overlay-lock`;
- bẫy focus;
- Esc đóng ngăn kéo trên cùng;
- bấm nền mờ thì đóng;
- trả focus về phần tử đã mở. Phần tử đó không còn thì trả về nút tài khoản.

Hình theo K2:

- nền mờ `rgba(28, 28, 28, 0.4)` phủ cả cửa sổ;
- ngăn kéo `role="dialog"`, `aria-modal="true"`, tên là tiêu đề:
  - cố định cách trên, phải, dưới 16px; rộng 440px, tối đa `100% − 32px`;
  - đệm 24px, khoảng cách 16px, nền trắng, bo 24px, không bóng;
  - thân cuộn dọc khi dài.
- Đầu ngăn kéo:
  - trái: h2 League Spartan 600 28px/32px, dưới là dòng phụ `--muted` cách 4px;
  - phải: nút tròn 40px viền 1px `--border`, biểu tượng ×, tên "Đóng".
- Ngay dưới đầu: slot `badge` (nhãn trạng thái: chấm + chữ 13px). Khác điện thoại, nơi nhãn nằm bên phải tiêu đề.
- Thân ở slot mặc định. Nút "Đóng" (`.b2`) ở cuối thân, `margin-top: auto`.
- Lớp gốc `sd-drawer`. Không dùng `ph-sheet`, vì CSS toàn cục của `BottomSheet` bám lớp đó (D13).

### 5.2 K2 · một ngày

- Mở từ `/nv/cham-cong?ngay=…`.
- Tiêu đề "Thứ Ba 27/10/2026", dòng phụ "Ca HC 08:00–17:00", nhãn "Cần xử lý".
- Thân là `DayBody` (mục 8.1): thanh giờ, các dòng khoá–giá trị, hộp giải trình. Nội dung giống J3 cho mọi ngày, kể cả hôm nay và ngày nghỉ.

## 6. K3b · một yêu cầu

- Mở từ `/nv/yeu-cau?yc=<id>`, dùng `SideDrawer`.
- Tiêu đề là tiêu đề yêu cầu, dòng phụ là loại, nhãn trạng thái dưới đầu.
- Thân là `RequestBody` (mục 8.1):
  - các dòng khoá–giá trị;
  - các bước, mỗi bước có chấm theo trạng thái trên đường dọc.
- Bước có `note`: hộp ghi chú ngay dưới thời điểm của bước. Theo K3b:
  - nền `--page`, bo 12px, đệm 12px 14px, cách trên 8px;
  - nhãn 12px `--muted` (vd. "Lý do từ chối"), dưới là nội dung.
- Ví dụ `gio-vao-0909` (K3b):
  - "Khai giờ vào 09/09" · Giải trình · Từ chối;
  - Ngày Thứ Tư 09/09/2026, Giờ vào khai 08:00, Lý do “Máy chấm công không nhận.”;
  - Đã gửi 09/09 17:45 → Admin đã từ chối 10/09 10:15, kèm hộp "Lý do từ chối" “Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”.
- Hộp trượt J5 của điện thoại dùng cùng `RequestBody`, nên cũng hiện hộp này (J5b).

## 7. Đổi mật khẩu trên máy tính

- Mở từ `/nv/toi?hop=doi-mat-khau`, dùng `SideDrawer`. Không có board riêng (D4).
- Tiêu đề "Đổi mật khẩu", dòng phụ "Tài khoản <tên đăng nhập của phiên>", không có nhãn.
- Thân là `PasswordForm` (mục 8.1), giống hệt hộp trượt của điện thoại:
  - ba ô mật khẩu; mật khẩu mới ≥ 6 ký tự; hai lần nhập phải giống;
  - "Huỷ" / "Đổi mật khẩu"; mockup luôn thành công.
- Đóng (Huỷ, ×, Esc, nền mờ, hay đổi xong) thì `replace` về `/nv/toi`: menu tài khoản hiện lại như trước khi mở.

## 8. Mã dùng chung, xoá, mục lục, CSS

### 8.1 Tách thân hộp (D5)

Ba thân hộp tách khỏi hộp trượt của điện thoại, nằm trong `views/staff-phone/components/`:

| Thân mới | Tách từ | Gồm |
|----------|---------|-----|
| `DayBody.vue` | `DaySheet.vue` | thanh giờ, khoá–giá trị, hộp giải trình |
| `RequestBody.vue` | `RequestSheet.vue` | khoá–giá trị, các bước, hộp ghi chú (mới) |
| `PasswordForm.vue` | `ChangePasswordSheet.vue` | ba ô, kiểm tra, hai nút; phát `done` / `cancel` |

- Ba hộp trượt cũ chỉ còn `BottomSheet` + thân. Markup, chữ và tên truy cập trên điện thoại không đổi, nên test điện thoại hiện có phải xanh nguyên văn.
- Máy tính import thẳng từ `views/staff-phone/components/` các file `PhIcon`, `RequestRow`, `MonthSwitch` và ba thân trên. Không chép sang chỗ khác.
- Các thẻ mà cột máy tính hiện "như J…" (thẻ ca, Tuần này, lọc yêu cầu, ô số, lịch, Gần đây, thực nhận, KPI, các khoản) cũng tách thành component trong cùng thư mục, để hai giao diện dùng một nguồn. Danh sách ở plan.

### 8.2 CSS

- `styles/phone.css`: các lớp dùng chung (`.card`, `.sh`, `.rb`, `.dn…`, `.dot…`, `.st`, `.ls`, `.ro`, `.ti`, `.kv`, `.b2`, `.mut`, `.sm`, biến `--page`) áp thêm dưới `.sd-app` và `.sd-drawer`. Luật riêng của điện thoại (`.ph`, thanh tab, hộp trượt) giữ nguyên.
- `styles/staff-desktop.css` (mới, import trong `main.ts`): luật riêng của máy tính đặt dưới `.sd-app` hoặc `.sd-drawer`, gồm thanh, menu, lưới cột, `.grow`, ô danh sách cuộn, ngăn kéo.
- Focus: 2px `--text` cách 2px. Trên nền tối (thanh, thẻ ca, thẻ thực nhận) dùng viền trắng như R9 của spec ĐT; nút tài khoản dùng `--gold` như board.

### 8.3 Xoá (D11)

- `views/staff-desktop/StaffHome.vue` và cả thư mục `views/staff-desktop/parts/` cũ (12 file: AccountPopover … small-text.ts). Thư mục `parts/` được tạo lại với file mới của mục 3–5.
- `layouts/StaffDesktopLayout.vue`.
- `services/staff-desktop.ts` (kể cả `getSelfKpi`, `saveSelfKpi`) và `services/staff-requests.ts`.
- `builders/staff-desktop/` và `builders/staff-requests/`.
- `tests/staff-ux.spec.ts`: file chỉ còn một vòng `test.fixme` cho `/nv-may-tinh?kb=linh` cùng hàm `mockStaffApi`.

Trước khi xoá, plan phải `grep` lại để chắc không còn ai import. Lúc viết spec, chỉ các file trong danh sách này import lẫn nhau.

### 8.4 Mục lục thiết kế (`design-index/staff-desktop.ts`)

- Thay 12 dòng `/nv-may-tinh…` bằng 4 dòng. Giữ hai dòng Đăng nhập.
  - K1 `StaffDesktop.dc.html`: "Nhân viên trên máy tính · một trang ba cột" → `/nv/hom-nay`.
  - K2 `StaffDesktopDay.dc.html`: "Máy tính · ngăn kéo một ngày (27/10)" → `/nv/cham-cong?ngay=2026-10-27`.
  - K3b `StaffDesktopRequest.dc.html`: "Máy tính · ngăn kéo yêu cầu bị từ chối" → `/nv/yeu-cau?yc=gio-vao-0909`.
  - `StaffDesktop.dc.html#menu`: "Máy tính · menu tài khoản" → `/nv/toi`. `DesignIndex.vue` dùng `file` làm khoá, nên dòng này cần tên khác dòng K1.
- Đầu file ghi: dòng K mở bản máy tính khi cửa sổ ≥ 1136px; dòng J của `staff-phone.ts` mở bản điện thoại khi cửa sổ hẹp hơn. Cùng URL nên giao diện theo bề ngang lúc mở.

## 9. Ghi chú cho BE (không làm ở FE)

- Danh sách yêu cầu trên máy tính cuộn trong ô. Với dữ liệu thật, BE cần:
  - phân trang danh sách;
  - số đếm theo trạng thái (Tất cả / Chờ duyệt / Đã duyệt / Từ chối) trả riêng, không đếm từ trang đang tải.
- Ghi chú của người duyệt (`review_note`) đã có trong API. Chặn từ chối khi để trống là việc của BE (ghi chú n10).

## 10. Test

Playwright, `npm --prefix web run test:ui` với `PW_PORT` riêng.

### 10.1 Fixture `tests/fixtures/staff-desktop.ts` (mới)

- `openDesktop(page, path, size = { width: 1440, height: 900 })`:
  - phiên giả `nhanvien` như `openPhone`;
  - trả mảng các request `/api` đã ghi.

### 10.2 `tests/staff-desktop.spec.ts` (mới)

Mỗi file test mở đầu bằng một test kiểm mảng request `/api` rỗng. Kiểm theo tên truy cập và chữ thấy được.

1. Khung và cột:
   - 1440px: thanh có "Nhân viên" và nút "Lê Hoàng Nam";
   - có ba cột: cột 1 chứa vùng "Ca hôm nay" và vùng "Yêu cầu", cột 2 có h2 "Chấm công", cột 3 có h2 "Thu nhập";
   - không có `nav` "Điều hướng".
2. Cao bằng nhau: tại 1440×900 và 1136×800, đáy của ba cột lệch nhau ≤ 1px.
3. Không cuộn ngang tại 1136px: `scrollWidth` bằng `clientWidth`.
4. Mốc:
   - 1135px hiện app điện thoại (có `nav` "Điều hướng", không có thanh máy tính);
   - 1136px hiện máy tính.
5. Đổi sống:
   - đặt `window.__mark = 1`;
   - 1440 → 1000: thấy app điện thoại; → 1440: thấy máy tính;
   - `__mark` vẫn còn, tức là không tải lại trang.
6. Ngăn kéo ngày:
   - bấm ô "Thứ Ba 27/10: cần xử lý" ở "Tuần này": URL thành `/nv/cham-cong?ngay=2026-10-27`;
   - dialog "Thứ Ba 27/10/2026" có "Cần xử lý", "08:12", "Chưa có", "12 phút", "Đã gửi giải trình lúc 20:14";
   - Esc: dialog đóng, URL là `/nv/cham-cong`, focus về ô 27.
7. Mở thẳng `/nv/cham-cong?ngay=2026-10-27`:
   - 1440px: ngăn kéo (`.sd-drawer`);
   - 390px: hộp trượt (`.ph-sheet`).
8. Kéo qua mốc khi đang mở:
   - mở ngăn kéo ngày ở 1440, thu về 1000: hộp trượt cùng ngày mở trên J2, chỉ có một dialog;
   - đóng nó: trang cuộn được (khoá cuộn đã nhả).
9. Ngăn kéo yêu cầu:
   - bấm "Khai giờ vào 09/09, Từ chối": URL `/nv/yeu-cau?yc=gio-vao-0909`;
   - dialog có "Lý do từ chối" và “Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”.
10. Lọc yêu cầu:
    - "Từ chối 1" chỉ còn một dòng và chỉ nhóm "Tháng 9";
    - phím phải chuyển tab;
    - ô danh sách có `overflow-y: auto`, cao ≥ 288px, và đáy ô trùng đáy cột 1 (lệch ≤ 1px).
11. Gần đây: 7 dòng, dòng cuối "Thứ Tư 21/10" "07:57 – 17:03".
12. Check-out:
    - bấm "Check-out lúc 09:40": thẻ ca hiện "Đã check-out", "ra 09:40";
    - ngăn kéo ngày 28/10 hiện giờ ra 09:40.
13. Menu tài khoản:
    - bấm nút tài khoản: URL `/nv/toi`, vùng "Tài khoản của tôi" có "GFT-0142" và "11 ngày";
    - Esc: URL `/nv/hom-nay`, focus về nút.
    - Mở thẳng `/nv/toi` cũng hiện menu.
14. Đổi mật khẩu:
    - từ menu bấm "Đổi mật khẩu": URL `/nv/toi?hop=doi-mat-khau`, dialog "Đổi mật khẩu";
    - "Huỷ": URL `/nv/toi`, menu hiện lại.
15. Đăng xuất: từ menu bấm "Đăng xuất", về `/dang-nhap`.
16. Tham số lạ:
    - `/nv/cham-cong?ngay=2026-10-04` và `/nv/yeu-cau?yc=khong-co`: bỏ tham số, không mở gì;
    - `/nv/toi?hop=la`: bỏ `hop`.
17. Đường dẫn cũ:
    - `/nv-may-tinh` về `/nv/hom-nay`;
    - `/nhan-vien` về `/nv/hom-nay` ở cả 1440px và 390px.

### 10.3 Sửa test cũ

- `tests/auth-mock.spec.ts`:
  - "any other name lands in the staff area", "staff login can sign out back to /dang-nhap", "session survives when only setItem fails": chờ `/nv/hom-nay` thay cho `/nv-may-tinh`;
  - đăng xuất bằng nút "Lê Hoàng Nam" rồi nút "Đăng xuất", thay cho `.top .u` và `menuitem`.
  - "staff login on a phone can sign out from the Tôi tab" giữ nguyên văn.
- `tests/staff-phone-*.spec.ts` đều mở ở bề ngang < 1136px. Chúng phải xanh nguyên văn. Hộp J5 của `gio-vao-0909` có thêm hộp ghi chú; test nào đếm chính xác nội dung hộp đó thì sửa theo mục 6.

## 11. Lỗi và biên cần giữ

- Ngăn kéo hay hộp trượt đang mở khi kéo qua mốc:
  - không được còn hai lớp khoá cuộn;
  - không được để `body` kẹt `overflow: hidden` sau khi đóng.
- `?ngay=` của hôm nay (28/10) trước và sau Check-out: ngăn kéo dùng giờ đồng hồ giả, rồi giờ ra 09:40.
- Đọc chi tiết là bất đồng bộ (`respond`). URL đổi trong lúc chờ thì bỏ kết quả cũ, như điện thoại.
- Menu mở rồi bấm một ô ngày: chỉ ngăn kéo ngày mở, menu không hiện chồng.
- Cửa sổ thấp (1136×700): trang cuộn dọc bình thường, ô danh sách yêu cầu giữ tối thiểu 288px, ngăn kéo cuộn thân bên trong.

## 12. Câu hỏi còn mở

- Câu 1, 2 và 5 của spec ĐT mục 10 vẫn mở: điểm KPI từng phần, ô Tự đánh giá, "Xem phiếu lương đầy đủ". Máy tính theo đúng lựa chọn hiện tại của điện thoại: hiện năm điểm như K1, không có ô tự nhập, không có liên kết phiếu.
- Không có câu hỏi mới.

## 13. Phán quyết đã ghi

- Ruling: D1 — một layout `staff` chọn giao diện bằng `matchMedia`; bản máy tính là một component trang bỏ qua `RouterView`, còn route giữ màn điện thoại. Lý do: đổi giao diện sống không tải lại; đường dẫn dùng chung; màn điện thoại không phải sửa. Rủi ro nếu sai: sau này máy tính cần nội dung riêng theo từng đường dẫn thì tách thành component theo route.
- Ruling: D2 — máy tính mở chi tiết bằng cách `replace` sang đúng URL của điện thoại (`/nv/cham-cong?ngay=…`, `/nv/yeu-cau?yc=…`, `/nv/toi?hop=…`), dù đang ở đường dẫn khác. Lý do: quyết định 2 của người dùng; thu cửa sổ lại thì điện thoại mở đúng màn và đúng hộp. Rủi ro nếu sai: thanh địa chỉ đổi đường dẫn khi mở ngăn kéo, không ảnh hưởng gì khác.
- Ruling: D3 — menu tài khoản mở khi và chỉ khi đường dẫn là `/nv/toi` không có `hop`. Mở là `replace('/nv/toi')`, đóng là `replace('/nv/hom-nay')`. Lý do: màn Tôi của điện thoại tương ứng với menu trên máy tính, nên qua mốc vẫn giữ đúng chỗ. Rủi ro nếu sai: tải lại ở `/nv/toi` thì menu mở sẵn; muốn khác thì chuyển menu về trạng thái cục bộ.
- Ruling: D4 — đổi mật khẩu trên máy tính là ngăn kéo phải với cùng form của điện thoại. Lý do: K1 có mục "Đổi mật khẩu" nhưng chưa có board; ngăn kéo là kiểu chi tiết của trang này. Rủi ro nếu sai: vẽ board rồi đổi vỏ, form giữ nguyên.
- Ruling: D5 — tách `DayBody`, `RequestBody`, `PasswordForm` dùng cho cả hộp trượt và ngăn kéo; vỏ hai bên khác nhau. Lý do: K2, K3b ghi "nội dung giống J3, J5b"; một nguồn thì không lệch chữ. Rủi ro nếu sai: thấp; test điện thoại giữ nguyên văn bắt được lệch.
- Ruling: D6 — "Gần đây" trên máy tính có 7 dòng lấy từ dữ liệu giả. Board ghi 22/10 07:55 – 17:06 và 21/10 07:57 – 17:01, khác bảng ngày (07:59 – 17:08, 07:57 – 17:03). Theo dữ liệu. Lý do: một nguồn số cho cả hai giao diện; số trên board là minh hoạ. Rủi ro nếu sai: sửa hai dòng trong bảng ngày.
- Ruling: D7 — danh sách dùng 4 yêu cầu của dữ liệu giả (lựa chọn "4 yêu cầu như app" của K1), không thêm 5 dòng của "Nhiều (thử cuộn)". Lý do: thêm dòng làm đổi số đếm J4 và test điện thoại; cuộn trong ô kiểm bằng CSS và chiều cao. Rủi ro nếu sai: chưa thấy cuộn thật trên mockup cho tới khi có BE hay thêm dữ liệu.
- Ruling: D8 — mọi dòng yêu cầu mở ngăn kéo yêu cầu, kể cả "Thiếu giờ ra 27/10", dù board K1 cho dòng đó sang K2. Lý do: giữ R5 của spec ĐT, một quy tắc cho mọi dòng; K2 vẫn có hộp giải trình. Rủi ro nếu sai: đổi đích của một dòng.
- Ruling: D9 — thêm `note` vào bước yêu cầu và hiện ở cả J5 lẫn K3b. Lý do: K3b, J5b đã vẽ và ghi chú n10 nói rõ chỗ hiện; một thân dùng chung. Rủi ro nếu sai: bỏ một khối trong `RequestBody`.
- Ruling: D10 — hai nút chọn tháng ở cột 2 đều tắt, dù K1 vẽ "Tháng trước" bật. Lý do: R4 của spec ĐT, chỉ có dữ liệu tháng 10. Rủi ro nếu sai: bật khi có dữ liệu tháng 9.
- Ruling: D11 — xoá toàn bộ mã máy tính cũ cùng `builders/staff-requests/`, `services/staff-requests.ts`, `getSelfKpi`, `saveSelfKpi`. Lý do: chỉ màn cũ gọi chúng; chúng gọi `api()`, trái mục tiêu 5. Rủi ro nếu sai: lấy lại từ git khi làm luồng tạo yêu cầu hay ô tự đánh giá KPI.
- Ruling: D12 — `/nv-may-tinh` chuyển hướng về `/nv/hom-nay` thay vì xoá route; `STAFF_HOME` là `/nv/hom-nay`; `/nhan-vien` không còn xét bề ngang. Lý do: liên kết và dấu trang cũ vẫn chạy; giao diện giờ do layout chọn. Rủi ro nếu sai: bỏ một dòng redirect.
- Ruling: D13 — ngăn kéo dùng lớp gốc `sd-drawer`, không dùng `ph-sheet`; lớp dùng chung của `phone.css` áp thêm dưới `.sd-app`, `.sd-drawer`. Lý do: CSS toàn cục của `BottomSheet` và hàm tìm hộp trên cùng bám `.ph-sheet`; chép lại lớp dùng chung thì sẽ lệch dần. Rủi ro nếu sai: một luật của điện thoại lọt sang máy tính, test cột và ngăn kéo sẽ bắt.
- Ruling: D14 — bỏ lựa chọn "Nền kem" của board; dùng nền xám mặc định như app điện thoại. Lý do: đó là biến thể thử màu, không phải trạng thái của màn. Rủi ro nếu sai: thêm biến màu khi người dùng chọn.
- Ruling: D15 — ô danh sách cuộn là `role="tabpanel"` có tên riêng và `tabindex="0"`, thay cho `role="region"` của board. Lý do: tab phải trỏ tới một tabpanel; ô cuộn cần nhận focus để cuộn bằng phím. Rủi ro nếu sai: đổi một thuộc tính.
- Ruling: D16 — cột giữa tối thiểu 400px thay cho 420px của board; hai cột bên giữ 300px. Lý do: với 420px, tổng tối thiểu là 1132px. Trên Windows, thanh cuộn dọc lấy khoảng 17px trong 1136px, nên trang sẽ cuộn ngang 13px. Với 400px, tổng 1112px còn dư chỗ cho thanh cuộn. Lịch 7 ô 44px cùng đệm thẻ vẫn vừa 400px. Rủi ro nếu sai: cột giữa hẹp hơn board 20px ở đúng mốc; từ khoảng 1200px trở lên cột giữa rộng hơn 420px, không khác board.
