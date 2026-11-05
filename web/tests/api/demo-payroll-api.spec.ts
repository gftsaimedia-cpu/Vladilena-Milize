// Lương trên BE thật: các route /api/v2/payroll và /api/v2/me/income, luật đã chốt và bất biến.
// Chạy qua `npm run demo -- test payroll` (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md, bảng tình huống
// docs/demo-db/payroll.md). Người 'lg-' và kế hoạch của họ (ngày chấm công, đơn, KPI, phiếu đã duyệt) ở
// scripts/demo/people/payroll.ts; ngày lấy theo hôm nay (giờ VN), không viết cứng.
// Lỗi đã biết: test.fail(true, 'BUG-payroll-<n>: …'); chi tiết ở docs/demo-db/payroll.md.
// Không tính lại cả kỳ m1 (sẽ đưa phiếu đã duyệt về Nháp): chỉ tính lại cả kỳ m0 hoặc một người của m1.
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PAYROLL, payrollPlan, type PersonPlan } from '../../../scripts/demo/people/payroll';
import { ADMIN, apiAs, demoMonths, demoReadyFor } from './fixtures/demo';

test.skip(!demoReadyFor('payroll'), 'Chạy qua npm run demo -- test payroll');

const json = { 'Content-Type': 'application/json' };
const M = demoMonths();
const MONTHS = [M.m2, M.m1, M.m0];
const LG = PAYROLL.map(p => p.username);

// Bậc lương trong migrations/postgres/schema.sql (dữ liệu nền của DB demo).
const BASE: Record<string, Record<number, number>> = {
  nv: { 1: 6_000_000, 2: 6_500_000, 3: 7_000_000, 4: 7_500_000 },
  ctv: { 1: 6_000_000, 2: 6_000_000, 3: 6_000_000, 4: 6_000_000 },
  tts: { 1: 1_000_000, 2: 1_500_000, 3: 2_000_000, 4: 3_000_000, 5: 4_000_000, 6: 5_000_000 }
};
const KPI_MAX: Record<string, Record<number, number>> = {
  nv: BASE.nv,
  ctv: { 1: 1_500_000, 2: 3_000_000, 3: 4_500_000, 4: 6_000_000 }
};
const STANDARD: Record<string, number> = { nv: 26, ctv: 26, tts: 22 };
const WEIGHTS = { wework: 40, user: 24, peer: 18, manager: 12, self: 6 } as const;
type Part = keyof typeof WEIGHTS;
const PARTS = Object.keys(WEIGHTS) as Part[];

type Line = { date: string; shiftCode: string; workHours: number; daySalary: number; deductionAmount: number; dailyTotal: number };
type Details = Record<string, any> & { dailyLines: Line[] };
type Slip = {
  username: string;
  status: string;
  gross: number;
  insurance: number;
  tax: number;
  advance: number;
  net: number;
  warnings: { code: string; fields?: string[] }[];
  details: Details;
};
type Res<T = any> = { status: number; body: T };

function client(request: APIRequestContext) {
  const call = async <T = any>(method: string, path: string, data?: unknown): Promise<Res<T>> => {
    const res = await request.fetch(`/api/v2${path}`, { method, headers: json, data: method === 'GET' ? undefined : (data ?? {}) });
    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // giữ chữ
    }
    return { status: res.status(), body };
  };
  return {
    get: <T = any>(path: string) => call<T>('GET', path),
    post: <T = any>(path: string, data?: unknown) => call<T>('POST', path, data),
    put: <T = any>(path: string, data?: unknown) => call<T>('PUT', path, data)
  };
}
type Client = ReturnType<typeof client>;
const as = <T>(request: APIRequestContext, username: string, fn: (api: Client) => Promise<T>) => apiAs(request, username, () => fn(client(request)));

const person = (u: string) => PAYROLL.find(p => p.username === u)!;
const typeOf = (u: string) => person(u).contract.position.type;
const levelOf = (u: string) => person(u).contract.position.level;
const baseOf = (u: string) => BASE[typeOf(u)][levelOf(u)];
const hourlyOf = (u: string) => baseOf(u) / STANDARD[typeOf(u)] / 8;
const near = (actual: number, expected: number, label: string, tol = 1) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} ≈ ${Math.round(expected)}`).toBeLessThanOrEqual(tol);

let planCache: Record<string, PersonPlan> | null = null;
async function planOf(api: Client): Promise<Record<string, PersonPlan>> {
  if (planCache) return planCache;
  const holidays = new Set<string>();
  for (const year of new Set(MONTHS.map(m => m.slice(0, 4)))) {
    const r = await api.get(`/holidays?year=${year}`);
    expect(r.status, `GET /holidays?year=${year}`).toBe(200);
    for (const h of r.body.items ?? []) if (h?.date) holidays.add(String(h.date).slice(0, 10));
  }
  planCache = payrollPlan(M, holidays);
  return planCache;
}
const daysIn = (plan: PersonPlan, month: string) => plan.days.filter(d => d.date.startsWith(month)).length;

async function listOf(api: Client, month: string): Promise<Slip[]> {
  const r = await api.get(`/payroll/${month}`);
  expect(r.status, `GET /payroll/${month}`).toBe(200);
  return r.body.items;
}
async function slipOf(api: Client, month: string, username: string): Promise<Slip> {
  const r = await api.get(`/payroll/${month}/${username}`);
  expect(r.status, `GET /payroll/${month}/${username}`).toBe(200);
  return r.body.payslip;
}
const lineOn = (slip: Slip, date: string) => slip.details.dailyLines.find(l => l.date === date);

/** Thuế lũy tiến 5 bậc (plan payroll-v2-rules): đến 10tr 5%, 10–30tr 10%, 30–60tr 20%, 60–100tr 30%, trên 100tr 35%. */
function progressive(assessable: number): number {
  const steps: [number, number][] = [
    [10_000_000, 0.05],
    [30_000_000, 0.1],
    [60_000_000, 0.2],
    [100_000_000, 0.3],
    [Infinity, 0.35]
  ];
  let tax = 0;
  let floor = 0;
  for (const [cap, rate] of steps) {
    if (assessable <= floor) break;
    tax += (Math.min(assessable, cap) - floor) * rate;
    floor = cap;
  }
  return tax;
}

// ---------- Bất biến của mọi phiếu ----------

test('every lg- person has one payslip per month, and reading one payslip gives the same record as the list', async ({ request }) => {
  await as(request, ADMIN, async api => {
    for (const month of MONTHS) {
      const items = await listOf(api, month);
      for (const u of LG) {
        const mine = items.filter(s => s.username === u);
        expect(mine, `${u} có đúng một phiếu tháng ${month}`).toHaveLength(1);
        expect(await slipOf(api, month, u), `${u} ${month}: GET một phiếu = dòng trong danh sách`).toEqual(mine[0]);
      }
    }
  });
});

test('each payslip adds up: gross = its parts, allowances = their lines, net = gross − insurance − tax − advance', async ({ request }) => {
  await as(request, ADMIN, async api => {
    for (const month of MONTHS) {
      for (const s of (await listOf(api, month)).filter(x => LG.includes(x.username))) {
        const d = s.details;
        const who = `${s.username} ${month}`;
        expect([d.grossIncome, d.insuranceDeduction, d.personalIncomeTax, d.advanceDeduction, d.netIncome], `${who}: số của dòng = số trong phiếu`).toEqual([
          s.gross,
          s.insurance,
          s.tax,
          s.advance,
          s.net
        ]);
        const allowances =
          d.attendanceAllowanceActual + d.travelAllowanceActual + d.flexAllowanceActual + d.offPaidNightActual + d.nightAllowanceActual;
        expect(d.totalAllowanceActual, `${who}: tổng phụ cấp = cộng các dòng phụ cấp`).toBe(allowances);
        const parts =
          d.baseSalaryActual +
          d.paidLeavePay +
          d.leaveSettlementPay +
          d.isatPay +
          d.holidayPay +
          d.otPayTotal +
          d.totalAllowanceActual +
          d.kpiActualPay -
          Math.abs(d.lateEarlyDeductionAmount);
        expect(s.gross, `${who}: tổng thu nhập = cộng các khoản − trừ giờ`).toBe(parts);
        expect(d.insuranceDeduction, `${who}: bảo hiểm = BHXH + BHYT + BHTN`).toBe(
          d.insuranceBreakdown.bhxh + d.insuranceBreakdown.bhyt + d.insuranceBreakdown.bhtn
        );
        expect(d.incomeAfterInsurance, `${who}: sau bảo hiểm`).toBe(s.gross - s.insurance);
        expect(d.taxableIncome, `${who}: chịu thuế = tổng − miễn thuế`).toBe(s.gross - d.taxExemptIncome);
        expect(s.net, `${who}: thực nhận`).toBe(s.gross - s.insurance - s.tax - s.advance);
      }
    }
  });
});

// ---------- Luật đã chốt ----------

test('base pay = level base salary × days worked ÷ standard workdays (nv/ctv 26, tts 22)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const plan = await planOf(api);
    for (const month of MONTHS) {
      for (const u of LG) {
        // lg-binh m1 có ngày trễ không giải trình: luật trả 0 đ ngày đó, xem test BUG-payroll-4.
        if (u === 'lg-binh' && month === M.m1) continue;
        const d = (await slipOf(api, month, u)).details;
        const days = daysIn(plan[u], month);
        const who = `${u} ${month}`;
        expect(d.standardWorkdays, `${who}: công chuẩn`).toBe(STANDARD[typeOf(u)]);
        expect(d.baseSalaryPolicy, `${who}: lương cơ bản của bậc`).toBe(baseOf(u));
        expect(d.actualWorkDays, `${who}: ngày công = ngày đã chấm`).toBe(days);
        near(d.baseSalaryActual, (baseOf(u) * days) / STANDARD[typeOf(u)], `${who}: tiền ngày công`);
      }
    }
  });
});

test('an absent day (no check-in, no check-out) pays nothing (lg-binh)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const { absent } = (await planOf(api))['lg-binh'].marks;
    const line = lineOn(await slipOf(api, M.m1, 'lg-binh'), absent);
    expect(line?.dailyTotal ?? 0, `ngày vắng ${absent} trả 0 đ`).toBe(0);
  });
});

test('a day with a missing check-out and an approved explanation pays a full day (lg-binh)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const { missingOut } = (await planOf(api))['lg-binh'].marks;
    const line = lineOn(await slipOf(api, M.m1, 'lg-binh'), missingOut);
    expect(line, `dòng ngày ${missingOut}`).toBeTruthy();
    const day = baseOf('lg-binh') / 26;
    near(line!.daySalary, day, `lương ngày ${missingOut}`);
    expect(line!.deductionAmount, `ngày ${missingOut} không bị trừ`).toBe(0);
    near(line!.dailyTotal, day, `ngày ${missingOut} trả đủ`);
  });
});

test('KPI pay = weighted score × proposed amount; a missing score counts 0 with a flag; no proposal pays 0 with a flag', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const plan = await planOf(api);
    for (const month of MONTHS) {
      for (const u of LG.filter(x => typeOf(x) !== 'tts')) {
        const s = await slipOf(api, month, u);
        const want = plan[u].kpi[month] ?? {};
        const who = `${u} ${month}`;
        const missing = PARTS.filter(p => want[p] == null);
        const pct = PARTS.reduce((a, p) => a + (WEIGHTS[p] * (want[p] ?? 0)) / 100, 0);
        const cap = KPI_MAX[typeOf(u)][levelOf(u)];
        const proposed = want.proposedAmount ?? null;
        expect(s.details.kpiApplicable, `${who}: có KPI`).toBe(true);
        expect(s.details.kpiScores, `${who}: điểm đã nhập`).toEqual(Object.fromEntries(PARTS.map(p => [p, want[p] ?? null])));
        near(s.details.kpiTotalScorePct, pct, `${who}: tổng điểm %`, 0.01);
        near(s.details.kpiActualPay, proposed === null ? 0 : (pct / 100) * Math.min(proposed, cap), `${who}: lương KPI`);
        const codes = s.warnings.map(w => w.code);
        expect(codes.includes('KPI_PROPOSAL_MISSING'), `${who}: cờ chưa nhập mức đề xuất`).toBe(proposed === null);
        const flag = s.warnings.find(w => w.code === 'KPI_SCORE_MISSING');
        expect(flag?.fields ?? [], `${who}: cờ thiếu điểm kèm tên cột`).toEqual(missing);
      }
    }
  });
});

test('tts has no KPI: pay 0 with no KPI flag, and a proposed KPI amount is refused (400 KPI_NOT_APPLICABLE)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    for (const u of LG.filter(x => typeOf(x) === 'tts')) {
      for (const month of MONTHS) {
        const s = await slipOf(api, month, u);
        expect(s.details.kpiApplicable, `${u} ${month}`).toBe(false);
        expect(s.details.kpiActualPay, `${u} ${month}`).toBe(0);
        expect(s.warnings.filter(w => w.code.startsWith('KPI_')), `${u} ${month}: không có cờ KPI`).toEqual([]);
      }
      const r = await api.put(`/payroll/${M.m1}/kpi/${u}`, { proposedAmount: 1_000_000 });
      expect([r.status, r.body?.code], `PUT KPI đề xuất cho ${u}`).toEqual([400, 'KPI_NOT_APPLICABLE']);
    }
  });
});

test('KPI input checks: proposal above kpi_max, score outside 0–100, bad month and unknown person are refused', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const over = await api.put(`/payroll/${M.m1}/kpi/lg-em`, { proposedAmount: KPI_MAX.ctv[2] + 1 });
    expect([over.status, over.body?.code], 'đề xuất vượt kpi_max của ctv bậc 2').toEqual([400, 'KPI_PROPOSAL_EXCEEDS_MAX']);
    const score = await api.put(`/payroll/${M.m1}/kpi/lg-em`, { wework: 101 });
    expect([score.status, score.body?.code], 'điểm 101').toEqual([400, 'INVALID_KPI_SCORE']);
    const month = await api.put(`/payroll/2026-1/kpi/lg-em`, { wework: 50 });
    expect([month.status, month.body?.code], 'tháng sai định dạng').toEqual([400, 'INVALID_MONTH']);
    const nobody = await api.put(`/payroll/${M.m1}/kpi/lg-khong-co`, { wework: 50 });
    expect([nobody.status, nobody.body?.code], 'người không có').toEqual([404, 'EMPLOYEE_NOT_FOUND']);
  });
});

test('insurance is 10.5% of the level base (BHXH 8 · BHYT 1.5 · BHTN 1) for a long contract or a short one with the insured flag', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const insured = ['lg-an', 'lg-chi', 'lg-dung', 'lg-em', 'lg-giang', 'lg-lan', 'lg-minh', 'lg-nam', 'lg-khanh'];
    for (const u of insured) {
      const d = (await slipOf(api, M.m1, u)).details;
      const base = baseOf(u);
      expect(d.insuranceBreakdown, `${u}: BHXH 8% · BHYT 1,5% · BHTN 1% của ${base}`).toEqual({
        bhxh: Math.round(base * 0.08),
        bhyt: Math.round(base * 0.015),
        bhtn: Math.round(base * 0.01)
      });
      expect(d.insuranceDeduction, u).toBe(Math.round(base * 0.105));
    }
    // HĐ dưới 3 tháng không có cờ BH: lg-binh (nv), lg-hoa (tts không ghi nhãn → dưới 3 tháng).
    for (const u of ['lg-binh', 'lg-hoa']) expect((await slipOf(api, M.m1, u)).insurance, `${u} không đóng BH`).toBe(0);
  });
});

test('income tax: progressive for a long contract, 10% of gross from 5,000,000 for a short one, nothing under 5,000,000', async ({ request }) => {
  await as(request, ADMIN, async api => {
    for (const u of ['lg-an', 'lg-chi', 'lg-dung']) {
      const s = await slipOf(api, M.m1, u);
      const d = s.details;
      const dependants = Number((person(u).extra as { dependants?: number } | undefined)?.dependants ?? 0);
      expect(d.dependants, `${u}: người phụ thuộc`).toBe(dependants);
      const assessable = d.taxableIncome - s.insurance - 15_500_000 - 6_200_000 * dependants;
      near(s.tax, progressive(Math.max(0, assessable)), `${u}: thuế lũy tiến`);
    }
    const binh = await slipOf(api, M.m1, 'lg-binh');
    expect(binh.tax, 'lg-binh: 10% tổng thu nhập').toBe(Math.round(binh.gross * 0.1));
    const khanh = await slipOf(api, M.m1, 'lg-khanh');
    expect(khanh.tax, 'lg-khanh: 10% của 5.000.000').toBe(Math.round(khanh.gross * 0.1));
    const hoa = await slipOf(api, M.m1, 'lg-hoa');
    expect(hoa.gross, 'lg-hoa dưới 5.000.000').toBeLessThan(5_000_000);
    expect(hoa.tax, 'lg-hoa: không khấu trừ').toBe(0);
  });
});

test('travel allowance = base × 15% × days ÷ 26 for nv, and 0 for an iDorm resident (lg-dung)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    for (const u of ['lg-an', 'lg-lan', 'lg-nam']) {
      const d = (await slipOf(api, M.m1, u)).details;
      near(d.travelAllowanceActual, (baseOf(u) * 0.15 * d.actualWorkDays) / 26, `${u}: phụ cấp đi lại`);
    }
    expect((await slipOf(api, M.m1, 'lg-dung')).details.travelAllowanceActual, 'lg-dung ở iDorm').toBe(0);
  });
});

test('flex allowance (nv) = 20% × hourly pay × 8 for each Flex day (lg-nam)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const d = (await slipOf(api, M.m1, 'lg-nam')).details;
    const days = daysIn((await planOf(api))['lg-nam'], M.m1);
    expect(d.flexShiftCount, 'số ca Flex').toBe(days);
    // Làm tròn theo từng ngày: lệch tối đa 1 đ mỗi ngày.
    near(d.flexAllowanceActual, 0.2 * hourlyOf('lg-nam') * 8 * days, 'phụ cấp Flex', days);
  });
});

test('Saturday OT pays ×2 hourly pay on the approved hours (lg-giang, 2 hours)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const d = (await slipOf(api, M.m1, 'lg-giang')).details;
    expect(d.ot20Hours, 'giờ OT ×2').toBe(2);
    near(d.otPayTotal, 2 * 2 * hourlyOf('lg-giang'), 'tiền OT thứ Bảy');
  });
});

test('weekday OT pays ×1.5 hourly pay on the approved hours (lg-chi, 2 hours)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const d = (await slipOf(api, M.m1, 'lg-chi')).details;
    expect(d.ot15Hours, 'giờ OT ×1,5').toBe(2);
    near(d.otPayTotal, 2 * 1.5 * hourlyOf('lg-chi'), 'tiền OT ngày thường');
  });
});

test('remaining annual leave on the payslip is not more than the leave days the person has (lg-chi has 12)', async ({ request }) => {
  const total = (person('lg-chi').contract.leave as { totalDays: number }).totalDays;
  await as(request, ADMIN, async api => {
    const left = (await slipOf(api, M.m1, 'lg-chi')).details.remainingAnnualLeaveDays;
    expect(left, 'có số phép còn lại').not.toBeNull();
    expect(left).toBeLessThanOrEqual(total);
  });
});

test('an approved salary advance is deducted on the payslip of its month (lg-chi)', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const { advance } = (await planOf(api))['lg-chi'];
    expect((await slipOf(api, advance!.month, 'lg-chi')).advance, 'tạm ứng đã duyệt').toBe(advance!.amount);
    expect((await slipOf(api, M.m0, 'lg-chi')).advance, 'tháng khác không trừ').toBe(0);
  });
});

// ---------- Tính lại ----------

test('recalculating one person twice gives the same payslip, and the others keep their status', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const before = await listOf(api, M.m1);
    const status = Object.fromEntries(before.map(s => [s.username, s.status]));
    const first = await api.post(`/payroll/${M.m1}/calculate`, { employeeIds: ['lg-hoa'] });
    expect([first.status, first.body?.errors], 'tính lại lg-hoa lần 1').toEqual([201, []]);
    const once = await slipOf(api, M.m1, 'lg-hoa');
    const second = await api.post(`/payroll/${M.m1}/calculate`, { employeeIds: ['lg-hoa'] });
    expect(second.status, 'tính lại lg-hoa lần 2').toBe(201);
    const twice = await slipOf(api, M.m1, 'lg-hoa');
    expect(twice.details, 'hai lần tính cho cùng một phiếu').toEqual(once.details);
    expect(once.details, 'tính lại khi dữ liệu không đổi = phiếu cũ').toEqual(before.find(s => s.username === 'lg-hoa')!.details);
    const after = await listOf(api, M.m1);
    for (const s of after) expect(s.status, `${s.username} giữ trạng thái`).toBe(status[s.username]);
  });
});

test('recalculating the whole current month twice gives the same amounts', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const pick = (items: Slip[]) =>
      Object.fromEntries(
        items.filter(s => LG.includes(s.username)).map(s => [s.username, [s.details.actualWorkDays, s.gross, s.insurance, s.tax, s.advance, s.net]])
      );
    const seeded = pick(await listOf(api, M.m0));
    for (const round of [1, 2]) {
      const r = await api.post(`/payroll/${M.m0}/calculate`, {});
      expect(r.status, `tính lại cả kỳ ${M.m0} lần ${round}`).toBe(201);
      expect(pick(await listOf(api, M.m0)), `lần ${round} = lần tính lúc seed`).toEqual(seeded);
    }
  });
});

test('a full calculation reports no error for anyone', async ({ request }) => {
  test.fail(true, 'BUG-payroll-1: tài khoản admin (loại ql) nằm trong danh sách tính lương, mỗi lần tính báo 1 người lỗi');
  await as(request, ADMIN, async api => {
    const r = await api.post(`/payroll/${M.m0}/calculate`, {});
    expect(r.status).toBe(201);
    expect(r.body.errors, 'không ai lỗi').toEqual([]);
  });
});

// ---------- Thu nhập của nhân viên (/me/income) ----------

test('staff income: an approved payslip is official and equal to the Admin payslip (lg-an m1 and m2, lg-khanh m1)', async ({ request }) => {
  const cases: [string, string][] = [
    ['lg-an', M.m1],
    ['lg-an', M.m2],
    ['lg-khanh', M.m1]
  ];
  const admin = await as(request, ADMIN, async api => {
    const out: Record<string, Slip> = {};
    for (const [u, m] of cases) out[`${u} ${m}`] = await slipOf(api, m, u);
    return out;
  });
  for (const [u, m] of cases) {
    const mine = await as(request, u, api => api.get(`/me/income?month=${m}`));
    expect(mine.status, `${u} ${m}`).toBe(200);
    expect(admin[`${u} ${m}`].status, `${u} ${m} đã duyệt`).toBe('approved');
    expect(mine.body.state, `${u} ${m}`).toBe('official');
    expect(mine.body.payslip, `${u} ${m}: phiếu chính thức = phiếu của Admin`).toEqual(admin[`${u} ${m}`].details);
  }
});

test('staff income: an estimate deducts no insurance or tax, net = gross − advance, gross = the Admin draft', async ({ request }) => {
  const cases: [string, string][] = [
    ['lg-binh', M.m1],
    ['lg-chi', M.m1],
    ['lg-an', M.m0]
  ];
  const admin = await as(request, ADMIN, async api => {
    const out: Record<string, Slip> = {};
    for (const [u, m] of cases) out[`${u} ${m}`] = await slipOf(api, m, u);
    return out;
  });
  for (const [u, m] of cases) {
    const draft = admin[`${u} ${m}`];
    const mine = await as(request, u, api => api.get(`/me/income?month=${m}`));
    expect(mine.status, `${u} ${m}`).toBe(200);
    expect(draft.status, `${u} ${m} là Nháp`).toBe('draft');
    expect(mine.body.state, `${u} ${m}`).toBe('estimate');
    const p = mine.body.payslip;
    expect([p.insuranceDeduction, p.personalIncomeTax], `${u} ${m}: tạm tính không trừ BH, thuế`).toEqual([0, 0]);
    expect(p.grossIncome, `${u} ${m}: tổng thu nhập = phiếu Nháp của Admin`).toBe(draft.gross);
    expect(p.netIncome, `${u} ${m}: thực nhận tạm tính`).toBe(p.grossIncome - p.advanceDeduction);
  }
});

test('staff cannot use the Admin payroll routes', async ({ request }) => {
  await as(request, 'lg-an', async api => {
    const calls: [string, Promise<Res>][] = [
      [`GET /payroll/${M.m1}`, api.get(`/payroll/${M.m1}`)],
      [`GET /payroll/${M.m1}/lg-binh`, api.get(`/payroll/${M.m1}/lg-binh`)],
      [`POST calculate`, api.post(`/payroll/${M.m0}/calculate`, {})],
      [`POST decision`, api.post(`/payroll/${M.m1}/lg-an/decision`, { decision: 'approve' })],
      [`PUT kpi`, api.put(`/payroll/${M.m1}/kpi/lg-an`, { wework: 100 })]
    ];
    for (const [label, call] of calls) expect((await call).status, label).toBe(403);
  });
});

test('bad payroll requests get a 400 or 404, not a 500', async ({ request }) => {
  await as(request, ADMIN, async api => {
    const month = await api.get('/payroll/2026-1');
    expect([month.status, month.body?.code], 'tháng sai định dạng').toEqual([400, 'INVALID_MONTH']);
    const none = await api.get(`/payroll/${M.m1}/lg-khong-co`);
    expect([none.status, none.body?.code], 'phiếu không có').toEqual([404, 'PAYSLIP_NOT_FOUND']);
    const decision = await api.post(`/payroll/${M.m1}/lg-binh/decision`, { decision: 'maybe' });
    expect([decision.status, decision.body?.code], 'quyết định lạ').toEqual([400, 'INVALID_DECISION']);
    const ids = await api.post(`/payroll/${M.m1}/calculate`, { employeeIds: 'lg-hoa' });
    expect([ids.status, ids.body?.code], 'employeeIds là chuỗi').toEqual([400, 'INVALID_EMPLOYEE_IDS']);
  });
});

test('Admin rejects a draft payslip with a note (lg-minh) and it reads back as rejected', async ({ request }) => {
  await as(request, ADMIN, async api => {
    expect((await slipOf(api, M.m1, 'lg-minh')).status, 'lg-minh m1 là Nháp').toBe('draft');
    const r = await api.post(`/payroll/${M.m1}/lg-minh/decision`, { decision: 'reject', note: 'Thiếu xác nhận ngày nghỉ việc' });
    expect([r.status, r.body?.payslip?.status], 'từ chối').toEqual([201, 'rejected']);
    const back = (await slipOf(api, M.m1, 'lg-minh')) as Slip & { note?: string | null; decidedBy?: string | null };
    expect([back.status, back.note, back.decidedBy], 'đọc lại: trạng thái, lý do, người quyết').toEqual(['rejected', 'Thiếu xác nhận ngày nghỉ việc', ADMIN]);
  });
});

// ---------- Lỗi đã biết (luật đã chốt, v2 chưa làm đúng) ----------

test('approved annual leave pays one day rate per day (lg-chi, 2 days)', async ({ request }) => {
  test.fail(true, 'BUG-payroll-2: Phép năm đã duyệt trả 0 đ (phiếu chỉ đọc bảng chấm công)');
  await as(request, ADMIN, async api => {
    const d = (await slipOf(api, M.m1, 'lg-chi')).details;
    expect(d.paidLeaveDays, 'ngày phép có lương').toBe(2);
    near(d.paidLeavePay, (2 * baseOf('lg-chi')) / 26, 'tiền phép');
  });
});

test('a check-in over 15 minutes late with no explanation pays 0 for that day (lg-binh)', async ({ request }) => {
  test.fail(true, 'BUG-payroll-3: ngày vào trễ 40 phút không giải trình vẫn được trả (chỉ trừ 40 phút)');
  await as(request, ADMIN, async api => {
    const plan = (await planOf(api))['lg-binh'];
    const s = await slipOf(api, M.m1, 'lg-binh');
    expect(lineOn(s, plan.marks.lateUnexplained)?.dailyTotal ?? 0, `ngày ${plan.marks.lateUnexplained}`).toBe(0);
    expect(s.details.actualWorkDays, 'ngày công').toBe(daysIn(plan, M.m1) - 1);
  });
});

test('an explained late check-in is cut in 30-minute blocks: 40 minutes late → 30 minutes of pay (lg-binh)', async ({ request }) => {
  test.fail(true, 'BUG-payroll-4: trễ có giải trình bị trừ theo phút thực (40 phút) thay vì khối 30 phút');
  await as(request, ADMIN, async api => {
    const { lateExplained } = (await planOf(api))['lg-binh'].marks;
    const line = lineOn(await slipOf(api, M.m1, 'lg-binh'), lateExplained);
    expect(line, `dòng ngày ${lateExplained}`).toBeTruthy();
    near(line!.deductionAmount, 0.5 * hourlyOf('lg-binh'), `trừ ngày ${lateExplained}`);
  });
});

test('the attendance allowance is lost at 3 days off (lg-chi: 2 days annual leave + 1 day unpaid)', async ({ request }) => {
  test.fail(true, 'BUG-payroll-5: chuyên cần vẫn trả khi nghỉ 3 ngày');
  await as(request, ADMIN, async api => {
    expect((await slipOf(api, M.m1, 'lg-chi')).details.attendanceAllowanceActual, 'chuyên cần').toBe(0);
  });
});
