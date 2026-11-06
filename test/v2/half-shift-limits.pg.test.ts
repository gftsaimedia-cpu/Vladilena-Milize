import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';

test('half-shift daily and monthly caps (T5, Review Focus 4)', async t => {
  await withTempDb(t, 'half_shift_limits', async (db, client) => {
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

    // 1. Trần ngày 12 giờ: ngày nửa ca vẫn tính ca 8 giờ
    // Ngày 12/11: nộp đơn nửa ca
    const hs = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Khám bệnh',
    });
    await service.reviewRequest(hs.id, 'admin', 'APPROVE');

    // Nộp khung OT trước ca 06:00 - 07:00 (1 giờ)
    await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-12',
      startTime: '06:00',
      endTime: '07:00',
      reason: 'OT sáng',
    });

    // Nộp khung trả nợ 3 giờ (18:00 - 21:00) ngày 12/11 -> ca 8h + 1h + 3h = 12h (vừa đúng trần)
    await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-12',
      startTime: '18:00',
      endTime: '21:00',
      reason: 'OT trả nợ',
    });

    // Nộp thêm 1 giờ OT (21:00 - 22:00) cùng ngày 12/11 -> 8h ca + 1h + 3h + 1h = 13h > 12h bị từ chối
    await assert.rejects(
      service.createOvertimeRequest({
        employeeId: 'nv01',
        otDate: '2026-11-12',
        startTime: '21:00',
        endTime: '22:00',
        reason: 'OT thêm',
      }),
      /Ngày 12\/11 vượt 12 giờ \(ca \+ OT \+ làm bù = 13 giờ\)/
    );

    // 2. Trần tháng 40 giờ: tính cả khung trả nợ
    // Đã có 4 giờ ngày 12/11. Tạo thêm các khung OT trên các ngày khác để đạt 38 giờ:
    // Thêm 8 khung 4 giờ và 1 khung 2 giờ (8 * 4 + 2 = 34h; 34h + 4h = 38h)
    const dates = [
      '2026-11-13',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-23',
      '2026-11-24',
    ];
    for (const d of dates) {
      await service.createOvertimeRequest({
        employeeId: 'nv01',
        otDate: d,
        startTime: '18:00',
        endTime: '22:00',
        reason: `OT ngày ${d}`,
      });
    }
    await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-25',
      startTime: '18:00',
      endTime: '20:00',
      reason: 'OT 2h',
    });
    // Hiện đã đăng ký 38 giờ OT (trong đó có 4h trả nợ).

    // Nộp thêm 3 giờ OT ngày 26/11 (38 + 3 = 41 > 40) -> bị từ chối
    await assert.rejects(
      service.createOvertimeRequest({
        employeeId: 'nv01',
        otDate: '2026-11-26',
        startTime: '18:00',
        endTime: '21:00',
        reason: 'OT 3h vượt trần tháng',
      }),
      /Tổng số giờ làm thêm trong tháng 2026-11 không được vượt quá 40 giờ theo Luật Lao động/
    );
  });
});
