/** Số gửi lên sai luật (400 BAD_REQUEST); field là đường dẫn tới ô sai, vd. items[0].changes.flexPct. */
export class PositionInputError extends Error {
  constructor(
    message: string,
    readonly field: string
  ) {
    super(message);
    this.name = 'PositionInputError';
  }
}

/** Chức vụ chưa có phiên bản nào có hiệu lực ở tháng áp dụng (404 POSITION_NOT_FOUND). */
export class PositionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PositionNotFoundError';
  }
}

/** Bậc chưa có phiên bản nào có hiệu lực ở tháng áp dụng (404 LEVEL_NOT_FOUND). */
export class LevelNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelNotFoundError';
  }
}

/** Chức vụ vừa được người khác lưu: rev đã đổi (409 POSITION_STALE). */
export class PositionStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PositionStaleError';
  }
}

/** Bậc vừa được người khác lưu, hoặc số bậc thêm không còn là bậc kế tiếp (409 LEVEL_STALE). */
export class LevelStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelStaleError';
  }
}
