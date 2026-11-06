// Nghỉ giữa ca trên phiếu lương (yêu cầu FE của BE mục 5): dòng "Bù nghỉ giữa ca" lấy tiền halfShiftRepaidPay, kèm số giờ
// nợ / đã bù / bị bỏ của BE (halfShiftOwedMinutes, halfShiftRepaidMinutes, halfShiftDroppedMinutes). Dòng ngày có halfShift và
// repaidMinutes. Ngày công lẻ (12,5) viết dấu phẩy. FE không tính nợ hay tiền.
import { expect, test, type Page } from '@playwright/test';
import { halfShiftNote } from '../src/builders/api/half-shift-pay';
import { payslipFromRecord } from '../src/builders/api/payroll';
import { sheetFromRecord } from '../src/builders/api/payslip-a4';
import { incomeViewOf } from '../src/builders/api/staff-phone';

const HALF = { halfShiftOwedMinutes: 240, halfShiftRepaidMinutes: 120, halfShiftDroppedMinutes: 120, halfShiftRepaidPay: 150000 };

test.describe('dòng chữ giờ bù', () => {
  test('repaid of owed hours, then the dropped part when there is one', () => {
    expect(halfShiftNote({ owedMinutes: 240, repaidMinutes: 120, droppedMinutes: 120, pay: 1 })).toBe('Bù 2 / 4 giờ · bỏ 2 giờ');
    expect(halfShiftNote({ owedMinutes: 240, repaidMinutes: 240, droppedMinutes: 0, pay: 1 })).toBe('Bù 4 / 4 giờ');
    expect(halfShiftNote({ owedMinutes: 240, repaidMinutes: 150, droppedMinutes: 90, pay: 1 })).toBe('Bù 2,5 / 4 giờ · bỏ 1,5 giờ');
  });
});

test.describe('máy chủ thật', () => {
  const details = (over: Record<string, unknown> = {}) => ({
    fullName: 'Lê Hoàng Nam',
    month: '2026-11',
    standardWorkdays: 26,
    actualWorkDays: 12.5,
    kpiApplicable: false,
    kpiScores: {},
    ...over
  });

  test('Admin payslip carries the half-shift hours and pay from the server', () => {
    const slip = payslipFromRecord({ id: 1, username: 'nam', status: 'draft', gross: 0, insurance: 0, tax: 0, advance: 0, net: 0, details: details(HALF) } as any);
    expect(slip.halfShift).toEqual({ owedMinutes: 240, repaidMinutes: 120, droppedMinutes: 120, pay: 150000 });
    const none = payslipFromRecord({ id: 1, username: 'nam', status: 'draft', gross: 0, insurance: 0, tax: 0, advance: 0, net: 0, details: details() } as any);
    expect(none.halfShift).toBeNull();
  });

  test('A4: Làm thêm giờ ends with Bù nghỉ giữa ca; a half-shift day reads Nửa ca with its repaid hours', () => {
    const lines = [
      { date: '2026-11-12', shiftCode: 'NORMAL', shiftLabel: 'Normal', checkIn: '08:00', checkOut: '12:00', workHours: 4, dailyTotal: 115384, halfShift: 'FIRST', repaidMinutes: 0 },
      { date: '2026-11-13', shiftCode: 'NORMAL', shiftLabel: 'Normal', checkIn: '08:00', checkOut: '19:00', workHours: 8, otHours: 2, dailyTotal: 300000, halfShift: null, repaidMinutes: 120 }
    ];
    const sheet = sheetFromRecord({ username: 'nam', status: 'approved', net: 0, details: details({ ...HALF, otPayTotal: 0, dailyLines: lines }) } as any);
    const ot = sheet.groups.find(g => g.title === 'Làm thêm giờ')!;
    expect(ot.lines[ot.lines.length - 1]).toEqual({ label: 'Bù nghỉ giữa ca', hint: 'Bù 2 / 4 giờ · bỏ 2 giờ', actual: 150000 });
    expect(sheet.days.map(d => [d.note, d.makeup])).toEqual([
      ['Nửa ca', null],
      [null, 2]
    ]);
    const plain = sheetFromRecord({ username: 'nam', status: 'approved', net: 0, details: details({ otPayTotal: 0 }) } as any);
    expect(plain.groups.find(g => g.title === 'Làm thêm giờ')!.lines.map(l => l.label)).not.toContain('Bù nghỉ giữa ca');
  });

  test('Thu nhập adds Bù nghỉ giữa ca after Làm thêm giờ only when there is money', () => {
    const payslip = {
      baseSalaryActual: 1000000,
      totalAllowanceActual: 0,
      kpiActualPay: 0,
      otPayTotal: 50000,
      grossIncome: 1200000,
      netIncome: 1200000,
      deductionTotal: 0,
      kpiTotalScorePct: 0
    };
    const labels = (p: Record<string, unknown>) => incomeViewOf({ month: '2026-11', state: 'estimate', payslip: p }).lines;
    const withHalf = labels({ ...payslip, halfShiftRepaidPay: 150000 });
    const i = withHalf.findIndex(l => l.label === 'Làm thêm giờ');
    expect(withHalf[i + 1]).toEqual({ icon: 'clock', label: 'Bù nghỉ giữa ca', value: '150.000', zero: false });
    expect(labels(payslip).map(l => l.label)).not.toContain('Bù nghỉ giữa ca');
  });
});

// Dữ liệu giả: phiếu của Lê Hoàng Nam được vá qua móc window.__mockSlipPatch trước khi app chạy.
async function withHalfShiftSlip(page: Page) {
  await page.addInitScript(() => {
    (globalThis as { __mockSlipPatch?: unknown }).__mockSlipPatch = {
      'GFT-0142': {
        days: { work: 12.5, leave: 1, isat: 1, pending: 1, unpaid: 0, standard: 26 },
        halfShift: { owedMinutes: 240, repaidMinutes: 120, droppedMinutes: 120, pay: 150000 }
      }
    };
  });
}

test.describe('dữ liệu giả', () => {
  test('Bảng lương and the payslip drawer write 12,5 công and the Bù nghỉ giữa ca row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await withHalfShiftSlip(page);
    await page.goto('/admin/bang-luong?thang=2026-10');
    const table = page.getByRole('region', { name: 'Bảng lương tháng 10, cuộn ngang để xem các khoản' });
    await expect(table.locator('tbody tr').filter({ hasText: 'Lê Hoàng Nam' })).toContainText('12,5 / 26');
    await table.getByRole('link', { name: 'Lê Hoàng Nam', exact: true }).click();
    const d = page.getByRole('dialog', { name: 'Phiếu lương của Lê Hoàng Nam' });
    await expect(d.getByRole('row', { name: /^Ngày công tháng 10/ })).toContainText('12,5');
    await expect(d.getByRole('img', { name: /^Chấm công tháng 10: 12,5 ngày công/ })).toBeVisible();
    const row = d.getByRole('row', { name: /^Bù nghỉ giữa ca/ });
    await expect(row).toContainText('Bù 2 / 4 giờ · bỏ 2 giờ');
    await expect(row).toContainText('150.000');
  });

  test('a payslip without half-shift debt has no Bù nghỉ giữa ca row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/bang-luong?thang=2026-10&phieu=GFT-0142');
    const d = page.getByRole('dialog', { name: 'Phiếu lương của Lê Hoàng Nam' });
    await expect(d.getByRole('row', { name: /^Tiền OT/ })).toBeVisible();
    await expect(d.getByRole('row', { name: /^Bù nghỉ giữa ca/ })).toHaveCount(0);
  });
});
