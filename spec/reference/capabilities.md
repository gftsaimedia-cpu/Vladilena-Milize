# Năng lực và vai trò

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `lib/authz.ts` (`CAPS`, `ROLE_CAPS`, `ROLE_SCOPE`, `DECIDE_ITEMS`). Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Nguồn: [`lib/authz.ts`](../../lib/authz.ts). Quyền kiểm theo *năng lực*; vai trò chỉ là tập năng lực kèm phạm vi. Vai trò tuỳ chỉnh lưu ở `settings` (`lib/roles.ts`).

## Năng lực (32)

`profile.read`, `profile.write`, `profile.read.pii`, `profile.sensitive.read`, `profile.sensitive.write`, `contract.read`, `contract.write`, `salary.read`, `salary.write`, `attendance.read`, `attendance.correct`, `attendance.lock`, `attendance.import`, `kpi.score.write`, `payroll.view`, `payroll.calculate`, `payroll.approve`, `payroll.override`, `payroll.pay`, `period.reopen`, `period.reopen.inputs`, `config.read`, `config.payroll`, `config.legal`, `config.profile`, `ai.review.read`, `ai.review.dismiss`, `audit.read`, `report.read`, `report.export`, `roles.manage`, `staff.lock`

## Loại khoản duyệt (`request.decide.<loại>`)

`isat`, `approved`, `makeup_day`, `ot`, `makeup_hours`, `holiday_work`, `leave`, `willmakeup`

## Vai trò mặc định

| Vai trò | Phạm vi | Năng lực |
| --- | --- | --- |
| `admin` | "all" | `profile.read` `profile.write` `profile.read.pii` `profile.sensitive.read` `profile.sensitive.write` `contract.read` `contract.write` `salary.read` `salary.write` `attendance.read` `attendance.correct` `attendance.lock` `attendance.import` `kpi.score.write` `payroll.view` `payroll.calculate` `payroll.approve` `payroll.override` `payroll.pay` `period.reopen` `period.reopen.inputs` `config.read` `config.payroll` `config.legal` `config.profile` `ai.review.read` `ai.review.dismiss` `audit.read` `report.read` `report.export` `roles.manage` `staff.lock` `request.decide.*` |
| `cb` | "all" | `profile.read` `contract.read` `salary.read` `salary.write` `attendance.read` `attendance.correct` `attendance.lock` `request.decide.*` `kpi.score.write` `payroll.view` `payroll.calculate` `payroll.approve` `payroll.override` `period.reopen` `config.read` `config.payroll` `ai.review.read` `ai.review.dismiss` `audit.read` `report.read` `report.export` |
| `accounting` | "all" | `profile.read` `profile.sensitive.read` `salary.read` `payroll.view` `payroll.pay` `config.read` `config.legal` `audit.read` `report.read` `report.export` |
| `hr` | "all" | `profile.read` `profile.write` `contract.read` `contract.write` `attendance.read` `request.decide.leave` `report.read` `report.export` |
| `manager` | "team" | `profile.read` `attendance.read` `request.decide.*` `report.read` |
| `staff` | "self" | `profile.read` `attendance.read` `salary.read` `payroll.view` `contract.read` |
