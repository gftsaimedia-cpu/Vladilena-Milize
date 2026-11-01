// Dựng bảng "Cách tính lương" và sáu ngăn kéo từ tham số tính lương. Ngăn kéo chỉ hiện các ô đã nối vào bộ máy;
// phương án chưa dùng được bị ẩn. Ô tỉ lệ lưu 0.15 hiện 15 (toPct / fromPct).
import { TYPE_NAME, TYPE_ORDER, fromPct, toPct, valueOf } from './params';

const ROWS = [
  { key: 'ngay-cong', op: '+', name: 'Lương theo ngày công', drawer: 'luong-ngay-cong' },
  { key: 'lam-them', op: '+', name: 'Tiền làm thêm giờ', drawer: 'lam-them' },
  { key: 'phu-cap', op: '+', name: 'Phụ cấp', drawer: 'phu-cap' },
  { key: 'luong-kpi', op: '+', name: 'Lương KPI', drawer: 'luong-kpi' },
  { key: 'khau-tru', op: '−', name: 'Khấu trừ đi muộn, về sớm', drawer: 'khau-tru' },
  { key: 'tam-ung', op: '−', name: 'Tạm ứng', drawer: 'tam-ung' },
  { key: 'bao-hiem', op: '−', name: 'Bảo hiểm', drawer: null, law: true },
  { key: 'thue', op: '−', name: 'Thuế TNCN', drawer: null, law: true }
];

const TITLE = {
  'luong-ngay-cong': 'Lương theo ngày công',
  'lam-them': 'Tiền làm thêm giờ',
  'phu-cap': 'Phụ cấp',
  'luong-kpi': 'Lương KPI',
  'khau-tru': 'Khấu trừ đi muộn, về sớm',
  'tam-ung': 'Tạm ứng'
};

// Khoá của từng ngăn (để biết ngăn nào đã được chỉnh)
const levelKeys = (idx?, suffix?, types?) =>
  types.flatMap(t => [...idx.byKey.keys()].filter(k => new RegExp(`^level\\.${t}\\.\\d+\\.${suffix}$`).test(k)));
const DRAWER_KEYS = {
  'luong-ngay-cong': (idx?) => [
    ...TYPE_ORDER.map(t => `type.${t}.workdays`),
    ...levelKeys(idx, 'base', TYPE_ORDER),
    'pay.method'
  ],
  'lam-them': () => ['ot.rate', 'ot.weekendRate', 'ot.holidayRate', 'night.breakPremium', 'night.otAddRate'],
  'phu-cap': () => [
    ...TYPE_ORDER.flatMap(t => [`type.${t}.travel`, `type.${t}.attendance`, `type.${t}.flexBonus`]),
    'shift.night.bonus',
    'type.nv.nightOptions',
    'type.nv.maxAbsent',
    'attendance.overLimitHours',
    'attendance.lossMode',
    'attendance.overLimitTolerance',
    'attendance.shortHoursRounding'
  ],
  'luong-kpi': (idx?) => [
    ...levelKeys(idx, 'kpi', ['ctv', 'nv']),
    'type.ctv.kpiPass',
    'type.nv.kpiPass',
    'kpi.belowPassRule',
    'kpi.weworkGateRule',
    'kpi.incompleteRule'
  ],
  'khau-tru': () => ['attendance.graceMin', 'attendance.stepMin', 'attendance.cutRounding', 'attendance.lateEarlyRule'],
  'tam-ung': () => ['advance.rate', 'advance.untilDay', 'advance.basis']
};

export function buildPayFormula(idx?, firstRun?) {
  let recent = { at: '', name: '' };
  let adjusted = 0;
  const rows = ROWS.map(r => {
    let status = 'default';
    if (r.law) status = 'law';
    else {
      for (const key of DRAWER_KEYS[r.drawer](idx)) {
        const hit = idx.byKey.get(key);
        const inst = hit && hit.instance;
        if (hit && hit.status === 'custom') status = 'adjusted';
        if (inst && inst.changedAt && inst.changedAt > recent.at) recent = { at: inst.changedAt, name: r.name };
      }
      if (status === 'adjusted') adjusted += 1;
    }
    return { key: r.key, op: r.op, name: r.name, status, drawer: r.drawer };
  });
  return {
    adjustedCount: adjusted,
    undecidedCount: firstRun.total,
    recent: recent.name,
    rows,
    open: {
      total: firstRun.total,
      items: firstRun.items.slice(0, 5).map(i => ({ tag: i.groupLabel, text: i.label }))
    }
  };
}

// ---- ngăn kéo ----
const numField = (idx?, key?, o: any = {}) => {
  const hit = idx.byKey.get(key);
  if (!hit) return null;
  const v = hit.value;
  return {
    type: o.money ? 'money' : 'num',
    pk: key,
    ratio: !!o.ratio,
    ...(o.at === undefined ? {} : { at: o.at }),
    value: o.ratio ? toPct(v) : o.at === undefined ? v : Array.isArray(v) ? v[o.at] : 0,
    ...(o.unit ? { unit: o.unit } : {}),
    ...(o.prefix ? { prefix: o.prefix } : {})
  };
};
const selectField = (idx?, key?) => {
  const hit = idx.byKey.get(key);
  if (!hit || hit.entry.wired === false) return null;
  const options = ((hit.entry.rules && hit.entry.rules.options) || []).filter(
    o => o.available !== false || o.value === hit.value
  );
  if (!options.length) return null;
  return {
    type: 'select',
    pk: key,
    options: options.map(o => o.label),
    vals: options.map(o => o.value),
    value: (options.find(o => o.value === hit.value) || options[0]).label
  };
};
const row = (label?, field?, extra: any = {}) => (field ? { kind: 'row', label, field, ...extra } : null);
const pendingOf = (idx?, key?) => {
  const hit = idx.byKey.get(key);
  return hit && hit.status === 'unset' ? { pill: { text: 'Chưa chốt', cls: 'p-pend' } } : {};
};
const section = (title?, right?, items?) => ({ title, right: right.filter(Boolean), items: items.filter(Boolean) });
const rightNum = (idx?, key?, o?) => {
  const f = numField(idx, key, o);
  return f && { kind: 'num', ...f };
};
const levelRows = (idx?, t?, suffix?, o?) => {
  const out: any[] = [];
  for (const [key, hit] of idx.byKey) {
    const m = new RegExp(`^level\\.${t}\\.(\\d+)\\.${suffix}$`).exec(key);
    if (m && hit.row) out.push({ n: Number(m[1]), item: row(hit.row.name, numField(idx, key, o)) });
  }
  return out.sort((a: any, b: any) => a.n - b.n).map(x => x.item);
};

export function buildPayDrawer(name?, idx?) {
  if (!DRAWER_KEYS[name]) return null;
  const sections: any[] = [];
  if (name === 'luong-ngay-cong') {
    for (const t of TYPE_ORDER)
      sections.push(
        section(
          TYPE_NAME[t],
          [rightNum(idx, `type.${t}.workdays`, { unit: 'ngày công' })],
          levelRows(idx, t, 'base', { money: true })
        )
      );
    sections.push(section('Khác', [], [row('Cách tính lương', selectField(idx, 'pay.method'))]));
  } else if (name === 'lam-them') {
    const x = { prefix: '×', ratio: false };
    sections.push(
      section(
        'Hệ số nhân',
        [],
        [
          row('Ngày thường', numField(idx, 'ot.rate', x)),
          row('Cuối tuần', numField(idx, 'ot.weekendRate', x)),
          row('Ngày lễ, Tết', numField(idx, 'ot.holidayRate', x))
        ]
      ),
      section(
        'Cộng thêm ban đêm',
        [],
        [
          row('Giờ làm đêm', numField(idx, 'night.breakPremium', { ratio: true, unit: '%' })),
          row('Làm ngày lễ ban đêm', numField(idx, 'night.otAddRate', { ratio: true, unit: '%' }))
        ]
      )
    );
  } else if (name === 'phu-cap') {
    const pct = { ratio: true, unit: '%' };
    sections.push(
      section(
        'Đi lại và chuyên cần',
        [],
        TYPE_ORDER.flatMap(t => [
          row(`${TYPE_NAME[t]} · đi lại`, numField(idx, `type.${t}.travel`, pct)),
          row(`${TYPE_NAME[t]} · chuyên cần`, numField(idx, `type.${t}.attendance`, pct))
        ])
      ),
      section(
        'Theo ca',
        [],
        [
          ...TYPE_ORDER.map(t => row(`${TYPE_NAME[t]} · ca Flex`, numField(idx, `type.${t}.flexBonus`, pct))),
          row('Phụ cấp ca đêm · Thực tập sinh, Chuyên trách viên', numField(idx, 'shift.night.bonus', pct)),
          row('Phụ cấp ca đêm · Nhân viên, mức 1', numField(idx, 'type.nv.nightOptions', { unit: '%', at: 0 })),
          row('Phụ cấp ca đêm · Nhân viên, mức 2', numField(idx, 'type.nv.nightOptions', { unit: '%', at: 1 }))
        ]
      ),
      section(
        'Mất phụ cấp chuyên cần',
        [],
        [
          row('Khi nghỉ từ', numField(idx, 'type.nv.maxAbsent', { unit: 'ngày' })),
          row('Khi tổng giờ vượt ngưỡng trong tháng từ', numField(idx, 'attendance.overLimitHours', { unit: 'giờ' })),
          row('Cách mất', selectField(idx, 'attendance.lossMode')),
          row('Biên độ giờ vượt ngưỡng', numField(idx, 'attendance.overLimitTolerance', { unit: 'giờ' })),
          row('Làm tròn giờ thiếu chưa bù', selectField(idx, 'attendance.shortHoursRounding'))
        ]
      )
    );
  } else if (name === 'luong-kpi') {
    for (const t of ['ctv', 'nv'])
      sections.push(
        section(
          TYPE_NAME[t],
          [{ kind: 'text', text: 'Đạt khi tổng từ' }, rightNum(idx, `type.${t}.kpiPass`, { unit: '%' })],
          levelRows(idx, t, 'kpi', { money: true })
        )
      );
    sections.push(
      section(
        'Chính sách chưa chốt',
        [],
        ['kpi.belowPassRule', 'kpi.weworkGateRule', 'kpi.incompleteRule'].map(k =>
          row((idx.byKey.get(k) && idx.byKey.get(k).entry.label) || k, selectField(idx, k), pendingOf(idx, k))
        )
      )
    );
  } else if (name === 'khau-tru') {
    sections.push(
      section(
        'Khấu trừ',
        [],
        [
          row('Đi trễ, về sớm tới … phút không trừ', numField(idx, 'attendance.graceMin', { unit: 'phút' })),
          row('Bậc trừ khi vượt mức', numField(idx, 'attendance.stepMin', { unit: 'phút' })),
          row('Cách tính số phút bị trừ', selectField(idx, 'attendance.cutRounding')),
          row('Đi trễ và về sớm cùng ngày', selectField(idx, 'attendance.lateEarlyRule'))
        ]
      )
    );
  } else if (name === 'tam-ung') {
    sections.push(
      section(
        'Tạm ứng',
        [],
        [
          row('Tỉ lệ lương cơ bản thực nhận', numField(idx, 'advance.rate', { ratio: true, unit: '%' })),
          row('Tính cho ngày đi làm từ ngày 1 đến ngày', numField(idx, 'advance.untilDay', { unit: 'ngày' })),
          row('Cách tính tạm ứng', selectField(idx, 'advance.basis'))
        ]
      )
    );
  }
  return { title: TITLE[name], sub: '', sections };
}

/** Danh sách [khoá, giá trị] của một ngăn sau khi sửa; ô nightOptions ghép lại thành một mảng. */
export function drawerWanted(idx?, drawer?) {
  const wanted = new Map<any, any>();
  const fields = drawer.sections.flatMap(s => [...s.right, ...s.items.filter(i => i.kind === 'row')]);
  for (const item of fields) {
    const f = item.kind === 'row' ? item.field : item;
    if (!f || !f.pk) continue;
    if (f.type === 'select') {
      wanted.set(f.pk, f.vals[f.options.indexOf(f.value)]);
    } else if (f.at !== undefined) {
      const list = wanted.get(f.pk) || (Array.isArray(valueOf(idx, f.pk)) ? valueOf(idx, f.pk).slice() : []);
      list[f.at] = Number(f.value);
      wanted.set(f.pk, list);
    } else {
      wanted.set(f.pk, f.value === '' || f.value == null ? f.value : f.ratio ? fromPct(f.value) : Number(f.value));
    }
  }
  return wanted;
}
