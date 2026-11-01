(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FormulaVocab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Từ vựng của công thức gõ chữ (src/engine/formula.ts): biến, tham số, công thức có tên và hàm có sẵn của cách tính lương hôm nay.
  // Đây là DỮ LIỆU, không phải luật: khoá, nhãn, từ đồng nghĩa, đơn vị, miền.
  //
  // SINH RA, không viết tay: khối GENERATED dưới đây do `node scripts/params/gen-formula-vocab.ts` ghi từ
  // PayrollEngine.VARIABLES / FORMULAS / BUILTINS (src/engine/payroll-engine.ts) và src/params/registry.data.json; `--check` báo lệch.
  // Khoá là khoá của bộ máy (tongThanhPhanNgay, phuCapDiLai, luongCoBan, ngayDiLam, gioVuotNguong, iDorm…). Mục có `engineGap: true`
  // là phần bộ máy chưa công bố (giờ OT, cờ KPI, cờ loại, phép so sánh có tên); `source` ghi nó lấy từ đâu.
  //
  // Dạng xuất: chính danh sách từ vựng (truyền thẳng vào Formula.parse(text, { vocabulary })), kèm thuộc tính không đếm được
  // `byKey(key)`, `VOCABULARY` (cùng danh sách) và `generated` (chỉ phần sinh ra, để --check so sánh).
  //
  // Đơn vị 'flag' = cờ đúng/sai (ở iDorm, KPI đạt, giữ được chuyên cần): chỉ dùng làm điều kiện của 'nếu', 'và', 'hoặc', 'không'.
  // 'count' dành cho số đếm thật. Khoá tham số theo loại nhân sự giữ dạng registry `type.<type>.travel`: một cây dùng chung cho mọi
  // loại, ctx.scope.type chọn loại khi tính (xem Formula.evaluate).
  // `covers: [khoá…]` trên một biến (tổng sáu thành phần ngày) = đã gồm nguyên vẹn các khoản đó, nên tổng thu nhập cộng nguyên vẹn nó
  // là đã cộng đủ sáu khoản bắt buộc theo luật. `required` của tongThuNhap là sáu khoản đó.

  /* GENERATED:BEGIN (scripts/params/gen-formula-vocab.ts) */
  const GENERATED = [
    {
      key: 'tienNgayCong',
      label: 'tiền ngày công',
      synonyms: ['lương theo ngày công', 'lương ngày công'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.tienNgayCong'
    },
    {
      key: 'phuCapCa',
      label: 'phụ cấp ca',
      synonyms: ['phụ cấp ca flex', 'phụ cấp ca đêm'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.phuCapCa'
    },
    {
      key: 'gioNghiDem',
      label: 'tiền giờ nghỉ đêm',
      synonyms: ['giờ nghỉ đêm'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.gioNghiDem'
    },
    {
      key: 'lamBu',
      label: 'tiền làm bù',
      synonyms: ['làm bù'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.lamBu'
    },
    {
      key: 'tienOt',
      label: 'tiền OT',
      synonyms: ['OT', 'làm thêm giờ'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.tienOt'
    },
    {
      key: 'tienLamLe',
      label: 'tiền làm ngày lễ',
      synonyms: ['làm lễ', 'đi làm ngày lễ'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'trace.tienLamLe'
    },
    {
      key: 'ngayDiLam',
      label: 'số ngày đi làm',
      synonyms: ['ngày đi làm', 'ngày công thực tế'],
      kind: 'variable',
      unit: 'day',
      domain: 'month',
      source: 'm.count'
    },
    {
      key: 'luongCoBan',
      label: 'lương cơ bản của level',
      synonyms: ['lương cơ bản', 'LCB', 'lương CB'],
      kind: 'variable',
      unit: 'VND',
      domain: 'person',
      source: 'level.base'
    },
    {
      key: 'ngayCongChuan',
      label: 'ngày công chuẩn',
      synonyms: ['công chuẩn', 'ngày công tiêu chuẩn', 'số ngày công chuẩn'],
      kind: 'variable',
      unit: 'day',
      domain: 'person',
      source: 'type.workdays',
      nonZero: true
    },
    {
      key: 'gioVuotNguong',
      label: 'giờ vượt ngưỡng',
      synonyms: ['số giờ vượt ngưỡng'],
      kind: 'variable',
      unit: 'hour',
      domain: 'month',
      source: 'm.overHours'
    },
    {
      key: 'tongThanhPhanNgay',
      label: 'tổng sáu thành phần ngày',
      synonyms: ['tổng tiền công trong ngày'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'm.work',
      covers: ['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe']
    },
    {
      key: 'ngayNghiXetChuyenCan',
      label: 'ngày nghỉ xét chuyên cần',
      synonyms: ['ngày nghỉ chuyên cần'],
      kind: 'variable',
      unit: 'day',
      domain: 'month',
      source: 'm.absent'
    },
    {
      key: 'iDorm',
      label: 'ở iDorm',
      synonyms: ['Ở ký túc xá iDorm', 'iDorm'],
      kind: 'variable',
      unit: 'flag',
      domain: 'person',
      source: 'staff.idorm'
    },
    {
      key: 'mucKpi',
      label: 'mức KPI đã duyệt',
      synonyms: ['mức KPI'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'm.kpiAmt'
    },
    {
      key: 'diemKpi',
      label: 'điểm KPI',
      synonyms: ['tổng điểm KPI'],
      kind: 'variable',
      unit: 'point',
      domain: 'month',
      source: 'm.kpiPct'
    },
    {
      key: 'tienUng',
      label: 'cơ sở tạm ứng',
      synonyms: ['nền tạm ứng'],
      kind: 'variable',
      unit: 'VND',
      domain: 'month',
      source: 'm.advanceBase'
    },
    {
      key: 'tienTrongNgay',
      label: 'tiền công cả ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].total'
    },
    {
      key: 'tienNgayCongNgay',
      label: 'tiền ngày công trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.tienNgayCong'
    },
    {
      key: 'phuCapCaNgay',
      label: 'phụ cấp ca trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.phuCapCa'
    },
    {
      key: 'gioNghiDemNgay',
      label: 'tiền giờ nghỉ đêm trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.gioNghiDem'
    },
    {
      key: 'lamBuNgay',
      label: 'tiền làm bù trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.lamBu'
    },
    {
      key: 'tienOtNgay',
      label: 'tiền OT trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.tienOt'
    },
    {
      key: 'tienLamLeNgay',
      label: 'tiền làm ngày lễ trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'VND',
      domain: 'day',
      source: 'rows[].parts.tienLamLe'
    },
    {
      key: 'gioOtNgay',
      label: 'giờ OT trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'day',
      source: 'rows[].otH'
    },
    {
      key: 'gioLamBuNgay',
      label: 'giờ làm bù trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'day',
      source: 'rows[].makeupH'
    },
    {
      key: 'gioLamLeNgay',
      label: 'giờ làm ngày lễ trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'day',
      source: 'rows[].holWorkH'
    },
    {
      key: 'gioDemNgay',
      label: 'giờ làm đêm trong ngày',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'day',
      source: 'rows[].nightH (trừ giờ đêm ngày lễ)'
    },
    {
      key: 'gioOt',
      label: 'giờ OT',
      synonyms: ['giờ làm thêm OT'],
      kind: 'variable',
      unit: 'hour',
      domain: 'month',
      source: 'm.otHours',
      engineGap: true
    },
    {
      key: 'gioLamBu',
      label: 'giờ làm bù',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'month',
      source: 'm.makeupHours',
      engineGap: true
    },
    {
      key: 'gioLamLe',
      label: 'giờ làm ngày lễ',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'month',
      source: 'm.holWorkHours',
      engineGap: true
    },
    {
      key: 'gioDem',
      label: 'giờ làm đêm',
      synonyms: [],
      kind: 'variable',
      unit: 'hour',
      domain: 'month',
      source: 'm.nightHours',
      engineGap: true
    },
    {
      key: 'loaiCoPhuCap',
      label: 'loại có phụ cấp',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      source: '!!(type.travel || type.attendance)',
      engineGap: true
    },
    {
      key: 'coKpi',
      label: 'loại có KPI',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      source: '!!type.kpi',
      engineGap: true
    },
    {
      key: 'kpiDat',
      label: 'KPI đạt',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      source: 'KPI đạt mốc (m.kpiPass; năm thành phần: KpiScore.evaluate(m.kpiParts).pass)',
      engineGap: true
    },
    {
      key: 'kpiNamThanhPhan',
      label: 'KPI năm thành phần',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      source: "m.kpiMethod === 'five'",
      engineGap: true
    },
    {
      key: 'batTamUng',
      label: 'bật tạm ứng',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      source: 'staff.advanceOn !== false',
      engineGap: true
    },
    {
      key: 'tongThuNhap',
      label: 'tổng thu nhập',
      synonyms: ['tổng lương', 'thu nhập gộp'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.tongThuNhap',
      required: ['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe']
    },
    {
      key: 'phuCapDiLai',
      label: 'đi lại',
      synonyms: ['phụ cấp đi lại', 'tiền đi lại'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.phuCapDiLai'
    },
    {
      key: 'phuCapChuyenCan',
      label: 'chuyên cần',
      synonyms: ['phụ cấp chuyên cần', 'tiền chuyên cần'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.phuCapChuyenCan'
    },
    {
      key: 'luongKpi',
      label: 'lương KPI',
      synonyms: ['tiền KPI', 'thưởng KPI'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.luongKpi'
    },
    {
      key: 'heSoNgayKpi',
      label: 'hệ số ngày đi làm của KPI',
      synonyms: ['hệ số KPI', 'hệ số ngày KPI'],
      kind: 'formula',
      unit: 'ratio',
      domain: 'month',
      source: 'trace.heSoNgayKpi'
    },
    {
      key: 'tyLeNgayDiLam',
      label: 'tỷ lệ ngày đi làm',
      synonyms: ['tỷ lệ ngày công'],
      kind: 'formula',
      unit: 'ratio',
      domain: 'month',
      source: 'trace.tyLeNgayDiLam'
    },
    {
      key: 'tamUng',
      label: 'tạm ứng',
      synonyms: ['ứng lương'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.tamUng'
    },
    {
      key: 'thuNhapChiuThue',
      label: 'thu nhập chịu thuế',
      synonyms: ['chịu thuế'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.thuNhapChiuThue',
      locked: true
    },
    {
      key: 'thucLinh',
      label: 'thực lĩnh',
      synonyms: ['lương thực nhận'],
      kind: 'formula',
      unit: 'VND',
      domain: 'month',
      source: 'trace.thucLinh',
      locked: true
    },
    {
      key: 'tinhGioVuotNguong',
      label: 'tính giờ vượt ngưỡng',
      synonyms: [],
      kind: 'builtin',
      unit: 'hour',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'ngayKhongLuong',
          unit: 'day'
        },
        {
          name: 'ngayVang',
          unit: 'day'
        },
        {
          name: 'gioThieuChuaBu',
          unit: 'hour'
        },
        {
          name: 'ngayPhepNam',
          unit: 'day'
        }
      ],
      source: 'PayrollEngine.BUILTINS.tinhGioVuotNguong'
    },
    {
      key: 'giuChuyenCan',
      label: 'giữ được chuyên cần',
      synonyms: ['còn giữ phụ cấp chuyên cần', 'giữ chuyên cần', 'đủ điều kiện chuyên cần'],
      kind: 'builtin',
      unit: 'flag',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'ngayNghi',
          unit: 'day'
        },
        {
          name: 'gioVuotNguong',
          unit: 'hour'
        },
        {
          name: 'nguongNgayNghi',
          unit: 'day'
        }
      ],
      source: 'PayrollEngine.BUILTINS.giuChuyenCan'
    },
    {
      key: 'tienKpi',
      label: 'tiền KPI theo điểm năm thành phần',
      synonyms: ['tiền thưởng KPI'],
      kind: 'builtin',
      unit: 'VND',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'mucKpi',
          unit: 'VND'
        },
        {
          name: 'diemDonVi',
          unit: 'point'
        },
        {
          name: 'heSo',
          unit: 'ratio'
        }
      ],
      source: 'PayrollEngine.BUILTINS.tienKpi'
    },
    {
      key: 'tienKpiCu',
      label: 'tiền KPI theo phần trăm',
      synonyms: [],
      kind: 'builtin',
      unit: 'VND',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'mucKpi',
          unit: 'VND'
        },
        {
          name: 'diemPhanTram',
          unit: 'point'
        },
        {
          name: 'heSo',
          unit: 'ratio'
        }
      ],
      source: 'PayrollEngine.BUILTINS.tienKpiCu'
    },
    {
      key: 'roundDong',
      label: 'làm tròn đồng',
      synonyms: ['làm tròn'],
      kind: 'builtin',
      unit: 'VND',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'x',
          unit: 'VND'
        }
      ],
      source: 'PayrollEngine.BUILTINS.roundDong'
    },
    {
      key: 'vuotNguongKpi',
      label: 'vượt ngưỡng giờ KPI',
      synonyms: [],
      kind: 'builtin',
      unit: 'flag',
      domain: 'month',
      locked: true,
      args: [
        {
          name: 'gioVuotNguong',
          unit: 'hour'
        },
        {
          name: 'nguongGio',
          unit: 'hour'
        }
      ],
      source: 'so(kpi.overLimitCompare, a, b)',
      engineGap: true
    },
    {
      key: 'advance.rate',
      label: 'tỷ lệ tạm ứng',
      synonyms: [],
      kind: 'parameter',
      unit: 'ratio',
      domain: 'month',
      registryId: 'advance.rate',
      editableBy: 'admin'
    },
    {
      key: 'kpi.overLimitHours',
      label: 'ngưỡng giờ vượt KPI',
      synonyms: ['ngưỡng giờ KPI'],
      kind: 'parameter',
      unit: 'hour',
      domain: 'month',
      registryId: 'kpi.overLimitHours',
      editableBy: 'admin'
    },
    {
      key: 'attendance.overLimitHours',
      label: 'ngưỡng giờ vượt chuyên cần',
      synonyms: [],
      kind: 'parameter',
      unit: 'hour',
      domain: 'month',
      registryId: 'attendance.overLimitHours',
      editableBy: 'admin'
    },
    {
      key: 'ot.rate',
      label: 'hệ số OT',
      synonyms: [],
      kind: 'parameter',
      unit: 'ratio',
      domain: 'month',
      registryId: 'ot.rate',
      editableBy: 'admin'
    },
    {
      key: 'ot.holidayRate',
      label: 'hệ số làm lễ',
      synonyms: [],
      kind: 'parameter',
      unit: 'ratio',
      domain: 'month',
      registryId: 'ot.holidayRate',
      editableBy: 'admin'
    },
    {
      key: 'type.<type>.travel',
      label: 'tỷ lệ phụ cấp đi lại theo loại',
      synonyms: ['tỷ lệ đi lại', 'tỷ lệ đi lại NV'],
      kind: 'parameter',
      unit: 'ratio',
      domain: 'month',
      registryId: 'type.<type>.travel',
      editableBy: 'admin'
    },
    {
      key: 'type.<type>.attendance',
      label: 'tỷ lệ chuyên cần theo loại',
      synonyms: ['tỷ lệ phụ cấp chuyên cần', 'tỷ lệ chuyên cần', 'tỷ lệ chuyên cần NV'],
      kind: 'parameter',
      unit: 'ratio',
      domain: 'month',
      registryId: 'type.<type>.attendance',
      editableBy: 'admin'
    },
    {
      key: 'type.<type>.maxAbsent',
      label: 'ngưỡng ngày nghỉ chuyên cần theo loại',
      synonyms: ['ngưỡng ngày nghỉ chuyên cần'],
      kind: 'parameter',
      unit: 'day',
      domain: 'month',
      registryId: 'type.<type>.maxAbsent',
      editableBy: 'admin'
    }
  ];
  /* GENERATED:END */

  // Khoá cũ (ví dụ `idorm` cho `iDorm`) vẫn nhận được, để câu và test dùng khoá cũ còn đọc được.
  const LEGACY = [
    {
      key: 'idorm',
      label: 'iDorm khoá cũ',
      synonyms: [],
      kind: 'variable',
      unit: 'flag',
      domain: 'month',
      deprecated: true,
      aliasOf: 'iDorm',
      source: 'staff.idorm'
    }
  ];

  const VOCABULARY = [...GENERATED, ...LEGACY];
  const byKey = (key?) => VOCABULARY.find(e => e.key === key);
  Object.defineProperty(VOCABULARY, 'byKey', { value: byKey, enumerable: false });
  Object.defineProperty(VOCABULARY, 'VOCABULARY', { value: VOCABULARY, enumerable: false });
  Object.defineProperty(VOCABULARY, 'generated', { value: GENERATED, enumerable: false });
  return VOCABULARY;
});
