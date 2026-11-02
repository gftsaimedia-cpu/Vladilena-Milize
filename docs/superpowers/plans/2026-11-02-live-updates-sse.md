# Kế hoạch triển khai cập nhật trực tiếp SSE

> **Dành cho worker triển khai:** Bắt buộc dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để làm lần lượt từng task. Đánh dấu task bằng checkbox.

**Mục tiêu:** Các màn nhân sự và admin đang mở tự cập nhật dữ liệu liên quan sau thay đổi đã lưu, không cần tải lại trang thủ công.

**Kiến trúc:** Dùng một `EventSource` cho mỗi tab đã đăng nhập. Backend phát sự kiện báo thay đổi sau khi DB commit; lớp dùng chung ở Vue chuyển sự kiện đến các bộ nạp dữ liệu phù hợp, rồi các màn gọi lại API GET hiện có. SSE không mang bản ghi đầy đủ và không thay thế các API ghi.

**Công nghệ:** NestJS/TypeScript, Vue 3/TypeScript, API SSE hiện hữu, PostgreSQL, `node:test` cho kiểm thử API và service.

**Thiết kế:** `docs/superpowers/specs/2026-11-02-live-updates-sse-design.md`

## Ràng buộc chung

- Giữ nguyên xác thực cookie cùng origin và bộ lọc quyền/payload hiện hữu.
- Chỉ phát sự kiện sau khi giao dịch ghi dữ liệu commit thành công.
- Event payload chỉ là gợi ý để nạp lại; dữ liệu GET từ DB là nguồn chuẩn.
- Một kết nối SSE dùng chung cho mỗi tab; không tải lại toàn trang do sự kiện.
- Phạm vi triển khai hiện tại là một tiến trình app; nhiều tiến trình cần broker dùng chung.

## Trọng tâm rà soát

- Người không đủ quyền không nhận được dữ liệu riêng: kiểm tra audience, capability và trường payload được chiếu.
- Giao dịch lỗi không phát sự kiện: kiểm tra nhánh lỗi/rollback ở từng mutation.
- Kết nối lại không bỏ sót trạng thái giao diện: kiểm tra `resync` và nạp lại bộ dữ liệu đang mở.
- Một thay đổi dồn nhiều sự kiện không gây hàng loạt GET trùng: kiểm tra gộp thông báo theo tick/thời gian ngắn.
- Đổi tài khoản hoặc đăng xuất không giữ kết nối cũ: kiểm tra vòng đời theo `session.user`.

---

### Task 1: Tạo dịch vụ SSE dùng chung và gắn với phiên đăng nhập

**Tệp:**
- Tạo: `web/src/services/live-events.ts`
- Sửa: `web/src/main.ts`
- Test: `test/unit/live-events.test.ts` (Node `node:test`, EventSource giả)

**Giao diện:**
- Xuất `LiveEvent` gồm `{ type: string; data: Record<string, unknown> }`.
- Xuất `subscribeLiveEvents(listener: (event: LiveEvent) => void): () => void` để đăng ký và hủy đăng ký.
- Xuất `startLiveEvents()` và `stopLiveEvents()`; `start` không tạo kết nối trùng, `stop` đóng EventSource và xóa trạng thái kết nối.
- Lắng nghe các event đã có trong `src/platform/events.ts` cùng `hello`, `resync`, `bye`; parse JSON có kiểm soát và bỏ qua payload hỏng.

- [ ] **Bước 1: Viết kiểm thử thất bại** cho nhận sự kiện có tên, nhiều subscriber, unsubscriber, payload JSON lỗi, start lặp không mở kết nối trùng và stop đóng kết nối.
- [ ] **Bước 2: Chạy kiểm thử để xác nhận thất bại** bằng `node scripts/dev/ts.cjs --test test/unit/live-events.test.ts`.
- [ ] **Bước 3: Cài lớp EventSource dùng chung**; nhận factory EventSource có thể thay thế trong kiểm thử.
- [ ] **Bước 4: Gắn vòng đời vào phiên** bằng watcher của `session.user?.username` trong `main.ts`: đăng nhập thì start; logout/401/đổi người dùng thì stop; khi nhận `resync`, phát sự kiện toàn cục để view đang mount tự nạp lại.
- [ ] **Bước 5: Chạy lại kiểm thử và `npm run typecheck:web`**.
- [ ] **Bước 6: Commit riêng** `feat(web): add shared SSE client`.

### Task 2: Bổ sung sự kiện backend cho hồ sơ và lịch ca

**Tệp:**
- Sửa: `src/platform/events.ts`
- Sửa: `src/modules/staff/staff.controller.ts`
- Sửa: `src/modules/sheet/sheet.controller.ts`
- Có thể sửa sau khi truy vết commit: `src/domain/sheet-bulk.ts`
- Test: `test/api/events.test.ts`, `test/api/staff-create-generated-credentials.test.ts`, `test/api/roles-and-bulk-shift.test.ts`; tạo `test/api/sheet-bulk-events.test.ts` nếu chưa có kiểm thử phù hợp.

**Giao diện sự kiện:**
- Thêm `staff.changed` cho người có quyền xem danh sách nhân sự; payload chỉ gồm cờ/phạm vi cần thiết, không tên, lương hay thông tin hồ sơ.
- Thêm `schedule.changed` cho các nhân sự bị ảnh hưởng và nhóm admin có quyền chấm công; payload tối thiểu gồm tháng/ngày hoặc nhóm phạm vi, không phát danh sách username cho audience rộng.
- Giữ audience và trường payload tại catalog `EVENTS` trong `events.ts` làm nơi định nghĩa duy nhất.

- [ ] **Bước 1: Viết kiểm thử thất bại** cho event sau tạo/sửa nhân sự, thay đổi `shiftCode`, bulk gán ca và bulk sửa timesheet; khẳng định lỗi không phát event và người không đủ quyền không nhận event.
- [ ] **Bước 2: Chạy các kiểm thử liên quan** bằng `node scripts/dev/ts.cjs --test test/api/events.test.ts test/api/staff-create-generated-credentials.test.ts test/api/roles-and-bulk-shift.test.ts` và tệp sheet-bulk mới nếu được tạo.
- [ ] **Bước 3: Thêm event catalog và emitter sau commit** tại các handler đã xác định; nếu bulk service sở hữu transaction/result thì emit ở tầng điều phối ngay sau khi service commit.
- [ ] **Bước 4: Chạy lại kiểm thử API liên quan** và `npm run typecheck`.
- [ ] **Bước 5: Commit riêng** `feat(events): publish staff and schedule changes`.

### Task 3: Cập nhật trực tiếp yêu cầu, giải trình, danh sách nhân sự và ca làm

**Tệp:**
- Sửa: `web/src/views/admin/requests/RequestsView.vue`
- Sửa: `web/src/views/admin/requests/ExplanationsGroup.vue`
- Sửa: `web/src/views/staff-phone/RequestsView.vue`
- Sửa: `web/src/views/admin/staff/StaffView.vue`
- Sửa: các view lịch/chấm công liên quan trong `web/src/views/admin/attendance/` và `web/src/views/staff-phone/AttendanceView.vue`, `HomeView.vue`
- Test: kiểm thử service từ Task 1; mở rộng API tests hiện có cho event quyết định giải trình/yêu cầu.

- [ ] **Bước 1: Gắn subscriber vào request/explanation loaders**; `approvals.changed`/`attendance.changed` làm mới queue admin và số chờ, `request.decided` làm mới yêu cầu của đúng nhân sự.
- [ ] **Bước 2: Gắn `staff.changed` và `schedule.changed`** vào roster, profile, bảng ca, màn công nhân sự; dùng tiêu chí tháng/ngày hiện có để bỏ qua event không liên quan.
- [ ] **Bước 3: Gộp các yêu cầu reload trùng trong cùng đợt event** để tránh GET lặp khi một thao tác phát nhiều event.
- [ ] **Bước 4: Chạy kiểm thử API/service liên quan và `npm run typecheck:web`**.
- [ ] **Bước 5: Commit riêng** `feat(web): refresh requests and schedules from SSE`.

### Task 4: Mở rộng sang chấm công, cài đặt, lương/kỳ lương và thông báo

**Tệp:**
- Sửa các loader thuộc `web/src/views/admin/attendance/`, `web/src/views/staff-phone/AttendanceView.vue`, `HomeView.vue`, `IncomeView.vue`
- Sửa các loader cài đặt trong `web/src/views/admin/settings/`
- Sửa store kỳ lương `web/src/stores/period.ts` và view admin lương tương ứng.
- Dùng event catalog đã có trong `src/platform/events.ts`; chỉ sửa emitter backend nếu rà soát phát hiện mutation thật sự chưa phát event.
- Test: `test/api/events.test.ts` và test API theo mutation emitter được sửa.

- [ ] **Bước 1: Ánh xạ `punch.changed`, `punch.corrected`, `estimate.changed`, `payslip.available`, `period.changed`, `params.changed`, `roles.changed`, `announcement.posted` tới đúng loader/store.**
- [ ] **Bước 2: Đảm bảo `resync` làm mới các loader đang mount, còn event khác chỉ làm mới dữ liệu trong phạm vi của nó.**
- [ ] **Bước 3: Chạy kiểm thử API liên quan, `npm run typecheck`, `npm run typecheck:web` và build web.**
- [ ] **Bước 4: Xác minh thủ công bằng hai phiên đăng nhập**: nhân sự/admin mở màn liên quan, thực hiện quyết định yêu cầu, sửa giải trình/ca; xác nhận cả hai giao diện tự cập nhật, không tải lại trang. Ngắt/kết nối lại SSE và xác nhận dữ liệu đang mở được đồng bộ.
- [ ] **Bước 5: Commit riêng** `feat(web): refresh remaining views from SSE`.

### Task 5: Rà soát toàn nhánh

- [ ] Đối chiếu mọi event producer hiện có trong `src/platform/events.ts` với ít nhất một consumer frontend hoặc ghi rõ event không cần view consumer.
- [ ] Kiểm tra lại quyền, payload tối thiểu, emit sau commit, vòng đời session, retry/resync và không có kết nối trùng.
- [ ] Chạy `npm test`, `npm run typecheck`, `npm run typecheck:web`, `npm run format:check` và `npm run spec:check`.
- [ ] Ghi kết quả và giới hạn một tiến trình vào ledger; không bật nhiều replica trong phạm vi này.
