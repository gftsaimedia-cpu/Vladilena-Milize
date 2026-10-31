// Dữ liệu giả: Cài đặt › Cách tính lương (bảng công thức + sáu ngăn kéo).
// Số ở cột Ví dụ và Thực nhận là số máy chủ trả (phiếu tháng 11 của Trương Mỹ Linh), giao diện không tự cộng.

export const PAY_FORMULA = {
  adjustedCount: 1,
  undecidedCount: 8,
  exampleNote: 'phiếu tháng 11 của Trương Mỹ Linh',
  recent: '',
  // status: 'default' | 'adjusted' | 'law' · drawer: tên ngăn kéo mở bằng nút Sửa (null = do kế toán cài)
  rows: [
    {
      key: 'ngay-cong',
      op: '+',
      name: 'Lương theo ngày công',
      desc: 'Lương cơ bản ÷ ngày công chuẩn × ngày được trả lương',
      status: 'default',
      example: 6057692,
      drawer: 'luong-ngay-cong'
    },
    {
      key: 'lam-them',
      op: '+',
      name: 'Tiền làm thêm giờ',
      desc: 'Lương giờ × hệ số: ngày thường ×2, ngày lễ ×3',
      status: 'default',
      example: 0,
      drawer: 'lam-them'
    },
    {
      key: 'phu-cap',
      op: '+',
      name: 'Phụ cấp',
      desc: 'Đi lại + Chuyên cần + Flex + Ca đêm',
      status: 'default',
      example: 2307693,
      drawer: 'phu-cap'
    },
    {
      key: 'luong-kpi',
      op: '+',
      name: 'Lương KPI',
      desc: 'Lương KPI tối đa theo bậc × tổng điểm KPI',
      status: 'adjusted',
      example: 0,
      drawer: 'luong-kpi'
    },
    {
      key: 'khau-tru',
      op: '−',
      name: 'Khấu trừ đi muộn, về sớm',
      desc: 'Trừ theo phút khi muộn quá 15 phút, mỗi nấc 30 phút',
      status: 'default',
      example: 0,
      drawer: 'khau-tru'
    },
    {
      key: 'tam-ung',
      op: '−',
      name: 'Tạm ứng',
      desc: '80% lương ngày công, tính đến ngày 15',
      status: 'default',
      example: 2769231,
      drawer: 'tam-ung'
    },
    {
      key: 'bao-hiem',
      op: '−',
      name: 'Bảo hiểm',
      desc: 'BHXH 8% · BHYT 1,5% · BHTN 1%',
      status: 'law',
      example: 787500,
      drawer: null
    },
    {
      key: 'thue',
      op: '−',
      name: 'Thuế TNCN',
      desc: 'Lũy tiến, hoặc khấu trừ 10% theo hợp đồng',
      status: 'law',
      example: 0,
      drawer: null
    }
  ],
  total: 4808654,
  totalDesc: 'Số tiền chuyển khoản cho nhân viên',
  open: {
    total: 8,
    items: [
      { tag: 'Lương theo ngày công', text: 'Cách tính lương' },
      { tag: 'Tiền làm thêm giờ', text: 'Phụ trội OT ban đêm áp dụng cho ai' },
      { tag: 'Tiền làm thêm giờ', text: 'Làm bù rơi vào ngày lễ' },
      { tag: 'Lương KPI', text: 'Tổng điểm dưới mức đạt' },
      { tag: 'Lương KPI', text: 'Base Wework dưới mức đạt' }
    ]
  }
};

// ---- Ngăn kéo: mô tả theo khối để một thành phần vẽ chung ----
// section = { title, right: [...], items: [...] }
//   right: { kind: 'select'|'num'|'money'|'text'|'pill'|'link', value?, options?, unit?, text?, cls?, to?, minWidth? }
//   item : { kind: 'row', label, small?, pill?, field } | { kind: 'src', text, pill?, big? }
//          | { kind: 'add', text, row?: { field } , action?: 'position' }
//   field: { type: 'money'|'num'|'select', value, unit?, prefix?, options? }
const money = value => ({ type: 'money', value });
const pct = value => ({ type: 'num', value, unit: '%' });
const days = value => ({ type: 'num', value, unit: 'ngày' });
const pick = (value, options) => ({ type: 'select', value, options });
const row = (label, field, extra = {}) => ({ kind: 'row', label, field, ...extra });
const levels = (names, values) => names.map((n, i) => row(n, money(values[i])));
const addLevel = { kind: 'add', text: 'Thêm bậc', row: { field: money(0) } };
const dayRange = value => ({ kind: 'select', value, options: ['T2 – T6', 'T2 – T7'] });
const yesNo = value => pick(value, ['Không', 'Có']);
const pendingPill = { text: 'Chưa chốt', cls: 'p-pend' };

const CTV_LEVELS = ['Fresher', 'Practitioner', 'Advanced Practitioner', 'Senior Practitioner'];
const NV_LEVELS = ['Nhân viên', 'Chuyên viên', 'Lead', 'HDO (Human Development Officer)'];

export const PAY_DRAWERS = {
  'luong-ngay-cong': {
    title: 'Lương theo ngày công',
    sub: 'Lương cơ bản theo bậc ÷ ngày công chuẩn × ngày được trả lương · đơn vị ₫/tháng',
    sections: [
      {
        title: 'Thực tập sinh',
        right: [dayRange('T2 – T6'), { kind: 'num', value: 22, unit: 'ngày công' }],
        items: [
          ...levels(
            ['Bậc 1', 'Bậc 2', 'Bậc 3', 'Bậc 4', 'Bậc 5', 'Bậc 6'],
            [1000000, 1500000, 2000000, 3000000, 4000000, 5000000]
          ),
          addLevel
        ]
      },
      {
        title: 'Chuyên trách viên',
        right: [dayRange('T2 – T7'), { kind: 'num', value: 26, unit: 'ngày công' }],
        items: [...levels(CTV_LEVELS, [6000000, 6000000, 6000000, 6000000]), addLevel]
      },
      {
        title: 'Nhân viên',
        right: [dayRange('T2 – T7'), { kind: 'num', value: 26, unit: 'ngày công' }],
        items: [...levels(NV_LEVELS, [6000000, 6500000, 7000000, 7500000]), addLevel]
      },
      {
        title: 'Khác',
        right: [],
        items: [
          row('Giới hạn ngày được trả lương ở 100% ngày công chuẩn', yesNo('Không')),
          { kind: 'add', text: 'Thêm chức vụ', action: 'position' }
        ]
      }
    ]
  },
  'lam-them': {
    title: 'Tiền làm thêm giờ',
    sub: 'Tiền làm thêm = lương giờ × hệ số × số giờ · lương giờ = lương ngày ÷ 8',
    sections: [
      {
        title: 'Hệ số nhân',
        right: [],
        items: [
          row('Ngày thường', { type: 'num', value: 2, prefix: '×' }, { small: 'Tối thiểu ×1,5' }),
          row('Ngày lễ, Tết', { type: 'num', value: 3, prefix: '×' }, { small: 'Tối thiểu ×3' }),
          row(
            'Làm bù rơi vào ngày lễ',
            { type: 'num', value: 3, prefix: '×' },
            { small: 'Mức tối thiểu chờ pháp chế xác nhận' }
          )
        ]
      },
      {
        title: 'Cộng thêm ban đêm',
        right: [],
        items: [
          row('Giờ làm đêm', pct(30), { small: 'Từ 22:00 đến 06:00, cộng vào lương giờ · tối thiểu 30%' }),
          row('Làm ngày lễ ban đêm', pct(20), { small: 'Tính trên hệ số ngày lễ · tối thiểu 20%' })
        ]
      }
    ]
  },
  'phu-cap': {
    title: 'Phụ cấp',
    sub: '% tính trên lương cơ bản theo bậc · Đi lại + Chuyên cần + Flex + Ca đêm',
    sections: [
      {
        title: 'Đi lại và chuyên cần',
        right: [],
        items: [
          row('Thực tập sinh · đi lại', pct(0)),
          row('Chuyên trách viên · đi lại', pct(0)),
          row('Nhân viên · đi lại', pct(15)),
          row('Thực tập sinh · chuyên cần', pct(0)),
          row('Chuyên trách viên · chuyên cần', pct(0)),
          row('Nhân viên · chuyên cần', pct(25))
        ]
      },
      {
        title: 'Theo ca',
        right: [],
        items: [
          row('Phụ cấp ca Flex', pct(10)),
          row('Phụ cấp ca đêm · Thực tập sinh, Chuyên trách viên', pct(30), { small: 'Tối thiểu 30%' }),
          row('Phụ cấp ca đêm · Nhân viên, mức 1', pct(40)),
          row('Phụ cấp ca đêm · Nhân viên, mức 2', pct(60)),
          {
            kind: 'src',
            pill: { text: 'Sàn cứng', cls: 'p-err' },
            text: 'Không thấp hơn 30% · căn cứ Bộ luật Lao động 2019, Điều 98 khoản 2 · mặc định của app: 40 và 60'
          }
        ]
      },
      {
        title: 'Mất phụ cấp chuyên cần',
        right: [],
        items: [
          row('Khi nghỉ từ', days(3)),
          row('Khi tổng giờ vượt ngưỡng trong tháng từ', { type: 'num', value: 24, unit: 'giờ' }),
          row('Cách mất', pick('Mất toàn bộ', ['Mất toàn bộ', 'Giảm theo bậc'])),
          row('Biên độ giờ vượt ngưỡng', { type: 'num', value: 0, unit: 'giờ' }),
          row(
            'Làm tròn giờ thiếu chưa bù',
            pick('Không làm tròn', ['Không làm tròn', 'Làm tròn lên', 'Làm tròn xuống'])
          )
        ]
      },
      {
        title: 'Bảng giảm theo bậc',
        right: [{ kind: 'text', text: 'chỉ dùng khi chọn giảm theo bậc' }],
        items: [
          { kind: 'src', text: 'Đang trống: không giảm theo bậc. Căn cứ: chính sách công ty, do C&B chọn.' },
          { kind: 'add', text: 'Thêm bậc để thử', row: { field: pct(0) } }
        ]
      }
    ]
  },
  'luong-kpi': {
    title: 'Lương KPI',
    sub: 'Lương KPI = lương KPI tối đa theo bậc × tổng điểm KPI · lương luôn tính kèm KPI',
    sections: [
      {
        title: 'Chuyên trách viên',
        right: [
          { kind: 'text', text: 'Đạt khi tổng từ' },
          { kind: 'num', value: 75, unit: '%', minWidth: 70 }
        ],
        items: levels(CTV_LEVELS, [1500000, 3000000, 4500000, 6000000])
      },
      {
        title: 'Nhân viên',
        right: [
          { kind: 'text', text: 'Đạt khi tổng từ' },
          { kind: 'num', value: 75, unit: '%', minWidth: 70 }
        ],
        items: [
          ...levels(NV_LEVELS, [6000000, 6500000, 7000000, 7500000]),
          { kind: 'src', text: 'Thực tập sinh không có lương KPI · đổi ở Chế độ theo loại nhân sự.' }
        ]
      },
      {
        title: 'Cách tính tổng điểm',
        right: [{ kind: 'link', text: 'Sửa tỉ lệ ở Đánh giá KPI', to: '/admin/cai-dat/kpi' }],
        items: [
          {
            kind: 'src',
            big: true,
            text: 'Base Wework 40% · Người dùng 24% · Đồng nghiệp 18% · Quản lý trực tiếp 12% · Tự đánh giá 6%'
          }
        ]
      },
      {
        title: 'Chính sách chưa chốt',
        right: [],
        items: [
          row('Tổng điểm dưới mức đạt', pick('Lương KPI = 0', ['Lương KPI = 0', 'Trả theo tỉ lệ điểm']), {
            pill: pendingPill
          }),
          row('Base Wework dưới mức đạt', pick('Lương KPI = 0', ['Lương KPI = 0', 'Trả theo tỉ lệ điểm']), {
            pill: pendingPill
          }),
          row('Chưa đủ 5 điểm', pick('Chờ điểm', ['Chờ điểm', 'Tính theo điểm đã có']), { pill: pendingPill }),
          row('Nhân tỷ lệ ngày đi làm khi giờ đi muộn, về sớm, ra ngoài vượt', { type: 'num', value: 24, unit: 'giờ' })
        ]
      }
    ]
  },
  'khau-tru': {
    title: 'Khấu trừ đi muộn, về sớm',
    sub: 'Trừ theo phút khi vượt mức miễn, làm tròn theo nấc',
    sections: [
      {
        title: 'Mức trừ',
        right: [],
        items: [
          row('Đi muộn, về sớm dưới … phút không trừ', { type: 'num', value: 15, unit: 'phút' }),
          row('Nấc trừ khi vượt mức', { type: 'num', value: 30, unit: 'phút' }),
          row(
            'Cách làm tròn số phút bị trừ',
            pick('Nửa nấc làm tròn lên', ['Nửa nấc làm tròn lên', 'Luôn làm tròn lên', 'Làm tròn xuống'])
          ),
          row('Đi muộn và về sớm cùng ngày', pick('Xét riêng', ['Xét riêng', 'Cộng gộp']))
        ]
      },
      {
        title: 'Miễn trừ theo tháng',
        right: [{ kind: 'pill', text: 'Chưa áp dụng', cls: 'p-draft' }],
        items: [
          row('Cách áp mức miễn', pick('Chưa áp dụng', ['Chưa áp dụng'])),
          row('Tổng phút miễn mỗi tháng', pick('Chưa áp dụng', ['Chưa áp dụng'])),
          row('Số lần miễn mỗi tháng', pick('Chưa áp dụng', ['Chưa áp dụng']))
        ]
      }
    ]
  },
  'tam-ung': {
    title: 'Tạm ứng',
    sub: 'Tạm ứng giữa tháng, trừ vào thực nhận cuối kỳ',
    sections: [
      {
        title: 'Cách tính',
        right: [],
        items: [
          row('Tạm ứng bằng … lương cơ bản thực nhận', pct(80)),
          row('Tính cho ngày đi làm từ ngày 1 đến ngày', { type: 'num', value: 15 }),
          row('Cách tính tạm ứng', pick('Theo ngày đi làm', ['Theo ngày đi làm', 'Theo cả tháng']))
        ]
      },
      {
        title: 'Loại nhân sự được tạm ứng',
        right: [],
        items: [
          row('Thực tập sinh', yesNo('Có')),
          row('Chuyên trách viên', yesNo('Có')),
          row('Nhân viên', yesNo('Có')),
          {
            kind: 'src',
            text: 'Loại không được tạm ứng thì tạm ứng bằng 0, dù từng người có bật trong hồ sơ. Mặc định của app: có cho cả ba loại · căn cứ: chính sách công ty, do C&B chọn.'
          }
        ]
      }
    ]
  }
};
