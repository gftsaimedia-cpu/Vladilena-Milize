# Hợp đồng API BE–FE và Quy trình Phối hợp 2 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng sổ cái Hợp đồng API có cấu trúc tại Backend (`src/contracts/api-contract.ts` → sinh tự động `spec/reference/api-contract.md`), thiết lập sổ yêu cầu API từ FE sang BE (`spec/api-requests.md`), khoá ranh giới "BE xử lý dữ liệu, FE chỉ hiển thị" bằng bộ test tĩnh (`test/unit/api-contract.test.ts`), và hoàn thành 3 yêu cầu API đầu tiên để loại bỏ việc FE tự tính toán/gộp trang.

**Architecture:** Đặt nguồn chân lý của hợp đồng API ở `src/contracts/api-contract.ts` (do BE Agent sở hữu), đối chiếu 1–1 với bảng quyền `ROUTE_CAPS` trong `src/platform/authz.ts`. Mở rộng `scripts/docs/gen-spec.ts` (`npm run spec:gen`) để xuất `spec/reference/api-contract.md` kèm đầy đủ tham số `params`/`query`/`body`/`response`/`errors`, đồng thời dùng `test/unit/api-contract.test.ts` để kiểm tra mọi lệnh gọi `api()` trong `web/src/services/*.ts` và mọi phiếu yêu cầu trong `spec/api-requests.md`.

**Tech Stack:** TypeScript, Node.js test runner (`node:test`), NestJS (`src/modules/**`), Vue 3 service layer (`web/src/services/**`).

**Spec:** [`docs/superpowers/specs/2026-11-03-be-fe-api-contract-design.md`](../specs/2026-11-03-be-fe-api-contract-design.md)

## Global Constraints

- Không sử dụng cụm từ bị cấm trong `test/unit/no-tam-tinh-text.test.ts` ở bất kỳ file mã, chú thích hay tài liệu nào.
- Không vượt ngưỡng kích thước file trong `test/unit/file-size-budget.test.ts` (mềm 800 dòng, cứng 1.200 dòng); nếu `src/contracts/api-contract.ts` dài, tách theo nhóm module trong `src/contracts/routes/*.ts` để mỗi file dưới 400 dòng.
- Mọi thay đổi trên hợp đồng API phải chạy `npm run spec:gen` để cập nhật `spec/reference/api-contract.md` và `spec/reference/api-routes.md`, đảm bảo `test/unit/spec-reference.test.ts` và `test/unit/spec-refs.test.ts` xanh.
- FE Agent chỉ được phép sửa `web/src/**` và thêm mục `OPEN` vào `spec/api-requests.md`; BE Agent sở hữu `src/**`, `migrations/**` và việc chuyển trạng thái `API-REQ-XXX` sang `DONE`.
- Giữ nguyên `npm run typecheck`, `npm run typecheck:web` và `npm run format:check` xanh sau mỗi task.

## Review Focus

1. BE thêm một route mới vào `ROUTE_CAPS` (`src/platform/authz.ts`) nhưng quên khai báo tham số/phản hồi trong `src/contracts/api-contract.ts`: `test/unit/api-contract.test.ts` phải báo lỗi ngay tên route bị thiếu (Task 1).
2. Route có tham số đường dẫn động như `GET /periods/:month/payslips/:username` hoặc `PUT /catalog/positions/:code`: hợp đồng bắt buộc phải khai báo đủ các khoá `month`, `username`, `code` trong `params` (Task 1).
3. FE service (`web/src/services/*.ts`) gọi một đường dẫn sử dụng biến nội suy và query string (ví dụ ``api('GET', `/periods/${enc(month)}/payslips?status=error`)``): bộ quét tĩnh trong `test/unit/api-contract.test.ts` phải chuẩn hoá đúng về `GET /periods/:month/payslips` và phát hiện ngay nếu FE gọi một đường dẫn không tồn tại trong `API_CONTRACT` (Task 3).
4. Một component Vue (`web/src/views/**/*.vue` hoặc `web/src/components/**/*.vue`) gọi thẳng `fetch('/api/...')` hoặc import trực tiếp hàm từ `src/domain/**`: `test/unit/api-contract.test.ts` phải chặn ngay để giữ kỷ luật "FE chỉ hiển thị qua tầng service" (Task 3).
5. Phiếu yêu cầu trong `spec/api-requests.md` được đánh dấu `DONE` nhưng route ghi trong mục `Route thực hiện` không tồn tại trong `API_CONTRACT`: test phải báo lỗi để tránh đóng phiếu giả (Task 3 & Task 4).

---

## File Structure Map

| File | Trách nhiệm | Thao tác |
| --- | --- | --- |
| `src/contracts/types.ts` | Định nghĩa kiểu `RouteContract`, `ApiContractMap` và hàm kiểm tra cấu trúc hợp đồng | Tạo mới |
| `src/contracts/routes/core- contracts.ts` | Khai báo hợp đồng cho các module `auth`, `system`, `settings`, `catalog`, `positions`, `blocks`, `roles`, `audit` | Tạo mới |
| `src/contracts/routes/work-contracts.ts` | Khai báo hợp đồng cho các module `attendance`, `sheet`, `approvals`, `explanations`, `advance`, `kpi`, `leave`, `staff`, `employees` | Tạo mới |
| `src/contracts/routes/payroll-contracts.ts` | Khai báo hợp đồng cho các module `periods`, `pay-entries` | Tạo mới |
| `src/contracts/api-contract.ts` | Điểm vào gộp toàn bộ hợp đồng (`API_CONTRACT`) và hàm chuẩn hoá đường dẫn FE → khoá hợp đồng | Tạo mới |
| `scripts/docs/gen-spec.ts` | Sinh tự động `spec/reference/*.md` từ mã nguồn | Sửa: xuất thêm `spec/reference/api-contract.md` và lấy `summary` từ `API_CONTRACT` cho `api-routes.md` |
| `spec/reference/api-contract.md` | Tài liệu Hợp đồng API đầy đủ tham số & phản hồi cho BE Agent và FE Agent tra cứu | Tạo mới (sinh tự động qua `npm run spec:gen`) |
| `spec/reference/api-routes.md` | Bảng tóm tắt 96 route `/api` | Cập nhật (lấp đầy cột mô tả từ `API_CONTRACT`) |
| `spec/api-requests.md` | Sổ cái yêu cầu thiết kế/bổ sung API từ FE Agent gửi BE Agent + quy tắc phối hợp 2 Agent | Tạo mới |
| `src/domain/period/periods.ts` | Dựng dữ liệu kỳ lương (`GET /api/periods/:month`) | Sửa: trả sẵn `errorSlips` toàn kỳ cho `API-REQ-001` |
| `src/engine/actual-hours.ts` | Tính giờ công thực tế từ lượt Check-in/out | Sửa: trả sẵn `summary: { lateMinutes, deductedMinutes }` trong kết quả `apply()` cho `API-REQ-002` |
| `src/modules/staff/staff.helpers.ts` | Dựng danh sách hồ sơ nhân sự (`GET /api/staff`) | Sửa: gắn sẵn cờ `startDateRequired` trên từng hồ sơ cho `API-REQ-003` |
| `test/unit/api-contract.test.ts` | Kiểm thử độ phủ hợp đồng BE, kiểm tra lệnh gọi API của FE, ranh giới hiển thị FE và sổ `spec/api-requests.md` | Tạo mới |

---

### Task 1: Khởi tạo Sổ đăng ký Hợp đồng API của BE (`src/contracts/**`) cho toàn bộ 96 route

**Files:**
- Create: `src/contracts/types.ts`
- Create: `src/contracts/routes/core-contracts.ts`
- Create: `src/contracts/routes/work-contracts.ts`
- Create: `src/contracts/routes/payroll-contracts.ts`
- Create: `src/contracts/api-contract.ts`
- Test: `test/unit/api-contract.test.ts`

**Interfaces:**
- Consumes: `ROUTE_CAPS` from `src/platform/authz.ts`
- Produces:
  - `export interface RouteContract { summary: string; params?: Record<string, string>; query?: Record<string, string>; body?: Record<string, string>; response: string; errors?: string[] }` in `src/contracts/types.ts`
  - `export const API_CONTRACT: Record<string, RouteContract>` in `src/contracts/api-contract.ts`

- [ ] **Step 1: Write the failing test in `test/unit/api-contract.test.ts`**

```ts
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');
const { API_CONTRACT } = require('../../src/contracts/api-contract');

test('hợp đồng API: khớp 1-1 với mọi route trong ROUTE_CAPS và đủ trường bắt buộc', () => {
  const routeKeys = Object.keys(authz.ROUTE_CAPS).sort();
  const contractKeys = Object.keys(API_CONTRACT).sort();
  assert.deepEqual(contractKeys, routeKeys, 'API_CONTRACT phải khớp chính xác tập khoá của ROUTE_CAPS');

  const problems: string[] = [];
  for (const key of routeKeys) {
    const c = API_CONTRACT[key];
    if (!c.summary || typeof c.summary !== 'string') problems.push(`${key}: thiếu summary`);
    if (!c.response || typeof c.response !== 'string') problems.push(`${key}: thiếu response`);
    const paramMatches = [...key.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]);
    for (const p of paramMatches) {
      if (!c.params || !c.params[p]) problems.push(`${key}: thiếu mô tả params.${p}`);
    }
  }
  assert.deepEqual(problems, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts`
Expected: FAIL with `Cannot find module '../../src/contracts/api-contract'`.

- [ ] **Step 3: Implement `src/contracts/types.ts`, `src/contracts/routes/*.ts`, and `src/contracts/api-contract.ts`**

1. In `src/contracts/types.ts`, define `RouteContract` and `ApiContractMap`.
2. Inspect the 20 controllers in `src/modules/**/*.controller.ts` and populate `core-contracts.ts`, `work-contracts.ts`, and `payroll-contracts.ts` so every one of the 96 route keys in `src/platform/authz.ts` has accurate `summary`, `params` (for every `:month`, `:username`, `:id`, `:code`, `:uuid`), `query`, `body`, `response`, and `errors`.
3. In `src/contracts/api-contract.ts`, merge and freeze `API_CONTRACT`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts && npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ test/unit/api-contract.test.ts
git commit -m "feat(contracts): declare structured BE API contracts for all 96 routes"
```

---

### Task 2: Sinh tự động `spec/reference/api-contract.md` qua `scripts/docs/gen-spec.ts`

**Files:**
- Modify: `scripts/docs/gen-spec.ts:57-80,260-282`
- Create: `spec/reference/api-contract.md` (via `npm run spec:gen`)
- Modify: `spec/reference/api-routes.md` (via `npm run spec:gen`)
- Test: `test/unit/api-contract.test.ts`

**Interfaces:**
- Consumes: `API_CONTRACT` from `src/contracts/api-contract.ts`
- Produces: `spec/reference/api-contract.md` verified by `node scripts/docs/gen-spec.ts --check`

- [ ] **Step 1: Add failing test in `test/unit/api-contract.test.ts` checking `spec/reference/api-contract.md` generation**

```ts
const fs = require('node:fs');
const path = require('node:path');

test('hợp đồng API: spec/reference/api-contract.md tồn tại và liệt kê đủ 96 route', () => {
  const file = path.join(__dirname, '../../spec/reference/api-contract.md');
  assert.ok(fs.existsSync(file), 'Chưa sinh spec/reference/api-contract.md');
  const text = fs.readFileSync(file, 'utf8');
  for (const key of Object.keys(authz.ROUTE_CAPS)) {
    assert.ok(text.includes(`### \`${key}\``), `api-contract.md thiếu mục ${key}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts`
Expected: FAIL with `Chưa sinh spec/reference/api-contract.md`.

- [ ] **Step 3: Update `scripts/docs/gen-spec.ts` and run `npm run spec:gen`**

1. In `scripts/docs/gen-spec.ts`:
   - Require `API_CONTRACT` from `src/contracts/api-contract.ts`.
   - In `routesDoc()`, fall back to `API_CONTRACT[key]?.summary` when the controller comment `r.doc` is empty so all 96 rows in `spec/reference/api-routes.md` have a clear description.
   - Add `apiContractDoc()` that renders `# Hợp đồng chi tiết API (BE ↔ FE)` grouped by module, with a `### \`<METHOD /path>\`` section for each route showing:
     - Quyền (`cap` / công khai / đã đăng nhập) & Khoá kỳ (`periodScope`)
     - Mục đích (`summary`)
     - Tham số đường dẫn (`params`), Query (`query`), Thân yêu cầu (`body`)
     - Phản hồi 200 (`response`) và Mã lỗi (`errors`)
   - Register `['api-contract.md', apiContractDoc]` in the output list of `gen-spec.ts`.
2. Run `npm run spec:gen`.

- [ ] **Step 4: Run tests to verify `spec-reference` and `api-contract` pass**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts test/unit/spec-reference.test.ts test/unit/spec-refs.test.ts`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/docs/gen-spec.ts spec/reference/api-contract.md spec/reference/api-routes.md test/unit/api-contract.test.ts
git commit -m "docs(spec): auto-generate spec/reference/api-contract.md from API_CONTRACT"
```

---

### Task 3: Thiết lập Quy trình Yêu cầu API (`spec/api-requests.md`) và Cổng Kiểm tra Ranh giới FE–BE

**Files:**
- Create: `spec/api-requests.md`
- Modify: `src/contracts/api-contract.ts` (add `normalizeFeCallToRouteKey(method: string, rawPathExpr: string): string[]`)
- Modify: `test/unit/api-contract.test.ts`

**Interfaces:**
- Produces:
  - `normalizeFeCallToRouteKey(method: string, rawPathExpr: string): string[]` in `src/contracts/api-contract.ts`
  - `parseApiRequests(markdown: string): Array<{ id: string; status: string; route: string; feFiles: string[] }>` in `src/contracts/api-contract.ts`
  - `spec/api-requests.md` containing the dual-agent protocol and initial requests `API-REQ-001`, `API-REQ-002`, `API-REQ-003`

- [ ] **Step 1: Add failing tests for FE service endpoint validation, FE display-only boundary, and `spec/api-requests.md` parsing in `test/unit/api-contract.test.ts`**

```ts
const { normalizeFeCallToRouteKey, parseApiRequests } = require('../../src/contracts/api-contract');

test('biên giới FE–BE: mọi lệnh gọi api() trong web/src/services/*.ts đều khớp hợp đồng BE', () => {
  const servicesDir = path.join(__dirname, '../../web/src/services');
  const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts') && f !== 'http.ts');
  const unknown: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(servicesDir, f), 'utf8');
    for (const m of src.matchAll(/\bapi\(\s*'([A-Z]+)'\s*,\s*(`[^`]+`|'[^']+')/g)) {
      const candidates = normalizeFeCallToRouteKey(m[1], m[2]);
      if (!candidates.some((k: string) => Object.hasOwn(API_CONTRACT, k))) {
        unknown.push(`${f}: ${m[1]} ${m[2]} -> ${candidates.join(' | ')}`);
      }
    }
  }
  assert.deepEqual(unknown, []);
});

test('biên giới FE–BE: component Vue không gọi fetch/api trực tiếp và web/src không import ruột BE', () => {
  const webRoot = path.join(__dirname, '../../web/src');
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  const violations: string[] = [];
  for (const file of walk(webRoot)) {
    const rel = path.relative(webRoot, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    if (/(?:from|require\()\s*['"][^'"]*\/src\/(?:data|domain|engine|modules|platform)\b/.test(text)) {
      violations.push(`${rel}: import trực tiếp tầng BE`);
    }
    if (file.endsWith('.vue') && /\bfetch\s*\(|\bfrom\s+['"]@\/services\/http['"]/.test(text)) {
      violations.push(`${rel}: component Vue gọi thẳng HTTP thay vì qua web/src/services/*`);
    }
  }
  assert.deepEqual(violations, []);
});

test('quy trình yêu cầu API: spec/api-requests.md có cấu trúc hợp lệ cho 2 Agent BE/FE', () => {
  const reqFile = path.join(__dirname, '../../spec/api-requests.md');
  assert.ok(fs.existsSync(reqFile), 'Thiếu spec/api-requests.md');
  const items = parseApiRequests(fs.readFileSync(reqFile, 'utf8'));
  assert.ok(items.length >= 3, 'Cần có ít nhất 3 phiếu API-REQ mẫu từ đợt rà soát');
  for (const item of items) {
    assert.match(item.id, /^API-REQ-\d{3}$/);
    assert.ok(['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'].includes(item.status), `Trạng thái không hợp lệ: ${item.status}`);
    if (item.status === 'DONE') {
      assert.ok(Object.hasOwn(API_CONTRACT, item.route), `${item.id} đánh dấu DONE nhưng route ${item.route} không có trong API_CONTRACT`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts`
Expected: FAIL (`normalizeFeCallToRouteKey is not a function`).

- [ ] **Step 3: Implement `normalizeFeCallToRouteKey`, `parseApiRequests`, and create `spec/api-requests.md`**

1. In `src/contracts/api-contract.ts`:
   - Implement `normalizeFeCallToRouteKey(method, rawPathExpr)` that strips quotes/backticks, strips query strings (`?.*` or `${qs(...)}`), expands `${source}` in `/periods/${enc(month)}/${source}/${enc(username)}` to `['payslips', 'estimates']`, and maps `${...}` segments by position against route patterns in `API_CONTRACT`.
   - Implement `parseApiRequests(markdown)` that parses `### API-REQ-XXX` sections in `spec/api-requests.md` and extracts `id`, `status`, `route`, and `feFiles`.
2. Create `spec/api-requests.md` documenting:
   - Quy tắc phân quyền giữa **BE Agent** và **FE Agent** (BE giữ độc quyền tính toán & thao tác dữ liệu; FE chỉ hiển thị).
   - Mẫu phiếu `### API-REQ-XXX: <Tiêu đề>` và vòng đời `OPEN` → `IN_PROGRESS` → `DONE` / `REJECTED`.
   - 3 phiếu yêu cầu thực tế từ đợt khảo sát:
     - `API-REQ-001` (`OPEN`, route `GET /periods/:month`): Trả sẵn danh sách `errorSlips: Array<{ username, name, errorCode, errorDetail }>` của toàn kỳ trong `GET /periods/:month` để `ApprovePeriodDialog.vue` không phải tự gọi lặp nhiều trang `/payslips?status=error`.
     - `API-REQ-002` (`OPEN`, route `GET /sheet`): Trả sẵn `summary: { lateMinutes, deductedMinutes }` trong `actualReport` để giao diện nhân viên (`staff-phone`) hiển thị trực tiếp, không phải tự cộng `r.late` hay lấy nhầm tiền `m.cut`.
     - `API-REQ-003` (`OPEN`, route `GET /staff`): Trả sẵn `startDateRequired: boolean` trên từng phần tử của `GET /staff` để màn Tổng quan (`overview.ts`) và Nhân sự (`staff.ts`) không phải tự suy đoán theo mã loại nhân sự.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts test/unit/spec-refs.test.ts`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/contracts/ spec/api-requests.md test/unit/api-contract.test.ts
git commit -m "feat(contracts): add FE-to-BE API request ledger and static boundary tests"
```

---

### Task 4: Thực thi 3 yêu cầu `API-REQ-001`..`API-REQ-003` trên BE và đóng vòng đời hợp đồng

**Files:**
- Modify: `src/domain/period/periods.ts:182-218`
- Modify: `src/engine/actual-hours.ts:655-668`
- Modify: `src/modules/staff/staff.helpers.ts:45-95`
- Modify: `src/contracts/routes/payroll-contracts.ts`
- Modify: `src/contracts/routes/work-contracts.ts`
- Modify: `spec/api-requests.md`
- Modify: `spec/reference/api-contract.md` (via `npm run spec:gen`)
- Test: `test/unit/api-contract.test.ts`

**Interfaces:**
- Produces:
  - `errorSlips: Array<{ username: string; name: string | null; errorCode: string | null; errorDetail: string | null }>` on `GET /api/periods/:month` (`periods.view(month)`)
  - `summary: { lateMinutes: number; deductedMinutes: number }` on `actualReport` returned by `ActualHours.apply(...)` (and exposed in `GET /api/sheet`)
  - `startDateRequired: boolean` on each staff object returned by `GET /api/staff`

- [ ] **Step 1: Add failing tests in `test/unit/api-contract.test.ts` verifying `API-REQ-001`..`API-REQ-003` are `DONE` and BE produces the contracted fields**

```ts
const ActualHours = require('../../src/engine/actual-hours');

test('API-REQ-002: ActualHours.apply trả sẵn summary.lateMinutes và summary.deductedMinutes', () => {
  const out = ActualHours.apply(
    { '2026-10-02': { kind: 'work', in: '08:00', out: '17:00' } },
    [
      {
        id: 1,
        date: '2026-10-02',
        state: 'closed',
        entry: {
          presIn: '2026-10-02T01:20:00.000Z',
          presOut: '2026-10-02T10:00:00.000Z',
          plannedShift: { code: 'n1', date: '2026-10-02', in: '08:00', out: '17:00', startIso: '2026-10-02T01:00:00.000Z', endIso: '2026-10-02T10:00:00.000Z' }
        }
      }
    ],
    { asOf: '2026-10-02T12:00:00.000Z', staff: { username: 'linh', type: 'nv' }, holidays: [], month: '2026-10' }
  );
  assert.deepEqual(out.summary, { lateMinutes: 20, deductedMinutes: 30 });
});

test('API-REQ-001..003: các phiếu yêu cầu khởi tạo đã được BE hoàn tất (DONE)', () => {
  const reqFile = path.join(__dirname, '../../spec/api-requests.md');
  const items = parseApiRequests(fs.readFileSync(reqFile, 'utf8'));
  for (const id of ['API-REQ-001', 'API-REQ-002', 'API-REQ-003']) {
    const found = items.find((i: any) => i.id === id);
    assert.ok(found, `Thiếu ${id}`);
    assert.equal(found.status, 'DONE');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts`
Expected: FAIL (`out.summary` is `undefined`, status is `'OPEN'`).

- [ ] **Step 3: Implement `errorSlips` in `periods.ts`, `summary` in `actual-hours.ts`, `startDateRequired` in `staff.helpers.ts`, and mark `API-REQ-001..003` as `DONE`**

1. In `src/domain/period/periods.ts` (`view(month)`):
   - When `slips` is present, include `errorSlips: slips.filter(s => s.status === 'error').map(s => ({ username: s.username, name: s.name ?? (s.staffTerms && s.staffTerms.name) ?? null, errorCode: s.errorCode || null, errorDetail: s.errorDetail || null }))`.
2. In `src/engine/actual-hours.ts` (`apply`):
   - Compute `lateMinutes` (sum of `r.late || 0` across `Object.values(report)`) and `deductedMinutes` (sum of `(r.cutStartMin || 0) + (r.cutEndMin || 0) + (r.gapCutMin || 0)` across `Object.values(report)`), and return `{ days: out, report, missing: waiting, absent: absent.sort(), summary: { lateMinutes, deductedMinutes } }`.
3. In `src/modules/staff/staff.helpers.ts`:
   - Include `startDateRequired: Boolean(params[`type.${s.type}.startDateRequired`])` on each serialized staff profile in `GET /api/staff`.
4. Update `src/contracts/routes/payroll-contracts.ts` and `src/contracts/routes/work-contracts.ts` with the newly added response fields, run `npm run spec:gen`, and update `API-REQ-001`..`API-REQ-003` to `DONE` in `spec/api-requests.md`.

- [ ] **Step 4: Run all contract, spec, and unit tests**

Run:
```bash
npm run spec:gen
node scripts/dev/ts.cjs --test test/unit/api-contract.test.ts test/unit/spec-reference.test.ts test/unit/spec-refs.test.ts test/unit/no-tam-tinh-text.test.ts test/unit/file-size-budget.test.ts test/unit/architecture.test.ts
npm run typecheck
npm run typecheck:web
```
Expected: All tests PASS with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/domain/period/periods.ts src/engine/actual-hours.ts src/modules/staff/staff.helpers.ts src/contracts/ spec/ test/unit/api-contract.test.ts
git commit -m "feat(be): fulfill API-REQ-001..003 and update BE-FE API contract"
```
