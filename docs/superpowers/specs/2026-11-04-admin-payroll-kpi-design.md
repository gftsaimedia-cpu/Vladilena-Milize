# Bảng lương gộp chấm KPI và phiếu lương từng người trên dữ liệu giả

- Ngày: 04/11/2026
- Loại: Architectural (bỏ một màn, gộp KPI vào Bảng lương, đổi các bước kỳ lương dùng chung của khung)
- Trạng thái: sẵn sàng (board G và H đã chốt)
- Concept đã duyệt: canvas [Admin Dashboard Concept](https://claude.ai/artifact/6ro7y3NXoqxGWHfVsBr1Hd) bản 16, board G (Bảng lương tháng, đã gộp KPI) và H (Phiếu lương một người, mở trên G). Số liệu, cờ, lịch sử sửa điểm và cách làm tròn của hai board nằm trong bộ sinh `gen-payroll2.js` của canvas; mục 1.2 chép lại từ đó.
- Spec trước của chương trình: [Khung Admin và Tổng quan trên dữ liệu giả](2026-11-04-admin-mock-shell-overview-design.md)
- Luật lương: mục "Luật đã chốt" của plan `2026-11-04-payroll-v2-rules.md` (BE v2), điều phối xác nhận trong chat 04/11/2026
- Màu, chữ, khoảng cách: design system GFT AI C&B (`surface-*`, `ink*`, `gold*`, `status-*`, `radius-*`)

## Mục tiêu

1. Màn Bảng lương (`/admin/bang-luong`) theo board G, chạy trên dữ liệu giả.
2. Phiếu lương từng người theo board H: chấm 5 điểm KPI ngay trong phiếu; tổng điểm, Lương KPI, thuế và Thực nhận tính lại ngay khi gõ.
3. Bỏ màn Đánh giá KPI. Chấm KPI thành một bước của kỳ lương, làm ngay trong Bảng lương.

## Quyết định của người dùng (trong chat, 04/11/2026)

1. Thanh bên bỏ mục "Đánh giá KPI". KPI nằm trong Bảng lương. Các bước kỳ lương thành: Chấm công → Chốt công → Chấm KPI → Tính lương → Phê duyệt → Trả lương.
2. Bảng lương (G):
   - Cột trái đứng yên: ô chọn, avatar, tên, "phòng ban · chức danh". Cột phải đứng yên: Thực nhận, Trạng thái.
   - Phần giữa cuộn ngang và kéo được bằng chuột, gồm nhóm Thu nhập và nhóm Khấu trừ. Dòng tổng ở đáy.
   - Trên bảng: nút lọc trạng thái có số đếm (Tất cả, Nháp, Chờ duyệt, Đã duyệt, Từ chối), ô tìm theo tên, lọc phòng ban, nút xuất Excel.
   - Trên nữa: 4 ô số. Một ô vàng cho Tổng thu nhập, cùng Thực nhận, Khấu trừ và Phiếu đã duyệt có thanh chia đoạn.
3. Bảng không có cột KPI.
4. Phiếu lương (H): bấm tên ở bảng thì mở. Có nút phiếu trước, phiếu sau, đóng; 5 ô nhập điểm KPI (Base Wework, Người dùng, Đồng nghiệp, Quản lý trực tiếp, Tự đánh giá) là ô chữ nhật bo 8px; danh sách "Lịch sử sửa điểm (n)" của từng người mở/đóng được; có In, Từ chối, Duyệt phiếu. Gõ điểm thì tổng điểm, Lương KPI, Tổng thu nhập và Thực nhận đổi ngay.
5. Không làm (người dùng đã bỏ): nút lọc theo KPI; Enter để sang người kế tiếp hay mọi cách nhập điểm hàng loạt; bộ đếm "x / n"; chế độ nhập điểm riêng; tab KPI; cột KPI trong bảng.
6. Không có ô nhập hay nhãn giá trị bo tròn hẳn (dạng viên thuốc) trong nội dung. Nhãn trạng thái trong bảng và ở đầu phiếu thì được.
7. Thứ 7 là ngày làm việc của mọi người trong mockup (công chuẩn 26). Tháng 10/2026 của mockup có 27 ngày có lịch (thứ 2 – thứ 7). Lịch thứ 7 riêng từng người là việc của BE sau này.

Điều chỉnh của điều phối (04/11/2026, sau khi luật KPI, bảo hiểm, thuế được chốt và board H được dựng lại theo phiếu lương mẫu của người dùng):

8. Không có mốc đạt: không có chữ "Đạt / Chưa đạt" và không có chấm màu theo kết quả.
9. Thiếu điểm không còn nghĩa "chưa chấm đủ thì không có KPI". Cột thiếu tính 0 điểm, phiếu có cờ "Thiếu điểm <cột>". Ô Lương KPI trong bảng hiện số tiền kèm chấm cam.
10. Trọng số KPI được hiện trên nhãn.
11. Phiếu H là bảng "Tổng hợp lương" hai cột "Theo quy chế" và "Thực tế". Thực nhận là một dải nền `gold-pale` ở cuối bảng, thay cho ô nền tối. Ô điểm ghi "%" thay cho "/ 100". Nút In nằm ở đầu phiếu.
12. Cột "Khác" của G thành "Trừ giờ".
13. Dữ liệu giả của Bảng lương là nguồn gốc. Dữ liệu giả của Tổng quan đọc theo nó.

Quy tắc thiết kế người dùng đặt sau khi spec sẵn sàng (04/11/2026):

14. Trong danh sách và bảng của Admin, mỗi ô chỉ hiện một giá trị chính, trên một dòng.
    - Thông tin phụ nằm ở màn chi tiết mở từ dòng đó; ở đây là ngăn kéo phiếu lương.
    - Thông tin phụ gồm: lý do và khoảng ngày; mã và bậc; chú thích giải thích và chú giải.
    - Bảng lương không thêm cột, dòng phụ hay chú thích nào ngoài những gì board G đã có.
    - Những gì board G đã có thì giữ nguyên, vì người dùng đã duyệt: dòng phụ "phòng ban · chức danh", phần " / 26" của Ngày công, chấm cam thiếu điểm ở ô Lương KPI, hai câu ở chân thẻ.

## Luật lương dùng trong mockup

### Đã chốt (mockup tính theo đúng các luật này)

- **Tiền cơ sở:** lương cơ bản là lương của bậc. Lương ngày = lương cơ bản ÷ công chuẩn (nhân viên 26). Lương giờ = lương ngày ÷ 8.
- **Tổng điểm KPI %** = Base Wework × 40% + Người dùng × 24% + Đồng nghiệp × 18% + Quản lý trực tiếp × 12% + Tự đánh giá × 6%. Mỗi điểm từ 0 đến 100.
- **Lương KPI** = Tổng điểm % × Lương KPI đề xuất của tháng. Mức đề xuất không vượt mức KPI tối đa của bậc. Không có mốc đạt, không có hệ số ngày. Thiếu điểm cột nào thì cột đó tính 0 điểm và phiếu có cờ "Thiếu điểm <tên cột>".
- **Bảo hiểm:** BHXH 8% + BHYT 1,5% + BHTN 1% = 10,5% lương cơ bản của bậc.
- **Thuế TNCN** (hợp đồng từ 3 tháng trở lên, lũy tiến):
  - Thu nhập chịu thuế = Tổng thu nhập − Các khoản miễn thuế.
  - Thu nhập tính thuế = Thu nhập chịu thuế − Bảo hiểm − 15.500.000 − 6.200.000 × số người phụ thuộc. Âm thì là 0.
  - Năm bậc: tới 10 triệu 5%, 10–30 triệu 10%, 30–60 triệu 20%, 60–100 triệu 30%, trên 100 triệu 35%.
- **Ngày có giải trình còn chờ duyệt:** ngày đó 0 đ, phiếu nháp có cờ.

### Chưa chốt (số lưu sẵn từng người, không nhãn %, không công thức)

- Tiền nghỉ phép có lương, iSAT, ngày lễ, quyết toán phép dư.
- Phụ cấp: chuyên cần, đi lại, linh hoạt (ca Flex), Off Paid (ca đêm), thưởng ca đêm. Cột "Theo quy chế" là mức lưu sẵn, cột "Thực tế" là số lưu sẵn.
- Làm thêm giờ: số giờ và tiền.
- Đi muộn, về sớm, ra ngoài: số giờ bị trừ và tiền bị trừ.
- Các khoản miễn thuế.
- Ngày phép năm còn lại.

Màn chỉ cộng trừ các số này như số có sẵn. Màn không hiện tỷ lệ hay cách tính của chúng.

## Ngoài phạm vi

- Các bước kỳ lương trên dữ liệu giả: chốt công, tính lương (nút "Tính lại"), phê duyệt kỳ (nút "Phê duyệt kỳ lương"), phê duyệt hàng loạt, trả lương, mở lại, thêm khoản cộng/trừ, kiểm tra lại, in tất cả phiếu. Luật đã chốt cần dùng ở đợt đó: kỳ không phê duyệt được khi còn giải trình chờ duyệt.
- Dữ liệu giả cho trang in A4 (`/in/phieu-luong/...`).
- Bảng lương của các tháng khác tháng 10/2026.
- Lịch làm thứ 7 riêng từng người.
- Hợp đồng dưới 3 tháng, người không đóng bảo hiểm, người chưa có mức KPI đề xuất: luật đã chốt nhưng không người nào trong dữ liệu giả cần, nên đợt này không cài.
- Thanh trên, chuông và các màn Chấm công: thuộc kế hoạch chuông và chấm công (`2026-11-04-admin-bell-attendance.md`), chạy **song song** với kế hoạch của spec này, mỗi kế hoạch một nhánh. Lead gộp các nhánh ở cuối.
- Mọi thay đổi ở code BE: `src/`, `migrations/`, `test/v2/`, `spec/`.
- Lưu dữ liệu giả qua lần tải lại trang.

## 1. Lớp dữ liệu giả

### 1.1 File trong `web/src/mock/`

| File | Nội dung |
|------|----------|
| `payroll.ts` (mới) | Bảng lương tháng 10/2026 ở dạng màn: 10 dòng mẫu, phần còn lại của kỳ, phiếu từng người. Giữ trạng thái trong bộ nhớ: điểm KPI, trạng thái phiếu, lịch sử sửa điểm. |
| `payroll-calc.ts` (mới) | Bản tính của mockup theo luật đã chốt. Đầu file ghi: "Bản tính của mockup theo luật đã chốt. Phép tính thật nằm ở BE; xoá file này khi FE nối lại BE." |
| `period.ts` | Thêm bước "Chấm KPI" (mục 1.5). |
| `overview.ts` | Đọc dòng bảng lương, số đếm phiếu và tổng kỳ từ `payroll.ts` (mục 1.6). |

### 1.2 Mười người mẫu (`mock/payroll.ts`)

Tất cả là nhân viên (NV), hợp đồng lao động từ 3 tháng, có đóng bảo hiểm, công chuẩn 26. Mỗi người: ngày công + phép + iSAT + chờ giải trình + không lương = 27.

**Hồ sơ, ngày và trạng thái**

| Người | Mã | Phòng ban · chức danh | Bậc | NPT | Lương cơ bản | Công · phép · iSAT · chờ GT · KL | Ngày nghỉ, chờ giải trình | Phép còn | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| Nguyễn Thu Hà | GFT-0101 | Tài chính · Kế toán tổng hợp | 3 | 1 | 16.000.000 | 26 · 0 · 1 · 0 · 0 | iSAT 10/10 | 12 | Đã duyệt |
| Trần Minh Quân | GFT-0108 | Kỹ thuật · Kỹ sư phần mềm | 4 | 2 | 24.000.000 | 25 · 1 · 1 · 0 · 0 | phép 15/10, iSAT 24/10 | 9 | Đã duyệt |
| Lê Hoàng Nam | GFT-0142 | Kinh doanh · Nhân viên kinh doanh | 2 | 0 | 12.000.000 | 24 · 1 · 1 · 1 · 0 | phép 12/10, iSAT 17/10, chờ GT 27/10 | 11 | Chờ duyệt |
| Phạm Ngọc Anh | GFT-0117 | Nhân sự · Chuyên viên nhân sự | 2 | 1 | 14.000.000 | 26 · 0 · 1 · 0 · 0 | iSAT 03/10 | 12 | Chờ duyệt |
| Võ Đức Thịnh | GFT-0123 | Kỹ thuật · Trưởng nhóm QA | 3 | 1 | 20.000.000 | 23 · 2 · 1 · 0 · 1 | phép 20–21/10, iSAT 10/10, KL 23/10 | 8 | Nháp |
| Đỗ Mai Linh | GFT-0156 | Marketing · Thiết kế đồ hoạ | 2 | 0 | 13.000.000 | 22 · 1 · 1 · 0 · 3 | phép 06/10, iSAT 17/10, KL 13–15/10 | 10 | Từ chối |
| Bùi Quốc Huy | GFT-0063 | Sản xuất · Tổ trưởng | 2 | 2 | 11.000.000 | 24 · 0 · 1 · 0 · 2 | iSAT 24/10, KL 08–09/10 | 12 | Nháp |
| Trịnh Văn Long | GFT-0171 | Sản xuất · Công nhân vận hành | 1 | 1 | 9.500.000 | 25 · 0 · 1 · 1 · 0 | iSAT 03/10, chờ GT 22/10 | 12 | Chờ duyệt |
| Lý Thanh Tâm | GFT-0172 | Sản xuất · Công nhân vận hành | 1 | 0 | 9.500.000 | 26 · 0 · 1 · 0 · 0 | iSAT 10/10 | 12 | Nháp |
| Ngô Gia Bảo | GFT-0175 | Sản xuất · Công nhân vận hành | 1 | 0 | 9.500.000 | 25 · 1 · 1 · 0 · 0 | phép 16/10, iSAT 24/10 | 11 | Chờ duyệt |

Các ngày có lịch còn lại là ngày công. Chủ nhật (04, 11, 18, 25/10) không có lịch. Ngày 29–31/10 là ngày tới: vẫn tính vào ngày công vì phiếu tạm tính cả tháng. Kế hoạch chuông và chấm công chạy song song và có dữ liệu giả Chấm công riêng. Khi gộp, lead đối chiếu ngày nghỉ của 10 người giữa hai bộ dữ liệu.

**Số lưu sẵn** (khoản chưa chốt). Phụ cấp ghi "theo quy chế → thực tế".

| Người | Phép | iSAT | Chuyên cần | Đi lại | Linh hoạt | Off Paid | Thưởng ca đêm | OT giờ ×1,5 · ×2 · ×3 | Tiền OT | Miễn thuế | Đi muộn (phút) | Giờ trừ | Tiền trừ | Tạm ứng |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hà | 0 | 615.385 | 2.000.000 → 2.000.000 | 800.000 → 800.000 | 3.200.000 → 0 | 975.000 → 0 | 6.400.000 → 0 | 4 · 0 · 0 | 461.538 | 153.846 | — | 0 | 0 | 0 |
| Quân | 923.077 | 923.077 | 2.500.000 → 2.403.846 | 1.000.000 → 961.538 | 4.800.000 → 0 | 975.000 → 0 | 9.600.000 → 0 | 6 · 4 · 0 | 1.961.538 | 807.692 | 18 | 0,5 | 57.692 | 0 |
| Nam | 461.538 | 461.538 | 1.500.000 → 1.384.615 | 900.000 → 830.769 | 2.400.000 → 0 | 975.000 → 0 | 4.800.000 → 0 | 0 · 0 · 0 | 0 | 0 | 12 | 0 | 0 | 0 |
| Ngọc Anh | 0 | 538.462 | 1.500.000 → 1.500.000 | 700.000 → 700.000 | 2.800.000 → 0 | 975.000 → 0 | 5.600.000 → 0 | 0 · 0 · 0 | 0 | 0 | — | 0 | 0 | 0 |
| Thịnh | 1.538.462 | 769.231 | 2.000.000 → 1.769.231 | 1.000.000 → 884.615 | 4.000.000 → 461.538 | 975.000 → 0 | 8.000.000 → 0 | 0 · 0 · 0 | 0 | 0 | — | 0 | 0 | 0 |
| Linh | 500.000 | 500.000 | 1.300.000 → 1.100.000 | 700.000 → 592.308 | 2.600.000 → 0 | 975.000 → 0 | 5.200.000 → 0 | 0 · 0 · 0 | 0 | 0 | 45, 30, 24 | 2 | 125.000 | 0 |
| Huy | 0 | 423.077 | 1.000.000 → 923.077 | 600.000 → 553.846 | 2.200.000 → 0 | 975.000 → 225.000 | 4.400.000 → 1.015.385 | 8 · 0 · 0 | 634.615 | 1.226.923 | — | 0 | 0 | 2.000.000 |
| Long | 0 | 365.385 | 900.000 → 865.385 | 500.000 → 480.769 | 1.900.000 → 0 | 975.000 → 300.000 | 3.800.000 → 1.169.231 | 6 · 0 · 0 | 411.058 | 1.306.250 | — | 0 | 0 | 0 |
| Tâm | 0 | 365.385 | 900.000 → 900.000 | 500.000 → 500.000 | 1.900.000 → 292.308 | 975.000 → 0 | 3.800.000 → 0 | 0 · 4 · 0 | 365.385 | 182.692 | — | 0 | 0 | 0 |
| Bảo | 365.385 | 365.385 | 900.000 → 865.385 | 500.000 → 480.769 | 1.900.000 → 0 | 975.000 → 187.500 | 3.800.000 → 730.769 | 3 · 0 · 0 | 205.529 | 799.279 | — | 0 | 0 | 0 |

Quyết toán phép dư và nghỉ lễ hưởng lương là 0 ngày, 0 đ với mọi người.

**KPI** (điểm Base Wework · Người dùng · Đồng nghiệp · Quản lý · Tự đánh giá, rồi mức đề xuất)

| Người | Điểm | Đề xuất | Lịch sử sửa điểm ban đầu |
|---|---|---|---|
| Hà | 90 · 85 · 80 · 88 · 90 | 3.000.000 | — |
| Quân | 88 · 92 · 85 · 90 · 95 | 5.000.000 | — |
| Nam | 62 · 70 · 68 · 65 · 75 | 2.000.000 | 27/10 · Quản lý trực tiếp 60 → 65 (Trưởng phòng Kinh doanh); 25/10 · Đồng nghiệp 72 → 68 (Quản trị viên); 20/10 · Base Wework nhập 62 (Quản trị viên) |
| Ngọc Anh | 80 · 82 · 78 · 85 · 80 | 2.500.000 | — |
| Thịnh | 85 · 80 · 82 · 88 · 85 | 4.000.000 | — |
| Linh | 70 · 75 · 72 · 70 · 80 | 2.000.000 | — |
| Huy | 80 · 78 · 75 · 82 · trống | 2.000.000 | — |
| Long | 78 · 75 · 80 · 76 · 85 | 1.500.000 | — |
| Tâm | 82 · 80 · 78 · 80 · 85 | 1.500.000 | — |
| Bảo | 75 · 78 · 72 · 80 · 80 | 1.500.000 | — |

**Kết quả tính** (bản tính mục 1.4 phải ra đúng các số này; chúng là số của board G và H)

| Người | Tiền ngày công | Tổng điểm | Lương KPI | Phụ cấp | Làm thêm | Trừ giờ | Tổng thu nhập | Bảo hiểm | Thuế TNCN | Tạm ứng | Thực nhận |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Hà | 16.615.385 | 86,76% | 2.602.800 | 2.800.000 | 461.538 | — | 22.479.723 | 1.680.000 | — | — | 20.799.723 |
| Quân | 24.923.077 | 89,08% | 4.454.000 | 3.365.384 | 1.961.538 | −57.692 | 34.646.307 | 2.520.000 | 170.931 | — | 31.955.376 |
| Nam | 11.999.999 | 66,14% | 1.322.800 | 2.215.384 | — | — | 15.538.183 | 1.260.000 | — | — | 14.278.183 |
| Ngọc Anh | 14.538.462 | 80,72% | 2.018.000 | 2.200.000 | — | — | 18.756.462 | 1.470.000 | — | — | 17.286.462 |
| Thịnh | 20.000.001 | 83,62% | 3.344.800 | 3.115.384 | — | — | 26.460.185 | 2.100.000 | 133.009 | — | 24.227.176 |
| Linh | 12.000.000 | 72,16% | 1.443.200 | 1.692.308 | — | −125.000 | 15.010.508 | 1.365.000 | — | — | 13.645.508 |
| Huy | 10.576.923 | 74,06% | 1.481.200 ● | 2.717.308 | 634.615 | — | 15.410.046 | 1.155.000 | — | 2.000.000 | 12.255.046 |
| Long | 9.500.000 | 77,82% | 1.167.300 | 2.815.385 | 411.058 | — | 13.893.743 | 997.500 | — | — | 12.896.243 |
| Tâm | 9.865.385 | 80,74% | 1.211.100 | 1.692.308 | 365.385 | — | 13.134.178 | 997.500 | — | — | 12.136.678 |
| Bảo | 9.865.385 | 76,08% | 1.141.200 | 2.264.423 | 205.529 | — | 13.476.537 | 997.500 | — | — | 12.479.037 |
| **Tổng 10 phiếu** | 139.884.617 | | 20.186.400 | 24.877.884 | 4.039.663 | −182.692 | 188.805.872 | 14.542.500 | 303.940 | 2.000.000 | 171.959.432 |

● Huy thiếu điểm Tự đánh giá (tính 0).

**Phần còn lại của kỳ** (118 phiếu không có trong 10 dòng mẫu, hằng số):

- Số phiếu: 9 nháp, 25 chờ duyệt, 84 đã duyệt, 0 từ chối. Cộng 10 dòng mẫu ra 12, 29, 86, 1 (tổng 128) như Tổng quan.
- Tiền: Tổng thu nhập 2.292.000.000, Bảo hiểm 245.500.000, Thuế 89.700.000, Tạm ứng 18.000.000.
- Cộng 10 dòng mẫu thì cả kỳ ra: Tổng thu nhập 2.480.805.872 (2,48 tỷ), Bảo hiểm 260.042.500 (0,26), Thuế 90.003.940 (0,09), Tạm ứng 20.000.000 (0,02), Khấu trừ 0,37 tỷ, Thực nhận 2.110.759.432 (2,11 tỷ, 85%). Sửa điểm trong phạm vi 0–100 không làm đổi các số làm tròn này.

**Hàm của file:**

- `payrollView(month)`: dữ liệu màn Bảng lương (dòng, số đếm, tổng kỳ, phòng ban). Tháng khác 2026-10 trả `{ month, empty: true }`.
- `payslipView(month, id)`: phiếu của một người, đã tính theo điểm hiện có.
- `setKpiScore(month, id, part, value)`: ghi một điểm (số nguyên 0–100, hoặc `null` để xoá). Điểm khác điểm cũ thì thêm một dòng lịch sử lên đầu danh sách:
  - ngày `28/10` (theo `MOCK_TODAY`), người sửa là tên tài khoản đang đăng nhập;
  - chữ: "<cột> <cũ> → <mới>"; cũ trống thì "<cột> nhập <mới>"; mới trống thì "<cột> xoá điểm <cũ>".
  - Trả phiếu đã tính lại.
- `decidePayslip(month, id, decision)`: `'approve'` thành Đã duyệt, `'reject'` thành Từ chối. Trả phiếu mới.

### 1.3 Service (`services/admin-payroll.ts`, viết lại)

- `getPayroll(month)`, `getPayslip(month, id)`, `saveKpiScore(month, id, part, value)`, `decidePayslip(month, id, decision)`: gọi `mock/payroll.ts`, trả `respond(...)` như Tổng quan.
- `previewPayslip(slip, scores)`: đồng bộ, gọi `recomputeSlip` của `mock/payroll-calc.ts`, để phiếu đổi số ngay khi gõ mà chưa ghi.

### 1.4 Bản tính của mockup (`mock/payroll-calc.ts`)

- `MOCK_KPI_WEIGHTS = { wework: 40, user: 24, peer: 18, manager: 12, self: 6 }`.
- `kpiScore(scores)`: trả `{ percent, missing }`. `percent = Σ điểm × trọng số ÷ 100`; điểm trống tính 0 và tên cột vào `missing`.
- `kpiPay(percent, proposal)` = `Math.round(proposal × percent ÷ 100)`.
- `baseActual(base, days)` = `Math.round(base × days ÷ 26)`.
- `insurance(base)` = `Math.round(base × 0,105)`.
- `incomeTax(assessable)`: lũy tiến 5 bậc trên phần dương, `Math.round` ở cuối.
- `recomputeSlip(slip)`:
  - Tiền ngày công = lương cơ bản thực tế + tiền phép + tiền iSAT.
  - Tổng phụ cấp = tổng 5 số thực tế.
  - Tổng thu nhập = Tiền ngày công + Lương KPI + Tổng phụ cấp + Tiền OT − Tiền trừ.
  - Thu nhập chịu thuế = Tổng thu nhập − Miễn thuế.
  - Thuế = `incomeTax(Thu nhập chịu thuế − Bảo hiểm − 15.500.000 − 6.200.000 × NPT)`.
  - Thu nhập sau bảo hiểm = Tổng thu nhập − Bảo hiểm.
  - Thực nhận = Tổng thu nhập − Bảo hiểm − Thuế − Tạm ứng.
- Dòng bảng, phiếu và tổng kỳ dùng chung kết quả của `recomputeSlip`. Không có hàm nào trong `web/src/builders/`.

### 1.5 Thanh các bước kỳ lương (`mock/period.ts`)

- Nhãn: Chấm công, Chốt công, Chấm KPI, Tính lương, Phê duyệt, Trả lương.
- Tháng 10/2026: "Chờ phê duyệt"; bốn bước đầu xong, Phê duyệt là bước hiện tại, Trả lương chưa tới.
- Các tháng trước: "Đã trả lương", cả 6 bước xong.

### 1.6 Tổng quan đọc theo Bảng lương

- `mock/overview.ts` lấy từ `payroll.ts`:
  - 6 dòng của thẻ Bảng lương (6 người đầu ở mục 1.2): mã làm `id`, ngày công dạng "24 / 26", lương cơ bản, phụ cấp (Tổng phụ cấp), thực nhận, trạng thái;
  - số đếm phiếu của thẻ Kỳ lương;
  - Quỹ lương (Tổng thu nhập cả kỳ), Thực nhận, Khấu trừ, tỷ lệ Thực nhận.
- Duyệt, từ chối hoặc sửa điểm ở Bảng lương thì Tổng quan đổi theo khi mở lại.
- Các số làm tròn trên Tổng quan (2,48 tỷ; 2,11 tỷ; 0,37 tỷ; 85%; 86 đã duyệt) giữ nguyên.

## 2. Khung Admin

### 2.1 Thanh bên

- `ADMIN_SIDEBAR_GROUPS` (`views/admin/settings/nav.ts`): nhóm Kỳ lương còn Chấm công và Bảng lương.
- `PATHS.danhGiaKpi` đổi thành `PATHS.bangLuong = '/admin/bang-luong'`.
- Cài đặt › Quy tắc KPI (`KpiRulesView.vue`): liên kết "Mở Đánh giá KPI" thành "Mở Bảng lương", dẫn tới `PATHS.bangLuong`. Phần còn lại của màn Cài đặt này giữ nguyên.

### 2.2 Dải các bước kỳ lương

- `AdminLayout.vue`: `STEPS_NAV` còn `['cham-cong']`. Màn Bảng lương tự đặt dải dưới tiêu đề trang (mục 3.1).
- `PeriodStrip.vue` thêm prop `card` (mặc định `false`, hình hiện tại giữ nguyên cho Chấm công). Khi `card`:
  - Thẻ nền `surface`, viền `border`, bo `radius-md` (16px), đệm 16px 24px, xuống dòng khi hẹp.
  - Bên trái: "Tháng 10/2026" đậm và nhãn trạng thái kỳ (viên thuốc): `stateCls` `draft` dùng màu `status-pending`, chữ `ink`; `ok` dùng `status-done`, chữ trắng.
  - Mỗi bước có vòng 22px đánh số. Bước xong: nền `surface-dark`, dấu tích `gold`. Bước hiện tại: nền trắng, viền 2px `status-pending`, số đậm. Bước chưa tới: viền 1,5px `status-draft`, số `ink-muted`.
  - Đường nối giữa các bước co giãn (tối thiểu 16px, dày 2px): `surface-dark` giữa hai bước xong, `status-draft` ở chỗ còn lại.
  - Giữ class `.period`, `.state`, `.steps` (`role="region"`, `tabindex="0"`, cuộn ngang khi hẹp) như hiện nay.
- Dữ liệu và API `setStrip` / `resetStrip` của store giữ nguyên.

### 2.3 Đường dẫn

- `/admin/kpi` và `/admin/kpi/lich-su` chuyển hướng tới `/admin/bang-luong`, giữ nguyên tham số. Hai route chuyển hướng nằm trong `router/routes/admin-payroll.ts`; route KPI cũ bỏ khỏi `admin-attendance.ts`.
- `/admin/bang-luong`:
  - `?thang=YYYY-MM`: tháng, như mọi màn Admin.
  - `?phieu=<mã>` (vd. `GFT-0142`): mở phiếu của người đó. Mở, đóng, phiếu trước/sau đều dùng `router.replace` như hiện nay; tải lại trang thì phiếu mở lại đúng người.
  - Bỏ `?kb=` (kịch bản) và mọi `?hop=` của các bước kỳ lương.
- Lọc trạng thái, tìm tên, lọc phòng ban, ô chọn: giữ trong màn, không ghi lên đường dẫn.

### 2.4 Mục lục thiết kế

- `design-index/admin-attendance.ts`: bỏ hai dòng KPI. `DesignIndex.vue`: tên nhóm thành "Admin · Chấm công, Nhân sự".
- `design-index/admin-payroll.ts`: hai dòng, "Bảng lương · tháng 10" (`/admin/bang-luong?thang=2026-10`) và "Bảng lương · tháng 9 (chưa có dữ liệu giả)" (`?thang=2026-09`).
- `design-index/payslip.ts`: các dòng ngăn kéo cũ và hai hộp in thay bằng "Phiếu lương · Lê Hoàng Nam" (`/admin/bang-luong?thang=2026-10&phieu=GFT-0142`) và "Phiếu lương · Bùi Quốc Huy, thiếu điểm KPI" (`…&phieu=GFT-0063`). Hai dòng trang in A4 giữ nguyên.

## 3. Bảng lương (board G, `views/admin/payroll/PayrollView.vue`)

### 3.1 Bố cục từ trên xuống

1. **Tiêu đề:** "Bảng lương" (League Spartan 28px). Dòng phụ: "Kỳ lương tháng 10/2026 · công 01–31/10 · công chuẩn 26 ngày · trả lương **05/11/2026**".
2. **Dải các bước** dạng thẻ (mục 2.2).
3. **4 ô số:** lưới `auto-fit`, mỗi ô rộng tối thiểu 200px (hẹp hơn thì 100%), cách nhau 16px. Ô bo 16px, đệm 16px 20px, cao tối thiểu 120px. Nhãn 12px, số 28px, dòng phụ 12px. Đơn vị "tỷ ₫" cỡ 18px.
   1. "Tổng thu nhập tháng 10": 2,48 tỷ ₫, "▲ 3,2% so với tháng 9". Nền `gold`, chữ `ink`, là thẻ vàng duy nhất của màn.
   2. "Thực nhận": 2,11 tỷ ₫, "85% tổng thu nhập". Đơn vị màu `ink-muted`.
   3. "Khấu trừ": 0,37 tỷ ₫, "Bảo hiểm 0,26 · Thuế 0,09 · Tạm ứng 0,02".
   4. "Phiếu đã duyệt": "86 / 128" (phần "/ 128" 18px `ink-muted`), dưới là thanh chia đoạn cao 6px theo số đếm: đã duyệt `status-done`, chờ duyệt `status-pending`, nháp `status-draft`, từ chối `status-rejected` (tối thiểu 4px).
   - Các số tính từ tổng kỳ (mục 1.2), làm tròn 2 số lẻ, dấu phẩy thập phân.
4. **Thẻ bảng** (bo 24px, viền `border`, không đổ bóng):
   - Hàng công cụ (xuống dòng khi hẹp):
     - Nhóm nút lọc trạng thái (`role="group"`, `aria-pressed`), dáng viên thuốc cao 32px: "Tất cả 128", "● Nháp 12", "● Chờ duyệt 29", "● Đã duyệt 86", "● Từ chối 1". Chấm 10px theo màu trạng thái. Nút đang chọn nền `surface-dark`, chữ trắng, số `gold`. Số đếm là số cả kỳ.
     - Ô tìm (viền `border-control`, bo 8px, rộng 220px, tối đa 100%), nhãn "Tìm theo tên", gợi ý "Tìm theo tên…".
     - Lọc phòng ban: `<select>` có nhãn "Phòng ban", dáng nút cao 40px bo 8px. Lựa chọn: "Phòng ban: Tất cả", rồi "Phòng ban: <tên>" cho Tài chính, Kỹ thuật, Kinh doanh, Nhân sự, Marketing, Sản xuất.
     - Nút xuất (40 × 40px, icon `download`), nhãn "Xuất bảng lương ra Excel" (mục 3.4).
   - Bảng (mục 3.2) trong hộp cuộn riêng.
   - Chân thẻ (chữ 12px `ink-muted`): "Kéo ngang để xem các khoản · bấm tên để mở phiếu lương"; "● Thiếu điểm KPI, cột thiếu tính 0 điểm" (chấm cam, chỉ hiện khi có dòng đang hiện bị thiếu điểm); bên phải "Hiển thị <n> trong <N> phiếu" với n là số dòng đang hiện, N là số đếm của nút lọc đang chọn.

### 3.2 Bảng

- Hộp cuộn: `role="region"`, nhãn "Bảng lương tháng 10, cuộn ngang để xem các khoản", `tabindex="0"`, `overflow-x: auto`, `overscroll-behavior-x: contain`, thanh cuộn mảnh.
- Bảng `table-layout: fixed`, rộng theo nội dung, số `tabular-nums`, dòng cao 52px, tiêu đề cao 36px, viền dưới `border`.
- Cột (rộng px):

| Phần | Cột |
|------|-----|
| Trái, đứng yên (296) | Nhân viên: ô chọn 16px, avatar chữ 32px (nền `status-draft`), tên đậm, dòng phụ "phòng ban · chức danh" 12px `ink-muted`. Viền phải. |
| Giữa, cuộn | Ngày công (96, tiêu đề hai hàng): "24" và " / 26" nhỏ `ink-muted`. |
| | Nhóm **Thu nhập** (tiêu đề nhóm đậm, chữ nhóm dính trái khi cuộn): Tiền ngày công (132), Lương KPI (124), Phụ cấp (116), Làm thêm (108), Trừ giờ (100), Tổng thu nhập (140, đậm). |
| | Nhóm **Khấu trừ** (tiêu đề nền `ground`, ô nền `raised`): Bảo hiểm (116), Thuế TNCN (112), Tạm ứng (108). |
| Phải, đứng yên | Thực nhận (136, đậm 15px, viền trái), Trạng thái (128, nhãn viên thuốc). |

- Số căn phải. Số 0 hiện "—". Trừ giờ hiện số âm có dấu "−" (vd. "−57.692").
- Ô Lương KPI của người thiếu điểm: chấm cam 8px trước số tiền; ô có chữ ẩn cho trình đọc màn hình và `title` "Thiếu điểm <cột>, tính 0".
- Nhãn trạng thái (viên thuốc 24px): Nháp nền `status-draft` chữ `ink`; Chờ duyệt nền `status-pending` chữ `ink`; Đã duyệt nền `status-done` chữ trắng; Từ chối nền `status-rejected` chữ trắng.
- Tên là `RouterLink` (thay `?phieu=<mã>`, `replace`), không kéo được như ảnh. Rê chuột thì gạch chân tên.
- Dòng của phiếu đang mở: nền `gold-pale`, tên gạch chân.
- Ô chọn: `<input type="checkbox">`, nhãn "Chọn phiếu của <tên>". Chọn chỉ dùng cho nút xuất (mục 3.4); dòng được chọn không đổi nền.
- Dòng tổng ở `tfoot`: "Tổng <n> phiếu đang hiện", cộng các dòng đang hiện, nền `ground`, đậm, cao 48px. Không có dòng nào thì ẩn dòng tổng và hiện "Không có phiếu nào khớp." trong thẻ.
- Màu nền của ô dùng token (`surface`, `raised`, `ground`, `gold-pale`), không viết cứng, để chạy đúng ở cả nền Xám và Kem.
- Mỗi ô một giá trị chính, trên một dòng (quyết định 14). Không thêm cột, dòng phụ hay chú thích ngoài board G. Mã nhân viên, bậc, ngày nghỉ và lý do chỉ có trong phiếu.

### 3.3 Kéo ngang bằng chuột

- Chỉ với chuột (`pointerType === 'mouse'`, nút trái). Cảm ứng và bàn di cuộn như thường.
- Nhấn rồi rê quá 4px thì bắt đầu kéo: `setPointerCapture`, con trỏ `grabbing`, `scrollLeft` = vị trí lúc nhấn − quãng rê.
- Thả sau khi đã kéo thì chặn cú bấm ngay sau đó (bắt ở pha capture), để kéo qua tên không mở phiếu. Chặn `dragstart` của liên kết.
- Nhấn mà không rê (ô chọn, tên) thì bấm như thường.
- Bàn phím: hộp cuộn nhận focus, phím mũi tên cuộn ngang mặc định của trình duyệt.
- Viết thành composable `useDragScroll(el)` trong `views/admin/payroll/`.

### 3.4 Lọc, tìm, xuất

- Lọc trạng thái, tìm tên (không phân biệt hoa thường và dấu, như Tổng quan) và lọc phòng ban chạy cùng lúc trên 10 dòng mẫu.
- Nút xuất tải về `bang-luong-2026-10.csv`:
  - UTF-8 có BOM, phân cách `;`, số nguyên không dấu chấm nghìn, tạo bằng `Blob` và thẻ `<a download>`.
  - Cột: Mã, Họ tên, Phòng ban, Chức danh, Ngày công, Tiền ngày công, Lương KPI, Phụ cấp, Làm thêm, Trừ giờ, Tổng thu nhập, Bảo hiểm, Thuế TNCN, Tạm ứng, Thực nhận, Trạng thái.
  - Có dòng được chọn thì xuất các dòng đã chọn; không thì xuất các dòng đang hiện. Nhãn nút đổi theo: "Xuất 2 phiếu đã chọn ra Excel".

### 3.5 Tháng khác

- Tháng khác 10/2026: tiêu đề "Bảng lương", dải các bước của tháng đó, rồi một thẻ ghi "Bản mockup chỉ có bảng lương tháng 10/2026.". Không có ô số và bảng.

### 3.6 Màn hẹp

- Trang không cuộn ngang ở 375px. Bảng cuộn trong hộp riêng.
- Dưới 768px: Thực nhận và Trạng thái hết đứng yên, cuộn cùng phần giữa. Cột trái còn 184px, ẩn avatar, tên và dòng phụ cắt bằng "…".
- Hàng công cụ xuống dòng; ô tìm rộng 100%.

### 3.7 Khác với board G

- Bỏ nút "Tính lại" và "Phê duyệt kỳ lương" ở đầu trang (các bước kỳ lương ngoài phạm vi).
- Bỏ nút trang trước/sau ở chân bảng. Mockup chỉ có 10 dòng mẫu nên không có trang 2.
- Dòng gợi ý ở chân bảng không có icon tay (bộ icon chưa có hình này).
- Nút xuất Excel tạo file CSV (mục 3.4).

## 4. Phiếu lương một người (board H, `payslip/PayslipDrawer.vue` viết lại)

### 4.1 Khung ngăn kéo

- Dùng `AppDrawer` với prop mới `floating` (mặc định `false`, các ngăn kéo khác giữ nguyên):
  - Cách mép trên, phải, dưới 16px; rộng 540px, tối đa `100% − 32px`; bo 24px; không đổ bóng; nền `surface`.
  - Đầu ngăn kéo dính trên, chân dính dưới, thân cuộn ở giữa.
  - Dưới 768px: cách mép trái và phải 16px, chiếm hết bề ngang còn lại.
- `title` của `AppDrawer` là "Phiếu lương của <tên>" (nhãn của hộp thoại). Slot `head` hiện "Phiếu lương tháng 10/2026" (18px đậm) và 3 nút icon 36px không viền: In phiếu (icon `print`), Phiếu trước (`chevl`), Phiếu sau (`chevr`). Nút Đóng sẵn có của `AppDrawer`, ở dạng `floating` là nút 36px không viền, màu `ink-muted`.
- Bẫy focus, Escape, bấm nền để đóng giữ như `AppDrawer` hiện nay.

### 4.2 Phần đầu thân phiếu

1. Hàng định danh: avatar chữ 48px nền `gold-light`, tên 16px đậm, dòng phụ "phòng ban · chức danh · mã" 12px `ink-muted`, bên phải là nhãn trạng thái.
2. Dải thông tin 3 ô (viền `border`, bo 12px, ngăn bằng viền dọc): "Loại · bậc" (vd. "NV · Bậc 2"), "Tình trạng" ("HĐLĐ từ 3 tháng"), "Trả lương" ("05/11/2026").
3. Ghi chú 12px `ink-muted`: "Từ 01/10 đến 31/10/2026 · tạm tính cả tháng, số liệu tới 28/10 · công chuẩn theo quy chế: 26 ngày".
4. **Chấm công tháng 10:**
   - Tiêu đề 15px đậm, bên phải liên kết "Xem từng ngày ›" tới hồ sơ chấm công của người đó (mục 4.6).
   - Dải 31 ô ngày (cao 14px, bo 4px, cách nhau 3px, `title` "d/10"): ngày công nền `surface-dark`; phép và iSAT nền `status-done`; chờ giải trình nền trắng viền 2px `status-pending`; nghỉ không lương nền `status-draft`; Chủ nhật nền `ground`; ngày 29–31 nền trắng viền 1px `border`. Cả dải là `role="img"` với nhãn tóm tắt.
   - 5 ô số (viền `border`, bo 12px): Ngày công, Phép · iSAT, Chờ giải trình, Làm thêm (tổng giờ, vd. "0 giờ"), Đi muộn (tổng phút, vd. "12 phút").

### 4.3 Tổng hợp lương

- Tiêu đề "Tổng hợp lương", bên phải "Số tiền tính bằng đồng".
- Lưới 3 cột: Khoản | Theo quy chế (92px) | Thực tế (104px), số căn phải `tabular-nums`. Hàng đầu là tiêu đề cột 12px `ink-muted`.
- Mỗi nhóm có dải tiêu đề nền `ground`, chữ 11px in hoa `ink-muted`. Mỗi dòng có viền dưới `border`. Dòng "đậm" ghi (đ). Số 0 hiện "0" màu `#757575`. Dòng phụ 12px `ink-muted` dưới nhãn.

| Nhóm | Dòng (Theo quy chế · Thực tế) |
|------|-------------------------------|
| NGÀY CÔNG VÀ LƯƠNG CƠ BẢN | Ngày công tháng 10 (26 · ngày công); Lương cơ bản (đ) (lương bậc · lương cơ bản thực tế); Chờ giải trình (ngày) (trống · số ngày; khi > 0 có chấm cam và dòng phụ "<ngày> · tạm tính 0 đ tới khi duyệt"); Nghỉ không lương (ngày) (trống · số ngày) |
| NGHỈ PHÉP VÀ NGÀY LỄ | Nghỉ phép có lương (ngày) (số ngày · tiền); Quyết toán phép dư (ngày) (0 · 0); Nghỉ thứ 7 hưởng lương · iSAT (ngày) (số ngày · tiền); Nghỉ lễ hưởng lương (ngày) (0 · 0) |
| LÀM THÊM GIỜ | OT ×1,5 · ×2 · ×3 (giờ) (giờ ba loại, vd. "0 · 0 · 0" · trống); Tiền OT (trống · tiền) |
| PHỤ CẤP | Chuyên cần; Đi lại; Linh hoạt (ca Flex); Off Paid (ca đêm); Thưởng ca đêm (mỗi dòng: mức quy chế · thực tế); Tổng phụ cấp (đ) (trống · tổng) |
| LƯƠNG KPI | 5 ô điểm (mục 4.4); Tổng điểm KPI (trống · vd. "66,14%"); dòng cờ thiếu điểm (mục 4.4); Lương KPI (đề xuất → thực tế) (đ) (mức đề xuất · Lương KPI); nút "Lịch sử sửa điểm (n)" |
| ĐI MUỘN, VỀ SỚM, RA NGOÀI | Giờ và tiền bị trừ (giờ, vd. "0,5" · tiền âm, vd. "−57.692"). Dòng phụ: "Đi muộn <tổng> phút"; khi mọi lần đi muộn đều không quá 15 phút thì thêm ", không quá 15 phút nên không trừ". Không đi muộn thì không có dòng phụ. |

- Sau các nhóm là phần tổng (viền trên 2px `ink`), chỉ cột Thực tế có số:
  1. Tổng thu nhập (đ)
  2. Các khoản miễn thuế
  3. Thu nhập chịu thuế
  4. Bảo hiểm bắt buộc 10,5%, dòng phụ "BHXH 8% · BHTN 1% · BHYT 1,5%"
  5. Thu nhập sau bảo hiểm (đ)
  6. Thuế TNCN, dòng phụ "Lũy tiến · <n> người phụ thuộc"
  7. Tạm ứng
  8. Dải **Thực nhận**: nền `gold-pale`, viền trên và dưới 2px `ink`, chữ 18px đậm, số kèm "₫".
  9. Ngày phép năm còn lại ("11 ngày").

### 4.4 Chấm điểm KPI

- 5 ô xếp lưới 5 cột (dưới 480px: 3 cột). Nhãn 12px `ink-muted` có trọng số: "Base Wework (40%)", "Người dùng (24%)", "Đồng nghiệp (18%)", "Quản lý (12%)", "Tự đánh giá (6%)". Sau ô là "%".
- Ô: `<input type="text" inputmode="numeric" maxlength="3" autocomplete="off">`, rộng 56px, cao 32px, bo 8px, viền `border-control`, chữ 14px đậm căn phải. Vòng focus 2px `ink`. Nhãn cho trình đọc màn hình: "Điểm <tên cột đầy đủ> của <tên>, phần trăm".
- Gõ: bỏ ký tự không phải số, lớn hơn 100 thì thành 100, xoá hết là trống.
- Ô trống: viền 2px `status-pending`. Có ô trống thì hiện dòng cờ: chấm cam, "Thiếu điểm <các cột>", dòng phụ "Cột thiếu tính 0 điểm".
- Mỗi lần gõ (`input`): phiếu tính lại ngay bằng `previewPayslip`. Đổi ngay Tổng điểm KPI, Lương KPI, Tổng thu nhập, Thu nhập chịu thuế, Thu nhập sau bảo hiểm, Thuế TNCN, Thực nhận và dòng cờ.
- Rời ô (`change`): gọi `saveKpiScore`. Dòng bảng phía sau, ô số và tổng kỳ cập nhật; điểm khác điểm cũ thì lịch sử thêm một dòng.
- Enter không chuyển người, không lưu riêng (người dùng đã bỏ).
- **Lịch sử sửa điểm (n):** nút chữ gạch chân, `aria-expanded`. Mở ra danh sách mới nhất ở trên, mỗi dòng "<ngày> · <nội dung>" bên trái, người sửa 12px `ink-muted` bên phải. n = 0 thì thay nút bằng chữ `ink-muted` "Chưa sửa điểm lần nào".

### 4.5 Duyệt, từ chối, đi phiếu khác

- Chân ngăn kéo (viền trên `border`): "Từ chối" (viền `border-control`) và "Duyệt phiếu" (nền `black`, chữ trắng, chiếm phần còn lại). Hai nút chỉ có khi phiếu là Nháp hoặc Chờ duyệt.
- Bấm: gọi `decidePayslip`. Nhãn đầu phiếu, dòng bảng, nút lọc, ô "Phiếu đã duyệt" và thanh chia đoạn cùng đổi. Hai nút ẩn đi.
- Phiếu Đã duyệt hoặc Từ chối: chân ghi "Đã duyệt phiếu lương của <tên>." hoặc "Đã từ chối phiếu lương của <tên>." trong vùng `aria-live="polite"`.
- Phiếu trước / sau: đi trong các dòng đang hiện lúc mở phiếu, theo thứ tự bảng. Đổi trạng thái phiếu không làm đổi danh sách này. Ở đầu hay cuối danh sách thì nút tương ứng bị tắt.

### 4.6 In phiếu và hồ sơ chấm công

- **In phiếu:** gọi `window.print()`. CSS in (`@media print`):
  - chỉ in ngăn kéo: ẩn khung, màn, nền mờ, nút đầu và chân ngăn kéo;
  - ngăn kéo thành khối tĩnh rộng hết trang, không cuộn, in đủ nội dung.
- **Xem từng ngày:** đợt này dẫn tới `/admin/cham-cong`, giữ `?thang`, vì nhánh này chưa có hồ sơ chấm công từng người. Hồ sơ đó do kế hoạch chuông và chấm công làm song song. Khi gộp hai nhánh, liên kết này đổi sang hồ sơ của người đó.

### 4.7 Khác với board H

- Icon nút In là máy in (`print`), thay cho mũi tên tải, để khớp nhãn "In phiếu".

## 5. Gỡ bỏ

- Màn Đánh giá KPI: `views/admin/kpi/` (KpiShell, KpiScoresView, KpiHistoryView), `builders/admin-kpi/kpi.ts`, `services/admin-kpi.ts`, `tests/kpi-ux.spec.ts`.
- Bảng lương cũ:
  - `scenarios.ts` và toàn bộ `parts/` hiện có: bảng gọn, bảng đủ cột, băng chọn phiếu, dải công thức, thẻ khoản thêm, các hộp bước kỳ lương, `DlgField`, `RichText`, `EntryActionDialog`, `PayrollDialogs`.
  - `services/admin-payroll.ts` bản cũ (viết lại, mục 1.3) và `builders/admin-payroll/payroll.ts`.
- Ngăn kéo phiếu cũ: `PayslipBody.vue`, `SlipOverrideDialog.vue`, `PrintPreviewDialog.vue`, `PrintAllDialog.vue`.
- Hai file in chỉ các hộp trên dùng: `views/print/A4Preview.vue`, `views/print/printLink.ts`.
- Giữ nguyên, không sửa một dòng: route in A4 (`router/routes/payslip.ts`), `views/print/PayslipPrint.vue`, `A4Payslip.vue`, `slipFormat.ts`, `services/payslip.ts`, `builders/payslip/`. Không file nào chúng nhập bị xoá, nên chúng vẫn biên dịch như cũ. Trang in vẫn báo lỗi `mock_missing` như các màn chưa có dữ liệu giả.
- Thành phần mới của màn đặt trong `views/admin/payroll/parts/` (ô số, hàng công cụ, bảng) và `views/admin/payroll/payslip/` (tổng hợp lương, chấm điểm KPI, dải chấm công). Plan chia file cụ thể.

## 6. Kiểm thử và xác minh

### 6.1 Test sửa (`admin-shell.spec.ts`)

1. Bấm qua menu: bỏ "Đánh giá KPI" khỏi danh sách; thanh bên không có liên kết "Đánh giá KPI".
2. Dải các bước: mở `/admin/bang-luong` thay cho `/admin/kpi`. `.period .state` có "Chờ phê duyệt"; `.period .steps` là vùng nhận focus; có đúng 6 bước theo thứ tự, có "Chấm KPI". Tổng quan vẫn không có dải.
3. Ngăn kéo điện thoại: bấm "Bảng lương" thay cho "Đánh giá KPI"; đường dẫn `/admin/bang-luong?thang=2026-10`; mục đang chọn là "Bảng lương".
4. Đổi màn bỏ tham số cũ: bấm "Bảng lương", đường dẫn `/admin/bang-luong?thang=2026-10`, chuông đóng.

### 6.2 Test mới

`admin-shell.spec.ts`:

- `/admin/kpi?thang=2026-10` và `/admin/kpi/lich-su?thang=2026-10` về `/admin/bang-luong?thang=2026-10`.

`payroll-ux.spec.ts` (viết lại, bỏ test `fixme` cũ):

1. **Bảng tháng 10:** không có request `/api`. Có tiêu đề, dải 6 bước, 4 ô số (2,48 tỷ; 2,11 tỷ; 0,37 tỷ; 86 / 128), nút lọc 128 / 12 / 29 / 86 / 1, 10 dòng. Nam có "24 / 26" và Thực nhận 14.278.183. Linh có Trừ giờ −125.000. Dòng tổng có Thực nhận 171.959.432. Ô Lương KPI của Huy có chấm cam và 1.481.200. Chân có câu thiếu điểm.
2. **Lọc và tìm:** "Chờ duyệt" còn 4 dòng (Nam, Ngọc Anh, Long, Bảo) và "Hiển thị 4 trong 29 phiếu". Phòng ban Sản xuất còn 4 dòng. Tìm "hoang nam" (không dấu) ra đúng Lê Hoàng Nam. Chữ không khớp thì hiện "Không có phiếu nào khớp." và không có dòng tổng.
3. **Cột đứng yên và kéo:** ở 1440px, cuộn hộp tới cuối thì ô tên và ô Thực nhận vẫn nằm trong hộp. Kéo chuột 300px sang trái từ giữa bảng thì `scrollLeft` tăng. Kéo bắt đầu trên một tên thì không mở phiếu.
4. **Mở phiếu Nam:** bấm tên thì có `phieu=GFT-0142` và hộp thoại "Phiếu lương của Lê Hoàng Nam". Tổng điểm 66,14%, Lương KPI 1.322.800, Thực nhận 14.278.183, lịch sử có 3 dòng khi mở.
5. **Gõ điểm, thuế đổi theo:** mở Thịnh, Tự đánh giá 85 → 100. Ngay khi gõ: Tổng điểm 84,52%, Lương KPI 3.380.800, Thuế TNCN 134.809, Thực nhận 24.261.376. Rời ô: lịch sử có "28/10 · Tự đánh giá 85 → 100". Đóng phiếu: dòng Thịnh có Thực nhận 24.261.376.
6. **Thiếu điểm:** mở Huy: ô Tự đánh giá có viền cam, có dòng "Thiếu điểm Tự đánh giá". Gõ 80: dòng cờ mất, Tổng điểm 78,86%, Lương KPI 1.577.200. Rời ô rồi đóng: ô Lương KPI của Huy hết chấm cam. Xoá một điểm của Nam (Base Wework): có dòng cờ, Tổng điểm 41,34%, Thực nhận 13.782.183.
7. **Duyệt và từ chối:** Duyệt phiếu Nam: nhãn "Đã duyệt", chân ghi "Đã duyệt phiếu lương của Lê Hoàng Nam.", hai nút mất. Đóng: nút lọc Chờ duyệt 28, Đã duyệt 87, ô số 87 / 128. Mở Tổng quan: thẻ Kỳ lương có 87 đã duyệt, dòng Nam "Đã duyệt". Từ chối phiếu Long: nút lọc Từ chối 2.
8. **Phiếu đã duyệt từ trước** (Hà): không có nút Từ chối và Duyệt phiếu.
9. **Phiếu trước / sau:** từ Nam, Phiếu sau thì sang Phạm Ngọc Anh (`phieu=GFT-0117`). Ở Hà (dòng đầu) nút Phiếu trước bị tắt.
10. **Xuất:** tải về `bang-luong-2026-10.csv`, dòng đầu là tên cột. Chọn 2 dòng rồi xuất thì file có 2 dòng số liệu.
11. **In:** chặn `window.print` bằng `addInitScript`, bấm In phiếu thì hàm được gọi. Ở chế độ in (`emulateMedia({ media: 'print' })`), bảng lương bị ẩn còn nội dung phiếu hiện.
12. **Hình:** ngăn kéo bo 24px, không đổ bóng. Màn có đúng một ô nền `gold`. Đổi nền Kem và thanh bên Sáng: màn vẫn hiện đủ, ô khấu trừ dùng màu `raised` của nền Kem.
13. **375px:** trang không cuộn ngang (`scrollWidth` ≤ 375); hộp bảng cuộn ngang được; ngăn kéo cách mép trái 16px và rộng 343px.
14. **Tháng khác:** `/admin/bang-luong?thang=2026-09` hiện "Bản mockup chỉ có bảng lương tháng 10/2026.".

`admin-overview.spec.ts`: các test hiện có giữ nguyên và phải còn xanh (các số làm tròn không đổi).

### 6.3 Test xoá

- `kpi-ux.spec.ts` (màn không còn).

### 6.4 Lệnh xác minh

- `npm --prefix web run test:ui`: test mới và test sửa xanh; test `fixme` của các màn khác giữ nguyên.
- `npm test` ở thư mục gốc (BE): kết quả như trước khi sửa, để chứng minh BE không bị đụng.

## 7. Rủi ro

| Rủi ro | Cách xử lý |
|--------|------------|
| Bản tính của mockup lệch với BE khi luật đổi | Chỉ tính các luật đã chốt. Đầu file `payroll-calc.ts` ghi rõ là bản của mockup, xoá khi FE nối lại BE. |
| Số làm tròn từng bước ra số lẻ (Tiền ngày công của Nam 11.999.999, của Thịnh 20.000.001) | Đúng như board. Câu hỏi mở 3. |
| Plan này chạy song song với kế hoạch chuông và chấm công và kế hoạch Nhân sự, mỗi plan một nhánh, cùng gốc `337374f`. Lead gộp các nhánh ở cuối. Nhiều file dùng chung bị sửa ở cả hai nhánh: `nav.ts`, `AdminLayout.vue`, `mock/overview.ts`, `routes/admin-attendance.ts`, `utils/format.ts`, `admin-shell.spec.ts`, `admin-overview.spec.ts`. | Plan giữ sửa đổi ở các file chung ở mức nhỏ nhất. Mục "Xung đột khi gộp" của plan ghi từng file: plan này sửa gì, và khi gộp giữ gì. Sau khi gộp: liên kết "Xem từng ngày" đổi sang hồ sơ từng người; lead đối chiếu ngày nghỉ của 10 người giữa `mock/payroll.ts` và dữ liệu giả Chấm công. |
| Số liệu từng người trên Tổng quan đổi (vd. Thực nhận của Nam 12.757.000 → 14.278.183) | Người dùng đã cho Bảng lương làm nguồn. Test Tổng quan không so các số này. |
| Liên kết cũ tới `/admin/kpi` | Chuyển hướng về Bảng lương. |

## 8. Câu hỏi mở (không tự quyết)

1. **Sửa điểm KPI sau khi phiếu đã duyệt** có được không; nếu được thì phiếu có quay về chờ duyệt không. Mockup tạm cho sửa ở mọi trạng thái, trạng thái phiếu không đổi.
2. **Duyệt phiếu còn cờ** (thiếu điểm KPI, ngày chờ giải trình) có được không. Mockup tạm không chặn.
3. **Làm tròn:** luật đã chốt không nói. Mockup theo bộ sinh của board: làm tròn tới đồng ở từng khoản (lương cơ bản thực tế, Lương KPI, bảo hiểm, thuế); Tổng điểm hiện tới 2 số lẻ.
4. **Các khoản chưa chốt** (phụ cấp, làm thêm, nghỉ phép / iSAT / ngày lễ, đi muộn / về sớm, miễn thuế) vẫn là số lưu sẵn. Hai điểm cần người dùng xác nhận:
   - Bộ nhớ của phiên ghi người dùng đã chốt ngày 04/11: làm thêm ×2 lương giờ trong giới hạn giờ của đơn đã duyệt; ngày lễ và phép có lương trả một lương ngày cho nhân viên và cộng tác viên; đi muộn / về sớm trừ theo khối 30 phút. Mockup có nên tính theo các luật này không.
   - Nhãn "OT ×1,5 · ×2 · ×3 (giờ)" của board hiện hệ số làm thêm, trong khi hệ số chưa chốt (bộ nhớ chỉ ghi ×2).

## 9. Phán quyết đã ghi

- Ruling: `/admin/kpi` và `/admin/kpi/lich-su` chuyển hướng về `/admin/bang-luong`, giữ tham số — để liên kết cũ, dấu trang và mục lục thiết kế vẫn mở được màn chứa KPI — rủi ro nếu sai: xoá hai dòng route.
- Ruling: lịch sử sửa điểm chỉ còn theo từng người trong phiếu, không còn danh sách chung của cả tháng — người dùng chọn danh sách theo người và bỏ tab KPI — rủi ro nếu sai: thêm một danh sách chung ở đợt sau.
- Ruling: xoá hẳn màn Đánh giá KPI cùng builder, service và test của nó — không còn đường dẫn nào mở màn, giữ lại chỉ thành mã chết — rủi ro nếu sai: lấy lại từ lịch sử git.
- Ruling: bản tính của mockup cài các luật đã chốt (lương ngày, KPI, bảo hiểm, thuế TNCN lũy tiến) trong `web/src/mock/payroll-calc.ts`, không đặt trong `web/src/builders/` — FE đang tách khỏi BE, phép tính thật nằm ở BE — rủi ro nếu sai: hai bản tính lệch nhau khi luật đổi; xoá file này khi FE nối lại BE.
- Ruling: bản tính chỉ cài các nhánh dữ liệu giả cần (hợp đồng từ 3 tháng, có đóng bảo hiểm, có mức đề xuất) — không người mẫu nào dùng nhánh còn lại, viết ra là mã không được test — rủi ro nếu sai: thêm nhánh khi có người mẫu cần.
- Ruling: phụ cấp, phép, iSAT, làm thêm, đi muộn, miễn thuế, phép còn lại là số lưu sẵn của từng người, chép từ bộ sinh của board — các luật này chưa chốt — rủi ro nếu sai: thay số lưu sẵn bằng phép tính khi luật được chốt.
- Ruling: dữ liệu giả của Bảng lương là nguồn gốc; Tổng quan đọc dòng, số đếm và tổng kỳ từ đó — người dùng cho Bảng lương làm nguồn, và duyệt phiếu ở Bảng lương thì Tổng quan đổi theo — rủi ro nếu sai: tách lại hai bộ số.
- Ruling: phần còn lại của kỳ (118 phiếu) là hằng số chọn sao cho tổng kỳ ra đúng các số của board (2,48 / 2,11 / 0,37 tỷ; 86 / 29 / 12 / 1) — 10 dòng mẫu không đủ tạo số cả kỳ — rủi ro nếu sai: đổi bốn hằng số.
- Ruling: cột Ngày công đứng riêng trước nhóm Thu nhập, nhóm Thu nhập gồm 6 cột — theo board G (người dùng liệt kê Ngày công trong nhóm) — rủi ro nếu sai: đổi `colspan` của tiêu đề nhóm.
- Ruling: Bảng lương tự đặt dải các bước dạng thẻ dưới tiêu đề trang, `STEPS_NAV` còn `['cham-cong']` — board G đặt dải sau tiêu đề, còn khung đặt dải trên tiêu đề — rủi ro nếu sai: trả `'luong'` về `STEPS_NAV` và bỏ prop `card`.
- Ruling: bỏ nút "Tính lại", "Phê duyệt kỳ lương" và nút chuyển trang của board G — không có luồng trên dữ liệu giả cho chúng, theo lệ của spec Tổng quan là không đặt nút giả — rủi ro nếu sai: thêm lại khi làm các bước kỳ lương.
- Ruling: bỏ các hộp bước kỳ lương cũ cùng service và builder kiểu BE đi kèm — không còn nút nào mở chúng, chúng gọi `api()` theo định dạng BE, đợt các bước kỳ sẽ dựng lại theo board mới — rủi ro nếu sai: lấy lại từ lịch sử git.
- Ruling: tháng khác 10/2026 hiện "Bản mockup chỉ có bảng lương tháng 10/2026." — chưa có dữ liệu giả cho kỳ đã trả lương, và sửa điểm ở kỳ đã khoá là câu hỏi mở 1 — rủi ro nếu sai: thêm dữ liệu giả cho các tháng trước.
- Ruling: nút xuất Excel tạo file CSV (UTF-8 có BOM, phân cách `;`) của các dòng đã chọn hoặc đang hiện — không thêm thư viện được để tạo `.xlsx`, và CSV mở được bằng Excel; ô chọn có việc để làm mà không thêm giao diện mới — rủi ro nếu sai: đổi định dạng file hoặc bỏ phần dùng ô chọn.
- Ruling: nút In gọi hộp in của trình duyệt với CSS chỉ in phiếu, bỏ hộp xem trước A4 và hộp In tất cả cùng `A4Preview.vue`, `printLink.ts` — các hộp này cần dữ liệu A4 kiểu BE chưa có dữ liệu giả — rủi ro nếu sai: lấy lại từ lịch sử git khi trang A4 có dữ liệu giả.
- Ruling: giữ route in A4 `/in/phieu-luong/...` cùng `PayslipPrint.vue`, `A4Payslip.vue`, `slipFormat.ts`, `services/payslip.ts`, `builders/payslip/` mà không sửa — chúng không nhập file nào bị xoá nên vẫn biên dịch như cũ (điều kiện điều phối đặt) — rủi ro nếu sai: trang in là mã chưa có dữ liệu giả cho tới đợt A4; nếu plan thấy có chỗ không biên dịch thì xoá cả nhóm này trong cùng task.
- Ruling: mã phiếu trên đường dẫn là mã nhân viên (`?phieu=GFT-0142`), Tổng quan dùng cùng mã làm `id` — một mã chung cho hai màn, đọc được bằng mắt — rủi ro nếu sai: đổi khoá trong `mock/payroll.ts`.
- Ruling: nút Từ chối và Duyệt phiếu có ở phiếu Nháp và Chờ duyệt — ngăn kéo hiện nay cũng cho duyệt phiếu nháp — rủi ro nếu sai: một điều kiện.
- Ruling: mockup cho sửa điểm ở mọi trạng thái phiếu và không chặn duyệt phiếu còn cờ — chưa có luật (câu hỏi 1, 2), nên mockup không tự đặt luật — rủi ro nếu sai: thêm một điều kiện khoá ô hoặc tắt nút.
- Ruling: gõ điểm thì phiếu tính lại tại chỗ; rời ô mới ghi vào dữ liệu giả và thêm lịch sử — để số đổi ngay khi gõ mà lịch sử không có một dòng cho mỗi phím — rủi ro nếu sai: ghi ngay mỗi lần gõ và gộp lịch sử theo ô.
- Ruling: dưới 768px chỉ cột tên đứng yên (184px, ẩn avatar) — cột trái và hai cột phải cộng 560px, rộng hơn màn 375px — rủi ro nếu sai: chỉ sửa CSS.
- Ruling: `AppDrawer` thêm prop `floating` cho ngăn kéo nổi bo 24px, không bóng; các ngăn kéo khác giữ nguyên — design system không dùng bóng, mà `.drw` chung đang có bóng và dùng ở Nhân sự, Cài đặt — rủi ro nếu sai: bỏ bóng của `.drw` chung ở một đợt khác.
- Ruling: liên kết "Xem từng ngày" tạm dẫn tới `/admin/cham-cong?thang=…` — hồ sơ chấm công từng người được làm song song ở nhánh khác — rủi ro nếu sai: khi gộp, sửa một liên kết.
- Ruling: kế hoạch của spec này chạy song song với kế hoạch chuông và chấm công và kế hoạch Nhân sự, mỗi kế hoạch một nhánh, viết trên `337374f`; lead gộp ở cuối — người dùng yêu cầu làm song song (thay cho phán quyết "chạy trước" đã ghi trước đó) — rủi ro nếu sai: xung đột ở các file chung; plan liệt kê chúng ở mục "Xung đột khi gộp" và giữ sửa đổi ở đó nhỏ nhất.
- Ruling: theo board H mới thay cho mô tả cũ của người dùng (ô Thực nhận nền tối thành dải `gold-pale`, "/ 100" thành "%", nút In lên đầu phiếu) — điều phối báo người dùng yêu cầu dựng lại H theo phiếu lương mẫu — rủi ro nếu sai: đổi lại ba chi tiết hình.
- Ruling: icon nút In là máy in thay cho mũi tên tải của board — nhãn là "In phiếu" — rủi ro nếu sai: đổi một tên icon.
</content>
</invoke>
