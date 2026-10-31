// Dữ liệu giả cho màn "Hôm nay" của nhân viên (điện thoại). Mỗi kịch bản (?kb=) là một người dùng/trạng thái khác nhau.
// Số tiền là số đồng nguyên do máy chủ tính; chữ trong facts là chuỗi máy chủ trả về sẵn.

const COMMON = {
  today: '2026-11-26',
  month: '2026-11',
  requestDeadline: '2026-12-03',
  payslipDate: '2026-12-10',
  greeting: 'Chào buổi trưa'
};

const GPS_NOTE = {
  icon: 'pin',
  lead: 'Bật vị trí khi Check-in.',
  text: 'Bạn phải ở trong vùng chấm công. Vị trí chỉ dùng để kiểm tra lúc bấm, không được lưu.'
};

const TODO_FULL = [
  {
    tone: 'ok',
    icon: 'check',
    title: 'Chấm công tháng 11 đã đủ',
    hint: 'Không ngày nào thiếu Check-in hay Check-out'
  }
];

export const HOME = {
  'mac-dinh': {
    ...COMMON,
    user: { name: 'Linh', initials: 'ML', roleLine: 'Nhân viên · HDO' },
    shift: {
      name: 'Normal 1 · 08:00–17:00',
      state: 'working',
      checkIn: '07:58',
      checkInNote: 'sớm 2 phút',
      worked: '4 giờ 17 phút',
      now: '12:15',
      notes: []
    },
    alert: null,
    pay: { amount: 4808654, days: 20, asOf: '2026-11-26' },
    facts: [
      { label: 'Ngày đủ công', hint: '', value: '20', tone: '' },
      { label: 'Đi trễ', hint: 'Dưới 15 phút nên không bị trừ lương', value: '7 phút', tone: '' },
      { label: 'Chuyên cần', hint: 'Nghỉ từ 3 ngày sẽ mất phụ cấp chuyên cần', value: 'Đã nghỉ 0 ngày', tone: '' },
      { label: 'Phép năm còn', hint: '', value: '17 ngày', tone: '' }
    ],
    todo: [
      ...TODO_FULL,
      {
        tone: 'ok',
        icon: 'check',
        title: 'Không có yêu cầu nào đang chờ xử lý',
        hint: 'Muốn xin nghỉ hoặc khai OT, vào mục Yêu cầu'
      }
    ]
  },

  'ca-dem': {
    ...COMMON,
    user: { name: 'An', initials: 'PA', roleLine: 'Nhân viên · Nhân viên' },
    shift: {
      name: 'Night 2 · 22:00–07:00 hôm sau',
      state: 'not-started',
      locked: true,
      lockedAt: '18:00',
      now: '12:16',
      notes: [
        GPS_NOTE,
        {
          icon: 'info',
          lead: '',
          text: 'Ngoài giờ ca: Check-in mở từ 18:00 đến trước 07:00. Đi làm ngoài giờ ca thì nhờ Admin ghi giờ.'
        }
      ]
    },
    alert: null,
    pay: { amount: 6875769, days: 20, asOf: '2026-11-26' },
    facts: [
      { label: 'Ngày đủ công', hint: '', value: '20', tone: '' },
      { label: 'Đi trễ', hint: '', value: '12 phút', tone: '' },
      { label: 'Thiếu Check-in/out', hint: '', value: '0 ngày', tone: 'z' }
    ],
    todo: TODO_FULL
  },

  ctv: {
    ...COMMON,
    user: { name: 'Trang', initials: 'TT', roleLine: 'Chuyên trách viên · Fresher' },
    shift: {
      name: 'Normal 1 · 08:00–17:00',
      state: 'working',
      checkIn: '07:46',
      checkInNote: 'sớm 14 phút',
      worked: '4 giờ 29 phút',
      now: '12:16',
      notes: []
    },
    alert: null,
    pay: { amount: 2000769, days: 20, asOf: '2026-11-26' },
    facts: [
      { label: 'Ngày đủ công', hint: '', value: '20', tone: '' },
      { label: 'Đi trễ', hint: '', value: '0 phút', tone: '' },
      { label: 'Phép năm còn', hint: '', value: '17 ngày', tone: '' }
    ],
    todo: TODO_FULL
  },

  'quen-checkout': {
    ...COMMON,
    user: { name: 'Hiếu', initials: 'GH', roleLine: 'Nhân viên · Chuyên viên' },
    shift: {
      name: 'Normal 1 · 08:00–17:00',
      state: 'not-started',
      locked: false,
      now: '12:16',
      notes: [GPS_NOTE]
    },
    alert: {
      title: 'Ngày 25/11 quên Check-out, và 1 ngày khác',
      text: 'Ngày công đó đang chờ Admin xử lý. Nếu hôm đó bạn có đi làm, gửi yêu cầu sửa giờ để được xử lý nhanh hơn.'
    },
    pay: { amount: 3667500, days: 18, asOf: '2026-11-26' },
    facts: [
      { label: 'Ngày đủ công', hint: '', value: '18', tone: '' },
      { label: 'Đi trễ', hint: '', value: '0 phút', tone: '' },
      { label: 'Thiếu Check-in/out', hint: '', value: '2 ngày', tone: 'bad' }
    ],
    todo: [
      {
        tone: 'pend',
        icon: 'clock',
        title: '2 ngày thiếu Check-in/out chờ Admin xử lý',
        hint: '25/11 và 1 ngày khác · xem trong Chấm công'
      }
    ]
  },

  tts: {
    ...COMMON,
    user: { name: 'An', initials: 'MA', roleLine: 'Thực tập sinh · Bậc 1' },
    shift: {
      name: 'Normal 1 · 08:00–17:00',
      state: 'working',
      checkIn: '07:48',
      checkInNote: 'sớm 12 phút',
      worked: '4 giờ 28 phút',
      now: '12:16',
      notes: []
    },
    alert: null,
    pay: { amount: 409091, days: 17, asOf: '2026-11-26' },
    facts: [
      { label: 'Ngày đủ công', hint: '', value: '17', tone: '' },
      { label: 'Đi trễ', hint: '', value: '0 phút', tone: '' },
      { label: 'Thiếu Check-in/out', hint: '', value: '0 ngày', tone: 'z' }
    ],
    todo: TODO_FULL
  }
};
