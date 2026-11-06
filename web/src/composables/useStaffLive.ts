// Màn nhân viên tự cập nhật khi Admin đổi gì đó của mình (duyệt/từ chối/huỷ đơn, sửa công, duyệt phiếu lương, chấm hộ).
// `refresh` là hàm tải êm (useLoad().refresh): không bật "Đang tải", lỗi thì giữ màn đang hiện.
import { useRealtimeReload } from './useRealtimeReload';
import { useSessionStore } from '@/stores/session';

type Kind = 'attendance.punched' | 'attendance.changed' | 'request.decided' | 'payslip.decided';

export function useStaffLive(refresh: () => unknown, types: Kind[] = ['attendance.punched', 'attendance.changed', 'request.decided', 'payslip.decided']) {
  const session = useSessionStore();
  return useRealtimeReload(refresh, {
    types,
    // Chỉ sự kiện của chính mình (luồng admin gửi cả của người khác).
    filter: e => !e.username || e.username === (session.user as { username?: string } | null)?.username
  });
}
