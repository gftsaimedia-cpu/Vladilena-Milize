import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PersonName } from '../../src/domain/employee-v2/person-name';
import { Position } from '../../src/domain/employee-v2/position';
import { Shift, type ShiftType } from '../../src/domain/employee-v2/shift';
import { Leave } from '../../src/domain/employee-v2/leave';

describe('Employee v2 Value Objects', () => {
  describe('PersonName', () => {
    it('creates PersonName from familyName and givenName with whitespace trimming', () => {
      const name = new PersonName({ familyName: '  Nguyễn  Văn  ', givenName: '  An  ' });
      assert.equal(name.familyName, 'Nguyễn Văn');
      assert.equal(name.givenName, 'An');
      assert.equal(name.fullName, 'Nguyễn Văn An');
    });

    it('creates PersonName from fullName with multi-word name', () => {
      const name = PersonName.fromFullName('  Trần   Thị   Mai   Hoa  ');
      assert.equal(name.familyName, 'Trần Thị Mai');
      assert.equal(name.givenName, 'Hoa');
      assert.equal(name.fullName, 'Trần Thị Mai Hoa');
    });

    it('creates PersonName from single word fullName', () => {
      const name = PersonName.fromFullName('  John  ');
      assert.equal(name.familyName, '');
      assert.equal(name.givenName, 'John');
      assert.equal(name.fullName, 'John');
    });

    it('creates PersonName using PersonName.fromParts', () => {
      const name = PersonName.fromParts('Lê', 'Bình');
      assert.equal(name.familyName, 'Lê');
      assert.equal(name.givenName, 'Bình');
      assert.equal(name.fullName, 'Lê Bình');
    });

    it('throws when fullName is empty', () => {
      assert.throws(
        () => new PersonName({ fullName: '   ' }),
        /Họ tên nhân viên không được để trống/
      );
      assert.throws(
        () => new PersonName({ familyName: '', givenName: '' }),
        /Họ tên nhân viên không được để trống/
      );
      assert.throws(
        () => new PersonName({}),
        /Họ tên nhân viên không được để trống/
      );
    });

    it('supports withChanges to update name parts immutably', () => {
      const original = PersonName.fromFullName('Phạm Văn Đồng');
      const updated = original.withChanges({ givenName: 'Hùng' });
      assert.equal(original.fullName, 'Phạm Văn Đồng');
      assert.equal(updated.fullName, 'Phạm Văn Hùng');
      assert.equal(updated.familyName, 'Phạm Văn');
      assert.equal(updated.givenName, 'Hùng');

      const updatedFull = original.withChanges({ fullName: 'Hoàng Thị Lan' });
      assert.equal(updatedFull.familyName, 'Hoàng Thị');
      assert.equal(updatedFull.givenName, 'Lan');
      assert.equal(updatedFull.fullName, 'Hoàng Thị Lan');
    });

    it('serializes to JSON correctly', () => {
      const name = PersonName.fromParts('Đỗ', 'Duy');
      assert.deepEqual(name.toJSON(), {
        familyName: 'Đỗ',
        givenName: 'Duy',
        fullName: 'Đỗ Duy'
      });
    });
  });

  describe('Position', () => {
    it('creates Position with valid type, level, and jobTitle', () => {
      const pos = new Position({ type: '  NV  ', level: 2, jobTitle: '  Kỹ sư phần mềm  ' });
      assert.equal(pos.type, 'nv');
      assert.equal(pos.level, 2);
      assert.equal(pos.jobTitle, 'Kỹ sư phần mềm');
    });

    it('uses default level 1 and null jobTitle when omitted', () => {
      const pos = new Position({ type: 'tts' });
      assert.equal(pos.type, 'tts');
      assert.equal(pos.level, 1);
      assert.equal(pos.jobTitle, null);
    });

    it('throws when type is empty or invalid', () => {
      assert.throws(
        () => new Position({ type: '' }),
        /Loại chức vụ không được để trống/
      );
      assert.throws(
        () => new Position({ type: '   ' }),
        /Loại chức vụ không được để trống/
      );
    });

    it('throws when level is < 1 or non-integer', () => {
      assert.throws(
        () => new Position({ type: 'nv', level: 0 }),
        /Cấp bậc phải là số nguyên >= 1/
      );
      assert.throws(
        () => new Position({ type: 'nv', level: -1 }),
        /Cấp bậc phải là số nguyên >= 1/
      );
      assert.throws(
        () => new Position({ type: 'nv', level: 1.5 }),
        /Cấp bậc phải là số nguyên >= 1/
      );
    });

    it('supports withChanges to update attributes immutably', () => {
      const original = new Position({ type: 'ctv', level: 1, jobTitle: 'Cộng tác viên' });
      const updated = original.withChanges({ type: 'nv', level: 2 });
      assert.equal(original.type, 'ctv');
      assert.equal(original.level, 1);
      assert.equal(updated.type, 'nv');
      assert.equal(updated.level, 2);
      assert.equal(updated.jobTitle, 'Cộng tác viên');
    });

    it('serializes to JSON correctly', () => {
      const pos = new Position({ type: 'ql', level: 3, jobTitle: 'Quản lý' });
      assert.deepEqual(pos.toJSON(), {
        type: 'ql',
        level: 3,
        jobTitle: 'Quản lý'
      });
    });
  });

  describe('Shift', () => {
    it('creates NORMAL shift with default allowancePct 0', () => {
      const shift = new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '17:00' });
      assert.equal(shift.type, 'NORMAL');
      assert.equal(shift.startTime, '08:00');
      assert.equal(shift.endTime, '17:00');
      assert.equal(shift.allowancePct, 0);
      assert.equal(shift.isOvernight(), false);
    });

    it('throws if NORMAL shift has non-zero allowancePct', () => {
      assert.throws(
        () => new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 10 }),
        /Ca NORMAL không có phụ cấp ca \(0%\)/
      );
    });

    it('creates FLEX shift with default allowancePct 10', () => {
      const shift = new Shift({ type: 'FLEX', startTime: '10:00', endTime: '19:00' });
      assert.equal(shift.type, 'FLEX');
      assert.equal(shift.allowancePct, 10);
      assert.equal(shift.isOvernight(), false);
    });

    it('throws if FLEX shift has allowancePct other than 10', () => {
      assert.throws(
        () => new Shift({ type: 'FLEX', startTime: '10:00', endTime: '19:00', allowancePct: 20 }),
        /Ca FLEX có phụ cấp ca cố định là 10%/
      );
      assert.throws(
        () => new Shift({ type: 'FLEX', startTime: '10:00', endTime: '19:00', allowancePct: 0 }),
        /Ca FLEX có phụ cấp ca cố định là 10%/
      );
    });

    it('creates NIGHT shift with default allowancePct 30 or allowed 40/60', () => {
      const night30 = new Shift({ type: 'NIGHT', startTime: '21:00', endTime: '06:00' });
      assert.equal(night30.allowancePct, 30);
      assert.equal(night30.isOvernight(), true);

      const night40 = new Shift({ type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 40 });
      assert.equal(night40.allowancePct, 40);
      assert.equal(night40.isOvernight(), true);

      const night60 = new Shift({ type: 'NIGHT', startTime: '22:00', endTime: '06:00', allowancePct: 60 });
      assert.equal(night60.allowancePct, 60);
      assert.equal(night60.isOvernight(), true);
    });

    it('throws if NIGHT shift has allowancePct not in 30, 40, 60', () => {
      assert.throws(
        () => new Shift({ type: 'NIGHT', startTime: '21:00', endTime: '06:00', allowancePct: 50 }),
        /Ca NIGHT chỉ nhận phụ cấp ca 30%, 40% hoặc 60%/
      );
      assert.throws(
        () => new Shift({ type: 'NIGHT', startTime: '21:00', endTime: '06:00', allowancePct: 0 }),
        /Ca NIGHT chỉ nhận phụ cấp ca 30%, 40% hoặc 60%/
      );
    });

    it('validates HH:mm time format and shift type', () => {
      assert.throws(
        () => new Shift({ type: 'UNKNOWN' as ShiftType, startTime: '08:00', endTime: '17:00' }),
        /Loại ca không hợp lệ/
      );
      assert.throws(
        () => new Shift({ type: 'NORMAL', startTime: '8:00', endTime: '17:00' }),
        /Định dạng giờ không hợp lệ/
      );
      assert.throws(
        () => new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '24:00' }),
        /Định dạng giờ không hợp lệ/
      );
    });

    it('correctly determines isOvernight', () => {
      const normal = new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '17:00' });
      assert.equal(normal.isOvernight(), false);

      const overnight = new Shift({ type: 'NIGHT', startTime: '21:00', endTime: '06:00' });
      assert.equal(overnight.isOvernight(), true);

      const equalTimes = new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '08:00' });
      assert.equal(equalTimes.isOvernight(), true);
    });

    it('supports withChanges to update shift attributes immutably', () => {
      const original = new Shift({ type: 'NORMAL', startTime: '08:00', endTime: '17:00' });
      const updatedTime = original.withChanges({ endTime: '16:30' });
      assert.equal(original.endTime, '17:00');
      assert.equal(updatedTime.endTime, '16:30');
      assert.equal(updatedTime.type, 'NORMAL');

      const updatedType = original.withChanges({ type: 'FLEX' });
      assert.equal(updatedType.type, 'FLEX');
      assert.equal(updatedType.allowancePct, 10);
    });

    it('serializes to JSON correctly', () => {
      const shift = new Shift({ type: 'NIGHT', startTime: '22:00', endTime: '06:00', allowancePct: 40 });
      assert.deepEqual(shift.toJSON(), {
        type: 'NIGHT',
        startTime: '22:00',
        endTime: '06:00',
        allowancePct: 40,
        isOvernight: true
      });
    });
  });

  describe('Leave', () => {
    it('initializes with default 0 totalDays and 0 usedDays', () => {
      const leave = new Leave();
      assert.equal(leave.totalDays, 0);
      assert.equal(leave.usedDays, 0);
      assert.equal(leave.remainingDays(), 0);
    });

    it('initializes with provided totalDays and usedDays', () => {
      const leave = new Leave({ totalDays: 12, usedDays: 3.5 });
      assert.equal(leave.totalDays, 12);
      assert.equal(leave.usedDays, 3.5);
      assert.equal(leave.remainingDays(), 8.5);
    });

    it('throws when totalDays or usedDays is negative or non-finite', () => {
      assert.throws(
        () => new Leave({ totalDays: -1 }),
        /Số ngày phép phải là số không âm hợp lệ/
      );
      assert.throws(
        () => new Leave({ usedDays: -0.5 }),
        /Số ngày phép phải là số không âm hợp lệ/
      );
      assert.throws(
        () => new Leave({ totalDays: NaN }),
        /Số ngày phép phải là số không âm hợp lệ/
      );
    });

    it('canTakeLeave checks if requested days can be taken', () => {
      const leave = new Leave({ totalDays: 10, usedDays: 7 });
      assert.equal(leave.canTakeLeave(2), true);
      assert.equal(leave.canTakeLeave(3), true);
      assert.equal(leave.canTakeLeave(3.5), false);
      assert.equal(leave.canTakeLeave(0), false);
      assert.equal(leave.canTakeLeave(-1), false);
    });

    it('useLeave deducts leave days immutably', () => {
      const leave = new Leave({ totalDays: 10, usedDays: 2 });
      const nextLeave = leave.useLeave(2.5);
      assert.equal(leave.usedDays, 2);
      assert.equal(nextLeave.totalDays, 10);
      assert.equal(nextLeave.usedDays, 4.5);
      assert.equal(nextLeave.remainingDays(), 5.5);
    });

    it('useLeave throws when days <= 0 or exceeds remaining', () => {
      const leave = new Leave({ totalDays: 5, usedDays: 3 });
      assert.throws(
        () => leave.useLeave(0),
        /Số ngày nghỉ không hợp lệ hoặc vượt quá số ngày phép còn lại/
      );
      assert.throws(
        () => leave.useLeave(-1),
        /Số ngày nghỉ không hợp lệ hoặc vượt quá số ngày phép còn lại/
      );
      assert.throws(
        () => leave.useLeave(3),
        /Số ngày nghỉ không hợp lệ hoặc vượt quá số ngày phép còn lại/
      );
    });

    it('handles floating point precision in remainingDays and useLeave', () => {
      const leave = new Leave({ totalDays: 12, usedDays: 4.1 });
      assert.equal(leave.remainingDays(), 7.9);
      const updated = leave.useLeave(0.2);
      assert.equal(updated.usedDays, 4.3);
      assert.equal(updated.remainingDays(), 7.7);
    });

    it('supports withChanges to update attributes immutably', () => {
      const leave = new Leave({ totalDays: 10, usedDays: 2 });
      const updated = leave.withChanges({ totalDays: 15 });
      assert.equal(leave.totalDays, 10);
      assert.equal(updated.totalDays, 15);
      assert.equal(updated.usedDays, 2);
      assert.equal(updated.remainingDays(), 13);
    });

    it('serializes to JSON correctly', () => {
      const leave = new Leave({ totalDays: 12, usedDays: 4 });
      assert.deepEqual(leave.toJSON(), {
        totalDays: 12,
        usedDays: 4,
        remainingDays: 8
      });
    });
  });
});
