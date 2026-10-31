// Kịch bản "linh": Trương Mỹ Linh, nhân viên, đang trong ca. Có 2 tháng: 11/2026 (chưa tính lương) và 10/2026 (đã chốt).
import { buildMonth, buildWeek } from './builders.js';
import { EST_NOTE, KPI_WAIT, REQUEST_CAP, legend, requestActions } from './common.js';

const ME = { initials: 'ML', name: 'Trương Mỹ Linh', short: 'Linh', roleLine: 'Nhân viên · HDO', username: 'demo_nv4' };

const HOME = {
  greeting: 'Chào buổi trưa, Linh',
  dateLine: 'Thứ Năm, 26/11/2026 · Nhân viên · HDO',
  shift: {
    status: { text: 'Đang trong ca', tone: 'on' },
    name: 'Normal 1 · 08:00–17:00',
    meta: [[{ t: 'Vào 07:58 ' }, { t: '· sớm 2 phút', tone: 'dim' }], [{ t: 'Đã làm 4 giờ 17 phút' }]],
    cta: { kind: 'out', label: 'Check-out', hint: '· 12:15' }
  },
  week: buildWeek(),
  recent: [
    { label: 'Thứ Tư, 25/11', range: '07:56 – 17:08' },
    { label: 'Thứ Hai, 23/11', range: '07:47 – 17:02' },
    { label: 'Thứ Bảy, 21/11', range: '08:06 – 17:02' }
  ]
};

const PROFILE = {
  fullName: ME.name,
  username: ME.username,
  roleLine: ME.roleLine,
  shiftName: 'Normal 1 · 08:00–17:00',
  schedule: 'T2 – T7',
  startDate: '2025-08-04',
  leaveLeft: 17,
  account: 'Đang dùng'
};

const NOV_PANELS = {
  '2026-11-26': {
    title: 'Thứ Năm, 26/11 · 07:58 → đang làm',
    sub: 'Lượt 1 · 4 giờ 17 phút tới giờ này',
    pill: null,
    action: true
  },
  '2026-11-25': {
    title: 'Thứ Tư, 25/11 · 07:56 → 17:08',
    sub: 'Lượt 1 · 9 giờ 11 phút có mặt · công ngày này 8 giờ · vào muộn, về sớm 0 phút',
    pill: { text: 'Đủ công', cls: 'p-done' },
    action: true
  }
};

const NOV = {
  month: '2026-11',
  prev: '2026-10',
  next: null,
  attendance: {
    title: 'Chấm công tháng 11',
    cap: { text: 'Chưa tính lương', tone: 'est' },
    stats: [
      { value: 20, label: 'Ngày đủ công' },
      { value: 7, label: 'Phút đi trễ · không bị trừ' },
      { value: 0, label: 'Thiếu chấm, iSAT, nghỉ phép' }
    ],
    ...buildMonth({ month: '2026-11', holidays: [24], today: 26 }),
    legend: legend(),
    defaultDate: '2026-11-26',
    defaultPanel: NOV_PANELS['2026-11-26']
  },
  income: {
    title: 'Thu nhập tháng 11',
    netLabel: 'Thực nhận',
    net: 4808654,
    estimated: true,
    note: EST_NOTE(20),
    lock: null,
    alert: null,
    rows: [
      { label: 'Thu nhập', value: 8365385 },
      {
        label: 'Các khoản trừ',
        small: [
          { label: 'Bảo hiểm', value: 787500 },
          { label: 'tạm ứng', value: 2769231 }
        ],
        value: -3556731,
        signed: true
      },
      { label: 'Phụ cấp chuyên cần', small: ['Đã nghỉ 0/3 ngày', 'vượt 0/24 giờ'], text: 'Đang giữ', tone: 'mid' },
      KPI_WAIT
    ],
    breakdown: {
      groups: [
        {
          label: 'Thu nhập',
          total: 8365385,
          lines: [
            { label: 'Tiền ngày công', small: ['20 trên 26 ngày công chuẩn'], value: 6057692 },
            { label: 'Phụ cấp đi lại', value: 865385 },
            {
              label: 'Phụ cấp chuyên cần',
              small: ['Đang giữ · nghỉ 0/3 ngày, vượt 0/24 giờ'],
              value: 1442308
            },
            KPI_WAIT
          ]
        },
        {
          label: 'Các khoản trừ',
          total: -3556731,
          lines: [
            { label: 'Bảo hiểm xã hội · 8%', value: -600000 },
            { label: 'Bảo hiểm y tế · 1,5%', value: -112500 },
            { label: 'Bảo hiểm thất nghiệp · 1%', value: -75000 },
            { label: 'Tạm ứng', small: ['Đã ứng 16/11 – 20/11'], value: -2769231 }
          ]
        }
      ],
      netLabel: 'Thực nhận',
      net: 4808654
    },
    links: ['calc']
  },
  kpi: null,
  requests: {
    cap: REQUEST_CAP,
    actions: requestActions('còn 17 ngày'),
    items: [],
    empty: { title: 'Chưa có yêu cầu nào trong tháng 11', text: 'Yêu cầu bạn gửi sẽ hiện ở đây cùng trạng thái xử lý.' }
  }
};

const OCT = {
  month: '2026-10',
  prev: null,
  next: '2026-11',
  attendance: {
    title: 'Chấm công tháng 10',
    cap: { text: 'Chính thức · đã chốt công', tone: 'done' },
    stats: [
      { value: 27, label: 'Ngày đủ công' },
      { value: 0, label: 'Ngày nghỉ' },
      { value: 0, label: 'Thiếu chấm' }
    ],
    ...buildMonth({ month: '2026-10' }),
    legend: [{ swatch: 'ok', text: 'Đủ công' }, { text: 'Tháng đã chốt công · bấm vào một ngày để xem giờ vào, ra' }],
    defaultDate: null,
    defaultPanel: null
  },
  income: {
    title: 'Thu nhập tháng 10',
    netLabel: 'Thực nhận',
    net: 13228029,
    estimated: false,
    note: 'Phiếu lương chính thức · đã trả lương ngày 26/11/2026',
    lock: 'Không còn thay đổi',
    alert: null,
    rows: [
      {
        label: 'Thu nhập',
        small: [
          { label: 'Tiền ngày công', value: 7788462 },
          { label: 'phụ cấp', value: 3115384 },
          { label: 'lương KPI', value: 6150000 }
        ],
        value: 17053846
      },
      {
        label: 'Các khoản trừ',
        small: [
          { label: 'Bảo hiểm', value: 787500 },
          { label: 'thuế TNCN', value: 38317 },
          { label: 'tạm ứng', value: 3000000 }
        ],
        value: -3825817,
        signed: true
      },
      { label: 'Phụ cấp chuyên cần', small: ['Đã nghỉ 0/3 ngày', 'vượt 0/24 giờ'], text: 'Đã giữ', tone: 'mid' }
    ],
    breakdown: {
      groups: [
        {
          label: 'Thu nhập',
          total: 17053846,
          lines: [
            { label: 'Tiền ngày công', value: 7788462 },
            { label: 'Phụ cấp', value: 3115384 },
            { label: 'Lương KPI', value: 6150000 }
          ]
        },
        {
          label: 'Các khoản trừ',
          total: -3825817,
          lines: [
            { label: 'Bảo hiểm xã hội · 8%', value: -600000 },
            { label: 'Bảo hiểm y tế · 1,5%', value: -112500 },
            { label: 'Bảo hiểm thất nghiệp · 1%', value: -75000 },
            { label: 'Thuế TNCN', value: -38317 },
            { label: 'Tạm ứng', value: -3000000 }
          ]
        }
      ],
      netLabel: 'Thực nhận',
      net: 13228029
    },
    links: ['calc', 'a4']
  },
  kpi: {
    title: 'KPI tháng 10',
    cap: 'Đã chốt cùng phiếu lương',
    rows: [
      {
        label: 'Cách tính',
        small: ['Tháng 10 tính theo % tự đánh giá', '5 thành phần áp dụng từ 11/2026'],
        text: ''
      },
      { label: 'Tự đánh giá', text: '82%' },
      { label: 'Lương KPI tối đa', value: 7500000 },
      { label: 'Lương KPI', value: 6150000 }
    ]
  },
  requests: null
};

export const LINH = {
  me: ME,
  home: HOME,
  profile: PROFILE,
  currentMonth: '2026-11',
  months: { '2026-11': NOV, '2026-10': OCT },
  panels: NOV_PANELS
};
