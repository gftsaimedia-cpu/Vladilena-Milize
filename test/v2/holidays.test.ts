import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestError, NotFoundError } from '../../src/common';
import { gateAllows, PeriodLockedError, type GateUse, type PeriodGate, type PeriodStatus } from '../../src/modules/periods';
import {
  FIXED_HOLIDAYS,
  HolidayNotFoundError,
  HolidaysController,
  HolidaysRepository,
  HolidaysService,
  type Holiday
} from '../../src/modules/holidays';
import { AuditEntryError } from '../../src/modules/audit';
import { createScriptedKysely, type ScriptedQuery } from './helpers/scripted-kysely';

/** Lịch lễ trong bộ nhớ, cùng hợp đồng với HolidaysRepository. */
class MemoryHolidays {
  readonly rows = new Map<string, { name: string; createdBy: string | null }>();

  async listBetween(from: string, to: string): Promise<Holiday[]> {
    return [...this.rows.entries()]
      .filter(([date]) => date >= from && date <= to)
      .map(([date, row]) => ({ date, name: row.name }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async insert(holiday: Holiday, createdBy: string | null): Promise<boolean> {
    if (this.rows.has(holiday.date)) return false;
    this.rows.set(holiday.date, { name: holiday.name, createdBy });
    return true;
  }

  async remove(date: string): Promise<Holiday | null> {
    const row = this.rows.get(date);
    if (!row) return null;
    this.rows.delete(date);
    return { date, name: row.name };
  }

  withTransaction(): MemoryHolidays {
    return this;
  }
}

// Transaction và nhật ký giả: chỉ để test luật kiểm dữ liệu; hành vi ghi nhật ký thật ở audit-holidays.pg.test.ts.
// `FAKE_TRX` là giao dịch giả mà `run` đưa cho callback, để test thấy cổng kỳ chạy trên chính giao dịch đó.
const FAKE_TRX = { fake: 'trx' };
const fakeTx = { run: async <T>(cb: (trx: any) => Promise<T>) => cb(FAKE_TRX) };
const fakeAudit = { append: async () => ({ id: 1, hash: '' }) };
const makeService = (repo = new MemoryHolidays()) =>
  new HolidaysService(repo as unknown as HolidaysRepository, fakeTx as any, fakeAudit as any);

/** Cổng kỳ giả: tháng 2026-09 đã chốt công, các tháng khác mở. Ghi lại các lần gọi. */
function lockedSeptember() {
  const calls: Array<{ trx: unknown; months: string[]; use: GateUse }> = [];
  const statusOf = async (_trx: unknown, month: string): Promise<PeriodStatus> => (month === '2026-09' ? 'attendance_locked' : 'open');
  const gate = {
    statusOf,
    hold: async (trx: unknown, months: string[], use: GateUse) => {
      calls.push({ trx, months, use });
      for (const month of months) {
        const status = await statusOf(trx, month);
        if (!gateAllows(status, use)) throw new PeriodLockedError(month, status);
      }
    }
  } as unknown as PeriodGate;
  return { gate, calls };
}
const makeGatedService = (repo = new MemoryHolidays()) => {
  const { gate, calls } = lockedSeptember();
  // Ghi lại dòng ngày công (attendance-core P4): chỉ ghi lại các ngày đã thật sự thêm/xoá, sau commit.
  const refreshed: string[] = [];
  const attendanceDays = { refreshDateForAll: async (date: string) => (refreshed.push(date), 0) };
  const svc = new HolidaysService(repo as unknown as HolidaysRepository, fakeTx as any, fakeAudit as any, attendanceDays, gate);
  return { svc, repo, calls, refreshed };
};
const sqlOf = (log: ReturnType<typeof createScriptedKysely>['log']): ScriptedQuery[] =>
  log.filter((e): e is ScriptedQuery => typeof e !== 'string');

describe('HolidaysService', () => {
  it('add, duplicate and validation', async () => {
    const svc = makeService();
    assert.deepEqual(await svc.add({ date: '2026-09-02', name: ' Quốc khánh ' }, 'admin'), { date: '2026-09-02', name: 'Quốc khánh' });
    await assert.rejects(svc.add({ date: '2026-09-02', name: 'x' }, 'admin'), /Ngày 02\/09\/2026 đã có trong lịch lễ/);
    await assert.rejects(svc.add({ date: '2026-02-30', name: 'x' }, 'admin'), /Ngày lễ không hợp lệ: 2026-02-30/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: '  ' }, 'admin'), /Tên ngày lễ không được trống/);
  });

  it('add rejects fields that are not strings and records who added the day', async () => {
    const repo = new MemoryHolidays();
    const svc = makeService(repo);
    await assert.rejects(svc.add({ date: undefined, name: 'x' }, 'admin'), /Ngày lễ không hợp lệ: undefined/);
    await assert.rejects(svc.add({ date: 20260910, name: 'x' }, 'admin'), /Ngày lễ không hợp lệ: 20260910/);
    await assert.rejects(svc.add({ date: '2026-9-10', name: 'x' }, 'admin'), /Ngày lễ không hợp lệ: 2026-9-10/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: 5 }, 'admin'), /Tên ngày lễ không được trống/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: undefined }, 'admin'), /Tên ngày lễ không được trống/);
    assert.equal(repo.rows.size, 0);

    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    assert.equal(repo.rows.get('2026-10-10')?.createdBy, 'admin');
  });

  it('quickAdd adds the four fixed days once', async () => {
    const svc = makeService();
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02']);
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), []);
    assert.deepEqual((await svc.list(2026)).map(h => h.name), ['Tết Dương lịch', 'Ngày Giải phóng miền Nam', 'Quốc tế Lao động', 'Quốc khánh']);
    await assert.rejects(svc.quickAdd('abc', 'admin'), /Năm không hợp lệ: abc/);
  });

  it('quickAdd skips only the days already in the calendar', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-04-30', name: 'Giải phóng' }, 'admin');
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-01-01', '2026-05-01', '2026-09-02']);
    assert.equal((await svc.list(2026)).find(h => h.date === '2026-04-30')?.name, 'Giải phóng');
  });

  it('FIXED_HOLIDAYS are the four national days in date order', () => {
    assert.deepEqual(FIXED_HOLIDAYS.map(h => [h.monthDay, h.name]), [
      ['01-01', 'Tết Dương lịch'], ['04-30', 'Ngày Giải phóng miền Nam'], ['05-01', 'Quốc tế Lao động'], ['09-02', 'Quốc khánh']
    ]);
  });

  it('list returns one year in date order', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin');
    await svc.add({ date: '2026-01-01', name: 'Tết Dương lịch' }, 'admin');
    await svc.add({ date: '2027-01-01', name: 'Tết Dương lịch' }, 'admin');
    await svc.add({ date: '2025-12-31', name: 'Cuối năm' }, 'admin');
    assert.deepEqual((await svc.list(2026)).map(h => h.date), ['2026-01-01', '2026-09-02']);
    assert.deepEqual((await svc.list('2027')).map(h => h.date), ['2027-01-01']);
  });

  it('year must be an integer from 2000 to 2100', async () => {
    const svc = makeService();
    for (const bad of [1999, 2101, 2026.5, NaN, null, undefined, '', '20x6', {}]) {
      await assert.rejects(svc.quickAdd(bad, 'admin'), /^Error: Năm không hợp lệ: /, `quickAdd(${String(bad)})`);
      await assert.rejects(svc.list(bad), /^Error: Năm không hợp lệ: /, `list(${String(bad)})`);
    }
    await assert.rejects(svc.list(1999), /Năm không hợp lệ: 1999/);
    assert.deepEqual(await svc.quickAdd(2000, 'admin'), ['2000-01-01', '2000-04-30', '2000-05-01', '2000-09-02']);
    assert.deepEqual(await svc.quickAdd(2100, 'admin'), ['2100-01-01', '2100-04-30', '2100-05-01', '2100-09-02']);
  });

  it('remove a day, then the missing day is 404', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin');
    await svc.remove('2026-09-02', 'admin');
    assert.deepEqual(await svc.list(2026), []);
    await assert.rejects(svc.remove('2026-09-02', 'admin'), HolidayNotFoundError);
    await assert.rejects(svc.remove('2026-09-02', 'admin'), /Không có ngày lễ 2026-09-02/);
  });

  it('remove rejects a date that cannot exist without asking the repository', async () => {
    const repo = new MemoryHolidays();
    let removeCalls = 0;
    repo.remove = async () => (removeCalls++, null);
    await assert.rejects(makeService(repo).remove('2026-02-30', 'admin'), (e: any) => !(e instanceof HolidayNotFoundError) && /Ngày lễ không hợp lệ: 2026-02-30/.test(e.message));
    assert.equal(removeCalls, 0);
  });
});

describe('HolidaysService with the period gate', () => {
  const locked = (e: any) => e instanceof PeriodLockedError && e.status === 409 && e.details.code === 'PERIOD_LOCKED' && e.details.month === '2026-09';

  it('add refuses a day of a locked month, writes nothing and holds the gate on the holiday transaction', async () => {
    const { svc, repo, calls } = makeGatedService();
    await assert.rejects(svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin'), locked);
    assert.equal(repo.rows.size, 0);
    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    assert.deepEqual(calls.map(c => [c.trx, c.months, c.use]), [[FAKE_TRX, ['2026-09'], 'holiday'], [FAKE_TRX, ['2026-10'], 'holiday']]);
  });

  it('input validation still comes before the gate', async () => {
    const { svc, calls } = makeGatedService();
    await assert.rejects(svc.add({ date: '2026-02-30', name: 'x' }, 'admin'), /Ngày lễ không hợp lệ/);
    await assert.rejects(svc.remove('2026-02-30', 'admin'), /Ngày lễ không hợp lệ/);
    assert.equal(calls.length, 0);
  });

  it('remove refuses a day of a locked month and keeps it', async () => {
    const repo = new MemoryHolidays();
    await repo.insert({ date: '2026-09-02', name: 'Quốc khánh' }, null);
    const { svc } = makeGatedService(repo);
    await assert.rejects(svc.remove('2026-09-02', 'admin'), locked);
    assert.equal(repo.rows.has('2026-09-02'), true);
  });

  it('quickAdd skips the days of locked months instead of failing the whole year', async () => {
    const { svc, repo } = makeGatedService();
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-01-01', '2026-04-30', '2026-05-01']);
    assert.equal(repo.rows.has('2026-09-02'), false);
  });

  it('a refused add or remove rewrites no day rows; an accepted one rewrites only its date', async () => {
    const repo = new MemoryHolidays();
    await repo.insert({ date: '2026-09-02', name: 'Quốc khánh' }, null);
    const { svc, refreshed } = makeGatedService(repo);
    await assert.rejects(svc.add({ date: '2026-09-10', name: 'x' }, 'admin'), locked);
    await assert.rejects(svc.remove('2026-09-02', 'admin'), locked);
    assert.deepEqual(refreshed, []);
    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    await svc.remove('2026-10-10', 'admin');
    assert.deepEqual(refreshed, ['2026-10-10', '2026-10-10']);
  });

  it('quickAdd rewrites the day rows of the inserted dates only, not of the skipped locked-month date', async () => {
    const repo = new MemoryHolidays();
    await repo.insert({ date: '2026-01-01', name: 'Tết Dương lịch' }, null);
    const { svc, refreshed } = makeGatedService(repo);
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-04-30', '2026-05-01']);
    assert.deepEqual(refreshed, ['2026-04-30', '2026-05-01']);
  });

  it('the controller rethrows the lock error as it is, not as a 400', async () => {
    const { svc } = makeGatedService();
    const ctrl = new HolidaysController(svc);
    await assert.rejects(ctrl.create({ date: '2026-09-02', name: 'Quốc khánh' }, ADMIN), locked);
    await assert.rejects(ctrl.remove('2026-09-02', ADMIN), locked);
  });
});

describe('HolidaysRepository', () => {
  it('reads dates as text and inserts idempotently', async () => {
    const list = createScriptedKysely(() => [{ date: '2026-01-01', name: 'Tết Dương lịch' }]);
    assert.deepEqual(await new HolidaysRepository(list.db).listBetween('2026-01-01', '2026-12-31'), [
      { date: '2026-01-01', name: 'Tết Dương lịch' }
    ]);
    const read = sqlOf(list.log)[0];
    assert.match(read.sql, /to_char\("holiday_date", 'YYYY-MM-DD'\)/);
    assert.match(read.sql, /order by "holiday_date"/);
    assert.deepEqual(read.parameters, ['2026-01-01', '2026-12-31']);

    const dup = createScriptedKysely(() => []);
    assert.equal(await new HolidaysRepository(dup.db).insert({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin'), false);
    assert.match(sqlOf(dup.log)[0].sql, /on conflict \("holiday_date"\) do nothing returning/);
    assert.deepEqual(sqlOf(dup.log)[0].parameters, ['2026-09-02', 'Quốc khánh', 'admin']);

    const fresh = createScriptedKysely(() => [{ holiday_date: '2026-09-02' }]);
    assert.equal(await new HolidaysRepository(fresh.db).insert({ date: '2026-09-02', name: 'Quốc khánh' }, null), true);
    assert.deepEqual(sqlOf(fresh.log)[0].parameters, ['2026-09-02', 'Quốc khánh', null]);
  });

  it('remove returns the deleted day, or null when there was none', async () => {
    const hit = createScriptedKysely(() => [{ name: 'Quốc khánh' }]);
    assert.deepEqual(await new HolidaysRepository(hit.db).remove('2026-09-02'), { date: '2026-09-02', name: 'Quốc khánh' });
    assert.match(sqlOf(hit.log)[0].sql, /^delete from "company_holidays" where "holiday_date" = \$1 returning "name"/);
    assert.deepEqual(sqlOf(hit.log)[0].parameters, ['2026-09-02']);

    const miss = createScriptedKysely(() => []);
    assert.equal(await new HolidaysRepository(miss.db).remove('2026-09-02'), null);
  });
});

const ADMIN = { username: 'admin' } as any;

describe('HolidaysController', () => {
  const controller = () => new HolidaysController(makeService());

  it('lists the requested year, defaulting to the current Vietnam year', async () => {
    const calls: unknown[] = [];
    const ctrl = new HolidaysController({ list: async (year: unknown) => (calls.push(year), [{ date: '2026-09-02', name: 'Quốc khánh' }]) } as any);
    assert.deepEqual(await ctrl.list('2026'), { items: [{ date: '2026-09-02', name: 'Quốc khánh' }] });
    await ctrl.list(undefined);
    assert.equal(calls[0], '2026');
    assert.match(String(calls[1]), /^\d{4}$/);
  });

  it('creates, quick-adds and deletes with the session user as author', async () => {
    const repo = new MemoryHolidays();
    const ctrl = new HolidaysController(makeService(repo));
    assert.deepEqual(await ctrl.create({ date: '2026-10-10', name: ' Giỗ Tổ ' }, { username: 'admin' } as any), {
      created: true, holiday: { date: '2026-10-10', name: 'Giỗ Tổ' }
    });
    assert.deepEqual(await ctrl.quickAdd({ year: 2026 }, { username: 'hr' } as any), { added: ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02'] });
    assert.equal(repo.rows.get('2026-10-10')?.createdBy, 'admin');
    assert.equal(repo.rows.get('2026-01-01')?.createdBy, 'hr');
    assert.deepEqual(await ctrl.remove('2026-10-10', ADMIN), { deleted: true });
    assert.equal(repo.rows.has('2026-10-10'), false);
  });

  it('maps a missing day to 404 HOLIDAY_NOT_FOUND and every other error to 400 BAD_REQUEST', async () => {
    const ctrl = controller();
    await assert.rejects(ctrl.remove('2026-09-02', ADMIN), (e: any) =>
      e instanceof NotFoundError && e.status === 404 && e.message === 'Không có ngày lễ 2026-09-02' && e.details?.code === 'HOLIDAY_NOT_FOUND');
    await assert.rejects(ctrl.create({ date: '2026-02-30', name: 'x' }, ADMIN), (e: any) =>
      e instanceof BadRequestError && e.status === 400 && e.details?.code === 'BAD_REQUEST' && e.message === 'Ngày lễ không hợp lệ: 2026-02-30');
    await assert.rejects(ctrl.quickAdd({ year: 'abc' }, ADMIN), (e: any) =>
      e instanceof BadRequestError && e.details?.code === 'BAD_REQUEST' && e.message === 'Năm không hợp lệ: abc');
    await assert.rejects(ctrl.list('1999'), (e: any) => e instanceof BadRequestError && e.message === 'Năm không hợp lệ: 1999');
  });

  it('an audit entry error stays a server error (500), not a 400', async () => {
    const boom = async () => {
      throw new AuditEntryError('Nhật ký holiday.add: entityId dài quá 200 ký tự');
    };
    const ctrl = new HolidaysController({ add: boom, quickAdd: boom, remove: boom } as any);
    await assert.rejects(ctrl.create({ date: '2026-09-02', name: 'x' }, ADMIN), AuditEntryError);
    await assert.rejects(ctrl.quickAdd({ year: 2026 }, ADMIN), AuditEntryError);
    await assert.rejects(ctrl.remove('2026-09-02', ADMIN), AuditEntryError);
  });

  it('a missing request body is a 400, not a crash', async () => {
    const ctrl = controller();
    await assert.rejects(ctrl.create(undefined as any, ADMIN), (e: any) => e instanceof BadRequestError);
    await assert.rejects(ctrl.quickAdd(undefined as any, ADMIN), (e: any) => e instanceof BadRequestError && /Năm không hợp lệ/.test(e.message));
  });
});
