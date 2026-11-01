// Xử lý yêu cầu chưa được đồng ý hoặc bị từ chối (Cài đặt › Phân quyền › Xử lý yêu cầu): bảng request.type.<loại> của GET /api/settings/params.
// Máy chủ có hai khoá riêng cho khoản chưa duyệt và khoản bị từ chối; màn có một ô cho cả hai: ô hiện cách xử lý khoản chưa duyệt,
// lưu thì ghi cả hai khoá cùng giá trị.

const ENTRY_ID = 'request.type.<code>';
const LEAVE_CODES = ['leave', 'isat', 'approved'];
const EXTRA_CODES = ['ot', 'makeup_hours', 'holiday_work'];

/**
 * Dựng dữ liệu màn và bản gốc để so khi lưu.
 * view: { leave: [{ key, label, value, countsAbsent }], leaveOptions, extra: [{ key, label, value }], extraOptions }
 * base: { rev, month, optionValue: nhãn → giá trị máy chủ, rows: { [loại]: { keys, value, countsAbsent } } }
 */
export function buildRequestRules(paramsRes?) {
  const entry = paramsRes.groups.flatMap(g => g.entries).find(e => e.id === ENTRY_ID);
  if (!entry) throw new Error(`Máy chủ không trả mục ${ENTRY_ID}`);
  const table = entry.ui.table;
  const labelOf = Object.fromEntries(table.rowKeys[0].values.map(v => [v.value, v.label]));
  const options = table.columns.find(c => c.key === 'pendingRule').options;
  const optionLabel = Object.fromEntries(options.map(o => [o.value, o.label]));
  const optionValue = Object.fromEntries(options.map(o => [o.label, o.value]));
  const byCode = Object.fromEntries(entry.value.map(r => [r.code, r]));

  const rows: Record<string, any> = {};
  const make = (code?, withAbsent?) => {
    const r = byCode[code];
    if (!r) return null;
    const value = optionLabel[r.pendingRule] || String(r.pendingRule);
    rows[code] = { keys: r.keys, value, countsAbsent: !!r.countsAbsent };
    return {
      key: code,
      label: labelOf[code] || code,
      value,
      ...(withAbsent ? { countsAbsent: !!r.countsAbsent } : {})
    };
  };
  const leave = LEAVE_CODES.map(c => make(c, true)).filter(Boolean);
  const extra = EXTRA_CODES.map(c => make(c, false)).filter(Boolean);
  const labelsOf = (values?) => values.filter(v => optionLabel[v]).map(v => optionLabel[v]);
  return {
    view: {
      leave,
      leaveOptions: labelsOf(['unpaid', 'drop']),
      extra,
      extraOptions: labelsOf(['strip', 'drop'])
    },
    base: { rev: paramsRes.paramsRev, month: paramsRes.month, optionValue, rows }
  };
}

// Các khoá đã đổi so với bản gốc: ô cách xử lý ghi cả khoản chưa duyệt lẫn bị từ chối, ô chuyên cần ghi khoá riêng
export function toRuleChanges(draft?, base?) {
  const changes: any[] = [];
  for (const row of [...draft.leave, ...draft.extra]) {
    const was = base.rows[row.key];
    if (!was) continue;
    if (row.value !== was.value) {
      const value = base.optionValue[row.value];
      if (value === undefined) throw new Error(`Không có cách xử lý "${row.value}"`);
      changes.push({ key: was.keys.pendingRule, value }, { key: was.keys.rejectedRule, value });
    }
    if (row.countsAbsent !== undefined && !!row.countsAbsent !== was.countsAbsent)
      changes.push({ key: was.keys.countsAbsent, value: !!row.countsAbsent });
  }
  return changes;
}
