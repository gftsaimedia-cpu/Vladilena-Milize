// Dịch vụ dữ liệu thật của nhóm Cài đặt (Admin): tham số tính lương, ca, ngày lễ, vùng chấm công, công tắc Agents, nhật ký.
// Mỗi hàm đọc máy chủ rồi đổi phản hồi về đúng hình dạng màn đang dùng (builders/admin-config).
// Hàm lưu so bản nháp với bản vừa đọc và chỉ gửi các khoá đã đổi, kèm tháng áp dụng và số phiên bản (paramsRev) của lần đọc đó.
import { api, qs } from '@/services/http';
import { allSettingsWanted, buildAllSettings, searchAllSettings } from '@/builders/admin-config/all-settings';
import {
  benefitChanges,
  benefitsViewFromCatalog,
  headcountFromEmployees,
  type BenefitsView
} from '@/builders/api/benefits';
import { catalogRows, currentDate, currentMonth, writePositions } from '@/services/admin-catalog';
import { MOCK_HEADCOUNT } from '@/mock/positions';
import { mockAuditList, mockAuditVerify } from '@/mock/audit';
import { respond } from '@/mock/respond';
import { buildAuditPage } from '@/builders/admin-config/audit';
import { auditFromResponse, verifyMessage } from '@/builders/api/audit';
import { calendarFromHolidays, datesOf, holidayRangesOf } from '@/builders/api/calendar';
import { notConnected } from '@/services/data-mode';
import { buildPayDrawer, buildPayFormula, drawerWanted } from '@/builders/admin-config/pay';
import { applySaved, diffEdits, indexParams, toPct, valueOf } from '@/builders/admin-config/params';

const plain = (v?) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ---------- Đọc và lưu tham số ----------
const readParams = (group?) => api('GET', `/settings/params${qs({ group })}`).then(indexParams);

/** Gửi các khoá đã đổi; không có gì đổi thì không gọi máy chủ. Lỗi máy chủ (PARAMS_STALE...) ném nguyên văn. */
async function putParams(idx?, wanted?) {
  const edits = diffEdits(idx, wanted);
  if (!edits.length) return { ok: true, saved: [] };
  const res = await api('PUT', '/settings/params', {
    changes: edits,
    effectiveMonth: idx.month,
    expectedRev: idx.rev
  });
  applySaved(idx, edits, res.paramsRev);
  return { ok: true, saved: res.saved || [], paramsRev: res.paramsRev };
}

// POST /api/settings/params/preview { changes, effectiveMonth } -> { ok, errors, warnings, impact: { people, totals } }; không ghi gì.
export const previewParams = (body?) => api('POST', '/settings/params/preview', body);

// POST /api/settings/params/revert { key, toVersion, effectiveMonth, reason, expectedRev }: thêm một dòng mới mang giá trị của phiên bản cũ (0 = mặc định).
export const revertParam = ({ key, toVersion, effectiveMonth, reason, expectedRev }: any) =>
  api('POST', '/settings/params/revert', { key, toVersion, effectiveMonth, reason, expectedRev });

// ---------- Khung Cài đặt ----------
// GET /api/settings/first-run: số mục còn dùng mặc định, chờ xác nhận
export const getSettingsBadges = () => api('GET', '/settings/first-run').then(r => ({ 'tat-ca': r.total }));

// ---------- Cách tính lương ----------
const state: Record<string, any> = {
  drawer: null,
  benefits: null,
  all: null,
  alerts: null,
  calendar: null,
  setup: null
};
let allSettingsRequestId = 0;

// Bảng khoản: trạng thái từng khoản theo tham số đã chỉnh, số mục chờ xác nhận lấy từ GET /settings/first-run
export async function getPayFormula() {
  const [idx, firstRun] = await Promise.all([readParams(), api('GET', '/settings/first-run')]);
  return plain(buildPayFormula(idx, firstRun));
}

// Ngăn kéo của một khoản (key: luong-ngay-cong, lam-them, phu-cap, luong-kpi, khau-tru, tam-ung)
export async function getPayDrawer(key?) {
  const idx = await readParams();
  const drawer = buildPayDrawer(key, idx);
  state.drawer = { key, idx };
  return drawer && plain(drawer);
}

export async function savePayDrawer(key?, draft?) {
  const st = state.drawer;
  if (!st || st.key !== key) throw new Error('Chưa tải dữ liệu để lưu');
  return putParams(st.idx, drawerWanted(st.idx, draft));
}

// ---------- Chế độ theo loại nhân sự ----------
// Một dòng mỗi loại theo phiên bản chức vụ của tháng này (GET /employees/meta/positions) kèm số người đang làm
// (GET /employees). Lưu gửi PUT /positions các ô đã sửa, áp dụng từ tháng đã chọn, kèm rev của phiên bản ở tháng đó.
async function headcount(): Promise<Record<string, number>> {
  if (__MOCK__) return respond(MOCK_HEADCOUNT);
  const { employees = [] } = await api('GET', '/employees');
  return headcountFromEmployees(employees, currentDate());
}

export async function getBenefits(): Promise<BenefitsView> {
  const [rows, counts] = await Promise.all([catalogRows(), headcount()]);
  const view = benefitsViewFromCatalog(rows, currentMonth(), counts);
  state.benefits = { rows, base: plain(view) };
  return plain(view);
}

/** Các mục sẽ gửi và các dòng chữ cho hộp xác nhận khi lưu bản nháp từ tháng month. */
export function benefitChangesAt(month: string, draft: BenefitsView) {
  const { rows, base } = state.benefits || {};
  if (!rows) throw new Error('Chưa tải dữ liệu để lưu');
  return benefitChanges(rows, month, base, draft);
}

export async function saveBenefits(month: string, draft: BenefitsView, reason: string): Promise<void> {
  const { items } = benefitChangesAt(month, draft);
  if (!items.length) return;
  const body = { effectiveMonth: month, items, ...(reason && reason.trim() ? { reason } : {}) };
  await writePositions('PUT', '/positions', body);
  state.benefits.base = plain(draft);
}

// ---------- Tất cả cài đặt ----------
export async function getAllSettings(group = 'ngay-cong') {
  const requestId = ++allSettingsRequestId;
  const [idx, firstRun] = await Promise.all([readParams(), api('GET', '/settings/first-run')]);
  const view: any = buildAllSettings(idx, firstRun, group);
  view.searchResults = searchAllSettings(idx, '');
  for (const item of view.detail.items) item.history = historyOf(idx, item);
  if (requestId === allSettingsRequestId) state.all = { idx, group };
  return plain(view);
}

// Lịch sử các phiên bản của từng ô trong một mục, kèm dòng giá trị mặc định (phiên bản 0) khi ô đã từng được sửa.
// Mỗi dòng: { key, label, version, value (chữ hiện), current, by, at, month, reason }; cap là quyền ghi của mục.
function historyOf(idx?, item?) {
  const entry = idx.entries.find(e => e.id === item.key);
  if (!entry) return null;
  const cells = (
    item.kind === 'options'
      ? [{ pk: item.pk, label: '', show: (v?) => (item.options.find(o => o.key === v) || {}).label }]
      : item.rows.map(r => ({
          pk: r.field.pk,
          label: r.label,
          show:
            r.field.type === 'seg' ? v => r.field.options[r.field.vals.indexOf(v)] : v => (r.field.ratio ? toPct(v) : v)
        }))
  ).filter(c => c.pk);
  const rows: any[] = [];
  for (const cell of cells) {
    const inst = (entry.instances || []).find(i => i.key === cell.pk);
    if (!inst) continue;
    const text = (v?) => {
      const shown = cell.show(v);
      return shown == null ? '' : String(shown);
    };
    const own = (entry.history || []).filter(h => h.key === cell.pk);
    for (const h of own)
      rows.push({
        key: cell.pk,
        label: cell.label,
        version: h.id,
        value: text(h.value),
        current: h.id === inst.version,
        by: h.createdBy,
        at: h.createdAt,
        month: h.effectiveMonth,
        reason: h.reason
      });
    if (own.length && inst.default !== undefined)
      rows.push({
        key: cell.pk,
        label: cell.label,
        version: 0,
        value: text(inst.default),
        current: inst.version === 0,
        by: null,
        at: null,
        month: null,
        reason: null
      });
  }
  return rows.length ? { cap: entry.writeCapability, rows } : null;
}

/** Hoàn tác một ô về phiên bản cũ rồi nhớ số phiên bản mới cho các lần lưu sau. */
export async function revertSetting({ key, toVersion, effectiveMonth, reason }: any) {
  const st = state.all;
  if (!st) throw new Error('Chưa tải dữ liệu để hoàn tác');
  const res = await revertParam({ key, toVersion, effectiveMonth, reason, expectedRev: st.idx.rev });
  if (Number.isInteger(res.paramsRev)) st.idx.rev = res.paramsRev;
  return res;
}

export async function saveAllSettings(group?, draft?) {
  const { idx } = state.all || {};
  if (!idx) throw new Error('Chưa tải dữ liệu để lưu');
  return putParams(idx, allSettingsWanted(draft));
}

// ---------- Đánh giá KPI ----------
const KPI_LABEL = {
  wework: 'Base Wework',
  user: 'Người dùng',
  peer: 'Đồng nghiệp',
  manager: 'Quản lý trực tiếp',
  self: 'Tự đánh giá'
};

// Trọng số từng thành phần (kpi.weight, chỉ đọc)
export async function getKpiRules() {
  const idx = await readParams(8);
  const entry = idx.entries.find(e => e.id === 'kpi.weight');
  const rows = entry && Array.isArray(entry.value) ? entry.value : [];
  const weights = rows.map(r => ({ label: KPI_LABEL[r.component] || r.component, percent: r.weight, note: '' }));
  return { weights, total: weights.reduce((n, w) => n + w.percent, 0), related: [] };
}

// ---------- Lịch, ca & chấm công ----------
// Lịch nghỉ lễ: GET /api/v2/holidays?year= (BE chưa có tham số ngày trả lương: payDay null).
export async function getCalendar(year?) {
  const { items = [] } = await api('GET', `/holidays${qs({ year })}`);
  return calendarFromHolidays(items, Number(year));
}

/** Thêm các ngày lễ dương lịch cố định của năm (bỏ qua ngày đã có): POST /api/v2/holidays/quick-add. Trả { added }. */
export const quickAddHolidays = (year?) => api('POST', '/holidays/quick-add', { year: Number(year) });

/** Thêm một khoảng nghỉ lễ: POST /api/v2/holidays từng ngày (BE từ chối ngày trùng hoặc tên trống). */
export async function addHoliday({ from, to, name }: any) {
  for (const date of datesOf(from, to || from)) await api('POST', '/holidays', { date, name });
  return { ok: true };
}

/** Xoá cả khoảng có id (id là ngày đầu khoảng): DELETE /api/v2/holidays/:date từng ngày. */
export async function removeHoliday(id?) {
  const { items = [] } = await api('GET', `/holidays${qs({ year: String(id).slice(0, 4) })}`);
  const range = holidayRangesOf(items).find(h => h.id === id);
  if (!range) return { ok: true };
  for (const date of datesOf(range.from, range.to)) await api('DELETE', `/holidays/${date}`);
  return { ok: true };
}

const KIND = { normal: 'Normal', flex: 'Flex', night: 'Night' };

// Ca làm từ GET /api/v2/employees/meta/shifts (bảng work_shifts: mã, tên, loại). BE v2 chưa có giờ vào/ra của ca và
// tham số vùng chấm công: các ô đó để trống, lưu báo chưa nối.
export async function getCalendarSetup() {
  const { shifts = [] } = await api('GET', '/employees/meta/shifts');
  const view = {
    shifts: shifts.map(s => ({ code: s.code, name: s.name, start: '', end: '', type: KIND[s.kind] || s.kind, nextDay: false })),
    zone: { radius: null, lat: null, lng: null }
  };
  return plain(view);
}

// Lưu giờ ca và vùng chấm công: BE v2 chưa có API.
export const saveCalendarSetup = (_input: any) => notConnected();

// ---------- Nhật ký thay đổi ----------
const AUDIT_PAGE = 25;

// GET /api/v2/system/audit: BE lọc theo người, việc, ngày và phân trang (offset), trả tổng số dòng và hai danh sách dropdown.
export async function getAuditLog({ page = 1, who = '', action = '', from = '', to = '' }: any = {}) {
  const at = Math.max(1, page);
  const q = { limit: AUDIT_PAGE, offset: (at - 1) * AUDIT_PAGE, actor: who, action, from, to };
  const res = __MOCK__ ? await respond(mockAuditList(q)) : await api('GET', `/system/audit${qs(q)}`);
  return buildAuditPage(auditFromResponse(res), { page: at, size: AUDIT_PAGE });
}

// GET /api/v2/system/audit/verify: kiểm chuỗi băm; message là câu tiếng Việt khi sai, null khi đúng.
export async function verifyAuditLog() {
  const res = __MOCK__ ? await respond(mockAuditVerify()) : await api('GET', '/system/audit/verify');
  return { ...res, message: verifyMessage(res) };
}
