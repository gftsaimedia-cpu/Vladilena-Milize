// Seed của mảng 'payroll' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6). Chỉ phiên payroll sửa file này.
// Lúc hàm chạy, mọi người trong scripts/demo/people/payroll.ts đã có tài khoản và hợp đồng (POST /api/v2/employees).
// Gọi API như admin qua ctx.admin, hoặc như nhân viên qua `await ctx.api.as(username)`. Ngày lấy từ ctx.months
// (hôm nay, m0, m1, m2 theo giờ Việt Nam), không viết cứng. Chỉ ghi SQL thẳng khi không có route nào làm được,
// và ghi rõ chỗ đó trong docs/demo-db/payroll.md.
//
// Thứ tự: đơn nghỉ / OT (Admin nộp thay rồi duyệt) → chấm công quá khứ (Admin, POST /attendance/punches) → giải trình →
// tạm ứng → nghỉ việc → điểm KPI → tính lương m2, m1, m0 → duyệt phiếu. Kế hoạch từng người: payrollPlan() ở
// scripts/demo/people/payroll.ts. Mảng này không ghi SQL thẳng.
import type { DemoSession } from '../api';
import type { SeedContext } from '../seed';
import { payrollPlan, type PersonPlan } from '../people/payroll';

const VN = '+07:00';

async function uuidOf(admin: DemoSession, username: string): Promise<string> {
  const { employee } = await admin.get(`/employees/${encodeURIComponent(username)}`);
  const uuid = employee?.profile?.uuid;
  if (!uuid) throw new Error(`Không đọc được uuid của ${username}`);
  return uuid;
}

/** Lịch lễ của công ty trong các năm của DB demo (mảng khác có thể đã thêm ngày lễ). */
export async function companyHolidays(admin: DemoSession, years: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const year of [...new Set(years)]) {
    const { items = [] } = await admin.get(`/holidays?year=${year}`);
    for (const h of items) if (h?.date) out.add(String(h.date).slice(0, 10));
  }
  return out;
}

/** Admin chấm công thay cho một ngày đã qua: giờ vào và giờ ra theo giờ Việt Nam. */
async function punchDay(admin: DemoSession, uuid: string, date: string, inAt: string | null, outAt: string | null) {
  if (inAt) await admin.post('/attendance/punches', { employeeId: uuid, type: 'IN', workDate: date, punchedAt: `${date}T${inAt}:00${VN}` });
  if (outAt) await admin.post('/attendance/punches', { employeeId: uuid, type: 'OUT', workDate: date, punchedAt: `${date}T${outAt}:00${VN}` });
}

async function approve(admin: DemoSession, created: { request?: { id?: string } }) {
  const id = created?.request?.id;
  if (!id) throw new Error(`Tạo đơn không trả id: ${JSON.stringify(created)}`);
  await admin.patch(`/requests/${id}/review`, { action: 'APPROVE', note: 'Seed demo lương' });
}

async function seedPerson(admin: DemoSession, username: string, plan: PersonPlan): Promise<void> {
  const uuid = await uuidOf(admin, username);

  for (const l of plan.leaves) {
    const label = l.leaveType === 'ANNUAL' ? 'Phép năm' : 'Nghỉ không lương';
    await approve(
      admin,
      await admin.post('/requests/leave', {
        employeeId: username,
        title: label,
        reason: `${label} (seed demo lương)`,
        leaveType: l.leaveType,
        startDate: l.from,
        endDate: l.to
      })
    );
  }
  for (const o of plan.overtime) {
    await approve(
      admin,
      await admin.post('/requests/overtime', {
        employeeId: username,
        title: 'Làm thêm giờ',
        reason: 'OT (seed demo lương)',
        otDate: o.date,
        startTime: o.start,
        endTime: o.end
      })
    );
  }

  for (const d of plan.days) await punchDay(admin, uuid, d.date, d.in, d.out);

  for (const e of plan.explanations) {
    await approve(
      admin,
      await admin.post('/requests/explanation', {
        employeeId: username,
        title: 'Giải trình',
        reason: 'Giải trình (seed demo lương)',
        workDate: e.date,
        cases: e.cases,
        ...(e.actualCheckOut ? { actualCheckOut: e.actualCheckOut } : {})
      })
    );
  }

  if (plan.advance) {
    await approve(
      admin,
      // Số tiền, tiêu đề và lý do do server đặt: chỉ gửi nhân sự và kỳ.
      await admin.post('/requests/advance', { employeeId: username, period: plan.advance.month })
    );
  }

  if (plan.resignOn) {
    await admin.put(`/employees/${encodeURIComponent(username)}`, { contract: { status: 'nghiviec', resignedOn: plan.resignOn } });
  }

  for (const [month, kpi] of Object.entries(plan.kpi)) {
    await admin.put(`/payroll/${month}/kpi/${encodeURIComponent(username)}`, kpi);
  }
}

export async function seed(ctx: SeedContext): Promise<void> {
  const { admin, months, people, log } = ctx;
  const holidays = await companyHolidays(admin, [months.m2, months.m1, months.m0].map(m => m.slice(0, 4)));
  const plan = payrollPlan(months, holidays);

  for (const p of people) {
    await seedPerson(admin, p.username, plan[p.username]);
    log(`${p.username}: ${plan[p.username].days.length} ngày chấm công`);
  }

  // Tính lương cả kỳ cho ba tháng (lần chạy nháp; người của mảng khác cũng có phiếu trong lần chạy này).
  for (const month of [months.m2, months.m1, months.m0]) {
    const res = await admin.post(`/payroll/${month}/calculate`, {});
    const errors = (res.errors ?? []) as Array<{ employeeId: string; message: string }>;
    log(`tính lương ${month}: ${res.count} phiếu, ${errors.length} lỗi${errors.length ? ` (${errors.map(e => e.employeeId).join(', ')})` : ''}`);
  }

  for (const p of people) {
    for (const month of plan[p.username].approve) {
      await admin.post(`/payroll/${month}/${encodeURIComponent(p.username)}/decision`, { decision: 'approve' });
    }
  }
  log('đã duyệt phiếu theo kế hoạch');
}
