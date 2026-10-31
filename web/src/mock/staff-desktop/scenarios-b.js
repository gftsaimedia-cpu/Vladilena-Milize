// Kịch bản quên Check-out hôm qua (quen-checkout) và có yêu cầu chờ xử lý (yeu-cau-cho), ngày 26/11/2026.
import { buildMonth, buildWeek } from './builders.js';
import { EST_NOTE, KPI_WAIT, LOCATION_NOTE, legend, requestActions } from './common.js';
import { BH_SPLIT, WORKING_PANEL, profileOf, scenario, workingShift } from './scenario-base.js';

const ME_HIEU = {
  initials: 'GH',
  name: 'Ngô Gia Hiếu',
  short: 'Hiếu',
  roleLine: 'Nhân viên · Chuyên viên',
  username: 'demo_nv3'
};
const ME_UYEN = {
  initials: 'AU',
  name: 'Võ Anh Uyên',
  short: 'Uyên',
  roleLine: 'Chuyên trách viên · Practitioner',
  username: 'demo_ctv2'
};

export const QUEN_CHECKOUT = scenario({
  me: ME_HIEU,
  home: {
    greeting: 'Chào buổi trưa, Hiếu',
    dateLine: 'Thứ Năm, 26/11/2026 · Nhân viên · Chuyên viên',
    shift: {
      status: { text: 'Chưa vào ca', tone: 'idle' },
      name: 'Normal 1 · 08:00–17:00',
      meta: [[{ t: LOCATION_NOTE, tone: 'light' }]],
      cta: { kind: 'in', label: 'Check-in', hint: '· 12:16', gold: true }
    },
    week: buildWeek({ marks: { 24: 'hol', 25: 'miss', 29: 'off' } })
  },
  profile: profileOf(ME_HIEU, {
    shiftName: 'Normal 1 · 08:00–17:00',
    schedule: 'T2 – T7',
    startDate: '2024-11-11',
    leaveLeft: 12
  }),
  attendance: {
    stats: [
      { value: 18, label: 'Ngày đủ công' },
      { value: 0, label: 'Phút đi trễ' },
      { value: 2, label: 'Thiếu Check-in/out', bad: true }
    ],
    ...buildMonth({
      month: '2026-11',
      holidays: [24],
      today: 26,
      todayTag: 'Chưa vào',
      marks: { 9: { kind: 'miss', tag: 'Thiếu' }, 25: { kind: 'miss', tag: 'Thiếu' } }
    }),
    legend: legend(['ok', 'hol', 'today', 'miss', 'fut']),
    defaultDate: '2026-11-25',
    defaultPanel: {
      title: 'Thứ Tư, 25/11 · Check-in 07:58, không có Check-out',
      sub: 'Ngày công chờ Admin xử lý · nếu hôm đó bạn có đi làm, gửi yêu cầu sửa giờ (sắp có)',
      pill: { text: 'Thiếu Check-out', cls: 'p-err' },
      action: false
    }
  },
  income: {
    netLabel: 'Thực nhận',
    net: 3667500,
    note: EST_NOTE(18),
    alert: {
      icon: 'alert',
      text: '2 ngày thiếu Check-in/out chưa tính công. Khi Admin xử lý xong, số này có thể tăng.'
    },
    rows: [
      {
        label: 'Thu nhập',
        small: [
          { label: 'Tiền ngày công', value: 4750000 },
          { label: 'phụ cấp', value: 1800000 }
        ],
        value: 6550000
      },
      {
        label: 'Các khoản trừ',
        small: [
          { label: 'Bảo hiểm', value: 682500 },
          { label: 'tạm ứng', value: 2200000 }
        ],
        value: -2882500,
        signed: true
      },
      { label: 'Phụ cấp chuyên cần', small: ['Đã nghỉ 0/3 ngày', 'vượt 0/24 giờ'], text: 'Đang giữ', tone: 'mid' },
      KPI_WAIT
    ],
    breakdown: {
      groups: [
        {
          label: 'Thu nhập',
          total: 6550000,
          lines: [{ label: 'Tiền ngày công', value: 4750000 }, { label: 'Phụ cấp', value: 1800000 }, KPI_WAIT]
        },
        {
          label: 'Các khoản trừ',
          total: -2882500,
          lines: [
            { label: 'Bảo hiểm xã hội · 8%', value: -520000 },
            { label: 'Bảo hiểm y tế · 1,5%', value: -97500 },
            { label: 'Bảo hiểm thất nghiệp · 1%', value: -65000 },
            { label: 'Tạm ứng', value: -2200000 }
          ]
        }
      ],
      netLabel: 'Thực nhận',
      net: 3667500
    }
  },
  requests: { actions: requestActions() },
  panels: {}
});
// Ngày hôm qua là ngày mở sẵn của kịch bản này.
QUEN_CHECKOUT.panels['2026-11-25'] = QUEN_CHECKOUT.months['2026-11'].attendance.defaultPanel;

export const YEU_CAU_CHO = scenario({
  me: ME_UYEN,
  home: {
    greeting: 'Chào buổi trưa, Uyên',
    dateLine: 'Thứ Năm, 26/11/2026 · Chuyên trách viên · Practitioner',
    shift: workingShift('07:51', 9, '4 giờ 27 phút', '12:17'),
    week: buildWeek({ marks: { 24: 'pend', 29: 'off' } }),
    recent: [
      { label: 'Thứ Tư, 25/11', range: '08:06 – 17:11' },
      { label: 'Thứ Ba, 24/11', range: '07:57 – 17:07' },
      { label: 'Thứ Hai, 23/11', range: '07:50 – 17:03' }
    ]
  },
  profile: profileOf(ME_UYEN, {
    shiftName: 'Normal 1 · 08:00–17:00',
    schedule: 'T2 – T7',
    startDate: '2025-01-06',
    leaveLeft: 18
  }),
  attendance: {
    stats: [
      { value: 21, label: 'Ngày đủ công' },
      { value: 10, label: 'Phút đi trễ · không bị trừ' },
      { value: 0, label: 'Thiếu chấm, iSAT, nghỉ phép' }
    ],
    ...buildMonth({
      month: '2026-11',
      today: 26,
      marks: {
        3: { tag: 'OT', small: true },
        5: { tag: 'OT', small: true },
        24: { kind: 'pend', tag: 'Chờ' }
      }
    }),
    legend: legend(['ok', 'hol', 'today', 'pend', 'fut'])
  },
  income: {
    netLabel: 'Thực nhận',
    net: 2346923,
    note: EST_NOTE(21),
    alert: {
      icon: 'info',
      text: '1 yêu cầu chờ xử lý (Đi làm ngày lễ 24/11) chưa tính vào thu nhập. Khi Admin đồng ý, số này sẽ thay đổi.'
    },
    rows: [
      { label: 'Thu nhập', small: ['Tiền ngày công · 21 ngày, gồm OT đã đồng ý'], value: 5192308 },
      {
        label: 'Các khoản trừ',
        small: [
          { label: 'Bảo hiểm', value: 630000 },
          { label: 'tạm ứng', value: 2215385 }
        ],
        value: -2845385,
        signed: true
      },
      KPI_WAIT
    ],
    breakdown: {
      groups: [
        {
          label: 'Thu nhập',
          total: 5192308,
          lines: [{ label: 'Tiền ngày công', small: ['21 ngày, gồm OT đã đồng ý'], value: 5192308 }, KPI_WAIT]
        },
        {
          label: 'Các khoản trừ',
          total: -2845385,
          lines: [...BH_SPLIT, { label: 'Tạm ứng', value: -2215385 }]
        }
      ],
      netLabel: 'Thực nhận',
      net: 2346923
    }
  },
  requests: {
    cap: 'Tháng 11 · 1 chờ xử lý',
    actions: requestActions('còn 18 ngày'),
    items: [
      {
        day: '24',
        mon: 'T11',
        title: 'Đi làm ngày lễ',
        sub: 'Thứ Ba, 24/11 · 08:00–17:00',
        pill: { text: 'Chờ xử lý', cls: 'p-pend' }
      },
      { day: '05', mon: 'T11', title: 'OT', sub: 'Thứ Năm, 05/11', pill: { text: 'Đã đồng ý', cls: 'p-done' } },
      { day: '03', mon: 'T11', title: 'OT', sub: 'Thứ Ba, 03/11', pill: { text: 'Đã đồng ý', cls: 'p-done' } }
    ]
  },
  panels: { '2026-11-26': WORKING_PANEL('07:51', '4 giờ 27 phút') }
});
