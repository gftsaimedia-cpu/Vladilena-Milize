# G1 — Tách luật nghiệp vụ thành class (thiết kế)

Trạng thái: đã được ủy quyền thực hiện (xem `../PROGRAM.md`). Hành vi bên ngoài giữ nguyên; chỉ đổi cách tổ chức mã.

## Vấn đề
Luật nghiệp vụ nằm rải rác: cùng một trần OT tháng được kiểm ở `lib/domain/limits.js`, ở `server.js:holidayOtConflicts`, bị gán cứng trong test, spec và `public/payroll-params.js`. Đổi 40 thành 100 phải đụng khoảng 8 chỗ.

## Mục tiêu
1. Mỗi con số luật có **một nguồn đọc**: khoá tham số trong registry, đọc qua một class.
2. Mỗi luật là **một class nhỏ** (một lý do để đổi), đăng ký vào một `RuleSet`. Thêm luật = thêm class + một dòng đăng ký; service không sửa.
3. Gom theo **module nghiệp vụ** (`lib/domain/<module>/`), không theo tầng kỹ thuật.
4. Không đổi hành vi: toàn bộ `npm test` (3097 test) phải xanh sau mỗi bước.

## Kiến trúc
```
lib/domain/shared/rule.ts        Violation, Rule, RuleSet (block -> HttpError, warn -> warnIf)
lib/domain/<module>/             class nghiệp vụ + rules/ + index.js (API công khai của module)
lib/domain/<tên cũ>.js           mặt tiền mỏng (facade) giữ nguyên tên hàm xuất cũ, uỷ quyền cho class
```
- **Facade**: file hàm rời cũ giữ nguyên tên hàm xuất để call site và test cũ không đổi; thân hàm chỉ gọi class. G4 (NestJS) sẽ bỏ facade khi chuyển call site sang DI.
- **Nguồn con số**: `OtLimits.of(params)` đọc `law.ceiling.otDayTotalHours` / `law.ceiling.otMonthHours` từ bộ tham số của tháng, rơi về `DEFAULTS` khi bộ tham số không có khoá. Các hằng `DAY_HOURS_CAP`, `MONTH_OT_CAP` vẫn xuất (giá trị từ `DEFAULTS`) cho tương thích.
- **Luật trả kết quả có cấu trúc**: `Violation { code, severity: 'block'|'warn', message, details, status, consequence }`. `RuleSet.check(ctx)` duyệt theo thứ tự đăng ký: `block` ném `HttpError` ngay (giữ ngữ nghĩa "lỗi đầu tiên"), `warn` ghi qua `warnIf`.

## Phạm vi G1 theo lát cắt (mỗi lát một commit, test xanh)
| Lát | Module | Gom từ | Class chính |
|-----|--------|--------|-------------|
| 1 | `overtime` | `limits.js`, `work-hours.js`, phần so trần của `server.js` | `OtLimits`, `WorkedHours`, `DayHoursCapRule`, `MonthlyOtCapRule`, `IsatMonthlyLimitRule`, `SheetLimits` |
| 2 | `advance` | phần cửa sổ tạm ứng của `limits.js` | `AdvanceRequestWindow` |
| 3 | `kpi`, `geofence` | `kpi.js`, `geofence.js` | `KpiScoring`, `GeofencePolicy` |
| 4 | `timesheet` | `sheet*.js`, `ot*.js` | `TimesheetService`, … |
| 5 | `attendance`, `approval` | `attendance.js`, `approvals.js`, `ai-*.js` | `AttendanceService`, `ApprovalService` |
| 6 | controllers | các `handle` | `*Controller` mỏng |
Các lát 4–6 chốt chi tiết khi tới (đọc mã lúc đó); nếu một lát lộ độ phức tạp ẩn thì tách lát nhỏ hơn, ghi vào ledger.

## Kiểm thử
- Lưới an toàn: toàn bộ test hiện có.
- Mỗi class mới có test đơn vị riêng (không phụ thuộc DB).
- Test "một nguồn": đổi `law.ceiling.otMonthHours` trong bộ tham số thì cả kiểm lưu lịch lẫn kiểm xung đột ngày lễ theo số mới.

## Ngoài phạm vi
Đổi DB, async, framework, TypeScript (G2–G4); xoá facade (G4); sửa luật nghiệp vụ.
