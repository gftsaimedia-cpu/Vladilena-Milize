(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayTailCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Phép chọn của ⑦ Bảo hiểm và ⑧ Thuế TNCN do Kế toán cấu hình.
  // Dùng chung trình duyệt và máy chủ; thuần: không I/O, không đồng hồ, không con số nào ngoài 0 và 1.
  // Mô-đun này CHỈ chọn đầu vào và phương án của logic luật trong src/engine/payroll-engine.ts (baoHiemOf, taxFrom, mienThueOf); nó không chứa mức luật mới
  // nào: mọi giá trị luật (tỷ lệ, trần, giảm trừ, biểu thuế) vẫn ở registry (src/params/), mặc định của mọi lựa chọn là cách tính gốc của bộ máy.
  // Các phương án (nền đóng theo thuộc tính, nâng nền lên lương tối thiểu vùng, miễn thuế OT theo số giờ, ngưỡng
  // phát sinh thuế riêng) có trong danh sách nhưng chưa chọn được (available: false ở registry); ở đây chúng bị từ chối rõ ràng, không rơi về mặc định âm thầm.
  //   insuredOf(P, contract)               hợp đồng này có đóng bảo hiểm không (insurance.coverage.<hợp đồng>); hồ sơ từng người (staff.insured) đè ở nơi gọi
  //   insuranceBase(P, input, PayrollParams)  nền đóng: insurance.base rồi sàn insurance.floorMode
  //   taxMethodOf(P, contract)             progressive | flat | none (tax.method.<hợp đồng>)
  //   ariseThreshold(P, personal)          ngưỡng so để phát sinh thuế (tax.arise.mode)
  //   assertParams(P)                      kiểm giá trị các khoá trên một lần khi dựng nhân: giá trị lạ là lỗi, không là mặc định
  const INSURANCE_BASES = Object.freeze(['baseSalary', 'withFlaggedAllowances', 'insuranceAttr']);
  const FLOOR_MODES = Object.freeze(['none', 'raiseToRegionMin']);
  const TAX_METHODS = Object.freeze(['progressive', 'flat', 'none']);
  const OT_METHODS = Object.freeze(['byRate', 'byHours']);
  const ARISE_MODES = Object.freeze(['personalDeduction', 'custom']);
  const CONTRACTS = Object.freeze(['long', 'short']);

  function tailError(message?, code?, key?) {
    return Object.assign(new Error(message), { code, key });
  }
  const need = (P?, key?) => {
    if (!Object.hasOwn(P, key)) throw tailError(`Thiếu tham số ${key}`, 'PARAM_MISSING', key);
    return P[key];
  };
  const oneOf = (P?, key?, list?) => {
    const value = need(P, key);
    if (!list.includes(value)) throw tailError(`Tham số ${key} có giá trị không hợp lệ`, 'PARAM_INVALID_VALUE', key);
    return value;
  };
  const isMoney = (v?) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

  // Mọi lựa chọn đang `available: false` ở registry bị bộ máy từ chối rõ ràng dù giá trị lọt qua đường không kiểm
  // (bộ tham số đặt trong bộ nhớ, dòng ghi tay vào DB): khoá → các giá trị chưa dùng được. test/unit/phase2-tail-unavailable.test.ts đối chiếu bảng này với registry.
  const UNAVAILABLE = Object.freeze({
    'tax.method.long': Object.freeze(['flat', 'none']),
    'tax.method.short': Object.freeze(['progressive', 'none']),
    'insurance.coverage.long': Object.freeze([false]),
    'insurance.floorMode': Object.freeze(['raiseToRegionMin']),
    'insurance.base': Object.freeze(['insuranceAttr']),
    'tax.arise.mode': Object.freeze(['custom'])
  });
  // Máy chủ gọi hàm này ở src/domain/payroll/payroll-service.ts → computeFor (đường tính lương thật); bộ máy thuần KHÔNG gọi để test đặt được các phương án này trong bộ nhớ.
  function assertAvailable(P?) {
    for (const [key, values] of Object.entries<any>(UNAVAILABLE))
      if (Object.hasOwn(P, key) && values.includes(P[key]))
        throw tailError(
          `Tham số ${key}: phương án này chưa dùng được (chờ chủ dự án, kế toán hoặc pháp chế chốt)`,
          'PARAM_OPTION_UNAVAILABLE',
          key
        );
  }
  function assertParams(P?) {
    for (const contract of CONTRACTS) {
      if (typeof need(P, `insurance.coverage.${contract}`) !== 'boolean')
        throw tailError(
          `Tham số insurance.coverage.${contract} phải là Có hoặc Không`,
          'PARAM_INVALID_VALUE',
          `insurance.coverage.${contract}`
        );
      oneOf(P, `tax.method.${contract}`, TAX_METHODS);
    }
    oneOf(P, 'insurance.base', INSURANCE_BASES);
    oneOf(P, 'insurance.floorMode', FLOOR_MODES);
    oneOf(P, 'tax.arise.mode', ARISE_MODES);
    // byHours (miễn thuế OT theo số giờ) chưa có trong bộ máy: chỉ nhận phương án đầu tiên
    if (oneOf(P, 'tax.exempt.otMethod', OT_METHODS) !== OT_METHODS[0])
      throw tailError(
        'Cách miễn thuế làm thêm giờ theo số giờ chưa dùng được: cần kế toán hoặc pháp chế xác nhận',
        'PARAM_OPTION_UNAVAILABLE',
        'tax.exempt.otMethod'
      );
  }

  const insuredOf = (P?, contract?) => need(P, `insurance.coverage.${contract}`) === true;

  // Nền đóng bảo hiểm. input: { levelBase, flagged (phần khối và khoản có cờ bảo hiểm ĐÃ xác nhận; 0 khi không có), type, level }
  // baseSalary: lương cơ bản. withFlaggedAllowances: lương cơ bản cộng phần có cờ (flagged đã là 0 ở nơi gọi khi chưa bật phương án này).
  // insuranceAttr: giá trị thuộc tính tiền của bậc mà insurance.baseAttr trỏ tới. Sàn: raiseToRegionMin nâng nền lên lương tối thiểu vùng đã chọn.
  function insuranceBase(P?, input?, PayrollParams?) {
    const mode = oneOf(P, 'insurance.base', INSURANCE_BASES);
    let base;
    if (mode === 'baseSalary') base = input.levelBase;
    else if (mode === 'withFlaggedAllowances') base = input.levelBase + input.flagged;
    else {
      const code = need(P, 'insurance.baseAttr');
      const def = PayrollParams.attributeDefs(P).find(d => d.code === code && d.component === 'money' && !d.deprecated);
      if (!def)
        throw tailError(
          'Nền đóng bảo hiểm theo thuộc tính của bậc nhưng chưa chọn thuộc tính tiền hợp lệ',
          'PARAM_MISSING',
          'insurance.baseAttr'
        );
      base = PayrollParams.attributeValue(P, def, input.type, input.level);
    }
    if (!isMoney(base))
      throw tailError('Nền đóng bảo hiểm không phải số tiền hợp lệ', 'PARAM_INVALID_VALUE', 'insurance.base');
    if (oneOf(P, 'insurance.floorMode', FLOOR_MODES) === FLOOR_MODES[0]) return base;
    const regionMin = P[`law.regionMinWage.${P['law.region']}`];
    if (!isMoney(regionMin))
      throw tailError('Chưa có lương tối thiểu vùng đã chọn (law.regionMinWage)', 'PARAM_MISSING', 'law.regionMinWage');
    return Math.max(base, regionMin);
  }

  const taxMethodOf = (P?, contract?) => oneOf(P, `tax.method.${contract}`, TAX_METHODS);

  // Ngưỡng so với (chịu thuế − bảo hiểm) để thuế phát sinh: giảm trừ bản thân (mặc định), hoặc ngưỡng riêng tax.arise.threshold khi phương án này được bật
  function ariseThreshold(P?, personal?) {
    if (oneOf(P, 'tax.arise.mode', ARISE_MODES) === ARISE_MODES[0]) return personal;
    const threshold = need(P, 'tax.arise.threshold');
    if (!isMoney(threshold))
      throw tailError('Ngưỡng phát sinh thuế phải là số tiền', 'PARAM_INVALID_VALUE', 'tax.arise.threshold');
    return threshold;
  }

  return {
    INSURANCE_BASES,
    FLOOR_MODES,
    TAX_METHODS,
    OT_METHODS,
    ARISE_MODES,
    UNAVAILABLE,
    assertAvailable,
    assertParams,
    insuredOf,
    insuranceBase,
    taxMethodOf,
    ariseThreshold
  };
});
