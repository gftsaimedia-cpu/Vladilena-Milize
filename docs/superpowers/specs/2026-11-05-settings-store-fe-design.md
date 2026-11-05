# Settings store, phần FE: dữ liệu giả và màn hình

Ngày 05/11/2026.

**Nguồn:**
- Thiết kế BE của phiên "Cài đặt chung: lịch, giờ ca, tham số lương", phần 1–4. Người dùng đã duyệt từng phần ngày 05/11: bảng, API, nơi dùng, giao diện.
- Spec BE `docs/superpowers/specs/2026-11-05-settings-store-design.md`, nhánh `claude/settings-store-7d80cb`, commit 4efb6d3. Mục 5 là hợp đồng API, mục 7 là phần giao diện. Spec BE chưa được người dùng duyệt; nếu hợp đồng đổi, phiên BE sẽ báo commit mới.
- Artboard Đợt 12 trên bảng "Admin Dashboard Concept".

Người dùng đã chọn tách phần FE sang phiên này ("Tách FE sang đây"). BE làm ở nhánh `claude/settings-store-7d80cb`; FE làm ở nhánh `claude/settings-mock-fe`.

## 1. Mục tiêu

Các màn Cài đặt, hồ sơ nhân sự và app nhân viên chạy đúng thiết kế phần 4 trên dữ liệu giả (`__MOCK__`), có test giao diện. Khi BE xong thì chỉ phải nối API, không phải sửa màn.

Bốn thay đổi người dùng nêu đầu tiên đều nằm trong phạm vi:
- bỏ số "chưa ai xác nhận";
- bỏ "Xem trước", thay bằng hộp xác nhận liệt kê thay đổi;
- ở ngoài vùng thì khoá nút chấm công và hiện khoảng cách;
- Admin chọn ngày trả lương từ 1 đến 28.

## 2. Lớp dữ liệu

Ba file mới. Không sửa file dịch vụ cũ ngoài phần nối vào, để tránh đụng các nhánh khác.

**`web/src/mock/settings.ts`: kho giả trong bộ nhớ, trả đúng dạng phản hồi ở mục 5 của spec BE**
- Mỗi nhóm (`overtime`, `attendance`, `kpiWeights`, `insurance`, `tax`, `payCalendar`) là một danh sách phiên bản `{ month, values }`. Phiên bản đầu ở tháng 2000-01, mang số mặc định đã chốt.
- **`stamp`** của nhóm là `id` lớn nhất trong lịch sử của nhóm đó, bằng 0 khi chưa có lịch sử. Lưu với `stamp` cũ thì trả lỗi `SETTINGS_STALE`, giống BE.
- **Lưu từ tháng M**, đúng luật phần 1:
  - M đã có phiên bản thì sửa thẳng phiên bản đó; chưa có thì chép phiên bản đang hiệu lực sang M rồi sửa;
  - phiên bản sau M còn mang số cũ thì nhận số mới; phiên bản sau M mang số khác thì giữ nguyên.
- Mỗi ô đổi thêm một dòng lịch sử `{ group, field, month, from, to, reason, by, at }`.
- **Tuần riêng:** không có tuần riêng nào lúc đầu. Mọi người làm T2–T7 theo quy ước mock. Lưu trong hộp chỉ đổi dòng ở hồ sơ.
- **Vùng chấm công:** một bản ghi `{ lat, lng, radiusM }`, giá trị mẫu lấy theo ví dụ của spec BE: 10.7769, 106.7009, 150 m.
- **Ngày trả lương theo năm:** `payDate` là ngày `payDay` của tháng sau, không dời khi rơi vào Chủ nhật hay ngày lễ.
- **`minMonth` của mock:** `2026-10`, tức kỳ đang mở.

**`web/src/services/settings-store.ts`: các hàm FE gọi**
- Danh sách hàm:
  - `getSettings(month)`;
  - `saveSettingsGroup(group, { effectiveMonth, values, reason, stamp })`. Tên nhóm trên đường dẫn là `overtime`, `attendance`, `kpi-weights`, `insurance`, `tax`, `pay-calendar`;
  - `getSettingsHistory(group)`;
  - `getPayDays(year)`;
  - `getWorkWeek(username, month)`;
  - `saveWorkWeek(username, { effectiveMonth, weekdays, reason })`;
  - `getAttendanceZone()`;
  - `saveAttendanceZone({ lat, lng, radiusM, reason })`.
- Mỗi hàm: `if (__MOCK__)` gọi kho giả; còn lại gọi đúng route ở phần 2 (`/settings…`, `PUT …`).
- Lỗi `409 SETTINGS_STALE` thì tải lại và báo "Có người vừa lưu trước, đã tải lại".

**`web/src/builders/api/settings.ts`: dựng mọi thứ hiển thị từ dữ liệu nghiệp vụ**
- Nhãn từng ô, nhóm ngăn kéo, dòng tóm tắt, đánh dấu "Đã chỉnh" (giá trị ≠ mặc định).
- Câu trong hộp xác nhận, ví dụ "OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026".
- Dòng lịch sử, giới hạn ô nhập.

Tên trường lấy đúng theo mục 5 của spec BE. Nếu người dùng đổi hợp đồng khi duyệt spec BE, chỉ phải sửa mock và builder, không sửa màn.

## 3. Màn hình (theo artboard)

1. **Cách tính lương:**
   - 6 dòng, dòng nào khác mặc định có "• Đã chỉnh"; bỏ khối và dòng "chính sách chưa chốt".
   - 6 ngăn kéo theo bảng ở phần 4, phần chỉ xem là chữ thường kèm link "Sửa ở Chức vụ & bậc".
   - Lương KPI: tổng khác 100 thì Lưu khoá, cạnh đó hiện "Tổng 98/100".
   - Tháng áp dụng (từ `minMonth`) và lý do (không bắt buộc, tối đa 300 ký tự) nhập ngay trong ngăn kéo.
   - Lưu mở hộp xác nhận "Lưu thay đổi": danh sách thay đổi, lý do đã nhập, Huỷ / Lưu. Theo artboard M1 và M2.
   - Bỏ mọi nút "Xem trước và lưu".
2. **Tất cả cài đặt:**
   - Chỉ các nhóm có mục: OT, Phụ cấp, KPI, Khấu trừ, Tạm ứng (chỉ xem), Bảo hiểm, Thuế, Kỳ lương.
   - Thuế có bảng biểu thuế 5 bậc, mốc phải tăng dần; ô nhập chặn trước.
   - Mỗi mục có lịch sử và Hoàn tác. Hoàn tác là lưu lại số cũ qua đường lưu thường.
   - Ô tìm kiếm giữ nguyên.
   - Bỏ dải vàng, bộ lọc "Chưa xác nhận", nhãn "Chưa xác nhận" và số đếm trên menu.
3. **Quy tắc KPI:** 5 trọng số chỉ xem, link "Sửa trong Cách tính lương › Lương KPI".
4. **Lịch, ca & chấm công:**
   - Ngày trả lương: ô số 1–28 + "Áp dụng từ tháng". Chấm trên lịch năm theo `getPayDays`.
   - "Bắt đầu tính công: ngày 1" là chữ cố định.
   - Bảng 6 ca chỉ xem, giờ bằng chữ. Giờ theo quyết định D7 bên BE:

     | Ca | Giờ |
     |---|---|
     | Normal 1 | 08:00–17:00 |
     | Normal 2 | 10:00–19:00 |
     | Flex 1 | 06:00–15:00 |
     | Flex 2 | 13:00–22:00 |
     | Night 1 | 22:00–07:00 |
     | Night 2 | 21:00–06:00 |
   - Vùng chấm công: bán kính, vĩ độ, kinh độ, nút "Dùng vị trí hiện tại". Lưu xong có hiệu lực ngay, không có ô tháng.
5. **Hồ sơ nhân sự:**
   - Dòng "Tuần làm việc: … · công chuẩn N · riêng từ MM/YYYY" kèm nút Sửa.
   - Hộp gồm:
     - "Theo loại nhân sự" / "Tuần riêng";
     - 6 ô tick T2–T7;
     - tháng áp dụng;
     - "Công chuẩn: N" đổi ngay khi tick.
   - Lưu khoá khi không tick ô nào hoặc chưa đổi gì.
   - Ruling: công chuẩn = làm tròn (số ngày × 52 ÷ 12), nên T2–T6 ra 22 và T2–T7 ra 26. BE trả `standardWorkdays` thì hiện số BE trả.
6. **App nhân viên** (điện thoại và trang máy tính):
   - Nút Check-in khoá, kèm một trong ba câu:
     - "Bạn đang cách văn phòng 600 m";
     - "Không lấy được vị trí";
     - "Hôm nay không phải ngày làm của bạn".
   - Ngày ngoài tuần hiện "nghỉ".
   - Thu nhập hiện ngày trả lương, ví dụ "trả ngày 10/12" cho lương tháng 11. Mock đang ở tháng 10/2026 nên hiện "trả ngày 10/11".
   - Khoảng cách tính ở máy, theo mục 5.6 của spec BE:
     - dùng vùng trong `/me/today` và vị trí trình duyệt, công thức haversine với R = 6.371.000 m;
     - làm tròn tới mét; lớn hơn `radiusM` là ngoài vùng;
     - `zone` là `null` thì không kiểm tra vị trí;
     - `workday: false` thì hiện câu "không phải ngày làm".
7. **Lưới chấm công Admin:** ngày ngoài tuần của từng người hiện là nghỉ. Mock không có tuần riêng nên lưới không đổi.

## 4. Thứ tự làm và phụ thuộc

Ba nhánh khác sửa đúng file của việc này:
- **admin-cleanup** (`claude/admin-cleanup-c7afa2`): `AllSettingsView.vue`, `pay/PayDrawer.vue`, `services/admin-config.ts`, `services/admin-settings.ts`, `tests/settings-search.spec.ts`. Đã vào main (7935f20) và đã gộp vào nhánh này (759068d).
- **wire-staff-app** (`claude/wire-staff-app-f5adca`): `ShiftCard.vue`, `HomeView.vue`, `TodayColumn.vue`, `services/staff-phone.ts`, `mock/staff-phone.ts`. Đã vào main và đã gộp vào nhánh này.
- **audit-log** (`claude/audit-log-718abd`): `services/admin-config.ts`. Chưa vào main. Lớp dữ liệu mới nằm ở file riêng `services/settings-store.ts`. Ở `admin-config.ts` chỉ bỏ những hàm cài đặt cũ không còn dùng, để khi gộp audit-log thì chỗ đụng nhau ít nhất.

Ba đợt giữ nguyên thứ tự làm. Cả ba đã làm được ngay, không còn phải chờ nhánh nào:

| Đợt | Việc |
|---|---|
| 1 | Lớp dữ liệu (§2), Lịch ca & chấm công, Quy tắc KPI, hồ sơ tuần làm việc |
| 2 | Cách tính lương, Tất cả cài đặt, bỏ số chưa xác nhận và Xem trước, viết lại `settings-search.spec.ts` |
| 3 | App nhân viên khoá check-in, ngày trả lương ở thu nhập, lưới chấm công Admin theo tuần từng người |

Trước khi sửa một file mà nhánh khác cũng sửa, gộp main mới nhất vào nhánh này trước.

## 5. Kiểm thử

Playwright trên dữ liệu giả (`cd web && PW_PORT=<cổng> npx playwright test`). Không dùng `page.route`, không chạy typecheck hay prettier. Mỗi đợt viết test trước (RED) rồi mới viết mã.

- **Lịch:**
  - ô ngày trả lương chỉ nhận 1–28;
  - lưu ngày 15 từ 12/2026 thì chấm trên lịch dời đúng từ tháng đó;
  - bảng ca chỉ có chữ;
  - lưu vùng chấm công;
  - "Dùng vị trí hiện tại" điền toạ độ (giả lập vị trí bằng `context.setGeolocation`).
- **Hồ sơ:**
  - tick T2–T6 hiện "Công chuẩn: 22";
  - bỏ hết ô tick thì Lưu khoá;
  - lưu xong dòng hồ sơ đổi.
- **Quy tắc KPI:** trọng số chỉ xem, có link.
- **Cách tính lương:**
  - sửa OT ngày thường 1.5 → 1.6 thì hộp xác nhận hiện đúng câu, lưu xong dòng OT có "• Đã chỉnh";
  - KPI tổng 98 thì Lưu khoá và hiện "Tổng 98/100";
  - không còn chữ "Xem trước" và "chưa chốt".
- **Tất cả cài đặt:**
  - Hoàn tác thêm một dòng lịch sử mới;
  - biểu thuế không cho mốc giảm;
  - không còn dải vàng và bộ lọc "Chưa xác nhận";
  - tìm kiếm vẫn ra mục.
- **Ví dụ luật lưu từ tháng M:** OT lễ ×3.5 từ 03/2027, rồi ×3.2 từ 12/2026. Kết quả: 12/2026–02/2027 là ×3.2, từ 03/2027 vẫn ×3.5.
  - Đây là test thuần trong Playwright, gọi thẳng `mock/settings.ts`, không mở trang. File này vì vậy không được dùng `__MOCK__` hay API của trình duyệt.
- **App nhân viên:**
  - ngoài vùng (giả lập vị trí cách 600 m) thì nút khoá và hiện "Bạn đang cách văn phòng 600 m";
  - từ chối quyền vị trí thì hiện "Không lấy được vị trí".
  - Trường hợp "Hôm nay không phải ngày làm của bạn" kiểm bằng test thuần trên hàm quyết định khoá nút `checkInLock(...)`. Lý do: mock không có tuần riêng và ngày mock cố định là thứ Tư 28/10/2026.

## 6. Ngoài phạm vi

- Mọi thứ trong `src/`, `migrations/`, `test/v2/`.
- Nối API thật chỉ viết sẵn trong service. Kiểm bằng test API của phiên BE khi BE xong.
- Nhật ký thay đổi: thuộc phiên audit-log.
- Màn Chế độ theo loại giữ hộp "Lưu chế độ" hiện có.
