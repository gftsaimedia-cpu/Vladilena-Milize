// Lưu chức vụ và bậc theo tháng áp dụng (spec mục 3.3). Mỗi lần lưu chạy trong một transaction, khoá từng mã chức vụ
// theo thứ tự; kiểm hết mọi mục (404, 409) rồi mới ghi, nên một mục lỗi thì không mục nào được lưu.
import { Inject, Injectable } from '@nestjs/common';
import { businessMonthText } from '../../common/business-date';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database/transaction';
import { parseAddLevel, parseSaveLevel, parseSavePositions } from './domain/position-input';
import { planChange, versionAt, type ChainPlan } from './domain/version-chain';
import { LevelNotFoundError, LevelStaleError, PositionNotFoundError, PositionStaleError } from './positions.errors';
import { PositionsRepository, type StoredVersion, type WriteMeta } from './positions.repository';

type Tx = Pick<TransactionCoordinator, 'run' | 'acquireAdvisoryLock'>;
type Planned = { chain: StoredVersion[]; cur: StoredVersion; plan: ChainPlan };

const monthText = (ym: string) => `${ym.slice(5)}/${ym.slice(0, 4)}`;

@Injectable()
export class PositionsService {
  constructor(
    @Inject(PositionsRepository) private readonly repo: PositionsRepository,
    @Inject(TransactionCoordinator) private readonly tx: Tx
  ) {}

  async savePositions(body: unknown, actor: string, now: Date = new Date()): Promise<{ ok: true; effectiveMonth: string }> {
    const input = parseSavePositions(body, businessMonthText(now));
    const month = input.effectiveMonth;
    const at = now.toISOString();
    await this.tx.run(async trx => {
      await this.lock(trx, input.items.map(i => i.code));
      const planned: Planned[] = [];
      for (const item of input.items) {
        const chain = await this.repo.typeChain(trx, item.code);
        const cur = versionAt(chain, month);
        if (!cur) throw new PositionNotFoundError(`Chức vụ ${item.code} chưa có ở tháng ${monthText(month)}`);
        if (cur.rev !== item.expectedRev) throw new PositionStaleError(`Chức vụ ${item.code} vừa được người khác sửa`);
        const plan = planChange(chain, month, item.changes);
        if (plan) planned.push({ chain, cur, plan });
      }
      for (const p of planned) {
        await this.write(p, month, { actor, at }, input.reason, {
          update: (id, set, meta) => this.repo.updateType(trx, id, set, meta),
          insertFrom: (id, set, meta) => this.repo.insertTypeFrom(trx, id, month, set, meta)
        });
      }
    });
    return { ok: true, effectiveMonth: month };
  }

  async saveLevel(
    code: unknown,
    level: unknown,
    body: unknown,
    actor: string,
    now: Date = new Date()
  ): Promise<{ ok: true; effectiveMonth: string }> {
    const input = parseSaveLevel(code, level, body, businessMonthText(now));
    const month = input.effectiveMonth;
    const at = now.toISOString();
    await this.tx.run(async trx => {
      await this.lock(trx, [input.code]);
      const chain = await this.repo.levelChain(trx, input.code, input.level);
      const cur = versionAt(chain, month);
      if (!cur) throw new LevelNotFoundError(`Bậc ${input.level} của ${input.code} chưa có ở tháng ${monthText(month)}`);
      if (cur.rev !== input.expectedRev) throw new LevelStaleError(`Bậc ${input.level} vừa được người khác sửa`);
      const plan = planChange(chain, month, input.changes);
      if (!plan) return;
      await this.write({ chain, cur, plan }, month, { actor, at }, input.reason, {
        update: (id, set, meta) => this.repo.updateLevel(trx, id, set, meta),
        insertFrom: (id, set, meta) => this.repo.insertLevelFrom(trx, id, month, set, meta)
      });
    });
    return { ok: true, effectiveMonth: month };
  }

  async addLevel(
    code: unknown,
    body: unknown,
    actor: string,
    now: Date = new Date()
  ): Promise<{ ok: true; effectiveMonth: string; level: number }> {
    const input = parseAddLevel(code, body, businessMonthText(now));
    const month = input.effectiveMonth;
    await this.tx.run(async trx => {
      await this.lock(trx, [input.code]);
      const types = await this.repo.typeChain(trx, input.code);
      if (!versionAt(types, month)) {
        throw new PositionNotFoundError(`Chức vụ ${input.code} chưa có ở tháng ${monthText(month)}`);
      }
      const next = (await this.repo.maxLevelAt(trx, input.code, month)) + 1;
      if (input.level !== next) throw new LevelStaleError(`Bậc kế tiếp ở tháng ${monthText(month)} là bậc ${next}`);
      await this.repo.insertLevel(trx, input.code, input.level, month, input.values, {
        actor,
        at: now.toISOString(),
        reason: input.reason
      });
    });
    return { ok: true, effectiveMonth: month, level: input.level };
  }

  /** Khoá từng mã theo thứ tự đã sắp xếp, để hai lần lưu nhiều loại không khoá chéo nhau. */
  private async lock(trx: DatabaseTransaction, codes: string[]): Promise<void> {
    for (const code of [...new Set(codes)].sort()) await this.tx.acquireAdvisoryLock(trx, `positions:${code}`);
  }

  /** Ghi dòng tháng M (sửa tại chỗ hoặc chép mới), rồi các dòng nhận chép tiếp; lý do chỉ ghi vào dòng tháng M. */
  private async write(
    { chain, cur, plan }: Planned,
    month: string,
    base: { actor: string; at: string },
    reason: string | null,
    ops: {
      update: (id: number, set: ChainPlan['set'], meta: WriteMeta) => Promise<void>;
      insertFrom: (fromId: number, set: ChainPlan['set'], meta: WriteMeta) => Promise<number>;
    }
  ): Promise<void> {
    if (plan.mode === 'update') await ops.update(cur.id, plan.set, reason !== null ? { ...base, reason } : base);
    else await ops.insertFrom(cur.id, plan.set, { ...base, reason });
    for (const c of plan.carry) {
      const target = chain.find(v => v.month === c.month);
      if (target && c.month !== month) await ops.update(target.id, c.set, base);
    }
  }
}
