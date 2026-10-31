// Dựng màn "Cảnh báo AI" từ các ngưỡng ai.threshold.* của registry.
// Trạng thái: giá trị Admin đã đặt (custom) = Đã chốt; còn lại là mức mặc định của app = Đề xuất.
import { fromPct, toPct } from './params.js';

// Nhóm hiển thị (col: cột trái 0 / phải 1) và các khoá thuộc nhóm
const GROUPS = [
  {
    key: 'yeu-cau',
    name: 'Yêu cầu và báo công',
    col: 0,
    keys: [
      'ai.threshold.isatPerMonth',
      'ai.threshold.approvedLeavePerMonth',
      'ai.threshold.rejectedLookbackDays',
      'ai.threshold.repeatedEditsRev'
    ]
  },
  { key: 'cham-cong', name: 'Chấm công', col: 0, keys: ['ai.threshold.presenceGapMin'] },
  { key: 'kpi', name: 'KPI', col: 0, keys: ['ai.threshold.kpiFullMonths'] },
  {
    key: 'ot',
    name: 'OT',
    col: 1,
    keys: ['ai.threshold.otMedianFactor', 'ai.threshold.otMedianMinHours', 'ai.threshold.otMedianMinPeers']
  },
  {
    key: 'tien',
    name: 'Tiền',
    col: 1,
    keys: [
      'ai.threshold.impactVnd',
      'ai.threshold.slipDiffVnd',
      'ai.threshold.slipDiffRatio',
      'ai.threshold.netChangePct',
      'ai.threshold.paramChangePeoplePct',
      'ai.threshold.formulaChangeTotalVnd',
      'ai.threshold.overrideEntryRoundVnd',
      'ai.threshold.scopeLeakMinPeople'
    ]
  }
];
const UNIT = { day: 'ngày', hour: 'giờ', minute: 'phút', times: 'lần', month: 'tháng', ratio: '%', vnd: '₫' };

function item(entry) {
  const inst = entry.instances[0];
  const ratio = entry.ui.unit === 'ratio';
  return {
    key: inst.key,
    label: entry.label,
    value: ratio ? toPct(inst.value) : inst.value,
    unit: UNIT[entry.ui.unit] || '',
    status: inst.status === 'custom' ? 'locked' : 'proposed',
    kind: entry.ui.component === 'money' ? 'money' : 'num',
    ratio
  };
}

export function buildAlerts(idx) {
  const byId = new Map(idx.entries.map(e => [e.id, e]));
  const groups = GROUPS.map(g => ({
    key: g.key,
    name: g.name,
    col: g.col,
    items: g.keys
      .map(k => byId.get(k))
      .filter(e => e && e.instances && e.instances.length)
      .map(item)
  })).filter(g => g.items.length);
  const all = groups.flatMap(g => g.items);
  const locked = all.filter(i => i.status === 'locked').length;
  return { counts: { all: all.length, proposed: all.length - locked, locked }, groups };
}

export const alertsWanted = draft =>
  draft.groups.flatMap(g =>
    g.items.map(i => [
      i.key,
      i.value === '' || i.value == null ? i.value : i.ratio ? fromPct(i.value) : Number(i.value)
    ])
  );
