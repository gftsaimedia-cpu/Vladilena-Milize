import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../src/common';
import { DepartmentsController } from '../../src/modules/departments/departments.controller';
import {
  DepartmentInputError,
  DepartmentNameTakenError,
  DepartmentNotEmptyError,
  DepartmentNotFoundError
} from '../../src/modules/departments/departments.errors';

const user = { username: 'admin' } as any;
const dept = { id: 1, name: 'Phòng ban 1', sort: 1, staffCount: 0 };

const ok = () =>
  new DepartmentsController({
    list: async () => [dept],
    create: async () => dept,
    update: async () => dept,
    remove: async () => undefined
  } as any);

const failing = (err: Error) => {
  const boom = async () => {
    throw err;
  };
  return new DepartmentsController({ list: boom, create: boom, update: boom, remove: boom } as any);
};

describe('DepartmentsController', () => {
  it('serves the routes with the capabilities of the spec', () => {
    const routes: Array<['list' | 'create' | 'update' | 'remove', number, string | undefined, string]> = [
      ['list', RequestMethod.GET, '/', 'config.read'],
      ['create', RequestMethod.POST, '/', 'config.write'],
      ['update', RequestMethod.PUT, ':id', 'config.write'],
      ['remove', RequestMethod.DELETE, ':id', 'config.write']
    ];
    assert.equal(Reflect.getMetadata(PATH_METADATA, DepartmentsController), 'api/v2/departments');
    for (const [m, verb, path, cap] of routes) {
      const fn = DepartmentsController.prototype[m];
      assert.equal(Reflect.getMetadata(METHOD_METADATA, fn), verb, `${m} verb`);
      assert.equal(Reflect.getMetadata(PATH_METADATA, fn), path, `${m} path`);
      assert.deepEqual(Reflect.getMetadata(ACCESS_KEY, fn), { kind: 'cap', cap }, `${m} capability`);
    }
  });

  it('wraps the results', async () => {
    const ctrl = ok();
    assert.deepEqual(await ctrl.list(), { departments: [dept] });
    assert.deepEqual(await ctrl.create({ name: 'x' }, user), { department: dept });
    assert.deepEqual(await ctrl.update('1', { name: 'x' }, user), { department: dept });
    assert.deepEqual(await ctrl.remove('1', user), { deleted: true, id: 1 });
  });

  const CASES: Array<[Error, number, string]> = [
    [new DepartmentInputError('x'), 400, 'BAD_REQUEST'],
    [new DepartmentNotFoundError(), 404, 'DEPARTMENT_NOT_FOUND'],
    [new DepartmentNameTakenError(), 409, 'DEPARTMENT_NAME_TAKEN'],
    [new DepartmentNotEmptyError(), 409, 'DEPARTMENT_NOT_EMPTY']
  ];
  for (const [err, status, code] of CASES) {
    it(`maps ${err.name} to ${status} ${code}`, async () => {
      const ctrl = failing(err);
      for (const call of [() => ctrl.create({}, user), () => ctrl.update('1', {}, user), () => ctrl.remove('1', user)]) {
        await assert.rejects(call(), (e: any) => e.status === status && e.details?.code === code);
      }
    });
  }

  it('answers 404 for an id that is not a positive integer', async () => {
    const ctrl = ok();
    for (const id of ['abc', '0', '-1', '1.5']) {
      await assert.rejects(ctrl.update(id, {}, user), (e: any) => e.status === 404 && e.details?.code === 'DEPARTMENT_NOT_FOUND');
      await assert.rejects(ctrl.remove(id, user), (e: any) => e.status === 404 && e.details?.code === 'DEPARTMENT_NOT_FOUND');
    }
  });

  it('lets other errors through to the exception filter', async () => {
    await assert.rejects(failing(new Error('db down')).create({}, user), /db down/);
  });
});
