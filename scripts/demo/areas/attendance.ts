// Seed của mảng 'attendance' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6). Chỉ phiên attendance sửa file này.
// Lúc hàm chạy, mọi người trong scripts/demo/people/attendance.ts đã có tài khoản và hợp đồng (POST /api/v2/employees).
// Mọi dữ liệu đi qua API như thao tác trong app, không ghi SQL thẳng:
//   1. một ngày lễ công ty (POST /holidays) — thứ Tư thứ hai của tháng trước;
//   2. giờ chấm của các ngày đã qua (POST /attendance/punches, Admin chấm hộ) theo attendancePlan();
//   3. cc-nghi-viec nghỉ việc từ thứ Sáu thứ ba của tháng trước (PUT /employees/:username).
// Tháng m3 KHÔNG được chốt ở đây: test demo-attendance-period chốt công qua giao diện, để seed của các mảng sau không bị chặn.
import { attendancePlan, punchedAt, type PlannedDay } from '../people/attendance';
import type { SeedContext } from '../seed';

export async function seed(ctx: SeedContext): Promise<void> {
  const plan = attendancePlan(ctx.months);

  await ctx.admin.post('/holidays', { date: plan.holiday.date, name: plan.holiday.name });
  ctx.log(`ngày lễ ${plan.holiday.date}`);

  const uuid = new Map<string, string>();
  for (const p of ctx.people) {
    const { employee } = await ctx.admin.get(`/employees/${p.username}`);
    uuid.set(p.username, employee.profile.uuid);
  }

  // Mỗi người một chuỗi gọi tuần tự (giờ chấm trong ngày phải theo thứ tự); các người chạy song song.
  const byPerson = new Map<string, PlannedDay[]>();
  for (const d of plan.days) byPerson.set(d.username, [...(byPerson.get(d.username) ?? []), d]);
  let punches = 0;
  await Promise.all(
    [...byPerson.entries()].map(async ([username, days]) => {
      for (const d of days) {
        for (const p of d.punches) {
          await ctx.admin.post('/attendance/punches', {
            employeeId: uuid.get(username),
            type: p.type,
            workDate: d.date,
            punchedAt: punchedAt(d.date, p),
            note: `demo ${d.case}`
          });
          punches++;
        }
      }
    })
  );
  ctx.log(`${punches} lần chấm cho ${byPerson.size} người`);

  await ctx.admin.put('/employees/cc-nghi-viec', { contract: { status: 'nghiviec', resignedOn: plan.resignDate } });
  ctx.log(`cc-nghi-viec nghỉ việc từ ${plan.resignDate}`);
}
