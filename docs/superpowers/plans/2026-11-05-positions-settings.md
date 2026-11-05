# Nối màn Chế độ và Chức vụ & bậc vào BE v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin sửa được chức vụ, bậc và chế độ theo loại nhân sự, lưu theo tháng áp dụng vào BE v2; lương đọc 4 mức % từ bảng thay cho số ghi cứng.

**Architecture:** Module mới `src/modules/positions/` (controller → service → repository, logic thuần trong `domain/`). Service mở một transaction bằng `TransactionCoordinator`, khoá từng mã chức vụ, kiểm hết rồi mới ghi. Chuỗi phiên bản xử lý bằng một hàm thuần `planChange` (chép tiếp từng ô độc lập, P7). FE thay dịch vụ v1 bằng API mới; các builder thuần nằm ở `web/src/builders/api/` để test bằng `node:test`.

**Tech Stack:** NestJS + Kysely + PostgreSQL 16 (chạy bằng `tsx`), Vue 3 + Pinia, `node:test`, Playwright (chế độ dữ liệu giả).

**Spec:** `docs/superpowers/specs/2026-11-05-positions-settings-design.md` (luật P1–P9 ở mục 1).

## Global Constraints

- Không chạy `npm run typecheck` hay `npm run format:check` (prettier) ở bất kỳ bước nào.
- Lệnh xác minh: `npm test` ở gốc repo; test PG chạy trong container `postgres:16` dùng một lần với `PG_TEST_URL`; `npm run test:ui` trong `web/`.
- Không đổi `migrations/postgres/schema.sql` (ba bảng đã đủ cột).
- Không đọc `spec/` (tài liệu v1). Không chạy script nào của luong-app.
- Không in, commit hay dán giá trị bí mật. Không push, không merge.
- Commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mã lỗi API đúng chữ: `BAD_REQUEST` (kèm `field`), `POSITION_NOT_FOUND`, `LEVEL_NOT_FOUND`, `POSITION_STALE`, `LEVEL_STALE`.
- Đúng 6 khoá ô tick: `kpi`, `idorm`, `leaveAccount`, `isat`, `ot`, `makeup`.
- Giới hạn: tên 1–60 ký tự (sau khi bỏ khoảng trắng hai đầu); ngày công số nguyên 1–31; % từ 0 đến 100; lương số nguyên ≥ 0; KPI `null` hoặc số nguyên ≥ 0; lý do tối đa 300 ký tự.
- Tháng áp dụng ≥ tháng hiện tại theo giờ Việt Nam. Ô "Áp dụng từ tháng" có 6 tháng, bắt đầu từ `usePeriodStore().current` (không phải `.month`).
- Chữ cố định trên màn: ô ca đêm Nhân viên hiện `Theo từng người`; báo khi 409: `Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu`; dòng thay đổi dạng `Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người` (ô tick: `Bật → Tắt`).
- Số gieo (để so lương không đổi): `nv` Flex 20, đêm 40, đi lại 15, chuyên cần 25; `tts` và `ctv` Flex 10, đêm 30, đi lại 0, chuyên cần 0.

## Rulings

- Ruling: Thêm dữ liệu giả mới cho hai màn (`web/src/mock/positions.ts`) — hiện hai màn báo `mock_missing` mà `test:ui` chạy trên dữ liệu giả — rủi ro nếu sai: dạng dữ liệu giả phải theo kịp API.
- Ruling: Lưu ở chế độ giả không đổi dữ liệu, chỉ ghi lệnh gửi vào `globalThis.__mockPositionsWrites` — đủ để test kiểm thân lệnh — rủi ro nếu sai: ở bản demo, màn Chức vụ tải lại sau khi lưu vẫn hiện số cũ.
- Ruling: Bỏ việc sửa nhãn ca của `web/src/views/print/A4Payslip.vue` (spec mục 4 và 5.6) — luồng in (`services/payslip.ts`) còn gọi API v1 `/periods/...`, chưa có dòng ngày v2 để đọc — rủi ro nếu sai: khi nối luồng in, nhãn còn ghi cứng "Flex +20%" / "Night +40%".
- Ruling: Service kiểm hết mọi mục (404, 409) rồi mới ghi, trong một `TransactionCoordinator.run` — repository giả trong test cũng chứng minh được "một loại lỗi thì không loại nào lưu" — rủi ro nếu sai: rollback khi DB lỗi giữa lúc ghi chỉ do test PG chứng minh.
- Ruling: `canEdit` của màn Chức vụ đổi từ `config.payroll` (quyền v1) sang `config.write`; Admin giả thêm `config.write` — BE v2 không có `config.payroll`, Admin thật có `config.write` — rủi ro nếu sai: không đáng kể.
- Ruling: Các test lương có sẵn truyền `SEED_RATES` — phiếu lương giờ đọc mức từ dữ liệu, số kỳ vọng cũ giữ nguyên là bằng chứng lương không đổi — rủi ro nếu sai: test nào quên truyền sẽ ra 0 và fail (dễ thấy).
- Ruling: Không làm riêng luật "bậc chỉ có từ tháng sau thì bỏ các tháng trước" (spec 5.2) — màn chỉ xem tới tháng hiện tại và bậc không bị xoá, nên mọi bậc đang hiện đều đã có từ tháng hiện tại — rủi ro nếu sai: nếu thanh tháng cho xem tháng tương lai, BE trả 404 `LEVEL_NOT_FOUND`.
- Ruling: Sửa tại chỗ mà không gửi lý do thì giữ lý do cũ; tạo phiên bản mới không có lý do thì lưu `null` — spec chỉ nói "reason chỉ ghi vào dòng ở tháng M" — rủi ro nếu sai: Admin không xoá được lý do cũ.
- Ruling: Thẻ chức vụ ở màn Chức vụ chỉ hiện 6 quyền lợi mà màn Chế độ sửa; nhãn `leaveAccount` đổi "Quỹ phép" → "Nghỉ phép năm" — spec 5.2 "Màn chỉ hiện 6 ô đó" — rủi ro nếu sai: các cờ v1 khác (Khai nghỉ, Nghỉ được duyệt…) không còn hiện ở đâu.
- Ruling: Ghi ô tick bằng upsert trên `position_type_benefits` — mỗi phiên bản gieo đủ 14 dòng nhưng không có ràng buộc ép điều đó — rủi ro nếu sai: không đáng kể.
- Ruling: 403 khi thiếu quyền được chứng minh bằng bảng quyền trong `test/v2/auth-access.test.ts` (guard chung đọc `@RequireCap`) — rủi ro nếu sai: không đáng kể.
- Ruling: Lỗi ngoài 5 loại của module được ném tiếp, không đổi thành 400 như holidays — để lỗi DB đi qua `ApiExceptionFilter` (23505 → 409, còn lại 500) — rủi ro nếu sai: không đáng kể.

## Review Focus

1. **Lưu mà mọi ô bằng số cũ** (gọi API trực tiếp, hoặc 2 Admin cùng gõ một số): không ghi dòng nào, không tăng `rev`, vẫn trả `ok`. Test ở Task 3.
2. **Chép tiếp làm tăng `rev` của phiên bản sau**: Admin đang mở phiên bản tháng 12 rồi lưu với rev cũ thì nhận 409, không ghi đè số vừa chép. Test ở Task 3.
3. **Thêm bậc ở tháng trước một phiên bản đã có của cùng số bậc** (bậc 5 có từ 12/2026, thêm bậc ở 11/2026): số bậc hợp lệ là 5 và được nhận. Test ở Task 3.
4. **Số thập phân trong ô %**: gõ `12,5` được; gõ `100,5` bị chặn (ô dừng ở `100,`); ô ngày công bỏ dấu phẩy (`2,5` thành `25`). Test ở Task 9.
5. **Chỉ đổi ô tick**: dòng `position_types` của phiên bản đó vẫn tăng `rev` và ghi `updated_by`, `updated_at`. Test ở Task 2.

---

### Task 1: Logic thuần — chuỗi phiên bản và kiểm số

**Files:**
- Create: `src/modules/positions/domain/version-chain.ts`
- Create: `src/modules/positions/domain/position-input.ts`
- Create: `src/modules/positions/positions.errors.ts`
- Test: `test/v2/positions-domain.test.ts`

**Interfaces:**
- Produces (`version-chain.ts`):
  ```ts
  export type Values = Record<string, string | number | boolean | null>;
  export interface ChainVersion { month: string; values: Values }
  export interface ChainPlan {
    base: string;                                   // tháng của phiên bản cur (mới nhất ≤ M)
    mode: 'update' | 'insert';                      // cur.month === M ? sửa tại chỗ : chép cur sang tháng M
    set: Values;                                    // chỉ các ô đổi, số mới
    carry: Array<{ month: string; set: Values }>;   // phiên bản sau M (tăng dần) và các ô chúng nhận
  }
  export function versionAt<T extends { month: string }>(chain: readonly T[], month: string): T | null;
  export function planChange(chain: readonly ChainVersion[], month: string, changes: Values): ChainPlan | null;
  ```
  `planChange` ném `Error('no version in force')` khi không có `cur` (người gọi kiểm trước); trả `null` khi mọi ô bằng số của `cur`. So sánh bằng `===`. Thứ tự đầu vào của `chain` không quan trọng.
- Produces (`position-input.ts`):
  ```ts
  export const TYPE_CODES = ['tts', 'ctv', 'nv'] as const; export type TypeCode = (typeof TYPE_CODES)[number];
  export const BENEFIT_KEYS = ['kpi', 'idorm', 'leaveAccount', 'isat', 'ot', 'makeup'] as const;
  export interface SavePositionsInput { effectiveMonth: string; reason: string | null; items: Array<{ code: TypeCode; expectedRev: number; changes: Values }> }
  export interface SaveLevelInput { code: TypeCode; level: number; effectiveMonth: string; reason: string | null; expectedRev: number; changes: Values }
  export interface AddLevelInput { code: TypeCode; level: number; effectiveMonth: string; reason: string | null; values: { name: string; baseSalary: number; kpiMax: number | null; nightPct: number | null } }
  export function parseSavePositions(body: unknown, currentMonth: string): SavePositionsInput;
  export function parseSaveLevel(code: unknown, level: unknown, body: unknown, currentMonth: string): SaveLevelInput;
  export function parseAddLevel(code: unknown, body: unknown, currentMonth: string): AddLevelInput;
  ```
  `changes` của chức vụ được làm phẳng: `benefits.makeup` thành khoá `'benefit.makeup'`. Khoá ô của chức vụ: `name, workdays, flexPct, nightPct, travelPct, attendancePct`; của bậc: `name, baseSalary, kpiMax, nightPct`. `name` lưu bản đã bỏ khoảng trắng hai đầu. `reason` toàn khoảng trắng → `null`.
- Produces (`positions.errors.ts`): `PositionInputError(message, field)` với `readonly field: string`; `PositionNotFoundError`, `LevelNotFoundError`, `PositionStaleError`, `LevelStaleError` (đều `extends Error`, chỉ có message).

Kiểm số theo bảng spec 3.4, thêm: `nightPct` của `nv` bị từ chối khi khác `null` (chức vụ, sửa bậc, thêm bậc); `level` là số nguyên ≥ 1 (đường dẫn gửi chuỗi `'5'` thì đổi sang số); `expectedRev` là số nguyên ≥ 0; ô thêm bậc phải có đủ 4 khoá. Tên `field`: `effectiveMonth`, `reason`, `items`, `items[0].code`, `items[0].expectedRev`, `items[0].changes.flexPct`, `items[0].changes.benefits.makeup`, `code`, `level`, `expectedRev`, `changes.kpiMax`, `values.name`… Câu báo bằng tiếng Việt; tháng sai báo `Tháng áp dụng phải từ 11/2026 trở đi` (theo `currentMonth`).

- [ ] **Step 1: Viết test hỏng** trong `test/v2/positions-domain.test.ts`:

```ts
describe('planChange', () => {
  it('inserts a version for a month that has none', () => {
    assert.deepEqual(planChange([{ month: '2000-01', values: { a: 1, b: 2 } }], '2026-11', { a: 5, b: 2 }),
      { base: '2000-01', mode: 'insert', set: { a: 5 }, carry: [] });
  });
  it('updates in place when a version starts that month', () => {
    assert.equal(planChange([{ month: '2000-01', values: { a: 1 } }, { month: '2026-11', values: { a: 2 } }], '2026-11', { a: 3 })?.mode, 'update');
  });
  it('returns null when nothing changes', () => {
    assert.equal(planChange([{ month: '2000-01', values: { a: 1 } }], '2026-11', { a: 1 }), null);
  });
  it('carries each field until a version set its own value', () => {
    const chain = [
      { month: '2027-02', values: { a: 1, b: 1 } },
      { month: '2000-01', values: { a: 1, b: 1 } },
      { month: '2026-12', values: { a: 1, b: 9 } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { a: 2, b: 3 })?.carry,
      [{ month: '2026-12', set: { a: 2 } }, { month: '2027-02', set: { a: 2 } }]);
  });
  it('spec example: KPI 6.8M reaches the December version that kept the old KPI', () => {
    const chain = [
      { month: '2000-01', values: { baseSalary: 6_500_000, kpiMax: 6_500_000 } },
      { month: '2026-12', values: { baseSalary: 7_000_000, kpiMax: 6_500_000 } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { kpiMax: 6_800_000 }),
      { base: '2000-01', mode: 'insert', set: { kpiMax: 6_800_000 }, carry: [{ month: '2026-12', set: { kpiMax: 6_800_000 } }] });
  });
  it('carries a tick the same way', () => {
    const chain = [{ month: '2000-01', values: { 'benefit.makeup': true } }, { month: '2026-12', values: { 'benefit.makeup': true } }];
    assert.deepEqual(planChange(chain, '2026-11', { 'benefit.makeup': false })?.carry, [{ month: '2026-12', set: { 'benefit.makeup': false } }]);
  });
});
describe('versionAt', () => {
  it('picks the latest version not after the month', () => {
    const chain = [{ month: '2026-12' }, { month: '2000-01' }, { month: '2026-11' }];
    assert.equal(versionAt(chain, '2026-11')?.month, '2026-11');
    assert.equal(versionAt(chain, '1999-12'), null);
  });
});
```

Thêm `describe('parseSavePositions / parseSaveLevel / parseAddLevel')` với `currentMonth = '2026-11'`:
  - `parseSavePositions({ effectiveMonth: '2026-11', reason: '  ', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25, name: ' NV ', benefits: { makeup: false } } }] }, '2026-11')` deepEqual `{ effectiveMonth: '2026-11', reason: null, items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25, name: 'NV', 'benefit.makeup': false } }] }`.
  - `parseAddLevel('nv', { effectiveMonth: '2026-11', level: 5, values: { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null } }, '2026-11').level === 5`.
  - Bảng ca hỏng, mỗi dòng `[mô tả, () => parse…(…), field mong đợi]`, kiểm `assert.throws(fn, (e) => e instanceof PositionInputError && e.field === field)`:
    `effectiveMonth: '2026-10'` → `effectiveMonth` (và message khớp `/từ 11\/2026 trở đi/`); `'2026-13'` → `effectiveMonth`; `items: []` → `items`; hai mục cùng `nv` → `items[1].code`; `code: 'ql'` → `items[0].code`; thiếu `expectedRev` → `items[0].expectedRev`; `workdays: 0`, `32`, `1.5` → `items[0].changes.workdays`; `flexPct: -1`, `101`, `'20'` → `items[0].changes.flexPct`; `name: '  '` và `'x'.repeat(61)` → `items[0].changes.name`; `nightPct: 40` với `nv` → `items[0].changes.nightPct`; `foo: 1` → `items[0].changes.foo`; `benefits: { approvedLeave: true }` → `items[0].changes.benefits.approvedLeave`; `benefits: { kpi: 'yes' }` → `items[0].changes.benefits.kpi`; `reason: 'x'.repeat(301)` → `reason`; `parseSaveLevel('nv', '0', …)` → `level`; `parseSaveLevel('tts', '1', { …, changes: { baseSalary: 1.5 } })` → `changes.baseSalary`; `kpiMax: -1` → `changes.kpiMax`; `parseSaveLevel('nv', '1', { …, changes: { nightPct: 50 } })` → `changes.nightPct`; `parseAddLevel('nv', { …, values: { …, nightPct: 50 } })` → `values.nightPct`; thiếu `values.baseSalary` → `values.baseSalary`.

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/positions-domain.test.ts`
Expected: FAIL, không tìm thấy module `src/modules/positions/domain/version-chain`.

- [ ] **Step 3: Viết `version-chain.ts`, `position-input.ts`, `positions.errors.ts`** theo Interfaces.

`planChange`: `cur = versionAt(chain, M)`; `set` = các khoá của `changes` mà `changes[k] !== cur.values[k]`; rỗng thì `null`. `later` = các phiên bản có `month > M`, xếp tăng dần. Với mỗi khoá `k` của `set` (số cũ `o = cur.values[k]`): đi qua `later`, phiên bản nào có `values[k] === o` thì thêm `k: set[k]` vào mục `carry` của tháng đó; gặp phiên bản đầu tiên khác `o` thì dừng khoá đó. `carry` chỉ chứa tháng có ít nhất một ô, xếp tăng dần.

- [ ] **Step 4: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/positions-domain.test.ts`
Expected: PASS mọi test.

- [ ] **Step 5: Commit**

```bash
git add src/modules/positions test/v2/positions-domain.test.ts
git commit -m "feat(positions): version chain planner and input checks"
```

---

### Task 2: Repository ghi phiên bản và danh mục kèm ô tick

**Files:**
- Create: `src/modules/positions/positions.repository.ts`
- Modify: `src/modules/employees/employees.repository.ts:416-423` (`listPositionCatalog`)
- Test: `test/v2/positions-repository.pg.test.ts`

**Interfaces:**
- Consumes: `Values`, `ChainVersion` (Task 1); `DatabaseTransaction`, `TransactionCoordinator` từ `src/database/transaction.ts`.
- Produces:
  ```ts
  export interface StoredVersion extends ChainVersion { id: number; rev: number }
  export interface WriteMeta { actor: string; at: string; reason?: string | null }   // không có khoá reason = giữ lý do cũ
  @Injectable() export class PositionsRepository {          // không phụ thuộc gì trong constructor; mọi hàm nhận trx
    typeChain(trx: DatabaseTransaction, code: string): Promise<StoredVersion[]>;
    levelChain(trx: DatabaseTransaction, code: string, level: number): Promise<StoredVersion[]>;
    maxLevelAt(trx: DatabaseTransaction, code: string, month: string): Promise<number>;   // 0 khi chưa có bậc
    insertTypeFrom(trx, fromId: number, month: string, set: Values, meta: WriteMeta): Promise<number>;   // trả id mới
    updateType(trx, id: number, set: Values, meta: WriteMeta): Promise<void>;
    insertLevelFrom(trx, fromId: number, month: string, set: Values, meta: WriteMeta): Promise<number>;
    updateLevel(trx, id: number, set: Values, meta: WriteMeta): Promise<void>;
    insertLevel(trx, code: string, level: number, month: string, values: Values, meta: WriteMeta): Promise<number>;
  }
  ```
  - `typeChain` trả các phiên bản xếp tháng tăng dần; `values` gồm `name, workdays, flexPct, nightPct, travelPct, attendancePct` và `'benefit.<mã>'` (boolean) cho mọi dòng `position_type_benefits` của phiên bản. `levelChain`: `name, baseSalary, kpiMax, nightPct`.
  - Cột: `flexPct→flex_pct`, `nightPct→night_pct`, `travelPct→travel_pct`, `attendancePct→attendance_pct`, `baseSalary→base_salary`, `kpiMax→kpi_max`.
  - `insert*From` chép mọi cột của dòng `fromId` (kể cả `regular_dows`, `makeup_dows`), áp `set`, `rev = 0`, `reason = meta.reason ?? null`, `updated_by = meta.actor`, `updated_at = meta.at`. `insertTypeFrom` chép thêm mọi dòng ô tick của `fromId` sang id mới rồi áp các khoá `'benefit.*'` của `set`.
  - `update*` áp `set`, `rev = rev + 1`, ghi `updated_by`, `updated_at`; chỉ ghi `reason` khi `meta` có khoá `reason`. `updateType` vẫn tăng `rev` của dòng chức vụ khi `set` chỉ có ô tick. Ô tick ghi bằng upsert `(type_id, benefit)` → `enabled` 1/0.
  - `listPositionCatalog` thêm vào mỗi dòng chức vụ `benefits: Record<string, boolean>` đọc từ `position_type_benefits` theo `type_id = id`.

- [ ] **Step 1: Viết test PG hỏng** `test/v2/positions-repository.pg.test.ts`, theo khung của `test/v2/payroll-repository.pg.test.ts` (DB tạm, nạp `schema.sql`, `t.skip` khi thiếu `PG_TEST_URL`, xoá DB ở cuối). Dùng `const tx = new TransactionCoordinator(db)`, `const repo = new PositionsRepository()`, `meta = { actor: 'admin', at: '2026-11-05T03:00:00.000Z' }`. Các khẳng định:
  1. `insertTypeFrom(trx, 2, '2026-11', { flexPct: 25, 'benefit.makeup': false }, { ...meta, reason: 'Tăng Flex' })`: dòng mới có `code 'nv'`, `workdays 26`, `flex_pct 25`, `night_pct 40`, `travel_pct 15`, `attendance_pct 25`, `regular_dows '[1,2,3,4,5,6]'`, `rev 0`, `reason 'Tăng Flex'`, `updated_by 'admin'`; có đúng 14 dòng ô tick; `makeup` = 0, các ô còn lại bằng của id 2.
  2. `updateType(trx, newId, { 'benefit.ot': false }, { actor: 'b', at: meta.at })`: dòng chức vụ có `rev 1`, `updated_by 'b'`, `reason` vẫn `'Tăng Flex'`; ô `ot` = 0.
  3. `typeChain(trx, 'nv')` trả 2 phiên bản `['2000-01', '2026-11']`, phiên bản sau có `values.flexPct === 25`, `values['benefit.makeup'] === false`, `values['benefit.idorm'] === true`.
  4. Bậc: `maxLevelAt(trx, 'nv', '2026-11') === 4`; `insertLevel(trx, 'nv', 5, '2026-12', { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null }, meta)` rồi `maxLevelAt(…, '2026-11') === 4` và `maxLevelAt(…, '2026-12') === 5`; `insertLevelFrom` từ bậc 2 của nv sang `'2026-11'` với `{ kpiMax: 6_800_000 }` giữ `base_salary` cũ, `rev 0`; `updateLevel` tăng `rev` lên 1; `levelChain(trx, 'nv', 2)` trả hai tháng tăng dần.
  5. Rollback: `tx.run(async trx => { await repo.updateType(trx, 1, { flexPct: 30 }, meta); throw new Error('boom'); })` bị reject; dòng id 1 vẫn `flex_pct 10`, `rev 0`.
  6. `new EmployeesRepository(db).listPositionCatalog()`: mỗi dòng có `benefits` 14 khoá; dòng nv `'2026-11'` có `benefits.makeup === false`.

- [ ] **Step 2: Chạy, thấy hỏng** (cần container, xem Task 10 bước 1 để bật)

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres node --import tsx --test test/v2/positions-repository.pg.test.ts`
Expected: FAIL, không tìm thấy module `positions.repository`.

- [ ] **Step 3: Viết `PositionsRepository` và sửa `listPositionCatalog`** theo Interfaces. Mọi câu lệnh chạy trên `trx` được truyền vào.

- [ ] **Step 4: Chạy, thấy qua**

Run: lệnh ở Step 2.
Expected: PASS, không có dòng `# SKIP`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/positions/positions.repository.ts src/modules/employees/employees.repository.ts test/v2/positions-repository.pg.test.ts
git commit -m "feat(positions): repository writes versions and the catalog returns ticks"
```

---

### Task 3: Service, controller và đăng ký module

**Files:**
- Create: `src/modules/positions/positions.service.ts`, `positions.controller.ts`, `positions.module.ts`, `index.ts`
- Modify: `src/app.module.ts` (thêm `PositionsModule` vào `imports`)
- Modify: `test/v2/auth-access.test.ts` (import và 3 dòng trong `TABLE`)
- Test: `test/v2/positions-service.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parse*`, `planChange`, `versionAt`, lỗi), Task 2 (`PositionsRepository`, `StoredVersion`, `WriteMeta`).
- Produces:
  ```ts
  @Injectable() export class PositionsService {
    constructor(@Inject(PositionsRepository) repo: PositionsRepository,
                @Inject(TransactionCoordinator) tx: Pick<TransactionCoordinator, 'run' | 'acquireAdvisoryLock'>);
    savePositions(body: unknown, actor: string, now?: Date): Promise<{ ok: true; effectiveMonth: string }>;
    saveLevel(code: unknown, level: unknown, body: unknown, actor: string, now?: Date): Promise<{ ok: true; effectiveMonth: string }>;
    addLevel(code: unknown, body: unknown, actor: string, now?: Date): Promise<{ ok: true; effectiveMonth: string; level: number }>;
  }
  @Controller('api/v2/positions') @UseFilters(ApiExceptionFilter) export class PositionsController {
    @RequireCap('config.write') @Put() savePositions(@Body() body, @CurrentUser() user: UserSession);
    @RequireCap('config.write') @Put(':code/levels/:level') saveLevel(@Param('code') code, @Param('level') level, @Body() body, @CurrentUser() user);
    @RequireCap('config.write') @Post(':code/levels') addLevel(@Param('code') code, @Body() body, @CurrentUser() user);
  }
  ```
  - `now` mặc định `new Date()`; tháng hiện tại = `businessMonthText(now)`, `at = now.toISOString()`.
  - Trong `tx.run`: gọi `tx.acquireAdvisoryLock(trx, 'positions:<code>')` cho từng mã không trùng, xếp tăng dần (thao tác bậc khoá cùng khoá của chức vụ). Vòng 1 với mọi mục: đọc chuỗi, `versionAt` (không có → `PositionNotFoundError` / `LevelNotFoundError`), so `rev` (lệch → `PositionStaleError` / `LevelStaleError`), `planChange`. Vòng 2 mới ghi: `update` → `update*(cur.id, set, meta)`; `insert` → `insert*From(cur.id, M, set, meta)`; mỗi mục `carry` → `update*(id của tháng đó, set, { actor, at })`. `meta` của tháng M có `reason` khi tạo mới (null nếu không gửi) và khi sửa tại chỗ có gửi lý do.
  - `addLevel`: chức vụ phải có phiên bản ≤ M (không → `PositionNotFoundError`); `level !== maxLevelAt(M) + 1` → `LevelStaleError`; ghi `insertLevel(code, level, M, values, { actor, at, reason })`.
  - Controller bọc mọi lời gọi trong `run()`: `PositionInputError` → `BadRequestError(msg, { code: 'BAD_REQUEST', field })`; `PositionNotFoundError` → `NotFoundError(msg, { code: 'POSITION_NOT_FOUND' })`; `LevelNotFoundError` → `LEVEL_NOT_FOUND`; `PositionStaleError` → `ConflictError(msg, { code: 'POSITION_STALE' })`; `LevelStaleError` → `LEVEL_STALE`; lỗi khác ném tiếp.
  - `PositionsModule`: `controllers: [PositionsController]`, `providers: [PositionsService, PositionsRepository]`.

- [ ] **Step 1: Viết test hỏng** `test/v2/positions-service.test.ts`.

  Repository giả `MemoryPositions` giữ hai mảng dòng (chức vụ kèm ô tick, bậc) và cài đủ các hàm của Task 2 (bỏ qua `trx`), cùng một mảng `writes` ghi tên hàm đã gọi. `fakeTx = { locks: [] as string[], run: cb => cb({} as any), acquireAdvisoryLock: async (_t, key) => { fakeTx.locks.push(key) } }`. `NOW = new Date('2026-11-05T03:00:00.000Z')`. Dữ liệu đầu: nv `2000-01` rev 0 (số gieo, ô tick `makeup: true`), ctv `2000-01` rev 0; bậc nv 1–4 từ `2000-01`, bậc 2 lương 6.500.000, KPI 6.500.000.

  Các test (`it`):
  - `rejects a month before the current one and writes nothing`: `effectiveMonth '2026-10'` → reject `PositionInputError` có `field === 'effectiveMonth'`; `writes` rỗng.
  - `404 when no version is in force`: dữ liệu chỉ có nv từ `2027-01`, lưu ở `2026-11` → `PositionNotFoundError`.
  - `409 on a stale rev and nothing is written`.
  - `one stale item keeps every item unsaved`: items `[ctv rev 0 (đúng), nv rev 7 (lệch)]` → `PositionStaleError`; `writes` rỗng.
  - `locks codes in sorted order`: items `[nv, ctv]` → `fakeTx.locks` deepEqual `['positions:ctv', 'positions:nv']`.
  - `sends only changed fields`: `changes { flexPct: 20, travelPct: 16 }` cho nv → phiên bản mới ở `2026-11` có `travelPct 16`, lời ghi `insertTypeFrom` nhận `set` deepEqual `{ travelPct: 16 }`.
  - `a save that changes nothing writes nothing` (Review Focus 1): mọi ô bằng số cũ → trả `{ ok: true, effectiveMonth: '2026-11' }`, `writes` rỗng, rev nv vẫn 0.
  - `carrying bumps the later rev so a stale editor of that month gets 409` (Review Focus 2): đã có nv `2026-12` rev 0 với Flex 20; lưu Flex 25 từ `2026-11` → nv `2026-12` có Flex 25 và rev 1; lưu tiếp ở `2026-12` với `expectedRev 0` → `PositionStaleError`.
  - `spec example on levels`: lưu lương 7.000.000 bậc 2 nv từ `2026-12`, rồi KPI 6.800.000 từ `2026-11` → phiên bản `2026-12` có lương 7.000.000, KPI 6.800.000.
  - `reason goes only on the month row`: lưu có `reason 'Tăng Flex'` → dòng `2026-11` có lý do đó, dòng `2026-12` nhận chép tiếp giữ lý do cũ; sửa tại chỗ dòng `2026-11` không gửi lý do → vẫn `'Tăng Flex'`.
  - `addLevel needs the next level number`: `level 6` khi nv có 4 bậc → `LevelStaleError`; `level 5` → `{ ok: true, effectiveMonth: '2026-11', level: 5 }`.
  - `addLevel before a later version of the same level` (Review Focus 3): đã có bậc 5 nv từ `2026-12`; thêm `level 5` từ `2026-11` → được nhận, dòng mới ở `2026-11`.
  - `saveLevel 404 for a level that does not exist yet`: bậc 9 → `LevelNotFoundError`.
  - Controller: `new PositionsController(service giả ném lần lượt từng lỗi)`; mỗi lời gọi bị reject với lỗi có `status` và `details.code` đúng: 400 `BAD_REQUEST` (kèm `details.field === 'effectiveMonth'`), 404 `POSITION_NOT_FOUND`, 404 `LEVEL_NOT_FOUND`, 409 `POSITION_STALE`, 409 `LEVEL_STALE`; `new Error('db')` ném tiếp nguyên lỗi.

  Trong `test/v2/auth-access.test.ts` thêm `import { PositionsController } from '../../src/modules/positions/positions.controller';` và vào `TABLE`: `...['savePositions', 'saveLevel', 'addLevel'].map(m => [PositionsController, m, cap('config.write')] as [any, string, AccessRule])`.

  Trong `test/v2/positions-repository.pg.test.ts` thêm một test `PositionsService on PostgreSQL carries changes and rolls back` (DB tạm riêng, cùng khung), dùng `new PositionsService(new PositionsRepository(), new TransactionCoordinator(db))`, `NOW = 2026-11-05`:
  - lưu nv Flex 25 từ `2026-12` (`expectedRev 0`); rồi lưu nv `{ flexPct: 22, travelPct: 16 }` từ `2026-11` (`expectedRev 0`) → dòng nv `2026-11` có Flex 22, đi lại 16; dòng `2026-12` giữ Flex 25 (đã tự đặt) và nhận đi lại 16, `rev 1`.
  - lưu items `[ctv { flexPct: 12 } expectedRev 0, nv { flexPct: 30 } expectedRev 99]` từ `2026-11` → reject `PositionStaleError`; dòng ctv không có phiên bản `2026-11` nào.

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/positions-service.test.ts test/v2/auth-access.test.ts`
Expected: FAIL, không tìm thấy module `positions.service` / `positions.controller`.

- [ ] **Step 3: Viết service, controller, module, `index.ts`; thêm `PositionsModule` vào `src/app.module.ts`.**

- [ ] **Step 4: Chạy, thấy qua**

Run: `npm test`, rồi `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres node --import tsx --test test/v2/positions-repository.pg.test.ts`
Expected: PASS toàn bộ (gồm `table covers every handler`); test PG không `# SKIP`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/positions src/app.module.ts test/v2/positions-service.test.ts test/v2/auth-access.test.ts test/v2/positions-repository.pg.test.ts
git commit -m "feat(positions): PUT/POST position and level APIs with versioned saves"
```

---

### Task 4: Lương đọc 4 mức % từ phiên bản chức vụ

**Files:**
- Modify: `src/modules/payroll/domain/allowance-rates.ts`
- Modify: `src/modules/payroll/domain/employee-payslip.ts` (props dòng 40–60; khối phụ cấp dòng 314–334)
- Modify: `src/modules/payroll/payroll.repository.ts` (`EmployeeMonthlyRawData.staff` dòng 20–37; `mapMonthRows` dòng 123–150)
- Modify: `src/modules/payroll/payroll.service.ts:168-170` và chỗ dựng `EmployeePayslip` (~dòng 301–320)
- Modify (test): `test/v2/payroll-fixtures.ts`, `test/v2/payroll.test.ts`, `test/v2/payroll-month-rows.test.ts`, `test/v2/payroll-persistence.test.ts`, và test nào khác hỏng vì thiếu mức

**Interfaces:**
- Produces:
  ```ts
  export interface AllowanceRates { flexPct: number; typeNightPct: number; levelNightPct: number | null; travelPct: number; attendancePct: number }
  export class PayrollAllowancePolicy {
    constructor(employeeType: string | undefined, nightAllowancePct: number | undefined, rates: AllowanceRates | null | undefined);
    readonly isKnownType: boolean;   // rates != null
    readonly isNv: boolean;
    readonly flexRate: number; readonly nightRate: number; readonly travelRate: number; readonly attendanceRate: number;
    // flexPremium, nightPremium, nightBreakPay giữ nguyên
  }
  EmployeeMonthlyRawData.staff.allowanceRates: AllowanceRates | null;   // null = không có phiên bản chức vụ
  EmployeePayslipProps.allowanceRates?: AllowanceRates | null;          // không truyền = null
  // test/v2/payroll-fixtures.ts
  export const SEED_RATES: Record<'nv' | 'tts' | 'ctv', AllowanceRates>;
  ```
  - Mức: `flexRate = flexPct/100`; `nightRate` = NV: `nightAllowancePct === 60 ? 0.6 : 0.4`, loại khác: `(levelNightPct ?? typeNightPct)/100`; `travelRate = travelPct/100`; `attendanceRate = attendancePct/100`; `rates` null → mọi mức 0.
  - Phiếu: chuyên cần định mức = `round(base × attendanceRate)`, thực nhận khi `attendanceRate > 0` và vắng ≤ 4 ngày; đi lại định mức = `round(base × travelRate)`, thực nhận = 0 khi `isDormResident`. Bỏ điều kiện `rates.isNv` ở hai khoản này.
  - `mapMonthRows`: có `typeRow` → `{ flexPct: Number(flex_pct), typeNightPct: Number(night_pct), levelNightPct: numberOrNull(levelRow?.night_pct), travelPct: Number(travel_pct), attendancePct: Number(attendance_pct) }`; không có → `null`.
  - `SEED_RATES`: `nv { flexPct: 20, typeNightPct: 40, levelNightPct: null, travelPct: 15, attendancePct: 25 }`; `tts` và `ctv` `{ flexPct: 10, typeNightPct: 30, levelNightPct: null, travelPct: 0, attendancePct: 0 }`.

- [ ] **Step 1: Viết test hỏng.** Trong `test/v2/payroll.test.ts` cho `calculateLine` thêm tham số cuối `allowanceRates` (mặc định `SEED_RATES[employeeType]` khi có, còn lại `null`) và thêm:
  - `reads Flex from the position version`: `allowanceRates = { ...SEED_RATES.nv, flexPct: 25 }`, ca `FLEX` 8 giờ → `flexAllowancePay === 57_692`, nhãn ca `'Flex +25%'`.
  - `TTS night uses the level rate when it is set`: `{ ...SEED_RATES.tts, levelNightPct: 50 }`, ca `NIGHT` → `nightAllowancePay === 115_385`, nhãn `'Night +50%'`; `levelNightPct: null` → `69_231`.
  - `travel applies to any type with a rate and never to a dorm resident`: `makePayslip({ employeeType: 'tts', allowanceRates: { ...SEED_RATES.tts, travelPct: 15 }, dailyLines: 20 dòng NORMAL })` → `travelAllowanceActual === 692_308`; thêm `isDormResident: true` → `0`.
  - `no position version pays no allowance`: `makePayslip({ employeeType: 'nv', allowanceRates: null, … })` → `flexAllowancePolicy`, `nightAllowancePolicy`, `travelAllowancePolicy`, `attendanceAllowancePolicy`, `offPaidNightPolicy` đều 0.
  Trong `test/v2/payroll-month-rows.test.ts` thêm `passes the rates of the version in force`: dòng chức vụ `flex_pct 25, night_pct 30, travel_pct 0, attendance_pct 0`, bậc `night_pct 50` → `staff.allowanceRates` deepEqual `{ flexPct: 25, typeNightPct: 30, levelNightPct: 50, travelPct: 0, attendancePct: 0 }`; `rows({ type: null })` → `null`.

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/payroll.test.ts test/v2/payroll-month-rows.test.ts`
Expected: FAIL ở các test mới (ví dụ Flex ra 46_154 thay vì 57_692).

- [ ] **Step 3: Sửa code theo Interfaces;** `payroll.service.ts` truyền `staff.allowanceRates` vào cả `PayrollAllowancePolicy` và `EmployeePayslip`.

- [ ] **Step 4: Cho test cũ dùng số gieo.** Thêm `SEED_RATES` vào `test/v2/payroll-fixtures.ts`; `nvMonthData()` và mọi chỗ dựng `staff` hoặc `EmployeePayslip` có `employeeType` trong `nv/tts/ctv` truyền `allowanceRates: SEED_RATES[<loại>]`; loại lạ hoặc `undefined` truyền `null`. **Không sửa số kỳ vọng nào của test cũ**: số cũ giữ nguyên là bằng chứng lương với số gieo không đổi (Flex tts/ctv 11_538, nv 23_077, tối đa 46_154; đêm tts/ctv 69_231, nv 40% 92_308, nv 60% 138_462; đi lại 692_308; chuyên cần 1_153_846).

- [ ] **Step 5: Chạy, thấy qua**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/modules/payroll test/v2
git commit -m "feat(payroll): read Flex, night, travel and attendance rates from the position version"
```

---

### Task 5: Builder FE cho hai màn

**Files:**
- Modify: `web/src/builders/api/catalog.ts`
- Create: `web/src/builders/api/benefits.ts` (chỉ import tương đối, để `node:test` chạy được)
- Modify: `web/src/builders/api/staff.ts:36` (export `activeOn`)
- Modify: `web/src/builders/admin-catalog/positions.ts` (nhãn `leaveAccount: 'Nghỉ phép năm'`)
- Test: `test/v2/fe-api-builders.test.ts`

**Interfaces:**
- Produces (`catalog.ts`): export `type LevelRow`, `type TypeRow` (thêm `id: number`, `benefits?: Record<string, boolean>`), `export const BENEFIT_KEYS = ['kpi', 'idorm', 'leaveAccount', 'isat', 'ot', 'makeup']`, `export function inForce(...)`. `positionsResponseFromCatalog` trả `benefits: [...BENEFIT_KEYS]` và mỗi chức vụ `benefits: t.benefits || {}`.
- Produces (`benefits.ts`):
  ```ts
  export type BenefitCell = { key: string; label: string; kind: 'pct' | 'check' };
  export type BenefitType = { key: 'thuc-tap-sinh' | 'chuyen-trach' | 'nhan-vien'; code: 'tts' | 'ctv' | 'nv'; name: string; count: number;
    nightByPerson: boolean; values: Record<string, number | boolean>; req: Record<string, boolean> };
  export type BenefitsView = { columns: BenefitCell[]; requests: BenefitCell[]; types: BenefitType[] };
  export function benefitsViewFromCatalog(rows: TypeRow[], month: string, headcount: Record<string, number>): BenefitsView;
  export function benefitChanges(rows: TypeRow[], month: string, base: BenefitsView, draft: BenefitsView):
    { items: Array<{ code: string; expectedRev: number; changes: Record<string, unknown> }>; lines: string[] };
  export function mergeStale(oldBase: BenefitsView, draft: BenefitsView, fresh: BenefitsView): BenefitsView;
  export function headcountFromEmployees(list: EmployeeDTO[], today: string): Record<string, number>;
  ```
  - `columns` theo thứ tự: `travelPct 'Phụ cấp đi lại' pct`, `attendancePct 'Phụ cấp chuyên cần' pct`, `flexPct 'Phụ cấp Flex' pct`, `nightPct 'Phụ cấp ca đêm' pct`, `kpi 'Lương KPI' check`, `idorm 'iDorm' check`. `requests`: `leaveAccount 'Nghỉ phép năm'`, `isat 'iSAT'`, `ot 'OT'`, `makeup 'Làm bù'` (đều check).
  - `types` theo thứ tự `tts, ctv, nv`, `key` lần lượt `thuc-tap-sinh, chuyen-trach, nhan-vien`; `name` lấy từ dòng phiên bản; `nightByPerson = code === 'nv'`; ô tick thiếu = `false`.
  - `benefitChanges`: ô đã sửa = ô mà `draft` khác `base`; bỏ `nightPct` của nv. Với mỗi ô đã sửa, số cũ lấy từ phiên bản có hiệu lực ở `month`; bằng số mới thì bỏ. Ô % vào `changes[key]`, ô tick vào `changes.benefits[key]`. `expectedRev` = `rev` của phiên bản ở `month`. Chỉ loại có thay đổi mới có trong `items`. Dòng chữ: `${name} · ${label}: ${cũ} → ${mới} · ${count} người`; % viết `String(v).replace('.', ',') + '%'`; ô tick viết `Bật` / `Tắt`. Thứ tự dòng: theo loại, rồi theo `columns`, rồi `requests`.
  - `mergeStale`: ô nào `draft` khác `oldBase` thì giữ số của `draft`; còn lại lấy số của `fresh`.
  - `headcountFromEmployees`: đếm người `activeOn(e, today)` theo `contract.position.type`.

- [ ] **Step 1: Viết test hỏng** trong `test/v2/fe-api-builders.test.ts`, một `describe('Chế độ theo loại từ /employees/meta/positions')` với fixture `rows`: tts, ctv, nv phiên bản `2000-01` theo số gieo (nv `rev 3`, ô tick nv `makeup: true, idorm: true`), thêm nv `2026-12` Flex 25 `rev 0`; `headcount = { tts: 4, ctv: 3, nv: 12 }`.
  - `positionsResponseFromCatalog` (trong describe sẵn có): `res.benefits` deepEqual 6 khoá; `p.benefits.makeup === true` cho nv.
  - `builds one row per type`: `benefitsViewFromCatalog(rows, '2026-11', headcount)` → `types.map(t => [t.code, t.count])` deepEqual `[['tts', 4], ['ctv', 3], ['nv', 12]]`; nv `values.flexPct === 20`, `nightByPerson === true`; tts `nightByPerson === false`; `requests.map(r => r.label)` deepEqual `['Nghỉ phép năm', 'iSAT', 'OT', 'Làm bù']`.
  - `lists a change against the chosen month`: draft = base với nv Flex 25 → ở `'2026-11'`: `lines` deepEqual `['Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người']`, `items` deepEqual `[{ code: 'nv', expectedRev: 3, changes: { flexPct: 25 } }]`; ở `'2026-12'`: `lines` và `items` rỗng.
  - `lists a tick change`: nv `req.makeup = false` → dòng `'Nhân viên · Làm bù: Bật → Tắt · 12 người'`, `changes: { benefits: { makeup: false } }`.
  - `keeps edited cells when fresh numbers arrive`: `oldBase` nv Flex 20 đêm…; `draft` nv Flex 25; `fresh` nv Flex 22, đi lại 16 → kết quả nv Flex 25, đi lại 16.
  - `counts people still working by type`: hai `EmployeeDTO` loại `nv` đang làm, một `nv` `status 'nghiviec'`, một `tts` vào làm sau `today` → `{ nv: 2 }`.

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/fe-api-builders.test.ts`
Expected: FAIL, không tìm thấy module `web/src/builders/api/benefits`.

- [ ] **Step 3: Viết code theo Interfaces.**

- [ ] **Step 4: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/fe-api-builders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/builders test/v2/fe-api-builders.test.ts
git commit -m "feat(web): builders for the benefits screen and its change list"
```

---

### Task 6: Dịch vụ FE và dữ liệu giả

**Files:**
- Create: `web/src/mock/positions.ts`
- Modify: `web/src/services/admin-catalog.ts`
- Modify: `web/src/services/admin-config.ts` (khối "Chế độ theo loại nhân sự" dòng 78–112; bỏ `getAllowanceFlags` nếu không còn ai dùng)
- Modify: `web/src/services/admin-settings.ts` (re-export `benefitChangesAt`)
- Modify: `web/src/mock/accounts.ts` (`ADMIN_CAPS` thêm `'config.write'`)

**Interfaces:**
- Consumes: Task 5 (`TypeRow`, `positionsResponseFromCatalog`, `benefitsViewFromCatalog`, `benefitChanges`, `headcountFromEmployees`, `BenefitsView`).
- Produces:
  ```ts
  // mock/positions.ts
  export function mockCatalogRows(): TypeRow[];        // 3 loại theo số gieo + nv '2026-12' Flex 25 rev 0
  export const MOCK_HEADCOUNT: Record<string, number>;  // { tts: 4, ctv: 3, nv: 12 }
  export function mockWrite(method: string, path: string, body: any): { ok: true; effectiveMonth: string; level?: number };
  // admin-catalog.ts
  export function currentDate(): string;                // 'YYYY-MM-DD' giờ VN theo useSessionStore().serverNow, thiếu thì Date.now() (như today() ở admin-hr.ts)
  export function currentMonth(): string;               // currentDate().slice(0, 7); thay cho thisMonth() đang dùng Date.now()
  export function savePosition(input: { code: string; changes: Record<string, unknown>; effectiveMonth: string; reason: string; expectedRev: number }): Promise<unknown>;
  export function saveLevel(input: { type: string; level: number; adding: boolean; changes: Record<string, unknown>; effectiveMonth: string; reason: string; expectedRev?: number }): Promise<unknown>;
  // admin-config.ts
  export function getBenefits(): Promise<BenefitsView>;
  export function benefitChangesAt(month: string, draft: BenefitsView): { items: …; lines: string[] };
  export function saveBenefits(month: string, draft: BenefitsView, reason: string): Promise<void>;
  ```
  - `mockCatalogRows`: số và ô tick chép đúng từ các dòng gieo `position_types`, `position_type_benefits`, `position_levels` trong `migrations/postgres/schema.sql`; mỗi dòng chức vụ có `benefits` 14 khoá; `levels` gắn theo mã như `listPositionCatalog`.
  - `mockWrite` đẩy `{ method, path, body }` vào `globalThis.__mockPositionsWrites` (tạo mảng khi chưa có), không đổi dữ liệu.
  - `savePosition` → `PUT /positions` với `{ effectiveMonth, reason?, items: [{ code, expectedRev, changes }] }`. `saveLevel`: `adding` → `POST /positions/:type/levels` với `{ effectiveMonth, reason?, level, values: changes }`; còn lại → `PUT /positions/:type/levels/:level` với `{ effectiveMonth, reason?, expectedRev, changes }`. `reason` rỗng thì không gửi khoá đó.
  - `getBenefits`: đọc song song `GET /employees/meta/positions` và `GET /employees`; dựng bằng `benefitsViewFromCatalog(positions, currentMonth(), headcountFromEmployees(employees, currentDate()))` (hai hàm import từ `admin-catalog.ts`); giữ `rows` và bản `base` trong `state.benefits`. `benefitChangesAt` gọi `benefitChanges(state.rows, month, state.base, draft)`. `saveBenefits` gửi `PUT /positions` với `{ effectiveMonth: month, reason?, items }` rồi đặt `base = draft`.
  - Chế độ giả (`__MOCK__`): đọc `respond(mockCatalogRows())` và `MOCK_HEADCOUNT`; ghi qua `respond(mockWrite(...))`. Không còn lời gọi `/settings/params`, `/settings/params/preview`, `/staff` trong hai màn này; bỏ `headcountByType` và `previewBenefits`.

- [ ] **Step 1: Viết code theo Interfaces.** (Phần này không có test `node:test` riêng vì dịch vụ dùng alias `@/`; Task 9 kiểm nó qua giao diện.)

- [ ] **Step 2: Chạy test có sẵn để chắc không hỏng gì**

Run: `npm test` và `cd web && npm run test:ui`
Expected: `npm test` PASS. `test:ui` PASS trừ `tests/settings-search.spec.ts` nếu nó còn chờ `/settings/params` cho màn Chế độ; nếu hỏng vì lý do đó, sửa phần giả lập của spec đó cho khớp API mới (chỉ phần màn Chế độ), không sửa luật của màn khác.

- [ ] **Step 3: Commit**

```bash
git add web/src/mock web/src/services
git commit -m "feat(web): position and benefit services call the v2 positions API"
```

---

### Task 7: Chặn từ màn hình ở Chức vụ & bậc

**Files:**
- Modify: `web/src/views/admin/settings/fields/FieldNum.vue`
- Modify: `web/src/views/admin/settings/positions/PositionDialog.vue`
- Modify: `web/src/views/admin/settings/positions/LevelDialog.vue`
- Modify: `web/src/views/admin/settings/PositionsView.vue:3,16`

**Interfaces:**
- Consumes: Task 6 (`savePosition`, `saveLevel` có `adding`), `positionChanges`, `levelChanges`, `useSnapshots`, `isStale`.
- Produces: `FieldNum` thêm prop `max: { type: Number, default: null }` và `integer: { type: Boolean, default: false }`.

- [ ] **Step 1: `FieldNum`.** Khi `integer`: bỏ mọi dấu phẩy và dùng `inputmode="numeric"`. Khi `max` khác `null` và số vừa gõ lớn hơn `max`: trả ô về chữ đang hiện trước lần gõ đó, không phát `update:modelValue`. Ô tiền giữ như cũ.

- [ ] **Step 2: `PositionDialog`.**
  - `months = monthOptions(period.current)`.
  - Với `nv`: bỏ `nightPct` khỏi `FIELDS`; ô Phụ cấp Night hiện chữ `Theo từng người` thay cho `FieldNum`.
  - Ô ngày công `:max="31" integer`; ô % `:max="100"`; ô tên `:maxlength="60"`.
  - `cur` là ref nạp theo tháng (`watch(month, …, { immediate: true })` qua `snaps.at`). `changes = computed(() => cur.value ? positionChanges(<các ô FIELDS của cur>, { ...form, name: form.name.trim() }) : {})`. Nút Lưu bật khi: tên không trống, ngày công ≥ 1, không ô nào trống, `cur` đã nạp, `changes` có ít nhất một khoá, không đang lưu.
  - Bỏ hai thông báo "Chưa có thay đổi" và "Chức vụ này chưa có ở …".
  - Lỗi `isStale(e)`: báo `toast.error('Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu')`, `snaps.clear()`, nạp lại `cur`, `fill` các ô chưa sửa. Lỗi khác: `toast.error(e.message)`.

- [ ] **Step 3: `LevelDialog`.**
  - Tháng và `nv` giống Step 2: ô Phụ cấp đêm của bậc `nv` hiện `Theo từng người`; khi sửa bậc nv thì bỏ `nightPct` khỏi các ô so sánh; khi thêm bậc nv thì `nightPct` gửi `null`.
  - Ô % đêm `:max="100"`; ô tên `:maxlength="60"`.
  - Số bậc khi thêm = `Math.max(0, ...cur.levels.map(l => l.level)) + 1`.
  - Nút bật: thêm bậc → tên không trống và có lương; sửa bậc → thêm điều kiện `levelChanges(<bậc ở cur>, form)` có ít nhất một khoá và bậc có ở `cur`.
  - Gọi `saveLevel({ type, level, adding, changes, effectiveMonth, reason, expectedRev })`; thêm bậc gửi đủ 4 ô.
  - Bỏ các thông báo "Chưa có thay đổi", "… chưa có ở …"; bỏ nhánh `CATALOG_REV_REQUIRED`. 409 xử lý như Step 2.

- [ ] **Step 4: `PositionsView`.** `canEdit` đọc `'config.write'`; sửa chú thích dòng 3 cho khớp.

- [ ] **Step 5: Chạy test có sẵn**

Run: `cd web && npm run test:ui`
Expected: PASS (test của màn này viết ở Task 9).

- [ ] **Step 6: Commit**

```bash
git add web/src/views/admin/settings
git commit -m "feat(web): position and level dialogs only allow valid saves"
```

---

### Task 8: Màn Chế độ mỗi loại một dòng và hộp xác nhận

**Files:**
- Modify: `web/src/views/admin/settings/BenefitsView.vue`
- Create: `web/src/views/admin/settings/benefits/ConfirmDialog.vue`
- Delete: `web/src/views/admin/settings/benefits/AddAllowanceDialog.vue`, `ConfirmFlagsDialog.vue`, `PreviewDialog.vue`
- Modify: `web/src/views/admin/settings/fields/SaveBar.vue` (prop `saveLabel`)

**Interfaces:**
- Consumes: Task 5 (`BenefitsView`, `mergeStale`), Task 6 (`getBenefits`, `benefitChangesAt`, `saveBenefits`), `isStale` (`positions/useSnapshots.ts`), `monthOptions`, `REASON_MAX`.
- Produces: `ConfirmDialog` props `{ draft: BenefitsView, saving: boolean }`, emits `close`, `confirm(month: string, reason: string)`; `SaveBar` prop `saveLabel: { type: String, default: 'Xem trước và lưu' }`.

- [ ] **Step 1: `SaveBar`** hiện `saveLabel` ở nút lưu (các màn khác giữ chữ cũ).

- [ ] **Step 2: `ConfirmDialog`** (dùng `AppModal`, tiêu đề `Lưu chế độ`):
  - ô `Áp dụng từ tháng` (`SelectBox`, `monthOptions(period.current)`, mặc định tháng đầu);
  - danh sách `<ul>` từ `computed(() => benefitChangesAt(month.value, draft).lines)`; rỗng thì hiện `Không có thay đổi ở tháng này`;
  - ô `Lý do` (không bắt buộc, `TextBox area :maxlength="REASON_MAX"`);
  - nút `Lưu` tắt khi danh sách rỗng hoặc đang lưu; bấm thì `emit('confirm', month, reason.trim())`.

- [ ] **Step 3: `BenefitsView`.**
  - Bỏ import và mọi chỗ dùng `getAllowanceFlags`, `previewBenefits`, `PreviewDialog`, `AddAllowanceDialog`, `ConfirmFlagsDialog`, `useHop`, `canConfirm`, nút `Thêm chế độ`, bảng `Cờ thuế và bảo hiểm của khoản thêm`. Giữ thẻ loại và liên kết `Nhật ký`.
  - Bảng "Phụ cấp và lương KPI" và bảng "Được gửi yêu cầu": bỏ cột `Bậc`, mỗi bảng một dòng của `current`. Ô `nightPct` của loại có `nightByPerson` hiện chữ `Theo từng người`; các ô % là `FieldNum unit="%" :max="100" dim`.
  - Dòng phụ: `{{ current.name }} · {{ current.count }} người · tick hoặc gõ mức ngay trong ô, bấm Lưu để áp dụng`.
  - `SaveBar save-label="Lưu"`; `@save` mở `ConfirmDialog`.
  - `onConfirm(month, reason)`: gọi thẳng `saveBenefits(month, <bản sao draft>, reason)` trong `try` (không qua `form.save`, vì cần nhận lỗi 409). Thành công: gán `data.value = <bản sao draft>` để bản nháp thành bản đã lưu, đóng hộp. Lỗi `isStale(e)`: giữ bản sao `draft` cũ và bản đã tải cũ (`data.value`), `const fresh = await getBenefits()`, gán `data.value = fresh`, `await nextTick()` (watch của `useDraft` đặt lại bản nháp ở lượt này), rồi gán `draft.value = mergeStale(<bản đã tải cũ>, <draft cũ>, fresh)`; báo `toast.error('Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu')`; hộp xác nhận vẫn mở. Lỗi khác: đặt `form.error.value = e.message`, hộp vẫn mở. Cờ `saving` riêng của màn (ref) tắt nút trong lúc gửi.
  - Xoá ba file hộp cũ.

- [ ] **Step 4: Chạy test có sẵn**

Run: `cd web && npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A web/src/views/admin/settings
git commit -m "feat(web): one row per staff type and a confirm dialog on the benefits screen"
```

---

### Task 9: Test giao diện cho hai màn

**Files:**
- Create: `web/tests/settings-positions.spec.ts` (chạy trên dữ liệu giả, không `page.route`)

**Interfaces:**
- Consumes: dữ liệu giả Task 6 (tháng giả 10/2026, nv có phiên bản 12/2026 Flex 25, nv 4 bậc, `MOCK_HEADCOUNT`), `globalThis.__mockPositionsWrites`.

- [ ] **Step 1: Viết test**
  - `the benefits screen shows one row per type and only the six ticks`: vào `/admin/cai-dat/che-do/nhan-vien`; bảng đầu có đúng 1 dòng trong `tbody`; có chữ `Theo từng người`; không có tiêu đề cột `Bậc`, `Nghỉ được duyệt`; không có nút `Thêm chế độ`; không có tiêu đề `Cờ thuế và bảo hiểm của khoản thêm`; tiêu đề bảng hai đúng `['Nghỉ phép năm', 'iSAT', 'OT', 'Làm bù']`.
  - `Lưu stays off until a value really changes`: nút `Lưu` của thanh lưu tắt; gõ Flex `25` → bật; gõ lại `20` → tắt.
  - `the confirm dialog lists the change against the chosen month`: Flex `25` → bấm `Lưu` → hộp có dòng `Nhân viên · Phụ cấp Flex: 20% → 25% · 12 người`; ô tháng có 6 lựa chọn, đầu tiên `Tháng 10/2026`; chọn `Tháng 12/2026` → dòng biến mất, nút `Lưu` của hộp tắt; chọn lại `Tháng 10/2026` → bấm `Lưu` → `page.evaluate(() => globalThis.__mockPositionsWrites)` deepEqual `[{ method: 'PUT', path: '/positions', body: { effectiveMonth: '2026-10', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25 } }] } }]`.
  - `Sửa chức vụ starts at this month, shows NV night by person and blocks bad numbers` (Review Focus 4): vào `/admin/cai-dat/chuc-vu-bac`, bấm nút `Sửa chức vụ Nhân viên`; ô tháng có 6 lựa chọn, đầu tiên `Tháng 10/2026`; hộp có chữ `Theo từng người` và không có ô nhãn `Phụ cấp Night`; nút `Lưu` tắt; ô `Ngày công chuẩn` xoá rồi `pressSequentially('40')` → giá trị `4`, nút `Lưu` bật; xoá rồi `pressSequentially('2,5')` → `25`; ô `Phụ cấp Flex` xoá rồi `pressSequentially('12,5')` → `12,5`; xoá rồi `pressSequentially('100,5')` → `100,`.
  - `level dialogs keep a night field for TTS and add the next NV level`: mở `Sửa bậc 1 của Thực tập sinh` → có ô nhãn `Phụ cấp đêm`; đóng; bấm `Thêm bậc` ở thẻ Nhân viên → có chữ `Theo từng người`, nút `Thêm bậc` trong hộp tắt; gõ tên `Bậc 5`, lương `9000000` → bật; bấm → `__mockPositionsWrites` có `{ method: 'POST', path: '/positions/nv/levels', body: { effectiveMonth: '2026-10', level: 5, values: { name: 'Bậc 5', baseSalary: 9000000, kpiMax: null, nightPct: null } } }`.

- [ ] **Step 2: Chạy**

Run: `cd web && npx playwright test tests/settings-positions.spec.ts`
Expected: PASS cả 5 test. Test nào hỏng vì code của Task 6–8 thì sửa code (không nới test), theo `superpowers:systematic-debugging`.

- [ ] **Step 3: Commit**

```bash
git add web/tests/settings-positions.spec.ts
git commit -m "test(web): benefits and positions screens in mock mode"
```

---

### Task 10: Xác minh toàn nhánh

- [ ] **Step 1: Bật PostgreSQL dùng một lần**

Run: `docker run -d --rm --name luong-test-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55432:5432 postgres:16`
Expected: in ra id container; `docker exec luong-test-pg pg_isready` trả `accepting connections`.

- [ ] **Step 2: Chạy BE kèm test PG**

Run: `PG_TEST_URL=postgres://postgres@127.0.0.1:55432/postgres npm test`
Expected: `# fail 0`; `positions-repository.pg.test.ts` và `payroll-repository.pg.test.ts` chạy thật (không `# SKIP`). So với nền trước khi làm: 410 pass, 2 skip (hai test PG skip vì chưa đặt `PG_TEST_URL`).

- [ ] **Step 3: Tắt container**

Run: `docker rm -f luong-test-pg`

- [ ] **Step 4: Chạy test giao diện**

Run: `cd web && npm run test:ui`
Expected: không test nào fail. Nền trước khi làm: 253 pass, 15 skip.

- [ ] **Step 5: Ghi kết quả** (lệnh đã chạy, số pass/fail/skip thật, những gì chưa kiểm: ô ca đêm 40/60 và iDorm của từng người nằm ngoài phạm vi; phiếu in A4 chưa đổi nhãn theo Ruling) vào báo cáo cuối.
