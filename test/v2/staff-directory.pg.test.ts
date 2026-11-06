// StaffDirectory: tra nhân sự kèm phòng ban và staffStatus, lọc theo staffStatus, departmentId và tên không dấu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import { parseStaffFilter } from '../../src/modules/departments/domain';
import { StaffDirectory } from '../../src/modules/departments/staff-directory';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 05/11/2026 giờ Việt Nam

async function seed(db: Kysely<DB>) {
  const add = (
    username: string,
    name: string,
    over: { department_id?: number | null; contract_status?: string | null; on_leave_from?: string | null; on_leave_to?: string | null; job_title?: string | null } = {}
  ) =>
    db
      .insertInto('staff')
      .values({ username, name, pass_hash: 'x', created_at: '2026-10-01', uuid: `u-${username}`, ...over })
      .execute();
  await add('ha', 'Nguyễn Thu Hà', { department_id: 1, contract_status: 'official', job_title: 'Kế toán' });
  await add('linh', 'Đỗ Mai Linh', { department_id: 1, contract_status: 'probation' });
  await add('mai', 'Hoàng Thị Mai', { department_id: 2, contract_status: 'official', on_leave_from: '2026-11-02', on_leave_to: '2026-11-28' });
  await add('nam', 'Trần Văn Nam', { department_id: null, contract_status: 'official' });
  await add('cu', 'Lê Văn Cũ', { department_id: 2, contract_status: 'nghiviec', on_leave_from: '2026-11-01' });
}

const usernames = (list: Array<{ username: string }>) => list.map(p => p.username).sort();

test('find returns the employee block with department and staffStatus', async t => {
  await withTempDb(t, 'sd_block', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const people = await dir.find(parseStaffFilter({}), NOW);
    const ha = people.find(p => p.username === 'ha');
    assert.deepEqual(ha, {
      id: 'u-ha',
      username: 'ha',
      name: 'Nguyễn Thu Hà',
      departmentId: 1,
      departmentName: 'Phòng ban 1',
      jobTitle: 'Kế toán',
      staffStatus: 'working'
    });
    assert.equal(people.find(p => p.username === 'nam')?.departmentName, null);
    assert.equal(people.length, 5);
  });
});

test('staffStatus filters: working takes probation too, resigned wins over on_leave', async t => {
  await withTempDb(t, 'sd_status', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const by = async (staffStatus: string) => usernames(await dir.find(parseStaffFilter({ staffStatus }), NOW));
    assert.deepEqual(await by('all'), ['cu', 'ha', 'linh', 'mai', 'nam']);
    assert.deepEqual(await by('mine'), ['cu', 'ha', 'linh', 'mai', 'nam']);
    assert.deepEqual(await by('working'), ['ha', 'linh', 'nam']);
    assert.deepEqual(await by('probation'), ['linh']);
    assert.deepEqual(await by('on_leave'), ['mai']);
    assert.deepEqual(await by('resigned'), ['cu']);
  });
});

test('the on-leave range follows the Vietnam calendar day', async t => {
  await withTempDb(t, 'sd_leave_day', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const onLeave = async (at: string) => usernames(await dir.find(parseStaffFilter({ staffStatus: 'on_leave' }), new Date(at)));
    assert.deepEqual(await onLeave('2026-11-01T16:59:00.000Z'), [], '01/11 23:59 ICT: not started');
    assert.deepEqual(await onLeave('2026-11-01T17:00:00.000Z'), ['mai'], '02/11 00:00 ICT: started');
    assert.deepEqual(await onLeave('2026-11-28T16:59:00.000Z'), ['mai'], '28/11 23:59 ICT: last day');
    assert.deepEqual(await onLeave('2026-11-28T17:00:00.000Z'), [], '29/11 00:00 ICT: back');
  });
});

test('departmentId filters by department, none takes people without one', async t => {
  await withTempDb(t, 'sd_dept', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const by = async (departmentId: string) => usernames(await dir.find(parseStaffFilter({ departmentId }), NOW));
    assert.deepEqual(await by('1'), ['ha', 'linh']);
    assert.deepEqual(await by('2'), ['cu', 'mai']);
    assert.deepEqual(await by('none'), ['nam']);
    assert.deepEqual(await by('99'), []);
  });
});

test('q matches name or username without accents and filters combine', async t => {
  await withTempDb(t, 'sd_q', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const by = async (raw: { staffStatus?: string; departmentId?: string; q?: string }) => usernames(await dir.find(parseStaffFilter(raw), NOW));
    assert.deepEqual(await by({ q: 'do mai' }), ['linh']);
    assert.deepEqual(await by({ q: 'ĐỖ' }), ['linh']);
    assert.deepEqual(await by({ q: 'van' }), ['cu', 'nam']);
    assert.deepEqual(await by({ q: 'ha' }), ['ha']);
    assert.deepEqual(await by({ q: 'van', staffStatus: 'working' }), ['nam']);
    assert.deepEqual(await by({ q: 'mai', departmentId: '2' }), ['mai']);
  });
});

test('idsOf lists every key an id may be stored under (uuid and username)', async t => {
  await withTempDb(t, 'sd_ids', async db => {
    await seed(db);
    const dir = new StaffDirectory(db);
    const people = await dir.find(parseStaffFilter({ staffStatus: 'probation' }), NOW);
    assert.deepEqual(StaffDirectory.idsOf(people).sort(), ['linh', 'u-linh']);
  });
});
