// Dòng chức vụ (kèm bậc) theo tháng áp dụng, giữ suốt một hộp thoại: máy chủ so rev với dòng của đúng tháng áp dụng,
// nên rev phải là số lúc bắt đầu sửa; chỉ sau khi máy chủ báo dòng đã đổi (*_STALE) mới chụp lại.
import { getPositionAt } from '@/services/admin-catalog';

export function useSnapshots(code?, month?, row?) {
  const map = new Map<any, any>([[month, Promise.resolve(row)]]);
  const at = (m?) => {
    if (!map.has(m)) {
      const pr = getPositionAt(m, code);
      map.set(m, pr);
      pr.catch(() => map.get(m) === pr && map.delete(m));
    }
    return map.get(m);
  };
  const clear = () => map.clear();
  return { at, clear };
}

/** Lỗi 409 mang mã *_STALE: dòng vừa được người khác sửa. */
export const isStale = (e?) => !!e && e.status === 409 && /_STALE$/.test(String(e.code || ''));
