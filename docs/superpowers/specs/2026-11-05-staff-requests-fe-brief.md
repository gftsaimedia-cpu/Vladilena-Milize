# Yêu cầu FE: luồng "Tạo yêu cầu" của nhân viên (bản nháp 05/11/2026)

Tài liệu này dùng cho các board J8–J10 (điện thoại) và K3 (máy tính, ngăn kéo phải, hai bước giống J8–J9).

Nguồn:
- câu trả lời của người dùng trong phiên staff-requests ngày 05/11/2026;
- các luật đã chốt từ trước.

Mục nào chưa chốt thì ghi **chờ**.

## 1. Chung cho mọi form

- **Menu J8.** Có 6 loại như board: Đơn nghỉ, Nghỉ có làm bù, Làm thêm giờ, Đổi ca, Giải trình, Tạm ứng. **Chưa làm iSAT**; người dùng sẽ cho thiết kế sau.
- **Ẩn những gì nhân viên không có quyền** (dùng cờ quyền lợi theo loại nhân viên):
  - không có OT (ví dụ tts): ẩn "Làm thêm giờ";
  - không có làm bù: ẩn "Nghỉ có làm bù";
  - không có phép năm: bỏ "Phép năm" khỏi danh sách hình thức nghỉ.
- **Loại trừ nhau trong tháng:**
  - tháng đang có đơn OT (chờ duyệt hoặc đã duyệt) thì không cho nộp Nghỉ có làm bù cho tháng đó;
  - tháng đang có Nghỉ có làm bù thì không cho nộp OT cho tháng đó.
- **Ô chọn ngày** (trừ Giải trình, xem mục 6):
  - chỉ chọn được từ **hôm nay** tới **hết tháng sau**. Ví dụ hôm nay 05/11 thì chọn được 05/11 – 31/12;
  - ngày ngoài khoảng đó bị khoá hẳn, không chọn rồi mới báo lỗi;
  - tháng đã chốt công không chọn được.
- **Kiểu ô chọn ngày.** Lịch gốc của trình duyệt (`input type=date`) không khoá được từng ngày lẻ, nên bản code dùng danh sách thả xuống, chỉ gồm những ngày chọn được (ví dụ "T6 13/11").
  - Nếu thiết kế muốn giữ kiểu lịch như J9, cần một lịch tự dựng: ngày bị khoá phải mờ đi và không bấm được.
- **Ô chọn giờ** (OT, khung bù):
  - là danh sách để chọn, **chỉ có giờ tròn** (18:00, 19:00…);
  - chỉ hiện giờ hợp lệ: ngoài ca, cách ca ít nhất 1 giờ, không rơi vào 22h–6h;
  - ca cộng OT (hoặc giờ bù) không quá **12 giờ một ngày**.
  - Ví dụ ca 08–17: chỉ có 06:00–07:00 và 18:00–22:00, cộng lại tối đa 4 giờ.
- **Không có ô tiêu đề**: server tự đặt tiêu đề.
- **Ô nhập**: bo góc 8px, không làm dạng viên thuốc, không đổ bóng.
- **Nút "Gửi yêu cầu"** chỉ bật khi form đã hợp lệ.
- **Gửi xong (J10)**:
  - tấm đóng lại, hiện thông báo nổi "Đã gửi yêu cầu";
  - đơn mới, trạng thái Chờ duyệt, nằm đầu danh sách J4.

## 2. Đơn nghỉ (đã có J9, cần sửa theo mục này)

- **Hình thức nghỉ**: 6 hình thức. Phép năm bị bỏ nếu nhân viên không có phép năm (mục 1).
- **Từ ngày – Đến ngày**: chỉ nghỉ **cả ngày**, không có nửa ngày.
- **Dòng tóm tắt do máy đếm**, ví dụ "3 ngày làm việc: 13, 14 và 16/11":
  - không tính Chủ nhật, ngày lễ và ngày không làm của loại nhân viên (tts không làm Thứ Bảy);
  - Thứ Bảy đã có iSAT được duyệt bị bỏ khỏi đơn, kèm một dòng cảnh báo.
- **Phép năm**:
  - hiện "Phép năm còn 11 ngày, sau đơn này còn 8";
  - xin quá số còn lại thì nút Gửi không bật.
- **Ngày đã bị đơn khác giữ** (nghỉ, iSAT, đơn đang chờ…) bị khoá trong ô ngày.
- **Lý do**: chữ tự do.

## 3. Nghỉ có làm bù (cần thiết kế)

- **Từ ngày – Đến ngày**:
  - từ hôm nay trở đi;
  - nằm trong một tháng;
  - ngày làm việc cuối tháng không chọn được, vì sau đó không còn chỗ để bù.
- **Khung bù**: thêm từng dòng, mỗi dòng gồm ngày, giờ bắt đầu và giờ kết thúc.
  - Ngày bù nằm sau ngày nghỉ cuối và vẫn trong tháng đó.
  - Ngày không có ca (Chủ nhật) chọn được, giờ trong khoảng 06–22.
  - Giờ chọn theo luật ở mục 1.
- **Bộ đếm** "Đã xếp x / 8 giờ" (8 giờ × số ngày nghỉ):
  - không cho xếp quá số giờ phải bù;
  - nút Gửi chỉ bật khi xếp đủ.
- **Lý do**.

## 4. Làm thêm giờ (cần thiết kế)

- **Ngày**: không chọn được ngày đang nghỉ.
- **Giờ bắt đầu, giờ kết thúc**: giờ tròn, chỉ giờ hợp lệ.
- **Dòng số giờ đã đăng ký**, ví dụ "Đã đăng ký tháng 11: 9 / 40 giờ". Không cho chọn vượt 40 giờ một tháng.
- **Lý do**.

## 5. Đổi ca (cần thiết kế)

- **Từ ngày – Đến ngày**.
- **Chọn một trong 6 khung**:
  - Normal: 08–17 hoặc 10–19;
  - Flex: 06–15 hoặc 13–22;
  - Night: 22–07 hoặc 21–06.
- **Dòng tóm tắt** các ngày sẽ đổi. Ngày nghỉ trong khoảng giữ nguyên là ngày nghỉ.
- **Lý do**.

## 6. Giải trình (cần thiết kế)

- **Ô ngày** chỉ có những ngày máy báo cần giải trình và chưa có đơn giải trình:
  - ngày đã qua hoặc hôm nay;
  - thuộc tháng chưa chốt công.
- **Trường hợp**: máy tự điền, hiện bằng chữ, nhân viên không sửa được.
- **Ô giờ** hiện theo trường hợp và bắt buộc nhập:

  | Trường hợp máy phát hiện | Nhân viên nhập |
  |---|---|
  | Thiếu giờ vào | Giờ vào thực tế |
  | Thiếu giờ ra | Giờ ra thực tế (ví dụ 27/10: 17:30) |
  | Thiếu cả hai (quên chấm công) | Giờ vào và giờ ra thực tế |
  | Vào muộn quá 15 phút, ra sớm, vào sớm quá 15 phút, ra muộn khi không có OT | Không có ô giờ |

- **Một ô lý do chung** cho cả đơn, chỉ ghi một lần dù ngày đó có nhiều trường hợp.
  - Ví dụ vào muộn 40 phút và thiếu giờ ra: nhập giờ ra và một lý do.
- **Mở từ ngày "Cần xử lý"** (hộp J3 hoặc ngăn kéo K2): nút "Giải trình" trong chi tiết ngày, form điền sẵn ngày đó. Ngày đã có đơn giải trình thì hiện trạng thái đơn thay cho nút.

## 7. Tạm ứng (cần thiết kế)

- **Chỉ nộp được ngày 16 và 17** hằng tháng, cho tháng hiện tại, mỗi tháng một đơn.
- Ngoài hai ngày đó, dòng "Tạm ứng" trong J8 vẫn hiện nhưng bị khoá, kèm dòng phụ "Chỉ nộp ngày 16 và 17".
  - Tháng đã có đơn tạm ứng (chờ duyệt hoặc đã duyệt) thì dòng này cũng bị khoá.
- **Form không có ô nhập số tiền.** Chỉ hiện chữ:
  - "Số tiền được ứng: 2.215.385 ₫";
  - dòng phụ "80% lương ngày công 01–15/11 · 12 ngày".
- Số tiền do server tính lúc nộp. Admin chỉ duyệt hoặc từ chối.
- **Không có ô lý do** (chốt 05/11). Server tự ghi lý do bằng tiêu đề, ví dụ "Tạm ứng lương tháng 11".

## 8. Huỷ đơn (J5 và ngăn kéo yêu cầu trên máy tính)

- Nút **"Huỷ đơn"** chỉ hiện ở đơn **đang chờ duyệt**. Đơn đã duyệt, đã từ chối hay đã huỷ thì không có nút này.
- Bấm vào thì hỏi lại "Huỷ đơn này?". Không có ô lý do.
- Huỷ xong:
  - đơn chuyển sang "Đã huỷ";
  - các ngày đơn đó đang giữ được trả lại, nên nộp đơn khác vào các ngày đó được ngay.
- Đơn đã duyệt muốn bỏ thì nhân viên báo Admin. App không có đường tự huỷ cho trường hợp này.

## 9. Nhắc giải trình

### Chuông Admin (board C)

- Nhóm "Chấm công" gồm những ngày nhân viên thiếu giờ vào hoặc giờ ra mà chưa gửi giải trình.
- Mỗi việc chỉ còn **một nút: "Nhắc giải trình"**. **Bỏ nút "Khai thay giờ vào/ra".**
- Nhắc xong, **việc vẫn ở lại trong chuông**, có thêm dòng "Đã nhắc lúc 09:40 28/10".
  - Nút đổi thành "Nhắc lại".
- Việc rời chuông khi nhân viên gửi giải trình cho ngày đó. Từ đó nó nằm ở nhóm "Giải trình", chờ Admin duyệt.

### App nhân viên

- Màn Hôm nay (J1 và cột Hôm nay của K1) có một dòng nổi bật ở đầu: "Admin nhắc giải trình 27/10".
- Bấm vào dòng đó thì mở form Giải trình, đã điền sẵn ngày 27/10.
- Có nhiều lời nhắc thì mỗi ngày một dòng.
- Dòng biến mất khi nhân viên đã gửi giải trình cho ngày đó.
