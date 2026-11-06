/** Sự kiện phát tới các màn đang mở. Thêm loại mới thì thêm vào union và ghi vào docs/api/v2-contract.md (mục Realtime). */
export type RealtimeEvent =
  | {
      type: 'attendance.punched';
      username: string;
      name: string;
      workDate: string;
      direction: 'IN' | 'OUT';
      /** Thời điểm chấm, ISO 8601 UTC. */
      at: string;
      /** Giờ Việt Nam 'HH:mm'. */
      time: string;
      /** 'self': nhân viên tự chấm (có kiểm vùng); 'admin': quản trị chấm hộ. */
      source: 'self' | 'admin';
    }
  | { type: 'attendance.changed'; username: string; workDate: string };

export type RealtimeEventType = RealtimeEvent['type'];
