# Thiết kế Hợp đồng API BE–FE và Quy trình Phối hợp 2 Agent Độc lập — 2026-11-03

**Căn cứ:** Kiến trúc NestJS (`src/modules/**`, `src/platform/authz.ts`), tầng dịch vụ Vue (`web/src/services/**`, `web/src/builders/**`), bộ sinh tài liệu tự động (`scripts/docs/gen-spec.ts`) và kết quả rà soát lệch hợp đồng tại [`2026-11-03-fe-be-sync-and-ui-simplification-design.md`](2026-11-03-fe-be-sync-and-ui-simplification-design.md).

## 1. Mục tiêu & Lý do (Intent & Goals)

Hệ thống sẽ được phát triển và bảo trì bởi **2 Agent độc lập**: **BE Agent** (phụ trách backend NestJS, nghiệp vụ, cơ sở dữ liệu) và **FE Agent** (phụ trách giao diện Vue 3). Trước đây, việc thiếu một hợp đồng API đầy đủ tham số và thiếu ranh giới rõ ràng đã dẫn tới:
- Khoảng một nửa số route trong [`spec/reference/api-routes.md`](../../../spec/reference/api-routes.md) không có mô tả tham số đầu vào/đầu ra.
- FE truyền thiếu tham số (`excludeErrors`, `reason`, `location`), đọc sai tên trường (`lateMin` thay vì `late`, đọc tiền `m.cut` thành số phút), hoặc tự ý gánh logic tính toán/lọc dữ liệu ở `web/src/builders/**`.

Thiết kế này thiết lập:
1. **Nguồn chân lý duy nhất về Hợp đồng API (`src/contracts/api-contract.ts` → `spec/reference/api-contract.md`):** BE khai báo đầy đủ 100% route trong `ROUTE_CAPS` kèm tham số (`params`, `query`, `body`), cấu trúc dữ liệu trả về (`response`) và mã lỗi (`errors`).
2. **Nguyên tắc "BE xử lý dữ liệu, FE chỉ hiển thị" (Data-on-BE, Display-on-FE):** Cấm tuyệt đối FE tự tính công thức lương/công, tự suy diễn quyền/trạng thái kỳ hoặc dùng dữ liệu giả (`mock`).
3. **Quy trình FE yêu cầu BE thiết kế API (`spec/api-requests.md`):** Khi FE cần dữ liệu mới hoặc cần BE tính sẵn một trường hiển thị, FE Agent ghi phiếu yêu cầu vào `spec/api-requests.md` theo mẫu chuẩn để BE Agent thực thi và cập nhật hợp đồng.
4. **Cổng kiểm tra tự động (`test/unit/api-contract.test.ts`):** Chặn ngay khi BE thêm route mà quên khai báo hợp đồng, khi FE gọi route không có trong hợp đồng, hoặc khi FE vi phạm ranh giới kiến trúc.

### Non-Goals & Anti-Goals
- **Không** thêm runtime overhead (như thư viện OpenAPI/Swagger nặng hoặc валидации schema phức tạp làm chậm request) vào đường chạy HTTP hiện tại.
- **Không** cho phép FE Agent sửa bất kỳ file nào trong `src/**` hoặc `migrations/**`, và không cho phép BE Agent sửa `web/src/**`.
- **Không** dùng từ bị cấm trong `test/unit/no-tam-tinh-text.test.ts`.

## 2. Các hướng tiếp cận (Approaches)

| Hướng | Mô tả & Đánh đổi |
| --- | --- |
| **1. Chỉ viết một file Markdown thủ công liệt kê API** | Nhanh lúc đầu nhưng chắc chắn sẽ trôi (drift) khi BE Agent thêm/sửa route mà quên cập nhật file Markdown, và không có test chặn khi FE gọi sai đường dẫn. |
| **2. Khai báo hợp đồng có cấu trúc tại `src/contracts/api-contract.ts` + sinh tự động `spec/reference/api-contract.md` + sổ yêu cầu `spec/api-requests.md` + test kiểm tra tĩnh `test/unit/api-contract.test.ts` (Đề xuất)** | Tận dụng trực tiếp cơ chế `npm run spec:gen` (`scripts/docs/gen-spec.ts`) và `ROUTE_CAPS` (`src/platform/authz.ts`) sẵn có trong repo. Vừa tạo ra tài liệu Markdown chuẩn cho cả 2 Agent đọc, vừa có test tự động đảm bảo 100% route có đặc tả tham số và FE chỉ gọi đúng route đã khai báo. |
| **3. Tích hợp OpenAPI / Swagger + sinh code client tự động** | Đòi hỏi viết lại toàn bộ 20 controller NestJS (hiện đang dùng `@Ctx() c: ApiContext` thay vì DTO class có decorator), khối lượng quá lớn và phá vỡ cấu trúc controller mỏng hiện tại. |

## 3. Chi tiết thiết kế

### 3.1. Phân định quyền sở hữu giữa BE Agent và FE Agent

| Thành phần | BE Agent | FE Agent |
| --- | --- | --- |
| **Vùng mã được phép sửa (Write Scope)** | `src/**`, `migrations/**`, `scripts/**`, `test/api/**`, `test/db/**`, `test/unit/**`, `src/contracts/api-contract.ts`, `spec/api-requests.md` (cập nhật trạng thái `IN_PROGRESS`/`DONE`/`REJECTED`) | `web/src/**`, `test/unit/**` (test giao diện), `spec/api-requests.md` (tạo mới yêu cầu `OPEN`) |
| **Vùng mã chỉ đọc (Read-Only Scope)** | `web/src/**` (chỉ đọc để hiểu ngữ cảnh hiển thị khi cần) | `spec/reference/api-contract.md`, `spec/reference/api-routes.md`, `src/contracts/api-contract.ts` |
| **Trách nhiệm dữ liệu** | Truy vấn DB, chạy công thức tính lương/công (`src/engine/**`, `src/domain/**`), kiểm tra điều kiện nghiệp vụ, tính sẵn các cờ hiển thị (`canApprove`, `canCancel`, `eligible`, tổng tiền, tổng phút), lọc và phân trang | Gọi API qua `web/src/services/*.ts`, định dạng chuỗi/số/ngày giờ (`web/src/utils/format.ts`), quản lý trạng thái đóng/mở hộp thoại, hiển thị dữ liệu và gửi thao tác của người dùng lên BE |
| **Điều bị cấm** | Không trả dữ liệu thô bắt FE phải tự chạy công thức lương/công; không đổi tên trường/xoá route đang dùng mà không cập nhật hợp đồng | Không cộng trừ tiền lương, không tự tính phút phạt/giờ công, không dùng `mock`, không gọi `fetch`/`api()` trực tiếp trong `.vue` (phải qua `web/src/services/*.ts`), không gọi nhiều trang API để tự gộp dữ liệu toàn cục |

### 3.2. Cấu trúc khai báo Hợp đồng API của BE (`src/contracts/api-contract.ts`)

BE khai báo bảng `API_CONTRACT: Record<string, RouteContract>` khớp 1–1 với mọi khoá trong `ROUTE_CAPS` (`src/platform/authz.ts`):

```ts
export interface RouteContract {
  /** Mô tả ngắn gọn mục đích của API và phạm vi dữ liệu trả về */
  summary: string;
  /** Tham số trên đường dẫn URL (ví dụ: { month: 'YYYY-MM', username: 'tên đăng nhập chữ thường' }) */
  params?: Record<string, string>;
  /** Tham số query string (ví dụ: { month: 'YYYY-MM (bắt buộc)', status: "'pending' | 'approved' | 'rejected' (tuỳ chọn)" }) */
  query?: Record<string, string>;
  /** Cấu trúc JSON body cho các lệnh POST / PUT (ghi rõ trường bắt buộc, tuỳ chọn, kiểu và giới hạn) */
  body?: Record<string, string>;
  /** Cấu trúc JSON phản hồi 200 OK do BE trả về */
  response: string;
  /** Các mã lỗi nghiệp vụ / HTTP chính mà FE có thể nhận (ví dụ: ['400 BAD_MONTH', '409 PERIOD_STALE']) */
  errors?: string[];
}
```

Bộ sinh `scripts/docs/gen-spec.ts` (`npm run spec:gen`) sẽ kết hợp `ROUTE_CAPS` + `API_CONTRACT` + vị trí controller để xuất ra [`spec/reference/api-contract.md`](../../../spec/reference/api-contract.md) chia theo từng module nghiệp vụ (`auth`, `attendance`, `sheet`, `approvals`, `explanations`, `advance`, `kpi`, `periods`, `pay-entries`, `staff`, `employees`, `leave`, `positions`, `catalog`, `settings`, `blocks`, `roles`, `audit`, `system`).

### 3.3. Quy trình FE yêu cầu BE thiết kế / bổ sung API (`spec/api-requests.md`)

Khi FE Agent xây dựng hoặc sửa một màn hình mà phát hiện:
1. Chưa có endpoint phục vụ thao tác/hiển thị đó; hoặc
2. Endpoint hiện tại thiếu trường dữ liệu đã tính sẵn (khiến FE phải tự tính toán hoặc phải gọi lặp nhiều trang); hoặc
3. Tham số đầu vào cần mở rộng thêm bộ lọc/trường ghi nhận.

**Quy trình 4 bước giữa FE Agent và BE Agent:**
1. **Bước 1 (FE Agent tạo phiếu yêu cầu):** FE Agent thêm một mục mới vào `spec/api-requests.md` với trạng thái `OPEN`, ghi rõ:
   - `Mã yêu cầu`: `API-REQ-XXX`
   - `Trạng thái`: `OPEN`
   - `Màn hình / Service FE`: đường dẫn file trong `web/src/**`
   - `Vấn đề hiện tại`: lý do không thể (hoặc không được phép) xử lý ở FE
   - `Đề xuất API`: `METHOD /api/...`, tham số `params`/`query`/`body` và trường `response` cần BE trả sẵn
2. **Bước 2 (BE Agent tiếp nhận & thiết kế):** BE Agent đọc các mục `OPEN` trong `spec/api-requests.md`, chuyển trạng thái sang `IN_PROGRESS`, cài đặt logic trong `src/domain/**` và `src/modules/**`, đảm bảo mọi phép tính nằm ở BE.
3. **Bước 3 (BE Agent công bố hợp đồng & kiểm thử):** BE Agent cập nhật `src/contracts/api-contract.ts`, chạy `npm run spec:gen` để cập nhật `spec/reference/api-contract.md`, viết test trong `test/api/**` và đổi trạng thái yêu cầu trong `spec/api-requests.md` thành `DONE` (kèm tên route chính thức).
4. **Bước 4 (FE Agent nối giao diện):** FE Agent đọc `spec/reference/api-contract.md` vừa cập nhật, gọi API mới trong `web/src/services/*.ts` và chỉ hiển thị dữ liệu BE trả về.

Ngay trong đợt khởi tạo này, `spec/api-requests.md` sẽ ghi nhận sẵn các yêu cầu thực tế phát sinh từ đợt rà soát FE–BE (như bổ sung danh sách phiếu lỗi toàn kỳ trong `GET /periods/:month` để FE không phải lặp trang khi mở hộp duyệt kỳ, bổ sung số phút bị trừ `deductedMinutes` trong báo cáo công để FE điện thoại không phải tự quy đổi từ giờ thiếu).

### 3.4. Kiểm tra tự động bằng Test (`test/unit/api-contract.test.ts`)

1. **Mọi route BE đều phải có hợp đồng:** Mọi khoá trong `ROUTE_CAPS` (`src/platform/authz.ts`) phải có mặt trong `API_CONTRACT` (`src/contracts/api-contract.ts`) và ngược lại (không có hợp đồng mồ côi). Mọi route phải có `summary` và `response`; mọi route `POST`/`PUT` có nhận dữ liệu phải khai báo `body`; mọi route có `:param` trên đường dẫn phải khai báo `params`.
2. **Mọi lệnh gọi `api(...)` của FE phải nằm trong hợp đồng BE:** Quét toàn bộ `web/src/services/**/*.ts`, chuẩn hoá các biểu thức đường dẫn trong `api(method, path, ...)` (ví dụ `` `/periods/${enc(month)}/approve` `` → `POST /periods/:month/approve`) và kiểm tra đường dẫn đó phải tồn tại trong `API_CONTRACT`.
3. **Ranh giới hiển thị của FE:**
   - Không file nào trong `web/src/**` được import từ `src/**` (ngoài kiểu tĩnh nếu có).
   - Không file `.vue` nào trong `web/src/views/**` hay `web/src/components/**` được gọi `fetch(` hoặc `api(` trực tiếp (mọi giao tiếp mạng phải đi qua `web/src/services/*.ts`).
4. **Tính hợp lệ của `spec/api-requests.md`:** Mọi phiếu yêu cầu `API-REQ-XXX` phải có trạng thái hợp lệ (`OPEN` | `IN_PROGRESS` | `DONE` | `REJECTED`), và mọi phiếu `DONE` phải trỏ tới route có thật trong `API_CONTRACT`.
