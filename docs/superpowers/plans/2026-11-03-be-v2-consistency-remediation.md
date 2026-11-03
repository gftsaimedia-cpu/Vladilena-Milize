# BE V2 Consistency Remediation Implementation Plan

> **Trạng thái:** Kế hoạch remediation từ yêu cầu trước; hiện được thay thế bởi [thiết kế class, DB và API V2](../specs/2026-11-03-be-v2-class-db-api-design.md). Không phải phạm vi yêu cầu hiện tại.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document is a plan only; it has not been executed.

**Goal:** Make employee, request, and attendance V2 writes atomic, replay-safe, and consistent with domain rules while preserving employee identity and database history.

**Architecture:** Keep the synchronous NestJS modular monolith and PostgreSQL/Kysely. Move employee persistence behind one repository, use explicit transaction orchestration and shared transaction-scoped advisory locks, and additive request/attendance detail rows for reservations and effects. Preserve existing routes and historical rows.

**Tech Stack:** NestJS, TypeScript, Kysely, PostgreSQL, existing STORE transaction facade and XACT advisory locks.

**Spec:** docs/superpowers/specs/2026-11-03-be-v2-consistency-remediation-design.md

## Đọc nhanh

Làm theo thứ tự 1→2→3→4→5→6→9→10→11→7→8→12. Trước tiên xác nhận DB/migration và dữ liệu thật; sau đó tạo schema cùng transaction/lock boundary dùng chung, rồi mới cho các writer dùng boundary đó. Attendance engine phải tồn tại trước hiệu ứng request có thể yêu cầu tính lại ngày công. Quy tắc đã được user chốt: phiếu nghỉ PAID không đủ phép thì bị chặn ngay khi gửi; pending giữ chỗ, reject/cancel trả chỗ, approve chuyển giữ chỗ thành đã dùng đúng một lần; nghỉ UNPAID không trừ quỹ. Các lựa chọn thiết kế còn lại là đề xuất cần review, không phải quyết định đã được duyệt.

## Global Constraints

- The user-approved PAID leave rule blocks submission when entitlement minus consumed minus pending reservations is insufficient.
- Pending PAID leave reserves per-day bucket capacity; rejection/cancellation releases it; approval converts the reservation to consumption once without double subtraction. UNPAID leave does not use annual-leave balance.
- Keep existing V2 route paths and verbs; review actions remain uppercase APPROVE and REJECT.
- Use store.transaction for all multi-statement atomic operations. Do not use qb.transaction; the AppDialect rejects it.
- Before employee locks, acquire shared advisory gate `v2:attendance-periods` via proposed `new AdvisoryLocks(qb).acquireShared(key)` inside `store.transaction`; then acquire sorted exclusive keys `v2:employee:${uuid}`, then sorted date/range keys. Period lock/reopen takes the exclusive global gate first, then enumerates employees, takes their employee locks sorted, and persists the global range/period state. Employee create/reactivate uses the shared gate. No writer may take employee locks first.
- Keep raw punches append-only, preserve restrictive FKs, and deactivate rather than hard-delete employees.
- Keep staff.uuid and existing employee_id FK columns as TEXT; do not convert identity types globally.
- Every write that changes employee, request, leave reservation, punch/session, timesheet, or lock-range state follows the shared gate → sorted employee keys → sorted date/range keys order before reading mutable state. Employee create/reactivate or edits to period membership/eligibility (including payrollsubject) must take the shared gate. Period transitions exclusively gate normal writers while enumerating affected employees, preventing new/missing employees during range-lock creation.
- Do not rewrite migration history, reset databases, cascade-delete rows, or drop compatibility tables to make migrations pass.
- No frontend or payroll source cutover. Observed session OT is not automatically payable; advance approval is authorization only.
- Update source business specs only in the future documentation task below; the current approved leave rule overrides the present negative-balance allowance in spec/requests.md:350-354.
- Future rollout and manual SQL/API verification must use a disposable copy or explicitly approved staging DB. No live data reset or destructive downgrade.

## Review Focus

1. A PAID request whose dates draw from multiple expiring buckets is allocated according to the existing configured bucket policy; no balance is counted twice.
2. Same-key retries with identical payload replay the original result; changed payloads conflict and cannot leave partial state.
3. Stale employee/request versions and concurrent same-employee reservations return one winner and one 409 with no partial write.
4. Period locks block writes for dates with no timesheet row, while recalculation cannot clear a lock or overwrite a newer revision.
5. Night-shift date boundaries and observed break gaps retain Vietnam UTC+7 civil-date semantics and do not change payroll inputs.

## File Map

| Area | Files | Responsibility |
|---|---|---|
| Migration lineage | migrations/postgres/0001_baseline.sql through the already applied chain; new next migration, expected 0007_v2_consistency.sql after inventory | Keep historical migrations immutable; add constraints, revisions, deactivation, request details/effects, sessions, lock ranges, and compatibility tables only where inventory requires them. |
| Generated DB types | scripts/docs/gen-db-types.ts; src/data/schema.generated.ts; src/data/legacy-schema.ts only for explicit compatibility | Generate typed representations for newly migrated tables; keep legacy types only while compatible physical tables/callers are retained. |
| Employee V2 | src/modules/employee-v2/employee-v2.module.ts; employee-v2.service.ts; employee-v2.controller.ts; src/data/employee-v2.repository.ts; src/domain/employee-v2/employee-account.ts; employee-contract.ts; employee-profile.ts | One employee persistence boundary, distinct primary/granted roles, explicit public DTO, canonical status, optimistic updates, and deactivation. |
| Request V2 | src/modules/request-v2/request-v2.module.ts; request-v2.service.ts; request-v2.controller.ts; src/data/request-v2.repository.ts; src/domain/request-v2/system-request.ts; types.ts; new request/leave-effect domain helper if needed | Conditional request transitions, actor context, idempotency, typed payload, date-level leave reservations, and approval effects. |
| Attendance V2 | src/modules/attendance-v2/attendance-v2.module.ts; attendance-v2.service.ts; attendance-v2.controller.ts; src/data/attendance-v2.repository.ts; src/domain/attendance-v2/punch-event.ts; daily-timesheet.ts; new punch-session/recalculator domain helpers | Trusted employee/shift/geofence inputs, explicit sessions, append-only punches, deterministic metrics, range locks, and CAS summaries. |
| Shared DB boundary | src/data/locks.ts; src/data/db-dialect.ts; src/data/postgres-database.ts; relevant src/data repositories | Preserve current query builder and ambient store.transaction protocol; do not introduce a second pool or independent transaction mechanism. |
| Future business-spec correction | spec/requests.md; spec/attendance.md; spec/reference/database.md; spec/reference/modules.md; spec/reference/api-routes.md | Document implemented behavior after code/schema changes. Do not edit these source specs during this plan-writing task. |

## Shared write contract (must precede every writer)

Task 2 defines proposed `src/data/v2-write-context.ts`: `ActorContext { actorId: string }`; `withEmployeeWrite<T>(employeeIds: string[], work: (ctx: V2WriteContext) => Promise<T>)` enters `store.transaction()`, acquires shared `v2:attendance-periods`, sorts UUIDs, then calls `new AdvisoryLocks(qb).acquire('v2:employee:' + uuid)` for each employee before mutable reads; dates/ranges follow in sorted order. The current class API is instance-based `new AdvisoryLocks(qb).acquire(key)` (`src/data/locks.ts:4-14`); add proposed `acquireShared(key)` backed by `pg_advisory_xact_lock_shared`. Period lock/reopen takes exclusive `new AdvisoryLocks(qb).acquire('v2:attendance-periods')` before employee enumeration, then sorted employee keys, then persists period/global-range state. Employee create/reactivate also takes shared gate. No `qb.transaction()`, new pool, or employee-first writer.

Production gate: before claiming the race is globally fixed, inventory all callers of period transitions and relevant writes. Confirm each uses the coordinator or is disabled/retired. Audit of legacy callers outside the scoped V2/data source review is a handoff prerequisite, not assumed complete here.

## Finding-to-task trace

| Finding | Planned task(s) | Acceptance evidence |
|---|---|---|
| F01 Approval status without durable domain effects | 6, 8 | Status, effect, audit, and version commit atomically; retries leave one effect. |
| F02 Attendance multi-write races/partial writes | 9–11 | Rollback leaves no partial punch/session/summary; concurrent operations serialize per employee. |
| F03 Client supplied shift/office authority | 9–10 | Server derives schedule/config; missing office config fails closed. |
| F04 Body-supplied actor identity | 4, 9 | Actor comes from authenticated context; payload cannot override it. |
| F05 Duplicate employee mapping and role loss | 3–4 | One repository maps persistence; primary and granted roles round-trip independently. |
| F06 Contract status round-trip/filter mismatch | 5 | Canonical employment status persists and filters consistently; ambiguous rows are reconciled. |
| F07 Stale employee/request writes | 5–6 | Expected-version conflict returns 409 and preserves the winner's state. |
| F08 Paid-leave work units are erased by recalculation; intervals/observed OT | 7–8, 11 | Reservation/effect transitions and recomputation serialize; approved PAID units survive empty/partial punch inputs. |
| F09 Timezone/night shift work-date drift | 10–11 | Fixed UTC+7 start-date cases produce stable civil work dates. |
| F10 Delete then restrictive-FK failure | 5 | Deactivation commits without deleting referenced history. |
| F11 Legacy schema declarations disagree with physical dependencies | 1–2 | Inventory and retain/reintroduce exact compatibility tables still queried. |
| F12 Polymorphic request payload constraints absent | 2, 6 | Per-type constraints and detail-owner FKs reject invalid/mismatched rows. |

## Vietnamese operational walkthrough

1. Task 1 ghi báo cáo inventory tại `docs/superpowers/reports/2026-11-03-be-v2-db-inventory.md`; đối chiếu migration ledger/schema thực tế với baseline đã review và ghi nhận dữ liệu mơ hồ mà không thay đổi DB.
2. Task 2 xác nhận/khôi phục migration chain bất biến, chỉ thêm schema tiến về trước, và đưa shared write context vào trước khi thay đổi bất kỳ writer nào.
3. Tasks 3–6 thiết lập boundary lưu employee/request và version. Tasks 9–11 xử lý punch tin cậy, correction session và tính lại công xác định. Task 7 giữ chỗ phép ngay lúc gửi PAID; Task 8 nối approve/reject/cancel với effects và tính lại trong cùng transaction.
4. Task 12 chỉ cập nhật tài liệu sau implementation và kiểm tra thủ công trên DB copy/staging phù hợp. Không reset DB; phiếu APPROVED thiếu effect row không được xem là bằng chứng chưa từng áp dụng.

## Interfaces and SQL Contracts

### Employee persistence

- EmployeeV2Repository methods: findByUsernameOrUuid(id) -> EmployeeSnapshot | null; list(filter) -> EmployeeSnapshot[]; save(input: { employee, expectedVersion, actor }) -> EmployeeSnapshot; deactivate(input: { username, expectedVersion, actor }) -> EmployeeSnapshot.
- EmployeeSnapshot is { employee: Employee, version: number, active: boolean }. Domain roles separate primaryRole from grantedRoles; API roles is a derived array.
- Employee save and supplementary role history changes run inside one store.transaction. SQL compares aggregate_rev, increments it, and returns the new version; no match returns typed EMPLOYEE_STALE.
- Module provider factory constructs EmployeeV2Repository from STORE.queryBuilder. EmployeeV2Service no longer builds row mappings or writes queryBuilder/staff_roles directly.

### Request persistence and leave

- RequestV2Repository transition(input: { id, expectedVersion, action, actor, note }) -> RequestSnapshot; action is APPROVE | REJECT | CANCEL. Transition SQL requires current status PENDING and matching rev; successful write increments rev.
- Request create operations use `v2_idempotency` keyed by `(actor_id, operation, idempotency_key)` with canonical payload fingerprint/result, persisted in the same transaction.
- Request leave resolver enumerates applicable full work dates and resolves eligible entitlement buckets under an employee lock. PAID day allocation rows sum to one day per requested work date, may split across buckets, and reference their LEAVE day; the day enforces parent ownership/type with the three-column composite FK below.
- `system_request_days` stores LEAVE dates only. The parent has unique `(id, employee_id, type)`; each child sets `request_type CHECK 'LEAVE'` and FK `(request_id, employee_id, request_type)` to that parent key, so ownership and kind are database-enforced without an index join. Parent CHECKs validate PAID/UNPAID payload shape. One partial unique `(employee_id, work_date)` covers PAID `RESERVED|CONSUMED` plus UNPAID `PENDING|APPLIED`; it prevents either payment kind from overlapping the other. RELEASED rows are excluded.
- `system_request_leave_allocations(request_id, work_date, bucket_key, days)` references its day via `(request_id, work_date)`; the day’s three-column parent FK already enforces owner and LEAVE type. Positive amounts sum to one PAID day. Reserved and consumed rows are not both counted for one effect state.
- system_request_effects stores correction, approved overtime interval, and advance-authorization effects with unique (request_id, effect_key). Corrections include session/original-source reference and audit; original punch is immutable. Advance authorization is not a disbursement.
- Per bucket/date capacity is `eligibleEntitlement(asOf, leaveDate) + eligibleAdjustments - openingConsumed - consumedNew - RESERVED`. Existing resolver filters expiry from eligible entitlement; do not subtract expired amounts again. PAID insufficiency returns 409 LEAVE_BALANCE_INSUFFICIENT with dates/requested/available; no parent, detail, reservation, or idempotency result persists. A manual adjustment must preserve `eligibleEntitlement + eligibleAdjustments >= openingConsumed + consumedNew + reserved`; if already violated, require explicit reconciliation.

### Attendance persistence

- RecordPunchInput accepted from HTTP retains existing `type: 'IN'|'OUT'`, user coordinates, optional note, sessionId for checkout, and Idempotency-Key. Employee ID, server punch time, work date, shift snapshot, and office configuration are derived server-side. Before making Idempotency-Key/sessionId required, gate release on client compatibility being confirmed; preserving route does not preserve payload compatibility. No frontend edits are included/authorized here.
- Check-in creates AttendanceSession { id, employeeId, workDate, openedAt, closedAt: null, version }; response returns sessionId. Check-out requires that sessionId, verifies owner and open state, appends OUT punch and closes session atomically.
- Raw punch rows reference sessionId and are append-only. PUNCH sessions require raw_in_event_id; raw_out_event_id is NULL while open and required when closed. CORRECTION sessions are closed full intervals with both raw references NULL; corrections overlay effective times and never invent raw punches. A partial unique index permits only one open PUNCH session per employee. Duplicate client retries are handled by idempotency, not duplicate punch rows.
- Canonical signature everywhere: `AttendanceRecalculator.compute({ sessions, rawPunches, approvedCorrections, requestDays, shiftSnapshot, policySnapshot }): DailyMetrics`. `requestDays` includes all lifecycle states; the engine uses approved rows for work-unit precedence while pending PAID rows are checked by the attendance entitlement guard. It unions intervals, applies breaks once, keeps observed OT non-payroll, and uses policy values.
- `src/data/v2-write-context.ts` acquires shared global period gate before sorted employee locks, then sorted date/range keys, all inside store.transaction. Normal writes use shared `new AdvisoryLocks(qb).acquireShared('v2:attendance-periods')`, then exclusive `new AdvisoryLocks(qb).acquire('v2:employee:' + uuid)`. Period lock/reopen gets exclusive global gate before employee enumeration and employee locks. This prevents a new employee/payrollsubject from escaping a range lock. No `qb.transaction()` or new pool.
- saveComputedTimesheet uses expected rev and SQL conditions is_locked=false; it writes only computed fields and never changes is_locked. A lock race or stale revision returns typed conflict with no overwrite.

### Concrete schema contract owned by Task 2

- Reuse `staff` and `system_requests`; employee identity and duplicated `employee_id` remain TEXT. Add `v2_idempotency(actor_id, operation, idempotency_key PK, payload_fingerprint, result_json, created_at)`; same fingerprint replays, changed fingerprint conflicts.
- `system_request_days(request_id, work_date PK, employee_id, request_type CHECK 'LEAVE', state)` has parent unique `(id, employee_id, type)` and child composite FK `(request_id, employee_id, request_type)`. One partial unique `(employee_id, work_date)` covers PAID `RESERVED|CONSUMED` and UNPAID `PENDING|APPLIED`, preventing overlap between payment kinds; RELEASED is excluded. `system_request_leave_allocations(request_id, work_date, bucket_key PK, days)` references the matching day using `(request_id, work_date)`; PAID allocations for one date total exactly 1.
- `system_request_effects(request_id, effect_key PK, effect_type, outcome, payload_json, actor_id, created_at)` references its parent. `v2_leave_opening_consumption(employee_id, bucket_key PK, opening_used_days, cutover_at, migration_key, source_ref)` has a single opening snapshot; same-key/value rerun is no-op, mismatch stops, never sum parallel opening versions.
- `v2_attendance_sessions(id UUID PK, employee_id TEXT, work_date DATE, source CHECK PUNCH|CORRECTION, opened_at, closed_at, raw_in_event_id, raw_out_event_id, version)`: PUNCH requires raw IN; raw OUT is NULL only while open and required when closed. CORRECTION must be closed with both raw refs NULL. `v2_attendance_lock_ranges(period_key, start_date, end_date PK, state, actor_id, version)` remains effective for dates without sheets.
- Proposed interfaces live at exact paths `src/data/v2-write-context.ts`, `src/domain/request-v2/leave-reservation.ts`, `src/domain/attendance-v2/attendance-recalculator.ts`. No unnamed “projection repository” or alternate locking helper: projection writes belong to `src/data/employee-v2.repository.ts` and use the same UoW.

## Tasks

### Task 1: Reconcile migration history, runtime schema, and compatibility dependencies

**Files:** Read-only inventory; no source edits until the report identifies the applicable migration chain.

**Interfaces:** Produces an implementation input: applied migration names, physical table/column inventory, current data anomalies, and a list of data repository queries whose tables are absent from the working-tree migrations.

**Report:** `docs/superpowers/reports/2026-11-03-be-v2-db-inventory.md` (implementation artifact; create during this task).

- [ ] Inspect schema_migrations and physical table definitions on an approved disposable copy or staging DB, read-only. Record existing row counts and stable keys for staff, roles, requests, attendance, leave, and periods.
- [ ] Compare the applied chain to reviewed HEAD 9540fe1ce4c574376c592f864336ca2ed06c7e13. The working tree currently rewrites 0001 and deletes 0003–0006; do not assume it matches any deployed DB.
- [ ] Inventory src/data queries against legacy-schema.ts table names. It explicitly lists old tables while its comment says the physical tables were dropped (src/data/legacy-schema.ts:3-20); catalog.repository still queries leave_ledger (src/data/catalog.repository.ts:62-94). Classify each dependency from current repository code and deployed schema; do not claim all callers are retired.
- [ ] Produce a read-only anomaly report for duplicate active employee/date leave requests, invalid request payload shapes, NULL/ambiguous contract status, missing/duplicate UUIDs, orphan role rows, and leave opening balances.
- [ ] Inventory APPROVED historical requests without effect rows against audit trails and existing leave/payroll projections. Absence of an effect row does not prove an effect was never applied; reconcile only with evidence, mark proven historical effects without replay, and report unresolved cases rather than deducting twice.
- [ ] Write `docs/superpowers/reports/2026-11-03-be-v2-db-inventory.md` with applied migration list, actual columns/tables, row/key counts, ambiguity/anomaly report, and every still-used repository dependency missing from migration files.
- [ ] Gate migration authoring on a single reconciled historical chain. Restore exact historical migration files for applied databases; never substitute a rewritten baseline or reset the DB.

### Task 2: Add forward schema for consistency and compatibility

**Files:** Create the next contiguous migration after Task 1, expected migrations/postgres/0007_v2_consistency.sql; modify generated schema via the existing generator outputs.

**Interfaces:** Produces typed columns/tables for employee aggregate version/status/deactivation; request rev/details/effects/idempotency; attendance sessions/range locks/revision; and any still-required legacy compatibility tables.

- [ ] Preserve historical migration SQL byte-for-byte for deployed history. Add the new migration after the confirmed chain, expected 0007 only when inventory proves that number is next.
- [ ] Add staff aggregate_rev with initial value 1, deactivated_at/by, and a canonical employment_status constrained to tts, ctv, thuviec, nv, nghiviec. Keep old contract_status as a compatibility projection if existing readers require it. Keep staff.type as position classification.
- [ ] Add request rev and `v2_idempotency` keyed by `(actor_id, operation, idempotency_key)`, with canonical payload fingerprint and stored result/request identity. Same key + same fingerprint replays; different fingerprint conflicts.
- [ ] Add `system_request_days`, `system_request_leave_allocations`, and `system_request_effects` exactly as in the contract above, including composite owner FKs, full-day quantities, explicit lifecycle state, and active employee/date uniqueness.
- [ ] Add system_request CHECK constraints per type, status/review consistency, dates/order, time formats, positive finite quantities, and valid enums. Add CHECK/FK as NOT VALID, reconcile existing rows, then validate. Preflight duplicates/nulls before UNIQUE indexes or SET NOT NULL; those cannot be marked NOT VALID.
- [ ] Add TIME_CORRECTION columns `correction_mode`, `correction_session_id`, `correction_actual_at`, `correction_start_at`, `correction_end_at` with mode-dependent checks: PATCH_SESSION requires target session, punch type, actual instant and excludes interval; ADD_INTERVAL requires ordered start/end and excludes patch fields.
- [ ] Encode correction mode shape: PATCH_SESSION requires sessionId/punchType/actualAt; ADD_INTERVAL requires ordered startAt/endAt and forbids patch-only fields. A correction session must be closed with source CORRECTION and a request date matching server-resolved workDate; both raw event refs are NULL only for this mode (open PUNCH may have raw OUT NULL).
- [ ] Add `v2_attendance_sessions` and punch_events.session_id FK; add one-open-PUNCH-session-per-employee partial unique index. PUNCH requires raw IN; raw OUT is nullable while open, required when closed. CORRECTION is closed with both raw references NULL. Add `v2_attendance_lock_ranges` and timesheet rev. Keep restrictive employee FKs and add no CASCADE.
- [ ] Add the single-row-per-employee/bucket `v2_leave_opening_consumption` with cutover/migration/source evidence columns. Backfill once from reconciled opening state; mismatch on rerun stops for manual reconciliation.
- [ ] Add the shared `src/data/v2-write-context.ts` helper before feature writers change. It wraps `store.transaction()`, takes shared global gate, then the common `v2:employee:${uuid}` exclusive advisory locks in sorted order; period lock/reopen takes exclusive global gate before enumerating employees and taking their sorted locks. All employee create/reactivate and payrollsubject/membership-changing writes also participate.
- [ ] Where an existing supported repository needs a physical legacy table missing from the confirmed deployed schema, add that exact table/columns/indexes additively and preserve its existing rows. Do not delete exports or replace monthly data with daily data as a shortcut.
- [ ] Backfill existing UUIDs once only after verifying references. Map contract_status probation→thuviec and official→nv; leave ambiguous NULL values for explicit reconciliation, never infer status from type or payroll_subject. Insert one versioned opening consumption snapshot from reconciled legacy leave state to prevent double counting.
- [ ] Generate src/data/schema.generated.ts from confirmed migrations. Do not hand-edit generated types.

### Task 3: Make employee repository the sole persistence boundary

**Files:** Modify src/modules/employee-v2/employee-v2.module.ts, employee-v2.service.ts; src/data/employee-v2.repository.ts; src/data/index.ts only if the established export boundary needs it.

**Interfaces:** EmployeeV2Repository.findByUsernameOrUuid, list, save, deactivate as defined above. EmployeeV2Service consumes repository snapshots and returns domain/result types only.

- [ ] Register EmployeeV2Repository using a module provider factory from STORE.queryBuilder, matching request-v2.module.ts and attendance-v2.module.ts provider construction.
- [ ] Move EmployeeV2Service rowToEmployee/save/find/list/delete mapping into repository. Keep exactly one fromRow/toRow implementation.
- [ ] Add a typed EmployeeSnapshot carrying revision and active state. Normalize primaryRole from staff.role and supplementary grants from active staff_roles rows in one mapper.
- [ ] Filter deactivated employees by default while allowing explicit identity lookup for historical/review flows.
- [ ] Persist staff and staff_roles history from one repository call; require the caller's store.transaction around the whole operation.

### Task 4: Preserve employee roles and public credential boundary

**Files:** Modify src/domain/employee-v2/employee-account.ts; employee-v2.repository.ts; employee-v2.service.ts; employee-v2.controller.ts.

**Interfaces:** EmployeeAccount primaryRole/grantedRoles; EmployeeAccountDTO with no passwordHash; explicit credential reset input containing plaintext password only.

- [ ] Define primaryRole as the first-class staff.role field and grantedRoles as staff_roles extras. Keep API roles derived, with deterministic order.
- [ ] Ensure unrelated profile/contract/shift/leave updates never write account role or credentials unless those fields are present in an account-specific operation.
- [ ] Keep passwordHash out of EmployeeAccountDTO, EmployeeDTO, toJSON(), and HTTP responses. Reject passwordHash from request bodies; hash plaintext password inside the trusted service.
- [ ] Derive lockedBy/grantedBy from authenticated context; ignore/reject client actor fields. Do not let client-supplied actor values enter audit or role history.
- [ ] Manual acceptance: staff.role=admin with one supplementary grant survives GET then PATCH profile unchanged; public JSON contains no pass_hash/passwordHash; repeated role save does not duplicate grants and revoked rows remain historical.

### Task 5: Canonical status, stable UUID, versioned employee writes, and deactivation

**Files:** Modify src/domain/employee-v2/employee-contract.ts; employee-profile.ts; employee-v2.repository.ts; employee-v2.service.ts; employee-v2.controller.ts; generated DB types as needed.

**Interfaces:** EmployeeSnapshot { employee, version, active }; save/deactivate take expectedVersion and actor; all successful PATCH responses include the new version.

- [ ] Hydrate and persist all five contract status values losslessly through canonical employment_status. Maintain the old probation/official projection only during compatibility rollout.
- [ ] Use the same canonical status in list filters; never filter domain nv against stored official or read status from position.type.
- [ ] Validate calendar dates, not only YYYY-MM-DD shape. Preserve staff.uuid TEXT and never create a random UUID during read/hydration; a NULL UUID must be backfilled once before use.
- [ ] Implement conditional update by username and expected aggregate_rev, increment and return version. Stale write returns 409 EMPLOYEE_STALE with no fields changed.
- [ ] Use column-specific updates for each patch or reload under the same transaction before updating. Do not replay a stale whole-aggregate snapshot across unrelated fields.
- [ ] Replace DELETE with deactivate: set deactivation metadata, retain staff row, UUID, role history, and all restrictive child FKs. Inactive employees cannot create new attendance/requests; historical lookup remains available.
- [ ] Manual acceptance: round-trip/filter each of tts, ctv, thuviec, nv, nghiviec; two simultaneous updates from one version yield one success and one 409; deactivation with punches/timesheets/requests/reviewer links preserves every FK and row.

### Task 6: Harden request model, parent schema, transition CAS, and actors

**Files:** Modify src/domain/request-v2/system-request.ts and types.ts; src/data/request-v2.repository.ts; src/modules/request-v2/request-v2.service.ts, controller.ts, module.ts; generated DB types.

**Interfaces:** RequestSnapshot { request, version }; transition({ id, expectedVersion, action: APPROVE|REJECT|CANCEL, actor, note }); request creation accepts trusted employee identity and Idempotency-Key metadata.

- [ ] Add constructor-level validation matching the four request variants; finite numeric values, real calendar dates, positive amount/hours/days, and exact payload shape.
- [ ] Keep existing route paths and uppercase review actions. Set employee/reviewer/canceller identity from authenticated context, not body employeeId/reviewerId.
- [ ] Replace status-changing upsert with conditional PENDING + rev compare-and-swap; immutable request payload cannot be overwritten during review/cancel. Confirm consumers support expectedVersion before making it required.
- [ ] Add Idempotency-Key flow for each POST request route. Store actor/operation/key, canonical payload fingerprint, and result in the same transaction as request creation.
- [ ] Confirm consumers support Idempotency-Key before making it required; no frontend changes are authorized in this plan.
- [ ] Same key and same normalized payload returns original response; same key and different payload returns 409 IDEMPOTENCY_KEY_REUSED. A thrown DB constraint/approval failure rolls back key/result and request changes.
- [ ] Persist structured request error codes: invalid shape 400; stale/already-decided 409; missing request 404. Do not collapse conflicts into BAD_REQUEST.
- [ ] Manual SQL/API acceptance: attempt each type with a missing required field, an unrelated type field, invalid interval/time, and NaN/Infinity equivalent; every row is rejected. Two decisions from the same rev cannot both commit.

### Task 7: Enforce PAID leave availability at submission

**Files:** Add `src/domain/request-v2/leave-reservation.ts`; modify request-v2.service.ts and controller.ts; src/data/request-v2.repository.ts; `src/data/employee-v2.repository.ts` for compatibility projection; generated DB types.

**Interfaces:** `LeaveReservationService.reserve({ employeeUuid, requestId, dates, idempotency, actor }) -> { allocations, availableByBucket }`; `release(requestId, actor)`; `consume(requestId, actor)`. PAID capacity logic uses the existing effective-date/bucket resolver; UNPAID bypasses annual balance. All run through `src/data/v2-write-context.ts`.

- [ ] Enumerate full work dates from the requested range using the existing calendar, holiday, employee schedule, and annual bucket allocation policy. Ignore client-provided daysCount as authority; validate against derived dates for API compatibility.
- [ ] In one `withEmployeeWrite` UoW, read eligible entitlement (existing resolver excludes expiry), eligible adjustments, opening consumption, consumed amounts, reservations, and manual adjustments; compute capacity per bucket/effective date without subtracting expiry twice.
- [ ] If any date cannot be allocated, throw 409 LEAVE_BALANCE_INSUFFICIENT with requested, available, and date/bucket context before writing parent request, details, reservations, cache, or idempotency result.
- [ ] For a valid PAID request, write request parent plus one day row per full date and bucket allocation rows whose quantities sum to that day. Mark each RESERVED. Enforce active employee/date uniqueness in SQL as a second defense.
- [ ] For UNPAID, persist day details as pending without annual bucket allocation; never subtract entitlement or increase consumed leave.
- [ ] On REJECT/CANCEL, atomically move reserved day/effect rows to RELEASED and recompute projection. On APPROVE, atomically move RESERVED to CONSUMED and update the parent; do not also subtract from cached used days as an independent write.
- [ ] Update leave_balance/leave_used_days only as compatibility projections from canonical rows inside the same transaction. Make opening-consumption migration idempotent by migration version and employee/bucket key.
- [ ] Manual acceptance with bucket: entitlement=10, consumed=4, prior pending reserve=3 gives available=3; request 4 is denied with no DB changes; request 3 succeeds; reject/cancel restores 3; approve changes available by 0 at decision time. With available=3 and two concurrent 2-day requests, exactly one commits. With zero balance, UNPAID creation succeeds without reservation.

### Task 8: Apply request effects exactly once

**Files:** Modify request-v2.service.ts and request-v2.repository.ts; add typed request effect methods/tables from Task 2; add correction effect domain/repository within V2 scope.

**Interfaces:** `applyApprovalEffects({ request, expectedVersion, actor }) -> RequestSnapshot`; `AttendanceRecalculator.compute({ sessions, rawPunches, approvedCorrections, requestDays, shiftSnapshot, policySnapshot }): DailyMetrics`. Every effect has a stable requestId/effectKey unique constraint and outcome state. The complete operation runs in one `withEmployeeWrite` UoW.

- [ ] Before any approval mutation, recheck global/range lock for every affected date under the gate and employee lock. If locked, return 409 PERIOD_LOCKED with no request status, effect/audit, leave consumption, projection, or summary change.
- [ ] For PAID leave, consume the reservation exactly once; for UNPAID leave, apply the day effect without annual-leave mutation. Update request status/version, effect/audit, compatibility projection, and recompute every affected work date using Task 11's engine in the same UoW/employee lock. Any failure rolls all of these writes back.
- [ ] For TIME_CORRECTION, support explicit `PATCH_SESSION { sessionId, punchType, actualAt }` and `ADD_INTERVAL { startAt, endAt }`. PATCH_SESSION overlays one side of an existing session. ADD_INTERVAL approval creates a closed `v2_attendance_sessions` row (`source='CORRECTION'`, both raw refs NULL), plus correction effect/audit, but never fake raw punches. Validate start < end and that server-resolved workDate equals the request date.
- [ ] Legacy `correctionDate/punchType/actualTime` requests resolve only when exactly one session exists for that employee/date. Zero or multiple candidates return 409 `CORRECTION_TARGET_REQUIRED`; require an explicit mode rather than guessing.
- [ ] For OVERTIME, record the approved date/time interval as authorization/effect. Do not feed observed session overtime into payroll and do not perform payroll source cutover in this scope.
- [ ] For ADVANCE, record APPROVED authorization and amount/period; do not mark paid, create transfer, or imply disbursement.
- [ ] Commit effect row, effect audit, request status/version, compatibility projection, and recomputed summaries for every affected date in one store.transaction and employee lock. Unique effect key prevents repeated approval/retry from duplicating state.
- [ ] Manual acceptance: retry approval and verify one effect; force an error after consume/effect but before summary save and verify full rollback; approve both PAID and UNPAID leave and verify all affected dates recompute; raw punches remain immutable; approved OT is not a payroll input; approved advance remains authorized/not disbursed.

### Task 9: Remove client authority over attendance identity, shift, time, and office

**Files:** Modify src/modules/attendance-v2/attendance-v2.controller.ts and attendance-v2.service.ts; employee/config adapters within src/data; request-v2.controller.ts for create actors.

**Interfaces:** HTTP RecordPunchCommand retains existing `type: 'IN'|'OUT'`, coordinates, note, optional sessionId for OUT, and Idempotency-Key. Service receives trusted employee UUID, server time, shift snapshot, office config, and lock context separately.

- [ ] Derive punch/request creator identity from authenticated context; reject or ignore body employeeId/reviewerId/actor overrides.
- [ ] Load employee status, UUID, effective shift and allowance from repository; do not accept workDate, punchedAt, shiftConfig, or officeLocation from punch body.
- [ ] Resolve office coordinates and radius through a trusted server-side settings adapter. Missing/invalid configuration fails closed with typed OFFICE_CONFIG_UNAVAILABLE; never treat absent office data as within radius.
- [ ] Under the employee lock, reject check-in when the work date has a full-day PENDING or APPROVED leave request, except existing documented approved-OT/makeup policy exceptions. Do not implement a new exception rule here.
- [ ] Keep client latitude/longitude as observations and validate finite/range/accuracy inputs. Administrative correction stays a separate audited operation.
- [ ] Require Idempotency-Key and sessionId on OUT only after confirming client compatibility; request/employee expectedVersion requirements also need consumer compatibility confirmation before rollout. Preserve POST /api/v2/attendance/punches, but do not infer payload compatibility from the unchanged route. No frontend edits are included/authorized here.
- [ ] Manual acceptance: spoofed employee, date, clock, shift, office/radius, isWithinOffice, and reviewer body fields cannot change the server-derived actor/configuration; missing office configuration writes no punch.

### Task 10: Add explicit attendance sessions and stable Vietnam work-date resolution

**Files:** Add src/domain/attendance-v2/punch-session.ts; modify punch-event.ts, attendance-v2.repository.ts, attendance-v2.service.ts, attendance-v2.controller.ts; use Task 2 schema; modify request correction DTO in Task 8.

**Interfaces:** checkIn(command) -> { sessionId, punch }; checkOut({ sessionId, command }) -> { sessionId, punch, timesheet }; both execute under employee lock and idempotency transaction.

- [ ] Check-in creates one server UUID session, inserts raw IN punch linked to it, and returns sessionId. Checkout requires that sessionId and validates employee owner, open state, and instant after check-in.
- [ ] Use a unique partial SQL constraint for one open session per employee; map violation to typed 409 OPEN_SESSION_EXISTS. Do not infer IN/OUT pairing by first-in/last-out global ordering.
- [ ] Assign workDate from shift start date in fixed UTC+7. Store instants as timestamptz and workDate as a civil DATE; retain local HH:mm shift times separately.
- [ ] Support CORRECTION-sourced closed sessions with no fabricated raw event rows; both raw references are NULL only for that source. Open PUNCH may have raw_out_event_id NULL; a closed PUNCH requires it. Enforce request-date/workDate match for approved ADD_INTERVAL.
- [ ] Preserve night-shift convention: 2026-11-03 21:00 ICT through 2026-11-04 06:00 ICT belongs to 2026-11-03 regardless of host TZ.
- [ ] Manual acceptance: check-out for another employee, stale/closed/unknown session, and out-before-in are rejected without writes; concurrent check-ins produce one open session; identical retry returns the original punch result.

### Task 11: Recompute attendance deterministically and coordinate locks

**Files:** Add src/domain/attendance-v2/attendance-recalculator.ts; modify attendance-v2.service.ts, attendance-v2.repository.ts, src/data/locks.ts only if a typed helper is required; update period lock integration in current V2/data boundary.

**Interfaces:** `AttendanceRecalculator.compute({ sessions, rawPunches, approvedCorrections, requestDays, shiftSnapshot, policySnapshot }): DailyMetrics`; `lockRange({ month, startDate, endDate, actor })`; `recompute({ employeeUuid, workDate, expectedRev }) -> revision`.

- [ ] Derive actual presence from the union of closed session intervals plus approved correction effects. Preserve raw punch rows; treat correction as effective overlay with source link and audit.
- [ ] Apply work-unit and break policy through the documented attendance/calendar policy adapter. Use time.workHoursPerDay=8 and break after 4 continuous work hours, break 1 hour; do not add 7/3.5 thresholds or claim parity until vector comparison supports it.
- [ ] Preserve source precedence: approved PAID full-day leave with no punches => workUnits=1, workHours=0; empty recompute and lone IN/no OUT retain workUnits=1. Approved UNPAID full-day leave => workUnits=0. Check-in is blocked by full-day PENDING/APPROVED leave except existing documented approved-OT/makeup cases; rejection/cancellation releases pending reservation.
- [ ] Verify policy vectors without relabeling presence as work: 08:00–17:00 is 540 minutes continuous presence, 480 work minutes after explicit 12:00–13:00 break. Separate 08:00–12:00 and 13:00–17:00 intervals are 480 presence/work minutes and receive no second break deduction. Apply policy adapter; do not introduce a new universal formula.
- [ ] Keep observed session OT separate from approved calendar OT and payroll. Preserve the existing documented distinction: Check-in/out OT is not payable by itself.
- [ ] Every write follows shared global gate → sorted exclusive employee UUID keys → sorted date/range keys inside store.transaction. Period lock/reopen takes exclusive global gate before employee enumeration, then employee keys sorted, and persists payroll_periods plus durable lock range atomically.
- [ ] Punch/recompute checks range lock even if timesheet row does not exist. Existing sheet lock is a defense, not the only gate.
- [ ] Write computed metrics with expected timesheet rev and WHERE is_locked=false. On stale/locked conflict, preserve the current row; never update is_locked from recompute payload.
- [ ] Manual SQL/API acceptance: lock a date range before any sheet exists, then a punch and recompute both fail; reopen then succeed. Race lock vs recompute and verify the lock wins or the stale recompute conflicts. Repeated recompute over identical source inputs produces identical metrics.

### Task 12: Reconcile specs and perform manual rollout verification

**Files:** Modify spec/requests.md, spec/attendance.md, spec/reference/database.md, spec/reference/modules.md, spec/reference/api-routes.md only after implementation contract is final. Do not edit docs/superpowers/PROGRAM.md in this task unless a later phase ledger explicitly requires it.

**Interfaces:** Documents describe implemented V2 behavior with exact source links, migration lineage, and API error/version/idempotency contract.

- [ ] Replace the negative-leave allowance text in spec/requests.md:350-354 with the approved insufficient-balance-at-submission rule, per-day bucket reservation, release, and one-time consumption. This is a future implementation deliverable; this plan-writing pass leaves the source spec untouched.
- [ ] Document attendance session identity, server-trusted shift/geofence values, UTC+7 start-date assignment, lock-range checks, and non-payroll observed OT in spec/attendance.md.
- [ ] Document additive schema, constraints, compatibility tables, canonical status, revisions, request-day/effect/idempotency rows, and deactivation in database/module/API references.
- [ ] On a disposable copy or approved staging database, apply the confirmed forward chain and compare row counts, UUIDs, request/attendance child references, and leave projections before/after. Do not run against a live database or reset volumes.
- [ ] Reconcile historical APPROVED requests with no proven effect via evidence-based opening mappings; do not bulk replay them. Report unresolved records for human decision. Rebuild timesheets only as dry-run diffs first, skip locked/paid periods, and require explicit reopen before any historical correction.
- [ ] Manually exercise API/SQL scenarios from Tasks 4–11, including rollback after an injected failure, two-connection leave reservation race, same-key replay/fingerprint conflict, restrictive FK preservation, and invalid CHECK inserts.
- [ ] Run only the repository's relevant non-test verification commands after implementation, such as npm run typecheck and npm run spec:check; no test files are added by this documentation plan unless a later explicit user decision changes the no-test constraint.
- [ ] Rebuild candidate timesheets only from canonical sources in dry-run/diff mode first. Skip locked or paid periods; correction requires explicit reopen through the existing workflow and an reviewed diff before any historical write.

## Dependency Graph and Ownership

Execution order: **1 → 2 → 3 → 4 → 5 → 6 → 9 → 10 → 11 → 7 → 8 → 12**. Keep this sequential order because shared module/repository files and the employee-lock UoW are common write surfaces. Task 7 depends on employee persistence (Task 5) and request model (Task 6); Task 8 depends on Task 7 plus the completed attendance session/recompute contracts (Tasks 10–11). Task 12 depends on every implementation task.

Task 2 is the sole owner of forward migrations/generated DB types and must land the shared transaction helper before Tasks 3–11 add writers. Employee tasks 3–5 precede request/attendance feature writes. Request approval cannot be wired before the recalculator exists because status, effect, projection, and every affected day's summary must commit together. Do not parallelize edits to shared employee/request/attendance service and repository files.

## Rollout and rollback guard

Use a reviewed worktree from base 9540fe1ce4c574376c592f864336ca2ed06c7e13 after reconciling the currently dirty shared tree; do not assume dirty files are present in that worktree, and do not autostash/reset them. Apply immutable migration history plus additive migration only after schema_migrations/physical-schema inventory. Rollback to an older application writer is safe only if that writer is compatible with reservation/version/effect state. Otherwise disable mutations under a maintenance gate while retaining new columns/tables, reconcile committed state, then roll forward with a compatible writer. Never use a destructive down migration, discard committed rows, or remove compatibility tables until all callers and data dependencies are explicitly retired.
