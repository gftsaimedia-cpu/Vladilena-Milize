# Yêu cầu FE: 5 lỗi nhỏ còn sót ở app nhân viên (2026-11-05)

Người gửi: phiên staff-app (nối app nhân viên với `/api/v2/me/*`).
Nhánh: `claude/wire-staff-app-f5adca`. Nhánh chỉ có ở máy này: chưa merge, chưa push. Code mô tả dưới đây ứng với commit `5201deb`.
Đọc từ worktree khác: `git show claude/wire-staff-app-f5adca:docs/fe-requests/2026-11-05-staff-app-leftovers.md`.

**Trạng thái: đã sửa cả 5 mục trong commit `1d1d84c`.** Người dùng đã duyệt đề xuất trong chat ngày 05/11. FE đọc commit đó để biết đã làm gì; các mục dưới đây giữ nguyên để tham khảo.
- Hàm chuyển focus dùng chung: `web/src/views/staff-phone/focusAfterLoad.ts`. Dòng "Đang tải…": `components/LoadingLine.vue`. Thuộc tính `back` của `LoadError` dùng cho nút "Quay về tháng…".
- Test: `web/tests/staff-parts.spec.ts` (thanh giờ ca đêm); `web/tests/api/staff-app.spec.ts` (focus sau Thử lại, Quay về tháng, Đang tải…, check-out khi tải lại lỗi).
- Đã chạy: `npm test` 784/784; `test:ui` 334 pass, 10 skip; `test:api` 16/16.

Năm lỗi dưới đây do bước review code tìm ra, sau khi app nhân viên đã nối với BE. Phía BE không cần đổi gì. Cả năm lỗi đều nằm ở `web/`, dùng chung cho điện thoại và máy tính (≥1136px). Phần "Đề xuất" chưa được người dùng duyệt: FE tự thiết kế rồi trình người dùng duyệt trước khi sửa, theo CLAUDE.md §2 (loại Bounded).

## Bối cảnh cần biết

- Mọi màn tải dữ liệu bằng `useLoad` (`web/src/composables/useLoad.ts`). Mỗi lần chạy, `useLoad` xoá `error` ngay đầu và giữ `data` cũ. Admin dùng chung `useLoad` ở hơn 30 chỗ, nên tránh sửa thẳng vào nó.
- Lỗi tải hiện bằng `LoadError` (`web/src/views/staff-phone/components/LoadError.vue`). Khối này chỉ hiện câu của `ApiError`, lỗi khác hiện câu chung. Có 8 chỗ dùng:
  - `HomeView.vue:20`, `AttendanceView.vue:71`, `IncomeView.vue:20`, `ProfileView.vue:46` (điện thoại);
  - `TodayColumn.vue:29`, `TodayColumn.vue:48`, `AttendanceColumn.vue:30`, `IncomeColumn.vue:21`, `DesktopBar.vue:80` (máy tính).
- Hợp đồng `/me` đã có:
  - `GET /me/attendance` và `GET /me/income` trả `range { from, to }`. Không gửi `month` thì máy chủ lấy tháng hiện tại. Tháng ngoài khoảng trả 400 `MONTH_OUT_OF_RANGE`.
  - View có `MonthNav { month, prev, next }`, khai báo ở `web/src/mock/staff-phone.ts`.
- Ràng buộc test:
  - Nhánh mock (`__MOCK__`) không bao giờ gọi `api()`. Test "no /api on any tab" phải giữ xanh.
  - Dữ liệu giả không bao giờ lỗi, nên các ca lỗi viết ở `web/tests/api/staff-app.spec.ts` (BE thật, giả lỗi bằng `page.route`). Phần nào gắn riêng được thì viết ở fixture `web/tests/fixtures/staff-parts.html` (`staff-parts-fixture.ts`, `?part=…`).
- Luật UI của người dùng:
  - Chỉ cho bấm thao tác hợp lệ (ẩn hoặc tắt), không để bấm rồi mới báo lỗi.
  - Ô và nút bo góc 8px, không làm hình viên thuốc.
  - Danh sách chỉ hiện thông tin chính.

## 1. Bấm "Thử lại" thì focus rơi xuống `<body>`

- **Hiện tượng:** bấm Thử lại thì `useLoad` xoá `error` ngay, `LoadError` (cùng nút đang có focus) biến mất. Focus rơi về `<body>`, người dùng bàn phím hay trình đọc màn hình bị lạc.
- **Tái hiện:** `/nv/thu-nhap`, cho `/api/v2/me/income` lỗi một lần, Tab tới Thử lại, nhấn Enter. Sau đó `document.activeElement === document.body`.
- **Đề xuất:**
  - Thêm một hàm dùng chung cho 8 chỗ: chờ `reload()` xong rồi mới chuyển focus.
  - Còn lỗi thì focus nút Thử lại mới. Tải được thì focus tiêu đề của khối (h1 của màn điện thoại, h2 của cột máy tính, chính menu tài khoản); cần `tabindex="-1"` nếu chưa có.
  - Chỉ chuyển khi focus đang ở `<body>`.
- **Xong khi:** cả hai ca (tải được, lỗi tiếp) đều có test `toBeFocused()`.

## 2. Đổi tháng bị lỗi thì kẹt ở tháng lỗi

- **Hiện tượng:**
  - Ở Chấm công (`AttendanceView.vue:73`), Thu nhập (`IncomeView.vue:26`) và cột Chấm công máy tính (`AttendanceColumn.vue:36`), `MonthSwitch` chỉ hiện khi không có lỗi.
  - Bấm "Tháng trước" mà tháng đó tải lỗi thì chỉ còn nút Thử lại. Nếu tháng đó cứ lỗi, không còn đường quay về tháng khác ngoài tải lại cả trang.
- **Tái hiện:** `/nv/cham-cong`, cho `/api/v2/me/attendance?month=<tháng trước>` lỗi, bấm Tháng trước.
- **Đề xuất:**
  - `LoadError` có thêm nút thứ hai "Quay về tháng 11/2026", tức tháng tải được gần nhất (`data.month` / `data.label` vẫn còn trong `useLoad`).
  - Bấm nút thì đặt lại `month` về tháng đó.
  - Nút chỉ hiện khi lỗi xảy ra lúc đổi tháng (`data` có và `data.month` khác tháng đang xin). Lần tải đầu lỗi thì chỉ có Thử lại.
- **Xong khi:** có test BE thật: lỗi khi lùi tháng, bấm "Quay về…" thì thấy lại nhãn tháng cũ và hết khối lỗi.

## 3. Không có trạng thái "đang tải"

- **Hiện tượng:** trước khi dữ liệu về (lần đầu, hoặc trong lúc Thử lại khi chưa từng có dữ liệu), chỗ nội dung để trống. Mạng chậm thì trông như màn hỏng.
- **Đề xuất:**
  - Khi `loading && !data && !error`, hiện một dòng chữ nhạt "Đang tải…" (`role="status"`) ở chỗ nội dung. Không dùng khung xương, không dùng vòng xoay.
  - Khi đổi tháng, giữ nội dung tháng cũ tới khi tháng mới về, như hiện nay.
  - Kiểm tra lại các test mock không bị vướng dòng này.
- **Xong khi:** có test BE thật: giữ treo `/me/income`, thấy "Đang tải…"; thả ra thì dòng đó mất và nội dung hiện.

## 4. Check-in / Check-out đã ghi nhận vẫn báo lỗi

- **Hiện tượng:**
  - `checkIn()` / `checkOut()` (`web/src/services/staff-phone.ts:110`, `:120`) gửi `POST /me/punches` rồi gọi luôn `getHome()`.
  - Lượt chấm đã được ghi nhưng `getHome()` lỗi (ví dụ `/me/today` mất mạng) thì `ShiftCard` (`doCheckIn` dòng 32, `doCheckOut` dòng 44) vẫn báo lỗi như thể chấm công bị từ chối. Người dùng tưởng chưa chấm nên bấm lại.
- **Đề xuất:**
  - Tách hai bước. Gửi chấm công bị từ chối thì báo lỗi như hiện nay.
  - Gửi được mà tải lại màn lỗi thì trả `null` thay cho view. `ShiftCard` hiện `toast.ok('Đã check-out')` (hoặc 'Đã check-in') rồi phát sự kiện.
  - Màn cha (`HomeView.vue` `onPunch`, `TodayColumn.vue` `onPunch`) gọi `reload()`. Nếu vẫn lỗi thì `LoadError` của khối đó hiện "Không tải được dữ liệu".
  - Nhánh mock giữ nguyên.
- **Xong khi:** có test BE thật: check-out xong, `/me/today` lỗi một lần, thì không có câu lỗi, có "Đã check-out", thẻ ca hiện "Đã check-out".
  - Có thể gộp vào test "a refused check-out shows the server message, then check-out works", vì mỗi nhân viên thử chỉ check-out được một lần trong ngày.

## 5. Thanh giờ của ca qua đêm tính sai

- **Hiện tượng:**
  - Trục giờ dưới thanh đã đúng: ca 22:00–06:00 có mốc giữa là 02:00 (commit `5201deb`).
  - Nhưng thanh giờ (`DayBody.vue:23`, `track`) vẫn tính `span = shiftEnd - shiftStart` (dòng 27), ra số âm với ca qua đêm. Các đoạn muộn / đã làm / thiếu giờ ra vẽ sai.
- **Đề xuất:**
  - Với ca qua đêm (`end <= start`), cộng 1440 vào giờ ra ca.
  - Mỗi giờ vào, giờ ra, giờ hiện tại thì chọn giữa `t` và `t + 1440`, lấy cái gần giữa ca hơn.
  - Ca ban ngày giữ nguyên.
  - Ví dụ ca 22:00–06:00, vào 23:00, ra 05:00: đoạn muộn rộng 12,5%; đoạn đã làm bắt đầu từ 12,5% và rộng 75%.
- **Xong khi:** fixture `?part=day` nhận thêm `in` / `out`; test kiểm tra `left` / `width` của `.ds-late` và `.ds-worked`.

## Xác minh

- `npm --prefix web run test:ui` xanh. Không cần PostgreSQL.
- `npm --prefix web run test:api` với BE thật trên DB thử. Cách chạy xem `web/tests/README.md`, mục BE thật.
- Không chạy typecheck, không chạy prettier (người dùng đã bỏ hai bước này).
