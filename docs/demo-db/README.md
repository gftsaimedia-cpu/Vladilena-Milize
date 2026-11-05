# DB demo và test đầu-cuối

Spec: [2026-11-05-demo-db-e2e-design.md](../superpowers/specs/2026-11-05-demo-db-e2e-design.md).

## Lệnh

Chạy ở gốc repo. Cần Docker Desktop đang bật.

| Lệnh | Làm gì |
|---|---|
| `npm run demo -- db` | Dựng lại `luong_demo`: xoá DB, nạp `schema.sql`, rồi seed mọi mảng. Mảng nào seed lỗi thì ghi lại rồi làm tiếp mảng sau. |
| `npm run demo -- serve` | Mở app trên `luong_demo`: BE ở 3370, FE ở http://127.0.0.1:5170/dang-nhap. Chưa có DB thì dựng trước. Ctrl+C để tắt. |
| `npm run demo -- test <mảng>` | Dựng DB riêng của mảng, chỉ seed người của phần nền và của mảng đó, rồi chạy `web/tests/api/demo-<mảng>*.spec.ts`. Có thể thêm đối số Playwright, ví dụ `-g "phiếu"`. |
| `npm run demo -- test smoke` | Thử phần nền: admin và nhân viên mẫu đăng nhập được. |
| `npm run demo -- test` | Seed mọi mảng, chạy mọi spec trong `web/tests/api`. |

**Tài khoản:**
- Lưu ở `deploy/demo/accounts.local`. Git bỏ qua file này. File được sinh ngẫu nhiên ở lần chạy đầu, sau đó giữ nguyên.
- Admin dùng `DEMO_ADMIN_USER` / `DEMO_ADMIN_PASSWORD`.
- Mọi nhân viên demo dùng chung `DEMO_STAFF_PASSWORD`.
- **Không in, không commit, không dán vào chat.**

**Log BE** nằm ở `%TEMP%/luong-demo/<tên>-be.log`.

## DB và cổng

Mọi DB nằm trong container `luong-demo-pg` (127.0.0.1:55480). **Không ai được xoá container này.**

| Tên | DB | BE | vite |
|---|---|---|---|
| demo (serve) | `luong_demo` | 3370 | 5170 |
| build (db) | `luong_demo` | 3369 | — |
| smoke | `luong_demo_smoke` | 3379 | 4279 |
| staff | `luong_demo_staff` | 3371 | 4271 |
| attendance | `luong_demo_attendance` | 3372 | 4272 |
| requests | `luong_demo_requests` | 3373 | 4273 |
| payroll | `luong_demo_payroll` | 3374 | 4274 |
| all | `luong_demo_all` | 3375 | 4275 |

## File của mỗi mảng

Mỗi phiên chỉ sửa file của mình. Phần nền (`scripts/demo/*.ts`, `scripts/demo/people/index.ts`, `types.ts`, `smoke.ts`, `web/tests/api/fixtures/demo.ts`, `package.json`) không ai sửa. Cần đổi phần nền thì nhắn phiên điều phối.

| Mảng | Tiền tố username | File |
|---|---|---|
| staff | `ns-` | `scripts/demo/people/staff.ts`, `scripts/demo/areas/staff.ts`, `web/tests/api/demo-staff-*.spec.ts`, `test/v2/demo-staff-*.test.ts`, `docs/demo-db/staff.md` |
| attendance | `cc-` | `scripts/demo/people/attendance.ts`, `scripts/demo/areas/attendance.ts`, `web/tests/api/demo-attendance-*.spec.ts`, `test/v2/demo-attendance-*.test.ts`, `docs/demo-db/attendance.md` |
| requests | `dt-` | `scripts/demo/people/requests.ts`, `scripts/demo/areas/requests.ts`, `web/tests/api/demo-requests-*.spec.ts`, `test/v2/demo-requests-*.test.ts`, `docs/demo-db/requests.md` |
| payroll | `lg-` | `scripts/demo/people/payroll.ts`, `scripts/demo/areas/payroll.ts`, `web/tests/api/demo-payroll-*.spec.ts`, `test/v2/demo-payroll-*.test.ts`, `docs/demo-db/payroll.md` |

**Cách dùng phần nền:**
- **Seed:**
  - `ctx.admin` là phiên admin đã đăng nhập.
  - `await ctx.api.as('cc-binh')` để thao tác như nhân viên.
  - `ctx.months` cho biết `today`, `m0`, `m1`, `m2` theo giờ Việt Nam.
  - `ctx.people` là người của mảng đó.
  - Mảng không cần tạo tài khoản: phần nền đã tạo từ file người.
- **Test:**
  - Import từ `./fixtures/demo`: `demoReadyFor('<mảng>')`, `signIn(page, username)`, `apiAs(request, username, fn)`, `personNamed`, `demoMonths`.
  - Mỗi spec mở đầu bằng `test.skip(!demoReadyFor('<mảng>'), 'Chạy qua npm run demo -- test <mảng>')`.

## Luật viết test

- **Chỉ assert ba loại** (spec mục 3):
  - **(a)** luật đã chốt;
  - **(b)** bất biến: không có 500, không lỗi console, cùng một con số thì giống nhau giữa các màn;
  - **(c)** thao tác không hợp lệ thì không được hiện ra cho người dùng bấm.
- Chỉ sửa dữ liệu của người thuộc mảng mình. Con số ở màn tổng hợp thì tính từ dữ liệu đã seed, không viết cứng.
- **Gặp lỗi BE/FE:**
  - Giữ test, đánh dấu `test.fail(true, 'BUG-<mảng>-<n>: …')`.
  - Ghi lỗi vào `docs/demo-db/<mảng>.md`.
  - **Không sửa `src/` hay `web/src/`.**
- **Luật chưa chốt:** không assert. Ghi thành câu hỏi, kèm tình huống, hiện trạng và một ví dụ có số.
- **Git trong worktree dùng chung:**
  - Chỉ commit bằng `git commit -m "…" -- <file của mình>`.
  - Không chạy `checkout`, `switch`, `stash`, `reset`, `rebase`, `merge`, `push`.
  - Gặp `index.lock` thì chờ vài giây rồi thử lại.

## Mẫu `docs/demo-db/<mảng>.md`

```markdown
# <Mảng> — tình huống, lỗi, câu hỏi

## Tình huống
| # | Tình huống | Người (username) | Test | Loại assert |
|---|---|---|---|---|

## Ghi SQL thẳng (không có route)
- …

## Lỗi
### BUG-<mảng>-1: <một dòng>
- Tái hiện: …
- Đúng phải là: … (luật / bất biến nào)
- File nghi ngờ: …
- Test: `web/tests/api/demo-<mảng>-….spec.ts` › "<tên test>"

## Câu hỏi luật
### Q1: …
- Tình huống / Hiện tại v2 làm gì / Ví dụ có số

## Chưa phủ
- …
```
