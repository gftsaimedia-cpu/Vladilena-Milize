import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestError, NotFoundError } from '../../src/common';
import {
  FIXED_HOLIDAYS,
  HolidayNotFoundError,
  HolidaysController,
  HolidaysRepository,
  HolidaysService,
  type Holiday
} from '../../src/modules/holidays';
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

  async remove(date: string): Promise<boolean> {
    return this.rows.delete(date);
  }
}

const makeService = (repo = new MemoryHolidays()) => new HolidaysService(repo as unknown as HolidaysRepository);
const sqlOf = (log: ReturnType<typeof createScriptedKysely>['log']): ScriptedQuery[] =>
  log.filter((e): e is ScriptedQuery => typeof e !== 'string');

describe('HolidaysService', () => {
  it('add, duplicate and validation', async () => {
    const svc = makeService();
    assert.deepEqual(await svc.add({ date: '2026-09-02', name: ' Quốc khánh ' }, 'admin'), { date: '2026-09-02', name: 'Quốc khánh' });
    await assert.rejects(svc.add({ date: '2026-09-02', name: 'x' }, null), /Ngày 02\/09\/2026 đã có trong lịch lễ/);
    await assert.rejects(svc.add({ date: '2026-02-30', name: 'x' }, null), /Ngày lễ không hợp lệ: 2026-02-30/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: '  ' }, null), /Tên ngày lễ không được trống/);
  });

  it('add rejects fields that are not strings and records who added the day', async () => {
    const repo = new MemoryHolidays();
    const svc = makeService(repo);
    await assert.rejects(svc.add({ date: undefined, name: 'x' }, null), /Ngày lễ không hợp lệ: undefined/);
    await assert.rejects(svc.add({ date: 20260910, name: 'x' }, null), /Ngày lễ không hợp lệ: 20260910/);
    await assert.rejects(svc.add({ date: '2026-9-10', name: 'x' }, null), /Ngày lễ không hợp lệ: 2026-9-10/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: 5 }, null), /Tên ngày lễ không được trống/);
    await assert.rejects(svc.add({ date: '2026-10-10', name: undefined }, null), /Tên ngày lễ không được trống/);
    assert.equal(repo.rows.size, 0);

    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    assert.equal(repo.rows.get('2026-10-10')?.createdBy, 'admin');
  });

  it('quickAdd adds the four fixed days once', async () => {
    const svc = makeService();
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-02']);
    assert.deepEqual(await svc.quickAdd(2026, 'admin'), []);
    assert.deepEqual((await svc.list(2026)).map(h => h.name), ['Tết Dương lịch', 'Ngày Giải phóng miền Nam', 'Quốc tế Lao động', 'Quốc khánh']);
    await assert.rejects(svc.quickAdd('abc', null), /Năm không hợp lệ: abc/);
  });

  it('quickAdd skips only the days already in the calendar', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-04-30', name: 'Giải phóng' }, null);
    assert.deepEqual(await svc.quickAdd(2026, null), ['2026-01-01', '2026-05-01', '2026-09-02']);
    assert.equal((await svc.list(2026)).find(h => h.date === '2026-04-30')?.name, 'Giải phóng');
  });

  it('FIXED_HOLIDAYS are the four national days in date order', () => {
    assert.deepEqual(FIXED_HOLIDAYS.map(h => [h.monthDay, h.name]), [
      ['01-01', 'Tết Dương lịch'], ['04-30', 'Ngày Giải phóng miền Nam'], ['05-01', 'Quốc tế Lao động'], ['09-02', 'Quốc khánh']
    ]);
  });

  it('list returns one year in date order', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, null);
    await svc.add({ date: '2026-01-01', name: 'Tết Dương lịch' }, null);
    await svc.add({ date: '2027-01-01', name: 'Tết Dương lịch' }, null);
    await svc.add({ date: '2025-12-31', name: 'Cuối năm' }, null);
    assert.deepEqual((await svc.list(2026)).map(h => h.date), ['2026-01-01', '2026-09-02']);
    assert.deepEqual((await svc.list('2027')).map(h => h.date), ['2027-01-01']);
  });

  it('year must be an integer from 2000 to 2100', async () => {
    const svc = makeService();
    for (const bad of [1999, 2101, 2026.5, NaN, null, undefined, '', '20x6', {}]) {
      await assert.rejects(svc.quickAdd(bad, null), /^Error: Năm không hợp lệ: /, `quickAdd(${String(bad)})`);
      await assert.rejects(svc.list(bad), /^Error: Năm không hợp lệ: /, `list(${String(bad)})`);
    }
    await assert.rejects(svc.list(1999), /Năm không hợp lệ: 1999/);
    assert.deepEqual(await svc.quickAdd(2000, null), ['2000-01-01', '2000-04-30', '2000-05-01', '2000-09-02']);
    assert.deepEqual(await svc.quickAdd(2100, null), ['2100-01-01', '2100-04-30', '2100-05-01', '2100-09-02']);
  });

  it('remove a day, then the missing day is 404', async () => {
    const svc = makeService();
    await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, null);
    await svc.remove('2026-09-02');
    assert.deepEqual(await svc.list(2026), []);
    await assert.rejects(svc.remove('2026-09-02'), HolidayNotFoundError);
    await assert.rejects(svc.remove('2026-09-02'), /Không có ngày lễ 2026-09-02/);
  });

  it('remove rejects a date that cannot exist without asking the repository', async () => {
    const repo = new MemoryHolidays();
    let removeCalls = 0;
    repo.remove = async () => (removeCalls++, false);
    await assert.rejects(makeService(repo).remove('2026-02-30'), (e: any) => !(e instanceof HolidayNotFoundError) && /Ngày lễ không hợp lệ: 2026-02-30/.test(e.message));
    assert.equal(removeCalls, 0);
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

  it('remove reports whether a row was deleted', async () => {
    const hit = createScriptedKysely(() => [{ holiday_date: '2026-09-02' }]);
    assert.equal(await new HolidaysRepository(hit.db).remove('2026-09-02'), true);
    assert.match(sqlOf(hit.log)[0].sql, /^delete from "company_holidays" where "holiday_date" = \$1 returning/);
    assert.deepEqual(sqlOf(hit.log)[0].parameters, ['2026-09-02']);

    const miss = createScriptedKysely(() => []);
    assert.equal(await new HolidaysRepository(miss.db).remove('2026-09-02'), false);
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
    assert.deepEqual(await ctrl.remove('2026-10-10'), { deleted: true });
  });

  it('maps a missing day to 404 HOLIDAY_NOT_FOUND and every other error to 400 BAD_REQUEST', async () => {
    const ctrl = controller();
    await assert.rejects(ctrl.remove('2026-09-02'), (e: any) =>
      e instanceof NotFoundError && e.status === 404 && e.message === 'Không có ngày lễ 2026-09-02' && e.details?.code === 'HOLIDAY_NOT_FOUND');
    await assert.rejects(ctrl.create({ date: '2026-02-30', name: 'x' }, ADMIN), (e: any) =>
      e instanceof BadRequestError && e.status === 400 && e.details?.code === 'BAD_REQUEST' && e.message === 'Ngày lễ không hợp lệ: 2026-02-30');
    await assert.rejects(ctrl.quickAdd({ year: 'abc' }, ADMIN), (e: any) =>
      e instanceof BadRequestError && e.details?.code === 'BAD_REQUEST' && e.message === 'Năm không hợp lệ: abc');
    await assert.rejects(ctrl.list('1999'), (e: any) => e instanceof BadRequestError && e.message === 'Năm không hợp lệ: 1999');
  });

  it('a missing request body is a 400, not a crash', async () => {
    const ctrl = controller();
    await assert.rejects(ctrl.create(undefined as any, ADMIN), (e: any) => e instanceof BadRequestError);
    await assert.rejects(ctrl.quickAdd(undefined as any, ADMIN), (e: any) => e instanceof BadRequestError && /Năm không hợp lệ/.test(e.message));
  });
});
