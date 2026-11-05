// Dịch vụ dữ liệu thật của nhóm Cài đặt (Admin): chế độ theo loại, ngày lễ, nhật ký.
// Mỗi hàm đọc máy chủ rồi đổi phản hồi về đúng hình dạng màn đang dùng (builders/admin-config).
// Lưu chế độ theo loại gửi các ô đã sửa, kèm tháng áp dụng.
import { api, qs } from '@/services/http';
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
import { addHolidays, holidaysOf, quickAddFixed, removeHolidays } from '@/mock/settings';
import { buildAuditPage } from '@/builders/admin-config/audit';
import { auditFromResponse, verifyMessage } from '@/builders/api/audit';
import { calendarFromHolidays, datesOf, holidayRangesOf } from '@/builders/api/calendar';

const plain = (v?) => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Bản đã tải của màn Chế độ theo loại (để biết ô nào đã sửa khi lưu).
const state: Record<string, any> = {
  benefits: null
};

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

// ---------- Lịch, ca & chấm công ----------
// Lịch nghỉ lễ: GET /api/v2/holidays?year= (BE chưa có tham số ngày trả lương: payDay null).
export async function getCalendar(year?) {
  if (__MOCK__) return respond(calendarFromHolidays(holidaysOf(Number(year)).items, Number(year)));
  const { items = [] } = await api('GET', `/holidays${qs({ year })}`);
  return calendarFromHolidays(items, Number(year));
}

/** Thêm các ngày lễ dương lịch cố định của năm (bỏ qua ngày đã có): POST /api/v2/holidays/quick-add. Trả { added }. */
export const quickAddHolidays = (year?) =>
  __MOCK__ ? respond(quickAddFixed(Number(year))) : api('POST', '/holidays/quick-add', { year: Number(year) });

/** Thêm một khoảng nghỉ lễ: POST /api/v2/holidays từng ngày (BE từ chối ngày trùng hoặc tên trống). */
export async function addHoliday({ from, to, name }: any) {
  if (__MOCK__) {
    addHolidays(datesOf(from, to || from), name);
    return respond({ ok: true });
  }
  for (const date of datesOf(from, to || from)) await api('POST', '/holidays', { date, name });
  return { ok: true };
}

/** Xoá cả khoảng có id (id là ngày đầu khoảng): DELETE /api/v2/holidays/:date từng ngày. */
export async function removeHoliday(id?) {
  const year = String(id).slice(0, 4);
  if (__MOCK__) {
    const range = holidayRangesOf(holidaysOf(Number(year)).items).find(h => h.id === id);
    if (range) removeHolidays(datesOf(range.from, range.to));
    return respond({ ok: true });
  }
  const { items = [] } = await api('GET', `/holidays${qs({ year })}`);
  const range = holidayRangesOf(items).find(h => h.id === id);
  if (!range) return { ok: true };
  for (const date of datesOf(range.from, range.to)) await api('DELETE', `/holidays/${date}`);
  return { ok: true };
}

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
