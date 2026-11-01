// Ngày nhập tay dd/mm/yyyy ↔ 'YYYY-MM-DD' (chỉ đổi dạng chữ, không tính toán nghiệp vụ).
const pad = (n?) => String(n).padStart(2, '0');

/** "05/11/2026" → "2026-11-05"; sai dạng hoặc ngày không có thật → null */
export function parseDmy(text?) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/.exec(text || '');
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "2026-11" → [{ value: '2026-11', label: 'Tháng 11/2026' }, …] n tháng liền nhau */
export function monthOptions(startYm?, n = 6) {
  const [y, m] = startYm.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const value = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    return { value, label: `Tháng ${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` };
  });
}
