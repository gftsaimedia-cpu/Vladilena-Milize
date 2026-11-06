import { Exceptions, addDays, dates, punchDay } from './attendance';
import { Demo, Res, must, setClock } from './harness';
import { PEOPLE, Person } from './people';

// Kịch bản 3 tháng (09–11/2026) theo thời gian: mỗi sự kiện chạy khi đồng hồ giả ở đúng thời điểm của nó.
// Chấm công của ngày D chạy lúc 07:30 ngày D+1 (kể cả ca đêm ra 07:00); việc của kỳ lương chạy sáng ngày 1 hoặc ngày trả.
export interface Event {
  at: string; // 'YYYY-MM-DDTHH:mm' giờ VN
  label: string;
  run: () => Promise<void>;
}

export const HOLIDAYS: Array<[string, string]> = [
  ['2026-09-02', 'Quốc khánh'],
  ['2026-10-20', 'Ngày Phụ nữ Việt Nam'],
  ['2026-11-20', 'Ngày Nhà giáo Việt Nam']
];
export const TODAY = '2026-11-06';

export class Script {
  events: Event[] = [];
  exc: Exceptions = {};
  weeks = new Map<string, number[]>();
  holidays = new Set(HOLIDAYS.map(h => h[0]));
  limits: Record<string, { until?: string }> = {};
  ids = new Map<string, string>(); // tên gọi -> id đơn
  expected: Array<{ label: string; status: number; body: any }> = [];

  constructor(readonly demo: Demo, readonly log: (s: string) => void) {}

  on(at: string, label: string, run: () => Promise<void>): void {
    this.events.push({ at, label, run });
  }

  /** Bỏ chấm công cả khoảng ngày của một người (nghỉ, vắng). */
  skip(user: string, from: string, to = from): void {
    for (const d of dates(from, to)) this.exc[`${user}|${d}`] = { skip: true };
  }
  day(user: string, date: string, d: { in?: string | null; out?: string | null }): void {
    this.exc[`${user}|${date}`] = d;
  }

  // ---- đơn từ ----
  async file(user: string, kind: string, body: unknown, name?: string): Promise<string> {
    const out = must(await this.demo.as(user).post(`/api/v2/me/requests/${kind}`, body), `${user} nộp ${kind} ${name ?? ''}`);
    const id = out.request.id as string;
    if (name) this.ids.set(name, id);
    return id;
  }
  /** Nộp đơn mà BE phải từ chối: ghi lại mã và nội dung lỗi thật để kiểm. */
  async fileBlocked(user: string, kind: string, body: unknown, name: string): Promise<Res> {
    const res = await this.demo.as(user).post(`/api/v2/me/requests/${kind}`, body);
    if (res.status < 400) throw new Error(`${name}: đáng lẽ bị chặn nhưng BE nhận (${res.status})`);
    this.expected.push({ label: name, status: res.status, body: res.body });
    return res;
  }
  async review(name: string, action: 'APPROVE' | 'REJECT', note?: string): Promise<Res> {
    const id = this.ids.get(name);
    if (!id) throw new Error(`Chưa có đơn ${name}`);
    return this.demo.admin.patch(`/api/v2/requests/${id}/review`, { action, ...(note ? { note } : {}) });
  }
  async approve(name: string): Promise<void> {
    must(await this.review(name, 'APPROVE'), `duyệt ${name}`);
  }
  async reject(name: string, note: string): Promise<void> {
    must(await this.review(name, 'REJECT', note), `từ chối ${name}`);
  }
  async cancel(user: string, name: string, reason = 'Không cần nữa'): Promise<void> {
    must(await this.demo.as(user).patch(`/api/v2/me/requests/${this.ids.get(name)}/cancel`, { reason }), `huỷ ${name}`);
  }

  // ---- chạy ----
  async runAll(): Promise<void> {
    this.addDailyPunches('2026-09-01', TODAY);
    const sorted = this.events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i)
      .map(x => x.e);
    for (const ev of sorted) {
      setClock(`${ev.at}:00+07:00`);
      try {
        await ev.run();
      } catch (err) {
        throw new Error(`[${ev.at}] ${ev.label}: ${err instanceof Error ? err.message : err}`);
      }
    }
    this.log(`đã chạy ${sorted.length} sự kiện`);
  }

  private addDailyPunches(from: string, to: string): void {
    for (const date of dates(from, addDays(to, -1))) {
      this.on(`${addDays(date, 1)}T07:30`, `chấm công ${date}`, async () => {
        for (const p of PEOPLE) await this.punchOne(p, date);
      });
    }
  }

  private async punchOne(p: Person, date: string): Promise<void> {
    if (date < p.from || (this.limits[p.username]?.until && date > this.limits[p.username].until!)) return;
    if (!this.weeks.get(p.username)!.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || this.holidays.has(date)) {
      const x = this.exc[`${p.username}|${date}`];
      if (!x || x.skip) return; // ngày nghỉ: chỉ chấm khi kịch bản chủ ý ghi giờ (làm Chủ nhật, làm ngày lễ)
    }
    await punchDay(this.demo, p, date, this.exc[`${p.username}|${date}`]);
  }
}
