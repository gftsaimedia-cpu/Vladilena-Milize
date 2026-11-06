// Trạng thái nhân sự tính sẵn và bộ lọc dùng chung: staffStatusOf, parseStaffFilter, matchesStaffStatus.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InvalidStaffFilterError,
  matchesStaffStatus,
  parseStaffFilter,
  staffStatusOf
} from '../../src/modules/departments/domain';

const TODAY = '2026-11-05';
const person = (over: Partial<Parameters<typeof staffStatusOf>[0]> = {}) => ({
  contractStatus: 'official' as string | null,
  onLeaveFrom: null as string | null,
  onLeaveTo: null as string | null,
  ...over
});

describe('staffStatusOf', () => {
  it('maps the stored contract status', () => {
    assert.equal(staffStatusOf(person({ contractStatus: 'official' }), TODAY), 'working');
    assert.equal(staffStatusOf(person({ contractStatus: 'tts' }), TODAY), 'working');
    assert.equal(staffStatusOf(person({ contractStatus: 'ctv' }), TODAY), 'working');
    assert.equal(staffStatusOf(person({ contractStatus: null }), TODAY), 'working');
    assert.equal(staffStatusOf(person({ contractStatus: 'probation' }), TODAY), 'probation');
    assert.equal(staffStatusOf(person({ contractStatus: 'thuviec' }), TODAY), 'probation');
    assert.equal(staffStatusOf(person({ contractStatus: 'nghiviec' }), TODAY), 'resigned');
  });

  it('is on_leave only while today is inside the range', () => {
    const range = { onLeaveFrom: '2026-11-02', onLeaveTo: '2026-11-28' };
    assert.equal(staffStatusOf(person(range), '2026-11-01'), 'working');
    assert.equal(staffStatusOf(person(range), '2026-11-02'), 'on_leave');
    assert.equal(staffStatusOf(person(range), '2026-11-28'), 'on_leave');
    assert.equal(staffStatusOf(person(range), '2026-11-29'), 'working');
  });

  it('keeps an open-ended range on leave until the end date is set', () => {
    const open = person({ onLeaveFrom: '2026-11-02' });
    assert.equal(staffStatusOf(open, '2026-11-01'), 'working');
    assert.equal(staffStatusOf(open, '2027-03-01'), 'on_leave');
  });

  it('lets a probation person be on leave, and resigned always win', () => {
    const range = { onLeaveFrom: '2026-11-02', onLeaveTo: '2026-11-28' };
    assert.equal(staffStatusOf(person({ ...range, contractStatus: 'probation' }), TODAY), 'on_leave');
    assert.equal(staffStatusOf(person({ ...range, contractStatus: 'nghiviec' }), TODAY), 'resigned');
  });
});

describe('matchesStaffStatus', () => {
  it('all and mine take everyone', () => {
    for (const status of ['probation', 'working', 'on_leave', 'resigned'] as const) {
      assert.equal(matchesStaffStatus('all', status), true);
      assert.equal(matchesStaffStatus('mine', status), true);
    }
  });

  it('working takes working and probation people only', () => {
    assert.equal(matchesStaffStatus('working', 'working'), true);
    assert.equal(matchesStaffStatus('working', 'probation'), true);
    assert.equal(matchesStaffStatus('working', 'on_leave'), false);
    assert.equal(matchesStaffStatus('working', 'resigned'), false);
  });

  it('the other filters take exactly their own status', () => {
    assert.equal(matchesStaffStatus('probation', 'probation'), true);
    assert.equal(matchesStaffStatus('probation', 'working'), false);
    assert.equal(matchesStaffStatus('on_leave', 'on_leave'), true);
    assert.equal(matchesStaffStatus('resigned', 'resigned'), true);
    assert.equal(matchesStaffStatus('resigned', 'working'), false);
  });
});

describe('parseStaffFilter', () => {
  it('defaults to everyone with no department and no text', () => {
    assert.deepEqual(parseStaffFilter({}), { staffStatus: 'all', departmentId: undefined, q: '' });
    assert.deepEqual(parseStaffFilter({ staffStatus: '', departmentId: '', q: undefined }), {
      staffStatus: 'all',
      departmentId: undefined,
      q: ''
    });
  });

  it('reads a status, a department id, none and trimmed text', () => {
    assert.deepEqual(parseStaffFilter({ staffStatus: 'on_leave', departmentId: '3', q: '  Hà ' }), {
      staffStatus: 'on_leave',
      departmentId: 3,
      q: 'Hà'
    });
    assert.equal(parseStaffFilter({ departmentId: 'none' }).departmentId, 'none');
  });

  it('refuses unknown values with INVALID_FILTER', () => {
    for (const bad of [{ staffStatus: 'vip' }, { departmentId: 'abc' }, { departmentId: '0' }, { departmentId: '-2' }, { departmentId: '1.5' }]) {
      assert.throws(
        () => parseStaffFilter(bad),
        (err: unknown) => err instanceof InvalidStaffFilterError
      );
    }
  });
});
