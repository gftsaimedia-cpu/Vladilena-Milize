import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { TransactionCoordinator } from '../../src/database';
import { AttendanceDaysJob } from '../../src/modules/attendance/attendance-days.job';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { AttendanceSettingsListener } from '../../src/modules/attendance/attendance-settings.listener';
import { AttendanceSettingsPort, SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { SettingsChanges } from '../../src/modules/settings';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { HolidaysService } from '../../src/modules/holidays/holidays.service';
import { MeController } from '../../src/modules/me/me.controller';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';

// Dựng cả AppModule như lúc chạy thật để bắt lỗi nối phụ thuộc. Các phụ thuộc `@Optional()` (cổng kỳ, PayrollService,
// ExplanationsService, kho cài đặt của kỳ lương) mà thiếu provider sẽ rơi thành `undefined` trong im lặng (unit test dùng
// fake không thấy), nên test này khẳng định chúng đều có thật và đúng lớp. Không cần DB: pool pg tạo lười, chưa mở kết
// nối nào; địa chỉ giả bên dưới chặn việc vô tình đụng DB thật.
test('AppModule nối đủ phụ thuộc tuỳ chọn của đơn từ và kỳ lương', async () => {
  process.env.DATABASE_URL = 'postgres://dummy:dummy@127.0.0.1:1/dummy';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const gate = app.get(PeriodGate);
    const periods = app.get(PeriodsService);
    const payroll = app.get(PayrollService);
    assert.ok(gate instanceof PeriodGate, 'PeriodGate phải có');
    assert.ok(periods instanceof PeriodsService, 'PeriodsService phải có');

    const service = app.get(RequestsService) as any;
    assert.equal(service.periods, undefined, 'RequestsService không còn đọc kỳ qua SystemService');
    assert.ok(service.periodGate instanceof PeriodGate, 'periodGate phải là PeriodGate');
    assert.equal(service.periodGate, gate);
    assert.ok(service.payroll instanceof PayrollService, 'payroll phải là PayrollService');
    assert.ok(service.explanations instanceof ExplanationsService, 'explanations phải là ExplanationsService');

    const explanations = app.get(ExplanationsService) as any;
    assert.equal(service.explanations, explanations);
    assert.equal(explanations.periods, undefined, 'ExplanationsService không còn đọc kỳ qua SystemService');
    assert.equal(explanations.periodGate, gate, 'ExplanationsService đọc kỳ qua cổng kỳ');
    assert.equal((app.get(RequestsController) as any).explanations, explanations);

    const me = app.get(MeController) as any;
    assert.equal(me.explanations, explanations);
    assert.equal(me.requests, service);
    assert.equal(me.system, undefined, 'MeController không còn đọc kỳ qua SystemService');
    assert.equal(me.periods, periods, 'MeController đọc kỳ qua PeriodsService');

    // Ghi lại dòng ngày công khi đổi ngày lễ / ngày vào làm: thiếu nối dây thì hai service này bỏ qua im lặng.
    const days = app.get(AttendanceDaysService);
    const holidays = app.get(HolidaysService) as any;
    assert.equal(holidays.attendanceDays, days);
    assert.equal(holidays.periodGate, gate, 'HolidaysService chặn tháng đã chốt qua cổng kỳ');
    assert.equal((app.get(EmployeesService) as any).attendanceDays, days);

    // Sau khi gộp settings-store: tham số cài đặt và tham số ghi dòng ngày nằm đúng chỗ trong hàm dựng.
    const settings = app.get(SettingsReader);
    assert.equal(service.attendanceDays, days, 'RequestsService.attendanceDays phải là AttendanceDaysService');
    assert.equal(service.settings, settings, 'RequestsService.settings phải là SettingsReader');
    assert.ok(service.audit instanceof AuditLog, 'RequestsService.audit phải là AuditLog');
    assert.equal((explanations as any).settings, settings);
    const attendance = app.get(AttendanceService) as any;
    assert.equal(attendance.repo, app.get(AttendanceRepository));
    assert.equal(attendance.days, days);
    assert.equal(attendance.settings, settings);
    assert.equal(attendance.txCoordinator, app.get(TransactionCoordinator));
    assert.equal(attendance.periodGate, gate, 'AttendanceService chặn tháng đã chốt qua cổng kỳ');
    assert.equal(me.settings, settings);

    // Cổng cài đặt của chấm công đọc kho cài đặt; người nghe thay đổi cài đặt đã đăng ký (đúng một, dùng chung SettingsChanges).
    const port = app.get(AttendanceSettingsPort);
    assert.ok(port instanceof SettingsAttendanceSettings, 'cổng cài đặt phải là SettingsAttendanceSettings');
    assert.equal((port as any).reader, settings);
    assert.equal((days as any).settings, port);
    const changes = app.get(SettingsChanges);
    const listener = app.get(AttendanceSettingsListener) as any;
    assert.equal(listener.changes, changes);
    assert.equal(listener.days, days);
    assert.equal(listener.repo, app.get(AttendanceDaysRepository));
    assert.equal(changes.size, 1, 'AttendanceSettingsListener phải đã đăng ký với SettingsChanges');
    const settingsService = app.get(SettingsService) as any;
    assert.equal(settingsService.changes, changes);
    assert.ok(settingsService.audit instanceof AuditLog, 'SettingsService.audit phải là AuditLog');

    // Lương ghi lại và đọc dòng ngày (T6) và đi theo vòng đời kỳ lương: đủ cả năm tham số, đúng chỗ, không cái nào rơi
    // thành undefined.
    assert.ok((periods as any).settings instanceof SettingsReader, 'PeriodsService đọc ngày trả lương từ kho cài đặt');
    assert.equal(service.payroll, payroll);
    assert.equal((payroll as any).repo, app.get(PayrollRepository), 'PayrollService.repo phải là PayrollRepository');
    assert.equal((payroll as any).days, days, 'PayrollService.days phải là AttendanceDaysService');
    assert.equal((payroll as any).settings, settings, 'PayrollService.settings phải là SettingsReader');
    assert.equal((payroll as any).txCoordinator, app.get(TransactionCoordinator));
    assert.equal((payroll as any).periods, periods, 'PayrollService.periods phải là PeriodsService');

    // Job mỗi giờ: tsx không phát metadata tham số, thiếu @Inject thì phụ thuộc rơi thành undefined.
    const job = app.get(AttendanceDaysJob) as any;
    assert.equal(job.repo, app.get(AttendanceDaysRepository));
    assert.equal(job.days, days);
    assert.equal(job.coordinator, app.get(TransactionCoordinator));
  } finally {
    await app.close();
  }
});
