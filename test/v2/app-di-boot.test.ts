import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { HolidaysService } from '../../src/modules/holidays/holidays.service';
import { MeController } from '../../src/modules/me/me.controller';
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

    assert.ok((periods as any).settings instanceof SettingsReader, 'PeriodsService đọc ngày trả lương từ kho cài đặt');
    assert.equal((payroll as any).periods, periods);
    assert.equal((app.get(AttendanceService) as any).periodGate, gate);
    assert.equal((app.get(HolidaysService) as any).periodGate, gate);
  } finally {
    await app.close();
  }
});
