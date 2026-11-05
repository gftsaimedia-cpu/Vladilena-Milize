# Đơn từ (requests) — tình huống, lỗi, câu hỏi

Chạy: `npm run demo -- test requests` (DB `luong_demo_requests`, BE 3373, vite 4273). Lần chạy 05/11/2026 trên `claude/demo-db`
(main 7794025): 62 test xanh, trong đó 15 test `test.fail` là lỗi đã biết ở dưới. Log BE chỉ có hai lỗi 500 của BUG-requests-7.

- Người: `scripts/demo/people/requests.ts` (13 người `dt-`).
- Seed: `scripts/demo/areas/requests.ts`.
- Test:
  - `web/tests/api/demo-requests-api.spec.ts`: route BE.
  - `web/tests/api/demo-requests-admin.spec.ts`: màn Admin.
  - `web/tests/api/demo-requests-staff.spec.ts`: app nhân viên.
- Không có `test/v2/demo-requests-*`: mọi luật ở đây đều đi được qua route, không cần test PostgreSQL riêng.

## Ngày trong seed

Seed tính ngày theo hôm nay (`ctx.months`). m1 là tháng trước, m0 là tháng này, "tháng sau" là m0 + 1.

- **Đơn Admin nộp thay** nằm ở m1 (lịch sử đã duyệt / từ chối).
- **Đơn nhân viên tự nộp** nằm ở tháng sau. Luật 05/11 chỉ cho nộp từ hôm nay tới hết tháng sau, nên seed vẫn chạy được khi phiên staff-requests gộp luật đó.
- **Giải trình** nằm ở ngày đã qua (m1, đầu tuần 2 của m1 cho đơn tự nộp).
- **iSAT** dùng các Thứ Bảy sắp tới, bỏ ngày lễ.
- **Ngày làm việc** là Thứ Hai tới Thứ Bảy, trừ ngày lễ (`GET /holidays`). Khoảng nghỉ nhiều ngày lấy từ Thứ Hai.

Hai thứ dùng chung toàn công ty, test đổi tạm rồi trả lại:

- **Ngày lễ:** test thêm một ngày lễ, kiểm, rồi xoá trong `finally`. Ngày đó không trùng ngày của mảng khác vì chọn trong tuần 3–4 tháng sau.
- **Chốt công tháng m1:** khối `a locked month` ở cuối `demo-requests-api.spec.ts` khoá m1 (`POST /system/periods/:m1/lock`). Main chưa có route mở khoá, nên sau khi test chạy DB `luong_demo_requests` giữ m1 đã chốt. Lần `npm run demo -- test requests` sau dựng lại DB nên không ảnh hưởng. Trên DB `luong_demo_all`, nếu mảng payroll cần m1 chưa chốt thì cần biết điều này.

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
| 17 | OT vào ngày nghỉ bị từ chối | dt-lam | api › OT on a leave day is refused | a |
| 18 | Đổi ca phủ ngày nghỉ: nhận, cảnh báo, ngày nghỉ vẫn là nghỉ | dt-lam | api › a shift change over a leave day is accepted… | a |
| 19 | Nộp đơn nghỉ vào ngày đang có đổi ca chờ: được | dt-chi | api › a leave can be filed on a day with a pending shift change | a |
| 20 | OT và nghỉ có làm bù không chung một tháng | dt-hoa, dt-binh | api › OT and leave-with-makeup cannot share a month | a |
| 21 | Nghỉ có làm bù cần đúng 8 giờ bù, mọi giờ bù sau ngày nghỉ | dt-hoa | api › leave-with-makeup needs exactly 8 makeup hours… | a |
| 22 | Ngày lễ thêm trước khi duyệt: đơn nghỉ 3 ngày còn 2 ngày | dt-lam | api › a holiday added before approval leaves the leave with fewer days | a |
| 23 | Đơn nghỉ 1 ngày mà ngày đó thành ngày lễ: không duyệt được (409) | dt-lam | api › a leave whose only day became a holiday cannot be approved | a |
| 24 | Nghỉ có làm bù mà ngày nghỉ thành ngày lễ: không duyệt được (409) | dt-lam | api › a leave-with-makeup whose leave day became a holiday… | a |
| 25 | iSAT cho Thứ Bảy đã qua, hôm nay, ngày thường: từ chối (Admin và /me) | dt-khoa, dt-phu | api › iSAT is refused for a past Saturday, for today and for a weekday | a |
| 26 | iSAT tự đánh giá dưới 4/4: lưu thành từ chối, ghi chú "chưa đạt" | dt-khoa | api › an iSAT self-assessment under 4/4 is saved as rejected… | a |
| 27 | iSAT thứ hai cho cùng Thứ Bảy bị từ chối | dt-khoa | api › a second iSAT for the same Saturday is refused | a |
| 28 | Thực tập sinh không nộp được OT, iSAT | dt-oanh | api › interns cannot file OT or iSAT | a |
| 29 | Giải trình ngày đã bị từ chối không nộp lại được; ngày đã huỷ thì nộp lại được | dt-dung | api › a rejected explanation day cannot be filed again… | a |
| 30 | Giải trình cho ngày tương lai bị từ chối | dt-dung | api › an explanation for a future day is refused | a |
| 31 | `/me` không nhận đơn nghỉ ngày đã qua | dt-phu | api › staff cannot file a leave for a day before today | a — **BUG-requests-1** |
| 32 | `/me` không nhận đơn nghỉ sau hết tháng sau | dt-phu | api › staff cannot file a leave after the end of next month | a — **BUG-requests-2** |
| 33 | `/me` OT chỉ nhận giờ tròn | dt-phu | api › staff OT must start and end on the hour | a — **BUG-requests-3** |
| 34 | `/me` tạm ứng chỉ nộp ngày 16–17 (test bỏ qua khi chạy đúng ngày 16, 17) | dt-phu | api › staff can file an advance only on the 16th and 17th | a — **BUG-requests-4** |
| 35 | Số tiền tạm ứng do máy chủ tính, không lấy số client gửi | dt-phu | api › the advance amount is set by the server, not by the client | a — **BUG-requests-5** |
| 36 | Người đã nghỉ việc: còn đọc được đơn (1 duyệt, 1 chờ), đơn chờ vẫn trong hàng chờ | dt-nam | api › a resigned employee keeps readable requests… | b |
| 37 | Người đã nghỉ việc đọc lại là "Đã nghỉ việc" | dt-nam | api › a resigned employee reads back as Đã nghỉ việc | b — **BUG-requests-8** |
| 38 | Tháng đã chốt công: Admin vẫn duyệt / từ chối được đơn chờ của tháng đó | dt-mai | api › a locked month › Admin can still approve and reject… | a |
| 39 | Tháng đã chốt công: vẫn nộp được giải trình | dt-mai | api › a locked month › an explanation for a day of a locked month… | a |
| 40 | Tháng đã chốt công: không nhận đơn nghỉ mới (Admin và nhân viên) | dt-mai | api › a locked month › no new leave can be filed for a locked month… | a — **BUG-requests-6** |
| 41 | `/admin/yeu-cau`, `/admin/yeu-cau/moi-thang` mở Tổng quan, giữ `?thang` | admin | admin › the old request addresses open Tổng quan and keep the month | b |
| 42 | Tổng quan: "Còn N việc", thẻ "Yêu cầu chờ duyệt", số trên thẻ duyệt, số dòng, tổng nhóm, nhãn chuông đều bằng số đơn chờ | admin | admin › Tổng quan request numbers match the pending queue | b |
| 43 | Tổng quan: thẻ nhân sự, có mặt hôm nay, chấm công, quỹ lương khớp API | admin | admin › Tổng quan staff, attendance and payroll cards agree… | b |
| 44 | Nhân sự đang làm không đếm người đã nghỉ việc | dt-nam | admin › Nhân sự đang làm does not count a resigned employee | b — **BUG-requests-8** |
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

Mọi test giao diện còn kiểm không có lỗi console (riêng #54 cho phép dòng "404" của trình duyệt, vì máy chủ trả 404 là đúng).

## Ghi SQL thẳng (không có route)

Không có. Seed chỉ dùng route:

- `POST /requests/<loại>` và `POST /me/requests/<loại>` để nộp.
- `PATCH /requests/:id/review` để duyệt hoặc từ chối.
- `PATCH /me/requests/:id/cancel` để huỷ.
- `DELETE /employees/:username` để cho dt-nam nghỉ việc.

## Lỗi

### BUG-requests-1: `/me` nhận đơn nghỉ cho ngày đã qua
- Tái hiện: dt-phu `POST /me/requests/leave` cho ngày làm việc gần nhất trước hôm nay → 201.
- Đúng phải là: 400 (luật 05/11: mọi đơn trừ giải trình chỉ chọn từ hôm nay). Phiên staff-requests đang làm.
- File nghi ngờ: `src/modules/me/me.controller.ts`, `src/modules/requests/requests.service.ts` (chưa có kiểm khoảng ngày cho đơn tự nộp).
- Test: `demo-requests-api.spec.ts` › "staff cannot file a leave for a day before today".

### BUG-requests-2: `/me` nhận đơn nghỉ sau hết tháng sau
- Tái hiện: dt-phu nộp đơn nghỉ vào một ngày làm việc của tháng m0 + 2 → 201.
- Đúng phải là: 400 (luật 05/11: xa nhất là hết tháng sau). Phiên staff-requests đang làm.
- File nghi ngờ: như BUG-requests-1.
- Test: `demo-requests-api.spec.ts` › "staff cannot file a leave after the end of next month".

### BUG-requests-3: `/me` nhận OT giờ lẻ
- Tái hiện: dt-phu nộp OT 18:30–20:30 → 201.
- Đúng phải là: 400 (luật 05/11: OT và giờ bù chỉ giờ tròn). Phiên staff-requests đang làm.
- File nghi ngờ: `src/modules/requests/requests.service.ts` (kiểm giờ OT).
- Test: `demo-requests-api.spec.ts` › "staff OT must start and end on the hour".

### BUG-requests-4: `/me` nhận tạm ứng ngoài ngày 16–17
- Tái hiện: chạy ngày 05/11, dt-phu `POST /me/requests/advance` → 201.
- Đúng phải là: 400 (luật 05/11: chỉ nộp ngày 16 và 17). Phiên staff-requests đang làm.
- File nghi ngờ: `src/modules/requests/requests.service.ts` (`createAdvance`, quanh dòng 639).
- Test: `demo-requests-api.spec.ts` › "staff can file an advance only on the 16th and 17th".

### BUG-requests-5: số tiền tạm ứng lấy theo client gửi
- Tái hiện: Admin `POST /requests/advance` cho dt-phu với `amount: 987654321` → 201, đơn lưu đúng 987.654.321.
- Đúng phải là: máy chủ tự tính 80% × lương ngày công 01–15, ô số tiền chỉ đọc (luật 05/11). Phiên staff-requests đang làm.
- File nghi ngờ: `src/modules/requests/requests.service.ts:646` (`amount: input.amount`).
- Test: `demo-requests-api.spec.ts` › "the advance amount is set by the server, not by the client".

### BUG-requests-6: tháng đã chốt công vẫn nhận đơn nghỉ mới
- Tái hiện: `POST /system/periods/<m1>/lock`; rồi Admin nộp đơn nghỉ cho dt-mai và dt-mai tự nộp (`/me`) cho một ngày của m1 → cả hai 201.
- Đúng phải là: 400 (luật 05/11: tháng đã chốt công không chọn được; chỉ còn giải trình). Phiên staff-requests và period-lifecycle đang làm.
- File nghi ngờ: `src/modules/requests/requests.service.ts` (không đọc trạng thái kỳ khi nộp).
- Test: `demo-requests-api.spec.ts` › "a locked month › no new leave can be filed for a locked month, by Admin or by the employee".

### BUG-requests-7: id đơn sai dạng làm BE trả 500
- Tái hiện: `GET /api/v2/requests/khong-co` (Admin) hoặc `GET /api/v2/me/requests/khong-co` (nhân viên) → 500. Log BE: `invalid input syntax for type uuid: "khong-co"`. Ba route PATCH cùng id đó trả 4xx.
- Đúng phải là: 400 hoặc 404 (bất biến: không có 500).
- File nghi ngờ: `src/modules/requests/requests.controller.ts:183` và `GET :id` trong `src/modules/me/me.controller.ts` (chưa kiểm id là uuid trước khi truy vấn).
- Test: `demo-requests-api.spec.ts` › "a malformed request id never gives 500: GET /requests/khong-co", "… GET /me/requests/khong-co".

### BUG-requests-8: người đã nghỉ việc đọc lại là "nv"
- Tái hiện: `DELETE /employees/dt-nam`. Tài khoản bị khoá và `resignedOn` được ghi, nhưng `GET /employees` trả `contract.status = 'nv'`. DB lưu `contract_status = NULL`.
- Đúng phải là: `nghiviec` (bất biến: cái vừa ghi phải đọc lại được).
- Hệ quả: thẻ "Nhân sự đang làm" ở Tổng quan vẫn đếm dt-nam; tab Cần xử lý cũng coi dt-nam là người đang làm.
- File nghi ngờ:
  - `src/modules/employees/employees.service.ts:79` ghi `status: 'nghiviec'`.
  - `migrations/postgres/schema.sql`: `contract_status` CHECK chỉ nhận `probation`/`official`.
  - `src/modules/employees/employees.repository.ts:123`: đọc NULL thành `nv`.
- Test: `demo-requests-api.spec.ts` › "a resigned employee reads back as Đã nghỉ việc"; `demo-requests-admin.spec.ts` › "Nhân sự đang làm does not count a resigned employee". Cùng nguyên nhân với BUG-staff-2 (`docs/demo-db/staff.md`): sửa một chỗ thì cả hai hết.

### BUG-requests-9: Chấm công › Cần xử lý luôn trống trên BE thật
- Tái hiện: có 14 đơn chờ có ngày; mở `/admin/cham-cong?xem=can-xu-ly` → số trên tab "0", không có dòng nào.
- Đúng phải là: số trên tab = số dòng = số đơn chờ có ngày của người đang làm, như chuông và Tổng quan (bất biến).
- File nghi ngờ:
  - `web/src/builders/api/attendance.ts:98`: `person.id` là username.
  - `web/src/builders/api/attendance.ts:171-173`: lọc `byId.has(i.personId)`.
  - `web/src/builders/api/inbox.ts:163`: `personId = r.employeeId`, là uuid.
  - Lớp phủ "đơn chờ" trên lưới (`attendance.ts:139`) cũng khoá theo uuid nên có thể cũng không hiện.
- Test: `demo-requests-admin.spec.ts` › "Chấm công › Cần xử lý lists every pending request that has days", "approving an explanation from Chấm công › Cần xử lý".

### BUG-requests-10: đơn đang chờ không huỷ được từ app nhân viên
- Tái hiện: dt-an mở đơn nghỉ đang chờ (`/nv/yeu-cau?yc=<id>`) → không có nút huỷ. BE đã có `PATCH /me/requests/:id/cancel`.
- Đúng phải là: có nút huỷ cho đơn đang chờ, không hỏi lý do (luật 05/11). Phiên staff-requests đang làm.
- File nghi ngờ: `web/src/views/staff-phone/RequestsView.vue` (chi tiết đơn), `web/src/services/staff-phone.ts` (chưa gọi route huỷ).
- Test: `demo-requests-staff.spec.ts` › "a pending request can be cancelled from the app".

### BUG-requests-11: "Tạo yêu cầu" chưa mở form
- Tái hiện: dt-phu bấm "Tạo yêu cầu" → thông báo "Chưa có luồng tạo yêu cầu trong bản mockup."
- Đúng phải là: chọn được 6 loại (đơn nghỉ, nghỉ có làm bù, làm thêm giờ, đổi ca, giải trình, tạm ứng — luật 05/11). Phiên staff-requests đang làm.
- File nghi ngờ: `web/src/views/staff-phone/RequestsView.vue:60`, `web/src/views/staff-desktop/parts/TodayColumn.vue:58`.
- Test: `demo-requests-staff.spec.ts` › "Tạo yêu cầu offers the six request kinds".

### BUG-requests-12: nhân viên không thấy ghi chú Admin khi bị từ chối
- Tái hiện: đơn nghỉ của dt-an bị từ chối với ghi chú "Tuần này đang chốt dự án, em đổi sang tuần sau nhé". `/me/requests/:id` có `reviewNote`, nhưng chi tiết đơn trong app không hiện ghi chú.
- Đúng phải là: hiện ghi chú. Hộp từ chối của Admin ghi "Nhân viên xem được ghi chú trong chi tiết yêu cầu" (bất biến giữa hai màn).
- File nghi ngờ: `web/src/builders/api/staff-phone.ts` (chi tiết đơn không mang `reviewNote`), `web/src/views/staff-phone/RequestsView.vue`.
- Test: `demo-requests-staff.spec.ts` › "the Admin note on a rejected request shows in my request detail".

## Câu hỏi luật

App tham chiếu luong-app không còn ở `Downloads/luong-nhan-su-webapp`, nên các câu dưới chưa đối chiếu được với luong-app. Không test nào assert các điểm này.

### Q1: Đơn đang chờ của người đã nghỉ việc
- Tình huống: dt-nam có một đơn nghỉ chờ duyệt cho một ngày của tháng sau. Admin cho dt-nam nghỉ việc ngày 05/11.
- Hiện tại v2: đơn vẫn ở hàng chờ (chuông, thẻ Tổng quan), Admin vẫn duyệt được, kể cả ngày nghỉ nằm sau ngày nghỉ việc.
- Hỏi: khi cho nghỉ việc, đơn chờ có ngày sau ngày nghỉ việc có tự huỷ không? Hay vẫn để Admin tự xử lý?

### Q2: Admin nộp thay ngoài khoảng "hôm nay → hết tháng sau"
- Tình huống: ngày 05/11, Admin nộp thay một đơn nghỉ cho dt-an ngày 06/10 (tháng trước, chưa chốt công).
- Hiện tại v2: route Admin `POST /requests/leave` nhận, không giới hạn ngày. Seed dùng đúng điều này để có lịch sử tháng trước.
- Luật 05/11 nói về đơn nhân viên tự nộp.
- Hỏi: giới hạn ngày có áp cho Admin nộp thay không? Nếu có, seed phải chuyển lịch sử sang ghi SQL thẳng.

### Q3: Huỷ đơn của người khác trả 404 hay 409
- Tình huống: dt-phu gọi `PATCH /me/requests/<id đơn của dt-an>/cancel`.
- Hiện tại v2: bị từ chối với mã 4xx. Test chỉ kiểm "không huỷ được, đơn vẫn chờ", không kiểm mã cụ thể.
- Hỏi: không cần quyết định ngay. Ghi lại để phiên staff-requests thống nhất mã lỗi (404 thì không lộ là đơn có tồn tại).

## Chưa phủ
- **Đơn nghỉ đã duyệt hiện trên bảng công:** phiên attendance-core đang làm. Test ở đây không kiểm ô bảng công sau khi duyệt.
- **Nhắc giải trình và "Khai thay giờ" trong chuông:** luật 05/11 bỏ khai thay, giữ nhắc. Main chưa có "Đã nhắc lúc …", nên chưa test.
- **Form tạo đơn và huỷ trên app nhân viên:** chưa có trên main (BUG-requests-10, 11). Khi phiên staff-requests gộp, cần thêm test điền form cho 6 loại.
- **Số tiền tạm ứng tính từ ngày công:** dt-giang không có bảng công nên chưa kiểm được số đúng. Chỉ kiểm "không lấy số client gửi" (BUG-requests-5).
- **Seed sẽ gãy sau khi gộp staff-requests:**
  - Seed tạm ứng của dt-giang: Admin nộp với số tiền tự đặt. Nếu máy chủ tự tính, dt-giang không có công nên số tiền là 0 và có thể bị từ chối.
  - Hai đơn tạm ứng tháng m0 (một huỷ, một chờ) có thể đụng luật "một đơn mỗi tháng".
  - iSAT tự nộp qua `/me` có thể bị bỏ, vì luật 05/11 để iSAT ra khỏi menu nhân viên.
- **Duyệt từ trang `/admin/yeu-cau*`:** trang này giờ chỉ chuyển về Tổng quan (#41). Duyệt và từ chối được test qua thẻ Tổng quan, chuông và hộp duyệt.
- **`test/v2/demo-requests-*`:** không viết. Mọi luật đều đi được qua route.

## Ghi chú cho phần nền
- `DemoSession.del` (scripts/demo/api.ts) gửi không có thân, nên `DELETE /employees/:username` trả 415. Seed gọi `admin.call('DELETE', …, {})` để tránh. Commit 750e76a đã sửa `del` để gửi thân JSON; seed vẫn để `call` cho chắc.
