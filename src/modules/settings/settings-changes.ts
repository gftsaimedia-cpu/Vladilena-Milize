// Kênh báo "cài đặt vừa đổi" cho module khác (vd. chấm công ghi lại dòng ngày). Đi theo hướng ngược lại với
// SettingsReader để SettingsModule không phải import module nào: bên cần biết tự đăng ký người nghe lúc khởi động.
import { Injectable } from '@nestjs/common';

/** Một thay đổi cài đặt đã commit; `fromMonth` là tháng bắt đầu hiệu lực, `now` là thời điểm lưu. */
export type SettingsChange =
  | { kind: 'workWeek'; employeeUuid: string; fromMonth: string; now: Date }
  | { kind: 'attendance'; fromMonth: string; now: Date };

export type SettingsChangeListener = (change: SettingsChange) => Promise<void>;

@Injectable()
export class SettingsChanges {
  private readonly listeners: SettingsChangeListener[] = [];

  subscribe(listener: SettingsChangeListener): void {
    this.listeners.push(listener);
  }

  /** Gọi lần lượt từng người nghe theo thứ tự đăng ký; người nghe lỗi thì lỗi đi thẳng ra cho nơi gọi. */
  async notify(change: SettingsChange): Promise<void> {
    for (const listener of this.listeners) await listener(change);
  }

  /** Số người nghe đã đăng ký (để test nối dây). */
  get size(): number {
    return this.listeners.length;
  }
}
