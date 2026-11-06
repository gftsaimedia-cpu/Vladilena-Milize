# Admin: bộ lọc nhân sự, chế độ chọn nhiều, tab Yêu cầu (FE)

**Ngày:** 06/11/2026.

**Nền:** local main `7226dc7`, nhánh `claude/admin-filter-bulk`.

**Nguồn thiết kế:**
- Board "Admin Dashboard Concept", bản `1793953022-0fa7`:
  - Đợt 14: Q1–Q4.
  - Đợt 15: I3, G2, L3, Q5.
  - Bộ lọc dùng chung: §8a.
- Ghi chú `docs/gop-y-ui/2026-11-06-gop-y-giao-dien.md`, các mục §7 và §8.
- Yêu cầu BE: `docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md`.
- Cả hai file trên nằm ở nhánh `claude/design-package` và chưa commit.

## 1. Mục tiêu

Đưa vào app admin (`web/`) các màn đã vẽ, lần lượt từng màn:

1. **Bộ lọc nhân sự dùng chung** (trạng thái nhân sự, phòng ban) trên 5 màn:
   - A: bảng lương ở Tổng quan.
   - E: Chấm công tuần.
   - L2: Cần xử lý.
   - G: Bảng lương.
   - I: Nhân sự.
2. **Chế độ chọn nhiều:**
   - I: Gán ca, Đổi phòng ban.
   - G: Tính lại lương.
   - L2: Nhắc giải trình.
   - Q1: Duyệt nhiều đơn.
3. **Tab Yêu cầu mới**, gồm Q1–Q5: danh sách, ngăn chi tiết, từ chối có lý do, xem đơn đã xử lý, duyệt nhiều đơn.

**Đạt khi:**
- Chạy được ở chế độ mock (`npm run dev:mock`).
- `npm run test:ui` xanh, có test mới cho từng màn.
- Ở chế độ chạy với BE thật, không có nút nào bấm vào mới báo lỗi vì BE thiếu route.

## 2. Quyết định tự chốt

Người dùng đặt mục tiêu "làm tới khi xong luôn", nên các câu còn mở được chốt tạm như sau. Mỗi quyết định ghi kèm rủi ro nếu sai.

| # | Quyết định | Lý do | Rủi ro nếu sai |
|---|-----------|-------|----------------|
| R1 | Mock trước. Chế độ BE thật chỉ dùng route BE đã có. Phần BE chưa có thì ẩn hoặc khoá | BE chưa có phòng ban, route chọn nhiều, số đếm (tài liệu yêu cầu BE) | Phải nối lại khi BE xong. Phần này đã có trong tài liệu yêu cầu BE |
| R2 | **Chuông giữ nguyên**, vẫn có đơn chờ. Tab Yêu cầu được thêm vào, không bỏ gì | Câu "chuông chỉ còn báo tin" chưa ai trả lời. Bỏ một chức năng đang chạy là việc khó lùi | Có hai chỗ cùng duyệt đơn. Bỏ khỏi chuông sau cũng dễ |
| R3 | **Tab Cần xử lý ở Chấm công giữ nguyên** | L3 đã vẽ trên L2, nghĩa là L2 vẫn còn | Không |
| R4 | Trạng thái nhân sự theo board: `work` = chính thức + thử việc; `try` / `off` / `out` theo hồ sơ; `mine` = phòng ban người đăng nhập quản lý | Đúng logic trên board (Requests.dc.html `okPst`) | Q1, Q2, Q7 của tài liệu BE trả lời khác thì chỉ sửa một hàm |
| R5 | `mine` ở mock = phòng **Sản xuất**, giống board. Ở BE thật = tất cả | BE chưa có phạm vi theo bậc | Không có |
| R6 | Danh sách phòng ban lấy từ chính dữ liệu đang hiện (chữ phòng ban của từng dòng). BE thật chưa có phòng ban: ô Phòng ban chỉ có "Tất cả phòng ban" và bị khoá | Theo luật "chặn trước, không báo lỗi" | Khi BE có `departments`, đổi nguồn danh sách |
| R7 | Ở BE thật, các dòng chưa có trạng thái nhân sự được coi là đang làm việc chính thức. Màn Nhân sự lấy trạng thái từ hợp đồng | BE chưa trả `staffStatus` | "Đã nghỉ việc" ở G/E/L2/A tạm thời rỗng khi chạy BE thật |
| R8 | BE thật: ẩn Gán ca và Đổi phòng ban. Vẫn chạy được: Tính lại lương (`POST calculate` với `employeeIds`), Nhắc giải trình và Duyệt nhiều đơn (gọi lần lượt route từng việc qua `shell.decide`) | Chỉ dùng route đã có (R1) | Không |
| R9 | Danh sách ca ở mock: "Hành chính · 08:00–17:00", "Ca 2 · 14:00–22:00" | Theo board I3 | Thêm ca khi BE trả giờ ca |
| R10 | Tab Yêu cầu: đơn chờ lấy từ nguồn chung `mock/inbox` (cùng chuông). Đơn đã xử lý = danh sách mẫu cố định, cộng các đơn vừa duyệt hoặc từ chối trong phiên | Duyệt ở tab thì chuông cũng hết. Hai nơi không lệch nhau | Không |
| R11 | Mục "Yêu cầu" ở menu chính, ngay dưới Tổng quan. Số bên cạnh là số đơn chờ duyệt, không tính việc "nhắc giải trình" | Theo Q1 trên board | Đổi chỗ thì chỉ sửa nav |
| R12 | Không có từ chối nhiều đơn | Người dùng đã chốt 06/11 | Không |
| R13 | Cách chạy: tôi làm thẳng trong phiên, theo `executing-plans`, không mở agent cho từng task. Cuối nhánh có một lượt review | CLAUDE.md §2: mở agent cần người dùng đồng ý. Review cuối nhánh là bước 5 của pipeline | Chậm hơn chạy song song |

## 3. Phần dùng chung

### 3.1 Bộ lọc nhân sự

`web/src/components/staff-scope/`:

- **`staffScope.ts`**:
  - Kiểu `StaffPst = 'all' | 'work' | 'mine' | 'try' | 'off' | 'out'`.
  - Danh sách nhãn 6 mục, theo đúng thứ tự trên board.
  - Hàm `matchScope(person: { dept: string; ps?: PersonStatus }, scope: { pst; dept }, mine: string[] | null): boolean`.
    - `ps` thiếu thì coi là `ok`.
    - `mine` là `null` thì nghĩa là tất cả.
  - Hàm `deptOptions(rows)`: các phòng ban khác nhau, sắp theo tiếng Việt, bỏ `—`.
- **`StaffScopeFilter.vue`**: hai ô `<select>`.
  - Góc 8px, có biểu tượng người trước ô trạng thái và mũi tên bên phải. Không dùng dạng viên tròn.
  - Hai giá trị qua `v-model:pst` và `v-model:dept`.
  - Prop `depts: string[]`. Mảng rỗng thì ô phòng ban bị khoá, có `title` "Chưa có danh sách phòng ban".
- **Trạng thái của người ở mock**: `mock/people-status.ts` có `personStatusOf(name)`.
  - Mặc định `ok`.
  - Đỗ Mai Linh và Phan Minh Khoa: `try`. Hoàng Thị Mai: `off`. Đặng Văn Phúc: `out`.
  - Hằng `MOCK_MINE = ['Sản xuất']`.
- **Hàm `useMineDepts()`**: trả `MOCK_MINE` ở mock, `null` ở BE thật.

### 3.2 Chế độ chọn

`web/src/components/select-mode/`:

- **`useSelectMode<T>()`** giữ:
  - `mode: string | null` và `picked: Set<id>`.
  - Các hàm `enter(mode)`, `quit()`, `toggle(id)`, `toggleAll(ids)`.
  - Các giá trị tính sẵn `allState(ids)` (`'true' | 'false' | 'mixed'`) và `count(ids)`.
  - Chỉ đếm id đang hiện và chọn được.
- **`SelectBar.vue`**: thanh đen.
  - Từ trái sang: nút Huỷ (✕), tên thao tác, "Đã chọn **N** / M <đơn vị>", ghi chú nhỏ.
  - Có slot cho ô chọn thêm (ca, phòng mới).
  - Cuối thanh là nút chạy màu vàng, bị khoá khi `disabled`.
  - `role="toolbar"`, `aria-label` theo tên thao tác.
- **`SelectCheck.vue`**: ô vuông 18px, nhận các trạng thái `on`, `mixed`, `disabled`.
  - `role="checkbox"`, có `aria-checked`.
  - Khi `disabled`, ô có `title` nói vì sao không chọn được.
- **`BulkButton.vue`**: nút trắng "Gán ca", "Tính lại lương", … Có ô đếm màu cam khi cần.
- **`ResultLine.vue`**: dòng báo kết quả màu đen, `role="status"`, ngay trên bảng. Tự ẩn khi bắt đầu một lần chọn mới.

Màu sắc lấy theo khối BK_CSS của board:
- Nền thanh `#1c1c1c`.
- Số đã chọn `#e8c372`.
- Nút chạy nền `#e8c372`.
- Dòng mờ có độ đậm `.45`.

Màu viết vào biến CSS của app khi app đã có biến tương ứng.

## 4. Từng màn

### I · Nhân sự

**Bỏ:**
- Công tắc "Chưa kích hoạt tài khoản".
- Dấu kích hoạt ở ô Email.
- Chữ "Đã chọn n".
- Cột ô chọn thường trực.

**Thanh công cụ:** cặp bộ lọc, ô tìm, rồi nút "Gán ca" và "Đổi phòng ban" (chỉ hiện ở mock), cuối cùng là nút Xuất.

**Xuất:** xuất đúng các dòng đang lọc.

**Chế độ chọn:**
- Người đã nghỉ việc: dòng mờ, ô chọn khoá.
- Gán ca: thanh có ô chọn ca, mặc định ca đầu.
- Đổi phòng ban: thanh có ô chọn phòng, mặc định trống. Nút chạy mở khi đã chọn ít nhất 1 người **và** đã chọn phòng.
- Chữ trên nút chạy:
  - "Gán ca cho N người".
  - "Đổi phòng ban cho N người".
  - Chưa chọn ai: "Chọn ít nhất 1 người".
  - Chưa chọn phòng: "Chọn phòng ban mới".

**Mock:** đổi phòng ban ghi vào mock nên bảng cập nhật ngay. Gán ca ở mock chỉ báo kết quả, vì bảng không có cột ca.

**Câu báo:**
- "Đã gán ca <tên ca> cho N người."
- "Đã chuyển N người sang phòng <X>."

### G · Bảng lương

**Hàng 1 của thanh công cụ:** cặp bộ lọc, ô tìm, nút "Tính lại lương", nút Xuất.

**Hàng 2:** các nút lọc trạng thái phiếu, như hiện nay. Ô "Phòng ban" cũ được thay bằng cặp bộ lọc.

**Nút "Tính lại" ở đầu trang:**
- Khi đã có bảng: bỏ, chuyển xuống thanh công cụ.
- Khi chưa có bảng: giữ nút "Tính lương" để tính cả kỳ.

**Nút "Tính lại lương":**
- Ẩn khi kỳ đã phê duyệt hoặc đã trả (`canCalculate`).
- Trong chế độ chọn:
  - Phiếu đã duyệt (`done`) mờ, ô chọn khoá.
  - Ô ở đầu cột chọn mọi phiếu đang hiện mà tính lại được.
  - Nút chạy ghi "Tính lại N phiếu".
- Chạy gọi `calculatePayroll(month, employeeIds)`.
- Câu báo: "Đã tính lại N phiếu lương." Nếu có người lỗi thì kèm danh sách lỗi.

**Cột ô chọn thường trực:** bỏ. Xuất Excel xuất đúng các dòng đang lọc.

### E · Chấm công tuần và L2 · Cần xử lý

**Bộ lọc:**
- Ô "nhóm" (`?pb`) được thay bằng cặp bộ lọc.
- Phòng ban vẫn đi qua `?pb`, như hiện nay.
- Trạng thái nhân sự đi qua `?ns`, lọc phía máy khách trên các dòng BE trả về.

**Nút "Nhắc giải trình" ở L2:**
- Có số đếm = số việc "nhắc" đang hiện. Bị khoá khi số này bằng 0.
- Trong chế độ chọn:
  - Chỉ việc nhắc giải trình mới chọn được. Việc khác mờ, ô chọn khoá.
  - Bấm vào dòng thì chọn hoặc bỏ chọn, không mở chi tiết.
  - Khung phải liệt kê người sẽ được nhắc.
- Chạy gọi `shell.decide(id, 'remind')` cho từng việc.
- Câu báo: "Đã gửi nhắc giải trình cho N người."

### A · Tổng quan (bảng lương)

Nút "Lọc" được thay bằng cặp bộ lọc. Lọc phía máy khách trên các dòng của thẻ.

### Q · Yêu cầu (mới)

**Đường dẫn và menu:**
- Route `/admin/yeu-cau`. Bỏ chuyển hướng cũ, nhưng `/admin/yeu-cau/moi-thang` vẫn chuyển về Tổng quan.
- Mục menu nằm dưới Tổng quan, kèm số đơn chờ.

**Hàng thẻ đếm:** Tất cả, Chờ duyệt, Đã duyệt, Từ chối, Đã huỷ. Bấm vào thẻ là lọc theo trạng thái.

**Cột trái:** 6 loại đơn, mỗi loại kèm số đơn chờ (màu cam).

**Thanh công cụ:** cặp bộ lọc, ô tìm tên, nút "Duyệt nhiều đơn". Nút chỉ hiện khi bộ lọc đang có đơn chờ.

**Bảng:**
- 6 cột: Nhân viên, Loại, Ngày, Nội dung, Trạng thái, Thao tác.
- Đơn chờ xếp trước, cũ nhất trước. Đơn đã xử lý xếp sau, mới nhất trước.
- Đơn chờ có hai nút:
  - **Duyệt**: duyệt ngay.
  - **Từ chối**: mở ngăn chi tiết ở chế độ từ chối.
- Đơn đã xử lý có nút **Xem**.

**Ngăn chi tiết:** mở bằng `?don=<id>`, chế độ từ chối mở bằng `&tuchoi=1`.
- Đầu ngăn: người gửi và các dòng chi tiết.
- Các mốc: Gửi lúc, Duyệt hoặc Từ chối lúc, ghi chú của Admin.
- Đơn chờ: chân ngăn có Từ chối và Duyệt.
- Chế độ từ chối:
  - Ô lý do bắt buộc. Nút Từ chối khoá tới khi có chữ.
  - Có nút Quay lại.
- Đơn đã xử lý: chỉ xem.

**Duyệt nhiều đơn:**
- Chỉ đơn chờ chọn được. Đơn đã xử lý mờ, ô chọn khoá.
- Trong chế độ chọn, nút Duyệt/Từ chối trên từng dòng tạm ẩn.
- Ghi chú trên thanh: "Từ chối vẫn làm ở từng đơn vì cần ghi lý do".
- Chạy gọi `shell.decide(id, 'approve')` lần lượt, đơn cũ nhất trước.
- Câu báo: "Đã duyệt N đơn."

**Nguồn dữ liệu (R10):**
- Mock: đơn chờ là các việc `decide` trong `mock/inbox`. Loại đơn suy từ `group`; việc "Làm bù" thuộc loại "Nghỉ có làm bù". Đơn đã xử lý lấy từ `mock/admin-requests.ts`.
- BE thật: `GET /requests?limit=200` cộng danh sách nhân viên để lấy tên; loại và trạng thái lấy theo DTO. Chưa có số đếm phía BE, nên FE tự đếm trên trang đã tải.

## 5. Kiểm

**Test giao diện:**
- Mỗi màn có test Playwright trong `web/tests/`:
  - `admin-staff.spec.ts`: sửa và thêm.
  - `admin-scope-filter.spec.ts`: mới.
  - `payroll-bulk.spec.ts`: mới.
  - `attendance-remind-bulk.spec.ts`: mới.
  - `admin-requests.spec.ts`: mới.
- Test cũ nhắc tới công tắc "Chưa kích hoạt", cột ô chọn hay nút "Tính lại" ở đầu trang thì sửa theo luật mới.

**Cổng xong:** `cd web && npm run test:ui` xanh. Không chạy `npm test` ở gốc repo, không typecheck, không prettier.

## 6. Ngoài phạm vi

- Màn quản lý phòng ban (§6 ghi chú): chưa vẽ.
- Phạm vi theo bậc thật.
- Nối BE cho phòng ban, gán ca và các route chọn nhiều: đợi BE làm theo tài liệu yêu cầu BE.
