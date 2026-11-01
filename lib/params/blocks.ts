'use strict';
// Danh mục khối có sẵn của bảng quyền lợi: hàng của bảng, chỉ ĐỌC.
// Mỗi khối là DỮ LIỆU mô tả: mã, nhãn, thành phần của khung (① đến ⑧), cách biết khối bật hay tắt cho một chức vụ, giá trị chính và các trường chi tiết.
// Khối do C&B thêm (block.def.<mã>) nối vào đúng danh sách này; khối có sẵn không đổi tên, không xoá.
//   on:    { kind: 'always' } luôn bật · { kind: 'flag', tail } cờ type.<mã>.<tail> · { kind: 'positive', tail } bật khi type.<mã>.<tail> > 0
//          · { kind: 'contract' } theo hợp đồng mặc định của chức vụ (⑦ ⑧ chỉ hiển thị)
//   value: { tail } giá trị của chức vụ type.<mã>.<tail>, hoặc { global } khoá toàn cục khi chức vụ không ghi đè (type.<mã>.<đuôi của khoá toàn cục>)
//   fields: các đuôi type.<mã>.<tail> hiện trong chi tiết của ô
const BLOCKS = Object.freeze(
  [
    {
      id: 'workday',
      component: '1',
      label: 'Lương cơ bản',
      on: { kind: 'always' },
      value: { tail: 'workdays', unit: 'day', label: 'Ngày công chuẩn' },
      fields: [
        'workdays',
        'dows',
        'probationPayPct',
        'benefit.paidHoliday',
        'benefit.paidLeave',
        'benefit.isat',
        'benefit.approvedLeave'
      ]
    },
    {
      id: 'overtime',
      component: '2',
      label: 'Làm thêm (OT)',
      on: { kind: 'flag', tail: 'benefit.ot' },
      value: { global: 'ot.rate', tail: 'ot.rate', unit: 'ratio', label: 'Hệ số OT' },
      fields: ['benefit.ot', 'ot.weekendRate']
    },
    {
      id: 'makeup',
      component: '2',
      label: 'Làm bù',
      on: { kind: 'flag', tail: 'benefit.makeup' },
      value: { global: 'holiday.makeupRate', unit: 'ratio', label: 'Hệ số làm bù ngày lễ' },
      fields: ['benefit.makeup']
    },
    {
      id: 'travel',
      component: '3',
      label: 'Phụ cấp đi lại',
      on: { kind: 'positive', tail: 'travel' },
      value: { tail: 'travel', unit: 'ratio', label: 'Tỷ lệ lương cơ bản' },
      fields: ['travel']
    },
    {
      id: 'attendance',
      component: '3',
      label: 'Phụ cấp chuyên cần',
      on: { kind: 'positive', tail: 'attendance' },
      value: { tail: 'attendance', unit: 'ratio', label: 'Tỷ lệ lương cơ bản' },
      fields: ['attendance', 'maxAbsent']
    },
    {
      id: 'flex',
      component: '3',
      label: 'Phụ cấp ca Flex',
      on: { kind: 'always' },
      value: { global: 'shift.flex.bonus', tail: 'flexBonus', unit: 'ratio', label: 'Tỷ lệ lương ngày' },
      fields: ['flexBonus']
    },
    {
      id: 'night',
      component: '3',
      label: 'Phụ cấp ca đêm',
      on: { kind: 'always' },
      value: { global: 'shift.night.bonus', unit: 'ratio', label: 'Tỷ lệ lương ngày' },
      fields: ['nightOptions']
    },
    {
      id: 'kpi',
      component: '4',
      label: 'Lương KPI',
      on: { kind: 'flag', tail: 'benefit.kpi' },
      value: { tail: 'kpiPass', unit: 'percent', label: 'Mốc đạt KPI' },
      fields: ['benefit.kpi', 'kpiPass']
    },
    {
      id: 'lateEarly',
      component: '5',
      label: 'Trừ đi trễ, về sớm',
      on: { kind: 'always' },
      value: { global: 'attendance.graceMin', unit: 'minute', label: 'Số phút được miễn' },
      fields: []
    },
    {
      id: 'advance',
      component: '6',
      label: 'Tạm ứng',
      on: { kind: 'always' },
      value: { global: 'advance.rate', tail: 'advanceRate', unit: 'ratio', label: 'Tỷ lệ tạm ứng' },
      fields: ['advanceRate']
    },
    {
      id: 'insurance',
      component: '7',
      label: 'Bảo hiểm',
      on: { kind: 'contract' },
      value: { tail: 'defaultContract', unit: null, label: 'Hợp đồng mặc định' },
      fields: ['defaultContract']
    },
    {
      id: 'tax',
      component: '8',
      label: 'Thuế TNCN',
      on: { kind: 'contract' },
      value: { tail: 'defaultContract', unit: null, label: 'Hợp đồng mặc định' },
      fields: ['defaultContract']
    }
  ].map(block => Object.freeze(block))
);

export = { BLOCKS };
