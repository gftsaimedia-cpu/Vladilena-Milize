# Chuông thông báo, Chấm công theo tuần và Hồ sơ chấm công trên dữ liệu giả

- Ngày: 04/11/2026
- Loại: Architectural (nguồn việc chờ xử lý dùng chung cho khung, Tổng quan và Chấm công; thay toàn bộ màn Chấm công; thêm một route)
- Trạng thái: chờ người dùng duyệt
- Concept đã duyệt: ba bảng thiết kế C (BellInbox, ngăn kéo chuông), E (AttendanceWeek, `/admin/cham-cong` theo tuần), F (AttendanceEmployee, hồ sơ chấm công của một nhân viên)
- Nền móng: đợt trước ([spec khung mock và Tổng quan](2026-11-04-admin-mock-shell-overview-design.md)) — `MOCK_NOW` 09:40 thứ Tư 28/10/2026, `respond()`, `useShellStore`, `api()` luôn từ chối `mock_missing`
- Màu, chữ, khoảng cách: design system GFT như đợt trước, thêm 5 nhóm màu chấm công ở mục 4.4

## Mục tiêu

1. Chuông trên thanh trên mở một ngăn kéo "Thông báo": mỗi việc một dòng, bấm mới xem chi tiết và xử lý.
2. `/admin/cham-cong` thành bảng công theo tuần, cuộn ngang qua 4 tuần, có tab "Cần xử lý".
3. Thêm màn hồ sơ chấm công của một nhân viên, mở từ bảng tuần, chuông và hộp chi tiết ngày.
4. Mọi con số "việc chờ xử lý" (chuông, Tổng quan, Chấm công) đọc từ **một** danh sách giả.

## Quyết định của người dùng (trong chat, 04/11/2026)

1. Làm C, E, F đúng như bảng thiết kế. Màu theo 5 nhóm: đi làm #1c1c1c, đi muộn/về sớm #e8c372, nghỉ có phép #2f5aa8, vắng #b43f3f, cần xử lý = nền trắng viền #eb973d; thêm các kiểu ô nghỉ, ngày tới, chưa Check-in như bảng.
2. "Nghỉ ốm" là một **hình thức nghỉ** như "Phép năm"; **lý do** là trường chữ riêng. Đơn nghỉ có `type` và `reason` tách biệt. Tên nhóm là "Đơn nghỉ".
3. Chuông hiện ít: mỗi việc một dòng, chi tiết chỉ khi bấm.
4. Bỏ kiểu xem tháng.
5. Không cài luật nghiệp vụ chưa được xác nhận: không chặn chốt công khi còn ngoại lệ; không ghi giờ ra theo giờ khai khi duyệt giải trình; không đổi lương khi duyệt; không có logic BHXH hay ngày nghỉ hưởng lương. Trong mockup, xử lý một việc chỉ bỏ việc đó khỏi danh sách (số đếm đổi theo) và báo "Đã duyệt yêu cầu của <tên>." / "Đã từ chối yêu cầu của <tên>.". Chỗ nào thiết kế cần một luật chưa chốt thì giao diện giữ trung tính và ghi vào mục 8.
6. Xác minh chỉ bằng test: Playwright (`npm --prefix web run test:ui`) và `npm test` ở thư mục gốc. Không có bước typecheck hay prettier.
7. Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc; không đọc, không trích `spec/` gốc.
8. (Bổ sung, chuyển qua điều phối viên ngày 04/11/2026) Trong dữ liệu giả, **mọi người làm thứ Hai – thứ Bảy**; Chủ nhật là ngày nghỉ duy nhất. Tháng 10/2026 có 27 ngày có lịch, công chuẩn 26. Với mỗi người: đi làm + nghỉ phép + iSAT + chờ xử lý + không lương = 27; bảng lương dựa vào tổng này. Số ngày và tổng (Công / Trễ / OT, "Ngày công x / 26") tính cả thứ Bảy. Không mã cứng "cuối tuần = thứ Bảy + Chủ nhật" trong builder nào.

## Ngoài phạm vi

- Dữ liệu giả cho màn Yêu cầu (`/admin/yeu-cau`): màn vẫn như cũ, test của nó vẫn `fixme`.
- Khai thay hàng loạt, chốt công, xuất Excel, khai thay ngày công (mục 9, Ruling R9).
- Lọc lưới theo nhóm màu; kiểu xem tháng.
- Lịch thứ Bảy theo từng người (ai làm thứ Bảy nào): sau này BE giữ. Mock dùng một lịch chung thứ Hai – thứ Bảy.
- Lưu dữ liệu giả qua lần tải lại trang.

## 1. Nguồn việc chờ xử lý chung

### 1.1 `web/src/mock/inbox.ts` (thay `mock/approvals.ts`, file cũ bị xoá)

Một mảng trong bộ nhớ gồm 13 việc, theo đúng thứ tự trong bảng C. Năm nhóm, theo thứ tự hiện:

| Khoá | Tên nhóm |
|------|----------|
| `att` | Chấm công |
| `leave` | Đơn nghỉ |
| `ot` | Làm thêm, làm bù |
| `exp` | Giải trình |
| `adv` | Tạm ứng |

Kiểu một việc:

```ts
type InboxItem = {
  id: string;                       // 'ib-c1' …
  group: 'att' | 'leave' | 'ot' | 'exp' | 'adv';
  groupLabel: string;               // tên nhóm ở bảng trên
  action: 'decide' | 'remind';      // remind: chỉ nhóm att
  personId: string; name: string; initials: string; role: string;
  what: string; when: string; age: string;   // dòng ngắn trong chuông
  head: string; sub: string;                 // đầu thẻ chi tiết
  facts: [string, string][];                 // các dòng nhãn – giá trị
  days: string[];                            // ngày chấm công liên quan (ISO); [] cho tạm ứng
  cellLabel?: string;                        // chữ trong ô lưới khi khác chữ gốc của ô
  leave?: { type: 'Phép năm' | 'Nghỉ ốm'; reason: string };
  declared?: { from: string; to: string };   // giờ khai chờ duyệt
  missing?: 'in' | 'out';                    // giờ còn thiếu (nhóm att)
};
```

Đơn nghỉ: `what` là `leave.type`. Dòng "Hình thức" và "Lý do" trong `facts` dựng từ `leave.type` và `leave.reason` (lý do đặt trong ngoặc kép “…”), không viết tay.

| id | Nhóm | Người (`personId`) | `what` · `when` · `age` | `head` / `sub` | `facts` | `days` | Thêm |
|----|------|------|------|------|------|------|------|
| ib-c1 | att, remind | Trịnh Văn Long (`trinh-van-long`) | Quên Check-out · 27/10 · 1 ngày | Quên Check-out / Thứ Ba 27/10 | Giờ vào: 07:58; Giờ ra: Chưa có; Giải trình: Chưa gửi | 2026-10-27 | `missing: 'out'` |
| ib-c2 | att, remind | Lý Thanh Tâm (`ly-thanh-tam`) | Quên Check-in · 26/10 · 2 ngày | Quên Check-in / Thứ Hai 26/10 | Giờ vào: Chưa có; Giờ ra: 17:06; Giải trình: Chưa gửi | 2026-10-26 | `missing: 'in'` |
| ib-l1 | leave | Nguyễn Thu Hà (`nguyen-thu-ha`) | Phép năm · 29–30/10 · 3 giờ | Phép năm · 2 ngày / Thứ Năm 29/10 – Thứ Sáu 30/10 | Hình thức; Phép năm còn: 6 ngày; Lý do; Gửi lúc: 27/10 16:20 | 2026-10-29, 2026-10-30 | `leave: {Phép năm, Về quê có việc gia đình.}`, `cellLabel: 'Phép năm'` |
| ib-l2 | leave | Bùi Quốc Huy (`bui-quoc-huy`) | Nghỉ ốm · 28/10 · 2 giờ | Nghỉ ốm · 1 ngày / Thứ Tư 28/10 | Hình thức; Lý do; Đính kèm: Giấy khám bệnh · 1 tệp; Gửi lúc: 28/10 07:10 | 2026-10-28 | `leave: {Nghỉ ốm, Sốt cao, đã đi khám.}`, `cellLabel: 'Nghỉ ốm'` |
| ib-l3 | leave | Phạm Ngọc Anh (`pham-ngoc-anh`) | Phép năm · 03/11 · hôm qua | Phép năm · 1 ngày / Thứ Ba 03/11 | Hình thức; Phép năm còn: 9 ngày; Lý do; Gửi lúc: 27/10 11:05 | 2026-11-03 | `leave: {Phép năm, Việc cá nhân.}`, `cellLabel: 'Phép năm'` |
| ib-o1 | ot | Võ Đức Thịnh (`vo-duc-thinh`) | Làm thêm 3 giờ · 23/10 · 5 ngày | Làm thêm 3 giờ / Thứ Sáu 23/10 · 17:00–20:00 | Ca: HC 08:00–17:00; Đã làm thêm tháng 10: 9 giờ; Lý do: “Chạy kiểm thử bản phát hành.” | 2026-10-23 | |
| ib-o2 | ot | Ngô Gia Bảo (`ngo-gia-bao`) | Làm bù · CN 01/11 · hôm qua | Làm bù 1 ngày / Chủ nhật 01/11 · 08:00–17:00 | Bù cho: Thứ Hai 19/10; Lý do: “Nghỉ 19/10 vì việc gia đình.” | 2026-11-01 | `cellLabel: 'Làm bù'` (R17) |
| ib-e1 | exp | Lê Hoàng Nam (`le-hoang-nam`) | Thiếu giờ ra · 27/10 · 14 giờ | Thiếu giờ ra / Thứ Ba 27/10 | Giờ vào: 08:12 · trễ 12 phút; Giờ ra khai: 17:30; Giải trình: “Quên bấm ra, về lúc 17:30.”; Gửi lúc: 27/10 20:14 | 2026-10-27 | `declared: {08:12, 17:30}` |
| ib-e2 | exp | Đỗ Mai Linh (`do-mai-linh`) | Đi muộn 27 phút · 26/10 · 2 ngày | Đi muộn 27 phút / Thứ Hai 26/10 | Giờ vào: 08:27; Giải trình: “Kẹt xe trên cầu Sài Gòn.”; Gửi lúc: 26/10 09:02 | 2026-10-26 | |
| ib-e3 | exp | Trần Minh Quân (`tran-minh-quan`) | Đi muộn 9 phút · 15/10 · 13 ngày | Đi muộn 9 phút / Thứ Năm 15/10 | Giờ vào: 08:09; Giải trình: “Đưa con đi khám.”; Gửi lúc: 15/10 08:40 | 2026-10-15 | |
| ib-e4 | exp | Hoàng Minh Đức (`hoang-minh-duc`) | Về sớm 30 phút · 22/10 · 6 ngày | Về sớm 30 phút / Thứ Năm 22/10 | Giờ ra: 16:30; Giải trình: “Có việc gia đình đột xuất.”; Gửi lúc: 22/10 16:25 | 2026-10-22 | |
| ib-a1 | adv | Mai Phương Thảo (`mai-phuong-thao`) | 3.000.000 ₫ · (trống) · hôm qua | Tạm ứng 3.000.000 ₫ / Trừ vào lương tháng 10 | Lý do: “Đóng học phí cho con.”; Gửi lúc: 27/10 09:30 | — | |
| ib-a2 | adv | Trương Quốc Việt (`truong-quoc-viet`) | 2.000.000 ₫ · (trống) · 3 ngày | Tạm ứng 2.000.000 ₫ / Trừ vào lương tháng 10 | Lý do: “Sửa xe.”; Gửi lúc: 25/10 18:12 | — | |

`role` của 11 người có chấm công lấy theo bảng nhân viên ở mục 4.2. Mai Phương Thảo: "Tài chính · Kế toán thanh toán". Trương Quốc Việt: "Kỹ thuật · Kỹ sư hệ thống". `initials` lấy bằng `initials()` của `utils/format`.

Hàm xuất ra:

- `INBOX_GROUPS`: năm nhóm theo thứ tự.
- `pendingInbox(): InboxItem[]`: các việc còn chờ, giữ thứ tự gốc.
- `resolveInboxItem(id): InboxItem | null`: bỏ việc khỏi danh sách, trả việc vừa bỏ; không còn thì trả `null`.
- `SYSTEM_NOTES`: 3 tin hệ thống tĩnh (mục 2.1).

### 1.2 Ai đọc gì

| Nơi hiện | Lọc | Số ban đầu |
|----------|-----|-----------|
| Huy hiệu chuông, tab "Cần duyệt" trong chuông | mọi việc còn chờ | 13 |
| Tổng quan: KPI "Yêu cầu chờ duyệt" và thẻ "Việc cần duyệt" | `action === 'decide'` | 11 |
| Chấm công: thẻ "Cần xử lý", tab "Cần xử lý", ô màu cam | việc có `days` | 11 việc, 12 ô |
| Chấm công: ghi chú thẻ "Nghỉ có phép" | nhóm `leave` | "3 đơn chờ duyệt" |
| Chấm công: ghi chú thẻ "Làm thêm tháng này" | nhóm `ot` | "2 yêu cầu chờ duyệt" |

Hệ quả: xử lý một việc quên chấm công làm giảm chuông và Chấm công nhưng không đổi Tổng quan; xử lý một tạm ứng làm giảm chuông và Tổng quan nhưng không đổi Chấm công.

### 1.3 Xử lý một việc

- Một đường duy nhất: `useShellStore().decide(id)` → `resolveRequest(id)` → tăng `version` → `load()` lại số chuông.
- Mọi màn có dữ liệu phụ thuộc danh sách (Tổng quan, Chấm công, Hồ sơ, ngăn kéo chuông) đưa `shell.version` vào khoá tải lại của `useLoad`, nên mọi nơi đổi cùng lúc.
- Câu báo (`decisionText`):

| Hành động | Câu |
|-----------|-----|
| Duyệt | Đã duyệt yêu cầu của <tên>. |
| Từ chối | Đã từ chối yêu cầu của <tên>. |
| Nhắc giải trình | Đã nhắc <tên> giải trình. |
| Khai thay giờ vào/ra | Đã ghi nhận khai thay cho <tên>. |
| Việc đã bị xử lý ở nơi khác (`null`) | Yêu cầu này đã được xử lý. |

- Duyệt hay từ chối đều chỉ bỏ việc. Ô chấm công trở về ghi nhận gốc của ngày đó (mục 4.2), giống nhau cho cả hai. Không ghi giờ khai, không đổi công, trễ, OT hay lương.

## 2. Chuông (bảng C)

### 2.1 Bố cục

- Nút chuông trên thanh trên: nhãn `Thông báo, N việc cần xử lý`; huy hiệu số chỉ hiện khi N > 0.
- Bấm chuông mở `BellDrawer` (thay `BellPopover`, file cũ bị xoá). `?hop=chuong` vẫn mở sẵn.
- Lớp nền `rgba(28,28,28,0.32)`; bấm nền thì đóng.
- Ngăn kéo `role="dialog"` tên "Thông báo":
  - vị trí cố định cách mép trên, phải, dưới 16px; rộng 400px; bo 24px; nền trắng; không đổ bóng;
  - đầu: h2 "Thông báo", nút "Đóng";
  - tablist "Loại thông báo": tab "Cần duyệt" + huy hiệu số (nền `gold`, chữ `ink`), tab "Tin hệ thống · 3".
- Tab "Cần duyệt":
  - mỗi nhóm có đầu nhóm 12px/600 kèm số; nhóm hết việc thì ẩn;
  - mỗi việc là một nút dòng cao tối thiểu 56px, bo 12px, gồm avatar chữ viết tắt, tên, `what · when` (bỏ `· when` khi trống) và `age`;
  - tên đọc của dòng: `<tên>, <tên nhóm>: <what>` cộng ` <when>` khi có (sửa lỗi "undefined" của bảng);
  - dòng đang chọn nền `gold-pale` #fff9ec, `aria-pressed="true"`;
  - hết việc: "Không còn yêu cầu nào chờ duyệt.".
- Tab "Tin hệ thống": danh sách chỉ đọc 3 tin tĩnh, không nút, không trạng thái đã đọc:
  1. "Đã nhận dữ liệu máy chấm công lúc 09:30." · Hôm nay 09:30
  2. "Kỳ công tháng 10 kết thúc ngày 31/10." · Hôm qua
  3. "Đã thêm 2 nhân viên mới vào danh sách Nhân sự." · 26/10
- Chân ngăn kéo: dòng trạng thái `aria-live="polite"`, ban đầu "Bấm một yêu cầu để xem chi tiết."; liên kết "Mở trang Yêu cầu" tới `/admin/yeu-cau`, giữ `?thang`.
- Thẻ chi tiết (`InboxDetail`), vùng tên "Chi tiết yêu cầu", `tabindex="-1"`:
  - cố định: trên 16px, phải 428px, rộng 380px, đệm 20/24/24px, bo 24px;
  - nút "Đóng chi tiết"; avatar 44px, tên, `role`; `head` 18px/600, `sub`; danh sách `facts`;
  - việc `decide`: nút "Từ chối" (viền) và "Duyệt" (đen), tên đọc "Từ chối yêu cầu của <tên>" / "Duyệt yêu cầu của <tên>";
  - việc `remind`: "Nhắc giải trình" (đen) và "Khai thay giờ ra" hoặc "Khai thay giờ vào" theo `missing` (viền);
  - nhóm `att` và `exp`: liên kết "Mở hồ sơ chấm công" tới hồ sơ của người đó (mục 5), giữ `?thang`.
- Màn hẹp hơn 840px: ngăn kéo cách hai mép trái, phải 16px; thẻ chi tiết phủ lên ngăn kéo ở cùng vị trí.

### 2.2 Hành vi

- Mở ngăn kéo: chưa chọn việc nào, không có thẻ chi tiết (quyết định 3).
- Bấm một dòng: chọn dòng, mở thẻ chi tiết, focus vào thẻ.
- Xử lý xong:
  - dòng trạng thái hiện câu ở mục 1.3 (trong chuông không dùng toast chung);
  - chọn việc kế tiếp sau việc vừa xử lý theo thứ tự hiện, không còn thì việc đầu tiên (như kịch bản của bảng C);
  - hết việc: đóng thẻ chi tiết, focus về tab "Cần duyệt".
- Escape: đang có thẻ chi tiết thì đóng thẻ và focus về dòng vừa chọn; không có thì đóng ngăn kéo và focus về nút chuông.
- Bẫy focus, khoá cuộn trang và trả focus dùng `registerOverlayFocus` và `lockScroll` sẵn có. Phần tử đăng ký bẫy bọc cả ngăn kéo lẫn thẻ chi tiết.
- Đổi màn thì đóng ngăn kéo (như chuông cũ).

### 2.3 Thanh bên bỏ mục "Yêu cầu"

- Xoá mục `duyet` khỏi `ADMIN_SIDEBAR_GROUPS`, prop `counts` và huy hiệu `.cnt` của `AdminSidebar`. Store của khung bỏ `counts`.
- Số việc chờ chỉ còn trên chuông.
- `/admin/yeu-cau` vẫn tới được: liên kết "Mở trang Yêu cầu" ở chân chuông, "Xem tất cả" ở Tổng quan, gõ thẳng đường dẫn. Route giữ `nav: 'duyet'`; không mục thanh bên nào sáng ở màn đó.

## 3. Tổng quan

- `OverviewView.approvals` thành `InboxItem[]` (việc `decide`). KPI "Yêu cầu chờ duyệt" ban đầu 11. Thẻ "Việc cần duyệt" vẫn hiện 3 việc đầu (Nguyễn Thu Hà, Bùi Quốc Huy, Phạm Ngọc Anh). Dòng phụ: `<tên nhóm> · <what>` cộng ` · <when>` khi có.
- Duyệt / từ chối ở thẻ gọi `shell.decide`. Toast như cũ; nếu kết quả `null` thì `toast.error('Yêu cầu này đã được xử lý.')`.
- Sửa mục treo (2) của đợt trước: sau khi xử lý, focus vào nút "Duyệt" của dòng đang ở cùng vị trí (hoặc dòng cuối); hết dòng thì focus "Xem tất cả".

## 4. Chấm công theo tuần (bảng E)

### 4.1 Route và cấu trúc cũ

- `/admin/cham-cong` → `views/admin/attendance/AttendanceWeekView.vue`, không còn route con. Meta `{ layout: 'admin', nav: 'cham-cong', title: 'Chấm công' }`.
- Các đường dẫn cũ chuyển hướng, giữ query:
  - `bang-cong`, `hom-nay`, `phep-con-lai` → `/admin/cham-cong`;
  - `sua-gio`, `gio-ot` → `/admin/cham-cong?xem=can-xu-ly`;
  - `ca-lam` giữ như cũ.
- Xoá: `AttendanceShell.vue`, `TimesheetView.vue`, `TodayView.vue`, `TodayDialog.vue`, `OvertimeView.vue`, `OvertimeDialog.vue`, `RequestTable.vue` (của attendance), `BulkPunchDialog.vue`, `builders/admin-attendance/timesheet.ts`, `builders/admin-attendance/shifts.ts`.
- Giữ: `PagerBar.vue`, `SearchBox.vue`, `links.ts` (KPI dùng), `useHop.ts` (Nhân sự dùng), `builders/admin-attendance/common.ts` (Yêu cầu dùng).
- `DayDetailDialog.vue` viết lại tại chỗ theo dữ liệu giả (mục 4.7).
- `services/admin-attendance.ts` viết lại, chỉ đọc mock: `getAttendance(month)`, `getDayDetail(personId, date)`, `getEmployeeAttendance(personId, month)`.
- Mục lục thiết kế (`design-index`) giữ nguyên đường dẫn cũ; chuyển hướng làm chúng vẫn chạy.

### 4.2 Dữ liệu giả `web/src/mock/attendance.ts`

Lưới 28 ngày, từ thứ Hai 12/10 đến Chủ nhật 08/11/2026. Hôm nay là ngày thứ 17 (chỉ số 16).

Lịch làm việc: mọi người làm thứ Hai – thứ Bảy, ca "HC 08:00–17:00" (cả thứ Bảy). Một hàm duy nhất `isScheduled(date)` trong `mock/attendance.ts` quyết định ngày có lịch (Chủ nhật thì không). Mọi builder hỏi hàm này, không tự xét "cuối tuần". Tháng 10/2026 có 27 ngày có lịch; công chuẩn `STANDARD_DAYS = 26`.

Nhân viên (`ROSTER`, theo thứ tự này). Ai cũng là "Nhân viên chính thức".

| # | id | Tên | Phòng ban · Chức danh | Mã | Vào làm | Phép năm còn | Số lần muộn | Vào TB | Ra TB | Trễ phút / OT giờ |
|---|----|-----|------|----|----|----|----|----|----|----|
| 1 | nguyen-thu-ha | Nguyễn Thu Hà | Tài chính · Kế toán tổng hợp | GFT-0118 | 08/2022 | 6 ngày | 0 | 07:52 | 17:06 | 0 / 0 |
| 2 | tran-minh-quan | Trần Minh Quân | Kỹ thuật · Kỹ sư phần mềm | GFT-0125 | 01/2023 | 8 ngày | 2 | 07:58 | 17:24 | 18 / 5 |
| 3 | le-hoang-nam | Lê Hoàng Nam | Kinh doanh · Nhân viên kinh doanh | GFT-0142 | 03/2024 | 5 ngày | 1 | 07:59 | 17:08 | 12 / 0 |
| 4 | pham-ngoc-anh | Phạm Ngọc Anh | Nhân sự · Chuyên viên nhân sự | GFT-0131 | 06/2023 | 9 ngày | 1 | 07:55 | 17:05 | 21 / 0 |
| 5 | vo-duc-thinh | Võ Đức Thịnh | Kỹ thuật · Trưởng nhóm QA | GFT-0109 | 11/2021 | 7 ngày | 0 | 07:54 | 17:48 | 0 / 9 |
| 6 | do-mai-linh | Đỗ Mai Linh | Marketing · Thiết kế đồ hoạ | GFT-0150 | 09/2024 | 4 ngày | 4 | 08:09 | 17:07 | 99 / 0 |
| 7 | bui-quoc-huy | Bùi Quốc Huy | Sản xuất · Tổ trưởng | GFT-0087 | 02/2020 | 10 ngày | 0 | 07:46 | 17:02 | 0 / 0 |
| 8 | trinh-van-long | Trịnh Văn Long | Sản xuất · Công nhân vận hành | GFT-0163 | 05/2025 | 3 ngày | 0 | 07:53 | 17:04 | 0 / 0 |
| 9 | ly-thanh-tam | Lý Thanh Tâm | Sản xuất · Công nhân vận hành | GFT-0170 | 07/2025 | 2 ngày | 0 | 07:51 | 17:05 | 0 / 0 |
| 10 | ngo-gia-bao | Ngô Gia Bảo | Sản xuất · Công nhân vận hành | GFT-0158 | 01/2025 | 4 ngày | 0 | 07:52 | 17:07 | 0 / 0 |
| 11 | hoang-minh-duc | Hoàng Minh Đức | Kinh doanh · Trưởng nhóm | GFT-0102 | 04/2021 | 8 ngày | 0 | 07:57 | 17:01 | 0 / 0 |

Tổng kỳ 10 của mỗi người (`period`, số tĩnh dùng chung với bảng lương, không tính lại sau khi xử lý — R8):

- `worked + leave + isat + pending + unpaid = 27`;
- `leave`, `unpaid`, `pending` bằng số ô `leave`, `absent`, `todo` của tháng 10 ở trạng thái ban đầu;
- `isat = 0` cho mọi người (lưới không có loại ô này; câu hỏi 13);
- `worked` là phần còn lại. Ngày tới có lịch (29–31/10) được tính như bảng lương tính cả kỳ.

| Người | worked | leave | isat | pending | unpaid |
|-------|--------|-------|------|---------|--------|
| Nguyễn Thu Hà | 25 | 0 | 0 | 2 | 0 |
| Trần Minh Quân | 26 | 0 | 0 | 1 | 0 |
| Lê Hoàng Nam | 25 | 1 | 0 | 1 | 0 |
| Phạm Ngọc Anh | 27 | 0 | 0 | 0 | 0 |
| Võ Đức Thịnh | 26 | 0 | 0 | 1 | 0 |
| Đỗ Mai Linh | 25 | 0 | 0 | 1 | 1 |
| Bùi Quốc Huy | 26 | 0 | 0 | 1 | 0 |
| Trịnh Văn Long | 26 | 0 | 0 | 1 | 0 |
| Lý Thanh Tâm | 26 | 0 | 0 | 1 | 0 |
| Ngô Gia Bảo | 26 | 1 | 0 | 0 | 0 |
| Hoàng Minh Đức | 26 | 0 | 0 | 1 | 0 |

Cột "Công kỳ 10" của lưới và "Ngày công" ở hồ sơ hiện `worked`.

Ghi nhận gốc của từng ô (trước lớp "cần xử lý"):

1. Ô ghi tay (theo bảng E; ngày có việc chờ ghi ghi nhận thật của ngày đó):

| Người | Ngày → ô |
|-------|----------|
| Nguyễn Thu Hà | 28/10 work, đang làm, 07:50–… |
| Trần Minh Quân | 15/10 late 08:09–17:00; 28/10 work, đang làm, 08:05–… |
| Lê Hoàng Nam | 12/10 leave "Phép năm"; 22/10 work 08:00–17:15; 23/10 work 07:58–17:02; 26/10 work 07:56–17:10; 27/10 late 08:12–?; 28/10 work, đang làm, 07:59–… |
| Phạm Ngọc Anh | 28/10 late, đang làm, 08:21–… |
| Võ Đức Thịnh | 23/10 work 07:58–20:00; 26/10 work 08:00–19:30; 28/10 work, đang làm, 08:02–… |
| Đỗ Mai Linh | 13/10 absent "Vắng"; 19/10 late 08:19–17:05; 26/10 late 08:27–17:10; 28/10 late, đang làm, 08:35–… |
| Bùi Quốc Huy | 28/10 nocheck "Chưa vào" |
| Trịnh Văn Long | 27/10 work 07:58–?; 28/10 work, đang làm, 07:55–… |
| Lý Thanh Tâm | 26/10 work ?–17:06; 28/10 nocheck "Chưa vào" |
| Ngô Gia Bảo | 19/10 leave "Nghỉ, làm bù"; 28/10 work, đang làm, 07:48–… |
| Hoàng Minh Đức | 22/10 late 08:00–16:30; 28/10 work, đang làm, 07:56–… |

2. Ô còn lại, với `n` = số ngày kể từ 01/10/2026 và `r` = chỉ số trong `ROSTER` (0–10):
   - ngày `isScheduled` trả `false` (Chủ nhật): `off`;
   - sau 28/10: `fu` "08:00–17:00";
   - còn lại: `work`, giờ vào `465 + ((r·37 + n·11) mod 16)` phút, giờ ra `1020 + ((r·13 + n·7) mod 16)` phút (07:45–08:00 và 17:00–17:15, không bao giờ muộn hay sớm).
3. Dữ liệu có từ 01/10 đến 08/11 (Hồ sơ cần cả tháng 10). Ngoài khoảng đó, `dayDetail` trả `null`.

Lớp "cần xử lý": ngày nằm trong `days` của một việc còn chờ thì ô thành `todo`. Chữ trong ô là `cellLabel`, không có thì giữ chữ gốc; ô nhớ `itemId`. Việc được xử lý thì ô trở về ghi nhận gốc.

Ô (`Cell`) mang: `date`, `kind` (sau lớp phủ), `base` (gốc), `text`, `in`, `out` (`'HH:MM'` hoặc `null`), `live`, `itemId`, `label` và `aria`:

| `kind` | `label` | `aria` (phần sau dấu hai chấm) |
|--------|---------|-------------------------------|
| work | Đi làm | `Đi làm, <text>` + `, đang làm` khi `live` |
| late | Đi muộn (giờ vào sau 08:00) hoặc Về sớm | `<label>, <text>` + `, đang làm` khi `live` |
| leave | Nghỉ có phép | `Nghỉ có phép, <text>` |
| absent | Vắng | `Vắng` |
| todo | Cần xử lý | `Cần xử lý, <what của việc>` |
| off | Không có ca | `không có ca` |
| fu | Ca dự kiến | `ca dự kiến <text>` |
| nocheck | Chưa Check-in | `chưa Check-in` |

Tên đọc đầy đủ của ô: `<tên>, <thứ> <dd/mm>: <aria>`, với `<thứ>` lấy từ hàm mới `weekdayName(iso)` của `utils/format` ("Thứ Hai" … "Chủ nhật").

Tháng khác `2026-10`: `attendanceView` trả `null`.

### 4.3 Bố cục

- Tiêu đề "Chấm công" (League Spartan 28px). Dòng phụ: "Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10". Không nút ở hàng tiêu đề (R9).
- Vùng "Chỉ số chấm công": 6 thẻ, lưới `auto-fit minmax(150px, 1fr)`, mỗi thẻ là `<article>` có tên đọc là nhãn, giá trị `.tile-v`, ghi chú `.tile-n`:

| Nhãn | Giá trị | Ghi chú |
|------|---------|---------|
| Cần xử lý (thẻ tối, số màu `gold`) | số việc có `days` (11) | `<x> quên chấm · <y> yêu cầu chờ duyệt` (x = nhóm att, y = phần còn lại; ban đầu 2 và 9) |
| Có mặt hôm nay | 113 / 128 | 15 người chưa Check-in |
| Đi muộn hôm nay | 7 | trung bình 14 phút |
| Nghỉ có phép | 6 | `<số đơn nghỉ chờ> đơn chờ duyệt` |
| Vắng không phép | 1 | trong tháng 10 |
| Làm thêm tháng này | 126 giờ | `<số việc ot chờ> yêu cầu chờ duyệt` |

- Thẻ "Bảng công theo tuần":
  - tablist "Kiểu xem": "Tuần" và "Cần xử lý" + huy hiệu số (viền cam); không có "Tháng";
  - lọc: ô "Lọc theo tên…" (tên đọc "Lọc theo tên", bỏ dấu khi so) và ô chọn gốc "Phòng ban" (Phòng ban: Tất cả, Tài chính, Kỹ thuật, Kinh doanh, Nhân sự, Marketing, Sản xuất); lọc áp cho cả hai tab;
  - tab Tuần: nút "Tuần trước", nhãn tuần `aria-live` dạng "26/10 – 01/11/2026", nút "Tuần sau", nút "Hôm nay"; chú giải 5 nhóm màu kèm số ô trong tuần đang xem, cộng mục "Ca dự kiến"; lưới;
  - chân: dòng gợi ý "Kéo ngang bảng để xem tuần trước, tuần sau · bấm tên để mở hồ sơ · bấm ô để xem chi tiết ngày" và "Hiển thị N trong 128 nhân viên" (N = số dòng sau lọc).
- Lọc không ra ai: "Không có nhân viên nào khớp.".
- Tháng khác 10/2026: chỉ hiện tiêu đề và "Chưa có dữ liệu chấm công giả cho tháng M/YYYY." (ví dụ "tháng 9/2026").
- Trạng thái trên URL, đổi bằng `router.replace`:
  - `?xem=can-xu-ly` cho tab Cần xử lý;
  - `?q=` cho ô tên;
  - `?pb=<tên phòng ban>`; giá trị lạ thì về Tất cả và bị bỏ khỏi URL.

### 4.4 Lưới

- Vùng cuộn `.scr`: `role="region"`, tên "Lưới chấm công", `tabindex="0"`, `overflow-x: auto`, con trỏ `grab`, `user-select: none`, `max-width: 1084px` (220 + 7·96 + 3·64, nên không bao giờ thấy quá 7 ngày).
- Bảng `width: max-content; table-layout: fixed`:
  - cột tên 220px dính trái;
  - 28 cột ngày 96px;
  - 3 cột tổng 64px dính phải ("Công kỳ 10", "Trễ phút", "OT giờ"; `right` 128/64/0): Công là `period.worked`, Trễ phút và OT giờ lấy từ bảng nhân viên; không tính lại.
- Đầu cột cao 52px: thứ viết tắt và ngày. Ngày không có lịch (Chủ nhật) chữ xám #9e9e9e; thứ Bảy là ngày làm nên giữ chữ thường. Hôm nay là viên tối. Thứ Hai có vạch trái. 01/11 có vạch 2px #212121 và chữ "kỳ 11". Cột hôm nay nền `gold-pale`.
- Ô cao 48px, đệm 0 4px. Viên ô cao 30px, bo 8px, chữ 12px/500:

| Kiểu | Nền | Chữ |
|------|-----|-----|
| work | #1c1c1c | trắng |
| late | #e8c372 | `ink` |
| leave | #2f5aa8 | trắng |
| absent | #b43f3f | trắng |
| todo | trắng, viền 2px #eb973d | `ink` |
| off | màu nền trang; là `<span role="img">`, không bấm được | — |
| fu | trắng, viền 1px nét đứt `--status-draft` | #9e9e9e, 400 |
| nocheck | `--status-draft` | #616161 |

- Ô đang làm (`live`) có chấm 6px: vàng trên nền tối, #1c1c1c trên ô late.
- Mọi ô trừ `off` là nút mở hộp chi tiết ngày.
- Tên ở cột trái là liên kết tới hồ sơ (mục 5), `draggable="false"`.
- Dưới 768px: cột tên 140px; 3 cột tổng không dính.

### 4.5 Cuộn, kéo, phím (R7)

- Không dùng CSS scroll-snap.
- Kéo bằng JS chỉ cho chuột và bút (`pointerType` khác `touch`); chạm dùng cuộn gốc của trình duyệt.
  - Ngưỡng 4px rồi mới tính là kéo; khi kéo có class `.dragging` và `setPointerCapture`.
  - Thả tay: cuộn về bội số gần nhất của 96px. `behavior` là `'auto'` nếu `prefers-reduced-motion: reduce`, ngược lại `'smooth'`.
  - Lượt kéo vừa xong chặn cú click kế tiếp ở pha capture (cờ tự xoá sau `setTimeout(0)`), nên thả tay trên ô hay tên không mở gì. `dragstart` bị chặn.
- Phím chỉ khi focus đúng vùng cuộn (`event.target === scroller`); trong ô thì phím chạy như thường:
  - ←/→: ±96px;
  - PageUp/PageDown: ±672px;
  - Home: 0; End: cuối.
- Nút:
  - "Tuần trước" / "Tuần sau": ±672px, kẹp trong biên. "Tuần trước" tắt ở 0; "Tuần sau" tắt khi cách cuối dưới 1px.
  - "Hôm nay": về 1344px (tuần 26/10).
- Lúc mở: `scrollLeft = 1344`.
- `start = clamp(round(scrollLeft / 96), 0, 21)`. Nhãn tuần là ngày `start` đến `start + 6`; số trên chú giải đếm trong 7 ngày đó, trên các dòng đang hiện.
- `scroll-padding-left: 220px; scroll-padding-right: 192px` (dưới 768px: 140px và 0) để ô được focus không nằm dưới cột dính.

### 4.6 Tab "Cần xử lý" (R6)

- `<ul>` tên "Việc cần xử lý chấm công": mỗi việc có `days` một dòng, áp bộ lọc tên và phòng ban.
- Xếp theo ngày đầu tiên của việc, cùng ngày thì theo thứ tự chuông. Ban đầu: Trần Minh Quân 15/10, Hoàng Minh Đức 22/10, Võ Đức Thịnh 23/10, Lý Thanh Tâm 26/10, Đỗ Mai Linh 26/10, Trịnh Văn Long 27/10, Lê Hoàng Nam 27/10, Bùi Quốc Huy 28/10, Nguyễn Thu Hà 29/10, Ngô Gia Bảo 01/11, Phạm Ngọc Anh 03/11.
- Mỗi dòng là nút gồm avatar, tên, `<tên nhóm> · <what>` và ngày đầu (dd/mm). Bấm thì mở hộp chi tiết ngày của người đó, ngày đầu.
- Hết việc: "Không còn việc nào cần xử lý.".

### 4.7 Hộp chi tiết ngày

- `AppModal`, tiêu đề `<tên> · <thứ> <dd/mm/yyyy>` (ví dụ "Lê Hoàng Nam · Thứ Ba 27/10/2026"). Dòng phụ `<phòng ban> · <chức danh> · Ca HC 08:00–17:00`.
- Thân:
  - "Trạng thái": `label` của ô;
  - có giờ thì hai dòng "Giờ vào" / "Giờ ra" ("Chưa có" khi `null`, "Đang làm" khi `live` và chưa ra);
  - không có giờ thì dòng "Ghi nhận" với chữ của ô;
  - có việc chờ thì `InboxDetail` không phần người (`showPerson=false`), không liên kết hồ sơ;
  - liên kết "Mở hồ sơ chấm công" ở chân hộp, ẩn khi đang ở hồ sơ của chính người đó.
- URL: `?hop=chi-tiet-ngay&nv=<id>&ngay=<YYYY-MM-DD>`, mở và đóng bằng `router.replace`. Đóng chỉ bỏ ba khoá đó. Focus trả về phần tử đã mở hộp. Tải lại trang thì hộp mở lại.
- Đường dẫn sai (người không có, ngày ngoài dữ liệu): không mở hộp, bỏ ba khoá, lưới vẫn hiện.
- Xử lý xong: `toast.ok(câu)`, đóng hộp. Kết quả `null` (việc đã bị xử lý ở nơi khác): `toast.error('Yêu cầu này đã được xử lý.')`, đóng hộp. Đây là sửa lỗi R4 của đợt trước.

## 5. Hồ sơ chấm công (bảng F)

- Route `/admin/cham-cong/nhan-vien/:id` → `AttendanceEmployeeView.vue`, meta `{ layout: 'admin', nav: 'cham-cong', title: 'Hồ sơ chấm công' }`. Đọc tháng từ `?thang` như các màn khác.
- Dữ liệu: `mock/attendance-employee.ts` `employeeView(personId, month)`; `null` khi không có người.
- Đầu trang:
  - đường dẫn "Chấm công" (liên kết, giữ `?thang`) › tên;
  - h1 "Hồ sơ chấm công";
  - nút "Nhân viên trước" / "Nhân viên sau" và vị trí "3 / 11" theo thứ tự `ROSTER`; tắt ở hai đầu.
- Cột trái, vùng "Thông tin nhân viên":
  - avatar 72px nền `gold-light`, tên 18px, viên "Nhân viên chính thức", "Mã GFT-0142 · vào làm 03/2024";
  - khung nhắc (viền 2px #eb973d, bo 16px) khi tháng còn ngày cần xử lý: `<n> ngày cần xử lý · <dd/mm> <what viết thường>, <trạng thái viết thường>` và nút "Xem ngày" mở hộp chi tiết của ngày đầu. Trạng thái theo nhóm: att "Chưa giải trình", leave "Chờ duyệt đơn nghỉ", ot "Chờ duyệt", exp "Chờ duyệt giải trình". Ví dụ: "1 ngày cần xử lý · 27/10 thiếu giờ ra, chờ duyệt giải trình";
  - danh sách: Vị trí, Phòng ban, Ca làm việc ("HC 08:00–17:00"), Phép năm còn.
- Cột phải, vùng "Chỉ số tháng 10", 4 thẻ:

| Nhãn | Giá trị | Ghi chú |
|------|---------|---------|
| Ngày công | `<worked> / 26` (25 / 26) | cả kỳ 01–31/10 |
| Đi muộn | `<số lần> lần` | `tổng <Trễ phút> phút` |
| Giờ vào trung bình | Vào TB | ca bắt đầu 08:00 |
| Giờ ra trung bình | Ra TB | ca kết thúc 17:00 |

- Vùng "Tháng 10/2026":
  - chú giải 5 nhóm, số ô của cả tháng (Lê Hoàng Nam: đi làm 22, muộn 0, nghỉ có phép 1, vắng 0, cần xử lý 1);
  - dải 31 ngày trong vùng cuộn riêng (`role="region"`, tên "Các ngày tháng 10", `tabindex="0"`);
  - mỗi ngày gồm thứ viết tắt, số ngày, chấm 22px theo nhóm; hôm nay nổi bật;
  - ngày `off` là span; ngày khác là nút tên đọc `<thứ> <dd/mm>: <aria>`, mở hộp chi tiết ngày.
- Vùng "Lịch sử chấm công":
  - tablist "Kiểu xem lịch sử": "Dòng thời gian" / "Bảng giờ"; nút bật tắt "Chỉ ngày có ngoại lệ" (`aria-pressed`);
  - dòng: các ngày từ hôm nay lùi về ngày 1, bỏ ngày có ô gốc `off`;
  - 5 dòng đầu luôn hiện; sau đó mỗi chuỗi liền nhau từ 3 dòng `work` không `live` trở lên gộp thành nút "N ngày đi làm · dd/mm – dd/mm" với "Mở" / "Thu gọn" (`aria-expanded`). Lê Hoàng Nam: 28, 27, 26, 24, 23/10; gộp "9 ngày đi làm · 13/10 – 22/10"; 12/10; gộp "9 ngày đi làm · 01/10 – 10/10";
  - cột dòng (lưới 120px / 168px / 1fr / 190px): Ngày ("Thứ Ba 27/10"), Vào – ra, trục giờ 06:00–20:00, Trạng thái.

| Ô | Vào – ra | Dòng phụ | Trạng thái |
|---|----------|----------|------------|
| work | `07:56 – 17:10` | `Có mặt 9g 14p` (ra − vào, phút 2 chữ số) | Đi làm |
| late | `08:12 – ?` | `Trễ 12 phút` hoặc `Về sớm 30 phút`, thêm ` · chưa có giờ ra` khi thiếu giờ ra, hoặc ` · Có mặt …` khi đủ | `label` |
| live | `07:59 – …` | `Đang làm · 1g 41p` (tới 09:40) | `label` |
| leave | `Cả ngày` | chữ của ô ("Phép năm") | Nghỉ có phép |
| absent | `Cả ngày` | Vắng | Vắng |
| nocheck | `Chưa vào` | Chưa Check-in | Chưa Check-in |
| todo | theo ô gốc | theo ô gốc | trạng thái theo nhóm (như khung nhắc) |

- Trục giờ, `pct(t) = round(((giờ + phút/60 − 6) / 15) × 100, 2)`:
  - dải ca 08:00–17:00 màu nền trang;
  - thanh có mặt 12px #1c1c1c từ vào tới ra (hoặc tới 09:40 khi `live`), có vạch chéo nghỉ trưa 12:00–13:00 khi thanh phủ khoảng đó;
  - đoạn trễ `gold` 08:00 → giờ vào;
  - vạch 3px tại giờ vào khi thiếu giờ ra;
  - đoạn khai chờ duyệt (nét đứt #eb973d) từ `declared.from` tới `declared.to`, chỉ khi việc còn chờ;
  - vạch "bây giờ" 2px `gold` tại 09:40 trên dòng `live`;
  - dải nghỉ màu #2f5aa8 kèm chữ trên dòng leave.
- Chú giải trục: Ca, Có mặt, Nghỉ trưa, Đi muộn, Giờ khai chờ duyệt.
- "Chỉ ngày có ngoại lệ" giữ late, leave, absent, todo, nocheck, và không gộp dòng. "Bảng giờ" là bảng thường Ngày / Vào / Ra / Trạng thái trên cùng các dòng.
- Người không có: "Không tìm thấy nhân viên này." và liên kết "Về Chấm công". Tháng khác: đầu trang và cột thông tin vẫn hiện, phần tháng thay bằng câu trống ở mục 4.3.
- Liên kết tới hồ sơ:
  - tên trong lưới tuần;
  - "Mở hồ sơ chấm công" trong chuông (nhóm att, exp);
  - "Mở hồ sơ chấm công" trong hộp chi tiết ngày (ẩn khi đang ở hồ sơ đó).
  Tất cả giữ `?thang`.

## 6. Kiểm thử và xác minh

### 6.1 Test mới và test đổi (Playwright, không `page.route`, có bộ ghi request `/api` phải rỗng)

- `admin-bell.spec.ts` (mới): nhóm và số dòng; không chi tiết khi mở; đơn nghỉ ốm có "Hình thức" và "Lý do" riêng; duyệt trong chuông đổi chuông, thẻ Tổng quan và chọn việc kế; câu của việc nhắc; Escape hai bậc; xử lý việc cuối; tab Tin hệ thống.
- `admin-shell.spec.ts`: đổi 5 test chuông và thanh bên (bảng 6.2).
- `admin-overview.spec.ts`: KPI 11 → 10 → 9; chuông 13 → 12 → 11; duyệt hết thì chuông còn 2; focus sau khi xử lý.
- `attendance-mock.spec.ts` (mới): gọi thẳng module mock trong trình duyệt (`import('/src/mock/…')` qua `page.evaluate`, cùng bản module với app).
- `attendance-ux.spec.ts`: viết lại toàn bộ cho màn tuần (bảng 6.2).
- `attendance-employee.spec.ts` (mới): hồ sơ, trước/sau, gộp dòng, lọc ngoại lệ, liên kết, 375px.

### 6.2 Test cũ đổi hoặc xoá (không mất độ phủ âm thầm)

| Test cũ | Số phận |
|---------|---------|
| admin-shell `admin shell makes no /api requests while navigating` | Sửa: bỏ "Yêu cầu" khỏi vòng bấm, thêm kiểm thanh bên không còn mục đó và đi tới `/admin/yeu-cau` qua chân chuông |
| admin-shell `bell shows the mock count and opens the task list` | Viết lại: nhãn chuông, dialog "Thông báo", tab "Cần duyệt 13" |
| admin-shell `navigation drops stale view queries without reopening a shell dialog` | Viết lại: đi bằng liên kết "Mở trang Yêu cầu" trong ngăn kéo (lớp nền chặn bấm thanh bên) |
| admin-shell `bell popover opens below the bell on desktop` | Thay: ngăn kéo bám mép phải ở 1440px |
| admin-shell `bell popover stays inside a 375px viewport` | Thay: ngăn kéo và thẻ chi tiết nằm trong 375px |
| admin-overview `overview shows the mock figures` | Sửa: KPI so đúng ô `.kpi-v` = 11 (bỏ khẳng định lỏng "9") |
| admin-overview `approving updates the list, KPI, sidebar badge and toast` | Viết lại thành `…, bell and toast`; từ chối Bùi Quốc Huy thay Trần Minh Quân (không còn trong 3 dòng đầu) |
| admin-overview `approving every request shows the empty state` | Sửa: chuông còn 2 thay cho liên kết "Yêu cầu" |
| attendance-ux `timesheet stays in a keyboard-scrollable region at ${width}px` (×4, fixme) | Viết lại cho lưới tuần ở 375/768/1024/1440 |
| attendance-ux `phone uses labeled employee filter and retains both Today entry points` (fixme) | Phần lọc viết lại; phần "Hôm nay" bỏ vì màn Hôm nay không còn |
| attendance-ux `Today title action opens the today dialog on the attendance page at 375px` (đang chạy) | Xoá; thay bằng test nút "Hôm nay" đưa lưới về tuần hiện tại |
| attendance-ux `Today dialog exposes retry after a failed request and renders refreshed rows` (fixme) | Xoá: màn không còn, dữ liệu giả không có lỗi mạng |
| attendance-ux `Today openers share the hop URL, deep-link on refresh, and remove only hop on close` (fixme) | Ý `?hop` chuyển sang test đường dẫn sâu của hộp chi tiết ngày |
| attendance-ux `31-day month keeps every date and both employee identities reachable at the scroll end` (fixme) | Viết lại: phím End giữ tên và cột tổng thấy được |
| attendance-ux `filter and search URL state survives dialog, reload, back and forward` (fixme) | Viết lại cho `?q` và `?pb` |

Kết quả mong đợi khi xong: 0 failed; số skipped từ 47 còn 38 (9 test `fixme` của Chấm công được viết lại hoặc xoá).

### 6.3 Lệnh xác minh

- `npm --prefix web run test:ui`: 0 failed.
- `npm test` ở thư mục gốc: như mốc (24 pass).
- `git diff --stat a45a3ba -- src migrations test spec`: rỗng.

## 7. Rủi ro

| Rủi ro | Cách xử lý |
|--------|------------|
| Test gọi module mock qua `/src/...` phụ thuộc đường dẫn của Vite dev | Chỉ dùng trong `attendance-mock.spec.ts` và vài bước dựng trạng thái; nếu Vite đổi cách phục vụ thì chỉ hỏng test, không hỏng app |
| Kéo chuột chặn nhầm cú click | Chỉ chặn sau khi vượt ngưỡng 4px, cờ tự xoá; có test bấm thường vẫn mở |
| Cuộn mượt làm test vị trí chập chờn | Test giả lập `reducedMotion: 'reduce'`, nên cuộn tức thì |
| Màn Yêu cầu mất lối vào trên thanh bên | Ba lối còn lại (mục 2.3), có test |
| Số cột tổng và thẻ chỉ số không đổi sau khi duyệt | Đúng chủ đích (quyết định 5); ghi ở mục 8 |

## 8. Câu hỏi còn mở

1. Duyệt hay từ chối làm ngày công đổi thế nào: đơn nghỉ được duyệt, đơn bị từ chối, giải trình được duyệt (có ghi giờ ra theo giờ khai không)?
2. Chốt công: có chặn khi còn ngoại lệ không, nút đặt ở đâu; dải bước kỳ lương đang ghi "Chốt công" đã xong trong khi bảng E ghi hạn 31/10 — bên nào đúng?
3. "Nhắc giải trình" có giữ việc trong chuông không, nhắc qua kênh nào?
4. "Khai thay giờ vào/ra" cần ô nhập giờ chưa được thiết kế.
5. Ảnh hưởng tới Công, Trễ phút, OT giờ và các thẻ chỉ số sau khi xử lý.
6. Nghỉ ốm: có trừ phép năm không, BHXH, cần giấy tờ gì?
7. Tin hệ thống: những loại tin nào, có trạng thái đã đọc không?
8. Xuất Excel: phạm vi và các cột.
9. Thẻ "Cần xử lý" đếm theo việc hay theo ngày (l1 là 1 việc, 2 ngày)?
10. Các ô chú giải màu có nên lọc lưới không?
11. Tháng tương lai trên dải bước kỳ lương (m2 của đợt trước).
12. Khi nào một ngày là "đủ công", và giờ làm tính thế nào (có trừ cố định 1 giờ nghỉ trưa không)?
13. "iSAT" trong tổng kỳ là loại ngày nào, hiện ở đâu trên lưới và hồ sơ (mock để 0 cho mọi người)?
14. Ca thứ Bảy có giống ngày thường không (mock dùng HC 08:00–17:00)?

## 9. Phán quyết đã ghi

- Ruling: R1 — một nguồn duy nhất `mock/inbox.ts` cho chuông, Tổng quan và Chấm công. Mỗi nơi lọc theo phạm vi của mình (13 / 11 / 11). Xử lý chỉ đi qua `useShellStore().decide`, và màn tải lại theo `shell.version` — để ba con số không bao giờ lệch nhau sau một lần xử lý — rủi ro nếu sai: người dùng muốn chuông chỉ đếm việc cần duyệt; chỉ đổi bộ lọc của chuông.
- Ruling: R2 — bỏ mục "Yêu cầu" khỏi thanh bên. Test đổi vì việc này: `admin-shell.spec.ts` › `admin shell makes no /api requests while navigating`; `admin-overview.spec.ts` › `approving updates the list, KPI, sidebar badge and toast` và `approving every request shows the empty state` (bảng 6.2). Huy hiệu số chuyển hẳn lên chuông. `/admin/yeu-cau` tới được qua chân chuông, "Xem tất cả" và URL — để thanh bên không trùng số với chuông — rủi ro nếu sai: thêm lại một dòng trong `nav.ts` và huy hiệu đọc `pendingInbox().length`.
- Ruling: R3 — màn Chấm công cũ bị thay hẳn, không giữ song song: xoá 8 view/dialog và 2 builder (mục 4.1), viết lại `DayDetailDialog` và `services/admin-attendance.ts`. Mọi test cũ của màn được viết lại hoặc xoá có lý do theo bảng 6.2 — để không còn mã gọi `api()` chết và không có hai màn Chấm công — rủi ro nếu sai: muốn lấy lại màn Hôm nay hay Tăng ca thì phải lấy từ lịch sử git.
- Ruling: R4 — sửa lỗi treo R4 của đợt trước: hộp chi tiết ngày đọc kết quả `InboxItem | null`; `null` thì báo lỗi "Yêu cầu này đã được xử lý." thay vì toast thành công. Tổng quan và chuông dùng cùng quy tắc — để không báo "Đã duyệt" cho việc đã bị xử lý ở nơi khác — rủi ro nếu sai: chỉ là câu báo.
- Ruling: R5 — hồ sơ ở `/admin/cham-cong/nhan-vien/:id` (id dạng chữ không dấu, nối gạch). Thanh bên vẫn sáng "Chấm công". Trước/sau theo thứ tự `ROSTER`, không theo bộ lọc của lưới, nên hiện "3 / 11" thay "3 / 128" của bảng. Liên kết tới từ tên trong lưới, chuông (att, exp) và hộp chi tiết ngày, giữ `?thang` — để mọi lối vào ra cùng một URL chia sẻ được — rủi ro nếu sai: đổi đường dẫn thì sửa route và 3 chỗ dựng liên kết.
- Ruling: R6 — tab "Cần xử lý" của Chấm công là danh sách các việc có ngày chấm công, xếp theo ngày; bấm mở hộp chi tiết ngày. Tab "Tin hệ thống" của chuông là 3 tin tĩnh chỉ đọc, không tính vào số chuông — để không bịa luật thông báo khi chưa có quyết định (câu hỏi 7) — rủi ro nếu sai: chỉ đổi dữ liệu giả.
- Ruling: R7 — cuộn lưới: không dùng CSS snap; kéo bằng JS chỉ cho chuột và bút, ngưỡng 4px, chặn cú click ngay sau lượt kéo ở pha capture; thả tay thì về cột gần nhất; phím chỉ khi focus vùng cuộn; nút tuần ±672px; dưới 768px cột tên 140px và cột tổng không dính; chạm dùng cuộn gốc — để kéo không mở nhầm hộp, bàn phím và màn nhỏ vẫn dùng được — rủi ro nếu sai: cảm giác kéo trên máy cảm ứng khác bảng thiết kế.
- Ruling: R8 — duyệt hay từ chối đều đưa ô về ghi nhận gốc, không ghi giờ khai, không tính lại Công / Trễ / OT hay các thẻ chỉ số (trừ các số đếm việc chờ) — theo quyết định 5 — rủi ro nếu sai: khi luật được chốt thì thêm vào `resolveInboxItem` và dữ liệu ô.
- Ruling: R9 — bỏ các nút trên bảng không có chức năng giả hoặc mâu thuẫn với dải bước kỳ lương: "Khai thay hàng loạt", "Chốt công tháng 10", "Xuất bảng công ra Excel", lọc bằng ô màu (F) và "Khai thay ngày công" (F) — vì quy tắc không đặt nút giả và câu hỏi 2, 4, 8, 10 — rủi ro nếu sai: thêm lại nút khi có luồng.
- Ruling: R10 — dòng phụ của Chấm công bỏ "chốt công hạn 31/10, còn 3 ngày", vì dải bước đang ghi Chốt công đã xong (câu hỏi 2) — rủi ro nếu sai: một câu chữ.
- Ruling: R11 — "Nhắc giải trình" và "Khai thay giờ vào/ra" cũng bỏ việc khỏi danh sách, như kịch bản bảng C, với câu báo riêng; khai thay chưa có ô nhập giờ — để mọi nút trong chuông đều có tác dụng thấy được — rủi ro nếu sai: việc nhắc phải ở lại chuông (câu hỏi 3).
- Ruling: R12 — sau khi xử lý trong chuông, việc kế tiếp được chọn sẵn như kịch bản bảng C; lúc mới mở thì không chọn gì (quyết định 3) — rủi ro nếu sai: bỏ bước chọn sẵn, focus về danh sách.
- Ruling: R13 — cỡ chữ của bảng được đưa về thang 12/14/18/28/32 (11→12, 13→14 cho nội dung và 12 cho chữ phụ, 16→18, 22→18, 26→28) — để giữ ràng buộc chung — rủi ro nếu sai: vài chữ lớn hoặc nhỏ hơn bảng 1–2px.
- Ruling: R14 — giờ của các ô không ghi tay sinh bằng công thức ở mục 4.2, không chép giờ ngẫu nhiên của bảng — để test biết trước giá trị — rủi ro nếu sai: giờ trong lưới khác bảng ở các ô thường.
- Ruling: R15 — vạch "bây giờ" và đoạn trễ màu `gold` trên nền sáng là mảng tô, không phải chữ hay viền, nên giữ như bảng F — rủi ro nếu sai: đổi sang màu khác ở một chỗ CSS.
- Ruling: R16 — mọi người lịch thứ Hai – thứ Bảy. Ngày có lịch chỉ do `isScheduled(date)` quyết định; ô `off`, dải ngày, đầu cột xám và số ngày đều hỏi hàm này. Tổng kỳ `period` là dữ liệu tĩnh, cộng lại đúng 27, có test, và "Công kỳ 10" / "Ngày công" hiện `worked` — theo quyết định 8, để bảng lương và Chấm công cùng một con số — rủi ro nếu sai: khi BE có lịch riêng từng người thì chỉ thay thân `isScheduled` và bảng `period`.
- Ruling: R17 — đơn làm bù ib-o2 chuyển sang Chủ nhật 01/11 (bảng C ghi thứ Bảy 31/10). Lý do: thứ Bảy nay đã là ngày có lịch của mọi người, làm bù trên ngày đã có lịch thì vô nghĩa; Chủ nhật là ngày duy nhất không có lịch — rủi ro nếu sai: một dòng dữ liệu và chữ "CN 01/11" trong chuông.
