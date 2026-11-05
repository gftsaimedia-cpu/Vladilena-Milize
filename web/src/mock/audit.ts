// Dữ liệu giả của Cài đặt › Nhật ký thay đổi, cùng dạng GET /api/v2/system/audit và /audit/verify.
// 45 dòng, id 1–45, từ 15/09 đến 28/10/2026 (không dòng nào sau MOCK_NOW). Hàm giả lọc, sắp, phân trang và dựng
// danh sách dropdown giống máy chủ (spec mục 5.1), kể cả ranh giới ngày giờ Việt Nam.
// Móc cho test: đặt globalThis.__mockAuditBadId = n thì kiểm tra chuỗi trả "dòng n bị sửa nội dung".
import type { AuditItemDTO, AuditListDTO, AuditVerifyDTO } from '@/builders/api/audit';
import { MOCK_NOW } from './clock';

export type MockAuditQuery = { limit: number; offset: number; actor?: string; action?: string; from?: string; to?: string };

const NAMES: Record<string, string | null> = {
  admin: 'Quản trị viên',
  'pham-ngoc-anh': 'Phạm Ngọc Anh',
  'nguyen-thu-ha': 'Nguyễn Thu Hà',
  system: null
};

type Entry = Omit<AuditItemDTO, 'actorName' | 'sensitivity'>;
const entry = (e: Partial<Entry> & Pick<Entry, 'id' | 'at' | 'actor' | 'action'>): Entry => ({
  entityKind: null,
  entityId: null,
  subject: null,
  month: null,
  before: null,
  after: null,
  reason: null,
  requestId: `rq-${e.id}`,
  ...e
});

const param = (id: number, at: string, key: string, before: number, after: number, reason: string) =>
  entry({ id, at, actor: 'admin', action: 'param.set', entityKind: 'param', entityId: key, before: { value: before }, after: { value: after }, reason });
const decide = (id: number, at: string, requestNo: string, subject: string, status: 'APPROVED' | 'REJECTED', reason: string | null) =>
  entry({ id, at, actor: 'pham-ngoc-anh', action: 'request.decide', entityKind: 'request', entityId: requestNo, subject, before: { status: 'PENDING' }, after: { status }, reason });
const staffUpdate = (id: number, at: string, subject: string, field: string, before: string, after: string) =>
  entry({ id, at, actor: 'pham-ngoc-anh', action: 'staff.update', entityKind: 'staff', entityId: subject, subject, before: { [field]: before }, after: { [field]: after } });
const kpi = (id: number, at: string, subject: string, month: string, before: number, after: number) =>
  entry({ id, at, actor: 'nguyen-thu-ha', action: 'kpi.score', entityKind: 'kpi', entityId: subject, subject, month, before: { score: before }, after: { score: after } });
const payroll = (id: number, at: string, month: string) =>
  entry({ id, at, actor: 'nguyen-thu-ha', action: 'payroll.calculate', entityKind: 'period', entityId: month, month, before: { status: 'DRAFT' }, after: { status: 'CALCULATED' } });
const lock = (id: number, at: string, actor: string, month: string, reason: string | null) =>
  entry({ id, at, actor, action: 'period.lock', entityKind: 'period', entityId: month, month, before: { locked: false }, after: { locked: true }, reason });

// Thêm nhanh 17 ngày lễ 2027: cùng người, cùng việc, cùng requestId, cùng lúc (10:15 ngày 27/10 giờ Việt Nam).
const HOLIDAYS_2027: [string, string][] = [
  ['2027-01-01', 'Tết Dương lịch'],
  ...['03', '04', '05', '06', '07', '08', '09', '10', '11'].map((d): [string, string] => [`2027-02-${d}`, 'Tết Nguyên đán']),
  ['2027-04-16', 'Giỗ Tổ Hùng Vương'],
  ['2027-04-30', 'Ngày Giải phóng miền Nam'],
  ['2027-05-01', 'Quốc tế Lao động'],
  ['2027-05-03', 'Nghỉ bù Quốc tế Lao động'],
  ['2027-09-01', 'Quốc khánh'],
  ['2027-09-02', 'Quốc khánh'],
  ['2027-09-03', 'Quốc khánh']
];
const quickAdd = HOLIDAYS_2027.map(([date, name], i) =>
  entry({
    id: 26 + i,
    at: '2026-10-27T03:15:00.000Z',
    actor: 'admin',
    action: 'holiday.add',
    entityKind: 'holiday',
    entityId: date,
    after: { date, name },
    reason: 'Lịch nghỉ lễ 2027',
    requestId: 'rq-holidays-2027'
  })
);

const ENTRIES: Entry[] = [
  param(1, '2026-09-15T02:10:00.000Z', 'ot.rate', 150, 200, 'Theo quyết định 09/2026'),
  staffUpdate(2, '2026-09-16T03:20:00.000Z', 'le-hoang-nam', 'title', 'Nhân viên', 'Trưởng nhóm'),
  decide(3, '2026-09-18T07:05:00.000Z', '31', 'nguyen-thu-ha', 'APPROVED', null),
  payroll(4, '2026-09-21T02:45:00.000Z', '2026-08'),
  decide(5, '2026-09-22T04:10:00.000Z', '33', 'le-hoang-nam', 'REJECTED', 'Quá hạn nộp đơn'),
  param(6, '2026-09-24T08:30:00.000Z', 'flex.rate', 15, 20, 'Theo quyết định 09/2026'),
  staffUpdate(7, '2026-09-25T03:00:00.000Z', 'nguyen-thu-ha', 'dept', 'Kế toán', 'Nhân sự'),
  kpi(8, '2026-09-28T02:15:00.000Z', 'le-hoang-nam', '2026-09', 80, 85),
  decide(9, '2026-09-29T06:40:00.000Z', '36', 'le-hoang-nam', 'APPROVED', null),
  lock(10, '2026-09-30T09:00:00.000Z', 'admin', '2026-09', null),
  lock(11, '2026-10-01T01:30:00.000Z', 'system', '2026-09', 'Tự chốt sau hạn'),
  staffUpdate(12, '2026-10-02T03:40:00.000Z', 'do-mai-linh', 'level', 'Bậc 1', 'Bậc 2'),
  param(13, '2026-10-05T02:20:00.000Z', 'meal.allowance', 30000, 35000, 'Điều chỉnh phụ cấp ăn trưa'),
  decide(14, '2026-10-06T07:50:00.000Z', '40', 'nguyen-thu-ha', 'APPROVED', null),
  kpi(15, '2026-10-08T04:00:00.000Z', 'nguyen-thu-ha', '2026-09', 90, 92),
  staffUpdate(16, '2026-10-12T03:25:00.000Z', 'le-hoang-nam', 'dept', 'Kinh doanh', 'Marketing'),
  param(17, '2026-10-13T08:10:00.000Z', 'ot.rate', 200, 150, 'Hoàn tác theo yêu cầu kế toán'),
  decide(18, '2026-10-15T02:35:00.000Z', '44', 'do-mai-linh', 'REJECTED', 'Thiếu minh chứng'),
  payroll(19, '2026-10-16T05:00:00.000Z', '2026-09'),
  param(20, '2026-10-19T03:10:00.000Z', 'flex.rate', 20, 25, 'Theo quyết định 10/2026'),
  staffUpdate(21, '2026-10-20T07:30:00.000Z', 'do-mai-linh', 'title', 'Thực tập', 'Nhân viên'),
  param(22, '2026-10-22T02:50:00.000Z', 'late.penalty', 50000, 30000, 'Theo quy chế mới'),
  decide(23, '2026-10-23T06:15:00.000Z', '47', 'le-hoang-nam', 'APPROVED', null),
  lock(24, '2026-10-26T09:00:00.000Z', 'admin', '2026-10', 'Chốt công cuối tháng'),
  kpi(25, '2026-10-26T10:30:00.000Z', 'le-hoang-nam', '2026-10', 85, 88),
  ...quickAdd,
  param(43, '2026-10-28T01:05:00.000Z', 'meal.allowance', 35000, 40000, 'Theo quyết định 10/2026'),
  payroll(44, '2026-10-28T01:50:00.000Z', '2026-10'),
  param(45, '2026-10-28T02:30:00.000Z', 'ot.rate', 150, 180, 'Theo quyết định 10/2026')
];

if (ENTRIES.some(e => e.at > MOCK_NOW)) throw new Error('mock/audit.ts: có dòng sau MOCK_NOW');

const ROWS: AuditItemDTO[] = ENTRIES.map(e => ({ ...e, actorName: NAMES[e.actor] ?? null, sensitivity: 'normal' }));

// 00:00 của ngày YYYY-MM-DD giờ Việt Nam (+07:00), dạng ISO UTC.
const vnDayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) - 7 * 3600000).toISOString();
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);

export function mockAuditList(q: MockAuditQuery): AuditListDTO {
  const from = q.from ? vnDayStart(q.from) : '';
  const until = q.to ? vnDayStart(nextDay(q.to)) : '';
  const matched = ROWS.filter(
    r => (!q.actor || r.actor === q.actor) && (!q.action || r.action === q.action) && (!from || r.at >= from) && (!until || r.at < until)
  ).sort((a, b) => b.id - a.id);

  // Người: theo tên, người không có tên xếp sau cùng, rồi theo username (ORDER BY name ASC NULLS LAST, actor).
  const people = [...new Set(ROWS.map(r => r.actor))]
    .map(username => ({ username, name: NAMES[username] ?? null }))
    .sort((a, b) => {
      if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
      if (a.name !== b.name) return (a.name as string) < (b.name as string) ? -1 : 1;
      return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
    });
  const actions = [...new Set(ROWS.map(r => r.action))].sort();

  return {
    items: matched.slice(q.offset, q.offset + q.limit),
    total: matched.length,
    limit: q.limit,
    offset: q.offset,
    people,
    actions
  };
}

export function mockAuditVerify(): AuditVerifyDTO {
  const bad = Number((globalThis as { __mockAuditBadId?: number }).__mockAuditBadId) || 0;
  if (bad > 0) return { ok: false, checked: bad - 1, firstBadId: bad, reason: 'HASH' };
  return { ok: true, checked: ROWS.length, firstBadId: null, reason: null };
}
