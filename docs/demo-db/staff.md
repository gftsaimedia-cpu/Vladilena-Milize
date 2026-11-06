# Staff — tình huống, lỗi, câu hỏi

Mảng **staff** của [DB demo và test đầu-cuối](README.md): Nhân sự, chức vụ và chế độ, phân quyền, nhật ký, đăng nhập và quyền, `/nv/toi`.

- Chạy: `npm run demo -- test staff` (DB `luong_demo_staff`, BE 3371, vite 4271).
- Người: [scripts/demo/people/staff.ts](../../scripts/demo/people/staff.ts) (15 người `ns-*`). Seed: [scripts/demo/areas/staff.ts](../../scripts/demo/areas/staff.ts).
- Spec:
  - [demo-staff-employees.spec.ts](../../web/tests/api/demo-staff-employees.spec.ts): màn Nhân sự, route `employees`, so với `/nv/toi`;
  - [demo-staff-auth.spec.ts](../../web/tests/api/demo-staff-auth.spec.ts): đăng nhập, đổi mật khẩu, quyền;
  - [demo-staff-settings.spec.ts](../../web/tests/api/demo-staff-settings.spec.ts): Chế độ, Chức vụ và bậc, Phân quyền, Tất cả cài đặt, Nhật ký, `system/settings`.
  - Phần dùng chung: [demo-staff-support.ts](../../web/tests/api/demo-staff-support.ts) (không phải file test). Hàm `watchPage` kiểm bất biến (b) cho mỗi trang: không lỗi JS, không lỗi console, không API nào trả 5xx, không 4xx ngoài dự kiến. Riêng 404 của `/api/v2/settings/*` được ghi vào chú thích "chưa phủ" của test.
- Không có test `test/v2/demo-staff-*.test.ts`: mọi tình huống của mảng đều đi được qua giao diện hoặc HTTP.

**Nguồn luật (a):**
- **auth:** [spec fe-be-auth-foundation](../superpowers/specs/2026-11-05-fe-be-auth-foundation-design.md), mục 3 (D3) và mục 5–6.
- **pos:** [spec positions-settings](../superpowers/specs/2026-11-05-positions-settings-design.md), P1–P9 và mục 3–5.
- **audit:** [spec audit-log](../superpowers/specs/2026-11-05-audit-log-design.md), A3 và mục 5, 7.
- **list:** [spec danh sách nhân sự](../superpowers/specs/2026-11-04-admin-staff-list-design.md), quyết định 2: mỗi ô một giá trị, trên một dòng.

## Tình huống

Cột "Loại" là loại assert: (a) luật đã chốt, (b) bất biến, (c) thao tác sai không hiện ra. Test đánh dấu `test.fail` ghi kèm mã lỗi.

### Màn Nhân sự và route `employees` (`demo-staff-employees.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 1 | Danh sách: số hồ sơ = số dòng = số người BE trả; thẻ "Nhân sự đang làm" = số người đang làm tính từ dữ liệu; mỗi ô một giá trị trên một dòng | 6 người `ns-` | the staff list has one row per employee… | (b), (a) list |
| 2 | Ngăn kéo hồ sơ: chức danh, loại · bậc, loại hợp đồng, bảo hiểm Có / Không / trống, ca Flex, ngày vào làm đúng như đã lưu | ns-an, ns-binh, ns-chau | the profile drawer shows type, level… | (b) |
| 3 | Thử việc: nhãn "Thử việc" ở danh sách Admin và ở `/nv/toi` | ns-dung | a probation employee shows Thử việc… | (b) |
| 4 | Nghỉ việc (`DELETE`): đọc lại `nghiviec`, danh sách ghi "Đã nghỉ việc" | ns-giang | a resigned employee reads back… | (a) lưu đủ 5 trạng thái (chốt 05/11) |
| 5 | Hợp đồng TTS, CTV đọc lại đúng; `/nv/toi` của TTS ghi "Thực tập" | ns-binh, ns-chau | TTS and CTV contracts read back… | (a) lưu đủ 5 trạng thái |
| 6 | Cùng một người: ngăn kéo Admin và `/nv/toi` (điện thoại 390px, máy tính 1280px) cùng tên, loại · bậc, chức danh, ngày vào làm | ns-an | Admin drawer and the staff app show the same facts… | (b) |
| 7 | `POST` với `profile.name`: tạo được; `GET` theo username và theo uuid giống nhau; người mới đăng nhập được, `caps` rỗng | ns-moi-a (tạo trong test) | POST /employees with profile.name… | (b), (a) auth 5.2 |
| 8 | `POST` với `profile.familyName/givenName` (đúng dạng `GET` trả): tên phải giữ | ns-moi-b (tạo trong test) | POST /employees with the profile shape… | (b) — BUG-staff-1 |
| 9 | `POST` lần hai cùng username, `PUT` đổi username, `PUT` đổi uuid: cả ba trả 400 `BAD_EMPLOYEE_INPUT`; tên mới không được tạo; tên, uuid, mật khẩu của người đã có giữ nguyên | ns-trung | POST with an existing username, or PUT that changes username or uuid… | (b), hành vi của main aaa14d9 |
| 10 | `PUT` sửa bậc, chức danh, ca đêm 40%, loại hợp đồng, bảo hiểm, người phụ thuộc: đọc lại đúng ở API và ngăn kéo; phiên của người đó không bị cắt | ns-sua | PUT /employees edits read back… | (b), (a) auth 5.4 |
| 11 | `DELETE` khi người đó đang có phiên: phiên hết hiệu lực; đăng nhập đúng mật khẩu báo `ACCOUNT_LOCKED`, sai mật khẩu báo 401 | ns-xoa | DELETE /employees ends the person's sessions… | (a) auth 5.4, 5.7 |
| 12 | Thân sai (thiếu username, ngày sai dạng, bậc 0, trạng thái lạ, bảo hiểm lạ) → 400 `BAD_EMPLOYEE_INPUT` và không lưu gì; GET/PUT/DELETE người không có → 404 `EMPLOYEE_NOT_FOUND` | — | bad employee input is a 400 or 404… | (b) |
| 13 | `meta/positions` có `benefits` từng phiên bản và `levels`; `meta/shifts` có loại normal/flex/night; `roles` có admin, staff | admin | catalog routes answer Admin… | (a) pos 3.2 |

### Đăng nhập, đổi mật khẩu, quyền (`demo-staff-auth.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 14 | Sai mật khẩu và tên không có: cùng câu "Sai tên đăng nhập hoặc mật khẩu", ở lại `/dang-nhap` | ns-an, ns-khong-co-ai | a wrong password and an unknown username… | (a) auth 5.7 |
| 15 | Tài khoản khoá, đúng mật khẩu → "Tài khoản đã bị tạm khóa"; sai mật khẩu → 401 như thường; người nghỉ việc → 403 `ACCOUNT_LOCKED` | ns-khoa, ns-giang | a locked or resigned account… | (a) auth 5.7 |
| 16 | 5 lần sai → lần sau (kể cả đúng mật khẩu) 429 `TOO_MANY_ATTEMPTS`, `Retry-After` ≤ 900 giây; tên khác vẫn vào được | ns-sai, ns-an | five wrong passwords block that name… | (a) auth 5.8 |
| 17 | Tên đăng nhập có khoảng trắng và chữ hoa vẫn vào được | ns-an | the username is trimmed and lower-cased… | (a) auth 6.4 |
| 18 | Ô trống thì nút Đăng nhập không bấm được | — | the login button is not offered… | (c) — BUG-staff-3 |
| 19 | Đăng xuất ở điện thoại và máy tính: về `/dang-nhap`, mở lại `/nv/hom-nay` bị đưa về đăng nhập, API 401 | ns-an | signing out on the phone and on the desktop… | (a) auth 5.4 |
| 20 | Tự đổi mật khẩu ở `/nv/toi`: sai mật khẩu hiện tại thì máy chủ báo; đổi xong thiết bị này còn phiên, thiết bị khác bị đăng xuất, mật khẩu cũ hết dùng | ns-doimk | changing my password on the phone… | (a) auth 5.4 |
| 21 | Biểu mẫu đổi mật khẩu chưa đủ (trống, mới < 6 ký tự) thì nút Đổi mật khẩu không bấm được | ns-an | the password form does not offer… | (c) — BUG-staff-4 |
| 22 | Menu tài khoản trên máy tính mở đúng biểu mẫu đổi mật khẩu (`/nv/toi?hop=doi-mat-khau`) | ns-an | the desktop account menu opens… | (b) |
| 23 | `PUT /auth/password`: chưa đăng nhập 401; mật khẩu mới ngắn, mật khẩu cũ sai, thân rỗng → 400; phiên vẫn còn | ns-an | PUT /auth/password: no session is 401… | (a) auth 5.1, (b) |
| 24 | Chưa đăng nhập: URL Admin và `/nv/toi` về `/dang-nhap` (kèm `tiep`); 17 route Admin của mảng → 401; `auth/me` → `{ user: null }` | — | without a session, Admin and staff URLs… | (a) auth 5.1, 5.6 |
| 25 | Nhân viên mở 9 URL Admin của mảng → về `/nv/hom-nay`; đăng nhập với `?tiep=/admin/nhan-su` cũng về `/nv/hom-nay` | ns-an | a staff member who opens an Admin URL… | (a) auth 5.2 |
| 26 | Nhân viên gọi 17 route Admin của mảng → 403, không route nào ghi được gì | ns-an | a staff session gets 403… | (a) auth 5.2 |

### Cài đặt (`demo-staff-settings.spec.ts`)

| # | Tình huống | Người | Test | Loại |
|---|---|---|---|---|
| 27 | Chế độ (3 thẻ): mỗi loại một dòng; không cột Bậc, Nghỉ được duyệt; bảng yêu cầu 4 cột; "Theo từng người" chỉ ở NV; số người mỗi thẻ = người đang làm theo loại từ `GET /employees` | mọi người đã seed | Chế độ shows one row per type… | (a) pos P2, P4, P9, 5.1, 5.4 |
| 28 | Chế độ: Lưu mờ khi chưa đổi và khi sửa về số cũ; hộp xác nhận có 6 tháng từ tháng này; lưu từ tháng thứ 6 → phiên bản tháng đó có số mới, tháng này giữ số cũ; nhật ký có một dòng Sửa chức vụ (`position.save`) của Admin, đúng tháng, chỉ ô đã đổi | admin | Chế độ: Lưu stays off… | (c) pos P8, (a) P1, audit 6 |
| 29 | Chức vụ và bậc: hộp Sửa chức vụ NV có 6 tháng từ tháng này, "Theo từng người", không ô ca đêm, Lưu mờ; Thêm bậc mờ khi trống, thêm bậc kế tiếp từ tháng thứ 6 thì tháng này không có bậc đó; nhật ký có một dòng Sửa bậc (`level.save`, mã `nv:<bậc>`) | admin | Chức vụ và bậc: months start this month… | (a) pos P1, P9, 3.3 bước 7, audit 6, (c) P8 |
| 30 | `/positions` từ chối: tháng trước, ca đêm NV, % > 100, ô lạ, loại lạ → 400; rev cũ → 409 `POSITION_STALE`; lương âm → 400; bậc không có → 404; thêm bậc nhảy cóc → 409 `LEVEL_STALE`; không lần hỏng nào để lại phiên bản | admin | /positions refuses bad saves… | (a) pos 3.2–3.4 |
| 31 | Tài khoản: số tài khoản = số người của Nhân sự; dòng của chính mình có "Bạn" và không có nút Khoá; ≤ 10 dòng một trang | admin | Phân quyền › Tài khoản lists every account… | (b), (c) |
| 32 | Khoá ở Tài khoản: phiên của người đó hết hiệu lực, đăng nhập báo khoá; Mở khoá thì vào lại được | ns-mo | locking an account from Tài khoản… | (a) auth 5.4, 5.7 |
| 33 | Admin đặt lại mật khẩu: phiên cũ hết hiệu lực, mật khẩu cũ hết dùng, mật khẩu mới vào được | ns-datlai | Admin resets a password… | (a) auth 5.4 |
| 34 | Đổi vai trò Nhân viên → Admin → Nhân viên: `caps` đủ rồi rỗng, `GET /employees` 200 rồi 403 | ns-vaitro | changing a role from Tài khoản… | (a) auth D3, 5.2 — BUG-staff-8 |
| 35 | Nút "Tạo tài khoản" phải làm gì đó khi bấm | admin | the Tạo tài khoản button does something… | (c) — BUG-staff-5 |
| 36 | Vai trò, Xử lý yêu cầu, Tất cả cài đặt mở không lỗi JS, không 5xx (404 của `/settings/*` ghi "chưa phủ") | admin | screens waiting for settings-store… | (b) |
| 37 | Nhật ký: chân bảng theo tổng thật của API; nút kiểm tra báo đúng số dòng `verify` trả; `verify` ok và kiểm đủ mọi dòng (= tổng không lọc, > 0); Từ ngày sau Đến ngày thì Lọc bị khoá | admin | Nhật ký: the check button… | (b), (a) audit 5.2, (c) audit 7 |
| 37a | Nhật ký có dòng của seed: Thêm nhân sự cho từng người `ns-` (chỉ cờ `passwordSet`), Xoá nhân sự ns-giang (trạng thái, khoá, ngày nghỉ việc), Sửa nhân sự ns-khoa (`isLocked` false → true), đều do Admin; dropdown Người, Mục lấy trên cả bảng | ns-an, ns-binh, ns-chau, ns-giang, ns-khoa, ns-nhatky | Nhật ký has the seed’s create, resign and lock… | (a) audit 5.1, 6 |
| 37b | Một lần lưu của Admin (khoá + sửa người phụ thuộc) = 2 dòng chung `requestId`; màn gộp "Sửa nhân sự × 2", Mở ra hiện `isLocked` và `dependants`; lọc Người, Mục, ngày hôm nay ra dòng đó, ngày mai ra "Không có dòng nào"; cột Việc không hiện mã | ns-nhatky | Nhật ký: one Admin save shows as Sửa nhân sự × 2… | (a) audit A1, A2, A3, 5.1, 6 |
| 37c | Admin đặt lại mật khẩu: đúng một dòng Đặt lại mật khẩu, `after = { passwordSet: true }`; cả nhật ký không chứa mật khẩu vừa đặt, mật khẩu demo hay ô mã băm | ns-nhatky | Nhật ký: an Admin password reset… | (a) audit 6 |
| 38 | `/system/audit`: `limit` 25, `offset` 0, trần 200; `limit=0`, `offset=-1`, ngày sai, ngày không có thật, từ sau đến → 400; `verify` ok | admin | /system/audit answers with the spec's shape… | (a) audit A3, 5.1, 5.2 |
| 39 | `/system/audit?to=9999-12-31` không trả 500 | admin | /system/audit with a far-future end date… | (b) — BUG-staff-6 |
| 40 | `/system/settings`: Admin đọc được; ghi một khoá rồi đọc lại đúng | admin | /system/settings: Admin reads and writes… | (b) |
| 41 | `/system/settings/:key` không có `value` → 400, không 500 | admin | /system/settings refuses a write without a value… | (b) — BUG-staff-7 |

## Ghi SQL thẳng (không có route)

- Không có. Seed chỉ gọi `DELETE /employees/ns-giang` và `PUT /employees/ns-khoa`.
- Lượt chạy đầu: `admin.del()` của phần nền gửi DELETE không có `Content-Type`, nên BE trả 415. Phần nền đã sửa ở 750e76a (`del` gửi thân `{}`), seed dùng lại `admin.del()`.
- Test gọi DELETE thẳng bằng Playwright cũng phải gửi `{ headers: json, data: {} }`, như FE.

## Lỗi

Mỗi lỗi có một test `test.fail(true, 'BUG-staff-<n>: …')`: lỗi còn thì test "fail như dự kiến" (tính là xanh); sửa xong thì test báo "Expected to fail, but passed", lúc đó bỏ dòng `test.fail`. Lý do fail của từng test đã đối chiếu trong báo cáo JSON của Playwright (lượt chạy ngày 05/11/2026), không chỉ dựa vào việc test fail.

**BUG-staff-1 — `POST /employees` bỏ qua `profile.familyName/givenName`.**
- Tái hiện: `POST /api/v2/employees` với `profile: { familyName: 'Phan Thị', givenName: 'Hai' }` (đúng dạng `GET` trả về). Trả 201, nhưng `GET` đọc lại `fullName` là "Ns-moi-b" (rơi về username).
- Đúng phải là: tên lưu là "Phan Thị Hai"; hoặc trả 400 nếu BE không nhận dạng này.
- File nghi ngờ: `src/modules/employees/employees.service.ts`, `buildEmployeeFromInput`. Hàm chỉ đọc `profile.name`, `name`/`fullName` hoặc `familyName/givenName` ở gốc thân.
- FE hiện chưa gọi `POST /employees`, vì màn Nhân sự chưa có nút thêm. Lỗi sẽ lộ ra khi nối nút đó, nếu FE gửi đúng dạng `GET` trả về.
- Test: *POST /employees with the profile shape that GET returns keeps the name*.

**BUG-staff-3 — nút Đăng nhập luôn bật.**
- Tái hiện: mở `/dang-nhap`, để trống hai ô. Nút vẫn bấm được; bấm xong mới báo "Nhập tên đăng nhập và mật khẩu."
- Đúng phải là: ô trống thì nút mờ (luật "chặn trước, không báo lỗi sau" của dự án).
- File nghi ngờ: `web/src/views/auth/LoginView.vue`.
- Test: *the login button is not offered while a field is empty*.

**BUG-staff-4 — nút Đổi mật khẩu luôn bật.**
- Tái hiện: mở `/nv/toi?hop=doi-mat-khau`, nhập mật khẩu mới 5 ký tự. Nút vẫn bấm được; bấm xong mới báo.
- Đúng phải là: còn ô trống, mật khẩu mới dưới 6 ký tự hoặc ô nhập lại không khớp thì nút mờ.
- File nghi ngờ: `web/src/components/shell/ChangePasswordDialog.vue`.
- Test: *the password form does not offer Đổi mật khẩu while it is incomplete*.

**BUG-staff-5 — nút "Tạo tài khoản" ở Phân quyền › Tài khoản không làm gì.**
- Tái hiện: bấm nút; không có hộp thoại nào mở, URL không đổi.
- Đúng phải là: mở luồng tạo tài khoản, hoặc ẩn nút khi chưa có luồng (thao tác không làm được thì không hiện).
- File nghi ngờ: `web/src/views/admin/settings/PermAccountsView.vue`, dòng 99: nút không có `@click`.
- Test: *the Tạo tài khoản button does something when clicked*.

**BUG-staff-6 — `GET /system/audit?to=9999-12-31` trả 500.**
- Tái hiện: ngày 9999-12-31 qua được bước kiểm ngày. Ngày kế tiếp là năm 10000, `toISOString()` ném `RangeError: Invalid time value`.
- Đúng phải là: 400 (ngày ngoài khoảng nhận được) hoặc 200 với danh sách đúng.
- File nghi ngờ: `src/modules/audit/domain/audit-query.ts`, `vnDayStart` và `nextDay` (dòng 19–28), được gọi từ `parseAuditQuery`.
- FE không chặn được trường hợp này: ô ngày của Nhật ký nhận năm 9999.
- Test: */system/audit with a far-future end date is not a 500*.

**BUG-staff-7 — `PUT /system/settings/:key` không có `value` trả 500.**
- Tái hiện: `PUT /api/v2/system/settings/demo_staff_empty` với thân `{}`. PostgreSQL báo `syntax error at end of input`.
- Đúng phải là: 400 với mã lỗi.
- File nghi ngờ: `src/modules/system/system.controller.ts:36` truyền `body.value` không kiểm; `src/modules/system/system.service.ts:25`, `setSetting`.
- Test: */system/settings refuses a write without a value…*.

**BUG-staff-8 — đổi vai trò Nhân viên → Admin ở Tài khoản không có tác dụng.**
- Tái hiện:
  - ở Phân quyền › Tài khoản, chọn "Quản trị viên (Admin)" cho Đinh Văn Trò (ns-vaitro);
  - màn báo "Đã đổi vai trò của Đinh Văn Trò thành Quản trị viên (Admin)";
  - ns-vaitro đăng nhập lại: `/auth/me` vẫn trả `role: 'staff'`, `caps` rỗng.
- Nguyên nhân:
  - FE (`nextRoles`) giữ `staff` làm "cờ hưởng lương" và gửi `account.roles: ['staff', 'admin']`;
  - BE (`toRow`) ghi `staff.role = roles[0]`, tức `staff`;
  - đăng nhập và `capsOf` đọc cột `staff.role`, không đọc `staff_roles`.
  - Sau khi tải lại, bảng Tài khoản đọc `staff_roles` nên lại hiện "Admin", lệch với quyền thật.
- Đúng phải là: người được đổi sang Admin có quyền Admin (spec fe-be-auth-foundation, D3 và 5.2).
- File nghi ngờ:
  - `src/modules/employees/employees.repository.ts`, `toRow`, dòng `role: employee.account.roles[0] || 'staff'`;
  - `web/src/builders/admin-perm/accounts.ts`, `nextRoles`.
  - Cần chốt bên nào là chuẩn: vai trò chính là phần tử đầu tiên, hay vai trò khác `staff`.
- Chiều ngược lại (Admin → Nhân viên) gửi `['staff']` nên chạy đúng. Test trả ns-vaitro về Nhân viên trong `finally`.
- Test: *changing a role from Tài khoản moves the person between the Admin and staff areas*.

**Đã biết, không tính là lỗi mới:**
- `EmployeesRepository.toRow` luôn ghi `payroll_subject: 1`. Admin được sửa hồ sơ qua `PUT /employees` vì vậy thành "thuộc bảng lương". Spec fe-be-auth-foundation, bảng rủi ro, đã ghi nhận: "sửa khi nối màn Nhân sự Admin".
- `deactivate` ghi ngày nghỉ việc bằng `new Date().toISOString().slice(0, 10)`, tức là ngày UTC. Từ 0h đến 7h sáng giờ Việt Nam, ngày ghi sẽ là ngày hôm trước. Mảng này không chạy test vào khung giờ đó nên chưa tái hiện được. Main aaa14d9 vẫn dùng cách tính này; ghi lại để phiên sửa BE xem.

## Đã sửa ở main aaa14d9

Kiểm lại trên `claude/demo-db` 0bc17d9 (đã gộp main aaa14d9), lượt chạy ngày 05/11/2026.

- **BUG-staff-2 — trạng thái `tts`, `ctv`, `nghiviec` không được lưu.** Đã sửa ở 58081d3 "fix(employees): store all five staff statuses". Hai test (tình huống 4, 5) bỏ `test.fail` và chạy xanh: ns-giang đọc lại `nghiviec`, danh sách ghi "Đã nghỉ việc"; ns-binh, ns-chau đọc lại `tts`, `ctv`; `/nv/toi` của ns-binh ghi "Thực tập".
- **Không phải lỗi, nay chặn rõ:** `POST` trùng username và `PUT` đổi username/uuid trả 400 `BAD_EMPLOYEE_INPUT`. Trước đó `POST` trùng cũng bị từ chối, nhưng test chỉ đòi một mã 4xx. Nay tình huống 9 assert đúng mã 400 này, cho cả ba trường hợp.
- **Nhật ký có dữ liệu thật:** nhân sự (`staff.*`, `password.reset`), chức vụ và bậc (`position.save`, `level.save`) đã ghi. Tình huống 28, 29, 37, 37a–37c kiểm các dòng này.

## Câu hỏi luật

**Q1 — Admin có được tự đổi vai trò của chính mình ở Phân quyền › Tài khoản không?**
- Bối cảnh: ở bảng Tài khoản, dòng của chính Admin có nhãn "Bạn" và không có nút Khoá. Nhưng ô "Vai trò của …" ở dòng đó vẫn chọn được "Nhân viên (Staff)". BE (`PUT /employees/:username`) cũng không chặn.
- luong-app: chưa đối chiếu.
- Ví dụ: tài khoản admin duy nhất của công ty tự chọn "Nhân viên (Staff)". Ngay sau đó admin mất mọi quyền Admin (`caps` rỗng), và không còn ai mở được Cài đặt để đổi lại.
- Lựa chọn:
  - (1) khoá ô vai trò ở dòng của chính mình, như nút Khoá;
  - (2) cho đổi, nhưng chặn khi đó là Admin cuối cùng;
  - (3) để như hiện tại.
- Test chưa thử thao tác này, vì nó sẽ hỏng tài khoản admin dùng chung của mọi mảng.

**Đã có câu hỏi mở ở spec khác, mảng này không hỏi lại:**
- Tài khoản bị khoá (chưa nghỉ việc) hiện "Tạm nghỉ" ở danh sách Nhân sự. Ví dụ: Admin khoá tài khoản ns-khoa (người vẫn đang làm); danh sách ghi "Tạm nghỉ", và "Nhân sự đang làm" vẫn đếm người này.
- Xem câu hỏi 15 và mục "Nhân sự đang làm có tính người Tạm nghỉ…" ở [spec danh sách nhân sự](../superpowers/specs/2026-11-04-admin-staff-list-design.md). Test chỉ kiểm số đếm khớp dữ liệu (b), không kiểm nhãn này.

## Chưa phủ

| Phần | Vì sao | Khi nào phủ |
|---|---|---|
| Nhật ký: việc của mảng khác (ngày lễ, đơn từ, chấm công, lương) và ô Lý do | Mảng staff chỉ kiểm dòng của nhân sự, chức vụ, bậc (37a–37c, 28, 29). Ngày lễ, `request.decide`, `punch.correct`, `period.lock`, `payroll.*` thuộc mảng của các phiên demo khác. Màn Chế độ có ô Lý do nhưng test không điền, nên chưa kiểm cột Lý do. | Mảng tương ứng; Lý do khi cần. |
| Nhật ký: nhân viên tự đổi mật khẩu (`PUT /auth/password`) | Spec audit-log mục 6 không nói có ghi hay không, nên không assert. | Khi có luật. |
| Xử lý yêu cầu, Tất cả cài đặt, số đếm ở menu Cài đặt | FE đọc `/api/v2/settings/*`, BE v2 chưa có (phiên settings-store). Lượt chạy ngày 05/11 gặp 404 ở `GET /api/v2/settings/first-run` (mọi màn Cài đặt) và `GET /api/v2/settings/params` (Xử lý yêu cầu). Các 404 này được ghi vào chú thích "chưa phủ" của test, không tính lỗi. Test chỉ kiểm: không lỗi JS, không 5xx. | Sau phiên settings-store. |
| Tuần làm việc theo từng người, các luật settings-store đã chốt nhưng chưa lên `main` | Chưa có code; theo lời giao việc, không assert. | Sau phiên settings-store. |
| Vai trò (ma trận quyền) ở `/admin/cai-dat/phan-quyen` | BE v2 không có API ma trận vai trò; màn trống, không có thẻ. Test chỉ kiểm không lỗi JS, không 5xx. | Khi có spec và API vai trò. |
| Thêm, sửa, cho nghỉ việc nhân sự **trên giao diện** | Màn Nhân sự chưa có nút thêm, sửa, cho nghỉ (spec danh sách nhân sự, R4 để sau). Ba luồng này test qua HTTP (tình huống 7–12) và đọc lại trên ngăn kéo. | Khi nối các luồng R4. |
| Bậc, loại không có trong danh mục chức vụ | Chưa có luật: `POST /employees` với `type: 'nv', level: 9` (chưa có bậc 9) có được nhận không. Test không assert. | Khi có luật, hỏi cùng spec chức vụ. |
| `test/v2/demo-staff-*.test.ts` | Không cần: mọi tình huống đi được qua HTTP hoặc giao diện. | — |
