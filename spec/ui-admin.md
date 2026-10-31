# Giao diện Admin (`public/admin.html` + `public/admin/`)

Đặc tả mô tả hành vi của mã hiện có. Chỗ chú thích và mã nói khác nhau thì theo mã; chỗ lệch được ghi ở mục 8.
Đường dẫn API viết không có tiền tố `/api` (giao diện gọi `A.api(method, '/x')`, `core.js` tự thêm `/api`).
Giao diện Admin không tính lương: mọi số tiền là số máy chủ trả. Phần giao diện còn tự tính (đếm, cộng nhãn) liệt kê ở mục 4.

## 1. Phạm vi và file

### 1.1 Trang và thứ tự nạp

`public/` có ba trang HTML: `admin.html` (giao diện này), `nhan-vien.html` (app nhân viên), `dang-nhap.html`.
Khi có `web/dist/index.html` (bản Vue đã build), `lib/http.js` phục vụ `web/dist` trước `public/`; khi không có thì "/" chuyển tới `dang-nhap.html`.
Các file trong `public/admin/` chỉ chạy qua `admin.html`.

`public/admin.html` (109 dòng) nạp theo thứ tự:

1. Mô-đun dùng chung ở `public/`: `home-route`, `payroll-params`, `work-schedule`, `approval-view`, `kpi-score`, `punch`,
   `actual-hours`, `attendance-status`, `formula-vocab`, `formula`, `payroll-graph`, `payroll-calendar`, `pay-entries-calc`,
   `pay-blocks-calc`, `pay-options-calc`, `pay-tail-calc`, `payroll-day-parts`, `payroll-engine`.
2. File Admin, theo thứ tự: `icons`, `core`, `ui`, `ai`, `data`, `view-duyet`, `view-ung-luong`, `view-giai-trinh`, `view-cham-cong`,
   `cham-cong-khai`, `view-ho-so`, `view-kpi`, `view-tro-ly`, `tham-so-sap-co`, `tham-so-bieu-thue`, `view-tham-so`, `view-khung-luong`,
   `view-khung-xem-truoc`, `view-khung-chuc-vu`, `view-khoi-phu-cap`, `tham-so-thuoc-tinh`, `view-nhat-ky`, `view-phan-quyen`,
   `cai-dat-so-do`, `cai-dat-quyen-loi`, `cai-dat-ky-luong`, `view-cai-dat`, `view-phieu`, `phieu-a4`, `phieu-a4-days`, `phieu-co-dien`,
   `view-khoan-them`, `view-ky-luong`, `view-ky-luong-phieu`, `view-khac`, `catalog-positions`, `catalog-shifts`, `staff-history`,
   `leave-ledger`, `boot`.

Thứ tự này có ý nghĩa: file sau gọi `A.X` mà file trước định nghĩa (ví dụ `view-ky-luong-phieu.js` dùng `A.Ky.kit` của `view-ky-luong.js`,
`phieu-a4.js` dùng `A.Phieu.kit` của `view-phieu.js`). `boot.js` phải đứng cuối.
CSS: `admin.css` là nền; mỗi màn có file `man-*.css` hoặc `view-*.css` riêng, `phieu-in.css` và `phieu-a4-days.css` cho bản in.

Phần mã Admin chỉ gọi các mô-đun chung sau:
- `HomeRoute` (`boot.js`, `core.js`): `LOGIN_PAGE`, `adminCapable`.
- `ApprovalView` (`cham-cong-khai.js`).
- `PayrollParams.DEFAULTS` (`cham-cong-khai.js`).
- `ActualHours.RULE` (`view-cai-dat.js`) và `ActualHours.lateMinutes` (`view-cham-cong.js`).
- `AttendanceStatus` (`view-cham-cong.js`, `view-giai-trinh.js`).

Admin không gọi `PayrollEngine`, `Formula`, `PayrollGraph` hay các `*-calc` (mục 8).

### 1.2 Khung chung

| File | Dòng | Vai trò |
| --- | --- | --- |
| `core.js` | 1063 | Biến toàn cục `window.Admin` (gọi tắt `A`), trạng thái `A.S`, trình trợ giúp ngày/số, đồng hồ máy chủ, `A.api`, `A.live` (SSE), `A.register`/`A.go`/`A.loadView`/`A.render`, uỷ quyền sự kiện `data-act`/`data-input`, hộp thoại, bản nháp, nhãn loại/ca/khoản yêu cầu (`A.ITEM_LABEL`), `A.positions`, `A.levelNames`, `A.SHIFTS`/`A.shiftsLoad`, `A.canActFor` |
| `ui.js` | 224 | Thanh bên, popover tài khoản (nền, mật độ), thanh trên: chọn tháng, trạng thái và dải 6 bước kỳ lương, chuông "Việc cần xử lý" |
| `data.js` | 26 | `A.loadStaff` (`GET /staff`), `A.people()` (lọc `payrollSubject`, thiếu trường thì `role !== 'admin'`), `A.holidaySet()` (từ `meInfo.holidays`) |
| `ai.js` | 535 | Nhãn quy tắc AI (`A.RULE_LABEL`), `A.loadAi`, `A.aiJoin`, `A.aiSplit`, `A.openWhy`, `A.Dismiss` (bỏ qua cảnh báo có lý do) |
| `boot.js` | 154 | Đọc `/api/me`, chuyển hướng, gắn bộ nghe SSE, khởi động |
| `icons.js` | 58 | Bộ biểu tượng SVG |

### 1.3 Màn hình (khoá view → file)

| Khoá (`#hash`) | Tên trên màn | File |
| --- | --- | --- |
| `tong-quan` | Tổng quan | `view-khac.js` |
| `duyet` | Yêu cầu (tab "Yêu cầu": khoản tự khai, tạm ứng; tab "Giải trình") | `view-duyet.js`, `view-ung-luong.js`, `view-giai-trinh.js` |
| `cham-cong` | Chấm công & phép (tab `bang`, `ca`, `phep`, `hom-nay`, `ot`) + khai thay | `view-cham-cong.js`, `cham-cong-khai.js`, `leave-ledger.js` |
| `kpi` | Đánh giá KPI | `view-kpi.js` |
| `luong` | Bảng lương (kỳ lương, phiếu, khoản cộng/trừ thêm) | `view-ky-luong.js`, `view-ky-luong-phieu.js`, `view-phieu.js`, `phieu-a4.js`, `phieu-a4-days.js`, `phieu-co-dien.js`, `view-khoan-them.js` |
| `ho-so` | Nhân sự | `view-ho-so.js`, `staff-history.js` |
| `tro-ly` | Trợ lý AI | `view-tro-ly.js`, `ai.js` |
| `cai-dat` | Cài đặt (mục `so-do`, `quyen-loi`, `chuc-vu`, `cham-cong`, `kpi`, `nguong-ai`, `phan-quyen`, `nhat-ky`) | `view-cai-dat.js`, `cai-dat-so-do.js`, `cai-dat-quyen-loi.js`, `cai-dat-ky-luong.js`, `view-tham-so.js`, `tham-so-*.js`, `view-khung-luong.js`, `view-khung-xem-truoc.js`, `view-khung-chuc-vu.js`, `view-khoi-phu-cap.js`, `catalog-positions.js`, `catalog-shifts.js`, `view-phan-quyen.js`, `view-nhat-ky.js` |
| `phuc-loi`, `bao-cao` | Phúc lợi, Báo cáo | `view-khac.js`, `view-khac.js` (không có trong menu) |

- Menu (`A.NAV_GROUPS`, `core.js`) gồm bốn nhóm:
  1. (không tiêu đề) Tổng quan, Yêu cầu
  2. "Kỳ lương": Chấm công & phép, Đánh giá KPI, Bảng lương
  3. "Đội ngũ": Nhân sự
  4. "Phân tích": Trợ lý AI
- `cai-dat` là menu phụ (`A.NAVS2`, "Cài đặt").
- Menu con của Cài đặt (`GROUPS`, `view-cai-dat.js`):
  - "Lương": Cách tính lương (`so-do`), Chế độ theo loại (`quyen-loi`), Chức vụ & bậc (`chuc-vu`).
  - "Vận hành": Lịch, ca & chấm công (`cham-cong`), Đánh giá KPI (`kpi`).
  - "Kiểm soát": Cảnh báo AI (`nguong-ai`), Phân quyền (`phan-quyen`), Nhật ký thay đổi (`nhat-ky`).

### 1.4 Cơ chế dựng màn (chung cho mọi màn)

- **Đăng ký màn.** Mỗi màn đăng ký bằng `A.register(key, { load, render, after, fail, onMonth, live })`. Bộ định tuyến dùng hash, gọi qua `A.go(key)`. `A.loadView` chạy `load()` rồi `render()`.
- **Vẽ lại.** `A.render()` vẽ lại màn hiện tại và giữ con trỏ ở ô đang gõ.
- **Thao tác.** Nút có `data-act="x"` gọi `A.actions.x(el, ev)`. Ô có `data-input="y"` gọi `A.inputs.y`.
- **Đổi tháng.** `A.setMonth` lưu tháng vào `localStorage` (`aicb-admin-month`) rồi gọi `onMonth` của màn.
- **Chống mất dữ liệu đang sửa.** `A.drafts` (`core.js`) có ba phạm vi: `month`, `params`, `roles`.
  - Rời màn hoặc đổi tháng khi còn bản nháp: `guard()` hỏi "Bỏ thay đổi chưa lưu?" trước.
  - Đóng tab trình duyệt: `beforeunload` cảnh báo.
- **Chuỗi từ máy chủ.** Phải đi qua `A.esc()` trước khi đưa vào `innerHTML`.
- **Cảnh báo.** Máy chủ chỉ cảnh báo: lý do không bắt buộc (`A.reasonField`, `A.readReason` trả chuỗi có thể rỗng), các nút không bị tắt theo kỳ. Giao diện không có công tắc chế độ.

## 2. Dữ liệu

Admin không lưu dữ liệu nghiệp vụ. Mọi số liệu đọc từ API. Trên trình duyệt chỉ có:

| Chỗ lưu | Khoá | Nội dung |
| --- | --- | --- |
| `localStorage` | `aicb-admin-month` | Tháng đang xem |
| `localStorage` | `aicb-admin-nen`, `aicb-admin-density` | Nền sáng/tối (`kem`/`xam`), mật độ hiển thị (`gon`/`thoai-mai`), đặt ở `view-cai-dat.js` |
| Bộ nhớ trang | `A.S` | `month`, `view`, `sub`, `period` (kỳ lương đã nạp), `staff`, `meInfo` (bản `/api/me`), dữ liệu riêng từng màn |
| Bộ nhớ trang | `A.drafts` | Bản nháp chưa lưu theo phạm vi |

### 2.1 Trạng thái và nhãn hiển thị

| Đối tượng | Giá trị | Nơi đặt nhãn trên giao diện |
| --- | --- | --- |
| Kỳ lương | `open → attendance_locked → calculated → reviewed → approved → paid` | `ui.js` `A.PERIOD_STEPS`/`A.PERIOD_STATE` (thanh trên); `view-ky-luong.js` `STATUS_TXT`/`STATUS_PILL`/`NEXT_ACTION` (hai bộ nhãn riêng). Chữ bước: Chưa tính lương, Chốt công, Tính lương, AI kiểm tra, Phê duyệt, Trả lương |
| Phiếu lương | `draft`, `pending`, `error`, `approved` | `view-ky-luong.js` `SLIP_PILL`: Bản nháp, Chờ phê duyệt, Chưa tính được, Đã phê duyệt |
| Khoản cộng/trừ thêm | `pending`, `approved`, `rejected`, `void` | `view-khoan-them.js` |
| Dòng duyệt (khoản tự khai) | `pending`, `approved`, `rejected` | `view-duyet.js` `statusPill`: Chờ xử lý, Đã đồng ý, Đã từ chối |
| Tạm ứng | `pending`, `approved`, `rejected` | `view-ung-luong.js` `RESULT`: Chờ duyệt, Đã duyệt, Từ chối |
| Giải trình | `requested`, `answered`, `approved`, `rejected` | `view-giai-trinh.js` (`requested` / `answered` → Chờ xử lý, `approved` → Được phê duyệt, `rejected` → Bị từ chối, lấy từ `AttendanceStatus.LABEL`) |
| Lượt chấm công | `checked-in`, `checked-out`, `pending`, `approved`, `rejected`, `admin` (máy chủ tính, `session.status`) | `public/attendance-status.js` `LABEL`: Đã Check-in, Đã Check-out, Chờ xử lý, Được phê duyệt, Bị từ chối, Đã chấm công (cùng sáu nhãn với màn nhân viên); lý do ngắn `session.statusNote` là chữ nhỏ |

### 2.2 Giá trị dự phòng có sẵn trong giao diện

Các giá trị này chỉ dùng khi máy chủ chưa trả số:

- **`A.TYPE_LONG` / `A.TYPE_SHORT`** (`core.js`). Tên loại nhân sự `tts` (Thực tập sinh, TTS), `ctv` (Chuyên trách viên, CTV), `nv` (Nhân viên, NV). Dự phòng cho `GET /positions`.
- **`FALLBACK_MAX_LEVEL = { tts: 6, ctv: 4, nv: 4 }`** (`core.js`). Số bậc tối đa khi máy chủ chưa gửi.
- **`A.SHIFTS`** (`core.js`). Sáu ca dự phòng. Bị thay bằng `GET /settings/shifts?month` sau khi `A.shiftsLoad` chạy.

  | Ca | Giờ | Loại |
  | --- | --- | --- |
  | Normal1 | 08–17 | normal |
  | Normal2 | 10–19 | normal |
  | Flex1 | 06–15 | flex |
  | Flex2 | 13–22 | flex |
  | Night1 | 21–06 | night |
  | Night2 | 22–07 | night |

- **Quyền lợi theo loại ở màn khai thay.** Lấy từ `PayrollParams.DEFAULTS` (`cham-cong-khai.js`,). Riêng cờ `approved` được suy ra từ `type.<loại>.attendance > 0`.

## 3. API

Quy ước chung của `A.api(method, path, body, { warnings })` (`core.js`):
- 401: chuyển về `/dang-nhap.html`.
- Mã khác không thành công: ném `ApiError(status, message, data)`. Màn hiển thị `A.errText(e)`.
- `data.warnings[]`: `A.showWarnings` (`core.js`) hiện cảnh báo. Mức `danger` vào thanh cố định `#warnbar`; mức khác vào toast 8 giây.
  - `warnings: 'manual'`: màn tự hiện cảnh báo (dùng ở các bước kỳ lương, duyệt hàng loạt, duyệt OT).
- Lý do: `A.reasonLabel`, `A.reasonField`, `A.readReason`. Lý do không bắt buộc, tối đa 300 ký tự (mục 4.6).
- Quyền của từng route nằm ở `ROUTE_CAPS` trong `lib/authz.js`, mặc định từ chối (thiếu mục → 403 `NO_ROUTE_POLICY`).
  - `A` = chỉ cần đăng nhập.
  - `DECIDE_ALL` = `request.decide.*`: qua cổng khi có bất kỳ năng lực duyệt nào.
  - `self-or:x`: handler tự kiểm.
  - `periodScope` (`attendance`, `kpi`, `slip`, `params`): cổng khoá kỳ của route ghi.

Các cột dưới đây ghi những gì **giao diện** gửi, nhận và xử lý. Quy tắc nghiệp vụ phía máy chủ thuộc đặc tả từng mô-đun.

### 3.1 Khung chung, đăng nhập, sự kiện

| Gọi | Cap (`authz.js`) | Màn gửi / nhận | Lỗi giao diện xử lý |
| --- | --- | --- | --- |
| `GET /me` (fetch thô ở `boot.js`, `A.refreshMe`) | public | Nhận `adminCapable`, `agentsEnabled`, `serverNow` (chỉnh lệch đồng hồ, `syncClock`), `holidays`, `geofence`, `geofenceRequired`, caps | Chưa đăng nhập → `HomeRoute.LOGIN_PAGE`. Không `adminCapable` → `/nhan-vien.html` |
| `POST /logout` | public | — | — |
| `PUT /password` | `A` | `{ current, next }` | Giao diện tự chặn mật khẩu mới dưới 6 ký tự (`view-cai-dat.js`) |
| `GET /events` | `A` | SSE (mục 5) | Mất kết nối nhiều lần → bỏ cuộc |
| `GET /alerts?month` | DECIDE_ALL | Chuông: `missingPunches`, `absentNoExplanation`, `pendingApprovals` | — |
| `GET /approvals/count` | DECIDE_ALL | Số đếm trên menu | — |
| `GET /periods/:m`, `GET /periods?year=` | `payroll.view` | Thanh trên (trạng thái, 6 bước kỳ lương), `paydayExpected` | — |
| `GET /positions?month` | `config.read` | `A.positions`: tên loại, số bậc, cờ quyền lợi (`flag(code, name, fallback)`) | Lỗi thì dùng dự phòng mục 2.2 |
| `GET /settings/params?month&group=2` | `config.read` | `A.levelNames` đọc `level.<loại>.<bậc>` | — |
| `GET /settings/shifts?month` | `config.read` | `A.shiftsLoad` thay `A.SHIFTS` | — |
| `GET /staff` | `profile.read` | `A.loadStaff` | — |

### 3.2 Tổng quan (`tong-quan`, `view-khac.js`)

Màn này chỉ đọc dữ liệu:
- `A.Ky.load(true)` và `A.Ky.loadPreview()` (mục 3.3)
- `GET /approvals?status=pending&month&limit=50`
- `A.loadAi` (`GET /ai/review?month`, cap `ai.review.read`)
- `A.loadStaff`

**Nội dung hiển thị.**
- Danh sách việc cần làm của kỳ (đọc `checklist` của `GET /periods/:m`), với các mã:
  - `PENDING_APPROVALS`
  - `EXPLANATION_PENDING`
  - `FORGOT_PUNCH`
  - `PUNCH_REVIEW`
  - `MISSING_START_DATE`
  - `OPEN_SESSIONS`
  - `ISAT_INVALID`
  - `MISSING_SHIFT`
  - `AI_NOT_RUN` (chỉ khi Agents bật)
  - `PENDING_PAY_ENTRIES`
  - `RUN_STALE`
  - `MONTH_NOT_ENDED`

  Hai mã `MONTH_NOT_ENDED` và `OPEN_SESSIONS` tự hết, không cần người xử lý (`AUTO`). Máy chủ trả mọi mục là `warn` kèm `message`; không mục nào chặn chốt công hay phê duyệt kỳ.
- Thẻ "Yêu cầu chờ xử lý" (tối đa 5 dòng, Đồng ý / Từ chối ngay trên thẻ, dùng lại logic `A.Duyet`).
- Dải KPI lấy tổng của máy chủ: Quỹ lương (gross), Thực nhận (net, kèm tạm ứng), Nhân sự đang làm việc, "Còn giữ phụ cấp chuyên cần" (`attendanceKept { kept, of }`).
- Thẻ "Cảnh báo AI" (tối đa 4) và thẻ "Mốc sắp tới" (ngày lễ sắp tới, nút sang Cài đặt › Lịch, ca & chấm công).
- Số người theo loại: đếm ở giao diện.

**Thao tác.**
- Mở lý do của cảnh báo AI (`A.openWhy`).
- Bỏ qua cảnh báo, chỉ hiện khi `canDismiss()` đúng (`view-khac.js`). Điều kiện: kỳ `reviewed`, hoặc chưa biết trạng thái kỳ, hoặc kỳ `approved`/`paid`.

**Màn ẩn.**
- `bao-cao` gọi `GET /audit?limit=5` (cap `audit.read`) và hiện 5 thay đổi mới nhất.
- `phuc-loi` chỉ có thẻ "Sắp có".

### 3.3 Bảng lương (`luong`, `view-ky-luong.js` + `view-ky-luong-phieu.js`, đối tượng `A.Ky`)

**Đọc**

| Gọi | Cap | Ghi chú |
| --- | --- | --- |
| `GET /periods/:m` | `payroll.view` | `{ status, rev, run, stages, reopenCount, totals, counts, payday, paidAt, checklist, stale }` |
| `GET /periods?year=` | `payroll.view` | Ngày trả lương dự kiến |
| `GET /periods/:m/payslips?page&pageSize&status&flag&q&type` | `payroll.view` | Khi có lần tính. Đếm cờ AI bằng `flag=1&pageSize=1` và `flag=1&status=pending` |
| `GET /periods/:m/estimates?...` | `payroll.view` | Khi chưa tính (số ước tính, màu nâu) |
| `GET /periods/:m/estimates/:u`, `GET /periods/:m/payslips/:u` | `payroll.view` / `self-or:payroll.view` | Ngăn kéo phiếu (`kyslip`). Nếu route ước tính thiếu (`missingRoute`: 404, 405, 403 `NO_ROUTE_POLICY`) thì dùng route phiếu; nếu cả hai không có chi tiết thì hiện các số gộp của bảng (`condensed`) |
| `GET /periods/:m/verify` | `audit.read` | Thẻ "Kiểm lại bản chụp" (`kyverify`) |

**Lọc theo loại.**
- Máy chủ trả 400, hoặc trả về dòng thuộc loại khác: giao diện bỏ bộ lọc loại và đặt `K.typeOk = false`.
- Trang tối đa `SLIP_PAGE_MAX = 200` (`view-ky-luong.js`). Thẻ Kỳ lương của Tổng quan có `PREVIEW_ROWS = 5` dòng; ô tìm kiếm chờ `SEARCH_DEBOUNCE_MS = 300`.

**Cột của một dòng phiếu.**
- Thành phần (hiện khi "Xem đủ cột"): `tienNgayCong`, `phuCap`, `ot`, `kpi`, `khac`, và `khoanThem`, `khoanTru` khi có phiếu mang khoản.
- Tổng: `gross`, `insurance`, `tax`, `advance`, `net`.
- Ngày công: `daysWorked` / `workdaysStd`.
- Trạng thái: `flags`, `errorCode` / `errorDetail`.
- `truTreSom` đã nằm trong `tienNgayCong`: chỉ ghi chú dưới ô. `attendOk` hiện "Giữ chuyên cần" / "Mất chuyên cần" dưới ô Phụ cấp.
- `ERR_FIX` (`view-ky-luong.js`) gợi ý chỗ sửa lỗi:
  - `PAYROLL_BAD_LEVEL`, `PAYROLL_BAD_TYPE` → nút "Sửa hồ sơ" (màn Nhân sự).
  - `PAYROLL_BAD_FORMULA` → nút "Mở Cách tính lương" (Cài đặt).

**Các bước kỳ lương.**
- Mọi bước đi qua `post(step)` (`view-ky-luong.js`) = `POST /periods/:m/<step>`, thân `{ rev, ... }`, `warnings: 'manual'`.

| Bước (nút) | Gọi | Cap | Thân thêm |
| --- | --- | --- | --- |
| Chốt công | `POST .../lock-attendance` | `attendance.lock` | `{ acknowledge: [mã cảnh báo], reason }` |
| Tính lương | `POST .../calculate` | `payroll.calculate` | — |
| AI kiểm tra | `POST .../ai-review` | `ai.review.read` | — |
| Phê duyệt kỳ | `POST .../approve` | `payroll.approve` | `{ excludeErrors: [{ username, reason }] }` |
| Đã trả lương | `POST .../mark-paid` | `payroll.pay` | `{ paidAt, reference }` |
| Mở lại | `POST .../reopen` | `period.reopen` | `{ to, reason }` |
| Duyệt / trả lại phiếu | `PUT /periods/:m/payslips/decide` | `payroll.approve` | `{ items: [{ username, rev }], action: 'approve' \| 'return', note }` |

- **Phê duyệt kỳ.**
  - Giao diện đọc trước `payslips?status=error&pageSize=200`.
  - Phiếu lỗi được đưa vào `excludeErrors`.
- **Mở lại** (`reopenTargets`, `view-ky-luong.js`).
  - Đích `calculated`: cần `period.reopen`.
  - Đích `attendance_locked` và `open`: cần thêm `period.reopen.inputs`.
  - Nút luôn hiện (`view-ky-luong.js`).
- **Duyệt phiếu.**
  - Gửi theo lô `DECIDE_CHUNK = 200` (`view-ky-luong-phieu.js`).
  - `pickSlips` gom phiếu qua nhiều trang.
- **`approving()`** (`view-ky-luong.js`). Phiếu được duyệt ngay từ trạng thái `calculated` (khi có lần tính).
- **Chế độ hiển thị `modeOf`**: `est`, `calc`, `review`, `final`.
- **In cả loạt.** Nút "In N phiếu" hiện khi có phiếu `approved` (mục 3.5).

**Lỗi giao diện xử lý (`explain`)**

| Mã | Phản ứng |
| --- | --- |
| `PERIOD_STALE`, `PAYSLIP_STALE` | Nạp lại kỳ |
| `PERIOD_STATE` | Báo trạng thái không hợp lệ |
| `PERIOD_NOT_READY` | Thay danh sách việc cần làm bằng danh sách máy chủ trả |
| `PAYSLIP_FLAGGED`, `PAYSLIP_ERROR`, `PAYSLIP_STATE` | Báo lỗi theo phiếu |
| `PAYSLIP_NEGATIVE_NET` | Liệt kê phiếu kèm `net` âm |

**Khi kỳ đã khoá.** Ô sửa của ngăn kéo phiếu vẫn mở; máy chủ xử lý và trả cảnh báo (mục 3.4).

### 3.4 Phiếu lương trong ngăn kéo (`view-phieu.js`, `A.Phieu`)

| Gọi | Cap | Thân / kết quả | Lỗi |
| --- | --- | --- | --- |
| `GET /settings/params?month`, `GET /entitlements?month` | `config.read` | `paramsFor(month, hash)` làm phẳng tham số, chỉ dùng khi `paramsHash` khớp lần tính | — |
| `GET /slip-override?month&user` | `payroll.override` | Số Admin sửa (`values`, `rev`) | — |
| `PUT /slip-override` | `payroll.override`, periodScope `slip` | `{ user, month, values, reason, expectedRev }` | `PERIOD_LOCKED`: chuyển sang chỉ xem và nạp lại. `SLIP_STALE`: nạp lại, giữ số đang gõ. Cảnh báo `PERIOD_FROZEN` |

**Hộp phiếu (chế độ xem).**
- Đầu hộp là tóm tắt `sum5`: Tổng thu nhập − Bảo hiểm − Thuế TNCN − Tạm ứng (− Khoản trừ khác khi phiếu có khoản trừ) = Thực nhận. Mọi số là số chi trả của máy chủ.
- Phần "Chi tiết" chia nhóm theo `GROUPS` (`view-phieu.js`): Ngày công và lương cơ bản; Nghỉ phép và ngày lễ; Làm thêm giờ; Phụ cấp; Lương KPI (chỉ người có quyền lợi KPI); Khoản cộng thêm; Khấu trừ; Khác.
  - Chỉ hiện dòng có số; dòng bằng 0 hoặc trống ẩn sau nút "Hiện N dòng bằng 0 hoặc để trống". Bảo hiểm, Thuế TNCN, Tạm ứng và các dòng KPI của người hưởng KPI luôn hiện.
  - Nhóm "Làm thêm giờ" có ba dòng giờ theo nhóm (OT ngày thường, OT cuối tuần, OT ngày lễ) và một dòng tiền "Tiền làm thêm giờ (OT, OT ngày lễ, làm bù)". Giờ làm bù là dòng riêng "Làm bù ×1" kèm số giờ; tiền làm bù đã nằm trong dòng tiền làm thêm giờ.
  - Dòng "Nghỉ lễ hưởng lương" ghi kèm ngày lễ của tháng; khối phụ cấp do C&B thêm (mỗi khối một dòng) và khoản cộng/trừ thêm đã duyệt (mỗi khoản một dòng, theo tên dòng trên phiếu) là dòng của máy chủ, không sửa được.
  - "Tổng phụ cấp" là `payslip.allowanceTotal` của máy chủ.
  - Cuối danh sách: Tổng thu nhập, Thu nhập chịu thuế, Thu nhập sau bảo hiểm, Thực nhận.
- Phiếu chưa phê duyệt kỳ (ước tính hoặc bản nháp) hiện số màu nâu; phiếu chính thức hiện số thường. Nhãn có tỷ lệ (chuyên cần, đi lại, KPI…) lấy từ tham số của tháng; không đọc được tham số thì nhãn không kèm số.
- **Chế độ sửa.** Nút "Sửa số trên phiếu" (cần `payroll.override`, kỳ chưa khoá) mở bảng ba cột Dòng / Số tự tính / Số trên phiếu cho mọi ô sửa được.
  - Sửa ô **số lượng** (ngày công, giờ OT, điểm KPI…): sau khi Lưu, máy chủ tính lại các ô tiền phụ thuộc, bảo hiểm, thuế TNCN và thực nhận; ô đổi theo hiện nhãn "đã tính lại theo số bạn sửa".
  - Sửa thẳng **ô tiền**: giữ đúng số nhập.
  - Ô để trống giữ số tự tính. "Bỏ hết số đã sửa" cần lý do.
  - Kỳ đã duyệt hoặc đã trả lương: phiếu hiện số đóng băng lúc duyệt kỳ; số sửa lưu sau đó chỉ vào phiếu khi mở lại kỳ và tính lại (hộp ghi chú phần chờ).

**Kiểm tra ở giao diện trước khi gửi.**
- Ô tiền phải là số đồng nguyên.
- Ô có giá trị bằng số tự tính thì không gửi.
- Lý do: tối đa 300 ký tự, không bắt buộc (`view-phieu.js`).
- Danh sách ô sửa được (`MONEY`, `PCT`, `INCOME`, `ALLOW`) phải khớp `SLIP_MONEY` / `SLIP_QTY` của `src/modules/periods/periods.helpers.ts` `155`. Máy chủ từ chối ô lạ bằng 400 (`src/modules/periods/periods.helpers.ts`).

#### 3.4.1 Công thức dưới dòng Chi tiết (`payslip.formulas`)

- **Nguồn.** `lib/slip-formulas.js` → `formulasOf`, gọi từ `lib/periods.js` (`payslip()` và `estimateOne()`). Chạy lúc đọc phiếu, không ghi DB, không tính lại lương.
- **Chỉ Admin.** Phản hồi phiếu của Admin có `formulas`; phản hồi cho chính nhân viên (`self`) không có. Bản in A4, bản mẫu cổ điển và chế độ sửa số không in công thức. Giao diện (`view-phieu.js`, `fm(k)`) chỉ in chuỗi, dưới nhãn mỗi dòng ở chế độ xem.
- **Dựng từ.** Bản chụp của lần tính (dòng ngày, tổng hợp tháng, `net`), bộ tham số của chính lần tính đó (phiếu đã tính) hoặc của tháng (ước tính), và số tự tính từng ô (`cells`). Phiếu có ô số lượng ghim thì công thức dựng từ bản chụp đã tính lại, còn các dòng đếm ngày lấy từ bản chụp gốc.
- **Quy tắc trình bày.**
  - Mọi số đều có tên hoặc đơn vị ngay sau: `đ`, `ngày`, `giờ`, `đ/giờ`, `đ/ngày`, tên dòng (ví dụ "chuyên cần", "lương KPI"). Tỷ lệ (`30%`) và hệ số nhân (`× 1,5`) đứng một mình. Số theo kiểu vi-VN (`6.000.000`, `1,5`).
  - Các mảnh cộng/trừ cùng đơn giá và cùng hệ số được gộp thành một mảnh có số lượng ròng; mảnh ròng bằng 0 bị bỏ (`netSum`). Giờ lẻ ghi dạng phân số `p/q` để cộng lại đúng từng đồng.
  - Phép trừ có vế là tổng thì vế đó nằm trong ngoặc; nhóm cộng trừ nằm trong ngoặc khi đứng trong phép nhân.
  - Một công thức chỉ được giữ khi giá trị của nó bằng số tự tính của dòng (lệch không quá 1 đồng mỗi bước làm tròn; 0,01 cho tổng điểm KPI; 2 đồng cho bảo hiểm và miễn thuế). Không khớp thì dòng đó không có công thức; công thức không bao giờ bị chỉnh cho khớp. Công thức dạng chữ (giải thích vì sao bằng 0) được giữ nguyên.
- **Nội dung từng khoá** (`formulasOf`, `lib/slip-formulas.js`).

| Khoá | Công thức hiện |
| --- | --- |
| `workDays`, `unpaidDays`, `leaveDays`, `isatDays`, `holidayDays` | Danh sách ngày được đếm (`dd/mm`, ngày liền nhau từ ba ngày thành khoảng `dd–dd/mm`); chỉ khi số ngày liệt kê bằng số trên ô |
| `ot15H`, `ot20H`, `ot30H`, `makeupHours` | Từng ngày kèm số giờ: `dd/mm (N giờ)` |
| `debtH` | Giờ thiếu của các ngày đi làm + một công (số giờ mỗi ngày) cho mỗi ngày "Nghỉ, sẽ làm bù" − giờ làm bù đã trả |
| `workBase` | Lương ngày (`lương cơ bản ÷ ngày chuẩn`) × số ngày đi làm, cộng giờ thường của ngày lễ có đi làm, trừ giờ ca chính trùng ngày lễ (hai mảnh giờ gộp thành "giờ chênh ngày lễ") |
| `leavePay`, `isatPay`, `holidayPay`, `settlePay` | Lương ngày × số ngày có tiền (ngày phép, ngày iSAT hưởng lương, ngày lễ, ngày phép dư) |
| `otPay` | Cộng các nhóm giờ × lương giờ × hệ số: giờ làm bù × 1 (kèm phụ trội làm bù ngày lễ nếu bản chụp có); giờ OT × `ot.rate`; giờ OT cuối tuần × `ot.weekendRate`; giờ lễ × `ot.holidayRate`; giờ đêm lễ × hệ số đêm lễ. Nhóm cùng hệ số gộp giờ (tên chung "giờ làm thêm") |
| `attendance`, `travel` | Lương cơ bản × tỷ lệ × ngày đi làm ÷ ngày chuẩn. Chuyên cần mất thì ghi lý do bằng chữ: "N ngày nghỉ (so sánh) M ngày tối đa" hoặc "N giờ vượt (so sánh) M giờ cho phép" (ngưỡng giờ = `type.<loại>.overLimitHours` hoặc `attendance.overLimitHours`, cộng `attendance.overLimitTolerance`; phép so sánh theo `attendance.absentCompare` / `attendance.overLimitCompare`) |
| `flexPay` | Giờ linh hoạt được phụ cấp × lương giờ × tỷ lệ |
| `nightPay` | Số ca đêm × lương ngày × tỷ lệ; ca qua ngày lễ chỉ có phần sàn: giờ đêm × lương giờ × `night.breakPremium` |
| `breakPay` | Giờ nghỉ đêm × lương giờ × (1 + `night.breakPremium`) |
| `lateCut` | Giờ thiếu × lương giờ |
| `block:<mã>` | Theo cách tính của khối (số cố định, % lương cơ bản, theo bậc), nhân ngày đi làm ÷ ngày chuẩn khi khối co giãn theo ngày |
| `kpiPct`, `kpiPay` | Tổng điểm = Σ trọng số × điểm từng thành phần (Base Wework, người dùng, đồng nghiệp, quản lý, tự đánh giá); lương KPI = KPI tối đa × tổng điểm (× ngày đi làm ÷ ngày chuẩn khi hệ số ngày khác 1). Không đạt thì ghi điểm so với mốc |
| `allowanceTotal` | Cộng các dòng phụ cấp đang hiện (kèm khối phụ cấp) |
| `gross` | Cộng các dòng tiền (lương ngày công, nghỉ phép, phép dư, iSAT, nghỉ lễ, làm thêm, phụ cấp, lương KPI) + khoản cộng thêm − đi muộn về sớm |
| `exempt` | Chỉ phần trả cao hơn lương giờ thường: **giờ đêm** mỗi ngày lấy số nhỏ hơn của (giờ đêm ngoài ngày lễ × lương giờ × `tax.exempt.nightPremium`) và phụ cấp ca đã trả của ngày đó; **OT ngày thường, OT cuối tuần, OT ngày lễ, làm lễ** mỗi nhóm một ngoặc `min(tiền đã trả, mức luật của nhóm) − lương giờ × giờ của nhóm` (mức luật theo `tax.exempt.otRate`, `weekendRate`, `holidayRate`); cộng khoản miễn thuế khác (khoản/khối Admin đánh dấu miễn thuế). Tổng không vượt tổng thu nhập |
| `insurance` | Nền đóng × tỷ lệ (nền mỗi loại BHXH, BHYT, BHTN bị chặn ở trần của loại đó). Tháng không đóng thì ghi: `ngày chuẩn − ngày có lương = ngày không lương (so sánh) ngưỡng` theo `tax.insurance.skipCompare` / `skipDays` |
| `tax` | Lũy tiến: từng bậc `(thu nhập chịu thuế − bảo hiểm − giảm trừ − cận dưới bậc) × thuế suất`; giảm trừ tách bản thân và người phụ thuộc; không phát sinh thì ghi số so với ngưỡng. Hợp đồng khấu trừ cố định: thu nhập × tỷ lệ |
| `advance` | Tỷ lệ × lương cơ bản thực nhận của ngày đi làm từ ngày 1 đến ngày `advance.untilDay` (lương ngày × số ngày, trừ tiền thiếu giờ); phương án tỷ lệ cố định theo bậc thì tỷ lệ × lương cơ bản |
| `taxable`, `afterInsurance`, `net` | Tổng thu nhập − miễn thuế; tổng thu nhập − bảo hiểm; tổng thu nhập − bảo hiểm − thuế − tạm ứng (− khoản trừ khác) |

### 3.5 In phiếu A4 (`phieu-a4.js`, `phieu-a4-days.js`, `phieu-co-dien.js`)

**Lấy dữ liệu.**
- `printCurrent` in phiếu đang mở trong ngăn kéo (số hiện tại của hộp, kể cả số Admin sửa đã lưu); nút bị khoá khi đang ở chế độ sửa.
- `printApproved` đọc `GET /periods/:m/payslips?status=approved` theo trang (`PAGE_SIZE_MAX = 200`, `phieu-a4.js`).
- Với mỗi phiếu (4 yêu cầu song song, `FETCH_PARALLEL`): đọc `GET /periods/:m/payslips/:u`. Khi lần tính chưa `final`, đọc thêm `GET /slip-override`.
- Tham số của tháng chỉ tải một lần cho cả loạt; phiếu không dựng được thì liệt kê lỗi, các phiếu còn lại vẫn in.

**Bố cục.**
- Mỗi người hai trang A4 (`PAGE_W 794`, `PAGE_H 1123` px):
  - Trang 1: `daysSheet`, bảng từng ngày.
  - Trang 2: `sheetOf`, bảng tổng hợp.
- `fitPages` đo bằng một phần tử ẩn `pl-probe`. Trang nào tràn thì chuyển sang bố cục dày (`dense`).
- Hộp xem trước hiện các trang của phiếu đầu; in bằng `window.print()` ("In / Lưu PDF").
- Bản in có dấu loại phiếu: "Phiếu lương chính thức" (kỳ đã duyệt), "Bản nháp · chưa phê duyệt kỳ", hình chìm "BẢN NHÁP" / "CHƯA TÍNH LƯƠNG".
- Phiếu chưa có chi tiết (máy chủ chỉ trả số gộp) in bản rút gọn `condensedSheet` từ các số gộp của bảng lương.

**Trang 1 (`phieu-a4-days.js`).**
- Tiêu đề "Phiếu lương tháng MM/YYYY", ô thông tin (Họ tên và chức danh, Loại · bậc, Tình trạng, Kỳ lương), mục "Chấm công tháng MM/YYYY".
- Cột: Ngày, Ca, Vào – ra, Giờ làm, Lương ngày, Phụ cấp ca, Làm thêm, Trừ giờ, Thành tiền.
- Ô **Vào – ra** là giờ Check-in / Check-out thật của ngày (`punchIn`, `punchOut`, giờ Việt Nam `HH:MM`; ca qua nửa đêm thì giờ ra là giờ đồng hồ của sáng hôm sau). Bên nào không có giờ bấm thì ghi `--:--`, dạng `HH:MM – --:--`. Máy chủ ghi hai trường này vào dòng ngày (`lib/slip-paid.js` → `withDayFigures`); giao diện chỉ in chuỗi.
- Dòng ngày đi làm (`kind: 'work'`, và ngày lễ có giờ làm): chip ca (Normal / Flex / Night, kèm `+x%` theo tham số; ngày lễ thêm chip "Lễ"), giờ làm, rồi bốn ô tiền `cot.luongNgay`, `cot.phuCapCa`, `cot.lamThem`, `cot.truGio` (máy chủ tính: `lib/slip-paid.js` → `dayFiguresOf` → `PayrollEngine.columnsOfDay`) và `total`.
  - Mỗi ô là **một số**, không dòng phụ, không chữ giải thích. Lương ngày gồm mọi phần lương ngày (kể cả lương ngày lễ), Phụ cấp ca gồm phụ cấp ca và Off Paid, Làm thêm gồm OT, giờ làm bù, OT ngày lễ. Bốn ô cộng trừ đúng Thành tiền.
  - Ô không có số là gạch ngang. Ô Làm thêm của ngày chỉ có giờ OT chưa tính ghi "N giờ OT chưa tính". Bản chụp chưa có `cot`: ô là gạch ngang, `total` giữ nguyên.
- Dòng ngày không đi làm (`offRow`), chip theo loại: Nghỉ phép, iSAT, Nghỉ lễ (viền nét đứt = nghỉ hưởng lương), Không lương, Nghỉ được duyệt, Nghỉ nhưng sẽ làm bù ("Nghỉ, sẽ làm bù"), Vắng (khai đi làm mà không có Check-in/out hợp lệ), Chờ xử lý, Chưa tới (ngày chưa đến, chưa có số), Làm bù cả ngày (không tính lương).
  - Ngày vắng, ngày chờ xử lý (trừ "Chưa tới") và ngày **giữ vì giải trình** (`held`) in giờ bấm thật ở ô Vào – ra; ngày giữ hiện chip "Bị từ chối" (giải trình bị từ chối) hoặc "Chờ xử lý".
- Chân bảng (`tilesOf`): Ngày công; Ca Flex · Night; Nghỉ phép · iSAT; Nghỉ không lương (ghi "gồm N ngày vắng" khi có); Làm thêm OT (kèm giờ làm bù khi có); Đi muộn, về sớm. Số lượng lấy từ số trên phiếu (số Admin sửa thắng số tự tính) và số đếm ca của bản chụp.
- Dòng phụ ghi "ngày công theo Check-in/out" (hoặc "tính cả tháng theo lịch đã khai" khi `attendance.missingAllRule === 'declared'`, `declaredOf`).

**Trang 2 (`sheetOf`, "Tổng hợp lương").**
- Bảng ba cột Khoản / Theo quy chế / Thực tế. Cột giữa là mức tham khảo cả tháng của nhóm và bậc (`refs`, mục 4.1), cột phải là số trên phiếu (ô Admin sửa tô vàng trên màn hình, không in màu).
- Nhóm: Ngày công và lương cơ bản; Nghỉ phép và ngày lễ (Nghỉ phép có lương, Quyết toán phép dư, Nghỉ thứ 7 hưởng lương · iSAT, Nghỉ lễ hưởng lương kèm ngày lễ); Làm thêm giờ; Phụ cấp (kèm khối C&B thêm và "Tổng phụ cấp"); Lương KPI (điểm 5 thành phần trên một dòng, tổng điểm, "Lương KPI (tối đa → thực tế)"); Đi muộn, về sớm, ra ngoài; Khoản cộng thêm.
- Ba dòng OT theo nhóm giờ của máy chủ: OT ngày thường (`ot15H = otHours − otWeekendHours − otHolHours`), OT cuối tuần (`ot20H = otWeekendHours`), OT ngày lễ (`ot30H = holWorkHours + otHolHours`). Nhãn ghi hệ số theo `ot.rate`, `ot.weekendRate`, `ot.holidayRate` (`f.rates.otRates`). Cột tiền của từng dòng là số máy chủ trả cho nhóm đó (`otWeekdayPay`, `otWeekendPay`, `holWorkPay`); giao diện không tự nhân hệ số, và để trống khi Admin đang ghi đè giờ hoặc tiền OT.
- Dòng làm bù "Làm bù ×1" kèm số giờ (và tiền `makeupPay` trong nhãn); tiền đã nằm trong "Tiền làm thêm giờ (OT, OT ngày lễ, làm bù)" (`otPay + holWorkPay + makeupPay`).
- Phần tổng: Tổng thu nhập, Các khoản miễn thuế, Thu nhập chịu thuế, Bảo hiểm bắt buộc (kèm tỷ lệ), Thu nhập sau bảo hiểm, Thuế TNCN, Tạm ứng, khoản trừ thêm, Thực nhận, Ngày phép năm còn lại (số dư tới ngày in, lấy từ `GET /staff` → `leave.balance`, ghi kèm ngày), rồi chỗ ký "Người nhận". Chân trang: khẩu hiệu và "Trang n/2".

**Nội dung chung.**
- Ngày trả lương (`metaOf`): `paidAt` nếu kỳ đã trả, không thì ngày trả dự kiến của kỳ.
- Tỷ lệ phụ cấp đêm trên chip ca: `nightRateOf` (`phieu-a4-days.js`).
- Số ngày vắng nằm trong số nghỉ không lương và được ghi rõ.

**Bản mẫu cổ điển (`phieu-co-dien.js`, `Phieu.classicSheet`).**
- Một trang "PHIẾU LƯƠNG THÁNG MM/YYYY": đầu phiếu, khối thông tin (loại, vị trí / level, lương cơ bản / ngày công, lương ngày và lương giờ, lương KPI tối đa, phụ cấp ca, nơi ở), bảng Chấm công (Ngày, Ca, Vào – ra, Giờ làm, Lương ngày, Phụ cấp, Trừ giờ, Thành tiền), các dòng tổng nền xám, mục Tổng hợp từng dòng tiền → TỔNG THU NHẬP → khấu trừ → THỰC LĨNH, chỗ ký.
- Ô Vào – ra của bảng cũng là giờ bấm thật (`HH:MM – HH:MM`, `--:--` khi thiếu một bên; kèm `(−Np)` khi có giờ nghỉ).
- `classicSheet` (`phieu-co-dien.js`) và `A.Phieu.pageOf` (`view-phieu.js`, mẫu "BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN") không dùng khi in; chỉ test đơn vị gọi.

### 3.6 Khoản cộng/trừ thêm (`view-khoan-them.js`, `A.Entries`, trong màn Bảng lương)

| Gọi | Cap | Thân |
| --- | --- | --- |
| `GET /pay-entries?month` | `salary.read` | Nhận `items`, `requireApproval`, `periodStatus` |
| `POST /pay-entries` | `salary.write` | Một khoản |
| `POST /pay-entries/bulk` | `salary.write` | `{ month, entries }` |
| `PUT /pay-entries/:id` | `salary.write` | `{ ..., rev }` |
| `PUT /pay-entries/:id/decide` | `payroll.approve` | `{ decision, note, rev }` |
| `POST /pay-entries/:id/confirm-flags` | `config.legal` | `{ rev, basis }` |
| `POST /pay-entries/:id/void` | `salary.write` | `{ reason, note, rev }` |

**Lỗi giao diện xử lý.**
- `409 PERIOD_LOCKED` kèm `suggestMonth`: mời chuyển sang tháng đó.
- `REV_STALE`: nạp lại.

**Tự duyệt, tự sửa.**
- Người tạo khoản được tự duyệt và được sửa khoản của người khác; máy chủ trả cảnh báo (`SELF_DECISION_FORBIDDEN`, `EDIT_CREATOR_ONLY`).

**Ràng buộc trong giao diện.**
- Tên khoản tối đa `LABEL_MAX = 80` ký tự.
- Lý do 10–300 ký tự.
- Danh sách chọn nhiều người hiện tối đa `PEOPLE_SHOW = 200` người (`view-khoan-them.js,37`).
- Chọn "tính bảo hiểm trên toàn bộ": giao diện gửi `insuranceBase = amount`.

### 3.7 Yêu cầu (`duyet`)

Màn có hai tab: "Yêu cầu" và "Giải trình" (`D.section`).

**Duyệt khoản tự khai** (`view-duyet.js`, `A.Duyet`)

| Gọi | Cap | Ghi chú |
| --- | --- | --- |
| `GET /approvals?status&month&limit=500&offset` | DECIDE_ALL | Đọc lặp theo trang tới tối đa 20 000 dòng; gọi thêm một lần để lấy số đếm của phạm vi còn lại (tháng đang xem / mọi tháng) |
| `PUT /approvals/decide` | DECIDE_ALL, periodScope `attendance` theo `items[].date` | `{ action, note, items: [{ username, date, rev, fingerprint }] }`, lô `MAX_BATCH = 200` (`view-duyet.js`). Lỗi `409 APPROVAL_STALE`: nạp lại danh sách |

- Khoản yêu cầu (`A.ITEM_LABEL`): iSAT, Nghỉ được duyệt, OT (kể cả OT ngày lễ), Làm bù theo giờ, Nghỉ phép năm, Nghỉ sẽ làm bù, và `makeup_day` (Làm bù cả ngày, không tính lương).
- Mọi yêu cầu chờ xử lý có ô chọn và vào loạt; ô được chọn sẵn chỉ gồm dòng không bị gắn cờ AI.
- Ghép kết quả AI vào dòng bằng `A.aiJoin`, khớp theo `rev` + `fingerprint`. Quy tắc AI mà Admin đã tắt thì bỏ qua.

**Tạm ứng** (`view-ung-luong.js`, thẻ trong tab "Yêu cầu")

| Gọi | Cap | Thân |
| --- | --- | --- |
| `GET /advance-approvals?month` | `A` | Nhận `items`, `rev`, `provisional` |
| `POST /advance-approvals/approve` \| `reject` \| `cancel` | DECIDE_ALL | `{ month, username, expectedRev, reason? }` |
| `POST /advance-approvals/approve-all` | DECIDE_ALL | `{ month, expectedRev }` |

- Tạm ứng là số máy chủ tính theo tham số `advance.*` (`advance.rate` × lương cơ bản của ngày đi làm tới `advance.untilDay`); nhân viên bấm xin, không nhập số. Thẻ chỉ liệt kê người đã xin (Chờ duyệt, Đã duyệt, Từ chối). Số chỉ trừ vào phiếu khi Admin duyệt. Nút: Duyệt / Từ chối cho yêu cầu chờ, Huỷ duyệt cho yêu cầu đã duyệt, Duyệt tất cả khi còn yêu cầu chờ.
- Kỳ `approved`/`paid`: giao diện ẩn nút (`view-ung-luong.js` `locked`). Máy chủ luôn trả 409 `PERIOD_LOCKED` (`src/modules/advance/advance-approvals.handlers.ts`).

**Giải trình** (`view-giai-trinh.js`, tab "Giải trình")

| Gọi | Cap | Thân |
| --- | --- | --- |
| `GET /explanations` | `A` | Nhận `items`, `toRead` (đã trả lời, Admin chưa đọc) |
| `POST /explanations` | `A` (handler chỉ cho Admin yêu cầu người khác) | `{ username, date, prompt, source?, ruleId? }` |
| `POST /explanations/:id/decide` | `attendance.correct` | `{ approve, note }` |

- Hai nguồn: nhân viên giải trình Check-out muộn quá giờ cho phép (vào thẳng "Đã trả lời"), và Admin hoặc AI (nút từ phát hiện của Trợ lý AI, `source: 'ai'`) yêu cầu một người giải trình về một ngày (hộp "Yêu cầu giải trình": tài khoản, ngày, nội dung ≤ 500 ký tự).
- Nút: Phê duyệt (cho giải trình đã trả lời hoặc đã bị từ chối) và Từ chối (hộp xác nhận, lý do tuỳ chọn); đã duyệt hoặc từ chối rồi vẫn đổi được.
- Kết quả đúng như máy chủ xử lý:
  - Check-out muộn được duyệt: giờ bấm (`requestedOut`) thành giờ Check-out của lượt. Bị từ chối: lượt là "Bị từ chối", giờ bấm không được tính và cả ngày không tính công.
  - Giải trình ngày quên Check-in/out được duyệt: máy chủ ghi một lượt Admin theo giờ ca (phản hồi `recorded`), ngày tính một công. Bị từ chối: ngày không tính công (0 đồng, vào nghỉ không lương), kể cả khi ngày đã có giờ bấm.
  - Giải trình về đi trễ hoặc về sớm được duyệt: chỉ hết giữ ngày, không ghi lượt Admin; phút trễ / sớm vẫn cắt theo bậc làm tròn hiện hành.
  - Giải trình chưa được duyệt hay từ chối: ngày giữ lại, trên bảng lương và phiếu hiện "Chờ xử lý" với giờ bấm thật (mục 3.5).

### 3.8 Chấm công (`cham-cong`, `view-cham-cong.js` + `cham-cong-khai.js`)

| Gọi | Cap | Dùng ở |
| --- | --- | --- |
| `GET /attendance?month` | `attendance.read` | Tab `bang` |
| `GET /team?month` (đường dẫn API, lịch ca của đội) | `payroll.view` | Lịch / ca của đội. Không nạp lại khi `live()` chạy nếu đã có lịch của đúng tháng |
| `GET /today` | `attendance.read` | Tab `hom-nay` |
| `GET /ot?status` | `attendance.correct` | Tab `ot` |
| `PUT /ot` | `attendance.correct` | `{ sessionId, version, action: 'approve' \| 'reject', note }` |
| `GET /sheet?month&user` | `self-or:attendance.read` | Khai thay (`cham-cong-khai.js`) |
| `GET /approvals?status=pending&month&user` | DECIDE_ALL | Khai thay |
| `PUT /sheet` | `A` + periodScope `attendance` theo `body.month` | `{ month, user, days, expectedRev }` |

**Các tab.**
- **Bảng công** (`bang`): lưới nhân sự × ngày của tháng; bộ lọc loại nhân sự, chip "Chờ xử lý", ô tìm nhân sự; 20 dòng mỗi trang; cuộn ngang tới cột ngày hiện tại.
- **Ca làm** (`ca`): ca cố định từng người (từ hồ sơ), người chưa có ca.
- **Phép còn lại** (`phep`): phép năm được cộng / đã dùng / điều chỉnh / còn lại từ `GET /staff` → `leave`; hộp "Sổ phép" (`leave-ledger.js`).
- **Hôm nay** (`hom-nay`): lượt mới nhất của từng người trong ngày hiện tại: ca, giờ vào, giờ ra, phút muộn, nhãn trạng thái, số lượt; chip Tất cả / Đã Check-in / Chờ xử lý / Chưa có lượt.
- **Giờ OT** (`ot`): lượt có khai OT, đối chiếu với giờ có mặt; chip Chờ xử lý / Được phê duyệt / Bị từ chối; nút Đồng ý / Từ chối (hộp xác nhận, ghi chú tuỳ chọn khi đồng ý, lý do theo chế độ khi từ chối). Cột "Duyệt OT" là chữ thường (OT chờ xử lý / được phê duyệt / bị từ chối), không phải nhãn của lượt.

**Ô trên bảng công** (`cellOf`, `view-cham-cong.js`): ngày có lượt hiện nhãn của ngày `AttendanceStatus.dayStatus` (ưu tiên Chờ xử lý > Bị từ chối > Đã Check-in > Được phê duyệt > Đã chấm công > Đã Check-out), chú thích là nhãn kèm các `statusNote`. Chú giải đúng sáu nhãn. Ngày không có lượt giữ cách hiện của lịch khai (ký hiệu `P` cho xin nghỉ chờ xử lý, ký hiệu loại ngày đã khai). OT / làm bù / đi làm ngày lễ là dữ liệu trong khung ngày, không phải nhãn. Cột đếm: "Số ngày" (ngày có lượt), "Chờ xử lý" (ngày có nhãn Chờ xử lý). Dòng tóm tắt đếm cả ngày Chờ xử lý và Bị từ chối trên cả tháng.

**Nhãn trạng thái của lượt** (máy chủ tính, `lib/domain/attendance/session-status.js`; giao diện chỉ đổi mã ra chữ):
- Đã chấm công: lượt do Admin ghi (khai thay, hoặc ghi theo giờ ca khi duyệt giải trình quên chấm); không xét giờ.
- Bị từ chối / Được phê duyệt: kết luận duyệt mới nhất về lượt (giải trình gắn lượt, giải trình của ngày công, yêu cầu điều chỉnh).
- Chờ xử lý: giờ vào / ra chưa hợp lệ và chưa có kết luận duyệt, hoặc đang có giải trình chờ. Lý do giờ không hợp lệ:
  - vào trễ hơn `attendance.graceMin` ("Vào trễ N phút");
  - về sớm bất kỳ ("Về sớm N phút");
  - Check-out muộn hơn giờ kết thúc ca quá `CHECKOUT_GRACE_MIN` phút (`lib/config.js`, "Check-out muộn N phút");
  - quên Check-in / Check-out, ngoài ca, nhiều lượt trong một ca, ngoài vùng GPS, cần đối soát.
- Đã Check-in: lượt đang mở, giờ vào hợp lệ. Đã Check-out: lượt đã đóng, giờ hợp lệ.
- Duyệt OT, giờ làm thêm, đi làm ngày lễ không phải trạng thái: lượt có giờ hợp lệ vẫn là Đã Check-out.
- Ở app nhân viên, bấm Check-out khi ca chưa kết thúc hiện hộp "Ca làm chưa kết thúc" với "Vẫn Check-out" và "Tiếp tục làm" (`public/nhan-vien/punch.js`); chọn "Vẫn Check-out" thì lượt đóng và trở thành Chờ xử lý (lý do "Về sớm N phút").

**Hộp một ngày** (`openCell`): hai phần, "Lịch đã khai" (khai thay ngay tại ô, có nút lưu) và "Check-in/out" (chỉ xem). Phần Check-in/out đứng đầu ở mọi ngày. Giờ Check-in/out không sửa được (cả Admin và nhân viên); hộp không có ô sửa giờ, lịch sử điều chỉnh có sẵn vẫn hiện. Mỗi lượt hiện: nhãn, Check-in – Check-out, phút vào muộn / ra sớm, làm thêm đã khai (OT hoặc Làm bù), ghi chú (`statusNote`), giờ bấm gốc, lịch sử điều chỉnh. Ngày lễ có lượt hiện dòng "OT ngày lễ: được phê duyệt / chờ xử lý / bị từ chối / chưa khai OT ngày lễ hoặc ngày lễ ngoài lịch làm".

**Quy tắc phía máy chủ mà màn này phản ánh.**
- Nhân viên chỉ Check-in / Check-out trên ngày có trong lịch được cấp và ngày có OT hoặc giờ làm bù đã duyệt; nhân viên vẫn tạo được yêu cầu (nghỉ, OT, làm bù, đi làm ngày lễ). Không có ngày tuỳ chọn trong lịch: ngoài lịch thì gửi yêu cầu.
- Nhân viên không Check-in được vào ngày đã khai hoặc được duyệt nghỉ cả ngày, trừ ngày có OT hoặc giờ làm bù đã duyệt. Khai thay của Admin không qua cổng này.
- iSAT chỉ vào thứ Bảy (`isat.weekday`) và chỉ với chức vụ có quyền lợi iSAT; máy chủ chặn, kể cả khi Admin khai thay. Ngày iSAT sai quy tắc đã lưu được đếm vào mã `ISAT_INVALID` của danh sách việc.
- Ngày công = ngày có Check-in/out hợp lệ; ngày khai đi làm mà không chấm là vắng (`attendance.missingAllRule = 'absent'`).

**Số giao diện tự tính.**
- Phút đi trễ: `ActualHours.lateMinutes`.
- Phút về sớm: `earlyMinutes` (`view-cham-cong.js`).
- Trạng thái làm ngày lễ: `holidayWorkOf` (`view-cham-cong.js`).

**Nút chuyển kỳ.** Dùng chung với Bảng lương qua `A.Ky.congActs`.

**Nhân viên.** "Thay nhân viên" mở `/nhan-vien.html?thay=<user>&month=<m>` (`A.actForUrl`, `core.js`). Nút này chỉ hiện khi `A.canActFor`, tức khi có năng lực `request.decide.*`.

### 3.9 Nhân sự (`ho-so`, `view-ho-so.js`, `staff-history.js`, `leave-ledger.js`)

| Gọi | Cap | Thân / lỗi |
| --- | --- | --- |
| `GET /staff` | `profile.read` | Danh sách và hồ sơ (`rev`) |
| `GET /entitlements` | `config.read` | Cờ `idorm` |
| `PUT /staff/:u` | `profile.write` | Gửi lại **toàn bộ** hồ sơ (`FORM_FIELDS`), luôn kèm `role: 'staff'` và `expectedRev` khi sửa. Họ tên gửi `familyName`, `givenName` (chỉ khi tạo mới hoặc Admin sửa tên), `contractStatus`, `shiftCode`, `startDate`, `birthday`, `leaveAdjust`, `jobTitle`; khi sửa còn `resignedOn`, `contract`, `dependants`, `insured`, `taxOn`, `deductOn`, `advanceOn`. Tạo mới không gửi hợp đồng, bảo hiểm, thuế (máy chủ dùng mặc định theo loại) và có `password`. Lỗi `409 STAFF_STALE` |
| `PUT /staff/shift-bulk` | `profile.write` | `{ usernames, preset, reason }` |
| `GET /staff/:u/schedule` | `self-or:profile.read` | — |
| `GET /employees/:uuid/trace?beforeId&limit` | `audit.read` | Lịch sử thay đổi (`staff-history.js`), mỗi lần xin thừa một dòng để biết còn "Xem thêm" |
| `GET /leave/ledger?user` | `self-or:profile.read` | Sổ phép (`leave-ledger.js`): các lần cộng (vào làm, tròn tháng, thâm niên, sinh nhật) và hết hạn |
| `POST /leave/refresh` | `profile.write` | `{}` |

- Hồ sơ mở ở ngăn kéo bên phải; dòng Lịch làm việc theo loại nhân sự (chỉ xem); gán ca hàng loạt "tất cả hoặc không".
- Phép dư của một năm được đổi tiền vào phiếu lương tháng liền sau tháng hết hạn của quỹ năm đó (dòng "Quyết toán phép dư" trên phiếu); sổ phép chỉ hiện số máy chủ trả.

**Ràng buộc trong giao diện.**
- Mật khẩu đầu tiên: `PASSWORD_MIN = 6` ký tự.
- Lý do 10–300 ký tự (`view-ho-so.js`).
- Tên đăng nhập phải khớp `USERNAME_RE`; Tên (`givenName`) chỉ một chữ, phần còn lại nhập ở "Họ và tên đệm".

### 3.10 KPI (`kpi`, `view-kpi.js`)

| Gọi | Cap | Thân |
| --- | --- | --- |
| `GET /kpi/scores?month` | `kpi.score.write` | `{ weights, items, method }` |
| `PUT /kpi/scores` | `self-or:kpi.score.write`, periodScope `kpi` | `{ user, month, scores: { key: value } }`. Điểm 0–100, tối đa 2 chữ số thập phân |
| `GET /settings/params?group=8` | `config.read` | Đọc `kpi.weworkMin` (`PARAM_GROUP = 8`, `view-kpi.js`) |
| `GET /periods/:m/payslips` hoặc `/estimates` theo trang | `payroll.view` | Đọc số tiền `kpi` mỗi người (`SLIP_PAGE_MAX = 200`, `view-kpi.js`) |

- Lưới điểm 5 thành phần (Base Wework, Người dùng, Đồng nghiệp, Quản lý trực tiếp, Tự đánh giá); nhập bằng bàn phím, ô tự lưu khi rời ô; mục "Lịch sử sửa điểm". Trọng số lấy từ `weights` của máy chủ. Tháng trước tháng KPI bắt đầu (`method` `legacy`) chỉ có ghi chú, điểm nhập ở đó không dùng để tính lương.

### 3.11 Trợ lý AI (`tro-ly`, `view-tro-ly.js`, `ai.js`)

**Đọc.**
- `GET /ai/review?month` (`ai.review.read`)
- `GET /periods/:m`
- `GET /periods/:m/estimates?pageSize=1`

**Màn hình.** Cột "Cảnh báo AI" (mỗi cảnh báo nêu quy tắc, số liệu vào và ngưỡng; nhãn quy tắc ở `A.RULE_LABEL`) và cột "Hỏi nhanh" với câu hỏi dựng sẵn. AI chạy theo quy tắc, không có ô hỏi tự do; câu trả lời chỉ dựng từ dữ liệu máy chủ đã trả. Không nút nào ghi dữ liệu trừ "Bỏ qua cảnh báo này".

**Báo cáo hiển thị.** `thieu` ("Còn thiếu gì trước khi chốt công?"), `phep` ("Ai còn nhiều phép?").

**Bỏ qua cảnh báo** (`A.Dismiss`, `ai.js`).
- Gọi `POST /ai/findings/dismiss`, thân `{ month, username, rule, reason }`.
- Route khớp mục `POST /ai/findings`, cap `ai.review.dismiss`.
- Lý do tối đa 300 ký tự, không bắt buộc (`ai.js`).
- Nút chỉ hiện khi `canDismiss()` đúng (`view-tro-ly.js`).

### 3.12 Cài đặt (`cai-dat`)

| Mục | Gọi | Cap |
| --- | --- | --- |
| Tham số (`view-tham-so.js`, `A.Params`) | `GET /settings/params?month&group`, `GET /settings/first-run?month`, `POST /settings/params/preview { changes, effectiveMonth, scope? }`, `PUT /settings/params { changes, effectiveMonth, reason, basis?, expectedRev, acknowledge }` | `config.read` ở cổng. Quyền sửa từng khoá và khoá kỳ do `lib/params/save.js` kiểm (409 `PERIOD_LOCKED`) |
| Ngày lễ, giờ ca (`cai-dat-ky-luong.js`) | `GET /holidays`, `PUT /holidays { dates, names? }`, `GET/PUT /settings/shifts { shifts, effectiveMonth, reason, expectedRev }` | `A` / `config.payroll` + periodScope `attendance`; `config.read` |
| Vùng GPS | `PUT /settings/geofence` | `config.payroll` |
| Sơ đồ bậc (`cai-dat-so-do.js`) | `POST /positions/:code/levels` | `config.payroll` |
| Thêm chức vụ (`view-khung-chuc-vu.js`) | `POST /positions { label, copyFrom, effectiveMonth, reason }` | `config.read` ở cổng; `config.payroll` kiểm trong `lib/params/save.js` |
| Khối phụ cấp (`view-khoi-phu-cap.js`) | `POST /blocks`, `PUT /blocks/:code/confirm` | `config.payroll` / `config.legal` |
| Quyền lợi, khung lương | `GET /entitlements` | `config.read` |
| Danh mục chức vụ / bậc (`catalog-positions.js`) | `GET /catalog/positions?month`, `PUT /catalog/positions/:code`, `PUT /catalog/levels` | `config.read` / `config.payroll` |
| Danh mục ca (`catalog-shifts.js`) | `GET/PUT /catalog/shifts` | `config.read` / `config.payroll` |
| Phân quyền (`view-phan-quyen.js`) | `GET /roles`, `POST /roles`, `PUT /roles/:code`, `POST /roles/:code/deprecate`, `PUT /staff/:u/roles { roles, reason, expectedRev? }`, `PUT /staff/:u { locked }`, `POST /staff/:u/password { password, reason }`, tạo tài khoản với `payrollSubject: false` | `roles.manage`; `profile.write` + `staff.lock` kiểm trong handler |
| Nhật ký (`view-nhat-ky.js`) | `GET /audit` (phân trang theo con trỏ), `GET /audit/verify` | `audit.read` |
| KPI (trong Cài đặt) | `GET /kpi/scores` (đọc trọng số) | `kpi.score.write` |

**Nội dung từng mục.**
- **Cách tính lương** (`so-do`, `cai-dat-so-do.js`): bảng tám khoản đọc từ trên xuống như một phiếu lương — ① Lương cơ bản, ② Tiền làm thêm giờ, ③ Phụ cấp, ④ Lương KPI (cộng); ⑤ Khấu trừ đi muộn, về sớm, ⑥ Tạm ứng, ⑦ Bảo hiểm, ⑧ Thuế TNCN (trừ). Mỗi khoản có dòng mô tả dựng từ tham số thật (ví dụ ② hệ số ngày thường / cuối tuần / ngày lễ theo `ot.rate`, `ot.weekendRate`, `ot.holidayRate`; ⑥ `advance.rate` và `advance.untilDay`). "Sửa" mở ngăn kéo bên phải của khoản đó; ⑦ ⑧ do luật tính, chỉ người có `config.legal` sửa được. Biểu thuế lũy tiến sửa ở `tham-so-bieu-thue.js`; không có ô nhập công thức. Mọi con số đến từ máy chủ; lưu đi qua nút "Xem trước và lưu".
- **Chế độ theo loại** (`quyen-loi`, `cai-dat-quyen-loi.js`): tab theo chức vụ, mỗi bậc một hàng. Bảng "Phụ cấp và lương KPI" (đi lại, chuyên cần, Flex, ca đêm, lương KPI, iDorm) và bảng "Được gửi yêu cầu" (Nghỉ phép năm, iSAT, Nghỉ được duyệt, OT, Làm bù theo giờ). Mỗi ô hiện giá trị đang hiệu lực của bậc; gõ khác thì lưu khoá riêng của bậc (`level.<mã>.<bậc>.<đuôi>`), xoá trắng thì bậc về theo chức vụ. Nút "+ Thêm chế độ" mở hộp khối phụ cấp (số cố định / % lương cơ bản / theo bậc, co giãn theo ngày đi làm, điều kiện mất, loại thuế, tính bảo hiểm); cờ thuế và bảo hiểm chỉ có hiệu lực khi Kế toán (`config.legal`) xác nhận.
- **Chức vụ & bậc** (`chuc-vu`, `catalog-positions.js`): danh mục chức vụ và bậc theo tháng áp dụng; sửa chức vụ (tỷ lệ Flex, Night, đi lại, chuyên cần; cờ quyền lợi OT, Làm bù, Lương KPI, Lễ hưởng lương, Nghỉ phép năm, iSAT, Khai nghỉ, Nghỉ được duyệt, Quỹ phép, Làm bù theo giờ, iDorm, Off Paid) và bậc (lương, KPI tối đa, ngày công chuẩn). Mỗi lần ghi gửi `rev` của dòng đang hiện; 409 `*_STALE` thì báo và nạp lại.
- **Lịch, ca & chấm công** (`cham-cong`, `cai-dat-ky-luong.js`, `catalog-shifts.js`): "Lịch năm" (ngày lễ và tên ngày lễ, ngày trả lương `period.payDay`), "Ca làm" (giờ vào, giờ ra từng ca theo tháng; đổi tên và loại Normal / Flex / Night của ca ở `catalog-shifts.js`), "Chấm công" (Check-in luôn bật, ngày bắt đầu tính giờ theo Check-in/out chỉ đọc, vùng GPS bằng sơ đồ tròn SVG).
- **Đánh giá KPI** (`kpi`, `view-cai-dat.js`): cách tính tổng điểm (trọng số 5 thành phần) và liên quan.
- **Cảnh báo AI** (`nguong-ai`): bật / tắt từng quy tắc (`ai.rule.<mã>.enabled`) và ngưỡng, lưu qua "Xem trước và lưu".
- **Phân quyền**: hai tab Vai trò, Tài khoản. Ma trận khu vực × Không / Xem / Sửa suy từ năng lực thật của vai trò. Luật (không tự bỏ quyền Admin của mình, không bỏ Admin cuối cùng…) do máy chủ kiểm, lỗi hiện nguyên văn.
- **Nhật ký thay đổi**: chỉ đọc; giá trị cũ / mới lấy từ máy chủ, lọc theo quyền người xem; nút "Kiểm tra nhật ký không bị sửa" gọi `GET /audit/verify`.
- Menu phụ trên thanh bên còn có popover tài khoản: đổi nền, mật độ, đổi mật khẩu.

**Hành vi riêng của màn Tham số.**
- **Tháng áp dụng mặc định.** Tháng chưa chốt sớm nhất (đọc `GET /periods?year`).
- **Kiểm quyền trước khi lưu.** `probeSave` gửi một lần `preview` với `changes: []`.
- **Lỗi và cảnh báo.**
  - `409 PARAMS_STALE`: nạp lại.
  - Cảnh báo `PARAM_LATER_VERSION_EXISTS`: báo đã có phiên bản tham số ở tháng sau.
- **Phân loại mục tham số** (`tham-so-sap-co.js`): sửa được / chỉ đọc / sửa ở màn khác (`backing`) / "Sắp có" (`wired: false`, không có ô nhập).
- **Nhóm tham số đặt cứng trong giao diện.**
  - Nhóm nâng cao: `ADVANCED_GROUPS = [14, 15]` (`view-tham-so.js`).
  - `paramsRev` đọc từ nhóm 1.

**Lỗi ở các mục khác.**
- Danh mục: lỗi `*_STALE` thì nạp lại.
- Giờ ca: `SHIFT_EDIT_NOT_ALLOWED`.

**Khoá / mở khoá tài khoản.** `PUT /staff/:u` chỉ chứa `{ locked }` (có thể kèm `expectedRev`) được máy chủ xử lý như yêu cầu khoá riêng (`src/modules/staff/staff.controller.ts`): không kiểm các trường hồ sơ khác, khoá thì đóng mọi phiên của người đó.

### 3.13 Ma trận khi kỳ đã khoá

| Thao tác | Kỳ `approved`/`paid` |
| --- | --- |
| Sửa ô phiếu (`slip-override`) | Ô vẫn mở. Máy chủ ghi kèm cảnh báo `PERIOD_FROZEN` |
| Mở lại kỳ `paid` | Nút hiện. Máy chủ cho qua kèm cảnh báo `PERIOD_STATE` (`lib/db.js` dùng `warnIf`) |
| Khoản cộng/trừ thêm | `409 PERIOD_LOCKED` + `suggestMonth` (khoá do `lib/pay-entries.js` kiểm) |
| Tạm ứng | Nút ẩn. 409 `PERIOD_LOCKED` |
| Bỏ qua cảnh báo AI | Nút hiện (`canDismiss`) |
| Khai thay / duyệt dòng | periodScope `attendance` ở cổng (`lib/authz.js`), rồi theo handler |

## 4. Cách tính / quy tắc

Nguyên tắc: giao diện không tự tính tiền, máy chủ trả số. Dưới đây là **mọi chỗ giao diện Admin hiện vẫn tự tính**, kể cả đếm.

### 4.1 Phiếu lương: `view-phieu.js` `figures()`

Mỗi ô trên phiếu có một giá trị tự tính từ bản chụp. Nếu máy chủ gửi `p.cells` (số tự tính từng ô, gồm phần do ô số lượng ghim đổi) thì `p.cells` thắng giá trị tự tính.

| Ô | Phép tính ở trình duyệt |
| --- | --- |
| `workDays` | `m.count` (ngày đi làm thực tế; ngày nghỉ sẽ làm bù không cộng) |
| `workBase` | `m.basePay - m.off + m.cut` |
| `lateCut` | `max(0, m.cut)` |
| `leavePay`, `isatPay` | Cộng `total` các dòng `kind` `leave` / `isat` |
| `holidayPay` | Cộng `holBase` các dòng `holiday`. `holidayDays` là số dòng `holiday` có `holBase > 0` |
| `unpaidDays` | `m.unpaid + m.approved + m.noshow` |
| `flexPay`, `nightPay` | Cộng `bonus` theo `shift` `flex` / `night` |
| `ot15H` | `m.otHours - m.otWeekendHours - m.otHolHours` |
| `ot20H` | `m.otWeekendHours` |
| `ot30H` | `m.holWorkHours + m.otHolHours` |
| `otPay` | `m.otPay + m.holWorkPay + m.makeupPay` |

**Mức tham khảo `refs`**. Đây là con số giao diện tự tính để in cạnh ô, không phải số trả:

| Mức | Phép tính | Điều kiện hiện |
| --- | --- | --- |
| `attendance` | `base * T.attendance` | — |
| `travel` | `base * T.travel` | — |
| `flex` | `base * flexPct` | — |
| `off` | `hourly * (1 + night.breakPremium) * workdaysStd` | Ẩn khi `type.<loại>.benefit.breakPay === false` |
| `night` | `base * nightPct` | `nightPct` = `nightOptions[0] / 100` |

### 4.2 Phiếu lương: `effective()`

Tổng tiền lấy từ máy chủ trước:

1. **Số máy chủ.** Các tổng `gross`, `insurance`, `tax`, `advance`, `net`, `taxable`, `afterInsurance` đọc từ phiếu máy chủ trả.
2. **Số bản chụp.** Phiếu chưa sửa ô nào thì dùng số tự tính của bản chụp.
3. **Đã sửa mà máy chủ thiếu số.** Hiển thị `—`, không đoán.

Hai phép tính vẫn còn ở trình duyệt:
- **Thu nhập sau bảo hiểm.** Khi máy chủ không gửi `afterInsurance`, giao diện tính `afterIns = n.gross - n.insurance`. Phép tính này còn lặp ở bảng so sánh của chế độ sửa.
- **Tổng phụ cấp.** `allowance = allowanceTotal + Σ(số sửa − số tự tính)` trên các ô `ALLOW` đang được Admin ghi đè.

Ngoài ra, `sumRates` cộng các tỷ lệ bảo hiểm để làm nhãn.

### 4.3 In A4

- **Tỷ lệ phụ cấp đêm.** `phieu-a4-days.js` `nightRateOf` chọn tỷ lệ theo thứ tự:
  1. `shift.allowance.basis === 'assigned'`: `level.<loại>.<bậc>.nightPct`, rồi `type.<loại>.nightPct`, rồi phần tử đầu của `nightOptions`; không có thì `shift.night.bonus`.
  2. Cách khác: `terms.nightPct` (mức người đã chọn) hoặc phần tử đầu của `nightOptions`; không có bảng mức thì `shift.night.bonus`.

  Thứ tự này chép lại logic `bonusOf` của bộ máy lương. `phieu-co-dien.js` có bản chọn riêng (`rates`,).
- **Giờ OT.** `tilesOf` cộng giờ OT từ ba ô `ot15H + ot20H + ot30H`.
- **Chip ca Flex.** Mức % lấy từ `f.rates.flex` (tham số, theo bậc).

### 4.4 Chấm công

- **Làm ngày lễ.** `view-cham-cong.js` `holidayWorkOf` xác định ngày lễ có được trả giờ làm hay không:
  - Ngày nằm trong lịch làm, khai `work` có giờ vào và ra.
  - Có dòng duyệt OT ngày lễ (`approvals[date].holiday`): lấy trạng thái của dòng đó. Không có dòng duyệt: coi là `approved`.

  Đây là bản sao phía giao diện của quy tắc máy chủ.
- **Phút trễ / sớm.** `ActualHours.lateMinutes` và `earlyMinutes` tính ở trình duyệt để hiện số trong hộp ngày.
- **Khai thay** (`cham-cong-khai.js`). Có bản sao `dayPlan` của `public/nhan-vien/logic.js`, cùng quyền lợi dự phòng từ `DEFAULTS` (mục 2.2).
  - Loại ngày chọn được: Đi làm, Nghỉ phép năm, Nghỉ không lương, Nghỉ sẽ làm bù, Nghỉ được duyệt, iSAT (chỉ thứ Bảy và chỉ chức vụ có quyền lợi iSAT), Vắng không phép. Giờ làm bù khai ở ngày `work` (`extraKind: 'makeup'`, trước hoặc sau ca).
  - Ô "Ca" của người có ca cố định liệt kê mọi ca trong `A.SHIFTS`, đánh dấu "(ca được gán)"; mã ca chọn gửi trong `day.preset`. Khi Admin khai thay (người khác) chọn ca khác ca được gán: ngày đó tính lương theo ca Admin chọn, hộp ghi "Ngày Admin khai thay tính lương theo ca Admin chọn (…): phụ cấp ca, giờ nghỉ, giờ thiếu theo ca này, không theo ca được gán" và không có cảnh báo lệch ca. Lịch của chính Admin là tự khai nên vẫn có cảnh báo lệch ca.
  - "Giờ đã lưu" chưa có mã ca mà chọn làm thêm: Admin khai thay lấy ca trong danh mục có đúng giờ đó (`shiftByTimes`, ưu tiên ca được gán, như `adminShiftOf` của máy chủ), không có thì ca được gán.
  - Ngày đi làm của người khác (khai thay) mà giờ vào – ra không khớp ca nào trong danh mục và chưa chọn ca: ô Ca hiện "Chọn ca" và hộp cảnh báo đòi chọn ca (máy chủ: `SHEET_ADMIN_SHIFT_REQUIRED`).
  - Ngày lễ trong lịch khai là OT từ – đến giờ như màn nhân viên (chỉ người có quyền lợi OT); giờ làm bù đã duyệt trả đủ.
  - Ngày đã lưu loại `makeup` (Làm bù cả ngày): không chọn được; hiện ký hiệu xám trên Bảng công, nhãn "Làm bù cả ngày (không tính)"; hộp ngày cảnh báo loại này không tính lương, không có ô giờ, và gửi lại đúng giờ đã lưu để máy chủ coi là không đổi. Đổi sang loại mới mang `makeup` thì máy chủ trả 400 `SHEET_MAKEUP_DAY_REMOVED`, câu báo hiện nguyên văn.
- **Cài đặt › Chế độ theo loại** (`cai-dat-quyen-loi.js`): bảng "Được gửi yêu cầu" không có cột "Làm bù cả ngày". Thẻ chức vụ (`catalog-positions.js`) không liệt kê cờ `makeupDay`; nhãn của cờ này chỉ còn cho Nhật ký.

### 4.5 Đếm và cộng khác

| Chỗ | Phép tính |
| --- | --- |
| `view-kpi.js` | Cộng tiền KPI của mọi người (`reduce`) từ số máy chủ trả theo phiếu |
| `view-ky-luong.js` (dòng trạng thái) | `T.people - T.error`, `totalOf(c) - c.error` (đếm phiếu có số) |
| `ui.js` | Đếm tổng phiếu cho dải bước |
| `view-khac.js` | Đếm tổng phiếu cho thẻ Kỳ lương; đếm nhân sự theo loại |
| `view-cham-cong.js` `tally` | Đếm ngày có nhãn Chờ xử lý / Bị từ chối trên cả tháng |

### 4.6 Quy tắc nhập ở giao diện

Lấy theo hằng số đặt trong từng file.

**Độ dài lý do: tối đa 300 ký tự, không bắt buộc.**
- Khớp `lib/config.js`.
- Định nghĩa lại ở:
  - `ai.js`
  - `view-phieu.js`
  - `view-ho-so.js`
  - `view-khoan-them.js`
  - `view-khoi-phu-cap.js`
  - `view-khung-chuc-vu.js`
  - `view-phan-quyen.js`
  - `view-tham-so.js`
- Viết thẳng số ở:
  - `cai-dat-ky-luong.js`
  - `cai-dat-so-do.js`
  - `view-ky-luong.js` (chỉ cận dưới 10)

**Mật khẩu tối thiểu 6 ký tự.**
- Khớp `lib/config.js`.
- Có ở `view-ho-so.js` và `view-cai-dat.js`.

**Trang / lô 200.**
- Khớp `lib/config.js` (`PAYSLIP_PAGE_MAX`) và (`APPROVAL_MAX_DECIDE_ITEMS`).
- Có ở `view-ky-luong.js`, `view-kpi.js`, `phieu-a4.js`, `view-ky-luong-phieu.js`, `view-duyet.js`.

**Các ràng buộc khác.**
- Tên khoản ≤ 80 ký tự; tên khối / chức vụ ≤ 40 ký tự; nội dung giải trình ≤ 500 ký tự.
- Điểm KPI 0–100, tối đa 2 chữ số thập phân.
- Tiền là số đồng nguyên.

## 5. Realtime và nhật ký

### 5.1 Kênh SSE (`A.live`, `core.js`)

**Kết nối.**
- Bọc `EventSource` trên `GET /events`.
- Kết nối bị máy chủ đóng hẳn (`readyState` 2): thử lại sau `4 s × số lần thất bại`; ba lần thất bại liên tiếp thì bỏ cuộc. Kết nối mở được thì đếm lại từ đầu.
- Lỗi mạng ngắn (trình duyệt tự nối lại): không tính là thất bại.

**Gộp tin.**
- Các tin đến gần nhau được gộp trong 400 ms.
- `attendance.changed` là sự kiện "đều" (`steadyEvents`): mỗi khoảng gộp chạy tối đa một lần. Trường nào khác nhau giữa các tin bị bỏ khỏi bản gộp.

**Khung hệ thống.**
- `hello { epoch, serverTime, configRev, build }`: `epoch` đổi thì nạp lại toàn bộ.
- `resync`: nạp lại toàn bộ.
- `bye { reason }`:
  - `superseded`: dừng hẳn, không nối lại.
  - Lý do khác: hỏi lại `/api/me`; còn là Admin thì nối lại, không thì về trang đăng nhập.

**Định nghĩa sự kiện.** Nguồn duy nhất là `EVENTS` trong `lib/events.js`. Máy chủ bỏ mọi trường ngoài danh sách được phép trước khi gửi.

| Sự kiện | Người nhận | Trường (`events.js`) |
| --- | --- | --- |
| `params.changed` | Mọi người. Tầng đủ cần `config.read` | `configRev, fromMonth, kind, groups, by`; bản ngắn chỉ `configRev, fromMonth` |
| `period.changed` | Mọi người. Tầng đủ cần `payroll.view` | `month, status, rev`; bản ngắn `month, stage` |
| `approvals.changed` | `request.decide.*` | `month, pending` |
| `attendance.changed` | người có `attendance.correct` (tier `queue`) | `kind` (`forgot` \| `ot` \| `punch` \| `explanation`), `month` |

### 5.2 Bộ nghe

| Nơi | Sự kiện | Hành động |
| --- | --- | --- |
| `boot.js` | `approvals.changed` | Nạp lại `duyet`, `tong-quan` (nếu đang xem) |
| `boot.js` | `period.changed` | Nạp lại `luong`, `tong-quan`, `cham-cong` |
| `boot.js` | `attendance.changed` | Xem ghi chú 3 dưới bảng |
| `boot.js` | `params.changed` | Xem ghi chú 4 dưới bảng |
| `boot.js` | `resync` | `refreshShell`, `refreshMe`, `levelNames.refresh`, `shiftsLoad`, nạp lại màn đang xem, `A.Params.remoteChanged(null)` |
| `core.js` | `params.changed` | `levelNames.refresh`, `positions.refresh` |
| `catalog-positions.js` | `params.changed` | Nạp lại danh mục chức vụ |
| `view-cai-dat.js` | `params.changed` | `A.Params.remoteChanged(payload)`. Bỏ qua tin đến trong `SELF_EVENT_MS = 3000` sau lần lưu của chính mình (`view-tham-so.js`) |

Ghi chú cho bảng:

1. **Tin của tháng khác.** `approvals.changed` và `period.changed` luôn gọi `A.refreshShell()` (số đếm, chuông) trước. Sau đó, nếu `payload.month` khác tháng đang xem thì không nạp lại màn (`boot.js`).
2. **Hộp thoại đang mở.** Việc nạp lại hoãn tới khi hộp thoại đóng.
3. **`attendance.changed`.**
   - Bỏ tin của tháng khác. Riêng tab `hom-nay` nhận tin của mọi tháng.
   - Mỗi `ATTENDANCE_RELOAD_MS = 10000` (`boot.js`) nạp tối đa một lần, không bao giờ hai lần chồng nhau.
   - Chỉ nạp khi đang xem `tong-quan` hoặc tab `bang` / `hom-nay` / `ot` của Chấm công. Nạp bằng `view.live()`.
   - Tab trình duyệt đang ẩn: chờ tới khi hiện lại.
4. **`params.changed`.**
   - Chạy theo thứ tự: `refreshMe`, `shiftsLoad`, `loadAi(true)`, `A.Ky.load(true)`.
   - Sau đó nạp lại `tong-quan`, `luong`, `cham-cong`, `ho-so`, `kpi`, `tro-ly`, `duyet`.

**Màn không nghe sự kiện nào** (chỉ cập nhật khi Admin tự bấm, đổi tháng hoặc khi `resync`):
- tạm ứng
- khoản cộng/trừ thêm
- giải trình (ngoài việc `approvals.changed` làm màn Yêu cầu nạp lại cả giải trình)
- KPI ngoài `params.changed`

### 5.3 Nhật ký

- Giao diện không tự ghi nhật ký. Mọi thao tác ghi đi qua API, máy chủ ghi nhật ký.
- Màn **Nhật ký** (`view-nhat-ky.js`):
  - Đọc `GET /audit` theo con trỏ (`PAGE_SIZE = 25`).
  - Kiểm chuỗi băm bằng `GET /audit/verify`.
- Lịch sử thay đổi một người: `staff-history.js` (`GET /employees/:uuid/trace`), chỉ hiện khi có `audit.read`.

## 6. Phụ thuộc

### 6.1 Giao diện phụ thuộc vào

- **Hợp đồng API ở mục 3**: tên trường, mã lỗi, `rev` / `expectedRev`.
- **`lib/authz.js` `ROUTE_CAPS`** và danh sách caps trong `/api/me`. Giao diện ẩn hoặc hiện nút theo caps, ví dụ:
  - `A.canActFor`
  - `reopenTargets`
  - `canDismiss`
- **`lib/events.js`**: danh sách sự kiện và trường.
- **`src/modules/periods/periods.helpers.ts` `SLIP_MONEY` / `SLIP_QTY`**: danh sách ô sửa được trên phiếu.
- **`lib/slip-formulas.js`, `lib/slip-paid.js`**: `formulas`, `cells`, `cot`, `punchIn` / `punchOut`, `held` trên phiếu.
- **`lib/domain/attendance/session-status.js`**: `status`, `statusNote` của lượt.
- **`lib/config.js`**: các trần và độ dài, đang được chép thành hằng số trong giao diện.
- **Mô-đun dùng chung**: `public/actual-hours.js`, `public/approval-view.js`, `public/attendance-status.js`, `public/payroll-params.js`, `public/home-route.js`.
- **`public/nhan-vien.html`**: dùng cho "thay nhân viên" (`?thay=&month=`).

### 6.2 Đổi X thì phải kiểm tra Y

| Đổi X | Phải kiểm tra Y |
| --- | --- |
| Tên / thứ tự trạng thái kỳ lương | `ui.js` `PERIOD_STEPS`/`PERIOD_STATE`; `view-ky-luong.js` `STATUS_TXT`, `STATUS_PILL`, `NEXT_ACTION`, `reopenTargets`, `modeOf`, `approving()`; `view-ung-luong.js` `locked`; `canDismiss` ở `view-khac.js` và `view-tro-ly.js` |
| Thêm / bỏ ô sửa được trên phiếu | `src/modules/**/*.controller.ts` `155`; `view-phieu.js` `MONEY`/`PCT`/`INCOME`/`ALLOW`/`GROUPS`; `lib/slip-paid.js`; `lib/slip-formulas.js` (khoá công thức); `phieu-a4.js` |
| Cấu trúc bản chụp phiếu (`snapshot.rows`, `m.*`) | `view-phieu.js` `figures()`; `phieu-a4-days.js` (cột ngày, `nightRateOf`, `tilesOf`); `phieu-co-dien.js`; `lib/slip-formulas.js` |
| Cách bộ máy chọn tỷ lệ phụ cấp đêm (`bonusOf`) | `phieu-a4-days.js`; `phieu-co-dien.js` |
| Quy tắc trả giờ làm ngày lễ | `view-cham-cong.js` `holidayWorkOf` |
| Nhãn hoặc ngưỡng trạng thái lượt chấm công | `public/attendance-status.js`; `view-cham-cong.js` (`cellOf`, chú giải); `view-giai-trinh.js`; `phieu-a4-days.js` (`held`) |
| `public/nhan-vien/logic.js` (`dayPlan`) | `cham-cong-khai.js` (bản sao) |
| `lib/config.js` `REASON_MIN/MAX`, `PASSWORD_MIN_LENGTH`, `PAYSLIP_PAGE_MAX`, `APPROVAL_MAX_DECIDE_ITEMS` | Các file liệt kê ở mục 4.6 |
| Mã nhóm tham số (1, 2, 8, 14, 15) | `core.js` `A.levelNames` (nhóm 2); `view-kpi.js` (nhóm 8); `view-tham-so.js` (14, 15) và đọc `paramsRev` nhóm 1 |
| Trường / sự kiện trong `lib/events.js` | `boot.js`; `core.js`; `view-cai-dat.js`; `catalog-positions.js` |
| Thêm route mới cho Admin | Mục trong `ROUTE_CAPS` (thiếu → 403 `NO_ROUTE_POLICY`; giao diện coi đó là `missingRoute` ở Bảng lương) |
| Hình dạng `PUT /staff/:u` | `view-ho-so.js` (gửi cả hồ sơ, `role: 'staff'`); `view-phan-quyen.js` (chỉ `{ locked }`); `src/modules/staff/staff.controller.ts` |
| Cách khoá kỳ / cảnh báo của một route | Ma trận mục 3.13; ẩn / hiện nút ở `view-ky-luong.js`, `view-ung-luong.js` (`locked`), `canDismiss`, ngăn kéo phiếu (`locked`) |
| Mã lỗi `*_STALE`, `PERIOD_LOCKED`, `PERIOD_NOT_READY`, `PAYSLIP_*` | `explain` của `view-ky-luong.js`; `view-phieu.js`; `view-khoan-them.js`; `view-duyet.js`; `view-ho-so.js` |
| Tên file trong `public/admin/` | `public/admin.html` (thứ tự nạp); các test đọc file Admin (mục 7) |
| Chỗ lưu vùng GPS | `view-cai-dat.js` và `cai-dat-ky-luong.js` (hai chỗ) |

## 7. Test hiện có

Tên file test có đọc trực tiếp file Admin hoặc kiểm hành vi mà giao diện Admin dựa vào. Danh sách không đầy đủ: nhiều test API khác cũng chạm route mà Admin gọi. Tên có tiền tố ngày trong thư mục `test/` được viết rút gọn bằng `*`.

**Đọc mã giao diện Admin**
- `test/ui/admin-attendance-grid-labels.test.js`
- `test/ui/attendance-labels.test.js`
- `test/ui/admin-makeup-calendar.test.js`
- `test/ui/day-kind-options.test.js`
- `test/ui/kpi-five-calc.test.js`
- `test/ui/isat-only-saturday-entitled.test.js`
- `test/unit/slip-figures-v4.test.js`
- `test/unit/slip-entries-override.test.js`
- `test/unit/slip-holiday-day-cells.test.js`
- `test/unit/slip-detail-formulas-ui.test.js`
- `test/unit/slip-real-punch-times-ui.test.js`
- `test/unit/slip-row-columns-ui.test.js`
- `test/unit/holiday-row-display.test.js`
- `test/unit/schedule-copies.test.js`
- `test/unit/ui-rules-engine.test.js`
- `test/unit/kpi-score.test.js`
- `test/unit/shared-rules-params.test.js`
- `test/api/period-estimate-one.test.js`
- `test/api/mvp-fixes.test.js`
- `test/api/review-fixes.test.js`
- `test/api/verify-fixes.test.js`
- `test/api/sandbox.test.js`
- `test/api/web-dist-static.test.js`

**Công thức, giờ bấm và số liệu trên phiếu**
- `test/unit/slip-detail-formulas.test.js`, `slip-formulas-merge-terms.test.js`, `slip-formulas-named-terms.test.js`, `slip-formulas-tax-exempt.test.js`, `*-slip-formulas-insurance-paid-days.test.js`
- `test/unit/slip-real-punch-times.test.js`, `slip-row-columns.test.js`, `*-slip-held-day-punch-times.test.js`
- `test/api/slip-detail-formulas.test.js`, `slip-row-columns-api.test.js`, `*-held-day-row-punch-times.test.js`, `*-merge-punch-times-explanation.test.js`
- `test/api/*-so-lieu-phieu.test.js`, `*-phan-6-sua-phieu.test.js`, `slip-override-reason.test.js`, `payslip-negative-net.test.js`, `payslip-paid-numbers.test.js`, `payslip-staff-paid-view.test.js`, `payslip-snapshot.test.js`

**Hợp đồng API mà màn Admin dùng**
- Chấm công, khai thay, giải trình: `test/api/*-admin-khai-thay.test.js`, `*-admin-willmakeup-on-behalf.test.js`, `admin-entered-shift-pay.test.js`, `admin-entry-shift-required.test.js`, `*-realtime-cham-cong.test.js`, `events.test.js`, `attendance-session-status.test.js`, `*-late-checkout-approval.test.js`, `*-explanation-rejected-no-workday.test.js`, `*-explanation-forgot-punch-approved.test.js`, `*-explanation-late-early-approved.test.js`, `*-explanation-declared-off-day.test.js`, `*-checklist-explanation-pending.test.js`, `*-doc-cham-cong-khong-ghi.test.js`, `staff-checkin-gate.test.js`, `staff-revision.test.js`, `*-staff-sheet-rev.test.js`, `sheet-rev.test.js`
- Kỳ lương, khoản thêm, tạm ứng: `test/api/period-lifecycle.test.js`, `period-reopen.test.js`, `period-permissions.test.js`, `period-aggregates.test.js`, `pay-entry.test.js`, `pay-entries-backend.test.js`, `pay-entries-period.test.js`, `review-fixes-pay-entries.test.js`, `*-phan-6-ung-luong.test.js`, `*-advance-approval.test.js`, `approvals.test.js`, `alerts.test.js`
- AI, KPI: `test/api/ai-review-api.test.js`, `ai-review-dismissed.test.js`, `kpi-scores-api.test.js`, `*-phan-6-kpi-tu-danh-gia.test.js`
- Nhân sự, phân quyền: `test/api/lock-admin-guard.test.js`, `password-reset-admin.test.js`, `*-dang-nhap-tai-khoan-khoa.test.js`, `roles-and-bulk-shift.test.js`, `roles-custom.test.js`, `permissions-matrix.test.js`
- Cài đặt: `test/api/settings-save.test.js`, `settings-preview.test.js`, `settings-save-failures.test.js`, `save-applies-everywhere.test.js`, `shifts-edit.test.js`, `geofence.test.js`, `holiday-names.test.js`, `domain-catalog-routes.test.js`, `route-dispatch-golden.test.js`

**Đơn vị cho mô-đun dùng chung mà Admin hiển thị**
- `test/unit/attendance-status.test.js`
- `test/unit/session-status.test.js`
- `test/unit/warnings.test.js`
- `test/unit/pay-entries-calc.test.js`
- `test/unit/domain-classes.test.js`
- `test/unit/route-classes.test.js`

Không có test trình duyệt (E2E) cho các màn Admin. Không có test cho: `boot.js` (bộ nghe SSE), `A.live`, `phieu-a4.js` `printApproved`/`fitPages`, `view-duyet.js` duyệt hàng loạt, `view-phan-quyen.js`.

## 8. Điểm chưa nhất quán trong code

| # | Chỗ | Mô tả |
| --- | --- | --- |
| 1 | `public/admin.html` | Nạp `payroll-engine`, `formula`, `formula-vocab`, `payroll-graph`, `payroll-calendar`, `pay-*-calc`, `payroll-day-parts`, `kpi-score`, `punch`, `work-schedule`, nhưng mã Admin không gọi các mô-đun này. Nạp thừa, và dễ khiến người sửa tưởng giao diện đang dùng bộ máy lương |
| 2 | `view-phieu.js,375,397-409` | `figures()` tự tính tiền (`workBase`, `otPay`, `leavePay`, `holidayPay`, `flexPay`, `nightPay`, mức tham khảo `refs.*`), trái nguyên tắc "giao diện không tính tiền". `p.cells` của máy chủ thắng các ô sửa được, nhưng `refs` và các ô chỉ để hiển thị vẫn tính ở trình duyệt |
| 3 | `view-phieu.js` vs `:432-436,457,876` | Chú thích ghi "Không cộng trừ, không tính thuế ở trình trình duyệt", nhưng `effective()` cộng chênh lệch phụ cấp (`allowance`) và tính `afterIns = gross - insurance` khi máy chủ thiếu số |
| 4 | `phieu-a4-days.js`, `phieu-co-dien.js` | `nightRateOf` chép lại cách bộ máy chọn tỷ lệ phụ cấp đêm, và `rates()` của mẫu cổ điển chọn theo cách khác (`terms.nightPct || nightOptions[0]`, không xét `shift.allowance.basis`). Bộ máy đổi mà các file này không đổi theo thì nhãn trên bản in sai |
| 5 | `view-cham-cong.js` | `holidayWorkOf` chép quy tắc máy chủ về trả giờ làm ngày lễ. Giao diện đọc cờ `a.holiday` trên `approvals[date]`; ngày không có cờ này thì coi là `approved` |
| 6 | `cham-cong-khai.js,174-182` | Quyền lợi dự phòng lấy từ `PayrollParams.DEFAULTS`, không theo tham số đã lưu. `approved` suy từ `attendance > 0`. File còn chép `dayPlan` của `public/nhan-vien/logic.js` |
| 7 | `view-kpi.js` | Cộng tổng tiền KPI ở trình duyệt từ số từng phiếu, không dùng tổng của máy chủ |
| 8 | `view-khac.js`, `view-tro-ly.js` | Hai bản `canDismiss` cùng điều kiện, viết riêng ở hai file. Nguồn trạng thái kỳ khác nhau: `view-khac.js` dự phòng bằng `A.Ky.data()`, `view-tro-ly.js` dùng `periodData()` của chính nó |
| 9 | `view-cai-dat.js,201,645`, `cai-dat-ky-luong.js` | Hai chỗ lưu vùng GPS (`PUT /settings/geofence`). `secChamCong` chỉ dùng khi `A.CaiDat.renderKyLuong` không có |
| 10 | `ai.js`, `view-phieu.js`, `view-ho-so.js`, `view-khoan-them.js`, `view-khoi-phu-cap.js`, `view-khung-chuc-vu.js`, `view-phan-quyen.js`, `view-tham-so.js`, `cai-dat-ky-luong.js`, `cai-dat-so-do.js`, `view-ky-luong.js` | Độ dài lý do 10/300 lặp ở 11 chỗ, ba chỗ viết thẳng số. Máy chủ để ở `lib/config.js` |
| 11 | `view-ho-so.js`, `view-cai-dat.js` | Mật khẩu tối thiểu 6 viết cứng hai nơi. Máy chủ dùng `lib/config.js` `PASSWORD_MIN_LENGTH` |
| 12 | `view-ky-luong.js`, `view-kpi.js`, `phieu-a4.js`, `view-ky-luong-phieu.js`, `view-duyet.js` | Trần trang / lô 200 viết cứng 5 nơi. Máy chủ lấy từ `PAYSLIP_PAGE_MAX` và `APPROVAL_MAX_DECIDE_ITEMS` / tham số `system.approval.maxDecideItems` (đổi được), nên giao diện có thể lệch |
| 13 | `view-kpi.js`, `view-tham-so.js`, `core.js` (`group=2`) | Mã nhóm tham số 2, 8, 14, 15 (và nhóm 1 cho `paramsRev`) viết cứng trong giao diện |
| 14 | `core.js` vs `lib/events.js` (`attendance.changed`) | Chú thích ghi `attendance.changed { kind, month, pending }`, nhưng máy chủ chỉ gửi `kind, month` (trường khác bị lọc) |
| 15 | `view-ky-luong.js` | `overTag` luôn trả chuỗi rỗng mà vẫn được gọi ở (mã chết) |
| 16 | `view-phieu.js`, `phieu-co-dien.js` | `pageOf` và `classicSheet` không dùng trong giao diện, chỉ còn để test đơn vị khoá chữ của mẫu cổ điển |
| 17 | `view-khac.js,500` | Màn `phuc-loi` và `bao-cao` được đăng ký nhưng không có trong menu, chỉ mở được bằng hash |
| 18 | `ai.js` | `A.Dismiss.probe` không hỏi máy chủ, luôn đặt trạng thái `yes`, nhưng `view-ky-luong.js` và `view-tro-ly.js` vẫn gọi và chờ kết quả |
| 19 | `ai.js` | Mỗi lần `mount` thêm `paint` vào `DS.listeners` mà không bao giờ gỡ. Mở nhiều ngăn kéo thì danh sách nghe phình ra và còn vẽ vào phần tử đã bỏ |
| 20 | `lib/periods.js` vs `lib/db.js`, `view-ky-luong.js` | Chú thích máy chủ ghi "`paid` không mở lại được", nhưng `warnIf('PERIOD_STATE', ...)` cho qua, và giao diện hiện nút mở lại kỳ `paid` |
| 21 | `view-ho-so.js` (lưu hồ sơ) vs `view-phan-quyen.js`, `src/modules/staff/staff.controller.ts` | Cùng `PUT /staff/:u` có hai cách gọi: Nhân sự gửi cả hồ sơ và luôn ép `role: 'staff'`; Phân quyền gửi riêng `{ locked }` |
| 22 | `ui.js` `PERIOD_STEPS`/`PERIOD_STATE` vs `view-ky-luong.js` `STATUS_TXT`/`STATUS_PILL`/`NEXT_ACTION` | Hai bộ nhãn trạng thái kỳ lương độc lập, phải sửa đồng thời |
| 23 | `view-tham-so.js` (1481 dòng) | File dài nhất của `public/admin/`; `view-phieu.js` (1199), `view-ky-luong.js` (1101), `view-ho-so.js` (1083) cũng trên 1000 dòng |
| 24 | `core.js`, `A.SHIFTS` (`core.js`) | Số bậc tối đa và 6 ca dự phòng viết cứng. Nếu `GET /positions` hoặc `/settings/shifts` lỗi, giao diện hiện dữ liệu không khớp cấu hình thật mà không báo |
| 25 | `view-giai-trinh.js` | Giải trình ngày dùng `source: 'ai'` / `'admin'` để chọn loại; hộp "Yêu cầu giải trình" nhập tài khoản bằng tay (không chọn từ danh sách nhân sự) |
