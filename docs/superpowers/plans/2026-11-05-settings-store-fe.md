# Settings store FE (mock) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Các màn Cài đặt (Lịch, Quy tắc KPI, Cách tính lương, Tất cả cài đặt), hồ sơ tuần làm việc và app nhân viên chạy đúng thiết kế Đợt 12 trên dữ liệu giả, có test giao diện; khi BE xong chỉ còn nối API.

**Architecture:**
- Một kho giả thuần `web/src/mock/settings.ts` trả đúng dạng phản hồi của spec BE §5.
- `web/src/services/settings-store.ts`: nhánh `__MOCK__` gọi kho giả, nhánh còn lại gọi route thật.
- Màn hình chỉ đọc dữ liệu đã dựng sẵn từ builder thuần:
  - `builders/api/settings.ts`: ô, nhãn, kiểm tra, câu xác nhận;
  - `builders/api/settings-screens.ts`: dựng từng màn;
  - `builders/api/check-in.ts`: khoá nút chấm công.
- Mỗi màn sửa số dùng chung composable `useSettingsDraft` và hộp `SaveConfirmDialog`.

**Tech Stack:** Vue 3 + Vue Router + Pinia + Vite, Playwright (chế độ mock).

**Spec:**
- `docs/superpowers/specs/2026-11-05-settings-store-fe-design.md`.
- Hợp đồng API: spec BE `docs/superpowers/specs/2026-11-05-settings-store-design.md` ở nhánh `claude/settings-store-7d80cb`, commit 4efb6d3, §5. Bản chép trong plan này đủ để làm.
- Artboard Đợt 12 trên bảng "Admin Dashboard Concept": M1–M5, N1, J11–J13.

## Global Constraints

**Phạm vi file**
- Chỉ sửa trong `web/` (và `docs/`).
- Không đụng `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc repo.
- Không thêm npm dependency.
- Mọi lời gọi HTTP đi qua `api()` của `web/src/services/http.ts`. Không viết `fetch(` mới.

**Test**
- Lệnh: `cd web && PW_PORT=4263 npx playwright test <file> > <file log ngoài repo> 2>&1`, rồi đọc log. Không pipe vào head/tail.
- Không dùng `page.route`. Không chạy typecheck hay prettier.
- Mỗi task viết test trước, chạy thấy FAIL rồi mới viết mã.

**File thuần**
- Các file được test thuần import trực tiếp: `mock/settings.ts`, `builders/api/settings.ts`, `builders/api/settings-screens.ts`, `builders/api/check-in.ts`, `builders/api/attendance.ts`.
- Các file này:
  - chỉ import bằng đường dẫn tương đối, không dùng `@/`;
  - không dùng `__MOCK__`, `window`, `navigator`, `document`;
  - `import { ApiError } from '../services/http'` thì được.

**Không phá test gốc**
- Không đổi tên hay bỏ export của `builders/api/calendar.ts` và `builders/api/staff-phone.ts`, vì `test/v2` import chúng.
- `calendarFromHolidays(...).payDay` vẫn là `null`.
- Không sửa phần nhật ký (`getAuditLog`, `verifyAuditLog`) trong `services/admin-config.ts`, vì nhánh audit-log đang sửa chỗ đó.

**Chữ hiển thị**
- Tiếng Việt, ngắn.
- Tiền: `15.500.000 đ`.
- Hệ số: `×1.5` (dấu chấm, theo ví dụ của người dùng).
- Phần trăm: `8%`, `1,5%` (dấu phẩy).
- Tháng: `Tháng 11/2026` trong ô chọn, `tháng 11/2026` trong câu.

**Giao diện**
- Ô nhập bo góc 8px. Không có ô hay nhãn hình viên thuốc.
- Trạng thái là chữ thường kèm chấm, ví dụ `• Đã chỉnh`.
- Mục chỉ xem là chữ thường, không phải ô bị khoá.

**Ngăn lỗi trước**
- Ô số bỏ lần gõ vượt `max` hoặc thừa chữ số thập phân.
- Ô ngoài khoảng thì hiện gợi ý ngay dưới ô và nút Lưu bị khoá.
- Lưu khoá khi chưa đổi gì.
- Ô tháng chỉ có 6 tháng, bắt đầu từ `minMonth` (`monthOptions(minMonth, 6)` ở `views/admin/settings/lib/date.ts`).

**Lưu**
- Lý do không bắt buộc, tối đa 300 ký tự (`REASON_MAX`). Để trống thì gửi `null`.
- Câu xác nhận có dạng `<nhãn ô> <cũ> → <mới>, áp dụng từ tháng MM/YYYY`. Vùng chấm công kết thúc bằng `, áp dụng ngay`.
- Lưu xong: `toast.ok('Đã lưu')`.
- Lỗi `409 SETTINGS_STALE`: `toast.error('Có người vừa lưu trước, đã tải lại')` rồi tải lại dữ liệu. Lỗi khác: `toast.error(e.message)`.

**Dữ liệu giả**
- Admin: hôm nay là thứ Tư 28/10/2026 (`MOCK_TODAY`). `MOCK_MONTH` = `2026-10` = `minMonth`.
- Mọi người làm T2–T7, công chuẩn 26. Lúc đầu không có tuần riêng và lịch sử trống, như BE vừa gieo.
- Vùng chấm công: 10.7769 / 106.7009 / 150 m.
- Người sửa ghi là `by: 'admin'`, giờ sửa là `MOCK_NOW` (hiện "28/10/2026 09:40").
- App nhân viên: mock luôn đang trong ca, nên nút đang hiện là Check-out.

**6 ca cố định (D7, spec BE §3.5)**

| Ca | Giờ |
|---|---|
| Normal 1 | 08:00–17:00 |
| Normal 2 | 10:00–19:00 |
| Flex 1 | 06:00–15:00 |
| Flex 2 | 13:00–22:00 |
| Night 1 | 22:00–07:00 |
| Night 2 | 21:00–06:00 |

Artboard M5 đang vẽ đảo giờ Night 1 và Night 2. Theo D7.

**Commit**
- Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không stage `.claude/launch.json`. Không dùng `git stash` trần.

## Review Focus

1. **Hai Admin lưu cùng nhóm.** Người lưu sau nhận 409, thấy câu báo, số trên màn được tải lại và phần đã gõ dở vẫn giữ.
   - Test thuần ở Task 1 kiểm mock trả `SETTINGS_STALE`.
   - Đường xử lý trên giao diện chưa có test vì mock chỉ có một người. Reviewer đọc `useSettingsDraft.save` ở Task 4.
2. **Đổi ô "Áp dụng từ tháng" sau khi đã gõ.** Ô chưa đụng tới thì đi theo số của tháng mới chọn, ô đã gõ thì giữ. Câu xác nhận so với số của tháng đã chọn. Test ở Task 4.
3. **Gõ thừa chữ số thập phân hoặc dưới mức sàn luật.** Gõ `1,555` vào OT bị bỏ. Gõ `1,4` thì khoá Lưu và hiện "Từ ×1.5 đến ×5". Test ở Task 8.
4. **Hoàn tác một trọng số KPI.** Mọi ô KPI của cùng lần lưu được trả về cùng lúc. Nếu trả về mà tổng không đủ 100 thì Hoàn tác bị khoá. Test ở Task 12.
5. **Đang chờ vị trí hoặc vị trí bị từ chối.** Trong lúc chờ, nút khoá và hiện "Đang lấy vị trí…". Bị từ chối thì hiện "Không lấy được vị trí". Test thuần ở Task 14, test giao diện ở Task 15.

---

## Đợt 1: Lớp dữ liệu, Lịch, Quy tắc KPI, Tuần làm việc

### Task 1: Kho giả `mock/settings.ts`

**Files:**
- Create: `web/src/builders/api/settings.ts` (trong task này chỉ có kiểu và `GROUP_PATH`)
- Create: `web/src/mock/settings.ts`
- Test: `web/tests/settings-mock.spec.ts` (test thuần, không mở trang)

**Interfaces**

*Produces* (kiểu, trong `builders/api/settings.ts`):

```ts
export type GroupKey = 'overtime' | 'attendance' | 'kpiWeights' | 'insurance' | 'tax' | 'payCalendar';
export type GroupPath = 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar';
export const GROUP_PATH: Record<GroupKey, GroupPath>;
export type Bracket = { upTo: number | null; ratePct: number };
export type Values = Record<string, number | Bracket[]>;
export type GroupState = { from: string; stamp: number; values: Values; defaults: Values; limits: Record<string, any>; sum?: number };
export type SettingsResponse = { month: string; minMonth: string; groups: Record<GroupKey, GroupState> };
export type SaveBody = { effectiveMonth: string; values: Values; reason: string | null; stamp: number };
export type SaveResult = { ok: true; effectiveMonth: string; changed: string[]; stamp: number };
export type HistoryItem = { id: number; field: string; month: string | null; from: any; to: any; by: string; at: string; reason: string | null };
export type PayDayItem = { month: string; payDay: number; payDate: string };
export type WorkWeek = { username: string; month: string; minMonth: string; weekdays: number[]; source: 'type' | 'own'; from: string | null; standardWorkdays: number; typeWeekdays: number[]; typeStandardWorkdays: number; stamp: number };
export type WorkWeekBody = { effectiveMonth: string; weekdays: number[] | null; reason: string | null; stamp: number };
export type Zone = { lat: number; lng: number; radiusM: number };
export type ShiftRow = { code: string; name: string; kind: 'normal' | 'flex' | 'night'; startTime: string; endTime: string };
```

*Produces* (hàm, trong `mock/settings.ts`; mỗi hàm trả bản sao):

```ts
export const MOCK_SHIFTS: ShiftRow[];                    // 6 ca theo D7, thứ tự Normal1, Normal2, Flex1, Flex2, Night1, Night2
export function resetSettingsMock(): void;
export function settingsAt(month?: string): SettingsResponse;   // bỏ month = MOCK_MONTH
export function saveGroup(path: string, body: SaveBody): SaveResult;
export function groupHistory(path: string): { items: HistoryItem[] };   // mới nhất trước
export function payDaysOf(year: number): { year: number; items: PayDayItem[] };
export function payDateOf(month: string): string;
export function workWeekOf(username: string, month?: string): WorkWeek;
export function saveWorkWeekOf(username: string, body: WorkWeekBody): { ok: true; weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; stamp: number };
export function workWeekHistory(username: string): { items: HistoryItem[] };
export function zoneOf(): { zone: Zone | null; stamp: number };
export function saveZoneOf(body: Zone & { reason: string | null; stamp: number }): { ok: true; zone: Zone; stamp: number };
export function holidaysOf(year: number): { items: { date: string; name: string }[] };
export function addHolidays(dates: string[], name: string): void;
export function removeHolidays(dates: string[]): void;
export function quickAddFixed(year: number): { added: string[] };   // 01-01, 04-30, 05-01, 09-02 chưa có
```

**Giá trị cố định**

Mặc định và giới hạn lấy đúng spec BE §5.1:

| Nhóm | Mặc định | Giới hạn |
|---|---|---|
| overtime | weekdayRate 1.5, weekendRate 2, holidayRate 3 | min 1.5 / 2 / 3, max 5, step 0.01 |
| attendance | lateGraceMinutes 15, diligenceLostFromDays 3 | 0–60 và 1–31, step 1 |
| kpiWeights | wework 40, user 24, peer 18, manager 12, self 6 | mỗi ô 0–100 step 1, `sum: 100` |
| insurance | bhxhPct 8, bhytPct 1.5, bhtnPct 1 | 0–100 step 0.01 |
| tax | personalDeduction 15500000, dependantDeduction 6200000, shortContractPct 10, shortContractThreshold 5000000 | tiền 0–1000000000 step 1; % 0–100 step 0.01 |
| tax (brackets) | `[{10000000,5},{30000000,10},{60000000,20},{100000000,30},{null,35}]` | `{ minRows:1, maxRows:10, upTo:{min:1,max:1000000000,step:1}, ratePct:{min:0,max:100,step:0.01} }` |
| payCalendar | payDay 10 | 1–28 step 1 |

Mỗi nhóm bắt đầu với một phiên bản ở tháng `2000-01` mang số mặc định (spec FE §2). `from` của nhóm là tháng của phiên bản đang hiệu lực.

Ngày lễ 2026 có 11 ngày:
- 01/01 'Tết Dương lịch';
- 16/02–20/02 'Tết Nguyên đán';
- 27/04 'Giỗ Tổ Hùng Vương (nghỉ bù)';
- 30/04 'Giải phóng miền Nam';
- 01/05 'Quốc tế Lao động';
- 01/09–02/09 'Quốc khánh'.

**Luật lưu từ tháng M** giống `planChange` của BE (`src/modules/positions/domain/version-chain.ts`; chỉ đọc file đó, không import):
- M đã có phiên bản thì sửa thẳng; chưa có thì chép phiên bản đang hiệu lực sang M.
- Ô nào đổi thì chép số mới sang từng phiên bản sau M theo thứ tự tháng. Dừng ở phiên bản đầu tiên mang số khác số cũ.
- So sánh giá trị bằng `JSON.stringify`, vì có mảng biểu thuế.

**Mỗi ô đổi** ghi một dòng lịch sử:
- `id` tăng dần, dùng chung một bộ đếm cho cả kho;
- `stamp` của một nhóm (hay một người, hay vùng) là `id` lớn nhất trong lịch sử của nó, 0 khi chưa có.

**Lỗi** ném `ApiError`:

| Khi nào | Mã | Thân lỗi |
|---|---|---|
| `stamp` lệch | 409 | `{ code: 'SETTINGS_STALE', stamp }` |
| `effectiveMonth < minMonth` | 400 | `{ code: 'BAD_SETTINGS_INPUT', field: 'effectiveMonth' }` |
| tổng KPI khác 100 | 400 | `{ code: 'BAD_SETTINGS_INPUT', field: 'kpiWeights' }` |
| tên nhóm lạ | 404 | `{ code: 'SETTINGS_GROUP_NOT_FOUND' }` |

**Ngày trả lương:** `payDate` của tháng M là ngày `payDay` (số đang hiệu lực ở M) của tháng M+1, không dời ngày.

**Tuần làm việc:**
- Dùng cùng luật lưu từ tháng M, theo từng người, ô `weekdays`. `null` nghĩa là theo loại nhân sự.
- Theo loại nhân sự: `typeWeekdays [1,2,3,4,5,6]`, `typeStandardWorkdays 26`.
- Tuần riêng: `standardWorkdays = Math.round(n * 52 / 12)`.

**Các bước**

- [ ] **Step 1: Viết test thất bại** `web/tests/settings-mock.spec.ts`. Có `test.beforeEach(resetSettingsMock)` và các test:

```ts
test('defaults and limits follow the BE contract', () => {
  const s = settingsAt('2026-10');
  expect(s.minMonth).toBe('2026-10');
  expect(s.groups.overtime.values).toEqual({ weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 });
  expect(s.groups.overtime.limits.weekdayRate).toEqual({ min: 1.5, max: 5, step: 0.01 });
  expect(s.groups.kpiWeights.sum).toBe(100);
  expect(s.groups.payCalendar.limits.payDay).toEqual({ min: 1, max: 28, step: 1 });
  expect(s.groups.tax.values.brackets).toHaveLength(5);
  expect(s.groups.overtime.stamp).toBe(0);
});
test('saving from month M keeps a later deliberate value (OT lễ ×3.5 / ×3.2)', () => {
  const a = saveGroup('overtime', { effectiveMonth: '2027-03', values: { holidayRate: 3.5 }, reason: null, stamp: 0 });
  saveGroup('overtime', { effectiveMonth: '2026-12', values: { holidayRate: 3.2 }, reason: null, stamp: a.stamp });
  expect(settingsAt('2026-11').groups.overtime.values.holidayRate).toBe(3);
  expect(settingsAt('2026-12').groups.overtime.values.holidayRate).toBe(3.2);
  expect(settingsAt('2027-02').groups.overtime.values.holidayRate).toBe(3.2);
  expect(settingsAt('2027-03').groups.overtime.values.holidayRate).toBe(3.5);
});
test('a later version still carrying the old number takes the new one', () => {
  const a = saveGroup('overtime', { effectiveMonth: '2027-03', values: { holidayRate: 3.5 }, reason: null, stamp: 0 });
  saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, reason: null, stamp: a.stamp });
  expect(settingsAt('2027-03').groups.overtime.values.weekdayRate).toBe(1.6);
});
test('each changed field adds one history row and moves the stamp', () => {
  const r = saveGroup('overtime', { effectiveMonth: '2026-11', values: { weekdayRate: 1.6, weekendRate: 2 }, reason: 'Theo quyết định', stamp: 0 });
  expect(r.changed).toEqual(['weekdayRate']);
  const { items } = groupHistory('overtime');
  expect(items).toEqual([{ id: r.stamp, field: 'weekdayRate', month: '2026-11', from: 1.5, to: 1.6, by: 'admin', at: MOCK_NOW, reason: 'Theo quyết định' }]);
  expect(settingsAt('2026-10').groups.overtime.stamp).toBe(r.stamp);
  expect(settingsAt('2026-10').groups.attendance.stamp).toBe(0);
});
test('an old stamp is refused with SETTINGS_STALE', () => {
  saveGroup('overtime', { effectiveMonth: '2026-10', values: { weekdayRate: 1.6 }, reason: null, stamp: 0 });
  expect(() => saveGroup('overtime', { effectiveMonth: '2026-10', values: { weekdayRate: 1.7 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ status: 409, code: 'SETTINGS_STALE' }));
});
test('a month before minMonth and a KPI total other than 100 are refused', () => {
  expect(() => saveGroup('overtime', { effectiveMonth: '2026-09', values: { weekdayRate: 1.6 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ code: 'BAD_SETTINGS_INPUT' }));
  expect(() => saveGroup('kpi-weights', { effectiveMonth: '2026-10', values: { wework: 40, user: 22, peer: 18, manager: 12, self: 6 }, reason: null, stamp: 0 }))
    .toThrow(expect.objectContaining({ code: 'BAD_SETTINGS_INPUT' }));
});
test('pay dates fall on pay day of the next month and never move', () => {
  const s = settingsAt('2026-10');
  saveGroup('pay-calendar', { effectiveMonth: '2026-12', values: { payDay: 15 }, reason: null, stamp: s.groups.payCalendar.stamp });
  const items = payDaysOf(2026).items;
  expect(items).toHaveLength(12);
  expect(items[10]).toEqual({ month: '2026-11', payDay: 10, payDate: '2026-12-10' });
  expect(items[11]).toEqual({ month: '2026-12', payDay: 15, payDate: '2027-01-15' });
  expect(payDateOf('2026-10')).toBe('2026-11-10');
});
test('work week: type by default, own week from a month, back to type with null', () => {
  expect(workWeekOf('hoang-thi-mai', '2026-10')).toMatchObject({ source: 'type', weekdays: [1, 2, 3, 4, 5, 6], from: null, standardWorkdays: 26, stamp: 0 });
  const r = saveWorkWeekOf('hoang-thi-mai', { effectiveMonth: '2026-12', weekdays: [1, 2, 3, 4, 5], reason: null, stamp: 0 });
  expect(r).toMatchObject({ source: 'own', standardWorkdays: 22 });
  expect(workWeekOf('hoang-thi-mai', '2026-11').source).toBe('type');
  expect(workWeekOf('hoang-thi-mai', '2027-01')).toMatchObject({ source: 'own', from: '2026-12', weekdays: [1, 2, 3, 4, 5] });
  expect(workWeekHistory('hoang-thi-mai').items[0]).toMatchObject({ field: 'weekdays', month: '2026-12', from: null, to: [1, 2, 3, 4, 5] });
});
test('zone saves at once with one history row', () => {
  expect(zoneOf()).toEqual({ zone: { lat: 10.7769, lng: 106.7009, radiusM: 150 }, stamp: 0 });
  const r = saveZoneOf({ lat: 10.7769, lng: 106.7009, radiusM: 200, reason: null, stamp: 0 });
  expect(zoneOf().zone!.radiusM).toBe(200);
  expect(zoneOf().stamp).toBe(r.stamp);
});
test('holidays 2026 count 11 days and quick-add skips existing ones', () => {
  expect(holidaysOf(2026).items).toHaveLength(11);
  expect(quickAddFixed(2026).added).toEqual([]);
  expect(quickAddFixed(2027).added).toEqual(['2027-01-01', '2027-04-30', '2027-05-01', '2027-09-02']);
});
```

- [ ] **Step 2: Chạy test, phải FAIL**
  - Lệnh: `cd web && PW_PORT=4263 npx playwright test tests/settings-mock.spec.ts > <log> 2>&1`
  - Kết quả đúng: FAIL vì không tìm thấy module `../src/mock/settings`.
- [ ] **Step 3: Viết code**
  - Tạo kiểu và `GROUP_PATH` trong `builders/api/settings.ts`.
  - Tạo kho giả trong `mock/settings.ts`. Trạng thái để trong biến của module; `resetSettingsMock` dựng lại từ đầu.
  - Import `MOCK_MONTH`, `MOCK_NOW` từ `./clock` và `ApiError` từ `../services/http`.
- [ ] **Step 4: Chạy lại, phải PASS hết.**
- [ ] **Step 5: Commit**

```bash
git add web/src/mock/settings.ts web/src/builders/api/settings.ts web/tests/settings-mock.spec.ts
git commit -m "feat(web): in-memory settings store mock following the BE contract" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Builder hiển thị chung (`builders/api/settings.ts`)

**Files:**
- Modify: `web/src/builders/api/settings.ts`
- Test: `web/tests/settings-builders.spec.ts` (thuần)

**Interfaces**

*Consumes:* các kiểu ở Task 1.

*Produces:*

```ts
export const FIELD_LABEL: Record<string, string>;
export function fieldText(field: string, value: number | null): string;
export function isEdited(state: GroupState, fields?: string[]): boolean;          // values ≠ defaults trên các ô đó
export function groupErrors(group: GroupKey, values: Values, state: GroupState): Record<string, string>;
export function confirmLines(group: GroupKey, before: Values, after: Values, month: string): string[];
export function zoneErrors(z: { lat: number | null; lng: number | null; radiusM: number | null }): Record<string, string>;
export function zoneLines(before: Zone | null, after: Zone): string[];
export function historyRow(item: HistoryItem): { id: number; field: string; label: string; month: string; change: string; reason: string; by: string; at: string };
export function weekdaysText(days: number[]): string;
export function standardWorkdays(n: number): number;
export function workWeekLine(ww: WorkWeek, upcoming?: { month: string; weekdays: number[] | null } | null): string;
export function payDatesIn(year: number, items: PayDayItem[]): string[];
export function payDayHint(month: string, payDay: number): string;
```

**Nhãn ô (`FIELD_LABEL`)**

| Ô | Nhãn |
|---|---|
| weekdayRate | OT ngày thường |
| weekendRate | OT cuối tuần |
| holidayRate | OT ngày lễ |
| lateGraceMinutes | Đi trễ vẫn hợp lệ tới |
| diligenceLostFromDays | Mất chuyên cần khi nghỉ từ |
| wework | Trọng số Base Wework |
| user | Trọng số Người dùng |
| peer | Trọng số Đồng nghiệp |
| manager | Trọng số Quản lý |
| self | Trọng số Tự đánh giá |
| bhxhPct | BHXH |
| bhytPct | BHYT |
| bhtnPct | BHTN |
| personalDeduction | Giảm trừ bản thân |
| dependantDeduction | Giảm trừ người phụ thuộc |
| shortContractPct | Hợp đồng ngắn hạn, tỉ lệ khấu trừ |
| shortContractThreshold | Hợp đồng ngắn hạn, khi thu nhập từ |
| payDay | Ngày trả lương |
| brackets | Biểu thuế |

**Chữ số (`fieldText`)**

| Loại ô | Ví dụ |
|---|---|
| hệ số | `×1.5`, `×2` |
| phút | `15 phút` |
| ngày | `3 ngày` |
| trọng số KPI | `40%` |
| phần trăm | `8%`, `1,5%` |
| tiền | `15.500.000 đ` |
| ngày trả lương | `10` |

**Biểu thuế** đổi thì mỗi ô đổi một dòng:
- `Biểu thuế bậc 2, đến 30.000.000 đ → 35.000.000 đ, áp dụng từ tháng 11/2026`;
- `Biểu thuế bậc 2, thuế suất 10% → 12%, …`.

**Lỗi (`groupErrors`)**

| Trường hợp | Khoá lỗi | Chữ |
|---|---|---|
| ô trống | tên ô | `Nhập một số` |
| ô ngoài khoảng | tên ô | `Từ ${fieldText(min)} đến ${fieldText(max)}` |
| tổng KPI khác 100 | `_sum` | `Tổng ${sum}/100` |
| mốc biểu thuế không lớn hơn mốc trước | `brackets.${i}.upTo` | `Phải lớn hơn ${tiền mốc trước}` |
| thuế suất ngoài 0–100 | `brackets.${i}.ratePct` | như ô ngoài khoảng |

**Vùng chấm công**
- `zoneErrors`: bán kính phải nguyên và trong 20–5000 (`Từ 20 đến 5.000 m`). Vĩ độ trong −90…90, kinh độ trong −180…180.
- `zoneLines`:
  - một dòng cho mỗi ô đổi: `Bán kính 150 m → 200 m, áp dụng ngay`, `Vĩ độ 10,7769 → 10,8, áp dụng ngay`;
  - chưa có vùng: `Vùng chấm công 10,7769, 106,7009, bán kính 150 m, áp dụng ngay`.

**Dòng lịch sử (`historyRow`)**
- `month`: `Tháng 11/2026`, hoặc `—` khi null.
- `change`: `8% → 8,5%`; biểu thuế thì nối các ô đổi bằng `; `.
- `reason`: lý do, hoặc `—` khi trống.
- `at`: giờ Việt Nam, dạng `dd/mm/yyyy hh:mm`.

**Tuần làm việc**
- `weekdaysText`:
  - 3 ngày liền nhau trở lên gộp thành `Ta–Tb`, còn lại nối bằng `, `;
  - `[1..6]` → `T2–T7`, `[1,3,5]` → `T2, T4, T6`, `[1,2,3,5,6]` → `T2–T4, T6, T7`.
- `workWeekLine`:
  - tuần riêng: `T2–T6 · công chuẩn 22 · riêng từ 12/2026`;
  - theo loại: `T2–T7 · công chuẩn 26 · theo loại nhân sự`;
  - nếu có thay đổi sắp tới (tháng sau `ww.month`) thì thêm `; từ 12/2026: T2–T6 · công chuẩn 22`, hoặc `; từ 12/2026: theo loại nhân sự`.

**Ngày trả lương**
- `payDatesIn(year, items)`: các `payDate` rơi vào năm đó, xếp tăng dần.
- `payDayHint('2026-10', 10)` → `Từ 1 đến 28. Lương tháng 10 trả ngày 10/11. Trùng Chủ nhật hoặc ngày lễ vẫn trả đúng ngày này.`

**Các bước**

- [ ] **Step 1: Viết test thất bại** `web/tests/settings-builders.spec.ts`:

```ts
test('confirm line follows the user example', () => {
  expect(confirmLines('overtime', { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 }, { weekdayRate: 1.6, weekendRate: 2, holidayRate: 3 }, '2026-11'))
    .toEqual(['OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026']);
});
test('number texts', () => {
  expect([fieldText('bhytPct', 1.5), fieldText('personalDeduction', 15500000), fieldText('lateGraceMinutes', 15), fieldText('payDay', 10)])
    .toEqual(['1,5%', '15.500.000 đ', '15 phút', '10']);
});
test('errors: out of range, KPI total, bracket order', () => {
  const s = settingsAt('2026-10');   // import từ ../src/mock/settings
  expect(groupErrors('overtime', { ...s.groups.overtime.values, weekdayRate: 1.4 }, s.groups.overtime)).toEqual({ weekdayRate: 'Từ ×1.5 đến ×5' });
  expect(groupErrors('kpiWeights', { ...s.groups.kpiWeights.values, user: 22 }, s.groups.kpiWeights)).toEqual({ _sum: 'Tổng 98/100' });
  const br = structuredClone(s.groups.tax.values.brackets) as Bracket[];
  br[1].upTo = 5000000;
  expect(groupErrors('tax', { ...s.groups.tax.values, brackets: br }, s.groups.tax)).toEqual({ 'brackets.1.upTo': 'Phải lớn hơn 10.000.000 đ' });
  expect(zoneErrors({ lat: 10.7769, lng: 106.7009, radiusM: 10 })).toEqual({ radiusM: 'Từ 20 đến 5.000 m' });
});
test('bracket and zone lines', () => {
  const s = settingsAt('2026-10');
  const br = structuredClone(s.groups.tax.values.brackets) as Bracket[];
  br[1].upTo = 35000000;
  expect(confirmLines('tax', s.groups.tax.values, { ...s.groups.tax.values, brackets: br }, '2026-10'))
    .toEqual(['Biểu thuế bậc 2, đến 30.000.000 đ → 35.000.000 đ, áp dụng từ tháng 10/2026']);
  expect(zoneLines({ lat: 10.7769, lng: 106.7009, radiusM: 150 }, { lat: 10.7769, lng: 106.7009, radiusM: 200 }))
    .toEqual(['Bán kính 150 m → 200 m, áp dụng ngay']);
});
test('work week texts and standard workdays (D5)', () => {
  expect([1, 2, 3, 4, 5, 6].map(standardWorkdays)).toEqual([4, 9, 13, 17, 22, 26]);
  expect([weekdaysText([1, 2, 3, 4, 5, 6]), weekdaysText([1, 3, 5]), weekdaysText([1, 2, 3, 5, 6])]).toEqual(['T2–T7', 'T2, T4, T6', 'T2–T4, T6, T7']);
  const type = workWeekOf('x', '2026-10');
  expect(workWeekLine(type)).toBe('T2–T7 · công chuẩn 26 · theo loại nhân sự');
  expect(workWeekLine(type, { month: '2026-12', weekdays: [1, 2, 3, 4, 5] })).toBe('T2–T7 · công chuẩn 26 · theo loại nhân sự; từ 12/2026: T2–T6 · công chuẩn 22');
});
test('pay dates of a calendar year and the pay-day hint', () => {
  expect(payDatesIn(2026, [...payDaysOf(2025).items, ...payDaysOf(2026).items])[0]).toBe('2026-01-10');
  expect(payDayHint('2026-10', 10)).toBe('Từ 1 đến 28. Lương tháng 10 trả ngày 10/11. Trùng Chủ nhật hoặc ngày lễ vẫn trả đúng ngày này.');
});
test('history row', () => {
  expect(historyRow({ id: 3, field: 'bhxhPct', month: '2026-11', from: 8, to: 8.5, by: 'admin', at: '2026-10-28T02:40:00.000Z', reason: null }))
    .toEqual({ id: 3, field: 'bhxhPct', label: 'BHXH', month: 'Tháng 11/2026', change: '8% → 8,5%', reason: '—', by: 'admin', at: '28/10/2026 09:40' });
});
```

- [ ] **Step 2:** Chạy test, phải FAIL vì chưa có các hàm.
- [ ] **Step 3: Viết các hàm.** Định dạng số dùng `vnd` của `../../utils/format`.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings.ts web/tests/settings-builders.spec.ts
git commit -m "feat(web): settings labels, checks and confirm lines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Dịch vụ `settings-store.ts` và trang Lịch (phần đọc)

**Files:**
- Create: `web/src/services/settings-store.ts`
- Modify: `web/src/services/admin-config.ts`
  - `getCalendar`, `quickAddHolidays`, `addHoliday`, `removeHoliday` thêm nhánh `if (__MOCK__)` gọi `holidaysOf` / `quickAddFixed` / `addHolidays` / `removeHolidays` qua `respond()`;
  - bỏ `getCalendarSetup`, `saveCalendarSetup` và hằng `KIND`.
- Modify: `web/src/services/admin-settings.ts`: bỏ re-export của hai hàm vừa xoá.
- Modify: `web/src/views/admin/settings/CalendarView.vue`, `web/src/views/admin/settings/calendar/YearCalendar.vue`
- Test: `web/tests/settings-calendar.spec.ts`

**Interfaces**

*Consumes:* Task 1 (mock), Task 2 (`payDatesIn`).

*Produces* (`services/settings-store.ts`; mọi hàm `async`, nhánh mock trả `respond(...)`):

```ts
export const STALE_TEXT = 'Có người vừa lưu trước, đã tải lại';
export const isStale = (e: unknown) => (e as any)?.code === 'SETTINGS_STALE';
export function getSettings(month?: string): Promise<SettingsResponse>;                   // GET /settings?month=
export function saveSettingsGroup(group: GroupPath, body: SaveBody): Promise<SaveResult>;  // PUT /settings/:group
export function getSettingsHistory(group: GroupPath): Promise<{ items: HistoryItem[] }>;   // GET /settings/:group/history
export function getPayDays(year: number): Promise<{ year: number; items: PayDayItem[] }>;  // GET /settings/pay-days?year=
export function getWorkWeek(username: string, month?: string): Promise<WorkWeek>;          // GET /settings/work-weeks/:u?month=
export function saveWorkWeek(username: string, body: WorkWeekBody): Promise<{ ok: true; weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; stamp: number }>;
export function getWorkWeekHistory(username: string): Promise<{ items: HistoryItem[] }>;
export function getAttendanceZone(): Promise<{ zone: Zone | null; stamp: number }>;       // GET /settings/attendance-zone
export function saveAttendanceZone(body: Zone & { reason: string | null; stamp: number }): Promise<{ ok: true; zone: Zone; stamp: number }>;
export function getShifts(): Promise<ShiftRow[]>;                                          // GET /employees/meta/shifts → shifts
```

`YearCalendar` đổi prop `payDay: Number` thành `payDates: string[]`. Lớp `pay` gắn cho ngày có trong `payDates`.

**Trang Lịch:**
- Tải `getSettings()`.
- Tải `getPayDays(year - 1)` và `getPayDays(year)`, gộp lại rồi `payDatesIn(year, …)`. Đổi năm thì tải lại.
- Tải `getShifts()`.
- Dòng phụ: `Năm 2026 · 11 ngày lễ · trả lương ngày 10 tháng sau`. Số ngày là `payDay` đang hiệu lực ở `month` của `getSettings`.
- Chú thích "Trả lương: ngày 10 tháng sau" cũng lấy số đó.
- Bảng "Ca làm":
  - tiêu đề phụ `6 ca cố định`;
  - các cột Tên ca, Giờ vào, Giờ ra, Loại (Normal/Flex/Night);
  - tất cả là chữ, không có ô nhập hay ô chọn;
  - giờ ra nhỏ hơn giờ vào thì thêm chữ nhỏ `hôm sau`.
- Ruling: hai thẻ "Ngày trả lương" (Task 4) và "Vùng chấm công" (Task 5) thay khối "Chấm công" cũ. Trong task này để khung trống. Bỏ `SaveBar` của trang.

**Các bước**

- [ ] **Step 1: Viết test thất bại** `web/tests/settings-calendar.spec.ts`. Có `test.beforeEach(page.setViewportSize({ width: 1440, height: 900 }))` và hai test:

```ts
const day = (page: Page, d: number, m: number) => page.getByRole('button', { name: `Ngày ${d} tháng ${m}`, exact: true });
test('calendar shows holidays and pay-day dots from the pay days', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  await expect(page.locator('.title p')).toContainText('11 ngày lễ');
  await expect(page.locator('.title p')).toContainText('trả lương ngày 10 tháng sau');
  await expect(day(page, 10, 11)).toHaveClass(/\bpay\b/);
  await expect(day(page, 10, 1)).toHaveClass(/\bpay\b/);
  await expect(day(page, 11, 11)).not.toHaveClass(/\bpay\b/);
});
test('the six fixed shifts are plain text', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Ca làm' }) });
  await expect(card.locator('tbody tr')).toHaveCount(6);
  await expect(card.locator('tbody tr').nth(4)).toContainText('Night 1');
  await expect(card.locator('tbody tr').nth(4)).toContainText('22:00');
  await expect(card.locator('tbody tr').nth(4)).toContainText('07:00');
  await expect(card.locator('tbody tr').nth(4)).toContainText('hôm sau');
  await expect(card.locator('input, select')).toHaveCount(0);
});
```

- [ ] **Step 2:** Chạy test, phải FAIL. Ở mock hiện tại trang Lịch báo thiếu dữ liệu giả.
- [ ] **Step 3: Viết code.** Viết `settings-store.ts`, các nhánh mock của ngày lễ, sửa `CalendarView` và `YearCalendar`.
- [ ] **Step 4:** Chạy lại file này và `tests/settings-positions.spec.ts`, phải PASS cả hai.
- [ ] **Step 5: Commit**

```bash
git add web/src/services/settings-store.ts web/src/services/admin-config.ts web/src/services/admin-settings.ts web/src/views/admin/settings/CalendarView.vue web/src/views/admin/settings/calendar/YearCalendar.vue web/tests/settings-calendar.spec.ts
git commit -m "feat(web): settings store service; calendar reads pay days, holidays and fixed shifts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Thẻ "Ngày trả lương", hộp xác nhận, `useSettingsDraft`

**Files:**
- Create: `web/src/views/admin/settings/fields/SaveConfirmDialog.vue`
- Create: `web/src/views/admin/settings/lib/useSettingsDraft.ts`
- Modify: `web/src/views/admin/settings/fields/FieldNum.vue`: thêm prop `decimals: Number` (mặc định `null` = không giới hạn). Lần gõ có nhiều chữ số sau dấu phẩy hơn `decimals` thì bị bỏ, giống cách `max` đang làm.
- Modify: `web/src/views/admin/settings/CalendarView.vue`
- Test: `web/tests/settings-calendar.spec.ts`

**Interfaces**

*Consumes:* Task 2 (`groupErrors`, `confirmLines`, `payDayHint`), Task 3 (service).

*Produces* `SaveConfirmDialog`:
- props `lines: string[]`, `reason: string`, `saving: boolean`;
- emits `confirm`, `close`;
- dùng `AppModal` với tiêu đề `Lưu thay đổi`;
- mục "Các ô sẽ đổi" là danh sách `<li>`;
- có lý do thì thêm mục "Lý do" hiện `“…”`;
- chân hộp có Huỷ / Lưu. Lưu khoá khi `saving`.

*Produces* `useSettingsDraft`:

```ts
export function useSettingsDraft(group: GroupKey, fields: string[]): {
  ready: Ref<boolean>; month: Ref<string>; months: ComputedRef<{ value: string; label: string }[]>;
  state: Ref<GroupState | null>; draft: Ref<Values>; reason: Ref<string>;
  changed: ComputedRef<string[]>; errors: ComputedRef<Record<string, string>>; canSave: ComputedRef<boolean>;
  lines: ComputedRef<string[]>; saving: Ref<boolean>;
  reset(): void; save(): Promise<boolean>;
}
```

Cách chạy của `useSettingsDraft`:
- **Khi tải:** `getSettings()` lấy `minMonth`, rồi đặt `month = minMonth`.
- **Mỗi khi `month` đổi:** gọi `getSettings(month)` và thay `state` bằng nhóm `group`.
  - Ô chưa đụng tới thì `draft` đi theo `state.values`.
  - Ô đã gõ thì giữ số đã gõ. Theo dõi các ô đã gõ bằng một `Set`.
- **Các giá trị tính:**
  - `changed`: các ô trong `fields` mà `draft` khác `state.values`;
  - `errors`: `groupErrors` lọc theo `fields`, cộng `_sum`;
  - `canSave`: có `changed`, không có `errors` và không đang lưu.
- **`save()`:** gọi `saveSettingsGroup(GROUP_PATH[group], …)` với:
  - `values`: chỉ các ô đổi. Riêng `kpiWeights` gửi đủ 5 ô;
  - `reason`: `reason.trim() || null`;
  - `stamp`: lấy từ `state`.
- **Lưu được:** `toast.ok('Đã lưu')`, tải lại, xoá danh sách ô đã gõ, trả `true`.
- **Lỗi stale:** `toast.error(STALE_TEXT)`, tải lại, giữ các ô đã gõ, trả `false`.
- **Lỗi khác:** `toast.error(e.message)`, trả `false`.

**Thẻ "Ngày trả lương"** (theo M5):
- ô `FieldNum` có nhãn `Ngày trả lương hằng tháng`, `integer`, `max 28`;
- câu gợi ý `payDayHint(month, payDay đang nhập)`;
- ô chọn `Áp dụng từ tháng`;
- ô lý do có bộ đếm `N/300`;
- chữ cố định `Bắt đầu tính công: ngày 1`;
- chân thẻ ghi `Chưa có thay đổi` hoặc `Có N thay đổi chưa lưu` (có lỗi thì hiện lỗi đầu tiên), kèm nút `Lưu`;
- bấm Lưu mở `SaveConfirmDialog`; xác nhận thì `save()`, xong thì tải lại các chấm ngày trả lương.

**Các bước**

- [ ] **Step 1: Thêm test thất bại** vào `settings-calendar.spec.ts`. Biến `card` là section chứa heading `Ngày trả lương`.

```ts
test('pay-day field takes only 1 to 28', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const f = card.getByRole('textbox', { name: 'Ngày trả lương hằng tháng' });
  await f.fill('29'); await expect(f).toHaveValue('10');
  await f.fill('0'); await expect(card).toContainText('Từ 1 đến 28'); await expect(card.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
});
test('saving pay day 15 from 12/2026 moves the dots from that month on', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  await card.getByRole('combobox', { name: 'Áp dụng từ tháng' }).selectOption({ label: 'Tháng 12/2026' });
  await card.getByRole('textbox', { name: 'Ngày trả lương hằng tháng' }).fill('15');
  await card.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Ngày trả lương 10 → 15, áp dụng từ tháng 12/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
  await expect(day(page, 10, 12)).toHaveClass(/\bpay\b/);
  await page.getByRole('button', { name: 'Năm sau' }).click();
  await expect(day(page, 15, 1)).toHaveClass(/\bpay\b/);
  await expect(day(page, 10, 1)).not.toHaveClass(/\bpay\b/);
});
test('switching the month makes untouched fields follow that month', async ({ page }) => {
  // lưu 15 từ 12/2026 như test trên, rồi:
  await month.selectOption({ label: 'Tháng 12/2026' }); await expect(field).toHaveValue('15'); await expect(card).toContainText('Chưa có thay đổi');
  await month.selectOption({ label: 'Tháng 11/2026' }); await expect(field).toHaveValue('10');
});
```

- [ ] **Step 2:** Chạy test, phải FAIL vì chưa có thẻ.
- [ ] **Step 3: Viết code.** Thêm `decimals` cho FieldNum, viết composable, hộp xác nhận và thẻ "Ngày trả lương". `SelectBox` ở `variant="inp"` đã có `label` làm tên truy cập.
- [ ] **Step 4:** Chạy lại `settings-calendar.spec.ts` và `settings-positions.spec.ts` (cũng dùng FieldNum), phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/settings/fields/SaveConfirmDialog.vue web/src/views/admin/settings/lib/useSettingsDraft.ts web/src/views/admin/settings/fields/FieldNum.vue web/src/views/admin/settings/CalendarView.vue web/tests/settings-calendar.spec.ts
git commit -m "feat(web): pay day 1–28 from a chosen month with a confirm dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Thẻ "Vùng chấm công"

**Files:**
- Modify: `web/src/views/admin/settings/CalendarView.vue`
- Test: `web/tests/settings-calendar.spec.ts`

**Interfaces**

*Consumes:* `getAttendanceZone`, `saveAttendanceZone`, `isStale`, `STALE_TEXT` (Task 3); `zoneErrors`, `zoneLines` (Task 2); `SaveConfirmDialog` (Task 4).

**Thẻ** (theo M5: bản đồ bên trái, các ô bên phải):
- Tiêu đề `Vùng chấm công`, câu phụ `Nhân viên chấm công được khi ở trong vùng này`.
- Ô `Bán kính vùng chấm công`: `integer`, `max 5000`, đơn vị `m`, gợi ý `Từ 20 đến 5.000 m`.
- Ô `Vĩ độ`: `decimals 6`, `max 90`.
- Ô `Kinh độ`: `decimals 6`, `max 180`.
- Nút `Dùng vị trí hiện tại`: lấy vị trí từ `navigator.geolocation`, làm tròn 6 chữ số. Lỗi thì `toast.error('Không lấy được vị trí')`.
- Chân thẻ: `Chưa có thay đổi · lưu là áp dụng ngay, không theo tháng`, nút `Lưu` khoá khi chưa đổi hoặc `zoneErrors` có lỗi.
- Bấm Lưu mở `SaveConfirmDialog` với `zoneLines`. Xác nhận thì gọi `saveAttendanceZone` với `reason: null` và `stamp` của lần đọc.
- Ruling: thẻ này không có ô lý do, theo M5.
- Ruling: `FieldNum` không nhận dấu trừ, nên chỉ nhập được toạ độ dương. Công ty ở Việt Nam. Rủi ro: vùng ở nơi có toạ độ âm thì không nhập được.

**Các bước**

- [ ] **Step 1: Thêm test thất bại** (biến `zone` là section chứa heading `Vùng chấm công`):

```ts
test('zone radius takes 20 to 5000 m and saves at once', async ({ page }) => {
  await page.goto('/admin/cai-dat/lich');
  const r = zone.getByRole('textbox', { name: 'Bán kính vùng chấm công' });
  await expect(r).toHaveValue('150');
  await r.fill('6000'); await expect(r).toHaveValue('150');
  await r.fill('10'); await expect(zone.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await r.fill('200'); await zone.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Bán kính 150 m → 200 m, áp dụng ngay');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
  await expect(r).toHaveValue('200');
  await expect(zone).toContainText('Chưa có thay đổi');
});
test('Dùng vị trí hiện tại fills the coordinates', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.8, longitude: 106.65 });
  await page.goto('/admin/cai-dat/lich');
  await zone.getByRole('button', { name: 'Dùng vị trí hiện tại' }).click();
  await expect(zone.getByRole('textbox', { name: 'Vĩ độ' })).toHaveValue('10,8');
  await expect(zone.getByRole('textbox', { name: 'Kinh độ' })).toHaveValue('106,65');
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết thẻ.
- [ ] **Step 4:** Chạy lại `settings-calendar.spec.ts`, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/settings/CalendarView.vue web/tests/settings-calendar.spec.ts
git commit -m "feat(web): attendance zone card saves at once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Quy tắc KPI chỉ xem

**Files:**
- Create: `web/src/builders/api/settings-screens.ts` (task này chỉ có `kpiRulesView`)
- Modify: `web/src/views/admin/settings/KpiRulesView.vue`
- Modify: `web/src/services/admin-config.ts`: bỏ `getKpiRules` và `KPI_LABEL`.
- Modify: `web/src/services/admin-settings.ts`: bỏ re-export `getKpiRules`.
- Test: `web/tests/settings-kpi.spec.ts`

**Interfaces**

*Produces:*

```ts
export const KPI_NAMES: Record<string, string>; // wework 'Base Wework', user 'Người dùng', peer 'Đồng nghiệp', manager 'Quản lý', self 'Tự đánh giá'
export function kpiRulesView(s: SettingsResponse): { weights: { label: string; percent: number }[]; total: number };
```

**Trang:**
- Giữ bố cục hiện có: dãy trọng số nối bằng `+`, cuối là `=` và "Tổng điểm".
- Tải từ `getSettings()`.
- Thêm link `Sửa trong Cách tính lương › Lương KPI`, trỏ tới `/admin/cai-dat?hop=luong-kpi`.
- Bỏ khối "Liên quan" nếu rỗng.

**Các bước**

- [ ] **Step 1: Viết test thất bại**

```ts
test('KPI rules show the five weights read-only with a link to edit', async ({ page }) => {
  await page.goto('/admin/cai-dat/kpi');
  const wts = page.locator('.wts');
  for (const t of ['Base Wework', '40%', 'Người dùng', '24%', 'Đồng nghiệp', '18%', 'Quản lý', '12%', 'Tự đánh giá', '6%', '100%']) await expect(wts).toContainText(t);
  await expect(page.locator('.main input')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sửa trong Cách tính lương › Lương KPI' })).toHaveAttribute('href', '/admin/cai-dat?hop=luong-kpi');
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings-screens.ts web/src/views/admin/settings/KpiRulesView.vue web/src/services/admin-config.ts web/src/services/admin-settings.ts web/tests/settings-kpi.spec.ts
git commit -m "feat(web): KPI rules read the five weights from the settings store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Tuần làm việc trong hồ sơ nhân sự

**Files:**
- Create: `web/src/views/admin/staff/parts/WorkWeekDialog.vue`
- Modify: `web/src/views/admin/staff/StaffDrawer.vue`
- Test: `web/tests/staff-work-week.spec.ts`

**Interfaces**

*Consumes:* `getWorkWeek`, `saveWorkWeek`, `getWorkWeekHistory` (Task 3); `weekdaysText`, `standardWorkdays`, `workWeekLine` (Task 2).

**Dòng trong hồ sơ**
- `StaffDrawer` tải `getWorkWeek(id)` và `getWorkWeekHistory(id)` theo `props.id`.
- Trong nhóm `Công việc`, ngay sau dòng `Ca làm`, thêm một dòng `.fr`:
  - `dt` là `Tuần làm việc`;
  - `dd` là `workWeekLine(ww, upcoming)`, trong đó `upcoming` là dòng lịch sử mới nhất có `month > ww.month`;
  - nút `Sửa` có `aria-label="Sửa tuần làm việc"`, đặt ngoài `dd`.

**Hộp `WorkWeekDialog`** (theo N1):
- `AppModal` tiêu đề `Tuần làm việc`, dòng phụ là tên người.
- Hai lựa chọn radio:
  - `Theo loại nhân sự`, kèm chữ `T2–T7 · công chuẩn 26` dựng từ `typeWeekdays` và `typeStandardWorkdays`;
  - `Tuần riêng`, kèm 6 ô tick T2…T7, mặc định là `weekdays` hiện tại.
- Dòng `Công chuẩn: N`: tuần riêng thì `standardWorkdays(số ô tick)`, theo loại thì `typeStandardWorkdays`.
- Ô chọn `Áp dụng từ tháng`, các tháng từ `minMonth`.
- Ô lý do, tối đa 300 ký tự.
- **Lưu khoá khi:**
  - chọn tuần riêng mà không tick ô nào, kèm chữ `Chọn ít nhất một ngày`;
  - hoặc tuần đang chọn trùng tuần đã tải (cùng cách đặt và cùng ngày).
- Ruling: chỉ đổi tháng không tính là thay đổi. Rủi ro: muốn dời ngày bắt đầu của một tuần riêng mà không đổi ngày thì phải đổi ngày rồi đổi lại.
- **Lưu:**
  - gọi `saveWorkWeek(id, { effectiveMonth, weekdays: tuần riêng ? các ngày đã tick, tăng dần : null, reason, stamp })`;
  - xong thì `toast.ok('Đã lưu')`, đóng hộp, tải lại dòng hồ sơ;
  - lỗi stale thì báo `STALE_TEXT` và tải lại.
- Hộp này lưu thẳng, không mở hộp xác nhận thứ hai (N1).
- Escape chỉ đóng hộp, không đóng ngăn kéo hồ sơ. Focus nằm trong hộp; đóng hộp thì focus trả về nút Sửa.

**Các bước**

- [ ] **Step 1: Viết test thất bại**

```ts
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Hồ sơ của Hoàng Thị Mai' });
const line = (page: Page) => drawer(page).locator('.fr', { has: page.getByText('Tuần làm việc', { exact: true }) }).locator('dd');
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/admin/nhan-su?nv=hoang-thi-mai'); });
test('profile shows the work week from the person type', async ({ page }) => {
  await expect(line(page)).toHaveText('T2–T7 · công chuẩn 26 · theo loại nhân sự');
});
test('ticking T2–T6 shows Công chuẩn 22 and no tick locks Lưu', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
  const save = dlg.getByRole('button', { name: 'Lưu', exact: true });
  await expect(save).toBeDisabled();
  await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
  await expect(dlg).toContainText('Công chuẩn: 26');
  await dlg.getByRole('checkbox', { name: 'T7' }).uncheck();
  await expect(dlg).toContainText('Công chuẩn: 22');
  for (const d of ['T2', 'T3', 'T4', 'T5', 'T6']) await dlg.getByRole('checkbox', { name: d }).uncheck();
  await expect(dlg).toContainText('Chọn ít nhất một ngày');
  await expect(save).toBeDisabled();
});
test('saving an own week rewrites the profile line', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tuần làm việc' });
  await dlg.getByRole('radio', { name: 'Tuần riêng' }).check();
  await dlg.getByRole('checkbox', { name: 'T7' }).uncheck();
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await expect(line(page)).toHaveText('T2–T6 · công chuẩn 22 · riêng từ 10/2026');
});
test('a week from a later month shows as upcoming', async ({ page }) => {
  // như trên nhưng chọn 'Tháng 12/2026' trước khi Lưu
  await expect(line(page)).toHaveText('T2–T7 · công chuẩn 26 · theo loại nhân sự; từ 12/2026: T2–T6 · công chuẩn 22');
});
test('Escape closes only the work-week dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Sửa tuần làm việc' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Tuần làm việc' })).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết hộp và dòng hồ sơ.
- [ ] **Step 4:** Chạy lại file này và `tests/admin-staff.spec.ts`, phải PASS cả hai.
- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/staff/parts/WorkWeekDialog.vue web/src/views/admin/staff/StaffDrawer.vue web/tests/staff-work-week.spec.ts
git commit -m "feat(web): per-person work week in the staff profile" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Đợt 2: Cách tính lương, Tất cả cài đặt, dọn chữ cũ

Trước Task 8: `git fetch` không cần. Chạy `git merge main` nếu main đã có commit mới đụng `views/admin/settings/` (`git log HEAD..main --oneline -- web/src/views/admin/settings`).

### Task 8: Cách tính lương: danh sách và 5 ngăn kéo

**Files:**
- Modify: `web/src/builders/api/settings-screens.ts`
- Modify: `web/src/views/admin/settings/PayFormulaView.vue` (viết lại)
- Modify: `web/src/views/admin/settings/pay/PayDrawer.vue` (viết lại)
- Modify: `web/src/services/admin-config.ts`: bỏ `getPayFormula`, `getPayDrawer`, `savePayDrawer`.
- Modify: `web/src/services/admin-settings.ts`
- Test: `web/tests/settings-pay.spec.ts`

**Interfaces**

*Consumes:*
- `useSettingsDraft`, `SaveConfirmDialog` (Task 4);
- `catalogRows()` của `services/admin-catalog`, chọn bản đang hiệu lực bằng `inForce` của `builders/api/catalog`;
- `getSettingsHistory` (Task 3).

*Produces:*

```ts
export type PayRow = { key: string; op: '+' | '−'; name: string; value: string; edited: boolean; drawer: string; action: 'Sửa' | 'Xem' };
export function payFormulaView(s: SettingsResponse, history: Partial<Record<GroupKey, HistoryItem[]>>): { editedCount: number; rows: PayRow[]; recent: string };
export type DrawerField = { field: string; label: string; prefix?: string; unit?: string; integer?: boolean; decimals?: number; money?: boolean };
export type ReadonlySection = { title: string; rows: { label: string; value: string }[] };
export function payDrawerView(key: string, catalog: TypeRow[], month: string): { title: string; sub: string; group: GroupKey | null; section: string; fields: DrawerField[]; readonly: ReadonlySection[]; link: boolean; text: string | null };
```

**Danh sách** (M1, chữ dựng từ `values` ở tháng hiện tại):

| key | op | Khoản | Đang áp dụng | edited theo | Nút |
|---|---|---|---|---|---|
| `luong-ngay-cong` | + | Lương theo ngày công | `Công chuẩn 22 (T2–T6) · 26 (T2–T7)` | luôn false | Xem |
| `lam-them` | + | Tiền làm thêm giờ | `Ngày thường ×1.5 · cuối tuần ×2 · ngày lễ ×3` | overtime | Sửa |
| `phu-cap` | + | Phụ cấp | `Mất chuyên cần khi nghỉ từ 3 ngày` | diligenceLostFromDays | Sửa |
| `luong-kpi` | + | Lương KPI | `Trọng số 40 · 24 · 18 · 12 · 6` | kpiWeights | Sửa |
| `khau-tru` | − | Khấu trừ đi muộn | `Đi trễ tới 15 phút vẫn hợp lệ` | lateGraceMinutes | Sửa |
| `tam-ung` | − | Tạm ứng | `80% lương của ngày công 01–15` | luôn false | Xem |

- Các cột: (trống), Khoản, Đang áp dụng, Trạng thái (`• Đã chỉnh` hoặc trống), Thao tác.
- Dòng phụ dưới tiêu đề: `Áp dụng cho mọi phiếu lương · N khoản đã chỉnh`.
- Chân thẻ:
  - `recent` lấy dòng lịch sử có `id` lớn nhất của overtime, attendance và kpi-weights, dạng `Thay đổi gần đây: Tiền làm thêm giờ, OT ngày thường ×1.6 từ tháng 11/2026.`;
  - chưa có lịch sử thì `Chưa có thay đổi nào.`;
  - sau đó luôn có câu `Mỗi lần sửa được ghi vào Nhật ký thay đổi.` và link `Mở nhật ký`.
- Bỏ thẻ "Chính sách chưa chốt".
- Bấm Xem hoặc Sửa mở ngăn kéo bằng `?hop=<key>` (giữ `useHop`).

**Ngăn kéo** (rộng 560px):

| key | Tiêu đề | Câu phụ | Nhóm | Mục, ô sửa được | Chỉ xem |
|---|---|---|---|---|---|
| `luong-ngay-cong` | Lương theo ngày công | Lương tháng chia công chuẩn, nhân số ngày công | — | — | mỗi loại: dòng `Công chuẩn` = `26 ngày`, rồi từng bậc `tên bậc` = lương cơ bản (tiền); có link |
| `lam-them` | Tiền làm thêm giờ | Hệ số nhân với lương giờ khi làm thêm | overtime | Hệ số: Ngày thường, Cuối tuần, Ngày lễ (prefix `×`, decimals 2, max 5) | — |
| `phu-cap` | Phụ cấp | Phụ cấp theo loại nhân sự và luật chuyên cần | attendance | Chuyên cần: `Mất chuyên cần khi nghỉ từ` (đơn vị `ngày`, integer, max 31) | mỗi loại: `Đi lại`, `Chuyên cần`, `Ca Flex`, `Ca Night` (%); có link |
| `khau-tru` | Khấu trừ đi muộn, về sớm | Ngưỡng đi trễ vẫn tính là đúng giờ | attendance | Khấu trừ: `Đi trễ tới … phút vẫn hợp lệ` (đơn vị `phút`, integer, max 60) | — |
| `tam-ung` | Tạm ứng | Số tiền được ứng giữa tháng | — | — | `text`: `80% lương của ngày công 01–15` |

Link chỉ xem là `Sửa ở Chức vụ & bậc`, trỏ tới `/admin/cai-dat/chuc-vu-bac`.

**Ngăn kéo có ô sửa:**
- Dùng `useSettingsDraft(group, fields)`.
- Ô nào đang khác số đã lưu thì hiện `Đang áp dụng ${fieldText(cũ)}` dưới nhãn.
- Ô chọn `Áp dụng từ tháng`, kèm câu `Áp dụng cho tháng này và các tháng sau. Tháng nào đã đặt số khác thì giữ số đó.`
- Ô lý do có bộ đếm `N/300`.
- Chân ngăn kéo: chữ trạng thái (`Chưa có thay đổi`, `Có N thay đổi chưa lưu`, hoặc lỗi đầu tiên), `Huỷ` (bỏ phần đã gõ và đóng), `Lưu`.
- Bấm Lưu mở `SaveConfirmDialog`. Lưu được thì đóng ngăn kéo và tải lại danh sách.

**Ngăn kéo chỉ xem:** không có ô nào, chân chỉ có `Đóng`.

**Các bước**

- [ ] **Step 1: Viết test thất bại** `web/tests/settings-pay.spec.ts` (khung 1440×900). Hàm phụ:

```ts
const row = (page, name) => page.locator('tbody tr', { has: page.getByText(name, { exact: true }) });
const drawer = (page, title) => page.getByRole('dialog', { name: title });
```

Các test:

```ts
test('pay formula lists six items and nothing about unconfirmed policies', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(page.locator('.title p')).toContainText('0 khoản đã chỉnh');
  await expect(page.locator('body')).not.toContainText('chưa chốt');
  await expect(page.locator('body')).not.toContainText('Xem trước');
});
test('OT 1.5 → 1.6 from the open month marks the row Đã chỉnh', async ({ page }) => {
  await page.goto('/admin/cai-dat');
  await row(page, 'Tiền làm thêm giờ').getByRole('button', { name: 'Sửa' }).click();
  const d = drawer(page, 'Tiền làm thêm giờ');
  await d.getByRole('textbox', { name: 'Ngày thường' }).fill('1,6');
  await expect(d).toContainText('Đang áp dụng ×1.5');
  await expect(d).toContainText('Có 1 thay đổi chưa lưu');
  await d.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 10/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('Ngày thường ×1.6');
  await expect(row(page, 'Tiền làm thêm giờ')).toContainText('• Đã chỉnh');
});
test('saving from 11/2026 gives the user example line and the recent-change footer', async ({ page }) => {
  // như trên, chọn 'Tháng 11/2026' ở ô 'Áp dụng từ tháng' trước khi Lưu
  await expect(dlg).toContainText('OT ngày thường ×1.5 → ×1.6, áp dụng từ tháng 11/2026');
  // sau khi lưu:
  await expect(row(page, 'Tiền làm thêm giờ')).not.toContainText('Đã chỉnh');
  await expect(page.locator('.foot')).toContainText('Thay đổi gần đây: Tiền làm thêm giờ, OT ngày thường ×1.6 từ tháng 11/2026.');
});
test('Huỷ discards the edit', async ({ page }) => {
  // sửa 'Ngày thường' thành 1,6 → bấm Huỷ → mở lại → giá trị '1,5'
});
test('OT refuses a third decimal and a value under the legal floor locks Lưu', async ({ page }) => {
  const f = d.getByRole('textbox', { name: 'Ngày thường' });
  await f.fill('1,555'); await expect(f).toHaveValue('1,5');
  await f.fill('1,4'); await expect(d).toContainText('Từ ×1.5 đến ×5');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
});
test('Phụ cấp shows type figures as text with a link to Chức vụ & bậc', async ({ page }) => {
  // mở Phụ cấp: có 'Nhân viên', 'Đi lại', '15%'; link 'Sửa ở Chức vụ & bậc' href '/admin/cai-dat/chuc-vu-bac'; đúng 1 textbox
});
test('Lương theo ngày công and Tạm ứng are read-only', async ({ page }) => {
  // Xem ở hai dòng: không có textbox, không có nút 'Lưu'; Tạm ứng chứa '80% lương của ngày công 01–15'
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết builder, danh sách và ngăn kéo. Xoá ba hàm cũ trong service.
- [ ] **Step 4:** Chạy lại file này và `tests/admin-shell.spec.ts`, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings-screens.ts web/src/views/admin/settings/PayFormulaView.vue web/src/views/admin/settings/pay/PayDrawer.vue web/src/services/admin-config.ts web/src/services/admin-settings.ts web/tests/settings-pay.spec.ts
git commit -m "feat(web): pay formula and drawers on the settings store, Lưu opens a confirm list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Ngăn kéo Lương KPI

**Files:**
- Modify: `web/src/builders/api/settings-screens.ts`, `web/src/views/admin/settings/pay/PayDrawer.vue`
- Test: `web/tests/settings-pay.spec.ts`

**Ngăn kéo `luong-kpi`:**
- Tiêu đề `Lương KPI`, câu phụ `Trọng số của 5 điểm KPI, cộng lại đủ 100`.
- Nhóm `kpiWeights`, mục `Trọng số`.
- 5 ô dùng `KPI_NAMES` làm nhãn, đơn vị `%`, `integer`, `max 100`.
- Phần chỉ xem `KPI tối đa theo bậc`: các bậc của loại `ctv` và `nv` có `kpi_max` khác null, giá trị là tiền. Có link `Sửa ở Chức vụ & bậc`.
- Chân ngăn kéo luôn có `Tổng N/100` (tổng các ô đang nhập). Lưu khoá khi tổng khác 100.

**Các bước**

- [ ] **Step 1: Thêm test thất bại**

```ts
test('KPI weights must total 100 before Lưu unlocks', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=luong-kpi');
  const d = drawer(page, 'Lương KPI');
  await d.getByRole('textbox', { name: 'Người dùng' }).fill('22');
  await expect(d).toContainText('Tổng 98/100');
  await expect(d.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await d.getByRole('textbox', { name: 'Tự đánh giá' }).fill('8');
  await expect(d).toContainText('Tổng 100/100');
  await d.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('Trọng số Người dùng 24% → 22%, áp dụng từ tháng 10/2026');
  await expect(dlg).toContainText('Trọng số Tự đánh giá 6% → 8%, áp dụng từ tháng 10/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(row(page, 'Lương KPI')).toContainText('Trọng số 40 · 22 · 18 · 12 · 8');
  await expect(row(page, 'Lương KPI')).toContainText('• Đã chỉnh');
});
test('KPI drawer shows the max KPI per level as text', async ({ page }) => {
  await page.goto('/admin/cai-dat?hop=luong-kpi');
  await expect(drawer(page, 'Lương KPI')).toContainText('KPI tối đa theo bậc');
  await expect(drawer(page, 'Lương KPI').getByRole('link', { name: 'Sửa ở Chức vụ & bậc' })).toBeVisible();
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết ngăn kéo KPI.
- [ ] **Step 4:** Chạy lại, phải PASS. Thêm `tests/settings-kpi.spec.ts`: bấm link ở trang Quy tắc KPI thì mở đúng ngăn kéo `Lương KPI`.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings-screens.ts web/src/views/admin/settings/pay/PayDrawer.vue web/tests/settings-pay.spec.ts web/tests/settings-kpi.spec.ts
git commit -m "feat(web): KPI weights drawer locks Lưu until the total is 100" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Tất cả cài đặt: nhóm, mục, lưu, tìm kiếm

**Files:**
- Modify: `web/src/builders/api/settings-screens.ts`
- Modify: `web/src/views/admin/settings/AllSettingsView.vue` (viết lại)
- Modify: `web/src/views/admin/settings/all/SettingItem.vue` (viết lại)
- Modify: `web/src/services/admin-config.ts`: bỏ `getAllSettings`, `saveAllSettings`, `historyOf`, `allSettingsRequestId`.
- Modify: `web/src/services/admin-settings.ts`
- Test: `web/tests/settings-search.spec.ts` (viết lại toàn bộ trên mock, không `page.route`, không `test.fixme`)

**Interfaces**

*Produces:*

```ts
export type SettingEntry = { key: string; title: string; desc: string; fields: DrawerField[]; readonly?: string; brackets?: boolean };
export type SettingGroup = { key: string; name: string; group: GroupKey | null; items: SettingEntry[] };
export const ALL_GROUPS: SettingGroup[];        // đúng 8 nhóm, thứ tự như bảng dưới
export function normalizeSearch(s: string): string;   // chữ thường, bỏ dấu (NFD), đ → d, gọn khoảng trắng
export function searchSettings(q: string): { groupKey: string; itemKey: string; title: string; groupName: string }[];
```

**8 nhóm:**

| key | Tên | Nhóm BE | Mục: tiêu đề, mô tả, các ô |
|---|---|---|---|
| `lam-them` | OT | overtime | `weekdayRate` Hệ số OT ngày thường, "Nhân với lương giờ khi làm thêm ngày thường", ô × · `weekendRate` Hệ số OT cuối tuần, "…làm thêm cuối tuần" · `holidayRate` Hệ số OT ngày lễ, "…làm thêm ngày lễ, Tết" |
| `phu-cap` | Phụ cấp | attendance | `diligenceLostFromDays` Mất chuyên cần, "Nghỉ từ số ngày này trong tháng thì mất phụ cấp chuyên cần", ô `ngày` |
| `luong-kpi` | KPI | kpiWeights | 5 mục `wework` … `self` lấy tên từ `KPI_NAMES`, mô tả "Trọng số trong tổng điểm KPI, 5 trọng số cộng lại đủ 100", ô `%` |
| `khau-tru` | Khấu trừ | attendance | `lateGraceMinutes` Đi trễ vẫn hợp lệ, "Đi trễ tới số phút này vẫn tính là đúng giờ", ô `phút` |
| `tam-ung` | Tạm ứng | null | `advance` Số tiền được ứng, readonly `80% lương của ngày công 01–15` |
| `bao-hiem` | Bảo hiểm | insurance | `bhxhPct` BHXH, `bhytPct` BHYT, `bhtnPct` BHTN; mô tả "Phần người lao động đóng, tính trên lương đóng bảo hiểm"; ô `%` decimals 2 |
| `thue` | Thuế | tax | `personalDeduction` Giảm trừ bản thân, "Trừ vào thu nhập trước khi tính thuế, mỗi tháng", tiền · `dependantDeduction` Giảm trừ người phụ thuộc, "Cho mỗi người phụ thuộc, mỗi tháng", tiền · `shortContract` Hợp đồng ngắn hạn, "Khấu trừ thẳng trên thu nhập của hợp đồng ngắn hạn", hai ô: `shortContractPct` "Tỉ lệ khấu trừ" % và `shortContractThreshold` "Khi thu nhập từ" tiền · `brackets` Biểu thuế, "Lũy tiến từng phần, 5 bậc, theo thu nhập tính thuế mỗi tháng", `brackets: true` (Task 11) |
| `ky-luong` | Kỳ lương | payCalendar | `payDay` Ngày trả lương, "Ngày trong tháng sau, từ 1 đến 28", ô integer max 28 |

Số mục mỗi nhóm: OT 3 · Phụ cấp 1 · KPI 5 · Khấu trừ 1 · Tạm ứng 1 · Bảo hiểm 3 · Thuế 4 · Kỳ lương 1.

**Trang:**
- **Nhóm:**
  - `?group=<key>` chọn nhóm, mặc định `lam-them`. Nút chọn nhóm bo góc 8px, có số mục.
  - Mỗi nhóm có BE dùng một `useSettingsDraft(group, fields của nhóm)`.
  - Nhóm `tam-ung` chỉ có chữ.
- **Vùng lưu:**
  - Khi có thay đổi, hiện ô chọn `Áp dụng từ tháng` và ô lý do ngay trên thanh lưu.
  - Ruling: M4 vẽ lúc chưa đổi gì, nên không có hai ô này.
  - Thanh lưu: chữ trạng thái, `Huỷ`, `Lưu`. Bấm Lưu mở `SaveConfirmDialog`.
- **Rời trang:** đổi nhóm hay rời trang khi còn chỗ sửa dở thì hỏi bằng `window.confirm`, giữ hành vi cũ.
- **Tìm kiếm:**
  - Ô tìm trong thẻ tìm trên mọi nhóm bằng `searchSettings`, so khớp `normalizeSearch(tiêu đề + tên nhóm + mô tả)`.
  - Kết quả hiện tiêu đề, tên nhóm và chữ `Mở mục`.
  - Bấm một kết quả thì sang `?group=&setting=<item key>`, cuộn tới mục và focus ô đầu tiên của nó.
  - `?q=` điền sẵn ô tìm.
- **Bỏ:** dải vàng, các bộ lọc, chữ "sắp có", mục chỉ đọc kiểu cũ.

**Các bước**

- [ ] **Step 1: Viết lại** `web/tests/settings-search.spec.ts` (khung 1440×900) với các test:

```ts
test('groups list only the eight groups with their item counts', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  for (const [name, n] of [['OT', 3], ['Phụ cấp', 1], ['KPI', 5], ['Khấu trừ', 1], ['Tạm ứng', 1], ['Bảo hiểm', 3], ['Thuế', 4], ['Kỳ lương', 1]])
    await expect(page.getByRole('button', { name: `${name} ${n}`, exact: true })).toBeVisible();
});
test('no gold strip, no Chưa xác nhận filter, no menu count', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  for (const t of ['chưa ai xác nhận', 'Chưa xác nhận', 'Xem trước']) await expect(page.locator('body')).not.toContainText(t);
  await expect(page.getByRole('link', { name: 'Tất cả cài đặt' })).toHaveText(/^\s*Tất cả cài đặt\s*$/);
});
test('search finds items across groups without diacritics', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca');
  await page.getByRole('textbox', { name: 'Tìm theo tên cài đặt' }).fill('giam tru');
  await page.getByRole('button', { name: /Giảm trừ bản thân/ }).click();
  await expect(page).toHaveURL(/group=thue/);
  await expect(page).toHaveURL(/setting=personalDeduction/);
  await expect(page.getByRole('textbox', { name: 'Giảm trừ bản thân' })).toBeFocused();
});
// Giữ nguyên, không sửa chữ nào, hai test đang chạy của file cũ:
// 'frame search carries only month context and returns to its source with Back' (dòng 136–146);
// 'the old ?hop=them-chuc-vu address opens no add-position dialog' (dòng 316–322).
test('saving BHXH 8% → 8,5% from 11/2026 confirms the change line', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  await page.getByRole('textbox', { name: 'BHXH' }).fill('8,5');
  await page.getByRole('combobox', { name: 'Áp dụng từ tháng' }).selectOption({ label: 'Tháng 11/2026' });
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Lưu thay đổi' });
  await expect(dlg).toContainText('BHXH 8% → 8,5%, áp dụng từ tháng 11/2026');
  await dlg.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết builder, trang và `SettingItem` (props `entry`, `draft`, `errors`, `state`). Xoá các hàm cũ trong service.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings-screens.ts web/src/views/admin/settings/AllSettingsView.vue web/src/views/admin/settings/all/SettingItem.vue web/src/services/admin-config.ts web/src/services/admin-settings.ts web/tests/settings-search.spec.ts
git commit -m "feat(web): all settings shows the eight stored groups, search kept, no unconfirmed strip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Bảng biểu thuế 5 bậc

**Files:**
- Modify: `web/src/views/admin/settings/all/SettingItem.vue`
- Optional create: `web/src/views/admin/settings/all/BracketTable.vue`
- Test: `web/tests/settings-search.spec.ts`

**Bảng** gồm các cột Bậc, Thu nhập trên, Đến, Thuế suất:
- **Thu nhập trên:** chữ, là `0 đ` ở bậc 1 và mức "Đến" của bậc trước ở các bậc sau.
- **Đến:** ô tiền ở bậc 1–4, tên truy cập `Bậc N · đến`. Bậc 5 ghi chữ `Không giới hạn`.
- **Thuế suất:** ô `%`, decimals 2, max 100, tên truy cập `Bậc N · thuế suất`.
- Lỗi lấy từ `groupErrors`. Gợi ý hiện ngay dưới ô sai và Lưu bị khoá.
- Câu dưới bảng: `Mức “thu nhập trên” của mỗi bậc lấy theo mức “đến” của bậc trước.`
- Ruling: không thêm hay bớt bậc (YAGNI). BE vẫn nhận từ 1 đến 10 bậc.

**Các bước**

- [ ] **Step 1: Thêm test thất bại**

```ts
test('tax brackets refuse a bound below the previous one', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=thue');
  const b2 = page.getByRole('textbox', { name: 'Bậc 2 · đến' });
  await b2.fill('5.000.000');
  await expect(page.getByText('Phải lớn hơn 10.000.000 đ')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu', exact: true })).toBeDisabled();
  await b2.fill('35.000.000');
  await expect(page.locator('tr', { has: page.getByText('3', { exact: true }) })).toContainText('35.000.000 đ');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Lưu thay đổi' })).toContainText('Biểu thuế bậc 2, đến 30.000.000 đ → 35.000.000 đ, áp dụng từ tháng 10/2026');
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết bảng.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/settings/all web/tests/settings-search.spec.ts
git commit -m "feat(web): editable five-bracket tax table with ascending bounds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Lịch sử và Hoàn tác

**Files:**
- Modify: `web/src/builders/api/settings-screens.ts`
- Modify: `web/src/views/admin/settings/all/SettingItem.vue`, `web/src/views/admin/settings/AllSettingsView.vue`
- Modify: `web/src/views/admin/settings/all/RevertDialog.vue` (viết lại)
- Modify: `web/src/services/admin-config.ts`: bỏ `revertSetting`, `revertParam`, `previewParams`.
- Test: `web/tests/settings-search.spec.ts`

**Interfaces**

*Produces:*

```ts
export function revertValues(group: GroupKey, row: HistoryItem, state: GroupState, items: HistoryItem[]): Values | null;
```

Cách tính `revertValues`:
- Nhóm `kpiWeights`: lấy mọi dòng cùng `at` và cùng `month` với `row`, trả về số đang có với các ô đó đặt lại bằng `from`. Trả `null` nếu tổng khác 100.
- Các nhóm khác: `{ [row.field]: row.from }`.

**Lịch sử trên trang:**
- Khi mở một nhóm, tải `getSettingsHistory(path)` của nhóm đó.
- Mỗi mục có nút `Lịch sử` / `Ẩn lịch sử`. Bảng lịch sử có nhãn `Lịch sử · N lần sửa`.
- Bảng chỉ có các dòng thuộc ô của mục, dựng bằng `historyRow`.
- Các cột: Ô, Áp dụng từ, Số cũ → số mới, Lý do, Người sửa, Lúc sửa, Thao tác.
- Nút `Hoàn tác` khoá khi nhóm còn chỗ sửa dở hoặc `revertValues` trả `null`.

**Hộp Hoàn tác** (`RevertDialog`, viết lại):
- Tiêu đề `Hoàn tác`.
- Danh sách các dòng sẽ đổi, theo hướng số hiện tại → số cũ, ví dụ `BHXH 8,5% → 8%`.
- Ô chọn `Áp dụng từ tháng`, các tháng từ `minMonth`.
- Lý do không bắt buộc. Bỏ `REASON_MIN` / `reasonOk` khỏi hộp này.
- Nút `Huỷ` / `Hoàn tác`.
- Xác nhận thì gọi `saveSettingsGroup(path, { effectiveMonth, values, reason, stamp })`.
- Xong thì `toast.ok('Đã hoàn tác')` và tải lại nhóm cùng lịch sử. Lỗi stale xử lý như mọi màn.

**Các bước**

- [ ] **Step 1: Thêm test thất bại**

```ts
test('Hoàn tác adds a new history row', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=bao-hiem');
  // lưu BHXH 8 → 8,5 từ Tháng 10/2026 (mặc định) qua hộp Lưu thay đổi
  const item = page.locator('[data-setting-key="bhxhPct"]');
  await item.getByRole('button', { name: 'Lịch sử' }).click();
  await expect(item.locator('tbody tr')).toHaveCount(1);
  await expect(item.locator('tbody tr').first()).toContainText('8% → 8,5%');
  await item.getByRole('button', { name: 'Hoàn tác' }).click();
  const dlg = page.getByRole('dialog', { name: 'Hoàn tác' });
  await expect(dlg).toContainText('BHXH 8,5% → 8%');
  await dlg.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByText('Đã hoàn tác')).toBeVisible();
  await expect(item.locator('tbody tr')).toHaveCount(2);
  await expect(item.locator('tbody tr').first()).toContainText('8,5% → 8%');
  await expect(page.getByRole('textbox', { name: 'BHXH' })).toHaveValue('8');
});
test('a KPI change reverts as one set', async ({ page }) => {
  await page.goto('/admin/cai-dat/tat-ca?group=luong-kpi');
  // Người dùng 22, Tự đánh giá 8 → Lưu → xác nhận
  // Lịch sử của mục 'Người dùng' → Hoàn tác → hộp có 'Trọng số Người dùng 22% → 24%' và 'Trọng số Tự đánh giá 8% → 6%' → Hoàn tác
  await expect(page.getByRole('textbox', { name: 'Người dùng' })).toHaveValue('24');
  await expect(page.getByRole('textbox', { name: 'Tự đánh giá' })).toHaveValue('6');
});
test('Hoàn tác is off while the group has unsaved edits', async ({ page }) => {
  // sau khi đã có một dòng lịch sử: gõ BHYT 2 → nút Hoàn tác của BHXH bị khoá
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/settings-screens.ts web/src/views/admin/settings web/src/services/admin-config.ts web/tests/settings-search.spec.ts
git commit -m "feat(web): per-item history and Hoàn tác through the normal save" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Dọn chữ và mã cũ

**Files:**
- Modify: `web/src/views/admin/settings/SettingsFrame.vue`: bỏ `getSettingsBadges`, `useLoad` và `<span class="cnt2">`.
- Modify: `web/src/views/admin/settings/fields/SaveBar.vue`: đổi `saveLabel` mặc định thành `'Lưu'`.
- Modify: `web/src/services/admin-config.ts`:
  - bỏ `readParams`, `putParams`, `getSettingsBadges` và các import không còn dùng;
  - giữ phần Chế độ theo loại, ngày lễ và nhật ký.
- Modify: `web/src/services/admin-settings.ts`
- Delete: `web/src/builders/admin-config/pay.ts`, `params.ts`, `all-settings.ts`. Trước khi xoá, chạy `grep -rn "admin-config/(pay|params|all-settings)" web/src` để chắc không còn file nào import.
- Test: `web/tests/settings-wording.spec.ts`

**Các bước**

- [ ] **Step 1: Viết test thất bại**

```ts
for (const path of ['/admin/cai-dat', '/admin/cai-dat/tat-ca', '/admin/cai-dat/lich', '/admin/cai-dat/kpi', '/admin/cai-dat/che-do/nhan-vien'])
  test(`${path} has no preview or unconfirmed wording`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.locator('.main')).toBeVisible();
    for (const t of ['Xem trước', 'chưa chốt', 'Chưa xác nhận', 'chưa ai xác nhận', 'chưa có dữ liệu giả']) await expect(page.locator('body')).not.toContainText(t);
    await expect(page.locator('nav.sub .cnt2')).toHaveCount(0);
  });
```

- [ ] **Step 2:** Chạy test, phải FAIL vì menu còn số đếm.
- [ ] **Step 3: Dọn mã.** Sau đó kiểm `grep -rn "Xem trước\|chưa chốt\|Chưa xác nhận\|first-run\|settings/params" web/src`: chỉ được phép còn dòng chú thích `mock/payroll.ts:106`.
- [ ] **Step 4: Chạy toàn bộ bộ test giao diện.**
  - Lệnh: `cd web && PW_PORT=4263 npx playwright test > <log> 2>&1`
  - Phải PASS hết, trừ `staff-desktop-drawers.spec.ts:127`: test này thỉnh thoảng lỗi sẵn trên main. Nếu nó lỗi, chạy riêng với `--repeat-each=5` để xác nhận.
- [ ] **Step 5: Commit**

```bash
git add -A web/src web/tests/settings-wording.spec.ts
git commit -m "chore(web): drop the unconfirmed count, preview wording and the v1 settings builders" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Đợt 3: App nhân viên, lưới chấm công

### Task 14: `checkInLock` và khoảng cách (thuần)

**Files:**
- Create: `web/src/builders/api/check-in.ts`
- Test: `web/tests/check-in-lock.spec.ts`

**Interfaces**

*Produces:*

```ts
export type LatLng = { lat: number; lng: number };
export function distanceM(a: LatLng, b: LatLng): number;            // haversine, R = 6371000, Math.round
export type PunchLock = { locked: false } | { locked: true; reason: string };
export function checkInLock(input: { workday: boolean; zone: Zone | null; position: LatLng | null | undefined }): PunchLock;
```

**Thứ tự xét** (giống BE):

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | `workday === false` | khoá, `Hôm nay không phải ngày làm của bạn` |
| 2 | `zone === null` | mở |
| 3 | `position === undefined` | khoá, `Đang lấy vị trí…` |
| 4 | `position === null` | khoá, `Không lấy được vị trí` |
| 5 | `d > radiusM` | khoá, `Bạn đang cách văn phòng ${vnd(d)} m` |
| 6 | còn lại | mở |

**Các bước**

- [ ] **Step 1: Viết test thất bại**

```ts
const zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
test('distance is haversine rounded to the metre', () => {
  expect(distanceM(zone, { lat: 10.782296, lng: 106.7009 })).toBe(600);
  expect(distanceM(zone, zone)).toBe(0);
});
test('lock order follows the BE: workday, location, zone', () => {
  const far = { lat: 10.782296, lng: 106.7009 };
  expect(checkInLock({ workday: false, zone, position: far })).toEqual({ locked: true, reason: 'Hôm nay không phải ngày làm của bạn' });
  expect(checkInLock({ workday: true, zone: null, position: null })).toEqual({ locked: false });
  expect(checkInLock({ workday: true, zone, position: undefined })).toEqual({ locked: true, reason: 'Đang lấy vị trí…' });
  expect(checkInLock({ workday: true, zone, position: null })).toEqual({ locked: true, reason: 'Không lấy được vị trí' });
  expect(checkInLock({ workday: true, zone, position: far })).toEqual({ locked: true, reason: 'Bạn đang cách văn phòng 600 m' });
  expect(checkInLock({ workday: true, zone, position: { lat: 10.788142, lng: 106.7009 } })).toEqual({ locked: true, reason: 'Bạn đang cách văn phòng 1.250 m' });
  expect(checkInLock({ workday: true, zone, position: zone })).toEqual({ locked: false });
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết hai hàm.
- [ ] **Step 4:** Chạy lại, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/check-in.ts web/tests/check-in-lock.spec.ts
git commit -m "feat(web): check-in lock rule and haversine distance" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: Khoá nút chấm công trong app nhân viên

**Files:**
- Modify: `web/src/mock/staff-phone.ts`:
  - `HomeView` thêm `zone: Zone | null` và `workday: boolean`;
  - `homeView()` lấy `zone` từ `zoneOf().zone` của `./settings`, `workday: true`.
- Modify: `web/src/builders/api/staff-phone.ts`: `homeViewOf` thêm `zone: t.zone ?? null` và `workday: t.workday !== false`. Chỉ thêm trường, không đổi trường cũ.
- Modify: `web/src/services/staff-phone.ts`: export `locate(): Promise<LatLng | null>`, dùng lại `position()`; không có toạ độ thì trả `null`.
- Modify: `web/src/views/staff-phone/components/ShiftCard.vue`
- Modify: `web/playwright.config.ts`: trong `use` thêm `geolocation: { latitude: 10.7769, longitude: 106.7009 }` và `permissions: ['geolocation']`. Mặc định là đứng ở văn phòng, nên các test cũ không đổi.
- Test: `web/tests/staff-check-in-zone.spec.ts`

**ShiftCard:**
- Khi `home.zone` khác null, lúc mount và mỗi lần `home` đổi thì gọi `locate()`. Đang chờ thì `position = undefined`.
- Tính `lock = checkInLock({ workday: home.workday, zone: home.zone, position })`.
- Khi `lock.locked`:
  - nút đang hiện (Check-in hoặc Check-out) có thuộc tính `disabled`, kèm `aria-describedby` trỏ tới dòng lý do;
  - dòng lý do thay cho dòng vị trí, có biểu tượng `pin`.
- Khi không khoá: giữ dòng vị trí như cũ.
- Ruling: khoá cả Check-out, vì BE kiểm vùng ở mọi lần gọi `POST /me/punches`. Người dùng nói "khoá nút chấm công".

**Các bước**

- [ ] **Step 1: Viết test thất bại** (dùng `openPhone` của `tests/fixtures/staff-phone.ts`):

```ts
test('outside the zone the punch button is locked with the distance', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 10.782296, longitude: 106.7009 });
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
  await expect(card).toContainText('Bạn đang cách văn phòng 600 m');
});
test.describe('without location permission', () => {
  test.use({ permissions: [] });
  test('the punch button is locked with Không lấy được vị trí', async ({ page }) => {
    await openPhone(page, '/nv/hom-nay');
    const card = page.getByRole('region', { name: 'Ca hôm nay' });
    await expect(card).toContainText('Không lấy được vị trí');
    await expect(card.getByRole('button', { name: /Check-out/ })).toBeDisabled();
  });
});
test('at the office the button works as before', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card.getByRole('button', { name: /Check-out/ })).toBeEnabled();
  await expect(card).toContainText('Đúng vị trí văn phòng GFT');
});
test('the desktop page locks the same way', async ({ page, context }) => {
  await context.setGeolocation({ latitude: 10.782296, longitude: 106.7009 });
  await openPhone(page, '/nv/hom-nay', { width: 1280, height: 900 });
  await expect(page.getByRole('region', { name: 'Ca hôm nay' })).toContainText('Bạn đang cách văn phòng 600 m');
});
```

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy lại file này và mọi `tests/staff-*.spec.ts`, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/mock/staff-phone.ts web/src/builders/api/staff-phone.ts web/src/services/staff-phone.ts web/src/views/staff-phone/components/ShiftCard.vue web/playwright.config.ts web/tests/staff-check-in-zone.spec.ts
git commit -m "feat(web): lock the punch button outside the zone, without location or on an off day" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Chữ "nghỉ" ở ngày ngoài tuần và ngày trả lương ở thu nhập

**Files:**
- Modify: `web/src/views/staff-phone/components/WeekCard.vue`, `web/src/views/staff-phone/components/MonthCalendar.vue`: ô `kind === 'off'` có thêm `<small class="off-cap" aria-hidden="true">nghỉ</small>` dưới số ngày, đặt ngoài span `role="img"`.
- Modify: `web/src/mock/staff-phone.ts`:
  - `HomeView.income` thêm `payDate: string | null`;
  - `IncomeView` thêm `payDate: string | null`;
  - cả hai lấy từ `payDateOf(MOCK_MONTH)` của `./settings`, ra `'2026-11-10'`.
- Modify: `web/src/builders/api/staff-phone.ts`: `homeViewOf` và `incomeViewOf` lấy `payDate` từ `income.payDate ?? null`. Chỉ thêm trường.
- Modify: `web/src/views/staff-phone/HomeView.vue`, `web/src/views/staff-phone/IncomeView.vue`, `web/src/views/staff-desktop/parts/IncomeColumn.vue`: khi có `payDate` thì thêm một dòng nhỏ `trả ngày ${dm(payDate)}` dưới số tiền.
- Ruling: tháng mock là 10/2026, nên chữ là `trả ngày 10/11`. Ví dụ "trả ngày 10/12" của người dùng là cho tháng 11.
- Test: `web/tests/staff-off-days.spec.ts`

**Các bước**

- [ ] **Step 1: Viết test thất bại**

```ts
test('days outside the work week show nghỉ', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const week = page.getByRole('region', { name: 'Tuần này' });
  await expect(week.locator('.off-cap')).toHaveCount(1);        // CN 01/11
  await openPhone(page, '/nv/cham-cong');
  await expect(page.locator('.off-cap').first()).toHaveText('nghỉ');
});
test('income shows the pay date on home, income and desktop', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await expect(page.locator('main')).toContainText('trả ngày 10/11');
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.locator('main')).toContainText('trả ngày 10/11');
  await openPhone(page, '/nv/hom-nay', { width: 1280, height: 900 });
  await expect(page.locator('body')).toContainText('trả ngày 10/11');
});
```

Nếu WeekCard không phải region có tên `Tuần này`, dùng đúng tên truy cập đang có của nó. Kiểm trong `WeekCard.vue`.

- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy lại file này và mọi `tests/staff-*.spec.ts`, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/views/staff-phone web/src/views/staff-desktop/parts/IncomeColumn.vue web/src/mock/staff-phone.ts web/src/builders/api/staff-phone.ts web/tests/staff-off-days.spec.ts
git commit -m "feat(web): show nghỉ on days off and the pay date on income" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Lưới chấm công Admin theo tuần từng người

**Files:**
- Modify: `web/src/builders/api/attendance.ts`:
  - `AttendanceInput` thêm `weekdays?: Record<string, number[]>` (khoá là username);
  - `baseCell` nhận thêm `weekdays: number[]`. Ngày không có timesheet mà thứ (getUTCDay, 1 = T2 … 6 = T7, CN luôn nghỉ) không nằm trong `weekdays` thì là `off`;
  - mặc định `[1,2,3,4,5,6]`, nên khi không truyền thì lưới y như cũ.
- Test: `web/tests/attendance-weekdays.spec.ts` (thuần)

Ruling: BE chưa có route trả tuần của nhiều người một lúc. Task này chỉ chuẩn bị chỗ nhận. Nhắn phiên BE xin một trường cho việc đó. Mock không đổi.

**Các bước**

- [ ] **Step 1: Viết test thất bại**
  - Dựng một `AttendanceInput` tối thiểu: một nhân viên `nv-a` đang làm, `today = '2026-10-28'`, không có timesheet.
  - Kiểm ô thứ Bảy 24/10 của `nv-a`:
    - không truyền `weekdays` thì `kind` là `'absent'`;
    - truyền `weekdays: { 'nv-a': [1,2,3,4,5] }` thì `kind` là `'off'`.
- [ ] **Step 2:** Chạy test, phải FAIL.
- [ ] **Step 3:** Viết code.
- [ ] **Step 4:** Chạy lại file này và `tests/attendance-*.spec.ts`, phải PASS.
- [ ] **Step 5: Commit**

```bash
git add web/src/builders/api/attendance.ts web/tests/attendance-weekdays.spec.ts
git commit -m "feat(web): attendance grid can take each person's work week" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Xác minh cuối

- Chạy `cd web && PW_PORT=4263 npx playwright test > <log> 2>&1` rồi đọc dòng tổng kết.
- Báo cáo ghi:
  - lệnh đã chạy và kết quả thật;
  - test lỗi sẵn (nếu có);
  - phần chưa kiểm được: đường gọi API thật trong `settings-store.ts` chỉ được kiểm khi BE xong, bằng test API của phiên BE.
