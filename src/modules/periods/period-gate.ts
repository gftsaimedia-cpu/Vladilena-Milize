import { Injectable } from '@nestjs/common';
import type { DatabaseTransaction } from '../../database';
import { gateAllows, type GateUse, type PeriodStatus } from './domain';
import { PeriodLockedError } from './periods.errors';
import { PeriodsRepository } from './periods.repository';

/** Chặn thao tác của một tháng đã chốt. Có `trx` thì giữ khoá chia sẻ của tháng tới hết giao dịch, nên chốt công không chen được giữa kiểm tra và ghi. */
@Injectable()
export class PeriodGate {
  constructor(private readonly repo: PeriodsRepository) {}

  /** Trạng thái kỳ của tháng; không có dòng nghĩa là 'open'. */
  async statusOf(trx: DatabaseTransaction | undefined, month: string): Promise<PeriodStatus> {
    if (trx) await this.repo.lockShared(trx, month);
    const row = await this.repo.find(month, trx);
    return (row?.status as PeriodStatus | undefined) ?? 'open';
  }

  /** Duyệt các tháng (bỏ trùng, tăng dần để lấy khoá cùng thứ tự). Tháng đầu tiên không cho phép `use` thì ném PeriodLockedError. */
  async hold(trx: DatabaseTransaction | undefined, months: string[], use: GateUse): Promise<void> {
    for (const month of [...new Set(months)].sort()) {
      const status = await this.statusOf(trx, month);
      if (!gateAllows(status, use)) throw new PeriodLockedError(month, status);
    }
  }
}
