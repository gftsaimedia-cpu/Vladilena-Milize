# Admin Attendance Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin correct one selected attendance session or enter a new Admin attendance record, with auditable effective times and correct overnight handling.

**Architecture:** Keep the existing Nest attendance module → domain service → attendance repository/audit/event flow. Keep employee punch rows immutable; update the selected session's effective entry with optimistic versioning, or create a closed session marked as Admin-origin when the work date has no sessions. Add a dedicated admin UI service/API contract; do not write through `PUT /sheet`.

**Tech Stack:** NestJS, TypeScript, PostgreSQL/Kysely repository abstractions, Vue 3, Node test runner/PGlite.

**Spec:** `docs/superpowers/specs/2026-11-02-admin-attendance-correction-design.md`

## Global Constraints

- Use only the ZIP's `DayDetailDialog.vue` as the visual reference; do not import its backend or other archive UI.
- All writes require a required reason and the `attendance.correct` capability.
- Existing punch rows remain immutable; corrections store effective session times and append audit.
- An Admin record for a future date is effective immediately and counts as present/one valid workday; existing pay-hour rules still use the entered times and do not guarantee a full day's wage.
- An attendance-locked period blocks these writes; Admin must reopen the period before correcting it.
- A correction does not automatically approve or reject a separate explanation request.
- No schema migration or new dependency unless implementation proves it is necessary and the spec is updated first.

## Review Focus

- A day with no session becomes present only after Admin records a complete valid interval; assert it no longer appears as an unexplained absence and counts as one valid workday.
- A future Admin record is effective immediately, not staged; assert presence status and workday count.
- An overnight session keeps its original `workDate` while `checkOutAt` is on the next date; assert actual-hours output uses the corrected instant.
- Concurrent/stale session edits cannot overwrite a newer edit; assert `409` and unchanged newer values.
- Locked periods reject writes until reopened; assert no session/audit mutation on the rejected call.

---

### Task 1: Domain correction service and persistence semantics

**Files:**
- Create: `src/domain/attendance/admin-correction.ts`
- Modify: `src/domain/attendance/admin-presence.ts` only if needed to reuse its Admin-origin creation/audit path
- Modify: `src/domain/attendance/index.ts` only to export/register the service if required by current container pattern
- Test: `test/api/admin-attendance-correction.test.ts`

**Interfaces:**
- `correctSession({ caller, sessionId, expectedVersion, checkInAt, checkOutAt, reason, actx })` updates exactly one session, preserves session date and punch rows, records audit, and returns the new session.
- `createAdminSession({ caller, username, workDate, checkInAt, checkOutAt, reason, actx })` creates a closed Admin-origin session only when the employee has no attendance session for that work date.
- Both use the existing session repository CAS/update primitives and run write plus audit in one transaction.

- [ ] **Step 1: Add failing API tests for editing an existing session.** Cover updated effective timestamps, unchanged raw punches, unchanged `workDate`, required reason, capability enforcement, and audit before/after.
- [ ] **Step 2: Run the focused API test and confirm the missing route/behavior fails.** Run `node scripts/dev/ts.cjs --test test/api/admin-attendance-correction.test.ts`.
- [ ] **Step 3: Add failing tests for creating an Admin-origin session.** Cover a past date with no session, a future date effective immediately, and `409 SESSION_EXISTS` when a session already exists.
- [ ] **Step 4: Implement the domain service using existing session and AdminPresence/audit primitives; do not create fake punch rows.** Both timestamps and a nonempty reason are mandatory; a stale expected version returns `409`.
- [ ] **Step 5: Run the focused API test and confirm all domain/persistence assertions pass.**

### Task 2: API routes, authorization, and period lock

**Files:**
- Modify: `src/modules/attendance/attendance.controller.ts`
- Modify: `src/platform/authz.ts`
- Modify: `src/core/core.module.ts` or attendance module providers only if dependency injection requires it
- Test: `test/api/admin-attendance-correction.test.ts`
- Test: `test/api/period-lock-guards.test.ts` only for assertions specific to the new routes

**Interfaces:**
- `PATCH /api/attendance/sessions/:sessionId/correction` body: `{ checkInAt, checkOutAt, reason, expectedVersion }`.
- `POST /api/attendance/admin-sessions` body: `{ username, workDate, checkInAt, checkOutAt, reason }`.
- Both require Admin plus `attendance.correct`; the target must be payroll-attendance eligible and the session must belong to the authenticated target/date as applicable.

- [ ] **Step 1: Add failing route tests for invalid timestamps/order, invalid reason, unknown/mismatched session, unauthorized callers, and request-scope permissions.**
- [ ] **Step 2: Add failing tests asserting each route returns `409 PERIOD_LOCKED` and writes nothing after attendance lock, then succeeds after authorized reopen.**
- [ ] **Step 3: Register route capabilities and controller handlers; call the hard period check directly for these routes rather than the warning-only `guardPeriod` wrapper.**
- [ ] **Step 4: Verify mutation and audit are atomic; publish attendance change events only after commit.**
- [ ] **Step 5: Run focused API and period-lock tests; confirm the lock/reopen and permission cases pass.**

### Task 3: Admin time-correction UI and request service

**Files:**
- Modify: `web/src/views/admin/attendance/DayDetailDialog.vue`
- Modify: `web/src/services/admin-attendance.ts`
- Modify: `web/src/builders/admin-attendance/timesheet.ts`
- Modify: `web/src/views/admin/attendance/TimesheetView.vue` only if needed to open an empty-day create state
- Test: `test/unit/admin-attendance-correction-builder.test.ts`

**Interfaces:**
- `saveTimeFix` receives `{ personId, date, punchId?, checkInAt, checkOutAt, reason, expectedVersion? }`.
- Existing `punchId` selects the session correction route; no `punchId` uses the Admin-session creation route only when the date has no sessions.
- UI renders both dates for overnight times, shows selected session and source, and keeps reason mandatory.

- [ ] **Step 1: Add failing builder/service tests proving the selected `punchId`, full instants, reason, and version are sent to the correct API; verify there is no `PUT /sheet` call.**
- [ ] **Step 2: Implement the API client and display mapping for employee and Admin-origin sessions.**
- [ ] **Step 3: Update the dialog so empty days can enter Admin-created attendance; keep session selection for days with sessions and display date with each time.**
- [ ] **Step 4: Add UI/builder cases for overnight rollover, no-session creation, existing-session targeting, and missing reason.**
- [ ] **Step 5: Run focused unit tests plus `npm run typecheck:web`.**

### Task 4: Canonical spec and complete verification

**Files:**
- Modify: `spec/attendance.md`
- Modify: `spec/reference/api-routes.md`
- Test: `test/api/admin-attendance-correction.test.ts`
- Test: `test/unit/admin-attendance-correction-builder.test.ts`

- [ ] **Step 1: Update canonical attendance/API specs from the implemented routes and source-of-truth behavior.**
- [ ] **Step 2: Run focused API and unit tests, then `npm run test:api`, `npm run test:unit`, `npm run typecheck`, `npm run typecheck:web`, and `npm run spec:check`.**
- [ ] **Step 3: Run `npm test` as the final full-suite check and report every command's actual exit code.**
- [ ] **Step 4: Review the final diff against the approved design; do not merge, push, or deploy.**
