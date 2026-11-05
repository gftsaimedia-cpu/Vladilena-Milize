# Nối màn "Chế độ theo loại nhân sự" và "Chức vụ & bậc" vào BE v2 — thiết kế

Hai màn Cài đặt của Admin hiện chưa lưu được gì lên BE v2:
- Màn **Chức vụ & bậc** đọc được, nhưng `savePosition` và `saveLevel` chỉ báo "chưa nối".
- Màn **Chế độ** còn gọi `/settings/params` của v1, nên BE v2 trả 404.

Spec này thêm API ghi cho ba bảng `position_types`, `position_type_benefits` và `position_levels`, lưu theo tháng áp dụng. Phần tính lương sẽ đọc 4 mức phụ cấp % từ bảng thay cho số ghi cứng trong code. Hai màn FE được nối vào API mới.

Loại: Architectural. Spec thêm module mới, thêm API, và đổi nguồn số của công thức lương (luật giữ nguyên).

**Nguồn**
- Luật do người dùng chốt trong chat ngày 2026-11-05 (mục 1).
- App tham chiếu luong-app (`public/index.html`, hằng `TYPES` và hàm `bonusOf`): phụ cấp và quyền lợi theo loại; ca đêm Nhân viên chọn 40% hoặc 60% theo từng người; ô "Ở iDorm" chỉ dành cho loại có phụ cấp đi lại.
- Code nền: nhánh `chore/one-migration` tại `ba554bd`.

## 1. Luật đã chốt (người dùng, chat 2026-11-05)

| # | Luật |
|---|------|
| P1 | Tháng áp dụng chỉ từ **tháng hiện tại theo giờ Việt Nam** trở đi. Các tháng trước luôn giữ số cũ, dù kỳ đang mở, đã khoá hay được mở lại. |
| P2 | Màn Chế độ hiện **mỗi loại nhân sự một dòng**, không chia theo bậc. DB và luong-app đều lưu theo loại. |
| P3 | Tính lương đọc 4 mức % (Flex, ca đêm, đi lại, chuyên cần) từ **phiên bản chức vụ có hiệu lực trong tháng**, thay cho số ghi cứng. Ca đêm Nhân viên vẫn theo từng người (40% hoặc 60%). Thực tập sinh và Chuyên trách viên lấy % đêm riêng của bậc nếu có đặt, không có thì lấy % đêm của chức vụ. |
| P4 | Bỏ cột "Nghỉ được duyệt". Ô này trùng với loại nghỉ Việc riêng có lương, và loại nhân sự nào cũng gửi được loại nghỉ đó như hiện nay. |
| P5 | Người ở KTX (iDorm) không có phụ cấp đi lại, xét theo từng người. Ô iDorm của loại vẫn giữ trên màn Chế độ. Ô này chỉ quyết định hồ sơ của loại đó có ô "Ở iDorm" hay không, không làm đổi lương. Mặc định chỉ Nhân viên bật. |
| P6 | Phạm vi: nối Sửa chức vụ, Sửa bậc, Thêm bậc và Lưu màn Chế độ. Thay "Xem trước tác động" bằng một hộp xác nhận. Ẩn nút "Thêm chế độ" và bảng "Cờ thuế và bảo hiểm". Không ghi Nhật ký. Không thêm chức vụ mới. |
| P7 | Mỗi ô **chép tiếp độc lập** sang các phiên bản sau: phiên bản sau còn giữ đúng số cũ thì nhận số mới; gặp phiên bản đã tự đặt số khác thì dừng chép ô đó. |
| P8 | Màn hình chỉ cho làm những gì hợp lệ (giới hạn ô nhập, ẩn hoặc làm mờ nút). BE vẫn kiểm lại đúng các luật đó cho trường hợp gọi API trực tiếp. Dùng màn bình thường thì không gặp lỗi kiểm số. |
| P9 | Ô ca đêm ở thẻ Nhân viên hiện chữ "Theo từng người". Hai mức 40% và 60% không sửa ở màn này. |

## 2. Hiện trạng (ba554bd)

- **Bảng** (`migrations/postgres/schema.sql`):
  - `position_types`: phiên bản theo `UNIQUE(code, effective_month)`, có `rev`, `reason`, `updated_by`, `updated_at`.
  - `position_type_benefits`: khoá `(type_id, benefit)`; `type_id` trỏ tới **một dòng phiên bản** của `position_types`; `enabled` là 0 hoặc 1. Mỗi phiên bản gieo sẵn đủ 14 mã của `benefit_types`.
  - `position_levels`: phiên bản theo `UNIQUE(type_code, level_no, effective_month)`. `kpi_max` NULL nghĩa là không có KPI; `night_pct` NULL nghĩa là theo chức vụ.
  - Dữ liệu gieo: 3 loại (tts, ctv, nv) có `effective_month = '2000-01'`; bậc tts 1–6, ctv 1–4, nv 1–4; mọi `night_pct` của bậc là NULL.
- **Chỗ đọc:**
  - `PayrollRepository.positionInEffect` lấy phiên bản mới nhất có tháng áp dụng không sau tháng tính.
  - `RequestsRepository` đọc cờ `isat`. Nhánh spec 1 (`claude/requests-review-fixes-26c409`) đọc thêm `ot`, `makeup`, `leaveAccount`.
  - `GET /api/v2/employees/meta/positions` (quyền `staff.manage`) trả mọi phiên bản của chức vụ và bậc, chưa kèm ô tick.
- **Chỗ ghi:** chưa có.
- **Số ghi cứng trong lương:**
  - `src/modules/payroll/domain/allowance-rates.ts`: Flex NV 20%, TTS/CTV 10%; ca đêm NV 40% hoặc 60%, TTS/CTV 30%.
  - `src/modules/payroll/domain/employee-payslip.ts:316–317`: chuyên cần 25% và đi lại 15%, chỉ cho NV.
  - Phiếu in `web/src/views/print/A4Payslip.vue:26` ghi cứng "Flex +20%" và "Night +40%".
  - Các số này trùng với số đang gieo trong bảng.

## 3. BE

### 3.1 Module mới `src/modules/positions/`

Chia lớp như các module khác: controller → service → repository. Logic thuần đặt trong `domain/`:
- `domain/version-chain.ts`: hàm thuần áp một thay đổi lên chuỗi phiên bản theo P7, test được không cần DB.
- `domain/position-input.ts`: đọc và kiểm số trong body (mục 3.4).

Module được đăng ký trong module gốc của app.

### 3.2 API (tiền tố `/api/v2`)

| Phương thức và đường dẫn | Quyền | Body | Trả về |
|---|---|---|---|
| `PUT /positions` | `config.write` | `{ effectiveMonth, reason?, items: [{ code, expectedRev, changes }] }`. `changes` gồm `name?`, `workdays?`, `flexPct?`, `nightPct?`, `travelPct?`, `attendancePct?`, `benefits?: { kpi?, idorm?, leaveAccount?, isat?, ot?, makeup? }` | `{ ok: true, effectiveMonth }` |
| `PUT /positions/:code/levels/:level` | `config.write` | `{ effectiveMonth, reason?, expectedRev, changes: { name?, baseSalary?, kpiMax?, nightPct? } }` | `{ ok: true, effectiveMonth }` |
| `POST /positions/:code/levels` | `config.write` | `{ effectiveMonth, reason?, level, values: { name, baseSalary, kpiMax, nightPct } }`. `level` phải bằng số bậc lớn nhất đang có ở tháng đó + 1 | `{ ok: true, effectiveMonth, level }` |
| `GET /employees/meta/positions` (đã có) | `staff.manage` | — | Như cũ, thêm `benefits: { <mã>: boolean }` vào mỗi dòng phiên bản chức vụ |

Mã lỗi (chỉ gặp khi gọi API trực tiếp, trừ `*_STALE`):
- 400 `BAD_REQUEST` kèm `field`: kiểm số sai (mục 3.4).
- 404 `POSITION_NOT_FOUND` / `LEVEL_NOT_FOUND`: không có phiên bản nào có hiệu lực ở tháng áp dụng.
- 409 `POSITION_STALE` / `LEVEL_STALE`: `expectedRev` hoặc `level` không khớp, tức là vừa có người khác lưu trước.

### 3.3 Luật lưu một thay đổi

Áp cho một chức vụ (`code`) hoặc một bậc (`code`, `level`), lưu từ tháng `M`:

1. `M` phải từ tháng hiện tại theo giờ Việt Nam (`businessMonthText()` trong `src/common/business-date.ts`) trở đi.
2. `cur` là phiên bản mới nhất có tháng áp dụng ≤ `M`. Không có `cur` thì trả 404. `expectedRev` khác `cur.rev` thì trả 409.
3. Bỏ khỏi `changes` những ô mà số mới bằng số của `cur`.
4. Nếu `cur.effective_month = M` thì sửa thẳng vào `cur`. Nếu khác thì tạo phiên bản mới cho tháng `M`:
   - chép đủ mọi cột của `cur`, rồi áp các ô vừa sửa;
   - với chức vụ: chép thêm đủ 14 dòng `position_type_benefits` của `cur` sang `type_id` mới, rồi áp các ô tick vừa sửa;
   - phiên bản mới có `rev = 0`.
5. **Chép tiếp (P7):** xét từng ô vừa sửa, với số cũ `o` (của `cur`) và số mới `n`. Đi qua các phiên bản sau `M` theo thứ tự tăng dần. Phiên bản nào đang giữ đúng `o` cho ô đó thì đổi thành `n`. Gặp phiên bản đầu tiên có số khác `o` thì dừng chép ô đó. Ô tick làm cùng cách, trên dòng `position_type_benefits` của từng phiên bản.
6. Mỗi dòng bị sửa (gồm cả dòng nhận chép tiếp) được tăng `rev` thêm 1 và ghi lại `updated_by` (tên đăng nhập của Admin) cùng `updated_at` (giờ ISO). `reason` chỉ ghi vào dòng ở tháng `M`; các dòng nhận chép tiếp giữ `reason` cũ.
7. Thêm bậc: tạo dòng `position_levels` mới cho tháng `M` với `level_no = level`. Các tháng trước `M` không có bậc này.

Ví dụ cho bước 5, bậc 2 Nhân viên (lương 6.500.000, KPI 6.500.000):
- Ngày 01/11, Admin đổi lương thành 7.000.000 từ tháng 12, tạo ra phiên bản 12/2026 với lương 7.000.000, KPI 6.500.000.
- Ngày 05/11, Admin đổi KPI thành 6.800.000 từ tháng 11, tạo ra phiên bản 11/2026 với lương 6.500.000, KPI 6.800.000. Phiên bản 12/2026 đang giữ KPI 6.500.000, đúng số cũ, nên nhận 6.800.000.
- Kết quả: tháng 12 có lương 7.000.000, KPI 6.800.000.

**Khoá và transaction.** Cả lần lưu chạy trong một transaction (`TransactionCoordinator.run`):
- đầu transaction gọi `acquireAdvisoryLock(trx, 'positions:<code>')` cho từng mã, theo thứ tự mã đã sắp xếp, để hai lần lưu nhiều loại không khoá chéo nhau;
- **mọi** câu lệnh của repository nhận transaction đó làm tham số, không dùng pool `this.qb`;
- một mục lỗi thì rollback cả lần lưu, không loại nào được lưu.

### 3.4 Kiểm số (lưới an toàn của BE)

| Ô | Luật |
|---|---|
| `effectiveMonth` | Dạng `YYYY-MM`, ≥ tháng hiện tại theo giờ Việt Nam |
| `code` | `tts`, `ctv` hoặc `nv`, và đã có phiên bản |
| `name` | Bỏ khoảng trắng đầu cuối, dài 1–60 ký tự |
| `workdays` | Số nguyên 1–31 |
| `flexPct`, `nightPct`, `travelPct`, `attendancePct` | Số 0–100 |
| `nightPct` với `code = 'nv'` (cả chức vụ lẫn bậc) | Không nhận (P9) |
| `baseSalary` | Số nguyên ≥ 0 |
| `kpiMax` | `null` hoặc số nguyên ≥ 0 |
| `benefits` | Chỉ 6 khoá `kpi`, `idorm`, `leaveAccount`, `isat`, `ot`, `makeup`, giá trị boolean |
| `reason` | Không bắt buộc, tối đa 300 ký tự |
| `items` | Ít nhất 1 mục, không trùng `code` |
| Ô lạ trong `changes` | Không nhận |

## 4. Tính lương đọc bảng (P3, P5)

`mapMonthRows` (`payroll.repository.ts`) truyền thêm các số của phiên bản có hiệu lực vào dữ liệu phiếu:
- `flexPct`, `travelPct`, `attendancePct`: lấy từ `position_types`;
- `typeNightPct`: lấy từ `position_types.night_pct`;
- `levelNightPct`: lấy từ `position_levels.night_pct`, có thể null.

`PayrollAllowancePolicy` không còn xét tên loại để chọn số, mà nhận các số trên:

| Khoản | Cách tính |
|---|---|
| Flex | `flexPct / 100` |
| Ca đêm Nhân viên | Giữ như cũ: mức % ca của người đó bằng 60 thì 0,6, còn lại 0,4 |
| Ca đêm TTS/CTV | `(levelNightPct ?? typeNightPct) / 100` |
| Đi lại | `travelPct / 100 × lương cơ bản × tỉ lệ ngày`; bằng 0 khi người đó ở iDorm. Áp cho mọi loại có % > 0 |
| Chuyên cần | `attendancePct / 100 × lương cơ bản × tỉ lệ ngày`; bằng 0 khi vắng quá 4 ngày (giữ như cũ). Áp cho mọi loại có % > 0 |
| Không có phiên bản chức vụ | Mọi mức = 0, `isKnownType = false` (như loại lạ hiện nay) |

- Nhãn "Flex +X%" / "Night +X%" trong `payroll.service.ts` đã tính từ mức, nên tự đi theo số mới.
- Phiếu in A4 lấy nhãn ca từ dòng ngày do BE trả, bỏ bảng ghi cứng.
- Không đổi: phần miễn thuế ca đêm (30% lương giờ), hệ số OT, trọng số KPI, ngưỡng vắng 4 ngày, cách KPI xét ô tick `kpi` cùng `kpi_max`.

## 5. FE

### 5.1 Dịch vụ

- `web/src/services/admin-catalog.ts`:
  - `savePosition` gọi `PUT /positions` với một mục;
  - `saveLevel` gọi `PUT /positions/:code/levels/:level` khi sửa và `POST /positions/:code/levels` khi thêm;
  - lỗi 409 giữ mã `*_STALE` để `isStale` nhận ra.
- `getBenefits` / `saveBenefits`:
  - đọc `GET /employees/meta/positions`, lấy phiên bản có hiệu lực ở tháng hiện tại theo giờ Việt Nam;
  - đếm số người từ `GET /employees`: người đang làm (chưa nghỉ việc) theo `contract.position.type`;
  - lưu bằng `PUT /positions` với mọi loại có thay đổi;
  - bỏ hẳn `/settings/params`, `/settings/params/preview` và `/staff` khỏi hai màn này.
- `positionsResponseFromCatalog` đọc thêm `benefits` của từng phiên bản.

### 5.2 Chặn từ màn hình (P8)

| Luật | Màn hình làm gì |
|---|---|
| P1 tháng áp dụng | Ô "Áp dụng từ tháng" có 6 tháng, bắt đầu từ tháng hiện tại theo giờ Việt Nam (không theo tháng đang chọn trên thanh trên cùng). Bậc chỉ có từ một tháng sau thì danh sách bỏ các tháng trước đó. Bỏ hai thông báo "Chức vụ/Bậc chưa có ở …" |
| P9 ca đêm NV | Ô ca đêm của Nhân viên hiện chữ "Theo từng người", không phải ô nhập: ở màn Chế độ, hộp Sửa chức vụ, và hộp Sửa/Thêm bậc của Nhân viên |
| Ngày công 1–31, % 0–100 | `FieldNum` thêm `max` và `integer`: không nhận chữ số làm vượt `max`; khi `integer` thì không nhận dấu phẩy |
| Lương, KPI | Ô tiền chỉ nhận chữ số (đã có) |
| Tên | Ô tên tối đa 60 ký tự; tên trống thì nút Lưu mờ |
| Lý do | Tối đa 300 ký tự (đã có) |
| Chưa đổi gì | Nút Lưu mờ, thay cho thông báo "Chưa có thay đổi". Sửa rồi sửa lại về số cũ cũng tính là chưa đổi |
| Chỉ 6 ô tick | Màn chỉ hiện 6 ô đó |

Hai trường hợp vẫn phải báo vì không chặn trước được:
- **409 `*_STALE`:** tải lại số mới vào các ô Admin chưa sửa, giữ các ô đang sửa, báo "Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu".
- **Lỗi mạng.**

### 5.3 Màn Chức vụ & bậc

Giữ nguyên cách hiển thị. Nối ba nút Lưu chức vụ, Lưu bậc, Thêm bậc vào API, và áp mục 5.2.

### 5.4 Màn Chế độ

- Ba thẻ Thực tập sinh, Chuyên trách viên, Nhân viên. Mỗi thẻ hiện số người và **một dòng** mức chung, bỏ cột Bậc.
- **Bảng "Phụ cấp và lương KPI":**

  | Cột | Lưu vào |
  |---|---|
  | Phụ cấp đi lại (%) | `travel_pct` |
  | Phụ cấp chuyên cần (%) | `attendance_pct` |
  | Phụ cấp Flex (%) | `flex_pct` |
  | Phụ cấp ca đêm (%) | `night_pct`; thẻ Nhân viên hiện "Theo từng người" |
  | Lương KPI (ô tick) | cờ `kpi` |
  | iDorm (ô tick) | cờ `idorm` |

- **Bảng "Được gửi yêu cầu":**

  | Cột | Lưu vào |
  |---|---|
  | Nghỉ phép năm | cờ `leaveAccount` |
  | iSAT | cờ `isat` |
  | OT | cờ `ot` |
  | Làm bù | cờ `makeup` (đổi tên từ "Làm bù theo giờ"; đây là cờ mà đơn từ đọc) |

- **Bỏ:** cột Nghỉ được duyệt, nút "Thêm chế độ" cùng hộp của nó, bảng "Cờ thuế và bảo hiểm của khoản thêm" cùng nút Xác nhận.

### 5.5 Hộp xác nhận (thay "Xem trước tác động")

Bấm Lưu ở thanh lưu sẽ mở hộp xác nhận, gồm:
- ô "Áp dụng từ tháng" theo mục 5.2;
- danh sách từng thay đổi, dạng "Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người". Số cũ lấy theo phiên bản có hiệu lực ở **tháng đang chọn** trong hộp; thay đổi nào ở tháng đó đã đúng số mới thì không hiện;
- ô Lý do, không bắt buộc;
- nút Lưu: mờ khi danh sách trống, gửi `expectedRev` của phiên bản ở tháng đang chọn.

### 5.6 Phiếu in và dữ liệu giả

- `A4Payslip.vue` lấy nhãn ca từ dòng ngày (mục 4).
- Dữ liệu giả (mock) của hai màn đổi theo bố cục mới: mỗi loại một dòng, 6 ô tick, không có khoản thêm.

## 6. Ngoài phạm vi

- Ô "Ở iDorm" và ô chọn 40% / 60% ca đêm trong hồ sơ từng người: làm khi nối phần sửa hồ sơ nhân sự.
- Ghi Nhật ký (`audit_log` cần chuỗi mã băm, v2 chưa có chỗ ghi). Lịch sử sửa nằm trong các dòng phiên bản.
- Khoản phụ cấp thêm và cờ thuế/bảo hiểm: để spec 3.
- Thêm chức vụ mới; xoá bậc.
- Lịch sử theo tháng cho loại nhân sự và bậc của từng người; khoá kỳ chặn tính lại lương (đã ghi để đưa vào spec 3).
- Hai mức 40% / 60% của ca đêm Nhân viên.

## 7. Test

Không chạy typecheck và prettier (người dùng đã bỏ hai bước này).

- **BE, `npm test`:**
  - `version-chain`: tạo phiên bản mới khi khác tháng; sửa tại chỗ khi trùng tháng; chép tiếp tới phiên bản đầu tiên tự đặt số khác; các ô độc lập (đúng ví dụ ở mục 3.3); ô tick chép tiếp cùng cách.
  - `positions.service` với repository giả:
    - từ chối tháng trước tháng hiện tại;
    - 409 khi rev lệch; 409 khi `level` không phải bậc kế tiếp;
    - từ chối `nightPct` của `nv`;
    - lưu nhiều loại mà một loại lỗi thì không loại nào được lưu;
    - bỏ các ô không đổi.
  - Controller: thiếu quyền `config.write` thì trả 403.
  - Lương:
    - với số gieo, phiếu lương ra đúng như trước khi sửa (so một phiếu NV, một phiếu TTS, một phiếu CTV);
    - Flex 25% từ một tháng thì phiếu tháng đó tính 25%;
    - loại có % đi lại > 0 mà người đó ở iDorm thì đi lại bằng 0;
    - TTS có % đêm riêng ở bậc thì dùng % của bậc.
  - Builder FE ở `test/v2`: `positionsResponseFromCatalog` có `benefits`; màn Chế độ dựng mỗi loại một dòng; danh sách thay đổi của hộp xác nhận.
- **PG** (container `postgres:16` dùng một lần, `PG_TEST_URL`): repository ghi phiên bản mới kèm 14 ô tick; sửa tại chỗ; chép tiếp sang phiên bản sau; rollback khi lỗi giữa chừng.
- **FE, `web` `npm run test:ui`:**
  - danh sách tháng bắt đầu từ tháng hiện tại;
  - chữ "Theo từng người" ở thẻ và hộp của Nhân viên;
  - nút Lưu mờ khi chưa đổi;
  - hộp xác nhận liệt kê đúng thay đổi;
  - không còn cột Nghỉ được duyệt, nút Thêm chế độ, bảng cờ thuế.

## 8. Nhánh

- Worktree `.claude/worktrees/positions-settings`, nhánh `claude/positions-settings`, tách từ `chore/one-migration` (`ba554bd`).
- Nhánh đơn từ (`claude/requests-review-fixes-26c409`) không sửa file nào trong phần lương hay hai màn này, nên hai nhánh merge riêng được.
- Ba ô Nghỉ phép năm, OT, Làm bù chỉ có tác dụng sau khi nhánh đơn từ merge.
- Không đổi `schema.sql`, vì ba bảng đã có đủ cột.
