// Hàm thuần đổi số sang chữ cho bản in phiếu lương A4: không tính tiền, chỉ định dạng.
import type { A4Qty, A4Sheet, A4Stats } from '@/mock/payslip-a4';
import { kindLevelText } from '@/constants/labels';
import { dm, dmy, monthShort, num, vnd, vndSigned } from '@/utils/format';

/** null hoặc 0 → ô trống; còn lại là số giờ/ngày */
export const blankNum = (n: number | null | undefined): string => (n == null || n === 0 ? '' : num(n));

/** null hoặc 0 → ô trống; còn lại có dấu +/− */
export const signedText = (n: number | null): string => (n == null || n === 0 ? '' : vndSigned(n));

/** "08:00–17:00"; thiếu một đầu thì in đầu còn lại; thiếu cả hai thì trống */
export const inOutText = (a: string | null, b: string | null): string => (a && b ? `${a}–${b}` : (a ?? b ?? ''));

/** ô Số lượng: "19/26 ngày", "85,6%", "4 giờ" */
export const qtyText = (q?: A4Qty): string => {
  if (!q) return '';
  if (q.of != null) return `${num(q.n)}/${q.of} ${q.unit}`;
  return q.unit === '%' ? `${num(q.n)}%` : `${num(q.n)} ${q.unit}`;
};

/** ô Theo quy chế: không có thì trống */
export const ruleText = (n?: number): string => (n == null ? '' : vnd(n));

/** ô Thực tế: null giữ nguyên (nơi gọi in "BE tính"); số âm có dấu − */
export const actualText = (n: number | null): string | null => (n == null ? null : n < 0 ? vndSigned(n) : vnd(n));

/** điểm KPI: chưa có thì "—" */
export const scoreText = (n: number | null): string => (n == null ? '—' : `${n}%`);

// D11 (06/11): bản in không ghi trạng thái phiếu nào (nháp, chờ duyệt, đã duyệt, bị từ chối, đã trả), kể cả "chính thức" /
// "tạm tính" ở tiêu đề hay ghi chú tạm tính ở dòng phụ.

/** tiêu đề trang 1 */
export const titleLine = (s: A4Sheet): string => `Phiếu lương tháng ${monthShort(s.month)}`;

/** dòng phụ của trang 1 */
export const periodLine = (s: A4Sheet): string =>
  `Từ ${dm(s.from)} đến ${dmy(s.to)} · công chuẩn theo quy chế: ${s.stdDays} ngày`;

/** dòng xám ở đầu trang 2 */
export const staffLine = (s: A4Sheet): string =>
  `${kindLevelText(s.kind, s.level)} · ${s.contract} · từ ${dm(s.from)} đến ${dmy(s.to)}`;

/** "3 ngày"; số chưa có nguồn (null) → "—" */
const amount = (n: number | null, unit: string): string => (n == null ? '—' : `${num(n)} ${unit}`);

/** dải tổng hợp của trang 1: 10 cặp nhãn – giá trị */
export const statCells = (st: A4Stats): [string, string][] => [
  ['Ngày công', amount(st.workDays, 'ngày')],
  ['Ca Flex · Night', `${num(st.flex)} · ${num(st.night)} ca`],
  ['Nghỉ có lương', amount(st.paidLeave, 'ngày')],
  ['iSAT', amount(st.isat, 'ngày')],
  ['Không lương, BHXH', amount(st.unpaid, 'ngày')],
  ['Vắng', amount(st.absent, 'ngày')],
  ['Chờ giải trình', amount(st.pending, 'ngày')],
  ['OT', amount(st.otHours, 'giờ')],
  ['Làm bù', amount(st.makeupHours, 'giờ')],
  ['Trừ giờ đi muộn', amount(st.lateHours, 'giờ')]
];
