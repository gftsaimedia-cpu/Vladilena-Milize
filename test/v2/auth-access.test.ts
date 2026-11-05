import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { ACCESS_KEY, type AccessRule } from '../../src/common';
import { ALL_CAPS, capsOf } from '../../src/modules/auth/domain';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AttendanceController } from '../../src/modules/attendance/attendance.controller';
import { EmployeesController } from '../../src/modules/employees/employees.controller';
import { HolidaysController } from '../../src/modules/holidays/holidays.controller';
import { PayrollController } from '../../src/modules/payroll/payroll.controller';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RolesController } from '../../src/modules/roles/roles.controller';
import { SystemController } from '../../src/modules/system/system.controller';
import { MeController } from '../../src/modules/me/me.controller';

// Mọi controller của các module mà AppModule nạp.
function allControllers(): any[] {
  const modules: any[] = Reflect.getMetadata('imports', AppModule) || [];
  return modules.flatMap(m => Reflect.getMetadata('controllers', m) || []);
}

// Các method của controller là handler HTTP (có metadata đường dẫn của Nest).
function handlersOf(controller: any): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    name => name !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, controller.prototype[name]) !== undefined
  );
}

const ruleOf = (controller: any, method: string): AccessRule | undefined =>
  Reflect.getMetadata(ACCESS_KEY, controller.prototype[method]);

const pub: AccessRule = { kind: 'public' };
const authed: AccessRule = { kind: 'authenticated' };
const cap = (c: string): AccessRule => ({ kind: 'cap', cap: c as any });

const TABLE: Array<[any, string, AccessRule]> = [
  [AuthController, 'login', pub],
  [AuthController, 'logout', pub],
  [AuthController, 'me', pub],
  [AuthController, 'meV2', pub],
  [AuthController, 'changePassword', authed],
  [SystemController, 'health', pub],
  [SystemController, 'healthV2', pub],
  [SystemController, 'getSettings', cap('config.read')],
  [SystemController, 'listPeriods', cap('config.read')],
  [SystemController, 'updateSetting', cap('config.write')],
  [SystemController, 'getAuditLogs', cap('audit.read')],
  [SystemController, 'lockPeriod', cap('attendance.lock')],
  [RolesController, 'list', cap('staff.manage')],
  [RolesController, 'listV2', cap('staff.manage')],
  [HolidaysController, 'list', cap('config.read')],
  [HolidaysController, 'create', cap('config.write')],
  [HolidaysController, 'quickAdd', cap('config.write')],
  [HolidaysController, 'remove', cap('config.write')],
  ...['getPositionsCatalog', 'getShiftsCatalog', 'listEmployees', 'getEmployee', 'createEmployee', 'putEmployee', 'deleteEmployee'].map(
    m => [EmployeesController, m, cap('staff.manage')] as [any, string, AccessRule]
  ),
  ...['recordPunch', 'getPunches', 'listTimesheets', 'getTimesheet', 'recalculateTimesheet'].map(
    m => [AttendanceController, m, cap('attendance.correct')] as [any, string, AccessRule]
  ),
  ...[
    'createLeave',
    'createOvertime',
    'createAdvance',
    'createExplanation',
    'createIsat',
    'listIsatConditions',
    'listRequests',
    'getRequest',
    'reviewRequest',
    'cancelRequest'
  ].map(m => [RequestsController, m, cap('requests.review')] as [any, string, AccessRule]),
  ...['profile', 'today', 'punch', 'attendanceMonth', 'attendanceDay', 'listRequests', 'getRequest', 'createRequest', 'cancelRequest', 'income', 'selfKpi'].map(
    m => [MeController, m, authed] as [any, string, AccessRule]
  ),
  [PayrollController, 'decidePayslip', cap('payroll.approve')],
  ...['calculatePeriod', 'listPayslips', 'getPayslip', 'setKpiScore'].map(
    m => [PayrollController, m, cap('payroll.calculate')] as [any, string, AccessRule]
  )
];

describe('Quyền truy cập theo route', () => {
  it('every handler declares exactly one access rule', () => {
    const missing: string[] = [];
    for (const c of allControllers()) {
      assert.ok(Reflect.getMetadata(PATH_METADATA, c) !== undefined, `${c.name} không phải controller`);
      for (const m of handlersOf(c)) if (!ruleOf(c, m)) missing.push(`${c.name}.${m}`);
    }
    assert.deepEqual(missing, []);
  });

  it('access table matches spec', () => {
    for (const [c, m, expected] of TABLE) assert.deepEqual(ruleOf(c, m), expected, `${c.name}.${m}`);
  });

  it('table covers every handler', () => {
    const listed = new Set(TABLE.map(([c, m]) => `${c.name}.${m}`));
    const all = allControllers().flatMap(c => handlersOf(c).map(m => `${c.name}.${m}`));
    assert.deepEqual(all.filter(h => !listed.has(h)), []);
  });

  it('capsOf gives admin every capability and staff none', () => {
    assert.equal(ALL_CAPS.length, 9);
    assert.deepEqual(capsOf('admin'), [...ALL_CAPS]);
    assert.deepEqual(capsOf('staff'), []);
    assert.deepEqual(capsOf('xyz'), []);
  });
});
