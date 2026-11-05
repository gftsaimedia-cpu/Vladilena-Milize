import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';

class FakeShiftRepository extends EmployeesRepository {
  constructor() {
    super({} as any);
  }

  override async listShiftCatalog(): Promise<any[]> {
    return [
      { code: 'Normal1', kind: 'normal', preset: 'n1' },
      { code: 'Night1', kind: 'night', preset: 'ng1' },
      { code: 'Old9', kind: 'normal', preset: 'o9' },
    ];
  }
}

describe('Employees V2 - Danh mục ca trả giờ cố định', () => {
  const service = new EmployeesService(new FakeShiftRepository(), undefined as any, undefined as any);

  it('mỗi ca trong danh mục kèm startTime/endTime; mã ngoài danh mục là null', async () => {
    const rows = await service.getShiftsCatalog();
    assert.deepEqual(
      rows.map((r) => [r.code, r.startTime, r.endTime]),
      [
        ['Normal1', '08:00', '17:00'],
        ['Night1', '22:00', '07:00'],
        ['Old9', null, null],
      ]
    );
    assert.equal(rows[0].preset, 'n1');
  });
});
