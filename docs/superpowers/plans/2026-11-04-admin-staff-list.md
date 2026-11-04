# Danh sách Nhân sự và ngăn kéo hồ sơ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn `/admin/nhan-su` theo bảng I (thẻ chỉ số, tìm, công tắc chưa kích hoạt, chọn nhiều dòng, xuất CSV, bảng 6 cột) và ngăn kéo hồ sơ theo bảng I2, chạy trên dữ liệu giả.

**Architecture:**

- `web/src/mock/staff.ts` giữ 10 người, 4 thẻ chỉ số và hồ sơ từng người (chỉ đọc).
- `services/admin-hr.ts` bọc mock bằng `respond()`.
- `StaffView.vue` viết lại tại chỗ: tải danh sách, giữ trạng thái tìm, công tắc, chọn, `?q`, `?nv`. Các phần hiển thị nằm trong `views/admin/staff/parts/`.
- Ngăn kéo `StaffDrawer.vue` là thành phần riêng, dùng `registerOverlayFocus` và `lockScroll`.
- Mã cũ theo BE của Nhân sự bị xoá.

**Tech Stack:** Vue 3.5 + Vue Router 5, Vite 8, Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-04-admin-staff-list-design.md](../specs/2026-11-04-admin-staff-list-design.md)

**Gốc và song song:**

- Plan viết trên `4c1bf0d`. Mã ở đó giống `337374f`, hai commit sau chỉ thêm tài liệu.
- Plan chạy trên nhánh riêng, song song với [plan chuông và chấm công](2026-11-04-admin-bell-attendance.md) và [plan Bảng lương gộp KPI](2026-11-04-admin-payroll-kpi.md). Coi như chưa có thay đổi nào của hai plan đó.

**Mốc trước khi sửa (đo 04/11/2026 trên `4c1bf0d`, `PW_PORT=4193`):**

- `npm --prefix web run test:ui`: 40 passed, 47 skipped, 0 failed.
- `npm test` (BE): 24 pass, 0 fail theo ledger; lượt viết plan này không chạy lại (cần PostgreSQL).

## Global Constraints

- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc. Không đọc, không trích `spec/` gốc.
- Không sửa file của hai plan kia: `views/admin/settings/nav.ts`, `components/shell/AdminSidebar.vue`, `AdminLayout.vue`, `AdminTopbar.vue`, `mock/overview.ts`, `mock/shell.ts`, `services/admin-main.ts`, `views/admin/overview/OverviewView.vue`, `tests/admin-shell.spec.ts`, `tests/admin-overview.spec.ts`. Cũng không sửa `utils/format.ts`, `components/ui/AppDrawer.vue`, `styles/overlay.css`, `styles/base.css`, `router/routes/admin-attendance.ts`. File chung duy nhất được sửa là `design-index/admin-attendance.ts`, đúng các dòng ở Task 4.
- Không có `fetch(` hay `api(` trong mã mới. Test không dùng `page.route`. Mỗi test đầu nhóm kiểm bộ ghi request `/api` rỗng.
- Xác minh chỉ bằng test:
  - `npm --prefix web run test:ui`; một file: `npm --prefix web run test:ui -- admin-staff`;
  - `npm test` ở thư mục gốc.
  - Không chạy typecheck hay prettier.
  - Nhiều worktree chạy cùng lúc thì đặt `PW_PORT` riêng (ví dụ `PW_PORT=4195`).
- Mỗi task: viết test, chạy cho đỏ, viết mã, chạy cho xanh, commit. Commit message dạng `feat(web): …` và kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Chỉ `git add` file của task.
- Dữ liệu, câu chữ và số chép đúng spec mục 1 và 2. Nguồn để đối chiếu: `C:\Users\524FFF~1.AIU\AppData\Local\Temp\claude\C--Users-52-AI-UD-Project-Vladilena-Milize--claude-worktrees-admin-ui-concept-6445c9\e0f113d9-fd93-45b7-a7d6-cbcee0c30c32\scratchpad\gen-staff.js`. Ảnh: `…\scratchpad\preview\staff.png`, `staff-detail.png`.
- Danh sách chỉ hiện thông tin cốt lõi (quyết định 2):
  - mỗi ô một giá trị chính, trên một dòng (`white-space: nowrap`);
  - mã, bậc, thâm niên, ca, hợp đồng, lý do, khoảng ngày chỉ có trong ngăn kéo;
  - không thêm cột, dòng phụ hay chú thích ngoài bảng I.
- Không có ô nhập hay nhãn giá trị dạng viên thuốc trong nội dung. Viên thuốc chỉ cho nhãn trạng thái (bảng và đầu ngăn kéo). Ô tìm, công tắc, nút bo 8px.
- Màu theo design system GFT, dùng biến CSS, không viết cứng màu nền:
  - `--text` #212121, `--muted` #616161, `--surface-dark` #1c1c1c, `--gold` #e8c372, `--gold-light` #fce8b2, `--gold-pale` #fff9ec, `--ink-on-dark-muted` #9e9e9e;
  - `--surface`, `--raised`, `--ground`, `--border`, `--control`, `--status-done` #2f5aa8, `--status-pending` #eb973d, `--status-draft` #e0e0e0;
  - vàng không làm chữ hay viền trên nền sáng; màn có đúng một thẻ nền tối (thẻ "Nhân sự đang làm") và không thẻ nền vàng;
  - không đổ bóng; vòng focus 2px `--text`.
- Chữ: Geist, `tabular-nums` cho số. League Spartan chỉ cho h1. Thang cỡ chữ 12 / 14 / 18 / 28 / 32px.
- Không đặt nút giả: không có "Nhập từ Excel", "Thêm nhân sự", "Bộ lọc", "Gán ca", "Đổi phòng ban", "Sửa hồ sơ", nút "i", nút sắp xếp, nút trang (spec R3–R6).
- Dữ liệu giả chỉ đọc, nằm trong bộ nhớ; màn không đọc `?thang` (spec R8).

## Review Focus

1. **Chữ tìm có dấu, thiếu dấu, có "đ", thừa khoảng trắng, hoặc chỉ toàn khoảng trắng:**
   - `  do mai ` ra Đỗ Mai Linh; `dang` ra Đặng Văn Phúc;
   - `   ` coi như không tìm, chân thẻ vẫn "Hiển thị 1–10 trong 131 hồ sơ".
   - Test ở Task 2.
2. **Đường dẫn ngăn kéo cũ hoặc sai** (`?nv=khong-co`, `?hop=sua-ho-so&nv=linh` của mục lục và dấu trang cũ): không mở ngăn kéo, không lỗi, bỏ `nv`, bảng vẫn đủ 10 dòng. Test ở Task 4.
3. **Dòng đã chọn bị bộ lọc che:** không tính vào "Đã chọn n", không vào file xuất, vẫn còn chọn khi bỏ lọc. Test ở Task 3.
4. **Đi tới người cuối bằng "Người sau":** nút tắt, focus sang "Người trước" chứ không rơi về `body`. Escape trả focus về tên đã mở. Test ở Task 4.
5. **Màn 375px:**
   - trang không cuộn ngang; bảng cuộn trong vùng riêng nhận focus và phím mũi tên;
   - ngăn kéo cách mép 16px, liên kết "Xem chấm công" ở chân vẫn thấy.
   - Test ở Task 1 và Task 4.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `web/src/mock/staff.ts` (mới) | 10 người, thẻ chỉ số, hồ sơ, `tenure`; `staffListView`, `staffProfile` |
| `web/src/services/admin-hr.ts` (viết lại) | `getStaffList`, `getStaffProfile` qua `respond()` |
| `web/src/views/admin/staff/StaffView.vue` (viết lại) | Màn I: tải dữ liệu, tìm, công tắc, chọn, xuất, `?q`, `?nv`, người trước / sau |
| `web/src/views/admin/staff/staffFilter.ts` (mới) | Lọc thuần: tìm bỏ dấu + công tắc |
| `web/src/views/admin/staff/staffCsv.ts` (mới) | Dựng và tải CSV |
| `web/src/views/admin/staff/parts/StaffStats.vue` (mới) | 4 thẻ chỉ số |
| `web/src/views/admin/staff/parts/StaffToolbar.vue` (mới) | Ô tìm, công tắc, "Đã chọn n", nút xuất |
| `web/src/views/admin/staff/parts/StaffTable.vue` (mới) | Bảng 6 cột + ô chọn, dòng trống |
| `web/src/views/admin/staff/parts/StatusPill.vue` (mới) | Nhãn trạng thái dùng chung bảng và ngăn kéo |
| `web/src/views/admin/staff/StaffDrawer.vue` (mới) | Ngăn kéo hồ sơ I2 |
| `web/src/design-index/admin-attendance.ts` | 3 dòng Nhân sự (Task 4) |
| `web/tests/admin-staff.spec.ts` (mới) | Test màn I và I2 |
| `web/tests/admin-workflows.spec.ts` | Bỏ 3 test Nhân sự cũ |

Xoá ở Task 1: `views/admin/staff/AddStaffDialog.vue`, `BulkShiftDialog.vue`, `ProfileDrawer.vue`, `StaffTrace.vue`, `web/src/builders/admin-hr/staff.ts` (cả thư mục `builders/admin-hr/`).

Giữ, không sửa: `views/admin/staff/fields/FldInput.vue`, `FldSelect.vue` (Chấm công còn import, spec R2).

## Rulings của plan

Spec mục 9 đã ghi phán quyết của thiết kế. Dưới đây chỉ là phán quyết mới của plan.

- Ruling: tên ở Task 1–3 là chữ thường (`span.nn`); Task 4 đổi thành `RouterLink` cùng class `nn`. — Lý do: không để liên kết chưa làm gì giữa các task. — Rủi ro nếu sai: không có.
- Ruling: file test là `admin-staff.spec.ts`. — Lý do: `staff-ux.spec.ts` là test của cổng nhân viên. — Rủi ro nếu sai: không có.
- Ruling: dữ liệu giả chỉ được kiểm qua giao diện. Không gọi thẳng module mock (không `inApp`, không import phía Node). — Lý do: fixture `tests/fixtures/in-app.ts` do plan chuông tạo, plan Bảng lương nhập thẳng file TS phía Node. Thêm cách thứ ba hay tạo trùng file đều gây xung đột, mà 10 dòng kiểm qua màn là đủ. — Rủi ro nếu sai: lỗi dữ liệu hiện ra ở test giao diện, khó chỉ đúng chỗ hơn.
- Ruling: Task 3 thêm cột ô chọn. Ô đầu cột của nó không có chữ, nên test tên cột của Task 1 (lọc chữ rỗng) vẫn đúng. — Lý do: không đặt ô chọn trước khi có việc. — Rủi ro nếu sai: sửa một dòng test.
- Ruling: tìm bỏ dấu dùng `fold` sẵn có của `builders/admin-attendance/common.ts`, rồi `.trim()`. — Lý do: không viết hàm bỏ dấu thứ ba; `utils/format.ts` đang bị hai plan kia sửa. — Rủi ro nếu sai: sau khi gộp đổi sang `foldText`.
- Ruling: `StaffDrawer` tự tải hồ sơ theo prop `id`. `<aside>` và phần đầu (h2, ba nút) luôn được dựng; thân và chân hiện khi có dữ liệu. — Lý do: đổi người thì ngăn kéo giữ nguyên, focus không mất; `registerOverlayFocus` focus phần tử bấm được đầu tiên ngay lúc đăng ký, nên ba nút phải có sẵn (spec 3.2). — Rủi ro nếu sai: không có.
- Ruling: dòng đã chọn giữ nền `--gold-pale` cả khi rê chuột; luật rê chuột (`--raised`) chỉ áp cho dòng chưa chọn. — Lý do: spec 2.3 nêu hai nền mà không nói khi trùng nhau; vừa bấm ô chọn thì chuột còn trên dòng, nền phải cho thấy đã chọn. — Rủi ro nếu sai: đổi một bộ chọn CSS.

## Xung đột khi gộp

Cột "Plan chuông" và "Plan Bảng lương" chép theo hai plan đó lúc viết.

| File | Plan này sửa | Plan chuông và chấm công | Plan Bảng lương | Khi gộp giữ |
|------|--------------|--------------------------|-----------------|-------------|
| `web/src/design-index/admin-attendance.ts` | Dòng 16–18: bỏ `ns-chua-co-ca`, `dlg-ns-them`; thay `drw-ns-sua-ho-so` bằng `drw-ns-ho-so` (Task 4) | Không sửa | Bỏ hai dòng KPI (dòng 19–20, sát bên) | Dòng Nhân sự của plan này, không có hai dòng KPI |
| `web/tests/admin-workflows.spec.ts` | Bỏ 3 test Nhân sự và tuỳ chọn `staffStatus` (Task 1) | Không sửa | Không sửa | Bản của plan này |
| `web/src/router/routes/admin-attendance.ts` | Không sửa; route `/admin/nhan-su` giữ nguyên | Viết lại Chấm công; `ca-lam` vẫn chuyển tới `/admin/nhan-su?loc=chua-co-ca` | Bỏ khối `/admin/kpi` | Khối `/admin/nhan-su` như gốc. `loc` không còn tác dụng, lead có thể bỏ `loc` khỏi `ca-lam` |
| `web/src/views/admin/staff/fields/` | Giữ (spec R2) | Xoá `BulkPunchDialog.vue`, viết lại `DayDetailDialog.vue` | — | Sau khi gộp, `grep -rn "staff/fields" web/src` rỗng thì xoá thư mục |
| `views/admin/attendance/PagerBar.vue`, `SearchBox.vue`, `useHop.ts` | Nhân sự thôi import | Giữ, ghi "Nhân sự dùng" | Xoá màn KPI (người dùng còn lại) | Sau khi gộp, grep; không còn ai import thì xoá |
| `views/admin/staff/StaffDrawer.vue` (`attendanceTo`) | Dựng `/admin/cham-cong/nhan-vien/<id>` tại chỗ | Thêm `employeePath(id)` vào `views/admin/attendance/links.ts` và route hồ sơ | — | Đổi sang `employeePath(id)`, giữ `thang` |
| `views/admin/staff/staffFilter.ts` (`fold`) | Dùng `fold` của `builders/admin-attendance/common.ts` | Giữ `common.ts` | Thêm `foldText` (có `trim`) vào `utils/format.ts` | Có thể đổi sang `foldText` |
| `views/admin/staff/staffCsv.ts` | Hàm CSV riêng | — | `views/admin/payroll/payrollCsv.ts`, cùng định dạng | Giữ hai file, hoặc tách `csvCell` dùng chung |
| `StaffDrawer.vue` và `AppDrawer` | Ngăn kéo riêng 480px, không bóng | — | `AppDrawer` thêm prop `floating`, cố định 540px | Giữ riêng, hoặc cho `floating` nhận bề rộng rồi chuyển |
| `web/src/mock/staff.ts` | 10 người theo bảng I, id chữ | `mock/attendance.ts`: 11 người, mã khác | `mock/payroll.ts`: 10 phiếu, mã khác | Lead đối chiếu theo id chữ (trùng cho 7 người). Mã lệch là câu hỏi 7 của spec. Hoàng Thị Mai, Phan Minh Khoa, Đặng Văn Phúc chưa có hồ sơ chấm công (câu hỏi 13) |

Việc của lead sau khi gộp:

- Bấm "Xem chấm công" của Lê Hoàng Nam: phải mở đúng hồ sơ chấm công.
- Chạy lại toàn bộ `npm --prefix web run test:ui` trên nhánh đã gộp.

---

### Task 1: Dữ liệu giả, service và màn danh sách (chưa tìm, chưa chọn, chưa ngăn kéo)

**Files:**

- Create: `web/src/mock/staff.ts`, `web/src/views/admin/staff/parts/StaffStats.vue`, `parts/StaffTable.vue`, `parts/StatusPill.vue`, `web/tests/admin-staff.spec.ts`
- Modify: `web/src/services/admin-hr.ts` (viết lại toàn bộ), `web/src/views/admin/staff/StaffView.vue` (viết lại toàn bộ), `web/tests/admin-workflows.spec.ts`
- Delete: `web/src/views/admin/staff/AddStaffDialog.vue`, `BulkShiftDialog.vue`, `ProfileDrawer.vue`, `StaffTrace.vue`, `web/src/builders/admin-hr/staff.ts`

**Interfaces:**

- Consumes: `respond` (`mock/respond.ts`); `MOCK_TODAY` (`mock/clock.ts`); `initials`, `dmy` (`utils/format.ts`); `useLoad`.
- Produces:
  - `mock/staff.ts`: các kiểu `StaffStatus`, `StaffRow`, `StaffStat`, `StaffListView`, `StaffFact`, `StaffProfile` đúng spec mục 1.1; `STATUS_LABEL: Record<StaffStatus, string>`; `tenure(from: string, to: string): string`; `staffListView(): StaffListView`; `staffProfile(id: string): StaffProfile | null`. Chỉ import tương đối (`./clock`, `./respond` nếu cần, `../utils/format`).
  - `services/admin-hr.ts`: `getStaffList(): Promise<StaffListView>`, `getStaffProfile(id: string): Promise<StaffProfile | null>`. Không còn export nào khác.
  - `StatusPill.vue`: props `status: StaffStatus`, `label: string`; gốc là `span.stt`, chấm là `i.d-<status>` có `aria-hidden`.
  - `StaffStats.vue`: prop `stats: StaffStat[]`; mỗi thẻ là `article.kc` (thêm `dk` khi `dark`), số trong `.kc-v`, đơn vị trong `.kc-v small`, phần tăng giảm trong `.kc-d`.
  - `StaffTable.vue`: prop `rows: StaffRow[]`; vùng cuộn là `div[role=region]` tên "Bảng danh sách nhân sự"; tên trong `.nn`; dòng `out` có class `gone`. Task 2, 3, 4 mở rộng file này.
  - `StaffView.vue`: phần tử gốc `div.staff`.

- [ ] **Step 1: Viết `web/tests/admin-staff.spec.ts`**

Helper đầu file (dùng cho mọi task):

```ts
import { expect, test, type Page } from '@playwright/test';

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}
const NAMES = ['Nguyễn Thu Hà', 'Trần Minh Quân', 'Lê Hoàng Nam', 'Phạm Ngọc Anh', 'Võ Đức Thịnh',
  'Đỗ Mai Linh', 'Bùi Quốc Huy', 'Hoàng Thị Mai', 'Phan Minh Khoa', 'Đặng Văn Phúc'];
const table = (page: Page) => page.getByRole('region', { name: 'Bảng danh sách nhân sự' });
const rows = (page: Page) => table(page).locator('tbody tr');
const names = (page: Page) => table(page).locator('tbody .nn');
const row = (page: Page, name: string) => rows(page).filter({ has: page.locator('.nn', { hasText: name }) });
const stat = (page: Page, label: string) =>
  page.getByRole('region', { name: 'Chỉ số nhân sự' }).getByRole('article', { name: label });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});
```

"`names` bằng mảng X" trong mọi task nghĩa là `await expect(names(page)).toHaveText(X)` (tự chờ, đúng số phần tử và thứ tự); mảng rỗng là `toHaveCount(0)`.

Các test (khung 1440×900 trừ khi ghi khác; `goto('/admin/nhan-su')`):

- `staff list follows board I without calling /api`:
  - `calls = trackApi(page)` trước `goto`; cuối test `calls` là `[]`;
  - heading level 1 "Nhân sự"; `getByRole('tablist')` đếm 0;
  - các nút tên "Nhập từ Excel", "Thêm nhân sự", "Bộ lọc", "Gán ca", "Đổi phòng ban", "Trang trước", "Trang sau", "Sửa hồ sơ" và nút /^Cách tính/ đều đếm 0;
  - region "Chỉ số nhân sự" có 4 `article`:
    - `stat('Nhân sự đang làm')` chứa "128", "người", "Tăng", "4", "so với tháng 9";
    - `stat('Vào làm tháng 10')` chứa "6", "Tăng", "2";
    - `stat('Nghỉ việc tháng 10')` chứa "2", "Giảm", "1", "so với tháng 9";
    - `stat('Thâm niên trung bình')` chứa "3,2", "năm", "0,3 năm", "so với năm 2025";
  - `getByRole('region', { name: 'Danh sách nhân sự', exact: true })` (không `exact` thì khớp cả "Bảng danh sách nhân sự") chứa heading "Danh sách nhân sự" và "131 hồ sơ";
  - `names` bằng `NAMES`; chữ "Hiển thị 1–10 trong 131 hồ sơ" hiện;
  - `row('Đặng Văn Phúc')` có class /gone/;
  - `row(x).locator('.stt')` có chữ: Lê Hoàng Nam "Chính thức", Đỗ Mai Linh "Thử việc", Hoàng Thị Mai "Tạm nghỉ", Đặng Văn Phúc "Đã nghỉ việc";
  - `row('Đỗ Mai Linh').locator('[title="Chưa kích hoạt tài khoản"]')` hiện, chứa "linh.do@gft.vn" và chữ ẩn ", chưa kích hoạt tài khoản";
  - `row('Lê Hoàng Nam').locator('[title="Đã kích hoạt tài khoản"]')` chứa "nam.le@gft.vn".
- `each cell holds one value on one line under six named columns`:
  - `table.locator('thead th').allTextContents()`, `trim`, bỏ chuỗi rỗng, bằng `['Nhân viên', 'Email', 'Phòng ban', 'Chức danh', 'Trạng thái', 'Ngày vào làm']`;
  - mọi `tbody th, tbody td` có `getComputedStyle(el).whiteSpace === 'nowrap'`;
  - `row('Lê Hoàng Nam')` chứa "nam.le@gft.vn", "Kinh doanh", "Nhân viên kinh doanh", "04/03/2024";
  - `table` không chứa "GFT-", "Bậc", "năm", "08:00" (mã, bậc, thâm niên, ca không có trong danh sách).
- Vòng `for (const width of [375, 768, 1024, 1440])`: `staff table scrolls inside its own region at ${width}px` (Review Focus 5):
  - `setViewportSize({ width, height: 900 })`;
  - `table` có `tabindex="0"`;
  - `document.documentElement.scrollWidth <= innerWidth`;
  - dưới 1440: `scrollWidth > clientWidth` của `table`; `table.focus()`, nhấn ArrowRight, `expect.poll(scrollLeft)` lớn hơn 0;
  - ở 1440: `scrollWidth <= clientWidth`.
- `staff screen has one dark card and no shadows`:
  - `page.locator('.kc.dk')` đếm 1 và là `stat('Nhân sự đang làm')`; nền `rgb(28, 28, 28)`; `.kc-v` màu `rgb(232, 195, 114)`;
  - 3 thẻ còn lại nền `rgb(255, 255, 255)`;
  - mọi phần tử trong `.staff` có `box-shadow` là `none`.

- [ ] **Step 2: Bỏ 3 test Nhân sự cũ trong `web/tests/admin-workflows.spec.ts`** (spec mục 6.2)

Bỏ `staff profile opens from a real link and the wide table stays inside a keyboard-scroll region`, `staff issue filter is reproducible from the URL and switches on click`, `staff access error offers retry and is not shown as an empty list`. Bỏ tuỳ chọn `staffStatus` khỏi kiểu và thân `mockAdminApi`. Giữ mảng `staff`, `mockAdminApi` và hai test `fixme` của Yêu cầu.

- [ ] **Step 3: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- admin-staff`
Expected: FAIL, vì màn cũ không có region "Chỉ số nhân sự" và "Bảng danh sách nhân sự".

- [ ] **Step 4: Viết `mock/staff.ts` và `services/admin-hr.ts`**

- Dữ liệu đúng spec mục 1.2–1.4. `joined` dạng ISO.
- Fact "Ngày vào làm" = `${dmy(joined)} · ${tenure(joined, MOCK_TODAY)}`; với `out` chỉ `dmy(joined)`.
- `tenure` theo thuật toán ở spec mục 1.3. Khoảng ngày khi dưới 1 tháng = `Math.round((to − from) / 86400000)`.
- `staffProfile` dựng 3 nhóm theo đúng thứ tự dòng ở spec mục 1.3.

- [ ] **Step 5: Viết `StatusPill`, `StaffStats`, `StaffTable` và `StaffView`; xoá các file ở mục Delete**

- Hình và câu chữ theo spec mục 2.1–2.3, 2.6, 2.7. Chưa có hàng công cụ, chưa có cột ô chọn.
- `StaffView`: `useLoad(() => getStaffList())`; render khi có `data`; không có trạng thái lỗi.
- `.title` cho h1 như các màn khác.
- `StaffTable`:
  - `<colgroup>` theo spec R22, ô chọn để trống chỗ 48px tới Task 3;
  - avatar `.av` 32px nền `--gold-light`, chữ 12px/600;
  - dấu kích hoạt là SVG nội tuyến 16px (không thêm vào `icons.ts`).
- Chân thẻ: `Hiển thị 1–${rows.length} trong ${total} hồ sơ`.
- Sau khi xoá: `grep -rn "admin-hr/staff\|AddStaffDialog\|BulkShiftDialog\|ProfileDrawer\|StaffTrace\|getLeaveBalances\|getEmployeeTrace" web/src` rỗng.

- [ ] **Step 6: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- admin-staff admin-workflows`
Expected: PASS hết (7 test của `admin-staff`). Rồi `npm --prefix web run test:ui`: 0 failed, 45 skipped.

- [ ] **Step 7: Commit**

```bash
git add web/src/mock/staff.ts web/src/services/admin-hr.ts web/src/views/admin/staff web/src/builders/admin-hr web/tests/admin-staff.spec.ts web/tests/admin-workflows.spec.ts
git commit -m "feat(web): staff list on mock data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Tìm theo tên, mã, email và công tắc "Chưa kích hoạt tài khoản"

**Files:**

- Create: `web/src/views/admin/staff/staffFilter.ts`, `web/src/views/admin/staff/parts/StaffToolbar.vue`
- Modify: `StaffView.vue`, `parts/StaffTable.vue`, `web/tests/admin-staff.spec.ts` (thêm test cuối file)

**Interfaces:**

- Consumes: `StaffRow`, `StaffListView` (Task 1); `fold` (`builders/admin-attendance/common.ts`).
- Produces:
  - `staffFilter.ts`: `filterStaff(rows: StaffRow[], opts: { q: string; inactiveOnly: boolean }): StaffRow[]` (khớp `fold(name|code|email)` chứa `fold(q).trim()`; giữ thứ tự) và `isFiltered(opts: { q: string; inactiveOnly: boolean }): boolean`.
  - `StaffToolbar.vue`: `v-model:q` (string), `v-model:inactive-only` (boolean), prop `inactiveCount: number`. Task 3 thêm prop và emit.
  - `StaffTable.vue`: khi `rows` rỗng hiện dòng trống `td[colspan="7"].empty`.
  - `StaffView.vue`: `shown = computed<StaffRow[]>`, dùng cho bảng và (Task 3, 4) cho chọn và người trước / sau.

- [ ] **Step 1: Thêm test** (`box = page.getByRole('searchbox', { name: 'Tìm theo tên, mã hoặc email' })`, `sw = page.getByRole('switch', { name: /Chưa kích hoạt tài khoản/ })`)

- `search matches name, code and email without diacritics or extra spaces` (Review Focus 1):
  - `box` có `placeholder` "Tìm tên, mã, email…";
  - mỗi cặp: `box.fill(x)` rồi `names` bằng mảng:

    | `x` | `names` | Chân thẻ |
    |-----|---------|----------|
    | `'  do mai '` | `['Đỗ Mai Linh']` | "1 kết quả trên trang này" |
    | `'hoang'` | `['Lê Hoàng Nam', 'Hoàng Thị Mai']` | "2 kết quả trên trang này" |
    | `'GFT-0118'` | `['Hoàng Thị Mai']` | |
    | `'phuc.dang'` | `['Đặng Văn Phúc']` | |
    | `'dang'` | `['Đặng Văn Phúc']` | |
    | `'tai chinh'` | `[]` | "0 kết quả trên trang này", kèm chữ "Không có nhân sự nào khớp bộ lọc trên trang này." |
    | `'   '` | `NAMES` | "Hiển thị 1–10 trong 131 hồ sơ" |

- `topbar search opens the list with q and the query survives a reload`:
  - `goto('/admin/tong-quan')`; `getByLabel('Tìm nhân viên')` điền "Quân", Enter;
  - URL khớp `/\/admin\/nhan-su\?q=Qu%C3%A2n/`; `box` có giá trị "Quân"; `names` `['Trần Minh Quân']`;
  - đang ở màn: ô thanh trên điền "linh", Enter → `box` "linh", `names` `['Đỗ Mai Linh']`;
  - `box.fill('nam')` → URL chứa `q=nam`; `reload()` → `box` "nam", `names` `['Lê Hoàng Nam']`;
  - `box.fill('')` → `toHaveURL('/admin/nhan-su')`, 10 dòng.
- `inactive switch keeps only accounts not yet activated`:
  - `sw` có `aria-checked="false"` và chứa "2";
  - bấm → `aria-checked="true"`, `names` `['Đỗ Mai Linh', 'Phan Minh Khoa']`, "2 kết quả trên trang này"; `sw` có `border-color` `rgb(28, 28, 28)`;
  - `box.fill('khoa')` → `['Phan Minh Khoa']`; `sw` vẫn chứa "2";
  - bấm `sw` → `false`, vẫn `['Phan Minh Khoa']`, "1 kết quả trên trang này";
  - `box.fill('')` → 10 dòng, "Hiển thị 1–10 trong 131 hồ sơ".

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- admin-staff`
Expected: FAIL ở 3 test mới, vì chưa có ô tìm và công tắc.

- [ ] **Step 3: Cài theo spec mục 2.3 (hàng công cụ) và 2.4**

- `StaffView`:
  - `q` khởi tạo từ `route.query.q` khi là chuỗi;
  - `watch(() => route.query.q)` cập nhật `q` khi khác;
  - `watch(q)` gọi `router.replace({ query: { ...route.query, q: q || undefined } })` khi khác URL.
  - `inactiveOnly` là state cục bộ.
- Chân thẻ: `isFiltered` thì `${shown.length} kết quả trên trang này`, không thì câu của Task 1.
- `inactiveCount` = số dòng `!activated` của `data.rows`.
- `StaffToolbar`:
  - ô tìm là `<label>` bọc icon `search` và `<input type="search">`;
  - công tắc là `<button type="button" role="switch">` có `span.sw > i`, chữ, `span.ct`;
  - media `max-width: 767px`: ô tìm `flex-basis: 100%`.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- admin-staff admin-shell`
Expected: PASS hết, gồm `search opens the staff list with q` của `admin-shell`.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/staff web/tests/admin-staff.spec.ts
git commit -m "feat(web): staff search and inactive-account switch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Chọn nhiều dòng và xuất CSV

**Files:**

- Create: `web/src/views/admin/staff/staffCsv.ts`
- Modify: `StaffView.vue`, `parts/StaffTable.vue` (cột ô chọn), `parts/StaffToolbar.vue` (vùng "Đã chọn n", nút xuất), `web/tests/admin-staff.spec.ts`

**Interfaces:**

- Consumes: `StaffRow`, `shown` (Task 1, 2).
- Produces:
  - `staffCsv.ts`:
    - `csvCell(value: string): string`: bọc ngoặc kép khi có `;`, `"` hoặc xuống dòng; `"` thành `""`;
    - `staffCsv(rows: StaffRow[]): string`: BOM `\ufeff` + dòng tiêu đề + mỗi dòng một người; mọi dòng kết thúc `\r\n`;
    - `downloadStaffCsv(rows: StaffRow[]): void`: `Blob` kiểu `text/csv;charset=utf-8`, `<a download="danh-sach-nhan-su.csv">`, `URL.revokeObjectURL` sau khi bấm.
  - `StaffTable.vue`:
    - thêm prop `selected: string[]`; emits `toggle: [id: string]`, `toggle-all: []`;
    - trạng thái ô đầu cột tính trong bảng từ `rows` và `selected`;
    - dòng đã chọn có class `on`.
  - `StaffToolbar.vue`: thêm prop `selectedCount: number` (= số dòng đang hiện và đã chọn), emit `export: []`; vùng "Đã chọn n" là `div.selb[aria-live="polite"]`.

- [ ] **Step 1: Thêm test** (`pick = (page, name) => page.getByRole('checkbox', { name: \`Chọn ${name}\` })`, `all = page.getByRole('checkbox', { name: 'Chọn tất cả dòng đang hiện' })`)

Helper xuất:

```ts
import fs from 'node:fs';
async function exportCsv(page: Page, name: string) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  expect(dl.suggestedFilename()).toBe('danh-sach-nhan-su.csv');
  return fs.readFileSync(await dl.path(), 'utf8');
}
```

- `selecting rows counts them, tints them and labels the export`:
  - `all` có `aria-checked="false"`; `page.locator('.selb[aria-live="polite"]')` đếm 1 và rỗng;
  - bấm `pick('Lê Hoàng Nam')` → `aria-checked="true"`; chuột còn trên dòng, `row('Lê Hoàng Nam').locator('th')` nền `rgb(255, 249, 236)` (ruling rê chuột); chữ "Đã chọn 1"; `all` `mixed`; có nút "Xuất 1 người đã chọn ra Excel";
  - nút "Gán ca", "Đổi phòng ban" đếm 0;
  - bấm lại → `false`; `getByText(/^Đã chọn/)` đếm 0; có nút "Xuất danh sách ra Excel".
- `select all follows the rows on screen and hidden picks are kept but not counted` (Review Focus 3):
  - bật công tắc; bấm `all` → `true`, "Đã chọn 2";
  - tắt công tắc → 10 dòng, `all` `mixed`, "Đã chọn 2";
  - tìm "nam" → `all` `false`; `getByText(/^Đã chọn/)` đếm 0; nút "Xuất danh sách ra Excel";
  - xoá ô tìm → "Đã chọn 2"; `pick('Đỗ Mai Linh')` `true`;
  - bấm `all` (đang `mixed`) → `true`, "Đã chọn 10"; bấm lại → `false`, không còn "Đã chọn".
- `export downloads the shown or the selected rows as CSV`:
  - `t = exportCsv(page, 'Xuất danh sách ra Excel')`:
    - `t.charCodeAt(0)` là `0xfeff`;
    - `lines = t.slice(1).split('\r\n')` dài 12 (tiêu đề, 10 dòng, chuỗi rỗng cuối);
    - `lines[0]` là `'Mã;Họ tên;Email;Phòng ban;Chức danh;Trạng thái;Ngày vào làm;Tài khoản'`;
    - `lines[1]` là `'GFT-0108;Nguyễn Thu Hà;thuha.nguyen@gft.vn;Tài chính;Kế toán tổng hợp;Chính thức;12/03/2021;Đã kích hoạt'`;
    - `lines[6]` là `'GFT-0201;Đỗ Mai Linh;linh.do@gft.vn;Marketing;Thiết kế đồ hoạ;Thử việc;01/09/2026;Chưa kích hoạt'`;
  - chọn Lê Hoàng Nam và Hoàng Thị Mai; `exportCsv(page, 'Xuất 2 người đã chọn ra Excel')` → 4 phần tử sau khi tách; `lines[1]` bắt đầu `'GFT-0142;Lê Hoàng Nam;'`, `lines[2]` bắt đầu `'GFT-0118;Hoàng Thị Mai;'`;
  - bỏ chọn cả hai, bật công tắc; `exportCsv(page, 'Xuất danh sách ra Excel')` → đúng 2 dòng số liệu, Đỗ Mai Linh rồi Phan Minh Khoa.

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- admin-staff`
Expected: FAIL ở 3 test mới, vì chưa có ô chọn và nút xuất.

- [ ] **Step 3: Cài theo spec mục 2.3 (ô chọn, vùng "Đã chọn", nút xuất) và 2.5**

- `StaffView`:
  - `selected = ref<string[]>([])`;
  - `picked = computed(() => shown.value.filter(r => selected.value.includes(r.id)))`;
  - `toggle-all`: mọi dòng `shown` đã chọn thì bỏ chúng khỏi `selected`, không thì thêm các dòng `shown` còn thiếu;
  - `export`: `downloadStaffCsv(picked.length ? picked : shown)`.
- Ô chọn là `<button type="button" role="checkbox">` với `aria-checked` `'true' | 'false' | 'mixed'`; hình theo spec mục 2.3.
- Nền dòng `on`: `--gold-pale` cho mọi ô của dòng, cả khi rê chuột.
- `.selb` luôn có trong DOM, chữ `Đã chọn ${selectedCount}` khi > 0.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- admin-staff`
Expected: PASS hết (13 test).

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/staff web/tests/admin-staff.spec.ts
git commit -m "feat(web): pick staff rows and export them as CSV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Ngăn kéo hồ sơ (I2), liên kết tên, người trước / sau, mục lục thiết kế

**Files:**

- Create: `web/src/views/admin/staff/StaffDrawer.vue`
- Modify: `StaffView.vue`, `parts/StaffTable.vue` (tên thành liên kết), `web/src/design-index/admin-attendance.ts` (dòng 16–18), `web/tests/admin-staff.spec.ts`

**Interfaces:**

- Consumes: `getStaffProfile`, `StaffProfile` (Task 1); `StatusPill` (Task 1); `shown` (Task 2); `registerOverlayFocus`, `lockScroll`, `unlockScroll` (`components/ui/overlay-lock`); `Icon` (`chevl`, `chevr`, `x`); `useLoad`.
- Produces:
  - `StaffDrawer.vue`:
    - props `id: string`, `hasPrev: boolean`, `hasNext: boolean`; emits `close: []`, `prev: []`, `next: []`;
    - `useLoad(() => getStaffProfile(props.id), () => props.id)`;
    - `<aside>` tên đọc `Hồ sơ của ${name}` khi có hồ sơ, "Hồ sơ nhân sự" khi chưa; phần đầu (h2 và ba nút) dựng ngay, không chờ dữ liệu;
    - mỗi dòng hồ sơ là `div.fr > dt + dd` trong `<dl>`; ghi chú nghỉ là `.nt`;
    - `attendanceTo(id)` = `{ path: \`/admin/cham-cong/nhan-vien/${id}\`, query: thang ? { thang } : {} }`, `thang` đọc từ `route.query`.
  - `StaffTable.vue`: tên là `RouterLink` class `nn`, `:to="{ query: { ...route.query, nv: row.id } }"`, `replace`.
  - `StaffView.vue`:
    - `openId = computed(() => (typeof route.query.nv === 'string' ? route.query.nv : ''))`;
    - `navIds = ref<string[]>([])`;
    - `hasPrev = idx > 0`, `hasNext = idx >= 0 && idx < navIds.length − 1`.

- [ ] **Step 1: Thêm test** (`drawer = (page, name) => page.getByRole('dialog', { name: \`Hồ sơ của ${name}\` })`; `fact = (d, label) => d.locator('.fr', { has: page.getByText(label, { exact: true }) }).locator('dd')`)

- `a name opens Hoàng Thị Mai's profile as on board I2`:
  - bấm `getByRole('link', { name: 'Hoàng Thị Mai', exact: true })` → `toHaveURL('/admin/nhan-su?nv=hoang-thi-mai')`;
  - `d = drawer('Hoàng Thị Mai')` có heading "Hồ sơ nhân sự", chứa "GFT-0118 · Kế toán viên"; `d.locator('.stt')` "Tạm nghỉ";
  - `d.locator('.nt')` chứa "Nghỉ thai sản" và "15/09/2026 – 15/03/2027 · đi làm lại 16/03/2027";
  - heading level 3 trong `d` là `['Công việc', 'Hợp đồng', 'Tài khoản']`;
  - `fact` bằng: Phòng ban "Tài chính", Chức danh "Kế toán viên", Loại · bậc "NV · Bậc 2", Quản lý trực tiếp "Nguyễn Thu Hà", Ca làm "Hành chính · 08:00–17:00", Ngày vào làm "02/05/2022 · 4 năm 5 tháng", Loại hợp đồng "HĐLĐ không xác định thời hạn", Đóng bảo hiểm "Có", Người phụ thuộc "1", Email "mai.hoang@gft.vn", Kích hoạt "Đã kích hoạt";
  - liên kết "Xem chấm công" có `href` `/admin/cham-cong/nhan-vien/hoang-thi-mai`; nút "Sửa hồ sơ" đếm 0;
  - `d` có `border-radius` `24px`, `box-shadow` `none`; hộp rộng 480 ±1, `x + width` = 1424 ±1;
  - Escape → `d` đếm 0; `toHaveURL('/admin/nhan-su')`; liên kết "Hoàng Thị Mai" được focus.
- `other profiles show their own values and a dash where no board gives one`:
  - `goto('/admin/nhan-su?nv=le-hoang-nam')`;
  - `d` chứa "GFT-0142 · Nhân viên kinh doanh"; `.nt` đếm 0;
  - `fact`: Loại · bậc "NV · Bậc 2", Quản lý trực tiếp "—", Ca làm "Hành chính · 08:00–17:00", Ngày vào làm "04/03/2024 · 2 năm 7 tháng", Loại hợp đồng "HĐLĐ từ 3 tháng", Người phụ thuộc "0", Kích hoạt "Đã kích hoạt";
  - bấm lớp nền (`page.mouse.click(200, 450)`) → ngăn kéo đóng;
  - bấm liên kết "Phan Minh Khoa" → Ngày vào làm "26/10/2026 · 2 ngày", Loại · bậc "—", Kích hoạt "Chưa kích hoạt";
  - "Người sau" → `drawer('Đặng Văn Phúc')`: Ngày vào làm đúng "11/11/2019" (`toHaveText`); `.stt` "Đã nghỉ việc";
  - `goto('/admin/nhan-su?thang=2026-10&nv=le-hoang-nam')` → "Xem chấm công" có `href` `/admin/cham-cong/nhan-vien/le-hoang-nam?thang=2026-10`.
- `previous and next walk the rows shown when the drawer opened` (Review Focus 4):
  - mở Lê Hoàng Nam, bấm "Người sau" → URL chứa `nv=pham-ngoc-anh`, `drawer('Phạm Ngọc Anh')` hiện, nút "Người sau" được focus;
  - Escape; mở Nguyễn Thu Hà → "Người trước" disabled;
  - Escape; mở Hoàng Thị Mai → "Người sau" hai lần → `drawer('Đặng Văn Phúc')`; "Người sau" disabled; "Người trước" được focus;
  - Escape; bật công tắc; mở Đỗ Mai Linh → "Người trước" disabled; "Người sau" → `drawer('Phan Minh Khoa')`; "Người sau" disabled.
- `drawer links survive a reload and stale ones are dropped` (Review Focus 2):
  - `goto('/admin/nhan-su?q=nam&nv=le-hoang-nam')` → `drawer('Lê Hoàng Nam')`; `reload()` → vẫn hiện; `names` `['Lê Hoàng Nam']`; "Người trước" và "Người sau" đều disabled;
  - `goto('/admin/nhan-su?thang=2026-10&nv=khong-co')` → `toHaveURL('/admin/nhan-su?thang=2026-10')`; `getByRole('dialog')` đếm 0; 10 dòng;
  - `goto('/admin/nhan-su?hop=sua-ho-so&nv=linh')` → `getByRole('dialog')` đếm 0; URL không chứa `nv=`; 10 dòng.
- `keyboard opens the drawer from a name and it fits 375px` (thay ý của test `fixme` cũ; Review Focus 5):
  - khung 375×812; `getByRole('link', { name: 'Lê Hoàng Nam', exact: true }).focus()`, Enter → `drawer('Lê Hoàng Nam')` hiện;
  - hộp `x` = 16 ±1, `width` = 343 ±1;
  - `document.documentElement.scrollWidth <= innerWidth`;
  - liên kết "Xem chấm công" `toBeInViewport()`.
- `design index lists the profile drawer instead of the old staff dialogs`:
  - `goto('/thiet-ke')`;
  - liên kết "Ngăn kéo Hồ sơ nhân sự · Hoàng Thị Mai" có `href` `/admin/nhan-su?nv=hoang-thi-mai`;
  - liên kết "Hộp Thêm nhân sự", "Ngăn kéo Sửa hồ sơ", "Nhân sự · Lọc chưa có ca" đếm 0.

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- admin-staff`
Expected: FAIL ở 6 test mới, vì tên chưa là liên kết và chưa có ngăn kéo.

- [ ] **Step 3: Cài theo spec mục 3 và mục 5**

- `StaffView`:
  - render `<StaffDrawer v-if="openId && valid" :id="openId" …>`, với `valid` = `data.rows` có `openId`. Không đặt `:key` theo id, để đổi người không dựng lại ngăn kéo;
  - `watch([data, openId])`: dữ liệu đã tải mà `openId` không có trong `data.rows` thì `router.replace` bỏ `nv`, giữ các khoá khác;
  - `navIds`:
    - `openId` khác rỗng, dữ liệu đã tải và `navIds` chưa có `openId` thì `navIds = shown.map(r => r.id)`;
    - `openId` rỗng thì `navIds = []`;
  - `prev` / `next`: `router.replace` sang id kề bên; `close`: `router.replace` bỏ `nv`.
- `StaffDrawer`:
  - `onMounted`: `lockScroll()`, rồi `registerOverlayFocus(aside, () => emit('close'), () => true)`;
  - `onBeforeUnmount`: gỡ đăng ký, `unlockScroll()`;
  - lớp nền `@click="emit('close')"`;
  - `watch([() => props.hasPrev, () => props.hasNext])` + `nextTick`: nút đang giữ focus bị tắt thì focus nút còn lại;
  - CSS theo spec 3.2–3.3; media `max-width: 767px`: `left: 16px; right: 16px; width: auto`.
- `StaffTable`: đổi `span.nn` thành `RouterLink` (Interfaces).
- `design-index/admin-attendance.ts`: đúng spec mục 5. Chỉ sửa dòng 16–18, không đụng dòng khác.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- admin-staff admin-overlays admin-shell`
Expected: PASS hết (19 test của `admin-staff`). Rồi `npm --prefix web run test:ui`: 0 failed, 58 passed, 45 skipped.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/staff web/src/design-index/admin-attendance.ts web/tests/admin-staff.spec.ts
git commit -m "feat(web): staff profile drawer from board I2" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Xác minh cuối (giai đoạn 6, sau review toàn nhánh)

| Lệnh | Kỳ vọng |
|------|---------|
| `npm --prefix web run test:ui` | 0 failed, 45 skipped. 58 passed nếu giữ đúng số test của plan: 40 − 1 (test Nhân sự cũ đang chạy) + 19 mới |
| `npm test` (thư mục gốc, cần PostgreSQL) | 24 pass, 0 fail, như mốc |
| `git diff --stat 4c1bf0d -- src migrations test spec` | rỗng |
| `git diff --stat 4c1bf0d -- web/src/views/admin/settings web/src/components web/src/mock/overview.ts web/src/mock/shell.ts web/src/services/admin-main.ts web/src/utils web/src/styles web/src/router web/tests/admin-shell.spec.ts web/tests/admin-overview.spec.ts` | rỗng (file của hai plan kia) |
| `grep -rn "api(\|fetch(" web/src/views/admin/staff web/src/services/admin-hr.ts web/src/mock/staff.ts` | rỗng |

Cuối cùng mở `/admin/nhan-su` ở 1440px và 375px, mở ngăn kéo của Hoàng Thị Mai, so với `staff.png` và `staff-detail.png`.
