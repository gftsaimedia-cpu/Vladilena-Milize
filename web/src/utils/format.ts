// Định dạng hiển thị. Tiền là số đồng nguyên (máy chủ tính); giao diện chỉ định dạng, không tính.
const NF0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const pad = (n?) => String(n).padStart(2, '0');

/** 1234567 → "1.234.567" ; null → "—" */
export const vnd = (n?) => (n == null || Number.isNaN(Number(n)) ? '—' : NF0.format(Math.round(Number(n))));
/** 1234567 → "1.234.567 ₫" */
export const vndc = (n?) => (n == null ? '—' : `${vnd(n)} ₫`);
/** có dấu: +46.154 / −7.212 (dấu trừ U+2212 như thiết kế) */
export const vndSigned = (n?) => (n == null ? '—' : `${Number(n) < 0 ? '−' : '+'}${vnd(Math.abs(Number(n)))}`);
/** 7.666 → "7,67" (số giờ, ngày, phần trăm) */
export const num = (n?, digits = 2) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(n));

/** "2026-10-05" → "05/10/2026" */
export const dmy = (iso?) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** "2026-10-05" → "05/10" */
export const dm = (iso?) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
/** "2026-10" → "Tháng 10/2026" */
export const monthLabel = (ym?) => (ym ? `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '');
/** "2026-10" → "10/2026" */
export const monthShort = (ym?) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '');
/** "2026-10" , +1 → "2026-11" */
export function addMonths(ym?, delta?) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

const DOW = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dowOf = (iso?) => new Date(iso + 'T00:00:00Z').getUTCDay();
/** "2026-11-26" → "Thứ Năm, 26/11" */
export const dayLong = (iso?) => `${DOW[dowOf(iso)]}, ${dm(iso)}`;
/** "2026-11-26" → "T5" */
export const dowShort = (iso?) => DOW_SHORT[dowOf(iso)];

/** "Nguyễn Minh An" → "MA" (hai chữ cuối, như ảnh đại diện của thiết kế) */
export function initials(name = '') {
  const w = String(name).trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  const two = w.length >= 2 ? [w[w.length - 2], w[w.length - 1]] : [w[0]];
  return two.map(s => s[0].toUpperCase()).join('');
}
