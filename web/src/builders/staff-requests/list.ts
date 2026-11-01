// Danh sách yêu cầu của tôi dựng từ GET /sheet: approvals (mục, trạng thái, ghi chú) và days (giờ đã khai), cùng số phép năm.
import { STATUS_VIEW, titleOf } from './catalog';

const RANK = { pending: 0, rejected: 1, approved: 2 };

/** Khoảng giờ đã khai của một dòng: đoạn trước ca (giờ vào làm thêm – giờ vào), đoạn sau ca (giờ ra – giờ ra làm thêm); ngày lễ: giờ vào – giờ ra. */
export function rangeOf(approval?, day?) {
  if (!day || !day.in || !day.out) return '';
  if (approval.holiday) return `${day.in}–${day.out}`;
  if (approval.item !== 'ot' && approval.item !== 'makeup_hours') return '';
  const parts: any[] = [];
  if (day.extraIn && day.extraIn !== day.in) parts.push(`${day.extraIn}–${day.in}`);
  if (day.extraOut && day.extraOut !== day.out) parts.push(`${day.out}–${day.extraOut}`);
  return parts.join(' · ');
}

/** Chờ xử lý, bị từ chối, đã đồng ý; trong mỗi nhóm ngày mới trước. */
export function buildItems(sheet?) {
  const approvals = (sheet && sheet.approvals) || {};
  const days = (sheet && sheet.days) || {};
  return Object.entries(approvals)
    .filter(([, a]: any) => a)
    .map(([date, a]: any) => {
      const view = STATUS_VIEW[a.status] || STATUS_VIEW.pending;
      return {
        id: date,
        date,
        item: a.item,
        title: titleOf(a),
        range: rangeOf(a, days[date]),
        status: view.status,
        statusLabel: view.label,
        desktopLabel: view.desktopLabel,
        reason: a.status === 'rejected' ? a.note || '' : '',
        canCancel: a.status === 'pending',
        rank: RANK[a.status] ?? 3
      };
    })
    .sort((x: any, y: any) => x.rank - y.rank || y.date.localeCompare(x.date))
    .map(({ rank: _rank, ...item }: any) => item);
}

/** Phép năm của GET /sheet (leaveBalance); null khi chức vụ không có tài khoản phép. */
export function buildBalance(leaveBalance?) {
  if (!leaveBalance || !Number.isFinite(leaveBalance.remaining)) return null;
  return { left: leaveBalance.remaining, granted: leaveBalance.accrued, used: leaveBalance.used };
}

// Màn Yêu cầu của điện thoại
export function buildPhoneRequests({ month, today, sheet }: any) {
  const balance = buildBalance(sheet.leaveBalance);
  return {
    month,
    asOf: sheet.leaveBalance ? sheet.leaveBalance.asOf : today,
    leaveLeft: balance ? balance.left : null,
    balance,
    items: buildItems(sheet),
    presets: {
      'xin-nghi': { date: today, type: 'phep-nam' },
      'khai-ot': { date: today, type: 'di-lam' },
      'ngay-khac': { date: today, type: 'lam-bu' }
    }
  };
}

// Khối Yêu cầu của máy tính; preset của nút mở hộp gửi yêu cầu với loại ngày chọn sẵn
export function buildDesktopRequests({ month, today, sheet }: any) {
  const items = buildItems(sheet).map(i => ({
    id: i.id,
    date: i.date,
    canCancel: i.canCancel,
    day: i.date.slice(8, 10),
    mon: `/${i.date.slice(5, 7)}`,
    title: i.title,
    sub: [i.range, i.reason ? `Lý do: ${i.reason}` : ''].filter(Boolean).join(' · '),
    pill: {
      text: i.desktopLabel,
      cls: i.status === 'done' ? 'p-done' : i.status === 'err' ? 'p-err' : 'p-pend'
    }
  }));
  return {
    cap: '',
    actions: [
      { icon: 'cal', label: 'Xin nghỉ phép năm', preset: { date: today, type: 'phep-nam' } },
      { icon: 'clock', label: 'Khai OT hoặc làm bù', preset: { date: today, type: 'di-lam' } },
      { icon: 'edit', label: 'Khai một ngày khác', preset: { date: today, type: 'lam-bu' } },
      { icon: 'cash', label: 'Xin tạm ứng', dialog: 'advance' }
    ],
    items,
    empty: items.length
      ? null
      : {
          title: `Chưa có yêu cầu nào trong tháng ${Number(month.slice(5, 7))}`,
          text: 'Yêu cầu bạn gửi sẽ hiện ở đây cùng trạng thái xử lý.'
        }
  };
}
