# Attendance — tình huống, lỗi, câu hỏi

Mảng **attendance** của [DB demo và test đầu-cuối](README.md): Chấm công Admin (`/admin/cham-cong` và các đường dẫn cũ), Chốt công, Lịch lễ (`/admin/cai-dat/lich`), app nhân viên `/nv/hom-nay` và `/nv/cham-cong` (điện thoại 390px và máy tính ≥ 1136px), route BE `attendance`, `holidays`, `me` (phần chấm công), `system/periods`.

- Chạy: `npm run demo -- test attendance`.
- Người: [scripts/demo/people/attendance.ts](../../scripts/demo/people/attendance.ts) (12 người `cc-*`) và `attendancePlan()`: lịch giờ chấm từng ngày, tính theo ngày chạy. Seed: [scripts/demo/areas/attendance.ts](../../scripts/demo/areas/attendance.ts).
- Spec:
  - [demo-attendance-rules.spec.ts](../../web/tests/api/demo-attendance-rules.spec.ts): từng ngày chấm so với luật, qua API (`timesheets/:id/:date`, `/me/attendance`), lỗi đầu vào, quyền;
  - [demo-attendance-admin.spec.ts](../../web/tests/api/demo-attendance-admin.spec.ts): màn Chấm công Admin (lưới tuần, hồ sơ một người, hộp ngày) so với app nhân viên;
  - [demo-attendance-staff.spec.ts](../../web/tests/api/demo-attendance-staff.spec.ts): check-in, check-out hôm nay và màn Chấm công của nhân viên;
  - [demo-attendance-period.spec.ts](../../web/tests/api/demo-attendance-period.spec.ts): Chốt công và Lịch lễ.
  - [test/v2/demo-attendance-period.pg.test.ts](../../test/v2/demo-attendance-period.pg.test.ts): hai luật chốt công không thử được trên DB dùng chung (chạy trên DB tạm, cần `PG_TEST_URL`).
- Mỗi trang mở trong test có `guard(page)`: không lỗi JS, không lỗi console, không route `/api` nào trả 5xx (bất biến b).
- Lần chạy 05/11/2026:
  - `npm run demo -- test attendance`: 80 test Playwright xanh (`expected: 80, unexpected: 0`). Trong đó 57 test đạt thật; 23 test `test.fail` hỏng đúng ở assert của lỗi, đã đọc lý do từng test trong báo cáo JSON.
  - `PG_TEST_URL=postgres://postgres@127.0.0.1:55480/postgres node --import tsx --test test/v2/demo-attendance-period.pg.test.ts`: 2 todo, 0 fail.
  - Chưa chạy bản `all` (`npm run demo -- test`).

**Nguồn luật (a):** luật ngày công người dùng chốt ngày 04–05/11/2026 (memory "Confirmed ngày công rules", không đọc `spec/` v1):
- giải trình khi vào trễ hơn 15 phút, về sớm bất kỳ, thiếu giờ vào hoặc giờ ra, vào sớm hơn 15 phút, ra muộn hơn 15 phút không có OT; ra muộn hơn 30 phút là "quên check-out"; trễ tới 15 phút là hợp lệ, không trừ;
- ngày có lịch mà không chấm là ngày vắng; ngày vắng phải tách khỏi ngày chưa có chấm công (05/11);
- ngày lễ lấy từ một lịch lễ chung của công ty; Chủ nhật không bao giờ là ngày làm; tts làm thứ Hai – thứ Sáu;
- một lần vào, một lần ra mỗi ngày; ra giữa ca rồi vào lại không được phép (04/11);
- vòng kỳ lương: Chốt công chỉ sau khi hết tháng; tháng đã chốt thì không chấm, không sửa (đề bài của phiên điều phối).

## Ngày trong lần chạy 05/11/2026

`attendancePlan()` tính lại mỗi lần chạy. Với ngày chạy 05/11/2026: m1 = 10/2026, m3 = 08/2026.
Ngày lễ seed 14/10 (thứ Tư thứ hai của m1). cc-giua-thang vào làm 19/10. cc-nghi-viec nghỉ việc từ 16/10.
cc-tre: trễ 16 phút 03/10, trễ 40 phút 05/10, vào 12:00 06/10, về sớm 1 phút 07/10, về 16:30 08/10, trễ và sớm 09/10, vào 07:40 10/10, ra 17:20 12/10, ra 17:45 13/10, trễ 40 phút thứ Ba tuần trước (27/10).
cc-thieu: thiếu giờ ra 02/10, thiếu giờ vào 03/10, ra rồi vào lại 05/10, vắng 06/10 và thứ Bảy 10/10.

## Tình huống

Cột "Loại" là loại assert: (a) luật đã chốt, (b) bất biến, (c) thao tác sai không hiện ra. Test đánh dấu `test.fail` ghi kèm mã lỗi.

### Một ngày chấm công so với luật (`demo-attendance-rules.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 1 | Vào 07:55, ra 17:05 ca 08–17: ngày hợp lệ, không trễ, không sớm | cc-dung-gio | cc-dung-gio: vào 07:55, ra 17:05… | (a) |
| 2 | Vào trễ đúng 15 phút: hợp lệ, không tính phút trễ | cc-tre | cc-tre: vào trễ đúng 15 phút… | (a) |
| 3 | Vào trễ 16 phút: giải trình, trễ 16 | cc-tre | cc-tre: vào trễ 16 phút… | (a) |
| 4 | Vào 08:40: giải trình, trễ 40 | cc-tre | cc-tre: vào 08:40 ca 08–17… | (a) |
| 5 | Vào 12:00, ra 17:00: trễ 240, ra đúng giờ | cc-tre | cc-tre: vào 12:00 ca 08–17… | (a) — BUG-attendance-1 |
| 6 | Về sớm 1 phút: giải trình | cc-tre | cc-tre: về sớm 1 phút… | (a) |
| 7 | Về 16:30: giải trình, sớm 30 | cc-tre | cc-tre: về 16:30… | (a) |
| 8 | Vào 08:20, ra 16:40: trễ 20 và sớm 20 | cc-tre | cc-tre: vào 08:20 ra 16:40… | (a) |
| 9 | Vào 07:40 (sớm hơn 15 phút): giải trình | cc-tre | cc-tre: vào 07:40… | (a) |
| 10 | Ra 17:20 không OT: giải trình | cc-tre | cc-tre: ra 17:20 không có OT… | (a) — BUG-attendance-2 |
| 11 | Ra 17:45: quên check-out, giải trình | cc-tre | cc-tre: ra 17:45… | (a) |
| 12 | Có giờ vào, thiếu giờ ra (ngày đã qua): giải trình | cc-thieu | cc-thieu: có giờ vào, thiếu giờ ra… | (a) |
| 13 | Thiếu giờ vào, ra 17:00: giải trình, giờ ra vẫn đúng giờ | cc-thieu | cc-thieu: thiếu giờ vào, ra 17:00… | (a) — BUG-attendance-1 |
| 14 | Ra 10:00, vào lại 10:30, ra 17:00: lần ra giữa ca là về sớm | cc-thieu | cc-thieu: ra 10:00 rồi vào lại 10:30… | (a) — BUG-attendance-3 |
| 15–17 | Ca Flex 13–22: đúng giờ; trễ 40; về sớm 30 | cc-flex | cc-flex: ca Flex 13–22… | (a) |
| 18–21 | Ca Night 22–07: đúng giờ (ra 07:00 sáng hôm sau); trễ 40; về 06:30 sớm 30; thiếu giờ ra | cc-dem | cc-dem: ca Night 22–07… | (a) |
| 22 | Ca Night: cả hai lần chấm nằm trong ngày bắt đầu ca; `/me` cho ngày đó "đi làm" 21:55–07:00 | cc-dem | ca Night: cả hai lần chấm… | (b) |
| 23 | Tính lại một ngày đã có cho cùng kết quả | cc-tre | tính lại một ngày đã có… | (b) |
| 24 | nv không chấm thứ Bảy: vắng | cc-thieu | nv vắng một thứ Bảy… | (a) |
| 25 | nv không chấm ngày thường: vắng | cc-thieu | nv vắng một ngày thường… | (a) |
| 26 | Ngày lễ công ty: nghỉ lễ, không vắng | cc-dung-gio | ngày lễ công ty trên ngày làm… | (a) — BUG-attendance-5 |
| 27 | tts: thứ Bảy không phải ngày vắng | cc-tts | thứ Bảy của thực tập sinh… | (a) — BUG-attendance-7 |
| 28 | Chủ nhật có giờ chấm: không tính ngày công | cc-chu-nhat | Chủ nhật có giờ chấm… | (a) — BUG-attendance-4 |
| 29 | Vào làm giữa tháng: ngày trước ngày vào không phải vắng | cc-giua-thang | người vào làm giữa tháng… | (a) — BUG-attendance-6 |
| 30 | Nghỉ việc: ngày sau ngày nghỉ không phải vắng; chính ngày nghỉ vẫn là ngày làm | cc-nghi-viec | người nghỉ việc… | (a) — BUG-attendance-6 |
| 31 | Ca Night hôm nay chưa tới giờ: không phải vắng | cc-dem | ca Night chưa bắt đầu (hôm nay)… | (a) — BUG-attendance-8 |
| 32 | Ngày không có thật (2026-02-30, abc) trong đường dẫn, tham số: 4xx | — | ngày không có thật… | (b) — BUG-attendance-10 |
| 33 | Tính lại ngày chưa có lịch: 4xx | cc-hom-nay | tính lại một ngày chưa có lịch… | (b) — BUG-attendance-11 |
| 34 | Thiếu tham số, sai loại chấm, ngày chưa có dòng công, tháng sai dạng: 400 / 404 | cc-hom-nay | thiếu tham số hay sai loại… | (b) |
| 35 | Nhân viên gọi route Admin (bảng công, chấm hộ, tính lại, chốt công, thêm, bỏ ngày lễ): 403 | cc-hom-nay | nhân viên không gọi được route… | (b) |

### Màn Chấm công Admin (`demo-attendance-admin.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 36 | Đường dẫn cũ `hom-nay`, `bang-cong`, `phep-con-lai` → màn tuần; `sua-gio`, `gio-ot` → `?xem=can-xu-ly`; `ca-lam` → Nhân sự `?loc=chua-co-ca`; màn tuần mở được | admin | các đường dẫn cũ… | (b) |
| 37 | Lưới tuần: ô các ngày đã qua (từ thứ Ba tuần trước) cùng trạng thái, cùng giờ như `/me` | cc-dung-gio, cc-tre | lưới tuần: ngày đã qua… | (b) |
| 38 | Cột "Công kỳ" = số ngày công tháng này ở `/me` | cc-dung-gio, cc-tre, cc-giua-thang, cc-thieu | lưới tuần: cột "Công kỳ"… | (b) |
| 39 | Hôm nay chưa chấm: Admin và `/me` cùng trạng thái | cc-dem | hôm nay chưa chấm… | (b) — BUG-attendance-8 |
| 40 | Hồ sơ tháng trước, "Ngày đi làm" = số ngày công ở `/me` (mỗi người có công tháng trước) | 9 người | hồ sơ chấm công tháng trước của … | (b) |
| 41 | "Lần đi muộn" = `/me` khi có cả ngày về sớm | cc-tre | "Lần đi muộn"… (người có cả ngày về sớm) | (b) — BUG-attendance-9 |
| 42 | "Lần đi muộn" = `/me` khi chỉ có ngày vào trễ | cc-dung-gio, cc-giua-thang | "Lần đi muộn"… khi chỉ có ngày vào trễ | (b) |
| 43 | "Bảng giờ": giờ vào, giờ ra từng ngày = `/me` | cc-tre | "Bảng giờ"… | (b) |
| 44 | Ca Night: ngày có giờ ra sáng hôm sau hiện đủ giờ | cc-dem | hồ sơ chấm công ca Night… | (b) |
| 45 | Hộp chi tiết ngày (bấm dải tháng): "Đi muộn", giờ vào, giờ ra = `/me` | cc-tre | hộp chi tiết ngày… | (b) |
| 46 | Dải tháng: ngày lễ hiện "Nghỉ lễ", không "Vắng" | cc-dung-gio | ngày lễ công ty hiện là nghỉ lễ… | (a) — BUG-attendance-5 |

### App nhân viên (`demo-attendance-staff.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 47 | Điện thoại, chưa check-in: thẻ ca chỉ có nút Check-in | cc-hom-nay | chưa check-in… | (c) |
| 48 | Check-in: "Đang trong ca", hết nút Check-in, có Check-out; giờ vào = ô hôm nay ở lưới Admin (kèm "đang làm") | cc-hom-nay | check-in: thẻ ca "Đang trong ca"… | (c), (b) |
| 49 | Đã check-in: BE từ chối check-in lần nữa | cc-hom-nay | đã check-in: BE từ chối… | (a) — BUG-attendance-12 |
| 50 | Check-out: "Đã check-out", không còn nút; giờ = lưới Admin | cc-hom-nay | check-out: thẻ ca "Đã check-out"… | (c), (b) |
| 51 | Đã check-out: BE từ chối check-in lại | cc-hom-nay | đã check-out: BE từ chối check-in lại… | (a) — BUG-attendance-12 |
| 52 | Máy tính 1280px: Check-in rồi Check-out, mỗi lúc đúng một nút; "Gần đây" hiện giờ hôm nay | cc-may-tinh | cột Hôm nay… | (c), (b) |
| 53 | Điện thoại, tháng trước: ô ngày trễ 40 phút ghi "đi muộn"; hộp ngày: giờ vào, giờ ra, số phút trễ = bảng công Admin | cc-tre | điện thoại, Chấm công tháng trước… | (b) |
| 54 | Máy tính, `?ngay=` mở ngăn kéo cùng giờ, cùng số phút trễ | cc-tre | máy tính, ?ngay=… | (b) |
| 55 | Ca Night trên lịch tháng: "đi làm", giờ ra 07:00 | cc-dem | điện thoại: lịch tháng ca Night… | (b) |
| 56 | tts: dòng ca ghi "thứ Hai – thứ Sáu" | cc-tts | thực tập sinh: dòng ca… | (a) — BUG-attendance-7 |
| 57 | Tháng này: "Ngày công X / …" với X = số ngày đã đi làm | cc-dung-gio | tháng này: số "Ngày công"… | (b) |
| 57b | Tên lịch tháng và ô số cho trình đọc màn hình ghi đúng tháng đang xem (tháng này và tháng trước) | cc-dung-gio | lịch tháng và ô số: tên cho trình đọc màn hình… | (b) — BUG-attendance-17 |

### Chốt công và Lịch lễ (`demo-attendance-period.spec.ts`, `demo-attendance-period.pg.test.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 58 | Tháng đang chạy: không có nút "Chốt công" | admin | tháng này chưa hết… | (c) — BUG-attendance-13 |
| 59 | Tháng trước: nút "Chốt công" có khi và chỉ khi tháng chưa chốt (theo `/system/periods`) | admin | tháng trước: nút "Chốt công"… | (c) |
| 60 | m3 trước khi chốt: app nhân viên "Kỳ công đang mở" | cc-chot | trước khi chốt… | (b) |
| 61 | Admin bấm "Chốt công" m3, đồng ý hộp xác nhận: báo đã chốt, nút biến mất, `/system/periods` ghi `attendance_locked` | admin | Admin bấm "Chốt công"… | (b), (c) |
| 62 | m3 sau khi chốt: app nhân viên "Kỳ công đã chốt" | cc-chot | sau khi chốt… | (b) |
| 63 | Tháng đã chốt: BE từ chối Admin chấm hộ | cc-chot | tháng đã chốt: BE từ chối Admin chấm hộ | (a) — BUG-attendance-14 |
| 64 | Tháng đã chốt: BE từ chối tính lại | cc-chot | …tính lại bảng công | (a) — BUG-attendance-14 |
| 65 | Tháng đã chốt: BE từ chối thêm ngày lễ | — | …thêm ngày lễ vào tháng đó | (a) — BUG-attendance-14 |
| 66 | Lịch năm có ngày lễ seed: "N ngày lễ" = `/holidays`, có ô ngày lễ seed | admin | năm có ngày lễ seed… | (b) |
| 67 | "Thêm các ngày lễ cố định" (năm + 3): đủ 1/1, 30/4, 1/5, 2/9; bấm lần nữa báo đã có đủ, không trùng | admin | "Thêm các ngày lễ cố định"… | (a), (b) |
| 68 | Nút ✕ bỏ đúng một ngày lễ | admin | nút ✕ của một ngày lễ… | (b) |
| 69 | Hộp "Thêm ngày lễ": nút khoá tới khi có ngày và tên, khoá khi đến ngày < từ ngày; thêm 2 ngày liền, bỏ cả khoảng | admin | hộp "Thêm ngày lễ"… | (c), (b) |
| 70 | Bấm ngày đã là ngày lễ: không mở hộp thêm trùng | admin | bấm vào ngày đã là ngày lễ… | (c) — BUG-attendance-15 |
| 71 | API ngày lễ: ngày sai, thiếu tên, năm sai, thêm cố định năm sai, bỏ ngày không có, thêm trùng: 4xx | — | API ngày lễ: dữ liệu sai… | (b) |
| 72 | `lockPeriod` từ chối tháng đang chạy | — | lockPeriod refuses the month that is still running | (a) — BUG-attendance-16 (todo) |
| 73 | `lockPeriod` từ chối tháng không phải YYYY-MM | — | lockPeriod refuses a month that is not YYYY-MM | (b) — BUG-attendance-16 (todo) |

## Ghi SQL thẳng (không có route)

- Không có. Seed chỉ gọi `POST /holidays`, `GET /employees/:username`, `POST /attendance/punches` (Admin chấm hộ, có `punchedAt`), `PUT /employees/:username`.

## Lỗi

Lỗi 2, 3, 4, 5, 6, 7, 8 nằm trong phạm vi phiên **attendance-core** (spec 2, `docs/superpowers/specs/2026-11-05-attendance-core-design.md`), phiên đó đang làm. Lỗi 13, 14, 16 thuộc vòng kỳ lương (phiên lifecycle). Khi một lỗi được sửa, Playwright báo test đó "expected to fail but passed": bỏ `test.fail` của test đó.

### BUG-attendance-1: giờ ca bị hiểu theo UTC khi lần chấm cách giờ vào ca hơn 3,5 tiếng
- Tái hiện: cc-tre 06/10 vào 12:00, ra 17:00 (ca 08–17) → `checkInStatus` EARLY (vào sớm), trễ 0 phút; `checkOutStatus` EARLY, về sớm 420 phút. cc-thieu 03/10 chỉ có ra 17:00 → `checkOutStatus` EARLY, về sớm 420 phút.
- Đúng phải là: vào 12:00 là trễ 240 phút; ra 17:00 đúng giờ; ngày chỉ có giờ ra là "thiếu giờ vào" (luật 04/11).
- File nghi ngờ: `src/modules/attendance/domain/daily-timesheet.ts` `buildShiftBoundaries` (dòng 93): chọn giữa giờ ca theo UTC và theo giờ VN, bên nào gần lần chấm hơn thì lấy. Lần chấm xa giờ vào ca thì bên UTC (08:00Z = 15:00 VN) gần hơn.
- Test: `demo-attendance-rules.spec.ts` › "cc-tre: vào 12:00 ca 08–17…", "cc-thieu: thiếu giờ vào, ra 17:00…"

### BUG-attendance-2: ra muộn 16–30 phút không OT vẫn hợp lệ
- Tái hiện: cc-tre 12/10 ra 17:20 (ca 08–17, không OT) → `dayStatus` VALID.
- Đúng phải là: ra muộn hơn 15 phút không OT phải giải trình (luật 04/11: "v2 dùng 30, đổi thành 15").
- File nghi ngờ: `daily-timesheet.ts` dòng 402 `diffOutMin <= 30`. Phiên attendance-core: `detectCases` có LATE_CHECK_OUT 15–30.
- Test: `demo-attendance-rules.spec.ts` › "cc-tre: ra 17:20 không có OT…"

### BUG-attendance-3: lần ra giữa ca rồi vào lại không bị bắt
- Tái hiện: cc-thieu 05/10 vào 08:00, ra 10:00, vào 10:30, ra 17:00 → ngày VALID.
- Đúng phải là: ra giữa ca rồi vào lại không được phép (luật 04/11), lần ra 10:00 là về sớm → giải trình.
- File nghi ngờ: `daily-timesheet.ts` dòng 340–341, chỉ đọc lần vào đầu và lần ra cuối. Spec 2 có `firstOutInShift`.
- Test: `demo-attendance-rules.spec.ts` › "cc-thieu: ra 10:00 rồi vào lại 10:30…"

### BUG-attendance-4: Chủ nhật có giờ chấm được tính là ngày công
- Tái hiện: cc-chu-nhat chấm Chủ nhật 11/10 từ 08:00 tới 12:00 → `/me` ghi ngày đó là đi làm hoặc đi muộn, và `totals.workDays` cộng thêm 1.
- Đúng phải là: Chủ nhật không bao giờ là ngày làm (luật 04/11, ngày lễ và tuần làm việc).
- File nghi ngờ: `src/modules/attendance/attendance.repository.ts` `ensureDefaultSchedule` (dòng 399), tự tạo lịch Normal cả ngày Chủ nhật; `src/modules/me/domain/me-views.ts` đếm mọi dòng có vào và ra.
- Test: `demo-attendance-rules.spec.ts` › "Chủ nhật có giờ chấm không được tính là ngày công"

### BUG-attendance-5: ngày lễ công ty hiện "vắng"
- Tái hiện: Admin thêm ngày lễ 14/10 (thứ Tư). `/me/attendance?month=2026-10` của cc-dung-gio cho 14/10 `kind: 'absent'`. Dải tháng ở hồ sơ Admin ghi "Vắng".
- Đúng phải là: ngày lễ lấy từ lịch lễ chung của công ty, là ngày nghỉ lễ (luật 04/11).
- File nghi ngờ: bảng công không đọc bảng `holidays`; `me-views.ts` `daySummaryOf` (dòng 44) không có dòng thì là vắng; `web/src/builders/api/attendance.ts` chỉ biết lễ qua dòng công HOLIDAY. Spec 2 L10.
- Test: `demo-attendance-rules.spec.ts` › "ngày lễ công ty trên ngày làm…"; `demo-attendance-admin.spec.ts` › "hồ sơ chấm công: ngày lễ công ty…"

### BUG-attendance-6: ngày ngoài thời gian làm (trước ngày vào làm, sau ngày nghỉ việc) hiện "vắng"
- Tái hiện: cc-giua-thang vào làm 19/10 → `/me` ghi 01–17/10 (trừ Chủ nhật) là vắng. cc-nghi-viec nghỉ việc từ 16/10 → các ngày sau 16/10 là vắng.
- Đúng phải là: chỉ ngày có lịch mà không chấm mới là vắng; vắng phải tách khỏi ngày không có chấm công (05/11).
- File nghi ngờ: `me-views.ts` `daySummaryOf` không biết ngày vào làm và ngày nghỉ việc; `web/src/builders/api/attendance.ts` ô mặc định cũng vậy. Spec 2 L13.
- Test: `demo-attendance-rules.spec.ts` › "người vào làm giữa tháng…", "người nghỉ việc…"

### BUG-attendance-7: thực tập sinh bị coi là làm thứ Bảy
- Tái hiện: cc-tts (tts, không chấm thứ Bảy) → `/me` ghi mọi thứ Bảy tháng 10 là vắng; `standardDays` đếm cả thứ Bảy; dòng ca ở app nhân viên ghi "thứ Hai – thứ Bảy".
- Đúng phải là: tuần của tts là thứ Hai – thứ Sáu (05/11: tuần mặc định theo loại, tts thứ Hai – thứ Sáu).
- File nghi ngờ: `me-views.ts` (dòng 79 `standardDays`); `web/src/builders/api/staff-phone.ts` dòng 237 viết cứng "thứ Hai – thứ Bảy".
- Test: `demo-attendance-rules.spec.ts` › "thứ Bảy của thực tập sinh…"; `demo-attendance-staff.spec.ts` › "thực tập sinh: dòng ca…"

### BUG-attendance-8: hôm nay chưa chấm hiện "vắng" ở app nhân viên, "Chưa Check-in" ở Admin
- Tái hiện: cc-dem (ca Night 22:00) chưa chấm hôm nay → `/me/attendance` cho hôm nay `kind: 'absent'`, cả khi ca chưa bắt đầu. Lưới Admin cùng ngày ghi "Chưa Check-in".
- Đúng phải là: ngày chưa có chấm công tách khỏi ngày vắng (05/11); hai màn cùng một trạng thái (b).
- File nghi ngờ: `me-views.ts` dòng 48 và 56 (`date > today ? 'future' : 'absent'`: hôm nay rơi vào vắng).
- Test: `demo-attendance-rules.spec.ts` › "ca Night chưa bắt đầu (hôm nay)…"; `demo-attendance-admin.spec.ts` › "hôm nay chưa chấm…"

### BUG-attendance-9: "Lần đi muộn" ở Admin khác app nhân viên
- Tái hiện: hồ sơ chấm công tháng 10 của cc-tre (có cả ngày vào trễ và ngày về sớm): thẻ "Lần đi muộn" của Admin ghi 4, app nhân viên ghi 7.
- Đúng phải là: cùng một con số ở hai màn (b). Đếm cả về sớm hay không: câu hỏi Q4.
- File nghi ngờ: `web/src/builders/api/attendance.ts` dòng 96 chỉ đếm `checkInStatus === 'LATE'`; `me-views.ts` dòng 80 đếm ngày `late` (vào trễ hoặc về sớm). Cùng file Admin, dòng 70, lại tô ô về sớm là "Đi muộn".
- Test: `demo-attendance-admin.spec.ts` › "hồ sơ chấm công: "Lần đi muộn"… (người có cả ngày về sớm)"

### BUG-attendance-10: ngày không có thật trong đường dẫn hay tham số trả 500
- Tái hiện: `GET /attendance/timesheets/:id/2026-02-30`, `GET /attendance/timesheets?startDate=abc`, `GET /attendance/punches?employeeId=…&workDate=abc`, `GET /me/attendance/2026-02-30` → 500 "Lỗi máy chủ".
- Đúng phải là: 400 (b: không có 500).
- File nghi ngờ: `src/modules/attendance/attendance.controller.ts` (dòng 22–55), `src/modules/me/me.controller.ts` (dòng 161): ngày đi thẳng xuống PostgreSQL, lỗi kiểu ngày thành 500 ở `ApiExceptionFilter`.
- Test: `demo-attendance-rules.spec.ts` › "ngày không có thật trong đường dẫn…"

### BUG-attendance-11: tính lại một ngày chưa có lịch trả 500
- Tái hiện: `POST /attendance/recalculate { employeeId, workDate }` cho ngày chưa có lịch → 500.
- Đúng phải là: 4xx (b).
- File nghi ngờ: `src/modules/attendance/attendance.service.ts` dòng 171 ném `Error` thường; controller (dòng 69) không đổi thành lỗi HTTP.
- Test: `demo-attendance-rules.spec.ts` › "tính lại một ngày chưa có lịch…"

### BUG-attendance-12: BE nhận check-in lần hai, và check-in sau khi đã check-out
- Tái hiện: cc-hom-nay check-in, rồi gọi thẳng `POST /me/punches { kind: 'IN' }` → BE nhận. Sau check-out, gọi lại IN → BE nhận.
- Đúng phải là: một lần vào, một lần ra; ra rồi vào lại không được phép (04/11). Giao diện đã ẩn nút (c đạt). BE vẫn phải chặn.
- File nghi ngờ: `attendance.service.ts` `recordPunch` (dòng 58) không xem các lần chấm đã có trong ngày.
- Test: `demo-attendance-staff.spec.ts` › "đã check-in: BE từ chối…", "đã check-out: BE từ chối check-in lại…"

### BUG-attendance-13: nút "Chốt công" hiện cả với tháng đang chạy
- Tái hiện: Admin mở `/admin/cham-cong` (tháng 11/2026, còn đang chạy) → thanh kỳ lương có nút "Chốt công". Bấm sẽ chốt công cả công ty cho tháng chưa hết.
- Đúng phải là: chỉ chốt công sau khi hết tháng (c: thao tác sai không hiện ra).
- File nghi ngờ: `web/src/components/shell/PeriodStrip.vue` `canLock` (dòng 15) chỉ xem bước 1 đã xong chưa; BE `src/modules/system/system.service.ts` `lockPeriod` (dòng 65) cũng không kiểm (BUG-attendance-16).
- Test: `demo-attendance-period.spec.ts` › "tháng này chưa hết…"

### BUG-attendance-14: tháng đã chốt công vẫn chấm hộ, tính lại, thêm ngày lễ được
- Tái hiện: Admin chốt công tháng 8/2026 qua giao diện (`/system/periods` ghi `attendance_locked`). Sau đó `POST /attendance/punches` cho cc-chot ngày 8/2026, `POST /attendance/recalculate`, `POST /holidays` một ngày tháng 8 → cả ba được nhận.
- Đúng phải là: tháng đã chốt thì không chấm, không sửa.
- File nghi ngờ: `attendance.service.ts` dòng 94 chỉ xem `timesheet.isLocked`, mà `lockPeriod` không bao giờ đặt cờ này và không ai đọc `payroll_periods`; `recalculateTimesheet` (dòng 168) cũng vậy; `src/modules/holidays/holidays.service.ts` `add` (dòng 40), `remove` (dòng 63) không xem kỳ lương.
- Test: `demo-attendance-period.spec.ts` › "tháng đã chốt: BE từ chối Admin chấm hộ", "…tính lại bảng công", "…thêm ngày lễ vào tháng đó"

### BUG-attendance-15: bấm một ngày đã là ngày lễ mở hộp "Thêm ngày lễ" cho chính ngày đó
- Tái hiện: `/admin/cai-dat/lich`, bấm ô 1/1 (đã là ngày lễ) → hộp "Thêm ngày lễ" điền sẵn 01/01. Bấm thêm → BE từ chối vì trùng, hiện thông báo lỗi.
- Đúng phải là: không đưa ra thao tác chắc chắn lỗi (c, memory "Prevent, don't error"), ví dụ bấm ngày lễ thì xem hoặc bỏ ngày lễ đó.
- File nghi ngờ: `web/src/views/admin/settings/calendar/YearCalendar.vue` phát `pick` cho mọi ngày; `web/src/views/admin/settings/CalendarView.vue` `openHoliday`.
- Test: `demo-attendance-period.spec.ts` › "bấm vào ngày đã là ngày lễ trên lịch năm…"

### BUG-attendance-16: `lockPeriod` nhận tháng đang chạy và tháng "abc"
- Tái hiện: trên DB tạm, `new SystemService(db).lockPeriod('abc', 'admin')` ghi một dòng `payroll_periods` tháng "abc"; với tháng hiện tại cũng ghi được.
- Đúng phải là: chỉ chốt tháng đã hết, tháng phải là YYYY-MM.
- File nghi ngờ: `src/modules/system/system.service.ts` dòng 65; `system.controller.ts` dòng 48 không kiểm tham số.
- Test: `test/v2/demo-attendance-period.pg.test.ts` (hai test `todo`, không làm đỏ `npm test`).

### BUG-attendance-17: tên lịch tháng và ô số cho trình đọc màn hình luôn là "tháng 10"
- Tái hiện: `/nv/cham-cong` tháng 11/2026: vùng lịch có tên "Lịch tháng 10", nhóm ô số có tên "Chỉ số tháng 10".
- Đúng phải là: cùng tháng với nhãn "Tháng 11/2026" đang hiện (b).
- File nghi ngờ: `web/src/views/staff-phone/components/MonthCalendar.vue` dòng 13, `MonthTiles.vue` dòng 10.
- Test: `demo-attendance-staff.spec.ts` › "lịch tháng và ô số: tên cho trình đọc màn hình…"

## Câu hỏi luật

### Q1: ô "Ngày công X / Y" ở app nhân viên: Y là công chuẩn hay số ngày làm của tháng?
- Tình huống: nhân viên mở `/nv/cham-cong`, ô đầu ghi "Ngày công X / Y".
- Hiện tại v2: Y = số ngày thứ Hai – thứ Bảy của tháng, gồm cả ngày lễ, không theo tuần của người. Tháng 9/2026 ra 26, tháng 10/2026 ra 27, tháng 11/2026 ra 25. tts cũng tính thứ Bảy. Đã chốt: công chuẩn tuần 6 ngày là 26, tuần 5 ngày là 22.
- Ví dụ: nv đi làm đủ tháng 10/2026. Tháng này có 27 ngày thứ Hai – thứ Bảy, trong đó 14/10 là lễ, nên đi 26 ngày. v2 hiện "26 / 27". Nếu Y là công chuẩn thì hiện "26 / 26". tts đi đủ 21 ngày (22 ngày thứ Hai – thứ Sáu trừ ngày lễ): v2 hiện "21 / 27", công chuẩn là 22.

### Q2: quên check-in thì app nhân viên có cho Check-out không?
- Tình huống: ca Normal 08–17, nhân viên quên bấm Check-in lúc 08:00, tới 17:05 mở app.
- Hiện tại v2: thẻ ca chỉ có nút Check-in. Bấm thì BE ghi giờ vào 17:05, tức trễ 545 phút, và ngày không có giờ ra.
- Ví dụ: muốn ngày đó là "thiếu giờ vào, ra 17:05" (một trường hợp giải trình đã chốt) thì app phải cho Check-out khi chưa có Check-in, ít nhất sau giờ vào ca. Có làm vậy không?

### Q3: người đã nghỉ việc có hiện ở màn Chấm công Admin cho tháng họ còn làm không?
- Tình huống: cc-nghi-viec làm 01–16/10/2026 rồi nghỉ việc. Admin mở tháng 10 để đối chiếu công.
- Hiện tại v2: `web/src/builders/api/attendance.ts` dòng 151 bỏ mọi người có hợp đồng `nghiviec`, ở mọi tháng. Hiện chưa thấy được vì trạng thái `nghiviec` chưa lưu (BUG-staff-2).
- Ví dụ: tháng 10 cc-nghi-viec có 12 ngày công. Khi BUG-staff-2 sửa xong, lưới và hồ sơ tháng 10 sẽ không còn người này. Có cần hiện cho các tháng trước ngày nghỉ việc không?

### Q4: "Lần đi muộn" có đếm cả ngày về sớm không?
- Tình huống: ô "Lần đi muộn" ở app nhân viên và thẻ "Lần đi muộn" ở hồ sơ Admin.
- Hiện tại v2: app nhân viên đếm ngày vào trễ hoặc về sớm. Admin chỉ đếm ngày vào trễ, nhưng ô lưới Admin lại ghi ngày về sớm là "Đi muộn".
- Ví dụ: tháng 10, cc-tre vào trễ 5 ngày: 03/10 (16 phút), 05/10 (40 phút), 06/10 (vào 12:00), 09/10 (20 phút, cùng ngày về sớm 20 phút), 27/10 (40 phút). Ngày 06/10 hiện bị đọc thành về sớm vì BUG-attendance-1. cc-tre còn về sớm 2 ngày: 07/10 (1 phút), 08/10 (30 phút).
  - Hiện tại: Admin ghi 4, app nhân viên ghi 7.
  - Khi BUG-1 đã sửa: chỉ đếm vào trễ thì ra 5; đếm cả về sớm thì ra 7.

## Chưa phủ

- **Vùng chấm công (D6) và chặn check-in ngoài tuần làm việc (D14):** settings-store, chưa vào main. Test hôm nay bỏ qua Chủ nhật; không thử tts check-in thứ Bảy.
- **Nhân viên tự chấm trong tháng đã chốt:** `/me/punches` chỉ chấm được hôm nay (giờ thật), còn trên DB dùng chung không chốt được tháng này. Chỉ thử Admin chấm hộ (BUG-attendance-14).
- **Ca Night check-out sau nửa đêm qua `/me/punches`:** cần giờ thật lúc 00:00–07:00. Đọc code: `recordPunch` lấy ngày làm việc theo ngày hiện tại (`businessDateText()`), nên lần ra 06:30 sẽ vào ngày hôm sau. Chưa thử.
- **OT, nghỉ phép đã duyệt, giải trình, iSAT trên bảng công:** mảng requests. Phiên attendance-core đang làm: nghỉ đã duyệt chưa vào bảng công, lương ngày theo giải trình.
- **Tab "Cần xử lý" và lớp phủ đơn chờ trên lưới:** tab thuộc mảng requests (BUG-requests-9: builder khoá người theo username, inbox đưa uuid). Lớp phủ trên lưới có thể hỏng cùng nguyên nhân; chưa thử.
- **Ngày lễ rơi vào Chủ nhật, hoặc thứ Bảy của tts:** luật đã có (không tính). Chưa thử được, vì bảng công chưa có ngày lễ (BUG-attendance-5).
- **Admin ẩn người nghỉ việc, hồ sơ tts:** trạng thái hợp đồng chưa lưu (BUG-staff-2), xem Q3.
- **Thẻ "Phép năm còn", "Làm thêm" ở hồ sơ Admin:** số phép thuộc mảng staff và requests, OT thuộc requests. Test chỉ đọc "Ngày đi làm" và "Lần đi muộn".
- **Màn Lịch, phần giờ ca, ngày trả lương, ngày bắt đầu tính công:** thuộc settings-store, chưa thử.
- **Bản `all`:** chưa chạy `npm run demo -- test`. Trên `luong_demo_all`, spec requests chốt công m1 (test "tháng trước: nút Chốt công…" đọc `/system/periods` nên vẫn đúng). Test "năm có ngày lễ seed…" có thể lệch nếu spec requests đang thêm tạm một ngày lễ đúng lúc đó.

## Ghi chú cho mảng khác

- Seed thêm **một ngày lễ cho cả công ty**: thứ Tư thứ hai của m1 (lần chạy 05/11/2026 là 14/10/2026). Trên DB `all`, mọi người có lịch ngày đó.
- Test chốt công **tháng m3** qua giao diện. Không đụng m0, m1.
- Test ngày lễ chỉ dùng năm hiện tại + 3 và + 4, xoá hết khi xong.
