/**
 * D1 (06/11, người dùng chốt): mỗi khoản tiền trên phiếu lương là MỘT công thức đầy đủ từ lương cơ bản, tính trên số
 * lượng chưa làm tròn, và làm tròn đúng một lần ở kết quả của khoản đó. Không bao giờ nhân đơn giá đã làm tròn (230.769
 * một ngày, 28.846 một giờ) với số lượng, và không cộng các số tiền từng ngày đã làm tròn thành tổng.
 */
export interface MoneyOptions {
  perHour?: boolean; // `quantity` is hours: divide by standardDays x 8 instead of standardDays
  rate?: number; // multiplier inside the formula (OT x1.5, an allowance %, the advance 80%); default 1
}

/** round(base x quantity x rate / (standardDays x (perHour ? 8 : 1))). */
export function moneyOf(base: number, standardDays: number, quantity: number, opts: MoneyOptions = {}): number {
  return Math.round((base * quantity * (opts.rate ?? 1)) / (standardDays * (opts.perHour ? 8 : 1)));
}
