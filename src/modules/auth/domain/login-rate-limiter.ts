export const WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES = 5;
export const MAX_NAMES_PER_IP = 30;

export type RateCheck = { allowed: true } | { allowed: false; retryAfterSec: number };

type Entry = { failures: number[] };

// Giới hạn đăng nhập sai trong bộ nhớ (một container): 5 lần sai / 15 phút mỗi cặp (địa chỉ, tên),
// và mỗi địa chỉ thử tối đa 30 tên khác nhau trong 15 phút. Mục hết hạn bị dọn mỗi lần ghi.
export class LoginRateLimiter {
  private readonly pairs = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  check(ip: string, username: string): RateCheck {
    const t = this.now();
    const name = normalize(username);
    const pair = this.live(this.pairs.get(key(ip, name)), t);
    if (pair.length >= MAX_FAILURES) return blocked(pair[0], t);

    // Tên đã thử trước đó vẫn được thử tiếp (theo luật cặp); chỉ tên mới bị chặn khi địa chỉ đã đủ 30 tên.
    if (pair.length === 0) {
      const names = this.namesOf(ip, t);
      if (names.length >= MAX_NAMES_PER_IP) return blocked(Math.min(...names.map(n => n.first)), t);
    }
    return { allowed: true };
  }

  recordFailure(ip: string, username: string): void {
    const t = this.now();
    this.sweep(t);
    const k = key(ip, normalize(username));
    const failures = this.live(this.pairs.get(k), t);
    failures.push(t);
    this.pairs.set(k, { failures });
  }

  recordSuccess(ip: string, username: string): void {
    this.pairs.delete(key(ip, normalize(username)));
  }

  /** Số cặp đang được theo dõi (để kiểm việc dọn). */
  size(): number {
    return this.pairs.size;
  }

  private live(entry: Entry | undefined, t: number): number[] {
    return entry ? entry.failures.filter(at => t - at < WINDOW_MS) : [];
  }

  private namesOf(ip: string, t: number): { first: number }[] {
    const prefix = `${ip}\n`;
    const out: { first: number }[] = [];
    for (const [k, e] of this.pairs) {
      if (!k.startsWith(prefix)) continue;
      const live = this.live(e, t);
      if (live.length) out.push({ first: live[0] });
    }
    return out;
  }

  private sweep(t: number): void {
    for (const [k, e] of this.pairs) if (!this.live(e, t).length) this.pairs.delete(k);
  }
}

const normalize = (username: string) =>
  String(username || '')
    .trim()
    .toLowerCase();
const key = (ip: string, name: string) => `${ip}\n${name}`;
const blocked = (oldest: number, t: number): RateCheck => ({
  allowed: false,
  retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - t) / 1000)),
});
