import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';

test('half-shift with leave-with-makeup in same month (Spec 7.3)', async t => {
  await withTempDb(t, 'half_shift_lwm_month', async (db, client) => {
    const nvId = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
    const adminId = '0a7c4e2e-1111-4a6b-9c1d-000000000099';

    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES 
         ('nv01', 'Nhân viên 01', 'nv', 1, 'x', now(), $1),
         ('admin', 'Admin', 'admin', 1, 'x', now(), $2)`,
      [nvId, adminId]
    );

    const service = new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      new TransactionCoordinator(db),
      new HolidaysRepository(db),
      new DayStatusRepository(db)
    );

    // 1. Tháng có đơn nghỉ có làm bù + nợ 240 phút (nửa ca duyệt 10/11)
    const hs = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-10',
      half: 'FIRST',
      reason: 'Khám bệnh',
    });
    await service.reviewRequest(hs.id, 'admin', 'APPROVE');

    // Nộp đơn nghỉ có làm bù (nghỉ 04/11, bù 2 khung 4 giờ ngày 05/11 và 06/11)
    await service.createLeaveWithMakeupRequest({
      employeeId: 'nv01',
      startDate: '2026-11-04',
      endDate: '2026-11-04',
      reason: 'Nghỉ có việc',
      slots: [
        { date: '2026-11-05', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-06', startTime: '18:00', endTime: '22:00' },
      ],
    });

    // Thử nộp OT khung 5 giờ làm ngày CN 15/11 (08:00 - 14:00, 300 phút > nợ 240 phút) -> bị từ chối kèm câu thông báo chỉ đăng ký trả nợ
    await assert.rejects(
      service.createOvertimeRequest({
        employeeId: 'nv01',
        otDate: '2026-11-15',
        startTime: '08:00',
        endTime: '14:00',
        reason: 'Làm thêm 5 tiếng',
      }),
      {
        message: 'Tháng 11 có đơn nghỉ có làm bù, chỉ đăng ký OT để trả nợ nghỉ giữa ca (còn 4 giờ)',
      }
    );

    // Nộp OT khung 4 giờ (240 phút == nợ 240 phút) -> được nhận!
    const ot1 = await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-13',
      startTime: '18:00',
      endTime: '22:00',
      reason: 'Làm thêm trả nợ',
    });
    assert.equal(ot1.status, 'PENDING');

    // Sau khi đã đăng ký đủ 240 phút nợ, nộp thêm OT 1 giờ -> bị từ chối bằng câu cũ
    await assert.rejects(
      service.createOvertimeRequest({
        employeeId: 'nv01',
        otDate: '2026-11-14',
        startTime: '18:00',
        endTime: '19:00',
        reason: 'Làm thêm nữa',
      }),
      {
        message: 'Tháng 2026-11 đã có đơn nghỉ có làm bù, không đăng ký OT được',
      }
    );
  });

  await withTempDb(t, 'half_shift_lwm_reverse', async (db, client) => {
    const nvId = '0a7c4e2e-1111-4a6b-9c1d-000000000002';
    const adminId = '0a7c4e2e-1111-4a6b-9c1d-000000000099';

    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES 
         ('nv02', 'Nhân viên 02', 'nv', 1, 'x', now(), $1),
         ('admin', 'Admin', 'admin', 1, 'x', now(), $2)`,
      [nvId, adminId]
    );

    const service = new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      new TransactionCoordinator(db),
      new HolidaysRepository(db),
      new DayStatusRepository(db)
    );

    // Nợ 240 phút (nửa ca duyệt 10/11)
    const hs = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv02',
      date: '2026-11-10',
      half: 'FIRST',
      reason: 'Khám bệnh',
    });
    await service.reviewRequest(hs.id, 'admin', 'APPROVE');

    // Đăng ký OT 4 giờ ngày 13/11 (chỉ trả nợ, không có OT thật)
    await service.createOvertimeRequest({
      employeeId: 'nv02',
      otDate: '2026-11-13',
      startTime: '18:00',
      endTime: '22:00',
      reason: 'OT trả nợ',
    });

    // Ngược lại: nộp đơn nghỉ có làm bù -> NHẬN vì không có OT thật
    const lwm = await service.createLeaveWithMakeupRequest({
      employeeId: 'nv02',
      startDate: '2026-11-17',
      endDate: '2026-11-17',
      reason: 'Nghỉ bù việc riêng',
      slots: [
        { date: '2026-11-18', startTime: '18:00', endTime: '22:00' },
        { date: '2026-11-19', startTime: '18:00', endTime: '22:00' },
      ],
    });
    assert.equal(lwm.status, 'PENDING');

    // Nếu có thêm 1 đơn OT vượt nợ -> tháng có OT thật -> nộp nghỉ có làm bù bị chặn
    // (tạo thêm nhân viên nv03 để kiểm tra nhánh bị chặn)
    const nvId3 = '0a7c4e2e-1111-4a6b-9c1d-000000000003';
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('nv03', 'Nhân viên 03', 'nv', 1, 'x', now(), $1)`,
      [nvId3]
    );

    const hs3 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv03',
      date: '2026-11-10',
      half: 'FIRST',
      reason: 'Khám bệnh',
    });
    await service.reviewRequest(hs3.id, 'admin', 'APPROVE');

    // Đăng ký 5 giờ OT ngày CN 15/11 (08:00 - 14:00, vượt nợ 240 phút -> có 1 giờ OT thật)
    await service.createOvertimeRequest({
      employeeId: 'nv03',
      otDate: '2026-11-15',
      startTime: '08:00',
      endTime: '14:00',
      reason: 'OT 5h',
    });

    // Nộp nghỉ có làm bù bị chặn vì có OT thật
    await assert.rejects(
      service.createLeaveWithMakeupRequest({
        employeeId: 'nv03',
        startDate: '2026-11-17',
        endDate: '2026-11-17',
        reason: 'Nghỉ bù việc riêng',
        slots: [
          { date: '2026-11-18', startTime: '18:00', endTime: '22:00' },
          { date: '2026-11-19', startTime: '18:00', endTime: '22:00' },
        ],
      }),
      {
        message: 'Tháng 2026-11 đã có đơn OT, không nộp đơn nghỉ có làm bù được',
      }
    );
  });
});
