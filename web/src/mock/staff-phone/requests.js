// Dữ liệu giả cho màn Yêu cầu của nhân viên và bảng trượt "Khai ngày".

const COMMON = { month: '2026-11', deadline: '2026-12-03', asOf: '2026-11-26' };

// Điền sẵn từng bảng trượt khi mở từ ba dòng đầu của danh sách hành động.
export const PRESETS = {
  'xin-nghi': { date: '2026-11-25', type: 'phep-nam' },
  'khai-ot': { date: '2026-11-25', type: 'di-lam' },
  'ngay-khac': { date: '2026-11-27', type: 'lam-bu' }
};

export const REQUESTS = {
  'mac-dinh': {
    ...COMMON,
    leaveLeft: 17,
    balance: { left: 17, granted: 17, used: 0 },
    items: []
  },
  cho: {
    ...COMMON,
    leaveLeft: 18,
    balance: { left: 18, granted: 18, used: 0 },
    items: [
      {
        id: 'r3',
        date: '2026-11-24',
        title: 'Đi làm ngày lễ',
        range: '08:00–17:00',
        status: 'pend',
        statusLabel: 'Chờ xử lý'
      },
      { id: 'r2', date: '2026-11-05', title: 'OT', range: '', status: 'done', statusLabel: 'Đã đồng ý' },
      { id: 'r1', date: '2026-11-03', title: 'OT', range: '', status: 'done', statusLabel: 'Đã đồng ý' }
    ]
  }
};

export const DAY_FORM = {
  today: '2026-11-26',
  shiftName: 'Normal 1 · 08:00–17:00',
  shiftStart: '08:00',
  shiftEnd: '17:00',
  leaveLeft: 17
};
