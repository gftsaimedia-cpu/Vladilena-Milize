# Khung Admin và Tổng quan mới chạy trên dữ liệu giả

- Ngày: 04/11/2026
- Loại: Architectural (tách FE khỏi BE, đổi khung dùng chung cho mọi màn Admin)
- Trạng thái: chờ người dùng duyệt
- Concept đã duyệt: canvas [Admin Dashboard Concept](https://claude.ai/artifact/6ro7y3NXoqxGWHfVsBr1Hd), artboard A (thanh bên tối) và B (thanh bên sáng)
- Màu, chữ, khoảng cách: design system GFT AI C&B (`surface-*`, `ink*`, `gold*`, `status-*`, `radius-*`, `space-*`)

## Mục tiêu

1. Giao diện web (`web/`) chạy độc lập, không gọi máy chủ, để làm mockup UI bằng dữ liệu giả.
2. Khung Admin và màn Tổng quan theo concept: bố cục ảnh mẫu, màu GFT.

## Quyết định của người dùng (trong chat, 04/11/2026)

1. Tách **toàn bộ** FE khỏi BE: không còn lời gọi mạng tới `/api`, bỏ proxy.
2. Dữ liệu giả **theo màn**: service trả thẳng dạng dữ liệu màn cần, không giả lập định dạng thô của BE.
3. Giữ cả hai kiểu thanh bên, người dùng tự đổi; mặc định tối.
4. Bỏ mọi tính năng AI khỏi concept.
5. Chỉ giữ một ô tài khoản: ở chân thanh bên. Thanh trên không có avatar.
6. Đợt này làm phiên đăng nhập, khung và Tổng quan. Các màn khác tạm hiện lỗi hoặc trống, làm dữ liệu giả từng màn ở các đợt sau.

## Ngoài phạm vi

- Dữ liệu giả và giao diện mới cho các màn khác (Yêu cầu, Chấm công, KPI, Bảng lương, Nhân sự, Cài đặt, khu nhân viên, phiếu in).
- Mọi thay đổi ở code BE: `src/`, `migrations/`, `test/v2/`, `spec/`.
- Xoá hẳn `web/src/services/http.ts` (làm khi không còn service nào gọi `api()`).
- Lưu dữ liệu giả qua lần tải lại trang (trừ phiên đăng nhập và tuỳ chọn hiển thị).

## 1. Lớp dữ liệu giả

### 1.1 Thư mục `web/src/mock/`

| File | Nội dung |
|------|----------|
| `clock.ts` | `MOCK_NOW = '2026-10-28T02:40:00.000Z'` (09:40 thứ Tư 28/10/2026 giờ Việt Nam). Mọi dữ liệu giả và mọi chỗ trước đây đọc `serverNow` đều dựa vào mốc này, nên màn và test luôn ra cùng một kết quả. |
| `respond.ts` | `respond(value)` trả `Promise` của một bản sao sâu (`structuredClone`) để màn không sửa nhầm dữ liệu gốc và vẫn chạy bất đồng bộ như khi có máy chủ. |
| `accounts.ts` | Hai tài khoản giả: `admin` (Quản trị viên, vai trò `admin`, đủ `ADMIN_CAPS`, `payrollSubject: false`) và `nhanvien` (Nguyễn Thu Hà, vai trò `staff`, `payrollSubject: true`). |
| `period.ts` | Thanh kỳ lương ở dạng màn `{ month, state, stateCls, steps }` cho một tháng bất kỳ: tháng 10/2026 là "Chờ phê duyệt" (Chấm công, Chốt công, Tính lương đã xong; Phê duyệt là bước hiện tại); các tháng trước là "Đã trả lương". |
| `shell.ts` | Số đếm của khung và nội dung chuông (yêu cầu chờ duyệt, giải trình chờ xử lý, tăng ca chờ duyệt, ngày quên chấm công). Số "yêu cầu chờ duyệt" đọc từ danh sách duyệt của `overview.ts`, nên duyệt ở Tổng quan thì badge và chuông giảm theo. |
| `overview.ts` | Dữ liệu Tổng quan (mục 3.1) và trạng thái trong bộ nhớ của danh sách "Việc cần duyệt". |

Dữ liệu giả nằm trong bộ nhớ của trang: tải lại trang thì về như ban đầu.

### 1.2 `api()` không còn gọi mạng

- `web/src/services/http.ts`: `api()` không gọi `fetch`. Mọi lời gọi trả `Promise` bị từ chối với `ApiError` mã `mock_missing`, trạng thái `501`, câu: `Màn này chưa có dữ liệu giả (GET /đường-dẫn).`
- Các hàm phụ `qs`, `newRequestId`, `onUnauthorized`, `onWarnings`, lớp `ApiError` giữ nguyên để các service chưa chuyển vẫn biên dịch được.
- `web/vite.config.ts`: bỏ `apiProxy`, `BACKEND_ORIGIN` và khoá `proxy` của `server`/`preview`; sửa chú thích đầu file cho đúng.
- Các màn chưa có dữ liệu giả nhận lỗi này qua `useLoad` và hiện trạng thái lỗi sẵn có của màn. Màn gọi `api()` ngoài `useLoad` chỉ ghi lỗi ở console. Đợt này không sửa các màn đó.

### 1.3 Phiên đăng nhập giả

- `stores/session.ts` `load()`: đọc tên tài khoản từ `localStorage['aicb.mock.session']`. Chưa có khoá thì là `admin` (mở app là vào thẳng khu Admin). Giá trị `none` là đã đăng xuất. Đọc hoặc ghi `localStorage` bị chặn thì coi như `admin` và chỉ giữ trong phiên.
- `apply()` nhận dữ liệu tài khoản giả với `serverNow = MOCK_NOW`, giữ nguyên các getter (`isAdminCapable`, `home`, `shellMe`).
- `services/session.ts`:
  - `login({ username, password })`: chuẩn hoá tên như cũ (cắt khoảng trắng, viết thường). Tên hoặc mật khẩu rỗng thì ném `ApiError(400, 'Nhập tên đăng nhập và mật khẩu.')`. Tên `admin` vào tài khoản `admin`. Tên khác vào tài khoản `nhanvien`, giữ tên đăng nhập đã gõ. Ghi tên vào `localStorage`, rồi gọi `load()`.
  - `logout()`: ghi `none`, `clear()` store.
  - `changePassword()`: trả `{ ok: true }`.
- Màn đăng nhập thêm một dòng chú thích dưới nút Đăng nhập: "Bản mockup: mật khẩu bất kỳ. Tên `admin` vào khu quản trị, tên khác vào khu nhân viên."

### 1.4 Thanh kỳ lương

- `stores/period.ts` `refresh()` đọc thanh từ `mock/period.ts` thay cho `GET /periods/:month`. Tháng hiện tại là 2026-10 (theo `MOCK_NOW`); xem lùi tới tháng 1/2026 như quy tắc cũ.
- Xoá `buildStrip` và các bảng nhãn chỉ nó dùng trong `builders/period-strip.ts`; giữ `emptyStrip` và `monthTitle`.

## 2. Khung Admin

### 2.1 Thanh bên (`AdminSidebar.vue`)

- Là một thẻ nổi: vùng app có lề `space-4` (16px), thanh bên rộng 248px, bo `radius-lg` (24px), cao bằng vùng nội dung và dính khi cuộn như hiện nay.
- Mục menu giữ nguyên `ADMIN_SIDEBAR_GROUPS`: Tổng quan, Yêu cầu (badge số), nhóm Kỳ lương (Chấm công, Đánh giá KPI, Bảng lương), nhóm Đội ngũ (Nhân sự). Chân thanh: Cài đặt và nút tài khoản (avatar chữ, tên, vai trò) mở `AccountMenu` như cũ.
- Mục menu cao 40px, bo `radius-sm`, icon 20px, cách nhau 4px; tiêu đề nhóm cỡ 12px.
- Hai kiểu màu, chọn bằng `html[data-side]` (store `ui.side` đã có):

| Phần | Tối (`dark`, mặc định) | Sáng (`light`) |
|------|-----------------------|----------------|
| Nền thẻ | `surface-dark` #1c1c1c, không viền | `surface-card` #ffffff, viền `border-subtle` |
| Chữ mục | `white` | `ink` |
| Tiêu đề nhóm, vai trò | `ink-on-dark-muted` #9e9e9e | `ink-muted` #616161 |
| Mục đang chọn | nền `surface-dark-raised` #2a2a2a, chữ và icon `gold` | nền `gold-light` #fce8b2, chữ và icon `ink` |
| Badge số | nền #2a2a2a, chữ `white` | nền `status-draft`, chữ `ink` |
| Logo | bản trắng | bản đen |
| Vòng focus | `gold` | `focus-ring` (`ink`) |

### 2.2 Đổi kiểu thanh bên

- `AccountMenu.vue`, trong nhóm tuỳ chọn hiển thị đang có (Nền Xám/Kem, Mật độ), thêm hàng **Thanh bên: Tối | Sáng**, gọi `ui.set({ side: 'dark' | 'light' })`. Lựa chọn lưu ở trình duyệt như các tuỳ chọn khác.

### 2.3 Thanh trên (component mới `AdminTopbar.vue`)

- Nằm đầu vùng nội dung, cao 40px, thay vị trí của `PeriodStrip` hiện nay.
- Trái: ô tìm kiếm (nhãn cho trình đọc màn hình "Tìm nhân viên", chữ gợi ý "Tìm nhân viên…", viền `border-control`, bo `radius-sm`, rộng tối đa 440px). Enter với chữ không rỗng thì mở `/admin/nhan-su?q=<chữ>`, giữ `?thang`.
- Phải: chọn tháng (nút Tháng trước/Tháng sau và nhãn "Tháng 10/2026", giữ logic giới hạn và đổi `?thang` của `PeriodStrip`), rồi nút chuông tròn 40px có badge số (class `bell` để `BellPopover` nhận ra như cũ).
- Không có avatar.
- Điện thoại (< 768px): nút mở ngăn kéo menu nằm đầu thanh trên. Ô tìm kiếm xuống dòng chiếm hết chiều ngang. Bẫy focus, phím Escape và `inert` của ngăn kéo giữ như hiện nay.

### 2.4 Dải các bước kỳ lương (`PeriodStrip.vue`)

- Chỉ còn nhãn trạng thái kỳ và các bước (Chấm công → Trả lương). Phần chọn tháng và chuông chuyển lên thanh trên.
- Hiện dưới thanh trên ở các màn `cham-cong`, `kpi`, `luong`. Không hiện ở Tổng quan, vì Tổng quan đã có thẻ Kỳ lương.

### 2.5 Chuông (`BellPopover.vue`)

- Toàn bộ nội dung lấy từ `getBell()` đọc `mock/shell.ts`, kể cả số tăng ca chờ duyệt. Bỏ lời gọi `getOvertimeRequests`.

### 2.6 Lớp phủ và tham số đường dẫn

- `?hop=chuong | menu-tai-khoan | doi-mat-khau`, việc đóng lớp nổi khi đổi màn và việc giữ `?thang` khi bấm menu giữ nguyên.

## 3. Tổng quan (`views/admin/overview/OverviewView.vue`)

### 3.1 Dữ liệu (`mock/overview.ts`, dạng màn)

`getOverview(month)` trả cùng bộ số cho mọi tháng; chỉ các nhãn có tên tháng đổi theo `month`.

- **Tiêu đề:** "Còn 4 việc phải xong trước khi chốt lương tháng 10 · hạn 31/10, còn 3 ngày".
- **4 thẻ KPI:**
  1. Quỹ lương tháng 10: 2,48 tỷ ₫, ▲ 3,2% so với tháng trước. Đây là thẻ nền `gold` duy nhất của màn, chữ `ink`.
  2. Nhân sự đang làm: 128, ▲ 4 người so với tháng trước.
  3. Có mặt hôm nay: 113 / 128, 15 người chưa chấm công vào.
  4. Yêu cầu chờ duyệt: lấy theo danh sách chờ duyệt (ban đầu 9), ▼ 3 so với tháng trước. Ít yêu cầu tồn là tốt nên mũi tên dùng `status-done`.
- **Chấm công:** 88% có mặt hôm nay; cột tỉ lệ có mặt 6 ngày làm việc gần nhất: T5 22/10 94%, T6 23/10 91%, T7 24/10 78%, T2 26/10 96%, T3 27/10 93%, Hôm nay 28/10 88%.
- **Kỳ lương tháng 10:**
  - Trạng thái "Chờ duyệt", kỳ công 01/10 – 31/10/2026, ngày trả lương 05/11/2026.
  - Thực nhận 2,11 tỷ ₫ (85%), khấu trừ BHXH và thuế 0,37 tỷ ₫.
  - Phiếu lương: 86 đã duyệt, 29 chờ duyệt, 12 nháp, 1 từ chối (tổng 128).
- **Việc cần duyệt:** 9 yêu cầu (nghỉ phép, tạm ứng, giải trình), mỗi yêu cầu có id, họ tên, chữ viết tắt, loại, chi tiết. Thẻ hiện 3 yêu cầu đầu.
- **Bảng lương tháng 10:**
  - 6 dòng mẫu: Nguyễn Thu Hà, Trần Minh Quân, Lê Hoàng Nam, Phạm Ngọc Anh, Võ Đức Thịnh, Đỗ Mai Linh. Mỗi dòng có chức danh, phòng ban, ngày công, lương cơ bản, phụ cấp, thực nhận, trạng thái.
  - Số đếm trạng thái toàn kỳ khớp thẻ Kỳ lương. Thời điểm cập nhật: 09:40.

### 3.2 Bố cục (theo artboard trên canvas, đã bỏ AI)

1. Tiêu đề trang "Tổng quan" (League Spartan 28px) và dòng phụ ở mục 3.1. Bên phải là nút chính "Mở bảng lương" (nền `black`, chữ `white`) dẫn tới `/admin/bang-luong`.
2. Hàng 4 thẻ KPI: lưới `auto-fit`, mỗi thẻ rộng tối thiểu 220px, cách nhau 24px. Thẻ bo `radius-md`, đệm `space-5`, có icon tròn 32px, số 32px `tabular-nums`, dòng so sánh 12px.
3. Hàng 3 thẻ (lưới `auto-fit`, mỗi thẻ rộng tối thiểu 320px, bo `radius-lg`, đệm `space-6`):
   - **Chấm công:** số % lớn, 6 cột dọc. Rãnh cột màu `status-draft`, phần có mặt màu `surface-dark`, cột hôm nay màu `gold`. Mỗi cột ghi % ở trên, thứ và ngày ở dưới. Có chú thích màu.
   - **Kỳ lương:** nhãn trạng thái dạng viên thuốc, danh sách thông tin kỳ, biểu đồ vòng (thực nhận `surface-dark`, khấu trừ `gold`) có % ở giữa, thanh chia đoạn trạng thái phiếu và số đếm từng trạng thái.
   - **Việc cần duyệt:** badge số, mỗi dòng gồm avatar chữ, tên, loại · chi tiết, nút icon Từ chối (viền `border-control`) và Duyệt (nền `black`), có `aria-label` đầy đủ. Liên kết "Xem tất cả" dẫn tới `/admin/yeu-cau`.
4. **Bảng lương:**
   - Tiêu đề, dòng "128 phiếu · cập nhật lúc 09:40" và ô tìm theo tên hoặc phòng ban.
   - Hàng nút lọc trạng thái dạng viên thuốc, có `aria-pressed`: Tất cả, Nháp, Chờ duyệt, Đã duyệt, Từ chối, kèm số đếm.
   - Bảng có các cột: Nhân viên (avatar chữ, tên, chức danh), Phòng ban, Ngày công, Lương cơ bản, Phụ cấp, Thực nhận, Trạng thái. Các cột số căn phải, `tabular-nums`.
   - Chân bảng ghi "Hiển thị 6 trong 128 phiếu" kèm liên kết "Mở bảng lương đầy đủ".
5. Màn hẹp: các lưới tự xuống hàng. Bảng cuộn ngang trong hộp riêng (rộng tối thiểu 920px), hộp nhận focus bằng bàn phím.

Khác với canvas, bản code bỏ: nút "Xuất báo cáo", nút "…" trên từng thẻ, nút "Lọc", nút phân trang. Mockup không có chức năng cho các nút này nên không đặt nút giả.

### 3.3 Hành vi

- **Duyệt / Từ chối:**
  - `approveRequest(id)` hoặc `rejectRequest(id)` trong `services/admin-main.ts` chuyển sang `mock/overview.ts`: bỏ yêu cầu khỏi danh sách trong bộ nhớ.
  - Sau đó màn tải lại dữ liệu và khung tải lại số đếm: KPI 4, badge Yêu cầu và số chuông cùng giảm 1.
  - Hiện toast "Đã duyệt yêu cầu của <tên>." hoặc "Đã từ chối yêu cầu của <tên>.".
  - Hết yêu cầu thì thẻ ghi "Không còn yêu cầu nào chờ duyệt.".
- **Lọc và tìm trong bảng:**
  - Lọc chạy tại chỗ trên 6 dòng mẫu. Trạng thái lọc giữ trong màn, không ghi lên đường dẫn.
  - Tìm không phân biệt hoa thường và dấu.
  - Không khớp thì hiện "Không có phiếu nào khớp.".
- Đổi tháng ở thanh trên thì màn tải lại với nhãn tháng mới.

### 3.4 Gỡ bỏ

- Thẻ danh sách việc chặn trước khi chốt và thẻ "Sắp tới" của bản cũ.
- `getOverview`, `getBell` bản gọi API; `buildOverview`, `buildBell` và phần còn lại của `builders/admin-main/overview.ts` nếu không còn nơi dùng.
- CSS riêng của Tổng quan cũ không còn dùng.

## 4. Kiểm thử và xác minh

### 4.1 Test mới (Playwright, `web/tests/`)

- `admin-shell.spec.ts` (viết lại, không dùng `page.route`):
  1. Mở `/admin/tong-quan` và bấm qua các mục menu: không có request nào tới `/api`.
  2. Thanh bên mặc định tối. Đổi sang Sáng trong menu tài khoản thì `html[data-side="light"]`, và lựa chọn còn sau khi tải lại.
  3. Ngăn kéo điện thoại: các kiểm tra bàn phím, `inert`, Escape và giữ tham số đường dẫn của test cũ, chỉnh theo chỗ mới của nút mở và nút chọn tháng.
  4. Đổi màn đóng lớp nổi và bỏ `?hop`.
  5. Phóng to về máy tính thì ngăn kéo đóng.
  6. Gõ vào ô tìm kiếm rồi Enter thì mở `/admin/nhan-su?q=…`.
  7. Nút Tháng trước đổi `?thang` và nhãn tháng.
- `admin-overview.spec.ts` (mới):
  1. Hiện 4 thẻ KPI với số giả, 6 cột chấm công, thẻ Kỳ lương và 3 yêu cầu.
  2. Duyệt một yêu cầu: dòng biến mất, badge Yêu cầu từ 9 còn 8, có toast.
  3. Lọc "Chờ duyệt" thì chỉ còn các dòng chờ duyệt. Tìm "quan" thì ra đúng Trần Minh Quân. Tìm chữ không khớp thì hiện câu trống.
- `auth-mock.spec.ts` (mới): đăng nhập `nhanvien` vào khu nhân viên; đăng nhập `admin` vào `/admin/tong-quan`; đăng xuất về `/dang-nhap`.

### 4.2 Test cũ của các màn khác

- Chạy từng file. Test nào vẫn xanh thì giữ.
- Test đỏ vì màn chưa có dữ liệu giả thì đánh dấu `test.fixme` kèm lý do `Chờ dữ liệu giả cho màn <tên> (đợt sau)`. Bật lại khi làm tới màn đó.
- Test Tổng quan cũ ("overview keeps zero-count groups collapsed…") bị xoá, vì thẻ việc chặn đã bỏ.

### 4.3 Lệnh xác minh

- `npm --prefix web run test:ui`: test mới xanh; test cũ hoặc xanh hoặc `fixme` có lý do.
- `npm run typecheck:web`.
- `npm run format:check`.
- `npm test` ở thư mục gốc (BE): kết quả như trước khi sửa, để chứng minh BE không bị đụng.
- Mở app trong trình duyệt ở 1440px và 375px, chụp màn Tổng quan với thanh bên tối và sáng.

## 5. Rủi ro

| Rủi ro | Cách xử lý |
|--------|------------|
| Các màn khác hiện lỗi cho tới khi có dữ liệu giả | Người dùng đã chấp nhận. Câu lỗi ghi rõ màn chưa có dữ liệu giả. |
| Đồng hồ giả cố định ở 28/10/2026, lệch với ngày thật | Chủ đích, để dữ liệu và test ổn định. Ghi trong chú thích của `mock/clock.ts`. |
| Đổi `PeriodStrip` ảnh hưởng màn Chấm công, KPI, Bảng lương | Giữ nguyên dữ liệu và API `setStrip`/`resetStrip` của store; chỉ chuyển phần chọn tháng và chuông lên thanh trên. |
| Tests cũ bị `fixme` làm giảm độ phủ | Mỗi `fixme` ghi tên màn; đợt làm màn đó phải bật lại. |

## 6. Phán quyết đã ghi

- Ruling: đồng hồ giả 28/10/2026 09:40 thay cho 04/11 trên canvas — để "kỳ lương tháng 10, hạn chốt 31/10" khớp với "hôm nay" — rủi ro nếu sai: chỉ là ngày hiển thị, đổi một hằng số.
- Ruling: chuông và badge Yêu cầu đọc chung danh sách duyệt giả — để duyệt ở Tổng quan thì các số trên khung đổi theo — rủi ro nếu sai: số trên khung không khớp màn Yêu cầu khi màn đó có dữ liệu giả; khi làm màn Yêu cầu sẽ dùng chung nguồn này.
- Ruling: `api()` vẫn còn nhưng luôn báo lỗi `mock_missing` — để các service chưa chuyển vẫn biên dịch, đồng thời không còn lời gọi mạng nào — rủi ro nếu sai: còn mã chết theo định dạng BE cho tới khi các màn được chuyển hết.
