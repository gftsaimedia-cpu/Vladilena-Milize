# Sửa tiền cơ sở, KPI, BH và thuế TNCN của BE v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phiếu lương của BE v2 tính đúng bốn phần đã chốt: tiền cơ sở, lương KPI, bảo hiểm và thuế TNCN. Kết quả lưu được vào `payroll_runs` / `payslips`, kèm cờ cảnh báo để FE hiển thị. Phần ngày công và giờ làm giữ nguyên như code hiện tại.

**Architecture:**
- Luật KPI, BH và thuế nằm trong các hàm thuần ở `src/modules/payroll/domain/`, mỗi file một việc.
- `PayrollRepository` đọc thêm các cột cần cho bốn phần trên, qua một hàm chuyển dòng DB thuần (`mapMonthRows`).
- `PayrollService` gọi các hàm domain.
- `EmployeePayslip` dùng kết quả của các hàm đó thay cho các số đang viết cứng.
- Vòng lặp tính từng ngày công trong `PayrollService.generateMonthlyPayslip` và các khối ngày công/phụ cấp/OT trong `EmployeePayslip` **không đổi**.

**Tech Stack:** NestJS 10, Kysely 0.29, pg, PostgreSQL 16, TypeScript chạy bằng tsx, `node:test` + `node:assert/strict`.

**Spec:** Không có file spec riêng. Luật được người dùng chốt trong chat ngày 2026-11-04 và chép vào mục **Luật đã chốt** bên dưới. Đó là căn cứ cao nhất của plan này. Không đọc thư mục `spec/` (bộ máy v1 đã xoá).

## Luật đã chốt

**Tiền cơ sở:**
- Lương cơ bản = `position_levels.base_salary` của bậc nhân viên.
- Lương ngày = lương cơ bản ÷ ngày công chuẩn của loại (`position_types.workdays`: tts 22, ctv/nv 26).
- Lương giờ = lương ngày ÷ 8.

**KPI:**
- **Tổng điểm %** = Wework × 40% + người dùng × 24% + đồng nghiệp × 18% + quản lý × 12% + tự đánh giá × 6%.
- **Lương KPI** = tổng điểm % × lương KPI đề xuất của tháng.
- **Lương KPI đề xuất** nhập theo từng tháng và phải ≤ `kpi_max` của bậc; nhập lớn hơn thì báo lỗi.
- Không có ngưỡng đạt, không có hệ số ngày.
- **Chưa nhập mức đề xuất:** KPI = 0, gắn cờ `KPI_PROPOSAL_MISSING`.
- **Thiếu điểm cột nào:** cột đó tính 0 điểm, gắn cờ `KPI_SCORE_MISSING` kèm tên cột.

**BH:**
- Chỉ trừ cho nhân viên có cờ `insured`.
- Tỷ lệ: BHXH 8% + BHYT 1,5% + BHTN 1%, tổng 10,5%. Tỷ lệ cấu hình được.

**TNCN:**
- **Hợp đồng từ 3 tháng trở lên:** lũy tiến.
  1. Thu nhập chịu thuế = tổng thu nhập − phần miễn thuế.
  2. Thu nhập tính thuế = thu nhập chịu thuế − BH − 15.500.000 − 6.200.000 × số người phụ thuộc.
  3. Áp 5 bậc: đến 10tr 5%, 10–30tr 10%, 30–60tr 20%, 60–100tr 30%, trên 100tr 35%.
- **Hợp đồng dưới 3 tháng:** khấu trừ 10% thu nhập chịu thuế khi tổng thu nhập ≥ 5.000.000.

> **Đổi ngày 2026-11-04 (người dùng chốt sau review cuối nhánh, theo v1):** cách chọn thuế, cờ BH, nền 10% và phần miễn thuế ca đêm đổi theo Task 8. Task 8 thay luật BH và dòng "dưới 3 tháng" ở trên, và thay quyết định tạm 2 (phần ca đêm) và 4.

### Quyết định tạm (người dùng xác nhận khi duyệt plan)

Mỗi mục ghi: quyết định — lý do — rủi ro nếu sai.

1. **Thiếu cấu hình lương:** lương cơ bản và ngày công chuẩn lấy bản `position_levels` / `position_types` có `effective_month` ≤ tháng tính. Thiếu cấu hình thì người đó báo lỗi rõ ràng, thay vì tự lấy 6.000.000 / 26 như code hiện tại.
   - Lý do: tiền cơ sở phải theo đúng bậc và loại.
   - Rủi ro nếu sai: người thiếu cấu hình không có phiếu cho tới khi bổ sung.
2. **Phần miễn thuế** = phần OT trả cao hơn lương thường + phụ cấp ca đêm (`nightAllowanceActual`). Phần OT trả cao hơn = giờ ×1,5 × 0,5 + giờ ×2 × 1 + giờ ×3 × 2, nhân lương giờ. Phụ cấp flex, đi lại, chuyên cần, giờ nghỉ ca đêm và KPI vẫn chịu thuế.
   - Lý do: luật chỉ miễn phần trả cao hơn của làm đêm và làm thêm giờ.
   - Rủi ro nếu sai: lệch thuế nếu công ty coi phụ cấp đi lại là khoản miễn.
3. **Nền đóng BH** = lương cơ bản của bậc. Tỷ lệ đọc từ `settings.insurance_rates`, không có thì dùng 8 / 1,5 / 1.
   - Lý do: v2 hiện cũng lấy nền là lương cơ bản.
   - Rủi ro nếu sai: lệch nếu nền BH phải tính cả phụ cấp.
4. **Cách tính thuế** suy ra từ hồ sơ:
   - `staff.tax_on = 0` → không khấu trừ.
   - `staff.contract` (ngày hết hạn) sớm hơn `staff.start_date` + 3 tháng → 10%.
   - Còn lại → lũy tiến.
   - Thiếu `start_date` → lũy tiến, gắn cờ `CONTRACT_START_MISSING`.

   Lý do: không cần thêm cột. Rủi ro nếu sai: tính sai cách thuế khi ngày hợp đồng nhập sai.
5. **Loại không có KPI** (quyền lợi `kpi` tắt hoặc `kpi_max` NULL, hiện là tts): KPI = 0, không gắn cờ. Lý do: luong-app cũng không có KPI cho tts.
6. **Mức đề xuất vượt `kpi_max` lúc tính lương** (bậc bị hạ sau khi đã nhập mức): tính theo `kpi_max` và gắn cờ `KPI_PROPOSAL_EXCEEDS_MAX`.
   - Lý do: lúc nhập đã chặn rồi, chỉ còn trường hợp bậc thay đổi.
   - Rủi ro nếu sai: trả thấp hơn mức đã hứa.

### Chưa chốt — giữ nguyên code hiện tại

Người dùng **chưa chốt** luật giờ làm. Các phần dưới đây không được sửa trong plan này, kể cả lỗi đã biết:
- Phân ca, giờ làm, đi muộn/về sớm (gồm số viết cứng `-16827`).
- Ca đêm và giờ nghỉ ca đêm, phụ cấp flex/đêm.
- OT (hệ số, giới hạn giờ).
- Làm bù, ngày lễ, nghỉ phép/không lương/iSAT.
- Phụ cấp đi lại/chuyên cần.
- Ngày vắng vẫn được trả đủ lương ngày.
- `dayOfWeekText` / `inOutText` viết cứng.
- `remainingAnnualLeaveDays` mặc định 22.

### Ngoài phạm vi (việc sau)

- Duyệt `TIME_CORRECTION` chưa có tác dụng.
- Trừ `leave_used_days` khi duyệt phép.
- `SystemService.lockPeriod` ghi `'LOCKED'` sai CHECK.
- `DailyTimesheet` đoán UTC hay giờ địa phương.
- Trần BH 20 × lương cơ sở, và luật nghỉ ≥ 14 ngày thì không đóng BHXH.
- Mọi thay đổi FE (`web/`).

## Bản đồ thay đổi

**Thêm mới:**

| File | Nội dung |
|---|---|
| `src/modules/payroll/domain/payroll-warning.ts` | `PayrollWarning`, `PayrollWarningCode`, `WARNING_MESSAGES`, `warning()` |
| `src/modules/payroll/domain/kpi-pay.ts` | `KPI_WEIGHTS`, `KpiInput`, `KpiPay`, `calculateKpiPay` |
| `src/modules/payroll/domain/insurance.ts` | `InsuranceRates`, `DEFAULT_INSURANCE_RATES`, `calculateInsurance` |
| `src/modules/payroll/domain/personal-income-tax.ts` | `TaxMethod`, `resolveTaxMethod`, `progressiveTax`, `calculatePersonalIncomeTax` |
| `src/modules/payroll/payroll.errors.ts` | `PayrollFinalizedError`, `KpiValidationError` |
| `migrations/postgres/0003_payroll_rules.sql` | Thêm cột `kpi_scores.kpi_proposed`, thêm dòng `settings.insurance_rates` |
| `test/v2/payroll-kpi.test.ts`, `payroll-deductions.test.ts`, `payroll-month-rows.test.ts`, `payroll-persistence.test.ts`, `payroll-repository.pg.test.ts`, `payroll-kpi-api.test.ts`, `payroll-fixtures.ts` | Test |

**Sửa:**

| File | Class / hàm | Thay đổi |
|---|---|---|
| `src/modules/payroll/domain/employee-payslip.ts` | `EmployeePayslip` | Thay ba khối: KPI (dùng `KpiPay`), miễn thuế + BH (bỏ `34615` và `0.105`), thuế (bỏ `?? 0`, gọi `calculatePersonalIncomeTax`). Thêm `username` và các trường mới vào DTO. Các khối ngày công, phụ cấp, OT, đi muộn giữ nguyên. |
| `src/modules/payroll/domain/index.ts` | (export) | Export các file mới. |
| `src/modules/payroll/payroll.repository.ts` | `PayrollRepository` | `getMonthlyData` đọc thêm bậc/loại theo `effective_month`, quyền lợi KPI, cột BH/thuế/hợp đồng của `staff`, `kpi_proposed`, `settings.insurance_rates`. Đổi `LIKE` trên cột DATE sang khoảng ngày (giữ nguyên ý nghĩa). Thêm hàm thuần `mapMonthRows`. Sửa `savePayrollRunAndSlips` (`draft`, `run_no` tăng dần, gzip, `flags_json`, transaction), `listPayslips` / `getPayslip` (đọc snapshot). Thêm `kpi_proposed` vào `saveKpiScore`. Thêm `getKpiCap`. |
| `src/modules/payroll/payroll.service.ts` | `PayrollService` | `generateMonthlyPayslip` tính KPI/BH/thuế/cờ bằng hàm domain; bỏ cách đổi điểm KPI `> 1 ? /100`. `calculatePeriodPayslips` trả thêm `errors` và loại người trùng. `setKpiScore` kiểm tra dữ liệu. |
| `src/modules/payroll/payroll.controller.ts` | `PayrollController` | Thêm `errors` vào kết quả tính. `PayrollFinalizedError` → 409, `KpiValidationError` → 400/404. |
| `src/database/schema.ts` | `KpiScoresTable` | Thêm `kpi_proposed: Generated<number \| null>`. Sửa tay vì script sinh file đã bị lưu trữ. |
| `test/v2/payroll.test.ts` | — | Sửa fixture theo dữ liệu mới, thêm test cho service. |
| `docs/api/v2-contract.md` | §3.5 | Thêm body KPI, `warnings`, `errors` và các trường mới của phiếu. |

**Bảng DB:**

| Bảng | Đọc / ghi | Ghi chú |
|---|---|---|
| `staff` | Đọc | |
| `position_types` | Đọc | Bản có `effective_month` ≤ tháng tính |
| `position_levels` | Đọc | Bản có `effective_month` ≤ tháng tính |
| `position_type_benefits` | Đọc | |
| `timesheet_entries` + `work_schedules` | Đọc | Như hiện tại |
| `system_requests` | Đọc | Như hiện tại, bỏ `LIKE` |
| `kpi_scores` | Đọc, upsert | Upsert gồm cả `kpi_proposed` |
| `settings` | Đọc | Key `insurance_rates` |
| `payroll_runs` | Ghi | Insert `draft`; bản `draft` cũ của cùng tháng → `superseded` |
| `payslips` | Ghi | Insert `draft` |

Không ghi vào bảng chấm công, đơn từ, `payroll_periods`, `pay_entries`, `slip_overrides`, `param_versions`, `kpi_score_log` hay `audit_log`.

## Global Constraints

- Node ≥ 22.13. Chạy bằng `tsx`, không có bước build.
- Test viết bằng `node:test` và `node:assert/strict`, đặt ở `test/v2/`. Chạy một file: `node --import tsx --test test/v2/<file>.test.ts`. Chạy tất cả: `npm test`.
- **Không chạy `npm run typecheck`, `npm run format:check` hay prettier.** Người dùng yêu cầu bỏ hai bước này. Chỉ xác minh bằng test.
- Viết theo style của file xung quanh: single quote, không dấu phẩy cuối, dòng tối đa 120 ký tự.
- Nest DI dùng `@Inject(...)` tường minh, vì tsx không phát decorator metadata.
- **Tiền:** số nguyên VND. Hàm domain trả số đã làm tròn bằng `Math.round` ở từng khoản ghi rõ dưới đây.
- **Điểm KPI:**
  - API nhận điểm 0–100, tối đa 2 chữ số thập phân.
  - DB lưu điểm × 100 (số nguyên 0..10000).
  - Domain tính bằng số nguyên: `units = Σ điểm×100 × trọng số`, với trọng số 40/24/18/12/6. Tiền = `round(mức áp dụng × units / 1 000 000)`.
- **BIGINT** do `pg` trả về dạng chuỗi. Mọi cột tiền hoặc điểm đọc từ DB phải qua `Number(...)`.
- **Không chạy migration lên DB thật nào.** File `0003` chỉ được thêm vào repo; người dùng tự áp dụng.
- Commit sau mỗi task, message dạng conventional, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không push.

## Review Focus

1. **BIGINT dạng chuỗi từ pg** (`base_salary`, `kpi_max`, `kpi_proposed`, `advance_amount`, `dependants`) được chuyển thành số trước khi tính. Nếu không, phép cộng sẽ thành nối chuỗi. Test ở Task 3.
2. **Tính lại nhiều lần trong một tháng:**
   - `run_no` tăng dần và bản nháp cũ chuyển `superseded`, không vướng `UNIQUE(month, run_no)`.
   - Tháng đã có bản `final` thì từ chối tính lại.

   Test ở Task 5.
3. **Một người thiếu cấu hình bậc hoặc loại:** người đó vào `errors`, phiếu của những người khác vẫn được lưu. Test ở Task 4.
4. **Một người gửi lên hai lần** (uuid và username, hoặc trùng id): chỉ có một phiếu, không vướng `UNIQUE(run_id, username)`. Test ở Task 4.
5. **Ranh giới 3 tháng của hợp đồng:**
   - Hết hạn đúng ngày bắt đầu + 3 tháng thì tính lũy tiến.
   - Tháng đích ngắn hơn thì kẹp về ngày cuối tháng (30/11 + 3 tháng = 28/02).

   Test ở Task 2.

---

### Task 1: Cảnh báo và KPI (`payroll-warning.ts`, `kpi-pay.ts`)

**Files:**
- Create: `src/modules/payroll/domain/payroll-warning.ts`, `src/modules/payroll/domain/kpi-pay.ts`
- Test: `test/v2/payroll-kpi.test.ts`

**Interfaces:**
- Produces:

```ts
export type PayrollWarningCode = 'KPI_PROPOSAL_MISSING' | 'KPI_SCORE_MISSING' | 'KPI_PROPOSAL_EXCEEDS_MAX' | 'CONTRACT_START_MISSING';
export interface PayrollWarning { code: PayrollWarningCode; message: string; fields?: string[] }
export const WARNING_MESSAGES: Record<PayrollWarningCode, string>;
export function warning(code: PayrollWarningCode, fields?: string[]): PayrollWarning;
export type KpiComponent = 'wework' | 'user' | 'peer' | 'manager' | 'self';
export const KPI_WEIGHTS: Record<KpiComponent, number>; // { wework: 40, user: 24, peer: 18, manager: 12, self: 6 }
export interface KpiInput { scores: Partial<Record<KpiComponent, number | null>>; proposedAmount: number | null } // điểm × 100
export interface KpiCap { applicable: boolean; kpiMax: number | null }
export interface KpiPay {
  applicable: boolean; scores: Record<KpiComponent, number | null>; weightedPct: number;
  proposedAmount: number | null; appliedAmount: number; amount: number; warnings: PayrollWarning[];
}
export function calculateKpiPay(input: KpiInput | null, cap: KpiCap): KpiPay;
```

Nội dung `WARNING_MESSAGES` (đúng chữ):

| Mã | Câu |
|---|---|
| `KPI_PROPOSAL_MISSING` | Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0. |
| `KPI_SCORE_MISSING` | Thiếu điểm KPI; cột thiếu tính 0 điểm. |
| `KPI_PROPOSAL_EXCEEDS_MAX` | Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc. |
| `CONTRACT_START_MISSING` | Thiếu ngày bắt đầu hợp đồng; thuế tạm tính lũy tiến. |

Quy ước:
- `KpiPay.scores` là điểm 0–100, hoặc `null` khi chưa nhập.
- `weightedPct` là phần trăm 0–100, làm tròn 2 chữ số thập phân.
- `appliedAmount = min(proposedAmount ?? 0, kpiMax ?? 0)`.
- `amount = round(appliedAmount × units / 1 000 000)`.
- Thứ tự cờ: `KPI_PROPOSAL_MISSING`, `KPI_PROPOSAL_EXCEEDS_MAX`, `KPI_SCORE_MISSING`. `fields` theo thứ tự wework, user, peer, manager, self.
- `cap.applicable === false` → `applicable false`, `amount 0`, không cờ.

- [ ] **Step 1: Viết test fail** (`cap = { applicable: true, kpiMax: 6_000_000 }` trừ khi ghi khác):

```ts
// scores {wework:9000,user:8000,peer:7000,manager:8500,self:10000}, proposed 5_000_000 → weightedPct 84, amount 4_200_000, warnings []
// như trên nhưng peer null → weightedPct 71.4, amount 3_570_000, warnings [warning('KPI_SCORE_MISSING', ['peer'])]
// proposed null, điểm đủ → amount 0, warnings [warning('KPI_PROPOSAL_MISSING')]
// input null → amount 0, warnings [warning('KPI_PROPOSAL_MISSING'), warning('KPI_SCORE_MISSING', ['wework','user','peer','manager','self'])]
// scores {8750,9225,6667,7000,9500}, proposed 6_000_000 → weightedPct 83.24, amount 4_994_436
// điểm đủ (84%), proposed 7_000_000 → appliedAmount 6_000_000, amount 5_040_000, warnings [warning('KPI_PROPOSAL_EXCEEDS_MAX')]
// cap {applicable:false, kpiMax:null}, input null → applicable false, amount 0, warnings []
// warning('KPI_SCORE_MISSING', ['peer']) deepEqual { code:'KPI_SCORE_MISSING', message: WARNING_MESSAGES.KPI_SCORE_MISSING, fields:['peer'] }
```

- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll-kpi.test.ts` → lỗi không tìm thấy module.
- [ ] **Step 3: Viết code** theo phần Interfaces. Khi không có `fields`, object cờ không có khoá `fields`.
- [ ] **Step 4: Chạy lại, thấy pass.**
- [ ] **Step 5: Commit** `feat(payroll): five-component KPI pay with warnings`.

### Task 2: BH và TNCN (`insurance.ts`, `personal-income-tax.ts`)

**Files:**
- Create: `src/modules/payroll/domain/insurance.ts`, `src/modules/payroll/domain/personal-income-tax.ts`
- Test: `test/v2/payroll-deductions.test.ts`

**Interfaces:**
- Produces:

```ts
export interface InsuranceRates { bhxh: number; bhyt: number; bhtn: number }
export const DEFAULT_INSURANCE_RATES: InsuranceRates; // { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 }
export interface InsuranceDeduction { base: number; bhxh: number; bhyt: number; bhtn: number; total: number }
export function calculateInsurance(base: number, insured: boolean, rates?: InsuranceRates): InsuranceDeduction;
export type TaxMethod = 'progressive' | 'flat10' | 'none';
export const PERSONAL_DEDUCTION = 15_500_000, DEPENDANT_DEDUCTION = 6_200_000, FLAT_RATE = 0.1, FLAT_THRESHOLD = 5_000_000;
export function resolveTaxMethod(c: { hasTax: boolean; startDate: string | null; endDate: string | null }): TaxMethod;
export function progressiveTax(assessable: number): number;
export interface TaxInput { method: TaxMethod; grossIncome: number; exemptIncome: number; insurance: number; dependants: number }
export interface TaxResult { method: TaxMethod; taxableIncome: number; assessableIncome: number; tax: number }
export function calculatePersonalIncomeTax(input: TaxInput): TaxResult;
```

Quy ước:
- `calculateInsurance`: mỗi phần `round(base × rate)`; `total` = tổng ba phần; `insured === false` → mọi phần = 0.
- `resolveTaxMethod`:
  - `hasTax === false` → `'none'`.
  - Có cả `startDate` và `endDate`, và `endDate < addMonths(startDate, 3)` → `'flat10'`. `addMonths` kẹp về ngày cuối tháng khi tháng đích ngắn hơn.
  - Còn lại → `'progressive'`.
- `progressiveTax`: bậc `[[10e6, 0.05], [30e6, 0.1], [60e6, 0.2], [100e6, 0.3], [Infinity, 0.35]]`, kết quả làm tròn.
- `taxableIncome = max(0, gross − exempt)`.
- Lũy tiến: `assessableIncome = max(0, taxable − insurance − 15.5tr − 6.2tr × dependants)`.
- 10%: `assessableIncome = taxable`; `tax = gross ≥ 5tr ? round(taxable × 0.1) : 0`.
- `'none'`: `tax = 0`, `assessableIncome = 0`.

- [ ] **Step 1: Viết test fail**:

```ts
// calculateInsurance(6_000_000, true) deepEqual {base:6_000_000, bhxh:480_000, bhyt:90_000, bhtn:60_000, total:630_000}
// calculateInsurance(6_000_000, false).total === 0; rates {bhxh:0.08,bhyt:0.015,bhtn:0.005} → bhtn 30_000, total 600_000
// resolveTaxMethod: {hasTax:false, startDate:'2026-10-01', endDate:'2026-12-15'} → 'none'
//   hasTax true: start 2026-10-01 end 2026-12-15 → 'flat10'; end 2027-01-01 → 'progressive'
//   start 2026-11-30 end 2027-02-27 → 'flat10'; end 2027-02-28 → 'progressive'
//   end null → 'progressive'; start null, end 2026-12-15 → 'progressive'
// progressiveTax: 0→0, 10_000_000→500_000, 45_000_000→5_500_000, 150_000_000→38_000_000
// progressive gross 30_000_000, exempt 500_000, insurance 630_000, dependants 1 → taxable 29_500_000, assessable 7_170_000, tax 358_500
// progressive gross 12_000_000, exempt 0, insurance 630_000, dependants 0 → assessable 0, tax 0
// flat10 gross 5_000_000 exempt 0 → tax 500_000; gross 4_999_999 → 0; gross 8_000_000 exempt 1_000_000 → tax 700_000
// none gross 50_000_000 → tax 0
```

- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll-deductions.test.ts`.
- [ ] **Step 3: Viết code** theo phần Interfaces.
- [ ] **Step 4: Chạy lại, thấy pass.**
- [ ] **Step 5: Commit** `feat(payroll): insurance and personal income tax`.

### Task 3: Đọc dữ liệu cho tiền cơ sở, KPI, BH, thuế (`mapMonthRows`, `getMonthlyData`, migration 0003)

**Files:**
- Create: `migrations/postgres/0003_payroll_rules.sql`
- Modify:
  - `src/modules/payroll/payroll.repository.ts`
  - `src/database/schema.ts`: `KpiScoresTable`.
  - `src/modules/payroll/domain/index.ts`: export Task 1–2.
  - `test/v2/payroll.test.ts`: chỉ test `loads persisted schedule type ...`.
- Test: `test/v2/payroll-month-rows.test.ts`

**Interfaces:**
- Consumes: `KpiInput`, `KpiCap` (Task 1), `InsuranceRates`, `DEFAULT_INSURANCE_RATES` (Task 2).
- Produces. `EmployeeMonthlyRawData` được **mở rộng**. Trường cũ `kpiMaxSalary` và `kpiScore` **vẫn giữ** trong task này; Task 4 mới xoá.

```ts
export interface EmployeeMonthlyRawData {
  staff: {
    // các trường cũ giữ nguyên, trừ hai trường sau đổi kiểu:
    baseSalary: number | null; // position_levels.base_salary của bản có hiệu lực; null = thiếu cấu hình (bỏ mặc định 6_000_000)
    standardWorkdays: number | null; // position_types.workdays của bản có hiệu lực; null = thiếu cấu hình (bỏ số 26 viết cứng)
    // thêm:
    insured: boolean; dependants: number; hasTax: boolean; contractStart: string | null; contractEnd: string | null; kpiCap: KpiCap;
  };
  // timesheets, requests: giữ nguyên
  kpi: KpiInput | null; // thêm
  insuranceRates: InsuranceRates; // thêm
}
export interface MonthRows { staff: any; type: any | null; level: any | null; benefits: any[]; timesheets: any[]; requests: any[]; kpi: any | null; settings: Array<{ key: string; value_json: string }> }
export function mapMonthRows(month: string, rows: MonthRows): EmployeeMonthlyRawData;
```

**Quy ước của `mapMonthRows`:**
- **Cách map các trường cũ:** giữ đúng như `getMonthlyData` hiện tại, nhưng mọi cột số qua `Number()`.
- **Cờ:** `insured = staff.insured !== 0`; `hasTax = staff.tax_on !== 0`. Giữ đúng cách `EmployeesRepository` đang đọc.
- **Số người phụ thuộc:** `dependants = max(0, floor(Number(...)))`.
- **Ngày hợp đồng:** `contractStart = staff.start_date`, `contractEnd = staff.contract`, chỉ giữ khi đúng dạng `YYYY-MM-DD`, ngược lại là `null`.
- **Trần KPI:** `kpiCap = { applicable: benefit 'kpi' có enabled = 1 && kpi_max != null, kpiMax: Number(kpi_max) hoặc null }`.
- **Điểm KPI:** dòng `kpi` → `{ scores: { wework, user: user_score, peer, manager, self: self_score }, proposedAmount: kpi_proposed }`. Giá trị NULL giữ `null`, còn lại qua `Number()`. Không có dòng → `kpi: null`.
- **`kpiScore` cũ:** vẫn tính như cũ từ cùng dòng đó.
- **Tỷ lệ BH:** từ `settings.insurance_rates`. JSON lỗi, thiếu khoá, hoặc có giá trị ngoài [0, 1] → `DEFAULT_INSURANCE_RATES`.

**Query trong `getMonthlyData`:**
- **Thêm:**
  - `position_types` có `code = staff.type`, `effective_month <= month`, lấy bản mới nhất (sắp giảm dần, `limit 1`).
  - `position_levels`: thêm điều kiện `effective_month <= month`, sắp giảm dần, `limit 1`.
  - `position_type_benefits` có `type_id = type.id`.
  - `settings` có `key = 'insurance_rates'`.
- **Sửa:** `system_requests` bỏ `LIKE` (không dùng được trên cột DATE của PostgreSQL), thay bằng khoảng `[đầu tháng, cuối tháng]` cho `ot_date`, `leave_start_date`, `correction_date`. Giữ `advance_period = month`. Ý nghĩa lọc không đổi.

**Migration `0003_payroll_rules.sql`** (chú thích tiếng Việt như 0001):

```sql
ALTER TABLE kpi_scores ADD COLUMN kpi_proposed BIGINT CHECK (kpi_proposed IS NULL OR kpi_proposed >= 0); -- lương KPI đề xuất của tháng (VND); NULL = chưa nhập
INSERT INTO settings (key, value_json) VALUES ('insurance_rates', '{"bhxh":0.08,"bhyt":0.015,"bhtn":0.01}') ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 1: Viết test fail** cho `mapMonthRows`, dùng object thường giả lập dòng DB:

```ts
// staff {uuid:'u1', username:'a', name:'A', type:'nv', level:1, idorm:'0', insured:null, tax_on:1, dependants:'2',
//        start_date:'2026-01-05', contract:'', contract_status:'official', shift_allowance_pct:60}
//   → staff.insured true, hasTax true, dependants 2, contractStart '2026-01-05', contractEnd null
// insured 0 → insured false; tax_on 0 → hasTax false
// type {id:'2', workdays:'26'}, level {name:'Nhân viên', base_salary:'6000000', kpi_max:'6000000'}, benefits [{benefit:'kpi', enabled:'1'}]
//   → staff.baseSalary === 6_000_000, staff.standardWorkdays === 26, staff.kpiCap deepEqual {applicable:true, kpiMax:6_000_000}
// level.kpi_max null → kpiCap {applicable:false, kpiMax:null}; benefits [] → applicable false
// type null → standardWorkdays null; level null → baseSalary null
// kpi {wework:'9000', user_score:null, peer:7000, manager:8500, self_score:10000, kpi_proposed:'5000000'}
//   → kpi.scores.user === null, kpi.scores.wework === 9000, kpi.proposedAmount === 5_000_000
// requests [{type:'ADVANCE', status:'APPROVED', advance_amount:'1000000'}] → requests[0].advanceAmount === 1_000_000 (number)
// settings [] → insuranceRates deepEqual DEFAULT_INSURANCE_RATES
// settings insurance_rates '{"bhxh":0.08,"bhyt":0.015,"bhtn":0.005}' → bhtn 0.005; '{"bhxh":2,"bhyt":0.015,"bhtn":0.01}' → DEFAULT_INSURANCE_RATES; 'not json' → DEFAULT_INSURANCE_RATES
```

- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll-month-rows.test.ts`.
- [ ] **Step 3: Viết code**:
  - `mapMonthRows`, rồi cho `getMonthlyData` gọi nó sau khi query.
  - Migration `0003`.
  - `kpi_proposed: Generated<number | null>;` trong `KpiScoresTable`, sau `self_score`.
  - Trong test `loads persisted schedule type ...` của `payroll.test.ts`:
    - thêm `limit() { return this; }` vào fake `qb`;
    - `executeTakeFirst` trả `{ id: 2, workdays: 26 }` khi `table === 'position_types'`.
- [ ] **Step 4: Chạy lại, thấy pass**: chạy file test mới, rồi `npm test` (24 test cũ vẫn pass).
- [ ] **Step 5: Commit** `feat(payroll): load base pay, KPI, insurance and tax inputs; add kpi_proposed migration`.

### Task 4: Phiếu lương và service (`EmployeePayslip`, `PayrollService`)

**Files:**
- Modify:
  - `src/modules/payroll/domain/employee-payslip.ts`
  - `src/modules/payroll/payroll.service.ts`
  - `src/modules/payroll/payroll.repository.ts`: xoá `kpiMaxSalary`, `kpiScore` khỏi `EmployeeMonthlyRawData` và `mapMonthRows`.
- Create: `test/v2/payroll-fixtures.ts`
- Test: `test/v2/payroll.test.ts`

**Interfaces:**
- Consumes: Task 1–3.
- Produces:

```ts
// EmployeePayslipProps: bỏ kpiScores, kpiMaxSalary, taxExemptIncome, personalIncomeTax; thêm (đều optional để các test dựng tay cũ vẫn chạy):
username?: string; // staff.username; mặc định = employeeId. Lưu vào cột payslips.username (Task 5)
kpi?: KpiPay; // mặc định: calculateKpiPay(null, { applicable: false, kpiMax: null })
insurance?: InsuranceDeduction; // mặc định: calculateInsurance(0, false)
taxMethod?: TaxMethod; // mặc định 'none'
dependants?: number; // mặc định 0
warnings?: PayrollWarning[]; // mặc định []
// EmployeePayslipDTO thêm:
username: string; warnings: PayrollWarning[]; kpiApplicable: boolean; kpiProposedAmount: number | null; kpiAppliedAmount: number;
insuranceBreakdown: { bhxh: number; bhyt: number; bhtn: number }; taxMethod: TaxMethod; taxAssessableIncome: number; dependants: number;
// PayrollService
calculatePeriodPayslips(month: string, employeeIds?: string[], actor?: string):
  Promise<{ runId: number; items: EmployeePayslipSummaryDTO[]; errors: Array<{ employeeId: string; message: string }> }>;
// test/v2/payroll-fixtures.ts
export function nvMonthData(overrides?: { staff?: Partial<EmployeeMonthlyRawData['staff']>; kpi?: KpiInput | null }): EmployeeMonthlyRawData;
```

**Trong `EmployeePayslip` chỉ đổi ba khối:**
- **KPI:**
  - `kpiScores` = `kpi.scores` (điểm 0–100 hoặc `null`);
  - `kpiTotalScorePct` = `kpi.weightedPct` (0–100);
  - `kpiMaxSalary` = `kpi.appliedAmount`;
  - `kpiActualPay` = `kpi.amount`.
- **Miễn thuế + BH:**
  - `taxExemptIncome` = round(`ot15Hours` × lương giờ × 0,5 + `ot20Hours` × lương giờ × 1 + `ot30Hours` × lương giờ × 2) + `nightAllowanceActual`;
  - `insuranceDeduction` = `insurance.total`.
- **Thuế:**
  - `tax = calculatePersonalIncomeTax({ method: taxMethod, grossIncome, exemptIncome: taxExemptIncome, insurance: insurance.total, dependants })`;
  - `taxableIncome` = `tax.taxableIncome`; `personalIncomeTax` = `tax.tax`; `taxAssessableIncome` = `tax.assessableIncome`.
- **Gross, net:** gross giữ nguyên công thức. `netIncome` = gross − BH − thuế − tạm ứng.

**`PayrollService.generateMonthlyPayslip`:**
- **Giữ nguyên** vòng lặp ngày công, OT và tạm ứng.
- **Thiếu cấu hình:** `staff.baseSalary` hoặc `staff.standardWorkdays` là `null` → ném `Error('Thiếu cấu hình chức vụ hoặc bậc lương cho <type> bậc <level>')`.
- **Bỏ** `|| 26`, `|| baseSalaryPolicy` của KPI và đoạn đổi điểm `> 1 ? /100`.
- **Tính thêm:**
  - `username = staff.username`, truyền vào `EmployeePayslip`;
  - `kpi = calculateKpiPay(data.kpi, staff.kpiCap)`;
  - `insurance = calculateInsurance(staff.baseSalary, staff.insured, data.insuranceRates)`;
  - `taxMethod = resolveTaxMethod({ hasTax, startDate: contractStart, endDate: contractEnd })`.
- **Cờ:** `kpi.warnings`, cộng `CONTRACT_START_MISSING` khi `contractStart` là `null` và `taxMethod !== 'none'`.

**`calculatePeriodPayslips`:**
- Không nuốt lỗi nữa: mỗi người lỗi → `{ employeeId, message }` vào `errors`.
- Loại người trùng theo `payslip.username`.
- Vẫn lưu các phiếu thành công.

- [ ] **Step 1: Viết test fail.**
  - `nvMonthData()` dựng một nhân viên nv bậc 1, tháng `2026-10`:
    - `uuid 'u1'`, `username 'a'`, `baseSalary 6_000_000`, `standardWorkdays 26`, `employeeType 'nv'`;
    - insured, `dependants 1`, `hasTax`, `contractStart '2025-01-05'`, `contractEnd null`, `kpiCap {applicable:true, kpiMax:6_000_000}`;
    - 20 dòng `NORMAL` 8 giờ không đi muộn (2026-10-01 → 2026-10-23 trừ Chủ nhật 4, 11, 18), 1 dòng `LEAVE` ngày 2026-10-24;
    - `requests`: OT APPROVED `otHours 2`, ADVANCE APPROVED `advanceAmount 1_000_000`;
    - `kpi {scores:{wework:9000,user:8000,peer:7000,manager:8500,self:10000}, proposedAmount:5_000_000}`;
    - `insuranceRates DEFAULT_INSURANCE_RATES`.
  - Sửa các fixture cũ trong `payroll.test.ts` sang trường mới (`kpi` thay `kpiScore`; thêm `insured`, `dependants`, `hasTax`, `contractStart`, `contractEnd`, `kpiCap`, `insuranceRates`). Các assertion phụ cấp cũ giữ nguyên.

```ts
// generateMonthlyPayslip với nvMonthData():
//   baseSalaryActual 4_615_385, paidLeavePay 230_769, otPayTotal 115_385, attendanceAllowanceActual 1_153_846, travelAllowanceActual 692_308
//   kpiActualPay 4_200_000, kpiTotalScorePct 84, grossIncome 11_007_693, taxExemptIncome 57_692, taxableIncome 10_950_001
//   insuranceDeduction 630_000, personalIncomeTax 0, advanceDeduction 1_000_000, netIncome 9_377_693, taxMethod 'progressive', warnings []
// staff {contractStart:'2026-10-01', contractEnd:'2026-12-15'} → taxMethod 'flat10', personalIncomeTax 1_095_000, netIncome 8_282_693
// staff {insured:false} → insuranceDeduction 0, netIncome 10_007_693
// kpi null → kpiActualPay 0, grossIncome 6_807_693, warnings.map(w => w.code) deepEqual ['KPI_PROPOSAL_MISSING','KPI_SCORE_MISSING']
// staff {contractStart:null} → warnings.map(w => w.code) deepEqual ['CONTRACT_START_MISSING']
// staff {baseSalary:null} → generateMonthlyPayslip reject, message chứa 'Thiếu cấu hình'
// staff {employeeType:'tts', kpiCap:{applicable:false,kpiMax:null}}, kpi null → kpiActualPay 0, warnings []
// calculatePeriodPayslips('2026-10', ['u1','missing']) → items.length 1, errors deepEqual [{employeeId:'missing', message: ...}]
// calculatePeriodPayslips('2026-10', ['u1','u1']) → items.length 1
```

- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll.test.ts`.
- [ ] **Step 3: Viết code** trong `EmployeePayslip` và `PayrollService` theo quy ước trên; xoá các trường cũ khỏi repository.
- [ ] **Step 4: Chạy lại, thấy pass**: `npm test`.
- [ ] **Step 5: Commit** `feat(payroll): compute KPI, insurance and income tax on payslips`.

### Task 5: Lưu và đọc phiếu lương (`savePayrollRunAndSlips`, `listPayslips`, `getPayslip`)

**Files:**
- Create: `src/modules/payroll/payroll.errors.ts`
- Modify:
  - `src/modules/payroll/payroll.repository.ts`
  - `src/modules/payroll/payroll.service.ts`
  - `test/v2/payroll.test.ts`: chữ ký mới của fake.
- Test:
  - `test/v2/payroll-persistence.test.ts` (thuần);
  - `test/v2/payroll-repository.pg.test.ts` (cần PostgreSQL).

**Interfaces:**
- Produces:

```ts
// payroll.errors.ts
export class PayrollFinalizedError extends Error { readonly code = 'PAYROLL_FINALIZED' }
export class KpiValidationError extends Error { constructor(readonly code: 'INVALID_KPI_SCORE' | 'KPI_PROPOSAL_EXCEEDS_MAX' | 'KPI_NOT_APPLICABLE' | 'EMPLOYEE_NOT_FOUND', message: string) }
// payroll.repository.ts
export function buildPayslipRow(runId: number, slip: EmployeePayslip): Insertable<DB['payslips']>; // username = slip.username
export function readPayslipRow(row: Selectable<DB['payslips']>): PayslipRecord;
export interface PayslipRecord { id: number; runId: number; username: string; status: string; gross: number; insurance: number; tax: number; advance: number; net: number; warnings: PayrollWarning[]; details: EmployeePayslipDTO }
// PayrollRepository
savePayrollRunAndSlips(month: string, actor: string, payslips: EmployeePayslip[], errorCount?: number): Promise<number>; // errorCount mặc định 0
listPayslips(month: string): Promise<PayslipRecord[]>;
getPayslip(month: string, employeeId: string): Promise<PayslipRecord | null>;
```

Quy ước:
- **`buildPayslipRow`:**
  - `status 'draft'`;
  - các cột `gross` / `insurance` / `tax` / `advance` / `net` lấy từ phiếu;
  - `staff_terms_json` = JSON của `{ employeeType, baseSalaryPolicy, standardWorkdays, taxMethod, dependants }`;
  - `snapshot_gz` = `gzipSync(JSON.stringify(slip.toJSON()))`;
  - `flags_json` = JSON mảng cờ, mảng rỗng thì là `null`.
- **`readPayslipRow`:** giải nén `snapshot_gz` ra `details`, đọc `flags_json` ra `warnings`, các cột BIGINT qua `Number()`.
- **`savePayrollRunAndSlips`** chạy trong `this.qb.transaction().execute(async trx => ...)`:
  1. Tháng đã có run `final` → ném `PayrollFinalizedError`.
  2. `run_no` = `max(run_no) + 1` (chưa có run nào thì là 1).
  3. Các run `draft` của tháng → `superseded`.
  4. Insert run với `status 'draft'`, `engine_version 'v2-rules-2026-11'`, `params_hash 'v2-rules-2026-11'`, `params_rev 1`, `params_json '{}'`, `switches_json '{}'`, `slips_total`, `slips_error = errorCount`.
  5. Insert từng phiếu bằng `buildPayslipRow`.
- **`listPayslips` / `getPayslip`:**
  - đọc run mới nhất có `status <> 'superseded'`;
  - `getPayslip` tìm `username` trong `staff` theo `uuid = employeeId` hoặc `username = employeeId`.
- **Service:** `calculatePeriodPayslips` gọi `savePayrollRunAndSlips(month, actor, payslips, errors.length)`. Cột `payslips.username` nhận `slip.username` (username thật, không phải uuid).

- [ ] **Step 1: Viết test fail.**
  - `payroll-persistence.test.ts`: dựng phiếu từ `nvMonthData()` qua `PayrollService` với fake repository. Kiểm tra:
    - `buildPayslipRow(7, slip)` có `status 'draft'`, `username 'a'`, `net 9_377_693`, `flags_json null`;
    - `JSON.parse(gunzipSync(row.snapshot_gz).toString()).netIncome === 9_377_693`;
    - phiếu dựng với `kpi: null` → `JSON.parse(row.flags_json!)[0].code === 'KPI_PROPOSAL_MISSING'`;
    - `readPayslipRow({ ...row, id: 1, run_id: 7, gross: '11007693', net: '9377693', ... })` trả `gross 11_007_693` (number) và `details.netIncome 9_377_693`.
  - `payroll-repository.pg.test.ts`: chỉ chạy khi có `process.env.PG_TEST_URL`; không có thì `t.skip('PG_TEST_URL chưa đặt')`.
    1. Mở `pg.Client` tới `PG_TEST_URL`, tạo database tạm `payroll_rules_<pid>_<Date.now()>`.
    2. Áp `0001`, `0002`, `0003` bằng `client.query(fileText)` (simple query, không truyền tham số).
    3. Gieo dữ liệu (điền đủ các cột NOT NULL theo `0001`):
       - 1 staff nv bậc 1 (`uuid`, `username`, `pass_hash` bất kỳ, `start_date '2025-01-05'`, `insured 1`);
       - 1 dòng `timesheet_entries` ngày `2026-10-01`;
       - 1 đơn OVERTIME APPROVED có `ot_date '2026-10-01'`;
       - 1 dòng `kpi_scores` có `kpi_proposed`.
    4. Gọi `getMonthlyData`, rồi `savePayrollRunAndSlips` **hai lần**, rồi `listPayslips`.
    5. `finally` xoá database tạm.

    Kiểm tra:
    - `getMonthlyData` không lỗi `LIKE`, có `requests.length 1`, `staff.baseSalary === 6_000_000` (number), `kpi.proposedAmount` là number;
    - run thứ hai có `run_no 2`, run thứ nhất thành `superseded`;
    - `listPayslips` trả phiếu của run 2;
    - `UPDATE payroll_runs SET status='final'` cho run 2, rồi lưu lần ba → reject `PayrollFinalizedError`.
- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll-persistence.test.ts`. Nếu máy có PostgreSQL theo `docs/postgres-local.md`, chạy thêm `PG_TEST_URL=... node --import tsx --test test/v2/payroll-repository.pg.test.ts`.
- [ ] **Step 3: Viết code** theo phần Interfaces và quy ước.
- [ ] **Step 4: Chạy lại, thấy pass**: `npm test`. Trong báo cáo, ghi rõ test PostgreSQL đã chạy thật hay bị skip.
- [ ] **Step 5: Commit** `fix(payroll): persist draft runs with versioning, gzip snapshots and warnings`.

### Task 6: API KPI, mã lỗi và hợp đồng API (`setKpiScore`, controller, docs)

**Files:**
- Modify:
  - `src/modules/payroll/payroll.service.ts`
  - `src/modules/payroll/payroll.repository.ts`: `saveKpiScore`, `getKpiCap`.
  - `src/modules/payroll/payroll.controller.ts`
  - `docs/api/v2-contract.md` §3.5
- Test: `test/v2/payroll-kpi-api.test.ts`

**Interfaces:**
- Consumes: `KpiCap` (Task 1), `KpiValidationError`, `PayrollFinalizedError` (Task 5).
- Produces:

```ts
export interface KpiScoreBody { wework?: number | null; user?: number | null; userScore?: number | null; peer?: number | null; manager?: number | null; self?: number | null; selfScore?: number | null; proposedAmount?: number | null }
export interface KpiScorePatch { wework?: number | null; user_score?: number | null; peer?: number | null; manager?: number | null; self_score?: number | null; kpi_proposed?: number | null } // điểm × 100
// PayrollRepository
getKpiCap(username: string, month: string): Promise<KpiCap | null>;
saveKpiScore(username: string, month: string, patch: KpiScorePatch, actor: string): Promise<void>;
// PayrollService
setKpiScore(username: string, month: string, body: KpiScoreBody, actor: string): Promise<void>;
```

**Quy ước của `setKpiScore`:**
- **Tên trường:** `userScore` / `selfScore` là tên khác của `user` / `self`. Có cả hai tên thì dùng tên ngắn.
- **Trường bỏ trống:** `undefined` thì giữ nguyên trong DB, `null` thì xoá.
- **Điểm:** phải là số trong 0..100 → lưu `Math.round(điểm × 100)`. Sai → `KpiValidationError('INVALID_KPI_SCORE', 'Điểm KPI phải từ 0 đến 100')`.
- **`proposedAmount`:** phải là số nguyên ≥ 0, sai cũng là `INVALID_KPI_SCORE`. Ngoài ra:
  - `getKpiCap` trả `null` → `EMPLOYEE_NOT_FOUND`;
  - `proposedAmount > 0` mà `applicable` là `false` → `KPI_NOT_APPLICABLE`;
  - vượt `kpiMax` → `KPI_PROPOSAL_EXCEEDS_MAX`, message `Lương KPI đề xuất phải nhỏ hơn hoặc bằng <kpiMax> đồng`.

**Quy ước của repository:**
- `getKpiCap` đọc `staff`, `position_types` và `position_levels` (bản có hiệu lực tới tháng tính), cùng benefit `kpi`. Cách tính `applicable` giống `mapMonthRows`.
- `saveKpiScore` upsert như cũ, chỉ ghi các cột có trong `patch`.

**Controller:**
- `KpiValidationError`: mã `EMPLOYEE_NOT_FOUND` → `NotFoundError`, mã khác → `BadRequestError(message, { code })`.
- `PayrollFinalizedError` → `ConflictError(message, { code: 'PAYROLL_FINALIZED' })`.
- Kết quả tính lương thêm trường `errors`.

**Docs** `docs/api/v2-contract.md` §3.5, ghi đúng hành vi mới:
- body KPI (điểm 0–100, `proposedAmount`, hai tên khác);
- danh sách mã lỗi;
- trường `errors` của kết quả tính;
- trường `warnings` của phiếu và bảng mã cờ kèm câu tiếng Việt (chép từ `WARNING_MESSAGES`);
- các trường mới của phiếu và ý nghĩa mới của `kpiScores` / `kpiTotalScorePct` / `kpiMaxSalary`.

- [ ] **Step 1: Viết test fail** với fake repository override `getKpiCap` và `saveKpiScore` (ghi lại patch):

```ts
// cap {applicable:true, kpiMax:6_000_000}; body {wework:87.5, userScore:90, proposedAmount:5_000_000}
//   → patch deepEqual {wework:8750, user_score:9000, kpi_proposed:5_000_000}
// body {peer:null} → patch deepEqual {peer:null}
// body {manager:101} → reject KpiValidationError code 'INVALID_KPI_SCORE'
// body {proposedAmount:6_000_001} → reject code 'KPI_PROPOSAL_EXCEEDS_MAX'
// cap {applicable:false, kpiMax:null}, body {proposedAmount:1} → reject 'KPI_NOT_APPLICABLE'; body {proposedAmount:0} → ok
// getKpiCap null → reject 'EMPLOYEE_NOT_FOUND'
// controller: service.setKpiScore ném KpiValidationError('KPI_PROPOSAL_EXCEEDS_MAX', ...) → controller.setKpiScore reject BadRequestError có code đó
// controller: service.calculatePeriodPayslips ném PayrollFinalizedError → controller.calculatePeriod reject ConflictError
```

- [ ] **Step 2: Chạy, thấy fail**: `node --import tsx --test test/v2/payroll-kpi-api.test.ts`.
- [ ] **Step 3: Viết code** trong service, repository và controller, rồi cập nhật docs.
- [ ] **Step 4: Chạy lại, thấy pass**: `npm test`.
- [ ] **Step 5: Commit** `feat(payroll): validate KPI proposals and document payroll API`.

---

### Task 7: Sửa sau review cuối nhánh

Tính lại một phần giữ phiếu nháp của người khác; không tính được phiếu nào thì không lưu. Kiểm `employeeIds`. Thêm test phần miễn thuế. Sửa docs §3.5. Chi tiết trong brief của bộ điều phối. Commit `fix(payroll): keep other payslips on partial recalculation and tighten payroll inputs`.

### Task 8: Thuế và BH theo nhãn hợp đồng (người dùng chốt 2026-11-04)

**Luật:**
- **Nhãn hợp đồng** nằm ở `staff.contract`:
  - `'long'` = "HĐLĐ từ 3 tháng".
  - `'short'` = "Dưới 3 tháng".
  - Giá trị khác (trống, ngày, …) lấy theo loại: tts → `'short'`, loại khác → `'long'`.
- **Thuế:** `'long'` → lũy tiến; `'short'` → 10%. Bỏ qua `tax_on`, `deduct_on` và ngày hợp đồng. Bỏ cờ `CONTRACT_START_MISSING`.
- **BH:** `'long'` → luôn trừ, kể cả khi `insured = 0`. `'short'` → chỉ trừ khi `insured` bật.
- **Thuế 10%** = `round(gross × 0,1)` khi gross ≥ 5.000.000, ngược lại 0.
- **Miễn thuế ca đêm** = tổng theo từng ngày NIGHT của `min(giờ làm × lương giờ × 0,3, phụ cấp đêm của ngày đó)`.
  - Ví dụ: nv bậc 1, mức 60%, 20 ca 8 giờ → 1.384.615.
- **`contractStatusText`** hiện "HĐLĐ từ 3 tháng" hoặc "Dưới 3 tháng".

**Interfaces:** `resolveContractTerm(label, employeeType)`, `isInsured(term, insuredTag)`, `resolveTaxMethod(term)`. `EmployeeMonthlyRawData.staff` bỏ `hasTax` / `contractStart` / `contractEnd`, thêm `contractTerm`.

Test, docs và các góp ý nhỏ từ review Task 7 nằm trong brief của bộ điều phối. Commit `fix(payroll): choose tax and insurance by contract label and follow v1 exemptions`.

---

## Kiểm tra cuối nhánh

- `npm test`: mọi test pass, kể cả các test baseline của module khác.
- Ghi rõ test `payroll-repository.pg.test.ts` đã chạy thật hay bị skip. Nếu bị skip thì nêu trong báo cáo là phần lưu DB chưa được kiểm trên PostgreSQL thật.
- Nhắc người dùng: migration `0003_payroll_rules.sql` cần được người dùng tự áp dụng lên DB dev/prod.
