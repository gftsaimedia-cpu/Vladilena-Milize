// Dữ liệu giả cho màn Thu nhập của nhân viên. Mọi số tiền là số đồng nguyên do máy chủ tính (âm là khoản trừ).

const row = (label, amount, hint = '') => ({ label, hint, amount });
const KPI_WAIT = {
  kind: 'wait',
  title: 'KPI tháng 11',
  icon: 'target',
  heading: 'Chờ chấm đủ 5 điểm',
  text: 'Tính theo 5 thành phần của Quy chế lương 3P, bạn không tự chấm %. Khi đủ điểm, từng điểm và lương KPI sẽ hiện ở đây.'
};
const ATTEND_HOLD = {
  kind: 'facts',
  title: 'Phụ cấp chuyên cần',
  hint: 'Đang giữ',
  rows: [
    { label: 'Ngày đã nghỉ', hint: 'Nghỉ từ 3 ngày sẽ mất phụ cấp', value: '0 / 3' },
    { label: 'Giờ vượt ngưỡng', hint: 'Từ 24 giờ sẽ mất phụ cấp', value: '0 / 24' }
  ]
};
const ADVANCE = row('Tạm ứng', 0, 'Đã ứng 16/11 – 20/11');
const INTRO_EST = 'Số tính từ chấm công đến hôm nay. Phiếu lương chính thức gửi ngày 10/12.';
const NOV = { month: '2026-11', stateLabel: 'Chưa tính lương', official: false, intro: INTRO_EST, nextMonth: null };

/** Phiếu tháng 11 của một người (mỗi người một bộ số máy chủ trả sẵn). */
function nov({ prevMonth = null, amount, days, income, incomeTotal, deductions, deductionsTotal, sections }) {
  return {
    ...NOV,
    prevMonth,
    figure: {
      label: 'Thực nhận',
      amount,
      note: `Tính trên ${days} ngày công đến 26/11 · chưa phải lương chính thức`
    },
    groups: [
      { title: 'Thu nhập', total: incomeTotal, rows: income },
      { title: 'Các khoản trừ', total: deductionsTotal, rows: deductions }
    ],
    total: { label: 'Thực nhận', amount },
    sections
  };
}

const insurance = (bhxh, bhyt, bhtn) => [
  row('Bảo hiểm xã hội · 8%', -bhxh),
  row('Bảo hiểm y tế · 1,5%', -bhyt),
  row('Bảo hiểm thất nghiệp · 1%', -bhtn)
];
const advance = amount => ({ ...ADVANCE, amount: -amount });

export const INCOME = {
  'mac-dinh': {
    '2026-11': nov({
      prevMonth: '2026-10',
      amount: 4808654,
      days: 20,
      incomeTotal: 8365385,
      income: [
        row('Tiền ngày công', 6057692, '20 trên 26 ngày công chuẩn'),
        row('Phụ cấp đi lại', 865385),
        row('Phụ cấp chuyên cần', 1442308),
        row('Lương KPI', 0, 'Chờ chấm đủ điểm')
      ],
      deductionsTotal: -3556731,
      deductions: [...insurance(600000, 112500, 75000), advance(2769231)],
      sections: [ATTEND_HOLD, KPI_WAIT]
    }),
    '2026-10': {
      month: '2026-10',
      stateLabel: 'Chính thức',
      official: true,
      intro: 'Phiếu lương đã phê duyệt và đã trả lương ngày 26/11/2026.',
      prevMonth: null,
      nextMonth: '2026-11',
      figure: { label: 'Thực nhận', amount: 13228029, note: 'Phiếu lương chính thức · không còn thay đổi' },
      groups: [
        {
          title: 'Thu nhập',
          total: 17053846,
          rows: [
            row('Tiền ngày công', 7788462, '27 trên 26 ngày công chuẩn'),
            row('Phụ cấp đi lại', 1168269),
            row('Phụ cấp chuyên cần', 1947115),
            row('Lương KPI', 6150000, 'Tự đánh giá 82%')
          ]
        },
        {
          title: 'Các khoản trừ',
          total: -3825817,
          rows: [
            ...insurance(600000, 112500, 75000),
            row('Thuế TNCN', -38317),
            row('Tạm ứng', -3000000, 'Đã ứng giữa tháng 10')
          ]
        }
      ],
      total: { label: 'Thực nhận', amount: 13228029 },
      sections: [
        {
          kind: 'facts',
          title: 'KPI tháng 10',
          hint: 'Đã chốt cùng phiếu lương',
          rows: [
            {
              label: 'Cách tính',
              hint: 'Tháng 10 tính theo % tự đánh giá; 5 thành phần áp dụng từ tháng 11/2026',
              value: ''
            },
            { label: 'Tự đánh giá', hint: '', value: '82%' },
            { label: 'Lương KPI tối đa', hint: '', value: '7.500.000' },
            { label: 'Lương KPI', hint: '', value: '6.150.000' }
          ]
        },
        { ...ATTEND_HOLD, hint: 'Đã giữ' }
      ]
    }
  },

  'ca-dem': {
    '2026-11': nov({
      amount: 6875769,
      days: 20,
      incomeTotal: 9721154,
      income: [
        row('Tiền ngày công', 4673077, '20 trên 26 ngày công chuẩn'),
        row('Phụ cấp ca đêm', 1846154),
        row('Giờ làm đêm', 750000, 'Cộng 30% lương giờ'),
        row('Làm ngày lễ', 605769, '24/11'),
        row('Phụ cấp đi lại', 692308),
        row('Phụ cấp chuyên cần', 1153846),
        row('Lương KPI', 0, 'Chờ chấm đủ điểm')
      ],
      deductionsTotal: -2845385,
      deductions: [...insurance(480000, 90000, 60000), advance(2215385)],
      sections: [KPI_WAIT]
    })
  },

  ctv: {
    '2026-11': nov({
      amount: 2000769,
      days: 20,
      incomeTotal: 4846154,
      income: [row('Tiền ngày công', 4846154, '20 trên 26 ngày công chuẩn'), row('Lương KPI', 0, 'Chờ chấm đủ điểm')],
      deductionsTotal: -2845385,
      deductions: [...insurance(480000, 90000, 60000), advance(2215385)],
      sections: [KPI_WAIT]
    })
  },

  'quen-checkout': {
    '2026-11': nov({
      amount: 3667500,
      days: 18,
      incomeTotal: 6550000,
      income: [
        row('Tiền ngày công', 4750000, '18 trên 26 ngày công chuẩn'),
        row('Phụ cấp đi lại', 675000),
        row('Phụ cấp chuyên cần', 1125000),
        row('Lương KPI', 0, 'Chờ chấm đủ điểm')
      ],
      deductionsTotal: -2882500,
      deductions: [...insurance(520000, 97500, 65000), advance(2200000)],
      sections: [
        {
          kind: 'notice',
          icon: 'alert',
          text: '2 ngày thiếu Check-in/out chưa được tính công. Khi Admin xử lý xong, số này có thể tăng.'
        },
        ATTEND_HOLD,
        KPI_WAIT
      ]
    })
  },

  tts: {
    '2026-11': nov({
      amount: 409091,
      days: 17,
      incomeTotal: 772727,
      income: [row('Tiền ngày công', 772727, '17 ngày công')],
      deductionsTotal: -363636,
      deductions: [advance(363636)],
      sections: [
        {
          kind: 'wait',
          title: '',
          icon: 'info',
          heading: 'Thực tập sinh không có lương KPI và bảo hiểm',
          text: 'Theo chế độ của Thực tập sinh, hợp đồng dưới 3 tháng không đóng bảo hiểm.'
        }
      ]
    })
  }
};
