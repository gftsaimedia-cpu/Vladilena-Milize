// Chuỗi phiên bản của một chức vụ hoặc một bậc, mỗi phiên bản có hiệu lực từ một tháng.
// Lưu một thay đổi từ tháng M: sửa tại chỗ nếu đã có phiên bản tháng M, không thì chép phiên bản đang hiệu lực sang
// tháng M. Rồi chép tiếp từng ô sang các phiên bản sau, cho tới phiên bản đầu tiên đã tự đặt số khác số cũ.

export type Values = Record<string, string | number | boolean | null>;

export interface ChainVersion {
  month: string;
  values: Values;
}

export interface ChainPlan {
  /** Tháng của phiên bản đang hiệu lực ở M (mới nhất không sau M). */
  base: string;
  /** update: sửa thẳng phiên bản tháng M; insert: chép phiên bản base sang tháng M. */
  mode: 'update' | 'insert';
  /** Chỉ các ô đổi, với số mới. */
  set: Values;
  /** Các phiên bản sau M (tháng tăng dần) và những ô chúng nhận. */
  carry: Array<{ month: string; set: Values }>;
}

/** Phiên bản mới nhất có tháng không sau `month`; null khi chưa có. */
export function versionAt<T extends { month: string }>(chain: readonly T[], month: string): T | null {
  let best: T | null = null;
  for (const v of chain) if (v.month <= month && (!best || v.month > best.month)) best = v;
  return best;
}

/** Kế hoạch ghi cho một lần lưu; null khi mọi ô đều bằng số đang hiệu lực. */
export function planChange(chain: readonly ChainVersion[], month: string, changes: Values): ChainPlan | null {
  const cur = versionAt(chain, month);
  if (!cur) throw new Error('no version in force');

  const set: Values = {};
  for (const [key, value] of Object.entries(changes)) if (value !== cur.values[key]) set[key] = value;
  if (!Object.keys(set).length) return null;

  const later = chain.filter(v => v.month > month).sort((a, b) => a.month.localeCompare(b.month));
  const carried = new Map<string, Values>();
  for (const [key, value] of Object.entries(set)) {
    const old = cur.values[key];
    for (const v of later) {
      if (v.values[key] !== old) break;
      const into = carried.get(v.month) ?? {};
      into[key] = value;
      carried.set(v.month, into);
    }
  }
  const carry = later.filter(v => carried.has(v.month)).map(v => ({ month: v.month, set: carried.get(v.month) as Values }));

  return { base: cur.month, mode: cur.month === month ? 'update' : 'insert', set, carry };
}
