# DB demo và test toàn app trên BE thật — thiết kế

- Ngày: 2026-11-05
- Nhánh: `claude/demo-db`, tách từ `main` @ 6dcce9e
- Trạng thái: **đã duyệt** (người dùng, trong chat, 2026-11-05). Lệnh và tên file thật xem `docs/demo-db/README.md`:
  - lệnh là `npm run demo -- db | serve | test [mảng]`;
  - spec đặt tên `web/tests/api/demo-<mảng>-*.spec.ts`, để không trùng `staff-app.spec.ts` có sẵn;
  - người của mỗi mảng nằm ở `scripts/demo/people/<mảng>.ts`.
- Loại: Architectural (hệ thống con mới: dữ liệu demo và bộ test đầu-cuối)

## 1. Mục tiêu

1. **Một DB demo `luong_demo` dùng chung cho app Admin và app nhân viên.**
   - Có 1 tài khoản `admin` và nhiều tài khoản nhân viên.
   - Đủ dữ liệu 3 tháng để bấm thử mọi màn.
2. **Một bộ test chạy trên BE thật và PostgreSQL thật**, phủ các trường hợp mỗi màn có thể gặp.
3. **Chia 4 phiên.** Mỗi phiên đọc code của một mảng, rồi viết seed và test cho mảng đó.

## 2. DB demo

- **Container:**
  - Tên `luong-demo-pg`, image `postgres:16`.
  - Mở ở `127.0.0.1:55480`, auth `trust`, chỉ nghe localhost.
  - Dùng chung cho mọi phiên. Không phiên nào được xoá container này.
- **Lệnh dựng: `node --import tsx scripts/demo/run.ts db [tên-db]`.** Tên mặc định là `luong_demo`. Lệnh làm lần lượt:
  - xoá DB đó rồi tạo lại từ `migrations/postgres/schema.sql`;
  - bật một BE tạm trên DB đó;
  - seed dữ liệu;
  - tắt BE tạm.
- **Lệnh mở app: `node --import tsx scripts/demo/run.ts serve`.** Lệnh bật BE ở cổng 3370 và FE ở cổng 5170, cả hai trỏ vào `luong_demo`.
- **Cách seed:**
  - Gọi HTTP API của BE, như thao tác trong app. Ví dụ:
    - tạo nhân sự: `POST /employees`;
    - chấm công quá khứ: `POST /attendance/punches`;
    - đơn và duyệt đơn: `/requests`;
    - tính lương: `POST /payroll/:month/calculate`.
  - Chỉ ghi SQL thẳng khi không có route nào làm được. Mỗi chỗ như vậy ghi rõ trong tài liệu của mảng.
- **Ngày:**
  - Tính theo giờ Việt Nam lúc chạy, gồm tháng hiện tại (tới hôm nay), tháng trước và tháng trước nữa.
  - Không viết cứng ngày, để DB luôn đúng với hôm nay.
- **Tài khoản:**
  - Gồm `admin` và các nhân viên có username cố định, khai trong `scripts/demo/people.ts`.
  - Mật khẩu sinh ngẫu nhiên ở lần chạy đầu, lưu ở `deploy/demo/accounts.local`. File này git bỏ qua theo luật `deploy/**/*.local`.
  - Không in mật khẩu ra màn hình, không commit. Bạn mở file đó để lấy tài khoản đăng nhập.

## 3. Test

- **Test giao diện với BE thật:**
  - Playwright, file `web/tests/api/<mảng>-*.spec.ts`.
  - Chạy bằng `node --import tsx scripts/demo/run.ts test <mảng>`. Lệnh này dựng DB của mảng, bật BE và vite ở cổng riêng của mảng, rồi chạy spec của mảng.
  - Không có `<mảng>` thì chạy hết.
- **Không giẫm dữ liệu của nhau:**
  - Mỗi người trong `people.ts` thuộc đúng một mảng.
  - Spec chỉ được sửa dữ liệu của người thuộc mảng mình.
  - Màn tổng hợp (tổng quan, bảng lương, bảng công) tính kỳ vọng từ dữ liệu đã seed, không viết cứng con số.
- **Trường hợp không đi qua giao diện được** thì viết test real-PG ở `test/v2/demo-<mảng>-*.test.ts` (chạy bằng `npm test`).
- **Được assert ba loại:**
  - **(a) Luật đã chốt:** memory `attendance-day-rules-confirmed`, `staff-requests-flow-decisions`, `settings-store-decisions`, `payroll-period-lifecycle-decisions`, `advance-rule-confirmed`, `leave-type-vs-reason`, cùng các spec đã duyệt trong `docs/superpowers/specs/`.
  - **(b) Bất biến của app:**
    - không route nào trả 500;
    - trang không lỗi console;
    - cùng một con số thì giống nhau giữa các màn. Ví dụ: phiếu lương Admin xem bằng thu nhập nhân viên xem; tổng phiếu bằng tổng các dòng.
  - **(c) Ngăn trước, không báo lỗi:** thao tác không hợp lệ thì không được hiện ra cho người dùng bấm.
- **Hành vi không thuộc (a)–(c)** thì không assert. Ghi thành câu hỏi trong `docs/demo-db/<mảng>.md`, kèm tình huống, hiện trạng và một ví dụ có số.

## 4. Lỗi tìm thấy

- Phiên giai đoạn này **không sửa code BE (`src/`) hay FE (`web/src/`)**. Nhiều nhánh khác đang sửa các file đó:
  - settings-store, staff-requests, payslip-print;
  - attendance-core, payroll-period, audit-wiring;
  - các nhánh FE-lead.
- **Mỗi lỗi:**
  - Giữ test, đánh dấu `test.fail(true, 'BUG-<mảng>-<n>: …')`.
  - Ghi vào `docs/demo-db/<mảng>.md`: cách tái hiện, kết quả đúng theo luật nào, file nghi ngờ.
- **Seed bị lỗi BE chặn:** ghi lỗi, đi vòng bằng SQL nếu được (có ghi chú), rồi làm tiếp.
- **Sau khi 4 phiên xong:** mình gom lỗi theo file, rồi đề xuất phiên sửa. Ưu tiên phiên đang giữ file đó.

## 5. Phần nền (mình làm trước khi mở phiên)

- **Trong `scripts/demo/`:**
  - `run.ts`: các lệnh `db`, `serve`, `test`;
  - `db.ts`: dựng và xoá DB;
  - `api.ts`: đăng nhập theo tên người, gọi route, báo lỗi rõ;
  - `people.ts`: danh sách người, có cột `area`;
  - `seed.ts`: gọi lần lượt `areas/staff.ts` → `attendance.ts` → `requests.ts` → `payroll.ts`. Bốn file này để sẵn, rỗng.
- **`web/tests/api/fixtures/demo.ts`:** đọc tài khoản, cung cấp `signIn(page, ai)` và `apiAs(request, ai)`.
- **Một spec mẫu `demo-smoke.spec.ts`:** admin và một nhân viên đăng nhập được.
- **Kiểm:** `run.ts db` dựng được `luong_demo`, `run.ts test smoke` xanh.

## 6. Bốn phiên

Mỗi phiên chỉ sửa file của mình:
- `scripts/demo/areas/<mảng>.ts`;
- người của mảng trong `people.ts` (thêm vào khối của mình);
- `web/tests/api/<mảng>-*.spec.ts`;
- `test/v2/demo-<mảng>-*.test.ts`;
- `docs/demo-db/<mảng>.md`.

| Phiên | Màn và luồng | DB thử / BE / vite |
|---|---|---|
| **staff**: Nhân sự, chức vụ, đăng nhập và quyền | `/admin/nhan-su` (thêm, sửa, nghỉ việc, hợp đồng nv/ctv/tts, thử việc); `/admin/cai-dat/che-do`, `chuc-vu-bac`, `phan-quyen*`, `tat-ca`, `nhat-ky`; `/dang-nhap`, đổi mật khẩu, tài khoản khoá; nhân viên gọi route Admin; `/nv/toi` | `luong_demo_staff` / 3371 / 4271 |
| **attendance**: Chấm công và lịch | `/admin/cham-cong/*` (`hom-nay`, `bang-cong`, `ca-lam`, `gio-ot`, `sua-gio`, `phep-con-lai`, `nhan-vien/:id`); chốt công; `/admin/cai-dat/lich` (ngày lễ); `/nv/hom-nay` (check-in/out); `/nv/cham-cong`. Các ca Normal/Flex/Night, đi trễ, về sớm, thiếu giờ chấm, ngày lễ, Chủ nhật, thứ Bảy | `luong_demo_attendance` / 3372 / 4272 |
| **requests**: Đơn từ | Mọi loại đơn (nghỉ, nghỉ làm bù, đổi ca, OT, giải trình, tạm ứng, iSAT) × chờ / duyệt / từ chối / huỷ; `/admin/yeu-cau`, `moi-thang`; `/admin/tong-quan` (thẻ duyệt và các thẻ khác); chuông; tab chờ duyệt ở chấm công; `/nv/yeu-cau` | `luong_demo_requests` / 3373 / 4273 |
| **payroll**: Lương | `/admin/bang-luong`; ngăn kéo phiếu; KPI (`/admin/kpi*`, `/admin/cai-dat/kpi`); duyệt và từ chối phiếu; `/in/phieu-luong*`; `/nv/thu-nhap` (tạm tính và chính thức); tạm ứng trừ vào phiếu; từng loại nhân sự và bậc | `luong_demo_payroll` / 3374 / 4274 |

**Cách làm của mỗi phiên:**
1. Đọc FE (màn, `services/`, `builders/api/`) và BE (controller, service, `domain/`) của mảng.
2. Lập bảng tình huống trong `docs/demo-db/<mảng>.md`: tình huống → người seed → tên test → loại assert (a), (b) hay (c).
3. Viết seed, rồi test.
4. Chạy `run.ts test <mảng>` cho tới khi xanh. "Xanh" ở đây gồm cả các test `test.fail` của lỗi đã ghi.

Bảng tình huống ở bước 2 thay cho plan. **Phiên không chờ duyệt plan riêng**, chỉ dừng hỏi khi cần luật chưa chốt. Đây là ngoại lệ so với CLAUDE.md mục 3, áp dụng khi bạn duyệt spec này.

**Dùng chung worktree:**
- Ổ đĩa còn khoảng 15 GB, mà mỗi worktree mới cần 5,4 GB. Vì vậy 4 phiên làm chung worktree này, trên nhánh `claude/demo-db`.
- Chỉ commit file của mình, bằng `git commit -m "…" -- <đường dẫn của mình>`. Gặp `index.lock` thì chờ rồi thử lại.
- Không chạy `checkout`, `switch`, `stash`, `reset`, `rebase`, `merge`, `push`.

## 7. Kết thúc

- Mình chạy toàn bộ:
  - `npm test`;
  - `npm --prefix web run test:ui`;
  - `run.ts test`, gồm cả 4 mảng.
- Báo cáo gồm:
  - số tình huống mỗi mảng;
  - danh sách lỗi BE/FE, xếp theo file;
  - các câu hỏi luật còn mở;
  - các màn hoặc route chưa có test.
- Gộp vào main chỉ khi bạn đồng ý.
- Các nhánh đang làm (settings-store, staff-requests, payslip-print, attendance-core, payroll-period, audit-wiring) gộp vào sau thì cần chạy lại bộ test này. Test nào đổi kỳ vọng thì do nhánh gây ra thay đổi đó sửa.

## 8. Ngoài phạm vi

- Sửa lỗi BE/FE: giai đoạn sau, theo danh sách ở mục 4.
- Dữ liệu lương thật; deploy; push.
- Bảo mật: khoá, token, phân quyền theo mức nhạy cảm (người dùng để sau).
- Kiểm tải và hiệu năng.
