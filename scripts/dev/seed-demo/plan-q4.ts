import { must } from './harness';
import { closeMonth } from './plan';
import { Script, TODAY } from './scenario';

const ALL = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };
const slot = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });

/** Tháng 10 (kỳ đã phê duyệt, chưa trả) và tháng 11 đến hôm nay 06/11. */
export function planQ4(s: Script): void {
  const d = s.demo;

  // ===== THÁNG 10: chấm công khác thường =====
  for (const date of ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']) s.day('binh', date, { in: date === '2026-10-05' ? '08:30' : '08:25' });
  s.day('binh', '2026-10-08', { in: '08:10' }); // trong ân hạn 15 phút
  s.day('chi', '2026-10-07', { out: null });
  s.day('chi', '2026-10-14', { out: '14:00' }); // ra sớm
  s.day('chi', '2026-10-21', { out: null });
  s.day('chi', '2026-10-28', { in: null }); // thiếu giờ vào
  s.skip('phuc', '2026-10-13', '2026-10-14');
  s.day('dung', '2026-10-13', { in: '21:30' }); // ca đêm vào sớm
  s.skip('giang', '2026-10-08', '2026-10-10');
  s.skip('giang', '2026-10-12', '2026-10-13');
  s.skip('giang', '2026-10-22', '2026-10-23');
  s.skip('hanh', '2026-10-06');
  s.day('hanh', '2026-10-07', { out: '22:00' });
  s.day('hanh', '2026-10-08', { out: '22:00' });
  s.skip('hanh', '2026-10-21');
  s.day('hanh', '2026-10-22', { out: '22:00' });
  s.day('hanh', '2026-10-23', { out: '20:00' }); // bù thiếu 2 giờ
  s.day('nam', '2026-10-15', { out: '21:00' });
  s.day('nam', '2026-10-18', { in: '08:00', out: '12:00' }); // Chủ nhật OT
  s.day('nam', '2026-10-20', { in: '08:00', out: '12:00' }); // ngày lễ OT
  s.day('oanh', '2026-10-26', { in: '13:00', out: '22:00' });
  s.day('oanh', '2026-10-27', { in: '13:00', out: '22:00' });
  s.day('oanh', '2026-10-28', { in: '13:00', out: '22:00' });
  s.skip('an', '2026-10-17'); // iSAT
  s.limits.minh = { until: '2026-10-15' };
  s.limits.lan = { until: '2026-10-30' };

  // ===== THÁNG 10: đơn =====
  s.on('2026-10-01T10:00', 'giang đổi phòng ban', async () => {
    const r = await d.admin.post('/api/v2/employees/department', { usernames: ['giang'], departmentId: d.depts.get('Phòng ban 1') });
    must(r, 'giang đổi phòng');
  });
  s.on('2026-10-01T11:00', 'đơn nghỉ tháng 10', async () => {
    const g = (leaveType: string, from: string, to: string, name: string) =>
      s.file('giang', 'leave', { leaveType, reason: `Nghỉ ${name}`, startDate: from, endDate: to }, `giang-${name}-10`).then(() => s.approve(`giang-${name}-10`));
    await g('ANNUAL', '2026-10-08', '2026-10-08', 'phép năm');
    await g('PERSONAL_PAID', '2026-10-09', '2026-10-09', 'việc riêng có lương');
    await g('PERSONAL_UNPAID', '2026-10-10', '2026-10-10', 'việc riêng không lương');
    await g('SOCIAL_INSURANCE', '2026-10-12', '2026-10-13', 'BHXH');
    await g('WELFARE', '2026-10-22', '2026-10-22', 'phúc lợi');
    await g('UNPAID', '2026-10-23', '2026-10-23', 'không lương');
    await s.fileBlocked('giang', 'leave', { leaveType: 'ANNUAL', reason: 'Nghỉ trùng ngày lễ', startDate: '2026-10-20', endDate: '2026-10-20' }, 'giang-trùng-lễ-10');
    await s.file('hanh', 'leave-with-makeup', { reason: 'Việc nhà', startDate: '2026-10-06', endDate: '2026-10-06', slots: [slot('2026-10-07', '18:00', '22:00'), slot('2026-10-08', '18:00', '22:00')] }, 'hanh-makeup-10a');
    await s.approve('hanh-makeup-10a');
    await s.file('hanh', 'leave-with-makeup', { reason: 'Đi khám', startDate: '2026-10-21', endDate: '2026-10-21', slots: [slot('2026-10-22', '18:00', '22:00'), slot('2026-10-23', '18:00', '22:00')] }, 'hanh-makeup-10b');
    await s.approve('hanh-makeup-10b');
    await s.file('hanh', 'leave-with-makeup', { reason: 'Việc riêng', startDate: '2026-10-27', endDate: '2026-10-27', slots: [slot('2026-10-28', '18:00', '22:00'), slot('2026-10-29', '18:00', '22:00')] }, 'hanh-makeup-10c');
    await s.reject('hanh-makeup-10c', 'Cuối tháng thiếu người');
    await s.file('nam', 'overtime', { reason: 'Tăng ca', otDate: '2026-10-15', startTime: '18:00', endTime: '21:00' }, 'nam-ot-10a');
    await s.approve('nam-ot-10a');
    await s.file('nam', 'overtime', { reason: 'Trực Chủ nhật', otDate: '2026-10-18', startTime: '08:00', endTime: '12:00' }, 'nam-ot-10b');
    await s.approve('nam-ot-10b');
    await s.file('nam', 'overtime', { reason: 'Trực ngày lễ', otDate: '2026-10-20', startTime: '08:00', endTime: '12:00' }, 'nam-ot-10c');
    await s.approve('nam-ot-10c');
    await s.file('nam', 'overtime', { reason: 'Tăng ca', otDate: '2026-10-22', startTime: '18:00', endTime: '21:00' }, 'nam-ot-10d');
    await s.reject('nam-ot-10d', 'Không có việc cần tăng ca');
    await s.file('nam', 'overtime', { reason: 'Tăng ca', otDate: '2026-10-28', startTime: '18:00', endTime: '21:00' }, 'nam-ot-10e');
    await s.cancel('nam', 'nam-ot-10e');
    await s.file('oanh', 'shift-change', { reason: 'Đi học buổi sáng', startDate: '2026-10-26', endDate: '2026-10-28', shiftType: 'FLEX', startTime: '13:00' }, 'oanh-shift-10a');
    await s.approve('oanh-shift-10a');
    await s.file('oanh', 'shift-change', { reason: 'Muốn đổi ca đêm', startDate: '2026-10-29', endDate: '2026-10-30', shiftType: 'NIGHT', startTime: '22:00' }, 'oanh-shift-10b');
    await s.reject('oanh-shift-10b', 'Ca đêm đã đủ người');
    await s.file('an', 'isat', { saturday: '2026-10-17', team: 'Pod A', conditions: ALL }, 'an-isat-10');
    await s.approve('an-isat-10');
  });
  s.on('2026-10-02T09:00', 'khoa chấm ngoài vùng', async () => {
    const res = await d.as('khoa').post('/api/v2/me/punches', { kind: 'IN', lat: 10.818, lng: 106.7, accuracyM: 10 });
    s.expected.push({ label: 'khoa chấm ngoài vùng (2 km)', status: res.status, body: res.body });
  });
  s.on('2026-10-06T10:00', 'binh giải trình trễ', async () => {
    await s.file('binh', 'explanation', { reason: 'Kẹt xe do ngập', workDate: '2026-10-05', actualCheckIn: '08:00' }, 'binh-expl-10');
    await s.approve('binh-expl-10');
  });
  s.on('2026-10-08T10:00', 'chi giải trình 07/10', async () => {
    await s.file('chi', 'explanation', { reason: 'Quên check-out', workDate: '2026-10-07', actualCheckOut: '15:00' }, 'chi-expl-10a');
    await s.approve('chi-expl-10a');
  });
  s.on('2026-10-12T09:00', 'phuc xin nghỉ', async () => {
    await s.file('phuc', 'leave', { leaveType: 'ANNUAL', reason: 'Việc nhà', startDate: '2026-10-13', endDate: '2026-10-13' }, 'phuc-annual-10');
    await s.reject('phuc-annual-10', 'Nộp sát ngày, đã thiếu người');
  });
  s.on('2026-10-15T18:00', 'minh nghỉ việc', async () => {
    must(await d.admin.del('/api/v2/employees/minh'), 'minh nghỉ việc');
  });
  s.on('2026-10-16T09:00', 'tạm ứng tháng 10', async () => {
    await s.file('an', 'advance', {}, 'an-adv-10');
    await s.approve('an-adv-10');
    await s.file('chi', 'advance', {}, 'chi-adv-10');
    await s.approve('chi-adv-10');
  });
  s.on('2026-10-17T09:00', 'tạm ứng bị từ chối và huỷ', async () => {
    await s.file('binh', 'advance', {}, 'binh-adv-10');
    await s.reject('binh-adv-10', 'Chưa đủ ngày công');
    await s.file('dung', 'advance', {}, 'dung-adv-10');
    await s.cancel('dung', 'dung-adv-10');
  });
  s.on('2026-10-22T10:00', 'chi giải trình 21/10', async () => {
    await s.file('chi', 'explanation', { reason: 'Quên check-out', workDate: '2026-10-21', actualCheckOut: '15:00' }, 'chi-expl-10b');
    await s.approve('chi-expl-10b');
  });
  s.on('2026-10-29T10:00', 'chi giải trình 28/10', async () => {
    await s.file('chi', 'explanation', { reason: 'Quên check-in', workDate: '2026-10-28', actualCheckIn: '06:00' }, 'chi-expl-10c');
    await s.reject('chi-expl-10c', 'Không có bằng chứng');
  });
  s.on('2026-10-30T10:00', 'an nghỉ rồi huỷ', async () => {
    await s.file('an', 'leave', { leaveType: 'ANNUAL', reason: 'Dự định về quê', startDate: '2026-11-25', endDate: '2026-11-26' }, 'an-annual-11x');
    await s.cancel('an', 'an-annual-11x', 'Đổi kế hoạch');
  });
  s.on('2026-10-30T17:00', 'lan tạm nghỉ từ 02/11', async () => {
    must(await d.admin.put('/api/v2/employees/lan', { onLeaveFrom: '2026-11-02', onLeaveTo: '2026-11-28' }), 'lan tạm nghỉ');
  });

  closeMonth(s, '2026-10', '2026-11-01', { reopen: true, rejectUser: 'binh', kpiUsers: ['an', 'binh', 'chi', 'dung'] });

  // ===== THÁNG 11 đến hôm nay =====
  s.day('binh', '2026-11-04', { in: '08:40' });
  s.day('phuc', '2026-11-05', { out: null });
  s.day('binh', '2026-11-02', { in: '08:20' });
  s.limits.lan = { until: '2026-10-30' };

  s.on('2026-11-02T09:00', 'đơn tháng 11 (chờ)', async () => {
    await s.file('giang', 'leave', { leaveType: 'ANNUAL', reason: 'Về quê', startDate: '2026-11-12', endDate: '2026-11-13' }, 'giang-annual-11');
    await s.file('oanh', 'shift-change', { reason: 'Đi học', startDate: '2026-11-12', endDate: '2026-11-13', shiftType: 'FLEX', startTime: '13:00' }, 'oanh-shift-11');
    await s.file('an', 'isat', { saturday: '2026-11-14', team: 'Pod A', conditions: ALL }, 'an-isat-11');
  });
  s.on('2026-11-03T09:00', 'đơn nghỉ bù chờ', async () => {
    await s.file('hanh', 'leave-with-makeup', { reason: 'Việc nhà', startDate: '2026-11-09', endDate: '2026-11-09', slots: [slot('2026-11-10', '18:00', '22:00'), slot('2026-11-11', '18:00', '22:00')] }, 'hanh-makeup-11');
    await s.file('nam', 'overtime', { reason: 'Tăng ca cuối tuần', otDate: '2026-11-14', startTime: '18:00', endTime: '21:00' }, 'nam-ot-11');
  });
  s.on('2026-11-05T09:00', 'binh giải trình 04/11', async () => {
    await s.file('binh', 'explanation', { reason: 'Kẹt xe', workDate: '2026-11-04', actualCheckIn: '08:00' }, 'binh-expl-11');
  });
  s.on('2026-11-05T08:30', 'nhắc giải trình', async () => {
    must(await d.admin.post('/api/v2/requests/explanations-due/remind', { employeeId: 'binh', date: '2026-11-04' }), 'nhắc binh');
  });
  s.on(`${TODAY}T10:30`, 'hôm nay: ai đã vào', async () => {
    for (const [u, t] of [['an', '08:00'], ['chi', '06:00'], ['binh', '08:40']] as const) {
      must(await d.admin.post('/api/v2/attendance/punches', { employeeId: d.uuids.get(u), type: 'IN', punchedAt: `${TODAY}T${t}:00+07:00` }), `${u} vào hôm nay`);
    }
  });
}
