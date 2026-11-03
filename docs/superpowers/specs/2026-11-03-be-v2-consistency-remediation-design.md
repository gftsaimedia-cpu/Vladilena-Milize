# BE V2 Consistency Remediation — Design

> **Trạng thái:** Tài liệu này thuộc phạm vi remediation trước đó và được thay thế cho yêu cầu hiện tại bởi [thiết kế class, DB và API V2](2026-11-03-be-v2-class-db-api-design.md). Không dùng tài liệu này làm phạm vi yêu cầu hiện tại.

**Status:** Proposed design for review. The leave-submission rule below is an explicit user decision from chat on 2026-11-03; the remaining choices are proposals. This document does not authorize implementation by itself.

## Intent

Make the existing synchronous NestJS V2 employee, request, and attendance flows preserve their domain state across persistence, concurrent writes, retries, and PostgreSQL constraints. Keep the current PostgreSQL/Kysely modular monolith and current routes. Do not start a framework, ORM, event-bus, frontend, or payroll rewrite.

The current flows are controller → service → repository → Kysely. Request and attendance modules already construct repositories from the shared STORE query builder; employee-v2 does its own mapping and SQL in its service. Kysely queries share the facade transaction connection only when the caller wraps them in store.transaction (src/modules/employee-v2/employee-v2.module.ts:5-9; src/modules/employee-v2/employee-v2.service.ts:14-19; src/modules/request-v2/request-v2.module.ts:7-18; src/modules/attendance-v2/attendance-v2.module.ts:7-19; src/data/db-dialect.ts:28-35,44-63).

## User decision: stop unsupported paid-leave submissions

Reject a PAID leave request at submission when the employee does not have enough available leave. Available leave is calculated per applicable entitlement bucket and effective leave date as entitlement minus consumed leave minus all pending reservations. A pending PAID request reserves its dates immediately. Rejection or cancellation releases those reservations. Approval changes each reservation to consumed exactly once; it does not subtract the days a second time. UNPAID requests do not reserve or consume annual leave.

Creation, capacity check, reservation rows, request row, idempotency result, and cached balance projection commit or roll back together under the shared attendance-period gate and per-employee transaction lock. For two competing requests that cannot both fit, one commits and the other receives a typed insufficient-balance conflict with no request or reservation left behind.

The prior spec says submission does not check annual leave and permits a negative balance (spec/requests.md:350-354). This chat decision overrides that behavior. Updating the business spec is a future implementation-plan task; do not edit spec/requests.md as part of this design-only handoff.

## Goals

1. Use one EmployeeV2Repository as the only employee persistence and row-mapping boundary.
2. Keep primary account role distinct from granted supplementary roles; do not lose either during unrelated profile changes.
3. Keep credentials and caller-supplied actor fields out of public DTOs and trusted write decisions.
4. Round-trip all five contract statuses without reusing position.type as employment status, and filter on the same canonical value that is persisted.
5. Reject stale aggregate and request transitions through compare-and-swap versions.
6. Make employee/request/account/role writes atomic and make retries idempotent.
7. Deactivate employees while retaining stable identity and restrictive historical FKs.
8. Make request payload shape, transitions, reservations, and applied effects enforceable in both domain code and PostgreSQL.
9. Serialize attendance and leave writes per employee, preserve raw punch evidence, and derive daily summaries deterministically from trusted configuration and source events.
10. Make effective dates, local times, UTC instants, and numeric amounts retain their intended meaning.
11. Preserve deployed and still-used database history through additive migrations; do not reset a database or infer that a legacy caller is retired merely because its table type is labeled legacy.

## Non-goals

- No frontend changes or route renames.
- No payroll formula rewrite, payroll consumer cutover, or claim that observed overtime becomes payable.
- No automatic advance disbursement. APPROVED ADVANCE means authorization only; a transfer/disbursement workflow remains outside this scope.
- No change to the established annual-leave accrual, expiry, holiday, or configured bucket-allocation algorithms. Reuse their effective-date resolver and persist its allocation result.
- No global conversion of staff.uuid or its referencing employee_id columns from TEXT to PostgreSQL UUID.
- No hard deletion or cascading deletion of employee, role, punch, request, session, audit, or attendance history.
- No live database mutation or reset during this planning task.

## Approaches considered

| Approach | Advantages | Costs and risks |
|---|---|---|
| Patch each service and repository independently | Small local diffs | Leaves competing employee mappers, repeated status logic, and non-atomic request/attendance writers; fixes can drift again. |
| Add orchestration transactions and typed repository boundaries inside the existing monolith | Reuses Nest, Kysely, PostgreSQL, STORE, and transaction advisory locks; makes each operation one reviewable unit | Requires a forward migration and coordinated updates to the V2 modules. This is the recommended approach. |
| Move writes to asynchronous events/outbox consumers | Can isolate consumers and retries | Adds asynchronous consistency and operational state without a current need; complicates paid-leave reservation and immediate attendance responses. |

Recommendation: use the synchronous orchestration option. Keep the request parent as system_requests and add normalized, request-linked detail/effect rows only where date-level reservations or applied state require them.

## Domain and repository contracts

### Employee aggregate

- Employee identity remains stable uuid; username remains the account lookup key and is not reassigned by an update.
- EmployeeV2Repository owns all reads/writes for staff and staff_roles, including all hydration, persistence, list filters, deactivation, and expected-version checks.
- Account role state is represented as primaryRole plus grantedRoles. The public roles list is derived. staff.role stores primaryRole; staff_roles stores supplementary grants and preserves revoked history.
- EmployeeAccountDTO is explicit and excludes passwordHash. Public Employee DTOs and JSON serialization use that DTO. Password reset accepts plaintext only and hashes it server-side. Actor values such as lockedBy or grantedBy come from authenticated context, never the request body.
- Employee status is one canonical value from tts, ctv, thuviec, nv, nghiviec. Position.type remains a separate position classification. During compatibility rollout, one canonical column is authoritative and any legacy contract_status alias is a projection maintained by the repository.
- Employee writes carry expectedVersion and return the incremented version. A stale version returns 409 EMPLOYEE_STALE and writes nothing. Narrow aggregate patches must not persist unrelated stale snapshots.

### Requests and effects

- Keep existing routes: POST /api/v2/requests/leave, /correction, /overtime, /advance; PATCH /api/v2/requests/:id/review; PATCH /api/v2/requests/:id/cancel. Review actions remain uppercase APPROVE and REJECT.
- Parent request identity remains system_requests.id. Add a request revision and require expectedVersion for review/cancel transitions. Transitions are conditional from PENDING; a second decision receives 409 REQUEST_STALE or REQUEST_ALREADY_DECIDED and cannot overwrite the winner.
- For TIME_CORRECTION, add parent columns `correction_mode`, `correction_session_id`, `correction_actual_at`, `correction_start_at`, `correction_end_at`. CHECKs require PATCH_SESSION to have session/punch type/actual instant and no interval fields; ADD_INTERVAL requires ordered start/end and no patch fields. The current request date must match server-resolved workDate.
- Create operations accept Idempotency-Key. Scope a key by authenticated actor and operation, store a canonical payload fingerprint and result in the same unit of work, return the prior result for a repeated key with identical payload, and return 409 IDEMPOTENCY_KEY_REUSED when the same key has a different normalized payload. A rolled-back create leaves no key/result behind.
- Keep polymorphic request fields on the current parent for compatibility, but add type-specific PostgreSQL CHECK constraints for required fields, forbidden cross-type fields, valid status/review metadata, positive finite amounts, and ordered date intervals.
- Add request-linked per-day leave details and bucket allocations. For PAID leave, detail state transitions RESERVED → CONSUMED on approval, or RESERVED → RELEASED on rejection/cancellation. The transition and parent status update occur once in the same transaction. UNPAID detail rows carry no annual-leave reservation.
- Add request-linked effects for corrections, approved overtime intervals, and advance authorization. Correction effects point to the target session/date and preserve original punch rows; the correction and audit record commit with request approval. Overtime approval records the authorized interval but is not itself payroll input. Advance approval records authorization, not a disbursement.
- Correction mode is explicit: `PATCH_SESSION { sessionId, punchType, actualAt }` repairs one side of an existing session; `ADD_INTERVAL { startAt, endAt }` represents a missed full pair/no-session day. Approving `ADD_INTERVAL` creates a closed `v2_attendance_sessions` row with `source='CORRECTION'` plus correction effect/audit, but no synthetic raw punch rows. Both raw references are NULL only for this closed CORRECTION source; an open PUNCH may have NULL raw_out_event_id. The interval must be ordered and its server-resolved work date must equal the request date. For the legacy `correctionDate/punchType/actualTime` shape, resolve only when exactly one session exists for that employee/date; zero or multiple matches returns 409 `CORRECTION_TARGET_REQUIRED` and requires an explicit mode. Never guess a target.
- `system_request_days` contains only LEAVE request dates. Give the parent a unique owner key `(id, employee_id, type)`; the child has `request_type CHECK (request_type='LEAVE')` and composite FK `(request_id, employee_id, request_type)` to that owner, preventing wrong-owner or wrong-kind details without an index join. Parent CHECKs validate PAID/UNPAID leave shape. One partial unique `(employee_id, work_date)` covers active full-day rows for both payment kinds: PAID `RESERVED|CONSUMED`, UNPAID `PENDING|APPLIED`; therefore a PAID and UNPAID request cannot occupy the same employee/date simultaneously. RELEASED rows do not participate.

### Leave balance and opening snapshot

- Keep the existing annual-leave bucket resolver and its policy/configuration as the source of entitlement and expiry. Use full days only, matching fixed.leave.unit (spec/reference/params.md:136); do not create half-day values.
- Per bucket/date, available is `eligibleEntitlement(asOf, leaveDate) + eligibleAdjustments - openingConsumed - consumedNew - reserved`. The existing resolver determines eligibility and excludes expired entitlement; do not subtract expired amounts a second time. Respect configured bucket ordering and persist allocations.
- A manual balance adjustment runs under the same lock/UoW and must preserve `eligibleEntitlement + eligibleAdjustments >= openingConsumed + consumedNew + reserved` (equivalently, available remains nonnegative). If data already violates that invariant, require explicit reconciliation; never silently create a future negative balance.
- Migrate legacy used leave exactly once to a versioned opening-consumption snapshot keyed by employee and bucket. After cutover, request detail/effect rows are the only request-driven consumption/reservation source. Do not add both staff.leave_used_days and historical request usage a second time.
- staff.leave_balance / leave_used_days may remain compatibility projections, updated in the same transaction as the canonical rows; they are never an additional source of capacity.
- Cache is updated atomically and can be recomputed from canonical sources. A missing/ambiguous opening snapshot is a migration exception to reconcile, not a reason to guess or silently reset the balance.

### Attendance

- Preserve POST /api/v2/attendance/punches and its existing `type: 'IN'|'OUT'` field. The client supplies only type, coordinates, note, sessionId where required, and Idempotency-Key. The service derives employee identity from authenticated context; it loads shift/config and office coordinates/radius from trusted server sources. The client cannot choose employeeId, workDate, punchedAt, shift, or geofence result. Do not treat route preservation as payload compatibility: require client adoption of Idempotency-Key/sessionId before making those fields required; no frontend edits are included or authorized by this plan.
- Missing office configuration fails closed with a typed error; the service must not default to distance 0 / within-office true. Admin correction remains a separate audited action.
- Add explicit server-issued attendance session IDs: check-in creates a session and returns its ID; check-out must reference that open session and is verified against the authenticated employee. Punch rows are append-only and tied to the session. A unique partial open-session constraint prevents two open sessions for one employee. PUNCH session `raw_in_event_id` is required; `raw_out_event_id` is NULL while open and required when closed. CORRECTION sessions are closed full intervals and both raw references are NULL; corrections overlay effective time without mutating raw source/provenance.
- Server time determines punchedAt. Work date and shift are resolved in Vietnam time, fixed UTC+7 (420 minutes) with no DST, and an overnight shift belongs to its start date (spec/attendance.md:7-10,343-350; spec/reference/params.md:118). For example, a 2026-11-03 21:00 ICT shift through 2026-11-04 06:00 ICT has workDate 2026-11-03.
- Daily metrics are deterministic derived views of raw punch intervals, approved correction effects, approved/consumed request-day effects, and a captured shift/policy snapshot. At 08:00–17:00, continuous presence is 540 minutes; documented policy deducts the explicit 12:00–13:00 break, giving 480 work minutes. Two intervals 08:00–12:00 and 13:00–17:00 provide 480 presence/work minutes; do not deduct another break for that existing gap. Apply documented policy (8-hour work day and break after 4 continuous hours; spec/attendance.md:173-176) through the policy adapter; do not encode a new universal formula, invent 7/3.5 thresholds, or assert payroll parity.
- Recompute precedence is explicit: an approved PAID leave day with no attendance has `workUnits=1`, `workHours=0`; an empty input or a lone IN punch with no OUT cannot erase that paid unit. An approved UNPAID day has `workUnits=0`. On check-in, a full-day PENDING or APPROVED leave request blocks attendance; only the existing documented approved-OT/makeup exception can permit it. Reject/cancel releases pending leave and permits subsequent attendance under the same employee lock. Partial/missed punch correction follows the explicit correction modes above.
- Before any approval effect, recheck the durable period/range lock for every affected work date while holding the global gate and employee lock. If any date is locked, return 409 PERIOD_LOCKED before changing request status, effect/audit, reservation consumption, projection, or summary.
- Observed session overtime is an attendance metric, not automatically payable. The existing attendance spec says Check-in/out OT does not generate pay (spec/attendance.md:301); payroll only receives its approved calendar inputs. This remediation does not switch payroll sources.
- Every normal V2 write, employee create/reactivate, and employee update that changes period membership/eligibility (including payrollsubject) enters `store.transaction`, acquires shared gate `v2:attendance-periods` first via proposed `new AdvisoryLocks(qb).acquireShared(key)` (`pg_advisory_xact_lock_shared`), then exclusive employee keys `v2:employee:${uuid}` sorted, then date/range keys sorted. Existing `src/data/locks.ts` currently exposes `new AdvisoryLocks(qb).acquire(key)` (exclusive; lines 4-14); `acquireShared` is a proposed addition. Different employees remain concurrent.
- Period lock/reopen acquires exclusive `new AdvisoryLocks(qb).acquire('v2:attendance-periods')` first, then enumerates/captures affected employees, takes their employee keys sorted, and persists period state plus global durable range in one transaction. This gate prevents missed/new employees while enumeration is in progress. Period lock and all punch/recompute/request/employee membership writes must use this protocol; it adds no DB pool and uses no `qb.transaction()`.
- Keep payroll_periods as the authoritative period state and maintain a durable attendance lock-range projection in the same transaction as period lock/reopen. A locked range must reject a new punch even when no timesheet row exists yet. For existing rows, saveComputedTimesheet uses compare-and-swap version and WHERE is_locked=false; it cannot change the lock bit or overwrite a concurrent lock.
- Recompute summaries from canonical inputs; do not treat cached timesheet rows as source evidence. When source inputs change, recompute affected dates within the same transaction and write a summary revision.

## PostgreSQL and migration contract

### Proposed concrete table contract

Reuse `staff` and `system_requests`; the following exact table/column names are proposed for additions:

| Table | Key columns and constraints |
|---|---|
| `v2_idempotency` | PK `(actor_id, operation, idempotency_key)`; `payload_fingerprint`, `result_json`, `created_at`. Same key/fingerprint is a no-op replay; fingerprint mismatch conflicts. |
| `system_request_days` | LEAVE-only full-day rows. PK `(request_id, work_date)`; `employee_id TEXT`, `request_type CHECK 'LEAVE'`, `state`; parent unique `(id, employee_id, type)` and child composite FK `(request_id, employee_id, request_type)`. Parent CHECK validates PAID/UNPAID shape. One partial unique `(employee_id, work_date)` covers active PAID `RESERVED|CONSUMED` and UNPAID `PENDING|APPLIED` rows, so payment kinds cannot overlap; RELEASED is excluded. |
| `system_request_leave_allocations` | PK `(request_id, work_date, bucket_key)`; positive `days`, FK to matching request day. RESERVED/CONSUMED/RELEASED live on the day row; allocation sum for a PAID date is exactly 1. |
| `system_request_effects` | PK `(request_id, effect_key)`; `effect_type`, `outcome`, `payload_json`, audit actor/time; parent request FK. Advance amount is canonical decimal text at API/domain boundary and numeric in PostgreSQL. TIME_CORRECTION parent uses `correction_mode`, `correction_session_id`, `correction_actual_at`, `correction_start_at`, `correction_end_at` with mode-dependent checks. |
| `v2_leave_opening_consumption` | PK `(employee_id, bucket_key)`; `opening_used_days`, `cutover_at`, `migration_key`, `source_ref`. Repeating the same key/value is a no-op; mismatched rerun stops for reconciliation; do not add multiple opening versions. |
| `v2_attendance_sessions` | PK `id UUID`; `employee_id TEXT`, `work_date DATE`, `source PUNCH|CORRECTION`, `opened_at`, `closed_at`, `raw_in_event_id`, `raw_out_event_id`, `version`. PUNCH: raw IN required; raw OUT NULL only while open and required when closed. CORRECTION: closed, both raw refs NULL. |
| `v2_attendance_lock_ranges` | PK `(period_key, start_date, end_date)` with `state`, actor/time and version; employee/date writers consult the range even before a sheet exists. |

`src/data/v2-write-context.ts` is the proposed shared transaction/locking interface: `ActorContext { actorId: string }`; `withEmployeeWrite<T>(employeeIds: string[], work: (ctx: V2WriteContext) => Promise<T>): Promise<T>` wraps `store.transaction`, acquires `new AdvisoryLocks(qb).acquireShared('v2:attendance-periods')`, then sorted exclusive employee keys via `new AdvisoryLocks(qb).acquire('v2:employee:' + uuid)`, then sorted date/range keys before reads/writes. Period lock/reopen acquires the exclusive global gate first, then affected employee keys sorted. `acquireShared(key)` is a proposed addition to the existing class; current `acquire(key)` is an instance method (`src/data/locks.ts:4-14`). `src/domain/request-v2/leave-reservation.ts` owns `reserve/release/consume`; `src/domain/attendance-v2/attendance-recalculator.ts` owns pure `compute({ sessions, rawPunches, approvedCorrections, requestDays, shiftSnapshot, policySnapshot }): DailyMetrics`. `requestDays` includes all lifecycle rows; approved leave has precedence in work-unit projection, while pending PAID rows reserve balance and block check-in.

- Preserve staff.uuid TEXT and all employee_id TEXT FKs. Backfill a NULL uuid once only after reference inventory; do not generate transient UUIDs during hydration or convert types globally.
- Add employee aggregate version, canonical employment status, deactivation metadata, request version, request child/effect/idempotency structures, attendance session identity, range locks, and attendance summary revision additively. Keep old columns until compatibility callers are inventoried and moved.
- Add CHECK/FK constraints as NOT VALID where supported, audit and reconcile existing violations, then VALIDATE CONSTRAINT. UNIQUE indexes and NOT NULL are not made NOT VALID; preflight duplicate/null data, resolve it, then create unique indexes / SET NOT NULL.
- The current working tree rewrites 0001_baseline.sql and deletes 0003–0006 while migrations are under review. The migration runner rejects database migration names absent from the source list and expects contiguous order (src/data/postgres-database.ts:111-130). Before deployment, inventory schema_migrations and physical schema, restore the exact immutable migration chain appropriate to deployed databases, then append the next numbered migration (expected 0007 only after confirming history). Never deploy a rewritten baseline as a substitute for forward migrations, reset a DB, or delete rows/tables to make migration pass.
- src/data/legacy-schema.ts:3-20 says legacy table types remain so old repositories compile after physical tables were dropped. src/data/catalog.repository.ts:62-94 still references leave_ledger. Inventory all src/data repository queries and deployed physical tables; preserve or reintroduce exact compatibility tables additively wherever supported data-layer callers still depend on them. Do not assume type declarations prove runtime compatibility or that all callers are retired.
- Preserve old data and FKs. No CASCADE. No automatic mapping of an ambiguous NULL employment status from position.type or payroll_subject. Produce anomaly counts/examples for ambiguous status, UUID, role, request, and leave-opening data and reconcile before constraints.

## API and error contract proposals

- Existing route paths and verbs remain unchanged.
- Employee PATCH and request decision/cancel bodies carry expectedVersion; successful responses expose the new version. Stale state returns a typed 409 and no mutation.
- Idempotency-Key is required for request creation and punch writes. Same actor/operation/key plus same normalized payload returns the original result; a changed payload with the same key returns 409.
- Insufficient PAID leave returns 409 LEAVE_BALANCE_INSUFFICIENT with requested, available, and effective dates. Request parent, day details, reservations, and idempotency record are absent after rejection.
- Domain errors distinguish missing trusted office config, employee inactive, period locked, open-session conflict, overlap, stale version, invalid payload, and FK-preserving deactivation; they do not collapse all outcomes into generic 400.

## Finding-to-design trace

| Finding | Evidence in current tree | Design response |
|---|---|---|
| F01 Approval effects can be partial or replayed | request-v2.service.ts:170-201; request-v2.repository.ts:20-50 | Version-guarded status transition plus linked effect row in the same transaction; idempotent effect key. |
| F02 Attendance check/recompute/lock writes race | attendance-v2.service.ts:64-139; attendance-v2.repository.ts:71-115,250-261; locks.ts:4-14 | Shared employee XACT lock, durable range lock, append-only punches, summary CAS, one transaction. |
| F03 Client can supply attendance shift/office inputs | attendance-v2.service.ts:27-37,72-104 | Derive identity/time/shift/geofence from trusted server context; fail closed on missing office config. |
| F04 Client body can supply request/account actor fields | request-v2.controller.ts:16-20,114-120,130-137; employee-v2.controller.ts:105-130 | Actor and owner identity come from authenticated context; public command DTO excludes actor/hash overrides. |
| F05 Employee service duplicates mapper and loses primary role | employee-v2.service.ts:21-105,243-255; employee-v2.repository.ts:27-63,309-390 | One repository mapper; primaryRole is distinct from supplementary grants; account writes are atomic. |
| F06 Employment status does not round-trip/filter canonically | employee-v2.service.ts:48-57,123-131,160-167; employee-contract.ts:12-55 | Canonical five-value status separate from position.type; status filter queries that same canonical field. |
| F07 Stale employee/request snapshots overwrite newer state | employee-v2.controller.ts:69-100,178-250; employee-v2.service.ts:204-241; request-v2.repository.ts:25-48 | expectedVersion compare-and-swap; request transition from PENDING; reject stale writes without mutation. |
| F08 Paid-leave work units are erased by recalculation; intervals/observed OT | spec/requests.md:350-354; daily-timesheet.ts:241-340 | Reservation at submission and approval, with recompute of every affected date in the same unit of work; preserve paid work unit without punches and use interval union/policy adapter. |
| F09 Host timezone can move work date/night shift | attendance-v2.service.ts:72; daily-timesheet.ts:80-110; spec/attendance.md:7-10,343-350 | Server-derived UTC+7 work date; overnight shift retains start date; no host-time inference. |
| F10 Hard delete mutates roles before restrictive FKs fail | employee-v2.service.ts:261-269; 0001_baseline.sql:221-283 | Deactivate in transaction; preserve staff UUID and historical FK rows; do not cascade. |
| F11 Legacy type declarations do not prove physical compatibility | legacy-schema.ts:3-20; catalog.repository.ts:62-94 | Inventory data-layer table use and deployed schema; retain/reintroduce exact compatibility schema until supported callers move. |
| F12 Polymorphic request columns lack payload-shape constraints | 0001_baseline.sql:258-283; request-v2.repository.ts:20-50 | Type-specific CHECK constraints plus request child/effect rows, revision, and ownership FKs. |

## Acceptance examples

1. A bucket has 10 days entitlement, 4 consumed, and 3 already reserved by pending PAID requests. Available is 3. A new 4-day request is rejected at submission; a 3-day request succeeds and reduces available to 0. Rejection/cancellation restores 3. Approval converts reservation to consumption and leaves available unchanged from immediately before approval.
2. With 3 days available, two concurrent 2-day PAID requests for the same employee serialize on the employee lock. Exactly one succeeds; the other returns 409 with no request, day rows, reservations, or idempotency result persisted.
3. The same employee submits UNPAID leave with zero annual entitlement. The request can be created without annual reservation or consumption.
4. Two requests for the same PAID employee/date cannot both be active. A child detail cannot use an employee_id different from the parent request.
5. Two employee PATCH calls based on version 8 cannot overwrite each other. One commits version 9; the other receives 409 and preserves the winning fields.
6. A locked period rejects a punch for an employee/date with no timesheet row. The lock projection, not a pre-existing row, determines this result.
7. A retry with the same Idempotency-Key and same payload returns the same request/punch. The same key with a different payload returns 409.
8. A night shift starts 2026-11-03 21:00 ICT and ends 2026-11-04 06:00 ICT; it remains assigned to 2026-11-03 regardless of host timezone.

## Rollout and future spec work

1. Inventory migration history, deployed columns/tables, orphan/ambiguous values, still-used data repositories, and leave opening balances without mutating live data.
2. Restore/confirm immutable migration history, then apply additive migrations to a disposable copy or explicitly approved staging database. Compare row counts, key identities, and selected aggregates before/after.
3. Backfill stable UUIDs, canonical status only where source is unambiguous, employee/request versions, opening leave consumption once, and compatibility lock/effect projections. Quarantine unresolved rows for operator reconciliation.
   - Historical APPROVED requests with no new effect row are not proof that no effect occurred: a legacy flow or manual adjustment may already have applied it. Reconcile against evidence; create historical markers/opening mappings only when proven. Never auto-replay approved history or deduct it twice. Report unresolved rows for explicit reconciliation.
4. Deploy repository/service paths that write canonical and compatibility representations together. Validate constraints, switch reads to canonical fields, and retain old columns/tables until all supported callers are proven moved.
5. Before any historical timesheet rebuild, run a dry-run/diff from canonical sources. Skip locked or paid periods; if a correction is required there, explicitly reopen through the established workflow first. Never silently rewrite historical paid work units.
6. Update business specs in a future implementation task. In particular, replace spec/requests.md:350-354 with the approved no-negative-at-submission rule, reservations, release, and one-time consumption semantics; document V2 API, attendance sessions, UTC+7 start-date assignment, and not-payroll observed OT. Do not edit those source specs in this design-only step.

## Evidence reviewed

- Employee V2: src/modules/employee-v2/employee-v2.module.ts:5-9; src/modules/employee-v2/employee-v2.service.ts:21-57,153-269; src/modules/employee-v2/employee-v2.controller.ts:51-130,253-262; src/domain/employee-v2/employee-account.ts:19-26,107-125; src/domain/employee-v2/employee-contract.ts:12-55; src/data/employee-v2.repository.ts:21-22,27-63,160-210,309-404.
- Request V2: src/modules/request-v2/request-v2.controller.ts:8-145; src/modules/request-v2/request-v2.service.ts:76-201; src/data/request-v2.repository.ts:17-60; src/domain/request-v2/system-request.ts:74-108,110-264,267-347,418-454; src/data/schema.generated.ts:269-289.
- Attendance V2: src/modules/attendance-v2/attendance-v2.controller.ts:6-75; src/modules/attendance-v2/attendance-v2.service.ts:27-37,64-139; src/data/attendance-v2.repository.ts:18-36,71-115,250-261; src/domain/attendance-v2/daily-timesheet.ts:80-110,241-340.
- Database and constraints: src/data/locks.ts:4-14; src/data/db-dialect.ts:28-63; src/data/postgres-database.ts:111-130,202-205,285-297; migrations/postgres/0001_baseline.sql:185-207,221-283,304-308; src/data/legacy-schema.ts:3-20.
- Business rules: spec/attendance.md:7-10,173-176,301,343-350; spec/requests.md:341-354; spec/reference/params.md:118,133-136; spec/payroll-engine.md:278-284; docs/superpowers/plans/2026-11-02-admin-attendance-correction.md:16-29,41-49.
