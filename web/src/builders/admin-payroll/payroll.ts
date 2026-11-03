// Đổi phản hồi máy chủ (kỳ lương + danh sách phiếu) sang hình dạng màn Bảng lương đang đọc.
// Mọi số tiền là số máy chủ trả; ở đây chỉ chọn nhãn, chip lọc và giai đoạn của màn.

const TYPE_LABEL = { nv: 'NV', ctv: 'CTV', tts: 'TTS' };
const FINAL = ['approved', 'paid'];

const two = (n?) => String(n).padStart(2, '0');
// 'HH:mm dd/mm' theo giờ Việt Nam
function stamp(at?) {
  if (!at) return '';
  const d = new Date(new Date(at).getTime() + 7 * 3600 * 1000);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}`;
}
const dayOf = (at?) => (at ? new Date(new Date(at).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : '');

// Giai đoạn của màn: chọn kịch bản giao diện theo trạng thái kỳ và số phiếu đã duyệt
function stageOf(period?) {
  const { status, totals } = period;
  if (status === 'open') return 'tam-tinh';
  if (status === 'attendance_locked') return 'da-chot-cong';
  if (status === 'approved') return 'da-phe-duyet';
  if (status === 'paid') return 'da-tra-luong';
  if (period.needsRecalculate || period.stale) return 'can-tinh-lai';
  return totals && totals.approved > 0 ? 'da-duyet-50' : 'cho-phe-duyet';
}

const STEP_LABELS = ['Chấm công', 'Chốt công', 'Tính lương', 'Phê duyệt', 'Trả lương'];
const RANK = { open: 1, attendance_locked: 2, calculated: 3, reviewed: 4, approved: 5, paid: 6 };

function stripOf(month?, period?, facts?) {
  const labels = STEP_LABELS;
  let cur = RANK[period.status] ?? 1;
  if (cur >= 4) cur -= 1;
  const notes: Record<string, any> = {};
  const approvalIdx = labels.indexOf('Phê duyệt');
  if (period.status === 'calculated' || period.status === 'reviewed')
    notes[approvalIdx] = `${facts.approved}/${facts.total}`;
  const state =
    {
      open: 'Chưa tính lương',
      attendance_locked: 'Đã chốt công',
      calculated: 'Bản nháp',
      reviewed: 'Chờ phê duyệt',
      approved: 'Đã phê duyệt',
      paid: 'Đã trả lương'
    }[period.status] || '';
  const stateCls = FINAL.includes(period.status)
    ? 'ok'
    : period.status === 'calculated' || period.status === 'reviewed'
      ? 'draft'
      : '';
  return {
    month: `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`,
    state: period.needsRecalculate ? `${state} · cần tính lại` : state,
    stateCls,
    steps: labels.map((label, i) =>
      [i < cur ? 'done' : i === cur ? 'cur' : '', label, notes[i]].filter(x => x !== undefined)
    )
  };
}

function chipsOf(stage?, facts?) {
  const all = ['all', 'Tất cả', facts.total];
  const err = ['err', 'Chưa tính được', facts.failed];
  if (stage === 'ban-nhap') return [all, ['draft', 'Bản nháp', facts.calculated], err];
  if (['cho-phe-duyet', 'da-duyet-50', 'can-tinh-lai'].includes(stage)) {
    return [all, ['pending', 'Chờ phê duyệt', facts.unapproved], err, ['approved', 'Đã phê duyệt', facts.approved]];
  }
  if (stage === 'da-phe-duyet' || stage === 'da-tra-luong') {
    return [all, ['approved', 'Đã phê duyệt', facts.approved], ['excluded', 'Loại khỏi kỳ', facts.failed]];
  }
  return [all, err, ['tts', 'Thực tập sinh', null], ['ctv', 'Chuyên trách viên', null], ['nv', 'Nhân viên', null]];
}

const otherOf = (r?) =>
  [r.gross, r.tienNgayCong, r.phuCap, r.ot, r.kpi].every(Number.isFinite)
    ? r.gross - r.tienNgayCong - r.phuCap - r.ot - r.kpi
    : r.khac;

export function buildRow(r?) {
  const failed = r.status === 'error';
  return {
    username: r.username,
    name: r.name || r.username,
    sub: `${TYPE_LABEL[r.type] || String(r.type || '').toUpperCase()} · Bậc ${r.level}`,
    kind: r.type,
    workdays: r.daysWorked,
    income: r.gross,
    insurance: r.insurance,
    tax: r.tax,
    advance: r.advance,
    net: r.net,
    // Khác = Tổng thu nhập trừ bốn cột còn lại, nên các cột cộng đúng Tổng thu nhập kể cả khi có khoản thêm hay số Admin đã sửa
    detail: { base: r.tienNgayCong, allowance: r.phuCap, allowanceNote: '', ot: r.ot, kpi: r.kpi, other: otherOf(r) },
    status: failed
      ? 'failed'
      : r.status === 'draft' || r.status === 'pending'
        ? 'pending'
        : r.status === 'approved'
          ? 'approved'
          : 'calculated',
    shortProblem: r.errorMessage || r.problem || 'Hồ sơ hoặc công chưa hợp lệ'
  };
}

/** Bảng lương một kỳ. period: GET /periods/:month; list: GET /periods/:month/(payslips|estimates). */
export function buildPeriodView(month, period, list, { filter, pageSize }: any) {
  const t = period.totals ||
    list.totals || {
      people: list.total,
      gross: 0,
      insurance: 0,
      tax: 0,
      advance: 0,
      net: 0,
      approved: 0,
      pending: 0,
      draft: 0,
      error: 0
    };
  const stage = stageOf(period);
  const rows = (list.rows || []).map(buildRow);
  const final = FINAL.includes(period.status);
  const facts: Record<string, any> = {
    total: t.people,
    calculated: t.people - t.error,
    failed: t.error,
    draft: t.draft || 0,
    pending: t.pending || 0,
    unapproved: (t.pending || 0) + (t.draft || 0),
    approved: t.approved,
    run: period.run ? period.run.runNo : 0,
    deadline: '',
    closedAt: stamp(period.stages.attendanceLocked.at),
    approvedAt: stamp(period.stages.approved.at),
    paidDate: dayOf(period.stages.paid.at),
    selectable: Math.max(0, (t.pending || 0) + (t.draft || 0)),
    selectedOtherNames: [],
    selectedOtherMore: 0
  };
  const filtered = filter !== 'all';
  const total = list.total;
  const page = list.page || 1;
  const from = rows.length ? (page - 1) * pageSize + 1 : 0;
  return {
    month,
    kb: stage,
    wide: false,
    strip: stripOf(month, period, facts),
    facts,
    formula: {
      income: t.gross,
      insurance: t.insurance,
      tax: t.tax,
      advance: t.advance,
      net: t.net,
      notes: { income: '', insurance: '', tax: '', advance: '', net: '' },
      locked: final
    },
    chips: chipsOf(stage, facts),
    rows,
    failed: rows.filter(r => r.status === 'failed'),
    paging: {
      from,
      to: from ? from + rows.length - 1 : 0,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    },
    rev: period.rev
  };
}

/** Việc còn lại trước khi chốt công, từ checklist của kỳ. */
export function buildCloseChecks(period?) {
  const list = Array.isArray(period.checklist) ? period.checklist : [];
  const items = list.map(i => ({
    id: i.code,
    n: i.count,
    tone: i.severity === 'block' ? 'err' : i.severity === 'warn' ? 'pend' : 'draft',
    label: i.message,
    mode: i.severity === 'block' && !i.acknowledgeable ? 'block' : i.acknowledgeable ? 'skip' : 'info'
  }));
  return { sub: items.length ? `Còn ${items.length} việc trước khi khoá bảng công` : '', items, blockedNote: '' };
}
