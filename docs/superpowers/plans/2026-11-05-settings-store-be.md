# Kho cài đặt BE v2 — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng kho cài đặt có phiên bản theo tháng (6 nhóm số tính lương, tuần làm việc riêng, vùng chấm công, ngày trả lương), API `/api/v2/settings*`, rồi nối vào chấm công và danh mục ca.

**Architecture:** Module mới `src/modules/settings/` theo mẫu positions: controller → service → repository, logic thuần trong `domain/`. Mỗi nhóm một bảng có cột thật, có phiên bản theo `effective_month`. Lưu dùng chuỗi phiên bản chung (`src/common/version-chain.ts`) và ghi một dòng `settings_changes` cho mỗi ô đổi. Module khác chỉ đọc qua `SettingsReader`.

**Tech Stack:** NestJS 10, Kysely 0.29, PostgreSQL 16, `node:test` chạy bằng `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-05-settings-store-design.md` (commit 4efb6d3, người dùng duyệt trong chat ngày 2026-11-05). Đọc cả spec trước khi làm task đầu tiên.

## Global Constraints

- Phiên này chỉ sửa `src/`, `migrations/postgres/schema.sql`, `test/v2/`, `docs/`. **Không sửa `web/`.**
- Lược đồ: sửa thẳng `migrations/postgres/schema.sql`, không thêm file đánh số.
- `src/database/schema.ts` sửa tay. Ruling: sửa tay — `scripts/docs/gen-db-types.ts` không có trong repo — rủi ro: lệch kiểu với SQL, test PG sẽ lộ.
- Xác minh chỉ bằng test, **không chạy `npm run typecheck`, không chạy prettier**.
- PostgreSQL cho test: container riêng, khởi động một lần ở Task 2, xoá ở Task 14.
  ```bash
  docker run -d --rm --name luong-test-pg-settings-store -p 127.0.0.1:55466:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
  ```
  Lệnh test có PG: `PG_TEST_URL=postgres://postgres@127.0.0.1:55466/postgres <lệnh>`.
- Không đọc `spec/` (v1). Không merge vào `main`, không push. Không đụng các nhánh FE `claude/admin-ui-concept-6445c9`, `claude/vigilant-feynman-dbb291`, `claude/musing-brahmagupta-cbd29d`. Không in hay commit giá trị bí mật.
- Tháng là `'YYYY-MM'`, tính theo giờ Việt Nam bằng `businessMonthText(now)` (`src/common/business-date.ts`).
- Lỗi HTTP dùng `BadRequestError` / `NotFoundError` / `ConflictError` của `src/common`; thân lỗi là `{ error, code, ...details }`.
- Mỗi route mới mang đúng một dấu quyền (`@RequireCap('config.read')`, `@RequireCap('config.write')` hoặc `@Authenticated()`), và phải có dòng trong bảng `TABLE` của `test/v2/auth-access.test.ts`.
- Câu lỗi tiếng Việt. Chữ cố định của spec giữ nguyên:
  - "Hôm nay không phải ngày làm của bạn";
  - "Không lấy được vị trí";
  - "Bạn đang cách văn phòng {distanceM} m".
- Mỗi task kết thúc bằng commit; message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Task 11–13 có **cổng**: chỉ làm khi nhánh nêu trong task đã vào `main` local (`git merge-base --is-ancestor <nhánh> main`). Chưa vào thì để task ở trạng thái chờ và ghi rõ trong báo cáo cuối. Trước khi làm, `git merge --ff-only main` hoặc `git merge main` vào nhánh này rồi đọc lại các file trong task, vì nhánh kia đã đổi chúng.

## Rulings đặt khi lập plan (người dùng xem khi duyệt plan)

- Ruling: `NOT_A_WORKDAY` chỉ chặn chấm **vào** (IN); chấm ra (OUT) không bị chặn vì lý do này — D14 viết "chặn check-in", và ca Night ra lúc 06:00–07:00 sáng hôm sau sẽ rơi vào ngày ngoài tuần — rủi ro: OUT lẻ vào ngày nghỉ vẫn tạo lịch mặc định như hiện nay. Nếu được duyệt, Task 9 thêm một dòng vào spec mục 5.6 và nhắn phiên FE.
- Ruling: kiểm ngày làm và vùng **trước** khi tạo lịch mặc định — `AttendanceRepository` ghi bằng pool riêng, không theo transaction, nên kiểm sau thì lần chấm bị từ chối vẫn để lại lịch — rủi ro: không có.
- Ruling: tổng KPI khác 100 báo `field: 'sum'`; thiếu ô nào báo tên ô đó — spec mục 5.7 chỉ ví dụ tên ô — rủi ro: FE đã khoá Lưu nên chỉ ảnh hưởng thông báo lưới an toàn.
- Ruling: luật chéo của biểu thuế (tăng dần, chỉ bậc cuối `NULL`) kiểm trong `validateGroupChange`; CHECK của SQL chỉ kiểm từng dòng — PostgreSQL không có CHECK nhiều dòng — rủi ro: ghi thẳng SQL có thể tạo biểu sai.
- Ruling: phiên bản sau nhận số chép tiếp (carry) không sinh dòng lịch sử riêng; lịch sử chỉ ghi ô đổi ở tháng Admin chọn — giống positions — rủi ro: lịch sử không cho thấy tháng sau cũng đổi theo.
- Ruling: bỏ dòng `settings.insurance_rates` ngay ở Task 2; tính lương đọc thiếu dòng thì dùng `DEFAULT_INSURANCE_RATES` (8% / 1,5% / 1%, cùng số) cho tới Task 13 — rủi ro: Admin sửa bảo hiểm trước Task 13 thì lương chưa theo.
- Ruling: khoảng cách trong câu lỗi là số nguyên không có dấu chấm nghìn ("1234 m") — rủi ro: chỉ là cách viết.

## Review Focus

1. **Số lẻ theo bước 0,01:** 1,6 và 1,55 phải được nhận dù `1.6 / 0.01` ra 160.00000000000003; 1,555 phải bị từ chối. → test ở Task 3.
2. **Ca đêm ra sau nửa đêm vào ngày ngoài tuần:** người làm T2–T6 ca Night1 chấm ra 06:30 sáng thứ Bảy thì không bị `NOT_A_WORKDAY`. → test ở Task 9.
3. **Toạ độ 0 / 0 là một vị trí,** không phải "không có vị trí". Thiếu `lat` hoặc `lng` (hoặc không phải số hữu hạn) mới là `NO_LOCATION`. → test ở Task 4 và Task 9.
4. **Quay về tuần của loại từ một tháng sau:** Bình T2–T6 từ 12/2026, rồi `null` từ 03/2027. Tháng 01–02/2027 vẫn T2–T6, từ 03/2027 theo T2–T7. → test ở Task 7.
5. **Hai Admin cùng lưu một nhóm với cùng `stamp`:** đúng một lần lưu thành công, lần kia nhận 409, kể cả khi hai lần chọn tháng áp dụng khác nhau. → test PG ở Task 6.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/common/version-chain.ts` | chuyển từ `positions/domain/version-chain.ts` (nguyên nội dung); đường cũ re-export |
| `src/common/shift-catalog.ts` | 6 khung giờ ca cố định, `DEFAULT_SHIFT`, `shiftByCode` |
| `test/v2/helpers/pg-temp-db.ts` | `withTempDb` chuyển ra từ `positions-repository.pg.test.ts` để các test PG dùng chung |
| `migrations/postgres/schema.sql`, `src/database/schema.ts` | bảng mới, bỏ `param_versions` và dòng `settings.insurance_rates` |
| `src/modules/settings/settings.errors.ts` | 4 lớp lỗi của module |
| `src/modules/settings/domain/setting-groups.ts` | danh mục 6 nhóm, giới hạn, kiểm giá trị, mã hoá biểu thuế |
| `src/modules/settings/domain/settings-input.ts` | đọc tháng, lý do, `stamp` từ thân request |
| `src/modules/settings/domain/work-week.ts` | công chuẩn theo số ngày, kiểm danh sách thứ, `isWorkday` |
| `src/modules/settings/domain/attendance-zone.ts` | `distanceM`, `checkPunchLocation`, kiểm vùng |
| `src/modules/settings/domain/pay-days.ts` | `payDateOf` |
| `src/modules/settings/domain/min-month.ts` | `minMonthFrom` |
| `src/modules/settings/settings.repository.ts` | đọc/ghi các bảng cài đặt, lịch sử, `stamp` |
| `src/modules/settings/settings-reader.ts` | `settingsFor`, `workWeekOf`, `zone` cho module khác |
| `src/modules/settings/settings.service.ts` | các use case của API |
| `src/modules/settings/settings.controller.ts`, `settings.module.ts`, `index.ts` | route, ánh xạ lỗi, đăng ký module |
| `src/modules/attendance/attendance.errors.ts` | `PunchRefusedError` |

---

### Task 1: Phần dùng chung — chuỗi phiên bản, danh mục ca, helper DB tạm

**Files:**
- Create: `src/common/version-chain.ts`, `src/common/shift-catalog.ts`, `test/v2/helpers/pg-temp-db.ts`, `test/v2/shift-catalog.test.ts`
- Modify: `src/modules/positions/domain/version-chain.ts` (thay nội dung bằng `export * from '../../../common/version-chain';`), `test/v2/positions-repository.pg.test.ts` (xoá hàm `withTempDb` tại chỗ, import từ helper)

**Interfaces:**
- Produces:
  - `src/common/version-chain.ts`: `Values`, `ChainVersion`, `ChainPlan`, `versionAt`, `planChange`, giữ nguyên chữ ký hiện có.
  - `src/common/shift-catalog.ts`:
    ```ts
    export type ShiftCode = 'Normal1' | 'Normal2' | 'Flex1' | 'Flex2' | 'Night1' | 'Night2';
    export interface CatalogShift { code: ShiftCode; kind: 'normal' | 'flex' | 'night'; shiftType: 'NORMAL' | 'FLEX' | 'NIGHT'; startTime: string; endTime: string }
    export const SHIFT_CATALOG: ReadonlyArray<CatalogShift>;   // đúng thứ tự bảng spec mục 3.5
    export const DEFAULT_SHIFT: CatalogShift;                   // Normal1
    export function shiftByCode(code: unknown): CatalogShift | null;
    ```
  - `test/v2/helpers/pg-temp-db.ts`: `withTempDb(t, prefix, run)`, nguyên chữ ký và thân hiện có.

- [ ] **Step 1: Viết test hỏng** `test/v2/shift-catalog.test.ts`

```ts
it('lists the six fixed frames in order', () => {
  assert.deepEqual(SHIFT_CATALOG.map(s => s.code), ['Normal1', 'Normal2', 'Flex1', 'Flex2', 'Night1', 'Night2']);
  assert.deepEqual(SHIFT_CATALOG.map(s => `${s.startTime}-${s.endTime}`),
    ['08:00-17:00', '10:00-19:00', '06:00-15:00', '13:00-22:00', '22:00-07:00', '21:00-06:00']);
  assert.deepEqual(shiftByCode('Night1'), { code: 'Night1', kind: 'night', shiftType: 'NIGHT', startTime: '22:00', endTime: '07:00' });
  assert.equal(shiftByCode('X'), null);
  assert.equal(DEFAULT_SHIFT.code, 'Normal1');
});
it('positions re-exports the shared version chain', () => {
  assert.equal(positionsChain.planChange, commonChain.planChange);
  assert.equal(positionsChain.versionAt, commonChain.versionAt);
});
```

- [ ] **Step 2: Chạy, xác nhận hỏng**

Run: `node --import tsx --test test/v2/shift-catalog.test.ts`
Expected: FAIL, không tìm thấy module `src/common/shift-catalog`.

- [ ] **Step 3: Tạo `shift-catalog.ts`, chuyển `version-chain.ts`, tạo helper `pg-temp-db.ts`**

- [ ] **Step 4: Chạy lại test mới và test positions**

Run: `node --import tsx --test test/v2/shift-catalog.test.ts test/v2/positions-domain.test.ts test/v2/positions-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** — `refactor(common): shared version chain, shift catalog, temp-db test helper`

---

### Task 2: Lược đồ

**Files:**
- Modify: `migrations/postgres/schema.sql`, `src/database/schema.ts`
- Test: `test/v2/settings-schema.pg.test.ts`

**Interfaces:**
- Produces: các bảng `overtime_rules`, `attendance_rules`, `kpi_weights`, `insurance_rates`, `tax_rules`, `tax_brackets`, `pay_calendar`, `staff_work_weeks`, `attendance_zone`, `settings_changes`, đúng cột và giới hạn ở spec mục 3.1–3.4.
  - `updated_at` và `changed_at` là `TIMESTAMPTZ`, nên kiểu Kysely là `Date`.
  - `settings_changes.id` là `Generated<number>`.
  - `tax_brackets`: `effective_month TEXT REFERENCES tax_rules(effective_month)`, `sort INTEGER CHECK (sort BETWEEN 1 AND 10)`, `upper_bound BIGINT CHECK (upper_bound IS NULL OR upper_bound BETWEEN 1 AND 1000000000)`, `rate_pct DOUBLE PRECISION CHECK (rate_pct BETWEEN 0 AND 100)`, `PRIMARY KEY (effective_month, sort)`.
  - Cột KPI: `wework`, `user_score`, `peer`, `manager`, `self_score`, kèm `CHECK (wework + user_score + peer + manager + self_score = 100)`.
  - Trigger `settings_changes_no_update` / `settings_changes_no_delete` theo mẫu của `audit_log`, câu lỗi `'settings_changes chỉ được thêm dòng'`.
  - Dòng gieo sẵn `'2000-01'` của 7 bảng có phiên bản: `updated_by 'system'`, `updated_at '2026-11-05T00:00:00Z'`.
- Removes:
  - bảng `param_versions`, 2 trigger, 2 hàm và 2 chỉ mục của nó;
  - kiểu `ParamVersionsTable`;
  - dòng `INSERT INTO settings ... 'insurance_rates'`.

- [ ] **Step 1: Khởi động PostgreSQL test** (lệnh ở Global Constraints). Kiểm: `docker ps --filter name=luong-test-pg-settings-store` có một dòng.

- [ ] **Step 2: Viết test hỏng** `test/v2/settings-schema.pg.test.ts`. Dùng `withTempDb` từ helper. Các test con:

```ts
// gieo sẵn
assert.deepEqual(row('overtime_rules'), { effective_month: '2000-01', weekday_rate: 1.5, weekend_rate: 2, holiday_rate: 3 });
assert.deepEqual(row('attendance_rules'), { effective_month: '2000-01', late_grace_minutes: 15, diligence_lost_from_days: 3 });
assert.deepEqual(row('kpi_weights'), { effective_month: '2000-01', wework: 40, user_score: 24, peer: 18, manager: 12, self_score: 6 });
assert.deepEqual(row('insurance_rates'), { effective_month: '2000-01', bhxh_pct: 8, bhyt_pct: 1.5, bhtn_pct: 1 });
assert.deepEqual(row('tax_rules'), { effective_month: '2000-01', personal_deduction: 15500000, dependant_deduction: 6200000, short_contract_pct: 10, short_contract_threshold: 5000000 });
assert.deepEqual(brackets('2000-01'), [[10000000, 5], [30000000, 10], [60000000, 20], [100000000, 30], [null, 35]]);
assert.deepEqual(row('pay_calendar'), { effective_month: '2000-01', pay_day: 10 });
assert.equal(count('attendance_zone'), 0);
assert.equal(settingsKey('insurance_rates'), undefined);
assert.equal(await regclass('param_versions'), null);
// CHECK từ chối (mỗi câu một INSERT, mong lỗi)
//   overtime_rules weekday_rate 1.49; kpi_weights tổng 99; pay_calendar pay_day 29;
//   attendance_zone radius_m 19, radius_m 5001, id 2; overtime_rules effective_month '2026-13';
//   staff_work_weeks employee_id không có trong staff.
// settings_changes chỉ thêm dòng
//   INSERT một dòng; UPDATE và DELETE đều reject với /settings_changes chỉ được thêm dòng/.
// danh mục ca khớp DB
assert.deepEqual((await workShiftCodesBySort()), SHIFT_CATALOG.map(s => s.code));
```

`row(table)` bỏ `updated_by` và `updated_at` khỏi kết quả trước khi so.

- [ ] **Step 3: Chạy, xác nhận hỏng**

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55466/postgres node --import tsx --test test/v2/settings-schema.pg.test.ts`
Expected: FAIL, `relation "overtime_rules" does not exist`.

- [ ] **Step 4: Sửa `schema.sql` và `schema.ts`.** Bảng mới đặt sau `settings`; chỉ mục `settings_changes_setting ON settings_changes (setting, subject, id)` đặt cùng khối chỉ mục; trigger đặt cùng khối trigger.

- [ ] **Step 5: Chạy test schema và test PG cũ**

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55466/postgres node --import tsx --test test/v2/settings-schema.pg.test.ts test/v2/positions-repository.pg.test.ts test/v2/payroll-repository.pg.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** — `feat(settings): settings tables, change log and seeds in schema.sql`

---

### Task 3: Danh mục nhóm và kiểm giá trị

**Files:**
- Create: `src/modules/settings/settings.errors.ts`, `src/modules/settings/domain/setting-groups.ts`
- Test: `test/v2/settings-groups.test.ts`

**Interfaces:**
- Produces (`settings.errors.ts`):
  ```ts
  export class SettingsInputError extends Error { constructor(message: string, readonly field: string) }
  export class SettingsGroupNotFoundError extends Error {}
  export class SettingsEmployeeNotFoundError extends Error {}
  export class SettingsStaleError extends Error { constructor(message: string, readonly stamp: number) }
  ```
- Produces (`setting-groups.ts`):
  ```ts
  export type GroupKey = 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar';
  export const GROUP_KEYS: readonly GroupKey[];           // đúng thứ tự trên
  export interface Bracket { upTo: number | null; ratePct: number }
  export type GroupValues = Record<string, number | Bracket[]>;
  export interface NumberLimit { min: number; max: number; step: number }
  export interface BracketLimit { minRows: 1; maxRows: 10; upTo: NumberLimit; ratePct: NumberLimit }
  export interface FieldSpec { name: string; column: string; kind: 'rate' | 'pct' | 'int' | 'money' | 'brackets'; default: number | Bracket[]; limit: NumberLimit | BracketLimit }
  export interface GroupSpec { key: GroupKey; responseKey: 'overtime' | 'attendance' | 'kpiWeights' | 'insurance' | 'tax' | 'payCalendar'; table: string; fields: FieldSpec[]; sum?: number }
  export const SETTING_GROUPS: Record<GroupKey, GroupSpec>;
  export function isGroupKey(v: unknown): v is GroupKey;
  export function defaultsOf(g: GroupKey): GroupValues;
  export function limitsOf(g: GroupKey): Record<string, NumberLimit | BracketLimit>;
  export function validateGroupChange(g: GroupKey, values: unknown): GroupValues;   // trả các ô đã kiểm; sai thì ném SettingsInputError
  export function encodeValues(v: GroupValues): Values;      // brackets → JSON.stringify của mảng đã chuẩn hoá; ô số giữ nguyên
  export function decodeValues(g: GroupKey, v: Values): GroupValues;
  ```
  - **Tên ô và cột:** theo spec mục 5.1 và 3.1. Cột `brackets` của `tax` đặt `column: 'tax_brackets'`.
  - **Giới hạn:** lấy từ spec mục 5.1 (ví dụ `GET /settings`).
  - **Bước:** `rate` và `pct` có bước 0,01; `int` và `money` có bước 1 và phải là số nguyên.
  - **Kiểm bước:** dùng `Math.abs(Math.round(v / step) * step - v) <= 1e-9`.

- [ ] **Step 1: Viết test hỏng** `test/v2/settings-groups.test.ts`

```ts
const bad = (g: GroupKey, values: unknown, field: string) =>
  assert.throws(() => validateGroupChange(g, values), (e: any) => e instanceof SettingsInputError && e.field === field);

it('gives defaults and limits', () => {
  assert.deepEqual(defaultsOf('overtime'), { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 });
  assert.deepEqual(defaultsOf('kpi-weights'), { wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
  assert.deepEqual(limitsOf('overtime').weekdayRate, { min: 1.5, max: 5, step: 0.01 });
  assert.deepEqual(limitsOf('tax').brackets, { minRows: 1, maxRows: 10, upTo: { min: 1, max: 1000000000, step: 1 }, ratePct: { min: 0, max: 100, step: 0.01 } });
  assert.equal(SETTING_GROUPS['kpi-weights'].sum, 100);
  assert.equal((defaultsOf('tax').brackets as Bracket[]).at(-1)!.upTo, null);
});
it('accepts values on the 0.01 grid and rejects others', () => {
  for (const v of [1.5, 1.55, 1.6, 4.99, 5]) assert.deepEqual(validateGroupChange('overtime', { weekdayRate: v }), { weekdayRate: v });
  bad('overtime', { weekdayRate: 1.49 }, 'weekdayRate');
  bad('overtime', { weekdayRate: 5.01 }, 'weekdayRate');
  bad('overtime', { weekdayRate: 1.555 }, 'weekdayRate');
  bad('overtime', { weekdayRate: '1.6' }, 'weekdayRate');
  bad('overtime', { weekdayRate: Number.NaN }, 'weekdayRate');
  bad('overtime', { foo: 1 }, 'foo');
  bad('overtime', {}, 'values');
  bad('overtime', null, 'values');
});
it('checks whole numbers, KPI sum and payday', () => {
  assert.deepEqual(validateGroupChange('attendance', { lateGraceMinutes: 10 }), { lateGraceMinutes: 10 });
  bad('attendance', { lateGraceMinutes: 10.5 }, 'lateGraceMinutes');
  bad('attendance', { lateGraceMinutes: 61 }, 'lateGraceMinutes');
  bad('attendance', { diligenceLostFromDays: 0 }, 'diligenceLostFromDays');
  assert.deepEqual(validateGroupChange('kpi-weights', { wework: 50, user: 20, peer: 15, manager: 10, self: 5 }),
    { wework: 50, user: 20, peer: 15, manager: 10, self: 5 });
  bad('kpi-weights', { wework: 50 }, 'user');
  bad('kpi-weights', { wework: 40, user: 24, peer: 18, manager: 12, self: 4 }, 'sum');
  bad('insurance', { bhytPct: 100.01 }, 'bhytPct');
  bad('pay-calendar', { payDay: 29 }, 'payDay');
  bad('tax', { personalDeduction: 15500000.5 }, 'personalDeduction');
});
it('checks tax brackets as a whole', () => {
  const ok = [{ upTo: 20000000, ratePct: 10 }, { upTo: null, ratePct: 20 }];
  assert.deepEqual(validateGroupChange('tax', { brackets: ok }), { brackets: ok });
  for (const b of [[], Array.from({ length: 11 }, (_, i) => ({ upTo: i === 10 ? null : (i + 1) * 1000000, ratePct: 5 })),
    [{ upTo: null, ratePct: 5 }, { upTo: null, ratePct: 10 }], [{ upTo: 30000000, ratePct: 5 }, { upTo: 10000000, ratePct: 10 }, { upTo: null, ratePct: 20 }],
    [{ upTo: 10000000, ratePct: 5 }], [{ upTo: '10000000', ratePct: 5 }, { upTo: null, ratePct: 10 }],
    [{ upTo: 10000000, ratePct: 100.5 }, { upTo: null, ratePct: 10 }]]) bad('tax', { brackets: b }, 'brackets');
});
it('round-trips brackets through the chain encoding', () => {
  const enc = encodeValues(defaultsOf('tax'));
  assert.equal(typeof enc.brackets, 'string');
  assert.deepEqual(decodeValues('tax', enc), defaultsOf('tax'));
});
```

- [ ] **Step 2: Chạy, xác nhận hỏng** — `node --import tsx --test test/v2/settings-groups.test.ts` → FAIL (module chưa có).
- [ ] **Step 3: Viết `settings.errors.ts` và `setting-groups.ts`.** Thứ tự kiểm:
  - `values` phải là object khác `null` và có ít nhất một khoá;
  - khoá lạ thì báo lỗi ở khoá đó;
  - kiểm từng ô;
  - riêng `kpi-weights`: kiểm đủ 5 ô (thiếu thì báo tên ô thiếu đầu tiên theo thứ tự danh mục), sau đó mới kiểm tổng.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `feat(settings): setting group catalog and value checks`

---

### Task 4: Các hàm thuần còn lại

**Files:**
- Create: `src/modules/settings/domain/settings-input.ts`, `work-week.ts`, `attendance-zone.ts`, `pay-days.ts`, `min-month.ts`
- Test: `test/v2/settings-domain.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // settings-input.ts — mọi lỗi là SettingsInputError(field)
  export function parseMonth(v: unknown, field: string): string;                 // /^\d{4}-(0[1-9]|1[0-2])$/
  export function parseEffectiveMonth(v: unknown, minMonth: string): string;     // field 'effectiveMonth'; < minMonth → câu "Tháng áp dụng phải từ MM/YYYY trở đi"
  export function parseReason(v: unknown): string | null;                        // như positions: undefined/null → null; trim; rỗng → null; > 300 → lỗi 'reason'
  export function parseStamp(v: unknown): number;                                // số nguyên ≥ 0, field 'stamp'
  // work-week.ts
  export function standardWorkdaysForWeek(n: number): number;                    // Math.round(n * 52 / 12)
  export function validateWeekdays(v: unknown): number[];                        // 1..6, không trùng, ≥ 1 phần tử, trả mảng tăng dần; field 'weekdays'
  export function isWorkday(weekdays: readonly number[], date: string): boolean; // thứ của 'YYYY-MM-DD' theo lịch (UTC), 0 = CN
  // attendance-zone.ts
  export interface Zone { lat: number; lng: number; radiusM: number }
  export type PunchLocationCheck = { kind: 'ok'; distanceM: number | null } | { kind: 'outside'; distanceM: number } | { kind: 'no-location' };
  export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;  // haversine R = 6371000, Math.round
  export function checkPunchLocation(zone: Zone | null, at: { lat?: unknown; lng?: unknown }): PunchLocationCheck;
  export function validateZone(v: unknown): Zone;                                // field 'lat' | 'lng' | 'radiusM' theo spec mục 5.4
  // pay-days.ts
  export function payDateOf(month: string, payDay: number): string;              // ngày payDay của tháng sau
  // min-month.ts
  export function minMonthFrom(lastClosedMonth: string | null, now: Date): string;
  ```
  - `distanceM` dùng lại `GeoLocation.calculateDistanceMeters` của `attendance/domain/geo-location.ts`.
  - `checkPunchLocation`:
    - `zone` là `null` → `{ kind: 'ok', distanceM: null }`;
    - `lat` hoặc `lng` không phải số hữu hạn → `no-location`;
    - khoảng cách > `radiusM` → `outside`; bằng `radiusM` vẫn là `ok`.

- [ ] **Step 1: Viết test hỏng** `test/v2/settings-domain.test.ts`

```ts
const NOW = new Date('2026-11-05T03:00:00Z');
const ZONE = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
const FAR = { lat: 10.78229593, lng: 106.7009 };   // 600 m về phía bắc

it('standard workdays follow days × 52 ÷ 12', () =>
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(standardWorkdaysForWeek), [4, 9, 13, 17, 22, 26]));
it('weekdays', () => {
  assert.deepEqual(validateWeekdays([5, 1, 3]), [1, 3, 5]);
  for (const v of [[], [0], [7], [1, 1], [1.5], 'x', null]) assert.throws(() => validateWeekdays(v), (e: any) => e.field === 'weekdays');
  assert.equal(isWorkday([1, 2, 3, 4, 5], '2026-12-12'), false);  // thứ Bảy
  assert.equal(isWorkday([1, 2, 3, 4, 5], '2026-12-11'), true);   // thứ Sáu
  assert.equal(isWorkday([1, 2, 3, 4, 5, 6], '2026-12-13'), false); // Chủ nhật
});
it('zone distance and punch check', () => {
  assert.equal(distanceM(ZONE, ZONE), 0);
  assert.equal(distanceM(ZONE, FAR), 600);
  assert.deepEqual(checkPunchLocation(null, {}), { kind: 'ok', distanceM: null });
  assert.deepEqual(checkPunchLocation(ZONE, FAR), { kind: 'outside', distanceM: 600 });
  assert.deepEqual(checkPunchLocation(ZONE, { lat: ZONE.lat, lng: ZONE.lng }), { kind: 'ok', distanceM: 0 });
  assert.deepEqual(checkPunchLocation(ZONE, { lat: 10.7769 }), { kind: 'no-location' });
  assert.deepEqual(checkPunchLocation(ZONE, { lat: null, lng: null }), { kind: 'no-location' });
  assert.equal(checkPunchLocation(ZONE, { lat: 0, lng: 0 }).kind, 'outside');
  assert.deepEqual(validateZone({ lat: 10.7769, lng: 106.7009, radiusM: 150 }), ZONE);
  for (const [v, f] of [[{ ...ZONE, radiusM: 19 }, 'radiusM'], [{ ...ZONE, radiusM: 5001 }, 'radiusM'], [{ ...ZONE, radiusM: 150.5 }, 'radiusM'],
    [{ ...ZONE, lat: 91 }, 'lat'], [{ ...ZONE, lng: '106' }, 'lng']] as const) assert.throws(() => validateZone(v), (e: any) => e.field === f);
});
it('pay date is payDay of the next month, kept on Sundays', () => {
  assert.equal(payDateOf('2026-11', 10), '2026-12-10');
  assert.equal(payDateOf('2026-12', 10), '2027-01-10');  // Chủ nhật, giữ nguyên
  assert.equal(payDateOf('2026-11', 5), '2026-12-05');
  assert.equal(payDateOf('2027-01', 28), '2027-02-28');
});
it('min month', () => {
  assert.equal(minMonthFrom(null, NOW), '2026-11');
  assert.equal(minMonthFrom('2026-10', NOW), '2026-11');
  assert.equal(minMonthFrom('2026-08', NOW), '2026-09');
  assert.equal(minMonthFrom('2026-12', NOW), '2027-01');
});
it('input pieces', () => {
  assert.equal(parseReason('  Theo QĐ  '), 'Theo QĐ');
  assert.equal(parseReason('   '), null);
  assert.throws(() => parseReason('x'.repeat(301)), (e: any) => e.field === 'reason');
  for (const v of [-1, 1.5, '0', undefined]) assert.throws(() => parseStamp(v), (e: any) => e.field === 'stamp');
  assert.throws(() => parseEffectiveMonth('2026-10', '2026-11'), (e: any) => e.field === 'effectiveMonth');
  assert.throws(() => parseMonth('2026-13', 'month'), (e: any) => e.field === 'month');
});
```

- [ ] **Step 2: Chạy, xác nhận hỏng** — `node --import tsx --test test/v2/settings-domain.test.ts` → FAIL.
- [ ] **Step 3: Viết 5 file domain.**
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `feat(settings): work week, zone, pay date and input helpers`

---

### Task 5: Repository và `SettingsReader`

**Files:**
- Create: `src/modules/settings/settings.repository.ts`, `src/modules/settings/settings-reader.ts`
- Test: `test/v2/settings-repository.pg.test.ts`

**Interfaces:**
- Consumes: `GroupKey`, `SETTING_GROUPS`, `encodeValues` / `decodeValues` (Task 3); `Zone`, `standardWorkdaysForWeek` (Task 4); `ChainVersion`, `Values`, `versionAt` (Task 1).
- Produces:
  ```ts
  type Q = Kysely<DB>;   // Transaction<DB> cũng dùng được
  export interface WriteMeta { actor: string; at: string }
  export interface ChangeRow { setting: string; field: string; subject: string | null; effectiveMonth: string | null; oldJson: string | null; newJson: string; reason: string | null }
  export interface StoredChange extends ChangeRow { id: number; changedBy: string; changedAt: string }   // changedAt ISO
  export interface StaffRef { uuid: string; username: string; type: string }

  @Injectable() export class SettingsRepository {
    constructor(@Inject(KYSELY_DB) readonly db: Kysely<DB>);
    groupChain(q: Q, g: GroupKey): Promise<ChainVersion[]>;                     // tháng tăng dần, values đã encode
    writeGroupVersion(q: Q, g: GroupKey, month: string, values: Values, meta: WriteMeta): Promise<void>;
    insertChanges(q: Q, rows: ChangeRow[], meta: WriteMeta): Promise<number[]>; // id theo thứ tự rows
    stampOf(q: Q, setting: string, subject: string | null): Promise<number>;     // 0 khi chưa có
    history(q: Q, setting: string, subject: string | null, limit?: number): Promise<StoredChange[]>;  // id giảm dần, mặc định 200
    maxChangeId(q: Q): Promise<number>;
    lastClosedMonth(q: Q): Promise<string | null>;                              // max(month) có status 'approved' hoặc 'paid'
    staffByUsername(q: Q, username: string): Promise<StaffRef | null>;
    staffByUuid(q: Q, uuid: string): Promise<StaffRef | null>;
    typeWeekAt(q: Q, typeCode: string, month: string): Promise<{ weekdays: number[]; workdays: number } | null>;
    workWeekChain(q: Q, uuid: string): Promise<ChainVersion[]>;                 // values { weekdays: JSON string | null }
    writeWorkWeek(q: Q, uuid: string, month: string, weekdays: string | null, meta: WriteMeta): Promise<void>;
    zone(q: Q): Promise<Zone | null>;
    saveZone(q: Q, zone: Zone, meta: WriteMeta): Promise<void>;
  }

  export interface SettingsSnapshot {
    overtime: { weekdayRate: number; weekendRate: number; holidayRate: number };
    attendance: { lateGraceMinutes: number; diligenceLostFromDays: number };
    kpiWeights: { wework: number; user: number; peer: number; manager: number; self: number };
    insurance: { bhxhPct: number; bhytPct: number; bhtnPct: number };
    tax: { personalDeduction: number; dependantDeduction: number; shortContractPct: number; shortContractThreshold: number; brackets: Bracket[] };
    payCalendar: { payDay: number };
  }
  export interface WorkWeek { weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; from: string | null; typeWeekdays: number[]; typeStandardWorkdays: number }

  @Injectable() export class SettingsReader {
    constructor(@Inject(SettingsRepository) repo: SettingsRepository);
    settingsFor(month: string, q?: Q): Promise<SettingsSnapshot>;
    workWeekOf(employeeUuid: string, month: string, q?: Q): Promise<WorkWeek>;  // nhân viên hoặc loại không có ở tháng đó → ném Error
    zone(q?: Q): Promise<Zone | null>;
  }
  ```
  - `writeGroupVersion` và `writeWorkWeek` là upsert theo khoá chính (`INSERT … ON CONFLICT … DO UPDATE`), và ghi đủ mọi cột.
  - Với `tax`, `writeGroupVersion` xoá các bậc của tháng đó rồi chèn lại theo `sort` 1..n.
  - `typeWeekAt` đọc `position_types.regular_dows` và `workdays` của phiên bản mới nhất có tháng ≤ `month`, chỉ giữ các thứ từ 1 đến 6.

- [ ] **Step 1: Viết test hỏng** `test/v2/settings-repository.pg.test.ts`. Trong DB tạm:
  - chèn staff `('nv-binh', type 'nv', uuid 'u-binh')` và `('tts-ha', type 'tts', uuid 'u-ha')`; các cột NOT NULL khác dùng giá trị giả;
  - dựng `reader = new SettingsReader(new SettingsRepository(db))`.

```ts
it('reads the seeded snapshot', async () => {
  assert.deepEqual(await reader.settingsFor('2026-11'), {
    overtime: { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 },
    attendance: { lateGraceMinutes: 15, diligenceLostFromDays: 3 },
    kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
    insurance: { bhxhPct: 8, bhytPct: 1.5, bhtnPct: 1 },
    tax: { personalDeduction: 15500000, dependantDeduction: 6200000, shortContractPct: 10, shortContractThreshold: 5000000,
      brackets: [{ upTo: 10000000, ratePct: 5 }, { upTo: 30000000, ratePct: 10 }, { upTo: 60000000, ratePct: 20 }, { upTo: 100000000, ratePct: 30 }, { upTo: null, ratePct: 35 }] },
    payCalendar: { payDay: 10 }
  });
});
it('picks the version in force for each month', async () => {
  await repo.writeGroupVersion(db, 'overtime', '2026-12', { weekdayRate: 1.6, weekendRate: 2, holidayRate: 3 }, META);
  await repo.writeGroupVersion(db, 'tax', '2027-01', { ...encodeValues(defaultsOf('tax')), brackets: JSON.stringify([{ upTo: 20000000, ratePct: 10 }, { upTo: null, ratePct: 20 }]) }, META);
  assert.equal((await reader.settingsFor('2026-11')).overtime.weekdayRate, 1.5);
  assert.equal((await reader.settingsFor('2026-12')).overtime.weekdayRate, 1.6);
  assert.equal((await reader.settingsFor('2027-05')).overtime.weekdayRate, 1.6);
  assert.equal((await reader.settingsFor('2026-12')).tax.brackets.length, 5);
  assert.deepEqual((await reader.settingsFor('2027-01')).tax.brackets, [{ upTo: 20000000, ratePct: 10 }, { upTo: null, ratePct: 20 }]);
});
it('work week falls back to the type and follows own versions', async () => {
  assert.deepEqual(await reader.workWeekOf('u-binh', '2026-12'),
    { weekdays: [1, 2, 3, 4, 5, 6], source: 'type', standardWorkdays: 26, from: null, typeWeekdays: [1, 2, 3, 4, 5, 6], typeStandardWorkdays: 26 });
  await repo.writeWorkWeek(db, 'u-binh', '2026-12', '[1,2,3,4,5]', META);
  await repo.writeWorkWeek(db, 'u-binh', '2027-03', null, META);
  assert.deepEqual(await reader.workWeekOf('u-binh', '2026-12'),
    { weekdays: [1, 2, 3, 4, 5], source: 'own', standardWorkdays: 22, from: '2026-12', typeWeekdays: [1, 2, 3, 4, 5, 6], typeStandardWorkdays: 26 });
  assert.equal((await reader.workWeekOf('u-binh', '2026-11')).source, 'type');
  assert.equal((await reader.workWeekOf('u-binh', '2027-02')).standardWorkdays, 22);
  assert.equal((await reader.workWeekOf('u-binh', '2027-03')).source, 'type');
  assert.deepEqual((await reader.workWeekOf('u-ha', '2026-12')).weekdays, [1, 2, 3, 4, 5]);
  assert.equal((await reader.workWeekOf('u-ha', '2026-12')).standardWorkdays, 22);
});
it('zone, closed month, change log and stamps', async () => {
  assert.equal(await reader.zone(), null);
  await repo.saveZone(db, { lat: 10.7769, lng: 106.7009, radiusM: 150 }, META);
  assert.deepEqual(await reader.zone(), { lat: 10.7769, lng: 106.7009, radiusM: 150 });
  assert.equal(await repo.lastClosedMonth(db), null);
  // chèn payroll_periods ('2026-09','paid'), ('2026-10','approved'), ('2026-11','calculated')
  assert.equal(await repo.lastClosedMonth(db), '2026-10');
  const ids = await repo.insertChanges(db, [change('overtime', null), change('work-week', 'u-binh'), change('overtime', null)], META);
  assert.equal(await repo.stampOf(db, 'overtime', null), ids[2]);
  assert.equal(await repo.stampOf(db, 'work-week', 'u-binh'), ids[1]);
  assert.equal(await repo.stampOf(db, 'work-week', 'u-ha'), 0);
  assert.deepEqual((await repo.history(db, 'overtime', null)).map(h => h.id), [ids[2], ids[0]]);
  assert.equal(await repo.maxChangeId(db), ids[2]);
});
```

- [ ] **Step 2: Chạy, xác nhận hỏng** — `PG_TEST_URL=… node --import tsx --test test/v2/settings-repository.pg.test.ts` → FAIL.
- [ ] **Step 3: Viết repository và reader.** `settingsFor` gọi `groupChain` cho 6 nhóm, lấy `versionAt(chain, month)` rồi `decodeValues`. Ánh xạ sang `SettingsSnapshot` theo `responseKey`.
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `feat(settings): settings repository and reader`
- [ ] **Step 6: Phối hợp.** Gửi một tin `SendMessage` tới phiên payslip-print (`local_cdac11a7-d8b0-4a22-a771-7b69a1435d84`): hệ số OT đọc từ `SettingsReader.settingsFor(month).overtime.{weekdayRate, weekendRate, holidayRate}` (`src/modules/settings`, nhánh `claude/settings-store-7d80cb`, commit vừa tạo). Không cần chờ trả lời.

---

### Task 6: Service — 6 nhóm số, lịch sử, ngày trả lương

**Files:**
- Create: `src/modules/settings/settings.service.ts`
- Test: `test/v2/settings-service.test.ts` (bộ nhớ giả), thêm một test vào `test/v2/settings-repository.pg.test.ts` (lưu đồng thời)

**Interfaces:**
- Consumes: Task 3–5.
- Produces:
  ```ts
  type Tx = Pick<TransactionCoordinator, 'run' | 'acquireAdvisoryLock'>;
  export interface HistoryItem { id: number; field: string; month: string | null; from: unknown; to: unknown; by: string; at: string; reason: string | null }
  @Injectable() export class SettingsService {
    constructor(@Inject(SettingsRepository) repo, @Inject(SettingsReader) reader, @Inject(TransactionCoordinator) tx: Tx);
    getAll(month: unknown, now?: Date): Promise<{ month: string; minMonth: string; groups: Record<string, GroupView> }>;
    saveGroup(group: unknown, body: unknown, actor: string, now?: Date): Promise<{ ok: true; effectiveMonth: string; changed: string[]; stamp: number }>;
    groupHistory(group: unknown): Promise<{ items: HistoryItem[] }>;
    payDays(year: unknown): Promise<{ year: number; items: Array<{ month: string; payDay: number; payDate: string }> }>;
  }
  // GroupView = { from, stamp, values, defaults, limits } (+ sum với kpiWeights), đúng ví dụ spec mục 5.1
  ```
- **Thuật toán `saveGroup`** (mọi bước trong một `tx.run`):
  1. Kiểm nhóm (`SettingsGroupNotFoundError`), `values`, `reason`, `stamp`.
  2. Khoá `settings:<group>`.
  3. `minMonth = minMonthFrom(lastClosedMonth, now)`, rồi `parseEffectiveMonth`.
  4. So `stampOf(group, null)` với `stamp` gửi lên; khác thì ném `SettingsStaleError(câu, stampHiệnTại)`.
  5. `planChange(chain, month, encodeValues(values))`. Kết quả `null` thì trả `changed: []` và giữ `stamp`.
  6. Ghi phiên bản tháng M bằng giá trị đầy đủ `{ ...cur.values, ...plan.set }`.
  7. Với mỗi `carry`, ghi lại phiên bản đó bằng `{ ...thatVersion.values, ...c.set }`.
  8. Thêm một `ChangeRow` cho mỗi ô trong `plan.set`:
     - `oldJson` = `JSON.stringify` của giá trị cũ đã decode, `newJson` cũng vậy;
     - `effectiveMonth` = M, `subject` = `null`.
  9. `stamp` trả về = id lớn nhất vừa chèn.

  `month` mặc định của `getAll` là `businessMonthText(now)`.

- [ ] **Step 1: Viết test hỏng** `test/v2/settings-service.test.ts`. Dùng `MemorySettings`:
  - có cùng các hàm public với `SettingsRepository`, bỏ qua tham số `q`;
  - có `lastClosed: string | null` và `changes: StoredChange[]`;
  - `SettingsReader` thật chạy trên `MemorySettings`;
  - `tx` giả gọi thẳng callback và ghi lại các khoá đã lấy;
  - `NOW = new Date('2026-11-05T03:00:00Z')`;
  - mỗi `it` dựng `mem` và `svc` mới (`beforeEach`), dùng chung cho cả Task 7;
  - helper `save(g, month, values, stamp)` gọi `svc.saveGroup(g, { effectiveMonth: month, values, stamp }, 'admin', NOW)`; `rejectsField(p, field)` chờ `SettingsInputError` có đúng `field`; `pick` bỏ `id`, `changedBy`, `changedAt`.

```ts
it('shows every group with defaults, limits, from and stamp', async () => {
  const view = await svc.getAll(undefined, NOW);
  assert.equal(view.month, '2026-11'); assert.equal(view.minMonth, '2026-11');
  assert.deepEqual(view.groups.overtime, { from: '2000-01', stamp: 0, values: OT_DEFAULTS, defaults: OT_DEFAULTS,
    limits: { weekdayRate: { min: 1.5, max: 5, step: 0.01 }, weekendRate: { min: 2, max: 5, step: 0.01 }, holidayRate: { min: 3, max: 5, step: 0.01 } } });
  assert.equal(view.groups.kpiWeights.sum, 100);
  assert.deepEqual(Object.keys(view.groups), ['overtime', 'attendance', 'kpiWeights', 'insurance', 'tax', 'payCalendar']);
  await rejectsField(svc.getAll('2026-13', NOW), 'month');
});
it('saves only changed cells from the chosen month (D1)', async () => {
  assert.deepEqual(await svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, reason: ' Theo QĐ ', stamp: 0 }, 'admin', NOW),
    { ok: true, effectiveMonth: '2026-12', changed: ['weekdayRate'], stamp: 1 });
  assert.equal((await svc.getAll('2026-11', NOW)).groups.overtime.values.weekdayRate, 1.5);
  assert.equal((await svc.getAll('2026-12', NOW)).groups.overtime.values.weekdayRate, 1.6);
  assert.deepEqual(pick(mem.changes[0]), { setting: 'overtime', field: 'weekdayRate', subject: null, effectiveMonth: '2026-12', oldJson: '1.5', newJson: '1.6', reason: 'Theo QĐ' });
});
it('carries a new value into later versions that still had the old one', async () => {
  await save('overtime', '2027-03', { holidayRate: 3.5 }, 0);
  await save('overtime', '2026-12', { holidayRate: 3.2, weekdayRate: 1.7 }, 1);
  const at = async (m: string) => (await svc.getAll(m, NOW)).groups.overtime.values;
  assert.deepEqual(await at('2027-02'), { weekdayRate: 1.7, weekendRate: 2, holidayRate: 3.2 });
  assert.deepEqual(await at('2027-03'), { weekdayRate: 1.7, weekendRate: 2, holidayRate: 3.5 });
  assert.equal(mem.changes.length, 3);   // carry không sinh dòng lịch sử
});
it('no-op, stale stamp, month floor, unknown group, bad input', async () => {
  assert.deepEqual(await save('overtime', '2026-11', { weekdayRate: 1.5 }, 0), { ok: true, effectiveMonth: '2026-11', changed: [], stamp: 0 });
  await save('overtime', '2026-11', { weekdayRate: 1.6 }, 0);
  await assert.rejects(save('overtime', '2026-11', { weekdayRate: 1.7 }, 0), (e: any) => e instanceof SettingsStaleError && e.stamp === 1);
  await rejectsField(save('overtime', '2026-10', { weekdayRate: 1.7 }, 1), 'effectiveMonth');
  mem.lastClosed = '2026-11';
  await rejectsField(save('overtime', '2026-11', { weekdayRate: 1.7 }, 1), 'effectiveMonth');
  await assert.rejects(save('bonus', '2026-12', { x: 1 }, 0), SettingsGroupNotFoundError);
  await rejectsField(save('overtime', '2026-12', { weekdayRate: 9 }, 1), 'weekdayRate');
  await rejectsField(svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, stamp: '1' }, 'admin', NOW), 'stamp');
});
it('undo is a save of the old value and shows newest first', async () => {
  await save('overtime', '2026-11', { weekdayRate: 1.6 }, 0);
  await save('overtime', '2026-11', { weekdayRate: 1.5 }, 1);
  const { items } = await svc.groupHistory('overtime');
  assert.deepEqual(items.map(i => [i.field, i.month, i.from, i.to, i.by]), [['weekdayRate', '2026-11', 1.6, 1.5, 'admin'], ['weekdayRate', '2026-11', 1.5, 1.6, 'admin']]);
});
it('tax history carries whole bracket arrays', async () => {
  const b = [{ upTo: 20000000, ratePct: 10 }, { upTo: null, ratePct: 20 }];
  await save('tax', '2027-01', { brackets: b }, 0);
  const [item] = (await svc.groupHistory('tax')).items;
  assert.equal(item.field, 'brackets'); assert.equal((item.from as unknown[]).length, 5); assert.deepEqual(item.to, b);
});
it('pay days for a year', async () => {
  await save('pay-calendar', '2026-11', { payDay: 5 }, 0);
  const { year, items } = await svc.payDays('2026');
  assert.equal(year, 2026); assert.equal(items.length, 12);
  assert.deepEqual(items[9], { month: '2026-10', payDay: 10, payDate: '2026-11-10' });
  assert.deepEqual(items[10], { month: '2026-11', payDay: 5, payDate: '2026-12-05' });
  assert.deepEqual(items[11], { month: '2026-12', payDay: 5, payDate: '2027-01-05' });
  await rejectsField(svc.payDays('abc'), 'year');
});
```

  Thêm vào `settings-repository.pg.test.ts` (Review Focus 5): dựng `SettingsService` thật với `TransactionCoordinator`, chạy hai lần lưu song song bằng `Promise.allSettled`:
  - lần 1: `('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, stamp: 0 })`;
  - lần 2: `('overtime', { effectiveMonth: '2027-01', values: { weekdayRate: 1.7 }, stamp: 0 })`.

  Kết quả mong đợi: đúng một `fulfilled`, một `rejected` là `SettingsStaleError`.

- [ ] **Step 2: Chạy, xác nhận hỏng** — `node --import tsx --test test/v2/settings-service.test.ts` → FAIL.
- [ ] **Step 3: Viết `SettingsService` (phần nhóm và ngày trả lương).** Với `payDays`, đọc chuỗi `pay-calendar` một lần rồi dùng `versionAt` cho từng tháng.
- [ ] **Step 4: Chạy lại test thường và test PG** → PASS.
- [ ] **Step 5: Commit** — `feat(settings): save pay setting groups with history and stamps`

---

### Task 7: Service — tuần làm việc riêng và vùng chấm công

**Files:**
- Modify: `src/modules/settings/settings.service.ts`
- Test: `test/v2/settings-service.test.ts`

**Interfaces:**
- Produces (thêm vào `SettingsService`):
  ```ts
  getWorkWeek(username: unknown, month: unknown, now?: Date): Promise<{ username: string; month: string; minMonth: string } & WorkWeek & { stamp: number }>;
  saveWorkWeek(username: unknown, body: unknown, actor: string, now?: Date): Promise<{ ok: true; weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; stamp: number }>;
  workWeekHistory(username: unknown): Promise<{ items: HistoryItem[] }>;
  getZone(): Promise<{ zone: Zone | null; stamp: number }>;
  saveZone(body: unknown, actor: string, now?: Date): Promise<{ ok: true; zone: Zone; stamp: number }>;
  zoneHistory(): Promise<{ items: HistoryItem[] }>;
  ```
- **Tuần riêng** (khoá `settings:work-week:<uuid>`, `stamp` theo `('work-week', uuid)`):
  - Chuỗi phiên bản của người đó được thêm một bản gốc ảo `{ month: '0000-00', values: { weekdays: null } }` ở đầu, để `planChange` chạy được khi người đó chưa có dòng nào.
  - Bản gốc ảo không bao giờ được ghi xuống DB.
  - `weekdays` đi qua chuỗi dưới dạng `JSON.stringify(mảng tăng dần)` hoặc `null`.
  - Dòng lịch sử: `setting 'work-week'`, `field 'weekdays'`, `subject` = uuid.
  - Phản hồi `saveWorkWeek` lấy từ `reader.workWeekOf(uuid, effectiveMonth)` sau khi ghi.
- **Vùng chấm công** (khoá `settings:attendance-zone`, `stamp` theo `('attendance-zone', null)`):
  - Vùng mới bằng vùng cũ thì trả `stamp` cũ và không ghi gì.
  - Có thay đổi thì ghi một dòng lịch sử: `field 'zone'`, `effectiveMonth null`, `oldJson` là vùng cũ hoặc `null`.

- [ ] **Step 1: Viết test hỏng** (thêm vào `settings-service.test.ts`; `MemorySettings` có staff Bình `nv`, Hà `tts`, Châu `ctv` và tuần của loại như seed):

```ts
it('own week from a month, then back to the type week (Review Focus 4)', async () => {
  const before = await svc.getWorkWeek('nv-binh', '2026-12', NOW);
  assert.deepEqual(before, { username: 'nv-binh', month: '2026-12', minMonth: '2026-11', weekdays: [1, 2, 3, 4, 5, 6], source: 'type',
    standardWorkdays: 26, from: null, typeWeekdays: [1, 2, 3, 4, 5, 6], typeStandardWorkdays: 26, stamp: 0 });
  assert.deepEqual(await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [5, 4, 3, 2, 1], reason: null, stamp: 0 }, 'admin', NOW),
    { ok: true, weekdays: [1, 2, 3, 4, 5], source: 'own', standardWorkdays: 22, stamp: 1 });
  assert.deepEqual(pick(mem.changes[0]), { setting: 'work-week', field: 'weekdays', subject: 'u-binh', effectiveMonth: '2026-12', oldJson: null, newJson: '[1,2,3,4,5]', reason: null });
  await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2027-03', weekdays: null, stamp: 1 }, 'admin', NOW);
  assert.equal((await svc.getWorkWeek('nv-binh', '2027-02', NOW)).standardWorkdays, 22);
  assert.equal((await svc.getWorkWeek('nv-binh', '2027-03', NOW)).source, 'type');
  const { items } = await svc.workWeekHistory('nv-binh');
  assert.deepEqual(items.map(i => [i.from, i.to]), [[[1, 2, 3, 4, 5], null], [null, [1, 2, 3, 4, 5]]]);
});
it('Châu on Mon/Wed/Fri gets 13 standard days', async () => {
  const r = await svc.saveWorkWeek('ctv-chau', { effectiveMonth: '2026-12', weekdays: [1, 3, 5], stamp: 0 }, 'admin', NOW);
  assert.equal(r.standardWorkdays, 13);
});
it('work week refusals and per-person stamps', async () => {
  assert.equal((await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: null, stamp: 0 }, 'admin', NOW)).stamp, 0);
  for (const w of [[], [0], [7]]) await rejectsField(svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: w, stamp: 0 }, 'admin', NOW), 'weekdays');
  await assert.rejects(svc.getWorkWeek('nobody', '2026-12', NOW), SettingsEmployeeNotFoundError);
  await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [1, 2, 3, 4, 5], stamp: 0 }, 'admin', NOW);
  assert.equal((await svc.getWorkWeek('tts-ha', '2026-12', NOW)).stamp, 0);
  await assert.rejects(svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [1, 2, 3], stamp: 0 }, 'admin', NOW), SettingsStaleError);
});
it('attendance zone', async () => {
  assert.deepEqual(await svc.getZone(), { zone: null, stamp: 0 });
  const zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
  assert.deepEqual(await svc.saveZone({ ...zone, reason: null, stamp: 0 }, 'admin', NOW), { ok: true, zone, stamp: 1 });
  assert.deepEqual(pick(mem.changes[0]), { setting: 'attendance-zone', field: 'zone', subject: null, effectiveMonth: null, oldJson: null,
    newJson: '{"lat":10.7769,"lng":106.7009,"radiusM":150}', reason: null });
  assert.equal((await svc.saveZone({ ...zone, stamp: 1 }, 'admin', NOW)).stamp, 1);
  await rejectsField(svc.saveZone({ ...zone, radiusM: 19, stamp: 1 }, 'admin', NOW), 'radiusM');
  await assert.rejects(svc.saveZone({ ...zone, radiusM: 200, stamp: 0 }, 'admin', NOW), SettingsStaleError);
  assert.deepEqual((await svc.zoneHistory()).items[0].to, zone);
});
```

- [ ] **Step 2: Chạy, xác nhận hỏng** → FAIL.
- [ ] **Step 3: Viết phần tuần riêng và vùng.**
- [ ] **Step 4: Chạy lại** `node --import tsx --test test/v2/settings-service.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(settings): per-person work week and attendance zone`

---

### Task 8: Controller, module, quyền truy cập

**Files:**
- Create: `src/modules/settings/settings.controller.ts`, `settings.module.ts`, `index.ts`
- Modify: `src/app.module.ts` (thêm `SettingsModule`), `test/v2/auth-access.test.ts` (thêm dòng vào `TABLE`)
- Test: `test/v2/settings-controller.test.ts`

**Interfaces:**
- Produces: `@Controller('api/v2/settings')`. Các handler khai báo **đúng thứ tự dưới đây**, để đường cụ thể đứng trước `:group`:

| Handler | Route | Quyền |
|---|---|---|
| `getAll` | `GET ''` (`?month`) | `config.read` |
| `payDays` | `GET 'pay-days'` (`?year`) | `config.read` |
| `getZone` | `GET 'attendance-zone'` | `config.read` |
| `saveZone` | `PUT 'attendance-zone'` | `config.write` |
| `zoneHistory` | `GET 'attendance-zone/history'` | `config.read` |
| `getWorkWeek` | `GET 'work-weeks/:username'` (`?month`) | `config.read` |
| `saveWorkWeek` | `PUT 'work-weeks/:username'` | `config.write` |
| `workWeekHistory` | `GET 'work-weeks/:username/history'` | `config.read` |
| `saveGroup` | `PUT ':group'` | `config.write` |
| `groupHistory` | `GET ':group/history'` | `config.read` |

  - Ánh xạ lỗi dùng hàm `run` như `PositionsController`:

    | Lỗi | HTTP |
    |---|---|
    | `SettingsInputError` | `400 { code: 'BAD_SETTINGS_INPUT', field }` |
    | `SettingsGroupNotFoundError` | `404 SETTINGS_GROUP_NOT_FOUND` |
    | `SettingsEmployeeNotFoundError` | `404 EMPLOYEE_NOT_FOUND` |
    | `SettingsStaleError` | `409 { code: 'SETTINGS_STALE', stamp }` |

    Lỗi khác đi tiếp.
  - Người lưu lấy từ `@CurrentUser() user: UserSession`, tức `user.username`.
  - `SettingsModule`: `providers: [SettingsRepository, SettingsReader, SettingsService]`, `controllers: [SettingsController]`, `exports: [SettingsReader]`.

- [ ] **Step 1: Viết test hỏng**
  - `settings-controller.test.ts`:
    - quyền từng handler đúng bảng trên;
    - thứ tự khai báo: `Object.getOwnPropertyNames(SettingsController.prototype)` có `saveZone` đứng trước `saveGroup` và `zoneHistory` đứng trước `groupHistory`;
    - mỗi lỗi ở bảng trên ra đúng `status` và `details` trên mọi handler, giống test cuối của `positions-service.test.ts`;
    - `saveGroup('overtime', body, user)` gọi service với `('overtime', body, 'admin')`.
  - `auth-access.test.ts`: thêm 10 dòng `[SettingsController, …]` theo bảng.
- [ ] **Step 2: Chạy, xác nhận hỏng** — `node --import tsx --test test/v2/settings-controller.test.ts test/v2/auth-access.test.ts` → FAIL.
- [ ] **Step 3: Viết controller, module, `index.ts`; đăng ký vào `AppModule`.**
- [ ] **Step 4: Chạy lại** → PASS.
- [ ] **Step 5: Commit** — `feat(settings): /api/v2/settings routes`

---

### Task 9: Chấm công — ân hạn đi trễ, vùng, ngày làm

**Files:**
- Create: `src/modules/attendance/attendance.errors.ts`
- Modify:
  - `src/modules/attendance/attendance.service.ts`, `attendance.repository.ts`, `attendance.module.ts`, `attendance.controller.ts`, `index.ts` (export lỗi);
  - `src/modules/attendance/domain/daily-timesheet.ts`;
  - `src/modules/me/me.controller.ts` (chỉ handler `punch`).
- Delete: `src/modules/attendance/domain/geofence-policy.ts`
- Test: `test/v2/attendance-settings.test.ts`, `test/v2/attendance-workday.pg.test.ts`; thêm test vào `test/v2/me-controller.test.ts`

**Interfaces:**
- Consumes: `SettingsReader` (`settingsFor`, `workWeekOf`, `zone`), `isWorkday`, `checkPunchLocation`, `DEFAULT_SHIFT`.
- Produces:
  ```ts
  // attendance.errors.ts
  export class PunchRefusedError extends Error {
    constructor(readonly code: 'NOT_A_WORKDAY' | 'NO_LOCATION' | 'OUTSIDE_ZONE', message: string, readonly details: Record<string, number> = {})
  }
  // daily-timesheet.ts
  export interface CalculateOptions { gracePeriodMinutes?: number; lateGraceMinutes?: number }   // lateGraceMinutes mặc định 15
  // attendance.repository.ts
  hasApprovedWorkOn(employeeId: string, date: string): Promise<boolean>;
  // attendance.service.ts
  constructor(repo, @Optional() txCoordinator?, @Optional() @Inject(SettingsReader) settings?: Pick<SettingsReader, 'settingsFor' | 'workWeekOf' | 'zone'>);
  recordPunch(input: RecordPunchInput, options?: { checkZone?: boolean }): Promise<RecordPunchResult>;
  workdayOf(employeeId: string, date: string): Promise<boolean>;   // có lịch || thứ thuộc tuần || hasApprovedWorkOn
  ```
- **`calculate`:** coi tham số thứ hai hoặc thứ ba là `CalculateOptions` khi đó là object thường (không phải `Date`, không phải `WorkSchedule`). Ngưỡng `diffInMin <= 15` đổi thành `diffInMin <= (options?.lateGraceMinutes ?? 15)`. Các mốc 15/30 khác giữ nguyên (Ruling R5).
- **`hasApprovedWorkOn` trả `true` khi có một trong ba loại đơn `APPROVED` của người đó:**
  - `OVERTIME` có `ot_date = date`;
  - `SHIFT_CHANGE` có `change_start_date ≤ date ≤ change_end_date`;
  - `makeup_slots.work_date = date`, thuộc đơn `LEAVE_WITH_MAKEUP`.
- **`recordPunch` khi có `settings`** (thứ tự này là luật, xem Rulings):
  1. `findSchedule`.
  2. Chưa có lịch, không có `shiftConfig`, `type === 'IN'`: nếu `!isWorkday(week.weekdays, workDate) && !hasApprovedWorkOn` thì ném `NOT_A_WORKDAY` ("Hôm nay không phải ngày làm của bạn").
  3. Nếu `options.checkZone`: `checkPunchLocation(await settings.zone(), { lat: input.latitude, lng: input.longitude })`.
     - `no-location` → ném `NO_LOCATION` ("Không lấy được vị trí").
     - `outside` → ném `OUTSIDE_ZONE` ("Bạn đang cách văn phòng {distanceM} m", `details { distanceM, radiusM }`).
  4. Tạo lịch mặc định, rồi ghi punch với `distanceMeters` = khoảng cách (0 khi `null`) và `isWithinOffice` = `true`.
  5. `calculate(punches, schedule, { lateGraceMinutes: (await settings.settingsFor(workDate.slice(0, 7))).attendance.lateGraceMinutes })`.

  `recalculateTimesheet` cũng truyền `lateGraceMinutes`.
- **Không có `settings`** (constructor cũ trong test): giữ hành vi hiện tại, không kiểm ngày làm, không kiểm vùng, ân hạn 15.
- **Bỏ `officeLocation`:** xoá `OfficeLocationInput` và trường `officeLocation` khỏi `RecordPunchInput`.
- **Fallback giờ ca:** `ensureDefaultSchedule` dùng `DEFAULT_SHIFT.startTime` / `endTime` thay cho `'08:00'` / `'17:00'`.
- **Ánh xạ lỗi ở controller:**
  - `me.controller.ts` `punch` gọi `recordPunch({...}, { checkZone: true })`. Gặp `PunchRefusedError` thì ném `BadRequestError(err.message, { code: err.code, ...err.details })`; lỗi khác giữ nguyên `asBadRequest(err, 'BAD_PUNCH_INPUT')`.
  - `attendance.controller.ts` `recordPunch` ánh xạ `PunchRefusedError` theo cùng cách, lỗi khác giữ `BAD_PUNCH_INPUT`.
- **Module:** `AttendanceModule` thêm `imports: [SettingsModule]`.

- [ ] **Step 1: Viết test hỏng** `test/v2/attendance-settings.test.ts`.
  - Repo giả kế thừa `AttendanceRepository` như `test/v2/attendance.test.ts`, thêm `approved: Set<string>` cho `hasApprovedWorkOn` và `saved` để đếm lịch đã ghi.
  - Reader giả trả `lateGraceMinutes` và `zone` theo biến, `workWeekOf` trả `weekdays` theo biến.
  - Mỗi `it` dựng repo và service mới; mặc định `grace = 15`, `zone = null`, `weekdays = [1, 2, 3, 4, 5, 6]` (04/11/2026 là thứ Tư).
  - `refused(p, code, message?, details?)` chờ `PunchRefusedError` có đúng `code`, và đúng `message` / `details` khi có truyền.

```ts
it('late grace comes from settings (12 min: VALID at 15, LATE at 10)', async () => {
  grace = 15; let r = await svc.recordPunch({ employeeId: 'e1', type: 'IN', workDate: '2026-11-04', punchedAt: new Date('2026-11-04T08:12:00Z') });
  assert.equal(r.timesheet.checkInStatus, 'VALID');
  grace = 10; r = await svc.recordPunch({ employeeId: 'e2', type: 'IN', workDate: '2026-11-04', punchedAt: new Date('2026-11-04T08:12:00Z') });
  assert.equal(r.timesheet.checkInStatus, 'LATE'); assert.equal(r.timesheet.metrics.lateMinutes, 12);
});
it('staff punches outside the zone or without a position are refused and leave nothing behind', async () => {
  zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
  await refused(svc.recordPunch({ employeeId: 'e3', type: 'IN', workDate: '2026-11-04', latitude: 10.78229593, longitude: 106.7009 }, { checkZone: true }),
    'OUTSIDE_ZONE', 'Bạn đang cách văn phòng 600 m', { distanceM: 600, radiusM: 150 });
  await refused(svc.recordPunch({ employeeId: 'e3', type: 'IN', workDate: '2026-11-04' }, { checkZone: true }), 'NO_LOCATION', 'Không lấy được vị trí', {});
  await refused(svc.recordPunch({ employeeId: 'e3', type: 'IN', workDate: '2026-11-04', latitude: 0, longitude: 0 }, { checkZone: true }), 'OUTSIDE_ZONE');
  assert.equal(repo.schedules.size, 0); assert.equal(repo.punches.length, 0);
  const ok = await svc.recordPunch({ employeeId: 'e3', type: 'IN', workDate: '2026-11-04', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
  assert.equal(ok.punch.isWithinOffice, true);
  await svc.recordPunch({ employeeId: 'e4', type: 'IN', workDate: '2026-11-04', latitude: 10.78229593, longitude: 106.7009 });  // Admin chấm thay: không kiểm vùng
  zone = null; await svc.recordPunch({ employeeId: 'e5', type: 'IN', workDate: '2026-11-04' }, { checkZone: true });
});
it('check-in on a day outside the week needs an approved request or a schedule', async () => {
  weekdays = [1, 2, 3, 4, 5]; zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
  await refused(svc.recordPunch({ employeeId: 'binh', type: 'IN', workDate: '2026-12-12', latitude: 10.78229593, longitude: 106.7009 }, { checkZone: true }),
    'NOT_A_WORKDAY', 'Hôm nay không phải ngày làm của bạn', {});        // NOT_A_WORKDAY đứng trước OUTSIDE_ZONE
  await refused(svc.recordPunch({ employeeId: 'binh', type: 'IN', workDate: '2026-12-12' }), 'NOT_A_WORKDAY');   // Admin chấm thay vẫn bị chặn
  assert.equal(await svc.workdayOf('binh', '2026-12-12'), false);
  repo.approved.add('binh:2026-12-12');
  assert.equal(await svc.workdayOf('binh', '2026-12-12'), true);
  await svc.recordPunch({ employeeId: 'binh', type: 'IN', workDate: '2026-12-12', latitude: 10.7769, longitude: 106.7009 }, { checkZone: true });
});
it('a night-shift check-out on an off day is not refused (Review Focus 2)', async () => {
  weekdays = [1, 2, 3, 4, 5]; zone = null;
  await svc.recordPunch({ employeeId: 'dem', type: 'OUT', workDate: '2026-12-12', punchedAt: new Date('2026-12-12T06:30:00Z') }, { checkZone: true });
});
it('calculate takes lateGraceMinutes as a plain options object', () => { /* DailyTimesheet.create(...).calculate(punches, schedule, { lateGraceMinutes: 10 }) → LATE ở 08:12 */ });
```

  Thêm vào `me-controller.test.ts`:
  - `att` giả có `recordPunch` ném `new PunchRefusedError('OUTSIDE_ZONE', 'Bạn đang cách văn phòng 600 m', { distanceM: 600, radiusM: 150 })`. Mong `e.status === 400` và `e.details` deepEqual `{ code: 'OUTSIDE_ZONE', distanceM: 600, radiusM: 150 }`.
  - Lần gọi thành công thì `att.calls.recordPunch[1]` deepEqual `{ checkZone: true }`.

  Thêm `test/v2/attendance-workday.pg.test.ts`. `hasApprovedWorkOn` trả `true` với:
  - `OVERTIME APPROVED` có `ot_date` khớp;
  - `SHIFT_CHANGE APPROVED` có khoảng ngày phủ ngày đó;
  - `makeup_slots` thuộc đơn `LEAVE_WITH_MAKEUP APPROVED`.

  Trả `false` với cùng các đơn đó ở `PENDING` / `REJECTED`, và với ngày ngoài khoảng.
- [ ] **Step 2: Chạy, xác nhận hỏng** — `node --import tsx --test test/v2/attendance-settings.test.ts test/v2/me-controller.test.ts` → FAIL.
- [ ] **Step 3: Viết phần chấm công**, xoá `geofence-policy.ts`.
- [ ] **Step 4: Chạy lại cùng test cũ của chấm công**
  Run: `node --import tsx --test test/v2/attendance-settings.test.ts test/v2/attendance.test.ts test/v2/business-today.test.ts test/v2/me-controller.test.ts test/v2/pg-date-columns.test.ts` và `PG_TEST_URL=… node --import tsx --test test/v2/attendance-workday.pg.test.ts`
  Expected: PASS.
- [ ] **Step 5: Ruling OUT.** Chỉ làm bước này nếu người dùng đã duyệt Ruling "`NOT_A_WORKDAY` chỉ chặn IN":
  - thêm vào spec mục 5.6, dưới bảng lỗi, dòng "`NOT_A_WORKDAY` chỉ áp cho chấm vào (`kind: IN`); chấm ra không bị chặn vì lý do này.";
  - commit cùng task;
  - nhắn phiên FE (`local_6d04087e-ad96-4b60-94ca-4eaefa1f926f`) commit mới.
- [ ] **Step 6: Commit** — `feat(attendance): late grace, zone and workday checks from settings`

---

### Task 10: Danh mục ca trả giờ, fallback giờ ca

**Files:**
- Modify: `src/modules/employees/employees.service.ts` (`getShiftsCatalog`, fallback dòng ~211/222), `src/modules/employees/employees.repository.ts` (fallback dòng ~88/91), `src/modules/employees/domain/employee-contract.ts` (dòng 51)
- Test: `test/v2/employees-shifts.test.ts`

**Interfaces:**
- Produces: `getShiftsCatalog()` trả mỗi dòng của `work_shifts` kèm `startTime` và `endTime`, lấy từ `shiftByCode(row.code)`. Mã không có trong danh mục thì cả hai là `null`.

- [ ] **Step 1: Viết test hỏng.** Dựng `EmployeesService` như `test/v2/employees.test.ts`, với repo giả có `listShiftCatalog` trả 3 dòng `Normal1`, `Night1`, `Old9`.
  ```ts
  assert.deepEqual(rows.map(r => [r.code, r.startTime, r.endTime]), [['Normal1', '08:00', '17:00'], ['Night1', '22:00', '07:00'], ['Old9', null, null]]);
  assert.equal(rows[0].preset, 'n1');   // giữ trường cũ
  ```
- [ ] **Step 2: Chạy, xác nhận hỏng.**
- [ ] **Step 3: Sửa `getShiftsCatalog` và 3 chỗ fallback** sang `DEFAULT_SHIFT`.
- [ ] **Step 4: Chạy** `node --import tsx --test test/v2/employees-shifts.test.ts test/v2/employees.test.ts test/v2/employees-account-security.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(employees): shift catalog returns fixed shift hours`

---

### Task 11 (cổng: `claude/staff-requests-e8fd71` đã vào `main`): Đơn từ theo tuần của từng người

**Files:**
- Modify: `src/modules/requests/domain/shift-frames.ts`, `src/modules/requests/requests.repository.ts` (`FALLBACK_SHIFT`), `src/modules/requests/requests.service.ts` (chỗ dùng `findStaffContext`), `src/modules/requests/requests.module.ts`
- Test: `test/v2/requests-work-week.test.ts`

**Interfaces:**
- Consumes: `SettingsReader.workWeekOf`, `SHIFT_CATALOG`, `DEFAULT_SHIFT`.
- Produces:
  - `SHIFT_FRAMES` dựng từ `SHIFT_CATALOG` (`{ shiftType, startTime, endTime }`), giữ nguyên thứ tự và chữ ký `findShiftFrame`.
  - `FALLBACK_SHIFT = { startTime: DEFAULT_SHIFT.startTime, endTime: DEFAULT_SHIFT.endTime }`.
  - Sau khi `findStaffContext` trả ngữ cảnh, service đặt `regularDows = (await settings.workWeekOf(ctx.employeeId, month)).weekdays`. `settings` là tham số constructor `@Optional()`: thiếu thì giữ `regularDows` từ `position_types`.
  - `RequestsModule` import `SettingsModule`.

- [ ] **Step 1: Đọc lại** `requests.service.ts`, `requests.repository.ts`, `domain/working-days.ts`, `domain/employee-days.ts` sau khi merge, để tìm mọi chỗ dùng `regularDows`.
- [ ] **Step 2: Viết test hỏng.** Bình (nv) có tuần riêng T2–T6. Đơn nghỉ phép 07/12–13/12/2026 đếm 5 ngày (không tính thứ Bảy 12/12). Không có tuần riêng thì đếm 6. Ngày lễ rơi vào thứ Bảy 12/12 không cộng ngày nghỉ cho Bình. `SHIFT_FRAMES` bằng 6 khung của `SHIFT_CATALOG`. Dựng service theo mẫu `test/v2/helpers/requests-fakes.ts`.
- [ ] **Step 3: Chạy, xác nhận hỏng.**
- [ ] **Step 4: Sửa.**
- [ ] **Step 5: Chạy** `node --import tsx --test test/v2/requests-*.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(requests): leave days follow each person's work week`

---

### Task 12 (cổng: nhánh của phiên staff-app — hôm nay là `claude/wire-staff-app-f5adca` và `claude/staff-app-leftovers` — đã vào `main`): App nhân viên

**Files:**
- Modify: `src/modules/me/domain/me-views.ts`, `src/modules/me/me.controller.ts` (`today`, `income`, các view tháng), `src/modules/me/me.module.ts`
- Test: `test/v2/me-domain.test.ts`, `test/v2/me-controller.test.ts`

**Interfaces:**
- Consumes: `SettingsReader.settingsFor`, `workWeekOf`, `zone`; `AttendanceService.workdayOf` (Task 9); `payDateOf`.
- Produces:
  - `daySummaryOf` và `monthOf` nhận thêm `weekdays: readonly number[]`. Một ngày đã qua, không có bảng công, thứ không thuộc `weekdays` thì là `off`, không phải `absent`.
  - `standardDays` lấy từ `workWeekOf(...).standardWorkdays`.
  - `GET /me/today` thêm:
    - `zone: await settings.zone()`;
    - `workday: await attendance.workdayOf(me.uuid, date)`.
  - `GET /me/income` thêm `payDate: payDateOf(m, (await settings.settingsFor(m)).payCalendar.payDay)` ở cả ba nhánh `official`, `estimate`, `unavailable`.
  - `MeController` nhận `SettingsReader` làm tham số constructor thứ năm; `MeModule` import `SettingsModule`.

- [ ] **Step 1: Đọc lại** `me-views.ts` và `me.controller.ts` sau khi merge.
- [ ] **Step 2: Viết test hỏng.**
  - Bình T2–T6: thứ Bảy 12/12/2026 không chấm công là `off`, thứ Sáu 11/12 không chấm công là `absent`.
  - `today` trả `zone` và `workday` từ fake.
  - `income?month=2026-11` có `payDate '2026-12-10'`.
- [ ] **Step 3: Chạy, xác nhận hỏng.**
- [ ] **Step 4: Sửa.**
- [ ] **Step 5: Chạy** `node --import tsx --test test/v2/me-domain.test.ts test/v2/me-controller.test.ts test/v2/fe-staff-phone-builders.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(me): per-person week, zone, workday and pay date in the staff app`

---

### Task 13 (cổng: `claude/payslip-print-1bf918` đã vào `main`): Tính lương đọc kho cài đặt

**Files:**
- Modify:
  - `src/modules/payroll/domain/kpi-pay.ts`, `personal-income-tax.ts`, `employee-payslip.ts`;
  - `src/modules/payroll/payroll.service.ts`, `payroll.repository.ts`, `payroll.module.ts`.
- Test: `test/v2/payroll-settings.test.ts`, cộng các test payroll hiện có.

**Interfaces:**
- Consumes: `SettingsReader.settingsFor`, `workWeekOf`; `SettingsRepository.maxChangeId`.
- Produces (hằng số cũ thành mặc định của tham số, để test thuần cũ không đổi):
  ```ts
  calculateKpiPay(input, cap, weights: Record<KpiComponent, number> = KPI_WEIGHTS): KpiPay;
  export interface TaxRules { personalDeduction: number; dependantDeduction: number; shortContractPct: number; shortContractThreshold: number; brackets: Bracket[] }
  export const DEFAULT_TAX_RULES: TaxRules;                       // đúng các hằng số hiện có
  progressiveTax(assessable: number, brackets: Bracket[] = DEFAULT_TAX_RULES.brackets): number;
  calculatePersonalIncomeTax(input: TaxInput, rules: TaxRules = DEFAULT_TAX_RULES): TaxResult;
  // EmployeePayslipProps thêm diligenceLostFromDays?: number; giữ chuyên cần khi absenceDays < (diligenceLostFromDays ?? 5)
  ```
- **Service:**
  - Lấy `settingsFor(month)` một lần cho cả kỳ.
  - Truyền vào: trọng số KPI; bảo hiểm (`bhxhPct / 100`...) thay cho `settings.insurance_rates`; luật thuế; `diligenceLostFromDays` (D15, mặc định thật là 3).
  - `standardWorkdays` lấy từ `workWeekOf(uuid, month)`.
  - Ngày lễ chỉ được trả khi rơi vào thứ thuộc `weekdays` của người đó.
- **Repository (`payroll_runs`):**
  - `params_json = JSON.stringify(snapshot)`;
  - `params_hash` = sha256 hex của `params_json` (`node:crypto`);
  - `params_rev = maxChangeId`.

  Bỏ hàm `parseInsuranceRates` và câu đọc `settings.insurance_rates`.

- [ ] **Step 1: Đọc lại** `payroll.service.ts` và `payroll.repository.ts` sau khi merge (payslip-print đã đổi phần OT; hệ số OT do phiên đó đọc từ `settings.overtime`, không sửa lại phần đó).
- [ ] **Step 2: Viết test hỏng** `payroll-settings.test.ts`:
  - **D3:** Bình nv bậc 2 (6.500.000), tuần riêng T2–T6, đi đủ 23 ngày tháng 12/2026 → công chuẩn 22, lương ngày 295.455, lương theo ngày công 6.795.455.
  - **D15:** nghỉ 3 ngày → mất chuyên cần với mặc định 3; nghỉ 2 ngày → còn.
  - **Trọng số KPI:** đổi `wework` 50 / `user` 14 → `weightedPct` đổi theo.
  - **Bảo hiểm:** BHXH 10% → khoản BHXH tăng tương ứng.
  - **Lễ:** lễ rơi vào thứ Bảy không được trả cho Bình T2–T6.
  - **`payroll_runs`:** `params_json` parse ra đúng bản chụp, `params_hash` là sha256 của chuỗi đó.
- [ ] **Step 3: Chạy, xác nhận hỏng.**
- [ ] **Step 4: Sửa.**
- [ ] **Step 5: Chạy** `node --import tsx --test test/v2/payroll*.test.ts` và `PG_TEST_URL=… node --import tsx --test test/v2/payroll-repository.pg.test.ts` → PASS.
- [ ] **Step 6: Commit** — `feat(payroll): read KPI, insurance, tax, diligence and standard days from settings`

---

### Task 14: Xác minh toàn nhánh

- [ ] **Step 1: Chạy toàn bộ test**
  Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55466/postgres npm test`
  Expected: mọi test pass, 0 fail. Test PG không bị skip (không có dòng "PG_TEST_URL chưa đặt").
- [ ] **Step 2: Kiểm không đụng `web/`** — `git diff --stat main...HEAD -- web` không có dòng nào.
- [ ] **Step 3: Xoá container** — `docker rm -f luong-test-pg-settings-store`.
- [ ] **Step 4: Báo cáo** theo CLAUDE.md mục 5:
  - lệnh đã chạy và kết quả thật;
  - task nào đã xong, task nào còn chờ cổng (11–13) và đang chờ nhánh nào;
  - route nào chưa có test trên PostgreSQL thật.
