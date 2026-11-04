# Danh sách Nhân sự và ngăn kéo hồ sơ trên dữ liệu giả

- Ngày: 04/11/2026
- Loại: Architectural (thay toàn bộ màn Nhân sự, viết lại service `admin-hr` sang dữ liệu giả, thêm ngăn kéo hồ sơ mới)
- Trạng thái: chờ người dùng duyệt
- Concept đã duyệt (canvas, 04/11/2026): bảng I (`Staff.dc.html`, danh sách) và I2 (`StaffDetail.dc.html`, ngăn kéo hồ sơ mở trên I). Mọi dòng, con số và câu chữ của hai bảng nằm trong bộ sinh `gen-staff.js` của canvas; mục 1 chép lại từ đó. Ảnh: `preview/staff.png`, `preview/staff-detail.png`.
- Nền móng: [spec khung mock và Tổng quan](2026-11-04-admin-mock-shell-overview-design.md) — `MOCK_TODAY` 28/10/2026, `MOCK_MONTH` 2026-10, `respond()`, `api()` luôn từ chối `mock_missing`.
- Chạy song song với [spec chuông và chấm công](2026-11-04-admin-bell-attendance-design.md) và [spec Bảng lương gộp KPI](2026-11-04-admin-payroll-kpi-design.md), mỗi spec một nhánh trên cùng gốc. Lead gộp ở cuối.

## Mục tiêu

1. `/admin/nhan-su` theo bảng I: tiêu đề, 4 thẻ chỉ số, thẻ danh sách có ô tìm, công tắc "Chưa kích hoạt tài khoản", chọn nhiều dòng, nút xuất và bảng 6 cột.
2. Bấm tên mở ngăn kéo hồ sơ theo bảng I2: định danh, nhãn trạng thái, ghi chú nghỉ, ba nhóm Công việc / Hợp đồng / Tài khoản, liên kết "Xem chấm công".
3. Màn chạy hoàn toàn trên dữ liệu giả và không gọi `/api`. Mã cũ theo BE của Nhân sự bị thay hẳn.

## Quyết định của người dùng (trong chat 04/11/2026, chuyển qua điều phối)

1. Làm I và I2 như bảng đã duyệt.
2. Danh sách chỉ hiện thông tin cốt lõi. Mỗi ô một giá trị chính, trên một dòng. Lý do, khoảng ngày, mã, bậc, thâm niên, giờ ca và chú giải nằm trong ngăn kéo hồ sơ. Không thêm dòng phụ, cột hay chú thích nào vào danh sách ngoài bảng I.
3. Không có ô nhập dạng viên thuốc, không có nhãn giá trị trong nội dung. Nhãn trạng thái trong bảng và ở đầu ngăn kéo thì được.
4. Màu và chữ theo design system GFT như các màn hiện có:
   - `ink` #212121, `ink-muted` #616161, `surface-dark` #1c1c1c, `gold` #e8c372, `gold-pale` #fff9ec;
   - vàng không làm chữ hay viền trên nền sáng;
   - mỗi màn tối đa một thẻ nền vàng hoặc nền tối;
   - không đổ bóng.
5. Dữ liệu giả nằm trong `web/src/mock/`, đi qua service bằng `respond()` của `mock/respond.ts`, như Tổng quan.
6. Test bằng Playwright, không dùng `page.route`. Xác minh chỉ bằng test: `npm --prefix web run test:ui`, và `npm test` ở thư mục gốc để chứng minh BE không bị đụng. Không có bước typecheck hay prettier. Không thêm phụ thuộc npm.
7. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc. Không đọc `spec/` gốc.
8. Chỉ cài hành vi đã được xác nhận. Thứ gì bảng có mà chưa ai quyết thì có phán quyết kèm lý do, hoặc thành câu hỏi mở; không bịa luật nghiệp vụ. Không đặt nút giả.
9. Người trong dữ liệu giả dùng tên, phòng ban, chức danh của `gen-staff.js`; chúng trùng với bảng Bảng lương (G) và Chấm công (E/F).
10. Giữ đường dẫn `/admin/nhan-su`. "Xem chấm công" dẫn tới `/admin/cham-cong/nhan-vien/:id`, route do plan chuông và chấm công làm.

## Ngoài phạm vi

- Tab "Sơ đồ tổ chức" và nội dung của nó.
- Các luồng: nhập từ Excel, thêm nhân sự, sửa hồ sơ, bộ lọc, gán ca, đổi phòng ban, khoá / mở khoá tài khoản, lịch sử thay đổi (xem R4 và mục 8).
- Sắp xếp theo cột; trang 2 trở đi của danh sách.
- Giải thích cách tính của thẻ chỉ số (nút "i" của bảng).
- Nhân sự theo tháng: màn không đọc `?thang` (R8).
- Lưu dữ liệu giả qua lần tải lại trang (dữ liệu chỉ đọc, không có thao tác ghi).
- Thêm người vào dữ liệu giả Chấm công, Bảng lương; đối chiếu mã nhân viên giữa các bảng (mục 8, câu 7 và 13).
- Mọi thay đổi ở code BE.

## 1. Dữ liệu giả (`web/src/mock/staff.ts`, mới)

### 1.1 Kiểu

```ts
type StaffStatus = 'ok' | 'try' | 'off' | 'out';
type StaffRow = {
  id: string;            // chữ không dấu nối gạch, cùng id với hồ sơ chấm công: 'le-hoang-nam'
  name: string; initials: string; code: string; email: string; activated: boolean;
  dept: string; title: string; status: StaffStatus; statusLabel: string;
  joined: string;        // ISO 'YYYY-MM-DD'
};
type StaffStat = { key: 'active' | 'joined' | 'left' | 'tenure'; label: string; value: string; unit: string;
  delta: { dir: 'up' | 'down'; text: string }; note: string; dark: boolean };
type StaffListView = { stats: StaffStat[]; total: number; rows: StaffRow[] };   // total = 131
type StaffFact = { label: string; value: string };                           // value '—' khi không có nguồn
type StaffProfile = { id: string; name: string; initials: string; code: string; title: string;
  status: StaffStatus; statusLabel: string; note: { title: string; text: string } | null;
  groups: { title: 'Công việc' | 'Hợp đồng' | 'Tài khoản'; facts: StaffFact[] }[] };
```

`initials` lấy bằng `initials()` của `utils/format` (hai chữ cuối: "Võ Đức Thịnh" → "ĐT").

### 1.2 Mười người (theo thứ tự này, là thứ tự của bảng)

| # | id | Họ tên | Mã | Email | Tài khoản | Phòng ban | Chức danh | Trạng thái | Ngày vào làm |
|---|----|--------|----|-------|-----------|-----------|-----------|------------|--------------|
| 1 | nguyen-thu-ha | Nguyễn Thu Hà | GFT-0108 | thuha.nguyen@gft.vn | đã kích hoạt | Tài chính | Kế toán tổng hợp | ok | 2021-03-12 |
| 2 | tran-minh-quan | Trần Minh Quân | GFT-0087 | quan.tran@gft.vn | đã kích hoạt | Kỹ thuật | Kỹ sư phần mềm | ok | 2020-08-05 |
| 3 | le-hoang-nam | Lê Hoàng Nam | GFT-0142 | nam.le@gft.vn | đã kích hoạt | Kinh doanh | Nhân viên kinh doanh | ok | 2024-03-04 |
| 4 | pham-ngoc-anh | Phạm Ngọc Anh | GFT-0131 | anh.pham@gft.vn | đã kích hoạt | Nhân sự | Chuyên viên nhân sự | ok | 2023-09-15 |
| 5 | vo-duc-thinh | Võ Đức Thịnh | GFT-0095 | thinh.vo@gft.vn | đã kích hoạt | Kỹ thuật | Trưởng nhóm QA | ok | 2021-01-10 |
| 6 | do-mai-linh | Đỗ Mai Linh | GFT-0201 | linh.do@gft.vn | **chưa** | Marketing | Thiết kế đồ hoạ | try | 2026-09-01 |
| 7 | bui-quoc-huy | Bùi Quốc Huy | GFT-0064 | huy.bui@gft.vn | đã kích hoạt | Sản xuất | Tổ trưởng | ok | 2019-06-20 |
| 8 | hoang-thi-mai | Hoàng Thị Mai | GFT-0118 | mai.hoang@gft.vn | đã kích hoạt | Tài chính | Kế toán viên | off | 2022-05-02 |
| 9 | phan-minh-khoa | Phan Minh Khoa | GFT-0214 | khoa.phan@gft.vn | **chưa** | Sản xuất | Công nhân vận hành | try | 2026-10-26 |
| 10 | dang-van-phuc | Đặng Văn Phúc | GFT-0072 | phuc.dang@gft.vn | đã kích hoạt | Sản xuất | Công nhân vận hành | out | 2019-11-11 |

Nhãn trạng thái và màu chấm:

| `status` | Nhãn | Chấm 8px |
|----------|------|----------|
| ok | Chính thức | `surface-dark` #1c1c1c |
| try | Thử việc | `gold` #e8c372 |
| off | Tạm nghỉ | `status-done` #2f5aa8 |
| out | Đã nghỉ việc | `ink-on-dark-muted` #9e9e9e |

Mã, ngày vào làm và trạng thái theo bảng I, dù bảng G và E/F ghi khác (R19, câu hỏi 7).

### 1.3 Hồ sơ của từng người

Mỗi hồ sơ có đúng các dòng của I2, theo thứ tự:

- Công việc: Phòng ban, Chức danh, Loại · bậc, Quản lý trực tiếp, Ca làm, Ngày vào làm.
- Hợp đồng: Loại hợp đồng, Đóng bảo hiểm, Người phụ thuộc.
- Tài khoản: Email, Kích hoạt.

Giá trị lấy theo thứ tự nguồn (R17):

1. Bảng I và I2.
2. Bảng G/H (spec Bảng lương mục 1.2): bậc, số người phụ thuộc, "HĐLĐ từ 3 tháng", có đóng bảo hiểm.
3. Bảng E/F (spec chấm công mục 4.2): ca HC 08:00–17:00.
4. Không bảng nào cho giá trị thì là "—".

| Người | Loại · bậc | Quản lý trực tiếp | Ca làm | Loại hợp đồng | Đóng bảo hiểm | Người phụ thuộc |
|-------|-----------|-------------------|--------|---------------|---------------|-----------------|
| Nguyễn Thu Hà | NV · Bậc 3 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 1 |
| Trần Minh Quân | NV · Bậc 4 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 2 |
| Lê Hoàng Nam | NV · Bậc 2 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 0 |
| Phạm Ngọc Anh | NV · Bậc 2 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 1 |
| Võ Đức Thịnh | NV · Bậc 3 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 1 |
| Đỗ Mai Linh | NV · Bậc 2 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 0 |
| Bùi Quốc Huy | NV · Bậc 2 | — | Hành chính · 08:00–17:00 | HĐLĐ từ 3 tháng | Có | 2 |
| Hoàng Thị Mai | NV · Bậc 2 | Nguyễn Thu Hà | Hành chính · 08:00–17:00 | HĐLĐ không xác định thời hạn | Có | 1 |
| Phan Minh Khoa | — | — | — | — | — | — |
| Đặng Văn Phúc | — | — | — | — | — | — |

Các dòng còn lại:

- Phòng ban, Chức danh, Email: như mục 1.2.
- Kích hoạt: "Đã kích hoạt" hoặc "Chưa kích hoạt".
- Ngày vào làm: `dd/mm/yyyy · <thâm niên>` tính tới `MOCK_TODAY`. Người `out` chỉ có ngày, không có thâm niên (R18).

| Người | Ngày vào làm |
|-------|--------------|
| Nguyễn Thu Hà | 12/03/2021 · 5 năm 7 tháng |
| Trần Minh Quân | 05/08/2020 · 6 năm 2 tháng |
| Lê Hoàng Nam | 04/03/2024 · 2 năm 7 tháng |
| Phạm Ngọc Anh | 15/09/2023 · 3 năm 1 tháng |
| Võ Đức Thịnh | 10/01/2021 · 5 năm 9 tháng |
| Đỗ Mai Linh | 01/09/2026 · 1 tháng |
| Bùi Quốc Huy | 20/06/2019 · 7 năm 4 tháng |
| Hoàng Thị Mai | 02/05/2022 · 4 năm 5 tháng |
| Phan Minh Khoa | 26/10/2026 · 2 ngày |
| Đặng Văn Phúc | 11/11/2019 |

Thâm niên (`tenure(from, to)`, như bộ sinh của bảng):

- số tháng = (năm sau − năm trước) × 12 + tháng sau − tháng trước, trừ 1 nếu ngày sau nhỏ hơn ngày trước;
- dưới 1 tháng thì là "<số ngày> ngày";
- còn lại là "<y> năm <m> tháng", bỏ phần bằng 0.

Ghi chú nghỉ (`note`): chỉ Hoàng Thị Mai có, `{ title: 'Nghỉ thai sản', text: '15/09/2026 – 15/03/2027 · đi làm lại 16/03/2027' }`. Người khác là `null`.

### 1.4 Thẻ chỉ số (hằng số, R7)

| key | Nhãn | Giá trị | Đơn vị | Tăng / giảm | Ghi chú | Thẻ tối |
|-----|------|---------|--------|-------------|---------|---------|
| active | Nhân sự đang làm | 128 | người | tăng 4 | so với tháng 9 | có |
| joined | Vào làm tháng 10 | 6 | người | tăng 2 | so với tháng 9 | |
| left | Nghỉ việc tháng 10 | 2 | người | giảm 1 | so với tháng 9 | |
| tenure | Thâm niên trung bình | 3,2 | năm | tăng 0,3 năm | so với năm 2025 | |

`total` = 131 (số hồ sơ cả công ty, hằng số, R6).

### 1.5 Hàm và service

- `mock/staff.ts`:
  - `STATUS_LABEL: Record<StaffStatus, string>`;
  - `tenure(from: string, to: string): string`;
  - `staffListView(): StaffListView`;
  - `staffProfile(id: string): StaffProfile | null` (`null` khi không có người).
- `services/admin-hr.ts` (viết lại, chỉ đọc mock):
  - `getStaffList(): Promise<StaffListView>` = `respond(staffListView())`;
  - `getStaffProfile(id: string): Promise<StaffProfile | null>` = `respond(staffProfile(id))`.
- Dữ liệu chỉ đọc: không có hàm ghi.

## 2. Màn Nhân sự (bảng I)

Route `/admin/nhan-su` giữ nguyên trong `router/routes/admin-attendance.ts`, vẫn trỏ tới `views/admin/staff/StaffView.vue`, meta `{ layout: 'admin', nav: 'ho-so', title: 'Nhân sự' }`. `StaffView.vue` được viết lại tại chỗ.

### 2.1 Bố cục từ trên xuống

1. Tiêu đề "Nhân sự" (h1, League Spartan 28px). Hàng tiêu đề không có nút (R4).
2. Vùng "Chỉ số nhân sự": 4 thẻ (mục 2.2).
3. Thẻ danh sách (mục 2.3).
4. Ngăn kéo hồ sơ khi có `?nv` (mục 3).

Không có tablist "Danh sách nhân sự / Sơ đồ tổ chức" (R3).

### 2.2 Thẻ chỉ số

- `<section aria-label="Chỉ số nhân sự">`, lưới `repeat(auto-fit, minmax(min(100%, 200px), 1fr))`, cách nhau 16px.
- Mỗi thẻ là `<article>` có tên đọc là nhãn. Cao tối thiểu 128px, đệm 16px 20px 18px, bo 16px, nền `surface`, viền `border`.
- Trong thẻ:
  - nhãn 14px/500;
  - số 32px/500, `letter-spacing: -0.64px`, đơn vị 14px/400 `ink-muted` cách 6px;
  - dòng dưới 12px `ink-muted`: phần tăng giảm (đậm 600, `▲` hoặc `▼` có `aria-hidden`, chữ ẩn "Tăng" / "Giảm" cho trình đọc màn hình) rồi ghi chú. Ví dụ "▲ 4 so với tháng 9".
- Phần tăng giảm là chữ thường, không có ô nền, không tô xanh hay đỏ (R9).
- Thẻ "Nhân sự đang làm" là thẻ tối duy nhất của màn:
  - nền và viền `surface-dark`, chữ trắng, số `gold`;
  - đơn vị, ghi chú `ink-on-dark-muted` #9e9e9e; phần tăng giảm `gold`.
- Không có nút "i" (R4).

### 2.3 Thẻ danh sách

- `<section>` bo 24px, viền `border`, nền `surface`, `overflow: hidden`, tên đọc lấy từ h2.
- **Đầu thẻ** (đệm 20px 20px 0): h2 "Danh sách nhân sự" 18px/600, cạnh đó "131 hồ sơ" `ink-muted`.
- **Hàng công cụ** (đệm 16px 20px; xuống dòng khi hẹp; khoảng cách 8px 12px):
  - Ô tìm: `<input type="search">`, nhãn đọc "Tìm theo tên, mã hoặc email", gợi ý "Tìm tên, mã, email…", icon kính lúp. Hộp cao 40px, bo 8px, viền `border-control`, rộng `flex: 0 1 280px` (mục 2.4).
  - Công tắc: `<button role="switch" aria-checked>`, chữ "Chưa kích hoạt tài khoản" và số đếm `ink-muted` (2).
    - Hộp cao 40px, bo 8px, viền `border-control`.
    - Rãnh 32 × 18px nền `status-draft`, núm 14px trắng.
    - Bật: viền `surface-dark`, rãnh `surface-dark`, núm `gold` dịch 14px.
  - Khoảng đẩy.
  - Vùng `aria-live="polite"` luôn có trong DOM, chữ "Đã chọn <n>" (đậm 600) khi n > 0, trống khi n = 0 (R27).
  - Nút xuất 40 × 40px, icon `download`, nhãn đọc "Xuất danh sách ra Excel", hoặc "Xuất <n> người đã chọn ra Excel" khi n > 0 (mục 2.5).
- **Bảng** trong vùng cuộn riêng: `role="region"`, tên "Bảng danh sách nhân sự", `tabindex="0"`, `overflow-x: auto`, viền trên `border`. Phím mũi tên cuộn ngang theo mặc định của trình duyệt.
  - `table-layout: fixed`, `min-width: 1040px`. Cột (px): ô chọn 48, Nhân viên 224, Email 224, Phòng ban 120, Chức danh 176, Trạng thái 136, Ngày vào làm 112 (R22).
  - Đầu cột cao 44px, chữ 12px/500 `ink-muted`, chữ thường, không nút sắp xếp (R5). Ô chọn ở đầu: "Chọn tất cả dòng đang hiện".
  - Dòng cao 56px ở mật độ Thoải mái; ở mật độ Gọn theo luật chung 42px (R23). Đệm ngang 12px. Viền dưới `border`. Mọi ô `white-space: nowrap`, tràn thì cắt bằng "…".
  - Ô chọn: `<button role="checkbox" aria-checked>` 18px, bo 4px, viền 1,5px `border-control`. Bật: nền `surface-dark`, dấu tích trắng. Ô ở đầu có thêm trạng thái `mixed`: vạch ngang trắng. Nhãn đọc "Chọn <tên>".
  - Ô Nhân viên (`<th scope="row">`): avatar chữ 32px nền `gold-light`, chữ 12px/600; tên đậm 600 (mục 3.1). Rê chuột thì gạch chân tên.
  - Ô Email:
    - dấu 16px: đã kích hoạt là vòng `surface-dark` có dấu tích trắng; chưa kích hoạt là vòng `status-pending` có dấu "!" màu `ink`;
    - rồi email;
    - `title` "Đã kích hoạt tài khoản" hoặc "Chưa kích hoạt tài khoản"; người chưa kích hoạt có chữ ẩn ", chưa kích hoạt tài khoản".
  - Ô Phòng ban, Chức danh: chữ thường.
  - Ô Trạng thái: nhãn trạng thái dạng viên thuốc (mục 2.7).
  - Ô Ngày vào làm: `dd/mm/yyyy`.
  - Dòng `out`: chữ mọi ô `ink-muted`, avatar nền `status-draft`.
  - Rê chuột: nền ô `raised`. Dòng đã chọn: nền ô `gold-pale` (R25).
  - Không có dòng nào: một dòng `colspan="7"` cao 120px, căn giữa, `ink-muted`: "Không có nhân sự nào khớp bộ lọc trên trang này."
- **Chân thẻ** (đệm 14px 20px 18px, căn phải, 12px `ink-muted`):
  - không lọc: "Hiển thị 1–10 trong 131 hồ sơ";
  - có lọc: "<n> kết quả trên trang này".
  - Không có nút trang trước / trang sau (R6).

### 2.4 Tìm và công tắc

- Tìm theo họ tên, mã và email (R10):
  - không phân biệt hoa thường và dấu: so `fold(x)` với `fold(chữ gõ).trim()`;
  - `fold` là hàm sẵn có của `builders/admin-attendance/common.ts`, đổi "đ"/"Đ" thành "d";
  - chuỗi chỉ có khoảng trắng coi như không tìm.
  - Không tìm theo phòng ban hay chức danh: gõ "tai chinh" ra 0 dòng.
- Ví dụ (đúng thứ tự bảng):

| Gõ | Dòng |
|----|------|
| `  do mai ` | Đỗ Mai Linh |
| `hoang` | Lê Hoàng Nam, Hoàng Thị Mai |
| `GFT-0118` | Hoàng Thị Mai |
| `phuc.dang` | Đặng Văn Phúc |

- Công tắc bật thì chỉ còn người chưa kích hoạt (Đỗ Mai Linh, Phan Minh Khoa). Số đếm trên công tắc là số người chưa kích hoạt trong 10 dòng, không đổi theo ô tìm.
- Tìm và công tắc chạy cùng lúc.
- "Có lọc" (cho chân thẻ) nghĩa là chữ tìm sau khi bỏ khoảng trắng khác rỗng, hoặc công tắc đang bật.
- URL (R11):
  - `?q` hai chiều: đọc lúc mở và khi URL đổi (ô "Tìm nhân viên" trên thanh trên đẩy `/admin/nhan-su?q=…` tới);
  - gõ thì `router.replace` giữ các khoá khác; ô trống thì bỏ `q`;
  - công tắc và ô chọn không lên URL.

### 2.5 Chọn nhiều dòng và xuất

- Chọn theo id. Đã chọn thì giữ qua mọi lần đổi tìm hay công tắc (R12).
- "Đang hiện và đã chọn" = các dòng đang hiện có trong danh sách chọn.
  - "Đã chọn <n>" đếm theo tập này.
  - Ô ở đầu là `true` khi mọi dòng đang hiện đã chọn (và có ít nhất một dòng), `mixed` khi một phần, `false` khi không dòng nào.
  - Bấm ô ở đầu: đang `true` thì bỏ chọn mọi dòng đang hiện; không thì chọn hết các dòng đang hiện.
- Không có nút "Gán ca", "Đổi phòng ban" (R4).
- Nút xuất tải về `danh-sach-nhan-su.csv` (R13):
  - có dòng đang hiện và đã chọn thì xuất các dòng đó, không thì xuất mọi dòng đang hiện; theo thứ tự bảng;
  - UTF-8 có BOM, phân cách `;`, dòng kết thúc `\r\n`, ô có `;`, `"` hoặc xuống dòng thì bọc ngoặc kép (dấu `"` bên trong nhân đôi);
  - tạo bằng `Blob` và thẻ `<a download>`;
  - dòng đầu: `Mã;Họ tên;Email;Phòng ban;Chức danh;Trạng thái;Ngày vào làm;Tài khoản`;
  - Ngày vào làm `dd/mm/yyyy`; Tài khoản "Đã kích hoạt" / "Chưa kích hoạt";
  - ví dụ: `GFT-0201;Đỗ Mai Linh;linh.do@gft.vn;Marketing;Thiết kế đồ hoạ;Thử việc;01/09/2026;Chưa kích hoạt`.

### 2.6 Màn hẹp

- Trang không cuộn ngang ở 375, 768, 1024 và 1440px.
- Ở 1440px bảng vừa vùng cuộn. Hẹp hơn thì bảng cuộn trong vùng của nó.
- Dưới 768px: ô tìm rộng 100%; hàng công cụ xuống dòng.

### 2.7 Nhãn trạng thái (dùng chung bảng và ngăn kéo)

- Viên thuốc cao 24px, đệm 0 10px, bo 50px, viền 1px `border`, nền `surface`, chữ 12px/500 `ink`.
- Chấm 8px theo bảng ở mục 1.2, cách chữ 6px.
- Chấm vàng của "Thử việc" là mảng tô trên viên trắng, không phải chữ hay viền (R26).

### 2.8 Khác với bảng I

- Bỏ tablist và tab "Sơ đồ tổ chức" (R3).
- Bỏ các nút "Nhập từ Excel", "Thêm nhân sự", "Bộ lọc", "Gán ca", "Đổi phòng ban" và nút "i" ở 4 thẻ (R4).
- Bỏ nút sắp xếp ở đầu cột (R5).
- Bỏ nút trang trước / trang sau (R6).
- Phần tăng giảm của thẻ là chữ thường, không có ô nền (R9).
- Tìm không còn theo phòng ban và chức danh như script của bảng (R10).
- Độ rộng cột thu cho vừa khung nội dung của app (R22).
- Cỡ chữ đưa về thang 12 / 14 / 18 / 28 / 32px (R21).

## 3. Ngăn kéo hồ sơ (bảng I2)

### 3.1 Mở, đóng và URL (R15)

- Tên ở cột Nhân viên là `RouterLink` tới `?nv=<id>` (giữ các khoá khác, `replace`).
- Mở, đóng, người trước / người sau đều dùng `router.replace`. Tải lại trang thì ngăn kéo mở lại đúng người.
- `nv` không khớp người nào (ví dụ `khong-co`, hay `linh` từ đường dẫn cũ `?hop=sua-ho-so&nv=linh`):
  - không mở ngăn kéo, không báo lỗi;
  - bỏ `nv` khỏi URL, giữ các khoá khác;
  - bảng vẫn hiện.
- Khoá cũ `loc` và `hop` không có tác dụng.
- Đóng: nút "Đóng", Escape, bấm lớp nền. Focus trở về phần tử đã mở ngăn kéo (tên vừa bấm).
- Đổi màn thì ngăn kéo đóng theo màn.

### 3.2 Khung

- Thành phần riêng `views/admin/staff/StaffDrawer.vue` (R14).
  - `Teleport` vào `body`.
  - Lớp nền cố định phủ trang, `rgba(28, 28, 28, 0.32)`.
  - `<aside role="dialog" aria-modal="true" tabindex="-1">`, tên đọc "Hồ sơ của <tên>".
- Vị trí và hình:
  - cố định, cách mép trên, phải, dưới 16px; rộng 480px, tối đa `100% − 32px`;
  - bo 24px, nền `surface`, không đổ bóng;
  - cột dọc: đầu, thân cuộn (`overflow-y: auto`), chân.
- Dưới 768px: cách mép trái và phải 16px, rộng phần còn lại (343px ở 375px).
- Bẫy focus, Escape, trả focus dùng `registerOverlayFocus`; khoá cuộn trang dùng `lockScroll` / `unlockScroll` (`components/ui/overlay-lock`).
- Khi mở: focus vào phần tử bấm được đầu tiên trong ngăn kéo.

### 3.3 Nội dung

- **Đầu** (đệm 20px 16px 0 24px):
  - h2 "Hồ sơ nhân sự" 18px/600, chiếm phần còn lại;
  - ba nút icon 36px không viền, bo 8px: "Người trước" (`chevl`), "Người sau" (`chevr`), "Đóng" (`x`, màu `ink-muted`).
- **Thân** (đệm 16px 24px 24px, các khối cách nhau 20px):
  1. Hàng định danh: avatar 48px nền `gold-light`; tên 18px/600; dòng phụ 12px `ink-muted` "<mã> · <chức danh>" (ví dụ "GFT-0118 · Kế toán viên"); bên phải là nhãn trạng thái (mục 2.7).
  2. Ghi chú nghỉ, khi `note` khác `null`:
     - khối đệm 12px 14px, bo 12px, nền `ground`;
     - chấm 8px `status-done`;
     - tiêu đề 600, dòng dưới 12px `ink-muted`.
  3. Ba nhóm theo mục 1.3, mỗi nhóm một `<section>`:
     - tiêu đề `<h3>` 12px/600, in hoa, `letter-spacing: 0.4px`, `ink-muted`;
     - các dòng là `<dl>`: mỗi dòng lưới `148px / 1fr`, cách 12px, đệm 10px 0, viền dưới `border`;
     - nhãn (`<dt>`) `ink-muted`, giá trị (`<dd>`) 500;
     - giá trị "—" dùng màu `ink-muted`.
- **Chân** (đệm 12px 24px 16px, viền trên `border`): liên kết "Xem chấm công", dáng nút viền cao 40px, bo 8px, viền `border-control` (mục 3.5). Không có nút "Sửa hồ sơ" (R4).

### 3.4 Người trước, người sau (R16)

- Đi trong các dòng đang hiện lúc mở ngăn kéo, theo thứ tự bảng.
- Đổi tìm hay công tắc khi ngăn kéo đang mở không đổi danh sách này. Ngăn kéo phủ lên màn nên cũng không đổi được.
- Ở đầu danh sách thì "Người trước" tắt, ở cuối thì "Người sau" tắt. Người đang mở không nằm trong danh sách (mở bằng URL khi bộ lọc che người đó) thì cả hai nút tắt.
- Sang người khác: ngăn kéo giữ nguyên (không đóng rồi mở lại), focus ở lại nút vừa bấm.
- Nút vừa bấm bị tắt vì đã tới đầu hay cuối thì focus chuyển sang nút còn lại.

### 3.5 Xem chấm công (R20)

- Dẫn tới `/admin/cham-cong/nhan-vien/<id>`, giữ `?thang` nếu có. Ví dụ `/admin/cham-cong/nhan-vien/hoang-thi-mai`.
- Có ở mọi hồ sơ.
- Route đó do plan chuông và chấm công làm. Trên nhánh này đường dẫn chưa có trang; test chỉ kiểm `href`.

### 3.6 Khác với bảng I2

- Bỏ nút "Sửa hồ sơ" (R4).
- Tên trong ngăn kéo 18px thay 16px (R21).

## 4. Mã cũ của Nhân sự

| File | Số phận | Lý do |
|------|---------|-------|
| `views/admin/staff/StaffView.vue` | Viết lại | Màn mới theo bảng I |
| `services/admin-hr.ts` | Viết lại | Chỉ còn `getStaffList`, `getStaffProfile` đọc mock |
| `views/admin/staff/AddStaffDialog.vue`, `BulkShiftDialog.vue`, `ProfileDrawer.vue`, `StaffTrace.vue` | Xoá | Luồng thêm, gán ca, sửa hồ sơ, lịch sử gọi `api()` theo định dạng BE; không còn nút nào mở (R1) |
| `builders/admin-hr/staff.ts` | Xoá | Chỉ service cũ và hai hộp trên dùng |
| `views/admin/staff/fields/FldInput.vue`, `FldSelect.vue` | Giữ | `views/admin/attendance/BulkPunchDialog.vue` và `DayDetailDialog.vue` còn import trên nhánh này (R2) |
| `views/admin/attendance/PagerBar.vue`, `SearchBox.vue`, `useHop.ts` | Không sửa | Nhân sự mới không import nữa; file thuộc vùng của plan chuông và chấm công |

Đã kiểm bằng grep: ngoài các file của Nhân sự, không file nào trong `web/src` import `services/admin-hr` hay `builders/admin-hr/staff`.

## 5. Mục lục thiết kế (`design-index/admin-attendance.ts`)

- Giữ dòng `nhan-su.html` "Nhân sự".
- Bỏ ba dòng `ns-chua-co-ca.html`, `dlg-ns-them.html`, `drw-ns-sua-ho-so.html`.
- Thêm `{ file: 'drw-ns-ho-so.html', title: 'Ngăn kéo Hồ sơ nhân sự · Hoàng Thị Mai', to: '/admin/nhan-su?nv=hoang-thi-mai' }` ở chỗ dòng cũ.
- Không đụng các dòng Chấm công và KPI (hai plan kia sửa).

## 6. Kiểm thử và xác minh

### 6.1 Test mới (`web/tests/admin-staff.spec.ts`)

- Playwright, không `page.route`.
- Có bộ ghi request `/api` (như `trackApi` của `admin-shell.spec.ts`); test đầu file kiểm danh sách rỗng.
- Dữ liệu giả kiểm qua giao diện. Không có test gọi thẳng module mock (plan, ruling về test).

Các test:

- màn theo bảng I: tiêu đề, không tablist, không nút bị bỏ, 4 thẻ đúng số, một thẻ tối, thẻ danh sách "131 hồ sơ", 10 dòng đúng thứ tự, chân "Hiển thị 1–10 trong 131 hồ sơ";
- mỗi ô một giá trị trên một dòng; đúng 6 cột có tên;
- vùng cuộn riêng ở 375 / 768 / 1024 / 1440px;
- không đổ bóng;
- tìm theo tên, mã, email, bỏ dấu, khoảng trắng; `?q` từ thanh trên và qua tải lại;
- công tắc chưa kích hoạt;
- chọn, chọn tất cả theo dòng đang hiện, đếm, xuất CSV;
- ngăn kéo: nội dung của Hoàng Thị Mai đúng I2; giá trị của người khác và "—"; trước / sau; đường dẫn sâu; `nv` lạ; Escape và focus; 375px;
- mục lục thiết kế có dòng ngăn kéo mới, không còn ba dòng cũ.

### 6.2 Test cũ (`web/tests/admin-workflows.spec.ts`)

| Test cũ | Số phận |
|---------|---------|
| `staff profile opens from a real link and the wide table stays inside a keyboard-scroll region` (fixme) | Xoá. Ý của nó (vùng cuộn có phím, mở hồ sơ bằng liên kết và Enter) viết lại trong `admin-staff.spec.ts`. Phần "Trang 1/2" bỏ vì không còn phân trang (R6). |
| `staff issue filter is reproducible from the URL and switches on click` (đang chạy) | Xoá. Bảng I không có nút lọc "Thiếu ngày bắt đầu", "Chưa có ca"; công tắc mới có test riêng. |
| `staff access error offers retry and is not shown as an empty list` (fixme) | Xoá. Dữ liệu giả không có lỗi mạng (R24). |

- Tuỳ chọn `staffStatus` của `mockAdminApi` chỉ test cuối dùng nên bỏ theo.
- Mảng `staff` và `mockAdminApi` giữ cho các test `fixme` của màn Yêu cầu.
- `admin-shell.spec.ts` không sửa. Hai test còn xanh mà không cần sửa:
  - `admin shell makes no /api requests while navigating` (bấm "Nhân sự");
  - `search opens the staff list with q`.

### 6.3 Lệnh xác minh

- `npm --prefix web run test:ui`: 0 failed. Mốc đo 04/11/2026 trên `4c1bf0d`: 40 passed, 47 skipped. Khi xong: skipped còn 45 (bớt 2 `fixme` ở mục 6.2), passed = 39 + số test mới.
- `npm test` ở thư mục gốc: như mốc (24 pass, theo ledger).
- `git diff --stat 4c1bf0d -- src migrations test spec`: rỗng.

## 7. Rủi ro

| Rủi ro | Cách xử lý |
|--------|------------|
| Ba plan chạy song song trên cùng gốc; vài file chung bị sửa ở nhiều nhánh | Plan giữ sửa đổi ở file chung nhỏ nhất và liệt kê ở mục "Xung đột khi gộp" của plan |
| "Xem chấm công" dẫn tới trang chưa có trên nhánh này; sau khi gộp, Hoàng Thị Mai, Phan Minh Khoa, Đặng Văn Phúc chưa có trong dữ liệu giả Chấm công nên ra "Không tìm thấy nhân viên này." | Test chỉ kiểm `href`. Câu hỏi 13. |
| Mã nhân viên trùng chéo giữa các bảng (GFT-0118 là Hoàng Thị Mai ở I nhưng là Nguyễn Thu Hà ở E/F) | Liên kết dùng id chữ, không dùng mã. Câu hỏi 7. |
| Số tăng giảm và tổng 131 không khớp 10 dòng | Đúng chủ đích (R6, R7) |
| Bảng vừa 1440px chỉ khi thanh cuộn trang không quá 15px | Cột thu còn 1040px; có test ở 1440px |

## 8. Câu hỏi còn mở

1. Sơ đồ tổ chức: hiện gì (cây phòng ban, quản lý trực tiếp), dữ liệu lấy ở đâu?
2. Nhập từ Excel: mẫu file, các cột, trùng mã thì sao, báo lỗi thế nào?
3. Thêm nhân sự: những trường nào; có tạo tài khoản và gửi lời mời kích hoạt không?
4. Sửa hồ sơ: trường nào sửa được; khoá / mở khoá tài khoản và lịch sử thay đổi đặt ở đâu?
5. Bộ lọc: những tiêu chí nào (phòng ban, trạng thái, loại hợp đồng…)?
6. Gán ca, Đổi phòng ban cho nhiều người: mở gì, hiệu lực từ ngày nào, có ảnh hưởng chấm công và lương không?
7. Mã nhân viên, ngày vào làm và trạng thái khác nhau giữa bảng I, G và E/F. Ví dụ:
   - Nguyễn Thu Hà là GFT-0108 (I), GFT-0101 (G), GFT-0118 (E/F);
   - Đỗ Mai Linh "Thử việc, vào 01/09/2026" (I) nhưng "Nhân viên chính thức, vào 09/2024" (E/F).
   - Bảng nào là nguồn?
8. Sắp xếp theo cột: cột nào; tên sắp theo họ hay theo tên; thứ tự mặc định?
9. Thẻ chỉ số:
   - "Nhân sự đang làm" có tính người Tạm nghỉ, Thử việc không;
   - "Thâm niên trung bình" tính trên ai;
   - thẻ có đổi theo tháng chọn ở thanh trên không (R8)?
10. "Chưa kích hoạt tài khoản" nghĩa là gì (chưa đăng nhập lần đầu?); có cần nút gửi lại lời mời không?
11. Người đã nghỉ việc: ngày nghỉ việc, thâm niên, có còn trong danh sách mặc định không?
12. Hồ sơ của 9 người còn lại: Quản lý trực tiếp là ai; Phan Minh Khoa và Đặng Văn Phúc chưa có bậc, ca, hợp đồng, bảo hiểm, người phụ thuộc.
13. Hoàng Thị Mai, Phan Minh Khoa, Đặng Văn Phúc: thêm vào dữ liệu giả Chấm công, hay ẩn "Xem chấm công" với người chưa có dữ liệu?
14. Có cần tìm theo phòng ban, chức danh (script của bảng I có) không?
15. Ghi chú "Nghỉ thai sản" và trạng thái "Tạm nghỉ": có loại tạm nghỉ nào khác, ai ghi, có ảnh hưởng chấm công và lương không?

## 9. Phán quyết đã ghi

- Ruling: R1 — `StaffView.vue` và `services/admin-hr.ts` viết lại tại chỗ; xoá `AddStaffDialog`, `BulkShiftDialog`, `ProfileDrawer`, `StaffTrace` và `builders/admin-hr/staff.ts` — chúng gọi `api()` theo định dạng BE, không còn nút nào mở chúng, giữ lại chỉ thành mã chết và hai màn Nhân sự — rủi ro nếu sai: lấy lại từ lịch sử git khi làm luồng thêm hay sửa hồ sơ.
- Ruling: R2 — giữ `views/admin/staff/fields/FldInput.vue`, `FldSelect.vue` — màn Chấm công trên nhánh này còn import, plan chuông và chấm công mới bỏ chúng — rủi ro nếu sai: hai file thừa sau khi gộp; lead xoá khi grep không còn ai import.
- Ruling: R3 — bỏ tablist "Danh sách nhân sự / Sơ đồ tổ chức" — nội dung sơ đồ chưa ai quyết (câu hỏi 1), một tablist chỉ còn một tab vô nghĩa với trình đọc màn hình, theo lệ không đặt nút giả (R9 của spec chuông) — rủi ro nếu sai: thêm lại tablist và một panel.
- Ruling: R4 — bỏ "Nhập từ Excel", "Thêm nhân sự", "Bộ lọc", "Gán ca", "Đổi phòng ban", "Sửa hồ sơ" và nút "i" ở thẻ — chưa có luồng trên dữ liệu giả và nội dung chưa ai quyết (câu hỏi 2–6, 9) — rủi ro nếu sai: thêm lại nút khi có luồng.
- Ruling: R5 — đầu cột là chữ thường, không nút sắp xếp; thứ tự dòng theo bảng I — chưa quyết cột nào sắp, sắp theo họ hay tên; sắp 10 dòng của trang đầu trong 131 hồ sơ dễ hiểu sai (câu hỏi 8) — rủi ro nếu sai: thêm nút sắp xếp ở 6 đầu cột.
- Ruling: R6 — bỏ nút trang trước / trang sau; "131 hồ sơ" là hằng số; chân giữ "Hiển thị 1–10 trong 131 hồ sơ" và "<n> kết quả trên trang này" như bảng — dữ liệu giả chỉ có 10 dòng, không có trang 2 (như Bảng lương mục 3.7) — rủi ro nếu sai: thêm dữ liệu trang 2 và hai nút.
- Ruling: R7 — 4 thẻ chỉ số là hằng số chép từ bảng I, không tính từ 10 dòng — 10 dòng không cho ra 128 người hay 3,2 năm — rủi ro nếu sai: đổi 4 hằng số.
- Ruling: R8 — Nhân sự không đọc `?thang`; danh sách và thẻ là tình trạng ngày 28/10/2026; nhãn "tháng 10", "so với tháng 9" cố định — danh sách nhân sự là sổ hiện tại, không phải số liệu của kỳ (câu hỏi 9) — rủi ro nếu sai: thêm tham số tháng vào `staffListView` và đổi nhãn.
- Ruling: R9 — phần tăng giảm ở thẻ là chữ thường có `▲` / `▼` như Tổng quan, không có ô nền, không tô xanh hay đỏ — quyết định 3 không cho nhãn giá trị trong nội dung, và tăng hay giảm là tốt hay xấu chưa ai quyết — rủi ro nếu sai: một khối CSS.
- Ruling: R10 — ô tìm khớp họ tên, mã, email như nhãn của ô; không khớp phòng ban, chức danh như script của bảng — nhãn ghi rõ ba trường và điều phối nêu đúng ba trường (câu hỏi 14) — rủi ro nếu sai: thêm hai trường vào khoá tìm.
- Ruling: R11 — `?q` hai chiều; công tắc và ô chọn chỉ nằm trong màn — ô "Tìm nhân viên" của thanh trên mở `/admin/nhan-su?q=…`, nên màn phải đọc `q`; ghi lại `q` để tải lại vẫn giữ chữ — rủi ro nếu sai: bỏ phần ghi `q`.
- Ruling: R12 — ô đã chọn giữ qua đổi tìm hay công tắc; "Đã chọn n", ô ở đầu và nút xuất chỉ tính dòng đang hiện — đúng script của bảng I — rủi ro nếu sai: xoá chọn mỗi khi đổi lọc.
- Ruling: R13 — nút xuất tạo `danh-sach-nhan-su.csv` (UTF-8 có BOM, `;`, `\r\n`) như Bảng lương; cột Mã, Họ tên, Email, Phòng ban, Chức danh, Trạng thái, Ngày vào làm, Tài khoản; có chọn thì xuất dòng chọn — không thêm được thư viện `.xlsx`, CSV mở được bằng Excel; ô chọn vẫn có việc khi bỏ "Gán ca", "Đổi phòng ban" — rủi ro nếu sai: đổi danh sách cột, hoặc bỏ nút xuất cùng ô chọn.
- Ruling: R14 — ngăn kéo hồ sơ là thành phần riêng `StaffDrawer.vue` dùng `registerOverlayFocus` và `lockScroll`, không dùng `AppDrawer` — `.drw` chung có đổ bóng; plan Bảng lương thêm prop `floating` cố định 540px vào `AppDrawer.vue` và `overlay.css`, dùng chung sẽ xung đột và sai bề rộng 480px — rủi ro nếu sai: hai kiểu ngăn kéo nổi cho tới khi lead gộp về `AppDrawer`.
- Ruling: R15 — URL ngăn kéo là `?nv=<id>` với id chữ không dấu nối gạch, cùng id với hồ sơ chấm công; `nv` lạ thì bỏ, không mở, không báo — một khoá, đọc được bằng mắt, đường dẫn cũ không làm hỏng màn (như `?phieu` của Bảng lương) — rủi ro nếu sai: đổi tên khoá ở một chỗ.
- Ruling: R16 — người trước / người sau đi trong các dòng đang hiện lúc mở, tắt ở hai đầu; nút bị tắt khi đang giữ focus thì focus sang nút còn lại — như phiếu trước / sau của Bảng lương, và focus không rơi về `body` — rủi ro nếu sai: đi theo cả 10 dòng.
- Ruling: R17 — giá trị hồ sơ lấy theo thứ tự I/I2 → G/H (bậc, người phụ thuộc, hợp đồng, bảo hiểm) → E/F (ca) → "—" — để hồ sơ khớp phiếu lương và lịch làm của cùng người mà không bịa số — rủi ro nếu sai: sửa bảng ở mục 1.3 trong `mock/staff.ts`.
- Ruling: R18 — người đã nghỉ việc (Đặng Văn Phúc) chỉ hiện ngày vào làm, không có thâm niên — chưa biết ngày nghỉ việc; tính tới hôm nay là sai (câu hỏi 11) — rủi ro nếu sai: một điều kiện.
- Ruling: R19 — mã, ngày vào làm và trạng thái theo bảng I dù khác G và E/F — điều phối chỉ định `gen-staff.js` là nguồn của mọi dòng; liên kết dùng id chữ nên không phụ thuộc mã (câu hỏi 7) — rủi ro nếu sai: đổi một cột dữ liệu.
- Ruling: R20 — "Xem chấm công" có ở mọi hồ sơ, đường dẫn dựng tại chỗ, test chỉ kiểm `href` — bảng I2 đặt liên kết cả cho Hoàng Thị Mai; route và `employeePath` do plan chuông làm song song — rủi ro nếu sai: 3 người ra "Không tìm thấy nhân viên này." sau khi gộp (câu hỏi 13).
- Ruling: R21 — cỡ chữ đưa về thang 12 / 14 / 18 / 28 / 32px: chữ avatar 11 → 12, tên trong ngăn kéo 16 → 18 — để giữ thang chữ chung như R13 của spec chuông — rủi ro nếu sai: vài chữ lệch 1–2px so với bảng.
- Ruling: R22 — bảng `min-width` 1040px thay 1118px, cột 48 / 224 / 224 / 120 / 176 / 136 / 112 — vùng nội dung của app ở 1440px còn 1072px (trừ lề thanh bên và đệm 32px), bảng vẽ trên khung rộng hơn — rủi ro nếu sai: vài cột hẹp hơn bảng vài px.
- Ruling: R23 — dòng 56px ở mật độ Thoải mái; mật độ Gọn (mặc định) theo luật chung `td { height: 42px !important }` — như Bảng lương, mọi bảng theo cài đặt mật độ — rủi ro nếu sai: thêm một luật CSS mạnh hơn.
- Ruling: R24 — không có trạng thái lỗi và nút "Thử lại" — dữ liệu giả không có lỗi mạng — rủi ro nếu sai: thêm lại khi nối BE.
- Ruling: R25 — dòng đã chọn nền `gold-pale` như bảng I; dòng của người đang mở hồ sơ không đổi nền vì I2 không tô — rủi ro nếu sai: một class.
- Ruling: R26 — chấm vàng của "Thử việc" và núm vàng của công tắc bật là mảng tô (trên viên trắng, trên rãnh tối), không phải chữ hay viền — như R15 của spec chuông — rủi ro nếu sai: đổi màu ở một chỗ CSS.
- Ruling: R27 — vùng "Đã chọn n" luôn có trong DOM, chỉ đổi chữ — bảng I ẩn cả vùng bằng `hidden`, làm trình đọc màn hình không đọc lần chọn đầu — rủi ro nếu sai: không.
