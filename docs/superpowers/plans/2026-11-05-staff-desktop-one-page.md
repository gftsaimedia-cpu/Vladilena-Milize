# Nhân viên trên máy tính (một trang ba cột, mốc 1136px) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Từ 1136px, mọi đường dẫn `/nv/*` hiện một trang máy tính ba cột (K1) có ngăn kéo phải (K2, K3b, đổi mật khẩu); dưới 1136px giữ app điện thoại J1–J7; đổi sống khi kéo cửa sổ; xoá `/nv-may-tinh` cũ.

**Architecture:**
- Một layout `staff` chọn giao diện bằng `matchMedia('(min-width: 1136px)')`:
  - dưới mốc: `PhoneLayout` + `RouterView` (màn điện thoại theo route);
  - từ mốc: một component trang `StaffDesktopPage`, tự đọc `route.path` và `route.query` để mở menu và ngăn kéo.
- Thẻ và thân hộp được tách từ màn điện thoại thành component trong `views/staff-phone/components/`, nên hai giao diện dùng chung một nguồn chữ và số.

**Tech Stack:** Vue 3 (`<script setup lang="ts">`), vue-router 4, Pinia, Vite, Playwright. Dữ liệu giả qua `mock/staff-phone.ts` + `respond()`.

**Spec:** `docs/superpowers/specs/2026-11-05-staff-desktop-one-page-design.md` (gọi tắt **spec**). Spec app điện thoại `docs/superpowers/specs/2026-11-04-staff-phone-app-design.md` gọi tắt **spec ĐT**.

## Global Constraints

- Mốc: `STAFF_DESKTOP_MIN = 1136`. Máy tính khi `(min-width: 1136px)`; 1135px trở xuống là điện thoại.
- Chữ, số, tên truy cập chép nguyên văn từ spec và spec ĐT. Không tự đặt câu chữ mới.
- Không gọi `api(` hay `fetch(` ở bất cứ file mới hay sửa nào. Mọi file test mới mở đầu bằng một test kiểm mảng `/api`, `pageerror`, `console.error` rỗng.
- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở gốc repo; không đọc `spec/` gốc. Không sửa file Admin (`views/admin/**`, `components/shell/**`, `layouts/` khác `StaffLayout`/`PhoneLayout`).
- Design system GFT:
  - không đổ bóng;
  - ô nhập bo 8px; nhãn kết quả là chữ + chấm, không dạng viên thuốc;
  - màu qua biến của `styles/base.css` (`--ground`, `--surface-dark`, `--gold`, `--gold-light`, `--gold-pale`, `--border`, `--text`, `--muted`, `--status-*`);
  - tiêu đề cột League Spartan 600 28px/32px.
- `tests/staff-phone-*.spec.ts` phải xanh nguyên văn. Chỉ được **thêm** test (Task 1), không sửa test cũ trong các file đó.
- Xác minh chỉ bằng Playwright: trong `web/`, `PW_PORT=4196 npm run test:ui -- <lọc>`. Không typecheck, không prettier, không `npm test` ở gốc.
- Git:
  - không stage `.claude/launch.json`; không dùng `git stash` trơn;
  - mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Kéo qua mốc khi ngăn kéo hay hộp trượt đang mở:
   - chỉ còn đúng một dialog;
   - đóng nó thì `document.documentElement.style.overflow` về `''`, không kẹt khoá cuộn.
   - Test: Task 3, `resizing with a drawer open hands over to the phone sheet`.
2. Menu đang mở (`/nv/toi`) rồi bấm một ô ngày: chỉ ngăn kéo ngày mở, menu không chồng lên. Test: Task 4, `a day click closes the menu and opens only the drawer`.
3. Check-out ở cột 1 thì "Gần đây" ở cột 2 phải đổi theo (R7 của spec ĐT: các màn đọc cùng dữ liệu). Hai cột cùng mount nên cột 2 phải tải lại. Test: Task 5, `Check-out in column 1 updates Gần đây`.
4. Ngăn kéo mở thẳng từ URL (không có phần tử mở) rồi đóng: focus về nút tài khoản, không rơi xuống `body`. Test: Task 3, `closing a drawer opened from the URL focuses the account button`.
5. Cửa sổ thấp 1136×700:
   - ô danh sách yêu cầu giữ ≥ 288px;
   - trang cuộn dọc, không cuộn ngang;
   - ngăn kéo cuộn thân bên trong.
   - Test: Task 6, `a short window keeps the request box and scrolls the drawer`.

## File Structure

| File | Việc | Task |
|------|------|------|
| `web/src/mock/staff-phone.ts` | `RequestStep.note`; `attendanceView(recent = 5)` | 1 |
| `web/src/services/staff-phone.ts` | `getAttendance(recent = 5)` | 1 |
| `web/src/views/staff-phone/components/DayBody.vue` (mới) | thân J3/K2 | 1 |
| `web/src/views/staff-phone/components/RequestBody.vue` (mới) | thân J5/K3b + hộp ghi chú | 1 |
| `web/src/views/staff-phone/components/PasswordForm.vue` (mới) | form đổi mật khẩu | 1 |
| `DaySheet.vue`, `RequestSheet.vue`, `ChangePasswordSheet.vue`, `BottomSheet.vue` | vỏ hộp trượt gọi thân; chuyển CSS form | 1 |
| `web/src/styles/phone.css` | scope thêm `.sd-app`, `.sd-drawer`; nhận CSS form | 1 |
| `web/src/composables/useStaffDesktop.ts` (mới) | media query 1136px | 2 |
| `web/src/layouts/StaffLayout.vue` (mới) | chọn giao diện | 2 |
| `web/src/App.vue`, `web/src/router/index.ts`, `web/src/router/routes/staff-phone.ts`, `web/src/router/routes/staff-desktop.ts`, `web/src/stores/session.ts` | layout `staff`, chuyển hướng | 2 |
| `web/src/views/staff-desktop/StaffDesktopPage.vue` (mới) | trang, ba cột, ngăn kéo | 2–6 |
| `web/src/views/staff-desktop/parts/DesktopBar.vue` (mới) | thanh trên + menu | 2 |
| `web/src/styles/staff-desktop.css` (mới) | lưới, tiêu đề, ngăn kéo | 2–6 |
| `web/src/views/staff-desktop/parts/SideDrawer.vue` (mới) | vỏ ngăn kéo phải | 3 |
| `web/src/views/staff-desktop/useDesktopDetail.ts` (mới) | đọc URL → ngày / yêu cầu / mật khẩu | 3 |
| `ShiftCard.vue`, `WeekCard.vue`, `RequestList.vue` (mới, `views/staff-phone/components/`) | tách từ J1, J4 | 4 |
| `web/src/views/staff-desktop/parts/TodayColumn.vue` (mới) | cột 1 | 4 |
| `MonthTiles.vue`, `MonthCalendar.vue`, `RecentDays.vue` (mới, `views/staff-phone/components/`) | tách từ J2 | 5 |
| `web/src/views/staff-desktop/parts/AttendanceColumn.vue` (mới) | cột 2 | 5 |
| `NetCard.vue`, `KpiCard.vue`, `IncomeLines.vue` (mới, `views/staff-phone/components/`) | tách từ J6 | 6 |
| `web/src/views/staff-desktop/parts/IncomeColumn.vue` (mới) | cột 3 | 6 |
| `web/src/design-index/staff-desktop.ts` | mục lục K1/K2/K3b | 7 |
| Xoá: mã máy tính cũ, `tests/staff-ux.spec.ts` | spec 8.3 | 7 |
| `web/tests/fixtures/staff-desktop.ts` (mới) | `openDesktop()` | 2 |
| `web/tests/staff-desktop-shell.spec.ts`, `…-drawers.spec.ts`, `…-today.spec.ts`, `…-attendance.spec.ts`, `…-income.spec.ts` (mới) | test | 2–7 |
| `web/tests/auth-mock.spec.ts` | đường dẫn mới | 2 |

## Phán quyết của plan

- Ruling: P1 — tách thêm chín thẻ (`ShiftCard`, `WeekCard`, `RequestList`, `MonthTiles`, `MonthCalendar`, `RecentDays`, `NetCard`, `KpiCard`, `IncomeLines`), ngoài ba thân spec 8.1 nêu. Lý do: spec D5 muốn một nguồn chữ; spec 8.1 đã ghi thêm dòng này. Rủi ro nếu sai: màn điện thoại bị sửa cấu trúc; `tests/staff-phone-*.spec.ts` nguyên văn là lưới an toàn.
- Ruling: P2 — `SideDrawer` dùng `lockScroll`, `unlockScroll`, `registerOverlayFocus` của `components/ui/overlay-lock.ts` (Esc, bẫy Tab, trả focus về phần tử mở), không chép bộ phím của `BottomSheet`. Lý do: Admin dùng sẵn, đã có test. Rủi ro nếu sai: thấp; chỉ cần thêm bước trả focus về nút tài khoản khi phần tử mở là `body`.
- Ruling: P3 — sau Check-out, trang tăng một số đếm `stamp` để cột 2 tải lại "Gần đây". Lý do: R7 của spec ĐT; trên máy tính hai cột cùng mount. Rủi ro nếu sai: một prop thừa.
- Ruling: P4 — CSS form (`form`, `.fld`, `.inp`, `.bt`) chuyển từ `BottomSheet.vue` sang `styles/phone.css` dưới `:is(.ph-sheet, .sd-drawer)`. Lý do: form đổi mật khẩu hiện trong cả hai vỏ. Rủi ro nếu sai: thấp; test đổi mật khẩu cả hai bên kiểm.

---

### Task 1: Dữ liệu chung và ba thân hộp (phía điện thoại)

**Files:**
- Modify: `web/src/mock/staff-phone.ts`: kiểu `RequestStep` (dòng ~30), các `steps` trong bảng yêu cầu (dòng ~184–217), `attendanceView` (dòng ~258).
- Modify: `web/src/services/staff-phone.ts`
- Create: `web/src/views/staff-phone/components/DayBody.vue`, `RequestBody.vue`, `PasswordForm.vue`
- Modify: `web/src/views/staff-phone/components/DaySheet.vue`, `RequestSheet.vue`, `ChangePasswordSheet.vue`, `BottomSheet.vue`
- Modify: `web/src/styles/phone.css`
- Test: `web/tests/staff-phone-requests.spec.ts` (chỉ thêm)

**Interfaces:**
- Produces:
  - `RequestStep = { label: string; at: string | null; state: RequestStatus; note: { label: string; text: string } | null }`
  - `attendanceView(recent = 5): AttendanceView`; `getAttendance(recent = 5): Promise<AttendanceView>`
  - `DayBody.vue`: props `{ day: DayDetail }`. Gồm thanh giờ, các `.kv`, hộp giải trình; không có nút Đóng.
  - `RequestBody.vue`: props `{ request: RequestDetail }`. Gồm các `.kv`, `<ol aria-label="Các bước">`; bước có `note` có thêm `<div class="rq-note"><span class="mut sm">{label}</span><span>{text}</span></div>` ngay sau thời điểm.
  - `PasswordForm.vue`: không prop; emits `done: []`, `cancel: []`. Ba ô, kiểm tra và hai nút "Huỷ" / "Đổi mật khẩu" như `ChangePasswordSheet` hiện tại.
  - Lớp dùng chung trong `phone.css` áp dưới `:is(.ph-app, .ph-sheet, .sd-app, .sd-drawer)`.

- [ ] **Step 1: Viết test thất bại** (thêm cuối `tests/staff-phone-requests.spec.ts`)

```ts
test('a rejected request shows the reviewer note under the rejected step', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=gio-vao-0909');
  const steps = page.getByRole('dialog', { name: 'Khai giờ vào 09/09' }).getByLabel('Các bước');
  await expect(steps).toContainText('Lý do từ chối');
  await expect(steps).toContainText('“Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”');
});

test('requests without a reviewer note show no note box', async ({ page }) => {
  await openPhone(page, '/nv/yeu-cau?yc=phep-1210');
  const sheet = page.getByRole('dialog', { name: 'Phép năm 12/10' });
  await expect(sheet.getByLabel('Các bước')).toContainText('Trưởng phòng Kinh doanh đã duyệt');
  await expect(sheet.locator('.rq-note')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run (trong `web/`): `PW_PORT=4196 npm run test:ui -- staff-phone-requests`
Expected: test đầu FAIL (không có "Lý do từ chối"); test thứ hai PASS.

- [ ] **Step 3: Dữ liệu**
  - Thêm `note` vào `RequestStep`; mọi bước `note: null`.
  - Riêng bước "Admin đã từ chối" của `gio-vao-0909`: `{ label: 'Lý do từ chối', text: '“Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”' }`.
  - `attendanceView(recent = 5)` thay `.slice(0, 5)` bằng `.slice(0, recent)`.
  - `getAttendance = (recent = 5) => respond(attendanceView(recent))`.

- [ ] **Step 4: Tách ba thân**
  - `DayBody.vue`: lấy phần thân và CSS `ds-*` (scoped) từ `DaySheet.vue`. `DaySheet` còn `BottomSheet` + `#badge` + `<DayBody :day="day" />` + nút "Đóng".
  - `RequestBody.vue`:
    - lấy `.rq-facts` và `.rq-steps` từ `RequestSheet.vue`; CSS `rq-*` chuyển thành `<style scoped>`, bỏ tiền tố `.ph-sheet`;
    - thêm hộp `.rq-note` theo spec mục 6: nền `var(--page)`, bo 12px, đệm 12px 14px, cách trên 8px, cột dọc khoảng 2px.
    - `RequestSheet` còn `BottomSheet` + `#badge` + `<RequestBody :request="request" />` + nút "Đóng".
  - `PasswordForm.vue`:
    - lấy `<form>` cùng logic (`FIELDS`, `validate`, `submit` gọi `changePassword`) từ `ChangePasswordSheet.vue`;
    - submit xong emit `done`; nút Huỷ emit `cancel`. Luật `.inp .show` theo sang, scoped.
    - `ChangePasswordSheet` còn `BottomSheet title="Đổi mật khẩu" :sub` + `<PasswordForm @done="emit('close')" @cancel="emit('close')" />`.
- [ ] **Step 5: CSS**
  - `phone.css`:
    - đổi mọi `:is(.ph-app, .ph-sheet)` thành `:is(.ph-app, .ph-sheet, .sd-app, .sd-drawer)`;
    - khối biến đầu file thành `.ph-app, .ph-sheet, .sd-app, .sd-drawer { --page: var(--ground); }`.
  - Chuyển các luật `.ph-sheet form`, `.ph-sheet .fld…`, `.ph-sheet .inp…`, `.ph-sheet .bt…` từ `BottomSheet.vue` sang cuối `phone.css`, đổi tiền tố thành `:is(.ph-sheet, .sd-drawer)`. Các luật khác của `BottomSheet.vue` giữ nguyên.
- [ ] **Step 6: Chạy cả bộ điện thoại**

Run: `PW_PORT=4196 npm run test:ui -- staff-phone`
Expected: tất cả PASS, kể cả hai test mới.

- [ ] **Step 7: Commit**

```bash
git add web/src/mock/staff-phone.ts web/src/services/staff-phone.ts web/src/views/staff-phone/components web/src/styles/phone.css web/tests/staff-phone-requests.spec.ts
git commit -m "feat(web): shared day/request/password bodies and the reviewer note (J5b)"
```

---

### Task 2: Chọn giao diện theo bề ngang, thanh trên và menu tài khoản

**Files:**
- Create: `web/src/composables/useStaffDesktop.ts`, `web/src/layouts/StaffLayout.vue`, `web/src/views/staff-desktop/StaffDesktopPage.vue`, `web/src/views/staff-desktop/parts/DesktopBar.vue`, `web/src/styles/staff-desktop.css`, `web/tests/fixtures/staff-desktop.ts`, `web/tests/staff-desktop-shell.spec.ts`
- Modify: `web/src/App.vue`, `web/src/main.ts` (import `./styles/staff-desktop.css` sau `phone.css`), `web/src/router/index.ts`, `web/src/router/routes/staff-phone.ts`, `web/src/router/routes/staff-desktop.ts`, `web/src/stores/session.ts`, `web/tests/auth-mock.spec.ts`

**Interfaces:**
- Produces:
  - `export const STAFF_DESKTOP_MIN = 1136`; `export function useStaffDesktop(): Readonly<Ref<boolean>>`. Ref và listener `change` tạo một lần ở mức module, lần gọi đầu.
  - `StaffLayout.vue`: `isDesktop ? <StaffDesktopPage /> : <PhoneLayout><slot /></PhoneLayout>`.
  - `StaffDesktopPage.vue`: gốc `<div class="sd-app">`, `<DesktopBar />`, `<main class="sd-pg">`. Task 4–6 thêm ba cột vào `main`, Task 3 thêm ngăn kéo.
  - `DesktopBar.vue`:
    - nút `id="sd-account"`, tên "Lê Hoàng Nam", `aria-controls="sd-menu"`, `:aria-expanded`;
    - vùng `id="sd-menu" role="region" aria-label="Tài khoản của tôi"`, ẩn bằng `v-show`;
    - `menuOpen = route.path === '/nv/toi' && !route.query.hop`.
  - `openDesktop(page, path, size = { width: 1440, height: 900 }): Promise<string[]>` trong `tests/fixtures/staff-desktop.ts`. Giống `openPhone`, chỉ khác kích thước mặc định.
  - `meta.layout` của `/nv/*` là `'staff'`; `LAYOUTS = { admin, staff: StaffLayout, blank }`.
  - `STAFF_HOME = '/nv/hom-nay'`.

- [ ] **Step 1: Viết test thất bại** (`tests/staff-desktop-shell.spec.ts`)

```ts
test('the desktop page makes no /api request and logs no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/hom-nay');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('from 1136px the desktop page replaces the phone app', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay', { width: 1136, height: 800 });
  await expect(page.getByRole('banner')).toContainText('Nhân viên');
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toHaveCount(0);
  await page.setViewportSize({ width: 1135, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toHaveCount(0);
});

test('crossing 1136px switches live without a reload', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Điều hướng' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
});

test('old staff URLs land on /nv/hom-nay', async ({ page }) => {
  await openDesktop(page, '/nv-may-tinh');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await page.goto('/nhan-vien');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/nhan-vien');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
});

test('the account menu follows /nv/toi', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const account = page.getByRole('button', { name: 'Lê Hoàng Nam' });
  const menu = page.getByRole('region', { name: 'Tài khoản của tôi' });
  await account.click();
  await expect(page).toHaveURL(/\/nv\/toi$/);
  await expect(account).toHaveAttribute('aria-expanded', 'true');
  for (const t of ['nam.le@gft.vn', 'Chính thức', 'GFT-0142', 'Kinh doanh', 'HC 08:00–17:00', '04/03/2024', '11 ngày',
    'Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.']) await expect(menu).toContainText(t);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
  await expect(menu).toBeHidden();
  await expect(account).toBeFocused();
  await page.goto('/nv/toi');
  await expect(menu).toBeVisible();
  await page.getByRole('banner').getByText('Nhân viên', { exact: true }).click(); // bấm ra ngoài menu, trúng chỗ không có liên kết
  await expect(page).toHaveURL(/\/nv\/hom-nay$/);
});

test('Đổi mật khẩu in the menu sets hop and hides the menu', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('region', { name: 'Tài khoản của tôi' }).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page).toHaveURL(/\/nv\/toi\?hop=doi-mat-khau$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeHidden();
});

test('signing out from the menu returns to /dang-nhap', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap/);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-shell`
Expected: FAIL. Chưa có nút "Lê Hoàng Nam"; `/nv-may-tinh` vẫn mở trang cũ.

- [ ] **Step 3: Chọn giao diện và route**
  - Viết `useStaffDesktop.ts` và `StaffLayout.vue`.
  - `App.vue`: bỏ `PhoneLayout` và `StaffDesktopLayout` khỏi `LAYOUTS`, thêm `staff`.
  - `routes/staff-phone.ts`: `meta('…')` trả `layout: 'staff'`; sửa chú thích đầu file.
  - `router/index.ts`:
    - bỏ `PHONE_MAX`; `/nhan-vien` thành `redirect: '/nv/hom-nay'`;
    - cổng xét `layout !== 'admin' && layout !== 'staff'`, rồi `if (layout === 'staff') return session.isAdminCapable && !session.payrollSubject ? session.home : true;`;
    - chú thích quy ước `meta.layout` thành `'admin' | 'staff' | 'blank'`.
  - `routes/staff-desktop.ts`: route `/nv-may-tinh` thành `{ path: '/nv-may-tinh', redirect: '/nv/hom-nay' }`; giữ `/dang-nhap`.
  - `stores/session.ts`: `STAFF_HOME = '/nv/hom-nay'`.
- [ ] **Step 4: Trang và thanh**
  - `StaffDesktopPage.vue` và `staff-desktop.css`:
    - `.sd-app`: đệm 16px, nền `var(--ground)`, `min-height: 100vh`, Geist 14px/20px, `tabular-nums`, `box-sizing: border-box`;
    - `.sd-pg` theo spec 3.1: lưới `minmax(300px, 3fr) minmax(400px, 5fr) minmax(300px, 3fr)`, khoảng 24px, `margin-top: 24px`, đệm `0 16px 24px`, `align-items: stretch`.
  - `DesktopBar.vue` theo spec 3.2, dữ liệu từ `getProfile()`. CSS scoped.
    - Bấm nút tài khoản:
      - menu đóng: `router.replace('/nv/toi')`;
      - menu mở: `router.replace('/nv/hom-nay')`.
    - Khi menu mở:
      - nghe `pointerdown` (capture) trên `document`; đích nằm ngoài `#sd-menu` và `#sd-account` thì `router.replace('/nv/hom-nay')`;
      - nghe `keydown` Escape: `replace('/nv/hom-nay')` rồi focus `#sd-account`.
    - "Đổi mật khẩu": `router.replace({ path: '/nv/toi', query: { hop: 'doi-mat-khau' } })`.
    - "Đăng xuất": `await logout(); router.push('/dang-nhap')`.
- [ ] **Step 5: Sửa `tests/auth-mock.spec.ts`**
  - Ba chỗ `toHaveURL(/\/nv-may-tinh/)` (dòng 44, 112, 147) thành `toHaveURL(/\/nv\/hom-nay/)`.
  - Hai chỗ đăng xuất `page.locator('.top .u').click(); page.getByRole('menuitem', { name: 'Đăng xuất' }).click();` thành `page.getByRole('button', { name: 'Lê Hoàng Nam' }).click(); page.getByRole('button', { name: 'Đăng xuất' }).click();`.
  - Test "staff login on a phone can sign out from the Tôi tab" giữ nguyên văn.
- [ ] **Step 6: Chạy**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-shell auth-mock staff-phone`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/composables/useStaffDesktop.ts web/src/layouts/StaffLayout.vue web/src/views/staff-desktop/StaffDesktopPage.vue web/src/views/staff-desktop/parts/DesktopBar.vue web/src/styles/staff-desktop.css web/src/main.ts web/src/App.vue web/src/router web/src/stores/session.ts web/tests/fixtures/staff-desktop.ts web/tests/staff-desktop-shell.spec.ts web/tests/auth-mock.spec.ts
git commit -m "feat(web): pick the staff layout at 1136px, desktop bar and account menu"
```

---

### Task 3: Ngăn kéo phải và đọc URL

**Files:**
- Create: `web/src/views/staff-desktop/parts/SideDrawer.vue`, `web/src/views/staff-desktop/useDesktopDetail.ts`, `web/tests/staff-desktop-drawers.spec.ts`
- Modify: `web/src/views/staff-desktop/StaffDesktopPage.vue`, `web/src/styles/staff-desktop.css`

**Interfaces:**
- Consumes: `DayBody`, `RequestBody`, `PasswordForm` (Task 1); `#sd-account` (Task 2); `getDay`, `getRequest` (`services/staff-phone`).
- Produces:
  - `SideDrawer.vue`: props `{ title: string; sub?: string }`, emits `close: []`, slots `badge` và mặc định.
    - Markup: `Teleport to="body"` > `.sd-drawer-root` (fixed, inset 0, z-index 100) > `.sd-scrim` (bấm thì `close`) + `<aside class="sd-drawer" role="dialog" aria-modal="true" tabindex="-1" :aria-label="title">`.
    - Đầu ngăn kéo: h2 + dòng phụ; nút `.rb` tên "Đóng", biểu tượng `PhIcon name="x"`.
    - Mount: `lockScroll()` + `registerOverlayFocus(panel, () => emit('close'), () => true)`.
    - Unmount: gọi hàm huỷ đăng ký, `unlockScroll()`; sau `nextTick`, nếu `document.activeElement === document.body` thì focus `#sd-account`.
  - `useDesktopDetail(): { day: Ref<DayDetail | null>; request: Ref<RequestDetail | null>; password: Ref<boolean>; closeDetail: () => void }`.
    - Chỉ đọc các cặp: `ngay` trên `/nv/cham-cong`, `yc` trên `/nv/yeu-cau`, `hop` trên `/nv/toi`.
    - Giá trị lạ: `router.replace` bỏ tham số. Bỏ kết quả cũ nếu tham số đã đổi trong lúc chờ.
    - `closeDetail()`: `router.replace({ path: route.path, query: <query bỏ ngay, yc, hop> })`.
  - Trang:
    - ba `SideDrawer`: ngày (`#badge` chấm `day.kind` + `day.statusText`; `DayBody`; nút `.b2` "Đóng"), yêu cầu (`RequestBody`), mật khẩu (`title="Đổi mật khẩu"`, `sub="Tài khoản <session.user.username>"`, `PasswordForm @done/@cancel="closeDetail"`);
    - CSS ngăn kéo theo spec 5.1 trong `staff-desktop.css`, dưới `.sd-drawer-root`, `.sd-drawer` (fixed cách trên, phải, dưới 16px; rộng 440px, tối đa `calc(100% - 32px)`; `overflow-y: auto`; `> .b2:last-child { margin-top: auto }`).

- [ ] **Step 1: Viết test thất bại** (`tests/staff-desktop-drawers.spec.ts`; `drawer = page.locator('.sd-drawer')`)

```ts
test('drawers make no /api request and log no error', async ({ page }) => {
  const calls = await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  expect(calls).toEqual([]);
});

test('/nv/cham-cong?ngay= opens the day drawer and Esc drops the param', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  const d = page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' });
  for (const t of ['Ca HC 08:00–17:00', 'Cần xử lý', '08:12', 'Chưa có', '12 phút', 'Đã gửi giải trình lúc 20:14',
    'Giờ ra khai 17:30 · chờ Admin duyệt']) await expect(d).toContainText(t);
  await expect(page.locator('.sd-drawer')).toHaveCount(1);
  await expect(page.locator('.ph-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
});

test('the same URL opens the phone sheet below 1136px', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27', { width: 390, height: 844 });
  await expect(page.locator('.ph-sheet')).toBeVisible();
  await expect(page.locator('.sd-drawer')).toHaveCount(0);
});

test('×, Đóng and the scrim close the drawer', async ({ page }) => {
  for (const how of ['x', 'close', 'scrim'] as const) {
    await openDesktop(page, '/nv/cham-cong?ngay=2026-10-26');
    const d = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
    if (how === 'x') await d.getByRole('button', { name: 'Đóng' }).first().click();
    if (how === 'close') await d.getByRole('button', { name: 'Đóng' }).last().click();
    if (how === 'scrim') await page.locator('.sd-scrim').click({ position: { x: 10, y: 10 } });
    await expect(d).toBeHidden();
    await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  }
});

test('/nv/yeu-cau?yc=gio-vao-0909 shows the rejection note (K3b)', async ({ page }) => {
  await openDesktop(page, '/nv/yeu-cau?yc=gio-vao-0909');
  const d = page.getByRole('dialog', { name: 'Khai giờ vào 09/09' });
  for (const t of ['Giải trình', 'Từ chối', 'Thứ Tư 09/09/2026', '08:00', '“Máy chấm công không nhận.”', '09/09 17:45',
    'Admin đã từ chối', '10/09 10:15', 'Lý do từ chối', '“Máy chấm công vẫn ghi nhận ngày 09/09, giờ vào 08:47.”'])
    await expect(d).toContainText(t);
});

test('/nv/toi?hop=doi-mat-khau opens the password drawer; Huỷ brings the menu back', async ({ page }) => {
  await openDesktop(page, '/nv/toi?hop=doi-mat-khau');
  const d = page.getByRole('dialog', { name: 'Đổi mật khẩu' });
  await expect(d).toContainText('Tài khoản nhanvien');
  await d.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(d.getByRole('alert')).toContainText('Nhập mật khẩu hiện tại.');
  await d.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page).toHaveURL(/\/nv\/toi$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeVisible();
});

test('unknown params are dropped and nothing opens', async ({ page }) => {
  for (const [from, to] of [
    ['/nv/cham-cong?ngay=2026-10-04', /\/nv\/cham-cong$/],
    ['/nv/yeu-cau?yc=khong-co', /\/nv\/yeu-cau$/],
    ['/nv/toi?hop=la', /\/nv\/toi$/]
  ] as const) {
    await openDesktop(page, from);
    await expect(page).toHaveURL(to);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('params on another path are ignored', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay?ngay=2026-10-27');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/nv\/hom-nay\?ngay=2026-10-27$/);
});

test('closing a drawer opened from the URL focuses the account button', async ({ page }) => {
  await openDesktop(page, '/nv/yeu-cau?yc=phep-1210');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Lê Hoàng Nam' })).toBeFocused();
});

test('resizing with a drawer open hands over to the phone sheet', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong?ngay=2026-10-27');
  await expect(page.locator('.sd-drawer')).toBeVisible();
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator('.ph-sheet')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
  await page.goto('/nv/cham-cong?ngay=2026-10-27');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.sd-drawer')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-drawers`
Expected: FAIL (chưa có dialog trên máy tính).

- [ ] **Step 3: Viết `SideDrawer.vue`, `useDesktopDetail.ts`, gắn ba ngăn kéo vào trang, thêm CSS**

- [ ] **Step 4: Chạy**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop staff-phone`
Expected: tất cả PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/staff-desktop web/src/styles/staff-desktop.css web/tests/staff-desktop-drawers.spec.ts
git commit -m "feat(web): right drawers for a day, a request and the password on desktop"
```

---

### Task 4: Cột 1 · Hôm nay + Yêu cầu

**Files:**
- Create: `web/src/views/staff-phone/components/ShiftCard.vue`, `WeekCard.vue`, `RequestList.vue`; `web/src/views/staff-desktop/parts/TodayColumn.vue`; `web/tests/staff-desktop-today.spec.ts`
- Modify: `web/src/views/staff-phone/HomeView.vue`, `web/src/views/staff-phone/RequestsView.vue`, `web/src/views/staff-desktop/StaffDesktopPage.vue`, `web/src/styles/staff-desktop.css`

**Interfaces:**
- Consumes: `SideDrawer` và URL (Task 3); `RequestRow`, `PhIcon`.
- Produces:
  - `ShiftCard.vue`: props `{ home: HomeView }`, emits `checkedOut: [view: HomeView]`.
    - Lấy `section.hero` (aria-label "Ca hôm nay", `tabindex="-1"`), phép tính `arc` và CSS hero từ `HomeView.vue`.
    - Tự gọi `checkOut()`, emit kết quả, rồi focus chính nó.
  - `WeekCard.vue`: props `{ week: HomeView['week']; alert: HomeView['alert']; replace?: boolean }`. Lấy `section.card.week` (aria-label "Tuần này") cùng CSS. Ô ngày và liên kết nhắc việc là `RouterLink` có `:replace="replace"`.
  - `RequestList.vue`: props `{ view: RequestsView; tablistLabel: string; scrollLabel?: string; replace?: boolean }`.
    - Lấy tablist, tabpanel, nhóm tháng, phím mũi tên và CSS `rq-tabs`/`rq-tab`/`rq-panel`/`rq-group`/`rq-gh` từ `RequestsView.vue`.
    - Có `scrollLabel`: tabpanel mang `aria-label=scrollLabel`, `tabindex="0"`, lớp `rq-scroll`.
    - Không có `scrollLabel`: tabpanel mang `aria-labelledby` như cũ.
  - `TodayColumn.vue`: emits `checkedOut: []`.
    - Tải `getHome()` và `getRequests()`.
    - Dựng theo spec 4.1: `section.sd-col` có đầu cột với h1; `ShiftCard`; `WeekCard replace`; `section.sd-grow` aria-label "Yêu cầu" gồm h2 `.sd-title` "Yêu cầu", nút "Tạo yêu cầu" (toast `'Chưa có luồng tạo yêu cầu trong bản mockup.'`), `RequestList` với `tablistLabel="Lọc yêu cầu theo trạng thái"`, `scrollLabel="Danh sách yêu cầu, cuộn để xem thêm"`, `replace`.
  - CSS `staff-desktop.css`:
    - `.sd-col` (cột dọc, gap 16px, `min-width: 0`); `.sd-grow` (flex 1 1 auto, cột dọc);
    - `.sd-app .sd-title` (League Spartan 600 28px/32px); `.sd-app h2` (18px/24px 600);
    - `.sd-app .rq-scroll` theo spec 4.1 (`flex: 1 1 0; height: 0; min-height: 288px; overflow-y: auto; overscroll-behavior: contain`, nhãn nhóm `position: sticky; top: 0; background: var(--page)`).
  - `HomeView.vue` dùng `ShiftCard`, `WeekCard` (không `replace`). `RequestsView.vue` dùng `RequestList` với `tablistLabel="Lọc theo trạng thái"` và `replace`. Chữ và hành vi điện thoại không đổi.

- [ ] **Step 1: Viết test thất bại** (`tests/staff-desktop-today.spec.ts`; `col1 = page.locator('.sd-col').nth(0)`)

```ts
test('column 1 makes no /api request and logs no error', /* openDesktop('/nv/hom-nay'), chờ h1, calls rỗng */);

test('column 1 shows the greeting, the shift card and the week', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await expect(page.getByRole('heading', { level: 1, name: 'Lê Hoàng Nam' })).toBeVisible();
  for (const t of ['Chào buổi sáng', 'Thứ Tư', '28/10/2026']) await expect(col1).toContainText(t);
  const hero = page.getByRole('region', { name: 'Ca hôm nay' });
  for (const t of ['Ca HC · 08:00–17:00', 'Đang trong ca', '1g 41p', 'đã làm · vào 07:59']) await expect(hero).toContainText(t);
  await expect(page.getByRole('region', { name: 'Tuần này' })).toContainText('26/10 – 01/11');
});

test('a week day opens the day drawer and Esc returns focus to it', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const cell = page.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý' });
  await cell.click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('dialog', { name: 'Thứ Ba 27/10/2026' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/nv\/cham-cong$/);
  await expect(cell).toBeFocused();
});

test('the reminder link opens 27/10', /* bấm link '27/10 thiếu giờ ra · chờ duyệt giải trình' → URL ?ngay=2026-10-27 */);

test('Check-out on the desktop', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  const hero = page.getByRole('region', { name: 'Ca hôm nay' });
  await expect(hero).toContainText('Đã check-out');
  await expect(hero).toContainText('ra 09:40');
  await expect(page.getByRole('button', { name: 'Check-out lúc 09:40' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Hôm nay, thứ Tư 28/10: đang làm' }).click();
  await expect(page.getByRole('dialog', { name: 'Thứ Tư 28/10/2026' })).toContainText('09:40');
});

test('requests: tabs, groups and the scroll box', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const tabs = page.getByRole('tablist', { name: 'Lọc yêu cầu theo trạng thái' });
  await expect(tabs.getByRole('tab')).toHaveText(['Tất cả 4', 'Chờ duyệt 1', 'Đã duyệt 2', 'Từ chối 1']);
  const panel = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
  await tabs.getByRole('tab', { name: 'Từ chối 1' }).click();
  await expect(panel.getByRole('link')).toHaveCount(1);
  await expect(panel).toContainText('Tháng 9');
  await expect(panel).not.toContainText('Tháng 10');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Tất cả 4' })).toHaveAttribute('aria-selected', 'true');
  const box = await panel.evaluate(el => ({ oy: getComputedStyle(el).overflowY, h: el.getBoundingClientRect().height,
    bottom: el.getBoundingClientRect().bottom, col: el.closest('.sd-col')!.getBoundingClientRect().bottom }));
  expect(box.oy).toBe('auto');
  expect(box.h).toBeGreaterThanOrEqual(288);
  expect(Math.abs(box.bottom - box.col)).toBeLessThanOrEqual(1);
});

test('a request row opens the request drawer and Esc returns focus', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const row = page.getByRole('link', { name: 'Khai giờ vào 09/09, Từ chối' });
  await row.click();
  await expect(page).toHaveURL(/\/nv\/yeu-cau\?yc=gio-vao-0909$/);
  await expect(page.getByRole('dialog', { name: 'Khai giờ vào 09/09' })).toContainText('Lý do từ chối');
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
});

test('Tạo yêu cầu shows the mockup notice', /* bấm nút → thấy 'Chưa có luồng tạo yêu cầu trong bản mockup.' */);

test('a day click closes the menu and opens only the drawer', async ({ page }) => {
  await openDesktop(page, '/nv/toi');
  await page.getByRole('link', { name: 'Thứ Ba 27/10: cần xử lý' }).click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-27$/);
  await expect(page.getByRole('region', { name: 'Tài khoản của tôi' })).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
});
```

Ba test chỉ ghi chú (`/* … */`) viết đầy đủ theo đúng lời mô tả, cùng kiểu với các test bên cạnh.

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-today`
Expected: FAIL (chưa có h1 trên máy tính).

- [ ] **Step 3: Tách `ShiftCard`, `WeekCard` khỏi `HomeView.vue`; tách `RequestList` khỏi `RequestsView.vue`**

- [ ] **Step 4: Chạy test điện thoại (lưới an toàn của bước tách)**

Run: `PW_PORT=4196 npm run test:ui -- staff-phone`
Expected: tất cả PASS.

- [ ] **Step 5: Viết `TodayColumn.vue`, đặt vào `main.sd-pg`, thêm CSS**

Trang lắng `checkedOut` của `TodayColumn` và tăng `stamp` (Task 5 dùng).

- [ ] **Step 6: Chạy**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop staff-phone`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/views/staff-phone web/src/views/staff-desktop web/src/styles/staff-desktop.css web/tests/staff-desktop-today.spec.ts
git commit -m "feat(web): desktop column 1 with the shift card, the week and the request list"
```

---

### Task 5: Cột 2 · Chấm công

**Files:**
- Create: `web/src/views/staff-phone/components/MonthTiles.vue`, `MonthCalendar.vue`, `RecentDays.vue`; `web/src/views/staff-desktop/parts/AttendanceColumn.vue`; `web/tests/staff-desktop-attendance.spec.ts`
- Modify: `web/src/views/staff-phone/AttendanceView.vue`, `web/src/views/staff-desktop/StaffDesktopPage.vue`

**Interfaces:**
- Consumes: `getAttendance(recent)` (Task 1); `stamp` của trang (Task 4); `MonthSwitch`.
- Produces:
  - `MonthTiles.vue`: props `{ tiles: AttendanceView['tiles'] }`. Gồm `div role="group" aria-label="Chỉ số tháng 10"` và CSS `at-tile*`.
  - `MonthCalendar.vue`: props `{ cells: AttendanceView['cells'] }`, emits `open: [date: string]`.
    - Gồm `section.card` aria-label "Lịch tháng 10", lưới (ô có dữ liệu là `button.dn[data-date]`), chú giải bốn mục, CSS `at-cal`/`at-grid`/`at-wd`/`at-lg`.
  - `RecentDays.vue`: props `{ recent: AttendanceView['recent'] }`, emits `open: [date: string]`. Gồm `div.card.ls` các `button.ro` với tên truy cập như hiện tại.
  - `AttendanceView.vue` dùng ba component; tiêu đề "Gần đây" giữ là h2 ở màn.
  - `AttendanceColumn.vue`: props `{ stamp: number }`, gốc `section.sd-col`.
    - Tải `getAttendance(7)`; khi `stamp` đổi thì tải lại.
    - Dựng theo spec 4.2: h2 `.sd-title` "Chấm công" + `shiftLine`; `MonthSwitch`; `MonthTiles`; `MonthCalendar`; `section.sd-grow` gồm h3 "Gần đây" + `RecentDays`. Thẻ của `RecentDays` giãn kín đáy.
    - `@open` gọi `router.replace({ path: '/nv/cham-cong', query: { ngay: date } })`.

- [ ] **Step 1: Viết test thất bại** (`tests/staff-desktop-attendance.spec.ts`; `col2 = page.locator('.sd-col').nth(1)`)

```ts
test('column 2 makes no /api request and logs no error', /* như các file trước */);

test('column 2 shows the month, tiles and calendar', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong');
  await expect(col2.getByRole('heading', { level: 2, name: 'Chấm công' })).toBeVisible();
  for (const t of ['Ca HC 08:00–17:00 · thứ Hai – thứ Bảy', 'Tháng 10/2026', 'Kỳ công đang mở']) await expect(col2).toContainText(t);
  await expect(col2.getByRole('button', { name: 'Tháng trước' })).toBeDisabled();
  await expect(col2.getByRole('button', { name: 'Tháng sau' })).toBeDisabled();
  const tiles = col2.getByRole('group', { name: 'Chỉ số tháng 10' });
  for (const t of ['21 / 26', 'Ngày công', 'Lần đi muộn', 'Ngày nghỉ có lương']) await expect(tiles).toContainText(t);
  await expect(col2.getByRole('region', { name: 'Lịch tháng 10' }).locator('.dn')).toHaveCount(31);
});

test('Gần đây lists seven days', async ({ page }) => {
  await openDesktop(page, '/nv/cham-cong');
  const rows = col2.locator('.ls button.ro');
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(0)).toContainText('Thứ Tư 28/10');
  await expect(rows.nth(0)).toContainText('07:59 – …');
  await expect(rows.nth(5)).toContainText('Thứ Năm 22/10');
  await expect(rows.nth(5)).toContainText('07:59 – 17:08');
  await expect(rows.nth(6)).toContainText('Thứ Tư 21/10');
  await expect(rows.nth(6)).toContainText('07:57 – 17:03');
});

test('a calendar day opens the drawer and Esc returns focus', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const day = col2.getByRole('button', { name: 'Thứ Hai 26/10: đi làm' });
  await day.click();
  await expect(page).toHaveURL(/\/nv\/cham-cong\?ngay=2026-10-26$/);
  const d = page.getByRole('dialog', { name: 'Thứ Hai 26/10/2026' });
  for (const t of ['Đi làm', '07:56', '17:10']) await expect(d).toContainText(t);
  await page.keyboard.press('Escape');
  await expect(day).toBeFocused();
});

test('a recent row opens its day', /* bấm dòng 'Thứ Ba 27/10 08:12 – ?, Cần xử lý' → dialog 'Thứ Ba 27/10/2026' */);

test('Check-out in column 1 updates Gần đây', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  await page.getByRole('button', { name: 'Check-out lúc 09:40' }).click();
  await expect(col2.locator('.ls button.ro').nth(0)).toContainText('07:59 – 09:40');
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-attendance`
Expected: FAIL (chưa có cột 2).

- [ ] **Step 3: Tách `MonthTiles`, `MonthCalendar`, `RecentDays` khỏi `AttendanceView.vue`; chạy `-- staff-phone`, tất cả PASS**

- [ ] **Step 4: Viết `AttendanceColumn.vue`, đặt sau cột 1, truyền `:stamp`**

- [ ] **Step 5: Chạy**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop staff-phone`
Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/views/staff-phone web/src/views/staff-desktop web/tests/staff-desktop-attendance.spec.ts
git commit -m "feat(web): desktop column 2 with the month, calendar and seven recent days"
```

---

### Task 6: Cột 3 · Thu nhập, ba cột cao bằng nhau

**Files:**
- Create: `web/src/views/staff-phone/components/NetCard.vue`, `KpiCard.vue`, `IncomeLines.vue`; `web/src/views/staff-desktop/parts/IncomeColumn.vue`; `web/tests/staff-desktop-income.spec.ts`
- Modify: `web/src/views/staff-phone/IncomeView.vue`, `web/src/views/staff-desktop/StaffDesktopPage.vue`, `web/src/styles/staff-desktop.css`

**Interfaces:**
- Produces:
  - `NetCard.vue`: props `{ income: IncomeView }`. Gồm `section.hero.on-dark` aria-label "Thực nhận tháng 10".
  - `KpiCard.vue`: props `{ kpi: IncomeView['kpi']; level?: 'h2' | 'h3' }` (mặc định `'h2'`). Gồm `section.card` aria-label "KPI tháng 10" và phép tính chấm. Tiêu đề "KPI tháng 10" dựng bằng `<component :is="level">`: điện thoại giữ h2, máy tính truyền `'h3'` (spec 3.1).
  - `IncomeLines.vue`: props `{ lines: IncomeView['lines']; total: string }`. Gồm `div.card.ls` các dòng và `.tot`.
  - CSS theo sang từng component, scoped. `IncomeView.vue` dùng ba component; tiêu đề "Các khoản" giữ ở màn.
  - `IncomeColumn.vue`, gốc `section.sd-col`:
    - Tải `getIncome()`. `KpiCard` nhận `level="h3"`. Đầu cột: h2 `.sd-title` "Thu nhập" + dòng `${label} · ${state chữ đầu viết thường}` → "Tháng 10/2026 · tạm tính".
    - Rồi `NetCard`, `KpiCard`, `section.sd-grow` gồm h3 "Các khoản" + `IncomeLines`.
    - Không có `MonthSwitch`, không có `note`.
  - CSS: `.sd-grow > .card { flex: 1 1 auto; display: flex; flex-direction: column; }`, `.sd-app .tot { margin-top: auto; }`.

- [ ] **Step 1: Viết test thất bại** (`tests/staff-desktop-income.spec.ts`; `col3 = page.locator('.sd-col').nth(2)`)

```ts
test('column 3 makes no /api request and logs no error', /* như các file trước */);

test('column 3 shows net pay, KPI and the lines', async ({ page }) => {
  await openDesktop(page, '/nv/thu-nhap');
  await expect(col3.getByRole('heading', { level: 2, name: 'Thu nhập' })).toBeVisible();
  await expect(col3).toContainText('Tháng 10/2026 · tạm tính');
  await expect(col3).not.toContainText('Phiếu chính thức có khi Admin duyệt');
  await expect(col3.getByRole('button', { name: 'Tháng trước' })).toHaveCount(0);
  const net = col3.getByRole('region', { name: 'Thực nhận tháng 10' });
  for (const t of ['14.278.183', 'Admin đang duyệt phiếu', '15.538.183', '1.260.000']) await expect(net).toContainText(t);
  await expect(col3.getByRole('heading', { level: 3, name: 'KPI tháng 10' })).toBeVisible();
  await expect(col3.getByRole('heading', { level: 3, name: 'Các khoản' })).toBeVisible();
  const kpi = col3.getByRole('region', { name: 'KPI tháng 10' });
  for (const t of ['66,14%', '1.322.800', '2.000.000', 'Wework', 'Tự đánh giá']) await expect(kpi).toContainText(t);
  await expect(col3.locator('.ls .ro')).toHaveCount(6);
  await expect(col3.locator('.tot')).toHaveText(/Thực nhận\s*14\.278\.183 ₫/);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1136, height: 800 }]) {
  test(`the three columns end at the same height at ${size.width}px`, async ({ page }) => {
    await openDesktop(page, '/nv/hom-nay', size);
    await expect(page.locator('.sd-col')).toHaveCount(3);
    const bottoms = await page.locator('.sd-col').evaluateAll(cs => cs.map(c => c.getBoundingClientRect().bottom));
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
  });
}

test('no horizontal scroll at 1136px and 1280px', async ({ page }) => {
  for (const width of [1136, 1280]) {
    await openDesktop(page, '/nv/hom-nay', { width, height: 800 });
    await expect(page.locator('.sd-col')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('the Thực nhận row sits at the bottom of its card', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay');
  const gap = await col3.locator('.tot').evaluate(t => t.closest('.card')!.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom);
  expect(gap).toBeLessThanOrEqual(8);
});

test('a short window keeps the request box and scrolls the drawer', async ({ page }) => {
  await openDesktop(page, '/nv/hom-nay', { width: 1136, height: 700 });
  const panel = page.getByRole('tabpanel', { name: 'Danh sách yêu cầu, cuộn để xem thêm' });
  expect(await panel.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(288);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto('/nv/yeu-cau?yc=gio-vao-0909');
  const d = page.locator('.sd-drawer');
  expect(await d.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  const box = await d.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(700);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-income`
Expected: FAIL (chưa có cột 3).

- [ ] **Step 3: Tách `NetCard`, `KpiCard`, `IncomeLines` khỏi `IncomeView.vue`; chạy `-- staff-phone`, tất cả PASS**

- [ ] **Step 4: Viết `IncomeColumn.vue`, đặt sau cột 2, thêm CSS**

- [ ] **Step 5: Chạy**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop staff-phone`
Expected: tất cả PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/views/staff-phone web/src/views/staff-desktop web/src/styles/staff-desktop.css web/tests/staff-desktop-income.spec.ts
git commit -m "feat(web): desktop column 3 with net pay, KPI and lines; equal column heights"
```

---

### Task 7: Xoá mã cũ, mục lục thiết kế, chạy toàn bộ

**Files:**
- Delete:
  - `web/src/views/staff-desktop/StaffHome.vue`;
  - 12 file cũ trong `web/src/views/staff-desktop/parts/`: `AccountPopover.vue`, `AdvanceDialog.vue`, `AttendanceCard.vue`, `DayRequestDialog.vue`, `ExplanationDialog.vue`, `IncomeCard.vue`, `KpiCard.vue`, `KpiSelfCard.vue`, `ProfileDialog.vue`, `RequestsCard.vue`, `TodayHero.vue`, `small-text.ts`;
  - `web/src/layouts/StaffDesktopLayout.vue`;
  - `web/src/services/staff-desktop.ts`, `web/src/services/staff-requests.ts`;
  - `web/src/builders/staff-desktop/`, `web/src/builders/staff-requests/`;
  - `web/tests/staff-ux.spec.ts`.
- Modify: `web/src/design-index/staff-desktop.ts`
- Test: `web/tests/staff-desktop-shell.spec.ts` (thêm)

**Interfaces:**
- Consumes: mọi thứ ở Task 1–6. Không file giữ lại nào được import file bị xoá.

- [ ] **Step 1: Viết test thất bại** (thêm vào `tests/staff-desktop-shell.spec.ts`)

```ts
test('the design index lists the desktop boards', async ({ page }) => {
  await openDesktop(page, '/thiet-ke');
  const group = page.locator('section', { has: page.getByRole('heading', { name: /Nhân viên · máy tính/ }) });
  await expect(group.getByRole('link')).toHaveText([
    'Nhân viên trên máy tính · một trang ba cột',
    'Máy tính · ngăn kéo một ngày (27/10)',
    'Máy tính · ngăn kéo yêu cầu bị từ chối',
    'Máy tính · menu tài khoản',
    'Đăng nhập',
    'Đăng nhập · sai mật khẩu'
  ]);
  await expect(group.getByRole('link', { name: 'Máy tính · ngăn kéo yêu cầu bị từ chối' }))
    .toHaveAttribute('href', '/nv/yeu-cau?yc=gio-vao-0909');
  await expect(page.locator('a[href^="/nv-may-tinh"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `PW_PORT=4196 npm run test:ui -- staff-desktop-shell`
Expected: FAIL (mục lục còn 12 dòng `/nv-may-tinh`).

- [ ] **Step 3: Sửa `design-index/staff-desktop.ts` theo spec 8.4**
  - Bốn dòng K, `file` lần lượt `StaffDesktop.dc.html`, `StaffDesktopDay.dc.html`, `StaffDesktopRequest.dc.html`, `StaffDesktop.dc.html#menu`; `to` theo spec.
  - Giữ hai dòng Đăng nhập; sửa chú thích đầu file theo spec 8.4.
- [ ] **Step 4: Xoá**
  - Trước khi xoá, chạy `grep -rn "staff-desktop/StaffHome\|StaffDesktopLayout\|services/staff-desktop\|services/staff-requests\|builders/staff-desktop\|builders/staff-requests\|staff-desktop/parts/\(AccountPopover\|AdvanceDialog\|AttendanceCard\|DayRequestDialog\|ExplanationDialog\|IncomeCard\|KpiCard\|KpiSelfCard\|ProfileDialog\|RequestsCard\|TodayHero\|small-text\)" web/src web/tests`.
  - Chỉ chính các file bị xoá được xuất hiện trong kết quả. Có file khác thì dừng và ghi Ruling trước khi xoá.
  - Rồi `git rm` danh sách ở mục Files.
- [ ] **Step 5: Chạy toàn bộ**

Run: `PW_PORT=4196 npm run test:ui`
Expected: tất cả PASS. Số test bỏ qua chỉ còn các `fixme` có từ trước ở file khác (không còn `staff-ux`).

- [ ] **Step 6: Commit**

```bash
git add -A web/src web/tests
git status --short   # kiểm không có .claude/launch.json
git commit -m "chore(web): remove the old /nv-may-tinh page and list K1/K2/K3b in the design index"
```
