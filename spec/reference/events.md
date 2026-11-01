# Sự kiện thời gian thực (SSE)

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `src/platform/events.ts` (`EVENTS`, `SYSTEM_FRAMES`, `emit`). Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Luồng `GET /api/events` (module `system`) chỉ gợi ý nạp lại, không mang dữ liệu. Phát SAU KHI giao dịch đã COMMIT.

## Sự kiện (11)

| Khoá | Tên sự kiện |
| --- | --- |
| `params.changed` | `{"audiences":["all"],"tiers":[{"name":"full","cap":"config.read","fields":["configRev","fromMonth","kind","groups","by"]},{"name":"short","fields":["configRev","fromMonth"]}]}` |
| `period.changed` | `{"audiences":["all"],"tiers":[{"name":"full","cap":"payroll.view","fields":["month","status","rev"]},{"name":"short","fields":["month","stage"]}]}` |
| `approvals.changed` | `{"audiences":["cap"],"tiers":[{"name":"queue","cap":"request.decide.*","fields":["month","pending"]}]}` |
| `attendance.changed` | `{"audiences":["cap"],"tiers":[{"name":"queue","cap":"attendance.correct","fields":["kind","month"]}]}` |
| `request.decided` | `{"audiences":["users"],"tiers":[{"name":"self","fields":["month","date","decision","kind"]}]}` |
| `punch.corrected` | `{"audiences":["users"],"tiers":[{"name":"self","fields":["month","date"]}]}` |
| `punch.changed` | `{"audiences":["users"],"tiers":[{"name":"self","fields":["month","date"]}]}` |
| `estimate.changed` | `{"audiences":["users"],"tiers":[{"name":"self","fields":["month"]}]}` |
| `payslip.available` | `{"audiences":["users"],"tiers":[{"name":"self","fields":["month"]}]}` |
| `roles.changed` | `{"audiences":["users"],"tiers":[{"name":"self","fields":[]}]}` |
| `announcement.posted` | `{"audiences":["all"],"tiers":[{"name":"all","fields":["id"]}]}` |

## Khung hệ thống

`0`, `1`, `2`

## Hàm phát (`events.emit`)

`advanceDecided`, `approvalsChanged`, `attendanceChanged`, `estimateChanged`, `paramsChanged`, `payslipAvailable`, `periodChanged`, `punchChanged`, `punchCorrected`, `requestsDecided`, `rolesChanged`
