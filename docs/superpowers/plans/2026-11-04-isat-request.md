# Đơn iSAT (BE v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm loại đơn `ISAT` vào module requests của BE v2: nộp form iSAT, admin đọc lại đủ trường, duyệt thì ghi lịch Thứ Bảy và phiếu lương tính ngày iSAT.

**Architecture:** Domain mới `IsatRegistration` (value object, tự kiểm form và giữ bản chụp hồ sơ + điều kiện) gắn vào `SystemRequest`. Dữ liệu form ở bảng `isat_registrations` và bảng con `isat_registration_conditions`, ghi cùng giao dịch với `system_requests`. Duyệt gọi `WorkSchedule.withIsat`; payroll đọc ngày iSAT đã duyệt thành `isatDates` và thêm dòng `ISAT` (domain phiếu lương đã có sẵn phần tính).

**Tech Stack:** NestJS 10, Kysely 0.29 (PostgresDialect), PostgreSQL 16, `node:test` chạy qua `tsx`.

**Spec:** [docs/superpowers/specs/2026-11-04-isat-request-design.md](../specs/2026-11-04-isat-request-design.md) — đọc trước, spec là căn cứ cao nhất.

## Global Constraints

- Làm trong worktree hiện tại (nhánh `claude/focused-saha-e55d49`, tách từ `feat/pure-v2-backend` tại `31e947b`).
- Không đọc thư mục `spec/`. Không đọc `.env`, không lấy thông tin đăng nhập DB.
- Không áp migration lên DB nào. Không push.
- Không sửa file trong `src/modules/employees/` (phiên khác đang sửa).
- Xác minh chỉ bằng `npm test` (= `node --import tsx --test "test/v2/**/*.test.ts"`). Không chạy typecheck, không chạy prettier.
- Viết mã giống mã xung quanh: 2 dấu cách, nháy đơn, có dấu chấm phẩy, mật độ chú thích như file đang sửa.
- Câu chữ cố định (chép nguyên văn):
  - Mã/nội dung điều kiện: `NO_VIOLATION` "Không vi phạm Nội quy lao động hoặc các quy định của Công ty trong kỳ xét duyệt"; `REPORTS_DONE` "Thực hiện đầy đủ các báo cáo"; `WORK_COMPLETED` "Hoàn thành công việc được giao theo kế hoạch"; `OFFICIAL_EMPLOYEE` "Là nhân viên chính thức".
  - `title` = `Đăng ký iSAT Thứ Bảy DD/MM/YYYY`; `reason` = `Tự đánh giá đạt N/T điều kiện`; `reviewNote` khi chưa đạt = `Tự đánh giá chưa đạt T/T (đạt N/T)` (N = số đạt, T = tổng điều kiện, hiện là 4).
  - Lỗi quyền lợi: `iSAT chỉ áp dụng cho nhóm Nhân viên`. Lỗi trùng: `Đã có đơn iSAT cho Thứ Bảy DD/MM/YYYY`. Không thấy hồ sơ: `Không tìm thấy nhân sự: <id>`.
  - Lỗi form: `saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD, nhận: <giá trị>`; `team (Bộ phận / Team) không được để trống`; `conditions phải là object {mã: true|false}`; `Mã điều kiện iSAT không hợp lệ: <mã>`; `Giá trị điều kiện <mã> phải là true, false hoặc null`.
- Cột `DATE` đọc ra luôn qua `sql<string>\`to_char(${sql.ref('<bảng>.saturday')}, 'YYYY-MM-DD')\`` (pg trả `DATE` thành `Date` theo múi giờ máy, lệch ngày ở UTC+7). Riêng module payroll (Task 4) theo quy ước sẵn có của nó: chọn cột thô rồi đổi bằng `dateText` trong `mapMonthRows`.

## Rulings (lead, ghi kèm vào ledger PROGRAM.md ở Task 4)

- Ruling: đọc `isat_registrations` bằng truy vấn `request_id IN (…)` riêng thay vì left join như spec §5 — cùng kết quả, không phải viết lại bộ lọc/sắp xếp/phân trang đang có của `list` — rủi ro nếu sai: thêm một truy vấn mỗi trang có đơn ISAT.
- Ruling: hồ sơ cho đơn iSAT đọc bằng `RequestsRepository.findIsatProfile` (3 truy vấn nhỏ: staff, position_levels, position_types+benefits) — không đụng module employees đang có phiên khác sửa — rủi ro nếu sai: logic tra hồ sơ lặp với employees.
- Ruling: lỗi của đơn ISAT viết tiếng Việt (các loại đơn cũ dùng tiếng Anh) — người nộp đọc trực tiếp — rủi ro nếu sai: ngôn ngữ lỗi không đồng nhất giữa các loại đơn.
- Ruling: merge `feat/pure-v2-backend` 92dca91 vào nhánh (a3858fa) trước Task 2; migration đổi số thành `0004` (số `0003` đã là `0003_payroll_rules.sql`); Task 4 viết lại trên payroll mới (`mapMonthRows`/`dateText` thay cho `to_char`) — tránh trùng số migration và xung đột khi tích hợp — rủi ro nếu sai: một merge commit trong lịch sử nhánh.

## Review Focus

1. Trang danh sách không có đơn ISAT nào → không được chạy `where request_id in ()` (SQL lỗi); đọc như cũ. Test ở Task 2.
2. pg trả cột `DATE` thành `Date` → `saturday` lệch một ngày, chặn trùng và payroll so khớp sai. Test SQL có `to_char` ở Task 2; Task 4 test `mapMonthRows` đổi `Date` giờ địa phương thành đúng ngày.
3. Duyệt đơn gọi `save` lần hai → chèn lại `isat_registrations`/điều kiện không được lỗi khoá chính (`on conflict do nothing`). Test ở Task 2.
4. Gửi `employeeId` là username → đơn lưu và chặn trùng theo **uuid**. Test ở Task 3.
5. `conditions` sai kiểu (mảng, chuỗi, số, giá trị `"true"`) → 400 có thông báo, không văng lỗi lạ. Test ở Task 1.

---

### Task 0: Môi trường

**Files:** không đổi file mã.

- [ ] **Step 1: Cài phụ thuộc theo lockfile**

Run: `npm ci` (trong thư mục worktree)
Expected: thoát mã 0, có `node_modules/kysely/package.json` bản `0.29.7`.

- [ ] **Step 2: Chạy mốc test**

Run: `npm test`
Expected: ghi lại số test pass/fail làm mốc. Nếu có test đỏ sẵn, ghi tên vào báo cáo, không sửa.

---

### Task 1: Domain `IsatRegistration` + `SystemRequest.createIsatRequest`

**Files:**
- Create: `src/modules/requests/domain/isat.ts`
- Modify: `src/modules/requests/domain/types.ts`, `src/modules/requests/domain/system-request.ts`, `src/modules/requests/domain/index.ts`
- Test: `test/v2/requests-isat-domain.test.ts`

**Interfaces:**
- Produces (`isat.ts`):
  - `type IsatConditionCode = 'NO_VIOLATION' | 'REPORTS_DONE' | 'WORK_COMPLETED' | 'OFFICIAL_EMPLOYEE'`
  - `const ISAT_CONDITIONS: ReadonlyArray<{ readonly code: IsatConditionCode; readonly label: string }>` (thứ tự như bảng ở Global Constraints)
  - `interface IsatCondition { code: string; label: string; passed: boolean }`
  - `interface IsatProfileSnapshot { fullName: string; positionType: string; positionLevel: number; levelName: string | null; shiftType: string; shiftStartTime: string; shiftEndTime: string }`
  - `interface IsatRegistrationRow { request_id: string; saturday: string; full_name: string; team: string; position_type: string; position_level: number; level_name: string | null; shift_type: string; shift_start_time: string; shift_end_time: string }`
  - `interface IsatConditionRow { request_id: string; sort_order: number; code: string; label: string; passed: boolean }`
  - `interface IsatRegistrationDTO { saturday: string; fullName: string; team: string; positionType: string; positionLevel: number; levelName: string | null; shift: { type: string; startTime: string; endTime: string }; conditions: IsatCondition[]; passedCount: number; totalCount: number }`
  - `class IsatRegistration` — trường `readonly` theo `IsatRegistrationDTO` (ca tách `shiftType/shiftStartTime/shiftEndTime`), `conditions: ReadonlyArray<IsatCondition>`; getter `passedCount`, `totalCount`, `allPassed` (`passedCount === totalCount`); `static assess(input: { saturday: unknown; team: unknown; conditions: unknown; profile: IsatProfileSnapshot }): IsatRegistration`; `static fromRows(row: IsatRegistrationRow, conditionRows: IsatConditionRow[]): IsatRegistration` (sắp theo `sort_order`); `toRow(requestId: string): IsatRegistrationRow`; `toConditionRows(requestId: string): IsatConditionRow[]` (`sort_order` 1..n); `toJSON(): IsatRegistrationDTO`.
- Produces (`types.ts` / `system-request.ts`):
  - `RequestType` thêm `'ISAT'`; `SystemRequestProps.isat?: IsatRegistration | null`; `SystemRequestDTO.isat: IsatRegistrationDTO | null`.
  - `interface CreateIsatParams { employeeId: string; saturday: unknown; team: unknown; conditions: unknown; profile: IsatProfileSnapshot }`
  - `SystemRequest.isat: IsatRegistration | null`; `static createIsatRequest(params: CreateIsatParams): SystemRequest`; `static fromRow(row: any, isat: IsatRegistration | null = null): SystemRequest`; `toJSON()` có `isat` (null với loại khác).

- [ ] **Step 1: Viết test hỏng**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IsatRegistration, ISAT_CONDITIONS, SystemRequest } from '../../src/modules/requests/domain';

const profile = {
  fullName: 'Nguyễn Văn A', positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
  shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00'
};
const allPassed = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
const base = { employeeId: 'emp-uuid-1', saturday: '2026-11-07', team: 'VN Pod — Vận hành', profile };
const create = (over: Record<string, unknown> = {}) =>
  SystemRequest.createIsatRequest({ ...base, conditions: allPassed, ...over } as any);

describe('Đơn iSAT - domain', () => {
  it('lists the four conditions in form order', () => {
    assert.deepEqual(ISAT_CONDITIONS.map(c => c.code), ['NO_VIOLATION', 'REPORTS_DONE', 'WORK_COMPLETED', 'OFFICIAL_EMPLOYEE']);
    assert.equal(ISAT_CONDITIONS[3].label, 'Là nhân viên chính thức');
  });

  it('4/4 is PENDING with generated title and reason', () => {
    const req = create();
    assert.equal(req.type, 'ISAT');
    assert.equal(req.status, 'PENDING');
    assert.equal(req.title, 'Đăng ký iSAT Thứ Bảy 07/11/2026');
    assert.equal(req.reason, 'Tự đánh giá đạt 4/4 điều kiện');
    assert.equal(req.reviewedBy, null);
    assert.equal(req.reviewedAt, null);
  });

  it('3/4 is REJECTED at once with a note and no reviewer', () => {
    const req = create({ conditions: { ...allPassed, NO_VIOLATION: false } });
    assert.equal(req.status, 'REJECTED');
    assert.equal(req.reason, 'Tự đánh giá đạt 3/4 điều kiện');
    assert.equal(req.reviewNote, 'Tự đánh giá chưa đạt 4/4 (đạt 3/4)');
    assert.equal(req.reviewedBy, null);
    assert.ok(req.reviewedAt instanceof Date);
  });

  it('counts missing or null conditions as Chưa đạt', () => {
    const req = create({ conditions: { NO_VIOLATION: true, REPORTS_DONE: null } });
    assert.deepEqual(req.isat!.conditions.map(c => c.passed), [true, false, false, false]);
    assert.equal(create({ conditions: undefined }).isat!.passedCount, 0);
    assert.equal(create({ conditions: undefined }).status, 'REJECTED');
  });

  it('accepts only a real Saturday', () => {
    for (const saturday of ['2026-11-06', '2026-02-30', '07/11/2026', undefined]) {
      assert.throws(() => create({ saturday }), /saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD/);
    }
  });

  it('requires a team and trims it', () => {
    assert.throws(() => create({ team: '   ' }), /team \(Bộ phận \/ Team\) không được để trống/);
    assert.equal(create({ team: '  VN Pod  ' }).isat!.team, 'VN Pod');
  });

  it('rejects malformed conditions', () => {
    for (const conditions of [[true, true, true, true], 'all', 4]) {
      assert.throws(() => create({ conditions }), /conditions phải là object/);
    }
    assert.throws(() => create({ conditions: { ...allPassed, EXTRA: true } }), /Mã điều kiện iSAT không hợp lệ: EXTRA/);
    assert.throws(() => create({ conditions: { ...allPassed, NO_VIOLATION: 'true' } }), /Giá trị điều kiện NO_VIOLATION phải là true, false hoặc null/);
  });

  it('exposes the isat block in JSON and null for other types', () => {
    const dto = create({ conditions: { ...allPassed, NO_VIOLATION: false } }).toJSON();
    assert.deepEqual(dto.isat, {
      saturday: '2026-11-07', fullName: 'Nguyễn Văn A', team: 'VN Pod — Vận hành',
      positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      conditions: ISAT_CONDITIONS.map((c, i) => ({ code: c.code, label: c.label, passed: i !== 0 })),
      passedCount: 3, totalCount: 4
    });
    const leave = SystemRequest.createLeaveRequest({
      employeeId: 'e', title: 't', reason: 'r', leaveType: 'PAID', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1
    });
    assert.equal(leave.toJSON().isat, null);
  });

  it('round-trips through table rows', () => {
    const req = create();
    const isat = req.isat!;
    assert.deepEqual(isat.toConditionRows(req.id).map(r => r.sort_order), [1, 2, 3, 4]);
    const back = IsatRegistration.fromRows(isat.toRow(req.id), isat.toConditionRows(req.id).reverse());
    assert.deepEqual(back.toJSON(), isat.toJSON());
    assert.deepEqual(SystemRequest.fromRow(req.toRow(), back).toJSON(), req.toJSON());
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/requests-isat-domain.test.ts`
Expected: FAIL (`ISAT_CONDITIONS` / `createIsatRequest` chưa có).

- [ ] **Step 3: Viết `isat.ts`, sửa `types.ts`, `system-request.ts`, `index.ts` theo Interfaces**

`IsatRegistration.assess` kiểm theo thứ tự: `saturday` (chuỗi khớp `YYYY-MM-DD`, ngày có thật, `getUTCDay() === 6` của `Date.UTC`) → `team` (chuỗi, cắt khoảng trắng, khác rỗng) → `conditions` (`undefined`/`null` = object rỗng; mảng hay không phải object → lỗi; mã ngoài `ISAT_CONDITIONS` → lỗi; giá trị khác `true`/`false`/`null`/`undefined` → lỗi; chỉ `true` là đạt). `createIsatRequest`: PENDING nếu `allPassed`, ngược lại REJECTED với `reviewNote`, `reviewedAt` = lúc tạo, `reviewedBy` null. `index.ts` thêm `export * from './isat';`. `toRow()` của `SystemRequest` không đổi (chỉ cột `system_requests`).

- [ ] **Step 4: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/requests-isat-domain.test.ts test/v2/requests.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/modules/requests/domain test/v2/requests-isat-domain.test.ts
git commit -m "feat(requests): add iSAT registration domain"
```

---

### Task 2: Lưu trữ — migration, kiểu DB, repository

**Files:**
- Create: `migrations/postgres/0004_isat_registrations.sql` (nội dung chép từ spec §3: đổi CHECK `system_requests_type_check`, `isat_registrations` không có cột `conditions`, chỉ mục `idx_isat_registrations_saturday`, `isat_registration_conditions`)
- Create: `test/v2/helpers/scripted-kysely.ts`
- Modify: `src/database/schema.ts`, `src/modules/requests/requests.repository.ts`
- Test: `test/v2/requests-isat-repository.test.ts`

**Interfaces:**
- Consumes: `SystemRequest.isat`, `IsatRegistration.toRow/toConditionRows/fromRows`, `SystemRequest.fromRow(row, isat)`, `IsatProfileSnapshot` (Task 1).
- Produces:
  - `schema.ts`: `IsatRegistrationsTable` (`level_name: Generated<string | null>`, còn lại bắt buộc; `position_level: number`), `IsatRegistrationConditionsTable` (`passed: boolean`, `sort_order: number`), mục `isat_registrations`, `isat_registration_conditions` trong `Schema`.
  - `requests.repository.ts`: `interface IsatProfile { employeeId: string; isatEnabled: boolean; snapshot: IsatProfileSnapshot }`; `findIsatProfile(employeeIdOrUsername: string, month: string): Promise<IsatProfile | null>`; `save`, `findById`, `list` gắn `isat` cho đơn ISAT. `count` không đổi.
  - `test/v2/helpers/scripted-kysely.ts`: `createScriptedKysely(respond?: (q: { sql: string; parameters: readonly unknown[] }) => Record<string, unknown>[]): { db: Kysely<DB>; log: Array<'BEGIN' | 'COMMIT' | 'ROLLBACK' | { sql: string; parameters: readonly unknown[] }> }` — `Kysely` với `PostgresAdapter`, `PostgresQueryCompiler`, `PostgresIntrospector` và driver tự viết: mỗi `executeQuery` ghi `{ sql, parameters }` vào `log` rồi trả `{ rows: respond(q) }` (mặc định `[]`); `beginTransaction`/`commitTransaction`/`rollbackTransaction` ghi `'BEGIN'`/`'COMMIT'`/`'ROLLBACK'`.

- [ ] **Step 1: Viết helper `scripted-kysely.ts` và test hỏng**

```ts
// test/v2/requests-isat-repository.test.ts (trích các assert chính)
const isatReq = () => SystemRequest.createIsatRequest({ employeeId: 'emp-uuid-1', saturday: '2026-11-07', team: 'VN Pod', conditions: allPassed, profile } as any);
const sqlOf = (log: any[]) => log.filter(e => typeof e !== 'string');

it('saves an ISAT request across three tables in one transaction, idempotently', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(isatReq());
  assert.deepEqual(log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1])),
    ['BEGIN', 'system_requests', 'isat_registrations', 'isat_registration_conditions', 'COMMIT']);
  assert.match(sqlOf(log)[1].sql, /on conflict \("request_id"\) do nothing/);
  assert.match(sqlOf(log)[2].sql, /on conflict \("request_id", "code"\) do nothing/);
});

it('saves other request types without a transaction', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(SystemRequest.createLeaveRequest({ /* như Task 1 */ } as any));
  assert.equal(log.length, 1);
  assert.match((log[0] as any).sql, /^insert into "system_requests"/);
});

it('attaches registration and ordered conditions to ISAT rows only', async () => {
  const req = isatReq();
  const { db, log } = createScriptedKysely(q => {
    if (q.sql.includes('from "isat_registration_conditions"')) return req.isat!.toConditionRows(req.id).reverse() as any;
    if (q.sql.includes('from "isat_registrations"')) return [req.isat!.toRow(req.id)] as any;
    if (q.sql.includes('from "system_requests"')) return [req.toRow(), leaveRow] as any;
    return [];
  });
  const [isatItem, leaveItem] = await new RequestsRepository(db).list({});
  assert.deepEqual(isatItem.toJSON().isat, req.toJSON().isat);
  assert.equal(leaveItem.isat, null);
  const reg = sqlOf(log).find(q => q.sql.includes('from "isat_registrations"'));
  assert.match(reg.sql, /to_char\("isat_registrations"\."saturday", 'YYYY-MM-DD'\)/);
  assert.deepEqual(reg.parameters, [req.id]);
});

it('runs no iSAT queries when the page has no ISAT rows', async () => {
  const { db, log } = createScriptedKysely(q => (q.sql.includes('from "system_requests"') ? [leaveRow] : []));
  await new RequestsRepository(db).list({});
  assert.equal(sqlOf(log).length, 1);
});

it('findById attaches the registration too', async () => { /* như list, gọi findById(req.id), so isat */ });

it('findIsatProfile resolves uuid or username with level name and isat flag effective at the month', async () => {
  const { db, log } = createScriptedKysely(q => {
    if (q.sql.includes('from "staff"')) return [{ uuid: 'emp-uuid-1', name: 'Nguyễn Văn A', type: 'nv', level: 2, shift_type: 'NORMAL', shift_start_time: '08:00', shift_end_time: '17:00' }];
    if (q.sql.includes('from "position_levels"')) return [{ name: 'Chuyên viên' }];
    if (q.sql.includes('"position_type_benefits"')) return [{ enabled: 1 }];
    return [];
  });
  assert.deepEqual(await new RequestsRepository(db).findIsatProfile('nguyen-van-a', '2026-11'),
    { employeeId: 'emp-uuid-1', isatEnabled: true, snapshot: profile });
  const [staffQ, levelQ, benefitQ] = sqlOf(log);
  assert.ok(staffQ.parameters.filter(p => p === 'nguyen-van-a').length === 2); // uuid = ? or username = ?
  assert.ok(levelQ.parameters.includes('2026-11'));
  assert.ok(benefitQ.parameters.includes('2026-11') && benefitQ.parameters.includes('isat'));
});

it('findIsatProfile: null without staff or uuid; flag off when benefit row is missing or 0', async () => {
  // (a) staff trả [] → null; (b) staff có uuid: null → null;
  // (c) position_type_benefits trả [] → isatEnabled false; (d) trả [{ enabled: 0 }] → isatEnabled false;
  // (e) position_levels trả [] → snapshot.levelName null
});
```

`leaveRow` = `SystemRequest.createLeaveRequest(...).toRow()`. `profile`, `allPassed` như Task 1.

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/requests-isat-repository.test.ts`
Expected: FAIL (save chưa ghi bảng iSAT, `findIsatProfile` chưa có).

- [ ] **Step 3: Viết migration, sửa `schema.ts` và `requests.repository.ts`**

- `save`: tách phần upsert hiện có thành `private async upsertRequest(db: Kysely<DB>, row: SystemRequestRow)`; nếu `request.isat` có thì `this.qb.transaction().execute(trx => …)` gồm upsert, chèn `isat_registrations` (`onConflict(oc => oc.column('request_id').doNothing())`), chèn điều kiện (`onConflict(oc => oc.columns(['request_id', 'code']).doNothing())`); không thì upsert như cũ.
- `findById`/`list`: giữ truy vấn `system_requests` như cũ, rồi `private async attachIsat(rows): Promise<SystemRequest[]>` — lấy id các dòng `type === 'ISAT'`; rỗng thì `SystemRequest.fromRow(r)` hết, không truy vấn thêm; có thì một truy vấn `isat_registrations` (`saturday` qua `to_char`, `where('request_id', 'in', ids)`) và một truy vấn `isat_registration_conditions` (`where('request_id', 'in', ids)`, `orderBy('sort_order')`).
- `findIsatProfile`: (1) `staff` theo `uuid = id or username = id`, không có dòng hoặc `uuid` null → `null`; (2) `position_levels.name` theo `type_code`, `level_no`, `effective_month <= month`, `orderBy('effective_month', 'desc')`, lấy dòng đầu, không có → `null`; (3) `position_types` inner join `position_type_benefits` theo `code`, `effective_month <= month`, `benefit = 'isat'`, `orderBy('position_types.effective_month', 'desc')`, dòng đầu `enabled === 1` → `isatEnabled`.

- [ ] **Step 4: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/requests-isat-repository.test.ts test/v2/requests-isat-domain.test.ts test/v2/requests.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add migrations/postgres/0004_isat_registrations.sql src/database/schema.ts src/modules/requests/requests.repository.ts test/v2/helpers/scripted-kysely.ts test/v2/requests-isat-repository.test.ts
git commit -m "feat(requests): persist iSAT registrations and condition snapshots"
```

---

### Task 3: Service, duyệt ghi lịch, controller, tài liệu API

**Files:**
- Modify: `src/modules/requests/requests.service.ts`, `src/modules/requests/requests.controller.ts`, `src/modules/attendance/domain/work-schedule.ts`, `docs/api/v2-contract.md`
- Test: `test/v2/requests-isat-service.test.ts`

**Interfaces:**
- Consumes: `RequestsRepository.findIsatProfile`, `IsatProfile` (Task 2); `SystemRequest.createIsatRequest`, `ISAT_CONDITIONS` (Task 1).
- Produces:
  - `work-schedule.ts`: `ScheduleType` thêm `'ISAT'`; `withIsat(requestId?: string): WorkSchedule` (giữ ca và giờ, `approvedOtHours` 0, `scheduleType 'ISAT'`, `status 'ON_LEAVE'`, `sourceRequestId`).
  - `requests.service.ts`: `interface CreateIsatInput { employeeId: string; saturday?: unknown; team?: unknown; conditions?: unknown }`; `createIsatRequest(input: CreateIsatInput): Promise<SystemRequestDTO>`; `reviewRequest` thêm nhánh `ISAT`.
  - `requests.controller.ts`: `@Get('isat/conditions') listIsatConditions(): { conditions: Array<{ code: string; label: string }> }` (đặt trước `@Get(':id')`); `@Post('isat') createIsat(body: any, user?: UserSession): Promise<unknown>` trả `{ created: true, request }`, lỗi → `BadRequestError(err.message, { code: 'BAD_REQUEST' })`, chỉ chuyển `saturday`, `team`, `conditions` và `employeeId = body.employeeId || user?.username || 'system'`.

- [ ] **Step 1: Viết test hỏng**

Repo giả kế thừa `RequestsRepository` như `test/v2/requests.test.ts`, thêm `profiles: Map<string, IsatProfile>` (khoá cả uuid lẫn username), `profileMonths: string[]` và `override findIsatProfile(id, month)` đẩy `month` vào `profileMonths` rồi trả `profiles.get(id) ?? null`. `BadRequestError` import từ `../../src/common`. Hồ sơ mẫu: `nv` → `{ employeeId: 'emp-uuid-1', isatEnabled: true, snapshot: profile }` dưới khoá `'emp-uuid-1'` và `'nguyen-van-a'`; `ctv` → `{ employeeId: 'ctv-uuid', isatEnabled: false, … }` dưới `'ctv-user'`.

```ts
it('creates a PENDING request under the uuid with the profile snapshot', async () => {
  const dto = await service.createIsatRequest({ employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: ' VN Pod — Vận hành ', conditions: allPassed });
  assert.equal(dto.employeeId, 'emp-uuid-1');
  assert.equal(dto.status, 'PENDING');
  assert.equal(dto.isat!.team, 'VN Pod — Vận hành');
  assert.equal(dto.isat!.levelName, 'Chuyên viên');
  assert.equal(reqRepo.profileMonths.at(-1), new Date().toISOString().slice(0, 7));
});

it('refuses unknown staff and types without the isat benefit', async () => {
  await assert.rejects(service.createIsatRequest({ employeeId: 'ghost', saturday: '2026-11-07', team: 'T', conditions: allPassed }), /Không tìm thấy nhân sự: ghost/);
  await assert.rejects(service.createIsatRequest({ employeeId: 'ctv-user', saturday: '2026-11-07', team: 'T', conditions: allPassed }), /iSAT chỉ áp dụng cho nhóm Nhân viên/);
});

it('blocks a second PENDING/APPROVED request for the same Saturday, not after a self-rejected one', async () => {
  // repo mới: 3/4 → REJECTED; rồi 4/4 cùng ngày → PENDING; rồi lần nữa (gửi bằng uuid) → lỗi; 2026-11-14 → được
  await assert.rejects(/* lần ba */, /Đã có đơn iSAT cho Thứ Bảy 07\/11\/2026/);
});

it('approving marks the Saturday ISAT / ON_LEAVE; rejecting writes no schedule', async () => {
  const sched = attRepo.schedules.get('emp-uuid-1:2026-11-07')!;
  assert.equal(sched.scheduleType, 'ISAT');
  assert.equal(sched.status, 'ON_LEAVE');
  assert.equal(sched.sourceRequestId, approved.id);
  assert.equal(attRepo.schedules.has('emp-uuid-1:2026-11-14'), false); // đơn bị REJECT
});

it('approves without an attendance repository', async () => { /* new RequestsService(repo) → APPROVED */ });

it('getById and listRequests return the isat block', async () => { /* isat.saturday === '2026-11-07' */ });

it('WorkSchedule.withIsat keeps the shift and clears OT', () => {
  const s = WorkSchedule.create({ employeeId: 'e', workDate: '2026-11-07', shiftType: 'NORMAL', plannedStartTime: '08:00', plannedEndTime: '17:00', approvedOtHours: 2 }).withIsat(id);
  assert.deepEqual([s.scheduleType, s.status, s.approvedOtHours, s.plannedStartTime, s.sourceRequestId], ['ISAT', 'ON_LEAVE', 0, '08:00', id]);
});

it('controller forwards only form fields with the session fallback and wraps errors', async () => {
  const calls: any[] = [];
  const ctrl = new RequestsController({ createIsatRequest: async (i: any) => (calls.push(i), { id: 'r1' }) } as any);
  assert.deepEqual(await ctrl.createIsat({ saturday: '2026-11-07', team: 'T', conditions: {}, title: 'x' }, { username: 'nguyen-van-a' } as any), { created: true, request: { id: 'r1' } });
  assert.deepEqual(calls[0], { employeeId: 'nguyen-van-a', saturday: '2026-11-07', team: 'T', conditions: {} });
  const failing = new RequestsController({ createIsatRequest: async () => { throw new Error('boom'); } } as any);
  await assert.rejects(failing.createIsat({}, undefined), (e: any) => e instanceof BadRequestError && e.message === 'boom');
  assert.deepEqual(ctrl.listIsatConditions(), { conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label })) });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/requests-isat-service.test.ts`
Expected: FAIL (`createIsatRequest`, `withIsat`, `createIsat` chưa có).

- [ ] **Step 3: Viết mã theo Interfaces**

`createIsatRequest`: `findIsatProfile(input.employeeId, new Date().toISOString().slice(0, 7))` → `null`: lỗi không thấy hồ sơ; `!isatEnabled`: lỗi quyền lợi; `SystemRequest.createIsatRequest({ employeeId: profile.employeeId, …, profile: profile.snapshot })`; `repo.list({ employeeId: profile.employeeId, type: 'ISAT' })` có đơn `PENDING`/`APPROVED` với `isat.saturday` trùng → lỗi trùng; `save`; trả `toJSON()`. `reviewRequest`, khi APPROVE và có `attendanceRepo`: `else if (req.type === 'ISAT' && req.isat)` → `ensureDefaultSchedule(req.employeeId, req.isat.saturday)` rồi `saveSchedule(sched.withIsat(req.id))`.

- [ ] **Step 4: Cập nhật `docs/api/v2-contract.md`**

Bảng mục 2: dòng "Đơn iSAT" → `POST /api/v2/requests/isat` (POST, "Nộp đơn iSAT (nghỉ Thứ Bảy có lương, chỉ nhóm Nhân viên)") và `GET /api/v2/requests/isat/conditions`. Mục 3.4: thân yêu cầu và phản hồi (spec §4), danh sách lỗi 400 ở Global Constraints, khối `isat` trong `GET /api/v2/requests` và `GET /api/v2/requests/:id` (spec §5, `isat: null` với loại khác, lọc `?type=ISAT`), tác dụng khi duyệt (lịch Thứ Bảy `ISAT`/`ON_LEAVE`; phiếu lương có dòng "iSAT" bằng một lương ngày, không phụ cấp, thay dòng chấm công cùng ngày).

- [ ] **Step 5: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/requests-isat-service.test.ts test/v2/requests.test.ts test/v2/attendance.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Commit**

```bash
git add src/modules/requests src/modules/attendance/domain/work-schedule.ts docs/api/v2-contract.md test/v2/requests-isat-service.test.ts
git commit -m "feat(requests): submit, review and document iSAT requests"
```

---

### Task 4: Nối lương

> Viết trên nền payroll của `feat/pure-v2-backend` 92dca91 (đã merge vào nhánh ở `a3858fa`): dữ liệu thô của một tháng đi qua hàm thuần `mapMonthRows(month, rows: MonthRows)`, hàm này đổi mọi cột `DATE` sang `'YYYY-MM-DD'` bằng `dateText` (giờ địa phương).

**Files:**
- Modify: `src/modules/payroll/payroll.repository.ts`, `src/modules/payroll/payroll.service.ts`, `docs/superpowers/PROGRAM.md` (ledger)
- Test: `test/v2/payroll-month-rows.test.ts`, `test/v2/payroll.test.ts`

**Interfaces:**
- Consumes: bảng `isat_registrations` trong `schema.ts` (Task 2); `EmployeeMonthlyRawData`, `MonthRows`, `mapMonthRows`, `dateText` (đã có trong `payroll.repository.ts`); `nvMonthData` (`test/v2/payroll-fixtures.ts`).
- Produces: `EmployeeMonthlyRawData.isatDates?: string[]`; `MonthRows.isatDates?: Array<string | Date>` (cả hai tuỳ chọn để dữ liệu giả hiện có vẫn hợp lệ).

- [ ] **Step 1: Viết test hỏng**

Trong `test/v2/payroll-month-rows.test.ts`:

```ts
it('maps approved iSAT Saturdays to YYYY-MM-DD text', () => {
  assert.deepEqual(mapMonthRows('2026-11', rows({ isatDates: [new Date(2026, 10, 7), '2026-11-14'] })).isatDates, ['2026-11-07', '2026-11-14']);
  assert.deepEqual(mapMonthRows('2026-11', rows()).isatDates, []);
});

// trong describe 'PayrollRepository.getMonthlyData queries'
it('reads approved iSAT Saturdays of the month for the employee uuid', async () => {
  const { qb, calls } = recordingQb({ ...tables, isat_registrations: { all: [{ saturday: new Date(2026, 9, 10) }] } });
  const data = await new PayrollRepository(qb).getMonthlyData('u1', '2026-10');
  const isat = calls.find(c => c.table === 'isat_registrations');
  // where có đủ: employee_id = uuid của staff, type = 'ISAT', status = 'APPROVED', saturday >= '2026-10-01', saturday <= '2026-10-31'
  // (so từng bộ ba bằng assert.deepEqual trên isat.where, tên cột có tiền tố bảng như code viết)
  assert.deepEqual(isat?.order, [['isat_registrations.saturday', 'asc']]);
  assert.deepEqual(data?.isatDates, ['2026-10-10']);
});
```

`recordingQb` thêm `innerJoin() { return qb; }`. Fake `qb` viết tay trong test `'loads persisted schedule type by employee and work date for makeup detection'` (`payroll.test.ts`) thêm `innerJoin() { return this; }`.

Cuối `test/v2/payroll.test.ts`, describe mới dùng `FakePayrollRepository` như describe `'Payroll V2 - KPI, insurance and income tax on the payslip'`; dữ liệu `nvMonthData()` (nv, lương cơ bản 6.000.000, công chuẩn 26) với `timesheets` thay bằng: một dòng NORMAL 8 giờ ngày `2026-10-09` và một dòng NORMAL 8 giờ ngày `2026-10-10`; `requests: []`; `isatDates: ['2026-10-10']`.

```ts
it("pays an approved iSAT Saturday as one base day and replaces that date's attendance line", async () => {
  const slip = await service.generateMonthlyPayslip('u1', '2026-10');
  assert.deepEqual(slip.dailyLines.map(l => [l.date, l.shiftCode]), [['2026-10-09', 'NORMAL'], ['2026-10-10', 'ISAT']]);
  const line = slip.dailyLines[1];
  assert.deepEqual(
    [line.dayOfWeekText, line.shiftLabel, line.inOutText, line.workHours, line.daySalary, line.flexAllowancePay, line.nightAllowancePay, line.offPaidPay, line.otHours, line.deductionAmount, line.dailyTotal],
    ['Thứ 7', 'iSAT', 'Hưởng lương ngày', 0, 230769, 0, 0, 0, 0, 0, 230769]
  );
  assert.equal(slip.isatDays, 1);
  assert.equal(slip.isatPay, 230769);
  assert.equal(slip.actualWorkDays, 1);
});

it('adds the iSAT line when the Saturday has no attendance row', async () => {
  // timesheets: [], isatDates: ['2026-10-10'] → dailyLines đúng 1 dòng ISAT ngày 2026-10-10, isatPay 230769, actualWorkDays 0
});

it('keeps payslips unchanged when isatDates is absent', async () => {
  // nvMonthData() nguyên bản (không có isatDates) → isatDays 0, isatPay 0, không dòng ISAT
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `node --import tsx --test test/v2/payroll-month-rows.test.ts test/v2/payroll.test.ts`
Expected: FAIL ở các test mới; test cũ vẫn xanh.

- [ ] **Step 3: Sửa repository và service**

- `MonthRows.isatDates?: Array<string | Date>`; `mapMonthRows` trả `isatDates: (rows.isatDates ?? []).map(dateText)`.
- `getMonthlyData`: sau truy vấn đơn, `selectFrom('isat_registrations').innerJoin('system_requests', 'system_requests.id', 'isat_registrations.request_id').select('isat_registrations.saturday as saturday')`, lọc `system_requests.employee_id = staffRow.uuid || employeeId`, `system_requests.type = 'ISAT'`, `system_requests.status = 'APPROVED'`, `isat_registrations.saturday >= startDate`, `<= endDate` (biến đã có trong hàm), `orderBy('isat_registrations.saturday', 'asc')`; truyền `isatDates: isatRows.map(r => r.saturday)` vào `mapMonthRows`.
- `generateMonthlyPayslip`: `const isatDates = new Set(data.isatDates ?? [])`; vòng lặp chấm công bỏ qua ngày thuộc `isatDates`; sau vòng lặp thêm mỗi ngày một dòng `{ date, dayOfWeekText: 'Thứ 7', shiftCode: 'ISAT', shiftLabel: 'iSAT', inOutText: 'Hưởng lương ngày', workHours: 0, daySalary: Math.round(dayRate), flexAllowancePay: 0, nightAllowancePay: 0, offPaidPay: 0, otHours: 0, otPay: 0, deductionHours: 0, deductionAmount: 0, dailyTotal: Math.round(dayRate) }`; sắp `dailyLines` theo `date`.

- [ ] **Step 4: Chạy, thấy qua**

Run: `node --import tsx --test test/v2/payroll-month-rows.test.ts test/v2/payroll.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Ghi ledger**

Thêm một dòng cuối bảng Ledger của `docs/superpowers/PROGRAM.md`: ngày 2026-11-04, "Đơn iSAT (BE v2)": spec/plan, 3 Ruling ở trên, số test của `npm test` cuối, những gì chưa kiểm (SQL thật, migration `0004` chưa áp).

- [ ] **Step 6: Chạy toàn bộ**

Run: `npm test`
Expected: không test đỏ mới so với mốc sau merge (176 test: 175 pass, 1 skip `payroll-repository.pg.test.ts` vì không đặt `PG_TEST_URL`).

- [ ] **Step 7: Commit**

```bash
git add src/modules/payroll test/v2/payroll-month-rows.test.ts test/v2/payroll.test.ts docs/superpowers/PROGRAM.md
git commit -m "feat(payroll): pay approved iSAT Saturdays"
```
