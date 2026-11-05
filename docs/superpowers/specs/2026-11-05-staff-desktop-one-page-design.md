# Nhân viên trên máy tính: một trang cho `/nv/*` từ 1136px, trên dữ liệu giả

- Ngày: 05/11/2026
- Loại: Architectural. Thay trang `/nv-may-tinh` cũ bằng một trang mới, thêm công tắc giao diện theo bề ngang cho mọi đường dẫn `/nv/*`, đổi điểm đến sau đăng nhập.
- Trạng thái: chờ người dùng duyệt.
- Concept đã duyệt: hàng "Đợt 7" trên canvas thiết kế, gồm hai board:
  - K1 `StaffDesktop.dc.html` (1440×1210);
  - K2 `StaffDesktopDay.dc.html` (1440×900).
- Các mốc người dùng đã duyệt, ngày 05/11/2026:
  - bố cục ba cột ("Duyệt, vẽ đi");
  - kín khoảng trống;
  - danh sách yêu cầu cuộn trong ô;
  - mốc 1136px ("Chốt 1136px");
  - thiết kế phần 1 và phần 2 trong chat ("Ổn, sang phần 2", "Ổn, viết spec").
- Nguồn board: `.superpowers/canvas-k/project/` của worktree `admin-ui-concept-6445c9` (git bỏ qua). Mọi số đo cần cho code đã chép vào mục 4–6.
- Nền móng:
  - app điện thoại `/nv/*` (`docs/superpowers/specs/2026-11-04-staff-phone-app-design.md`, gọi tắt là "spec điện thoại");
  - dữ liệu giả `web/src/mock/staff-phone.ts`;
  - service `web/src/services/staff-phone.ts`;
  - đồng hồ giả 09:40 thứ Tư 28/10/2026.

## Mục tiêu

1. Từ 1136px trở lên, năm đường dẫn `/nv/*` hiện một trang ba cột theo K1. Chi tiết mở ở ngăn kéo bên phải theo K2.
2. Dưới 1136px, app điện thoại J1–J7 giữ nguyên.
3. Kéo cửa sổ qua mốc thì giao diện đổi ngay, không tải lại trang. URL và chi tiết đang mở được giữ.
4. Chạy hoàn toàn trên dữ liệu giả, không gọi `/api`.
5. Xoá trang `/nv-may-tinh` cũ và phần mã chỉ trang đó dùng.

## Quyết định đã có (người dùng)

1. Ghép J1–J7 thành một trang và dùng thiết kế của bản mobile.
2. Ba cột cao bằng nhau, không chừa khoảng trống:
   - cột 1: Hôm nay + Yêu cầu;
   - cột 2: Chấm công;
   - cột 3: Thu nhập.
   - "Tôi" nằm trong menu tài khoản.
3. Danh sách yêu cầu cuộn trong ô và không làm trang dài thêm. Đây là việc của FE. Khi có dữ liệu thật, API danh sách của BE cần phân trang và trả số đếm theo trạng thái.
4. Chỉ một mốc là 1136px:
   - từ 1136px là trang máy tính, dưới 1136px là app điện thoại;
   - không có trạng thái "dồn một cột";
   - hai bản chung đường dẫn `/nv/...`;
   - kéo cửa sổ qua mốc thì đổi ngay.
5. Xoá trang `/nv-may-tinh` cũ. Link cũ chuyển về `/nv/hom-nay`.
6. Cách đổi giao diện: một công tắc theo bề ngang, mỗi lúc chỉ dựng một bản giao diện.
7. Kế thừa từ spec điện thoại:
   - chỉ hiện thông tin cốt lõi, mỗi ô danh sách một giá trị;
   - không có ô nhập hay nhãn giá trị dạng viên thuốc;
   - "Nghỉ ốm" là hình thức nghỉ;
   - làm thứ Hai – thứ Bảy, công chuẩn 26;
   - design system GFT: không đổ bóng, vàng không làm chữ hay viền trên nền sáng, Geist cho chữ, League Spartan 600 cho tiêu đề;
   - chỉ cài luật đã xác nhận.
8. Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc, và không đọc `spec/` gốc. Không sửa file của màn Admin.
9. Xác minh chỉ bằng test giao diện: `PW_PORT=<cổng riêng> npm run test:ui` trong `web/`. Không typecheck, không prettier, không chạy `npm test` ở gốc.

## Ngoài phạm vi

- Luồng tạo yêu cầu, giải trình và Check-out sớm (câu hỏi mở 3 và 4 của spec điện thoại).
- Tháng khác tháng 10/2026.
- Phiếu lương đầy đủ cho nhân viên.
- Kịch bản `?kb=` cũ của `/nv-may-tinh`: ca đêm, chuyên trách viên, thực tập sinh, quên Check-out.
- Ô KPI tự đánh giá cho nhân viên (`KpiSelfCard.vue` cũ), xem R13.
- Phân trang danh sách yêu cầu (việc của BE).

## 1. Công tắc giao diện

### 1.1 `web/src/composables/useStaffWide.ts` (mới)

- `export const STAFF_WIDE_MIN = 1136;`
- `export function useStaffWide(): Readonly<Ref<boolean>>`
  - Trả về `true` khi `matchMedia('(min-width: 1136px)').matches`.
  - Cả app dùng chung một ref và một bộ nghe `change`, cập nhật ngay khi cửa sổ đổi bề ngang.
- Đây là nơi duy nhất ghi con số 1136.

### 1.2 Chọn khung (`web/src/App.vue`)

- Năm route `/nv/*` có `meta.layout === 'phone'`. Khi rộng, App dựng `StaffDesktopLayout`; khi hẹp, dựng `PhoneLayout` như hiện nay.
- Bỏ khoá `staffDesktop` khỏi `LAYOUTS`, vì không còn route nào dùng.
- `StaffDesktopLayout` không dựng slot (`RouterView`) mà tự dựng trang máy tính (R6).
  - Khi chuyển giữa các đường dẫn `/nv/*`, chỉ phần mở sẵn thay đổi. Trang không dựng lại.
  - Nhờ vậy tab lọc, vị trí cuộn và dữ liệu sau Check-out được giữ.

### 1.3 Route

- `routes/staff-phone.ts`: giữ năm route, tên, tiêu đề và `meta.layout: 'phone'`.
- `routes/staff-desktop.ts`:
  - giữ `/dang-nhap`;
  - `/nv-may-tinh` thành `{ path: '/nv-may-tinh', redirect: '/nv/hom-nay' }`;
  - bỏ component cũ.
- `router/index.ts`:
  - `/nhan-vien` luôn chuyển về `/nv/hom-nay`;
  - bỏ `PHONE_MAX`;
  - cổng vào bỏ `'staffDesktop'`, chỉ còn `'phone'`.
- Cổng vào giữ nguyên hành vi:
  - chưa đăng nhập thì sang `/dang-nhap?tiep=…`;
  - tài khoản quản trị không thuộc bảng lương thì về khu Admin.

### 1.4 Đường dẫn và tham số

| URL | Máy tính (từ 1136px) | Điện thoại (dưới 1136px) |
|---|---|---|
| `/nv/hom-nay`, `/nv/cham-cong`, `/nv/yeu-cau`, `/nv/thu-nhap` | Trang ba cột | Màn tương ứng |
| `/nv/toi` | Trang ba cột, menu tài khoản mở sẵn | Màn Tôi |
| `/nv/cham-cong?ngay=YYYY-MM-DD` | Ngăn kéo ngày | Tấm trượt ngày |
| `/nv/yeu-cau?yc=<id>` | Ngăn kéo yêu cầu | Tấm trượt yêu cầu |
| `/nv/toi?hop=doi-mat-khau` | Ngăn kéo đổi mật khẩu | Tấm trượt đổi mật khẩu |

- **Đọc tham số.** Máy tính đọc tham số trên đúng đường dẫn như điện thoại (R11). Tham số nằm ở đường dẫn khác thì bỏ qua: không mở gì, không xoá.
- **Tham số lạ.** Ngày không có dữ liệu, hoặc id không có, thì bỏ tham số bằng `router.replace` và không mở gì, như điện thoại.
- **Mở chi tiết.** Trang máy tính mở chi tiết bằng `router.replace` tới đúng URL của điện thoại (R7). Ví dụ: ô 27/10 dẫn tới `/nv/cham-cong?ngay=2026-10-27`, dòng "Thiếu giờ ra 27/10" dẫn tới `/nv/yeu-cau?yc=giai-trinh-2710`.
- **Đóng chi tiết.** Bỏ tham số bằng `router.replace` và giữ đường dẫn.
- **Menu tài khoản.**
  - Menu mở khi đường dẫn đổi sang `/nv/toi`, kể cả lúc tải trang.
  - Đổi tham số trên `/nv/toi` không mở lại menu.
  - Nút tài khoản bật / tắt menu tại chỗ, không đổi URL.
- **Kéo cửa sổ qua mốc** khi đang mở chi tiết: bản kia mở chi tiết đó theo cùng URL. Menu tài khoản là trạng thái tại chỗ nên không mang sang. Riêng trên `/nv/toi`, điện thoại hiện màn Tôi.

## 2. Dữ liệu

- Dùng `services/staff-phone.ts`: `getHome()`, `getAttendance(month)`, `getDay(date)`, `getRequests()`, `getRequest(id)`, `getIncome(month)`, `getProfile()`, `checkOut()`.
- Đổi mật khẩu và đăng xuất đi qua `services/session.ts`, như `ChangePasswordSheet.vue` và `ProfileView.vue` đang làm.
- Không có `api(` hay `fetch(` trong mã mới.
- `mock/staff-phone.ts`: `recent` trả 7 ngày gần nhất có giờ vào, thay vì 5 (R2). Màn J2 trên điện thoại chỉ hiện 5 dòng đầu.
- Dữ liệu giả giữ 4 yêu cầu, như app điện thoại (R1).
- Tên luôn là Lê Hoàng Nam, không đọc tên của phiên giả (R2 của spec điện thoại).
- **Check-out trên máy tính (R4):**
  - gọi `checkOut()`;
  - tải lại `getHome()` và `getAttendance()` để thẻ ca, tuần, lịch và "Gần đây" cùng cập nhật;
  - dòng "Thứ Tư 28/10" thành "07:59 – 09:40".

## 3. Khối dùng chung với app điện thoại

Các khối sau được tách khỏi màn điện thoại thành component trong `views/staff-phone/components/` (R12). Màn điện thoại gọi lại chính các component này. DOM, chữ và tên truy cập trên điện thoại không đổi. Mọi test `staff-phone-*.spec.ts` hiện có phải xanh mà không sửa một dòng nào.

| Khối | Lấy từ | Dùng ở máy tính |
|---|---|---|
| `ShiftHero.vue`: thẻ tối, đồng hồ, nút Check-out, vị trí | `HomeView.vue` `.hero` | Cột 1 |
| `WeekCard.vue`: "Tuần này", 7 ô ngày, dòng nhắc | `HomeView.vue` | Cột 1 |
| `RequestList.vue`: tab lọc có số đếm, nhóm theo tháng, `RequestRow` | `RequestsView.vue` | Cột 1, chế độ ô cuộn |
| `AttendanceTiles.vue`: ba ô số | `AttendanceView.vue` | Cột 2 |
| `MonthCalendar.vue`: lịch tháng và chú giải | `AttendanceView.vue` | Cột 2 |
| `RecentDays.vue`: "Gần đây" | `AttendanceView.vue` | Cột 2 |
| `IncomeHero.vue`: thực nhận, tổng thu nhập, khấu trừ | `IncomeView.vue` | Cột 3 |
| `KpiCard.vue`: tổng điểm, Lương KPI, năm điểm | `IncomeView.vue` | Cột 3 |
| `IncomeLines.vue`: "Các khoản" và dòng tổng | `IncomeView.vue` | Cột 3 |

Luật chung cho các khối:

- **Không tự đổi URL.** Khối chỉ báo sự kiện, ví dụ `open-day(date)` hay `check-out`. Màn hay trang gọi khối quyết định URL.
  - Ngoại lệ là `RequestRow`, vốn đã là liên kết; nó nhận prop `replace`.
- **Cấp tiêu đề.** Khối có tiêu đề riêng nhận prop `level`: điện thoại dùng 2 như hiện nay, máy tính dùng 3.
- **Chế độ ô cuộn của `RequestList`.** Prop `boxed: boolean`, mặc định `false`. Khi bật, panel của tab là ô cuộn (mục 5, cột 1).
- **Kích thước riêng của máy tính.** Ví dụ ô ngày của lịch tháng là 44px. Các giá trị này đặt bằng CSS của trang máy tính (mục 7). Kích thước trên điện thoại giữ như cũ.

## 4. Khung máy tính (`web/src/layouts/StaffDesktopLayout.vue`, viết lại)

### 4.1 Gốc

- Gốc `.sd-app` chứa thanh trên và trang (mục 5):
  - nền `--ground` (#f5f5f5), đệm 16px, `min-height: 100vh`, cột dọc;
  - chữ Geist 14px/20px, màu `--text`, `font-variant-numeric: tabular-nums`.
- Thanh trên và lưới rộng tối đa 1600px, nằm giữa (R5).

### 4.2 Thanh trên

- Thẻ `header`:
  - cao 64px, bo 24px, nền `--surface-dark` (#1c1c1c), chữ trắng;
  - đệm 0 8px 0 24px, các phần cách nhau 16px, căn giữa theo chiều dọc.
- Bên trái:
  - logo `@/assets/img/gft-logo-light.png`, rộng 52px, `alt="GFT"`;
  - chữ "Nhân viên" 18px/24px, đậm 600.
- Bên phải, nút tài khoản (`margin-left: auto`):
  - cao 48px, bo 50px, nền #2a2a2a, chữ trắng đậm 600, đệm 0 14px 0 6px, khoảng cách 10px;
  - ô chữ tắt "HN" 36px tròn, nền #fce8b2, chữ `--text`, có `aria-hidden`;
  - tên "Lê Hoàng Nam";
  - `aria-expanded`, `aria-controls` trỏ tới menu;
  - viền focus màu vàng #e8c372.

### 4.3 Menu tài khoản (nội dung J7)

- Vỏ menu (R10):
  - `section` có `role="region"` và `aria-label="Tài khoản của tôi"`;
  - nằm ngay sau nút tài khoản trong DOM;
  - tuyệt đối, top 72px, right 0, rộng 360px (tối đa `calc(100vw - 32px)`);
  - đệm 16px, bo 24px, nền trắng, viền 1px `--border`, khoảng cách 12px, nằm trên lưới.
- Đầu menu:
  - ô chữ tắt 48px;
  - tên 18px/24px đậm 600, dưới là email màu `--muted`;
  - bên phải là nhãn chấm `work` kèm `profile.contract` ("Chính thức").
- Nhóm 6 dòng khoá–giá trị lấy từ `getProfile().facts`:
  - nền `--page`, bo 16px, đệm 0 16px;
  - dòng đầu không có viền trên.
- Ghi chú `profile.note`: chữ 12px màu `--muted`.
- Hai nút dòng, cao tối thiểu 52px, có ô biểu tượng 40px:
  - "Đổi mật khẩu";
  - "Đăng xuất", chữ và biểu tượng màu #b43f3f.
- Hành vi:
  - Esc đóng menu và trả focus về nút tài khoản;
  - bấm ra ngoài thì đóng;
  - không bẫy focus.
- Bấm "Đổi mật khẩu":
  - đóng menu, rồi `router.replace('/nv/toi?hop=doi-mat-khau')`;
  - ngăn kéo đổi mật khẩu mở ra;
  - khi đóng ngăn kéo, focus về nút tài khoản.
- Bấm "Đăng xuất": như `ProfileView.vue`, đăng xuất rồi về `/dang-nhap`.

## 5. Trang (`web/src/views/staff-desktop/StaffDesktopPage.vue`, mới)

### 5.1 Lưới

- `main`:
  - `display: grid; grid-template-columns: minmax(300px, 3fr) minmax(420px, 5fr) minmax(300px, 3fr); gap: 24px; align-items: stretch;`
  - cách thanh trên 24px;
  - `flex: 1 1 auto` trong gốc, để các cột kéo tới đáy cửa sổ khi cửa sổ cao hơn nội dung.
- Mỗi cột:
  - cột dọc, khoảng cách 16px, `min-width: 0`;
  - khối cuối giãn hết phần còn lại (`flex: 1 1 auto`), thẻ bên trong cũng giãn.
- Ba cột luôn cao bằng nhau.
- Đầu cột 2 và cột 3:
  - cao tối thiểu 52px, căn đáy;
  - h2 League Spartan 600 28px/32px, dưới là một dòng màu `--muted`.

### 5.2 Cột 1: Hôm nay và Yêu cầu

1. **Đầu cột.** Lấy từ `getHome()`.
   - Trái: "Chào buổi sáng" màu `--muted`, dưới là h1 "Lê Hoàng Nam" League Spartan 600 28px/32px.
   - Phải: "Thứ Tư", xuống dòng "28/10/2026", màu `--muted`, căn phải.
2. **`ShiftHero`.** Gồm:
   - Ca HC · 08:00–17:00, "Đang trong ca";
   - đồng hồ "1g 41p", "đã làm · vào 07:59";
   - nút "Check-out · 09:40";
   - "Đúng vị trí văn phòng GFT".
3. **`WeekCard` trong thẻ trắng** bo 24px, đệm 16px, khoảng cách 14px.
   - Tiêu đề "Tuần này", bên phải "26/10 – 01/11".
   - 7 ô ngày 40px.
   - Dòng nhắc "27/10 thiếu giờ ra · chờ duyệt giải trình" mở ngày 27/10.
4. **Khối Yêu cầu**, là khối giãn của cột.
   - Đầu khối: h2 "Yêu cầu" 28px/32px, bên phải nút "Tạo yêu cầu".
     - Nút cao 40px, bo 8px, nền `--surface-dark`, chữ trắng đậm 600.
     - Bấm thì hiện thông báo nổi như J4.
   - `RequestList` với `boxed` và `replace`. Bốn tab: "Tất cả 4", "Chờ duyệt 1", "Đã duyệt 2", "Từ chối 1". Số đếm lấy từ `getRequests().counts`.
   - Ô cuộn (panel của tab):
     - `flex: 1 1 0; height: 0; min-height: 288px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;`
     - cột dọc, khoảng cách 16px, `padding-right: 4px`, bo 16px, `tabindex="0"`.
   - Tiêu đề tháng dính đầu ô: `position: sticky; top: 0`, nền `--page`, đệm 4px.
   - Mỗi dòng dẫn tới `/nv/yeu-cau?yc=<id>` bằng `replace`.

### 5.3 Cột 2: Chấm công

1. **Đầu cột.** h2 "Chấm công", dưới là "Ca HC 08:00–17:00 · thứ Hai – thứ Bảy".
2. **`MonthSwitch`.** Nhãn "Tháng 10/2026", trạng thái "Kỳ công đang mở". Cả hai nút tắt (R3).
3. **`AttendanceTiles`.** Ba ô: "21 / 26 Ngày công", "1 Lần đi muộn", "2 Ngày nghỉ có lương".
4. **`MonthCalendar` trong thẻ trắng** đệm 20px 16px, khoảng cách 16px.
   - Ô ngày 44px, các hàng cách nhau 12px.
   - Chú giải bốn nhóm: Đi làm, Đi muộn, Nghỉ có lương, Cần xử lý.
   - Bấm một ngày có dữ liệu thì mở ngăn kéo ngày đó.
5. **`RecentDays`**, là khối giãn của cột.
   - Tiêu đề "Gần đây".
   - Thẻ chứa 7 dòng, giãn kín đáy cột.
   - Bấm một dòng thì mở ngăn kéo ngày đó.

### 5.4 Cột 3: Thu nhập

1. **Đầu cột.** h2 "Thu nhập", dưới là "Tháng 10/2026 · tạm tính", ghép từ `income.label` và `income.state` viết thường.
2. **`IncomeHero`.** Gồm:
   - "Thực nhận dự kiến", "14.278.183 ₫";
   - "Admin đang duyệt phiếu";
   - "Tổng thu nhập 15.538.183", "Khấu trừ 1.260.000".
3. **`KpiCard`.** Gồm:
   - "KPI tháng 10", "5 phần", "66,14%";
   - "Lương KPI 1.322.800", "Mức đề xuất 2.000.000";
   - năm điểm: Wework 62, Người dùng 70, Đồng nghiệp 68, Quản lý 65, Tự đánh giá 75.
4. **`IncomeLines`**, là khối giãn của cột.
   - Tiêu đề "Các khoản", rồi các dòng như J6.
   - Dòng tổng "Thực nhận 14.278.183 ₫" nằm ở đáy thẻ (`margin-top: auto`).

## 6. Ngăn kéo

### 6.1 `views/staff-phone/components/StaffPanel.vue` (mới)

- Props, slot và sự kiện giống `BottomSheet`: `title`, `sub`, slot `badge`, slot mặc định, `@close`.
- Khi rộng dựng `SideDrawer`, khi hẹp dựng `BottomSheet`.
- `DaySheet.vue`, `RequestSheet.vue`, `ChangePasswordSheet.vue` đổi `BottomSheet` thành `StaffPanel`. Nhờ vậy cùng một nội dung (J3, J5, đổi mật khẩu) chạy được ở cả hai bản.

### 6.2 `views/staff-phone/components/SideDrawer.vue` (mới, theo K2)

- **Cấu trúc:**
  - teleport vào `body`;
  - gốc có lớp `sd-drawer`;
  - nền mờ phủ cả màn, `rgba(28, 28, 28, 0.4)`.
- **Hộp:**
  - `position: fixed; top: 16px; right: 16px; bottom: 16px; width: 440px; max-width: calc(100% - 32px);`
  - đệm 24px, bo 24px, nền trắng, cột dọc, khoảng cách 16px;
  - cuộn bên trong khi nội dung dài;
  - không bóng, không hiệu ứng trượt (R9).
- **Vai trò:** `role="dialog"`, `aria-modal="true"`, `aria-label` là tiêu đề.
- **Đầu hộp:**
  - trái: h2 League Spartan 600 28px/32px, dưới là dòng phụ màu `--muted` cách 4px;
  - phải: nút tròn 40px ✕ với `aria-label="Đóng ngăn kéo"` (R8).
  - Slot `badge` nằm dưới đầu hộp. Ví dụ ở K2 là "Cần xử lý".
- **Thân hộp:** slot mặc định. Nút "Đóng" của J3, J5 nằm ở đáy hộp (`margin-top: auto`).
- **Hành vi giữ như `BottomSheet`:**
  - khoá cuộn trang;
  - bẫy focus;
  - Esc chỉ đóng ngăn kéo trên cùng;
  - bấm nền mờ thì đóng;
  - đóng thì trả focus về phần tử đã mở.
- **Khi không còn phần tử đã mở,** ví dụ mở từ URL hoặc nút trong menu đã đóng:
  - ngăn kéo ngày: focus về ô ngày tương ứng ở lịch tháng;
  - ngăn kéo yêu cầu: focus về dòng yêu cầu tương ứng;
  - ngăn kéo đổi mật khẩu: focus về nút tài khoản.
- **Ví dụ K2, ngày 27/10:**
  - tiêu đề "Thứ Ba 27/10/2026", dòng phụ "Ca HC 08:00–17:00", nhãn "Cần xử lý";
  - thanh giờ 08:00 / 12:30 / 17:00;
  - Giờ vào 08:12, Giờ ra "Chưa có", Đi muộn 12 phút;
  - hộp "Đã gửi giải trình lúc 20:14", "Giờ ra khai 17:30 · chờ Admin duyệt";
  - nút "Đóng".

## 7. CSS

- `styles/phone.css`: các luật dùng chung đang viết dưới `:is(.ph-app, .ph-sheet)` (thẻ, ô ngày, chấm, nhãn, danh sách, khoá–giá trị, `.mut`, `.sm`…) mở rộng thêm `.sd-app` và `.sd-drawer`. Luật riêng của màn điện thoại (`.ph-app .ph …`, thanh tab) giữ nguyên.
- `styles/staff-desktop.css` (mới): luật cho khung, lưới, cột, menu, ngăn kéo và kích thước riêng của máy tính, viết dưới `.sd-app` hoặc `.sd-drawer`.
- Viền focus:
  - trên nền sáng: 2px `--text`;
  - trên nền tối: trắng (R9 của spec điện thoại);
  - riêng nút tài khoản: vàng #e8c372, như K1.

## 8. Mã cũ, mục lục, test

### 8.1 Xoá

- `views/staff-desktop/`: cả thư mục cũ (`StaffHome.vue`, `parts/`). Thư mục này được tạo lại với `StaffDesktopPage.vue`.
- `services/staff-desktop.ts`, `services/staff-requests.ts`.
- `builders/staff-desktop/`, `builders/staff-requests/`, `builders/staff-phone/`. Ngoài mã cũ không còn ai import.
- `tests/staff-ux.spec.ts`. File chỉ còn vòng test máy tính đang `fixme` và dữ liệu giả của nó.
- `layouts/StaffDesktopLayout.vue` viết lại tại chỗ (mục 4), không xoá file.

### 8.2 Mục lục thiết kế (`design-index/staff-desktop.ts`, viết lại)

- Bỏ 12 dòng `/nv-may-tinh` cũ.
- Thêm hai dòng:
  - `StaffDesktop.dc.html`: "Nhân viên trên máy tính (từ 1136px) · một trang" → `/nv/hom-nay`;
  - `StaffDesktopDay.dc.html`: "Nhân viên trên máy tính · ngăn kéo một ngày (27/10)" → `/nv/cham-cong?ngay=2026-10-27`.
- Giữ hai dòng đăng nhập: `dang-nhap.html`, `dang-nhap-sai.html`.

### 8.3 Test

**Chung cho test mới:**
- Playwright với phiên giả `nhanvien`, như `tests/fixtures/staff-phone.ts`.
- Thêm hàm `openDesktop(page, path, size = { width: 1440, height: 900 })` vào cùng file fixture.
- Không dùng `page.route`.
- Mỗi file có một test kiểm bộ ghi request `/api` rỗng.

**`tests/staff-desktop-shell.spec.ts`**
- Năm đường dẫn `/nv/*` đều hiện:
  - thanh trên;
  - ba tiêu đề h2 "Yêu cầu", "Chấm công", "Thu nhập";
  - không có `navigation` "Điều hướng".
- Menu tài khoản:
  - mở bằng nút "Lê Hoàng Nam";
  - có 6 dòng thông tin;
  - Esc đóng và focus về nút;
  - bấm ra ngoài thì đóng.
- `/nv/toi` mở sẵn menu.
- "Đổi mật khẩu":
  - mở ngăn kéo với URL `?hop=doi-mat-khau`;
  - "Huỷ" đóng ngăn kéo và focus về nút tài khoản.
- "Đăng xuất" về `/dang-nhap`.
- `/nv-may-tinh` và `/nhan-vien` đều chuyển về `/nv/hom-nay`.

**`tests/staff-desktop-page.spec.ts`**
- Số liệu chính của ba cột đúng như mục 5.
- Ba cột cao bằng nhau (đáy lệch nhau không quá 1px) ở 1440×900 và 1136×800.
- Ở 1440×1600, đáy lưới cách đáy cửa sổ 16px.
- Ô yêu cầu:
  - `overflow-y` là `auto`, cao ít nhất 288px;
  - đổi tab không làm chiều cao trang đổi;
  - tab lọc đổi dòng và đánh dấu `aria-selected`.
- Ở 1136px không có thanh cuộn ngang.
- Ở 1920px, thanh trên và lưới rộng không quá 1600px và nằm giữa.
- Check-out: thẻ ca sang trạng thái đã ra, dòng "Thứ Tư 28/10" thành "07:59 – 09:40".
- "Tạo yêu cầu" hiện thông báo nổi.

**`tests/staff-desktop-drawers.spec.ts`**
- Ngăn kéo ngày:
  - bấm ô 27 trong "Tuần này" thì URL có `/nv/cham-cong?ngay=2026-10-27`, ngăn kéo hiện đủ nội dung K2 (mục 6.2);
  - Esc đóng ngăn kéo, URL bỏ `ngay` và focus về ô 27;
  - nút ✕, nút "Đóng" và bấm nền mờ đều đóng được;
  - mở từ URL rồi đóng thì focus về ô 27/10 của lịch tháng.
- Ngăn kéo yêu cầu: dòng "Thiếu giờ ra 27/10" mở ngăn kéo yêu cầu với `?yc=giai-trinh-2710`.
- Tham số lạ: `?ngay=2026-10-31`, `?yc=khong-co` bị bỏ khỏi URL và không mở gì.
- Mở và đóng chi tiết không thêm mục lịch sử: `history.length` không đổi.

**`tests/staff-switch.spec.ts`**
- Ở 1135px: có `navigation` "Điều hướng", không có thanh trên của máy tính.
- Ở 1136px: ngược lại.
- Kéo 1440 → 1000 → 1440: trang không tải lại. Kiểm bằng một dấu đặt trên `window` trước khi kéo.
- Đang mở ngăn kéo ngày 27/10, thu cửa sổ về 1000px thì thành tấm trượt "Thứ Ba 27/10/2026".
- Check-out ở 1440px rồi thu về 1000px: J1 thấy trạng thái đã ra lúc 09:40.

**Sửa test hiện có**
- `tests/auth-mock.spec.ts`:
  - ba chỗ chờ `/nv-may-tinh` đổi thành `/nv/hom-nay`;
  - hai test đăng xuất ở khung rộng bấm nút "Lê Hoàng Nam", rồi nút "Đăng xuất".
- Mọi test `staff-phone-*.spec.ts` phải xanh mà không sửa một dòng nào. Các test này chạy ở khung 390×844 hoặc hẹp hơn.
- Cả bộ `npm run test:ui` xanh.

## 9. Câu hỏi còn mở

Không có câu hỏi mới. Năm câu hỏi mở của spec điện thoại (mục 10) áp dụng cho cả bản máy tính:

- nhân viên có xem điểm KPI từng phần không;
- có giữ ô Tự đánh giá không;
- luồng tạo yêu cầu;
- Check-out sớm;
- "Xem phiếu lương đầy đủ" mở gì.

Bản này làm như bản điện thoại đang làm.

## 10. Phán quyết đã ghi

- Ruling: R1 — dữ liệu giả giữ 4 yêu cầu — app điện thoại và test J4 đang dựa vào đúng 4 yêu cầu, và 4 dòng vừa khít ô. Muốn xem cuộn thì mở board K1, tuỳ chọn "Nhiều (thử cuộn)". Test kiểm ô cuộn bằng thuộc tính CSS và chiều cao — rủi ro nếu sai: thêm yêu cầu vào `mock/staff-phone.ts` và sửa số đếm trong test J4.
- Ruling: R2 — `recent` trả 7 ngày; máy tính hiện 7, điện thoại hiện 5 — K1 vẽ 7 dòng để cột 2 kín; J2 và test điện thoại vẫn là 5 — rủi ro nếu sai: đổi một con số.
- Ruling: R3 — chỉ cột 2 có nút chọn tháng, cả hai nút tắt; cột 3 theo cùng tháng 10 — K1 vẽ một nút chọn tháng; dữ liệu giả chỉ có tháng 10 (R4 của spec điện thoại) — rủi ro nếu sai: thêm nút ở cột 3 khi có nhiều tháng.
- Ruling: R4 — "Tạo yêu cầu" hiện thông báo nổi; Check-out làm như R7 của spec điện thoại, rồi tải lại dữ liệu Hôm nay và Chấm công — hai bản phải phản hồi giống nhau trên cùng dữ liệu — rủi ro nếu sai: đổi khi có luồng tạo yêu cầu.
- Ruling: R5 — thanh trên và lưới rộng tối đa 1600px, nằm giữa — board chỉ vẽ ở 1440px; ở 2560px, lịch và các dòng bị kéo quá dài — rủi ro nếu sai: đổi một con số.
- Ruling: R6 — trang máy tính dựng ở khung, không qua `RouterView` — năm route `/nv/*` là năm bản ghi route khác nhau; dựng qua `RouterView` thì mỗi lần mở ngày hay yêu cầu từ đường dẫn khác, trang dựng lại từ đầu, mất tab lọc, vị trí cuộn và cảm giác "một trang" — rủi ro nếu sai: chuyển trang vào `RouterView` và giữ trạng thái bằng store.
- Ruling: R7 — trên máy tính, mở chi tiết bằng `replace`, không thêm mục lịch sử — máy tính chỉ có một trang, mở chi tiết không phải sang trang mới; J2 và J4 trên điện thoại cũng không thêm lịch sử — rủi ro nếu sai: nút Back không đóng ngăn kéo; muốn thế thì đổi sang `push`.
- Ruling: R8 — nút ✕ có tên truy cập "Đóng ngăn kéo", khác chữ "Đóng" trên board — K2 có cả ✕ lẫn nút "Đóng" ở đáy; trùng tên làm trình đọc màn hình và test lẫn hai nút — rủi ro nếu sai: đổi một nhãn.
- Ruling: R9 — ngăn kéo không có hiệu ứng trượt — board không vẽ chuyển động; không hiệu ứng thì không phải xử lý `prefers-reduced-motion` — rủi ro nếu sai: thêm một `transition`.
- Ruling: R10 — menu tài khoản là `region`, không phải `menu` của ARIA, và không bẫy focus — menu chứa cả thông tin lẫn nút; vai trò `menu` chỉ dành cho danh sách lệnh — rủi ro nếu sai: đổi vai trò và thêm phím mũi tên.
- Ruling: R11 — máy tính đọc tham số chỉ trên đúng đường dẫn như điện thoại — kéo cửa sổ qua mốc thì bản kia mở đúng chi tiết; URL nào có nghĩa ở bản này cũng có nghĩa ở bản kia — rủi ro nếu sai: nới điều kiện đọc tham số.
- Ruling: R12 — khối dùng chung đặt trong `views/staff-phone/components/`, không chuyển thư mục — chuyển thì phải đổi import của cả app điện thoại và làm diff khó đọc — rủi ro nếu sai: tên thư mục "phone" chứa khối dùng chung; đổi tên sau.
- Ruling: R13 — xoá `KpiSelfCard.vue` (ô tự đánh giá) cùng trang cũ — câu hỏi mở 2 của spec điện thoại chưa có trả lời; board K1 không có ô này — rủi ro nếu sai: lấy lại từ git khi người dùng muốn giữ ô.
