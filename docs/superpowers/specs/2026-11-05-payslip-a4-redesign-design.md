# Phiếu lương A4: trang 1 chấm công, trang 2 các khoản, trên dữ liệu giả

- Ngày: 05/11/2026
- Loại: Architectural.
  - Đổi hợp đồng dữ liệu giữa nguồn phiếu và thành phần in (`sheet`).
  - Thêm nguồn dữ liệu giả cho trang in. Hiện `/in/phieu-luong/...` đi qua `api()`, mà `api()` luôn từ chối nên trang báo "Không tải được phiếu lương."
  - Dựng lại `A4Payslip.vue`.
- Trạng thái: chờ người dùng duyệt.
- Concept đã duyệt: hàng "Đợt 8" trên canvas thiết kế (https://claude.ai/artifact/6ro7y3NXoqxGWHfVsBr1Hd), gồm hai board:
  - P1 `PayslipA4Page1.dc.html` (794×1123): trang 1, chấm công;
  - P2 `PayslipA4Page2.dc.html` (794×1123): trang 2, các khoản.
- Các mốc người dùng đã duyệt, ngày 05/11/2026:
  - giữ 2 trang. Trang 1 chỉ có chấm công, trang 2 là các khoản;
  - tách OT, Làm bù, Ghi chú thành cột riêng, mỗi ô ít chữ;
  - cột Giờ đặt sát cột Vào – ra;
  - OT ở trang 2 tách thành 3 dòng;
  - cột Thực tế luôn là tiền, làm bù quy ra tiền;
  - cột Theo quy chế không chứa số lượng ("Làm theo đề xuất");
  - thiết kế trên canvas ("Đúng, viết spec").
- Nguồn board: `.superpowers/canvas-p/project/` của worktree này (git bỏ qua). Mọi số đo và chữ cần cho code đã chép vào mục 3–6.

## Mục tiêu

1. `/in/phieu-luong/2026-10/<username>` hiện phiếu hai trang A4 theo P1 và P2, trên dữ liệu giả, không gọi `/api`.
2. Trang 1:
   - mỗi ngày cần in là một dòng;
   - OT, làm bù và từng loại nghỉ đọc được ngay;
   - không có dải tiền tổng.
3. Trang 2:
   - liệt kê các khoản;
   - cột Thực tế luôn là tiền, cột Theo quy chế chỉ là tiền hoặc để trống;
   - các dòng tổng bằng tổng các dòng đã làm tròn.
4. In ra đúng 2 tờ A4 mỗi phiếu. Không tờ nào tràn, chữ không nhỏ hơn 12px, in đen trắng vẫn đọc được.

## Quyết định đã có (người dùng)

1. Phiếu có 2 trang.
   - Trang 1 là chi tiết chấm công.
   - Trang 2 là chi tiết phụ cấp, lương KPI, bảo hiểm, thuế, Thực nhận, chữ ký.
   - Không có board danh mục loại ngày riêng.
2. Ngày nào được in:
   - mọi ngày có ca, kể cả ngày vắng và ngày nghỉ;
   - Chủ nhật và ngày không ca khác chỉ in khi có đi làm, OT hoặc làm bù;
   - Chủ nhật bình thường không in.
3. Mỗi ô ít chữ. OT, Làm bù, Ghi chú là ba cột riêng. Giờ nằm sát Vào – ra.
4. OT ở trang 2 là ba dòng:
   - "OT ngày thường (×1,5)";
   - "OT ngày cuối tuần (×2)";
   - "OT ngày lễ (×3)".
5. Giờ làm bù quy ra tiền ở trang 2 ("thực tế nó phải là tiền").
   - Đọc hiểu, chưa xác nhận: tiền = số giờ đã bù × lương giờ.
6. Cột Thực tế luôn là tiền. Số lượng (giờ, ngày, ca, %) nằm ở cột "Số lượng" riêng, không nằm ở cột Theo quy chế.
7. Luật đã chốt dùng trong tháng mẫu:
   - OT ×1,5 ngày thường, ×2 thứ 7 và Chủ nhật, ×3 ngày lễ;
   - đi muộn ≤ 15 phút không trừ, 16–44 phút tính 30 phút;
   - ngày vắng 0 đ;
   - ngày chờ giải trình tạm tính 0 đ, có dấu;
   - nghỉ từ 3 ngày thì mất chuyên cần;
   - đi lại = 15% × ngày công / 26;
   - Flex = 20% × lương giờ × 8;
   - Night = 40% lương ngày + Off Paid 37.500;
   - ngày chế độ BHXH 0 đ;
   - tạm ứng = 80% lương các ngày công 01–15, như v1.
8. Kế thừa từ các spec trước:
   - design system GFT AI C&B: Geist cho chữ, League Spartan 600 cho tiêu đề, không đổ bóng;
   - chấm + chữ, không có nhãn hay ô dạng viên thuốc, góc 8px;
   - chỉ cài luật đã xác nhận.
9. Không thêm phụ thuộc npm.
   - Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc, và không đọc `spec/` gốc.
   - Không sửa file của màn Admin hay màn nhân viên.
10. Xác minh chỉ bằng test giao diện: `PW_PORT=<cổng riêng> npm run test:ui` trong `web/`. Không typecheck, không prettier, không chạy `npm test` ở gốc.

## Ngoài phạm vi

- Trang in tất cả `/in/phieu-luong/:month`: `getApprovedSheets` vẫn đi qua `api()` và vẫn báo lỗi tải như hôm nay.
- Các tháng khác tháng 10/2026, kể cả mục "Bản in A4 · tháng 11" của mục lục thiết kế.
- Số liệu riêng của từng người. Mọi `username` trong tháng 10/2026 thấy cùng một tháng mẫu (R1).
- Ngăn kéo phiếu và nút "In phiếu" trong Bảng lương. Nút đó in ngăn kéo, không in bản A4.
- Dọn các hàm cũ không còn ai gọi trong `services/payslip.ts` (`getPayslip`, `getSlipOverride`, `saveSlipOverride`, `approvePayslip`, `returnPayslip`, `getPrintBatch`) và `builders/payslip/drawer.ts`.
- Luật cho ngày nghỉ chỉ bù một phần, và cho Phúc lợi nội bộ (câu hỏi mở 1 và 3).

## 1. File

| File | Việc |
|---|---|
| `web/src/mock/payslip-a4.ts` (mới) | Kiểu `A4Sheet` và các kiểu con (mục 2), tháng mẫu (mục 6), `payslipSheet(month)` |
| `web/src/services/payslip.ts` | `getPayslipSheet` đọc dữ liệu giả (mục 1.1) |
| `web/src/views/print/A4Payslip.vue` | Viết lại: `.a4-doc` chứa hai trang, CSS in dùng chung |
| `web/src/views/print/parts/A4Page.vue` (mới) | Khung một tờ: hình chìm, nội dung (slot), chân trang "Trang n/2" |
| `web/src/views/print/parts/A4Attendance.vue` (mới) | Nội dung trang 1 (mục 3) |
| `web/src/views/print/parts/A4Summary.vue` (mới) | Nội dung trang 2 (mục 4) |
| `web/src/builders/payslip/sheet.ts` | Xoá. Chỉ `getPayslipSheet` gọi, dựng kiểu `sheet` cũ (R4) |
| `web/src/views/print/slipFormat.ts` | Xoá. Chỉ `A4Payslip.vue` cũ dùng (R4) |
| `web/tests/payslip-a4.spec.ts` (mới) | Test mục 7 |

`PayslipPrint.vue` giữ nguyên. Trang này vẫn dựng một `A4Payslip` cho mỗi phiếu, vẫn hỗ trợ `?in=1`, và vẫn hiện các thông báo đang tải, lỗi, rỗng.

### 1.1 `getPayslipSheet(month, username)`

- Gọi `payslipSheet(month)`.
- Có phiếu thì trả `respond(sheet)`.
- Không có phiếu thì từ chối bằng `ApiError` mã `mock_missing`, như `api()` đang làm. Trang sẽ hiện "Không tải được phiếu lương." như hôm nay.
- `username` không đổi dữ liệu (R1). `?kb=` và `?ten=` không đổi dữ liệu.

## 2. Hợp đồng dữ liệu `A4Sheet`

Khai báo trong `web/src/mock/payslip-a4.ts`, giống các màn khác đang lấy kiểu từ `src/mock`.

- `sheet` là dữ liệu do nguồn phiếu trả: hiện là dữ liệu giả, sau này là BE.
- Thành phần chỉ định dạng: không tính tiền, không lọc ngày.

```ts
export type DayMark = 'work' | 'paid' | 'unpaid' | 'absent' | 'pending';

export type A4Day = {
  date: string; // 'YYYY-MM-DD'
  label: string; // Loại ngày: 'Normal', 'Flex', 'Night', 'Chủ nhật', 'Phép năm', …
  mark: DayMark;
  in: string | null; // 'HH:MM', giờ vào thực tế
  out: string | null; // 'HH:MM', giờ ra thực tế
  hours: number | null; // giờ làm trong ca; ngày không ca để null
  ot: number | null; // giờ OT
  makeup: number | null; // giờ làm bù
  note: string | null; // ngắn, khoảng 18 ký tự
  adjust: number | null; // đồng, có dấu: phụ cấp ca + tiền OT − trừ giờ
  total: number; // thành tiền của ngày, đồng
};

export type A4Qty = { n: number; of?: number; unit: 'ngày' | 'giờ' | 'ca' | '%' };

export type A4Line = {
  label: string;
  hint?: string; // phần chữ xám sau " · "
  flag?: 'pending'; // chấm cam rỗng trước nhãn
  qty?: A4Qty; // cột Số lượng
  rule?: number; // cột Theo quy chế, đồng
  actual: number | null; // cột Thực tế, đồng; null chỉ có ở dữ liệu giả, in "BE tính" (R8)
  bold?: boolean;
};

export type A4KpiPart = { label: string; weight: number; score: number | null };

export type A4Group = { title: string; kpi?: A4KpiPart[]; lines: A4Line[] };

export type A4Stats = {
  workDays: number;
  flex: number;
  night: number;
  paidLeave: number;
  isat: number;
  unpaid: number;
  absent: number;
  pending: number;
  otHours: number;
  makeupHours: number;
  lateHours: number;
};

export type A4Sheet = {
  month: string; // 'YYYY-MM'
  name: string;
  kind: string; // 'NV'
  level: number;
  contract: string; // 'HĐLĐ từ 3 tháng'
  from: string;
  to: string; // 'YYYY-MM-DD'
  periodNote: string; // 'tạm tính cả tháng, số liệu tới 02/11'
  stdDays: number; // 26
  dayRate: number; // 230769
  days: A4Day[]; // chỉ các ngày cần in, theo thứ tự ngày
  stats: A4Stats;
  groups: A4Group[];
  totals: A4Line[];
  net: number;
  leaveLeft: number; // ngày phép năm còn lại
};
```

Luật cho các trường:

- **Ngày cần in** (quyết định 2): ngày có ca, gồm cả ngày nghỉ, vắng, chờ giải trình. Ngày không ca chỉ in khi có giờ vào, OT hoặc làm bù. Nguồn phiếu lọc trước khi trả. Dữ liệu giả lọc bằng hàm `printable` (mục 6).
- **`mark` theo loại ngày:**

  | `mark` | Chấm | Loại ngày |
  |---|---|---|
  | `work` | tròn đặc #1c1c1c | Normal, Flex, Night (tên ca), Chủ nhật |
  | `paid` | tròn đặc #2f5aa8 | Phép năm, Việc riêng có lương, iSAT, Nghỉ lễ, Nghỉ có làm bù |
  | `unpaid` | vòng #2f5aa8, viền 2px | Không lương, Việc riêng không lương, Chế độ BHXH |
  | `absent` | tròn đặc #b43f3f | Vắng |
  | `pending` | vòng #eb973d, viền 2px | Chờ giải trình |

  Phúc lợi nội bộ chưa xếp vào nhóm nào (câu hỏi mở 3). Tháng mẫu không có ngày này.
- **Dòng ngày nghỉ:** mọi dòng có `mark` khác `work` có nền xám #f5f5f5.
- **Ngày lễ** (R7):
  - ngày lễ rơi vào thứ 2 – thứ 7 là ngày nghỉ có lương: `label` 'Nghỉ lễ', tên ngày lễ để ở `note`;
  - giờ làm trong ngày lễ để ở `ot` và vào dòng "OT ngày lễ (×3)";
  - tháng mẫu không có ngày lễ.
- **`adjust`:** phụ cấp ca (Flex, Night + Off Paid) + tiền OT của ngày − tiền trừ đi muộn.
  - Tiền làm bù không nằm ở đây. Tiền đó tính cho ngày nghỉ được bù, và hiện ở trang 2.

## 3. Trang 1 · Chấm công (P1)

Khung tờ theo mục 5. Từ trên xuống:

1. **Đầu trang:**
   - logo 60×42, cách tiêu đề 16px;
   - `h1` "Phiếu lương tháng 10/2026": League Spartan 600, 24/28;
   - dòng phụ xám, cách 2px: "Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 02/11 · công chuẩn theo quy chế: 26 ngày".
   - Cách ghép dòng phụ: `Từ {dm(from)} đến {dmy(to)} · {periodNote} · công chuẩn theo quy chế: {stdDays} ngày`.
2. **Ô người nhận:**
   - cách trên 12px, viền 1px #e0e0e0, góc 8px;
   - lưới 4 cột `1.3fr 1fr 1fr 1fr`, giữa các cột có vạch dọc #e0e0e0, mỗi ô đệm 6px 10px;
   - mỗi ô có nhãn xám ở trên, giá trị 13/18 đậm 600 ở dưới;
   - bốn ô:
     - Họ tên: `name`;
     - Loại · bậc: `{kind} · Bậc {level}`;
     - Tình trạng: `contract`;
     - Kỳ lương: `monthLabel(month)`, ra "Tháng 10/2026".
3. **Tiêu đề bảng:**
   - cách trên 16px, dưới 6px;
   - trái: `h2` "Chấm công tháng 10/2026", 15/20, 600;
   - phải, chữ xám: "Lương ngày {vnd(dayRate)} · số tiền tính bằng đồng".
4. **Bảng chấm công:**
   - `<table>` đặt tên bằng `aria-labelledby` trỏ tới `h2`;
   - rộng 698px, `table-layout: fixed`, `border-collapse: collapse`;
   - độ rộng đặt trên `th` (không dùng `<col>`), mọi ô `box-sizing: border-box`;
   - ô đệm 2px 5px, 12/16, `white-space: nowrap`, dư chữ thì `…`;
   - đầu bảng chữ xám thường, đệm dưới 5px, vạch dưới 1.5px #212121;
   - mỗi dòng có vạch dưới 1px #e0e0e0, cao khoảng 21px.

   | Cột | Rộng | Canh | Nội dung |
   |---|---|---|---|
   | Ngày | 66 | trái | `dowShort(date)` xám trong ô rộng 22px, rồi `dm(date)`: "T6 09/10" |
   | Loại ngày | 146 | trái | chấm 8px theo `mark`, cách chữ 6px, rồi `label` |
   | Vào – ra | 84 | phải | `{in}–{out}`, gạch ngang ngắn, không dấu cách. Chỉ có một đầu thì in đầu đó. Không có cả hai thì để trống |
   | Giờ | 36 | phải | `num(hours)`: "8", "7,75" |
   | OT | 44 | phải | `num(ot)` |
   | Làm bù | 54 | phải | `num(makeup)` |
   | Ghi chú | 116 | trái | `note` |
   | Cộng / trừ | 76 | phải | `vndSigned(adjust)`: "+46.154", "−14.423" |
   | Thành tiền | 76 | phải | `vnd(total)`, luôn in, kể cả "0" |

   Giờ, OT, Làm bù, Cộng / trừ: `null` hoặc 0 thì để trống.
5. **Dải tổng hợp:**
   - cách trên 10px, viền 1px #e0e0e0, góc 8px;
   - lưới 5 cột × 2 hàng, có vạch giữa các ô, mỗi ô đệm 5px 10px;
   - nhãn xám ở trên, giá trị 13/18 đậm 600 ở dưới;
   - giá trị theo thứ tự:

   | Nhãn | Giá trị |
   |---|---|
   | Ngày công | `{workDays} ngày` |
   | Ca Flex · Night | `{flex} · {night} ca` |
   | Nghỉ có lương | `{paidLeave} ngày` |
   | iSAT | `{isat} ngày` |
   | Không lương, BHXH | `{unpaid} ngày` |
   | Vắng | `{absent} ngày` |
   | Chờ giải trình | `{pending} ngày` |
   | OT | `{num(otHours)} giờ` |
   | Làm bù | `{num(makeupHours)} giờ` |
   | Trừ giờ đi muộn | `{num(lateHours)} giờ` |

6. **Chú thích:**
   - cách trên 8px, chữ xám;
   - hàng chấm: Đi làm, Nghỉ có lương, Nghỉ không lương, Vắng, Chờ giải trình (khoảng cách 2px 16px);
   - dưới hàng chấm, cách 2px, một đoạn: "Giờ, OT, Làm bù tính bằng giờ. OT ngày thường ×1,5, thứ 7 và Chủ nhật ×2, ngày lễ ×3. Làm bù là giờ làm để bù cho ngày đã nghỉ, không phải OT."
7. Trang 1 **không có** Tổng thu nhập, Thực nhận hay dải tiền nào khác.

## 4. Trang 2 · Các khoản (P2)

1. **Đầu trang chạy:**
   - logo 40×28, cách 12px, dưới cách 12px;
   - dòng đậm 13/18: `Phiếu lương tháng {monthShort(month)} · {name}`;
   - dòng xám: `{kind} · Bậc {level} · {contract} · từ {dm(from)} đến {dmy(to)}`.
2. **Tiêu đề:**
   - trái: `h2` "Tổng hợp lương";
   - phải, chữ xám: "Số tiền tính bằng đồng";
   - dưới cách 6px.
3. **Bảng các khoản** là `<table>` (R5) có 4 cột:

   | Cột | Rộng | Canh |
   |---|---|---|
   | Khoản | phần còn lại | trái |
   | Số lượng | 84 | phải |
   | Theo quy chế | 100 | phải |
   | Thực tế | 100 | phải |

   - Giữa các cột cách 12px. Ô đệm 2px 6px, vạch dưới 1px #e0e0e0.
   - Đầu bảng chữ xám, vạch dưới 1.5px #212121.
   - Chữ trong cột Khoản dư thì `…`. Các cột số không xuống dòng.
   - **Hàng nhóm:** `th` gộp 4 cột, `scope="colgroup"`, cách trên 6px, nền #f5f5f5, chữ xám 600, viết hoa bằng CSS, giãn chữ 0.4px.
   - **Ô Khoản:** chấm cam rỗng nếu `flag === 'pending'`, rồi `label`. Có `hint` thì thêm phần xám ` · {hint}` ở chữ thường.
   - **Ô Số lượng:**
     - có `of`: `{num(n)}/{of} {unit}`, ra "19/26 ngày";
     - `unit` là '%': `{num(n)}%`, ra "85,6%";
     - còn lại: `{num(n)} {unit}`, ra "4 giờ";
     - không có `qty` thì để trống.
   - **Ô Theo quy chế:** `vnd(rule)`, không có thì để trống. Ô này chỉ chứa tiền.
   - **Ô Thực tế:**
     - số âm: `vndSigned`, ra "−14.423";
     - số không âm: `vnd`, ra "0", "230.769";
     - `null`: chữ xám "BE tính".
   - Dòng `bold`: đậm 600, riêng phần `hint` vẫn chữ thường.
   - **KPI:** nhóm có `kpi` thì hiện thêm một hàng lưới 5 cột ngay dưới hàng nhóm, đệm 4px 6px. Mỗi ô có nhãn xám `{label} {weight}%` và điểm 13/18 đậm `{score}%`. Điểm `null` in "—".
4. **Các dòng tổng** (`totals`) cùng 4 cột, cách trên 8px, vạch trên 2px #212121.
5. **Thực nhận:**
   - một băng nền #fff9ec, vạch trên và dưới 2px #212121, đệm 7px 6px, 18/24 đậm 600;
   - trái "Thực nhận", phải `vndc(net)`, ra "9.657.922 ₫".
6. **Cuối trang:** cách trên 10px.
   - Trái: "Ngày phép năm còn lại" xám + `{leaveLeft} ngày` đậm.
   - Phải: ô ký rộng 220px, cao tối thiểu 72px, canh giữa, "Người nhận" đậm, dưới là "Ký, ghi rõ họ tên" xám.

## 5. Khung tờ và in (`A4Page.vue`, `A4Payslip.vue`)

- **Mỗi tờ:**
  - `<section class="pl-a4" aria-label="Trang {n}/2">`, 210mm × 296mm, đệm 40px 48px;
  - flex dọc, `overflow: hidden`, nền trắng, chữ #212121;
  - Geist 12/16, `font-variant-numeric: tabular-nums`, `print-color-adjust: exact`.
- **Hình chìm:** `gft-watermark.png` rộng 430px, nằm giữa tờ, dưới chữ, `pointer-events: none`.
- **Chân trang:**
  - đẩy xuống đáy bằng `margin-top: auto`;
  - đệm trên 8px, vạch trên 1px #bdbdbd, chữ xám;
  - ba phần: ô trống rộng 96px, ảnh `gft-slogan.png` 158×20 (alt "Trao trọn niềm tin, gửi trọn giải pháp.") ở giữa, "Trang {n}/2" canh phải trong ô 96px.
- **CSS in giữ như hiện nay:**
  - `@page { size: A4; margin: 0 }`;
  - mỗi `.pl-a4` có `break-after: page`, không đổ bóng, không lề;
  - `PayslipPrint.vue` bỏ ngắt trang sau tờ cuối.
- **Bảng màu:** chữ xám dùng #616161 (không nhạt hơn #767676), vạch #e0e0e0 và #bdbdbd. Không có chữ nào dưới 12px.
- **Đọc được khi in đen trắng:** chấm đặc và chấm vòng khác nhau về hình, và luôn có chữ loại ngày đi kèm.
- **Chỗ trống:** trang 1 phải chứa được 31 dòng ngày, tức một tháng 31 ngày có đi làm cả Chủ nhật. Với 29 dòng của tháng mẫu, từ chú thích tới chân trang phải còn ít nhất 42px.

## 6. Dữ liệu giả · tháng mẫu 10/2026

`payslipSheet(month: string): A4Sheet | null`:

- Trả tháng mẫu khi `month === MOCK_MONTH`, tức '2026-10'. Tháng khác trả `null`.
- Ngày trong mock khai cho cả tháng, mỗi ngày có cờ `hasShift`. Cờ này chỉ dùng trong mock, không đưa ra ngoài.
- `printable(d) = d.hasShift || d.in != null || (d.ot ?? 0) > 0 || (d.makeup ?? 0) > 0` lọc ra 29 dòng. CN 04/10 và CN 18/10 không có ca, không làm, nên không in.

Tháng mẫu tách khỏi đồng hồ giả (R2):

- Người: NV thử nghiệm, NV, bậc 1, HĐLĐ từ 3 tháng.
- Kỳ lương: 01/10 – 31/10/2026, `periodNote` "tạm tính cả tháng, số liệu tới 02/11".
- Công chuẩn 26. Lương cơ bản 6.000.000.
- Lương ngày 230.769, lương giờ 28.846.
- Phép năm còn lại 22 ngày.

**Ngày.** Ngày nào có ca Normal thì giờ vào – ra mặc định là 08:00–17:00, Giờ là 8, Thành tiền là 230.769, trừ khi bảng ghi khác. Ô trống là `null`.

| Ngày | Loại ngày | `mark` | Vào – ra | Giờ | OT | Làm bù | Ghi chú | Cộng / trừ | Thành tiền |
|---|---|---|---|---|---|---|---|---|---|
| T5 01/10, T6 02/10, T7 03/10 | Normal | work | 08:00–17:00 | 8 | | | | | 230.769 |
| T2 05/10 | Phép năm | paid | | | | | | | 230.769 |
| T3 06/10 | Flex | work | 06:00–15:00 | 8 | | | | +46.154 | 276.923 |
| T4 07/10 | Normal | work | 08:00–17:00 | 8 | | | | | 230.769 |
| T5 08/10 | Night | work | 22:00–07:00 | 8 | | | | +129.808 | 360.577 |
| T6 09/10 | Normal | work | 08:00–22:00 | 8 | 4 | | | +173.077 | 403.846 |
| T7 10/10 | Không lương | unpaid | | | | | | | 0 |
| CN 11/10 | Chủ nhật | work | 08:00–12:00 | | 4 | | | +230.769 | 230.769 |
| T2 12/10 | Flex | work | 06:00–15:00 | 8 | | | | +46.154 | 276.923 |
| T3 13/10 | Normal | work | 08:00–17:00 | 8 | | | | | 230.769 |
| T4 14/10 | Normal | work | 08:15–17:00 | 7,75 | | | Muộn 15 phút | | 230.769 |
| T5 15/10 | Vắng | absent | | | | | Không chấm công | | 0 |
| T6 16/10 | Night | work | 22:00–07:00 | 8 | | | | +129.808 | 360.577 |
| T7 17/10 | iSAT | paid | | | | | | | 230.769 |
| T2 19/10 | Chế độ BHXH | unpaid | | | | | BHXH chi trả | | 0 |
| T3 20/10 | Nghỉ có làm bù | paid | | | | | Bù 22/10, 25/10 | | 230.769 |
| T4 21/10 | Việc riêng có lương | paid | | | | | | | 230.769 |
| T5 22/10 | Normal | work | 08:00–22:00 | 8 | | 4 | | | 230.769 |
| T6 23/10 | Flex | work | 06:00–15:00 | 8 | | | | +46.154 | 276.923 |
| T7 24/10 | Normal | work | 08:00–20:00 | 8 | 2 | | | +115.385 | 346.154 |
| CN 25/10 | Chủ nhật | work | 08:00–12:00 | | | 4 | | | 0 |
| T2 26/10 | Normal | work | 08:40–17:00 | 7,33 | | | Muộn 40 phút | −14.423 | 216.346 |
| T3 27/10 | Normal | work | 08:00–17:00 | 8 | | | | | 230.769 |
| T4 28/10 | Chờ giải trình | pending | 08:20–17:00 | 7,67 | | | Muộn 20 phút | | 0 |
| T5 29/10 | Night | work | 22:00–07:00 | 8 | | | | +129.808 | 360.577 |
| T6 30/10, T7 31/10 | Normal | work | 08:00–17:00 | 8 | | | | | 230.769 |

Cách ra các số:

- Flex +46.154 = 20% × 28.846 × 8.
- Night +129.808 = thưởng ca đêm 92.308 (40% lương ngày) + Off Paid 37.500.
- OT 09/10 = 4 × 28.846 × 1,5.
- OT 24/10 = 2 × 28.846 × 2.
- OT 11/10 = 4 × 28.846 × 2.
- Trừ 26/10: muộn 40 phút, tính 30 phút, = 0,5 × 28.846.

**`stats`:**

| Trường | Giá trị |
|---|---|
| `workDays` | 19 |
| `flex` | 3 |
| `night` | 3 |
| `paidLeave` | 3 (05, 20, 21/10) |
| `isat` | 1 |
| `unpaid` | 2 (10, 19/10) |
| `absent` | 1 |
| `pending` | 1 |
| `otHours` | 10 |
| `makeupHours` | 8 |
| `lateHours` | 0,5 |

Ngày công không tính Chủ nhật. Thứ 2 – thứ 7 có 27 ngày = 19 + 3 + 1 + 2 + 1 + 1.

**`groups`** (Khoản · hint | Số lượng | Theo quy chế | Thực tế; ô trống là không có):

| Nhóm | Khoản | Số lượng | Theo quy chế | Thực tế |
|---|---|---|---|---|
| Ngày công và lương cơ bản | **Lương cơ bản** | 19/26 ngày | 6.000.000 | 4.384.615 |
| | (chấm cam) Chờ giải trình · 28/10, tạm tính 0 đ tới khi duyệt | 1 ngày | | 0 |
| | Không tính lương · vắng, không lương, chế độ BHXH | 3 ngày | | 0 |
| Nghỉ phép và ngày lễ | Nghỉ có lương · phép năm, việc riêng | 2 ngày | | 461.538 |
| | Quyết toán phép dư | 0 ngày | | 0 |
| | Nghỉ thứ 7 hưởng lương · iSAT | 1 ngày | | 230.769 |
| | Nghỉ lễ | 0 ngày | | 0 |
| Làm thêm và làm bù | OT ngày thường (×1,5) | 4 giờ | | 173.077 |
| | OT ngày cuối tuần (×2) | 6 giờ | | 346.154 |
| | OT ngày lễ (×3) | 0 giờ | | 0 |
| | Làm bù cho ngày nghỉ 20/10 | 8 giờ | | 230.769 |
| Phụ cấp | Chuyên cần 25% · nghỉ từ 3 ngày nên không hưởng | | 1.500.000 | 0 |
| | Đi lại 15% | 19 ngày | 900.000 | 657.692 |
| | Linh hoạt 20% · ca Flex | 3 ca | 1.200.000 | 138.462 |
| | Off Paid · ca Night | 3 ca | 975.000 | 112.500 |
| | Thưởng ca đêm · ca Night | 3 ca | 2.400.000 | 276.923 |
| | **Tổng phụ cấp** | | | 1.185.577 |
| Lương KPI | **Lương KPI** · theo tổng điểm | 85,6% | 6.000.000 | 5.136.000 |
| Đi muộn, về sớm, ra ngoài | Đi muộn 26/10 · muộn 40 phút, tính 30 phút | 0,5 giờ | | −14.423 |

- Nhãn "Nghỉ thứ 7 hưởng lương · iSAT", "Linh hoạt 20% · ca Flex", "Off Paid · ca Night", "Thưởng ca đêm · ca Night" là `label` nguyên câu, không có `hint`. Trên P2 các nhãn này in cả câu màu chữ chính, không có phần xám.
- `kpi` của nhóm Lương KPI:

  | Phần | Trọng số | Điểm |
  |---|---|---|
  | Base Wework | 40 | 85 |
  | Người dùng | 24 | 90 |
  | Đồng nghiệp | 18 | 80 |
  | Quản lý trực tiếp | 12 | 85 |
  | Tự đánh giá | 6 | 90 |

**`totals`:**

| Khoản · hint | Số lượng | Thực tế |
|---|---|---|
| **Tổng thu nhập** | | 12.134.076 |
| Các khoản miễn thuế | | `null` (in "BE tính") |
| Thu nhập chịu thuế | | `null` (in "BE tính") |
| Bảo hiểm bắt buộc · BHXH 8%, BHTN 1%, BHYT 1,5% | 10,5% | 630.000 |
| **Thu nhập sau bảo hiểm** | | 11.504.076 |
| Thuế TNCN | | 0 |
| Tạm ứng · 80% lương ngày công 01–15/10 | 10 ngày | 1.846.154 |

`net` = 9.657.922.

Mock tự cộng bốn số từ các dòng đã làm tròn (R6), không ghi tay:

- Tổng phụ cấp = tổng năm dòng phụ cấp.
- Tổng thu nhập = tổng mọi dòng trong `groups`, trừ dòng Tổng phụ cấp.
- Thu nhập sau bảo hiểm = Tổng thu nhập − bảo hiểm.
- Thực nhận = Thu nhập sau bảo hiểm − thuế − tạm ứng.

Cách ra các số:

- Lương cơ bản = 6.000.000 × 19 / 26.
- Nghỉ có lương = 2 × 230.769 (05/10 và 21/10).
- Ngày 20/10 được trả qua dòng làm bù: 8 giờ × 28.846 = 230.769 (câu hỏi mở 2).
- OT cuối tuần = 115.385 (24/10) + 230.769 (11/10).
- Đi lại = 900.000 × 19 / 26.
- KPI = 6.000.000 × 85,6%. 85,6 = 85×0,40 + 90×0,24 + 80×0,18 + 85×0,12 + 90×0,06.
- Bảo hiểm = 6.000.000 × 10,5%.
- Tạm ứng = 80% × 10 ngày công 01–15/10 × 230.769.
- Thuế 0 vì thu nhập dưới mức giảm trừ.

Ghi chú về tháng mẫu:

- Luật đã chốt không cho OT trong tháng có nghỉ làm bù. Mẫu cố ý có cả hai để xem cách in.
- Mock không kiểm luật đó.

## 7. Test giao diện · `web/tests/payslip-a4.spec.ts`

Đường dẫn: `/in/phieu-luong/2026-10/demo_a_broken`. Tìm tờ bằng `getByRole('region', { name: 'Trang 1/2' })` và `'Trang 2/2'`. Tìm dòng bằng `getByRole('row', { name: /…/ })`.

1. `page 1 prints one row per day that needs one`
   - Bảng "Chấm công tháng 10/2026" có 29 dòng thân.
   - Có dòng 11/10 và 25/10 với loại "Chủ nhật".
   - Không có dòng 04/10, 18/10.
2. `page 1 keeps OT, make-up and notes in their own columns`
   - 9 tiêu đề cột đúng thứ tự mục 3.
   - Dòng 09/10: OT "4", Cộng / trừ "+173.077", Thành tiền "403.846".
   - Dòng 22/10: Làm bù "4", OT trống.
   - Dòng 26/10: Ghi chú "Muộn 40 phút", Cộng / trừ "−14.423".
   - Dòng 28/10: loại "Chờ giải trình", Vào – ra "08:20–17:00", Thành tiền "0".
   - Dòng 05/10: Vào – ra trống, Thành tiền "230.769".
3. `page 1 has no money total`
   - Tờ 1 không chứa "Tổng thu nhập", "Thực nhận".
   - Dải tổng hợp có đủ 10 cặp nhãn – giá trị của mục 6, ví dụ "Ca Flex · Night" – "3 · 3 ca", "Trừ giờ đi muộn" – "0,5 giờ".
   - Chú thích có đủ 5 chấm.
4. `page 2 splits OT into three rows`: ba dòng "OT ngày thường (×1,5)" 4 giờ 173.077, "OT ngày cuối tuần (×2)" 6 giờ 346.154, "OT ngày lễ (×3)" 0 giờ 0.
5. `make-up hours are paid as money`: dòng "Làm bù cho ngày nghỉ 20/10" có Số lượng "8 giờ", Theo quy chế trống, Thực tế "230.769".
6. `rule column holds only money, actual column always money`
   - Mọi ô Theo quy chế khớp `^(\d{1,3}(\.\d{3})*)?$`.
   - Mọi ô Thực tế khớp `^−?\d{1,3}(\.\d{3})*$` hoặc là "BE tính".
7. `totals add up from the rounded lines`
   - Tổng các ô Thực tế trong các nhóm, trừ dòng "Tổng phụ cấp", bằng Tổng thu nhập 12.134.076.
   - Thực nhận "9.657.922 ₫".
   - Lưới KPI có 5 phần.
8. `prints as two A4 sheets that do not overflow`
   - `emulateMedia({ media: 'print' })`.
   - Có đúng 2 `.pl-a4`, mỗi tờ có `scrollHeight <= clientHeight`.
   - Mọi phần tử có chữ trong tờ có `font-size` tính ra ≥ 12px.
   - Ở tờ 1, khoảng từ đáy chú thích tới đỉnh chân trang ≥ 42px.
9. `another month shows the load error`: `/in/phieu-luong/2026-11/demo_a_broken` hiện "Không tải được phiếu lương."

`payroll-ux.spec.ts` (in ngăn kéo Bảng lương) không bị ảnh hưởng và phải vẫn xanh.

## 8. Phán quyết

- **R1** — Mọi `username` trong tháng 10/2026 thấy cùng tháng mẫu, tên "NV thử nghiệm". `?ten=` không đổi tên.
  - Lý do: mock chỉ có một tháng dựng đủ loại ngày; ghép tên thật vào số mẫu thì sai lệch. Nhân viên bấm "Xem phiếu A4" sẽ thấy rõ đây là mẫu.
  - Nếu sai: phải thêm số liệu theo từng người, hoặc chờ BE.
- **R2** — Tháng mẫu có dữ liệu tới 02/11 dù đồng hồ giả là 28/10.
  - Lý do: chữ đã duyệt trên P1; cần một tháng đủ ngày.
  - Nếu sai: bỏ các ngày 29–31/10 và sửa lại số.
- **R3** — Phiếu A4 là phiếu của kỳ lương (Bảng lương), nên có dòng bảo hiểm và thuế dù dòng phụ ghi "tạm tính cả tháng".
  - Lý do: luật 05/11 "tạm tính không trừ bảo hiểm, thuế" nói về khối Thu nhập của nhân viên.
  - Nếu sai: tháng mẫu đổi bảo hiểm và thuế về 0, Thực nhận thành 10.287.922.
- **R4** — Xoá `builders/payslip/sheet.ts` và `views/print/slipFormat.ts`.
  - Lý do: chỉ bản in cũ dùng hai file này, và chúng dựng kiểu dữ liệu cũ.
  - Phần còn lại của `services/payslip.ts` giữ nguyên.
  - Nếu sai: lấy lại từ git.
- **R5** — Trang 2 dựng bằng `<table>`, P2 thì vẽ bằng lưới CSS. Độ rộng và khoảng cách giữ đúng P2.
  - Lý do: đọc được bằng trình đọc màn hình, test tìm dòng bằng role.
  - Nếu sai: lệch vài px so với board.
- **R6** — Các dòng tổng là tổng các dòng đã làm tròn. Tiền từng ngày ở trang 1 chỉ để xem, không cộng thành tổng nào.
  - Ví dụ: 19 × 230.769 = 4.384.611, trong khi Lương cơ bản là 4.384.615.
  - Lý do: trang 1 không có dải tiền, nên không có hai tổng lệch nhau để người đọc so.
  - Nếu sai: phải chọn một nguồn tổng duy nhất.
- **R7** — Ngày lễ in là ngày nghỉ có lương "Nghỉ lễ", tên lễ ở Ghi chú. Giờ làm ngày lễ vào cột OT.
  - Lý do: luật OT ×3 đã chốt; board loại ngày trước đó có dòng "Nghỉ lễ · Quốc khánh".
  - Tháng mẫu không có ngày lễ.
  - Nếu sai: thêm loại ngày "Làm ngày lễ".
- **R8** — Thực tế `null` in "BE tính" xám. Chỉ có ở hai dòng miễn thuế và chịu thuế của dữ liệu giả.
  - Lý do: chưa có luật miễn thuế.
  - Nếu sai: BE trả số, thành phần in số như các dòng khác.
- **R9** — Vào – ra thiếu một đầu thì in đầu còn lại. Thiếu cả hai thì để trống.
  - Lý do: ô chỉ rộng 84px; lý do thiếu giờ nằm ở loại ngày "Chờ giải trình".
  - Nếu sai: đổi chữ hiển thị, không đổi dữ liệu.

## 9. Câu hỏi còn mở (không chặn việc làm)

1. Ngày nghỉ có làm bù mà chỉ bù được một phần, ví dụ bù 4/8 giờ: trả bao nhiêu? Tháng mẫu bù đủ 8 giờ.
2. Ngày nghỉ đã bù đủ 8 giờ có được trả nguyên lương ngày không? Đang là đọc hiểu, tháng mẫu tạm trả 230.769.
3. Phúc lợi nội bộ là nghỉ có lương hay không lương? Câu trả lời quyết định chấm của loại ngày này và dòng nó vào ở trang 2.
4. Luật các khoản miễn thuế và thu nhập chịu thuế: BE tính, chưa có luật. Thuế TNCN của tháng mẫu vẫn 0 trong mọi trường hợp.
