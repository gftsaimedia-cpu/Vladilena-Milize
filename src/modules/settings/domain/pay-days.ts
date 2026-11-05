// Ngày trả lương: ngày payDay của tháng sau tháng lương, giữ nguyên kể cả khi rơi vào Chủ nhật.

/** month 'YYYY-MM' và payDay (1..28) cho ra 'YYYY-MM-DD' của tháng kế tiếp. */
export function payDateOf(month: string, payDay: number): string {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMon).padStart(2, '0')}-${String(payDay).padStart(2, '0')}`;
}
