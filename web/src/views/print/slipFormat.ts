// Định dạng dùng chung cho phiếu lương (ngăn kéo và bản in A4). Chỉ định dạng, không tính.
import { num, vnd } from '@/utils/format';

/** Tiền hoặc số: âm hiện dấu trừ U+2212; số lẻ (giờ) dùng dấu phẩy; chữ giữ nguyên; null → rỗng. */
export function cellText(v?) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  const abs = Math.abs(v);
  const text = Number.isInteger(abs) ? vnd(abs) : num(abs);
  return v < 0 ? `−${text}` : text;
}

/** Ô trống hoặc bằng 0 (in nhạt). */
export const isZero = (v?) => v == null || v === '' || v === 0 || v === '—';

const DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

/** "2026-10-05" → "Thứ 2, 05/10" */
export const dayLabel = (iso?) =>
  `${DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
