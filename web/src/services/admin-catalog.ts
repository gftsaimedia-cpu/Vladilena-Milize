// Dịch vụ danh mục chức vụ và bậc (Admin): đọc theo tháng (GET /api/v2/employees/meta/positions); sửa chức vụ
// (PUT /positions), sửa bậc (PUT /positions/:loại/levels/:bậc), thêm bậc kế tiếp (POST /positions/:loại/levels), đều
// áp dụng từ một tháng. Dữ liệu giả (__MOCK__): mock/positions, lưu chỉ ghi lại lời gọi.
import { api } from '@/services/http';
import { buildPositions } from '@/builders/admin-catalog/positions';
import { positionsResponseFromCatalog, type TypeRow } from '@/builders/api/catalog';
import { mockCatalogRows, mockWrite } from '@/mock/positions';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';

/** Hôm nay 'YYYY-MM-DD' theo giờ Việt Nam (UTC+7) của đồng hồ máy chủ; chưa có thì theo đồng hồ máy. */
export function currentDate(): string {
  const now = useSessionStore().serverNow;
  const t = now ? Date.parse(now) : Date.now();
  return new Date(t + 7 * 3600000).toISOString().slice(0, 10);
}

/** Tháng này 'YYYY-MM' theo giờ Việt Nam của đồng hồ máy chủ. */
export const currentMonth = (): string => currentDate().slice(0, 7);

/** Mọi phiên bản chức vụ (kèm bậc và ô tick) như máy chủ trả. */
export async function catalogRows(): Promise<TypeRow[]> {
  if (__MOCK__) return respond(mockCatalogRows());
  const { positions = [] } = await api('GET', '/employees/meta/positions');
  return positions;
}

/** Ghi vào API chức vụ; dữ liệu giả chỉ ghi lại lời gọi. Lỗi máy chủ (POSITION_STALE...) ném nguyên văn. */
export const writePositions = (method: string, path: string, body: Record<string, unknown>) =>
  __MOCK__ ? respond(mockWrite(method, path, body)) : api(method, path, body);

// Lý do để trống thì không gửi khoá reason.
const withReason = (body: Record<string, unknown>, reason?: string) =>
  reason && reason.trim() ? { ...body, reason } : body;

const fetchRaw = async (month?) => positionsResponseFromCatalog(await catalogRows(), month || currentMonth());

// Màn Chức vụ và bậc của tháng month (mặc định tháng này).
export const getPositions = (month?) => fetchRaw(month).then(buildPositions);

/** Dòng chức vụ (kèm bậc) đang hiệu lực ở một tháng; null khi chức vụ chưa có ở tháng đó. */
export const getPositionAt = (month?, code?) =>
  fetchRaw(month).then(res => (res.positions || []).find(p => p.code === code) || null);

export function savePosition(input: {
  code: string;
  changes: Record<string, unknown>;
  effectiveMonth: string;
  reason: string;
  expectedRev: number;
}): Promise<unknown> {
  const { code, changes, effectiveMonth, reason, expectedRev } = input;
  return writePositions('PUT', '/positions', withReason({ effectiveMonth, items: [{ code, expectedRev, changes }] }, reason));
}

export function saveLevel(input: {
  type: string;
  level: number;
  adding: boolean;
  changes: Record<string, unknown>;
  effectiveMonth: string;
  reason: string;
  expectedRev?: number;
}): Promise<unknown> {
  const { type, level, adding, changes, effectiveMonth, reason, expectedRev } = input;
  const base = `/positions/${encodeURIComponent(type)}/levels`;
  if (adding) return writePositions('POST', base, withReason({ effectiveMonth, level, values: changes }, reason));
  return writePositions('PUT', `${base}/${level}`, withReason({ effectiveMonth, expectedRev, changes }, reason));
}
