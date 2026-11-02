# Thiết kế hoàn thiện sau audit 2026-11-02

**Căn cứ:** [audit](../AUDIT-2026-11-02.md), [chương trình G0–G9](../PROGRAM.md), thiết kế G1 và G2–G4. Người dùng yêu cầu viết lại kế hoạch, commit và push; lượt này chỉ tạo tài liệu. Các lựa chọn dưới đây là đề xuất kỹ thuật để triển khai, không phải báo cáo đã sửa xong.

## Kết quả cần đạt

1. Duyệt cả kỳ lương từ giao diện, không buộc duyệt từng phiếu trước; không bỏ sót người do phân trang; lý do loại phiếu được lưu đúng.
2. Loại chức năng AI đang hoạt động còn sót; vẫn đọc được lịch sử cũ.
3. `params:check`, typecheck, format, reference và test đều trở thành cổng kiểm chứng thật.
4. Hoàn tất ranh giới class/service: controller nhận và trả HTTP; service điều phối nghiệp vụ; rule/policy quyết định; repository truy vấn.
5. Spec mô tả mã hiện tại và có bằng chứng kiểm thử đầu cuối sau G9.

## Hướng giải quyết

| Hướng                                              | Đánh đổi                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vá luồng duyệt từng phiếu hiện tại                 | Ít thay đổi giao diện nhưng giữ hai cơ chế duyệt và phải giải quyết lựa chọn qua nhiều trang. Không phù hợp vòng đời G9 đã ghi.                     |
| Duyệt cả kỳ, giữ API cũ để tương thích có giới hạn | Gỡ lựa chọn/duyệt lô khỏi UI, backend duyệt các phiếu hợp lệ trong một giao dịch. Giữ được client và dữ liệu cũ khi chuyển tiếp. **Hướng đề xuất.** |
| Viết lại toàn bộ backend/giao diện một lượt        | Khó định vị hồi quy tiền lương, không tận dụng lưới test hiện có. Không chọn.                                                                       |

Thứ tự: sửa hành vi G9 → sửa công cụ/spec → tách service từng lát dọc → kiểm chứng tổng thể. Không trộn thay đổi luật tiền lương vào commit đổi cấu trúc.

## Hợp đồng duyệt lương

- Vòng đời mới: `open → attendance_locked → calculated → approved → paid`. Đọc kỳ `reviewed` cũ và cho duyệt tiếp; không tạo bước AI mới.
- Phiếu mới `draft` hoặc `error`; phiếu `draft` và `pending` cũ được duyệt theo kỳ. API `decide` cũ còn tương thích nhưng UI mới không gọi.
- Bộ lọc API mới `status=unapproved` tương ứng SQL `status IN ('draft','pending')`; các bộ lọc cũ giữ nghĩa hiện tại. UI dùng bộ lọc này cho nhóm chưa duyệt.
- Dialog tải tổng quan duyệt riêng, không dùng riêng danh sách phiếu trên trang đang xem. Lấy toàn bộ phiếu lỗi bằng phân trang `status=error`, mỗi trang 200 dòng.
- `getPeriodApprovalSummary(month)` trả `{ rev, draft, legacyPending, approved, errors }`; mỗi phần tử `errors` có `username`, `name`, `shortProblem`.
- `approvePeriod(month, { rev, excludeErrors })` gửi chính xác phiên bản đã hiển thị và `excludeErrors: Array<{ username, reason }>`; lý do do UI yêu cầu dài 10–300 ký tự sau trim. Không đổi chính sách chặn/cảnh báo hiện tại của backend.
- `409` do dữ liệu thay đổi: báo cần tải lại, không tự gửi lại yêu cầu duyệt bằng phiên bản mới. Khi duyệt lỗi, không phát thông báo thành công.
- `flags_json`, bảng `ai_review_runs`, `ai_finding_actions`, cột `reviewed_*` được giữ. Không phát lại cảnh báo `PAYSLIP_FLAGGED`, không còn route thực thi AI. Cờ thuế/bảo hiểm của khoản điền thêm không phải cờ AI, phải giữ.

## Ranh giới kiến trúc

- Class nghiệp vụ không import NestJS/Express/`ApiContext`. Provider Nest đăng ký bên ngoài domain qua factory có kiểu và constructor dependency rõ ràng.
- `UnitOfWork.run<T>(work: () => Promise<T>): Promise<T>` bọc cơ chế giao dịch đang có; không viết lại driver khi không có lỗi được chứng minh.
- Repository Kysely là nơi truy vấn. Controller không nhận `STORE`/`DOMAIN` tổng hợp sau khi module đó được chuyển; dùng service cụ thể.
- Mỗi nhóm hàm nghiệp vụ có một class chủ sở hữu. Hàm tính toán thuần, formatter, validator cú pháp và engine có thể là hàm; phải được ghi vào bảng trách nhiệm với lý do cụ thể. Không bọc mỗi hàm trong một class vô nghĩa.
- `src/platform/db.ts` cuối cùng chỉ giữ vòng đời kết nối/composition và facade tương thích cho test/script; không giữ luật trạng thái kỳ/duyệt lương.
- Class/service đã có được tái sử dụng. Chuyển tất cả getter của `Container` sang provider tương ứng rồi mới xoá container; test/script có composition root riêng, không cần khởi động Nest để dùng domain.
- Tăng kiểm kiểu theo tập file đã chuyển; không dùng `@ts-nocheck`, không nâng trần `any`/cỡ file để che lỗi.

## Giới hạn và nghiệm thu

- Giữ `Node >=22.13`, NestJS, PostgreSQL, Kysely và Vue hiện tại; cài dependency đúng hệ điều hành khi thực thi. Không commit `node_modules` hay binary lấy từ cache.
- Không tự quyết 16 TODO chính sách cũ, không tự làm `previewToken` ngoài phạm vi audit. Thống kê TODO/skip và giải thích thay đổi, không ép con số cũ thành kết quả mới.
- Không xoá dữ liệu lịch sử, không thay DB lương thật, không đụng `.env` thật. Không triển khai trong kế hoạch này.
- API, quyền, mã lỗi, thứ tự cảnh báo, số tiền nguyên đồng, rollback và phát SSE sau COMMIT phải giữ nguyên ngoài các lỗi G9 nêu rõ.
- Mọi task có test hồi quy trước sửa, kiểm tra riêng, commit nhỏ. Cổng cuối gồm full suite PGlite, PostgreSQL thử riêng, Vue E2E, Docker và HTTPS thử cục bộ; thiếu môi trường ghi rõ là chưa kiểm, không đánh dấu toàn chương trình hoàn tất.

## Tài liệu thực thi

Đọc [kế hoạch tổng](../plans/2026-11-02-remediation.md), sau đó thực hiện ba kế hoạch con theo thứ tự. Cách chạy mặc định là inline theo `PROGRAM.md`; không tự phái subagent.
