# Phiếu lương A4 hai trang trên dữ liệu giả — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/in/phieu-luong/2026-10/<username>` hiện phiếu lương A4 hai trang theo board P1 (chấm công) và P2 (các khoản), lấy từ dữ liệu giả, không gọi `/api`.

**Architecture:**

- `web/src/mock/payslip-a4.ts` giữ kiểu `A4Sheet` và tháng mẫu 10/2026.
  - Mock tự lọc ngày cần in (`printable`).
  - Mock tự cộng các dòng tổng từ các dòng đã làm tròn.
- `web/src/views/print/parts/a4-format.ts` gồm các hàm thuần đổi số sang chữ, dùng cho cả hai trang: ô để trống, số có dấu, số lượng, Vào – ra, dòng đầu trang, dải tổng hợp.
- Ba thành phần chỉ hiển thị:
  - `A4Page.vue`: khung một tờ, gồm hình chìm, nội dung, chân trang "Trang n/2";
  - `A4Attendance.vue`: trang 1;
  - `A4Summary.vue`: trang 2.
- `A4Payslip.vue` ghép hai tờ và giữ CSS in. `services/payslip.ts` `getPayslipSheet` trả mock qua `respond()`.
- Thứ tự: Task 1 dữ liệu, Task 2 hàm định dạng, Task 3 nối service và dựng khung cùng đầu hai trang, Task 4 thân trang 1, Task 5 thân trang 2. Chạy lần lượt, không song song.

**Tech Stack:** Vue 3.5, Vite 8, Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-05-payslip-a4-redesign-design.md](../specs/2026-11-05-payslip-a4-redesign-design.md). Câu chữ, con số, độ rộng, màu lấy từ mục 3–6 của spec.

**Gốc:** nhánh `claude/musing-brahmagupta-cbd29d`, viết trên `d1a515c`.

**Mốc trước khi sửa (05/11/2026, `d1a515c`, `PW_PORT=4191`):** sau `npm ci` trong `web/`, `npx playwright test` cho 253 passed, 15 skipped, 0 failed.

## Global Constraints

- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc; không đọc `spec/` gốc.
- Chỉ sửa đúng các file trong "File Structure". Cấm sửa:
  - `views/print/PayslipPrint.vue`, `utils/format.ts`, `mock/clock.ts`, `mock/respond.ts`, `services/http.ts`;
  - `builders/payslip/drawer.ts`, `router/**`, `design-index/**`, `views/DesignIndex.vue`;
  - mọi file của màn Admin (`views/admin/**`) và màn nhân viên (`views/staff-desktop/**`, các màn `/nv/*`).
- Mã mới không có `fetch(` hay `api(`. Test không dùng `page.route`. `payslip-a4.spec.ts` có một test kiểm bộ ghi request `/api` (và lỗi trang) rỗng.
- Xác minh chỉ bằng test. Không typecheck, không prettier, không chạy `npm test` ở gốc. Luôn dùng cổng 4191:
  - một file: `cd web && PW_PORT=4191 npx playwright test <tên-file>`;
  - cả bộ: `cd web && PW_PORT=4191 npx playwright test`.
- Mỗi task: viết test, chạy cho đỏ, viết mã, chạy cho xanh, commit.
  - Commit message dạng `feat(web): …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Chỉ `git add` file của task. Không `git add -A`, không stage `.claude/launch.json`, không push.
- Câu chữ chép đúng spec, kể cả ký tự:
  - dấu trừ "−" (U+2212, do `vndSigned` tạo);
  - gạch "–" (U+2013) trong "Vào – ra", "08:00–17:00", "01–15/10";
  - "·" và "×".
- Màu và chữ (spec mục 3–5):
  - chữ #212121, chữ xám #616161, vạch #e0e0e0 / #bdbdbd, nền dòng nghỉ #f5f5f5, băng Thực nhận #fff9ec;
  - chấm: đi làm #1c1c1c, có lương #2f5aa8, không lương là vòng 2px #2f5aa8, vắng #b43f3f, chờ giải trình là vòng 2px #eb973d;
  - Geist 12/16, `h1` League Spartan 600 24/28;
  - không chữ nào dưới 12px, không đổ bóng, khung góc 8px, không có nhãn hay ô dạng viên thuốc.
- Mỗi file mới mở đầu bằng một dòng chú thích tiếng Việt nói file làm gì, như mã hiện có.
  - File trong `mock/` import tương đối (`./clock`).
  - File trong `views/` import qua `@/`.
- **Móc DOM cho test** (tên class và cấu trúc là hợp đồng giữa mã và test):
  - **Tờ:**
    - `section.pl-a4[aria-label="Trang {n}/2"]` chứa `img.wm` (alt ""), nội dung, rồi `footer.ft`;
    - `footer.ft` gồm `span`, `img` alt "Trao trọn niềm tin, gửi trọn giải pháp.", `span` "Trang {n}/2".
  - **Trang 1, gốc `div.att`:**
    - `header.hd`: `img` alt "GFT", `h1`, `p.sub`;
    - `div.who`: 4 `div`, mỗi `div` có `span.lb` và `b`;
    - `div.sh`: `h2` và `span.lb`;
    - `table.cc`: `aria-labelledby` trỏ tới `h2`, id lấy từ `useId()`. `thead th` ×9. Mỗi ngày một `tbody tr`, có thêm class `off` khi `mark !== 'work'`. Ô Loại ngày có `i.dot.m-{mark}` (aria-hidden);
    - `div.sts`: 10 `div`, mỗi `div` có `span.lb` và `b`;
    - `div.lg`: `div.keys` gồm 5 `span`, mỗi `span` có `i.dot.m-{mark}`; sau đó là một `p`.
  - **Trang 2, gốc `div.sum2`:**
    - `header.rh`: `img` alt "GFT", `div` chứa `b` và `span.lb`;
    - `div.sh`: `h2` "Tổng hợp lương" và `span.lb`;
    - `table.ts`: `aria-labelledby` trỏ tới `h2`, `thead th` ×4;
    - `tbody.lines` gồm:
      - `tr.grp`: một `th[colspan=4][scope=colgroup]`;
      - `tr.kpi`: một `td[colspan=4]` chứa 5 `div`, mỗi `div` có `span.lb` và `b`;
      - `tr.ln`: thêm class `bb` khi `bold`. Có 4 `td`. Ô đầu gồm `i.dt` khi `flag`, rồi nhãn, rồi `<span class="lb"> · {hint}</span>`. `actual === null` thì ô cuối là `span.lb` "BE tính";
    - `tbody.sum`: các `tr.ln` của `totals`;
    - `div.net`: 2 `span`;
    - `div.end`: bên trái `span.lb` và `b`; bên phải `div.sign` gồm `b` và `span.lb`.

## Review Focus

1. Chữ dài ở ô Ghi chú hoặc Loại ngày phải nằm trên một dòng và cắt bằng "…". Test ở Task 4 kiểm mỗi dòng thân bảng cao không quá 22px.
2. Ngày chỉ có giờ vào, hoặc chỉ có giờ ra, thì in đầu còn lại. Test `inOutText` ở Task 2.
3. Phần KPI chưa có điểm in "—". Test `scoreText(null)` ở Task 2.
4. Phân biệt 0 với ô trống:
   - trang 1: Giờ, OT, Làm bù, Cộng / trừ để trống khi 0 hoặc null; Thành tiền luôn in, kể cả "0";
   - trang 2: Thực tế luôn in, kể cả "0".
   - Test hàm ở Task 2, test regex cột ở Task 5.
5. Tháng có 31 dòng vẫn vừa trang 1. Test ở Task 4: từ chú thích tới chân trang còn ít nhất 42px. Hai tờ không tràn khi in.

## Phán quyết của plan

- **P1** — Thêm `views/print/parts/a4-format.ts`. Mục 1 của spec không liệt kê file này.
  - Lý do: hàm thuần thì test được các trường hợp biên của Review Focus 2–4 mà không cần thêm tháng giả.
  - Nếu sai: thừa một file nhỏ.
- **P2** — Móc DOM ở trên do plan đặt ra. Spec chỉ tả hình thức hiển thị.
  - Nếu sai: đổi tên class ở cả mã lẫn test.
- **P3** — Test in (hai tờ không tràn, chữ ≥ 12px, còn ≥ 42px) đặt ở Task 4.
  - Lý do: lúc viết test thì `.lg` chưa có nên test đỏ thật. Task 5 phải giữ test này xanh.

## File Structure

| File | Task | Việc |
|---|---|---|
| `web/src/mock/payslip-a4.ts` (mới) | 1 | Kiểu của spec mục 2, tháng mẫu của spec mục 6, `payslipSheet(month)` |
| `web/tests/payslip-a4-data.spec.ts` (mới) | 1, 2 | Test dữ liệu và hàm định dạng, chạy trong Node, không mở trang |
| `web/src/views/print/parts/a4-format.ts` (mới) | 2 | Hàm đổi số sang chữ |
| `web/src/services/payslip.ts` | 3 | `getPayslipSheet` đọc mock |
| `web/src/views/print/parts/A4Page.vue` (mới) | 3 | Khung tờ |
| `web/src/views/print/A4Payslip.vue` | 3 | Viết lại: `div.a4-doc` chứa hai `A4Page`, giữ khối CSS in toàn cục |
| `web/src/views/print/parts/A4Attendance.vue` (mới) | 3, 4 | Trang 1: Task 3 làm đầu trang, Task 4 làm bảng, dải tổng hợp, chú thích |
| `web/src/views/print/parts/A4Summary.vue` (mới) | 3, 5 | Trang 2: Task 3 làm đầu trang, Task 5 làm bảng, Thực nhận, chữ ký |
| `web/src/builders/payslip/sheet.ts` | 3 | Xoá (`git rm`) |
| `web/src/views/print/slipFormat.ts` | 3 | Xoá (`git rm`) |
| `web/tests/payslip-a4.spec.ts` (mới) | 3, 4, 5 | Test giao diện của bản in |

---

### Task 1: Dữ liệu giả tháng mẫu

**Files:**
- Create: `web/src/mock/payslip-a4.ts`
- Test: `web/tests/payslip-a4-data.spec.ts`

**Interfaces:**
- Consumes: `MOCK_MONTH` từ `./clock` (giá trị `'2026-10'`).
- Produces:
  - các kiểu `DayMark`, `A4Day`, `A4Qty`, `A4Line`, `A4KpiPart`, `A4Group`, `A4Stats`, `A4Sheet`, chép nguyên khối mã ở spec mục 2;
  - `export function payslipSheet(month: string): A4Sheet | null`.

- [ ] **Step 1: Cài phụ thuộc và chạy mốc**

Run: `cd web && npm ci && PW_PORT=4191 npx playwright test`
Expected: 253 passed, 15 skipped, 0 failed, khớp mốc ở đầu plan. Lệch thì dừng và báo trước khi sửa gì.

- [ ] **Step 2: Viết test đỏ**

```ts
// Tháng mẫu của phiếu A4 (mock/payslip-a4.ts) và các hàm định dạng của bản in: chạy trong Node, không mở trang.
import { expect, test } from '@playwright/test';
import { payslipSheet } from '../src/mock/payslip-a4';

const sheet = () => {
  const s = payslipSheet('2026-10');
  if (!s) throw new Error('không có tháng mẫu');
  return s;
};

test('only the sample month has a sheet', () => {
  expect(payslipSheet('2026-11')).toBeNull();
  expect(payslipSheet('2026-09')).toBeNull();
});

test('header fields follow the sample month', () => {
  const { days, stats, groups, totals, ...head } = sheet();
  expect(head).toEqual({
    month: '2026-10', name: 'NV thử nghiệm', kind: 'NV', level: 1, contract: 'HĐLĐ từ 3 tháng',
    from: '2026-10-01', to: '2026-10-31', periodNote: 'tạm tính cả tháng, số liệu tới 02/11',
    stdDays: 26, dayRate: 230769, net: 9657922, leaveLeft: 22
  });
});

test('days: one row per day that needs one, plain Sundays skipped', () => {
  const s = sheet();
  expect(s.days.map(d => d.date.slice(8))).toEqual([
    '01', '02', '03', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16',
    '17', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'
  ]);
  expect(s.days.every(d => !('hasShift' in d))).toBe(true);
  const day = (dd: string) => s.days.find(d => d.date === `2026-10-${dd}`);
  const off = { in: null, out: null, hours: null, ot: null, makeup: null, adjust: null };
  expect(day('09')).toEqual({ date: '2026-10-09', label: 'Normal', mark: 'work', in: '08:00', out: '22:00', hours: 8, ot: 4, makeup: null, note: null, adjust: 173077, total: 403846 });
  expect(day('11')).toEqual({ date: '2026-10-11', label: 'Chủ nhật', mark: 'work', in: '08:00', out: '12:00', hours: null, ot: 4, makeup: null, note: null, adjust: 230769, total: 230769 });
  expect(day('20')).toEqual({ date: '2026-10-20', label: 'Nghỉ có làm bù', mark: 'paid', ...off, note: 'Bù 22/10, 25/10', total: 230769 });
  expect(day('22')).toEqual({ date: '2026-10-22', label: 'Normal', mark: 'work', in: '08:00', out: '22:00', hours: 8, ot: null, makeup: 4, note: null, adjust: null, total: 230769 });
  expect(day('25')).toEqual({ date: '2026-10-25', label: 'Chủ nhật', mark: 'work', in: '08:00', out: '12:00', hours: null, ot: null, makeup: 4, note: null, adjust: null, total: 0 });
  expect(day('26')).toEqual({ date: '2026-10-26', label: 'Normal', mark: 'work', in: '08:40', out: '17:00', hours: 7.33, ot: null, makeup: null, note: 'Muộn 40 phút', adjust: -14423, total: 216346 });
  expect(day('28')).toEqual({ date: '2026-10-28', label: 'Chờ giải trình', mark: 'pending', in: '08:20', out: '17:00', hours: 7.67, ot: null, makeup: null, note: 'Muộn 20 phút', adjust: null, total: 0 });
  expect(day('15')).toEqual({ date: '2026-10-15', label: 'Vắng', mark: 'absent', ...off, note: 'Không chấm công', total: 0 });
  const marks: Record<string, number> = {};
  for (const d of s.days) marks[d.mark] = (marks[d.mark] ?? 0) + 1;
  expect(marks).toEqual({ work: 21, paid: 4, unpaid: 2, absent: 1, pending: 1 });
  expect(s.stats).toEqual({
    workDays: 19, flex: 3, night: 3, paidLeave: 3, isat: 1, unpaid: 2,
    absent: 1, pending: 1, otHours: 10, makeupHours: 8, lateHours: 0.5
  });
});

test('pay lines follow P2 and the totals add up from the rounded lines', () => {
  const s = sheet();
  expect(s.groups.map(g => g.title)).toEqual([
    'Ngày công và lương cơ bản', 'Nghỉ phép và ngày lễ', 'Làm thêm và làm bù',
    'Phụ cấp', 'Lương KPI', 'Đi muộn, về sớm, ra ngoài'
  ]);
  const lines = s.groups.flatMap(g => g.lines);
  expect(lines.map(l => [l.label, l.actual])).toEqual([
    ['Lương cơ bản', 4384615], ['Chờ giải trình', 0], ['Không tính lương', 0],
    ['Nghỉ có lương', 461538], ['Quyết toán phép dư', 0], ['Nghỉ thứ 7 hưởng lương · iSAT', 230769], ['Nghỉ lễ', 0],
    ['OT ngày thường (×1,5)', 173077], ['OT ngày cuối tuần (×2)', 346154], ['OT ngày lễ (×3)', 0],
    ['Làm bù cho ngày nghỉ 20/10', 230769],
    ['Chuyên cần 25%', 0], ['Đi lại 15%', 657692], ['Linh hoạt 20% · ca Flex', 138462],
    ['Off Paid · ca Night', 112500], ['Thưởng ca đêm · ca Night', 276923], ['Tổng phụ cấp', 1185577],
    ['Lương KPI', 5136000], ['Đi muộn 26/10', -14423]
  ]);
  const by = (label: string) => lines.find(l => l.label === label);
  expect(by('Lương cơ bản')).toEqual({ label: 'Lương cơ bản', qty: { n: 19, of: 26, unit: 'ngày' }, rule: 6000000, actual: 4384615, bold: true });
  expect(by('Chờ giải trình')).toEqual({ label: 'Chờ giải trình', hint: '28/10, tạm tính 0 đ tới khi duyệt', flag: 'pending', qty: { n: 1, unit: 'ngày' }, actual: 0 });
  expect(by('Không tính lương')).toEqual({ label: 'Không tính lương', hint: 'vắng, không lương, chế độ BHXH', qty: { n: 3, unit: 'ngày' }, actual: 0 });
  expect(by('Nghỉ có lương')).toEqual({ label: 'Nghỉ có lương', hint: 'phép năm, việc riêng', qty: { n: 2, unit: 'ngày' }, actual: 461538 });
  expect(by('OT ngày cuối tuần (×2)')).toEqual({ label: 'OT ngày cuối tuần (×2)', qty: { n: 6, unit: 'giờ' }, actual: 346154 });
  expect(by('Làm bù cho ngày nghỉ 20/10')).toEqual({ label: 'Làm bù cho ngày nghỉ 20/10', qty: { n: 8, unit: 'giờ' }, actual: 230769 });
  expect(by('Chuyên cần 25%')).toEqual({ label: 'Chuyên cần 25%', hint: 'nghỉ từ 3 ngày nên không hưởng', rule: 1500000, actual: 0 });
  expect(by('Off Paid · ca Night')).toEqual({ label: 'Off Paid · ca Night', qty: { n: 3, unit: 'ca' }, rule: 975000, actual: 112500 });
  expect(by('Tổng phụ cấp')).toEqual({ label: 'Tổng phụ cấp', actual: 1185577, bold: true });
  expect(by('Lương KPI')).toEqual({ label: 'Lương KPI', hint: 'theo tổng điểm', qty: { n: 85.6, unit: '%' }, rule: 6000000, actual: 5136000, bold: true });
  expect(by('Đi muộn 26/10')).toEqual({ label: 'Đi muộn 26/10', hint: 'muộn 40 phút, tính 30 phút', qty: { n: 0.5, unit: 'giờ' }, actual: -14423 });
  expect(lines.filter(l => l.rule != null).map(l => [l.label, l.rule])).toEqual([
    ['Lương cơ bản', 6000000], ['Chuyên cần 25%', 1500000], ['Đi lại 15%', 900000],
    ['Linh hoạt 20% · ca Flex', 1200000], ['Off Paid · ca Night', 975000],
    ['Thưởng ca đêm · ca Night', 2400000], ['Lương KPI', 6000000]
  ]);
  expect(s.groups[4].kpi).toEqual([
    { label: 'Base Wework', weight: 40, score: 85 }, { label: 'Người dùng', weight: 24, score: 90 },
    { label: 'Đồng nghiệp', weight: 18, score: 80 }, { label: 'Quản lý trực tiếp', weight: 12, score: 85 },
    { label: 'Tự đánh giá', weight: 6, score: 90 }
  ]);
  const allowance = by('Tổng phụ cấp');
  expect(lines.filter(l => l !== allowance).reduce((sum, l) => sum + (l.actual ?? 0), 0)).toBe(12134076);
  expect(s.totals).toEqual([
    { label: 'Tổng thu nhập', actual: 12134076, bold: true },
    { label: 'Các khoản miễn thuế', actual: null },
    { label: 'Thu nhập chịu thuế', actual: null },
    { label: 'Bảo hiểm bắt buộc', hint: 'BHXH 8%, BHTN 1%, BHYT 1,5%', qty: { n: 10.5, unit: '%' }, actual: 630000 },
    { label: 'Thu nhập sau bảo hiểm', actual: 11504076, bold: true },
    { label: 'Thuế TNCN', actual: 0 },
    { label: 'Tạm ứng', hint: '80% lương ngày công 01–15/10', qty: { n: 10, unit: 'ngày' }, actual: 1846154 }
  ]);
});
```

- [ ] **Step 3: Chạy cho đỏ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4-data`
Expected: FAIL, không tìm thấy module `../src/mock/payslip-a4`.

- [ ] **Step 4: Viết `web/src/mock/payslip-a4.ts`**

- **Kiểu:** chép nguyên khối mã ở spec mục 2.
- **Ngày:**
  - khai đủ 31 ngày của tháng 10 dưới kiểu `MockDay = A4Day & { hasShift: boolean }`;
  - các ngày có trong bảng ở spec mục 6 có `hasShift: true`, trừ CN 11/10 và CN 25/10;
  - CN 04/10 và CN 18/10 có `hasShift: false`, mọi trường còn lại là `null`, Thành tiền 0, `label` 'Chủ nhật', `mark` 'work';
  - giờ 7,33 và 7,67 ghi là `7.33` và `7.67`.
- **Lọc ngày:** `printable(d)` đúng như spec mục 6. Bỏ `hasShift` khỏi từng ngày trả ra.
- **`stats`, `groups`, `kpi`:** chép đúng giá trị ở spec mục 6.
  - Dòng nào không có Số lượng hoặc Theo quy chế thì bỏ hẳn khoá đó, không đặt `undefined`.
- **Bốn số tính trong mock**, theo spec mục 6 và R6:
  - dòng Tổng phụ cấp;
  - Tổng thu nhập;
  - Thu nhập sau bảo hiểm;
  - `net`.
- **`payslipSheet(month)`:** trả một object mới khi `month === MOCK_MONTH`, các tháng khác trả `null`.

- [ ] **Step 5: Chạy cho xanh**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4-data`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add web/src/mock/payslip-a4.ts web/tests/payslip-a4-data.spec.ts
git commit -m "feat(web): mock month for the A4 payslip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Hàm định dạng của bản in

**Files:**
- Create: `web/src/views/print/parts/a4-format.ts`
- Test: `web/tests/payslip-a4-data.spec.ts` (thêm vào cuối)

**Interfaces:**
- Consumes:
  - kiểu `A4Qty`, `A4Sheet`, `A4Stats` từ `@/mock/payslip-a4` (Task 1);
  - `num`, `vnd`, `vndSigned`, `dm`, `dmy` từ `@/utils/format`.
- Produces, mỗi hàm trả chuỗi hiển thị:
  - `blankNum(n: number | null | undefined): string`: `null` hoặc 0 thì `''`, còn lại `num(n)`;
  - `signedText(n: number | null): string`: `null` hoặc 0 thì `''`, còn lại `vndSigned(n)`;
  - `inOutText(a: string | null, b: string | null): string`: `a–b`; thiếu một đầu thì in đầu còn lại; thiếu cả hai thì `''`;
  - `qtyText(q?: A4Qty): string`: theo spec mục 4.3, ô Số lượng;
  - `ruleText(n?: number): string`: không có thì `''`, còn lại `vnd(n)`;
  - `actualText(n: number | null): string | null`: `null` thì `null`; số âm thì `vndSigned`; còn lại `vnd`;
  - `scoreText(n: number | null): string`: `null` thì `'—'`, còn lại `` `${n}%` ``;
  - `periodLine(s: A4Sheet): string`: dòng phụ của trang 1 (spec mục 3.1);
  - `staffLine(s: A4Sheet): string`: dòng xám ở đầu trang 2 (spec mục 4.1);
  - `statCells(st: A4Stats): [string, string][]`: 10 cặp nhãn – giá trị (spec mục 3.5).

- [ ] **Step 1: Viết test đỏ** (thêm import ở đầu file, thêm test ở cuối file)

```ts
import {
  actualText, blankNum, inOutText, periodLine, qtyText, ruleText, scoreText, signedText, staffLine, statCells
} from '../src/views/print/parts/a4-format';

test('format helpers: blanks, signs, check-in/out and quantities', () => {
  expect([blankNum(null), blankNum(0), blankNum(8), blankNum(7.75), blankNum(7.33), blankNum(0.5)])
    .toEqual(['', '', '8', '7,75', '7,33', '0,5']);
  expect([signedText(null), signedText(0), signedText(46154), signedText(-14423)])
    .toEqual(['', '', '+46.154', '−14.423']);
  expect([inOutText('08:00', '17:00'), inOutText('08:02', null), inOutText(null, '17:00'), inOutText(null, null)])
    .toEqual(['08:00–17:00', '08:02', '17:00', '']);
  expect([
    qtyText(undefined), qtyText({ n: 19, of: 26, unit: 'ngày' }), qtyText({ n: 85.6, unit: '%' }),
    qtyText({ n: 10.5, unit: '%' }), qtyText({ n: 4, unit: 'giờ' }), qtyText({ n: 0, unit: 'giờ' }),
    qtyText({ n: 3, unit: 'ca' }), qtyText({ n: 0.5, unit: 'giờ' })
  ]).toEqual(['', '19/26 ngày', '85,6%', '10,5%', '4 giờ', '0 giờ', '3 ca', '0,5 giờ']);
  expect([ruleText(undefined), ruleText(6000000)]).toEqual(['', '6.000.000']);
  expect([actualText(null), actualText(0), actualText(230769), actualText(-14423)])
    .toEqual([null, '0', '230.769', '−14.423']);
  expect([scoreText(null), scoreText(85)]).toEqual(['—', '85%']);
});

test('format helpers: header lines and the summary strip of the sample month', () => {
  const s = sheet();
  expect(periodLine(s)).toBe('Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 02/11 · công chuẩn theo quy chế: 26 ngày');
  expect(staffLine(s)).toBe('NV · Bậc 1 · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
  expect(statCells(s.stats)).toEqual([
    ['Ngày công', '19 ngày'], ['Ca Flex · Night', '3 · 3 ca'], ['Nghỉ có lương', '3 ngày'], ['iSAT', '1 ngày'],
    ['Không lương, BHXH', '2 ngày'], ['Vắng', '1 ngày'], ['Chờ giải trình', '1 ngày'], ['OT', '10 giờ'],
    ['Làm bù', '8 giờ'], ['Trừ giờ đi muộn', '0,5 giờ']
  ]);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4-data`
Expected: FAIL, không tìm thấy module `../src/views/print/parts/a4-format`.

- [ ] **Step 3: Viết `web/src/views/print/parts/a4-format.ts`** theo khối Interfaces ở trên. Không tự tính tiền, chỉ đổi số sang chữ.

- [ ] **Step 4: Chạy cho xanh**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4-data`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/print/parts/a4-format.ts web/tests/payslip-a4-data.spec.ts
git commit -m "feat(web): text helpers for the A4 payslip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Nối dữ liệu giả, khung tờ, đầu hai trang

**Files:**
- Modify: `web/src/services/payslip.ts` (chỉ `getPayslipSheet` và các import)
- Create:
  - `web/src/views/print/parts/A4Page.vue`
  - `web/src/views/print/parts/A4Attendance.vue`
  - `web/src/views/print/parts/A4Summary.vue`
- Modify: `web/src/views/print/A4Payslip.vue` (viết lại)
- Delete: `web/src/builders/payslip/sheet.ts`, `web/src/views/print/slipFormat.ts`
- Test: `web/tests/payslip-a4.spec.ts`

**Interfaces:**
- Consumes:
  - `payslipSheet` và kiểu `A4Sheet` (Task 1);
  - `periodLine`, `staffLine` (Task 2);
  - `respond` từ `@/mock/respond`, `ApiError` từ `./http`;
  - `monthShort`, `monthLabel`, `vnd` từ `@/utils/format`.
- Produces:
  - `getPayslipSheet(month?: string, username?: string): Promise<A4Sheet>`: trả `respond(sheet)`. Mock trả `null` thì từ chối bằng `new ApiError(501, \`Màn này chưa có dữ liệu giả (GET /periods/${month}/payslips/${username}).\`, { code: 'mock_missing' })`;
  - `A4Page.vue`: prop `page: 1 | 2`, một slot mặc định;
  - `A4Attendance.vue`, `A4Summary.vue`: prop `sheet: A4Sheet`;
  - `A4Payslip.vue`: prop `sheet: A4Sheet`, gốc là `div.a4-doc`.

- [ ] **Step 1: Viết test đỏ** (file mới)

```ts
// Bản in phiếu lương A4 (board P1, P2 của Đợt 8) trên dữ liệu giả: không page.route, không gọi /api.
import { expect, test, type Page } from '@playwright/test';

const SLIP = '/in/phieu-luong/2026-10/demo_a_broken';
const sheetPage = (page: Page, n: 1 | 2) => page.getByRole('region', { name: `Trang ${n}/2` });

// Bộ ghi request /api, lỗi chạy và console.error của trang hiện tại; test đầu khẳng định nó rỗng.
let calls: string[] = [];
test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  page.on('pageerror', err => calls.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') calls.push(`console.error: ${msg.text()}`);
  });
});

test('the A4 slip comes from mock data: two sheets, no /api call', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1)).toBeVisible();
  await expect(sheetPage(page, 2)).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(2);
  expect(calls).toEqual([]);
});

test('page 1 header follows P1, for any username and ?ten=', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-10/nhanvien?ten=Nguy%E1%BB%85n%20Thu%20H%C3%A0');
  const p1 = sheetPage(page, 1);
  await expect(p1.getByRole('img', { name: 'GFT' })).toBeVisible();
  await expect(p1.getByRole('heading', { level: 1 })).toHaveText('Phiếu lương tháng 10/2026');
  await expect(p1.locator('.sub')).toHaveText('Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 02/11 · công chuẩn theo quy chế: 26 ngày');
  await expect(p1.locator('.who > div')).toHaveText([
    /Họ tên\s*NV thử nghiệm/, /Loại · bậc\s*NV · Bậc 1/, /Tình trạng\s*HĐLĐ từ 3 tháng/, /Kỳ lương\s*Tháng 10\/2026/
  ]);
  await expect(p1.getByRole('heading', { level: 2 })).toHaveText('Chấm công tháng 10/2026');
  await expect(p1.locator('.sh .lb')).toHaveText('Lương ngày 230.769 · số tiền tính bằng đồng');
});

test('page 2 running head follows P2', async ({ page }) => {
  await page.goto(SLIP);
  const p2 = sheetPage(page, 2);
  await expect(p2.locator('.rh b')).toHaveText('Phiếu lương tháng 10/2026 · NV thử nghiệm');
  await expect(p2.locator('.rh .lb')).toHaveText('NV · Bậc 1 · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
  await expect(p2.getByRole('heading', { level: 2 })).toHaveText('Tổng hợp lương');
  await expect(p2.locator('.sh .lb')).toHaveText('Số tiền tính bằng đồng');
});

test('each sheet ends with the slogan and its page number', async ({ page }) => {
  await page.goto(SLIP);
  for (const n of [1, 2] as const) {
    const ft = sheetPage(page, n).locator('footer.ft');
    await expect(ft).toContainText(`Trang ${n}/2`);
    await expect(ft.getByRole('img', { name: 'Trao trọn niềm tin, gửi trọn giải pháp.' })).toBeVisible();
  }
});

test('another month shows the load error', async ({ page }) => {
  await page.goto('/in/phieu-luong/2026-11/demo_a_broken');
  await expect(page.getByText('Không tải được phiếu lương.')).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4.spec`
Expected: FAIL. Hôm nay `api()` từ chối nên trang hiện "Không tải được phiếu lương." và không có vùng "Trang 1/2". Riêng test tháng 11 có thể đã xanh.

- [ ] **Step 3: Viết mã**

- **`services/payslip.ts`:**
  - `getPayslipSheet` theo khối Interfaces;
  - bỏ import `buildSheet`;
  - các hàm khác giữ nguyên.
- **`git rm`** `builders/payslip/sheet.ts` và `views/print/slipFormat.ts`. Trước khi xoá, `grep` để chắc không file nào khác import hai file này.
- **`A4Page.vue`:**
  - khung tờ đúng spec mục 5: 210mm × 296mm, đệm 40px 48px, flex dọc, Geist 12/16, tabular-nums, `print-color-adjust: exact`;
  - hình chìm `@/assets/img/gft-watermark.png` rộng 430px, nằm giữa;
  - mọi phần tử con trừ `.wm` có `position: relative`;
  - chân trang dùng `@/assets/img/gft-slogan.png` 158×20.
- **`A4Payslip.vue`:**
  - gốc `div.a4-doc` chứa `A4Page :page="1"` bọc `A4Attendance`, và `A4Page :page="2"` bọc `A4Summary`;
  - giữ nguyên khối `<style>` toàn cục (không scoped) gồm `@page` và `@media print` của file hiện tại;
  - bỏ toàn bộ mã cũ còn lại.
- **`A4Attendance.vue`:** gốc `div.att` chứa `header.hd`, `div.who`, `div.sh` theo spec mục 3.1–3.3 và móc DOM. Logo `@/assets/img/gft-logo.png` 60×42.
- **`A4Summary.vue`:** gốc `div.sum2` chứa `header.rh` (logo 40×28) và `div.sh` theo spec mục 4.1–4.2.

- [ ] **Step 4: Chạy cho xanh**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4`
Expected: 11 passed (6 test dữ liệu + 5 test giao diện).

- [ ] **Step 5: Commit**

```bash
git add web/src/services/payslip.ts web/src/views/print/A4Payslip.vue web/src/views/print/parts/A4Page.vue web/src/views/print/parts/A4Attendance.vue web/src/views/print/parts/A4Summary.vue web/tests/payslip-a4.spec.ts
git commit -m "feat(web): A4 payslip reads the mock month, new sheet frame and page heads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`git rm` ở Step 3 đã stage việc xoá hai file. Kiểm `git status` trước khi commit.

### Task 4: Trang 1 · bảng chấm công, dải tổng hợp, chú thích

**Files:**
- Modify: `web/src/views/print/parts/A4Attendance.vue`
- Test: `web/tests/payslip-a4.spec.ts` (thêm vào cuối)

**Interfaces:**
- Consumes:
  - `A4Day`, `DayMark` (Task 1);
  - `blankNum`, `signedText`, `inOutText`, `statCells` (Task 2);
  - `dowShort`, `dm`, `vnd` từ `@/utils/format`;
  - `useId` từ `vue`.
- Produces: không có gì mới cho task sau.

- [ ] **Step 1: Viết test đỏ**

```ts
const att = (page: Page) => sheetPage(page, 1).getByRole('table', { name: 'Chấm công tháng 10/2026' });
const dayRow = (page: Page, dm: string) =>
  att(page).locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: dm }) });

test('page 1 prints one row per day that needs one', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('tbody tr')).toHaveCount(29);
  await expect(dayRow(page, '04/10')).toHaveCount(0);
  await expect(dayRow(page, '18/10')).toHaveCount(0);
  await expect(dayRow(page, '11/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(dayRow(page, '25/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(att(page).locator('tbody tr.off')).toHaveCount(8);
  for (const [mark, n] of [['work', 21], ['paid', 4], ['unpaid', 2], ['absent', 1], ['pending', 1]] as const)
    await expect(att(page).locator(`tbody .dot.m-${mark}`)).toHaveCount(n);
});

test('page 1 keeps OT, make-up and notes in their own columns', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('thead th')).toHaveText([
    'Ngày', 'Loại ngày', 'Vào – ra', 'Giờ', 'OT', 'Làm bù', 'Ghi chú', 'Cộng / trừ', 'Thành tiền'
  ]);
  const cells = (dm: string) => dayRow(page, dm).getByRole('cell');
  await expect(cells('09/10')).toHaveText([/T6\s*09\/10/, 'Normal', '08:00–22:00', '8', '4', '', '', '+173.077', '403.846']);
  await expect(cells('22/10')).toHaveText([/T5\s*22\/10/, 'Normal', '08:00–22:00', '8', '', '4', '', '', '230.769']);
  await expect(cells('26/10')).toHaveText([/T2\s*26\/10/, 'Normal', '08:40–17:00', '7,33', '', '', 'Muộn 40 phút', '−14.423', '216.346']);
  await expect(cells('28/10')).toHaveText([/T4\s*28\/10/, 'Chờ giải trình', '08:20–17:00', '7,67', '', '', 'Muộn 20 phút', '', '0']);
  await expect(cells('05/10')).toHaveText([/T2\s*05\/10/, 'Phép năm', '', '', '', '', '', '', '230.769']);
  await expect(cells('11/10')).toHaveText([/CN\s*11\/10/, 'Chủ nhật', '08:00–12:00', '', '4', '', '', '+230.769', '230.769']);
  await expect(cells('20/10')).toHaveText([/T3\s*20\/10/, 'Nghỉ có làm bù', '', '', '', '', 'Bù 22/10, 25/10', '', '230.769']);
  const heights = await att(page).locator('tbody tr').evaluateAll(rows => rows.map(r => r.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(22);
});

test('day marks and off rows use the GFT colours', async ({ page }) => {
  await page.goto(SLIP);
  const look = (sel: string) =>
    sheetPage(page, 1).locator(sel).first().evaluate(e => {
      const c = getComputedStyle(e);
      return [c.backgroundColor, c.borderTopWidth, c.borderTopColor];
    });
  expect((await look('.lg .dot.m-work'))[0]).toBe('rgb(28, 28, 28)');
  expect((await look('.lg .dot.m-paid'))[0]).toBe('rgb(47, 90, 168)');
  expect((await look('.lg .dot.m-absent'))[0]).toBe('rgb(180, 63, 63)');
  expect(await look('.lg .dot.m-unpaid')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(47, 90, 168)']);
  expect(await look('.lg .dot.m-pending')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(235, 151, 61)']);
  expect((await look('tbody tr.off td'))[0]).toBe('rgb(245, 245, 245)');
});

test('page 1 ends with the summary strip and the legend, and has no money total', async ({ page }) => {
  await page.goto(SLIP);
  const p1 = sheetPage(page, 1);
  await expect(p1.locator('.sts > div')).toHaveText([
    /Ngày công\s*19 ngày/, /Ca Flex · Night\s*3 · 3 ca/, /Nghỉ có lương\s*3 ngày/, /iSAT\s*1 ngày/,
    /Không lương, BHXH\s*2 ngày/, /Vắng\s*1 ngày/, /Chờ giải trình\s*1 ngày/, /OT\s*10 giờ/,
    /Làm bù\s*8 giờ/, /Trừ giờ đi muộn\s*0,5 giờ/
  ]);
  await expect(p1.locator('.lg .keys > span')).toHaveText(['Đi làm', 'Nghỉ có lương', 'Nghỉ không lương', 'Vắng', 'Chờ giải trình']);
  for (const m of ['work', 'paid', 'unpaid', 'absent', 'pending']) await expect(p1.locator(`.lg .dot.m-${m}`)).toHaveCount(1);
  await expect(p1.locator('.lg p')).toHaveText(
    'Giờ, OT, Làm bù tính bằng giờ. OT ngày thường ×1,5, thứ 7 và Chủ nhật ×2, ngày lễ ×3. Làm bù là giờ làm để bù cho ngày đã nghỉ, không phải OT.'
  );
  await expect(p1).not.toContainText('Tổng thu nhập');
  await expect(p1).not.toContainText('Thực nhận');
});

test('prints as two A4 sheets that do not overflow, with no text under 12px', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1).locator('.lg')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const sheets = page.locator('.pl-a4');
  await expect(sheets).toHaveCount(2);
  expect(await sheets.evaluateAll(ss => ss.map(s => s.scrollHeight <= s.clientHeight))).toEqual([true, true]);
  const small = await sheets.evaluateAll(ss =>
    ss.flatMap(s =>
      [...s.querySelectorAll('*')]
        .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
        .map(e => (e.textContent || '').trim())
    )
  );
  expect(small).toEqual([]);
  const gap = await sheetPage(page, 1).evaluate(
    s => s.querySelector('footer.ft')!.getBoundingClientRect().top - s.querySelector('.lg')!.getBoundingClientRect().bottom
  );
  expect(gap).toBeGreaterThanOrEqual(42);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4.spec`
Expected: 5 test mới FAIL, vì chưa có bảng chấm công, `.sts` và `.lg`. 5 test của Task 3 vẫn xanh.

- [ ] **Step 3: Viết thân trang 1 trong `A4Attendance.vue`**

Bảng, dải tổng hợp và chú thích theo spec mục 3.4–3.7 và móc DOM. Lưu ý:

- **Độ rộng cột:** đặt trên class của `th` (66 / 146 / 84 / 36 / 44 / 54 / 116 / 76 / 76). Bảng rộng 698px, `table-layout: fixed`. Không dùng `<col>`.
- **Ô:** mọi ô `box-sizing: border-box`, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`.
- **Ô Ngày:** `<span class="wd">{{ dowShort(d.date) }}</span>{{ dm(d.date) }}`. `.wd` rộng 22px, chữ xám.
- **Định dạng từng ô:**
  - Giờ, OT, Làm bù: `blankNum`;
  - Cộng / trừ: `signedText`;
  - Vào – ra: `inOutText`;
  - Thành tiền: `vnd(total)`.
- **Dải tổng hợp:** dựng từ `statCells(sheet.stats)`.
- **Chấm `.dot`:** 8px, `box-sizing: border-box`, góc tròn, cách chữ 6px. Màu theo Global Constraints. Hai loại vòng có nền trong suốt.

- [ ] **Step 4: Chạy cho xanh**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/print/parts/A4Attendance.vue web/tests/payslip-a4.spec.ts
git commit -m "feat(web): A4 payslip page 1, one attendance row per day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Trang 2 · các khoản, Thực nhận, chữ ký

**Files:**
- Modify: `web/src/views/print/parts/A4Summary.vue`
- Test: `web/tests/payslip-a4.spec.ts` (thêm vào cuối)

**Interfaces:**
- Consumes:
  - `A4Group`, `A4Line` (Task 1);
  - `qtyText`, `ruleText`, `actualText`, `scoreText` (Task 2);
  - `vndc` từ `@/utils/format`;
  - `useId` từ `vue`.
- Produces: không có gì mới.

- [ ] **Step 1: Viết test đỏ**

```ts
const pay = (page: Page) => sheetPage(page, 2).getByRole('table', { name: 'Tổng hợp lương' });
const line = (page: Page, label: string) =>
  pay(page).locator('tr.ln').filter({ has: page.locator('td:first-child', { hasText: label }) });
const money = (t: string) => Number(t.trim().replace('−', '-').replace(/\./g, ''));

test('page 2 lists the pay lines of P2 in groups', async ({ page }) => {
  await page.goto(SLIP);
  await expect(pay(page).locator('thead th')).toHaveText(['Khoản', 'Số lượng', 'Theo quy chế', 'Thực tế']);
  await expect(pay(page).locator('tr.grp')).toHaveText([
    'Ngày công và lương cơ bản', 'Nghỉ phép và ngày lễ', 'Làm thêm và làm bù',
    'Phụ cấp', 'Lương KPI', 'Đi muộn, về sớm, ra ngoài'
  ]);
  const cells = (label: string) => line(page, label).getByRole('cell');
  await expect(cells('Lương cơ bản')).toHaveText(['Lương cơ bản', '19/26 ngày', '6.000.000', '4.384.615']);
  await expect(line(page, 'Lương cơ bản')).toHaveClass(/\bbb\b/);
  await expect(cells('Chờ giải trình')).toHaveText(['Chờ giải trình · 28/10, tạm tính 0 đ tới khi duyệt', '1 ngày', '', '0']);
  await expect(line(page, 'Chờ giải trình').locator('.dt')).toHaveCount(1);
  await expect(cells('Không tính lương')).toHaveText(['Không tính lương · vắng, không lương, chế độ BHXH', '3 ngày', '', '0']);
  await expect(cells('Nghỉ có lương')).toHaveText(['Nghỉ có lương · phép năm, việc riêng', '2 ngày', '', '461.538']);
  await expect(cells('Chuyên cần')).toHaveText(['Chuyên cần 25% · nghỉ từ 3 ngày nên không hưởng', '', '1.500.000', '0']);
  await expect(cells('Đi lại')).toHaveText(['Đi lại 15%', '19 ngày', '900.000', '657.692']);
  await expect(cells('Tổng phụ cấp')).toHaveText(['Tổng phụ cấp', '', '', '1.185.577']);
  await expect(pay(page).locator('tr.kpi > td > div')).toHaveText([
    /Base Wework 40%\s*85%/, /Người dùng 24%\s*90%/, /Đồng nghiệp 18%\s*80%/, /Quản lý trực tiếp 12%\s*85%/, /Tự đánh giá 6%\s*90%/
  ]);
  await expect(cells('Lương KPI')).toHaveText(['Lương KPI · theo tổng điểm', '85,6%', '6.000.000', '5.136.000']);
  await expect(cells('Đi muộn 26/10')).toHaveText(['Đi muộn 26/10 · muộn 40 phút, tính 30 phút', '0,5 giờ', '', '−14.423']);
});

test('page 2 splits OT into three rows and pays make-up hours as money', async ({ page }) => {
  await page.goto(SLIP);
  const cells = (label: string) => line(page, label).getByRole('cell');
  await expect(cells('OT ngày thường')).toHaveText(['OT ngày thường (×1,5)', '4 giờ', '', '173.077']);
  await expect(cells('OT ngày cuối tuần')).toHaveText(['OT ngày cuối tuần (×2)', '6 giờ', '', '346.154']);
  await expect(cells('OT ngày lễ')).toHaveText(['OT ngày lễ (×3)', '0 giờ', '', '0']);
  await expect(cells('Làm bù cho ngày nghỉ 20/10')).toHaveText(['Làm bù cho ngày nghỉ 20/10', '8 giờ', '', '230.769']);
});

test('the rule column holds only money and the actual column always money', async ({ page }) => {
  await page.goto(SLIP);
  await expect(pay(page).locator('tr.ln')).toHaveCount(26);
  const col = async (i: number) => (await pay(page).locator(`tr.ln > td:nth-child(${i})`).allTextContents()).map(t => t.trim());
  for (const t of await col(3)) expect(t).toMatch(/^(\d{1,3}(\.\d{3})*)?$/);
  const acts = await col(4);
  for (const t of acts) expect(t).toMatch(/^(−?\d{1,3}(\.\d{3})*|BE tính)$/);
  expect(acts.filter(t => t === 'BE tính')).toHaveLength(2);
});

test('totals add up from the rounded lines; the slip ends with Thực nhận and the signature', async ({ page }) => {
  await page.goto(SLIP);
  const rows = await pay(page).locator('tbody.lines tr.ln').evaluateAll(rs =>
    rs.map(r => [(r as HTMLTableRowElement).cells[0].textContent!.trim(), (r as HTMLTableRowElement).cells[3].textContent!.trim()])
  );
  expect(rows).toHaveLength(19);
  expect(rows.filter(([k]) => k !== 'Tổng phụ cấp').reduce((sum, [, v]) => sum + money(v), 0)).toBe(12134076);
  const sum = pay(page).locator('tbody.sum tr.ln');
  const expected = [
    ['Tổng thu nhập', '', '', '12.134.076'],
    ['Các khoản miễn thuế', '', '', 'BE tính'],
    ['Thu nhập chịu thuế', '', '', 'BE tính'],
    ['Bảo hiểm bắt buộc · BHXH 8%, BHTN 1%, BHYT 1,5%', '10,5%', '', '630.000'],
    ['Thu nhập sau bảo hiểm', '', '', '11.504.076'],
    ['Thuế TNCN', '', '', '0'],
    ['Tạm ứng · 80% lương ngày công 01–15/10', '10 ngày', '', '1.846.154']
  ];
  await expect(sum).toHaveCount(expected.length);
  for (const [i, cells] of expected.entries()) await expect(sum.nth(i).getByRole('cell')).toHaveText(cells);
  const p2 = sheetPage(page, 2);
  await expect(p2.locator('.net')).toHaveText(/Thực nhận\s*9\.657\.922 ₫/);
  expect(await p2.locator('.net').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 249, 236)');
  await expect(p2.locator('.end')).toContainText(/Ngày phép năm còn lại\s*22 ngày/);
  await expect(p2.locator('.end .sign')).toHaveText(/Người nhận\s*Ký, ghi rõ họ tên/);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4.spec`
Expected: 4 test mới FAIL, vì chưa có bảng "Tổng hợp lương". Các test cũ vẫn xanh.

- [ ] **Step 3: Viết thân trang 2 trong `A4Summary.vue`**

Theo spec mục 4.3–4.6 và móc DOM. Lưu ý:

- **Bảng:** `table-layout: fixed`, rộng 100%. Độ rộng đặt trên class của `th`: Số lượng 84, Theo quy chế 100, Thực tế 100; Khoản lấy phần còn lại. Khoảng cách 12px giữa các cột làm bằng đệm ô.
- **Hàng nhóm:** viết hoa bằng `text-transform`. Chữ trong DOM giữ nguyên như dữ liệu.
- **Định dạng ô:** Số lượng `qtyText`, Theo quy chế `ruleText`, Thực tế `actualText`. `null` thì in `span.lb` "BE tính".
- **`tbody.sum`:** vạch trên 2px #212121; cách khối trên 8px, làm bằng đệm trên của hàng đầu.
- **Thực nhận:** `vndc(net)`. Ô ký `.sign` rộng 220px, cao tối thiểu 72px.

- [ ] **Step 4: Chạy cho xanh, cả file rồi cả bộ**

Run: `cd web && PW_PORT=4191 npx playwright test payslip-a4`
Expected: 20 passed. Test in của Task 4 vẫn xanh: trang 2 không tràn, không chữ nào dưới 12px.

Run: `cd web && PW_PORT=4191 npx playwright test`
Expected: số passed bằng mốc ở Task 1 Step 1 cộng 20, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/print/parts/A4Summary.vue web/tests/payslip-a4.spec.ts
git commit -m "feat(web): A4 payslip page 2, pay lines in money, totals and signature

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
