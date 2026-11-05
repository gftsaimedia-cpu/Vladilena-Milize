/** Ngày trả lương: ngày 10 của tháng sau, dạng YYYY-MM-DD. */
export function paydayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-10`;
}
