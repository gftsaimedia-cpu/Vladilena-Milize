# Bảng lương gộp chấm KPI và phiếu lương từng người — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn Bảng lương (board G) và phiếu lương từng người (board H) chạy trên dữ liệu giả. Chấm 5 điểm KPI ngay trong phiếu; bỏ màn Đánh giá KPI.

**Architecture:**

- `web/src/mock/payroll-calc.ts` là bản tính của mockup, chỉ cài các luật đã chốt. `web/src/mock/payroll.ts` giữ 10 phiếu mẫu, phần còn lại của kỳ và trạng thái trong bộ nhớ. Tổng quan đọc số từ đó.
- `services/admin-payroll.ts` bọc mock bằng `respond()`. Riêng `previewPayslip` chạy đồng bộ, để phiếu đổi số ngay khi gõ.
- Màn `PayrollView.vue` tự đặt dải các bước dạng thẻ và chia thành `parts/` (ô số, hàng công cụ, bảng). Phiếu là `AppDrawer` dạng `floating`, chia thành `payslip/` (chấm công, tổng hợp lương, ô điểm, lịch sử).

**Tech Stack:** Vue 3.5 + Pinia + Vue Router 5, Vite 8, TypeScript chạy qua Vite, Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-04-admin-payroll-kpi-design.md](../specs/2026-11-04-admin-payroll-kpi-design.md)

**Chạy song song:**

- Plan này chạy trong worktree và nhánh riêng, cùng lúc với [2026-11-04-admin-bell-attendance.md](2026-11-04-admin-bell-attendance.md) (nhánh `feat/admin-bell-attendance`) và kế hoạch Nhân sự. Lead gộp các nhánh ở cuối.
- Gốc là HEAD của `claude/admin-ui-concept-6445c9`, tức `337374f`. So với `a45a3ba`, gốc này chỉ thêm tài liệu và `web/playwright.config.ts` đọc `PW_PORT`.
- Coi như chưa có thay đổi nào của hai plan kia.
- Các file dùng chung và cách gộp: xem mục "Xung đột khi gộp".

**Mốc trước khi sửa (đo 04/11/2026, mã giống `337374f`):**

- `npm --prefix web run test:ui`: 40 passed, 47 skipped, 0 failed.
- `npm test` (BE, thư mục gốc): 24 pass, 0 fail.

## Global Constraints

- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc. Không đọc và không trích thư mục `spec/` ở gốc.
- Không có `fetch(` trong mã. Test không dùng `page.route` và không có request `/api`.
- Xác minh chỉ bằng test:
  - `npm --prefix web run test:ui`, lọc một file bằng `npm --prefix web run test:ui -- <tên file>`;
  - `npm test` ở thư mục gốc.
  - Không có bước typecheck hay prettier.
  - Test phải chạy được khi `PW_PORT` được đặt, vì nhiều worktree chạy cùng lúc, vd. `PW_PORT=4181 npm --prefix web run test:ui`. Test chỉ dùng đường dẫn tương đối theo `baseURL`, không ghi cứng cổng `4177` hay `127.0.0.1:<cổng>`.
- Ở các file dùng chung với plan khác (mục "Xung đột khi gộp"), chỉ sửa đúng những dòng plan ghi. Không định dạng lại, không đổi thứ tự, không dọn import thừa.
- Mỗi task: viết test trước, chạy cho đỏ, viết mã, chạy cho xanh, rồi commit. Commit message theo kiểu `feat(web): …` và kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, như các commit trước.
- Số của dữ liệu giả chép đúng các bảng ở spec mục 1.2. Các bảng đó chép từ bộ sinh `gen-payroll2.js` của canvas; bản để đối chiếu: `C:\Users\524FFF~1.AIU\AppData\Local\Temp\claude\C--Users-52-AI-UD-Project-Vladilena-Milize--claude-worktrees-admin-ui-concept-6445c9\e0f113d9-fd93-45b7-a7d6-cbcee0c30c32\scratchpad\gen-payroll2.js`. Hình của board: `…\scratchpad\canvas\project\Payroll.dc.html`, `Payslip.dc.html`, ảnh chụp ở `…\scratchpad\preview\payroll.png`, `slip-top.png`, `slip-mid.png`, `slip-end.png`.
- `payroll-calc.ts` chỉ tính các luật ở spec "Luật lương › Đã chốt". Các khoản chưa chốt là số lưu sẵn: không có công thức, không có nhãn %.
- Bảng đổi tên token của spec sang biến CSS:

  | Token của spec | Biến CSS |
  |---|---|
  | `surface`, `raised`, `ground`, `border` | `--surface`, `--raised`, `--ground`, `--border` |
  | `border-control` | `--control` |
  | `ink`, `ink-muted` | `--text`, `--muted` |
  | `surface-dark` | `--surface-dark` |
  | `gold`, `gold-light`, `gold-pale` | `--gold`, `--gold-light`, `--gold-pale` |
  | `status-*` | `--status-*` |
  | `radius-md` | `--r-md` |
  | `black` | `--primary` |

  Không viết cứng màu nền, để chạy đúng ở nền Xám và nền Kem. Ngoại lệ duy nhất là số 0 màu `#757575` (spec 4.3).
- Không đổ bóng. Vàng không làm chữ hay viền trên nền sáng. Mỗi màn tối đa một ô nền `gold`.
- Trong danh sách và bảng của Admin, mỗi ô hiện một giá trị chính trên một dòng (spec, quyết định 14).
  - Thông tin phụ nằm trong phiếu lương mở từ dòng: lý do, khoảng ngày, mã, bậc, chú thích giải thích, chú giải.
  - Không thêm cột, dòng phụ hay chú thích nào vào Bảng lương ngoài board G.
  - Những gì G đã có thì giữ: dòng phụ "phòng ban · chức danh", " / 26" của Ngày công, chấm cam thiếu điểm, hai câu ở chân thẻ.
  - `title` và chữ ẩn cho trình đọc màn hình ở ô Lương KPI không hiện trên màn, nên không tính là thêm.
- Không có ô nhập hay nhãn giá trị dạng viên thuốc trong nội dung. Được dùng dáng viên thuốc cho: nhãn trạng thái trong bảng và ở đầu phiếu, nhãn trạng thái kỳ, nút lọc trạng thái.
- Ở 375px:
  - trang không cuộn ngang; bảng cuộn trong hộp riêng;
  - ngăn kéo cách mép trái và phải 16px.
- Định dạng số:
  - tiền dùng `vnd()` của `utils/format.ts`;
  - số âm trên màn dùng dấu `−` (U+2212);
  - phần trăm dùng `num(x, 2)` rồi thêm `%`;
  - tỷ đồng dùng `billions()` (Task 1).
- Câu chữ theo spec mục 3–4. Các câu test kiểm được chép sẵn trong test của từng task.
- Trạng thái giả nằm trong bộ nhớ của trang. Test chỉ `goto` một lần đầu, sau đó đi bằng liên kết trong app. `goto` lại sẽ nạp lại dữ liệu giả.

## Review Focus

1. **Đóng phiếu ngay sau khi gõ điểm, chưa rời ô** (Escape, nút Đóng, bấm nền, Phiếu trước/sau): điểm vừa gõ được lưu như khi rời ô, và dòng bảng hiện số mới. Test ở Task 5.
2. **Đường dẫn `?phieu=` cũ hoặc sai** (mã `GFT-9999`, hay tháng chưa có dữ liệu): không mở ngăn kéo, không lỗi, tham số `phieu` bị bỏ khỏi đường dẫn; bảng hoặc thẻ "chỉ có tháng 10" hiện như thường. Test ở Task 4.
3. **Ô điểm nhận chữ rác:**
   - `abc` thành trống: viền cam, có dòng cờ;
   - `150` thành `100`;
   - `1a5` thành `15`;
   - `007` thành `7`.
   - Test ở Task 5.
4. **Mở phiếu trên điện thoại 375px:** ngăn kéo không cuộn ngang bên trong; lưới ô điểm 3 cột; nút Đóng ở đầu ngăn kéo vẫn thấy. Test ở Task 5.
5. **Lọc chồng nhau và tìm có chữ đ:**
   - Chờ duyệt cộng Sản xuất còn đúng Long và Bảo, kèm "Hiển thị 2 trong 29 phiếu";
   - tìm `  do mai ` (thừa khoảng trắng, không dấu) ra Đỗ Mai Linh.
   - Test ở Task 2.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `web/src/mock/payroll-calc.ts` (mới) | Bản tính của mockup: trọng số KPI, `kpiScore`, `kpiPay`, `baseActual`, `insurance`, `incomeTax`, `recomputeSlip` |
| `web/src/mock/payroll.ts` (mới) | 10 phiếu mẫu, 118 phiếu còn lại (hằng số), trạng thái trong bộ nhớ; `payrollView`, `payslipView`, `setKpiScore`, `decidePayslip` |
| `web/src/mock/period.ts` | 6 bước kỳ lương |
| `web/src/mock/overview.ts` | Dòng, số đếm và tổng kỳ đọc từ `payroll.ts` |
| `web/src/utils/format.ts` | Thêm `billions`, `foldText` |
| `web/src/services/admin-payroll.ts` (viết lại) | `getPayroll`, `getPayslip`, `saveKpiScore`, `decidePayslip`, `previewPayslip` |
| `web/src/components/shell/PeriodStrip.vue` | Prop `card` |
| `web/src/components/shell/AdminLayout.vue` | `STEPS_NAV` |
| `web/src/components/ui/AppDrawer.vue`, `web/src/styles/overlay.css` | Prop `floating` |
| `web/src/views/admin/payroll/PayrollView.vue` (viết lại) | Màn G: tải dữ liệu, lọc/tìm/chọn, `?phieu`, phiếu trước/sau |
| `web/src/views/admin/payroll/parts/PayTiles.vue` (mới) | 4 ô số |
| `web/src/views/admin/payroll/parts/PayToolbar.vue` (mới) | Nút lọc, ô tìm, lọc phòng ban, nút xuất |
| `web/src/views/admin/payroll/parts/PayTable.vue` (mới) | Bảng, cột đứng yên, dòng tổng |
| `web/src/views/admin/payroll/useDragScroll.ts` (mới) | Kéo ngang bằng chuột |
| `web/src/views/admin/payroll/payrollCsv.ts` (mới) | Tạo và tải file CSV |
| `web/src/views/admin/payroll/payslip/PayslipDrawer.vue` (viết lại) | Khung phiếu H: đầu, định danh, chân, nháp điểm, duyệt, in |
| `web/src/views/admin/payroll/payslip/SlipAttendance.vue` (mới) | Chấm công tháng: dải 31 ngày và 5 ô số |
| `web/src/views/admin/payroll/payslip/SlipSummary.vue` (mới) | Bảng Tổng hợp lương; slot `kpi` và `history` |
| `web/src/views/admin/payroll/payslip/SlipKpi.vue` (mới) | 5 ô điểm KPI |
| `web/src/views/admin/payroll/payslip/SlipHistory.vue` (mới) | Lịch sử sửa điểm mở/đóng |
| `web/src/views/admin/settings/nav.ts`, `KpiRulesView.vue` | Bỏ "Đánh giá KPI", `PATHS.bangLuong` |
| `web/src/router/routes/admin-attendance.ts`, `admin-payroll.ts` | Bỏ route KPI; 2 route chuyển hướng |
| `web/src/design-index/admin-attendance.ts`, `admin-payroll.ts`, `payslip.ts`, `web/src/views/DesignIndex.vue` | Mục lục thiết kế |
| `web/tests/payroll-mock.spec.ts` (mới) | Test số của dữ liệu giả, chạy phía Node |
| `web/tests/payroll-ux.spec.ts` (viết lại) | Test màn G và H |
| `web/tests/admin-shell.spec.ts`, `admin-overview.spec.ts` | Test sửa và thêm |

Xoá:

- ở Task 2: `views/admin/payroll/scenarios.ts`; 17 file cũ trong `views/admin/payroll/parts/`; 5 file cũ trong `views/admin/payroll/payslip/`; `builders/admin-payroll/payroll.ts`; `views/print/A4Preview.vue`; `views/print/printLink.ts`;
- ở Task 7: `views/admin/kpi/`; `builders/admin-kpi/kpi.ts`; `services/admin-kpi.ts`; `tests/kpi-ux.spec.ts`.

Giữ nguyên, không sửa một dòng: `router/routes/payslip.ts`, `views/print/PayslipPrint.vue`, `A4Payslip.vue`, `slipFormat.ts`, `services/payslip.ts`, `builders/payslip/`. Đã kiểm: không file nào trong nhóm này nhập file bị xoá.

## Rulings của plan

Spec mục 9 đã ghi các phán quyết của thiết kế. Dưới đây chỉ là phán quyết mới của plan.

- Ruling: số của dữ liệu giả được kiểm bằng một test Playwright chạy phía Node (`tests/payroll-mock.spec.ts`), nhập thẳng `src/mock/payroll.ts` và `payroll-calc.ts`. Hai file này chỉ dùng import tương đối (`./clock`, `./accounts`, `../utils/format`). — Lý do: 10 phiếu × 11 số kiểm nhanh và chắc hơn qua giao diện; Playwright đọc được `paths` của tsconfig, nhưng import tương đối không phụ thuộc điều đó. — Rủi ro nếu sai: nếu Playwright không nạp được file TS của `src/`, chuyển các khẳng định sang test giao diện. Test 1, 4, 5, 6 đã phủ phần lớn.
- Ruling: Tổng quan đọc số tháng 10 của Bảng lương cho mọi tháng. — Lý do: Tổng quan hiện dùng một bộ số cho mọi tháng, chỉ đổi nhãn; Bảng lương chỉ có tháng 10. — Rủi ro nếu sai: tháng 9 trên Tổng quan vẫn hiện số tháng 10, như hiện nay.
- Ruling: dòng bảng cao 52px ở mật độ Thường. Ở mật độ Gọn (mặc định của app), dòng theo luật chung `td { height: 42px !important }`. — Lý do: mọi bảng của app theo cài đặt mật độ của người dùng; spec ghi 52px theo board. — Rủi ro nếu sai: thêm một luật CSS mạnh hơn.
- Ruling: Bảng lương (Task 2) làm trước khi bỏ màn KPI (Task 7). — Lý do: test dải các bước của khung (spec 6.1.2) chuyển sang `/admin/bang-luong`, nên màn đó phải có dải dạng thẻ trước. — Rủi ro nếu sai: không có.
- Ruling: các file Bảng lương cũ và ngăn kéo phiếu cũ bị xoá ngay ở Task 2. — Lý do: service viết lại làm chúng hỏng import. — Rủi ro nếu sai: lấy lại từ git.
- Ruling: ô chọn và nút xuất cùng vào Task 3; Task 2 chưa có ô chọn. — Lý do: ô chọn chỉ phục vụ nút xuất, không đặt điều khiển chưa có việc. — Rủi ro nếu sai: không có.
- Ruling: đóng phiếu hoặc sang phiếu trước/sau khi ô điểm vừa gõ chưa rời thì lưu điểm đó, như khi rời ô (Review Focus 1). — Lý do: phiếu đã hiện số mới, lặng lẽ mất điểm là bất ngờ cho người dùng. — Rủi ro nếu sai: đổi thành bỏ điểm chưa lưu.
- Ruling: `?phieu=` không khớp phiếu nào thì bỏ tham số bằng `router.replace`, không mở ngăn kéo, không báo lỗi (Review Focus 2). — Lý do: liên kết cũ không được làm hỏng màn. — Rủi ro nếu sai: thêm một toast.
- Ruling: định dạng CSV:
  - Ngày công là số ngày công, vd. `24`;
  - Trừ giờ là số âm với dấu `-` ASCII, vd. `-57692`;
  - dòng kết thúc bằng `\r\n`;
  - ô có `;`, `"` hoặc xuống dòng thì bọc ngoặc kép.
  - Lý do: Excel đọc được số âm ASCII; spec không nói. Rủi ro nếu sai: đổi một cột.
- Ruling: nhãn của dải 31 ngày là "Chấm công tháng 10: <a> ngày công, <b> phép, <c> iSAT, <d> chờ giải trình, <e> không lương". — Lý do: spec chỉ ghi "nhãn tóm tắt". — Rủi ro nếu sai: chỉ là câu chữ.
- Ruling: nút "Duyệt phiếu" nền `--primary` (#1c1c1c). — Lý do: `base.css` không có token `black`. — Rủi ro nếu sai: một màu.
- Ruling: trong bảng, liên kết chỉ bọc tên; dòng phụ "phòng ban · chức danh" nằm ngoài liên kết. — Lý do: tên liên kết gọn cho trình đọc màn hình và cho test. — Rủi ro nếu sai: không có.
- Ruling: tên mục mới của mục lục thiết kế là `bl-t10.html`, `bl-t09-trong.html`, `phieu-t10-nam.html`, `phieu-t10-huy.html`. — Lý do: `file` là khoá và nhãn của mục lục; board mới không có file HTML riêng. — Rủi ro nếu sai: chỉ là nhãn.
- Ruling: `foldText` (bỏ dấu) và `billions` (tỷ đồng) thêm vào `utils/format.ts`, Tổng quan dùng chung. — Lý do: không chép hàm bỏ dấu sang màn thứ hai. — Rủi ro nếu sai: không có.
- Ruling: plan chạy song song với plan chuông và chấm công và plan Nhân sự, trên gốc `337374f`. Ở file dùng chung, plan chỉ sửa đúng các dòng ghi ở mục "Xung đột khi gộp". — Lý do: người dùng yêu cầu làm song song, và lead gộp các nhánh. — Rủi ro nếu sai: xung đột lớn hơn bảng dưới; lead giải theo cột "Khi gộp giữ".
- Ruling: liên kết "Mở Bảng lương" ở Cài đặt › Quy tắc KPI không có test. — Lý do: màn Cài đặt chưa có dữ liệu giả nên phần chứa liên kết không hiện. — Rủi ro nếu sai: review đọc mã thay cho test.

## Xung đột khi gộp

Plan chuông và chấm công (nhánh `feat/admin-bell-attendance`) cũng sửa các file dưới đây. Cột "Plan kia sửa" chép theo plan đó lúc viết.

| File | Plan này sửa | Plan kia sửa | Khi gộp giữ |
|------|--------------|--------------|-------------|
| `web/src/views/admin/settings/nav.ts` | Bỏ dòng `['kpi', 'target', 'Đánh giá KPI', '/admin/kpi']`; `PATHS.danhGiaKpi` thành `PATHS.bangLuong` (Task 7) | Bỏ mục `duyet` (Yêu cầu) | Cả hai: nhóm Kỳ lương còn Chấm công và Bảng lương; không còn Yêu cầu |
| `web/src/components/shell/AdminLayout.vue` | Chỉ dòng 27 `STEPS_NAV`: `['cham-cong', 'kpi']` ở Task 2, `['cham-cong']` ở Task 7 | Thay `BellPopover` bằng `BellDrawer`; bỏ `:counts` | Cả hai; `STEPS_NAV = ['cham-cong']` |
| `web/src/mock/overview.ts` | Một dòng import mới; dòng `PayrollStatus`; xoá `ROWS`; các trường `payroll`, `period` (số tiền, số phiếu), `kpis[0].value` (Task 1) | Đọc việc chờ từ `mock/inbox.ts` thay cho `approvals.ts`: import, trường `approvals`, kpi `requests` | Cả hai. Import giữ cả hai nguồn; bỏ import `./approvals` vì file đó bị plan kia xoá |
| `web/src/router/routes/admin-attendance.ts` | Xoá khối `/admin/kpi`; bỏ cụm "Đánh giá KPI" ở chú thích đầu (Task 7) | Viết lại route Chấm công: một route, các route chuyển hướng, route hồ sơ | Route của plan kia, không có khối `/admin/kpi`. Chú thích đầu không nhắc KPI |
| `web/src/design-index/admin-attendance.ts` | Bỏ hai dòng KPI (Task 7) | Plan không ghi | Nếu plan kia có sửa: giữ dòng của nó, bỏ hai dòng KPI |
| `web/src/utils/format.ts` | Thêm `billions`, `foldText` ở cuối file (Task 1) | Thêm `weekdayName` | Cả ba hàm |
| `web/tests/admin-shell.spec.ts` | Xem 4 dòng ngay dưới bảng | Vòng bấm bỏ "Yêu cầu" và còn "Đánh giá KPI"; thêm kiểm 0 liên kết /^Yêu cầu/; test chuông đổi sang ngăn kéo "Thông báo"; viết lại `navigation drops stale view queries…` qua nút "Mở trang Yêu cầu"; thay hai test popover | Vòng bấm là Tổng quan, Chấm công, Bảng lương, Nhân sự, kèm cả hai kiểm "0 liên kết". Test `navigation drops stale view queries…` lấy bản của plan kia. Các test khác lấy bản của plan này |
| `web/tests/admin-overview.spec.ts` | Thêm một test ở cuối file (Task 1) | Sửa 3 test duyệt yêu cầu và số chuông | Cả hai |

Plan này sửa `web/tests/admin-shell.spec.ts` ở 4 chỗ:

- Task 1: thêm 6 nhãn vào test dải các bước.
- Task 7: vòng bấm bỏ "Đánh giá KPI", kèm kiểm 0 liên kết "Đánh giá KPI".
- Task 7: test dải các bước mở `/admin/bang-luong`; test ngăn kéo điện thoại và test đổi màn bấm "Bảng lương".
- Task 7: thêm test chuyển hướng ở cuối file.

File chỉ plan này sửa: `mock/period.ts`, `PeriodStrip.vue`, `AppDrawer.vue`, `overlay.css`, `KpiRulesView.vue`, `views/admin/overview/parts/PayrollTable.vue` (chỉ dòng `fold`), `design-index/admin-payroll.ts`, `payslip.ts`, `DesignIndex.vue` (tên nhóm), các file Bảng lương và KPI.

Kế hoạch Nhân sự chưa có trên đĩa lúc viết. Các file có thể chung với nó:

- `nav.ts`: nhóm Đội ngũ;
- `routes/admin-attendance.ts`: route `/admin/nhan-su`;
- `design-index/admin-attendance.ts`: các dòng Nhân sự;
- `DesignIndex.vue`: tên nhóm "Admin · Chấm công, Nhân sự".

Plan này chỉ đụng các dòng KPI ở những file đó.

Việc của lead sau khi gộp:

- Liên kết "Xem từng ngày" trong `payslip/SlipAttendance.vue` đổi từ `/admin/cham-cong?thang=…` sang `employeePath(<mã người đó>)` của `views/admin/attendance/links.ts`, giữ `thang`.
- Đối chiếu ngày nghỉ của 10 người giữa `mock/payroll.ts` và `mock/attendance.ts` (phép, iSAT, chờ giải trình, không lương).
- Chạy lại toàn bộ `npm --prefix web run test:ui` trên nhánh đã gộp.

---

### Task 1: Dữ liệu giả Bảng lương, bản tính, 6 bước kỳ lương, Tổng quan đọc theo

**Files:**

- Create: `web/src/mock/payroll-calc.ts`, `web/src/mock/payroll.ts`
- Modify: `web/src/mock/period.ts`, `web/src/mock/overview.ts`, `web/src/utils/format.ts`
- Test: `web/tests/payroll-mock.spec.ts` (mới), `web/tests/admin-overview.spec.ts`, `web/tests/admin-shell.spec.ts`

**Interfaces:**

- Consumes: `MOCK_MONTH`, `MOCK_TODAY` (`mock/clock.ts`); `mockAccount`, `readSessionName` (`mock/accounts.ts`); `initials`, `dm`, `vnd` (`utils/format.ts`).
- Produces (`mock/payroll-calc.ts`, không import gì):

  ```ts
  export type KpiPart = 'wework' | 'user' | 'peer' | 'manager' | 'self';
  export type KpiScores = Record<KpiPart, number | null>;
  export const MOCK_KPI_WEIGHTS: Record<KpiPart, number>; // { wework: 40, user: 24, peer: 18, manager: 12, self: 6 }
  export type SlipInput = {
    base: number; dependants: number; days: { work: number };
    leavePay: number; isatPay: number; allowances: { actual: number }[];
    ot: { pay: number }; late: { cut: number }; exempt: number; advance: number;
    kpi: { scores: KpiScores; proposal: number };
  };
  export type SlipCalc = {
    baseActual: number; workPay: number; kpiPercent: number; kpiMissing: KpiPart[]; kpiPay: number;
    allowanceTotal: number; gross: number; taxable: number; insurance: number; afterInsurance: number;
    tax: number; net: number;
  };
  export function kpiScore(scores: KpiScores): { percent: number; missing: KpiPart[] };
  export function kpiPay(percent: number, proposal: number): number;
  export function baseActual(base: number, days: number): number;
  export function insurance(base: number): number;
  export function incomeTax(assessable: number): number;
  export function recomputeSlip<T extends SlipInput>(slip: T): T & { calc: SlipCalc };
  ```

- Produces (`mock/payroll.ts`):

  ```ts
  export type PayrollStatus = 'draft' | 'pending' | 'done' | 'rejected';
  export type DayKind = 'work' | 'leave' | 'isat' | 'pending' | 'unpaid' | 'sunday' | 'future';
  export type KpiEdit = { date: string; text: string; by: string };
  export const KPI_LABELS: Record<KpiPart, string>; // Base Wework, Người dùng, Đồng nghiệp, Quản lý trực tiếp, Tự đánh giá
  export type Payslip = SlipInput & {
    id: string; name: string; initials: string; dept: string; title: string;
    kind: 'NV'; level: number; contract: string; payday: string; note: string; status: PayrollStatus;
    days: { work: number; leave: number; isat: number; pending: number; unpaid: number; standard: number };
    calendar: DayKind[]; pendingDates: string[];
    allowances: { label: string; rule: number; actual: number }[];
    ot: { hours: [number, number, number]; pay: number };
    late: { minutes: number[]; hours: number; cut: number };
    leaveLeft: number;
    kpi: { scores: KpiScores; proposal: number; history: KpiEdit[] };
    calc: SlipCalc;
  };
  export type PayrollLine = {
    id: string; name: string; initials: string; dept: string; title: string; base: number;
    days: number; standard: number; workPay: number; kpiPay: number; kpiMissing: string[];
    allowance: number; ot: number; lateCut: number; gross: number; insurance: number;
    tax: number; advance: number; net: number; status: PayrollStatus;
  };
  export type SlipCounts = { all: number; draft: number; pending: number; done: number; rejected: number };
  export type PayrollScreen =
    | { month: string; empty: true }
    | { month: string; empty: false; range: string; payday: string; growth: string;
        lines: PayrollLine[]; counts: SlipCounts; depts: string[];
        totals: { gross: number; insurance: number; tax: number; advance: number; deductions: number; net: number; netShare: number } };
  export function payrollView(month: string): PayrollScreen;
  export function payslipView(month: string, id: string): Payslip | null;
  export function setKpiScore(month: string, id: string, part: KpiPart, value: number | null): Payslip | null;
  export function decidePayslip(month: string, id: string, decision: 'approve' | 'reject'): Payslip | null;
  ```

- Produces (`utils/format.ts`):
  - `billions(n: number): string`: tỷ đồng, đúng 2 số lẻ, dấu phẩy. Vd. `2480805872` thành `"2,48"`, `90003940` thành `"0,09"`.
  - `foldText(s: string): string`: bỏ dấu (`NFD`, bỏ `\u0300-\u036f`, đổi `đ`/`Đ` thành `d`), viết thường, `trim()`.
- `mock/overview.ts` vẫn xuất `PayrollStatus`, để các file `views/admin/overview/parts/` không phải sửa. Dòng `export type PayrollStatus = …` được thay tại chỗ bằng `export type { PayrollStatus } from './payroll';`.

- [ ] **Step 1: Viết test số của dữ liệu giả (`web/tests/payroll-mock.spec.ts`)**

```ts
import { expect, test } from '@playwright/test';
import { kpiScore, recomputeSlip } from '../src/mock/payroll-calc';
import { decidePayslip, payrollView, payslipView, setKpiScore } from '../src/mock/payroll';

// Chạy phía Node, không mở trang. Test cuối sửa trạng thái trong bộ nhớ nên cả file chạy tuần tự.
test.describe.configure({ mode: 'serial' });

// [mã, Tiền ngày công, Tổng điểm, Lương KPI, Phụ cấp, Làm thêm, Trừ giờ, Tổng thu nhập, Bảo hiểm, Thuế, Tạm ứng, Thực nhận]
const BOARD: [string, ...number[]][] = [
  ['GFT-0101', 16615385, 86.76, 2602800, 2800000, 461538, 0, 22479723, 1680000, 0, 0, 20799723],
  ['GFT-0108', 24923077, 89.08, 4454000, 3365384, 1961538, 57692, 34646307, 2520000, 170931, 0, 31955376],
  ['GFT-0142', 11999999, 66.14, 1322800, 2215384, 0, 0, 15538183, 1260000, 0, 0, 14278183],
  ['GFT-0117', 14538462, 80.72, 2018000, 2200000, 0, 0, 18756462, 1470000, 0, 0, 17286462],
  ['GFT-0123', 20000001, 83.62, 3344800, 3115384, 0, 0, 26460185, 2100000, 133009, 0, 24227176],
  ['GFT-0156', 12000000, 72.16, 1443200, 1692308, 0, 125000, 15010508, 1365000, 0, 0, 13645508],
  ['GFT-0063', 10576923, 74.06, 1481200, 2717308, 634615, 0, 15410046, 1155000, 0, 2000000, 12255046],
  ['GFT-0171', 9500000, 77.82, 1167300, 2815385, 411058, 0, 13893743, 997500, 0, 0, 12896243],
  ['GFT-0172', 9865385, 80.74, 1211100, 1692308, 365385, 0, 13134178, 997500, 0, 0, 12136678],
  ['GFT-0175', 9865385, 76.08, 1141200, 2264423, 205529, 0, 13476537, 997500, 0, 0, 12479037]
];

test('each sample slip matches board G', () => {
  for (const [id, ...want] of BOARD) {
    const s = payslipView('2026-10', id)!;
    const c = s.calc;
    expect([c.workPay, c.kpiPercent, c.kpiPay, c.allowanceTotal, s.ot.pay, s.late.cut, c.gross, c.insurance, c.tax, s.advance, c.net], id).toEqual(want);
  }
  expect(payslipView('2026-10', 'GFT-0063')!.calc.kpiMissing).toEqual(['self']);
  const nam = payslipView('2026-10', 'GFT-0142')!;
  expect(nam.days).toEqual({ work: 24, leave: 1, isat: 1, pending: 1, unpaid: 0, standard: 26 });
  expect(nam.calendar).toHaveLength(31);
  expect([nam.calendar[3], nam.calendar[11], nam.calendar[16], nam.calendar[26], nam.calendar[28]]).toEqual(['sunday', 'leave', 'isat', 'pending', 'future']);
  expect(nam.pendingDates).toEqual(['27/10']);
  expect(nam.kpi.history.map(h => `${h.date} · ${h.text} · ${h.by}`)).toEqual([
    '27/10 · Quản lý trực tiếp 60 → 65 · Trưởng phòng Kinh doanh',
    '25/10 · Đồng nghiệp 72 → 68 · Quản trị viên',
    '20/10 · Base Wework nhập 62 · Quản trị viên'
  ]);
});

test('period counts and totals match the board tiles', () => {
  const v = payrollView('2026-10');
  if (v.empty) throw new Error('tháng 10 phải có dữ liệu');
  expect(v.lines.map(l => l.id)).toEqual(BOARD.map(b => b[0]));
  expect(v.counts).toEqual({ all: 128, draft: 12, pending: 29, done: 86, rejected: 1 });
  expect(v.totals).toEqual({ gross: 2480805872, insurance: 260042500, tax: 90003940, advance: 20000000, deductions: 370046440, net: 2110759432, netShare: 85 });
  expect(v.lines.reduce((a, l) => a + l.net, 0)).toBe(171959432);
  expect(v.depts).toEqual(['Tài chính', 'Kỹ thuật', 'Kinh doanh', 'Nhân sự', 'Marketing', 'Sản xuất']);
  expect(payrollView('2026-09')).toEqual({ month: '2026-09', empty: true });
  expect(payslipView('2026-09', 'GFT-0142')).toBeNull();
  expect(payslipView('2026-10', 'GFT-9999')).toBeNull();
});

test('what-if scores recompute KPI, tax and net', () => {
  const withScore = (id: string, part: string, value: number | null) => {
    const s = payslipView('2026-10', id)!;
    return recomputeSlip({ ...s, kpi: { ...s.kpi, scores: { ...s.kpi.scores, [part]: value } } }).calc;
  };
  const up = withScore('GFT-0142', 'wework', 100);
  expect([up.kpiPercent, up.kpiPay, up.net]).toEqual([81.34, 1626800, 14582183]);
  const cleared = withScore('GFT-0142', 'wework', null);
  expect([cleared.kpiPercent, cleared.kpiPay, cleared.net, cleared.kpiMissing]).toEqual([41.34, 826800, 13782183, ['wework']]);
  const thinh = withScore('GFT-0123', 'self', 100);
  expect([thinh.kpiPercent, thinh.kpiPay, thinh.tax, thinh.net]).toEqual([84.52, 3380800, 134809, 24261376]);
  const huy = withScore('GFT-0063', 'self', 80);
  expect([huy.kpiPercent, huy.kpiPay, huy.net, huy.kpiMissing]).toEqual([78.86, 1577200, 12351046, []]);
  expect(kpiScore({ wework: null, user: null, peer: null, manager: null, self: null })).toEqual({ percent: 0, missing: ['wework', 'user', 'peer', 'manager', 'self'] });
});

test('editing scores writes history and deciding changes the counts', () => {
  const t = setKpiScore('2026-10', 'GFT-0123', 'self', 100)!;
  expect(t.kpi.history[0]).toEqual({ date: '28/10', text: 'Tự đánh giá 85 → 100', by: 'Quản trị viên' });
  expect(t.calc.net).toBe(24261376);
  expect(setKpiScore('2026-10', 'GFT-0123', 'self', 100)!.kpi.history).toHaveLength(1);
  expect(setKpiScore('2026-10', 'GFT-0123', 'self', null)!.kpi.history[0].text).toBe('Tự đánh giá xoá điểm 100');
  expect(setKpiScore('2026-10', 'GFT-0063', 'self', 80)!.kpi.history[0].text).toBe('Tự đánh giá nhập 80');
  expect(decidePayslip('2026-10', 'GFT-0142', 'approve')!.status).toBe('done');
  expect(decidePayslip('2026-10', 'GFT-0171', 'reject')!.status).toBe('rejected');
  const v = payrollView('2026-10');
  if (v.empty) throw new Error('tháng 10 phải có dữ liệu');
  expect(v.counts).toEqual({ all: 128, draft: 12, pending: 27, done: 87, rejected: 2 });
});
```

- [ ] **Step 2: Thêm test giao diện cho Tổng quan và dải các bước**

Trong `web/tests/admin-overview.spec.ts`:

```ts
test('overview rows and totals follow the payroll mock', async ({ page }) => {
  await page.goto('/admin/tong-quan');
  const nam = page.getByRole('region', { name: 'Bảng lương tháng 10' }).locator('tbody tr', { hasText: 'Lê Hoàng Nam' });
  for (const text of ['24 / 26', '12.000.000', '2.215.384', '14.278.183', 'Chờ duyệt']) await expect(nam).toContainText(text);
  const period = page.getByRole('region', { name: 'Kỳ lương tháng 10' });
  for (const text of ['2,11 tỷ ₫', '0,37 tỷ ₫', '85%', '86']) await expect(period).toContainText(text);
});
```

Trong `web/tests/admin-shell.spec.ts`, ở test `steps strip shows only on attendance, KPI and payroll`, ngay sau dòng kiểm `.period .state`, thêm:

```ts
  const labels = ['Chấm công', 'Chốt công', 'Chấm KPI', 'Tính lương', 'Phê duyệt', 'Trả lương'];
  await expect(page.locator('.period .steps .step')).toHaveCount(6);
  await expect(page.locator('.period .steps .step')).toContainText(labels);
```

- [ ] **Step 3: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-mock admin-overview admin-shell`
Expected: FAIL. `payroll-mock` báo không tìm thấy module `../src/mock/payroll-calc`. Test Tổng quan mới thiếu "24 / 26". Test dải các bước có 5 bước thay vì 6.

- [ ] **Step 4: Viết `web/src/mock/payroll-calc.ts`**

- Dòng đầu file, nguyên văn: `// Bản tính của mockup theo luật đã chốt. Phép tính thật nằm ở BE; xoá file này khi FE nối lại BE.`
- Công thức theo spec 1.4.
- `kpiScore`: `points = Σ (điểm ?? 0) × trọng số` (số nguyên), `percent = points / 100`. Thứ tự của `missing` theo `wework, user, peer, manager, self`.
- `incomeTax`: lũy tiến trên `max(0, assessable)` với bậc `[[10e6, 5], [30e6, 10], [60e6, 20], [100e6, 30], [Infinity, 35]]` (mức trên cùng của bậc, %), `Math.round` một lần ở cuối.
- `recomputeSlip`: trả bản mới `{ ...slip, calc }`, không sửa `slip`.
  - Phần tính thuế dùng `incomeTax(taxable − insurance − 15.500.000 − 6.200.000 × dependants)`.
  - Bảo hiểm tính trên `base` (lương bậc).

- [ ] **Step 5: Viết `web/src/mock/payroll.ts`**

- Import tương đối: `./clock`, `./accounts`, `./payroll-calc`, `../utils/format`.
- Dữ liệu 10 người chép từ 3 bảng ở spec 1.2: "Hồ sơ, ngày và trạng thái", "Số lưu sẵn", "KPI". Ngày nghỉ lưu là số ngày trong tháng theo từng loại, vd. Nam `{ leave: [12], isat: [17], pending: [27], unpaid: [] }`.
- `days.work = 27 − leave − isat − pending − unpaid`.
- `calendar[d−1]` cho d = 1…31:
  - ngày có trong danh sách nghỉ thì lấy loại đó;
  - không có thì: d ∈ {4, 11, 18, 25} là `'sunday'`, d ≥ 29 là `'future'`, còn lại là `'work'`.
- `pendingDates`: các ngày chờ giải trình, dạng `'dd/10'`.
- `late.minutes`: Quân `[18]`, Nam `[12]`, Linh `[45, 30, 24]`, những người khác `[]`.
- Giá trị cố định:
  - `kind: 'NV'`, `contract: 'HĐLĐ từ 3 tháng'`, `payday: '05/11/2026'`;
  - `note: 'Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 28/10 · công chuẩn theo quy chế: 26 ngày'`;
  - `range: '01–31/10'`, `growth: '▲ 3,2% so với tháng 9'`.
- Nhãn phụ cấp, theo thứ tự: Chuyên cần, Đi lại, Linh hoạt (ca Flex), Off Paid (ca đêm), Thưởng ca đêm.
- Trạng thái giữ trong bộ nhớ, theo mã: `status`, `scores`, `history`. Lịch sử ban đầu của Nam theo spec, mới nhất ở đầu.
- `payslipView` và `payrollView` tính lại bằng `recomputeSlip` mỗi lần gọi.
- 118 phiếu còn lại là hằng số trong file:
  - số phiếu: nháp 9, chờ duyệt 25, đã duyệt 84, từ chối 0;
  - tiền: Tổng thu nhập 2.292.000.000, Bảo hiểm 245.500.000, Thuế 89.700.000, Tạm ứng 18.000.000.
  - `counts` cộng số này vào 10 dòng mẫu; `totals` cũng vậy.
  - `deductions = insurance + tax + advance`; `net = gross − deductions`; `netShare = Math.round(net / gross × 100)`.
- `setKpiScore`:
  - điểm mới bằng điểm cũ thì không thêm lịch sử;
  - khác thì thêm lên đầu `{ date: dm(MOCK_TODAY), text, by: mockAccount(readSessionName() ?? 'admin').user.name }`;
  - `text` theo spec 1.2.
- `payslipView`, `setKpiScore`, `decidePayslip` trả `null` khi tháng khác `MOCK_MONTH` hoặc mã không có.

- [ ] **Step 6: Sửa `period.ts`, `overview.ts`, `format.ts`**

- `period.ts`: nhãn `['Chấm công', 'Chốt công', 'Chấm KPI', 'Tính lương', 'Phê duyệt', 'Trả lương']`. Tháng `MOCK_MONTH` có trạng thái `['done', 'done', 'done', 'done', 'cur', '']`. Các tháng khác giữ "Đã trả lương", mọi bước `done`.
- `overview.ts`: bỏ mảng `ROWS`. Đọc `payrollView(MOCK_MONTH)` cho mọi tháng:
  - `payroll.rows` là 6 dòng đầu: `id` là mã; `days` dạng `` `${days} / ${standard}` ``; `base`, `allowance`, `net` qua `vnd()`;
  - `payroll.total = counts.all`;
  - `period.slips = { done, pending, draft, rejected, total: all }`;
  - `period.net` và `period.deductions` dạng `` `${billions(x)} tỷ ₫` ``; `period.netShare = totals.netShare`;
  - `kpis[0].value = billions(totals.gross)`.
  - Các nhãn theo tháng và phần còn lại giữ như cũ.
  - Đây là file dùng chung. Chỉ sửa:
    - thêm một dòng import `payrollView` từ `./payroll`, `MOCK_MONTH` từ `./clock`, `billions`/`vnd` từ `@/utils/format`;
    - dòng `PayrollStatus`;
    - xoá khối `ROWS`;
    - các trường vừa kể trong `overviewView`.
  - Không đụng dòng import `./approvals`, các trường `headline`, `attendance`, `approvals` và kpi `requests`. Giữ import `initials` dù có thể thừa.
- Thêm test vào cuối `admin-overview.spec.ts`, không sửa test sẵn có.
- `format.ts`: thêm `billions` và `foldText` (Interfaces) ở cuối file.

- [ ] **Step 7: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-mock admin-overview admin-shell`
Expected: PASS hết.

Run: `npm --prefix web run test:ui`
Expected: 0 failed. Màn Bảng lương cũ vẫn báo `mock_missing` như trước.

- [ ] **Step 8: Commit**

```bash
git add web/src/mock web/src/utils/format.ts web/tests/payroll-mock.spec.ts web/tests/admin-overview.spec.ts web/tests/admin-shell.spec.ts
git commit -m "feat(web): payroll mock, mockup pay calc and six period steps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Màn Bảng lương (board G): ô số, lọc, tìm, bảng, tháng khác

**Files:**

- Rewrite: `web/src/services/admin-payroll.ts`, `web/src/views/admin/payroll/PayrollView.vue`
- Create: `web/src/views/admin/payroll/parts/PayTiles.vue`, `PayToolbar.vue`, `PayTable.vue`
- Modify:
  - `web/src/components/shell/PeriodStrip.vue`;
  - `web/src/components/shell/AdminLayout.vue:27`: `STEPS_NAV = ['cham-cong', 'kpi']`;
  - `web/src/views/admin/overview/parts/PayrollTable.vue`: dùng `foldText`;
  - `web/src/router/routes/admin-payroll.ts`: chỉ sửa dòng chú thích, bỏ `?kb`/`?hop`, `?phieu=<mã>`.
- Delete: `views/admin/payroll/scenarios.ts`; mọi file hiện có trong `views/admin/payroll/parts/` và `views/admin/payroll/payslip/`; `builders/admin-payroll/payroll.ts`; `views/print/A4Preview.vue`; `views/print/printLink.ts`
- Test: `web/tests/payroll-ux.spec.ts` (viết lại cả file)

**Interfaces:**

- Consumes: các kiểu và hàm của Task 1; `foldText`, `billions`, `vnd`, `num`, `initials`; `usePeriodStore().month`; `useLoad`.
- Produces:
  - `services/admin-payroll.ts`:

    ```ts
    export const getPayroll: (month: string) => Promise<PayrollScreen>;
    export const getPayslip: (month: string, id: string) => Promise<Payslip | null>;
    export const saveKpiScore: (month: string, id: string, part: KpiPart, value: number | null) => Promise<Payslip | null>;
    export const decidePayslip: (month: string, id: string, decision: 'approve' | 'reject') => Promise<Payslip | null>;
    export function previewPayslip(slip: Payslip, scores: KpiScores): Payslip; // đồng bộ, recomputeSlip trên bản sao
    ```

  - `PeriodStrip.vue`: prop `card: boolean` (mặc định `false`). Giữ `.period`, `.state`, `.steps`, `.step`.
  - `PayTable.vue`:
    - props: `lines: PayrollLine[]`, `month: number`;
    - Task 3 thêm `selected`, Task 4 thêm `openId`;
    - class mà test dùng: `th.who` (cột trái), `td.ded` (ô Khấu trừ), `td.net` (Thực nhận), `td.st` (Trạng thái).
  - `PayToolbar.vue`:
    - props: `counts: SlipCounts`, `depts: string[]`;
    - `v-model:filter` (`'all' | PayrollStatus`), `v-model:query`, `v-model:dept` (`''` = Tất cả).
  - `PayrollView.vue`: `shown = computed<PayrollLine[]>` lọc trạng thái, phòng ban và `foldText(query)` (so trên `foldText(name)`) cùng lúc.

- [ ] **Step 1: Viết lại `web/tests/payroll-ux.spec.ts` với các helper và test 1, 2, 12a, 14, Review Focus 5**

```ts
import { expect, test, type Page } from '@playwright/test';

// Bảng lương và phiếu lương chạy trên dữ liệu giả (mock/payroll.ts): không page.route, không gọi /api.
// Trạng thái giả nằm trong bộ nhớ trang: sau lần goto đầu, đi tiếp bằng liên kết trong app.
const URL10 = '/admin/bang-luong?thang=2026-10';
const table = (page: Page) => page.getByRole('region', { name: 'Bảng lương tháng 10, cuộn ngang để xem các khoản' });
const rows = (page: Page) => table(page).locator('tbody tr');
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const filters = (page: Page) => page.getByRole('group', { name: 'Lọc theo trạng thái' });
const tiles = (page: Page) => page.getByRole('region', { name: 'Chỉ số kỳ lương' });
const tile = (page: Page, name: string) => tiles(page).getByRole('article', { name, exact: true });

function trackApi(page: Page) {
  const calls: string[] = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('October payroll shows the board figures', async ({ page }) => {
  const calls = trackApi(page);
  await page.goto(URL10);
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.getByText('Kỳ lương tháng 10/2026 · công 01–31/10 · công chuẩn 26 ngày · trả lương 05/11/2026')).toBeVisible();
  await expect(page.locator('.period .steps .step')).toHaveCount(6);
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('2,48');
  await expect(tile(page, 'Tổng thu nhập tháng 10')).toContainText('▲ 3,2% so với tháng 9');
  await expect(tile(page, 'Thực nhận')).toContainText('2,11');
  await expect(tile(page, 'Thực nhận')).toContainText('85% tổng thu nhập');
  await expect(tile(page, 'Khấu trừ')).toContainText('0,37');
  await expect(tile(page, 'Khấu trừ')).toContainText('Bảo hiểm 0,26 · Thuế 0,09 · Tạm ứng 0,02');
  await expect(tile(page, 'Phiếu đã duyệt')).toContainText('86 / 128');
  for (const name of ['Tất cả 128', 'Nháp 12', 'Chờ duyệt 29', 'Đã duyệt 86', 'Từ chối 1'])
    await expect(filters(page).getByRole('button', { name, exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('24 / 26');
  await expect(row(page, 'Lê Hoàng Nam')).toContainText('14.278.183');
  await expect(row(page, 'Đỗ Mai Linh')).toContainText('−125.000');
  await expect(row(page, 'Bùi Quốc Huy').locator('[title="Thiếu điểm Tự đánh giá, tính 0"]')).toContainText('1.481.200');
  await expect(table(page).locator('tfoot')).toContainText('Tổng 10 phiếu đang hiện');
  await expect(table(page).locator('tfoot')).toContainText('171.959.432');
  await expect(page.getByText('Thiếu điểm KPI, cột thiếu tính 0 điểm')).toBeVisible();
  await expect(page.getByText('Hiển thị 10 trong 128 phiếu')).toBeVisible();
  expect(calls).toEqual([]);
});

test('status filter, department and accent-free search', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await expect(filters(page).getByRole('button', { name: /^Chờ duyệt/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(page)).toHaveCount(4);
  for (const [i, name] of ['Lê Hoàng Nam', 'Phạm Ngọc Anh', 'Trịnh Văn Long', 'Ngô Gia Bảo'].entries())
    await expect(rows(page).nth(i)).toContainText(name);
  await expect(page.getByText('Hiển thị 4 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(4);
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  const search = page.getByLabel('Tìm theo tên', { exact: true });
  await search.fill('hoang nam');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Lê Hoàng Nam');
  await search.fill('xyz');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('Không có phiếu nào khớp.')).toBeVisible();
  await expect(table(page).locator('tfoot')).toHaveCount(0);
});

test('filters stack and search folds đ and spaces', async ({ page }) => {
  await page.goto(URL10);
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Sản xuất' });
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('Trịnh Văn Long');
  await expect(rows(page).nth(1)).toContainText('Ngô Gia Bảo');
  await expect(page.getByText('Hiển thị 2 trong 29 phiếu')).toBeVisible();
  await filters(page).getByRole('button', { name: /^Tất cả/ }).click();
  await page.getByLabel('Phòng ban').selectOption({ label: 'Phòng ban: Tất cả' });
  await page.getByLabel('Tìm theo tên', { exact: true }).fill('  do mai ');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Đỗ Mai Linh');
});

test('one gold tile, and kem ground with the light sidebar', async ({ page }) => {
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  const golds = await page.locator('main').evaluate(root =>
    [...root.querySelectorAll('*')].filter(el => getComputedStyle(el).backgroundColor === 'rgb(232, 195, 114)').length
  );
  expect(golds).toBe(1);
  await page.getByRole('button', { name: /Quản trị viên/ }).click();
  await page.locator('.pop .mr', { hasText: 'Màu nền' }).getByRole('button', { name: 'Kem' }).click();
  await page.locator('.pop .mr', { hasText: 'Thanh bên' }).getByRole('button', { name: 'Sáng' }).click();
  await page.keyboard.press('Escape');
  await expect(rows(page)).toHaveCount(10);
  await expect(table(page).locator('td.ded').first()).toHaveCSS('background-color', 'rgb(251, 248, 241)');
});

test('other months show the mockup notice', async ({ page }) => {
  await page.goto('/admin/bang-luong?thang=2026-09');
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await expect(page.locator('.period .state')).toContainText('Đã trả lương');
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await expect(tiles(page)).toHaveCount(0);
  await expect(table(page)).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: FAIL ở cả 5 test, vì màn cũ báo lỗi `mock_missing` và không có heading.

- [ ] **Step 3: Viết lại service, sửa `PeriodStrip` và `AdminLayout`, xoá file cũ**

- Service theo Interfaces, gọi `mock/payroll.ts` qua `respond()`.
- `PeriodStrip` khi có `card`: hình theo spec 2.2. Vòng của bước có số thứ tự, bước `done` có dấu tích `Icon check`.
- Xoá các file ở mục Files bằng `git rm`.

- [ ] **Step 4: Viết `PayrollView.vue` và 3 file `parts/`**

Bố cục, ô số, bảng và chân thẻ theo spec 3.1, 3.2, 3.5.

- `PayrollView.vue`:
  - `useLoad(() => getPayroll(period.month), () => period.month)`;
  - tiêu đề `.title` có `h1` "Bảng lương", rồi `<PeriodStrip card />`;
  - `empty` thì một thẻ ghi câu tháng khác;
  - không thì `PayTiles`, rồi thẻ bảng gồm `PayToolbar`, `PayTable` và chân thẻ.
- Ô số:
  - `PayTiles` là `<section aria-label="Chỉ số kỳ lương">`, mỗi ô là `<article :aria-label="nhãn">`;
  - số tỷ dùng `billions()`;
  - ô "Phiếu đã duyệt" viết `86<span> / 128</span>`, rồi thanh chia đoạn.
- Hàng công cụ:
  - nút lọc trong `role="group" aria-label="Lọc theo trạng thái"`, có `aria-pressed`;
  - chấm màu là `<span aria-hidden="true">`, để tên nút là "Chờ duyệt 29";
  - ô tìm `aria-label="Tìm theo tên"`;
  - `<select aria-label="Phòng ban">`.
- Bảng:
  - hộp cuộn `role="region"` có `aria-label` "Bảng lương tháng <m>, cuộn ngang để xem các khoản", `tabindex="0"`;
  - cột trái `th.who` gồm avatar, `RouterLink` (chỉ bọc tên, `replace`, `draggable="false"`, `:to` thêm `phieu: line.id` vào `route.query`) và dòng phụ;
  - ô Lương KPI thiếu điểm có `title` "Thiếu điểm <các cột>, tính 0" và chữ ẩn cùng nội dung.
- Chân thẻ:
  - câu thiếu điểm chỉ hiện khi một dòng đang hiện có `kpiMissing`;
  - "Hiển thị n trong N phiếu", với N là số đếm của nút lọc đang chọn.

- [ ] **Step 5: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-ux admin-overview admin-shell`
Expected: PASS hết.

Run: `npm --prefix web run test:ui`
Expected: 0 failed.

- [ ] **Step 6: Commit**

```bash
git add -A web/src web/tests/payroll-ux.spec.ts
git commit -m "feat(web): payroll board G on mock data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cột đứng yên, kéo ngang, màn hẹp, ô chọn và xuất CSV

**Files:**

- Create: `web/src/views/admin/payroll/useDragScroll.ts`, `web/src/views/admin/payroll/payrollCsv.ts`
- Modify: `parts/PayTable.vue`, `parts/PayToolbar.vue`, `PayrollView.vue`
- Test: `web/tests/payroll-ux.spec.ts` (thêm 3 test)

**Interfaces:**

- Consumes: `PayrollLine`, `PayrollStatus` (Task 1); `PayTable`, `PayToolbar` (Task 2).
- Produces:

  ```ts
  // useDragScroll.ts
  export function useDragScroll(el: Ref<HTMLElement | null>): void;
  // payrollCsv.ts
  export function payrollCsv(lines: PayrollLine[]): string; // có BOM, phân cách ';', dòng kết thúc '\r\n'
  export function downloadCsv(filename: string, text: string): void; // Blob + <a download>
  ```

  - `PayTable` thêm `v-model:selected` (`string[]` mã phiếu).
  - `PayToolbar` thêm prop `selectedCount: number` và emit `export`.

- [ ] **Step 1: Thêm test 3, 10, 13 (phần trang)**

```ts
import { readFileSync } from 'node:fs'; // đặt cùng các import ở đầu file

test('frozen columns stay put and mouse drag scrolls without opening a slip', async ({ page }) => {
  await page.goto(URL10);
  const box = (await table(page).boundingBox())!;
  await table(page).evaluate(el => (el.scrollLeft = el.scrollWidth));
  for (const cell of [rows(page).first().locator('th.who'), rows(page).first().locator('td.net')]) {
    const b = (await cell.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  await table(page).evaluate(el => (el.scrollLeft = 0));
  await page.mouse.move(box.x + box.width / 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 300, box.y + 120, { steps: 10 });
  await page.mouse.up();
  expect(await table(page).evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  const name = (await table(page).getByRole('link', { name: 'Lê Hoàng Nam', exact: true }).boundingBox())!;
  await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
  await page.mouse.down();
  await page.mouse.move(name.x + name.width / 2 + 200, name.y + name.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/phieu=/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('export downloads the shown rows, or only the selected ones', async ({ page }) => {
  await page.goto(URL10);
  const read = async (name: string) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
    expect(dl.suggestedFilename()).toBe('bang-luong-2026-10.csv');
    const text = readFileSync(await dl.path(), 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    return text.slice(1).split('\r\n').filter(Boolean);
  };
  const all = await read('Xuất bảng lương ra Excel');
  expect(all[0]).toBe('Mã;Họ tên;Phòng ban;Chức danh;Ngày công;Tiền ngày công;Lương KPI;Phụ cấp;Làm thêm;Trừ giờ;Tổng thu nhập;Bảo hiểm;Thuế TNCN;Tạm ứng;Thực nhận;Trạng thái');
  expect(all).toHaveLength(11);
  expect(all).toContain('GFT-0142;Lê Hoàng Nam;Kinh doanh;Nhân viên kinh doanh;24;11999999;1322800;2215384;0;0;15538183;1260000;0;0;14278183;Chờ duyệt');
  await page.getByLabel('Chọn phiếu của Lê Hoàng Nam').check();
  await page.getByLabel('Chọn phiếu của Đỗ Mai Linh').check();
  const two = await read('Xuất 2 phiếu đã chọn ra Excel');
  expect(two).toHaveLength(3);
  expect(two[2]).toBe('GFT-0156;Đỗ Mai Linh;Marketing;Thiết kế đồ hoạ;22;12000000;1443200;1692308;0;-125000;15010508;1365000;0;0;13645508;Từ chối');
});

test('payroll fits 375px and the table scrolls in its own region', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL10);
  await expect(rows(page)).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 375)).toBeTruthy();
  expect(await table(page).evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();
  const who = (await rows(page).first().locator('th.who').boundingBox())!;
  expect(Math.round(who.width)).toBe(184);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: FAIL ở 3 test mới: ô Thực nhận ra khỏi hộp, không có nút xuất, cột tên không phải 184px.

- [ ] **Step 3: Viết `useDragScroll.ts`, `payrollCsv.ts`; sửa bảng, hàng công cụ, màn**

- Kéo ngang theo spec 3.3. Chặn cú bấm sau khi kéo bằng `addEventListener('click', …, { capture: true })` một lần.
- Cột đứng yên:
  - `th.who` dùng `position: sticky; left: 0`;
  - `td.net` dùng `right: 128px`, `td.st` dùng `right: 0`;
  - nền theo token;
  - dưới 768px theo spec 3.6.
- CSV theo spec 3.4 và Ruling CSV. Trạng thái ghi bằng nhãn tiếng Việt.
- Nhãn nút xuất: không chọn gì thì "Xuất bảng lương ra Excel"; có chọn thì "Xuất <n> phiếu đã chọn ra Excel". Đặt cả ở `aria-label` và `title`.
- Có ô chọn thì xuất các dòng đã chọn, theo thứ tự bảng; không thì xuất `shown`.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: PASS hết.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/payroll web/tests/payroll-ux.spec.ts
git commit -m "feat(web): frozen payroll columns, mouse drag and CSV export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ngăn kéo nổi và phiếu lương H để xem

**Files:**

- Modify: `web/src/components/ui/AppDrawer.vue`, `web/src/styles/overlay.css`, `PayrollView.vue`, `parts/PayTable.vue`
- Create: `payslip/PayslipDrawer.vue`, `payslip/SlipAttendance.vue`, `payslip/SlipSummary.vue`
- Test: `web/tests/payroll-ux.spec.ts` (thêm 4 test)

**Interfaces:**

- Consumes: `getPayslip`, `Payslip` (Task 1, 2); `shown` (Task 2).
- Produces:
  - `AppDrawer` có prop `floating: boolean` (mặc định `false`).
    - Khi `floating`: thêm class `floating` lên `.drw` và bỏ `style` rộng nội tuyến.
    - CSS ở `overlay.css` theo spec 4.1. Đầu `.drw-h` dính trên với nền `--surface`. Chân `.drw-f` nền `--surface`. Nút `.x` 36px không viền.
    - Dưới 768px: `left: 16px; right: 16px; width: auto`.
  - `PayslipDrawer.vue`:
    - props `slip: Payslip`, `month: string`, `hasPrev: boolean`, `hasNext: boolean`;
    - emits `close`, `prev`, `next`;
    - `title` của `AppDrawer` là "Phiếu lương của <tên>".
  - `SlipSummary.vue`:
    - props `slip: Payslip`, slot `kpi` (Task 5), slot `history` (Task 5);
    - là `<table>`: mỗi dòng có `<th scope="row">` (nhãn và dòng phụ) và hai `<td>`; nhóm là `<th colspan="3" scope="colgroup">`;
    - tiêu đề `<h3>Tổng hợp lương</h3>`.
  - `SlipAttendance.vue`: props `slip: Payslip`, `month: string`.
  - `PayTable` thêm prop `openId: string`. Dòng đang mở có class `open`, nền các ô là `--gold-pale`, tên gạch chân.

- [ ] **Step 1: Thêm helper và test 4 (phần xem), 9, 12b, 13 (ngăn kéo), Review Focus 2**

```ts
const slip = (page: Page, name: string) => page.getByRole('dialog', { name: `Phiếu lương của ${name}` });
const line = (dialog: ReturnType<typeof slip>, label: RegExp) => dialog.getByRole('row', { name: label });
const openSlip = (page: Page, name: string) => table(page).getByRole('link', { name, exact: true }).click();

test('clicking a name opens that payslip', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Lê Hoàng Nam');
  await expect(page).toHaveURL(/phieu=GFT-0142/);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(d).toContainText('Phiếu lương tháng 10/2026');
  await expect(d).toContainText('Kinh doanh · Nhân viên kinh doanh · GFT-0142');
  await expect(d).toContainText('NV · Bậc 2');
  await expect(d).toContainText('HĐLĐ từ 3 tháng');
  await expect(d.getByRole('img', { name: 'Chấm công tháng 10: 24 ngày công, 1 phép, 1 iSAT, 1 chờ giải trình, 0 không lương' })).toBeVisible();
  await expect(d.getByRole('link', { name: /Xem từng ngày/ })).toHaveAttribute('href', '/admin/cham-cong?thang=2026-10');
  await expect(line(d, /^Chờ giải trình/)).toContainText('27/10 · tạm tính 0 đ tới khi duyệt');
  await expect(line(d, /^Tổng điểm KPI/)).toContainText('66,14%');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('2.000.000');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('1.322.800');
  await expect(line(d, /^Giờ và tiền bị trừ/)).toContainText('Đi muộn 12 phút, không quá 15 phút nên không trừ');
  await expect(line(d, /^Thuế TNCN/)).toContainText('Lũy tiến · 0 người phụ thuộc');
  await expect(line(d, /^Thực nhận/)).toContainText('14.278.183 ₫');
  await expect(d).toContainText('11 ngày');
  await expect(row(page, 'Lê Hoàng Nam').locator('th.who')).toHaveCSS('background-color', 'rgb(255, 249, 236)');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(page).toHaveURL(URL10);
});

test('previous and next walk the rows shown when the slip opened', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Lê Hoàng Nam');
  await slip(page, 'Lê Hoàng Nam').getByRole('button', { name: 'Phiếu sau' }).click();
  await expect(page).toHaveURL(/phieu=GFT-0117/);
  await slip(page, 'Phạm Ngọc Anh').getByRole('button', { name: 'Đóng' }).click();
  await openSlip(page, 'Nguyễn Thu Hà');
  await expect(slip(page, 'Nguyễn Thu Hà').getByRole('button', { name: 'Phiếu trước' })).toBeDisabled();
  await slip(page, 'Nguyễn Thu Hà').getByRole('button', { name: 'Đóng' }).click();
  await filters(page).getByRole('button', { name: /^Chờ duyệt/ }).click();
  await openSlip(page, 'Ngô Gia Bảo');
  await expect(slip(page, 'Ngô Gia Bảo').getByRole('button', { name: 'Phiếu sau' })).toBeDisabled();
  await slip(page, 'Ngô Gia Bảo').getByRole('button', { name: 'Phiếu trước' }).click();
  await expect(slip(page, 'Trịnh Văn Long')).toBeVisible();
});

test('floating drawer: rounded, no shadow, 540px; 16px margins at 375px', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(d).toHaveCSS('border-radius', '24px');
  await expect(d).toHaveCSS('box-shadow', 'none');
  expect(Math.round((await d.boundingBox())!.width)).toBe(540);
  await page.setViewportSize({ width: 375, height: 812 });
  const b = (await d.boundingBox())!;
  expect([Math.round(b.x), Math.round(b.width)]).toEqual([16, 343]);
});

test('a stale phieu link opens nothing and is dropped', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-9999`);
  await expect(rows(page)).toHaveCount(10);
  await expect(page).toHaveURL(URL10);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tháng trước' }).click();
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await page.goto('/admin/bang-luong?thang=2026-09&phieu=GFT-0142');
  await expect(page.getByText('Bản mockup chỉ có bảng lương tháng 10/2026.')).toBeVisible();
  await expect(page).toHaveURL('/admin/bang-luong?thang=2026-09');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: FAIL ở 4 test mới, vì không có hộp thoại "Phiếu lương của …".

- [ ] **Step 3: Thêm `floating` cho `AppDrawer`**

Không đổi gì khi `floating` là `false`. `admin-overlays.spec.ts` phải còn xanh.

- [ ] **Step 4: Viết `PayslipDrawer`, `SlipAttendance`, `SlipSummary`; nối `?phieu` ở `PayrollView`**

Hình và dòng theo spec 4.1–4.3 và 4.6 (liên kết Xem từng ngày). Đầu ngăn kéo đợt này có nút Phiếu trước, Phiếu sau; nút In phiếu vào ở Task 6.

`PayrollView`:

- Tham số: `slipId` là `route.query.phieu` khi đó là chuỗi, không thì `''`.
- Theo dõi `[period.month, slipId]`:
  - `getPayslip` trả `null` thì `router.replace` với `query` không có `phieu`;
  - có phiếu thì đặt `slip`.
- Danh sách đi phiếu (`navIds`):
  - khi `slipId` khác rỗng, dữ liệu bảng đã tải, và `navIds` chưa chứa `slipId`, thì `navIds = shown.map(l => l.id)`;
  - khi `slipId` rỗng thì `navIds = []`.
- Nút trước/sau: `hasPrev = idx > 0`, `hasNext = 0 <= idx < navIds.length − 1`. `prev`/`next` dùng `router.replace` sang mã kề bên.
- `close`: `router.replace` bỏ `phieu`.

`SlipSummary`, nhóm LƯƠNG KPI đợt này gồm:

- slot `kpi`;
- dòng "Tổng điểm KPI";
- dòng cờ "Thiếu điểm <các cột>" với dòng phụ "Cột thiếu tính 0 điểm", chỉ khi `calc.kpiMissing` có cột;
- dòng "Lương KPI (đề xuất → thực tế) (đ)";
- slot `history`.

- [ ] **Step 5: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-ux admin-overlays`
Expected: PASS hết.

- [ ] **Step 6: Commit**

```bash
git add web/src web/tests/payroll-ux.spec.ts
git commit -m "feat(web): floating payslip drawer H with prev/next" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chấm điểm KPI trong phiếu, tính lại khi gõ, lịch sử sửa điểm

**Files:**

- Create: `payslip/SlipKpi.vue`, `payslip/SlipHistory.vue`
- Modify: `payslip/PayslipDrawer.vue`, `PayrollView.vue`
- Test: `web/tests/payroll-ux.spec.ts` (thêm 6 test)

**Interfaces:**

- Consumes: `previewPayslip`, `saveKpiScore` (Task 2); `KPI_LABELS`, `MOCK_KPI_WEIGHTS` (Task 1); slot `kpi` và `history` (Task 4).
- Produces:
  - `SlipKpi.vue`:
    - props `scores: KpiScores`, `name: string`;
    - emits `update(part: KpiPart, value: number | null)` khi `input`, và `save(part: KpiPart)` khi `change`.
  - `SlipHistory.vue`: prop `history: KpiEdit[]`.
  - `PayslipDrawer`:
    - thêm emit `changed(slip: Payslip)`;
    - giữ `draft: KpiScores`, đặt lại khi `slip.id` đổi;
    - `view = computed(() => previewPayslip(slip, draft))` là thứ được hiện;
    - `flush()` lưu mọi cột có `draft` khác `slip.kpi.scores`. Gọi `flush()` trước `close`, `prev`, `next` (Ruling Review Focus 1).
  - `PayrollView` nhận `changed`: đặt `slip` mới rồi `reload()` bảng.

- [ ] **Step 1: Thêm test 4 (lịch sử), 5, 6, Review Focus 1, 3, 4**

```ts
const score = (d: ReturnType<typeof slip>, part: string, name: string) => d.getByLabel(`Điểm ${part} của ${name}, phần trăm`);

test('payslip history lists the past score edits', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const toggle = d.getByRole('button', { name: 'Lịch sử sửa điểm (3)' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const items = d.getByRole('list', { name: 'Lịch sử sửa điểm' }).getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('27/10 · Quản lý trực tiếp 60 → 65');
  await expect(items.first()).toContainText('Trưởng phòng Kinh doanh');
});

test('typing a score recomputes KPI, tax and net at once', async ({ page }) => {
  await page.goto(URL10);
  await openSlip(page, 'Võ Đức Thịnh');
  const d = slip(page, 'Võ Đức Thịnh');
  await expect(d.getByText('Chưa sửa điểm lần nào')).toBeVisible();
  await score(d, 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await expect(line(d, /^Tổng điểm KPI/)).toContainText('84,52%');
  await expect(line(d, /^Lương KPI \(đề xuất/)).toContainText('3.380.800');
  await expect(line(d, /^Thuế TNCN/)).toContainText('134.809');
  await expect(line(d, /^Thực nhận/)).toContainText('24.261.376 ₫');
  await score(d, 'Tự đánh giá', 'Võ Đức Thịnh').press('Tab');
  await d.getByRole('button', { name: 'Lịch sử sửa điểm (1)' }).click();
  await expect(d.getByRole('list', { name: 'Lịch sử sửa điểm' })).toContainText('28/10 · Tự đánh giá 85 → 100');
  await d.getByRole('button', { name: 'Đóng' }).click();
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('a missing score counts as zero and is flagged', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0063`);
  const huy = slip(page, 'Bùi Quốc Huy');
  const self = score(huy, 'Tự đánh giá', 'Bùi Quốc Huy');
  await expect(self).toHaveCSS('border-top-color', 'rgb(235, 151, 61)');
  await expect(huy.getByText('Thiếu điểm Tự đánh giá')).toBeVisible();
  await self.fill('80');
  await expect(huy.getByText('Thiếu điểm Tự đánh giá')).toHaveCount(0);
  await expect(line(huy, /^Tổng điểm KPI/)).toContainText('78,86%');
  await expect(line(huy, /^Lương KPI \(đề xuất/)).toContainText('1.577.200');
  await self.press('Tab');
  await huy.getByRole('button', { name: 'Đóng' }).click();
  await expect(row(page, 'Bùi Quốc Huy').locator('[title^="Thiếu điểm"]')).toHaveCount(0);
  await openSlip(page, 'Lê Hoàng Nam');
  const nam = slip(page, 'Lê Hoàng Nam');
  await score(nam, 'Base Wework', 'Lê Hoàng Nam').fill('');
  await expect(nam.getByText('Thiếu điểm Base Wework')).toBeVisible();
  await expect(line(nam, /^Tổng điểm KPI/)).toContainText('41,34%');
  await expect(line(nam, /^Thực nhận/)).toContainText('13.782.183 ₫');
});

test('closing right after typing keeps the score', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0123`);
  await score(slip(page, 'Võ Đức Thịnh'), 'Tự đánh giá', 'Võ Đức Thịnh').fill('100');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page, 'Võ Đức Thịnh')).toContainText('24.261.376');
});

test('score inputs drop junk and cap at 100', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  const self = score(d, 'Tự đánh giá', 'Lê Hoàng Nam');
  for (const [typed, shown] of [['abc', ''], ['150', '100'], ['1a5', '15'], ['007', '7']]) {
    await self.fill(typed);
    await expect(self).toHaveValue(shown);
  }
  await self.fill('abc');
  await expect(d.getByText('Thiếu điểm Tự đánh giá')).toBeVisible();
});

test('payslip on a 375px phone has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await expect(score(d, 'Base Wework', 'Lê Hoàng Nam')).toBeVisible();
  expect(await d.evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await expect(d.getByRole('button', { name: 'Đóng' })).toBeVisible();
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: FAIL ở 6 test mới, vì không có ô "Điểm … phần trăm" hay nút "Lịch sử sửa điểm".

- [ ] **Step 3: Viết `SlipKpi.vue` và `SlipHistory.vue`, nối vào `PayslipDrawer`**

Ô, nhãn, cờ và lịch sử theo spec 4.4.

- Nhãn ngắn trên ô: "Base Wework (40%)", "Người dùng (24%)", "Đồng nghiệp (18%)", "Quản lý (12%)", "Tự đánh giá (6%)". Nhãn cho trình đọc màn hình dùng tên đầy đủ trong `KPI_LABELS`.
- Làm sạch khi gõ:
  - bỏ ký tự không phải số;
  - chuỗi rỗng là `null`;
  - còn lại `Math.min(100, Number(x))`;
  - gán lại `el.value` bằng giá trị đã làm sạch, để `150` hiện `100`.
- Lưới ô điểm 5 cột, dưới 480px 3 cột.
- Danh sách lịch sử là `<ul aria-label="Lịch sử sửa điểm">`.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-ux payroll-mock`
Expected: PASS hết.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/payroll web/tests/payroll-ux.spec.ts
git commit -m "feat(web): score KPI inside the payslip with live recompute" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Duyệt, từ chối và in phiếu

**Files:**

- Modify: `payslip/PayslipDrawer.vue`, `PayrollView.vue`
- Test: `web/tests/payroll-ux.spec.ts` (thêm 3 test)

**Interfaces:**

- Consumes: `decidePayslip` (Task 2); emit `changed` (Task 5); `Icon` có tên `print`.
- Produces:
  - chân ngăn kéo có nút "Từ chối" và "Duyệt phiếu", hoặc `<p role="status" aria-live="polite">`;
  - nút "In phiếu" ở đầu ngăn kéo;
  - khối `<style>` không `scoped` có `@media print`.

- [ ] **Step 1: Thêm test 7, 8, 11**

```ts
test('approving and rejecting update the slip, table, tiles and overview', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const nam = slip(page, 'Lê Hoàng Nam');
  await nam.getByRole('button', { name: 'Duyệt phiếu' }).click();
  await expect(nam.getByText('Đã duyệt', { exact: true })).toBeVisible();
  await expect(nam.getByRole('status')).toHaveText('Đã duyệt phiếu lương của Lê Hoàng Nam.');
  await expect(nam.getByRole('button', { name: /^(Duyệt phiếu|Từ chối)$/ })).toHaveCount(0);
  await nam.getByRole('button', { name: 'Đóng' }).click();
  await expect(filters(page).getByRole('button', { name: 'Chờ duyệt 28', exact: true })).toBeVisible();
  await expect(filters(page).getByRole('button', { name: 'Đã duyệt 87', exact: true })).toBeVisible();
  await expect(tile(page, 'Phiếu đã duyệt')).toContainText('87 / 128');
  const nav = page.getByRole('navigation', { name: 'Điều hướng' });
  await nav.getByRole('link', { name: 'Tổng quan' }).click();
  await expect(page.getByRole('region', { name: 'Kỳ lương tháng 10' })).toContainText('87');
  await expect(page.getByRole('region', { name: 'Bảng lương tháng 10' }).locator('tbody tr', { hasText: 'Lê Hoàng Nam' })).toContainText('Đã duyệt');
  await nav.getByRole('link', { name: 'Bảng lương', exact: true }).click();
  await openSlip(page, 'Trịnh Văn Long');
  await slip(page, 'Trịnh Văn Long').getByRole('button', { name: 'Từ chối' }).click();
  await expect(slip(page, 'Trịnh Văn Long').getByRole('status')).toHaveText('Đã từ chối phiếu lương của Trịnh Văn Long.');
  await slip(page, 'Trịnh Văn Long').getByRole('button', { name: 'Đóng' }).click();
  await expect(filters(page).getByRole('button', { name: 'Từ chối 2', exact: true })).toBeVisible();
});

test('an already approved slip has no decision buttons', async ({ page }) => {
  await page.goto(`${URL10}&phieu=GFT-0101`);
  const ha = slip(page, 'Nguyễn Thu Hà');
  await expect(ha.getByRole('status')).toHaveText('Đã duyệt phiếu lương của Nguyễn Thu Hà.');
  await expect(ha.getByRole('button', { name: 'Duyệt phiếu' })).toHaveCount(0);
  await expect(ha.getByRole('button', { name: 'Từ chối' })).toHaveCount(0);
});

test('print calls the browser dialog and prints only the slip', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__prints = 0;
    window.print = () => { (window as any).__prints += 1; };
  });
  await page.goto(`${URL10}&phieu=GFT-0142`);
  const d = slip(page, 'Lê Hoàng Nam');
  await d.getByRole('button', { name: 'In phiếu' }).click();
  expect(await page.evaluate(() => (window as any).__prints)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(table(page)).toBeHidden();
  await expect(d.getByRole('heading', { name: 'Tổng hợp lương' })).toBeVisible();
  await expect(d.getByRole('button', { name: 'In phiếu' })).toBeHidden();
  await expect(d.getByRole('button', { name: 'Duyệt phiếu' })).toBeHidden();
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- payroll-ux`
Expected: FAIL ở 3 test mới, vì không có nút "Duyệt phiếu" hay "In phiếu".

- [ ] **Step 3: Thêm duyệt, từ chối và in vào `PayslipDrawer`**

Theo spec 4.5 và 4.6.

- Hai nút chỉ hiện khi `status` là `draft` hoặc `pending`. Bấm thì `decidePayslip`, rồi emit `changed`.
- Câu trong vùng `role="status"` theo `status`, gồm cả phiếu đã duyệt hay từ chối từ trước.
- Nút In phiếu (icon `print`, 36px, không viền) gọi `window.print()`.
- CSS in:
  - `body > :not(.drw-root)` ẩn;
  - `.drw-root > .scrim` ẩn;
  - `.drw.floating` thành khối tĩnh: `position: static`, `width: auto`, `max-width: none`, `overflow: visible`, `border-radius: 0`;
  - mọi nút trong `.drw-h` và cả `.drw-f` ẩn;
  - `body { overflow: visible !important }`.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui -- payroll-ux admin-overview`
Expected: PASS hết.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/admin/payroll web/tests/payroll-ux.spec.ts
git commit -m "feat(web): approve, reject and print a payslip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bỏ màn Đánh giá KPI, chuyển hướng, mục lục thiết kế

**Files:**

- Modify:
  - `web/src/views/admin/settings/nav.ts`: bỏ dòng `['kpi', 'target', 'Đánh giá KPI', '/admin/kpi']`; `PATHS.danhGiaKpi` thành `PATHS.bangLuong = '/admin/bang-luong'`;
  - `web/src/views/admin/settings/KpiRulesView.vue:21`: "Mở Bảng lương", tới `PATHS.bangLuong`;
  - `web/src/components/shell/AdminLayout.vue:27`: `STEPS_NAV = ['cham-cong']`;
  - `web/src/router/routes/admin-attendance.ts`: chỉ xoá khối route `/admin/kpi` (dòng 37–48 ở `337374f`) và bỏ cụm ", Đánh giá KPI (2 tab)" ở dòng chú thích đầu file. Không đụng các route Chấm công;
  - `web/src/router/routes/admin-payroll.ts`: thêm 2 route chuyển hướng;
  - `web/src/design-index/admin-attendance.ts`, `admin-payroll.ts`, `payslip.ts`;
  - `web/src/views/DesignIndex.vue`: tên nhóm "Admin · Chấm công, Nhân sự".
- Delete: `web/src/views/admin/kpi/` (3 file), `web/src/builders/admin-kpi/kpi.ts`, `web/src/services/admin-kpi.ts`, `web/tests/kpi-ux.spec.ts`
- Test: `web/tests/admin-shell.spec.ts`

**Interfaces:**

- Consumes: màn Bảng lương có dải dạng thẻ (Task 2).
- Produces:
  - route `{ path: '/admin/kpi', redirect: to => ({ path: '/admin/bang-luong', query: to.query }) }`, và giống vậy cho `/admin/kpi/lich-su`;
  - mục lục thiết kế:
    - `admin-payroll.ts` còn hai dòng: `bl-t10.html` "Bảng lương · tháng 10" tới `/admin/bang-luong?thang=2026-10`; `bl-t09-trong.html` "Bảng lương · tháng 9 (chưa có dữ liệu giả)" tới `?thang=2026-09`;
    - `payslip.ts`: thay 5 dòng ngăn kéo và hộp in bằng `phieu-t10-nam.html` "Phiếu lương · Lê Hoàng Nam" (`…&phieu=GFT-0142`) và `phieu-t10-huy.html` "Phiếu lương · Bùi Quốc Huy, thiếu điểm KPI" (`…&phieu=GFT-0063`); hai dòng A4 giữ nguyên;
    - `admin-attendance.ts`: bỏ hai dòng KPI.

- [ ] **Step 1: Sửa và thêm test trong `admin-shell.spec.ts`**

- Test `admin shell makes no /api requests while navigating`:
  - danh sách thành `['Tổng quan', 'Yêu cầu', 'Chấm công', 'Bảng lương', 'Nhân sự']`;
  - sau vòng lặp, thêm `await expect(nav.getByRole('link', { name: 'Đánh giá KPI' })).toHaveCount(0);`.
- Test dải các bước:
  - đổi tên thành `steps strip shows on attendance and payroll only`;
  - `page.goto('/admin/bang-luong')` thay cho `'/admin/kpi'`;
  - phần còn lại giữ nguyên, gồm 6 nhãn của Task 1 và Tổng quan không có `.period`.
- Test ngăn kéo điện thoại và test `navigation drops stale view queries…`:
  - thay `page.getByRole('link', { name: 'Đánh giá KPI' })` bằng `page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Bảng lương', exact: true })`. Tên phải chặt và trong vùng điều hướng, vì Tổng quan có liên kết "Mở bảng lương";
  - đường dẫn mong đợi `'/admin/bang-luong?thang=2026-10'`;
  - mục đang chọn `toContainText('Bảng lương')`.
- Thêm:

```ts
test('old KPI links land on Bảng lương with their query', async ({ page }) => {
  await page.goto('/admin/kpi?thang=2026-10');
  await expect(page).toHaveURL('/admin/bang-luong?thang=2026-10');
  await expect(page.getByRole('heading', { name: 'Bảng lương', exact: true })).toBeVisible();
  await page.goto('/admin/kpi/lich-su?thang=2026-10');
  await expect(page).toHaveURL('/admin/bang-luong?thang=2026-10');
});
```

- [ ] **Step 2: Chạy cho đỏ**

Run: `npm --prefix web run test:ui -- admin-shell`
Expected: FAIL. Thanh bên còn "Đánh giá KPI". `/admin/kpi` không chuyển hướng.

- [ ] **Step 3: Sửa và xoá theo mục Files**

Sau khi xoá, `grep -rn "admin-kpi\|views/admin/kpi\|danhGiaKpi\|Đánh giá KPI" web/src` chỉ còn các chỗ của Cài đặt:

- `routes/admin-settings.ts`;
- `design-index/admin-settings.ts`;
- `services/admin-config.ts`;
- chú thích đầu `KpiRulesView.vue`.

Giữ nguyên các chỗ này.

- [ ] **Step 4: Chạy cho xanh**

Run: `npm --prefix web run test:ui`
Expected: 0 failed. `kpi-ux` không còn.

- [ ] **Step 5: Commit**

```bash
git add -A web/src web/tests
git commit -m "feat(web): fold KPI scoring into Bảng lương and drop the KPI screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Xác minh cuối (giai đoạn 6, sau review toàn nhánh)

| Lệnh | Kết quả mong đợi |
|------|------------------|
| `npm --prefix web run test:ui` | 0 failed. 67 passed nếu giữ đúng số test của plan: 40 cũ + 4 `payroll-mock` + 1 Tổng quan + 1 chuyển hướng + 21 `payroll-ux`. 44 skipped: 47 trước đây, bớt 1 `fixme` của `payroll-ux` và 2 của `kpi-ux` |
| `npm test` (thư mục gốc, cần PostgreSQL) | 24 pass, 0 fail, như mốc: BE không bị đụng |
| `git diff --stat 337374f -- src migrations test/v2 spec` | Trống |
| `PW_PORT=4181 npm --prefix web run test:ui` (cổng bất kỳ còn trống) | Như dòng đầu: test không phụ thuộc cổng 4177 |
| `git grep -n "fetch(" -- web/src` | Không có dòng nào |

Chưa kiểm bằng test, review đọc mã:

- liên kết "Mở Bảng lương" ở Cài đặt › Quy tắc KPI (màn chưa có dữ liệu giả);
- hình bản in thật trên giấy (test chỉ kiểm chế độ `print` của trình duyệt).
