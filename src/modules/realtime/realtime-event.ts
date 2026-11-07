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
  | { type: 'attendance.changed'; username: string; workDate: string }
  /** Đơn của `username` vừa được duyệt, từ chối hoặc huỷ (kể cả Admin huỷ thay). Nhân viên đó nhận qua /realtime/me. */
  | { type: 'request.decided'; username: string; requestId: string; kind: string; status: 'APPROVED' | 'REJECTED' | 'CANCELLED' }
  /** Nhân viên (hoặc Admin nộp hộ) vừa gửi một đơn hay giải trình, đang chờ duyệt. Admin nghe để cập nhật chuông và danh sách. */
  | { type: 'request.filed'; username: string; name: string; requestId: string; kind: string; title: string }
  /** Kỳ lương `month` đổi trạng thái (chốt công, mở lại, tính lương, phê duyệt, huỷ phê duyệt, trả lương). */
  | { type: 'period.changed'; month: string; state: string }
  /** Hồ sơ nhân sự vừa được thêm, sửa hay cho nghỉ việc (kể cả khoá tài khoản, đổi ca, đổi phòng ban). */
  | { type: 'staff.changed'; username: string; change: 'created' | 'updated' | 'ended' }
  /** Phiếu lương tháng `month` của `username` vừa được duyệt hoặc từ chối. */
  | { type: 'payslip.decided'; username: string; month: string; status: 'approved' | 'rejected' };

export type RealtimeEventType = RealtimeEvent['type'];
