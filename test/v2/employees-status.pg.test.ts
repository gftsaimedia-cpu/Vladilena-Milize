// Trạng thái nhân sự lưu đủ 5 giá trị (người dùng chốt 2026-11-05): TTS, CTV, Thử việc, Chính thức, Nghỉ việc.
// Trước đây cột staff.contract_status chỉ nhận probation/official, nên tts/ctv/nghiviec lưu rỗng và đọc lại thành nv.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const person = (username: string, status: string) => ({
  username,
  name: `Người ${username}`,
  password: 'Moi@123456',
  type: 'nv',
  level: 1,
  shiftType: 'NORMAL',
  status
});

test('each of the five statuses is stored and read back as it was saved', async t => {
  await withTempDb(t, 'staff_status', async db => {
    const kit = auditKit(db);
    const repo = new EmployeesRepository(db);
    const svc = new EmployeesService(repo, kit.tx, kit.log);
    const statuses = ['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'];
    for (const status of statuses) await svc.create(person(`p_${status}`, status), 'admin');

    const readBack = [];
    for (const status of statuses) readBack.push((await repo.findByUsername(`p_${status}`))!.contract.status);
    assert.deepEqual(readBack, statuses);

    // Lương vẫn đọc probation/official cho Thử việc/Chính thức như cũ.
    const raw = await db.selectFrom('staff').select(['username', 'contract_status']).orderBy('username').execute();
    assert.deepEqual(Object.fromEntries(raw.map(r => [r.username, r.contract_status])), {
      p_ctv: 'ctv',
      p_nghiviec: 'nghiviec',
      p_nv: 'official',
      p_thuviec: 'probation',
      p_tts: 'tts'
    });
  });
});

test('Xoá nhân sự stores Nghỉ việc, and staff.delete records the status change', async t => {
  await withTempDb(t, 'staff_status', async db => {
    const kit = auditKit(db);
    const repo = new EmployeesRepository(db);
    const svc = new EmployeesService(repo, kit.tx, kit.log);
    await svc.create(person('binh', 'nv'), 'admin');
    await svc.deactivate('binh', 'hr');

    assert.equal((await repo.findByUsername('binh'))!.contract.status, 'nghiviec');
    const [row] = (await kit.rows()).filter(r => r.action === 'staff.delete');
    assert.equal((row.before as Record<string, unknown>).status, 'nv');
    assert.equal((row.after as Record<string, unknown>).status, 'nghiviec');
  });
});
