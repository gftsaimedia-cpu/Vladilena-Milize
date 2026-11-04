// Thanh kỳ lương trên đầu mọi màn Admin: tên tháng và thanh rỗng khi chưa nạp. Dữ liệu các bước ở mock/period.

export function monthTitle(month?) {
  return `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;
}

/** Thanh khi chưa tải được kỳ: chỉ có tên tháng. */
export function emptyStrip(month?) {
  return { month: monthTitle(month), state: '', stateCls: '', steps: [] };
}
