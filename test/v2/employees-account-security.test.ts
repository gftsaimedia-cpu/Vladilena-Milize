import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { createScriptedKysely, type ScriptedQuery } from './helpers/scripted-kysely';

// Hồ sơ đang có, dựng qua chính service để đủ mọi phần.
const service = new EmployeesService({} as any);
const existing = service.buildEmployeeFromInput({
  username: 'nam',
  password: 'Cu@123456',
  profile: { familyName: 'Lê', givenName: 'Nam' },
  contract: { status: 'nv', position: { type: 'nv', level: 1 } }
});

describe('Khoá tài khoản và đặt lại mật khẩu qua PUT /employees', () => {
  it('locking without lockedAt stamps the lock time', () => {
    const locked = service.buildEmployeeFromInput({ account: { isLocked: true } }, existing);
    assert.equal(locked.account.isLocked, true);
    assert.ok(locked.account.lockedAt && !Number.isNaN(Date.parse(locked.account.lockedAt)), String(locked.account.lockedAt));
  });

  it('unlocking clears the lock time', () => {
    const locked = service.buildEmployeeFromInput({ account: { isLocked: true } }, existing);
    const open = service.buildEmployeeFromInput({ account: { isLocked: false } }, locked);
    assert.equal(open.account.isLocked, false);
    assert.equal(open.account.lockedAt, null);
  });

  it('saving bumps session_version when the password hash changes', async () => {
    const { db, log } = createScriptedKysely();
    const repo = new EmployeesRepository(db);
    // save() đọc lại hồ sơ sau khi ghi: trả null là đủ cho phép kiểm câu lệnh ghi
    repo.findByUsernameOrUuid = async () => existing;
    await repo.save(service.buildEmployeeFromInput({ account: { password: 'Moi@123456' } }, existing));
    const upsert = log.find(e => typeof e === 'object' && /^insert into "staff"/.test(e.sql)) as ScriptedQuery;
    const m = /"session_version" = case when "staff"\."pass_hash" <> "excluded"\."pass_hash" then "staff"\."session_version" \+ \$(\d+) else "staff"\."session_version" end/.exec(upsert.sql);
    assert.ok(m, upsert.sql);
    assert.equal(upsert.parameters[Number(m[1]) - 1], 1);
  });

  it('a saved hash is a real scrypt hash, never the request text', () => {
    const changed = service.buildEmployeeFromInput({ account: { password: 'Moi@123456' } }, existing);
    assert.notEqual(changed.account.passwordHash, existing.account.passwordHash);
    assert.ok(changed.account.passwordHash.startsWith('scrypt$'));
    assert.ok(hashPassword('x').startsWith('scrypt$'));
  });
});
