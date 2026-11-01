// Dịch vụ Đánh giá KPI của Admin: điểm 5 thành phần (0–100) mỗi người mỗi tháng, tổng điểm do máy chủ tính.
import { buildKpiHistory, buildKpiRow, buildKpiRows, buildKpiSummary, KPI_KEYS } from '@/builders/admin-kpi/kpi';
import { api, qs } from './http';

const raw = (month?) => api('GET', '/kpi/scores' + qs({ month }));

/** Phần đầu trang KPI. */
// GET /api/kpi/scores?month=
export const getKpiSummary = async (month?) => buildKpiSummary(await raw(month));

/** Bảng nhập điểm. filter: all | incomplete | base-thap | tong-thap | dat. */
// GET /api/kpi/scores?month= (lọc, tìm, chia trang ở builder)
export async function getKpiScores(month?, { filter = 'all', q = '', page = 1 }: any = {}) {
  return buildKpiRows(await raw(month), { filter, q, page });
}

/** Lưu một điểm thành phần (index 0–4, value 0–100 hoặc null để xoá); trả lại dòng đã tính lại. */
// PUT /api/kpi/scores  { month, user, scores: { <thành phần>: điểm } }
export async function saveKpiScore({ month, id, index, value }: any) {
  const out = await api('PUT', '/kpi/scores', { month, user: id, scores: { [KPI_KEYS[index]]: value } });
  return { ok: true, row: buildKpiRow(out.item), changed: out.changed };
}

/** Lịch sử sửa điểm: mỗi dòng là lần sửa gần nhất của một người. */
// GET /api/audit?action=kpi.score&month=&limit=200 (quyền audit.read)
export async function getKpiHistory(month?) {
  const [audit, scores] = await Promise.all([
    api('GET', '/audit' + qs({ action: 'kpi.score', month, limit: 200 })),
    raw(month)
  ]);
  return buildKpiHistory(audit, scores);
}
