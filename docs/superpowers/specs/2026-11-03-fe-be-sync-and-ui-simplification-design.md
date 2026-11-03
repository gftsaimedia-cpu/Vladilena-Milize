# Thiết kế đồng bộ FE–BE và tinh gọn UI/UX — 2026-11-03

**Căn cứ:** Khảo sát mã nguồn `web/src/**` và `src/modules/**` (cập nhật vòng 2 tại commit `2d543e4` sau khi gộp `codex/postgres-normalization`), kết hợp với [AUDIT-2026-11-02.md](../AUDIT-2026-11-02.md) và [2026-11-02-remediation-design.md](2026-11-02-remediation-design.md).

## 1. Mục tiêu (Intent & Goals)

1. **Đồng bộ hợp đồng FE–BE:** Khắc phục triệt để các điểm lệch giữa giao diện Vue (`web/src`) và backend NestJS (`src/modules`), xoá bỏ các nhánh dữ liệu giả (`fromMock`, `mockSave`), các kịch bản mẫu gán cứng (`month === '2026-11'`, `?kb=`) và tàn dư luồng duyệt từng phiếu/AI cũ.
2. **Tinh gọn kiến trúc thông tin (Information Architecture):** Gom các luồng bị xé lẻ hoặc trùng lặp (đặc biệt ở cụm Chấm công & phép), gỡ bỏ các tab "Sắp có" / tab rỗng và các nút khoá cứng gây hiểu nhầm.
3. **Giảm nhiễu thị giác (Visual Declutter):** Cắt bỏ các tầng văn bản thuyết minh quy tắc lặp đi lặp lại trên mặt giao diện, rút gọn cột/dòng thừa trên **Bảng chấm công**, **Hộp chi tiết ngày**, **Bảng lương** và **Đánh giá KPI** để người vận hành thấy ngay dữ liệu và thao tác chính.

### Non-Goals & Anti-Goals
- **Không** thay đổi công thức tính lương, luật chấm công hay lược đồ cơ sở dữ liệu PostgreSQL.
- **Không** thiết kế lại bộ màu sắc/typography (`styles/tokens.css`) hay viết lại từ đầu bằng thư viện UI khác.
- **Không** dùng từ bị cấm trong `test/unit/no-tam-tinh-text.test.ts`.

## 2. Các hướng tiếp cận (Approaches)

| Hướng | Mô tả & Đánh đổi |
| --- | --- |
| **1. Chỉ sửa chữ & ẩn bớt CSS trên từng màn** | Nhanh nhưng giữ nguyên các tab chết (`sua-gio`, `OKR Sắp có`), giữ nguyên kịch bản cứng `2026-11` và các lỗi lệch FE–BE. Không giải quyết được gốc rễ sự rườm rà. |
| **2. Đồng bộ FE–BE trước, sau đó gộp tab thừa và cắt gọn tầng hiển thị trên khung Vue hiện có (Đề xuất)** | Sửa dứt điểm các điểm lệch API/builder (Bảng lương, Chấm công, Check-in Desktop), chuyển hướng các tab trùng (`sua-gio`, `ca-lam`) về đúng màn chức năng, và rút gọn mật độ thông tin trên Bảng công, Bảng lương, KPI, Thanh kỳ lương. Giữ nguyên hệ thống component và CSS token hiện có nên an toàn, dễ kiểm thử từng bước. |
| **3. Đập đi viết lại toàn bộ `web/src`** | Khối lượng quá lớn (140+ file Vue), rủi ro làm gãy các luồng đã chạy ổn định (Cài đặt tham số, Phân quyền, In phiếu A4). Không chọn. |

## 3. Chi tiết thiết kế Chặng 1: Đồng bộ hợp đồng FE–BE

### 3.1. Luồng Bảng lương & Duyệt kỳ (sau G9)
- **Gỡ kịch bản gán cứng tháng `2026-11`:** Trong `web/src/views/admin/payroll/scenarios.ts` và `web/src/views/admin/payroll/PayrollView.vue`, xoá nhánh `if (month === '2026-11')` và logic ép `wide.value` theo `2026-11`. Mọi tháng đều hiển thị nút hành động (`Chốt công`, `Tính lương`, `Phê duyệt kỳ lương`, `Đánh dấu đã trả lương`) và thẻ *Khoản cộng/trừ thêm* dựa trên `period.status` thực tế từ backend (`GET /api/periods/:month`).
- **Sửa câu chữ cứng trong `scenarios.ts`:**
  - Bỏ đuôi `/2026` gán cứng ở `da-chot-cong` (`closedAt` đã có ngày/tháng).
  - Bỏ câu giả `'Tạm ứng của 1 phiếu đã được sửa về 0.'` ở `can-tinh-lai`.
  - Chỉ nối `· đã qua hạn chốt công ${f.deadline}` khi `f.deadline` không rỗng.
- **Đồng bộ duyệt cả kỳ (`ApprovePeriodDialog.vue` & `admin-payroll.ts`):**
  - `buildPeriodView` (`web/src/builders/admin-payroll/payroll.ts`): tách `facts.draft = t.draft` và `facts.pending = t.pending` (không cộng `t.draft` vào `facts.pending` để chặn duyệt kỳ); tổng số phiếu chưa duyệt hiển thị ở chip lọc là `facts.unapproved = t.pending + t.draft`.
  - `ApprovePeriodDialog.vue` không chặn nút *Phê duyệt kỳ lương* khi chỉ còn phiếu `draft` (bản nháp sẽ được backend tự duyệt khi khoá kỳ).
  - Bổ sung `getPeriodApprovalSummary(month)` trong `web/src/services/admin-payroll.ts`: tải `GET /api/periods/:month` và toàn bộ phiếu lỗi qua `GET /api/periods/:month/payslips?status=error&pageSize=200` (lặp đủ các trang) để lấy danh sách `{ username, name, shortProblem }` trên toàn kỳ thay vì chỉ trang đang mở.
  - `approvePeriod(month, { rev, excludeErrors })` gửi `POST /api/periods/:month/approve` với body `{ rev, excludeErrors }` (trong đó `excludeErrors: Array<{ username: string; reason: string }>`).
  - Gỡ bỏ cơ chế chọn từng phiếu và duyệt lô trên bảng lương (`SelectionBanner.vue`, `ApproveBatchDialog.vue`, `approveBatch`, `approveOne` trong luồng bảng lương), thống nhất duyệt theo kỳ như thiết kế G9.
- **Đồng bộ Ngăn kéo Phiếu lương (`web/src/builders/payslip/drawer.ts` & `PayslipDrawer.vue`):**
  - Sau G9, phiếu mới tính có `status = 'draft'` và backend `store.payroll.decidePayslips` cho phép duyệt trực tiếp phiếu `'draft'`. Sửa `canApprove` trong `buildDrawer` thành `(kind === 'draft' || kind === 'pending') && slip.status !== 'error' && period.status !== 'approved' && period.status !== 'paid'` để nút *Phê duyệt riêng* hiển thị đúng trên phiếu bản nháp.
  - Khi `slip.status === 'draft'`, không đẩy trùng 2 pill `"Bản nháp"` và `"Bản nháp · lần tính N"` cạnh nhau; chỉ hiển thị 1 pill `"Bản nháp · lần tính N"` (hoặc `"Bản nháp"` nếu không có `runNo`).

### 3.2. Luồng Chấm công, Tổng quan, Sửa giờ & OT
- **Truyền đủ dữ liệu khi sửa giờ trong `DayDetailDialog.vue`:**
  - Khi Admin sửa giờ vào/ra trong `DayDetailDialog.vue`, `saveTimeFix({ personId, date, checkIn, checkOut, shift, reason })` gửi kèm `reason` trong body `PUT /api/sheet` (hoặc ghi chú ngày) theo đúng hợp đồng của `src/modules/sheet/sheet.controller.ts` để nhật ký kiểm toán lưu được lý do sửa giờ.
- **Nối chức năng duyệt/từ chối cho tab Giờ OT (`OvertimeView.vue`):**
  - Bổ sung `decideOvertime({ sessionId, version, action, reason })` trong `web/src/services/admin-attendance.ts` gọi `PUT /api/ot` (`{ sessionId, version, status: action === 'approve' ? 'approved' : 'rejected', reason }`).
  - `buildOvertime` giữ `sessionId` và `version` trên từng dòng để Admin có thể bấm *Đồng ý* / *Từ chối* ngay trên bảng `OvertimeView.vue` khi `status === 'pending'`.
- **Đồng bộ liên kết và bộ đếm ở Tổng quan Admin (`web/src/builders/admin-main/overview.ts`):**
  - Mục `forgot` (*Ngày quên Check-in/out chờ xử lý*) đổi đích từ `/admin/cham-cong/sua-gio` sang `/admin/cham-cong?filter=pending`.
  - Mục `open` (*Lượt Check-in còn đang mở*) đổi đích sang `/admin/cham-cong/hom-nay`; mục `start` trỏ `/admin/nhan-su?loc=thieu-ngay`; mục `noshift` trỏ `/admin/nhan-su?loc=chua-co-ca`.
  - Trong `staffFigures(staff)`, chỉ đếm thiếu ngày bắt đầu làm (`noStart`) với nhân sự thuộc chức vụ bắt buộc có ngày bắt đầu (`s.type !== 'tts'`), khớp với `staff.ts` và `periods.ts`.
- **Dọn các hàm mock không còn dùng:**
  - Xoá `getTimeFixRequests` (dùng `fromMock`) trong `web/src/services/admin-attendance.ts`.
  - Xoá `changePassword` và `logout` giả (dùng `mockSave`) trong `web/src/services/admin-main.ts` (mọi màn đã dùng `web/src/services/session.ts`).
  - Xoá import `mockSave` thừa trong `web/src/services/payslip.ts`.

### 3.3. Đồng bộ giao diện Nhân viên trên máy tính (`staff-desktop`) và điện thoại (`staff-phone`)
- **Check-in GPS trên máy tính (`web/src/services/staff-desktop.ts`):**
  - Trong `staffCheck(kind, explanation)`: khi `type === 'in'`, kiểm tra `me.geofenceRequired` (từ `GET /api/me`); nếu bật thì lấy vị trí qua `navigator.geolocation` và gửi `body.location = { lat, lng, accuracy }` giống hệt `punch()` trong `web/src/services/staff-phone.ts`.
  - Đọc thống nhất `state.open?.id || state.openSession?.id` khi `type === 'out'`.
- **Sửa tên trường phút đi trễ và phút bị trừ trên điện thoại (`web/src/builders/staff-phone/{home,attendance}.ts`):**
  - Backend `src/engine/actual-hours.ts` trả số phút đi muộn mỗi ngày ở trường `report[date].late` (không phải `lateMin`). Sửa `home.ts` và `attendance.ts` đọc `r.late ?? r.lateMin` để hiển thị đúng tổng phút đi trễ và giữ đủ 3 cột thống kê trên `AttendanceView.vue`.
  - Trong `attendance.ts`, trường `m.cut` của `src/engine/payroll-engine.ts` là **số tiền bị trừ (VNĐ)** chứ không phải số phút. Sửa ô thống kê thứ 3 tính tổng số phút bị trừ từ `Math.round((Number(m.short) || 0) * 60)` (hoặc tổng `cutStartMin + cutEndMin + gapCutMin` trong `actualReport.report`) để không hiển thị số tiền VNĐ dưới nhãn `"Phút bị trừ"`.

## 4. Chi tiết thiết kế Chặng 2: Tinh gọn UI/UX

### 4.1. Cụm Chấm công & phép (`AttendanceShell`, `TimesheetView`, `DayDetailDialog`)
1. **Rút gọn 6 tab xuống 4 tab thực chất:**
   - Giữ 4 tab vận hành thật: **Bảng công** (`/admin/cham-cong`), **Hôm nay** (`/admin/cham-cong/hom-nay`), **Giờ OT** (`/admin/cham-cong/gio-ot`), **Phép còn lại** (`/admin/cham-cong/phep-con-lai`).
   - Hai đường dẫn cũ `/admin/cham-cong/sua-gio` và `/admin/cham-cong/ca-lam` chuyển thành `redirect` trong `web/src/router/routes/admin-attendance.ts`:
     - `sua-gio` → redirect về `{ path: '/admin/cham-cong', query: { ...to.query, filter: 'pending' } }`.
     - `ca-lam` → redirect về `{ path: '/admin/nhan-su', query: { ...to.query, loc: 'chua-co-ca' } }`.
   - Sửa liên kết "Quên Check-in/out trong tháng" trong `BellPopover.vue` trỏ về `/admin/cham-cong` thay vì `/admin/cham-cong/sua-gio`.
   - Thay nút `<button class="btn off" disabled>Chốt công</button>` trên `AttendanceShell.vue` bằng `<RouterLink class="btn" :to="{ path: '/admin/bang-luong', query: { thang: route.query.thang } }">Sang Bảng lương để chốt công</RouterLink>`.
2. **Làm gọn Bảng chấm công (`TimesheetView.vue` & `builders/admin-attendance/timesheet.ts`):**
   - **Cột Nhân sự:** Không lặp lại khung giờ ca (`08:00–17:30`) ở từng dòng. Dòng phụ `.s` chỉ hiển thị gọn `TTS · Ca HC` (tên ca ngắn), còn khung giờ chi tiết đưa vào thuộc tính `title` (tooltip khi di chuột). Thu gọn bề rộng cột Nhân sự từ `244px` xuống `200px` để dành không gian cho các cột ngày.
   - **Bỏ câu giải thích dài ở `.card-h .cap`:** Chỉ giữ khoảng ngày `01/MM – DD/MM`.
   - **Gộp thanh chú giải (`.legend`) gọn vào góc phải hoặc chân bảng** với nhãn ngắn gọn (`Đang làm`, `Đủ công`, `Chờ xử lý`, `Từ chối`).
   - Hỗ trợ nhận query `?filter=pending` từ URL để khi bấm từ Chuông hoặc Tổng quan sang sẽ lọc ngay những người có ngày chờ xử lý.
3. **Làm gọn Hộp chi tiết ngày (`DayDetailDialog.vue`):**
   - Bỏ dòng `.pun` lặp lại giờ bấm gốc lần thứ 3 ở dưới mỗi thẻ lượt chấm công; gộp trạng thái và giờ vào/ra, số phút trễ, OT, kết quả công trên một bố cục 2 hàng gọn gàng.
   - Bỏ hộp `.note` thuyết minh dài dòng ở cuối form sửa giờ.

### 4.2. Khung Admin chung, Yêu cầu, KPI & Màn Nhân viên trên điện thoại
1. **Thanh kỳ lương (`PeriodStrip.vue` & `AdminLayout.vue`):**
   - Chỉ hiển thị dải 5 bước kỳ lương (`Chấm công → Chốt công → Tính lương → Phê duyệt → Trả lương`) trên các màn thuộc chu kỳ lương (`meta.nav` thuộc `['tong-quan', 'cham-cong', 'kpi', 'luong']`).
   - Ở các màn `duyet` (Yêu cầu), `ho-so` (Nhân sự), `cai-dat` (Cài đặt), ẩn dải 5 bước (`.steps`), chỉ giữ bộ chọn tháng (`.mpick`) và nút chuông thông báo (`.bell`) để đầu trang thoáng và đúng ngữ cảnh.
2. **Màn Yêu cầu Admin (`RequestsView.vue` & `GroupClean.vue`):**
   - Đổi tiêu đề thẻ `"Không có cảnh báo"` (tàn dư từ thời còn nhóm cảnh báo AI) thành `"Yêu cầu chờ xử lý"`.
   - Thêm nút **"Đồng ý"** lẻ ngay trên từng dòng bên cạnh nút **"Từ chối"** trong `GroupClean.vue` (emit `@approve="approve"`), giúp Admin duyệt nhanh 1 yêu cầu mà không phải bỏ chọn toàn bộ các dòng khác.
3. **Màn Đánh giá KPI (`KpiShell.vue`):**
   - Xoá tab chết `<span class="tab" aria-disabled="true">OKR <small>Sắp có</small></span>`.
   - Gộp dải công thức trọng số 5 cột khổng lồ (`.wts`) thành một dòng tóm tắt gọn ngay trong phần phụ đề hoặc thanh chip nhỏ, giữ lại 4 thẻ chỉ số `.kpis` để bảng nhập điểm được đẩy lên cao.
4. **Màn Hôm nay trên điện thoại (`web/src/views/staff-phone/HomeView.vue`):**
   - Ẩn câu `Phiếu lương chính thức gửi ngày {{ dm(data.payslipDate) }}.` khi `data.payslipDate` là `null` để không hiện câu cụt `"Phiếu lương chính thức gửi ngày ."`.
   - Hiển thị `Việc cần làm{{ data.requestDeadline ? ' trước ' + dm(data.requestDeadline) : '' }}` thay vì nối cứng `trước ` khi `requestDeadline` là `null`.
   - Xoá nút chết `<button type="button" class="off" disabled>Sửa giờ <small>Sắp có</small></button>` trong hộp cảnh báo thiếu chấm công.
5. **Cập nhật tài liệu sinh tự động (`spec/reference/web-routes.md`):**
   - Sau khi chuyển `sua-gio` và `ca-lam` thành redirect trong router, chạy `npm run spec:gen` để cập nhật `spec/reference/web-routes.md` và đảm bảo `npm run spec:check` đạt.
