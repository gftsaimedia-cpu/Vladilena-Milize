# G1 lát 1 — module `overtime` (kế hoạch)

Spec: `../specs/2026-10-31-g1-rules-as-classes-design.md`. Thực thi inline, mỗi bước chạy test liên quan, xong lát chạy `npm test` và commit.

1. `lib/domain/shared/rule.ts`: `Violation`, `Rule`, `RuleSet` + test `test/unit/rule-set.test.ts`.
2. `lib/domain/overtime/ot-limits.ts`: `OtLimits.of(params)` + test (đọc từ params, rơi về DEFAULTS, từ chối giá trị không phải số dương).
3. `lib/domain/overtime/worked-hours.ts`: `WorkedHours` (dayNet, extraSpan, monthOt, restOf, breakOf). Chuyển nguyên logic từ `limits.js`.
4. `lib/domain/overtime/rules/*`: `DayHoursCapRule`, `MonthlyOtCapRule`, `IsatMonthlyLimitRule`, đăng ký ở `sheet-limits.js` (`SheetLimits`).
5. `lib/domain/limits.js` thành facade: giữ mọi tên xuất cũ, uỷ quyền cho class.
6. `server.js:holidayOtConflicts` đọc trần qua `OtLimits.of(monthParams(month))`; `work-hours.js` giữ tên xuất cũ qua `WorkedHours`.
7. Test "một nguồn" (đổi trần trong params thì mọi nơi theo). `npm test` xanh, commit.
