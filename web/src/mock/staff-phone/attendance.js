// Dữ liệu giả cho màn Chấm công của nhân viên: thẻ tháng, lịch ngày, hôm nay, gần đây, chi tiết từng ngày.

const SHIFT = 'Normal 1 · 08:00–17:00';
const TODAY = '2026-11-26';
const HOLIDAY = '2026-11-24';
const SUNDAYS = [1, 8, 15, 22, 29];
const ymd = d => `2026-11-${String(d).padStart(2, '0')}`;

// Giờ vào, giờ ra gốc của các ngày đủ công (tháng 11/2026). Phần tử thứ 3 (nếu có) là chuỗi "có mặt" máy chủ trả sẵn.
const PUNCHES = {
  2: ['07:52', '17:03'],
  3: ['07:55', '17:01'],
  4: ['07:49', '17:06'],
  5: ['07:58', '17:02'],
  6: ['07:53', '17:09'],
  7: ['07:57', '17:00'],
  9: ['07:50', '17:04'],
  10: ['07:56', '17:02'],
  11: ['07:54', '17:05'],
  12: ['08:01', '17:03'],
  13: ['07:52', '17:01'],
  14: ['07:59', '17:07'],
  16: ['07:48', '17:02'],
  17: ['07:55', '17:06'],
  18: ['07:51', '17:00'],
  19: ['07:57', '17:04'],
  20: ['07:53', '17:03'],
  21: ['08:06', '17:02'],
  23: ['07:47', '17:02'],
  25: ['07:56', '17:08', '9 giờ 11 phút']
};

function kindOf(d) {
  if (SUNDAYS.includes(d)) return 'sun';
  if (ymd(d) === HOLIDAY) return 'hol';
  if (ymd(d) === TODAY) return 'today';
  return d > 26 ? 'fut' : 'ok';
}

const DAYS = Array.from({ length: 30 }, (_, i) => ({ date: ymd(i + 1), kind: kindOf(i + 1) }));

const mins = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Chi tiết một ngày (giả lập kết quả máy chủ trả). */
export function attendanceDay(date) {
  const d = Number(date.slice(8, 10));
  const base = { date, shift: SHIFT, punches: [], rows: [] };
  if (date === HOLIDAY) {
    return {
      ...base,
      status: { label: 'Ngày lễ', cls: 'p-draft' },
      rows: [{ label: 'Công ngày này', value: 'Ngày lễ, nghỉ' }]
    };
  }
  if (date === TODAY) {
    return {
      ...base,
      status: { label: 'Đang trong ca', cls: 'live' },
      punches: [
        { title: 'Lượt 1 · 07:58 → đang làm', note: '4 giờ 17 phút có mặt · giờ bấm gốc, luôn được giữ nguyên' }
      ],
      rows: [
        { label: 'Công ngày này', value: 'Đang tính' },
        { label: 'Vào muộn, về sớm', value: '0 phút' }
      ]
    };
  }
  const p = PUNCHES[d];
  if (!p) return { ...base, status: { label: 'Không có công', cls: 'p-draft' }, rows: [] };
  const total = mins(p[1]) - mins(p[0]);
  const present = p[2] || `${Math.floor(total / 60)} giờ ${total % 60} phút`;
  const late = Math.max(0, mins(p[0]) - mins('08:00'));
  return {
    ...base,
    status: { label: 'Đủ công', cls: 'p-done' },
    punches: [{ title: `Lượt 1 · ${p[0]} → ${p[1]}`, note: `${present} có mặt · giờ bấm gốc, luôn được giữ nguyên` }],
    rows: [
      { label: 'Công ngày này', value: '8 giờ' },
      { label: 'Vào muộn, về sớm', value: `${late} phút` }
    ]
  };
}

export const ATTENDANCE = {
  '2026-11': {
    month: '2026-11',
    stateLabel: 'Chưa tính lương',
    prevMonth: null,
    nextMonth: null,
    shiftLine: `${SHIFT} · làm T2 – T7`,
    stats: [
      { value: '20', label: 'Ngày đủ công' },
      { value: '7', label: 'Phút đi trễ' },
      { value: '0', label: 'Phút bị trừ' }
    ],
    zeroNote: 'Không ngày nào thiếu chấm, không iSAT, chưa nghỉ phép',
    days: DAYS,
    sheetDate: '2026-11-25',
    today: {
      date: TODAY,
      time: '07:58 → đang làm',
      note: 'Vào sớm 2 phút · đã làm 4 giờ 17 phút',
      statusLabel: 'Đang trong ca'
    },
    recent: [
      { date: '2026-11-25', note: '', value: '07:56 – 17:08', valueNote: '', muted: false },
      { date: '2026-11-24', note: 'Ngày lễ, nghỉ', value: '—', valueNote: '', muted: true },
      { date: '2026-11-23', note: '', value: '07:47 – 17:02', valueNote: '', muted: false },
      { date: '2026-11-21', note: '', value: '08:06 – 17:02', valueNote: 'Trễ 6 phút, không bị trừ', muted: false }
    ]
  }
};
