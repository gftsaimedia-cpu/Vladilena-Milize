// Dữ liệu giả: Cài đặt › Tất cả cài đặt.
export const ALL_INTRO = { count: 20 };

// Nhóm (chip): count = số mục. Chỉ nhóm "ngay-cong" có nội dung mô tả đầy đủ trong bản demo.
export const ALL_GROUPS = [
  {
    section: 'Thành phần lương',
    items: [
      { key: 'ngay-cong', name: '1. Lương theo ngày công', count: 5 },
      { key: 'lam-them', name: '2. Tiền làm thêm giờ', count: 10 },
      { key: 'phu-cap', name: '3. Phụ cấp', count: 11 },
      { key: 'luong-kpi', name: '4. Lương KPI', count: 5 },
      { key: 'khau-tru', name: '5. Khấu trừ đi muộn', count: 4 },
      { key: 'tam-ung', name: '6. Tạm ứng', count: 4 },
      { key: 'bao-hiem', name: '7. Bảo hiểm · kế toán', count: 14 },
      { key: 'thue', name: '8. Thuế TNCN · kế toán', count: 12 }
    ]
  },
  {
    section: 'Chức vụ, quy trình và phiếu lương',
    items: [
      { key: 'chuc-vu', name: 'Chức vụ và bậc lương', count: 2 },
      { key: 'ky-luong', name: 'Kỳ lương', count: 2 },
      { key: 'cham-cong', name: 'Chấm công', count: 6 },
      { key: 'nghi-phep', name: 'Nghỉ và phép', count: 4 },
      { key: 'phe-duyet', name: 'Phê duyệt', count: 1 },
      { key: 'canh-bao-ai', name: 'Cảnh báo AI', count: 19 },
      { key: 'ho-so', name: 'Hồ sơ và hợp đồng', count: 0 },
      { key: 'phieu-luong', name: 'Phiếu lương', count: 1 },
      { key: 'nang-cao', name: 'Nâng cao', count: 0 }
    ]
  }
];

// Chi tiết nhóm 1. Mục sửa được:
//   kind 'per': mỗi loại nhân sự một ô · field { type: 'num'|'seg', value, unit?, options? }
//   kind 'options': chọn một phương án · options [{ key, label, note?, disabled? }] · value = khoá đang chọn
// badge: 'adjusted' (Admin đã sửa) | 'unconfirmed' (Chưa xác nhận)
const per = (label, field) => ({ label, field });
const num26 = { type: 'num', unit: 'ngày' };
const seg = (value, options) => ({ type: 'seg', value, options });
const types3 = (a, b, c) => [per('Chuyên trách viên', a), per('Nhân viên', b), per('Thực tập sinh', c)];

export const ALL_DETAIL_NGAY_CONG = {
  key: 'ngay-cong',
  title: '1. Lương theo ngày công',
  soonCount: 1,
  items: [
    {
      key: 'ngay-cong-chuan',
      kind: 'per',
      badge: 'adjusted',
      name: 'Ngày công chuẩn',
      desc: 'Mẫu số của lương ngày: lương theo bậc chia cho số ngày này.',
      base: 'Mặc định của app: TTS 22, CTV 26, NV 26 · căn cứ: Quy chế lương',
      rows: types3({ ...num26, value: 26 }, { ...num26, value: 26 }, { ...num26, value: 22 })
    },
    {
      key: 'bat-buoc-ngay-lam',
      kind: 'per',
      badge: 'adjusted',
      name: 'Bắt buộc có ngày bắt đầu làm',
      desc: 'Có thì hồ sơ thiếu ngày bắt đầu làm sẽ chặn tính phép năm.',
      base: 'Mặc định của app: TTS không, còn lại có · căn cứ: chính sách công ty',
      rows: types3(seg('Có', ['Không', 'Có']), seg('Có', ['Không', 'Có']), seg('Không', ['Không', 'Có']))
    },
    {
      key: 'hop-dong-mac-dinh',
      kind: 'per',
      badge: 'adjusted',
      name: 'Hợp đồng mặc định',
      desc: 'Áp cho người chưa có hợp đồng riêng trong hồ sơ: ngắn hạn tính thuế theo cách vãng lai, dài hạn tính thuế lũy tiến và đóng bảo hiểm.',
      base: 'Mặc định của app: TTS ngắn hạn, còn lại dài hạn · căn cứ: chính sách công ty, quy định thuế TNCN',
      rows: types3(
        seg('Dài hạn', ['Ngắn hạn', 'Dài hạn']),
        seg('Dài hạn', ['Ngắn hạn', 'Dài hạn']),
        seg('Ngắn hạn', ['Ngắn hạn', 'Dài hạn'])
      )
    },
    {
      key: 'cach-tinh-luong',
      kind: 'options',
      badge: 'unconfirmed',
      name: 'Cách tính lương',
      desc: 'Đổi cách tính lương ngày và các khoản theo ngày.',
      base: 'Mặc định của app: A · căn cứ: lead chốt 15/10/2026 giữ cách A; Bộ luật Lao động 2019, Điều 96',
      value: 'A',
      options: [
        { key: 'A', label: 'A. Mẫu số cố định, không trần' },
        { key: 'B', label: 'B. Mẫu số cố định, trần 100%', note: 'Chưa dùng được, sẽ có ở bản sau', disabled: true },
        {
          key: 'C',
          label: 'C. Mẫu số bằng số ngày làm việc thực của tháng',
          note: 'Chưa dùng được, sẽ có ở bản sau',
          disabled: true
        },
        {
          key: 'D',
          label: 'D. Lương tháng trừ ngày không lương',
          note: 'Chưa dùng được, sẽ có ở bản sau',
          disabled: true
        }
      ]
    },
    {
      key: 'cach-tinh-ngay-chuan',
      kind: 'per',
      badge: 'adjusted',
      name: 'Cách tính ngày công chuẩn',
      desc: 'Cố định dùng số ngày công chuẩn ở trên; tự đếm thì theo lịch của từng tháng.',
      base: 'Mặc định của app: cố định · căn cứ: chủ dự án 16/10/2026',
      rows: types3(
        seg('Cố định', ['Cố định', 'Tự đếm theo lịch']),
        seg('Cố định', ['Cố định', 'Tự đếm theo lịch']),
        seg('Cố định', ['Cố định', 'Tự đếm theo lịch'])
      )
    }
  ],
  readonly: [
    {
      title: 'Đổi loại, bậc hoặc lương giữa tháng',
      desc: 'Áp cho cả tháng, hiệu lực từ ngày 01 · chưa hỗ trợ chia theo ngày',
      value: 'Khoá'
    },
    {
      title: 'Lịch làm việc theo loại',
      desc: 'Thực tập sinh T2 – T6 · Chuyên trách viên, Nhân viên T2 – T7 · căn cứ: Quy chế lương',
      value: 'Khoá'
    }
  ]
};
