// Dịch vụ danh mục chức vụ và bậc (Admin): đọc theo tháng (GET /api/v2/employees/meta/positions), sửa chức vụ, sửa hoặc
// thêm bậc kế tiếp (BE v2 chưa có API ghi: báo chưa nối).
import { api } from '@/services/http';
import { buildPositions } from '@/builders/admin-catalog/positions';
import { positionsResponseFromCatalog } from '@/builders/api/catalog';
import { notConnected } from '@/services/data-mode';

const thisMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);

const fetchRaw = async (month?) => {
  const { positions = [] } = await api('GET', '/employees/meta/positions');
  return positionsResponseFromCatalog(positions, month || thisMonth());
};

// Màn Chức vụ và bậc của tháng month (mặc định tháng này).
export const getPositions = (month?) => fetchRaw(month).then(buildPositions);

/** Dòng chức vụ (kèm bậc) đang hiệu lực ở một tháng; null khi chức vụ chưa có ở tháng đó. */
export const getPositionAt = (month?, code?) =>
  fetchRaw(month).then(res => (res.positions || []).find(p => p.code === code) || null);

export const savePosition = (_input: any) => notConnected();

export const saveLevel = (_input: any) => notConnected();
