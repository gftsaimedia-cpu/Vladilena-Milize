import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionCoordinator } from '../../src/database/transaction';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { PositionsRepository } from '../../src/modules/positions/positions.repository';
import { PositionsService } from '../../src/modules/positions/positions.service';
import { LevelStaleError, PositionStaleError } from '../../src/modules/positions/positions.errors';
import { withTempDb } from './helpers/pg-temp-db';

const META = { actor: 'admin', at: '2026-11-05T03:00:00.000Z' };

test('PositionsRepository writes versions with their ticks on PostgreSQL', async t => {
  await withTempDb(t, 'positions_repo', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const repo = new PositionsRepository();
    const typeRow = async (id: number) => (await client.query('SELECT * FROM position_types WHERE id = $1', [id])).rows[0];
    const levelRow = async (id: number) => (await client.query('SELECT * FROM position_levels WHERE id = $1', [id])).rows[0];
    const ticks = async (id: number) =>
      Object.fromEntries(
        (await client.query('SELECT benefit, enabled FROM position_type_benefits WHERE type_id = $1', [id])).rows.map(r => [
          r.benefit,
          Number(r.enabled)
        ])
      );

    // Chép phiên bản nv 2000-01 (id 2) sang 11/2026, kèm đủ 14 ô tick.
    const newId = await tx.run(trx =>
      repo.insertTypeFrom(trx, 2, '2026-11', { flexPct: 25, 'benefit.makeup': false }, { ...META, reason: 'Tăng Flex' })
    );
    const row = await typeRow(newId);
    assert.deepEqual(
      {
        code: row.code,
        month: row.effective_month,
        name: row.name,
        workdays: Number(row.workdays),
        flex: row.flex_pct,
        night: row.night_pct,
        travel: row.travel_pct,
        attendance: row.attendance_pct,
        dows: row.regular_dows,
        rev: Number(row.rev),
        reason: row.reason,
        by: row.updated_by,
        at: row.updated_at
      },
      {
        code: 'nv',
        month: '2026-11',
        name: 'Nhân viên',
        workdays: 26,
        flex: 25,
        night: 40,
        travel: 15,
        attendance: 25,
        dows: '[1,2,3,4,5,6]',
        rev: 1, // rev của dòng gốc 2000-01 (0) + 1
        reason: 'Tăng Flex',
        by: 'admin',
        at: META.at
      }
    );
    const copied = await ticks(newId);
    assert.equal(Object.keys(copied).length, 14);
    assert.deepEqual(copied, { ...(await ticks(2)), makeup: 0 });

    // Chỉ đổi ô tick vẫn tăng rev của dòng chức vụ và ghi người sửa; không gửi lý do thì giữ lý do cũ.
    await tx.run(trx => repo.updateType(trx, newId, { 'benefit.ot': false }, { actor: 'b', at: '2026-11-06T01:00:00.000Z' }));
    const edited = await typeRow(newId);
    assert.equal(Number(edited.rev), 2);
    assert.equal(edited.updated_by, 'b');
    assert.equal(edited.updated_at, '2026-11-06T01:00:00.000Z');
    assert.equal(edited.reason, 'Tăng Flex');
    assert.equal((await ticks(newId)).ot, 0);

    // Chuỗi phiên bản xếp tháng tăng dần, có cả ô tick.
    const chain = await tx.run(trx => repo.typeChain(trx, 'nv'));
    assert.deepEqual(
      chain.map(v => v.month),
      ['2000-01', '2026-11']
    );
    assert.equal(chain[1].id, newId);
    assert.equal(chain[1].rev, 2);
    assert.equal(chain[1].values.flexPct, 25);
    assert.equal(chain[1].values.workdays, 26);
    assert.equal(chain[1].values['benefit.makeup'], false);
    assert.equal(chain[1].values['benefit.idorm'], true);

    // Bậc: bậc lớn nhất theo tháng, thêm bậc, chép và sửa bậc.
    assert.equal(await tx.run(trx => repo.maxLevelAt(trx, 'nv', '2026-11')), 4);
    const added = await tx.run(trx =>
      repo.insertLevel(trx, 'nv', 5, '2026-12', { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null }, META)
    );
    assert.equal(Number((await levelRow(added)).rev), 0);
    assert.equal(await tx.run(trx => repo.maxLevelAt(trx, 'nv', '2026-11')), 4);
    assert.equal(await tx.run(trx => repo.maxLevelAt(trx, 'nv', '2026-12')), 5);
    assert.equal(await tx.run(trx => repo.maxLevelAt(trx, 'xx', '2026-12')), 0);

    const kpiId = await tx.run(trx => repo.insertLevelFrom(trx, 6, '2026-11', { kpiMax: 6_800_000 }, META));
    const kpiRow = await levelRow(kpiId);
    assert.equal(Number(kpiRow.base_salary), 6_500_000);
    assert.equal(Number(kpiRow.kpi_max), 6_800_000);
    assert.equal(kpiRow.name, 'Chuyên viên');
    assert.equal(Number(kpiRow.rev), 1);
    assert.equal(kpiRow.reason, null);
    await tx.run(trx => repo.updateLevel(trx, kpiId, { nightPct: null, kpiMax: null }, { ...META, reason: 'Bỏ KPI' }));
    const cleared = await levelRow(kpiId);
    assert.equal(cleared.kpi_max, null);
    assert.equal(Number(cleared.rev), 2);
    assert.equal(cleared.reason, 'Bỏ KPI');
    const levels = await tx.run(trx => repo.levelChain(trx, 'nv', 2));
    assert.deepEqual(
      levels.map(v => [v.month, v.values.baseSalary, v.values.kpiMax]),
      [
        ['2000-01', 6_500_000, 6_500_000],
        ['2026-11', 6_500_000, null]
      ]
    );

    // Lỗi giữa transaction thì không ghi gì.
    await assert.rejects(
      tx.run(async trx => {
        await repo.updateType(trx, 1, { flexPct: 30 }, META);
        throw new Error('boom');
      }),
      /boom/
    );
    const ctv = await typeRow(1);
    assert.equal(ctv.flex_pct, 10);
    assert.equal(Number(ctv.rev), 0);

    // Danh mục chức vụ trả thêm ô tick của từng phiên bản.
    const catalog = await new EmployeesRepository(db).listPositionCatalog();
    for (const t of catalog) assert.equal(Object.keys(t.benefits).length, 14, `${t.code} ${t.effective_month}`);
    const nvNov = catalog.find(t => t.code === 'nv' && t.effective_month === '2026-11');
    assert.equal(nvNov.benefits.makeup, false);
    assert.equal(nvNov.benefits.kpi, true);
  });
});

test('PositionsService on PostgreSQL carries changes and rolls back', async t => {
  await withTempDb(t, 'positions_svc', async (db, client) => {
    const svc = new PositionsService(new PositionsRepository(), new TransactionCoordinator(db));
    const now = new Date('2026-11-05T03:00:00.000Z');
    const nvAt = async (month: string) =>
      (await client.query(`SELECT * FROM position_types WHERE code = 'nv' AND effective_month = $1`, [month])).rows[0];

    await svc.savePositions(
      { effectiveMonth: '2026-12', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25 } }] },
      'admin',
      now
    );
    await svc.savePositions(
      { effectiveMonth: '2026-11', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 22, travelPct: 16 } }] },
      'admin',
      now
    );
    const nov = await nvAt('2026-11');
    assert.equal(nov.flex_pct, 22);
    assert.equal(nov.travel_pct, 16);
    const dec = await nvAt('2026-12');
    assert.equal(dec.flex_pct, 25, 'tháng 12 đã tự đặt Flex nên giữ số của nó');
    assert.equal(dec.travel_pct, 16, 'tháng 12 còn giữ đi lại cũ nên nhận số mới');
    assert.equal(Number(dec.rev), 2, 'tạo từ dòng gốc rev 0 thành 1, nhận chép tiếp thành 2');

    await assert.rejects(
      svc.savePositions(
        {
          effectiveMonth: '2026-11',
          items: [
            { code: 'ctv', expectedRev: 0, changes: { flexPct: 12 } },
            { code: 'nv', expectedRev: 99, changes: { flexPct: 30 } }
          ]
        },
        'admin',
        now
      ),
      PositionStaleError
    );
    const ctvNov = await client.query(`SELECT 1 FROM position_types WHERE code = 'ctv' AND effective_month = '2026-11'`);
    assert.equal(ctvNov.rowCount, 0);
  });
});

test('a save based on the version before another Admin created the month row gets 409 on PostgreSQL', async t => {
  await withTempDb(t, 'positions_stale', async (db, client) => {
    const svc = new PositionsService(new PositionsRepository(), new TransactionCoordinator(db));
    const now = new Date('2026-11-05T03:00:00.000Z');
    // Hai Admin cùng mở màn ở tháng 11, cùng thấy phiên bản nv 2000-01 (rev 0, Flex 20).
    const save = (flexPct: number) =>
      svc.savePositions(
        { effectiveMonth: '2026-11', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct } }] },
        'admin',
        now
      );
    await save(22);
    await assert.rejects(save(25), PositionStaleError);
    const nov = await client.query(`SELECT flex_pct FROM position_types WHERE code = 'nv' AND effective_month = '2026-11'`);
    assert.equal(nov.rows[0].flex_pct, 22, 'số của Admin lưu trước còn nguyên');

    // Bậc cũng vậy: bậc 2 Nhân viên 2000-01 rev 0.
    const saveLevel = (kpiMax: number) =>
      svc.saveLevel('nv', '2', { effectiveMonth: '2026-11', expectedRev: 0, changes: { kpiMax } }, 'admin', now);
    await saveLevel(6_800_000);
    await assert.rejects(saveLevel(7_000_000), LevelStaleError);
    const lv = await client.query(
      `SELECT kpi_max FROM position_levels WHERE type_code = 'nv' AND level_no = 2 AND effective_month = '2026-11'`
    );
    assert.equal(Number(lv.rows[0].kpi_max), 6_800_000);
  });
});
