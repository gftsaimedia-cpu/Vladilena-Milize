// Kịch bản ca đêm (ca-dem), chuyên trách viên (ctv) và thực tập sinh (tts), ngày 26/11/2026.
import { buildMonth, buildWeek } from './builders.js';
import { EST_NOTE, KPI_WAIT, LOCATION_NOTE, legend, requestActions } from './common.js';
import { BH_SPLIT, WORKING_PANEL, profileOf, scenario, workingShift } from './scenario-base.js';

const ME_AN_NIGHT = {
  initials: 'PA',
  name: 'Lê Phương An',
  short: 'An',
  roleLine: 'Nhân viên · Nhân viên',
  username: 'demo_nv2'
};
const ME_TRANG = {
  initials: 'TT',
  name: 'Phan Thanh Trang',
  short: 'Trang',
  roleLine: 'Chuyên trách viên · Fresher',
  username: 'demo_ctv1'
};
const ME_AN_INTERN = {
  initials: 'MA',
  name: 'Nguyễn Minh An',
  short: 'An',
  roleLine: 'Thực tập sinh · Bậc 1',
  username: 'demo_tts1'
};

export const CA_DEM = scenario({
  me: ME_AN_NIGHT,
  home: {
    greeting: 'Chào buổi trưa, An',
    dateLine: 'Thứ Năm, 26/11/2026 · Nhân viên · Nhân viên',
    shift: {
      status: { text: 'Chưa vào ca', tone: 'idle' },
      name: 'Night 2 · 22:00–07:00 hôm sau',
      meta: [[{ t: LOCATION_NOTE, tone: 'light' }], [{ t: 'Check-in mở từ 18:00 đến trước 07:00.', tone: 'mid' }]],
      cta: { kind: 'in', label: 'Check-in', hint: '· mở lúc 18:00', disabled: true }
    }
  },
  profile: profileOf(ME_AN_NIGHT, {
    shiftName: 'Night 2 · 22:00–07:00',
    schedule: 'T2 – T7',
    startDate: '2025-03-17',
    leaveLeft: 15
  }),
  attendance: {
    stats: [
      { value: 20, label: 'Ngày đủ công' },
      { value: 12, label: 'Phút đi trễ' },
      { value: 0, label: 'Thiếu Check-in/out' }
    ],
    ...buildMonth({ month: '2026-11', holidays: [24], today: 26, todayTag: 'Ca tối' }),
    legend: legend()
  },
  income: {
    netLabel: 'Thực nhận',
    net: 6875769,
    note: EST_NOTE(20),
    rows: [
      {
        label: 'Thu nhập',
        small: [
          { label: 'Tiền ngày công', value: 4673077 },
          { label: 'ca đêm', value: 2596154 },
          { label: 'lễ', value: 605769 },
          { label: 'phụ cấp', value: 1846154 }
        ],
        value: 9721154
      },
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
          total: 9721154,
          lines: [
            { label: 'Tiền ngày công', value: 4673077 },
            { label: 'Phụ cấp ca đêm', value: 2596154 },
            { label: 'Tiền ngày lễ', value: 605769 },
            { label: 'Phụ cấp', value: 1846154 },
            KPI_WAIT
          ]
        },
        {
          label: 'Các khoản trừ',
          total: -2845385,
          lines: [...BH_SPLIT, { label: 'Tạm ứng', value: -2215385 }]
        }
      ],
      netLabel: 'Thực nhận',
      net: 6875769
    }
  },
  requests: { actions: requestActions() },
  panels: {
    '2026-11-26': {
      title: 'Thứ Năm, 26/11 · ca Night 2 bắt đầu 22:00',
      sub: 'Chưa có lượt Check-in hôm nay',
      pill: null,
      action: false
    }
  }
});

export const CTV = scenario({
  me: ME_TRANG,
  home: {
    greeting: 'Chào buổi trưa, Trang',
    dateLine: 'Thứ Năm, 26/11/2026 · Chuyên trách viên · Fresher',
    shift: workingShift('07:46', 14, '4 giờ 29 phút', '12:16')
  },
  profile: profileOf(ME_TRANG, {
    shiftName: 'Normal 1 · 08:00–17:00',
    schedule: 'T2 – T7',
    startDate: '2025-09-01',
    leaveLeft: 17
  }),
  attendance: {
    stats: [
      { value: 20, label: 'Ngày đủ công' },
      { value: 0, label: 'Phút đi trễ' },
      { value: 0, label: 'Thiếu chấm, iSAT, nghỉ phép' }
    ],
    ...buildMonth({ month: '2026-11', holidays: [24], today: 26 }),
    legend: legend()
  },
  income: {
    netLabel: 'Thực nhận',
    net: 2000769,
    note: EST_NOTE(20),
    rows: [
      { label: 'Thu nhập', small: ['Tiền ngày công · 20 trên 26 ngày công chuẩn'], value: 4846154 },
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
          total: 4846154,
          lines: [{ label: 'Tiền ngày công', small: ['20 trên 26 ngày công chuẩn'], value: 4846154 }, KPI_WAIT]
        },
        {
          label: 'Các khoản trừ',
          total: -2845385,
          lines: [...BH_SPLIT, { label: 'Tạm ứng', value: -2215385 }]
        }
      ],
      netLabel: 'Thực nhận',
      net: 2000769
    }
  },
  requests: { actions: requestActions('còn 17 ngày') },
  panels: { '2026-11-26': WORKING_PANEL('07:46', '4 giờ 29 phút') }
});

export const TTS = scenario({
  me: ME_AN_INTERN,
  home: {
    greeting: 'Chào buổi trưa, An',
    dateLine: 'Thứ Năm, 26/11/2026 · Thực tập sinh · Bậc 1',
    shift: workingShift('07:48', 12, '4 giờ 28 phút', '12:16'),
    week: buildWeek({ marks: { 24: 'hol', 28: 'off', 29: 'off' } })
  },
  profile: profileOf(ME_AN_INTERN, {
    shiftName: 'Normal 1 · 08:00–17:00',
    schedule: 'T2 – T6',
    startDate: '2026-08-03',
    leaveLeft: null
  }),
  attendance: {
    stats: [
      { value: 17, label: 'Ngày đủ công' },
      { value: 0, label: 'Phút đi trễ' },
      { value: 0, label: 'Thiếu Check-in/out' }
    ],
    ...buildMonth({
      month: '2026-11',
      holidays: [24],
      today: 26,
      marks: { 7: { kind: 'off2', tag: 'Nghỉ' }, 14: { kind: 'off2', tag: 'Nghỉ' }, 21: { kind: 'off2', tag: 'Nghỉ' } }
    }),
    legend: legend(['ok', 'hol', 'today', 'off2', 'fut'])
  },
  income: {
    netLabel: 'Thực nhận',
    net: 409091,
    note: EST_NOTE(17),
    rows: [
      { label: 'Thu nhập', small: ['Tiền ngày công · 17 ngày'], value: 772727 },
      { label: 'Các khoản trừ', small: ['Tạm ứng · không đóng bảo hiểm'], value: -363636, signed: true },
      { label: 'Lương KPI', small: ['Thực tập sinh không có lương KPI'], text: 'Không có', tone: 'none' }
    ],
    breakdown: {
      groups: [
        { label: 'Thu nhập', total: 772727, lines: [{ label: 'Tiền ngày công', small: ['17 ngày'], value: 772727 }] },
        {
          label: 'Các khoản trừ',
          total: -363636,
          lines: [{ label: 'Tạm ứng', small: ['Không đóng bảo hiểm'], value: -363636 }]
        }
      ],
      netLabel: 'Thực nhận',
      net: 409091
    }
  },
  requests: {
    actions: [
      { icon: 'clock', label: 'Khai làm bù theo giờ' },
      { icon: 'edit', label: 'Khai một ngày khác' },
      { icon: 'history', label: 'Sửa giờ chấm công', soon: true }
    ]
  },
  panels: { '2026-11-26': WORKING_PANEL('07:48', '4 giờ 28 phút') }
});
