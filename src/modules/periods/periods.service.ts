import { Inject, Injectable, Optional } from '@nestjs/common';
import { businessDateText } from '../../common/business-date';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { AuditLog } from '../audit';
import { RealtimeBus } from '../realtime/realtime-bus';
import { payDateOf, SettingsMissingError, SettingsReader } from '../settings';
import {
  approveReason,
  availableActions,
  monthEnded,
  nextStatus,
  paydayOf,
  type ActionState,
  type PeriodAction,
  type PeriodStatus,
} from './domain';
import {
  BeforePaydayError,
  MonthNotEndedError,
  NoSettingsError,
  PeriodBlockedError,
  PeriodStateError,
  ReasonInvalidError,
  ReasonRequiredError,
  ReasonTooLongError,
} from './periods.errors';
import { PeriodsRepository, type PeriodPatch, type PeriodRow } from './periods.repository';

/** Lý do dài nhất nhật ký nhận (REASON_MAX của audit-entry). */
const REASON_MAX = 1000;

/** Lý do của Mở lại công / Huỷ phê duyệt, đã cắt khoảng trắng hai đầu; kiểm trước khi mở giao dịch nào. */
function requireReason(reason: unknown): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text === '') throw new ReasonRequiredError();
  if (text.length > REASON_MAX) throw new ReasonTooLongError(REASON_MAX);
  // Nhật ký (và PG) không nhận ký tự NUL: từ chối ở đây thành 400, không để thành 500 trong giao dịch.
  if (text.includes('\u0000')) throw new ReasonInvalidError();
  return text;
}

export interface PeriodSteps {
  lockedAt: string | null;
  lockedBy: string | null;
  calculatedAt: string | null;
  calculatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paidBy: string | null;
}

export interface PeriodView {
  month: string;
  status: PeriodStatus;
  steps: PeriodSteps;
  payday: string;
  actions: Partial<Record<PeriodAction, ActionState>>;
}

@Injectable()
export class PeriodsService {
  now: () => Date = () => new Date();

  constructor(
    @Inject(PeriodsRepository) private readonly repo: PeriodsRepository,
    @Inject(TransactionCoordinator) private readonly tx: TransactionCoordinator,
    @Inject(AuditLog) private readonly audit: AuditLog,
    // Ngày trả lương lấy từ kho cài đặt (Lịch trả lương, 1–28 tháng sau). Không có reader (test dựng tay) thì ngày 10.
    @Optional() @Inject(SettingsReader) private readonly settings?: Pick<SettingsReader, 'settingsFor'>,
    // Báo cho Admin khác khi kỳ đổi trạng thái (sau commit); thiếu thì không phát.
    @Optional() @Inject(RealtimeBus) private readonly bus?: RealtimeBus
  ) {}

  /**
   * Ngày trả lương của kỳ `month` (YYYY-MM-DD, giờ VN): ngày `payCalendar.payDay` đang hiệu lực ở `month` của tháng sau;
   * không có kho cài đặt thì `paydayOf` (ngày 10). Có `trx` thì đọc cài đặt trên giao dịch đó (không xin thêm kết nối).
   */
  async paydayFor(month: string, trx?: DatabaseTransaction): Promise<string> {
    if (!this.settings) return paydayOf(month);
    try {
      const { payCalendar } = await this.settings.settingsFor(month, trx);
      return payDateOf(month, payCalendar.payDay);
    } catch (err) {
      // Tháng trước phiên bản cài đặt đầu tiên: 400 NO_SETTINGS (lỗi khác, như lỗi DB, ném lại nguyên vẹn).
      if (err instanceof SettingsMissingError) throw new NoSettingsError(month);
      throw err;
    }
  }

  /** Mọi kỳ đã có dòng, tháng mới nhất trước. */
  async list(): Promise<PeriodRow[]> {
    return this.repo.list();
  }

  /** Dòng kỳ của tháng, `null` khi chưa có (tức 'open'). Tên giữ nguyên cho /me. */
  async getPeriod(month: string): Promise<PeriodRow | null> {
    return this.repo.find(month);
  }

  /** Trạng thái và rev hiện tại; chưa có dòng thì `{ 'open', 0 }`. */
  async snapshot(month: string): Promise<{ status: PeriodStatus; rev: number }> {
    const row = await this.repo.find(month);
    return { status: (row?.status as PeriodStatus | undefined) ?? 'open', rev: row ? Number(row.rev) : 0 };
  }

  /** Dạng trả về của mọi route kỳ lương. Có `trx` thì đọc trên giao dịch đó (thấy cả phần vừa ghi). */
  async view(month: string, trx?: DatabaseTransaction): Promise<PeriodView> {
    const row = await this.repo.find(month, trx);
    const status = (row?.status as PeriodStatus | undefined) ?? 'open';
    const payday = await this.paydayFor(month, trx);
    // Nút Phê duyệt kỳ cần biết còn vướng gì; các trạng thái khác không có nút này.
    const blockers = status === 'calculated' ? await this.repo.blockers(trx, month) : null;
    return {
      month,
      status,
      steps: {
        lockedAt: row?.attendance_locked_at ?? null,
        lockedBy: row?.attendance_locked_by ?? null,
        calculatedAt: row?.calculated_at ?? null,
        calculatedBy: row?.calculated_by ?? null,
        approvedAt: row?.approved_at ?? null,
        approvedBy: row?.approved_by ?? null,
        paidAt: row?.paid_at ?? null,
        paidBy: row?.paid_by ?? null,
      },
      payday,
      actions: availableActions({ month, status, today: businessDateText(this.now()), payday, blockers }),
    };
  }

  /** Chốt công: kỳ 'open' (hoặc chưa có dòng) sang 'attendance_locked', chỉ khi tháng đã kết thúc. */
  private async lockRaw(month: string, actor: string): Promise<PeriodView> {
    return this.transition(month, 'lock', actor, null, async () => {
      if (!monthEnded(month, businessDateText(this.now()))) throw new MonthNotEndedError(month);
      return { attendance_locked_by: actor, attendance_locked_at: this.now().toISOString() };
    });
  }

  /** Mở lại công: về 'open', xoá dấu chốt công và dấu tính lương, tăng reopen_count. Cần lý do, tối đa 1000 ký tự. */
  private async unlockRaw(month: string, actor: string, reason: unknown): Promise<PeriodView> {
    const text = requireReason(reason);
    return this.transition(month, 'unlock', actor, text, async (_trx, row) => ({
      attendance_locked_by: null,
      attendance_locked_at: null,
      calculated_by: null,
      calculated_at: null,
      reopen_count: Number(row?.reopen_count ?? 0) + 1,
    }));
  }

  /**
   * Phê duyệt kỳ: 'calculated' sang 'approved', lần chạy hiện tại thành 'final'. Giữ khoá `payroll_<tháng>` trước rồi mới
   * tới khoá kỳ (cùng thứ tự với tính lương), nên không xen vào giữa một lần tính hay một quyết định duyệt phiếu.
   * Còn đơn chờ duyệt, phiếu chưa duyệt hoặc người chưa có phiếu thì `PERIOD_BLOCKED`.
   */
  private async approveRaw(month: string, actor: string): Promise<PeriodView> {
    return this.tx.withLock(`payroll_${month}`, trx =>
      this.transition(
        month,
        'approve',
        actor,
        null,
        async t => {
          const blockers = await this.repo.blockers(t, month);
          if (approveReason(blockers) !== undefined) throw new PeriodBlockedError(month, blockers);
          const run = await this.repo.currentRun(t, month);
          if (!run) throw new Error(`Kỳ lương ${month} đã tính nhưng không có lần chạy lương hiện tại`);
          await this.repo.finalizeRun(t, run.id);
          return { approved_by: actor, approved_at: this.now().toISOString(), current_run_id: run.id };
        },
        trx
      )
    );
  }

  /**
   * Huỷ phê duyệt: 'approved' về 'calculated'. Lần chạy 'final' thành 'superseded' và được chép cùng các phiếu (giữ nguyên
   * trạng thái duyệt) sang một lần chạy nháp mới. Cần lý do, tối đa 1000 ký tự.
   */
  private async unapproveRaw(month: string, actor: string, reason: unknown): Promise<PeriodView> {
    const text = requireReason(reason);
    return this.tx.withLock(`payroll_${month}`, trx =>
      this.transition(
        month,
        'unapprove',
        actor,
        text,
        async t => {
          const runId = await this.repo.reopenRun(t, month, actor, this.now().toISOString());
          return { approved_by: null, approved_at: null, current_run_id: runId };
        },
        trx
      )
    );
  }

  /** Đã trả lương: 'approved' sang 'paid', chỉ từ ngày trả lương (giờ Việt Nam, theo kho cài đặt) trở đi. */
  private async payRaw(month: string, actor: string): Promise<PeriodView> {
    return this.transition(month, 'pay', actor, null, async t => {
      const payday = await this.paydayFor(month, t);
      if (businessDateText(this.now()) < payday) throw new BeforePaydayError(month, payday);
      return { paid_by: actor, paid_at: this.now().toISOString() };
    });
  }

  // Các bước chuyển kỳ phát `period.changed` sau khi đã commit, để màn Admin khác tự cập nhật.
  async lock(month: string, actor: string): Promise<PeriodView> {
    return this.announced(month, await this.lockRaw(month, actor));
  }
  async unlock(month: string, actor: string, reason: unknown): Promise<PeriodView> {
    return this.announced(month, await this.unlockRaw(month, actor, reason));
  }
  async approve(month: string, actor: string): Promise<PeriodView> {
    return this.announced(month, await this.approveRaw(month, actor));
  }
  async unapprove(month: string, actor: string, reason: unknown): Promise<PeriodView> {
    return this.announced(month, await this.unapproveRaw(month, actor, reason));
  }
  async pay(month: string, actor: string): Promise<PeriodView> {
    return this.announced(month, await this.payRaw(month, actor));
  }

  /** Phát `period.changed`; lỗi ở bus chỉ ghi log. */
  announce(month: string, state: string): void {
    try {
      this.bus?.publish({ type: 'period.changed', month, state });
    } catch (err) {
      console.error('Không phát được sự kiện realtime:', err);
    }
  }

  private announced(month: string, view: PeriodView): PeriodView {
    this.announce(month, view.status);
    return view;
  }

  /**
   * Bảng lương vừa lưu một lần chạy: chạy cả kỳ sau Chốt công thì sang 'calculated'; kỳ đã 'calculated' thì chỉ cập nhật
   * dấu tính lương và lần chạy hiện tại. Không ghi nhật ký kỳ (tính lương tự động, spec §10).
   * `expectedRev` là rev đọc lúc bắt đầu tính: đã đổi (vd. Mở lại công xen vào) thì không đổi gì (R4).
   * Có `trx` thì chạy trên giao dịch đó (người gọi giữ commit), không thì tự mở giao dịch. Trả trạng thái sau cùng.
   */
  async markCalculated(
    trx: DatabaseTransaction | undefined,
    month: string,
    o: { runId: number; actor: string; full: boolean; expectedRev: number }
  ): Promise<PeriodStatus> {
    const run = async (t: DatabaseTransaction): Promise<PeriodStatus> => {
      await this.repo.lockExclusive(t, month);
      const row = await this.repo.find(month, t);
      const status = (row?.status as PeriodStatus | undefined) ?? 'open';
      if ((row ? Number(row.rev) : 0) !== o.expectedRev) return status;
      const stamp = { calculated_by: o.actor, calculated_at: this.now().toISOString(), current_run_id: o.runId };
      if (status === 'attendance_locked' && o.full) {
        await this.repo.save(t, month, { status: 'calculated', ...stamp });
        return 'calculated';
      }
      if (status === 'calculated') {
        await this.repo.save(t, month, stamp);
        return 'calculated';
      }
      return status;
    };
    return trx ? run(trx) : this.tx.run(run);
  }

  /**
   * Một bước chuyển trạng thái: khoá độc quyền của tháng, kiểm bảng chuyển, `apply` cho phần cột đổi,
   * ghi kỳ và nhật ký cùng giao dịch, rồi dựng view trên chính giao dịch đó (thấy phần vừa ghi) và trả sau commit.
   * Có `trx` thì chạy trên `trx` của người gọi (người gọi giữ commit).
   */
  protected async transition(
    month: string,
    action: PeriodAction,
    actor: string,
    reason: string | null,
    apply: (trx: DatabaseTransaction, row: PeriodRow | null) => Promise<PeriodPatch>,
    trx?: DatabaseTransaction
  ): Promise<PeriodView> {
    const run = async (t: DatabaseTransaction): Promise<PeriodView> => {
      await this.repo.lockExclusive(t, month);
      const row = await this.repo.find(month, t);
      const from = (row?.status as PeriodStatus | undefined) ?? 'open';
      const next = nextStatus(from, action);
      if (next === null) throw new PeriodStateError(month, from);
      const patch = await apply(t, row);
      await this.repo.save(t, month, { status: next, ...patch });
      await this.audit.append(t, {
        actor,
        action: `period.${action}`,
        entityKind: 'period',
        entityId: month,
        month,
        before: { status: from },
        after: { status: next },
        reason,
        sensitivity: 'normal',
      });
      return this.view(month, t);
    };
    return trx ? run(trx) : this.tx.run(run);
  }
}
