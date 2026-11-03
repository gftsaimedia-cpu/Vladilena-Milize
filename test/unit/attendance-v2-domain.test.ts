import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GeoLocation, WorkMetrics, PunchEvent, DailyTimesheet, WorkSchedule } from '../../src/domain/attendance-v2';

describe('Attendance V2 Domain Models', () => {
  const OFFICE_HCM = new GeoLocation({
    latitude: 10.7725,
    longitude: 106.698,
    accuracyMeters: 10
  });

  describe('GeoLocation Value Object', () => {
    it('creates valid GeoLocation with coordinates and default accuracy', () => {
      const loc = new GeoLocation({ latitude: 10.7725, longitude: 106.698 });
      assert.equal(loc.latitude, 10.7725);
      assert.equal(loc.longitude, 106.698);
      assert.equal(loc.accuracyMeters, 0);
    });

    it('rejects invalid latitude, longitude, or accuracy', () => {
      assert.throws(() => new GeoLocation({ latitude: 91, longitude: 106.698 }), /Vĩ độ/);
      assert.throws(() => new GeoLocation({ latitude: -91, longitude: 106.698 }), /Vĩ độ/);
      assert.throws(() => new GeoLocation({ latitude: 10.7725, longitude: 181 }), /Kinh độ/);
      assert.throws(() => new GeoLocation({ latitude: 10.7725, longitude: -181 }), /Kinh độ/);
      assert.throws(
        () => new GeoLocation({ latitude: 10.7725, longitude: 106.698, accuracyMeters: -5 }),
        /Độ chính xác/
      );
    });

    it('calculates Haversine distance correctly between two points', () => {
      const landmark81 = new GeoLocation({ latitude: 10.795, longitude: 106.7218 });
      const benThanh = new GeoLocation({ latitude: 10.7725, longitude: 106.698 });

      const dist = landmark81.calculateDistanceMeters(benThanh);
      // Distance between Landmark 81 and Ben Thanh is ~3.65 km (3600m - 3700m)
      assert.ok(dist > 3500 && dist < 3800, `Distance ${dist} should be around 3650m`);

      // Distance to self is 0
      assert.equal(landmark81.calculateDistanceMeters(landmark81), 0);
    });

    it('evaluates isWithinRadius correctly', () => {
      const nearOffice = new GeoLocation({ latitude: 10.7726, longitude: 106.6981 });
      const farAway = new GeoLocation({ latitude: 10.823, longitude: 106.629 });

      // nearOffice is ~15 meters away
      assert.equal(nearOffice.isWithinRadius(OFFICE_HCM, 50), true);
      assert.equal(farAway.isWithinRadius(OFFICE_HCM, 50), false);

      assert.throws(() => nearOffice.isWithinRadius(OFFICE_HCM, -10), /Bán kính cho phép/);
    });

    it('serializes to JSON and checks equality', () => {
      const loc1 = new GeoLocation({ latitude: 10.5, longitude: 106.5, accuracyMeters: 5 });
      const loc2 = new GeoLocation({ latitude: 10.5, longitude: 106.5, accuracyMeters: 5 });
      const loc3 = new GeoLocation({ latitude: 10.6, longitude: 106.5, accuracyMeters: 5 });

      assert.equal(loc1.equals(loc2), true);
      assert.equal(loc1.equals(loc3), false);
      assert.deepEqual(loc1.toJSON(), { latitude: 10.5, longitude: 106.5, accuracyMeters: 5 });
    });
  });

  describe('WorkMetrics Value Object', () => {
    it('creates zero WorkMetrics using static zero()', () => {
      const m = WorkMetrics.zero();
      assert.equal(m.workHours, 0);
      assert.equal(m.workUnits, 0);
      assert.equal(m.otHours, 0);
      assert.equal(m.lateMinutes, 0);
      assert.equal(m.earlyMinutes, 0);
    });

    it('supports immutable updates with withChanges', () => {
      const m = WorkMetrics.zero().withChanges({ workHours: 8, workUnits: 1.0 });
      assert.equal(m.workHours, 8);
      assert.equal(m.workUnits, 1.0);
      assert.equal(m.otHours, 0);
    });

    it('rejects negative values', () => {
      assert.throws(() => new WorkMetrics({ workHours: -1 }), /workHours/);
      assert.throws(() => new WorkMetrics({ workUnits: -0.5 }), /workUnits/);
      assert.throws(() => new WorkMetrics({ otHours: -2 }), /otHours/);
      assert.throws(() => new WorkMetrics({ lateMinutes: -10 }), /lateMinutes/);
      assert.throws(() => new WorkMetrics({ earlyMinutes: -5 }), /earlyMinutes/);
    });
  });

  describe('PunchEvent Entity', () => {
    const employeeId = randomUUID();
    const eventId = randomUUID();

    it('creates PunchEvent with valid properties', () => {
      const punch = new PunchEvent({
        id: eventId,
        employeeId,
        punchedAt: new Date('2026-11-03T08:02:00Z'),
        workDate: '2026-11-03',
        type: 'IN',
        userLocation: OFFICE_HCM,
        distanceMeters: 15.5,
        isWithinOffice: true,
        note: 'Check-in đúng giờ'
      });

      assert.equal(punch.id, eventId);
      assert.equal(punch.employeeId, employeeId);
      assert.equal(punch.type, 'IN');
      assert.equal(punch.isWithinOffice, true);
      assert.equal(punch.isValid(), true);
    });

    it('identifies invalid punch when outside office', () => {
      const punch = new PunchEvent({
        id: eventId,
        employeeId,
        punchedAt: new Date('2026-11-03T08:02:00Z'),
        workDate: '2026-11-03',
        type: 'IN',
        userLocation: new GeoLocation({ latitude: 10.823, longitude: 106.629 }),
        distanceMeters: 9500,
        isWithinOffice: false
      });

      assert.equal(punch.isWithinOffice, false);
      assert.equal(punch.isValid(), false);
    });

    it('creates PunchEvent using create() factory with auto distance calculation', () => {
      const nearCoords = new GeoLocation({ latitude: 10.7726, longitude: 106.6981 });
      const punch = PunchEvent.create({
        employeeId,
        workDate: '2026-11-03',
        type: 'IN',
        userLocation: nearCoords,
        officeLocation: OFFICE_HCM,
        allowedRadiusMeters: 100
      });

      assert.ok(punch.id);
      assert.equal(punch.isWithinOffice, true);
      assert.ok(punch.distanceMeters < 50);
      assert.equal(punch.isValid(), true);
    });

    it('serializes to flat DB row and reconstructs via fromRow()', () => {
      const original = new PunchEvent({
        id: eventId,
        employeeId,
        punchedAt: new Date('2026-11-03T08:00:00.000Z'),
        workDate: '2026-11-03',
        type: 'IN',
        userLocation: OFFICE_HCM,
        distanceMeters: 20,
        isWithinOffice: true,
        note: 'Ghi chú'
      });

      const row = original.toRow();
      assert.equal(row.id, eventId);
      assert.equal(row.employee_id, employeeId);
      assert.equal(row.punched_at, '2026-11-03T08:00:00.000Z');
      assert.equal(row.latitude, OFFICE_HCM.latitude);
      assert.equal(row.is_within_office, true);

      const reconstructed = PunchEvent.fromRow(row);
      assert.equal(reconstructed.id, original.id);
      assert.equal(reconstructed.employeeId, original.employeeId);
      assert.equal(reconstructed.punchedAt.toISOString(), original.punchedAt.toISOString());
      assert.equal(reconstructed.distanceMeters, original.distanceMeters);
      assert.equal(reconstructed.isWithinOffice, original.isWithinOffice);
      assert.equal(reconstructed.note, original.note);
    });

    it('serializes to JSON DTO', () => {
      const punch = new PunchEvent({
        id: eventId,
        employeeId,
        punchedAt: new Date('2026-11-03T08:00:00.000Z'),
        workDate: '2026-11-03',
        type: 'OUT',
        userLocation: OFFICE_HCM,
        distanceMeters: 12,
        isWithinOffice: true
      });

      const json = punch.toJSON();
      assert.equal(json.id, eventId);
      assert.equal(json.type, 'OUT');
      assert.deepEqual(json.userLocation, OFFICE_HCM.toJSON());
    });
  });

  describe('DailyTimesheet Aggregate Root', () => {
    const employeeId = randomUUID();

    const makePunch = (
      type: 'IN' | 'OUT',
      isoString: string,
      workDate: string = '2026-11-03',
      isWithinOffice: boolean = true
    ) =>
      new PunchEvent({
        id: randomUUID(),
        employeeId,
        punchedAt: new Date(isoString),
        workDate,
        type,
        userLocation: OFFICE_HCM,
        distanceMeters: 10,
        isWithinOffice
      });

    it('creates standard NORMAL DailyTimesheet with validation', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      assert.equal(timesheet.shiftType, 'NORMAL');
      assert.equal(timesheet.shiftAllowancePct, 0);
      assert.equal(timesheet.status, 'ABSENT');
      assert.equal(timesheet.isLocked, false);
    });

    it('validates shift allowance percentages for FLEX and NIGHT shifts', () => {
      const flex = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'FLEX',
        shiftStartTime: '09:00',
        shiftEndTime: '18:00'
      });
      assert.equal(flex.shiftAllowancePct, 10);

      const night = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NIGHT',
        shiftStartTime: '21:00',
        shiftEndTime: '05:00',
        shiftAllowancePct: 40
      });
      assert.equal(night.shiftAllowancePct, 40);

      assert.throws(
        () =>
          DailyTimesheet.create({
            employeeId,
            workDate: '2026-11-03',
            shiftType: 'NORMAL',
            shiftStartTime: '08:00',
            shiftEndTime: '17:00',
            shiftAllowancePct: 15
          }),
        /Ca NORMAL không có phụ cấp ca/
      );
    });

    it('calculates on-time standard shift (8:00 - 17:00) with 1.0 workUnit', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      const punches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T17:00:00Z')];

      const calculated = timesheet.calculate(punches);
      assert.equal(calculated.status, 'PRESENT');
      assert.equal(calculated.metrics.lateMinutes, 0);
      assert.equal(calculated.metrics.earlyMinutes, 0);
      assert.equal(calculated.metrics.otHours, 0);
      assert.equal(calculated.metrics.workHours, 9.0);
      assert.equal(calculated.metrics.workUnits, 1.0);
    });

    it('calculates late arrival and respects grace period options', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      // 12 minutes late: within 15 min grace period -> lateMinutes = 0
      const punchesGrace = [makePunch('IN', '2026-11-03T08:12:00Z'), makePunch('OUT', '2026-11-03T17:00:00Z')];
      const resGrace = timesheet.calculate(punchesGrace, { gracePeriodMinutes: 15 });
      assert.equal(resGrace.metrics.lateMinutes, 0);
      assert.equal(resGrace.metrics.workUnits, 1.0);

      // 35 minutes late: exceeds 15 min grace period -> lateMinutes = 35
      const punchesLate = [makePunch('IN', '2026-11-03T08:35:00Z'), makePunch('OUT', '2026-11-03T17:00:00Z')];
      const resLate = timesheet.calculate(punchesLate, { gracePeriodMinutes: 15 });
      assert.equal(resLate.metrics.lateMinutes, 35);
      assert.equal(resLate.metrics.earlyMinutes, 0);
      assert.equal(resLate.metrics.workHours, 8.4);
      assert.equal(resLate.metrics.workUnits, 1.0);
    });

    it('calculates early departure correctly', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      // Leaves 45 minutes early at 16:15
      const punches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T16:15:00Z')];

      const res = timesheet.calculate(punches);
      assert.equal(res.metrics.earlyMinutes, 45);
      assert.equal(res.metrics.lateMinutes, 0);
      assert.equal(res.metrics.workHours, 8.3);
      assert.equal(res.metrics.workUnits, 1.0);
    });

    it('calculates workUnits: 0.5 for half day (>= 3.5h) and 0 for < 3.5h', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      // Half day: 4 hours worked (08:00 - 12:00)
      const halfDayPunches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T12:00:00Z')];
      const resHalf = timesheet.calculate(halfDayPunches);
      assert.equal(resHalf.metrics.workHours, 4.0);
      assert.equal(resHalf.metrics.workUnits, 0.5);

      // Short work: 2.5 hours worked (08:00 - 10:30)
      const shortPunches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T10:30:00Z')];
      const resShort = timesheet.calculate(shortPunches);
      assert.equal(resShort.metrics.workHours, 2.5);
      assert.equal(resShort.metrics.workUnits, 0.0);
    });

    it('calculates overtime (otHours) when checking out after shiftEndTime', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      // Checks out at 19:30 (2.5 hours OT)
      const punches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T19:30:00Z')];

      const res = timesheet.calculate(punches);
      assert.equal(res.metrics.otHours, 2.5);
      assert.equal(res.metrics.earlyMinutes, 0);
      assert.equal(res.metrics.lateMinutes, 0);
      assert.equal(res.metrics.workHours, 11.5);
      assert.equal(res.metrics.workUnits, 1.0);
    });

    it('calculates overnight ca đêm correctly across midnight', () => {
      const nightTimesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NIGHT',
        shiftStartTime: '21:00',
        shiftEndTime: '06:00',
        shiftAllowancePct: 30
      });

      // On-time night shift: 21:00 on 2026-11-03 to 06:00 on 2026-11-04
      const punches = [makePunch('IN', '2026-11-03T21:00:00Z'), makePunch('OUT', '2026-11-04T06:00:00Z')];

      const res = nightTimesheet.calculate(punches);
      assert.equal(res.status, 'PRESENT');
      assert.equal(res.metrics.lateMinutes, 0);
      assert.equal(res.metrics.earlyMinutes, 0);
      assert.equal(res.metrics.otHours, 0);
      assert.equal(res.metrics.workHours, 9.0);
      assert.equal(res.metrics.workUnits, 1.0);

      // Late night shift check-in (21:45) & 1.5h OT (07:30 next morning)
      const punchesLateOt = [makePunch('IN', '2026-11-03T21:45:00Z'), makePunch('OUT', '2026-11-04T07:30:00Z')];

      const resLateOt = nightTimesheet.calculate(punchesLateOt);
      assert.equal(resLateOt.metrics.lateMinutes, 45);
      assert.equal(resLateOt.metrics.earlyMinutes, 0);
      assert.equal(resLateOt.metrics.otHours, 1.5);
      assert.equal(resLateOt.metrics.workHours, 9.8);
      assert.equal(resLateOt.metrics.workUnits, 1.0);
    });

    it('calculates correctly with local timezone Date objects', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      const localIn = new Date(2026, 10, 3, 8, 15, 0); // 15 mins late in local time
      const localOut = new Date(2026, 10, 3, 17, 30, 0); // 30 mins OT in local time

      const punches = [
        new PunchEvent({
          id: randomUUID(),
          employeeId,
          punchedAt: localIn,
          workDate: '2026-11-03',
          type: 'IN',
          userLocation: OFFICE_HCM,
          distanceMeters: 5,
          isWithinOffice: true
        }),
        new PunchEvent({
          id: randomUUID(),
          employeeId,
          punchedAt: localOut,
          workDate: '2026-11-03',
          type: 'OUT',
          userLocation: OFFICE_HCM,
          distanceMeters: 5,
          isWithinOffice: true
        })
      ];

      const res = timesheet.calculate(punches);
      assert.equal(res.status, 'PRESENT');
      assert.equal(res.metrics.lateMinutes, 15);
      assert.equal(res.metrics.earlyMinutes, 0);
      assert.equal(res.metrics.otHours, 0.5);
      assert.equal(res.metrics.workUnits, 1.0);
    });

    it('handles missing punches and invalid punches gracefully', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      // Only IN punch -> ABSENT
      const onlyIn = [makePunch('IN', '2026-11-03T08:00:00Z')];
      const resIn = timesheet.calculate(onlyIn);
      assert.equal(resIn.status, 'ABSENT');
      assert.equal(resIn.metrics.workUnits, 0);

      // Outside office punch is invalid and ignored
      const invalidPunch = [
        makePunch('IN', '2026-11-03T08:00:00Z', '2026-11-03', false),
        makePunch('OUT', '2026-11-03T17:00:00Z', '2026-11-03', true)
      ];
      const resInvalid = timesheet.calculate(invalidPunch);
      assert.equal(resInvalid.status, 'ABSENT');
    });

    it('applies approved paid and unpaid leave', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      const paidLeave = timesheet.applyApprovedLeave(true);
      assert.equal(paidLeave.status, 'LEAVE_PAID');
      assert.equal(paidLeave.metrics.workUnits, 1.0);
      assert.equal(paidLeave.metrics.workHours, 0);

      const unpaidLeave = timesheet.applyApprovedLeave(false);
      assert.equal(unpaidLeave.status, 'LEAVE_UNPAID');
      assert.equal(unpaidLeave.metrics.workUnits, 0.0);
      assert.equal(unpaidLeave.metrics.workHours, 0);
    });

    it('enforces lock invariant for payroll', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00'
      });

      const lockedTimesheet = timesheet.lockForPayroll();
      assert.equal(lockedTimesheet.isLocked, true);

      const punches = [makePunch('IN', '2026-11-03T08:00:00Z'), makePunch('OUT', '2026-11-03T17:00:00Z')];

      assert.throws(() => lockedTimesheet.calculate(punches), /Bảng công ngày đã bị khóa/);

      assert.throws(() => lockedTimesheet.applyApprovedLeave(true), /Bảng công ngày đã bị khóa/);
    });

    it('converts to flat DB row and reconstructs via fromRow()', () => {
      const original = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        actualCheckIn: new Date('2026-11-03T08:00:00Z'),
        actualCheckOut: new Date('2026-11-03T17:00:00Z'),
        metrics: new WorkMetrics({
          workHours: 9.0,
          workUnits: 1.0,
          otHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0
        }),
        status: 'PRESENT',
        isLocked: false
      });

      const row = original.toRow();
      assert.equal(row.shift_type, 'NORMAL');
      assert.equal(row.shift_start_time, '08:00');
      assert.equal(row.shift_end_time, '17:00');
      assert.equal(row.work_hours, 9.0);
      assert.equal(row.work_units, 1.0);
      assert.equal(row.status, 'PRESENT');

      const reconstructed = DailyTimesheet.fromRow(row);
      assert.equal(reconstructed.id, original.id);
      assert.equal(reconstructed.employeeId, original.employeeId);
      assert.equal(reconstructed.shiftType, original.shiftType);
      assert.equal(reconstructed.shiftStartTime, original.shiftStartTime);
      assert.equal(reconstructed.shiftEndTime, original.shiftEndTime);
      assert.equal(reconstructed.metrics.workHours, original.metrics.workHours);
      assert.equal(reconstructed.metrics.workUnits, original.metrics.workUnits);
      assert.equal(reconstructed.status, original.status);
      assert.equal(reconstructed.isLocked, original.isLocked);
    });

    it('serializes to JSON DTO', () => {
      const timesheet = DailyTimesheet.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'FLEX',
        shiftStartTime: '09:00',
        shiftEndTime: '18:00'
      });

      const json = timesheet.toJSON();
      assert.equal(json.shiftType, 'FLEX');
      assert.equal(json.shiftAllowancePct, 10);
      assert.equal(json.status, 'ABSENT');
      assert.deepEqual(json.metrics, WorkMetrics.zero().toJSON());
    });

    describe('Window of Validity with WorkSchedule', () => {
      const defaultSchedule = WorkSchedule.create({
        employeeId,
        workDate: '2026-11-03',
        shiftType: 'NORMAL',
        plannedStartTime: '08:00',
        plannedEndTime: '17:00'
      });

      it('Case 1: Check-in at 07:55 for 08:00 shift -> checkInStatus = VALID', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T07:55:00Z'),
          makePunch('OUT', '2026-11-03T17:05:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkInStatus, 'VALID');
        assert.equal(res.checkOutStatus, 'VALID');
        assert.equal(res.dayStatus, 'VALID');
      });

      it('Case 2: Check-in at 07:40 for 08:00 shift -> EARLY -> NEEDS_EXPLANATION', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T07:40:00Z'),
          makePunch('OUT', '2026-11-03T17:05:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkInStatus, 'EARLY');
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });

      it('Case 3: Check-in at 08:20 for 08:00 shift -> LATE, lateMinutes = 20 -> NEEDS_EXPLANATION', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:20:00Z'),
          makePunch('OUT', '2026-11-03T17:05:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkInStatus, 'LATE');
        assert.equal(res.metrics.lateMinutes, 20);
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });

      it('Case 4: Passed 08:30 with no check-in punch -> MISSED -> NEEDS_EXPLANATION', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        // Simulated time is 09:00 (passed 08:30)
        const now = new Date('2026-11-03T09:00:00Z');
        const res = timesheet.calculate([], defaultSchedule, now);
        assert.equal(res.checkInStatus, 'MISSED');
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });

      it('Case 5: In-progress shift at 12:00 after valid check-in -> checkOutStatus = PENDING, dayStatus = IN_PROGRESS', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [makePunch('IN', '2026-11-03T08:02:00Z')];
        const now = new Date('2026-11-03T12:00:00Z');
        const res = timesheet.calculate(punches, defaultSchedule, now);
        assert.equal(res.checkInStatus, 'VALID');
        assert.equal(res.checkOutStatus, 'PENDING');
        assert.equal(res.dayStatus, 'IN_PROGRESS');
      });

      it('Case 6: Check-out at 16:50 for 17:00 shift -> EARLY, earlyMinutes = 10 -> NEEDS_EXPLANATION', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:00:00Z'),
          makePunch('OUT', '2026-11-03T16:50:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkOutStatus, 'EARLY');
        assert.equal(res.metrics.earlyMinutes, 10);
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });

      it('Case 7: Check-out at 17:15 for 17:00 shift -> VALID', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:00:00Z'),
          makePunch('OUT', '2026-11-03T17:15:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkOutStatus, 'VALID');
        assert.equal(res.metrics.earlyMinutes, 0);
        assert.equal(res.dayStatus, 'VALID');
      });

      it('Case 8: Check-out at 18:00 for 17:00 shift without OT -> LATE_WITHOUT_OT -> NEEDS_EXPLANATION', () => {
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:00:00Z'),
          makePunch('OUT', '2026-11-03T18:00:00Z')
        ];
        const res = timesheet.calculate(punches, defaultSchedule);
        assert.equal(res.checkOutStatus, 'LATE_WITHOUT_OT');
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });

      it('Case 9: Approved OT until 21:00, check-out at 21:10 -> VALID, otHours = 4.0', () => {
        const otSchedule = WorkSchedule.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          plannedStartTime: '08:00',
          plannedEndTime: '21:00',
          approvedOtHours: 4.0,
          scheduleType: 'OVERTIME'
        });
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '21:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:00:00Z'),
          makePunch('OUT', '2026-11-03T21:10:00Z')
        ];
        const res = timesheet.calculate(punches, otSchedule);
        assert.equal(res.checkInStatus, 'VALID');
        assert.equal(res.checkOutStatus, 'VALID');
        assert.equal(res.metrics.otHours, 4.0);
        assert.equal(res.dayStatus, 'VALID');
      });

      it('Case 10: Make-up shift 08:00 - 22:00, check-out at 17:00 -> EARLY, earlyMinutes = 300 -> NEEDS_EXPLANATION', () => {
        const makeupSchedule = WorkSchedule.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          plannedStartTime: '08:00',
          plannedEndTime: '22:00',
          scheduleType: 'MAKE_UP'
        });
        const timesheet = DailyTimesheet.create({
          employeeId,
          workDate: '2026-11-03',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '22:00'
        });
        const punches = [
          makePunch('IN', '2026-11-03T08:00:00Z'),
          makePunch('OUT', '2026-11-03T17:00:00Z')
        ];
        const res = timesheet.calculate(punches, makeupSchedule);
        assert.equal(res.checkOutStatus, 'EARLY');
        assert.equal(res.metrics.earlyMinutes, 300);
        assert.equal(res.dayStatus, 'NEEDS_EXPLANATION');
      });
    });
  });
});
