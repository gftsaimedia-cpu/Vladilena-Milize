// Dịch vụ danh mục chức vụ và bậc (Admin): đọc theo tháng, sửa chức vụ, sửa hoặc thêm bậc kế tiếp.
// Mỗi lần ghi gửi số phiên bản (rev) của dòng đang hiệu lực ở tháng áp dụng; máy chủ báo *_STALE (409) khi dòng đã bị người khác sửa.
import { api, qs } from '@/services/http';
import { buildPositions } from '@/builders/admin-catalog/positions';

const fetchRaw = (month?) => api('GET', `/catalog/positions${qs({ month })}`);

// GET /api/catalog/positions?month= -> { month, baseMonth, benefits, positions: [{ ..., rev, levels }] }
export const getPositions = (month?) => fetchRaw(month).then(buildPositions);

/** Dòng chức vụ (kèm bậc) đang hiệu lực ở một tháng; null khi chức vụ chưa có ở tháng đó. */
export const getPositionAt = (month?, code?) =>
  fetchRaw(month).then(res => (res.positions || []).find(p => p.code === code) || null);

// PUT /api/catalog/positions/:mã { changes, effectiveMonth, reason?, expectedRev }
export const savePosition = ({ code, changes, effectiveMonth, reason, expectedRev }: any) =>
  api('PUT', `/catalog/positions/${encodeURIComponent(code)}`, {
    changes,
    effectiveMonth,
    expectedRev,
    ...(reason ? { reason } : {})
  });

// PUT /api/catalog/levels { type, level, changes, effectiveMonth, reason?, expectedRev? }: thêm bậc kế tiếp thì bỏ expectedRev
export const saveLevel = ({ type, level, changes, effectiveMonth, reason, expectedRev }: any) =>
  api('PUT', '/catalog/levels', {
    type,
    level,
    changes,
    effectiveMonth,
    ...(expectedRev === undefined ? {} : { expectedRev }),
    ...(reason ? { reason } : {})
  });
