/** Xoá một ngày không có trong lịch lễ. Controller trả 404 với code HOLIDAY_NOT_FOUND. */
export class HolidayNotFoundError extends Error {
  constructor(date: string) {
    super(`Không có ngày lễ ${date}`);
    this.name = 'HolidayNotFoundError';
  }
}
