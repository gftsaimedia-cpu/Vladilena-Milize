// Dữ liệu giả: câu hỏi dựng sẵn của Trợ lý AI và câu trả lời (mỗi câu một kịch bản ?kb=).
// rows: { count, text, link: { label, to } | null }.  groups[0] không có nhãn; info = dòng xám (không chặn chốt công).
// table: bảng xếp hạng (nếu có); footRows: các dòng xám dưới bảng.

export const QUESTIONS = [
  { key: 'thieu-gi', label: 'Còn thiếu gì trước khi chốt công?', soon: false },
  { key: 'nhieu-phep', label: 'Ai còn nhiều phép?', soon: false },
  { key: 'doi-thuc-nhan', label: 'Vì sao thực nhận tháng này thay đổi?', soon: true },
  { key: 'het-han-hd', label: 'Ai sắp hết hạn hợp đồng?', soon: true }
];

export const ANSWERS = {
  'thieu-gi': {
    title: 'Còn 3 việc trước khi chốt công',
    sub: 'Hạn 03/12, còn 7 ngày · yêu cầu gửi sau hạn sẽ bị gắn "Gửi sau hạn"',
    groups: [
      {
        label: '',
        rows: [
          { count: 8, text: 'Yêu cầu chờ xử lý, 3 có cảnh báo', link: { label: 'Xử lý', to: '/admin/yeu-cau' } },
          { count: 3, text: 'Ngày quên Check-in/out', link: { label: 'Sửa giờ', to: '/admin/cham-cong/sua-gio' } },
          { count: 1, text: 'Nhân sự thiếu ngày bắt đầu làm', link: { label: 'Mở hồ sơ', to: '/admin/nhan-su' } }
        ]
      },
      {
        label: 'Nên xem trước khi chốt',
        rows: [
          {
            count: 106,
            text: 'Ngày vào muộn, ra sớm hoặc cần đối soát',
            link: { label: 'Bảng công', to: '/admin/cham-cong' }
          },
          { count: 2, text: 'Nhân sự chưa có ca cố định', link: { label: 'Gán ca', to: '/admin/nhan-su' } }
        ]
      },
      {
        label: 'Không chặn chốt công',
        info: true,
        rows: [
          { count: 2, text: 'Phiếu lương chưa tính được vì hồ sơ', link: { label: 'Sửa hồ sơ', to: '/admin/nhan-su' } },
          { count: 56, text: 'Người chưa chấm đủ điểm KPI · điểm có từ 02/12', link: null },
          { count: 1, text: 'Ngày lễ trong tháng: 24/11', link: null },
          { count: 0, text: 'Phiếu lương có số Admin đã sửa', link: null }
        ]
      }
    ],
    table: null,
    footRows: [],
    source: 'Nguồn: AI kiểm tra dữ liệu · 22 quy tắc · 71 nhân sự · 15 ngày gần nhất',
    computedAt: '2026-11-26T12:06'
  },
  'nhieu-phep': {
    title: '10 người còn nhiều phép nhất',
    sub: '61 nhân sự có phép năm · 2 người đang âm phép',
    groups: [],
    footRows: [
      { count: 2, text: 'Người âm phép: Tạ Hồng Phúc, Nguyễn Anh Bình', link: { label: 'Xem', to: '/admin/nhan-su' } }
    ],
    // [tên, loại, cộng, dùng, còn]
    table: [
      ['Lý Phương Mai', 'CTV', 77, 8, 69],
      ['Đỗ Nhật Đạt', 'CTV', 22, 0, 22],
      ['Trần Tuấn Tâm', 'NV', 22, 1, 21],
      ['Bùi Đức Khoa', 'CTV', 18, 0, 18],
      ['Chu Đức Nga', 'CTV', 18, 0, 18],
      ['La Nhật Oanh', 'CTV', 18, 0, 18],
      ['Tạ Quang Quân', 'CTV', 18, 0, 18],
      ['Võ Anh Uyên', 'CTV', 18, 0, 18],
      ['Võ Nhật Vy', 'CTV', 18, 0, 18],
      ['Chu Anh Trí', 'NV', 18, 0, 18]
    ].map(([name, type, added, used, left]) => ({ name, type, added, used, left })),
    source: 'Nguồn: hồ sơ nhân sự · phép năm tính đến 26/11/2026',
    computedAt: '2026-11-26T12:06'
  }
};
