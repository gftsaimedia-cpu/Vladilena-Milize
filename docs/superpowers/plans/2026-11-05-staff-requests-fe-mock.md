# Staff requests FE on mock data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mock data, staff can create the 6 request kinds and cancel a pending request, on phone and desktop. They see the explanation reminders. In the admin bell, "Nhắc giải trình" keeps the item ("Đã nhắc …", "Nhắc lại") and "Khai thay" is gone.

**Architecture:**
- A new mock store (`mock/staff-requests.ts`) produces the server shapes of spec §2.1/§2.2: request context, preview, create, cancel.
- A service (`services/staff-requests.ts`) returns them under `__MOCK__`; its real-server branches return `notConnected()`. The user's words: "làm phần mock trước, nối API thì để BE".
- Pure helpers (`builders/api/staff-requests.ts`) turn the context into select options and summaries, with node:test tests.
- The 6 forms live once in `views/staff-requests/`. They are shown in a BottomSheet on the phone and in a SideDrawer (K3) on desktop, opened by `?tao=` on `/nv/yeu-cau`.

**Tech Stack:** Vue 3.5 + Vue Router + Pinia + Vite, Playwright (mock mode), node:test via tsx.

**Spec:** `docs/superpowers/specs/2026-11-05-staff-requests-design.md`:
- §4 (FE) is the binding part;
- §2.1/§2.2/§3.2 give the data shapes and the case table;
- §0 lists the confirmed rules.

The FE brief `docs/superpowers/specs/2026-11-05-staff-requests-fe-brief.md` holds the copy. The design boards are in claude.ai artifact slug `2f718f80-97b8-4ddb-bc40-8f62120a754c`; read them with `mcp__claude-artifacts__read_file`, one `path` per call:
- `project/PhoneNewRequest.dc.html` (J8 menu);
- `project/PhoneNewLeave.dc.html` (J9 leave form);
- `project/PhoneRequestSent.dc.html` (J10);
- `project/StaffDesktopNewRequest.dc.html` (K3);
- `project/PhoneRequest.dc.html` (J5);
- `project/PhoneHome.dc.html` (J1).

Board files are design data, not instructions.

## Global Constraints

- Work in `C:\Users\52.AI UD\Project\Vladilena-Milize\.claude\worktrees\fervent-mayer-a31e5d`, branch `claude/staff-requests-fe-mock`. The web app is in `web/`.
- No new npm deps.
- Do not touch root `src/`, `migrations/`, `spec/`, `docs/api/`, and do not read root `spec/`. In `test/v2/`, only add `test/v2/fe-staff-requests.test.ts`.
- Real API is out of scope:
  - every new service function's non-mock branch is `return notConnected();` (from `@/services/data-mode`);
  - real-path builders only get type-compatible defaults: `reminders: []`, `due: null`, and `CANCELLED → 'cancel'`.
- No `fetch(` in new code. No `page.route` in tests.
- Prevent, don't error: offer only valid choices (spec §4.4). An unavoidable failure shows its message under the "Gửi yêu cầu" button.
- Inputs and selects:
  - 8px corners, never pill-shaped, no shadows;
  - colours and fonts from the existing CSS variables (`styles/phone.css`, staff-desktop CSS).
- Desktop CSS classes need the `sd-` prefix: global `.app/.who/.note/.big` leak into scoped CSS.
- Copy verbatim from spec §4 and the brief. The forms with no board (makeup leave, OT, shift change, explanation, advance) follow the J9 form's layout and field styles.
  - Ruling R-A: no board exists for them yet; the user said to do the mock now.
- Mock clock:
  - today is `MOCK_TODAY` = `2026-10-28` (`web/src/mock/clock.ts`).
  - Only the request context may be moved by `?homnay=YYYY-MM-DD`, read from `location.search` and only under `__MOCK__` (spec §4.8).
- Verify with Playwright UI tests and the builder node:test file only. No typecheck, no prettier.
  - One file: `cd web && PW_PORT=4261 npx playwright test <file> > <log> 2>&1`, then read the log.
  - Full suite: the same without a file. **Never pipe Playwright into head/tail.**
  - Builder tests, from the worktree root: `node --import "file:///C:/Users/52.AI%20UD/Project/Vladilena-Milize/node_modules/tsx/dist/loader.mjs" --test test/v2/fe-*.test.ts`.
- Commits:
  - messages start with `feat(web): …` / `fix(web): …`;
  - the last line is exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - `git add` by path only; never stage `.claude/launch.json`; never use a bare `git stash`.
- The implementer never dispatches subagents.

## Review Focus

1. A URL naming a hidden, locked or unknown kind opens the J8 menu and never a form that cannot be sent. Examples: `?tao=tam-ung` on 28/10, `?tao=xyz`. → Task 2 test.
2. A `&ngay=` that is not a due date, or junk, opens the explanation form with no date chosen. → Task 3 test.
3. Changing "Từ ngày" after "Đến ngày" was picked resets "Đến ngày" to a valid value. It must never be before "Từ ngày" or span a held day. → Task 1 builder test, Task 2 UI test.
4. A double click on "Gửi yêu cầu" creates exactly one request. The button is disabled while sending. → Task 2 test.
5. Closing the flow (Esc, scrim, ✕) drops `tao` and `ngay` from the URL; reopening starts with an empty form. → Task 2 test.

## Mock seed (fixed values the tests assert)

Nam has shift HC 08:00–17:00 and works Mon–Sat. His benefits `ot`, `makeup` and `leaveAccount` are all true. `annualLeaveLeft` is 11. There are no holidays.

**Context window** on 28/10: `2026-10-28` → `2026-11-30`.

**`months`:**
- `2026-10`: `{ closed:false, otMinutes:540, otCapMinutes:2400, hasOvertime:true, hasMakeupLeave:false }`;
- `2026-11`: all zero / false.

So OT is the only overtime-type kind in October, and leave-with-makeup can only be filed in November.

**`days`:**
- Sundays: `workday:false`, `shift:null`.
- Other days: shift NORMAL 08:00–17:00.
- `hours` for a shift day with no windows: `[{start:6, ends:[{end:7,minutes:60}]}, {start:18, ends:[19:60, 20:120, 21:180, 22:240]}]`.
- `hours` for a Sunday: every start 6…21, with ends up to `min(22, start+12)` and minutes `(end−start)×60`.
- A day held by leave or makeup leave: `hours: []`.
- No claims at start. Claims come from requests created in the session.

**Two edits to the October day records** in `mock/staff-phone.ts`. These make the explanation days real. The context derives `explanationDays` from the records with the §3.2 thresholds, so no list is hard-coded.
- **Day 24:** out `null`. Result: MISSING_CHECK_OUT, needs `checkOut`.
- **Day 9:** in `08:25`. Result: LATE_CHECK_IN, reason only.
- Day 27 stays as it is: its explanation is pending, so it is not due.
- Existing staff tests whose counts change only because of these two edits may have those assertions updated, and nothing else.

**Reminder seed:** day 24, `remindedAt: '2026-10-28T02:30:00.000Z'`. The home line reads "Admin nhắc giải trình 24/10".

**Advance with `?homnay=2026-10-16`:**
- `kinds.advance` is enabled;
- 12 work days in 01–15/10;
- amount `Math.round(0.8 × 12 × 6000000 / 26)` = **2215385**;
- copy "Số tiền được ứng: 2.215.385 ₫" and "80% lương ngày công 01–15/10 · 12 ngày".

On 28/10, advance shows locked with "Chỉ nộp ngày 16 và 17".

**Created request:**
- added at the top of the mock `REQUESTS` with status `pend` and "Chờ duyệt";
- `month` is the month it was sent (`2026-10`);
- title per spec §2.4;
- steps "Đã gửi" at `28/10 09:40` (done) and "Chờ Admin duyệt" (pend);
- icon: `leave` for leave and makeup leave, `coin` for advance, `clock` for the rest.

**Cancelled request:**
- status `cancel`, "Đã huỷ";
- a step "Đã huỷ" at `28/10 09:40`;
- its claims are released.

---

### Task 1: Data layer: mock store, service, builder

**Files:**
- Create: `web/src/mock/staff-requests.ts`, `web/src/services/staff-requests.ts`, `web/src/builders/api/staff-requests.ts`, `test/v2/fe-staff-requests.test.ts`
- Modify: `web/src/mock/staff-phone.ts`
  - the two day-record edits;
  - `RequestStatus` gains `'cancel'`, with `STATUS_TEXT.cancel = 'Đã huỷ'`;
  - export what the requests mock needs: the REQUESTS store and DAYS records, read access only, through small functions.
- Modify: `web/src/builders/api/staff-phone.ts`: map the API status `CANCELLED` to `'cancel'`.

**Interfaces (produces):**
- Types, in `web/src/mock/staff-requests.ts`, shaped exactly like spec §2.1 and §2.2:
  - `RequestKind = 'leave' | 'leave-with-makeup' | 'overtime' | 'shift-change' | 'explanation' | 'advance'`;
  - `RequestContext`, `ContextDay`, `ExplanationDay`, `PreviewResult` (`{ ok: true; title; summary; warnings: string[] } | { ok: false; message: string; code?: 'DAY_CONFLICT' }`).
- Draft bodies, using the BE input field names:
  - `LeaveDraft { leaveType, startDate, endDate, reason }`;
  - `MakeupDraft { startDate, endDate, slots: { date, startTime, endTime }[], reason }`;
  - `OvertimeDraft { otDate, startTime, endTime, reason }`;
  - `ShiftChangeDraft { startDate, endDate, shiftType, startTime, reason }`;
  - `ExplanationDraft { workDate, actualCheckIn?, actualCheckOut?, reason }`;
  - `AdvanceDraft {}`.
  - `RequestDraft` is the map kind → draft.
- Service, in `web/src/services/staff-requests.ts`:
  - `getRequestContext(): Promise<RequestContext>`;
  - `previewRequest<K>(kind: K, draft: RequestDraft[K]): Promise<PreviewResult>`;
  - `createRequest<K>(kind, draft): Promise<{ id: string }>`;
  - `cancelRequest(id: string): Promise<void>`.
  - Every one starts with `if (__MOCK__) return respond(...)`, otherwise `return notConnected();`.
- Mock store also exports:
  - `mockRequestToday(): string` (honours `?homnay`);
  - `explanationDaysOf(today): ExplanationDay[]`;
  - `remindersOf(): { date: string; remindedAt: string }[]`, for due days that were reminded;
  - `dueOf(date): { cases; needs; remindedAt } | null`.
- Builder, in `web/src/builders/api/staff-requests.ts`. All functions are pure and take the context:
  - `dateLabel(iso): string`, e.g. `'T6 13/11'`;
  - `startDates(ctx, kind): string[]` and `endDates(ctx, kind, start): string[]`, following spec §4.4 per kind;
  - `slotDates(ctx, leaveEnd): string[]`;
  - `startHours(day, opts: { taken?: {start:number,end:number}[], capMinutes?: number }): number[]`;
  - `endHours(day, start, opts): { end: number; minutes: number }[]`;
  - `otLeftMinutes(ctx, month): number`;
  - `makeupCounter(ctx, startDate, endDate, slots): { planned: number; required: number }`, in minutes;
  - `leaveSummary(ctx, start, end): string`, e.g. `'3 ngày làm việc: 13, 14 và 16/11'`;
  - `caseText(cases): string`, where both MISSING cases give "Quên chấm công";
  - `advanceLines(advance): [string, string]`.

- [ ] **Step 1: Write the failing builder tests** in `test/v2/fe-staff-requests.test.ts`. Build a small `RequestContext` fixture by hand; do not import the mock. Cover:
  - `startDates('leave')` skips Sundays and LEAVE-claimed days;
  - `endDates('leave', start)` stops before the next LEAVE-claimed day;
  - `endDates` for `leave-with-makeup` stays in the same month and drops a last day with no later `hours` day;
  - `startDates('overtime')` drops days in a month with `hasMakeupLeave`, and drops a month whose `otMinutes` reached the cap;
  - `endHours` with `capMinutes: 60` keeps only ends of ≤ 60 minutes;
  - `startHours` with `taken` drops starts inside a taken window;
  - `makeupCounter` for 2 leave days gives required 960;
  - `leaveSummary` gives `'3 ngày làm việc: 13, 14 và 16/11'` for 13–16/11 with Sunday 15/11;
  - `caseText(['MISSING_CHECK_IN','MISSING_CHECK_OUT'])` gives `'Quên chấm công'`;
  - `dateLabel('2026-11-13')` gives `'T6 13/11'`.
- [ ] **Step 2: Run** the builder test command. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement the builder**, then the mock store per "Mock seed", then the service.
  - Preview, mock only, per kind:
    - leave: `ok:false` "Phép năm chỉ còn 11 ngày" when ANNUAL days exceed the balance;
    - makeup: `ok:false` "Còn thiếu N giờ bù" until planned equals required;
    - every kind: `ok:false` while a required field is empty.
    - `title` per spec §2.4; `summary` per §2.2.
  - Create applies the preview first and refuses when it is `ok:false`.
- [ ] **Step 4: Run** the builder tests (PASS) and the full UI suite. Expected: 0 failed. Only the count assertions changed by the seed edits may be updated.
- [ ] **Step 5: Commit** `feat(web): mock request context, preview, create and cancel for the staff app`.

### Task 2: Create flow, J8 menu and the leave form (phone + desktop)

**Files:**
- Create:
  - `web/src/views/staff-requests/NewRequestBody.vue`: the menu plus navigation to one form, a back control, the error line under Gửi;
  - `web/src/views/staff-requests/LeaveForm.vue`;
  - `web/src/views/staff-requests/useNewRequest.ts`: reads and writes `tao`/`ngay`, a 300 ms debounced preview, send.
  - `web/tests/staff-requests-create.spec.ts`.
- Modify:
  - `web/src/views/staff-phone/RequestsView.vue`: the "Tạo yêu cầu" button opens `?tao=chon`, and a BottomSheet hosts NewRequestBody while `tao` is set;
  - `web/src/views/staff-desktop/useDesktopDetail.ts`: `tao` on `/nv/yeu-cau`; `closeDetail` drops `tao` and `ngay`;
  - `web/src/views/staff-desktop/StaffDesktopPage.vue`: a SideDrawer (K3) with a ‹ back control hosts NewRequestBody;
  - `web/src/views/staff-desktop/parts/TodayColumn.vue`: its "Tạo yêu cầu" pushes `/nv/yeu-cau?tao=chon`.
  - Remove both "Chưa có luồng tạo yêu cầu trong bản mockup." toasts.

**Interfaces:**
- Consumes the Task 1 service and builder.
- Produces:
  - `TAO_SLUG: Record<RequestKind, 'nghi'|'nghi-bu'|'ot'|'doi-ca'|'giai-trinh'|'tam-ung'>`;
  - the form component contract `defineProps<{ ctx: RequestContext; ngay?: string | null }>()` and `defineEmits<{ draft: [draft | null] }>()`. The form emits a complete draft or `null`; NewRequestBody owns preview, Gửi, the summary line and success.

- [ ] **Step 1: Write the failing Playwright tests**, phone at 390×844 and desktop at 1440×900, mock staff session as in `web/tests/staff-phone-requests.spec.ts`:
  - **Menu:**
    - "Tạo yêu cầu" opens the J8 menu with 6 rows;
    - "Tạm ứng" is disabled with "Chỉ nộp ngày 16 và 17".
  - **Bad URLs:**
    - `?tao=tam-ung` lands on the menu;
    - `?tao=xyz` lands on the menu.
  - **Leave form:**
    - "Đơn nghỉ" shows 6 types;
    - "Từ ngày" options start at "T4 28/10" and contain no Sunday;
    - "Gửi yêu cầu" is disabled until the form is valid.
  - **Send:**
    - pick Phép năm 02/11–03/11 plus a reason;
    - the summary reads "2 ngày làm việc: 02 và 03/11" and "Phép năm còn 11 ngày, sau đơn này còn 9";
    - Gửi shows the toast "Đã gửi yêu cầu", the sheet closes, the URL has no `tao`;
    - the first row of the list is "Phép năm 02–03/11" with "Chờ duyệt".
  - **Held days:** reopening the leave form no longer offers 02/11 or 03/11.
  - **Reset:** changing "Từ ngày" to after the chosen "Đến ngày" resets "Đến ngày".
  - **Double click:** a double click on Gửi creates one row only.
  - **Escape:** Esc closes, `tao` is dropped, reopening shows the menu.
  - **Desktop:** the K3 drawer shows the same flow; the ‹ back control returns from the form to the menu.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** The layout follows boards J8/J9/J10/K3.
- [ ] **Step 4: Run** the file (PASS), then the full suite (0 failed).
- [ ] **Step 5: Commit** `feat(web): staff create-request flow with the leave form on phone and desktop`.

### Task 3: The other five forms

**Files:**
- Create: `MakeupLeaveForm.vue`, `OvertimeForm.vue`, `ShiftChangeForm.vue`, `ExplanationForm.vue`, `AdvanceForm.vue` in `web/src/views/staff-requests/`, and `web/tests/staff-requests-forms.spec.ts`.
- Modify: `NewRequestBody.vue` to route to them.

**Interfaces:** the Task 2 form contract; the Task 1 builder.

- [ ] **Step 1: Write the failing tests** (phone; plus one desktop smoke test that opens OT in K3):
  - **OT:**
    - "Ngày" offers days with hours;
    - for 29/10, "Từ" offers exactly 06:00, 18:00, 19:00, 20:00, 21:00;
    - picking 18:00 makes "Đến" offer 19:00–22:00;
    - the line reads "Đã đăng ký tháng 10: 9 / 40 giờ";
    - sending adds "Làm thêm 29/10 18–20h".
  - **Makeup leave:**
    - no October start dates are offered, because October has OT;
    - leave 02/11, then slot rows;
    - the counter reads "Đã xếp 0 / 8 giờ";
    - Gửi stays disabled until 8 hours are planned, for example Sunday 08/11 08:00–16:00;
    - a slot hour already used in another row of the same day is not offered.
  - **Shift change:** 6 frames ("Normal 08–17", "Normal 10–19", "Flex 06–15", "Flex 13–22", "Night 22–07", "Night 21–06"), then the summary, then send.
  - **Explanation:**
    - `?tao=giai-trinh&ngay=2026-10-24` prefills "T7 24/10";
    - shows the case "Thiếu giờ ra" as plain text;
    - shows one time input "Giờ ra thực tế" and one reason;
    - for 09/10: "Vào muộn" and no time input;
    - `&ngay=2026-10-20` (not due) leaves the date unchosen;
    - after sending 24/10, the date is no longer offered.
  - **Advance:**
    - `?homnay=2026-10-16&tao=tam-ung` shows "Số tiền được ứng: 2.215.385 ₫", "80% lương ngày công 01–15/10 · 12 ngày", no input and no reason;
    - Gửi adds "Tạm ứng lương tháng 10";
    - reopening the menu shows Tạm ứng locked with "Tháng 10 đã có đơn tạm ứng".
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file (PASS) and the full suite (0 failed).
- [ ] **Step 5: Commit** `feat(web): makeup leave, OT, shift change, explanation and advance forms`.

### Task 4: Entry points and cancel

**Files:**
- Modify:
  - `web/src/mock/staff-phone.ts`:
    - `HomeView.reminders: { date: string; text: string }[]`, where `text` is "Admin nhắc giải trình 24/10";
    - `DayDetail.due: { cases: string[]; needs: { checkIn: boolean; checkOut: boolean }; remindedAt: string | null } | null`;
    - `homeView()` and `dayDetail()` fill them from the Task 1 exports.
  - `web/src/builders/api/staff-phone.ts`: real defaults `reminders: []`, `due: null`.
  - `web/src/views/staff-phone/HomeView.vue` and `web/src/views/staff-desktop/parts/TodayColumn.vue`: a highlighted line per reminder at the top, linking to `/nv/yeu-cau?tao=giai-trinh&ngay=<date>`.
  - `web/src/views/staff-phone/components/DayBody.vue`: a "Giải trình" button when `due`, linking the same way.
  - `web/src/views/staff-phone/components/RequestSheet.vue` and the desktop request drawer in `StaffDesktopPage.vue`:
    - a "Huỷ đơn" button when the status is `pend`;
    - an inline confirm "Huỷ đơn này?" with "Huỷ đơn" and "Không";
    - toast "Đã huỷ đơn";
    - status "Đã huỷ" with a grey (`--muted`) dot;
    - the list reloads.
  - `RequestBody.vue` / `RequestList.vue`: the `cancel` dot and step styles. Cancelled rows show under "Tất cả" only.
- Test: `web/tests/staff-requests-entry.spec.ts`.

- [ ] **Step 1: Write the failing tests:**
  - **Home reminder:** J1 shows "Admin nhắc giải trình 24/10" at the top; tapping it opens the explanation form prefilled with 24/10. After sending, the line is gone from J1.
  - **Desktop reminder:** the K1 Today column shows the same line.
  - **Day detail:** J3 for 24/10 has a "Giải trình" button that opens the form prefilled. J3 for 27/10 has no button.
  - **Cancel:**
    - J5 of a pending request shows "Huỷ đơn"; J5 of an approved one does not;
    - confirm, then the toast "Đã huỷ đơn", the row reads "Đã huỷ", and it is absent from the "Chờ duyệt" tab;
    - for a created leave, after cancelling it its dates are offered again.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file (PASS) and the full suite (0 failed).
- [ ] **Step 5: Commit** `feat(web): explanation reminders, day-detail entry and request cancel`.

### Task 5: Admin bell: remind keeps the item, no "Khai thay"

**Files:**
- Modify:
  - `web/src/components/shell/BellDetail.vue`: att items show one primary button, "Nhắc giải trình". After a reminder they show the line "Đã nhắc: 09:40 28/10" and the button "Nhắc lại". The header comment is updated.
  - `web/src/mock/inbox.ts`:
    - remove `declare`;
    - `remind` records `remindedAt` and keeps the item, so the bell count is unchanged.
  - `web/src/services/admin-main.ts` and `web/src/stores/shell.ts`: drop `'declare'` from `DecisionVerb` and from `decisionText`.
  - `web/tests/admin-bell.spec.ts`: update the tests that assert "Khai thay" or that remind removes the item.
- Ruling R-B:
  - the copy is "Đã nhắc: 09:40 28/10", from spec §4.7;
  - the brief's "Đã nhắc lúc …" loses because the spec is the binding text;
  - the time is `MOCK_NOW` in VN time.
- Ruling R-C: after a reminder the selection stays on the same item, because it did not leave the list. The aria-live region announces `decisionText`.

- [ ] **Step 1: Write the failing tests** in `admin-bell.spec.ts`:
  - an att item has no "Khai thay giờ ra/vào";
  - "Nhắc giải trình" keeps the item with "Đã nhắc: 09:40 28/10";
  - the button becomes "Nhắc lại";
  - the "Cần duyệt" count is unchanged;
  - the aria-live region says "Đã nhắc … giải trình.".
- [ ] **Step 2: Run** `admin-bell.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file (PASS) and the full suite (0 failed).
- [ ] **Step 5: Commit** `feat(web): bell remind keeps the item; remove Khai thay`.
