# Giao diện nhân viên và đăng nhập (đặc tả theo code)

Tài liệu mô tả đúng những gì code đang làm, đọc từ code chứ không từ chú thích. Số dòng dẫn theo dạng `file:dòng`, có thể lệch vài dòng khi file được sửa; tên hàm đi kèm để tìm lại.

---

## 1. Phạm vi và file

### 1.1 Các trang

`public/` chỉ có ba trang HTML. Địa chỉ `/index.html` không có file nên trả 404.

| Trang | URL | File HTML | JS |
| --- | --- | --- | --- |
| Đăng nhập | `/dang-nhap.html` | `public/dang-nhap.html` | `public/dang-nhap/dang-nhap.js`, `public/home-route.js` |
| Nhân viên | `/nhan-vien.html` (hash `#trang-chu`, `#cham-cong`, `#yeu-cau`, `#luong`, `#toi`; `#hom-nay` và `#thu-nhap` là tên khác của `#trang-chu` và `#luong`) | `public/nhan-vien.html` | `public/nhan-vien/*.js` (14 file, xem 1.2) cùng các module dùng chung |
| Admin | `/admin.html` | `public/admin.html` | ngoài phạm vi tài liệu này (xem `ui-admin.md`) |

`lib/http.js` (`serveStatic`, dòng 205) xử lý đường dẫn `/`: nếu có `web/dist/index.html` (giao diện Vue đã build) thì trả file đó, nếu không thì trả 302 về `/dang-nhap.html`. Có `web/dist` thì thư mục này được tìm trước `public/`, đường dẫn không có đuôi file trả `index.html` của nó; không có thì mọi file chỉ lấy từ `public/` nguyên trạng. Tài liệu này mô tả các trang trong `public/`.

### 1.2 Thứ tự nạp script của `nhan-vien.html`

Thứ tự này quan trọng: mỗi file gắn hàm vào `window.NV`, file nạp sau dùng hàm của file nạp trước.

1. Module dùng chung (UMD/IIFE, cũng chạy được trong Node): `home-route.js`, `payroll-params.js` (`PayrollParams`, `DEFAULTS`), `work-schedule.js`, `approval-view.js` (`ApprovalView`), `leave.js` (`LeaveRules`), `punch.js` gốc (`PunchRules`), `actual-hours.js` (`ActualHours`), `attendance-status.js` (`AttendanceStatus`), `kpi-score.js` (`KpiScore`).
2. `nhan-vien/logic.js` (`NhanVienLogic`, viết tắt `L`): module thuần, không đụng DOM, không gọi mạng. Dựng mô hình tháng, mô tả ngày, trạng thái nút chấm công, danh sách loại ngày khi gửi yêu cầu.
3. `nhan-vien/core.js`: `NV.esc`, đồng hồ máy chủ, state `S`, `NV.api`, toast, cảnh báo, khay (`openSheet`), uỷ quyền click qua `data-act`.
4. `nhan-vien/data.js`: nạp `/me`, `/sheet`, `/punch`, `/me/estimate`, `/leave/ledger`; `putSheet`; `NV.model`.
5. `nhan-vien/parts.js`: các mảnh HTML (thẻ ca, lịch tháng, chi tiết ngày, hồ sơ, đổi mật khẩu).
6. `nhan-vien/thu-nhap.js`: thẻ thu nhập. Chỉ hiển thị số do máy chủ tính.
7. `nhan-vien/yeu-cau.js`: nút tạo yêu cầu, danh sách yêu cầu của tháng, thẻ phép năm.
8. `nhan-vien/ung-luong.js`: tạm ứng.
9. `nhan-vien/giai-trinh.js`: giải trình.
10. `nhan-vien/punch.js`: bấm Check-in và Check-out (định vị, idempotent theo `requestId`).
11. `nhan-vien/khai.js`: biểu mẫu tạo yêu cầu theo ngày và thẻ KPI.
12. `nhan-vien/thay.js`: chế độ "khai thay" (`?thay=<user>`) cho người có quyền duyệt.
13. `nhan-vien/views.js`: 5 tab, render, đổi tháng, đăng xuất, nhịp 15 giây.
14. `nhan-vien/live.js`: SSE `/api/events`.
15. `nhan-vien/boot.js`: khởi động.

CSS: `admin/admin.css` (token và thành phần chung) và 5 file của nhân viên (`nhan-vien.css`, `nhan-vien-hop.css`, `nhan-vien-thay.css`, `nhan-vien-canh-bao.css`, `nhan-vien-ung-luong.css`).

### 1.3 Màn hình và các khối trên đó

| Tab (hash) | Điện thoại | Máy tính (từ 1024 px, `matchMedia`) |
| --- | --- | --- |
| `trang-chu` | lời chào, thẻ ca hôm nay (`shiftCardBody`), thẻ cảnh báo ngày cần để ý (`alertCard`), thẻ thu nhập tháng (`homePayCard`), việc cần làm (`todoCard`) | một trang ba cột dưới thanh tối: cột 1 là Hôm nay (kèm dải tuần và ba lượt gần đây), cột 2 là lịch tháng, cột 3 là thu nhập, KPI, yêu cầu, phép năm |
| `cham-cong` | điều hướng tháng, tóm tắt tháng (`statsBlock`, `summaryLine`), lịch tháng (`calendarGrid`) và chú thích màu, thẻ Hôm nay (`todayPunchCard`), 4 ngày gần đây (`recentCard`) | gộp vào cột 2 (`monthCardDesktop`); ô tóm tắt ngày đang chọn (`dayPanel`) nằm dưới lịch |
| `yeu-cau` | nút tạo yêu cầu (`requestActions`), danh sách yêu cầu của tháng (`requestsSection`), giải trình (`explainSection`), tạm ứng (`advanceSection`), phép năm (`leaveCard`) | thẻ Yêu cầu (`requestsCardDesktop`, gồm giải trình và tạm ứng) và thẻ Phép năm (`leaveCardDesktop`) |
| `luong` | thẻ thu nhập (`incomeSlipCard`), ghi chú (`incomeNotes`), thẻ không có KPI/bảo hiểm (`noBenefitCard`), phụ cấp chuyên cần (`allowanceCard`), KPI (`kpiCard`) | thẻ `incomeCardDesktop` và `kpiCard` |
| `toi` | hồ sơ (`profileCard`), đổi mật khẩu (`passwordForm`), đăng xuất | hồ sơ và đổi mật khẩu mở trong hộp từ ô tên góc phải |

Chạm một ngày trên lịch: điện thoại mở khay chi tiết ngày (`dayDetail`), máy tính chọn ngày và hiện `dayPanel`.

Tài khoản không thuộc bảng lương (`payrollSubject` false): không có Check-in/out, bảng công, yêu cầu, thu nhập; mỗi màn hiện một câu nói rõ lý do (`NO_PAY` trong `views.js`, `noPayCard` trong `thu-nhap.js`).

Ở chế độ khai thay chỉ có ba tab `NV.THAY_VIEWS` = `cham-cong`, `yeu-cau`, `luong` (`thay.js:17`).

### 1.4 Ngoài phạm vi và chưa có trên giao diện nhân viên

- Giao diện Admin (`public/admin/`), engine lương (`public/payroll-engine.js`) và các handler máy chủ chỉ được nhắc tới ở chỗ trang nhân viên gọi vào.
- Nhân viên không sửa được giờ Check-in/out; ngày sai hoặc thiếu giờ chỉ có thông báo "Sai giờ thì nhờ Admin sửa giờ" (`L.ADMIN_FIX`).
- Mục "Đi công tác" trong danh sách yêu cầu và nút "Đang đi công tác? Gửi yêu cầu Công tác" trong khay lỗi vị trí chỉ là ô nhãn "Sắp có", không bấm được.
- Nhân viên không có dòng ngày, giờ bấm từng ngày của phiếu và không có công thức: thẻ thu nhập chỉ hiện từng khoản một số (4.9). Dòng ngày có giờ bấm thật và công thức "Chi tiết" chỉ có trong phiếu Admin (4.9).

---

## 2. Dữ liệu

Trình duyệt không có cơ sở dữ liệu riêng. Có ba nơi giữ dữ liệu.

### 2.1 State trong bộ nhớ: `S` (`core.js:22`, thêm khoá ở các file sau)

| Khoá | Nguồn | Ghi chú |
| --- | --- | --- |
| `me` | `GET /api/me` → `user`; ở chế độ khai thay là hồ sơ người được khai (`owner` của `GET /api/sheet?user=`) | |
| `caps` | `/api/me` | dùng cho chế độ khai thay (`request.decide.*`) |
| `payroll` | `/api/me.payrollSubject !== false`; ở chế độ khai thay luôn `true` | `false` thì ẩn chấm công, bảng công, yêu cầu, thu nhập |
| `holidays`, `geofenceRequired`, `geofence` | `/api/me` | `geofence` chỉ được gán khi `radiusM` là số hữu hạn |
| `month`, `sel`, `selAuto`, `view`, `desktop` | URL/hash, đồng hồ | luôn mở ở tháng hiện tại (`boot.js`) |
| `sheets[month]` | `GET /api/sheet?month=` | `{ status, data, error }`; `stale` khi tin realtime của tháng không đang xem |
| `estimates[month]` | `GET /api/me/estimate?month=` hoặc `/periods/:m/estimates/:u` (khai thay) | `status`: `ok`, `na`, `loading`, `error` |
| `punch` | `GET /api/punch` | kèm `punchStatus`, `punchError` |
| `ledger` | `GET /api/leave/ledger` | chỉ nạp khi nạp lịch tháng hiện tại, không nạp ở chế độ khai thay |
| `advance[month]` | `GET /api/advance-approvals?month=` | `status: 'off'` khi 404 hoặc 403 |
| `explain` | `GET /api/explanations` | `{ items, waitingForYou, loaded, loading, busy }` |
| `danger[]` | cảnh báo mức `danger` của máy chủ | băng đỏ ở đầu trang tới khi người dùng đóng |

`NV.skewMs` là độ lệch giữa đồng hồ máy và đồng hồ máy chủ, lấy từ `serverNow` của `/api/me`, `GET /api/punch`, `POST /api/punch` (`syncClock`). `NV.nowIso()` và `NV.today()` luôn dùng giờ đã chỉnh lệch; ngày theo múi giờ Việt Nam.

`rev` của lịch theo tháng được giữ riêng trong `baseRev` (`data.js`) để gửi làm `expectedRev` khi lưu.

### 2.2 `localStorage` (bọc `try/catch`, tiền tố `aicb-nv-`, `NV.store`, `core.js:46`)

| Khoá | File | Nội dung |
| --- | --- | --- |
| `aicb-nv-punch-attempt` | `nhan-vien/punch.js` | `{ type, sessionId, requestId, at }` của lần bấm chưa có kết quả dứt khoát, sống `ATTEMPT_TTL_MS` = 2 giờ. Nhờ khoá này, khi mạng rớt hoặc tải lại trang, lần bấm lại cùng thao tác dùng đúng `requestId` cũ |

Storage bị chặn thì trang vẫn chạy. Trang đăng nhập không dùng storage.

### 2.3 Bảng máy chủ mà trang này đọc hoặc ghi gián tiếp

`staff`, `timesheets` (lịch khai theo tháng, `rev`, KPI tự đánh giá), `attendance_sessions`, `punches`, `punch_requests` (idempotent theo `request_id`), `corrections`, `sheet_approvals`, `kpi_scores`, `payroll_periods`/`payroll_runs`/`payslips`, `explanations`, `leave_ledger`, `advance_approvals`, `settings` (`holidays`, `geofence`, `agents_enabled`). Schema nằm ở `lib/db.js` và các `schema.js` trong `lib/domain/*`.

### 2.4 Hình dạng một "ngày" trong `sheet.days[date]`

`kind` thuộc `DAY_KINDS` = `work`, `makeup`, `leave`, `unpaid`, `willmakeup`, `approved`, `isat` (`server.js:392`). `makeup` (Làm bù cả ngày) là loại không còn chọn được: máy chủ từ chối ngày mới hoặc ngày đã đổi mang loại này (400 `SHEET_MAKEUP_DAY_REMOVED`), bộ máy tính 0 tiền, 0 công; ngày đã lưu gửi lại không đổi vẫn lưu được.

Các trường khác: `in`, `out`, `shift`/`preset` (mã ca), `breakMin`, `extraKind` (`ot`/`makeup`), `extraIn` (giờ vào làm thêm, trước ca), `extraOut` (giờ ra làm thêm, sau ca), `makeupPlans[] { date, from, to }` (hoặc `makeupDate` kiểu cũ), `punchNote`. Ngày do hệ thống ghi mang `src` hoặc `attendanceConfirmed`; `ApprovalView.itemOf` trả `null` cho những ngày này (`approval-view.js`, hàm `itemOf`).

`itemOf` cho biết ngày nào là khoản cần Admin duyệt: `isat`, `approved` (nghỉ được duyệt), `leave`, `willmakeup`, `ot`, `makeup_hours`; ngày đi làm có giờ vào/ra đúng ngày lễ nằm trong lịch của người có quyền lợi OT là `ot` mang cờ `holiday: true` (nhãn "OT ngày lễ"). Mỗi khoản có `fingerprint`: đổi loại hoặc đổi giờ thì khoản duyệt cũ không còn khớp và quay về chờ duyệt.

---

## 3. API

Ký hiệu: **A** = `{ authenticated: true }`. `write(p, scope)` nghĩa là ghi, có kiểm tra khoá kỳ theo `scope` qua `guardPeriod`. Route không có trong `ROUTE_CAPS` (`lib/authz.js:160`) trả 403 `NO_ROUTE_POLICY` (`server.js:502`); thiếu quyền trả 403 `FORBIDDEN_CAP`.

**Khoá kỳ** (`lib/db.js:1009` `SCOPE_LOCKED_FROM`): `attendance` và `params` khoá từ `attendance_locked`; `kpi` và `slip` khoá từ `approved`. Ghi vào kỳ đã khoá vẫn lưu và thêm `warnings[]` (`PERIOD_LOCKED`). Mọi tháng đều chịu khoá kỳ như nhau.

**Cảnh báo** (`lib/warnings.js`): kiểm tra nghiệp vụ dùng `warnIf` thêm `{ code, message, severity, count?, link?, details? }` vào `warnings[]` của phản hồi 2xx và chạy tiếp. Kiểm tra bảo mật, định dạng, chống ghi đè (`*_STALE`, `requestId`), cổng Check-in (`CHECKIN_NOT_ALLOWED`) và tạm ứng ở kỳ đã duyệt luôn chặn.

**Lỗi chung của `NV.api`** (`core.js:118`): quá `TIMEOUT_MS` 20000 thì huỷ request. Lỗi mạng → `ApiError(0)`. 401 → `location.replace('/dang-nhap.html')`. Mã khác 2xx → `ApiError(status, data.error, data)`. `warnings[]` của phản hồi thành công được đưa qua `NV.showWarnings` (trừ khi nơi gọi đặt `warnings: 'manual'`).

### 3.1 Đăng nhập (`dang-nhap.js`, `home-route.js`)

| Method + path | Cap | Input | Output | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/me` | public | | xem 3.2 | chưa đăng nhập: `user: null` |
| `POST /api/login` | public | `{ username, password }`; client `trim()` và `toLowerCase()` username | `{ user, holidays, geofenceRequired, geofence? }` (`geofenceRequired` cho mọi role, `geofence` chỉ role admin) và đặt cookie phiên (`server.js:558`) | 429 khi sai quá nhiều lần (khoá theo tên và địa chỉ, có `Retry-After`); 401 `Sai tên đăng nhập hoặc mật khẩu` (tên không tồn tại cũng chạy băm mật khẩu và nhận cùng thông báo); 403 khi tài khoản bị khoá (`LOCKED_MESSAGE`, kiểm sau khi mật khẩu đúng) |

Luồng: khi trang mở, `enterIfLoggedIn` gọi `GET /api/me`; có user thì `location.replace(HomeRoute.homeFor(me))`. Bấm Đăng nhập → kiểm hai ô không rỗng (ô trống viền đỏ, câu "Nhập tên đăng nhập và mật khẩu") → `POST /api/login` → `GET /api/me` → `homeFor`; thiếu user thì về `/nhan-vien.html`. Gặp 401 thì ô mật khẩu viền đỏ, hiện câu của máy chủ kèm gợi ý "Kiểm tra lại chữ hoa, chữ thường, hoặc nhờ Admin đặt lại mật khẩu."; lỗi khác hiện câu của máy chủ; lỗi mạng hiện "Không kết nối được máy chủ". Mọi thông báo gán bằng `textContent`. Nút Hiện/Ẩn đổi kiểu ô mật khẩu.

`HomeRoute.homeFor`: `adminCapable` khi `role === 'admin'` hoặc có một trong `ADMIN_CAPS` = `config.read`, `payroll.calculate`, `payroll.approve`, `attendance.correct`, `attendance.lock`, `audit.read`; khi đó đi `/admin.html`, ngược lại đi `/nhan-vien.html`. `LOGIN_PAGE = '/dang-nhap.html'`.

### 3.2 Trang nhân viên

| Method + path | Cap (`authz.js`) | Gọi từ | Input | Output (các trường UI dùng) | Lỗi / khoá kỳ / cảnh báo |
| --- | --- | --- | --- | --- | --- |
| `GET /api/me` | public | `boot.js`, `data.js loadMe`, `live.js` (`roles.changed`, `bye`) | | `user` (kèm `levelName`, `shiftCode`, `startDate`, `jobTitle`, `contract`, `locked`…), `serverNow`, `roles`, `caps`, `payrollSubject`, `agentsEnabled`, `holidays`, `benefits` và `positionLabel` (của chức vụ mình, `myPosition`), `geofenceRequired`, `geofence` (chỉ role admin) (`server.js:611`) | không có user → client chuyển `LOGIN_PAGE` |
| `POST /api/logout` | public | `views.js` (`logout`) | | `{ ok }`; tăng `session_version`, `events.closeUser(user,'logout')` (`server.js:603`) | client luôn chuyển `/dang-nhap.html` |
| `PUT /api/password` | `write(A)` | `views.js bindPassword` | `{ current, next }` (client kiểm hai ô mật khẩu mới khớp nhau) | `{ ok }`, cookie phiên mới; audit `password.change`; `closeUser('password')` đóng các SSE khác (`server.js:628`) | 400 sai mật khẩu hiện tại / mật khẩu mới ngắn hơn `PASSWORD_MIN_LENGTH` |
| `GET /api/sheet?month=[&user=]` | `self-or:attendance.read` | `data.js loadMonth`, `putSheet` | `month`; `user` ở chế độ khai thay | `days`, `rev`, `owner` (khi xem người khác), `attendanceSessions` (mỗi lượt kèm `status`, `statusNote`, `superseded`), `otherLeave`, `neighbors`, `workSchedule`, `scheduledDates`, `kpiPct`, `kpiAmt`, `kpiWeights`, `kpiParts`, `corrections`, `approvals`, `leaveBalance`, `actualReport`, `cutRule`, `payrollSubject` (`server.js:760`) | tài khoản ngoài bảng lương xem bảng của chính mình: 200 bảng rỗng với `payrollSubject:false`; xem bảng người khác khi không có quyền: 403 `Không được xem bảng của người khác` |
| `PUT /api/sheet` | `write(A,'attendance','body.month')` | `data.js putSheet` (do `khai.js` gọi) | nhân viên: `{ month, days, kpiPct, kpiAmt, expectedRev }`; khai thay: `{ month, days, user, expectedRev }` | `{ ok, rev, approvals, reset, resubmitted, removed, onBehalf?, autoApproved? }` + `warnings[]` (`server.js:816`) | 409 `SHEET_STALE` khi `expectedRev` khác `rev`; khoá `attendance`; `checkSheet`/`checkSheetLimits` (`lib/domain/sheet-checks.js`) dùng `warnIf`; iSAT sai chức vụ hoặc sai thứ bị từ chối (`lib/domain/isat-rule.js`); sự kiện `approvals.changed`, khi khai thay thêm `estimate.changed`/`request.decided` |
| `PUT /api/kpi/scores` | `write(self-or:kpi.score.write,'kpi','body.month')` | `khai.js` (form tự đánh giá) | `{ month, username, user, scores: { self } }` | `{ ok, changed, kpiParts }`; audit `kpi.score` (`server.js:882`) | nhân viên chỉ gửi được phần `self` của chính mình (`selfScoreOnly`, 403 `KPI_SELF_ONLY`); tháng chưa bắt đầu: `KPI_MONTH_FUTURE`; điểm sai định dạng (`KpiScore.checkScore`) → 400; khoá `kpi` từ `approved` |
| `GET /api/punch` | A | `data.js loadPunch` | | `punchState` + `punchExtras` (xem dưới) (`server.js:1234`) | người không thuộc bảng lương: `{ enabled:false, canCheckIn:false, openSession:null, lastSession:null, serverNow }` |
| `POST /api/punch` | `write(A,'attendance', …)` | `nhan-vien/punch.js doPunch` | `{ type:'in'|'out', requestId, sessionId?, location?{lat,lng,accuracy}, explanation? }` | trạng thái chấm công mới + `punchExtras` + `warnings[]` (`server.js:1247`) | xem bên dưới |
| `GET /api/me/estimate?month=` | A | `data.js loadEstimate` | `month` | xem bên dưới (`lib/periods.js estimate`, dòng 1080) | 400 `BAD_MONTH`; `estimate: null` → client đặt `na`, kèm `payrollSubject:false`, `reason` (`NOT_STARTED`, `PAYROLL_BAD_TYPE`…) hoặc `message` |
| `GET /api/leave/ledger` | `self-or:profile.read` | `data.js loadLedger` | | `{ username, uuid, hasAccount, balance, on, summary, events }` | có tác dụng phụ: gọi `leave.refresh` nên ghi vào sổ phép |
| `GET /api/advance-approvals?month=` | A | `ung-luong.js loadAdvance` | `month` | `{ item: { status, eligible, amount, rev, note }, provisional }` | 404/403 → client coi tạm ứng là `'off'` |
| `POST /api/advance-approvals/request` | `write(A)` | `ung-luong.js send` | `{ month, expectedRev }` | `{ ok, item }`; audit `advance.request` | 409 `ADVANCE_REQUEST_STALE`, `ADVANCE_ALREADY_REQUESTED`, `PERIOD_LOCKED` (kỳ `approved`/`paid`); 403 `ADVANCE_NOT_ELIGIBLE` kèm lý do (`lib/domain/advance/routes.js`) |
| `POST /api/advance-approvals/withdraw` | `write(A)` | `ung-luong.js` | `{ month, expectedRev }` | `{ ok, item }`; audit `advance.withdraw` | 409 `ADVANCE_NOT_PENDING`, `ADVANCE_REQUEST_STALE`, `PERIOD_LOCKED` |
| `GET /api/explanations` | A | `giai-trinh.js load` | | `{ items[{id, kind, date, status, prompt, answer, requestedOut, decisionNote}], waitingForYou }` (nhân viên chỉ thấy của mình) | lỗi → giữ danh sách cũ |
| `POST /api/explanations/:id/answer` | `write(A)` | `giai-trinh.js ex-open` | `{ text }` (textarea `maxlength=500`) | `{ ok, item }`; audit `explanation.answer` | `EXPLANATION_TEXT_REQUIRED`, `EXPLANATION_TEXT_TOO_LONG` (`TEXT_MAX` 500), `NOT_FOUND`, `FORBIDDEN`, `NOT_REQUESTED`, `EXPLANATION_ALREADY_APPROVED` |
| `GET /api/events` | A | `live.js` | | SSE (mục 5) | |
| `GET /api/positions?month=` | `readCap('config.read')` | `thay.js prepareThay` | | danh sách chức vụ kèm `benefits` | thiếu `config.read` → 403, client rơi về quyền lợi mặc định |
| `GET /api/periods/:month/estimates/:username` | `readCap('payroll.view')` | `thay.js thayEstimate` | | phiếu ước tính của người được khai thay | 404 `PAYSLIP_NOT_FOUND` → `na` |

**`punchState` + `punchExtras`** (`server.js:283`, `server.js:416`): `enabled`, `from` (ngày bắt đầu tính giờ theo Check-in/out), `canCheckIn`, `checkInBlock` (câu lý do) cùng `checkInCode` (`CHECKIN_NOT_ALLOWED` | `CHECKIN_OUTSIDE_SHIFT`), chỉ có khi không có lượt mở và bị chặn, `checkInEntitlement` (`shift` | `ot` | `makeup_hours`) khi `canCheckIn`, `openSession`, `lastSession` (mỗi lượt kèm `status`, `statusNote`), `open`, `date`, `workDate`, `scheduled` (ngày công này có nằm trong lịch không), `record`, `before`, `done`, `pending`, `serverNow`, `cutRule`, `shiftConfig` (client không đọc), `checkoutPreview` ("nếu Check-out bây giờ": `{ early, cutEnd, cutStart, paidMin }` hoặc null khi lượt ngoài lịch hoặc ngoài ca).

**Lỗi và nhánh của `POST /api/punch`**:
- 403 nếu không thuộc bảng lương (câu riêng cho Admin); 400 sai `type`/`requestId`/thiếu `sessionId` khi Check-out.
- `requestId` đã dùng: cùng thao tác thì trả lại phản hồi đã lưu, khác thao tác thì 409 `requestId đã dùng cho thao tác khác`.
- Check-in: kiểm vị trí khi có vùng chấm công (`GEO_NO_LOCATION`, `GEO_LOW_ACCURACY`, `GEO_OUTSIDE`: ghi cờ `outsideZone` và cảnh báo); 409 `Bạn đang có lượt mở`; cổng Check-in (4.3a) trả 409 `CHECKIN_NOT_ALLOWED`; khoá kỳ theo ngày công; chồng giờ với lượt khác → 400. Check-in ngoài khung giờ ca không bị chặn: lượt mang `outsideShift` và chờ Admin xử lý.
- Check-out: 404 không có lượt; 409 `Lượt này đã Check-out`; 400 giờ ra trước giờ vào; muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá `CHECKOUT_GRACE_MIN` (= 30, `lib/config.js:119`) mà không có `explanation` → 409 `CHECKOUT_NEEDS_EXPLANATION` `{ sessionId, lateMin, graceMin }`; có `explanation` thì ghi nhận giờ bấm và lượt thành "Quên Check-out" chờ Admin duyệt giải trình.

**`GET /api/me/estimate`** trả `{ month, period:{status,…}, estimate, label, official, source, m, net, trace, allowanceTotal, toDate, pendingItems, allowanceStatus, holidayShifts, paidDays, overridden?, actualReport, paramsHash, engineVersion }`.
- Theo tham số `slip.staffVisibleFrom` (mặc định `afterPaid`): kỳ đã `paid` (hoặc `approved`/`paid` với `afterApproval`) thì trả bản chụp của lần tính lương gần nhất (`official: true`, `source: 'snapshot'`, `pendingItems: null`, `toDate: null`), ngược lại tính trực tiếp trên đầu vào hiện tại (`official: false`).
- `m`, `net`, `trace`, `allowanceStatus` là số cả tháng; tháng hiện tại có thêm `toDate = { upTo, gross, … }` (phần tới hôm nay, không kèm thực nhận).
- Tham số `rows=1` kèm dòng ngày trong `m.rows`; trang nhân viên không dùng.
- `holidayShifts` và `paidDays` là ghi chú đếm theo dòng ngày (`lib/slip-paid.js staffDayNotesOf`), không phải tiền.
- Phiếu có số Admin sửa: `overridden: true`, `net` và các khoản là số chi trả, dòng không ánh xạ được bị bỏ.

---

## 4. Cách tính / quy tắc

Nguyên tắc chung: **giao diện nhân viên không tính tiền.** `thu-nhap.js` chỉ đọc `trace`, `m`, `net`, `entries`, `allowanceStatus`, `toDate`, `pendingItems` do máy chủ trả. Client chỉ phân loại ngày để vẽ, đếm số ngày, số phút và chọn câu chữ.

### 4.1 Tham số đọc từ `PayrollParams.DEFAULTS` trên trình duyệt (bảng mặc định, không theo tháng)

| Khoá | Mặc định | Dùng ở |
| --- | --- | --- |
| `shift.preset.n1..g2` | n1 08:00-17:00, n2 10:00-19:00, f1 06:00-15:00, f2 13:00-22:00, g1 21:00-06:00, g2 22:00-07:00; mã hiện hành Normal1, Normal2, Flex1, Flex2, Night1, Night2 là tên khác của n1…g2 | `logic.js shiftInfo` (qua `PunchRules.SHIFT`), `khai.js` (chọn ca) |
| `attendance.earlyCheckinMaxHours` | 4 | `PunchRules.checkInMsg`: mở khung Check-in sớm trước giờ vào ca |
| `attendance.openSessionMaxHours` | 16 | `PunchRules.forgotOut`: lượt mở quá lâu |
| `kpi.weight.*` | wework 40, user 24, peer 18, manager 12, self 6 | dự phòng của `logic.js kpiParts`; ưu tiên `sheet.kpiWeights` của máy chủ |
| `type.<t>.benefit.*` | tts: ot, isat false; ctv: isat false; nv: tất cả true; makeup true cho cả ba | `logic.js benefitsOf` khi máy chủ chưa gửi cờ `benefits` |
| `level.<t>.<n>.name` | | `logic.js levelName` khi máy chủ chưa gửi `levelName` |

Máy chủ dùng `rulesFor(month)` (tham số theo tháng), trình duyệt luôn dùng `DEFAULTS` cho các khoá trên (xem mục 8).

### 4.2 Nút chấm công và thẻ ca hôm nay (`logic.js punchView:643`; `parts.js shiftCardBody:55`)

- `mode`: `loading` (chưa có `S.punch`), `open` (có lượt đang mở), `noshift` (chưa gán ca cố định), `window` (ngoài khung Check-in của ca, câu lấy từ `PunchRules.checkInMsg`), `ready`.
- Lượt đang mở: nhãn lượt `status` và lý do `statusNote` lấy từ `openSession` của `GET /api/punch` (nhãn Đã Check-in, hoặc Chờ xử lý khi vào trễ quá `attendance.graceMin`, ngoài ca, ngoài vùng GPS…). Hiện giờ vào, "sớm N phút" hoặc "muộn N phút" so với giờ vào ca (chỉ lượt đầu của ngày), số phút đã làm (cập nhật theo nhịp 15 giây), "ca của ngày dd/mm" khi ca đêm qua nửa đêm. Lượt ngoài ca hoặc ngoài lịch, ngoài vùng GPS, mở quá `openSessionMaxHours` đều có dòng ghi chú riêng. Nút Check-out luôn bấm được.
- Chưa có lượt mở: nhãn là nhãn của ngày (`AS.dayStatus` của các lượt hôm nay) hoặc "Chưa vào ca" / "Chưa mở". Hiện giờ vào và ra của các lượt đã xong, các lý do ngắn, dòng cảnh báo giờ bấm Check-out muộn chưa được duyệt, và dòng nói về vị trí (cần bật vị trí khi `geofenceRequired`, ngược lại "Chưa bật vùng chấm công: Check-in không cần vị trí"). Nút ghi "Check-in", hoặc "Check-in lượt mới" khi hôm nay đã có lượt xong.
- `blocked` = `punch.checkInBlock` khi không có lượt mở: nút Check-in bị tắt và câu của máy chủ hiện ngay trên thẻ (4.3a).
- Ngoài `blocked`: `mode` `window` hoặc `noshift` chỉ còn khi máy chủ không báo `checkInBlock`; nút vẫn bấm được và nói lượt đó chờ Admin xử lý, không tính tiền nếu chưa được Admin đồng ý (câu nói khung giờ Check-in "từ HH:MM đến trước HH:MM"; khi chưa tới giờ mở nút hiện "mở lúc HH:MM"). Khung giờ hiện trên màn được bóc bằng regex từ câu của `checkInMsg` (mục 8).
- `offScheduleToday` (từ `punch.scheduled`, dự phòng `isScheduled`): thẻ nói hôm nay ngoài lịch làm việc, lượt chấm công sẽ chờ Admin xử lý.
- Thẻ Hôm nay ở tab Chấm công (`todayPunchCard`) và dải tuần, ba lượt gần đây trên máy tính dùng cùng mô hình tháng.

### 4.3 Bấm chấm công (`nhan-vien/punch.js doPunch:216`)

1. Check-out sớm: nếu lượt đang mở có `earlyWarning` (chưa tới giờ kết thúc ca) và không phải lượt ngoài ca, client gọi lại `GET /api/punch` rồi mở hộp xác nhận "Ca làm chưa kết thúc" (`confirmEarly`) nêu giờ kết thúc ca, số phút còn lại và, từ `checkoutPreview`, "về sớm N phút, sẽ bị trừ M phút" hoặc "chưa bị trừ (đến G phút không trừ)". Hai nút: "Vẫn Check-out" (tiếp tục gửi) và "Tiếp tục làm" (huỷ; bấm ra ngoài hộp cũng là huỷ). Lượt đã Check-out sớm có nhãn Chờ xử lý với lý do "Về sớm N phút" (4.4).
2. Lấy vị trí chỉ khi Check-in và `geofenceRequired`: `getCurrentPosition({ enableHighAccuracy:true, timeout:15000, maximumAge:0 })`. Lỗi định vị vẫn gửi, không kèm vị trí. Toạ độ chỉ nằm trong biến cục bộ của một lần bấm.
3. `requestId = NV.uuid()` (khớp `/^[A-Za-z0-9._:-]{8,120}$/`). Lưu `punch-attempt` (TTL 2 giờ); lần bấm lại cùng `type` và `sessionId` dùng lại `requestId` cũ. Xoá attempt khi máy chủ trả lời dứt khoát (mã dưới 500).
4. `postPunch` gặp lỗi mạng thì tự thử lại **một** lần với cùng `requestId`.
5. Kết quả:
   - Lỗi vị trí từ máy chủ (`L.geoServerError`, theo mã hoặc theo câu chữ): mở khay vị trí với câu của máy chủ.
   - 409 `CHECKOUT_NEEDS_EXPLANATION`: mở hộp "Check-out muộn: cần giải trình" (`NV.askLateExplanation`), gửi lại kèm `explanation`; huỷ hộp thì giữ nguyên trạng thái đang làm.
   - 409 khác: nạp lại `punch`, hiện câu của máy chủ. 403: hiện câu của máy chủ và nạp lại `/api/me`. Lỗi mạng: câu hướng dẫn bấm lại, lần thử lại dùng cùng một lượt ghi nhận.
   - Thành công: nạp lại lịch tháng hiện tại, cảnh báo `danger` đưa lên băng đầu trang, hiện khay kết quả (`resultSheet`). Check-in: giờ vào, ca, giờ bị trừ do vào muộn (`checkoutPreview.cutStart`), nhãn lượt và lý do, độ chính xác vị trí. Check-out thường: thời gian trong lượt, phút muộn/về sớm và giờ bị trừ, công hôm nay, nhãn lượt. Check-out muộn: "Đã ghi nhận giờ bấm Check-out HH:MM", lượt Chờ xử lý cho tới khi Admin duyệt giải trình; duyệt thì giờ này là giờ Check-out, từ chối thì cả ngày không tính công.
6. Khoảng cách tới văn phòng chỉ tính khi `S.geofence` có giá trị; máy chủ chỉ gửi `geofence` cho role admin (mục 8).

### 4.3a Cổng Check-in (máy chủ, `server.js:250 checkInDay` và `checkInVerdict`)

Nhân viên chỉ Check-in được cho ngày công (ca đêm thuộc ngày bắt đầu ca; lượt ngoài khung ca thuộc ngày bấm) khi:
- ngày đó là ngày làm việc trong lịch được gán (lịch theo loại nhân sự) và không phải ngày lễ; hoặc
- ngày đó có khoản OT (kể cả OT ngày lễ) hoặc làm bù theo giờ ở trạng thái đã duyệt.

Ngày nghỉ cả ngày cũng đóng Check-in: iSAT, nghỉ phép năm, nghỉ không lương đã khai (chờ duyệt hay đã duyệt, trừ khoản bị từ chối); nghỉ được duyệt và nghỉ sẽ làm bù chỉ khi đã duyệt. Ngoại lệ: ngày đó có khoản OT hoặc làm bù đã duyệt. Câu báo: "Hôm nay bạn <loại nghỉ>, không Check-in được." hoặc "Hôm nay bạn không có lịch làm việc hay giờ OT/làm bù được duyệt nên không Check-in được." Qua cổng ngày rồi, giờ bấm còn phải nằm trong khung ca hoặc trong khoảng giờ của khoản OT / làm bù đã duyệt (attendance.md 3.2b); ngày ngoài lịch hay ngày lễ chỉ mở đúng khoảng giờ của khoản. Cổng áp dụng ở cả `GET /api/punch` (`checkInBlock`, `checkInCode`, `canCheckIn:false`) và `POST /api/punch` (409 `CHECKIN_NOT_ALLOWED` khi ngày không qua cổng hoặc đã khai nghỉ, 409 `CHECKIN_OUTSIDE_SHIFT` khi ngoài khung ca không có khoản phủ giờ đó; không ghi gì).

### 4.4 Nhãn chấm công (`public/attendance-status.js`, `lib/domain/attendance/session-status.js`)

Máy chủ gán cho mỗi lượt `status` và `statusNote`; client chỉ đổi mã ra chữ. Ngày có lượt chỉ hiện đúng một trong sáu nhãn; khoản đã khai (OT, làm bù, đi làm ngày lễ, nghỉ) và trạng thái duyệt của nó là dòng "Đã khai" trong khung ngày, không phải nhãn.

| Mã | Nhãn | Khi nào |
| --- | --- | --- |
| `checked-in` | Đã Check-in | lượt đang mở, giờ vào hợp lệ |
| `checked-out` | Đã Check-out | lượt đã đóng, giờ vào/ra hợp lệ |
| `pending` | Chờ xử lý | có lý do giờ chưa hợp lệ và chưa có kết luận duyệt: vào trễ lớn hơn `attendance.graceMin`; về sớm bất kỳ (phút > 0 so với giờ kết thúc ca); Check-out muộn lớn hơn `CHECKOUT_GRACE_MIN`; quên Check-in/out; ngoài ca; nhiều lượt trong một ca; ngoài vùng GPS; cần đối soát; hoặc đang có giải trình chờ (chờ nhân viên trả lời, hoặc đã trả lời chờ Admin) |
| `approved` | Được phê duyệt | kết luận duyệt mới nhất về lượt (giải trình, yêu cầu điều chỉnh giờ) là duyệt; hoặc Admin xác nhận lượt thiếu giờ |
| `rejected` | Bị từ chối | kết luận duyệt mới nhất là không duyệt; giải trình ngày bị từ chối làm cả lượt Admin ghi hộ thành Bị từ chối |
| `admin` | Đã chấm công | lượt do Admin tự ghi (khai thay, hoặc ghi theo giờ ca khi duyệt giải trình quên chấm, hoặc giờ Admin ghi thẳng) |

Thứ tự ưu tiên khi chọn nhãn của một ngày có nhiều lượt (`DAY_ORDER`): Chờ xử lý, Bị từ chối, Đã Check-in, Được phê duyệt, Đã chấm công, Đã Check-out; lượt bị đánh dấu `superseded` (bị lượt Admin ghi cùng ngày công thay) không tham gia. Lý do ngắn (`statusNote`): "Vào trễ N phút", "Về sớm N phút", "Check-out muộn N phút", "Quên Check-out", "Quên Check-in", "Ngoài ca", "Ngoài vùng GPS", "Nhiều lượt trong một ca", "Cần đối soát giờ chấm", "Cần Admin xem lại", "Đã gửi giải trình, chờ Admin", "Chờ nhân viên giải trình", "Giải trình Check-out muộn", "Giải trình", "Yêu cầu điều chỉnh giờ", "Thiếu giờ".

Màu nhãn (`AS.TONE`): Đã Check-in `on`, Chờ xử lý `pending`, Bị từ chối `rejected`, ba nhãn còn lại `done`. Trên ô lịch, Đã Check-in và Đã Check-out không ghi chữ; Chờ xử lý (màu `pend`) và Bị từ chối (màu `err`) ghi chữ nhỏ; Được phê duyệt và Đã chấm công ghi chữ nhỏ màu thường.

### 4.5 Mô hình tháng (`logic.js buildMonth:346`, `primaryOf:461`, `describeDay:496`)

Mỗi ô ngày gồm các lượt (`sessionRow:292`), nhãn ngày `dayStatus`, báo cáo giờ công của ngày `actualReport.report[date]` do máy chủ tính (chạy từ đầu tháng; mọi ngày đều ảnh hưởng tiền) và khoản khai/duyệt.

`summary` được đếm lại trên client:
- `ok` (số ngày báo cáo ở trạng thái `ok`), `lateMin` (tổng phút muộn), `cutMin` và `cutDays` (phút và ngày bị trừ, `totalCut = cutStartMin + cutEndMin + gapCutMin`).
- `pending`: ô có nhãn Chờ xử lý, gồm ngày chưa có lượt mà báo cáo ở trạng thái `forgot-in`, `forgot-out`, `review`, `off-shift`.
- `rejected`: ngày có nhãn Bị từ chối.
- `absent`: ngày không có lượt nào, báo cáo `absent`.
- `missing` = `pending` + `rejected` + `absent`; danh sách `model.missing` (mới nhất trước) là các ngày đó, chữ lấy từ `attentionText`.
- `isat`, `leave` (số ngày khai loại đó), `referenceOnly`, `allReference`.

Ô lịch chưa có lượt: ngày khai xin nghỉ cả ngày (`isat`, `approved`, `leave`, `willmakeup`) đang chờ hoặc bị từ chối ghi "Chờ" (`pend`) hoặc "Từ chối" (`err`); ngày lễ trong lịch "Lễ"; loại ngày khai ghi "iSAT", "Phép", "Nghỉ", "Sẽ bù"; ngày khai loại cũ `makeup` ghi "Không tính"; ngày khai mà không chấm công "Không công"; ngày vắng "Vắng". Dấu nhỏ `OT` hoặc `BÙ` cho ngày đã khai làm thêm.

Mức trừ do đi muộn/về sớm: `cutFromRule` tra bảng `sheet.cutRule.table` (máy chủ dựng từ tham số của tháng); vượt quá bảng thì lấy phần tử cuối; chưa có bảng thì không hiện con số.

Khung chi tiết ngày (`describeDay`) hiện: ca; lượt (giờ vào → giờ ra, "hôm sau" khi qua nửa đêm; nhãn và lý do; thời gian có mặt; điều chỉnh của Admin; giờ bấm Check-out chờ duyệt); dòng "Công ngày này" (số giờ công và giờ đã trừ, "Chờ Admin xử lý", "Tính là ngày nghỉ", "Không tính tiền"); vào muộn, về sớm, khoảng trống giữa các lượt và phần trừ tương ứng; dòng "Đã khai" kèm trạng thái chờ xử lý / được phê duyệt / bị từ chối và lý do từ chối.

Ngày giữ vì giải trình: ngày có giải trình chưa duyệt chưa tính công, giải trình bị từ chối thì ngày đó không tính công (4.12); lượt vẫn giữ giờ bấm thật và nhãn ngày là Chờ xử lý hoặc Bị từ chối.

### 4.6 Tạo yêu cầu theo ngày (`logic.js dayPlan:775`, `formFromDay:896`, `dayFromForm:934`, `checkDayForm:958`; `khai.js`)

- Nhân viên không tự khai ngày đi làm: ngày làm việc do lịch được gán xác định. `NV.khaiAction` (nút "Khai ngày này" / "Sửa khai báo ngày này") chỉ có ở chế độ khai thay. Nhân viên gửi yêu cầu từ tab Yêu cầu (biểu mẫu "Tạo yêu cầu"): `NV.planCtx` đặt `requestOnly`, nên `dayPlan` thay mục "Đi làm" bằng mục OT / làm bù theo giờ (`kind 'work'` kèm làm thêm, `extraOnly`: bắt buộc chọn loại làm thêm; thiếu thì "Chọn OT hoặc làm bù theo giờ"). Không có ngày tuỳ chọn ngoài lịch: ngày ngoài lịch chỉ gửi được yêu cầu.
- Các nút tạo yêu cầu (`actionList`) theo quyền lợi chức vụ: "Xin nghỉ phép năm" (có `paidLeave`, kèm số phép còn), "Khai OT hoặc làm bù" / "Khai làm bù theo giờ" (có `ot` / `makeup`), "Yêu cầu khác" (nghỉ không lương, nghỉ sẽ làm bù, nghỉ được duyệt), "Xin tạm ứng" (4.11). Mọi quyền lợi được coi là bật.
- Các nút không bị tắt theo trạng thái kỳ.
- Loại ngày chọn được:
  - Mọi loại hiện ở mọi ngày kể cả Chủ nhật, kèm ghi chú "Ngày ngoài lịch, chờ Admin xem lại." hoặc "Chức vụ chưa có quyền lợi này."; máy chủ cảnh báo khi lưu. Ngày lễ trong lịch không đưa các loại nghỉ.
  - iSAT chỉ có khi chức vụ có quyền lợi iSAT và `dow === 6` (viết cứng ở client; máy chủ dùng `isat.weekday`, từ chối cả khi Admin khai thay).
  - Loại `makeup` (Làm bù cả ngày) không có trong danh sách. Ngày đã lưu loại này hiện là "Làm bù cả ngày (loại cũ, không tính)" với gợi ý khai lại, ô lịch nhãn "Không tính", không có ô giờ, gửi lại đúng giờ đã lưu.
  - Người có ca cố định chỉ thấy ca được gán (không có ô chọn ca); chưa gán ca thì có ô chọn mã ca hoặc tự nhập giờ.
- Giờ làm thêm (`extraKinds`, chỉ trong mục OT/làm bù hoặc ngày đi làm): `ot` và `makeup` theo quyền lợi; ngày lễ chỉ có `ot`. Giờ vào làm thêm (trước ca) và giờ ra làm thêm (sau ca): điền một hoặc cả hai. Ghi chú trên màn: giờ làm bù đã duyệt được trả đủ (giờ × lương giờ), phần giờ làm bù rơi vào ngày lễ được trả thêm theo `holiday.makeupRate` (mặc định ×3); ngày có giờ làm bù không có phụ cấp ca và không có giờ nghỉ đêm có lương.
- Ngày lễ trong lịch: khai là OT, ô "Giờ OT từ" – "Đến" là khung giờ OT (không phải ca; giờ ra nhỏ hơn giờ vào là sang ngày hôm sau), không có ô làm thêm riêng; ghi chú: giờ nằm trong ngày lễ tính OT ngày lễ, giờ sang ngày thường kế bên tính như OT thường, chỉ phần có Check-in/out liền mạch trong khung đã khai mới được tính, không Check-in/out hôm đó là vắng và mất lương ngày lễ. Khoản mang nhãn "OT ngày lễ" (`approvalOfForm`).
- "Nghỉ, sẽ làm bù": nhiều dòng ngày/khung giờ làm bù dự kiến; giờ kết thúc nhỏ hơn giờ bắt đầu là sang ngày hôm sau; tính như nghỉ không lương và bù bằng giờ làm bù khai riêng.
- `dayFromForm` trả `null` cho "Nghỉ lễ" (xoá khai báo). `checkDayForm` chặn giờ làm bù (và ngày dự kiến bù của "Nghỉ, sẽ làm bù") vào ngày lễ, dùng đúng câu chữ của `sheet-checks.js`.
- `approvalOfForm` dùng `ApprovalView.itemOf` để báo khoản có cần Admin đồng ý không; khi cần thì khay ghi "<khoản> cần Admin đồng ý. Trước đó, ngày này chưa tính vào thu nhập." Ở chế độ khai thay, khoản người khai có quyền duyệt được duyệt luôn khi lưu (`approveOnBehalf`).
- Lưu: `NV.putSheet(month, change, { warnings:'manual' })`: luôn `GET /api/sheet` lấy bản mới, sao chép sâu `days`, chạy `change`, gửi `expectedRev = baseRev ?? fresh.rev`; 409 `SHEET_STALE` thì đặt lại `baseRev`, nạp lại lịch và số thu nhập, ném lỗi để khay hiện câu của máy chủ; thành công thì nạp lại lịch và số thu nhập. Có `warnings[]` thì khay chuyển sang "Đã lưu, có cảnh báo" liệt kê từng câu, kèm nút "Sửa lại ngày này"; không có thì đóng khay và toast ("Đã lưu.", hoặc "Đã gửi yêu cầu. Chờ Admin xử lý." khi khoản vừa lưu đang chờ duyệt).

### 4.7 KPI (`khai.js kpiCard:496`, `selfForm:444`, `kpiFive:452`)

- Chỉ có thẻ KPI khi chức vụ có quyền lợi `kpi` và mọi tháng đều tính 5 thành phần.
- Năm thành phần và trọng số lấy từ `sheet.kpiWeights` của tháng: Base Wework, Người dùng, Đồng nghiệp, Quản lý trực tiếp, Tự đánh giá.
- Chưa đủ điểm (`kpiParts.complete` false): thẻ "Chờ chấm đủ N điểm"; thành phần Tự đánh giá do nhân viên nhập, các thành phần còn lại hiện "Chờ Admin chấm" (máy chủ chỉ gửi phần `self` của chính người đó cho tới khi đủ điểm). Đủ điểm: hiện điểm từng thành phần, "Tổng điểm" (kèm Đạt / Chưa đạt) và "Lương KPI" từ `m.kpiPct`, `m.kpiPass`, `m.kpiPay`.
- Ô "Tự đánh giá của bạn": điểm từ 0 đến 100, tối đa 2 chữ số thập phân, dấu phẩy hoặc dấu chấm; client kiểm bằng regex rồi `PUT /api/kpi/scores` chỉ với `scores.self`. Ô ẩn (chỉ xem) ở chế độ khai thay. Chữ đang gõ được giữ qua các lần vẽ lại.

### 4.8 Mốc thu nhập hiển thị (`thu-nhap.js`)

- Trạng thái tháng (`STATE_TEXT`, `period.status`): `open` "Chưa tính lương", `attendance_locked` "Đã chốt công", `calculated` và `reviewed` "Đã tính lương", `approved` "Đã phê duyệt", `paid` "Đã trả lương". Phiếu chính thức (`official`) hiện "Chính thức" (máy tính thêm "đã trả lương" khi kỳ đã trả).
- Số chưa chính thức có gạch chân nét đứt; câu nhỏ: "Tính theo Check-in/out (N ngày công), chưa phải lương chính thức"; tháng hiện tại có thêm dòng "Đến dd/mm: N ngày công, thu nhập X ₫ trước khoản trừ" (từ `toDate`).
- `notReady`: tài khoản ngoài bảng lương, `NOT_STARTED` hoặc `message` của máy chủ.
- Ghi chú dưới số: yêu cầu chờ xử lý chưa tính vào thu nhập (từ `pendingItems`), yêu cầu bị từ chối, số ngày cần để ý (chờ xử lý, bị từ chối hoặc không có chấm công) làm công có thể chưa đủ, phiếu có khoản Admin điều chỉnh, lịch tháng chưa khai.

### 4.9 Thẻ thu nhập và số do máy chủ tính

**Cách hiển thị** (`linesOf:79`): mỗi khoản thu nhập là MỘT số tiền của máy chủ; ô tiền không kèm công thức hay số giờ. Các dòng: "Tiền ngày công" (dòng nhỏ: số ngày công trên ngày công chuẩn của tháng, "kể cả lương" ngày lễ / ngày phép / ngày iSAT theo `paidDays`), phụ cấp ca (Phụ cấp ca đêm / Phụ cấp ca Flex / Phụ cấp ca), "Giờ nghỉ đêm", "Làm bù", "OT ngày thường" và "OT cuối tuần" (hai số `m.otWeekdayPay`, `m.otWeekendPay`; bản chụp chưa chia thì một dòng "Tiền OT"), "OT ngày lễ" (dòng nhỏ: ngày của các ca có giờ lễ, `holidayShifts`), "Phụ cấp đi lại", "Phụ cấp chuyên cần" (khi loại nhân sự có phụ cấp chuyên cần hoặc số khác 0), các khối phụ cấp (`m.blocks`) và khoản điền thêm đã duyệt (`m.entries`, `direction:'deduct'` là khoản trừ), "Lương KPI". Các khoản trừ: bảo hiểm xã hội / y tế / thất nghiệp (hoặc một dòng "Bảo hiểm"), "Thuế TNCN", "Tạm ứng" ("Admin đã duyệt tạm ứng tháng này"). Dòng đầu nhóm là tổng thu nhập, dòng cuối "Thực nhận". Máy tính gọn thành "Thu nhập" và "Các khoản trừ" một dòng, mở "Xem cách tính" ra đủ dòng.

**Thẻ Phụ cấp chuyên cần** (`allowanceCard:372`, từ `allowanceStatus`): "Ngày đã nghỉ" `absentDays / maxAbsent` với câu "Nghỉ từ N ngày sẽ mất phụ cấp" khi `absentCompare` là `gte` và "Nghỉ quá N ngày sẽ mất phụ cấp" khi là `gt`; "Giờ vượt ngưỡng" `overLimitHours / overLimitThreshold` ("Từ" hoặc "Quá" theo `hoursLossStrict`); trạng thái Đang giữ / Đã giữ / Đã mất (`kept`). Thẻ chỉ hiện khi loại nhân sự có phụ cấp chuyên cần. Chức vụ không có lương KPI hoặc không đóng bảo hiểm có thẻ giải thích thay cho phần đó (`noBenefitCard`).

**Quy tắc máy chủ tạo ra các số trên** (`public/payroll-engine.js`, chi tiết ở `payroll-engine.md`):
- OT ngày thường: ngày có lịch trả hệ số `ot.rate` (mặc định 1,5); thứ Bảy, Chủ nhật nằm ngoài lịch của người trả hệ số `ot.weekendRate` (mặc định 2); OT tách theo ngày dân sự của từng phút. Ngày lễ: mọi giờ rơi vào ngày lễ là OT ngày lễ, hệ số `ot.holidayRate` (mặc định 3), giờ trong khung đêm cộng thêm phần phụ trội đêm ngày lễ; ca đêm sang ngày lễ tách theo ngày lịch; giờ nghỉ của ca rơi vào ngày lễ tính như giờ làm, không trả thêm giờ nghỉ đêm cho đúng các phút đó.
- Làm bù: giờ làm bù theo giờ đã duyệt trả đủ, hệ số 1, không bị cắt theo số giờ nợ; phần giờ làm bù rơi vào ngày lễ được cộng thêm `makeupHolPremium` = giờ làm bù ngày lễ × lương giờ × (`holiday.makeupRate` − 1), mặc định `holiday.makeupRate` = 3. Ngày có giờ làm bù được trả không có phụ cấp ca và không có giờ nghỉ đêm có lương; ngày có OT vẫn giữ phụ cấp ca và giờ nghỉ đêm. OT ngày thường chỉ tính khi trước ngày đó không còn giờ phải bù.
- Ngày công: ngày có Check-in/out hợp lệ (`attendance.missingAllRule` = `absent`): ngày khai đi làm mà không chấm công là nghỉ không phép; ngày đi làm lễ khai mà không chấm công là vắng, mất lương ngày lễ.
- Số ngày nghỉ xét chuyên cần (`finishMonth`): nghỉ phép + nghỉ không lương + nghỉ được duyệt (khi tham số tính) − khoản miễn + vắng + số dòng iSAT + ngày "Nghỉ, sẽ làm bù" chưa bù (nhỏ hơn giữa số ngày khai và làm tròn lên của giờ bù còn thiếu chia giờ mỗi công). Mất phụ cấp khi số ngày nghỉ chạm ngưỡng `type.<loại>.maxAbsent` (`attendance.absentCompare`) hoặc giờ vượt ngưỡng chạm ngưỡng giờ cộng `attendance.overLimitTolerance`, ngưỡng giờ là `type.<mã>.overLimitHours` của chức vụ nếu có, không thì `attendance.overLimitHours` (`attendance.overLimitCompare`). Phụ cấp đi lại và chuyên cần nhân với tỷ lệ ngày đi làm thực tế.
- Bảo hiểm theo ngày có lương: ngày có lương = ngày công + phép năm có lương + ngày lễ hưởng lương + iSAT hưởng lương; ngày không lương = ngày công chuẩn − ngày có lương (không âm). Từ `tax.insurance.skipDays` (mặc định 14, so `gte`) ngày không lương trở lên thì tháng đó không trừ bảo hiểm. Giữa tháng chưa đủ ngày có lương thì số bảo hiểm của tháng chưa bị trừ.
- Miễn thuế (`mienThueOf`): chỉ phần trả cao hơn lương giờ thường của cùng số giờ. Giờ đêm không phải ngày lễ: mỗi ngày không quá phụ cấp ca đã trả của ngày đó, cũng không quá `tax.exempt.nightPremium` × lương giờ × số giờ đêm; ngày không có phụ cấp ca thì giờ đêm không được miễn. OT ngày thường, OT cuối tuần, OT/làm lễ: mỗi nhóm miễn `min(tiền đã trả, mức luật của nhóm) − lương giờ × số giờ nhóm`, mức luật là `tax.exempt.otRate`, `tax.exempt.weekendRate`, `tax.exempt.holidayRate` (cộng phụ trội đêm lễ). Cộng thêm các khoản Admin điền/khối có cờ miễn thuế (toàn phần hoặc có trần); tổng miễn không vượt tổng thu nhập.
- Phép: quỹ phép mỗi năm hết hạn vào cuối tháng `leave.expiry.month` của năm sau; phần chưa dùng được quy tiền vào phiếu của tháng liền sau tháng hết hạn, rồi trừ khỏi số dư.
- Tạm ứng: `advance.rate` (mặc định 0,8) × lương cơ bản của các ngày đi làm từ đầu tháng tới `advance.untilDay` (mặc định 15); chỉ trừ vào thực nhận khi Admin đã duyệt.

**Công thức "Chi tiết" của phiếu** (`lib/slip-formulas.js`, in ở `public/admin/view-phieu.js`): chỉ có ở phiếu Admin (`payslip.formulas`; `lib/periods.js` bỏ trường này khi người xem là chính chủ, và `GET /api/me/estimate` không trả). Công thức chạy lúc đọc phiếu, không ghi DB. Mỗi số kèm tên hoặc đơn vị ngay sau (đ, ngày, giờ, đ/giờ, đ/ngày, tên dòng); số hạng cùng loại gộp thành một; số hạng triệt tiêu nhau bị bỏ; nhóm cộng trừ nằm trong ngoặc; công thức chỉ được giữ khi giá trị của nó bằng số tự tính của dòng (lệch không quá 1 đồng mỗi bước làm tròn), không khớp thì dòng đó không có công thức. Phiếu của nhân viên và bản in A4 không có công thức: mỗi ô tiền là một số đã cộng sẵn, các ô cộng lại đúng Thành tiền. Dòng ngày của phiếu Admin/A4 (`m.rows`) có ô "Vào – ra" in giờ Check-in/Check-out thật dạng `HH:MM` (bên nào thiếu thì in `--:--`), cho ngày đi làm, vắng, chờ xử lý và ngày giữ vì giải trình; trang nhân viên không hiện dòng ngày.

### 4.10 Yêu cầu và phép năm (`yeu-cau.js`)

- Danh sách yêu cầu của tháng từ `sheet.approvals` (`L.approvalList`): nhãn khoản (OT, Làm bù theo giờ, Nghỉ phép năm, Nghỉ được duyệt, Nghỉ, sẽ làm bù, iSAT, OT ngày lễ, Làm bù cả ngày (loại cũ)), trạng thái "Chờ xử lý" / "Đã đồng ý" / "Đã từ chối", lý do từ chối ("Admin chưa ghi lý do" nếu trống); chờ xử lý xếp trước. Với "Nghỉ, sẽ làm bù" hiện các ngày bù, với OT ngày lễ hiện khung giờ.
- Thẻ Phép năm: số dư `balance`, "Được cộng", chi tiết cộng (theo tháng làm việc, thâm niên, cấp Nhân viên mỗi 12 tháng, sinh nhật, điều chỉnh; dòng bằng 0 hoặc không có thì bỏ), "Đã dùng", "Tính đến <ngày>" từ `sheet.leaveBalance` (số tính đến hôm nay); sổ phép từ `GET /api/leave/ledger` hiện tối đa `LEDGER_SHOWN` = 12 dòng mới nhất, nhãn "Cộng khi vào làm", "Tròn tháng làm việc", "Tròn năm làm việc", "Thâm niên", "Sinh nhật", "Hết hạn". Khi có `expiring`, ghi chú "N ngày sẽ được quy ra tiền vào lương tháng M nếu chưa dùng trước <ngày hết hạn>"; tháng M là tháng liền sau ngày hết hạn.
- Chỉ có thẻ khi chức vụ có tài khoản phép (`hasLeaveAccount`).

### 4.11 Tạm ứng (`ung-luong.js`)

- Nút "Xin tạm ứng" (trong danh sách nút tạo yêu cầu) chỉ hiện khi `item.eligible` và tháng này chưa xin; nhân viên không nhập số tiền. Số tạm ứng theo quy tắc ở 4.9 do máy chủ tính (`amount`); khay xác nhận chỉ có nút "Huỷ" và "Gửi yêu cầu".
- Trạng thái: chưa xin → `pending` ("Chờ Admin duyệt") → `approved` ("Admin đã duyệt") hoặc `rejected` ("Admin từ chối", kèm lý do); `pending` rút lại được ("Rút yêu cầu"). Chỉ trừ vào thực nhận của tháng khi đã duyệt.
- Không hiện nút và thẻ khi hồ sơ tắt tạm ứng, chức vụ không được ứng, ở chế độ khai thay, hoặc máy chủ trả 404/403. Kỳ `approved`/`paid` thì máy chủ từ chối ghi.

### 4.12 Giải trình (`giai-trinh.js`)

- Hai việc: trả lời yêu cầu giải trình do Admin hoặc AI gửi (loại `admin`, `ai`), và giải trình Check-out muộn (`late-checkout`, gửi kèm lần bấm Check-out). Nội dung tối đa 500 ký tự, bắt buộc không rỗng.
- Trạng thái dùng đúng chữ của chấm công: `requested` và `answered` là "Chờ xử lý", `approved` là "Được phê duyệt", `rejected` là "Bị từ chối". Hiển thị tối đa 20 dòng; dòng ở trạng thái `requested` có nút "Giải trình".
- Ghi chú trên dòng: giải trình chưa duyệt (`requested`, `answered`) thì "Ngày này chưa tính công cho tới khi Admin duyệt giải trình"; bị từ chối thì "Ngày này không tính công". Với Check-out muộn: giờ bấm chưa được tính, lượt ở nhãn Chờ xử lý (hoặc Bị từ chối); được duyệt thì giờ bấm là giờ Check-out và được tính.
- Hiệu lực khi Admin duyệt (phía máy chủ, `lib/domain/explanation/routes.js`): giải trình ngày quên Check-in/out được duyệt thì ngày tính một công theo giờ ca như Admin ghi; giải trình ngày bị từ chối thì ngày không tính công; giải trình trễ/sớm được duyệt thì làm tròn theo luật hiện hành; chưa duyệt hoặc bị từ chối thì ngày không tính lương.

### 4.13 Chế độ khai thay (`thay.js`)

- Vào bằng `?thay=<username>&month=YYYY-MM`. Người đăng nhập cần ít nhất một cap bắt đầu bằng `request.decide.` (`canThay`); không đủ quyền thì Admin về `admin.html`, nhân viên thường bỏ tham số và ở trang của mình (`boot.js`).
- `S.me` là hồ sơ người được khai (`owner` của `GET /api/sheet?user=`); quyền lợi chức vụ lấy từ `GET /api/positions` (thiếu `config.read` thì rơi về mặc định); người ngoài bảng lương thì báo lỗi.
- Không có Check-in/out, tab Hôm nay và Tôi, tạm ứng, sổ phép; số thu nhập lấy từ `/periods/:m/estimates/:u` và đổi về dạng `/me/estimate` (`asEstimate`).
- Lưu bằng `PUT /api/sheet` kèm `user`, không gửi KPI; khoản người khai có quyền duyệt được duyệt luôn (`thayCanDecide`); băng đầu trang có nút "Về trang Admin".
- Mất quyền duyệt giữa chừng (tin `roles.changed`) thì rời chế độ này.

### 4.14 Hằng số giao diện viết cứng (không phải tiền)

`TIMEOUT_MS` 20000; toast lỗi 6 giây, cảnh báo 8 giây, thường 3,5 giây (tối đa 3 dòng cảnh báo, sau đó "(và N cảnh báo khác)"); `ATTEMPT_TTL_MS` 2 giờ; định vị 15 giây; nhịp 15 giây (`views.js NV.tick`); `LIVE` = `{ retryMs 4000, maxFails 3, coalesceMs 400, busyRetryMs 600, deferPollMs 1000 }`; `LEDGER_SHOWN` 12; giờ chào hỏi đổi lúc 5, 11, 13, 18 giờ (`logic.js greeting`); `fmtDistance` dưới 1000 hiện m, từ 1000 hiện "~x,x km".

Nhịp 15 giây (`NV.tick`): cập nhật giờ trên nút và số phút đã làm; khi qua ngày thì nạp lại toàn bộ; khi lượt mở vượt `openSessionMaxHours` thì nạp lại một lần để máy chủ đóng lượt (lượt thành Chờ xử lý). Trang cũng nạp lại khi tab hiện lại (`visibilitychange`).

---

## 5. Realtime và nhật ký

### 5.1 SSE `GET /api/events` (`live.js`; phát từ `lib/events.js` dòng 20-60 và 263-320)

Tin SSE chỉ là **gợi ý nạp lại**. Client không lấy số liệu từ payload, trừ phần chữ của toast.

| Sự kiện | Client làm gì (`live.js`) |
| --- | --- |
| `hello {epoch, …}` | `epoch` khác lần trước → coi như `resync` |
| `resync` | nạp lại tất cả |
| `bye {reason}` | `reason` thuộc `stopReasons` (`superseded`) → dừng; còn lại gọi `/api/me` kiểm tra phiên (đăng xuất / đổi mật khẩu trên máy khác: hết phiên thì về trang đăng nhập, còn phiên thì nối lại) |
| `punch.changed`, `punch.corrected` | nạp `punch` và lịch tháng |
| `request.decided {month, date, decision, kind?}` | nạp lịch, số thu nhập, tạm ứng; toast theo `decision` ("Admin đã đồng ý / từ chối yêu cầu ngày dd/mm", hoặc câu chung); `kind:'advance'` → câu về tạm ứng (duyệt, huỷ duyệt, cập nhật) |
| `estimate.changed` | lịch, số thu nhập, tạm ứng |
| `payslip.available`, `period.changed` | số thu nhập |
| `params.changed` | nạp tất cả |
| `roles.changed` | `/api/me` |
| `approvals.changed`, `attendance.changed` | **chỉ ở chế độ khai thay**: lịch và số thu nhập |
| lỗi với `readyState === 2` | kết nối lại, chờ lâu dần, tối đa `maxFails` lần |

Cách gộp: các tin trong 400 ms được gộp thành một kế hoạch nạp (mỗi phần một lần). Chỉ nạp lại tháng đang xem (`S.month`, và tháng hiện tại khi không ở chế độ khai thay); tháng khác chỉ bị đánh `stale` và nạp khi mở. Đang bấm Check-in/out thì chờ xong mới nạp; đang mở khay hoặc đang gõ trong biểu mẫu thì nạp nhưng hoãn vẽ, vẽ khi đóng khay hoặc rời ô nhập.

### 5.2 Nhật ký (audit) do thao tác của nhân viên sinh ra (phía máy chủ)

`password.change`; `kpi.score`; `advance.request`, `advance.withdraw`; `explanation.answer`, `explanation.late-checkout`; `checkout.late.apply`/`checkout.late.revert` (khi Admin duyệt); thao tác `PUT /sheet` và `POST /punch` đi qua các module approvals/attendance. Trang nhân viên không đọc audit.

---

## 6. Phụ thuộc

### 6.1 Trang nhân viên gọi vào

- Module dùng chung: `PunchRules` (`public/punch.js`, nhận `PayrollParams.DEFAULTS`), `AttendanceStatus`, `ApprovalView` (`itemOf`, `SCHEDULE`), `PayrollParams.DEFAULTS`, `KpiScore` (`checkScore`, `COMPONENTS`), `WorkSchedule`, `HomeRoute`. `LeaveRules` (`leave.js`) và `ActualHours` (`actual-hours.js`) được nạp nhưng mã trang nhân viên không dùng.
- Máy chủ: các handler trong `server.js` (`/me`, `/sheet`, `/punch`, `/kpi/scores`, `/password`, `/login`, `/logout`, `/me/estimate`, `/events`); `lib/domain/advance/*`, `lib/domain/explanation/*`, `lib/domain/leave/routes.js`, `lib/periods.js estimate`, `lib/domain/sheet-checks.js`, `lib/domain/isat-rule.js`, `lib/domain/attendance/session-status.js`, `lib/approvals.js`, `lib/domain/kpi.js` (`kpiPartsView`), `lib/domain/geofence.js`, `lib/attendance-sessions.js`.

### 6.2 Những nơi khác dùng mã của trang nhân viên

- `logic.js` chạy trong Node cho test (`test/ui/*`, `test/unit/*`).
- `home-route.js` được trang đăng nhập, `boot.js`, `thay.js` và `live.js` dùng.
- `public/punch.js`, `approval-view.js`, `attendance-status.js`, `payroll-params.js`, `kpi-score.js` dùng chung với máy chủ và Admin.

### 6.3 Đổi X thì phải kiểm tra Y

| Đổi | Kiểm tra |
| --- | --- |
| Tên trường phản hồi `GET /api/sheet` (`server.js:760`) | `data.js loadMonth`/`putSheet`, `logic.js buildMonth`/`describeDay`/`setScheduleInfo`, `parts.js`, `khai.js`, `yeu-cau.js` (`leaveBalance`), `thay.js thayOwner` (`OWNER_KEYS`) |
| Hình dạng `days[date]` hoặc `DAY_KINDS`/`cleanDays` | `logic.js dayPlan`/`formFromDay`/`dayFromForm`, `ApprovalView.itemOf` (fingerprint: đổi thì khoản duyệt cũ về chờ duyệt), `khai.js` |
| Câu trong `sheet-checks.js` (làm bù ngày lễ) | `logic.js checkDayForm` lặp lại câu đó |
| `PERIOD_ORDER`/trạng thái kỳ, `SCOPE_LOCKED_FROM` | `thu-nhap.js STATE_TEXT` |
| `warnings[]` (`lib/warnings.js`) | `core.js showWarnings`, `data.js applyMe` |
| Câu chữ `checkInMsg` trong `PunchRules` | `logic.js punchView`, vì `windowFrom`/`windowTo` được bóc từ câu này bằng regex |
| Bảng ca, `earlyCheckinMaxHours`, `openSessionMaxHours` trong registry | máy chủ đổi theo tháng, trình duyệt vẫn dùng `DEFAULTS`: kiểm `punchView`, `shiftInfo`, `forgotOut` |
| Mã lỗi `POST /api/punch` (`CHECKOUT_NEEDS_EXPLANATION`, `CHECKIN_NOT_ALLOWED`, `GEO_*`) | `nhan-vien/punch.js doPunch`, `logic.js geoServerError`, `giai-trinh.js askLateExplanation` (`sessionId`, `lateMin`, `graceMin`) |
| Mã trạng thái lượt (`session-status.js`) | `attendance-status.js` (`LABEL`, `DAY_ORDER`, `TONE`), `logic.js primaryOf`, `parts.js` (`LEGEND`), `giai-trinh.js` |
| Khoá trong `trace`/`m`/`net`/`allowanceStatus` của engine | `thu-nhap.js linesOf`/`kpiLine`/`daysSub`/`allowanceCard` |
| Tên sự kiện SSE hoặc payload `request.decided` | `live.js` (bảng handler, `isAdvance`) |
| `ROLE_CAPS`, `ADMIN_CAPS`, cap `request.decide.*` | `home-route.js`, `boot.js`, `thay.js canThay` |
| `myPosition.benefits` / cờ quyền lợi chức vụ | `logic.js benefitsOf`, `hasLeaveAccount`, `dayPlan`, `yeu-cau.js actionList` |
| Đường dẫn trang đăng nhập | `home-route.js LOGIN_PAGE`, `core.js` (401), `views.js` (logout) |
| `kpiPartsView`, `kpi.weight.*` | `khai.js kpiCard`/`kpiFive`, `logic.js kpiParts` |
| `GET /api/leave/ledger` hoặc `leaveBalanceView` (`server.js:313`) | `yeu-cau.js` (`BREAKDOWN`, `LEDGER_LABEL`) |
| `checkInVerdict` (`server.js:282`) | `logic.js punchView` (`blocked`), `parts.js shiftCardBody` |

---

## 7. Test hiện có

Test liên quan trực tiếp tới trang nhân viên và đăng nhập (tên file bắt đầu bằng ngày ở nhiều file được viết là `*-tên`):

- `test/ui/attendance-labels.test.js` (sáu nhãn trên màn nhân viên và Admin)
- `test/ui/day-kind-options.test.js` (danh sách loại ngày không có `makeup`; ngày loại cũ hiện và gửi lại đúng giờ)
- `test/ui/isat-only-saturday-entitled.test.js`
- `test/ui/staff-self-requests.test.js`, `test/ui/staff-holiday-ot-request.test.js`
- `test/unit/*-nhan-vien-punch-luu-request-id.test.js`, `test/unit/holiday-row-display.test.js`, `test/unit/schedule-copies.test.js`, `test/unit/day-picker-no-makeup.test.js`
- `test/unit/attendance-status.test.js`, `test/unit/session-status.test.js`, `test/unit/*-session-status-day-explanation.test.js`
- `test/unit/checkin-blocked-on-off-day.test.js`, `test/api/staff-checkin-gate.test.js`, `test/api/checkin.test.js`
- `test/unit/approval-view-holiday-ot.test.js`, `test/unit/approval-view-leave.test.js`, `test/api/approvals-holiday-work.test.js`, `test/api/*-holiday-ot-entry.test.js`
- `test/api/*-explanation-rejected-no-workday.test.js`, `test/api/*-explanation-forgot-punch-approved.test.js`, `test/api/*-explanation-late-early-approved.test.js`, `test/api/*-held-day-row-punch-times.test.js`
- `test/api/*-advance-approval.test.js`, `test/unit/advance-approved-month.test.js`
- `test/unit/leave-year-settlement.test.js`
- `test/api/agents-toggle.test.js`, `test/api/*-dang-nhap-tai-khoan-khoa.test.js`, `test/api/mvp-auth.test.js`
- `test/api/mvp-fixes.test.js` (trang chủ và file trong `public/` đọc được, `/index.html` trả 404), `test/api/sandbox.test.js` (cũng kiểm `/index.html` → 404), `test/api/web-dist-static.test.js`
- `test/unit/slip-real-punch-times-ui.test.js`, `test/unit/slip-detail-formulas-ui.test.js`

---

## 8. Điểm lệch giữa giao diện và máy chủ

Chỉ ghi nhận hành vi hiện có của code.

| # | Ở đâu | Lệch gì |
| --- | --- | --- |
| 1 | `public/punch.js` (`create(DEFAULTS)`); `logic.js punchView`; `server.js punchExtras` | Trình duyệt tính giờ ca, khung Check-in (4 giờ trước giờ vào) và quá hạn quên Check-out (16 giờ) theo `PayrollParams.DEFAULTS`, còn máy chủ dùng `rulesFor(month)`. Máy chủ gửi `shiftConfig` nhưng client không đọc. `lateMin` của lượt đang mở lấy theo bảng ca mặc định theo mã ca, `earlyMin` lấy theo `planned.startIso` |
| 2 | `parts.js shiftCardBody`, `logic.js punchView` vs `server.js` `POST /punch` | Nút Check-in ngoài khung ca bấm được (`warnIn`) khi máy chủ không báo `checkInBlock`, nhưng máy chủ từ chối ngoài khung ca không có khoản đã duyệt phủ giờ bấm (409 `CHECKIN_OUTSIDE_SHIFT`, attendance.md 3.2b) và báo `checkInBlock` nên nút tắt kèm câu của máy chủ |
| 3 | `logic.js benefitsOf` vs `lib/domain/positions.js sheetFlagsOf` | Giao diện dùng cờ `makeup` cho giờ làm bù; máy chủ kiểm riêng `makeupHours`, `absenceDeclarable`, và OT ngày lễ theo cờ `ot` |
| 4 | `logic.js dayPlan` vs `lib/domain/isat-rule.js` | iSAT viết cứng `dow === 6`; máy chủ dùng tham số `isat.weekday` |
| 5 | `logic.js checkDayForm` vs `sheet-checks.js` | Client chặn làm bù vào ngày lễ cả với ngày đã lưu không đổi hoặc ngày kế hoạch cũ; máy chủ chỉ chặn ngày mới hoặc ngày được sửa trong lần lưu này |
| 6 | `core.js:142`, `views.js:333` vs `home-route.js` | Đường dẫn `/dang-nhap.html` viết cứng ở hai chỗ thay vì dùng `HomeRoute.LOGIN_PAGE` |
| 7 | `logic.js buildMonth` vs `server.js actualReportView` | Client tự cộng `missing`/`absent`/`lateMin` của tháng từ `actualReport.report`, không dùng các tổng `missing`, `absent` máy chủ cũng gửi |
| 8 | `thu-nhap.js homePayCard` | So **tổng** phút muộn trong tháng với mức `graceMin` áp cho **từng lần** để chọn câu "Đến N phút nên không bị trừ lương" |
| 9 | `yeu-cau.js` (`NV.leave`, `loadLedger`); `lib/domain/leave/routes.js` | Số dư phép lấy từ `sheet.leaveBalance` (tính lúc gọi), lịch sử lấy từ `GET /leave/ledger` (số đã lưu), hai nguồn có thể không khớp tức thời; `GET /leave/ledger` còn ghi dữ liệu (`leave.refresh`) |
| 10 | `yeu-cau.js BREAKDOWN` | Không hiện phần `start`; có các khoá dự phòng (`monthDays`, `seniorityDays`, `nvDays`, `levelYears`, `nv`, `birthdayDays`) mà máy chủ không gửi |
| 11 | `yeu-cau.js leaveExpiring`, `thu-nhap.js noBenefitCard`, `logic.js greeting` | Số và câu viết cứng: tháng trả tiền phép dự phòng là tháng 2 và ngày hết hạn dự phòng cuối tháng 1; "hợp đồng dưới 3 tháng"; giờ chào hỏi 5, 11, 13, 18 |
| 12 | `live.js isAdvance` | Các nhánh dự phòng `type`/`item`/`amount` không bao giờ xảy ra vì máy chủ chỉ gửi `kind:'advance'`; tạm ứng bị `rejected` nhận câu toast chung "Admin đã cập nhật tạm ứng của bạn" |
| 13 | `khai.js kpiFive` vs `lib/domain/kpi.js kpiPartsView` | Khi chưa đủ điểm, máy chủ chỉ gửi phần `self` của chính người xem nên các thành phần còn lại luôn hiện "Chờ Admin chấm" |
| 14 | `nhan-vien/punch.js doPunch`, `parts.js shiftCardBody` vs `lib/domain/geofence.js geofenceView` | `S.geofence` và phần tính khoảng cách là nhánh không bao giờ chạy với nhân viên: máy chủ chỉ gửi `geofence` cho role admin, mà tài khoản admin bị chuyển khỏi trang nhân viên |
| 15 | `public/nhan-vien.html` | `leave.js` và `actual-hours.js` được nạp nhưng mã trang nhân viên không gọi |
| 16 | `thay.js prepareThay`, `thayEstimate` vs `lib/authz.js` | `GET /positions` cần `config.read` và `GET /periods/:m/estimates/:u` cần `payroll.view` phạm vi tất cả; người duyệt vai hr/manager vào chế độ khai thay có thể bị 403: UI rơi về quyền lợi `DEFAULTS` hoặc báo lỗi phiếu. Quyền lợi trong danh sách chức vụ cũng bỏ qua phần ghi đè theo bậc |
| 17 | `logic.js` (`KIND_LABEL`, `primaryOf`) vs `server.js DAY_KINDS` | UI xử lý loại `noshow`, nhưng máy chủ không bao giờ lưu loại này |
| 18 | `data.js putSheet` | Mỗi lần lưu đều `GET /sheet` lại trước khi `PUT`, kể cả khi đã có `baseRev`; `baseRev` trống thì dùng `fresh.rev` nên không phát hiện được ghi đè xảy ra giữa lúc mở biểu mẫu và lúc bấm lưu |
| 19 | `khai.js` (regex điểm KPI) vs `public/kpi-score.js checkScore` | Điều kiện điểm KPI (0–100, 2 chữ số thập phân) được viết lại bằng regex thay vì gọi `KpiScore.checkScore` |
| 20 | `logic.js punchView` (`windowFrom`/`windowTo`) | Giờ khung Check-in được bóc từ câu tiếng Việt của `checkInMsg` bằng regex; đổi câu thì mất hiển thị khung giờ |
