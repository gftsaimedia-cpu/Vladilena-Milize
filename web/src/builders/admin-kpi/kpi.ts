// Đổi phản hồi GET /api/kpi/scores (và nhật ký GET /api/audit?action=kpi.score) sang hình dạng màn Đánh giá KPI.
// Tổng điểm, kết quả (Đạt / Chưa đạt) và mức KPI là số máy chủ trả; ở đây chỉ chọn nhãn, lọc, tìm và chia trang.
const PAGE_SIZE = 20;
const TYPE_LABEL = { nv: 'NV', ctv: 'CTV', tts: 'TTS' };

/** Thứ tự cột điểm của màn, khớp scores[0..4]. */
export const KPI_KEYS = ['wework', 'user', 'peer', 'manager', 'self'];
const LABELS = {
  wework: { label: 'Base Wework' },
  user: { label: 'Người dùng' },
  peer: { label: 'Đồng nghiệp' },
  manager: { label: 'Quản lý trực tiếp', short: 'Quản lý' },
  self: { label: 'Tự đánh giá' }
};

const fold = (s?) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const FILTERS = {
  all: () => true,
  incomplete: (i?) => i.complete === false,
  'base-thap': (i?) => i.reason === 'wework',
  'tong-thap': (i?) => i.reason === 'below-pass',
  dat: (i?) => i.pass === true
};

function resultOf(i?) {
  if (i.pass === true) return { cls: 'p-done', label: 'Đạt' };
  if (i.reason === 'wework' || i.reason === 'below-pass') return { cls: 'p-err', label: 'Chưa đạt' };
  return i.complete ? { cls: 'p-draft', label: 'Đã chấm đủ' } : null;
}

/** Một dòng bảng nhập điểm từ một mục của máy chủ. */
export function buildKpiRow(i?) {
  return {
    id: i.username,
    name: i.name || i.username,
    sub: `${TYPE_LABEL[i.type] || String(i.type || '').toUpperCase()} · Bậc ${i.level}`,
    scores: KPI_KEYS.map(k => (i.scores && i.scores[k] != null ? i.scores[k] : null)),
    max: i.kpiMax,
    total: i.total == null ? null : i.total,
    result: resultOf(i),
    bonus: i.amtApproved ?? i.amtProposed ?? null
  };
}

/** Phần đầu trang: số người đạt, chưa chấm đủ, chưa đạt, tổng mức KPI và trọng số 5 thành phần. */
export function buildKpiSummary(raw?) {
  const items = raw.items || [];
  const wework = items.filter(FILTERS['base-thap']).length;
  const below = items.filter(FILTERS['tong-thap']).length;
  const note = [wework && `${wework} có Base Wework dưới ngưỡng`, below && `${below} có tổng điểm chưa đạt`]
    .filter(Boolean)
    .join(' · ');
  return {
    month: raw.month,
    empty: !items.length,
    passed: items.filter(FILTERS.dat).length,
    incomplete: items.filter(FILTERS.incomplete).length,
    failed: wework + below,
    failedNote: note,
    salaryTotal: items.reduce((s, i) => s + (i.amtApproved ?? i.amtProposed ?? 0), 0),
    salaryNote: '',
    weights: KPI_KEYS.map(k => ({ key: k, ...LABELS[k], pct: (raw.weights || {})[k], note: '' })),
    tabs: { scores: items.length, history: null }
  };
}

/** Bảng nhập điểm: lọc, tìm theo tên, chia 20 dòng mỗi trang. */
export function buildKpiRows(raw?, { filter = 'all', q = '', page = 1 }: any = {}) {
  const items = (raw.items || []).slice().sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'vi'));
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, f]: any) => [k, items.filter(f).length]));
  const list = items.filter(i => (FILTERS[filter] || FILTERS.all)(i) && (!q || fold(i.name).includes(fold(q))));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const at = Math.min(Math.max(1, page), pages);
  return {
    empty: !items.length,
    counts,
    rows: list.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE).map(buildKpiRow),
    total: list.length,
    page: at,
    pages
  };
}

// 'YYYY-MM-DDTHH:mm' theo giờ Việt Nam từ thời điểm UTC của nhật ký
const vnTime = (at?) => new Date(new Date(at).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 16);

/** Lịch sử sửa điểm: mỗi người một dòng (lần sửa gần nhất). audit: GET /audit?action=kpi.score; raw: GET /kpi/scores. */
export function buildKpiHistory(audit?, raw?) {
  const people = new Map<any, any>((raw.items || []).map(i => [i.username, i]));
  const latest = new Map<any, any>();
  for (const r of (audit && audit.rows) || []) {
    if (r.action !== 'kpi.score' || !r.subject) continue;
    const prev = latest.get(r.subject);
    if (!prev || String(r.at) > String(prev.at) || (r.at === prev.at && r.id > prev.id)) latest.set(r.subject, r);
  }
  const rows = [...latest.values()]
    .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)) || b.id - a.id)
    .map(r => {
      const p = people.get(r.subject);
      return {
        id: String(r.id),
        at: vnTime(r.at),
        name: p ? p.name : r.subject,
        sub: p ? `${TYPE_LABEL[p.type] || String(p.type || '').toUpperCase()} · Bậc ${p.level}` : '',
        by: { name: r.actor, username: r.actor }
      };
    });
  return { rows };
}
