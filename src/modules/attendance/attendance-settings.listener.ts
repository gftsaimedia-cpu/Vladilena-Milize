import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { businessMonthText } from '../../common/business-date';
import { SettingsChanges, type SettingsChange } from '../settings';
import { AttendanceDaysRepository } from './attendance-days.repository';
import { AttendanceDaysService } from './attendance-days.service';
import { datesOfMonth, monthsBetween } from './domain/calendar';

/**
 * Nghe thay đổi cài đặt (spec 9.2) và ghi lại các dòng ngày công bị ảnh hưởng, từ tháng áp dụng tới tháng hiện tại:
 * đổi tuần làm riêng thì chỉ người đó; đổi nhóm chấm công (ân hạn) thì mọi người đang làm (P6).
 * Mỗi nhân sự là một giao dịch riêng dưới khoá của mình cho mọi tháng, như P4 (`refreshMany` gộp truy vấn, không hỏi lại từng người từng tháng). Lỗi đi thẳng ra cho nơi lưu cài đặt:
 * cài đặt đã được lưu, Admin tính lại ngày công sau.
 */
@Injectable()
export class AttendanceSettingsListener implements OnModuleInit {
  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, nên Nest không tự suy ra được.
  constructor(
    @Inject(SettingsChanges) private readonly changes: SettingsChanges,
    @Inject(AttendanceDaysService) private readonly days: AttendanceDaysService,
    @Inject(AttendanceDaysRepository) private readonly repo: AttendanceDaysRepository
  ) {}

  onModuleInit(): void {
    this.changes.subscribe(change => this.handle(change));
  }

  async handle(change: SettingsChange): Promise<void> {
    const currentMonth = businessMonthText(change.now);
    // Tháng tương lai chưa có dòng nào để ghi lại; dòng sẽ được dựng theo cài đặt mới khi tới ngày.
    if (change.fromMonth > currentMonth) return;
    const months = monthsBetween(change.fromMonth, currentMonth);

    if (change.kind === 'workWeek') {
      await this.days.refreshMany([change.employeeUuid], months, { now: change.now });
      return;
    }

    const lastMonthDates = datesOfMonth(currentMonth);
    const ids = await this.repo.activeEmployeeIds(`${change.fromMonth}-01`, lastMonthDates[lastMonthDates.length - 1]);
    await this.days.refreshMany(ids, months, { now: change.now });
  }
}
