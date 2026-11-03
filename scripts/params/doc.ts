'use strict';
// params:doc — dựng bảng danh mục cấu hình TỪ registry (bảng và mã không lệch nhau).
//   node scripts/params/doc.ts                  in Markdown ra màn hình
//   node scripts/params/doc.ts --out <tệp>      ghi ra tệp
//   node scripts/params/doc.ts --check <tệp>    thoát 1 nếu tệp khác bản dựng từ registry
//   node scripts/params/doc.ts --json           in registry dạng JSON gọn (để xuất .docx)
const fs = require('node:fs');
const Params = require('../../src/engine/payroll-params');
const registry = require('../../src/params/registry');
const { fmt } = require('../../src/params/validate');

const CLASS_LABEL = {
  choice: 'chọn',
  number: 'số',
  table: 'bảng',
  formula: 'công thức',
  fixed: 'cố định',
  removed: 'bỏ'
};
const WIRED_LABEL = (entry?) => (entry.wired === true ? 'có' : entry.wired === false ? 'chưa' : '—');
const cell = (text?) =>
  String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
const defaultOf = (entry?) => {
  if (!entry.valueBearing || entry.class === 'removed') return '';
  const keys = registry.keysOf(entry);
  if (!keys.length) return 'rỗng';
  const shown = keys.slice(0, 3).map(k => {
    const v = Params.DEFAULTS[k];
    const text =
      v && typeof v === 'object' && !Array.isArray(v)
        ? v.text
          ? `“${String(v.text).slice(0, 60)}”`
          : JSON.stringify(v)
        : Array.isArray(v)
          ? JSON.stringify(v)
          : fmt(entry.unit, v);
    return keys.length > 1 ? `${k.split('.').slice(-2).join('.')}: ${text}` : text;
  });
  return shown.join('; ') + (keys.length > 3 ? ` … (+${keys.length - 3})` : '');
};
const optionsOf = (entry?) =>
  (entry.options || [])
    .map(o => `${o.label}${o.available ? '' : ' [chưa có]'}${o.isDefault ? ' (mặc định)' : ''}`)
    .join(' · ');

function render() {
  const lines = [
    '# Danh mục cấu hình (sinh từ registry)',
    '',
    'Sinh bởi `npm run params:doc` từ `src/params/registry.data.json` và `src/engine/payroll-params.ts → DEFAULTS`. Không sửa tay.',
    ''
  ];
  for (const group of registry.GROUPS) {
    const entries = registry.entries.filter(e => e.group === group.id).sort((a: any, b: any) => a.order - b.order);
    if (!entries.length) continue;
    lines.push(`## Nhóm ${group.id}. ${group.label}`, '');
    lines.push(
      '| Khoá | Nhãn trên màn | Loại | Thành phần | Phương án | Mặc định | editableBy | Nối | Căn cứ · tầng | Đợt |',
      '|---|---|---|---|---|---|---|---|---|---|'
    );
    for (const e of entries) {
      const key = e.keys && e.keys.length ? e.keys.map(k => `\`${k}\``).join(', ') : `\`${e.id}\``;
      const unit = e.unit ? ` (${e.unit})` : '';
      lines.push(
        `| ${cell(key)} | ${cell(e.label)} | ${CLASS_LABEL[e.class]}${cell(unit)} | ${e.ui.component} | ${cell(optionsOf(e))} | ${cell(defaultOf(e))} | ${e.editableBy} | ${WIRED_LABEL(e)} | ${cell(e.legal ? `${e.legal.tier}: ${e.legal.basis}` : e.basis)} | ${cell(e.phase)} |`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

const argv = process.argv.slice(2);
if (argv.includes('--json')) console.log(JSON.stringify(registry.entries.map(({ patterns, ...rest }: any) => rest)));
else {
  const text = render();
  const at = (flag?) => argv[argv.indexOf(flag) + 1];
  if (argv.includes('--check')) {
    const file = at('--check');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text + '\n') {
      console.error(`${file} khác bản dựng từ registry: chạy npm run params:doc -- --out ${file}`);
      process.exit(1);
    }
    console.log(`${file} khớp registry`);
  } else if (argv.includes('--out')) {
    fs.writeFileSync(at('--out'), text + '\n');
    console.log(`Đã ghi ${at('--out')}`);
  } else console.log(text);
}
