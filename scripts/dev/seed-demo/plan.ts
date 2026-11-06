import { must } from './harness';
import { HOLIDAYS, Script } from './scenario';

const ALL = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
const KPI_FULL = { wework: 90, user: 85, peer: 80, manager: 88, self: 85 };

/** Kỳ lương một tháng: chốt công → (mở lại → chốt lại) → tính → KPI → duyệt từng phiếu → phê duyệt kỳ → (đã trả). */
export function closeMonth(
  s: Script,
  month: string,
  day: string,
  opts: { reopen?: boolean; rejectUser?: string; kpiUsers: string[]; pay?: string }
): void {
  const P = `/api/v2/system/periods/${month}`;
  const d = s.demo;
  s.on(`${day}T09:00`, `chốt công ${month}`, async () => {
    must(await d.admin.post(`${P}/lock`), `chốt công ${month}`);
  });
  if (opts.reopen) {
    s.on(`${day}T09:30`, `mở lại công ${month}`, async () => {
      must(await d.admin.post(`${P}/unlock`, { reason: 'Bổ sung giải trình bị sót' }), 'mở lại công');
    });
    s.on(`${day}T10:00`, `chốt lại công ${month}`, async () => {
      must(await d.admin.post(`${P}/lock`), 'chốt lại công');
    });
  }
  s.on(`${day}T11:00`, `tính lương ${month}`, async () => {
    must(await d.admin.post(`/api/v2/payroll/${month}/calculate`, {}), `tính lương ${month}`);
  });
  s.on(`${day}T11:30`, `KPI ${month}`, async () => {
    for (const u of opts.kpiUsers) {
      const body = u === 'binh' ? { wework: 70, user: 65 } : KPI_FULL;
      must(await d.admin.put(`/api/v2/payroll/${month}/kpi/${u}`, body), `KPI ${u}`);
    }
  });
  s.on(`${day}T12:00`, `duyệt phiếu ${month}`, async () => {
    const slips = must(await d.admin.get(`/api/v2/payroll/${month}`), `đọc phiếu ${month}`);
    const list: any[] = slips.items ?? slips.payslips ?? [];
    for (const it of list) {
      const u = it.username ?? it.employeeId;
      if (u === opts.rejectUser) {
        must(await d.admin.post(`/api/v2/payroll/${month}/${u}/decision`, { decision: 'reject', note: 'Thiếu giờ ra, nhờ giải trình lại' }), `từ chối phiếu ${u}`);
      } else {
        must(await d.admin.post(`/api/v2/payroll/${month}/${u}/decision`, { decision: 'approve' }), `duyệt phiếu ${u}`);
      }
    }
    if (opts.rejectUser) {
      // Phiếu bị từ chối: tính lại riêng người đó (về Nháp) rồi duyệt lại.
      must(await d.admin.post(`/api/v2/payroll/${month}/calculate`, { employeeIds: [opts.rejectUser] }), 'tính lại một phiếu');
      must(await d.admin.post(`/api/v2/payroll/${month}/${opts.rejectUser}/decision`, { decision: 'approve' }), 'duyệt lại phiếu');
    }
  });
  s.on(`${day}T13:00`, `phê duyệt kỳ ${month}`, async () => {
    must(await d.admin.post(`${P}/approve`), `phê duyệt kỳ ${month}`);
  });
  if (opts.pay) {
    s.on(opts.pay, `đã trả ${month}`, async () => {
      must(await d.admin.post(`${P}/pay`), `đã trả ${month}`);
    });
  }
}

export function plan(s: Script): void {
  const d = s.demo;

  // ===== Cài đặt nền (31/08) =====
  s.on('2026-08-31T09:30', 'cài đặt nền', async () => {
    const z = must(await d.admin.get('/api/v2/settings/attendance-zone'), 'đọc vùng');
    must(await d.admin.put('/api/v2/settings/attendance-zone', { lat: 10.8, lng: 106.7, radiusM: 500, stamp: z.stamp, reason: 'Văn phòng chính' }), 'đặt vùng chấm công');
    for (const [date, name] of HOLIDAYS) must(await d.admin.post('/api/v2/holidays', { date, name }), `lễ ${date}`);
    const w = must(await d.admin.get('/api/v2/settings/work-weeks/oanh'), 'đọc tuần oanh');
    must(await d.admin.put('/api/v2/settings/work-weeks/oanh', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-09', stamp: w.stamp, reason: 'Làm thứ Hai đến thứ Sáu' }), 'tuần oanh');
  });

  // ===== THÁNG 9 =====
  s.skip('lan', '2026-09-07', '2026-09-26');
  s.skip('giang', '2026-09-10', '2026-09-11');
  s.skip('giang', '2026-09-17');
  s.skip('hanh', '2026-09-08');
  s.skip('phuc', '2026-09-14', '2026-09-16');
  s.skip('an', '2026-09-19'); // iSAT: nghỉ Thứ Bảy có lương
  s.day('binh', '2026-09-07', { in: '08:35' });
  s.day('binh', '2026-09-14', { in: '08:40' });
  s.day('binh', '2026-09-21', { in: '08:25' });
  s.day('chi', '2026-09-09', { out: null });
  s.day('nam', '2026-09-12', { in: '08:00', out: '21:00' }); // Thứ Bảy có OT
  s.day('nam', '2026-09-20', { in: '08:00', out: '12:00' }); // Chủ nhật OT
  s.day('nam', '2026-09-02', { in: '08:00', out: '16:00' }); // làm ngày lễ
  s.day('hanh', '2026-09-09', { in: '08:00', out: '22:00' }); // làm bù 18–22 sau ca
  s.day('hanh', '2026-09-10', { in: '08:00', out: '22:00' });

  s.on('2026-09-01T09:00', 'đơn tháng 9', async () => {
    await s.file('lan', 'leave', { leaveType: 'SOCIAL_INSURANCE', reason: 'Nghỉ ốm dài ngày (BHXH)', startDate: '2026-09-07', endDate: '2026-09-26' }, 'lan-bhxh-9');
    await s.approve('lan-bhxh-9');
    await s.file('giang', 'leave', { leaveType: 'ANNUAL', reason: 'Về quê', startDate: '2026-09-10', endDate: '2026-09-11' }, 'giang-annual-9');
    await s.approve('giang-annual-9');
    await s.fileBlocked('giang', 'leave', { leaveType: 'ANNUAL', reason: 'Trùng ngày', startDate: '2026-09-11', endDate: '2026-09-12' }, 'giang-trùng-ngày-9');
    await s.file('giang', 'leave', { leaveType: 'PERSONAL_PAID', reason: 'Việc gia đình', startDate: '2026-09-17', endDate: '2026-09-17' }, 'giang-ppaid-9');
    await s.approve('giang-ppaid-9');
    await s.file('giang', 'leave', { leaveType: 'UNPAID', reason: 'Việc riêng', startDate: '2026-09-24', endDate: '2026-09-24' }, 'giang-unpaid-9');
    await s.reject('giang-unpaid-9', 'Trùng đợt nước rút cuối tháng');
    await s.file('hanh', 'leave-with-makeup', { reason: 'Việc nhà', startDate: '2026-09-08', endDate: '2026-09-08', slots: [{ date: '2026-09-09', startTime: '18:00', endTime: '22:00' }, { date: '2026-09-10', startTime: '18:00', endTime: '22:00' }] }, 'hanh-makeup-9');
    await s.approve('hanh-makeup-9');
    await s.file('nam', 'overtime', { reason: 'Gấp tiến độ', otDate: '2026-09-12', startTime: '18:00', endTime: '21:00' }, 'nam-ot-9a');
    await s.approve('nam-ot-9a');
    await s.file('nam', 'overtime', { reason: 'Hỗ trợ sự kiện', otDate: '2026-09-20', startTime: '08:00', endTime: '12:00' }, 'nam-ot-9b');
    await s.approve('nam-ot-9b');
    await s.file('an', 'isat', { saturday: '2026-09-19', team: 'Pod A', conditions: ALL }, 'an-isat-9');
    await s.approve('an-isat-9');
  });
  s.on('2026-09-10T10:00', 'giải trình tháng 9', async () => {
    await s.file('chi', 'explanation', { reason: 'Quên check-out', workDate: '2026-09-09', actualCheckOut: '15:00' }, 'chi-expl-9');
    await s.approve('chi-expl-9');
  });
  s.on('2026-09-15T09:00', 'giải trình huỷ', async () => {
    await s.file('binh', 'explanation', { reason: 'Kẹt xe', workDate: '2026-09-14' }, 'binh-expl-9');
    await s.cancel('binh', 'binh-expl-9', 'Nhập nhầm ngày');
  });
  s.on('2026-09-16T09:00', 'tạm ứng tháng 9', async () => {
    await s.file('an', 'advance', {}, 'an-adv-9');
    await s.approve('an-adv-9');
  });
  s.on('2026-09-17T09:00', 'tạm ứng tháng 9 (chi)', async () => {
    await s.file('chi', 'advance', {}, 'chi-adv-9');
    await s.approve('chi-adv-9');
  });
  closeMonth(s, '2026-09', '2026-10-01', { kpiUsers: ['an', 'binh', 'chi', 'dung'], pay: '2026-10-10T09:00' });
}
