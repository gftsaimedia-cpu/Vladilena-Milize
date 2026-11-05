import { Inject, Injectable } from '@nestjs/common';
import { businessDateText } from '../../common/business-date';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database';
import { AuditLog } from '../audit';
import {
  availableActions,
  monthEnded,
  nextStatus,
  paydayOf,
  type ActionState,
  type PeriodAction,
  type PeriodStatus,
} from './domain';
import { MonthNotEndedError, PeriodStateError, ReasonRequiredError } from './periods.errors';
import { PeriodsRepository, type PeriodPatch, type PeriodRow } from './periods.repository';

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
    @Inject(AuditLog) private readonly audit: AuditLog
  ) {}

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
    const payday = paydayOf(month);
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
      // Task 5 nối blockers của bước Phê duyệt kỳ.
      actions: availableActions({ month, status, today: businessDateText(this.now()), payday, blockers: null }),
    };
  }

  /** Chốt công: kỳ 'open' (hoặc chưa có dòng) sang 'attendance_locked', chỉ khi tháng đã kết thúc. */
  async lock(month: string, actor: string): Promise<PeriodView> {
    return this.transition(month, 'lock', actor, null, async () => {
      if (!monthEnded(month, businessDateText(this.now()))) throw new MonthNotEndedError(month);
      return { attendance_locked_by: actor, attendance_locked_at: this.now().toISOString() };
    });
  }

  /** Mở lại công: về 'open', xoá dấu chốt công và dấu tính lương, tăng reopen_count. Cần lý do. */
  async unlock(month: string, actor: string, reason: unknown): Promise<PeriodView> {
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (text === '') throw new ReasonRequiredError();
    return this.transition(month, 'unlock', actor, text, async (_trx, row) => ({
      attendance_locked_by: null,
      attendance_locked_at: null,
      calculated_by: null,
      calculated_at: null,
      reopen_count: Number(row?.reopen_count ?? 0) + 1,
    }));
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
