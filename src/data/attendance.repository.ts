import { Insertable, Kysely, Selectable, sql } from 'kysely';
import { flavorOf, SqlFlavor } from './flavor';
import type { LegacySchema } from './legacy-schema';

export type SheetApprovalRow = Selectable<LegacySchema['sheet_approvals']>;
export type AttendanceSessionRow = Selectable<LegacySchema['attendance_sessions']>;
export type PunchRequestRow = Selectable<LegacySchema['punch_requests']>;
export type PunchRow = Selectable<LegacySchema['punches']>;

export interface SheetApprovalFilter {
  status?: string;
  /** 'YYYY-MM': ngày bắt đầu bằng tháng này */
  month?: string;
  username?: string;
}

/** Bảng `sheet_approvals`: các khoản tự khai chờ Admin duyệt (OT, giờ bù, nghỉ phép...), một dòng mỗi (người, ngày). */
export class SheetApprovalsRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<LegacySchema>) {
    this.flavor = flavorOf(qb as any);
  }

  find(username: string, date: string): Promise<SheetApprovalRow | undefined> {
    return this.qb.selectFrom('sheet_approvals').selectAll().where('username', '=', username).where('date', '=', date).executeTakeFirst();
  }

  /** Các dòng của một người trong tháng, theo ngày. */
  ofMonth(username: string, month: string): Promise<SheetApprovalRow[]> {
    return this.qb.selectFrom('sheet_approvals').selectAll().where('username', '=', username).where('date', this.flavor.like, `${month}-%`).orderBy('date').execute();
  }

  async remove(username: string, date: string): Promise<void> {
    await this.qb.deleteFrom('sheet_approvals').where('username', '=', username).where('date', '=', date).execute();
  }

  async insert(row: Insertable<LegacySchema['sheet_approvals']>): Promise<void> {
    await this.qb.insertInto('sheet_approvals').values(row).execute();
  }

  /** Khai lại khác mục hoặc dấu vân tay: về chờ duyệt, rev + 1, xoá người duyệt và lý do. */
  async resubmit(username: string, date: string, item: string, fingerprint: string, at: string): Promise<void> {
    await this.qb
      .updateTable('sheet_approvals')
      .set({ item, fingerprint, status: 'pending', rev: sql<number>`rev + 1`, submitted_at: at, decided_by: null, decided_at: null, note: null })
      .where('username', '=', username)
      .where('date', '=', date)
      .execute();
  }

  /** Danh sách kèm tên nhân sự, theo ngày rồi tên đăng nhập. */
  list(filter: SheetApprovalFilter, page?: { limit: number; offset: number }) {
    let query = this.qb.selectFrom('sheet_approvals as a').leftJoin('staff as s', 's.username', 'a.username').selectAll('a').select('s.name as name');
    if (filter.status) query = query.where('a.status', '=', filter.status);
    if (filter.month) query = query.where('a.date', this.flavor.like, `${filter.month}-%`);
    if (filter.username) query = query.where('a.username', '=', filter.username);
    query = query.orderBy('a.date').orderBy('a.username');
    if (page) query = query.limit(page.limit).offset(page.offset);
    return query.execute();
  }

  /** Duyệt hoặc từ chối đúng phiên bản đã thấy; trả số dòng đổi (0 = đã bị sửa). */
  async decide(row: { username: string; date: string; rev: number; fingerprint: string }, status: string, by: string, at: string, note: string | null): Promise<number> {
    const result = await this.qb
      .updateTable('sheet_approvals')
      .set({ status, rev: sql<number>`rev + 1`, decided_by: by, decided_at: at, note })
      .where('username', '=', row.username)
      .where('date', '=', row.date)
      .where('rev', '=', row.rev)
      .where('fingerprint', '=', row.fingerprint)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}

/** Điều kiện "chưa tới giờ ra" của lượt Admin khai trước: loại khỏi mọi lần đọc thường (xem attendance-sessions). */
const notScheduled = (f: SqlFlavor, origin: string, nowIso: string) =>
  sql<boolean>`NOT (COALESCE(${f.jsonText('entry_json', 'origin')}, '') = ${origin} AND ${f.jsonText('entry_json', 'presOut')} > ${nowIso})`;

/** Các bảng `attendance_sessions`, `punches` (đọc theo phiên) và `punch_requests` (bản nhớ requestId của Check-in/out). */
export class AttendanceSessionsRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<LegacySchema>) {
    this.flavor = flavorOf(qb as any);
  }

  find(id: number): Promise<AttendanceSessionRow | undefined> {
    return this.qb.selectFrom('attendance_sessions').selectAll().where('id', '=', id).executeTakeFirst();
  }

  open(username: string): Promise<AttendanceSessionRow | undefined> {
    return this.qb.selectFrom('attendance_sessions').selectAll().where('username', '=', username).where('state', '=', 'open').executeTakeFirst();
  }

  /** Phiên gần nhất (theo giờ ra, giờ vào rồi lúc tạo), bỏ lượt Admin khai trước chưa tới giờ ra. */
  last(username: string, origin: string, nowIso: string): Promise<AttendanceSessionRow | undefined> {
    return this.qb
      .selectFrom('attendance_sessions')
      .selectAll()
      .where('username', '=', username)
      .where(notScheduled(this.flavor, origin, nowIso))
      .orderBy(sql`COALESCE(${this.flavor.jsonText('entry_json', 'presOut')}, ${this.flavor.jsonText('entry_json', 'presIn')}, created_at)`, 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  list(filter: { username?: string; month?: string; date?: string }, hideScheduled: { origin: string; nowIso: string } | null): Promise<AttendanceSessionRow[]> {
    let query = this.qb.selectFrom('attendance_sessions').selectAll();
    if (hideScheduled) query = query.where(notScheduled(this.flavor, hideScheduled.origin, hideScheduled.nowIso));
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.month) query = query.where('date', this.flavor.like, `${filter.month}-%`);
    if (filter.date) query = query.where('date', '=', filter.date);
    return query.orderBy('date').orderBy('id').execute();
  }

  async insert(row: Insertable<LegacySchema['attendance_sessions']>): Promise<number> {
    const result = await this.qb.insertInto('attendance_sessions').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  /** Cập nhật đúng phiên bản; trả số dòng đổi (0 = phiên bản đã khác). */
  async update(id: number, version: number, d: { date: string; state: string; entryJson: string; at: string }): Promise<number> {
    const result = await this.qb
      .updateTable('attendance_sessions')
      .set({ date: d.date, state: d.state, entry_json: d.entryJson, version: sql<number>`version + 1`, updated_at: d.at })
      .where('id', '=', id)
      .where('version', '=', version)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Lượt bấm của nhiều phiên, id tăng dần. */
  punchesOfSessions(sessionIds: number[]): Promise<PunchRow[]> {
    return this.qb.selectFrom('punches').selectAll().where('session_id', 'in', sessionIds).orderBy('id').execute();
  }

  /** Người có phiên đang mở bắt đầu trước `before` (ISO). */
  staleOpenUsers(before: string): Promise<{ username: string }[]> {
    return this.qb
      .selectFrom('attendance_sessions')
      .select('username')
      .where('state', '=', 'open')
      .where(sql<boolean>`${this.flavor.jsonText('entry_json', 'presIn')} < ${before}`)
      .execute();
  }

  /** Xoá lượt do Admin khai (điều kiện origin nằm ngay trong câu lệnh: không bao giờ xoá nhầm lượt bấm thật); trả số dòng xoá. */
  async removeOrigin(id: number, version: number, origin: string): Promise<number> {
    const result = await this.qb
      .deleteFrom('attendance_sessions')
      .where('id', '=', id)
      .where('version', '=', version)
      .where(sql<boolean>`${this.flavor.jsonText('entry_json', 'origin')} = ${origin}`)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  punchesOf(sessionId: number): Promise<PunchRow[]> {
    return this.qb.selectFrom('punches').selectAll().where('session_id', '=', sessionId).orderBy('id').execute();
  }

  punchRequest(username: string, requestId: string): Promise<PunchRequestRow | undefined> {
    return this.qb.selectFrom('punch_requests').selectAll().where('username', '=', username).where('request_id', '=', requestId).executeTakeFirst();
  }

  async savePunchRequest(row: Insertable<LegacySchema['punch_requests']>): Promise<void> {
    await this.qb.insertInto('punch_requests').values(row).execute();
  }

  /** Xoá bản nhớ cũ hơn `cutoff` (dòng chưa có created_at giữ nguyên); trả số dòng xoá. */
  async purgePunchRequests(cutoff: string): Promise<number> {
    const result = await this.qb.deleteFrom('punch_requests').where('created_at', 'is not', null).where('created_at', '<', cutoff).executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
