import { useSessionStore } from '@/stores/session';
import { countWaiting } from '@/builders/admin-requests/explanations';
import { listWaitingExplanations } from './admin-explanations';
import { api, qs } from './http';

// Tháng (YYYY-MM, giờ Việt Nam) theo đồng hồ máy chủ trong GET /me; thiếu thì theo đồng hồ trình duyệt.
function serverMonth(session?) {
  const ms = Date.parse(session.serverNow);
  return new Date((Number.isFinite(ms) ? ms : Date.now()) + 7 * 3600000).toISOString().slice(0, 7);
}

// Vỏ Admin: người đăng nhập từ phiên (GET /me); counts.requests = số yêu cầu chờ duyệt (GET /approvals/count);
// bell = yêu cầu chờ duyệt + giải trình chờ xử lý + lượt quên Check-in/out của tháng (GET /alerts, GET /explanations).
// Giải trình chờ Admin cộng vào số của mục Yêu cầu. Số đếm lỗi thì hiện 0, không chặn vỏ.
export async function getShell(month?) {
  const session = useSessionStore();
  const [count, alerts, waiting] = await Promise.all([
    api('GET', '/approvals/count').catch(() => null),
    api('GET', '/alerts' + qs({ month: month || serverMonth(session) })).catch(() => null),
    listWaitingExplanations()
  ]);
  const explained = countWaiting(waiting);
  const pending = count ? count.pending : alerts ? alerts.pendingApprovals : 0;
  const missing = alerts && Array.isArray(alerts.missingPunches) ? alerts.missingPunches.length : 0;
  return {
    me: session.shellMe,
    counts: { requests: (pending || 0) + explained },
    bell: (pending || 0) + explained + missing
  };
}
