// Chấm công tự động của hộp demo: Admin (`boss`) chấm hộ nhân viên theo giờ giả, qua chính API của app.
export interface StaffInfo {
  username: string;
  uuid: string;
  name: string;
  start: string; // 'HH:mm' giờ vào của ca
  end: string;
}

const ADMIN = { username: 'boss', password: 'Demo@123456' };
const VN = 7 * 3600_000;
const ymd = (ms: number) => new Date(ms + VN).toISOString().slice(0, 10);
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Thời điểm UTC (ms) của 'HH:mm' giờ VN trong ngày `date`, cộng `plusDays` ngày. */
const at = (date: string, t: string, plusDays = 0) => new Date(`${date}T00:00:00Z`).getTime() - VN + (plusDays * 1440 + hm(t)) * 60_000;

export class AutoPunch {
  private cookie = '';
  /** Người đang bật chế độ tự chấm theo ca. */
  readonly auto = new Set<string>();
  /** Số phút vào trễ khi tự chấm (0 = đúng giờ). */
  lateMinutes = 0;
  lastRun = '';
  log: string[] = [];

  constructor(private readonly base: string) {}

  private async call(method: string, path: string, body?: unknown, retry = true): Promise<{ status: number; body: any }> {
    if (!this.cookie) {
      const res = await fetch(this.base + '/api/v2/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ADMIN) });
      this.cookie = String(res.headers.get('set-cookie')).split(';')[0];
    }
    const res = await fetch(this.base + path, {
      method,
      headers: { cookie: this.cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 && retry) {
      this.cookie = '';
      return this.call(method, path, body, false);
    }
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* giữ nguyên */
    }
    return { status: res.status, body: parsed };
  }

  async staff(): Promise<StaffInfo[]> {
    const out = await this.call('GET', '/api/v2/employees');
    const list: any[] = out.body?.employees ?? [];
    return list
      .filter(e => !e.account?.isLocked && (e.account?.roles ?? [e.account?.role]).includes('staff'))
      .map(e => ({
        username: e.account.username,
        uuid: e.profile.uuid,
        name: e.profile.fullName,
        start: e.contract.shift.startTime,
        end: e.contract.shift.endTime
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  private async punch(p: StaffInfo, type: 'IN' | 'OUT', atMs: number): Promise<string> {
    const out = await this.call('POST', '/api/v2/attendance/punches', { employeeId: p.uuid, type, punchedAt: new Date(atMs).toISOString() });
    const msg = out.status < 300 ? `${p.name}: ${type === 'IN' ? 'vào' : 'ra'} lúc ${new Date(atMs + VN).toISOString().slice(11, 16)}` : `${p.name}: ${type} bị từ chối (${out.body?.error ?? out.status})`;
    this.log.unshift(msg);
    this.log.length = Math.min(this.log.length, 12);
    return msg;
  }

  /** Chấm vào / ra ngay lúc này (giờ giả) cho các người được chọn. */
  async now(usernames: string[], type: 'IN' | 'OUT'): Promise<string[]> {
    const all = await this.staff();
    const result: string[] = [];
    for (const p of all.filter(s => usernames.includes(s.username))) result.push(await this.punch(p, type, Date.now()));
    return result;
  }

  private async workday(p: StaffInfo, date: string, holidays: Set<string>): Promise<boolean> {
    if (holidays.has(date)) return false;
    const w = await this.call('GET', `/api/v2/settings/work-weeks/${p.username}?month=${date.slice(0, 7)}`);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return (w.body?.weekdays ?? [1, 2, 3, 4, 5, 6]).includes(dow);
  }

  /** Mỗi lượt: người bật tự chấm sẽ vào khi giờ giả qua giờ vào ca, ra khi qua giờ ra ca (xét hôm qua và hôm nay cho ca đêm). */
  async tick(): Promise<void> {
    if (!this.auto.size) return;
    const now = Date.now();
    const today = ymd(now);
    const days = [ymd(now - 86400_000), today];
    const hol = await this.call('GET', `/api/v2/holidays?year=${today.slice(0, 4)}`);
    const holidays = new Set<string>((hol.body?.items ?? []).map((h: any) => h.date));
    for (const p of (await this.staff()).filter(s => this.auto.has(s.username))) {
      for (const date of days) {
        if (!(await this.workday(p, date, holidays))) continue;
        const overnight = hm(p.end) <= hm(p.start);
        const inAt = at(date, p.start) + this.lateMinutes * 60_000;
        const outAt = at(date, p.end, overnight ? 1 : 0);
        if (now < inAt) continue;
        const got = await this.call('GET', `/api/v2/attendance/punches?employeeId=${p.uuid}&workDate=${date}`);
        const types = new Set<string>((got.body?.punches ?? []).map((x: any) => x.type));
        let hasIn = types.has('IN');
        if (!hasIn) hasIn = !(await this.punch(p, 'IN', inAt)).includes('từ chối');
        if (hasIn && now >= outAt && !types.has('OUT')) await this.punch(p, 'OUT', outAt);
      }
    }
    this.lastRun = new Date().toISOString();
  }
}
