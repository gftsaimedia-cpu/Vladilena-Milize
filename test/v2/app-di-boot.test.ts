import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { TransactionCoordinator } from '../../src/database';
import { AttendanceDaysJob } from '../../src/modules/attendance/attendance-days.job';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { SettingsReader } from '../../src/modules/settings';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { HolidaysService } from '../../src/modules/holidays/holidays.service';
import { MeController } from '../../src/modules/me/me.controller';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SystemService } from '../../src/modules/system/system.service';

// Dựng cả AppModule như lúc chạy thật để bắt lỗi nối phụ thuộc. Các phụ thuộc `@Optional()` của RequestsService mà
// thiếu provider sẽ rơi thành `undefined` trong im lặng (unit test dùng fake không thấy), nên test này khẳng định chúng
// đều có thật. Không cần DB: pool pg tạo lười, chưa mở kết nối nào; địa chỉ giả bên dưới chặn việc vô tình đụng DB thật.
test('AppModule nối đủ phụ thuộc tuỳ chọn của đơn từ', async () => {
  process.env.DATABASE_URL = 'postgres://dummy:dummy@127.0.0.1:1/dummy';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const service = app.get(RequestsService) as any;
    assert.ok(service.periods instanceof SystemService, 'periods phải là SystemService');
    assert.ok(service.payroll instanceof PayrollService, 'payroll phải là PayrollService');
    assert.ok(service.explanations instanceof ExplanationsService, 'explanations phải là ExplanationsService');

    const explanations = app.get(ExplanationsService);
    assert.equal(service.explanations, explanations);
    assert.equal((app.get(RequestsController) as any).explanations, explanations);
    const me = app.get(MeController) as any;
    assert.equal(me.explanations, explanations);
    assert.equal(me.requests, service);

    // Ghi lại dòng ngày công khi đổi ngày lễ / ngày vào làm: thiếu nối dây thì hai service này bỏ qua im lặng.
    const days = app.get(AttendanceDaysService);
    assert.equal((app.get(HolidaysService) as any).attendanceDays, days);
    assert.equal((app.get(EmployeesService) as any).attendanceDays, days);

    // Sau khi gộp settings-store: tham số cài đặt và tham số ghi dòng ngày nằm đúng chỗ trong hàm dựng.
    const settings = app.get(SettingsReader);
    assert.equal(service.attendanceDays, days, 'RequestsService.attendanceDays phải là AttendanceDaysService');
    assert.equal(service.settings, settings, 'RequestsService.settings phải là SettingsReader');
    assert.equal((explanations as any).settings, settings);
    const attendance = app.get(AttendanceService) as any;
    assert.equal(attendance.repo, app.get(AttendanceRepository));
    assert.equal(attendance.days, days);
    assert.equal(attendance.settings, settings);
    assert.equal(attendance.txCoordinator, app.get(TransactionCoordinator));
    assert.equal(me.settings, settings);

    // Job mỗi giờ: tsx không phát metadata tham số, thiếu @Inject thì phụ thuộc rơi thành undefined.
    const job = app.get(AttendanceDaysJob) as any;
    assert.equal(job.repo, app.get(AttendanceDaysRepository));
    assert.equal(job.days, days);
    assert.equal(job.coordinator, app.get(TransactionCoordinator));
  } finally {
    await app.close();
  }
});
