// Hộp "Thêm nhân sự" (Admin): logic thuần trong web/src/builders/admin-hr/new-staff.ts — gợi ý tên đăng nhập, tách
// họ tên, các lựa chọn theo danh mục chức vụ của tháng, nút Tạo chỉ bật khi đủ và đúng, thân POST /api/v2/employees.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanUsername,
  createProblem,
  emptyNewStaff,
  levelOptions,
  newStaffBody,
  splitName,
  suggestUsername,
  typeOptions
} from '../../web/src/builders/admin-hr/new-staff';

const level = (type_code: string, level_no: number, name: string, effective_month = '2000-01') => ({
  type_code,
  level_no,
  effective_month,
  name,
  base_salary: 1,
  kpi_max: null,
  night_pct: null,
  rev: 0
});
const type = (code: string, name: string, levels: any[], effective_month = '2000-01') => ({
  id: 1,
  code,
  effective_month,
  name,
  workdays: 26,
  flex_pct: 10,
  night_pct: 30,
  travel_pct: 0,
  attendance_pct: 0,
  regular_dows: '[1,2,3,4,5,6]',
  rev: 0,
  levels
});
const CATALOG = [
  type('ctv', 'Chuyên trách viên', [level('ctv', 1, 'Fresher'), level('ctv', 2, 'Junior')]),
  type('nv', 'Nhân viên', [level('nv', 1, 'Nhân viên'), level('nv', 2, 'Chuyên viên'), level('nv', 3, 'Trưởng nhóm', '2026-12')]),
  type('tts', 'Thực tập sinh', [level('tts', 1, 'Explorer')])
];

function filled(over: Record<string, unknown> = {}) {
  return {
    ...emptyNewStaff('2026-11-05'),
    name: 'Phan Thị Hai',
    username: 'phan-thi-hai',
    password: 'Hai@2026',
    type: 'nv',
    level: '1',
    status: 'thuviec',
    ...over
  };
}

describe('Thêm nhân sự: tên đăng nhập và họ tên', () => {
  it('suggests a username from the full name, without accents', () => {
    assert.equal(suggestUsername('Phan Thị Hai'), 'phan-thi-hai');
    assert.equal(suggestUsername('  Đặng   Văn  Phúc '), 'dang-van-phuc');
    assert.equal(suggestUsername('Lê Văn Tâm (kế toán)'), 'le-van-tam-ke-toan');
    assert.equal(suggestUsername(''), '');
  });

  it('keeps only the characters a username may have while typing', () => {
    assert.equal(cleanUsername('Ns AN!'), 'nsan');
    assert.equal(cleanUsername('le.van_tam-2'), 'le.van_tam-2');
    assert.equal(cleanUsername('Tâm'), 'tm');
  });

  it('splits the full name into family and given name, the given name being the last word', () => {
    assert.deepEqual(splitName('  Phan   Thị Hai '), { familyName: 'Phan Thị', givenName: 'Hai' });
    assert.deepEqual(splitName('Hai'), { familyName: '', givenName: 'Hai' });
  });
});

describe('Thêm nhân sự: lựa chọn theo danh mục của tháng', () => {
  it('lists the staff types in the order TTS, CTV, NV', () => {
    assert.deepEqual(typeOptions(CATALOG, '2026-11'), [
      { value: 'tts', label: 'Thực tập sinh' },
      { value: 'ctv', label: 'Chuyên trách viên' },
      { value: 'nv', label: 'Nhân viên' }
    ]);
  });

  it('lists only the levels in force this month for the chosen type', () => {
    assert.deepEqual(levelOptions(CATALOG, 'nv', '2026-11'), [
      { value: '1', label: 'Bậc 1 · Nhân viên' },
      { value: '2', label: 'Bậc 2 · Chuyên viên' }
    ]);
    assert.deepEqual(levelOptions(CATALOG, '', '2026-11'), []);
  });
});

describe('Thêm nhân sự: nút Tạo chỉ bật khi đủ và đúng', () => {
  const taken = ['admin', 'ns-an'];
  const levels = levelOptions(CATALOG, 'nv', '2026-11');

  it('accepts a complete form', () => {
    assert.equal(createProblem(filled(), taken, levels), '');
  });

  it('refuses a missing name, username, type or level', () => {
    for (const key of ['name', 'username', 'type', 'level']) {
      assert.notEqual(createProblem(filled({ [key]: '' }), taken, levels), '', key);
    }
    assert.notEqual(createProblem(filled({ name: '   ' }), taken, levels), '');
  });

  it('refuses a username someone already has', () => {
    assert.equal(createProblem(filled({ username: 'ns-an' }), taken, levels), 'Tên đăng nhập ns-an đã có người dùng.');
  });

  it('refuses a starting password under 6 characters', () => {
    assert.notEqual(createProblem(filled({ password: '12345' }), taken, levels), '');
    assert.equal(createProblem(filled({ password: '123456' }), taken, levels), '');
  });

  it('refuses a level that is not offered for the type', () => {
    assert.notEqual(createProblem(filled({ level: '3' }), taken, levels), '');
  });

  it('needs Thử việc or Chính thức for NV only', () => {
    assert.notEqual(createProblem(filled({ status: '' }), taken, levels), '');
    const ttsLevels = levelOptions(CATALOG, 'tts', '2026-11');
    assert.equal(createProblem(filled({ type: 'tts', status: '' }), taken, ttsLevels), '');
  });

  it('needs the 40% or 60% night allowance for an NV on the night shift', () => {
    assert.notEqual(createProblem(filled({ shift: 'NIGHT', nightPct: '' }), taken, levels), '');
    assert.equal(createProblem(filled({ shift: 'NIGHT', nightPct: '60' }), taken, levels), '');
  });

  it('needs a start date', () => {
    assert.notEqual(createProblem(filled({ start: '' }), taken, levels), '');
  });
});

describe('Thêm nhân sự: thân POST /employees', () => {
  it('sends the name under profile.name, which is where BE reads it', () => {
    const body = newStaffBody(filled({ job: ' Kế toán ', birthday: '1998-04-02' }));
    assert.deepEqual(body, {
      account: { username: 'phan-thi-hai', password: 'Hai@2026', roles: ['staff'] },
      profile: { name: { familyName: 'Phan Thị', givenName: 'Hai' }, birthday: '1998-04-02' },
      contract: {
        status: 'thuviec',
        effectiveFrom: '2026-11-05',
        position: { type: 'nv', level: 1, jobTitle: 'Kế toán' },
        shift: { type: 'NORMAL' }
      }
    });
  });

  it('uses the type as the status for TTS and CTV and leaves an empty job title and birthday out', () => {
    const body = newStaffBody(filled({ type: 'tts', status: 'thuviec', job: '', birthday: '' }));
    assert.equal(body.contract.status, 'tts');
    assert.equal(body.contract.position.jobTitle, null);
    assert.equal(body.profile.birthday, null);
  });

  it('sends the night allowance only for an NV on the night shift', () => {
    assert.deepEqual(newStaffBody(filled({ shift: 'NIGHT', nightPct: '60' })).contract.shift, { type: 'NIGHT', allowancePct: 60 });
    assert.deepEqual(newStaffBody(filled({ type: 'ctv', shift: 'NIGHT', nightPct: '60' })).contract.shift, { type: 'NIGHT' });
    assert.deepEqual(newStaffBody(filled({ shift: 'FLEX' })).contract.shift, { type: 'FLEX' });
  });
});
