# App nhân viên trên điện thoại (`/nv/*`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm lại 5 màn và 2 hộp trượt của app nhân viên trên điện thoại theo board J1–J7, chạy trên dữ liệu giả, không gọi `/api`.

**Architecture:**

- `web/src/mock/staff-phone.ts` giữ dữ liệu của Lê Hoàng Nam và các hàm dựng dữ liệu cho từng màn (chuỗi hiển thị sẵn).
- `services/staff-phone.ts` bọc chúng bằng `respond()`.
- Màn Vue chỉ hiển thị; hình học SVG (vòng cung, thanh giờ, chấm KPI) tính trong màn.
- Task 1 dựng nền: dữ liệu, service, layout, thanh tab, hộp trượt, các phần dùng chung và màn Tôi. Task 2–5 mỗi task một màn, chạy song song trên file riêng. Task 6 kiểm luồng qua nhiều màn.

**Tech Stack:** Vue 3.5 + Vue Router 5 + Pinia, Vite 8, Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-04-staff-phone-app-design.md](../specs/2026-11-04-staff-phone-app-design.md)

**Gốc:** nhánh `claude/staff-phone-app-540855`, viết trên `a3b7a74` (mã giống `014c93f`).

**Mốc trước khi sửa (04/11/2026, `014c93f`, `PW_PORT=4194`):** `npm --prefix web run test:ui` cho 40 passed, 47 skipped, 0 failed.

## Global Constraints

- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc; không đọc `spec/` gốc.
- Không sửa file Admin hay file chung, trừ đúng các file trong "File Structure". Cấm sửa:
  - `utils/format.ts`, `components/ui/icons.ts`, `components/ui/Icon.vue`;
  - `mock/accounts.ts`, `mock/clock.ts`, `mock/respond.ts`, `mock/overview.ts`;
  - `router/index.ts`, `views/DesignIndex.vue`, `styles/base.css`, `styles/overlay.css`, `App.vue`.
- Không có `fetch(` hay `api(` trong mã mới của `/nv/*`. Test không dùng `page.route`. Mỗi file test có một test kiểm bộ ghi request `/api` rỗng.
- Xác minh chỉ bằng test. Không chạy typecheck hay prettier. Luôn đặt cổng riêng:
  - một file: `cd web && PW_PORT=<cổng> npx playwright test <tên-file>`;
  - cả bộ: `cd web && PW_PORT=4194 npx playwright test`.
  - Task 1 và 6 dùng cổng 4194; Task 2: 4294; Task 3: 4295; Task 4: 4296; Task 5: 4297.
- Mỗi task: viết test, chạy cho đỏ, viết mã, chạy cho xanh, commit.
  - Commit message dạng `feat(web): …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Chỉ `git add` file của task, không `git add -A`.
  - Task 2–5 chạy song song trong cùng worktree. Lỗi `index.lock` thì chờ vài giây rồi chạy lại lệnh git.
- Câu chữ, con số, màu, cỡ chữ chép đúng spec. Đối chiếu khi cần:
  - bộ sinh: `C:\Users\52.AI UD\AppData\Local\Temp\claude\C--Users-52-AI-UD-Project-Vladilena-Milize--claude-worktrees-admin-ui-concept-6445c9\e0f113d9-fd93-45b7-a7d6-cbcee0c30c32\scratchpad\gen-mobile.js`;
  - ảnh: `…\scratchpad\preview\phone*.png`.
- Design system GFT:
  - màu qua biến CSS của `styles/base.css` (`--text`, `--muted`, `--ground`, `--surface`, `--surface-dark`, `--surface-dark-raised`, `--ink-on-dark-muted`, `--gold`, `--gold-light`, `--gold-pale`, `--border`, `--control`, `--status-done`, `--status-pending`, `--status-rejected`);
  - không đổ bóng;
  - vàng không làm chữ hay viền trên nền sáng;
  - mỗi màn tối đa một khối nền vàng;
  - focus 2px `--text` cách 2px; trên nền tối viền trắng;
  - Geist; League Spartan 600 chỉ cho h1.
- Danh sách mỗi dòng một giá trị chính, `white-space: nowrap`. Lý do, ngày giờ duyệt chỉ có trong hộp trượt.
- Không ô nhập hay nhãn giá trị dạng viên thuốc trong nội dung. Ô nhập bo 8px.
- Không đặt nút giả. Nút nào cũng làm đúng việc spec ghi.

## Review Focus

1. **Mở hộp trượt bằng URL hỏng.** `?ngay=2026-10-29`, `?ngay=abc`, `?yc=khong-co`: không mở hộp, không lỗi, tham số bị bỏ khỏi URL. Test ở Task 3 và 4.
2. **Đóng hộp trượt bằng Đóng, Esc, bấm nền.** Hộp biến mất, tham số bị bỏ, focus về đúng ô hoặc dòng đã bấm, trang không còn khoá cuộn. Test ở Task 3 và 4.
3. **Check-out rồi chuyển tab.** Trạng thái giữ trong bộ nhớ khi đi bằng thanh tab: Gần đây và hộp 28/10 hiện 09:40. Test ở Task 6.
4. **Màn 390px và 320px.** Không cuộn ngang. Thanh tab không che dòng cuối nội dung (đệm đáy 112px). Test ở Task 1 (390) và Task 6 (320).
5. **Lọc tab rồi mở dòng.** Lọc "Từ chối", bấm dòng, đóng hộp: tab vẫn "Từ chối", focus về dòng. Test ở Task 4.

## File Structure

| File | Trách nhiệm | Task |
|------|-------------|------|
| `web/src/mock/staff-phone.ts` (mới) | Dữ liệu của Nam (spec mục 1–2) và hàm dựng dữ liệu từng màn | 1 |
| `web/src/services/staff-phone.ts` (viết lại) | Bọc mock bằng `respond()`; đổi mật khẩu, đăng xuất | 1 |
| `web/src/services/staff-desktop.ts` | Nhận `getSelfKpi`, `saveSelfKpi` nguyên văn (spec R11) | 1 |
| `web/src/layouts/PhoneLayout.vue` (viết lại) | Cột 430px, thanh tab nổi | 1 |
| `web/src/styles/phone.css` (viết lại) | Lớp dùng chung dưới `.ph-app` và `.ph-sheet` (spec 3.3–3.4) | 1 |
| `web/src/views/staff-phone/components/PhIcon.vue` (mới) | Bộ biểu tượng của board | 1 |
| `web/src/views/staff-phone/components/BottomSheet.vue` (sửa) | Hình theo board, bỏ nút × (spec 3.5) | 1 |
| `web/src/views/staff-phone/components/ChangePasswordSheet.vue` | Giữ; chỉ đổi nếu cần cho bo 8px | 1 |
| `web/src/views/staff-phone/components/MonthSwitch.vue` (viết lại) | Chọn tháng, cả hai nút tắt (spec 3.6) | 1 |
| `web/src/views/staff-phone/components/RequestRow.vue` (mới) | Dòng yêu cầu dùng ở J1, J4 (spec 3.7) | 1 |
| `web/src/views/staff-phone/ProfileView.vue` (viết lại) | J7 | 1 |
| `web/src/views/staff-phone/HomeView.vue`, `AttendanceView.vue`, `RequestsView.vue`, `IncomeView.vue` | Task 1 thay bằng màn tạm chỉ có `<div class="ph"><h1>…</h1></div>`; Task 2–5 viết thật | 1, 2–5 |
| `web/src/router/routes/staff-phone.ts` | Sửa chú thích (bỏ `?kb`, ghi `?ngay`, `?yc`, `?hop`) | 1 |
| `web/tests/fixtures/staff-phone.ts` (mới) | `openPhone(page, path)` dùng chung cho test | 1 |
| `web/tests/staff-phone-shell.spec.ts` (mới) | Thanh tab, khung, J7 | 1 |
| `web/tests/staff-ux.spec.ts` | Bỏ test `fixme` của app điện thoại cũ | 1 |
| `web/src/views/staff-phone/HomeView.vue` + `web/tests/staff-phone-home.spec.ts` | J1 | 2 |
| `web/src/views/staff-phone/AttendanceView.vue`, `components/DaySheet.vue` (mới) + `web/tests/staff-phone-attendance.spec.ts` | J2, J3 | 3 |
| `web/src/views/staff-phone/RequestsView.vue`, `components/RequestSheet.vue` (mới) + `web/tests/staff-phone-requests.spec.ts` | J4, J5 | 4 |
| `web/src/views/staff-phone/IncomeView.vue`, `web/src/design-index/staff-phone.ts` + `web/tests/staff-phone-income.spec.ts` | J6, mục lục | 5 |
| `web/tests/staff-phone-flow.spec.ts` (mới) | Luồng qua nhiều màn | 6 |

Xoá ở Task 1:

- `web/src/builders/staff-phone/` (cả thư mục);
- trong `web/src/views/staff-phone/components/`: `AdvanceSheet.vue`, `AttendanceCalendar.vue`, `DayDetailSheet.vue`, `DayRequestSheet.vue`, `ExplanationSheet.vue`, `IncomeSlip.vue`, `KpiSelf.vue`, `LoadFeedback.vue`.

Giữ, không sửa:

- `views/staff-phone/useHop.ts`;
- `builders/staff-requests/`, `services/staff-requests.ts` (màn máy tính còn dùng).

## Rulings của plan

Phán quyết của thiết kế nằm ở spec mục 11. Dưới đây chỉ là phán quyết mới của plan.

- Ruling: P1 — Task 1 làm luôn J7 — test đăng xuất trên điện thoại của `auth-mock.spec.ts` cần màn Tôi chạy được ngay khi service cũ bị thay; J7 cũng là chỗ duy nhất thử `BottomSheet` trước Task 3–4 — rủi ro nếu sai: không có.
- Ruling: P2 — Task 2–5 chạy song song trong cùng worktree — mỗi task chỉ sửa file riêng (bảng trên); dữ liệu, service và phần dùng chung xong ở Task 1 — rủi ro nếu sai: hai lệnh git chạm `index.lock` cùng lúc thì chờ rồi chạy lại.
- Ruling: P3 — test chỉ kiểm dữ liệu giả qua giao diện, không import module mock phía Node — như plan Nhân sự — rủi ro nếu sai: lỗi dữ liệu hiện ở test giao diện, khó chỉ đúng chỗ hơn.
- Ruling: P4 — thông báo của "Tạo yêu cầu" dùng `toast.warnings([…])` (vai `status`) — toast `ok` màu xanh nghĩa là thành công, sai nghĩa; `error` có vai `alert`, quá nặng — rủi ro nếu sai: đổi một lời gọi.
- Ruling: P5 — phiên giả của test là `nhanvien`, đặt qua `addInitScript` — tên khác `admin` là nhân viên (`mock/accounts.ts`); test `auth-mock` cũng dùng tên này — rủi ro nếu sai: không có.

## Xung đột khi gộp

| File / chủ đề | Nhánh này | Nhánh Admin | Khi gộp |
|---------------|-----------|-------------|---------|
| `web/src/mock/staff-phone.ts` | Dữ liệu riêng của Nam: 17/10 iSAT, 12/10 phép năm, 27/10 chờ giải trình, phép còn 11 ngày, phiếu tháng 10 tạm tính | `feat/admin-bell-attendance`: `mock/attendance.ts` ghi 17/10 đi làm và còn 5 ngày phép. `feat/admin-payroll-kpi`: `mock/payroll.ts` có phiếu của Nam | Lead chọn một nguồn. Board J1–J7 theo số của Bảng lương. Có thể cho `mock/staff-phone.ts` đọc ngày công từ `mock/attendance.ts` và phiếu từ `mock/payroll.ts`, rồi xoá bảng ngày riêng |
| `web/src/design-index/staff-phone.ts` | Thay 21 dòng bằng 8 | Không sửa | Bản của nhánh này |
| `web/src/services/staff-desktop.ts` | Thêm `getSelfKpi`, `saveSelfKpi` nguyên văn, bỏ dòng re-export từ `staff-phone` | Không sửa | Bản của nhánh này |
| `web/src/views/DesignIndex.vue` | Không sửa; nhóm "Nhân viên · điện thoại" còn 8 dòng nên số "x/112" giảm 13 | Có thể sửa danh sách nhóm | Lead chỉnh `TOTAL` nếu muốn |
| Biểu tượng | `PhIcon.vue` riêng | Có thể thêm vào `components/ui/icons.ts` | Có thể gộp sau (spec R12) |
| `mock/accounts.ts` | Không sửa; nhân viên vẫn tên "Nguyễn Thu Hà", app điện thoại hiện Nam | — | Có thể đổi tên mặc định của nhân viên thành Lê Hoàng Nam (spec R2) |
| Phiếu lương đầy đủ | J6 không có liên kết (spec R6) | `mock/payroll.ts` có phiếu | Thêm liên kết khi có trang phiếu cho nhân viên trên dữ liệu giả |
| `utils/format.ts`, `nav.ts`, `AdminLayout.vue`, `mock/overview.ts`, `router/routes/admin-attendance.ts` | Không sửa | Sửa | Không xung đột |

Việc của lead sau khi gộp: chạy lại `npm --prefix web run test:ui` trên nhánh đã gộp.

---

### Task 1: Nền app điện thoại và màn Tôi (J7)

**Files:**

- Create:
  - `web/src/mock/staff-phone.ts`;
  - `web/src/views/staff-phone/components/PhIcon.vue`, `RequestRow.vue`;
  - `web/tests/fixtures/staff-phone.ts`, `web/tests/staff-phone-shell.spec.ts`.
- Rewrite:
  - `web/src/services/staff-phone.ts`;
  - `web/src/layouts/PhoneLayout.vue`, `web/src/styles/phone.css`;
  - `web/src/views/staff-phone/components/MonthSwitch.vue`;
  - `web/src/views/staff-phone/ProfileView.vue`;
  - màn tạm: `HomeView.vue` (h1 "Hôm nay"), `AttendanceView.vue` (h1 "Chấm công"), `RequestsView.vue` (h1 "Yêu cầu"), `IncomeView.vue` (h1 "Thu nhập").
- Modify:
  - `web/src/views/staff-phone/components/BottomSheet.vue`, `ChangePasswordSheet.vue`;
  - `web/src/services/staff-desktop.ts`;
  - `web/src/router/routes/staff-phone.ts`;
  - `web/tests/staff-ux.spec.ts`.
- Delete: theo danh sách "Xoá ở Task 1".

**Interfaces:**

- Produces (`web/src/mock/staff-phone.ts`). Task 2–6 dùng đúng tên và kiểu này:

```ts
export type DayKind = 'work' | 'late' | 'leave' | 'absent' | 'todo';
export type CellKind = DayKind | 'future' | 'off';
export type RequestStatus = 'pend' | 'done' | 'rej';
export type PhoneIconName =
  | 'home' | 'cal' | 'doc' | 'wallet' | 'user' | 'left' | 'right' | 'plus' | 'pin'
  | 'out' | 'clock' | 'leave' | 'coin' | 'lock' | 'target' | 'shield' | 'gift' | 'x';

export type CalendarCell = {
  date: string; // 'YYYY-MM-DD'
  day: string; // '26', '01' (J1) hoặc '1'…'31' (J2, không số 0 đầu)
  dow: string; // 'T2' … 'CN'
  kind: CellKind;
  today: boolean;
  label: string; // tên truy cập, vd. 'Thứ Hai 26/10: đi làm', 'Hôm nay, thứ Tư 28/10: đang làm'
  open: boolean; // true khi có dữ liệu ngày (mở J3)
};

export type RequestRowData = {
  id: string; // 'giai-trinh-2710' | 'phep-1210' | 'tam-ung-09' | 'gio-vao-0909'
  icon: 'clock' | 'leave' | 'coin';
  title: string; // 'Thiếu giờ ra 27/10'
  status: RequestStatus;
  statusText: string; // 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'
  month: string; // '2026-10'
};
export type RequestStep = { label: string; at: string | null; state: RequestStatus };
export type RequestDetail = RequestRowData & {
  kindLabel: string; // 'Giải trình' | 'Đơn nghỉ' | 'Tạm ứng lương'
  facts: [string, string][]; // [khoá, giá trị] theo spec 2.2, lý do đã có ngoặc kép cong
  steps: RequestStep[];
};

export type HomeView = {
  greeting: string; // 'Chào buổi sáng'
  name: string; initials: string; weekday: string; date: string; // 'Lê Hoàng Nam', 'HN', 'Thứ Tư', '28/10/2026'
  shiftLabel: string; // 'Ca HC · 08:00–17:00'
  shiftStart: string; shiftEnd: string; // '08:00', '17:00'
  now: string; // '09:40'
  checkIn: string; // '07:59'
  checkOut: string | null; // null, hoặc '09:40' sau checkOut()
  workedMin: number; shiftMin: number; // 101, 540
  worked: string; // '1g 41p'
  location: string; // 'Đúng vị trí văn phòng GFT'
  week: { range: string; cells: CalendarCell[] }; // '26/10 – 01/11', 7 ô
  alert: { date: string; text: string } | null; // '2026-10-27', '27/10 thiếu giờ ra · chờ duyệt giải trình'
  income: { label: string; net: string }; // 'Thu nhập tháng 10 · tạm tính', '14.278.183'
  requests: RequestRowData[]; // 2 dòng mới nhất
};

export type AttendanceView = {
  label: string; state: string; // 'Tháng 10/2026', 'Kỳ công đang mở'
  shiftLine: string; // 'Ca HC 08:00–17:00 · thứ Hai – thứ Bảy'
  tiles: { value: string; of: string | null; label: string }[]; // 21 / 26 Ngày công; 1 Lần đi muộn; 2 Ngày nghỉ có lương
  cells: (CalendarCell | null)[]; // 3 null rồi 31 ô
  recent: { date: string; kind: CellKind; day: string; times: string }[];
  // 5 dòng: { day: 'Thứ Tư 28/10', times: '07:59 – …' }, …
};

export type DayDetail = {
  date: string;
  title: string; // 'Thứ Ba 27/10/2026'
  shiftLine: string; // 'Ca HC 08:00–17:00'
  kind: DayKind; today: boolean;
  statusText: string; // 'Cần xử lý' | 'Đi làm' | 'Đang làm' | 'Nghỉ có lương' | 'Đi muộn' | 'Vắng'
  shiftStart: string; shiftEnd: string; now: string;
  in: string | null; out: string | null; lateMin: number;
  leave: { type: string; span: string } | null; // { type: 'Phép năm', span: 'Cả ngày' }
  claim: { sentAt: string; outClaim: string } | null; // { sentAt: '20:14', outClaim: '17:30' }
};

export type RequestsView = {
  counts: { all: number; pend: number; done: number; rej: number };
  groups: { month: string; label: string; rows: RequestRowData[] }[]; // 'Tháng 10', 'Tháng 9'
};

export type IncomeView = {
  title: string; note: string; label: string; state: string; // 'Thu nhập', 'Phiếu chính thức có khi Admin duyệt', 'Tháng 10/2026', 'Tạm tính'
  net: string; review: string; gross: string; deduction: string;
  kpi: {
    title: string; parts: string; percent: string; ratio: number; // 'KPI tháng 10', '5 phần', '66,14%', 0.6614
    pay: string; proposed: string;
    scores: { value: string; label: string }[];
  };
  lines: { icon: PhoneIconName; label: string; value: string; zero: boolean }[];
  total: string; // '14.278.183 ₫'
};

export type ProfileView = {
  name: string; initials: string; email: string; contract: string;
  facts: [string, string][]; // 6 cặp theo spec 8.2
  note: string;
};

export function homeView(): HomeView;
export function attendanceView(): AttendanceView;
export function dayDetail(date: string): DayDetail | null;
export function requestsView(): RequestsView;
export function requestDetail(id: string): RequestDetail | null;
export function incomeView(): IncomeView;
export function profileView(): ProfileView;
export function checkOutNow(): void; // ghi giờ ra = giờ của MOCK_NOW (09:40) cho MOCK_TODAY
```

- Produces (`web/src/services/staff-phone.ts`):

```ts
getHome(): Promise<HomeView>
getAttendance(): Promise<AttendanceView>
getDay(date: string): Promise<DayDetail | null>
getRequests(): Promise<RequestsView>
getRequest(id: string): Promise<RequestDetail | null>
getIncome(): Promise<IncomeView>
getProfile(): Promise<ProfileView>
checkOut(): Promise<HomeView> // checkOutNow() rồi trả homeView()
changePassword({ current, next }): Promise<{ ok: true }> // services/session.ts
logout(): Promise<{ ok: true }> // services/session.ts
```

- Produces (thành phần):
  - `PhIcon` props `{ name: PhoneIconName; size?: number = 20; stroke?: number = 1.8 }`.
  - `MonthSwitch` props `{ label: string; state: string }`; hai nút luôn `disabled`, tên "Tháng trước" / "Tháng sau".
  - `RequestRow` props `{ row: RequestRowData }`; là `RouterLink` tới `/nv/yeu-cau?yc=<id>`; `aria-label` "<title>, <statusText>".
    - Task 4 cần dòng mở hộp ngay trên màn, không đổi trang. Nên `RequestRow` nhận thêm prop `replace?: boolean`. `true` thì `RouterLink` dùng `replace` và giữ các tham số khác của URL.
  - `BottomSheet` props `{ title: string; sub?: string; dismissable?: boolean = true }`, slot `badge`, slot mặc định, emit `close`. Lớp gốc của hộp: `.ph-sheet`.
- Produces (`web/tests/fixtures/staff-phone.ts`):

```ts
// Khung 390×844, phiên giả 'nhanvien', ghi mọi request /api; trả mảng 'METHOD /path'.
export async function openPhone(page: Page, path: string, size = { width: 390, height: 844 }): Promise<string[]>;
```

- [ ] **Step 1: Viết `web/tests/fixtures/staff-phone.ts` và `web/tests/staff-phone-shell.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const TABS = [
  ['Hôm nay', '/nv/hom-nay'],
  ['Chấm công', '/nv/cham-cong'],
  ['Yêu cầu', '/nv/yeu-cau'],
  ['Thu nhập', '/nv/thu-nhap'],
  ['Tôi', '/nv/toi']
] as const;
const nav = page => page.getByRole('navigation', { name: 'Điều hướng' });

test('the staff phone app makes no /api call on any tab', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  for (const [name, path] of TABS) {
    await nav(page).getByRole('link', { name }).click();
    await expect(page).toHaveURL(path);
  }
  expect(calls).toEqual([]);
});

test('tab bar lists five tabs in order and marks only the open one', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await expect(nav(page).getByRole('link')).toHaveText(TABS.map(([n]) => n));
  for (const [name, path] of TABS) {
    await page.goto(path);
    await expect(nav(page).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('tab bar floats 16px above the bottom and no tab scrolls sideways', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  for (const [, path] of TABS) {
    await page.goto(path);
    const box = await nav(page).boundingBox();
    expect(Math.round(box!.y + box!.height)).toBe(844 - 16);
    expect(Math.round(box!.x)).toBe(16);
    expect(Math.round(box!.height)).toBe(68);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(w[0]).toBe(w[1]);
  }
});

test('Tôi shows Nam’s profile and work facts', async ({ page }) => {
  await openPhone(page, '/nv/toi');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tôi');
  await expect(page.getByText('Lê Hoàng Nam', { exact: true })).toBeVisible();
  await expect(page.getByText('nam.le@gft.vn')).toBeVisible();
  await expect(page.getByText('Chính thức', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible();
  const facts = page.locator('.kv');
  await expect(facts.locator('.k')).toHaveText([
    'Mã nhân viên', 'Phòng ban', 'Chức danh', 'Ca làm', 'Ngày vào làm', 'Phép năm còn lại'
  ]);
  await expect(facts.locator('.v')).toHaveText([
    'GFT-0142', 'Kinh doanh', 'Nhân viên kinh doanh', 'HC 08:00–17:00', '04/03/2024', '11 ngày'
  ]);
  await expect(page.getByText('Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.')).toBeVisible();
});

test('Đổi mật khẩu opens a sheet that validates, closes, and returns focus', async ({ page }) => {
  await openPhone(page, '/nv/toi');
  const open = page.getByRole('button', { name: 'Đổi mật khẩu' });
  await open.click();
  await expect(page).toHaveURL(/hop=doi-mat-khau/);
  const sheet = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Tài khoản nhanvien')).toBeVisible();
  await expect(sheet.getByRole('button', { name: '×' })).toHaveCount(0);
  await sheet.getByLabel('Mật khẩu hiện tại').fill('cu');
  await sheet.getByLabel(/^Mật khẩu mới/).fill('123');
  await sheet.getByLabel('Nhập lại mật khẩu mới').fill('123');
  await sheet.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Mật khẩu mới cần ít nhất 6 ký tự.');
  await sheet.getByLabel(/^Mật khẩu mới/).fill('123456');
  await sheet.getByLabel('Nhập lại mật khẩu mới').fill('123456');
  await sheet.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);
  await expect(open).toBeFocused();
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

test('password deep link opens the sheet; Escape and Huỷ close it', async ({ page }) => {
  await openPhone(page, '/nv/toi?hop=doi-mat-khau');
  const sheet = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/hop=/);
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await page.getByRole('dialog', { name: 'Đổi mật khẩu' }).getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Đăng xuất signs out to /dang-nhap', async ({ page }) => {
  const calls = await openPhone(page, '/nv/toi');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
  expect(calls).toEqual([]);
});
```

- [ ] **Step 2: Bỏ test cũ trong `web/tests/staff-ux.spec.ts`**
  - Xoá mọi test `fixme` mở `/nv/...` và dữ liệu giả chỉ chúng dùng.
  - Giữ vòng `staff desktop keeps its task order…` (mở `/nv-may-tinh`), cùng `mockStaffApi` và dữ liệu nó cần.

- [ ] **Step 3: Chạy cho đỏ**
  - Lệnh: `cd web && PW_PORT=4194 npx playwright test staff-phone-shell`
  - Mong đợi: FAIL. Thanh tab chưa nổi; màn Tôi chưa có "Lê Hoàng Nam"; "Đăng xuất" và nút đổi mật khẩu khác.

- [ ] **Step 4: Viết `mock/staff-phone.ts` và `services/staff-phone.ts`**
  - Dữ liệu theo spec mục 1–2, đúng các kiểu ở Interfaces.
  - `homeView().week.cells`:
    - 7 ô 26/10–01/11, `day` có số 0 đầu ('01');
    - `attendanceView().cells`: `day` không số 0 đầu.
  - `label` của ô theo spec 4.3 và mục 5, nhóm viết thường:
    - đi làm, đi muộn, nghỉ có lương, vắng, cần xử lý, chưa tới, không có ca;
    - hôm nay là "Hôm nay, thứ Tư 28/10: đang làm".
  - `recent`:
    - 5 ngày có giờ vào gần nhất, mới trước;
    - `times` là "07:59 – …" (hôm nay chưa ra), "08:12 – ?" (ngày qua thiếu giờ ra), "07:56 – 17:10".
  - `requestsView().groups` theo thứ tự trong spec 2.2. `homeView().requests` là 2 dòng đầu.
  - `checkOutNow()` sửa bản ghi 28/10 trong module (`out = '09:40'`). Mọi hàm dựng sau đó đọc giá trị mới.

- [ ] **Step 5: Chuyển `getSelfKpi`, `saveSelfKpi` sang `services/staff-desktop.ts`**
  - Chép nguyên văn thân hàm từ `services/staff-phone.ts` cũ.
  - Thay dòng `export { getSelfKpi as getStaffSelfKpi, saveSelfKpi as saveStaffSelfKpi } from './staff-phone';` bằng export của hai hàm vừa chép, giữ tên `getStaffSelfKpi`, `saveStaffSelfKpi`.

- [ ] **Step 6: Viết `PhIcon`, `PhoneLayout`, `phone.css`, `BottomSheet`, `MonthSwitch`, `RequestRow`, màn tạm và `ProfileView`; xoá các file ở "Xoá ở Task 1"**
  - `PhIcon` theo spec 3.2; đường vẽ chép từ `ICON` của `gen-mobile.js`.
  - `PhoneLayout` theo spec 3.1. Thanh tab `position: fixed`, canh theo cột 430px: `left: 50%; transform: translateX(-50%); width: min(398px, calc(100% - 32px))`.
  - `phone.css` theo spec 3.3–3.4. Nút trên nền tối thêm lớp hoặc luật để focus viền trắng.
  - `BottomSheet` theo spec 3.5, giữ nguyên phần hành vi.
  - `ProfileView` theo spec 8.2. Đổi mật khẩu dùng `useHop()` với tên `doi-mat-khau`; mở thì `router.replace` thêm `hop`. Tên đăng nhập lấy từ `useSessionStore().user.username`.
  - `routes/staff-phone.ts`: chỉ sửa chú thích đầu file.

- [ ] **Step 7: Chạy cho xanh**
  - Lệnh: `cd web && PW_PORT=4194 npx playwright test staff-phone-shell auth-mock`
  - Mong đợi: tất cả PASS, kể cả "staff login on a phone can sign out from the Tôi tab".
  - Rồi chạy cả bộ `cd web && PW_PORT=4194 npx playwright test`. Mong đợi: 0 failed.

- [ ] **Step 8: Commit**
  - `git add` đúng các file trong "Files" của task (kể cả file xoá: `git add -u` trên từng đường dẫn đã xoá).
  - `git commit -m "feat(web): staff phone shell, mock data and the Tôi screen"`, kèm dòng Co-Authored-By.

---

> **Task 2, 3, 4, 5 chạy song song sau Task 1.** Mỗi task chỉ sửa file trong mục "Files" của nó, dùng cổng của mình.

### Task 2: J1 · Hôm nay

**Files:**

- Rewrite: `web/src/views/staff-phone/HomeView.vue`
- Test: `web/tests/staff-phone-home.spec.ts`

**Interfaces:**

- Consumes:
  - `getHome()`, `checkOut()` của `services/staff-phone.ts`;
  - `HomeView`, `CalendarCell`, `RequestRowData` của `mock/staff-phone.ts`;
  - `PhIcon`, `RequestRow`, lớp của `phone.css`;
  - `openPhone` của `tests/fixtures/staff-phone.ts`.

- [ ] **Step 1: Viết `web/tests/staff-phone-home.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('Hôm nay makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  await expect(page.getByText('Lê Hoàng Nam')).toBeVisible();
  expect(calls).toEqual([]);
});

test('greeting shows Nam and the mock date', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const hello = page.locator('header').first();
  await expect(hello).toContainText('Chào buổi sáng');
  await expect(hello).toContainText('Lê Hoàng Nam');
  await expect(hello).toContainText('Thứ Tư');
  await expect(hello).toContainText('28/10/2026');
  await expect(hello.getByText('HN', { exact: true })).toBeVisible();
});

test('today card shows the shift, worked time and the Check-out button', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(card).toContainText('Ca HC · 08:00–17:00');
  await expect(card).toContainText('Đang trong ca');
  await expect(card).toContainText('1g 41p');
  await expect(card).toContainText('đã làm · vào 07:59');
  await expect(card).toContainText('08:00');
  await expect(card).toContainText('17:00');
  await expect(card.getByRole('button', { name: 'Check-out lúc 09:40' })).toBeVisible();
  await expect(card).toContainText('Đúng vị trí văn phòng GFT');
  // 101/540 của nửa vòng bán kính 100 (π·100) ≈ 58.8
  await expect(card.locator('svg path').nth(1)).toHaveAttribute('stroke-dasharray', /^58\.8 /);
});

test('Check-out records 09:40 and switches the card to the done state', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const card = page.getByRole('region', { name: 'Ca hôm nay' });
  await card.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(card).toContainText('Đã check-out');
  await expect(card).toContainText('đã làm · vào 07:59 · ra 09:40');
  await expect(card).toContainText('1g 41p');
  await expect(card).not.toContainText('Đang trong ca');
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(card).not.toContainText('Đúng vị trí văn phòng GFT');
});

test('this week links days with data and marks the rest as images', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const week = page.getByRole('region', { name: 'Tuần này' });
  await expect(week).toContainText('26/10 – 01/11');
  for (const [name, date] of [
    ['Thứ Hai 26/10: đi làm', '2026-10-26'],
    ['Thứ Ba 27/10: cần xử lý', '2026-10-27'],
    ['Hôm nay, thứ Tư 28/10: đang làm', '2026-10-28']
  ]) {
    await expect(week.getByRole('link', { name, exact: true })).toHaveAttribute('href', `/nv/cham-cong?ngay=${date}`);
  }
  for (const name of [
    'Thứ Năm 29/10: chưa tới',
    'Thứ Sáu 30/10: chưa tới',
    'Thứ Bảy 31/10: chưa tới',
    'Chủ nhật 01/11: không có ca'
  ]) {
    await expect(week.getByRole('img', { name })).toBeVisible();
  }
  await expect(week.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý', exact: true })).toHaveClass(/todo/);
  await expect(week.getByRole('link', { name: 'Hôm nay, thứ Tư 28/10: đang làm' })).toHaveClass(/today/);
  await expect(week.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' })).toHaveAttribute(
    'href',
    '/nv/cham-cong?ngay=2026-10-27'
  );
});

test('income card and the two latest requests link to their screens', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  const income = page.getByRole('link', { name: /Thu nhập tháng 10 · tạm tính/ });
  await expect(income).toContainText('14.278.183');
  await expect(income).toHaveAttribute('href', '/nv/thu-nhap');
  await expect(page.getByRole('heading', { name: 'Yêu cầu của tôi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/nv/yeu-cau');
  await expect(page.getByRole('link', { name: 'Thiếu giờ ra 27/10, Chờ duyệt' })).toHaveAttribute(
    'href',
    '/nv/yeu-cau?yc=giai-trinh-2710'
  );
  await expect(page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' })).toHaveAttribute(
    'href',
    '/nv/yeu-cau?yc=phep-1210'
  );
});
```

- [ ] **Step 2: Chạy cho đỏ**
  - Lệnh: `cd web && PW_PORT=4294 npx playwright test staff-phone-home`
  - Mong đợi: FAIL, vì màn tạm chỉ có h1.

- [ ] **Step 3: Viết `HomeView.vue` theo spec mục 4**
  - Thẻ ca là `section aria-label="Ca hôm nay"`; thẻ tuần là `section aria-label="Tuần này"`.
  - Vòng cung: đường thứ nhất là nền, đường thứ hai là phần đã làm với `stroke-dasharray="<(workedMin/shiftMin·π·100).toFixed(1)> 400"`, núm tròn tính như `arc` của `gen-mobile.js`.
  - Ô ngày `open` là `RouterLink` tới `/nv/cham-cong?ngay=<date>` với lớp `dn <kind>` (+ `today`); ô còn lại là `span role="img"`.
  - Bấm Check-out: gọi `checkOut()`, thay dữ liệu màn bằng kết quả trả về.

- [ ] **Step 4: Chạy cho xanh**
  - Lệnh: `cd web && PW_PORT=4294 npx playwright test staff-phone-home staff-phone-shell`
  - Mong đợi: PASS.

- [ ] **Step 5: Commit**
  - `git add web/src/views/staff-phone/HomeView.vue web/tests/staff-phone-home.spec.ts`
  - `git commit -m "feat(web): staff phone Hôm nay screen (J1)"`, kèm dòng Co-Authored-By.

---

### Task 3: J2 · Chấm công và J3 · Hộp trượt một ngày

**Files:**

- Rewrite: `web/src/views/staff-phone/AttendanceView.vue`
- Create: `web/src/views/staff-phone/components/DaySheet.vue`
- Test: `web/tests/staff-phone-attendance.spec.ts`

**Interfaces:**

- Consumes:
  - `getAttendance()`, `getDay(date)`;
  - `AttendanceView`, `DayDetail`, `CalendarCell`;
  - `BottomSheet`, `MonthSwitch`, `PhIcon`, lớp của `phone.css`;
  - `openPhone`.
- Produces: `DaySheet` props `{ day: DayDetail }`, emit `close`.

- [ ] **Step 1: Viết `web/tests/staff-phone-attendance.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const cal = page => page.getByRole('region', { name: 'Lịch tháng 10' });
const recent = page => page.locator('section', { has: page.getByRole('heading', { name: 'Gần đây' }) });
const day = page => page.getByRole('dialog');
const kv = (sheet, key) => sheet.locator('.kv', { has: sheet.page().getByText(key, { exact: true }) }).locator('.v');

test('Chấm công makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(day(page)).toBeVisible();
  expect(calls).toEqual([]);
});

test('header, month switch and the three tiles follow J2', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chấm công');
  await expect(page.getByText('Ca HC 08:00–17:00 · thứ Hai – thứ Bảy')).toBeVisible();
  await expect(page.getByText('Tháng 10/2026')).toBeVisible();
  await expect(page.getByText('Kỳ công đang mở')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  const tiles = page.getByRole('group', { name: 'Chỉ số tháng 10' });
  await expect(tiles).toContainText('21 / 26');
  await expect(tiles).toContainText('Ngày công');
  await expect(tiles).toContainText('Lần đi muộn');
  await expect(tiles).toContainText('Ngày nghỉ có lương');
});

test('calendar paints October by group and only days with data are buttons', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(cal(page).getByRole('button')).toHaveCount(24);
  await expect(cal(page).getByRole('img')).toHaveCount(7);
  await expect(cal(page).getByRole('button', { name: 'Thứ Năm 01/10: đi làm' })).toHaveClass(/work/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Hai 12/10: nghỉ có lương' })).toHaveClass(/leave/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Bảy 17/10: nghỉ có lương' })).toHaveClass(/leave/);
  await expect(cal(page).getByRole('button', { name: 'Thứ Ba 27/10: cần xử lý' })).toHaveClass(/todo/);
  await expect(cal(page).getByRole('button', { name: 'Hôm nay, thứ Tư 28/10: đang làm' })).toHaveClass(/today/);
  await expect(cal(page).getByRole('img', { name: 'Chủ nhật 04/10: không có ca' })).toBeVisible();
  await expect(cal(page).getByRole('img', { name: 'Thứ Năm 29/10: chưa tới' })).toBeVisible();
  for (const t of ['Đi làm', 'Đi muộn', 'Nghỉ có lương', 'Cần xử lý']) await expect(cal(page)).toContainText(t);
});

test('Gần đây lists the five latest days with times', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await expect(page.getByRole('heading', { name: 'Gần đây' })).toBeVisible();
  await expect(recent(page).getByRole('button')).toHaveText([
    /Thứ Tư 28\/10\s*07:59 – …/,
    /Thứ Ba 27\/10\s*08:12 – \?/,
    /Thứ Hai 26\/10\s*07:56 – 17:10/,
    /Thứ Bảy 24\/10\s*07:52 – 17:04/,
    /Thứ Sáu 23\/10\s*07:58 – 17:02/
  ]);
});

test('27/10 sheet shows the late check-in and the pending explanation, then closes back', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  const cell = cal(page).getByRole('button', { name: 'Thứ Ba 27/10: cần xử lý' });
  await cell.click();
  await expect(page).toHaveURL(/\?ngay=2026-10-27$/);
  const sheet = page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' });
  await expect(sheet).toContainText('Ca HC 08:00–17:00');
  await expect(sheet).toContainText('Cần xử lý');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('08:12');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('Chưa có');
  await expect(kv(sheet, 'Đi muộn')).toHaveText('12 phút');
  await expect(sheet).toContainText('Đã gửi giải trình lúc 20:14');
  await expect(sheet).toContainText('Giờ ra khai 17:30 · chờ Admin duyệt');
  await expect(sheet).toContainText('12:30');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  await expect(cell).toBeFocused();
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
});

test('other day kinds use the same sheet', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong?ngay=2026-10-26');
  let sheet = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
  await expect(sheet).toContainText('Đi làm');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('07:56');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('17:10');
  await expect(sheet.getByText('Đi muộn', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/ngay=/);

  await page.goto('/nv/cham-cong?ngay=2026-10-12');
  sheet = page.getByRole('dialog', { name: 'Thứ Hai 12/10/2026' });
  await expect(sheet).toContainText('Nghỉ có lương');
  await expect(kv(sheet, 'Hình thức')).toHaveText('Phép năm');
  await expect(kv(sheet, 'Thời gian')).toHaveText('Cả ngày');
  await expect(sheet.getByText('Giờ vào', { exact: true })).toHaveCount(0);

  await page.goto('/nv/cham-cong?ngay=2026-10-28');
  sheet = page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' });
  await expect(sheet).toContainText('Đang làm');
  await expect(kv(sheet, 'Giờ vào')).toHaveText('07:59');
  await expect(kv(sheet, 'Giờ ra')).toHaveText('Chưa có');
  await page.locator('.ph-sheet-scrim').click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a Gần đây row opens its day', async ({ page }) => {
  await openPhone(page, '/nv/cham-cong');
  await recent(page).getByRole('button', { name: /Thứ Bảy 24\/10/ }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Bảy 24/10/2026' })).toBeVisible();
  await expect(page).toHaveURL(/ngay=2026-10-24/);
});

for (const bad of ['2026-10-29', '2026-10-04', 'abc']) {
  test(`?ngay=${bad} opens nothing and is dropped from the URL`, async ({ page }) => {
    await openPhone(page, `/nv/cham-cong?ngay=${bad}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chấm công');
    await expect(page).not.toHaveURL(/ngay=/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
```

- [ ] **Step 2: Chạy cho đỏ**
  - Lệnh: `cd web && PW_PORT=4295 npx playwright test staff-phone-attendance`
  - Mong đợi: FAIL.

- [ ] **Step 3: Viết `AttendanceView.vue` theo spec mục 5 và `DaySheet.vue` theo spec mục 6**
  - Lịch là `section aria-label="Lịch tháng 10"`; ba ô số là `div role="group" aria-label="Chỉ số tháng 10"`.
  - Mở hộp: `router.replace({ query: { ...route.query, ngay } })`. Màn theo dõi `route.query.ngay` và gọi `getDay`.
    - `null` thì `router.replace` bỏ `ngay`.
    - Đóng thì `router.replace` bỏ `ngay`.
  - Thanh giờ trong `DaySheet`: đổi 'HH:MM' ra phút, phần trăm theo trục 08:00–17:00 (540 phút). Ba đoạn theo spec mục 6.

- [ ] **Step 4: Chạy cho xanh**
  - Lệnh: `cd web && PW_PORT=4295 npx playwright test staff-phone-attendance`
  - Mong đợi: PASS.

- [ ] **Step 5: Commit**
  - `git add web/src/views/staff-phone/AttendanceView.vue web/src/views/staff-phone/components/DaySheet.vue web/tests/staff-phone-attendance.spec.ts`
  - `git commit -m "feat(web): staff phone Chấm công and the day sheet (J2, J3)"`, kèm dòng Co-Authored-By.

---

### Task 4: J4 · Yêu cầu của tôi và J5 · Hộp trượt một yêu cầu

**Files:**

- Rewrite: `web/src/views/staff-phone/RequestsView.vue`
- Create: `web/src/views/staff-phone/components/RequestSheet.vue`
- Test: `web/tests/staff-phone-requests.spec.ts`

**Interfaces:**

- Consumes:
  - `getRequests()`, `getRequest(id)`;
  - `RequestsView`, `RequestDetail`;
  - `BottomSheet`, `RequestRow` (prop `replace`), `PhIcon`;
  - `toast` của `@/components/shell/toast`;
  - `openPhone`.
- Produces: `RequestSheet` props `{ request: RequestDetail }`, emit `close`.

- [ ] **Step 1: Viết `web/tests/staff-phone-requests.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const tabs = page => page.getByRole('tablist', { name: 'Lọc theo trạng thái' });
const rows = page => page.getByRole('tabpanel').getByRole('link');
const kv = (sheet, key) => sheet.locator('.kv', { has: sheet.page().getByText(key, { exact: true }) }).locator('.v');

test('Yêu cầu makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/yeu-cau?yc=phep-1210');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(calls).toEqual([]);
});

test('list groups four requests by month under the Tất cả tab', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yêu cầu');
  await expect(tabs(page).getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 1', 'Đã duyệt 2', 'Từ chối 1']);
  await expect(tabs(page).getByRole('tab', { name: 'Tất cả 4' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Tháng 10');
  await expect(page.getByRole('tabpanel')).toContainText('Tháng 9');
  await expect(rows(page)).toHaveCount(4);
  for (const [i, name] of [
    'Thiếu giờ ra 27/10, Chờ duyệt',
    'Phép năm 12/10, Đã duyệt',
    'Tạm ứng 1.500.000 ₫, Đã duyệt',
    'Khai giờ vào 09/09, Từ chối'
  ].entries()) {
    await expect(rows(page).nth(i)).toHaveAccessibleName(name);
  }
});

test('tabs filter by status and hide empty month groups', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await tabs(page).getByRole('tab', { name: 'Chờ duyệt 1' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAccessibleName('Thiếu giờ ra 27/10, Chờ duyệt');
  await expect(page.getByRole('tabpanel')).not.toContainText('Tháng 9');
  await tabs(page).getByRole('tab', { name: 'Từ chối 1' }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole('tabpanel')).not.toContainText('Tháng 10');
  await tabs(page).getByRole('tab', { name: 'Đã duyệt 2' }).click();
  await expect(rows(page)).toHaveCount(2);
});

test('arrow, Home and End keys move between tabs', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  const all = tabs(page).getByRole('tab', { name: 'Tất cả 4' });
  await all.focus();
  await page.keyboard.press('ArrowRight');
  const pend = tabs(page).getByRole('tab', { name: 'Chờ duyệt 1' });
  await expect(pend).toBeFocused();
  await expect(pend).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(all).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(tabs(page).locator('[tabindex="0"]')).toHaveCount(1);
});

test('Tạo yêu cầu shows a notice and opens nothing', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await page.getByRole('button', { name: 'Tạo yêu cầu' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Chưa có luồng tạo yêu cầu trong bản mockup.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
});

test('the Phép năm 12/10 sheet follows J5 and closes back to its row', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  const row = page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' });
  await row.click();
  await expect(page).toHaveURL(/\?yc=phep-1210$/);
  const sheet = page.getByRole('dialog', { name: 'Phép năm 12/10' });
  await expect(sheet).toContainText('Đơn nghỉ');
  await expect(sheet).toContainText('Đã duyệt');
  await expect(kv(sheet, 'Ngày nghỉ')).toHaveText('Thứ Hai 12/10/2026');
  await expect(kv(sheet, 'Thời gian')).toHaveText('Cả ngày');
  await expect(kv(sheet, 'Hình thức')).toHaveText('Phép năm');
  await expect(kv(sheet, 'Lý do')).toHaveText('“Việc gia đình.”');
  await expect(kv(sheet, 'Phép năm còn lại')).toHaveText('11 ngày');
  const steps = sheet.getByLabel('Các bước');
  await expect(steps).toContainText('Đã gửi');
  await expect(steps).toContainText('08/10 09:12');
  await expect(steps).toContainText('Trưởng phòng Kinh doanh đã duyệt');
  await expect(steps).toContainText('09/10 10:30');
  await sheet.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/yeu-cau$/);
  await expect(row).toBeFocused();
});

test('pending and rejected requests show their steps', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=giai-trinh-2710');
  let sheet = page.getByRole('dialog', { name: 'Thiếu giờ ra 27/10' });
  await expect(sheet).toContainText('Giải trình');
  await expect(kv(sheet, 'Giờ ra khai')).toHaveText('17:30');
  await expect(sheet.getByLabel('Các bước')).toContainText('Chờ Admin duyệt');
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/yc=/);

  await page.goto('/nv/yeu-cau?yc=gio-vao-0909');
  sheet = page.getByRole('dialog', { name: 'Khai giờ vào 09/09' });
  await expect(sheet).toContainText('Từ chối');
  await expect(sheet.getByLabel('Các bước')).toContainText('Admin đã từ chối');
  await expect(sheet.getByLabel('Các bước')).toContainText('10/09 10:15');
});

test('a filtered tab survives opening and closing a request', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau');
  await tabs(page).getByRole('tab', { name: 'Từ chối 1' }).click();
  const row = page.getByRole('link', { name: 'Khai giờ vào 09/09, Từ chối' });
  await row.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await expect(tabs(page).getByRole('tab', { name: 'Từ chối 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(row).toBeFocused();
});

test('?yc=khong-co opens nothing and is dropped from the URL', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=khong-co');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yêu cầu');
  await expect(page).not.toHaveURL(/yc=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy cho đỏ**
  - Lệnh: `cd web && PW_PORT=4296 npx playwright test staff-phone-requests`
  - Mong đợi: FAIL.

- [ ] **Step 3: Viết `RequestsView.vue` theo spec 7.1 và `RequestSheet.vue` theo spec 7.2**
  - Dòng dùng `RequestRow` với `replace`. Màn theo dõi `route.query.yc` như Task 3 theo dõi `ngay`.
  - Tab đang chọn giữ trong `ref` của màn, nên đổi `yc` không làm mất tab.
  - "Tạo yêu cầu" gọi `toast.warnings(['Chưa có luồng tạo yêu cầu trong bản mockup.'])`.

- [ ] **Step 4: Chạy cho xanh**
  - Lệnh: `cd web && PW_PORT=4296 npx playwright test staff-phone-requests`
  - Mong đợi: PASS.

- [ ] **Step 5: Commit**
  - `git add web/src/views/staff-phone/RequestsView.vue web/src/views/staff-phone/components/RequestSheet.vue web/tests/staff-phone-requests.spec.ts`
  - `git commit -m "feat(web): staff phone requests list and request sheet (J4, J5)"`, kèm dòng Co-Authored-By.

---

### Task 5: J6 · Thu nhập và mục lục thiết kế

**Files:**

- Rewrite: `web/src/views/staff-phone/IncomeView.vue`, `web/src/design-index/staff-phone.ts`
- Test: `web/tests/staff-phone-income.spec.ts`

**Interfaces:**

- Consumes: `getIncome()`, `IncomeView`, `MonthSwitch`, `PhIcon`, `openPhone`.

- [ ] **Step 1: Viết `web/tests/staff-phone-income.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

test('Thu nhập makes no /api call', async ({ page }) => {
  const calls = await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thu nhập');
  expect(calls).toEqual([]);
});

test('net pay card follows J6', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByText('Phiếu chính thức có khi Admin duyệt')).toBeVisible();
  await expect(page.getByText('Tạm tính', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  const net = page.getByRole('region', { name: 'Thực nhận tháng 10' });
  for (const t of ['Thực nhận dự kiến', '14.278.183', 'Admin đang duyệt phiếu', 'Tổng thu nhập', '15.538.183', 'Khấu trừ', '1.260.000'])
    await expect(net).toContainText(t);
});

test('KPI card shows the total, KPI pay and the five scores', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  const kpi = page.getByRole('region', { name: 'KPI tháng 10' });
  for (const t of ['5 phần', '66,14%', 'Tổng điểm', 'Lương KPI', '1.322.800', 'Mức đề xuất', '2.000.000'])
    await expect(kpi).toContainText(t);
  const scores = kpi.locator('.sc > div');
  await expect(scores).toHaveText([/62\s*Wework/, /70\s*Người dùng/, /68\s*Đồng nghiệp/, /65\s*Quản lý/, /75\s*Tự đánh giá/]);
  await expect(kpi.locator('svg circle')).toHaveCount(51);
  await expect(kpi.locator('svg circle.on')).toHaveCount(33);
});

test('line items add up to the net pay and there is no full-payslip link', async ({ page }) => {
  await openPhone(page, '/nv/thu-nhap');
  await expect(page.getByRole('heading', { name: 'Các khoản' })).toBeVisible();
  const lines = page.locator('.ls .ro');
  await expect(lines.locator('.t')).toHaveText([
    'Lương ngày công', 'Nghỉ phép, iSAT', 'Phụ cấp', 'Lương KPI', 'Bảo hiểm bắt buộc', 'Thuế TNCN'
  ]);
  await expect(lines.locator('.v')).toHaveText(['11.076.923', '923.076', '2.215.384', '1.322.800', '−1.260.000', '0']);
  await expect(page.locator('.tot')).toHaveText(/Thực nhận\s*14\.278\.183 ₫/);
  await expect(page.getByRole('link', { name: 'Xem phiếu lương đầy đủ' })).toHaveCount(0);
});

test('design index lists the eight phone boards', async ({ page }) => {
  await openPhone(page, '/thiet-ke');
  const group = page.locator('section', { has: page.getByRole('heading', { name: /Nhân viên · điện thoại/ }) });
  const links = group.getByRole('link');
  await expect(links).toHaveText([
    'Hôm nay · đang trong ca',
    'Chấm công · tháng 10',
    'Hộp trượt · một ngày chấm công (27/10)',
    'Yêu cầu của tôi',
    'Hộp trượt · một yêu cầu (Phép năm 12/10)',
    'Thu nhập · tháng 10 tạm tính',
    'Tôi',
    'Hộp trượt · đổi mật khẩu'
  ]);
  const hrefs = await links.evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(hrefs).toEqual([
    '/nv/hom-nay',
    '/nv/cham-cong',
    '/nv/cham-cong?ngay=2026-10-27',
    '/nv/yeu-cau',
    '/nv/yeu-cau?yc=phep-1210',
    '/nv/thu-nhap',
    '/nv/toi',
    '/nv/toi?hop=doi-mat-khau'
  ]);
});
```

- [ ] **Step 2: Chạy cho đỏ**
  - Lệnh: `cd web && PW_PORT=4297 npx playwright test staff-phone-income`
  - Mong đợi: FAIL.

- [ ] **Step 3: Viết `IncomeView.vue` theo spec 8.1 và `design-index/staff-phone.ts` theo spec 9.3**
  - Hai thẻ là `section aria-label="Thực nhận tháng 10"` và `section aria-label="KPI tháng 10"`.
  - Chấm KPI tính như `kpiDots` của `gen-mobile.js`. Chấm tô thêm lớp `on`.
  - Lưới điểm có lớp `sc`. Danh sách các khoản dùng `.ls .ro .t .v`. Dòng tổng có lớp `tot`.

- [ ] **Step 4: Chạy cho xanh**
  - Lệnh: `cd web && PW_PORT=4297 npx playwright test staff-phone-income`
  - Mong đợi: PASS.

- [ ] **Step 5: Commit**
  - `git add web/src/views/staff-phone/IncomeView.vue web/src/design-index/staff-phone.ts web/tests/staff-phone-income.spec.ts`
  - `git commit -m "feat(web): staff phone Thu nhập screen (J6) and design index rows"`, kèm dòng Co-Authored-By.

---

### Task 6: Luồng qua nhiều màn

Chạy sau khi Task 2–5 đã commit.

**Files:**

- Test: `web/tests/staff-phone-flow.spec.ts`
- Sửa mã chỉ khi test lộ lỗi. Lỗi nằm ở file của task nào thì sửa file đó; ghi lý do vào commit.

**Interfaces:**

- Consumes: mọi màn của Task 1–5, `openPhone`.

- [ ] **Step 1: Viết `web/tests/staff-phone-flow.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { openPhone } from './fixtures/staff-phone';

const nav = page => page.getByRole('navigation', { name: 'Điều hướng' });

test('Check-out on Hôm nay carries to Chấm công through the tab bar', async ({ page }) => {
  const calls = await openPhone(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(page.getByText('Đã check-out')).toBeVisible();
  await nav(page).getByRole('link', { name: 'Chấm công' }).click();
  const recent = page.locator('section', { has: page.getByRole('heading', { name: 'Gần đây' }) });
  const latest = recent.getByRole('button', { name: /Thứ Tư 28\/10/ });
  await expect(latest).toContainText('07:59 – 09:40');
  await latest.click();
  const sheet = page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' });
  await expect(sheet.locator('.kv', { hasText: 'Giờ ra' }).locator('.v')).toHaveText('09:40');
  expect(calls).toEqual([]);
});

test('Hôm nay links open the day and the request sheets', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay');
  await page.getByRole('link', { name: '27/10 thiếu giờ ra · chờ duyệt giải trình' }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await nav(page).getByRole('link', { name: 'Hôm nay' }).click();
  await page.getByRole('link', { name: 'Phép năm 12/10, Đã duyệt' }).click();
  await expect(page.getByRole('dialog', { name: 'Phép năm 12/10' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Yêu cầu' })).toHaveAttribute('aria-current', 'page');
});

test('no screen scrolls sideways at 320px and the tab bar never covers the last row', async ({ page }) => {
  await openPhone(page, '/nv/hom-nay', { width: 320, height: 640 });
  for (const path of ['/nv/hom-nay', '/nv/cham-cong', '/nv/yeu-cau', '/nv/thu-nhap', '/nv/toi']) {
    await page.goto(path);
    await expect(page.locator('.ph > *').first()).toBeVisible();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw, path).toBe(cw);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const nav = await page.getByRole('navigation', { name: 'Điều hướng' }).boundingBox();
    const last = await page.locator('.ph > *:not(nav)').last().boundingBox();
    expect(last!.y + last!.height, path).toBeLessThanOrEqual(nav!.y);
  }
});
```

- [ ] **Step 2: Chạy**
  - Lệnh: `cd web && PW_PORT=4194 npx playwright test staff-phone-flow`
  - PASS ngay là chấp nhận được: task này kiểm sự ráp nối. FAIL thì dùng `superpowers:systematic-debugging`, sửa đúng chỗ, chạy lại.

- [ ] **Step 3: Chạy cả bộ**
  - Lệnh: `cd web && PW_PORT=4194 npx playwright test`
  - Mong đợi: 0 failed.

- [ ] **Step 4: Commit**
  - `git add web/tests/staff-phone-flow.spec.ts` và file đã sửa (nếu có).
  - `git commit -m "test(web): staff phone flows across screens"`, kèm dòng Co-Authored-By.

---

## Xác minh cuối (giai đoạn 6, sau review toàn nhánh)

1. `cd web && PW_PORT=4194 npx playwright test`: 0 failed. Ghi số passed / skipped và so với mốc (40 / 47 / 0).
2. `npm test` ở gốc (cần PostgreSQL và `npm ci` ở gốc). Nhánh không đụng `src/`, nên kết quả phải như ledger. Không chạy được thì ghi rõ lý do.
3. `git diff --stat 014c93f..HEAD -- src migrations test spec` rỗng.
4. `grep -rn "api(\|fetch(" web/src/views/staff-phone web/src/mock/staff-phone.ts web/src/services/staff-phone.ts` rỗng.
