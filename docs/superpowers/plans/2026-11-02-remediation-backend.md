# C — Hoàn thiện class/service và dependency injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Thực hiện inline, mỗi lát một test cycle và commit.

**Goal:** Khép mục tiêu G1/G4: mỗi nghiệp vụ có class chủ sở hữu, controller mỏng, dependency rõ ràng, không phụ thuộc container/singleton cũ.

**Architecture:** Giữ repository/driver PostgreSQL hiện tại. Trích class theo lát dọc với facade chuyển tiếp; provider Nest dựng các class domain không phụ thuộc Nest. Chỉ xoá facade sau khi đổi hết caller và có kiểm tra kiến trúc ngăn tái phát.

**Tech Stack:** TypeScript, NestJS, Kysely, pg/PGlite, Node test, esbuild/tsx hiện có.

**Spec:** [Thiết kế hoàn thiện](../specs/2026-11-02-remediation-design.md), các phần “Ranh giới kiến trúc”, “Giới hạn và nghiệm thu”; đọc [kế hoạch tổng](2026-11-02-remediation.md). Nhận baseline B và hành vi A đã hoàn tất.

## Global Constraints

- Giữ `Node >=22.13`, NestJS, PostgreSQL, Kysely và Vue hiện tại.
- Không đổi luật tiền, HTTP/permission/error contract, thứ tự cảnh báo hoặc giao dịch trong commit refactor.
- Domain không import NestJS/Express/`ApiContext`; constructor dùng port có kiểu, không nhận `STORE`/`DOMAIN` tổng hợp kiểu `any`.
- `UnitOfWork` bọc cơ chế sẵn có, giữ AsyncLocalStorage, nested savepoint và advisory lock. Không thay driver khi không có lỗi được chứng minh.
- Mỗi task thêm test trước, giữ facade tới lúc hết caller. Không commit thay đổi dang dở bằng cách nới trần kích thước/`any` hoặc bỏ test.
- Không xoá bảng lịch sử và không giải quyết TODO chính sách trong refactor.

## Review Focus

- Khoá KPI/check-in và hai request đồng thời trên pg.Pool: C1/C3/C6-KPI.
- Lỗi giữa cập nhật nghiệp vụ và audit: rollback cả hai, không SSE trước COMMIT: C1/C2/C5.
- `requestId` lặp, Check-out muộn và ca đêm qua tháng: C3.
- Một đồng lệch ở freeze/override/chi trả hoặc snapshot cũ thiếu khoá: C4/C5.
- Store đóng/mở lại, constructor giữ DB cũ hoặc vòng dependency: C1/C7.

## C1 — Chốt inventory, port và giao dịch có kiểu

**Files:** tạo `docs/superpowers/backend-ownership.md`, `src/domain/shared/unit-of-work.ts`, `src/core/store-unit-of-work.ts`, `src/core/ports.ts`, `test/unit/unit-of-work.test.ts`, `test/unit/backend-ownership.test.ts`; sửa `src/core/core.module.ts`, `src/core/tokens.ts`.

**Interfaces:** `UnitOfWork.run<T>(work: () => Promise<T>): Promise<T>`. `StoreUnitOfWork` nhận hàm lấy store hiện hành, không chụp kết nối lúc import. `Clock` có `nowIso(): string`, `vnToday(): string`. Port repository dùng row/DTO có kiểu từ `src/data`, không lộ `queryBuilder` lên controller. Actor/audit/permission port có interface theo dữ liệu thật đang dùng, không đưa req/res vào domain.

- [ ] Ghi inventory mọi file trong `src/domain`, `src/params`, `src/platform` và mọi controller: class hiện có, owner đích C2–C7, caller, test, ngoại lệ hàm thuần. Không để một dòng “sẽ tính sau”; file mới phải có owner khi thêm.
- [ ] Viết test đỏ kiểm inventory bao phủ toàn bộ danh sách file và chỉ ra entry giả/mất file. Ngoại lệ thuần phải có lý do, không được đọc store, mutate DB hoặc dùng HTTP.
- [ ] Viết test UoW: lỗi hoàn tác audit + nghiệp vụ, lồng savepoint, hai giao dịch độc lập, store mở lại không dùng kết nối cũ. Chạy RED trên PGlite; phần đồng thời còn chạy trên PG thử ở D.
- [ ] Thêm adapter UoW và port có kiểu; facade `store.transaction` vẫn dùng chung cơ chế, không mở giao dịch thứ hai từ Kysely.
- [ ] Chạy test mới, architecture, require-cycles và typecheck. Commit: `refactor(core): define typed ports and transaction ownership`.

## C2 — ApprovalService và luồng quyết định khoản tự khai

**Files:** tạo `src/domain/approvals/approval-service.ts`, `approval-store.ts`, `approval-types.ts` trong cùng thư mục; sửa `approvals.ts`, `index.ts`, `src/platform/db.ts`, `src/modules/approvals/approvals.controller.ts`, `approvals.helpers.ts`, `approvals.module.ts`.

**Interfaces:** `ApprovalStore` thay factory hiện tại, giữ các method `declaredItems`, `reconcile`, `list`, `get`, `forSheet`, `decide`; `ApprovalService.decide(command, actor)` nhận command `{ action:'approve'|'reject', items:Array<{username,date,rev,fingerprint}>, note?:string }`, trả `{ decided, items }` cùng payload hiện tại. Constructor nhận store/repository port, UoW, quyền, clock, audit và event publisher.

- [ ] Thêm characterization test cho các output hiện có của store và test service: rev/fingerprint cũ, thiếu quyền ở một người, iSAT sai thứ/quyền lợi, lô có một lỗi rollback tất cả, cảnh báo tự duyệt giữ nguyên.
- [ ] Chạy RED khi gọi class/service chưa có; trích object factory thành class và chuyển khối kiểm iSAT/quyền/giao dịch/audit khỏi controller, không đổi thứ tự lỗi.
- [ ] Provider đăng ký trong ApprovalsModule; controller chỉ parse HTTP, gọi service, trả DTO. Facade cũ delegate cùng instance cho script/test tới C7.
- [ ] Chạy test approvals, approvals-limits/leave/holiday-work, permissions matrix, UoW, typecheck và full suite theo baseline B. Commit: `refactor(approvals): extract typed approval services from controllers`.

## C3 — AttendanceService và lưu phiên chấm công

**Files:** tạo `src/domain/attendance/attendance-service.ts`, `attendance-session-store.ts`, `attendance-queries.ts`, `attendance-types.ts`; sửa `attendance-sessions.ts`, `index.ts`, `session-view.ts`, `src/platform/db.ts`, `src/modules/attendance/attendance.controller.ts`, `attendance.helpers.ts`, `attendance.module.ts`.

**Interfaces:** `AttendanceSessionStore` giữ method công khai của factory cũ (kể cả idempotency/purge); `AttendanceService.punch(command, actor)` nhận payload punch đã có kiểu và metadata IP qua DTO, không nhận req. Cùng service sở hữu `closeStale`, `closeStaleFor`, `sessionOverlap`; `AttendanceQueries` trong `attendance-queries.ts` sở hữu các query/view chỉ đọc, tách khỏi thao tác ghi.

- [ ] Viết characterization/RED cho requestId gửi lại trả cùng kết quả; hai Check-in chỉ tạo một phiên; Check-out sớm/muộn, ngoài GPS, ca đêm qua tháng, phiên Admin chưa đến giờ kết thúc. Giữ cả thứ tự cảnh báo và request log.
- [ ] Trích class, giữ advisory lock đầu giao dịch, truyền `Clock`; tái sử dụng `CheckinEntitlement`, `SessionStatus`, `PunchExplanation`, `LateCheckout` hiện có.
- [ ] Đăng ký provider ở AttendanceModule, chuyển đọc/ghi khỏi controller/helpers; facade cũ chỉ delegate trong giai đoạn chuyển tiếp.
- [ ] Chạy test `checkin*`, `punch*`, `schedule-punch`, `today-overnight`, explanation, session supersede và UoW; test đồng thời pg.Pool ở D. Commit: `refactor(attendance): move punch workflows into domain services`.

## C4 — PayrollService nạp đầu vào và tính lương

**Files:** sửa `src/domain/payroll/payroll-service.ts`, `index.ts`; tạo `src/domain/payroll/payroll-types.ts`, `test/unit/payroll-service-contract.test.ts`; sửa caller trong `src/domain/period/periods.ts`, `src/params/save.ts`.

**Interfaces:** class `PayrollService` giữ `loadInputs(month, options)`, `computeFor(month, staff, inputs, params, options)`, `payrollPeople`, `kpiSlipCells`. Các hàm thuần `digestOf`, `contextOf`, `estimateDays`, `engineFor`, `paramsFor`, `thanhPhanOf` có thể tiếp tục export qua API công khai; inventory phải ghi lý do. Constructor nhận port dữ liệu, params resolver, engine factory, lịch/leave/advance/explanation service cụ thể.

- [ ] Thêm test hợp đồng trước/sau trên cùng snapshot: DTO đầu vào, digest, tiền từng dòng, tổng, params thiếu khoá và thứ tự người. Clone dữ liệu để kiểm cả việc không mutate input.
- [ ] Chạy RED với class mới; trích class và thay singleton import bằng constructor. Không đổi engine, số lần làm tròn hoặc cách áp `advanceApproved`.
- [ ] Chạy `payroll-service-contract`, engine invariants, pay-tail-default-differential, payroll golden và các test settings preview/period; so số nguyên đồng và snapshot không đổi.
- [ ] Typecheck và commit: `refactor(payroll): inject dependencies into the payroll service`.

## C5 — PeriodService và trạng thái kỳ tách khỏi db.ts

**Files:** tạo `src/domain/period/period-service.ts`, `period-queries.ts`, `period-store.ts`, `period-types.ts`, `src/domain/payroll/payroll-run-store.ts`; sửa `periods.ts`, `src/platform/db.ts`, `src/modules/periods/periods.controller.ts`, `periods.helpers.ts`, `periods.module.ts`.

**Interfaces:** `PeriodService` sở hữu `lockAttendance`, `calculate`, `approve`, `markPaid`, `reopen`, `decidePayslips` tương thích; `PeriodQueries` sở hữu các method đọc đang export từ `periods.ts`. `PeriodStore`/`PayrollRunStore` nhận repository port và UoW, thay object `periodStore`/`payrollStore` trong db. `approve` vẫn nhận `{ rev, excludeErrors }` của A2.

- [ ] Viết characterization/RED cho chuỗi trạng thái, `reviewed` cũ, `rev` sai, tính lại, snapshot bất biến, override đóng băng, số âm cảnh báo, tự loại lỗi, ngày chi trả; kiểm không đổi một đồng.
- [ ] Chuyển luật trạng thái và ghi phiếu khỏi db singleton; giữ `store.periods`/`store.payroll` như facade cùng instance tới C7. Không tự tạo thêm giao dịch quanh từng dòng làm mất atomicity.
- [ ] Controller inject hai service cụ thể, map HTTP vào DTO; chuyển format/assemble phiếu thành query class/hàm thuần có owner.
- [ ] Chạy toàn bộ test period/payslip, overrides, audit, rollback và E2E A2; typecheck. Commit: `refactor(periods): isolate payroll lifecycle and query services`.

## C6 — Hoàn tất từng nhóm module còn lại

Mỗi dòng là **một task riêng**, làm tuần tự theo thứ tự dưới; không gom cả bảng vào một commit. Mỗi task theo năm bước checkbox chung; tên class là đầu ra bắt buộc, ưu tiên tái sử dụng class đã có thay vì tạo bản thứ hai.

| Task                   | Nguồn sửa và file class đích                                                                                                                                                                                                              | Interfaces/owner đầu ra                                                                                                                                 | Test đặc thù phải có                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C6.1 Sheet/OT          | `src/domain/sheet*.ts`, `ot.ts`, `ot-sheet.ts`, `timesheet/services.ts`; tạo `timesheet/sheet-service.ts`, `overtime/overtime-service.ts`; module sheet/attendance                                                                        | `SheetService`: estimate/save/bulk/onBehalf; `OvertimeService`: list/declaration/payOnSheet; tái dùng validator/rules                                   | Bulk có một lỗi rollback, cảnh báo theo đúng thứ tự, OT lễ/ca đêm, đổi trần từ params tác động cả lưu lịch và đổi lễ.                       |
| C6.2 Advance           | `src/domain/advance/{advance-cap,advance-requests,index}.ts`, module advance; tạo `advance-service.ts`                                                                                                                                    | `AdvanceService` sở hữu cap/list/request/withdraw/approve; giữ `AdvanceApprovals`, `AdvanceRequestWindow`                                               | Đúng ngày Việt Nam 16/17, ngoài cửa sổ, chưa được duyệt không trừ ứng, rev và từ chối quyền.                                                |
| C6.3 Pay entries       | `src/domain/payroll/pay-entries.ts`, `src/domain/pay-entries.ts`, module pay-entries; tạo `payroll/pay-entry-service.ts`                                                                                                                  | `PayEntryService` giữ create/bulk/update/decide/void/confirmFlags/list; xoá handler HTTP domain sau hết caller                                          | Tax/insurance flags giữ nguyên, lô rollback, khoản approved bất biến, đã void không đổi lại; bỏ handler không làm mất route.                |
| C6.4 Hồ sơ/lịch/quyền  | `src/domain/{staff,positions,shifts,schedule}.ts`, `roles/roles.ts`, module staff/roles/employees/catalog/positions; tạo `employee/staff-service.ts`, `roles/role-service.ts`, `position/catalog-service.ts`, `shift/schedule-service.ts` | `StaffService`, `RoleService`, `CatalogService`, `ScheduleService`; dùng EmployeeDirectory/PositionCatalog/ShiftCatalog đã có                           | UUID/tên đăng nhập bất biến, giới hạn phạm vi dữ liệu, sửa vai trò không mất admin cuối, sửa catalog cùng rev rollback.                     |
| C6.5 Leave/explanation | `src/domain/leave-days.ts`, `leave/*`, `explanation/{explanations,late-checkout}.ts`, module leave/explanations                                                                                                                           | Provider riêng cho `LeaveAccountService`, `ExplanationService`, `LateCheckout`, `PunchExplanation`; facade hàm rời hết caller thì bỏ                    | Quyết định giải trình lỗi rev, không sửa lại phiếu đã duyệt, nghỉ sau giải trình bị từ chối, phép năm/tồn sổ không lệch.                    |
| C6.6 KPI               | `src/modules/kpi/kpi.controller.ts`, module KPI; tạo `src/domain/kpi/kpi-service.ts`                                                                                                                                                      | `KpiService` giữ đọc/ghi điểm, dùng `KpiScoring` hiện có, audit + lock + UoW                                                                            | Hai ghi cùng người/tháng, dữ liệu điểm sai, rollback audit, công thức/tiền KPI giữ nguyên.                                                  |
| C6.7 Settings/blocks   | `src/params/{save,store,blocks,positions,config-rev}.ts`, module settings/blocks; tạo `src/params/parameter-service.ts`, `parameter-resolver.ts`, `block-service.ts`                                                                      | `ParameterService` save/preview/revert/history; `ParameterResolver` resolve/view/firstRun; `BlockService`; registry/parser/formatter thuần giữ có lý do | ExpectedRev đồng thời, preview không ghi, save cả lô rollback, hash/digest, effectiveMonth, block formula vòng/không hợp lệ, tham số wired. |

Các DTO mới trong mỗi thư mục có tên `<miền>-types.ts`, giữ field/method của API hiện tại. Consumer còn dùng facade được cập nhật trong chính task; provider đăng ký trong `<module>.module.ts` tương ứng và export qua `index.ts` khi dùng chéo.

- [ ] Cho dòng hiện tại: viết test characterization từ test API/unit hiện có và thêm assertion đặc thù ở cột cuối; gọi class/provider mới để thấy RED đúng nguyên nhân.
- [ ] Trích class, đưa dependency qua constructor và tái dùng rule; đổi controller sang gọi service, không giữ hai bản logic.
- [ ] Chạy test miền hiện có và mới, typecheck, architecture/require-cycles; kiểm output snapshot/tiền so baseline.
- [ ] Cập nhật `backend-ownership.md` và ratchet theo số thực; nếu nguồn phụ thuộc nhiều module thì kiểm mọi caller trước khi xoá facade.
- [ ] Commit riêng `refactor(<miền>): complete domain service ownership`; mới chuyển dòng tiếp theo khi không có lỗi chưa phân loại.

## C7 — Composition root, hạ tầng và loại container/singleton còn lại

**Files:** `src/domain/container.ts`, `src/core/{tokens,core.module,ports}.ts`, `src/platform/{db,auth,authz,audit,events,request-rules}.ts`, `src/http/{api-gate,request-scope.interceptor}.ts`, module auth/audit/system.

**Create:** `src/core/domain-providers.ts`, `src/core/standalone-services.ts`; class owner `src/platform/auth-service.ts`, `authorization-service.ts`, `audit-service.ts`, `event-publisher.ts`, `request-rules-service.ts` cho nhóm thao tác có trạng thái; reuse implementation hiện có qua delegate trong lúc chuyển. Hằng config, crypto/HTTP utilities và công cụ ops thuần được ghi ngoại lệ cụ thể, không bọc class chỉ để đổi tên.

**Interfaces:** Nest và test/script cùng dùng composition factory nhận `database accessor`, UoW, clock; provider từng class cụ thể, không còn provider `DOMAIN` tổng hợp. `standalone-services` tạo và đóng dependency cho script/test mà không import Nest. Store facade chỉ giữ API tương thích được liệt kê với caller thật; không chứa luật nghiệp vụ.

- [ ] Viết test đỏ: tạo service hai lần ở hai DB thử không dùng lẫn dữ liệu; đóng/mở store xong mọi repository dùng đúng DB mới; Nest resolve từng provider không có vòng; HTTP guard/actor còn đúng quyền và session.
- [ ] Chuyển từng getter `Container` sang provider rồi cập nhật caller; chuyển singleton hạ tầng có trạng thái sang class owner. Auth/audit/system controller inject service, không inject store tổng hợp.
- [ ] `Container` chỉ được xoá khi tìm caller bằng import/require và sandbox/test/script đều hết; không đẩy vòng require sang factory lười để coi là đã sửa.
- [ ] Chạy test session/auth, permissions, audit/SSE, sandbox reset, backup/restore và toàn bộ kiến trúc; full suite. Commit: `refactor(core): replace legacy container with explicit service composition`.

## C8 — Cổng kiến trúc và tăng kiểm kiểu sau cùng

**Files:** `test/unit/architecture.test.ts`, `raw-sql-ratchet.test.ts`, `require-cycles.test.ts`, `file-size-budget.test.ts`; tạo `test/unit/service-boundaries.test.ts`, `tsconfig.domain.json`, `tsconfig.core.json`; sửa `package.json`, inventory và spec sau refactor.

**Interfaces:** thêm `typecheck:domain`/`typecheck:core` chạy với `strict:true`, `noImplicitAny:true` cho domain/service/core đã chuyển. Không bật strict đại trà cho test/web rồi rải ép kiểu; các import legacy còn lộ `any` phải có port/DTO tại biên. Backend ownership bao phủ mọi file hiện tại, mỗi ngoại lệ có lý do kiểm được.

- [ ] Viết test kiến trúc bằng AST: controller không gọi repository/UoW/raw SQL hoặc import singleton nghiệp vụ; không import ruột rule module khác; domain/data không phụ thuộc Nest/HTTP; không còn `Container` hay provider `DOMAIN`. Fixture vi phạm phải bị scanner bắt, tránh xanh giả vì chỉ scan `require` mà bỏ `import`.
- [ ] Với dependency graph, kiểm cả import/require/type-only và dynamic path tĩnh; tách cạnh type-only khỏi vòng runtime. Không thêm allowlist vòng để che provider cycle.
- [ ] Bật cấu hình strict cho từng tập đã chuyển, sửa DTO/port ở nguồn; `any`/`@ts-nocheck` mới không được dùng để làm xanh. Hạ ratchet khi xoá SQL/facade, không nâng trần.
- [ ] Chạy hai typecheck mới, root/web typecheck, architecture, full suite PGlite/PG thử và E2E A2; sinh lại spec và cập nhật đường dẫn service thật.
- [ ] Rà inventory: mọi row `src/domain`, nghiệp vụ `src/params`, hạ tầng có trạng thái và controller có owner class hoặc ngoại lệ hàm thuần được kiểm. Không gắn nhãn “toàn backend hoàn tất” nếu còn row chưa chuyển.
- [ ] Commit: `test(architecture): enforce typed service boundaries after migration`; chuyển cổng cuối D ở kế hoạch tổng.
