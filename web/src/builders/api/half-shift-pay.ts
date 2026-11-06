// Nghỉ giữa ca trên phiếu lương: số phút nợ / đã bù / bị bỏ và tiền bù do BE tính; ở đây chỉ gom và viết chữ.
// Import tương đối để chạy được trong test Node.
import { num } from '../../utils/format';

export type HalfShiftPay = { owedMinutes: number; repaidMinutes: number; droppedMinutes: number; pay: number };

/** Các trường nghỉ giữa ca của phiếu BE (thiếu ở phiếu lưu trước khi BE thêm chúng). */
export type HalfShiftPayDTO = {
  halfShiftOwedMinutes?: number | null;
  halfShiftRepaidMinutes?: number | null;
  halfShiftDroppedMinutes?: number | null;
  halfShiftRepaidPay?: number | null;
};

/** Gom bốn trường của BE; tháng không nợ giờ nghỉ giữa ca (hay phiếu cũ) thì null. */
export function halfShiftPayOf(d: HalfShiftPayDTO): HalfShiftPay | null {
  if (!d.halfShiftOwedMinutes) return null;
  return {
    owedMinutes: d.halfShiftOwedMinutes,
    repaidMinutes: d.halfShiftRepaidMinutes ?? 0,
    droppedMinutes: d.halfShiftDroppedMinutes ?? 0,
    pay: d.halfShiftRepaidPay ?? 0
  };
}

const hours = (min: number) => num(min / 60);

/** "Bù 2 / 4 giờ · bỏ 2 giờ": giờ đã bù trên giờ nợ, rồi phần bị bỏ cuối tháng khi có. */
export function halfShiftNote(h: HalfShiftPay): string {
  const base = `Bù ${hours(h.repaidMinutes)} / ${hours(h.owedMinutes)} giờ`;
  return h.droppedMinutes ? `${base} · bỏ ${hours(h.droppedMinutes)} giờ` : base;
}
