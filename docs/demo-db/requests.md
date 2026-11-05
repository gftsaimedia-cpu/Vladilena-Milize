# Đơn từ (requests) — tình huống, lỗi, câu hỏi

Chạy: `npm run demo -- test requests` (DB `luong_demo_requests`, BE 3373, vite 4273).

**Lần chạy gần nhất:** 05/11/2026, nhánh `claude/demo-db` ở 0bc17d9 (đã gộp main aaa14d9).
- Kết quả: 70 test xanh. Trong đó có 8 test `test.fail`, là các lỗi còn mở ở dưới.
- Log BE chỉ có hai lỗi 500, đều của BUG-requests-7.
- Có một lần chạy bị `net::ERR_NO_BUFFER_SPACE` lúc mở trang. Đó là lỗi socket của Windows khi máy thiếu tài nguyên. Chạy lại thì xanh.

**File:**
- Người: `scripts/demo/people/requests.ts` (13 người `dt-`).
- Seed: `scripts/demo/areas/requests.ts`.
- Test:
  - `web/tests/api/demo-requests-api.spec.ts`: route BE.
  - `web/tests/api/demo-requests-admin.spec.ts`: màn Admin.
  - `web/tests/api/demo-requests-staff.spec.ts`: app nhân viên.
- Không có `test/v2/demo-requests-*`, vì mọi luật ở đây đều kiểm được qua route, không cần test PostgreSQL riêng.

**Nguồn luật:**
- Luật người dùng chốt ngày 05/11.
- Spec `docs/superpowers/specs/2026-11-05-staff-requests-design.md`, đã vào main aaa14d9.
- `docs/api/v2-contract.md` mục 3.4.

## Ngày trong seed

Seed tính ngày theo hôm nay (`ctx.months`). m2 là hai tháng trước, m1 là tháng trước, m0 là tháng này, "tháng sau" là m0 + 1.

- **Đơn Admin nộp thay:** nằm ở m1 (lịch sử đã duyệt / từ chối). Spec 2.3 không giới hạn ngày cho Admin.
- **Đơn nhân viên tự nộp:** nằm ở tháng sau, trong khoảng "từ hôm nay tới hết tháng sau".
- **Giải trình:** nằm ở ngày đã qua của m1.
  - Máy chủ tự tìm trường hợp từ giờ chấm.
  - Ngày "vào muộn" được chấm hộ 09:00–17:00 trước khi nộp (ca 08:00–17:00), nên máy ra đúng một trường hợp `LATE_CHECK_IN`.
  - Ngày không có giờ chấm là "Quên chấm công", nên đơn gửi kèm giờ vào 08:00 và giờ ra 17:00.
- **Tạm ứng:** số tiền do máy chủ tính từ ngày công 01–15. dt-giang được chấm hộ 08:00–17:00 mọi ngày làm 01–15 đã qua của m2, m1, m0.
- **iSAT:** dùng các Thứ Bảy sắp tới, bỏ ngày lễ.
- **Ngày làm việc:** Thứ Hai tới Thứ Bảy, trừ ngày lễ (`GET /holidays`). Khoảng nghỉ nhiều ngày lấy từ Thứ Hai.

**Hai thứ dùng chung toàn công ty:**
- **Ngày lễ:** test thêm một ngày lễ, kiểm, rồi xoá trong `finally`. Ngày được chọn trong tuần 3–4 tháng sau, nên không trùng ngày của mảng khác.
- **Chốt công tháng m1:**
  - Khối `a locked month` ở cuối `demo-requests-api.spec.ts` chốt công m1 bằng `POST /system/periods/:m1/lock`.
  - Main chưa có route mở khoá, nên sau khi test chạy, DB `luong_demo_requests` giữ m1 ở trạng thái đã chốt.
  - Lần `npm run demo -- test requests` sau dựng lại DB nên không ảnh hưởng.
  - Trên DB `luong_demo_all`: mảng nào cần m1 chưa chốt thì phải chạy trước spec này.

## Tình huống

Loại assert: (a) luật đã chốt, (b) bất biến, (c) thao tác không hợp lệ không được mời bấm.

| # | Tình huống | Người (username) | Test | Loại assert |
|---|---|---|---|---|
| 1 | Danh mục: 6 loại nghỉ, 7 trường hợp giải trình, 4 điều kiện iSAT | admin | api › catalogue routes list 6 leave types… | b |
| 2 | Mỗi loại đơn (nghỉ, OT, đổi ca, giải trình, tạm ứng, nghỉ có làm bù, iSAT) có đủ 4 trạng thái chờ / duyệt / từ chối / huỷ | dt-an, dt-binh, dt-chi, dt-dung, dt-giang, dt-hoa, dt-khoa | api › every request kind has a pending, approved, rejected and cancelled request | b |
| 3 | Tổng danh sách = tổng theo từng trạng thái; phân trang trả mỗi đơn đúng một lần | admin | api › list totals agree with the status filters… | b |
| 4 | Id đơn không có thật: GET/PATCH Admin và /me trả 404; loại đơn lạ ở `POST /me/requests/:kind` trả 404 | admin, dt-phu | api › unknown request ids give 404 | b |
| 5 | Id đơn sai dạng (không phải uuid) không bao giờ trả 500 (5 route) | admin, dt-phu | api › a malformed request id never gives 500: … | b — **BUG-requests-7** ở 2 route GET |
| 6 | Nhân viên gọi route Admin `/requests…` bị 403 | dt-phu | api › a staff account cannot call the Admin request routes | b |
| 7 | Đơn đã duyệt không duyệt hay từ chối lại được (409) | dt-binh | api › an approved request cannot be approved or rejected again | a |
| 8 | Đơn đã từ chối / đã huỷ không duyệt được; nhân viên không huỷ được đơn đã từ chối, đã huỷ, đã duyệt (409) | dt-an, dt-binh | api › a rejected or cancelled request cannot be reviewed or cancelled | a |
| 9 | Hành động duyệt lạ (`MAYBE`) bị 400, đơn vẫn chờ | dt-quan | api › a review with an unknown action is refused… | b |
| 10 | Nhân viên tự nộp rồi huỷ đơn chờ của mình; không huỷ được đơn của người khác | dt-phu, dt-an | api › staff file and cancel their own pending request… | a |
| 11 | `/me` chỉ thấy đơn của mình (đơn người khác: 404) | dt-an, dt-binh | api › staff only see their own requests through /me | b |
| 12 | Admin và từng nhân viên đọc cùng một tập đơn với cùng trạng thái; chi tiết `/me` có các bước | 10 người có đơn seed (trừ dt-nam: tài khoản đã khoá) | api › Admin and each employee read the same requests… | b |
| 13 | Số đếm trong `/me/requests` cộng lại bằng danh sách | dt-an, dt-khoa, dt-giang | api › /me request counts add up to the list | b |
| 14 | Đơn nghỉ trùng ngày với đơn nghỉ đang chờ bị từ chối | dt-lam | api › a leave overlapping a pending leave is refused | a |
| 15 | Đơn nghỉ vào Thứ Bảy đang có iSAT chờ bị từ chối, lỗi nêu iSAT | dt-lam | api › a leave on a Saturday with a pending iSAT is refused… | a |
| 16 | Khoảng nghỉ Thứ Sáu–Thứ Bảy có iSAT đã duyệt: nhận 1 ngày, cảnh báo ghi dd/mm | dt-lam | api › a leave range over an approved iSAT Saturday skips… | a |
| 17 | OT vào ngày nghỉ bị từ chối | dt-phu | api › OT on a leave day is refused | a |
| 18 | Đổi ca phủ ngày nghỉ: nhận, cảnh báo, ngày nghỉ vẫn là nghỉ | dt-phu | api › a shift change over a leave day is accepted… | a |
| 19 | Nộp đơn nghỉ vào ngày đang có đổi ca chờ: được | dt-phu | api › a leave can be filed on a day with a pending shift change | a |
| 20 | OT và nghỉ có làm bù không chung một tháng | dt-hoa, dt-binh | api › OT and leave-with-makeup cannot share a month | a |
| 21 | Nghỉ có làm bù cần đúng 8 giờ bù, mọi giờ bù sau ngày nghỉ | dt-phu | api › leave-with-makeup needs exactly 8 makeup hours… | a |
| 22 | Ngày lễ thêm trước khi duyệt: đơn nghỉ 3 ngày còn 2 ngày | dt-lam | api › a holiday added before approval leaves the leave with fewer days | a |
| 23 | Đơn nghỉ 1 ngày mà ngày đó thành ngày lễ: không duyệt được (409) | dt-lam | api › a leave whose only day became a holiday cannot be approved | a |
| 24 | Nghỉ có làm bù mà ngày nghỉ thành ngày lễ: không duyệt được (409) | dt-lam | api › a leave-with-makeup whose leave day became a holiday… | a |
| 25 | iSAT cho Thứ Bảy đã qua, hôm nay, ngày thường: từ chối (Admin và /me) | dt-khoa, dt-phu | api › iSAT is refused for a past Saturday, for today and for a weekday | a |
| 26 | iSAT tự đánh giá dưới 4/4: lưu thành từ chối, ghi chú "chưa đạt" | dt-khoa | api › an iSAT self-assessment under 4/4 is saved as rejected… | a |
| 27 | iSAT thứ hai cho cùng Thứ Bảy bị từ chối | dt-khoa | api › a second iSAT for the same Saturday is refused | a |
| 28 | Thực tập sinh không nộp được OT, iSAT | dt-oanh | api › interns cannot file OT or iSAT | a |
| 29 | Giải trình ngày đã bị từ chối không nộp lại được ("Ngày dd/MM đã có đơn giải trình"); ngày đã huỷ thì nộp lại được | dt-dung | api › a rejected explanation day cannot be filed again… | a |
| 30 | Giải trình cho ngày tương lai bị từ chối | dt-phu | api › an explanation for a future day is refused | a |
| 31 | `/me` không nhận đơn nghỉ ngày đã qua ("Chỉ chọn ngày từ … đến …") | dt-phu | api › staff cannot file a leave for a day before today | a (BUG-requests-1 đã sửa) |
| 32 | `/me` không nhận đơn nghỉ sau hết tháng sau | dt-phu | api › staff cannot file a leave after the end of next month | a (BUG-requests-2 đã sửa) |
| 33 | `/me` OT chỉ nhận giờ tròn ("Chỉ chọn giờ tròn") | dt-phu | api › staff OT must start and end on the hour | a (BUG-requests-3 đã sửa) |
| 34 | `/me` tạm ứng chỉ nộp ngày 16–17 (test bỏ qua khi chạy đúng ngày 16, 17) | dt-phu | api › staff can file an advance only on the 16th and 17th | a (BUG-requests-4 đã sửa) |
| 35 | Số tiền, tiêu đề, lý do tạm ứng do máy chủ đặt; số tiền > 0 và không lấy số client gửi | dt-giang | api › the advance amount, title and reason are set by the server | a (BUG-requests-5 đã sửa) |
| 36 | Người đã nghỉ việc: còn đọc được đơn (1 duyệt, 1 chờ), đơn chờ vẫn trong hàng chờ | dt-nam | api › a resigned employee keeps readable requests… | b |
| 37 | Người đã nghỉ việc đọc lại là "Đã nghỉ việc" | dt-nam | api › a resigned employee reads back as Đã nghỉ việc | b (BUG-requests-8 đã sửa) |
| 38 | Tháng đã chốt công: Admin vẫn duyệt / từ chối được đơn chờ của tháng đó | dt-mai | api › a locked month › Admin can still approve and reject… | a |
| 39 | Tháng đã chốt công: không nộp được giải trình, cả Admin lẫn nhân viên ("Tháng M đã chốt công") | dt-mai | api › a locked month › no explanation can be filed for a day of a locked month… | a |
| 40 | Tháng đã chốt công: ngày của tháng đó ra khỏi danh sách cần giải trình | admin | api › a locked month › the days of a locked month leave the explanation queue | a |
| 41 | `/admin/yeu-cau`, `/admin/yeu-cau/moi-thang` mở Tổng quan, giữ `?thang` | admin | admin › the old request addresses open Tổng quan and keep the month | b |
| 42 | Tổng quan: "Còn N việc", thẻ "Yêu cầu chờ duyệt", số trên thẻ duyệt, số dòng, tổng nhóm, nhãn chuông đều bằng số đơn chờ | admin | admin › Tổng quan request numbers match the pending queue | b |
| 43 | Tổng quan: thẻ nhân sự, có mặt hôm nay, chấm công, quỹ lương khớp API (quỹ lương đếm mọi phiếu, kể cả phiếu bị từ chối) | admin | admin › Tổng quan staff, attendance and payroll cards agree… | b |
| 44 | Nhân sự đang làm không đếm người đã nghỉ việc | dt-nam | admin › Nhân sự đang làm does not count a resigned employee | b (BUG-requests-8 đã sửa) |
| 45 | Chuông liệt kê đúng các đơn chờ, mỗi dòng mang tên nhân viên | admin | admin › the bell lists exactly the pending requests… | b |
| 46 | Duyệt từ thẻ Tổng quan: chuông giảm 1, API và app nhân viên thấy "Đã duyệt" | dt-quan (nghỉ) | admin › approving from the Tổng quan card… | b |
| 47 | Từ chối từ chuông: không ghi chú thì không cho từ chối; có ghi chú thì nhân viên thấy "Từ chối" | dt-quan (OT) | admin › rejecting from the bell needs a note… | b, c |
| 48 | Hộp "Duyệt yêu cầu" hiện đúng đơn đổi ca và duyệt được | dt-quan (đổi ca) | admin › the approval dialog shows the request and approves it | b |
| 49 | Chấm công › Cần xử lý: số trên tab và số dòng = đơn chờ có ngày (trừ tạm ứng) của người đang làm | admin | admin › Chấm công › Cần xử lý lists every pending request… | b — **BUG-requests-9** |
| 50 | Duyệt giải trình từ Chấm công › Cần xử lý | dt-quan (giải trình) | admin › approving an explanation from Chấm công › Cần xử lý | b — **BUG-requests-9** |
| 51 | App điện thoại: số trên các tab lọc và các dòng khớp `/me` | dt-an | staff › phone: the filter counts and rows match my requests | b |
| 52 | App điện thoại: mở từng đơn (`?yc=`) thấy đúng trạng thái Admin thấy; iSAT ghi "Nghỉ Thứ Bảy (iSAT)" | dt-an, dt-khoa | staff › phone: each request opens with the status Admin sees | b |
| 53 | Máy tính (≥1136px): ô Yêu cầu có cùng danh sách, mở ngăn chi tiết đúng trạng thái | dt-an, dt-giang | staff › desktop: the Yêu cầu box shows the same list… | b |
| 54 | `?yc=` của đơn người khác không mở, tham số bị bỏ | dt-an (đơn của dt-binh) | staff › a request of someone else does not open | b, c |
| 55 | Đơn đã duyệt / từ chối / huỷ không có nút huỷ | dt-an | staff › approved, rejected and cancelled requests offer no cancel button | a, c |
| 56 | Đơn đang chờ có nút huỷ | dt-an | staff › a pending request can be cancelled from the app | a — **BUG-requests-10** |
| 57 | "Tạo yêu cầu" mở 6 loại đơn | dt-phu | staff › Tạo yêu cầu offers the six request kinds | a — **BUG-requests-11** |
| 58 | Ghi chú Admin khi từ chối hiện trong chi tiết đơn của nhân viên | dt-an | staff › the Admin note on a rejected request shows in my request detail | b — **BUG-requests-12** |
| 59 | Máy chủ tìm trường hợp giải trình từ giờ chấm. Ngày vào muộn: chỉ `LATE_CHECK_IN`, không lưu giờ. Ngày không chấm: Quên chấm công, lưu giờ 08:00/17:00 | dt-dung | api › the server finds the explanation cases of the seeded days… | a |
| 60 | Ngày không có giờ chấm: thiếu giờ thì 400 "Nhập giờ vào thực tế"; trường hợp client gửi bị bỏ qua; tiêu đề "Giải trình dd/MM" | dt-phu | api › a day without punches needs both actual times… | a |
| 61 | Ngày chấm đủ 08:00–17:00: "Ngày dd/MM không có gì cần giải trình" | dt-giang | api › a day with nothing to explain is refused | a |
| 62 | Danh sách cần giải trình của Admin có ngày Quên chấm công của dt-phu, không có ngày đã có đơn hay người đã nghỉ việc. Nhắc ngày đã có đơn: 400. Nhắc dt-phu: nhân viên thấy ngày đó ở `/me/today.reminders` | dt-phu, dt-dung, dt-nam | api › Admin sees the days that need an explanation and can remind… | a |
| 63 | `request-context`: khoảng ngày từ hôm nay tới hết tháng sau, đủ 6 loại, tạm ứng khoá "Chỉ nộp ngày 16 và 17", thực tập sinh không có Làm thêm giờ | dt-phu, dt-oanh | api › request-context opens today to the end of next month… | a |
| 64 | Xem trước: không hợp lệ thì `ok: false` cùng câu lỗi như khi tạo; hợp lệ thì có tiêu đề máy chủ đặt; không lưu gì; iSAT không có xem trước (404) | dt-phu | api › preview answers like create, sets the title and saves nothing | a, b |
| 65 | Xem trước trả 200 như hợp đồng | dt-phu | api › preview answers 200 as the contract says | a — **BUG-requests-13** |
| 66 | Mỗi tháng một đơn tạm ứng ("Tháng M đã có đơn tạm ứng"); không có ngày công 01–15 thì từ chối ("Chưa có ngày công 01–15/MM") | dt-giang, dt-phu | api › one advance per month, and none without work days… | a |

Mọi test giao diện còn kiểm không có lỗi console. Riêng #54 cho phép dòng "404" của trình duyệt, vì máy chủ trả 404 là đúng.

## Ghi SQL thẳng (không có route)

Không có. Seed chỉ dùng route:

- `POST /requests/<loại>` và `POST /me/requests/<loại>` để nộp.
- `PATCH /requests/:id/review` để duyệt hoặc từ chối.
- `PATCH /me/requests/:id/cancel` để huỷ.
- `POST /attendance/punches` (Admin chấm hộ) cho ngày vào muộn và ngày công 01–15 của dt-giang.
- `DELETE /employees/:username` để cho dt-nam nghỉ việc.

## Lỗi còn mở

### BUG-requests-7: id đơn sai dạng làm BE trả 500
- Tái hiện:
  - `GET /api/v2/requests/khong-co` (Admin) hoặc `GET /api/v2/me/requests/khong-co` (nhân viên) → 500.
  - Log BE: `invalid input syntax for type uuid: "khong-co"`.
  - Ba route PATCH cùng id đó trả 4xx.
- Đúng phải là: 400 hoặc 404 (bất biến: không có 500).
- File nghi ngờ: `src/modules/requests/requests.controller.ts` (`@Get(':id')`) và `GET requests/:id` trong `src/modules/me/me.controller.ts`. Cả hai chưa kiểm id là uuid trước khi truy vấn.
- Test: `demo-requests-api.spec.ts` › "a malformed request id never gives 500: GET /requests/khong-co", "… GET /me/requests/khong-co".

### BUG-requests-9: Chấm công › Cần xử lý luôn trống trên BE thật
- Tái hiện: có 14 đơn chờ có ngày; mở `/admin/cham-cong?xem=can-xu-ly` → số trên tab là "0", không có dòng nào.
- Đúng phải là: số trên tab = số dòng = số đơn chờ có ngày của người đang làm, khớp với chuông và Tổng quan (bất biến).
- File nghi ngờ:
  - `web/src/builders/api/attendance.ts:98`: `person.id` là username.
  - `web/src/builders/api/attendance.ts:171-173`: lọc bằng `byId.has(i.personId)`.
  - `web/src/builders/api/inbox.ts:163`: `personId = r.employeeId`, là uuid.
  - Lớp phủ "đơn chờ" trên lưới (`attendance.ts:139`) cũng khoá theo uuid, nên có thể cũng không hiện.
- Test: `demo-requests-admin.spec.ts` › "Chấm công › Cần xử lý lists every pending request that has days", "approving an explanation from Chấm công › Cần xử lý".

### BUG-requests-10: đơn đang chờ không huỷ được từ app nhân viên
- Tái hiện: dt-an mở đơn nghỉ đang chờ (`/nv/yeu-cau?yc=<id>`) → không có nút huỷ. BE đã có `PATCH /me/requests/:id/cancel`.
- Đúng phải là: có nút huỷ cho đơn đang chờ, không hỏi lý do (luật 05/11, spec 4.6).
- Phần FE của nhánh staff-requests chưa vào main (main aaa14d9 chỉ có BE).
- File nghi ngờ: `web/src/views/staff-phone/RequestsView.vue` (chi tiết đơn), `web/src/services/staff-phone.ts` (chưa gọi route huỷ).
- Test: `demo-requests-staff.spec.ts` › "a pending request can be cancelled from the app".

### BUG-requests-11: "Tạo yêu cầu" chưa mở form
- Tái hiện: dt-phu bấm "Tạo yêu cầu" → thông báo "Chưa có luồng tạo yêu cầu trong bản mockup."
- Đúng phải là: chọn được 6 loại: đơn nghỉ, nghỉ có làm bù, làm thêm giờ, đổi ca, giải trình, tạm ứng (luật 05/11). FE chưa vào main.
- File nghi ngờ: `web/src/views/staff-phone/RequestsView.vue:60`, `web/src/views/staff-desktop/parts/TodayColumn.vue:58`.
- Test: `demo-requests-staff.spec.ts` › "Tạo yêu cầu offers the six request kinds".

### BUG-requests-12: nhân viên không thấy ghi chú Admin khi bị từ chối
- Tái hiện: đơn nghỉ của dt-an bị từ chối với ghi chú "Tuần này đang chốt dự án, em đổi sang tuần sau nhé". `/me/requests/:id` có `reviewNote`, nhưng chi tiết đơn trong app không hiện ghi chú.
- Đúng phải là: hiện ghi chú. Hộp từ chối của Admin ghi "Nhân viên xem được ghi chú trong chi tiết yêu cầu" (bất biến giữa hai màn).
- File nghi ngờ: `web/src/builders/api/staff-phone.ts` (chi tiết đơn không mang `reviewNote`), `web/src/views/staff-phone/RequestsView.vue`.
- Test: `demo-requests-staff.spec.ts` › "the Admin note on a rejected request shows in my request detail".

### BUG-requests-13 (mới, nhẹ): xem trước trả 201 thay vì 200
- Tái hiện: dt-phu `POST /api/v2/me/requests/leave/preview` với một ngày hợp lệ → 201, thân `{ ok: true, … }`. Ngày không hợp lệ cũng 201, thân `{ ok: false, … }`.
- Đúng phải là: 200. Spec 2.2 ghi "Luôn trả 200"; `v2-contract.md` ghi "Luôn trả `200`".
- Nest mặc định trả 201 cho `@Post`. Đây là lệch hợp đồng; client chỉ kiểm mã 2xx thì không bị ảnh hưởng.
- File nghi ngờ: `src/modules/me/me.controller.ts` (`@Post('requests/:kind/preview')` thiếu `@HttpCode(200)`).
- Test: `demo-requests-api.spec.ts` › "preview answers 200 as the contract says".

## Đã sửa ở main aaa14d9

Đã bỏ `test.fail`. Test xanh ở lần chạy 05/11 trên 0bc17d9.

- **BUG-requests-1** — `/me` nhận đơn nghỉ ngày đã qua. Giờ trả 400 "Chỉ chọn ngày từ dd/MM đến dd/MM". Test #31.
- **BUG-requests-2** — `/me` nhận đơn nghỉ sau hết tháng sau. Giờ trả 400 với cùng câu lỗi. Test #32.
- **BUG-requests-3** — `/me` nhận OT giờ lẻ. Giờ trả 400 "Chỉ chọn giờ tròn". Test #33.
- **BUG-requests-4** — `/me` nhận tạm ứng ngoài ngày 16–17. Giờ trả 400 "Chỉ nộp tạm ứng ngày 16 và 17". Test #34.
- **BUG-requests-5** — số tiền tạm ứng lấy theo client. Giờ máy chủ tính; tiêu đề và lý do là "Tạm ứng lương tháng M". Test #35 và #66.
- **BUG-requests-8** — người đã nghỉ việc đọc lại là "nv". Giờ lưu đủ 5 trạng thái, đọc lại là `nghiviec`, thẻ "Nhân sự đang làm" không đếm. Test #37 và #44. Cùng nguyên nhân với BUG-staff-2.
- **BUG-requests-6 (bỏ khỏi danh sách lỗi)** — tháng đã chốt công vẫn nhận đơn nghỉ mới.
  - Nhân viên: đơn tự nộp cho tháng đã chốt (m1) giờ bị chặn, nhưng chặn bởi luật khoảng ngày. Câu "Tháng M đã chốt công" của `/me` chỉ chạm được khi chốt tháng này hoặc tháng sau; xem mục "Chưa phủ".
  - Admin: theo spec 2.3, route Admin "giữ hành vi hiện tại" nên vẫn nộp thay được đơn nghỉ cho tháng đã chốt. Đã bỏ test; điểm này chuyển thành câu hỏi Q2.
  - Giải trình: đổi chiều. Tháng đã chốt công thì không nộp được giải trình, cả Admin lẫn nhân viên (spec 3.1, 3.3). Test #39 và #40.

## Câu hỏi luật

App tham chiếu luong-app không còn ở `Downloads/luong-nhan-su-webapp`, nên chưa đối chiếu được. Không test nào assert các điểm này.

### Q1: Đơn đang chờ của người đã nghỉ việc
- Tình huống: dt-nam có một đơn nghỉ chờ duyệt cho một ngày của tháng sau. Admin cho dt-nam nghỉ việc ngày 05/11.
- Hiện tại v2:
  - Đơn vẫn ở hàng chờ (chuông, thẻ Tổng quan), Admin vẫn duyệt được, kể cả khi ngày nghỉ nằm sau ngày nghỉ việc.
  - Danh sách cần giải trình thì đã bỏ người nghỉ việc.
- Hỏi: khi cho nghỉ việc, đơn chờ có ngày sau ngày nghỉ việc có tự huỷ không, hay để Admin tự xử lý?

### Q2: Admin nộp thay đơn nghỉ cho tháng đã chốt công
- Tình huống: tháng 10 đã chốt công. Ngày 05/11, Admin nộp thay một đơn nghỉ việc riêng có lương cho dt-mai ngày 27/10 rồi duyệt.
- Hiện tại v2:
  - Nhận và duyệt được: spec 2.3 chỉ chặn tháng đã chốt ở route `/me`.
  - Giải trình của tháng đã chốt thì bị chặn ở cả hai route.
  - Duyệt đơn nghỉ là ghi lịch làm việc, nên ngày công của một tháng đã chốt có thể bị đổi sau khi chốt.
- Hỏi: Admin có được nộp thay hoặc duyệt đơn nghỉ, đổi ca, OT cho ngày của tháng đã chốt công không?

### Q3: Huỷ đơn của người khác trả 404 hay 409
- Tình huống: dt-phu gọi `PATCH /me/requests/<id đơn của dt-an>/cancel`.
- Hiện tại v2: bị từ chối với mã 4xx. Test chỉ kiểm "không huỷ được, đơn vẫn chờ", không kiểm mã cụ thể.
- Hỏi: không cần quyết ngay. Ghi lại để thống nhất mã lỗi; 404 thì không lộ là đơn có tồn tại.

## Chưa phủ
- **Đơn nghỉ đã duyệt hiện trên bảng công:** phiên attendance-core đang làm. Test ở đây không kiểm ô bảng công sau khi duyệt.
- **Giao diện mới của staff-requests chưa vào main** (BUG-requests-10, 11). Gồm:
  - form tạo 6 loại đơn và nút huỷ;
  - dòng "Đã nhắc lúc …" và nút "Nhắc giải trình" trong chuông;
  - dòng nhắc ở màn Hôm nay.
  - Phần BE của các luồng này đã test qua route (#59–#66). Khi FE vào main thì thêm test điền form.
- **Số tiền tạm ứng đúng công thức:** công thức là 80% × Σ(lương ngày − khấu trừ) của ngày công 01–15. Test chỉ kiểm số > 0, không lấy số client và mỗi tháng một đơn. Muốn kiểm đúng số phải biết lương ngày từ bộ tính lương, thuộc mảng payroll.
- **Câu "Tháng M đã chốt công" của `/me`:** chỉ chạm được khi chốt tháng này hoặc tháng sau. Chốt công là việc chung toàn công ty và main chưa có route mở khoá, nên không làm.
- **Chi tiết `request-context`:** test không kiểm từng ngày, khung giờ OT còn đặt được, `months`, `annualLeaveLeft`. Phiên staff-requests đã có test PostgreSQL thật cho các phần này.
- **Duyệt từ trang `/admin/yeu-cau*`:** trang này giờ chỉ chuyển về Tổng quan (#41). Duyệt và từ chối được test qua thẻ Tổng quan, chuông và hộp duyệt.
- **`test/v2/demo-requests-*`:** không viết, vì mọi luật đều kiểm được qua route.

## Ghi chú cho phần nền
- Trước commit 750e76a, `DemoSession.del` gửi không có thân nên `DELETE /employees/:username` trả 415. Phần nền đã sửa; seed giờ gọi `admin.del`.
