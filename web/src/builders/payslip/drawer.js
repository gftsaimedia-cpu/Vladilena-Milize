// Đổi phiếu một người của máy chủ (GET /periods/:month/(payslips|estimates)/:username) sang hình dạng ngăn kéo phiếu.
// Mỗi ô tiền là số máy chủ đã cộng sẵn trong cells; các ô thu nhập cộng đúng Tổng thu nhập, trừ đi các khoản khấu trừ ra Thực nhận.
const L = (label, kind, v) => ({ label, kind, v });
const G = (title, lines) => ({ title, lines });
const TYPE_LABEL = { nv: 'NV', ctv: 'CTV', tts: 'TTS' };

const PILL = {
  approved: { cls: 'p-done', label: 'Đã phê duyệt' },
  pending: { cls: 'p-pend', label: 'Chờ phê duyệt' },
  draft: { cls: 'p-draft', label: 'Bản nháp' },
  error: { cls: 'p-draft', label: 'Chưa tính được' }
};

/** kind: 'official' | 'approved' | 'pending' | 'draft' | 'estimate' */
function kindOf(period, slip, estimate) {
  if (estimate) return 'estimate';
  if (period.status === 'approved' || period.status === 'paid') return 'official';
  return slip.status === 'approved' || slip.status === 'pending' ? slip.status : 'draft';
}

// extra: { override: các ô Admin đã sửa (GET /slip-override → values), entries: khoản thêm (GET /pay-entries → entries) }
const sumOf = list => list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
export function buildDrawer(month, username, period, data, extra = {}) {
  const slip = data.payslip;
  const estimate = data.source === 'estimate';
  const kind = kindOf(period, slip, estimate);
  // Ô tiền: số Admin đã sửa nếu có, ngược lại số tự tính; Tổng thu nhập = cộng các ô thu nhập + khoản cộng thêm − trừ đi muộn, về sớm
  const c = { ...(slip.cells || {}), ...(extra.override || {}) };
  const net = (slip.snapshot && slip.snapshot.net) || {};
  const entriesAdd = Number(net.entriesAdd) || 0;
  const entriesDeduct = Number(net.entriesDeduct) || 0;
  const approved = Array.isArray(extra.entries) ? extra.entries.filter(e => e.status === 'approved') : [];
  // Mỗi khoản thêm một dòng khi các khoản đã duyệt cộng đúng số trong lần tính; lệch thì một dòng tổng của lần tính
  const entryLines = (direction, total, label) => {
    if (!total) return [];
    const items = approved.filter(e => e.direction === direction);
    const sign = direction === 'deduct' ? -1 : 1;
    if (items.length && sumOf(items) === total)
      return items.map(e => L(e.slipLine || e.label, 'money', sign * e.amount));
    return [L(label, 'money', sign * total)];
  };
  const run = data.run;
  const pills = [];
  if (kind === 'official') pills.push(PILL.approved, { cls: 'p-lock', label: 'Chính thức', icon: 'lock' });
  else if (kind === 'estimate') pills.push({ cls: 'p-draft', label: 'Chưa tính lương' });
  else
    pills.push(PILL[slip.status] || PILL.draft, {
      cls: 'p-draft',
      label: `Bản nháp · lần tính ${run ? run.runNo : ''}`.trim()
    });
  const reviewing = kind === 'pending' || kind === 'approved';
  const money = (label, v) => L(label, 'money', v);
  const groups = [
    G('Ngày công và lương cơ bản', [
      L('Ngày công', 'days', c.workDays),
      L('Nghỉ không lương', 'days', c.unpaidDays),
      money('Lương cơ bản theo ngày công', c.workBase)
    ]),
    G('Nghỉ phép và ngày lễ', [
      L('Nghỉ phép có lương', 'days', c.leaveDays),
      money('Tiền nghỉ phép', c.leavePay),
      L('Nghỉ thứ 7 hưởng lương · iSAT', 'days', c.isatDays),
      money('Tiền nghỉ thứ 7 · iSAT', c.isatPay),
      L('Nghỉ lễ hưởng lương', 'days', c.holidayDays),
      money('Tiền nghỉ lễ', c.holidayPay),
      L('Quyết toán phép dư', 'days', c.settleDays),
      money('Tiền quyết toán phép dư', c.settlePay)
    ]),
    G('Làm thêm giờ', [
      L('OT ×1,5', 'hours', c.ot15H),
      L('OT ×2', 'hours', c.ot20H),
      L('OT ×3', 'hours', c.ot30H),
      money('Tiền OT', c.otPay)
    ]),
    G('Phụ cấp', [
      money('Phụ cấp chuyên cần', c.attendance),
      money('Phụ cấp đi lại', c.travel),
      money('Phụ cấp linh hoạt', c.flexPay),
      money('Thưởng ca đêm', c.nightPay),
      money('Off Paid (ca đêm)', c.breakPay)
    ]),
    G('Lương KPI', [
      c.kpiPct == null ? L('Tổng điểm KPI', 'text', 'chưa chấm đủ') : L('Tổng điểm KPI', 'pct', c.kpiPct),
      money('Lương KPI', c.kpiPay)
    ]),
    G('Khoản cộng thêm', entryLines('add', entriesAdd, 'Khoản cộng thêm')),
    G('Đi muộn, về sớm, ra ngoài', [money('Tiền trừ đi muộn, về sớm', -Math.abs(c.lateCut || 0))]),
    G('Khấu trừ', [
      money('Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)', -Math.abs(slip.insurance || 0)),
      money('Thuế TNCN', -Math.abs(slip.tax || 0)),
      money('Tạm ứng', -Math.abs(slip.advance || 0)),
      ...entryLines('deduct', entriesDeduct, 'Khoản trừ thêm')
    ])
  ];
  const shown = [];
  const zero = [];
  for (const g of groups) {
    const keep = g.lines.filter(l => (l.kind === 'text' ? true : Number(l.v) !== 0));
    zero.push(...g.lines.filter(l => !keep.includes(l)));
    if (keep.length) shown.push({ ...g, lines: keep });
  }
  return {
    month,
    username,
    name: slip.name || username,
    role: `${TYPE_LABEL[slip.type] || String(slip.type || '').toUpperCase()} · Bậc ${slip.level}`,
    kind,
    estimated: kind !== 'official',
    pills,
    meta: run
      ? `Phiên bản ${slip.rev ?? ''} · ${data.engineVersion} · tham số ${String(data.paramsHash || '').slice(0, 8)}`.replace(
          'Phiên bản  · ',
          ''
        )
      : '',
    canReturn: reviewing && period.status !== 'approved' && period.status !== 'paid',
    canApprove: kind === 'pending',
    canEditNumbers: kind !== 'official',
    auto: slip.cells || {},
    warnings: (slip.flags || []).map((f, i) => ({
      id: String(f.id ?? f.code ?? i),
      text: f.text || f.message || String(f.code || '')
    })),
    sum: {
      gross: slip.gross,
      insurance: slip.insurance,
      tax: slip.tax,
      advance: slip.advance,
      deduct: entriesDeduct,
      net: slip.net
    },
    groups: shown,
    totals: [
      { label: 'Tổng thu nhập', v: slip.gross },
      { label: 'Thực nhận', v: slip.net, hl: true }
    ],
    zero,
    rev: slip.rev
  };
}
