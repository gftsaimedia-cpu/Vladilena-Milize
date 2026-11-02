# Hoàn thiện dự án sau audit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Theo PROGRAM.md, thực hiện inline; không tự phái subagent.

**Goal:** Khép lại các khoảng trống G1/G4/G6/G9 có bằng chứng trong audit, hoàn thiện nghiệp vụ dạng class và kiểm chứng lại luồng lương.

**Architecture:** Sửa hành vi trước, đổi cấu trúc sau. HTTP → service theo module → rule/policy → repository Kysely; provider Nest bao ngoài domain. Ba kế hoạch con có đầu ra và cổng kiểm riêng.

**Tech Stack:** Node >=22.13, TypeScript, NestJS, PostgreSQL/PGlite, Kysely, Vue 3/Vite; test Node hiện có và Playwright cho luồng Vue.

**Spec:** [2026-11-02-remediation-design.md](../specs/2026-11-02-remediation-design.md). Bằng chứng gốc: [AUDIT-2026-11-02.md](../AUDIT-2026-11-02.md).

## Global Constraints

- Chỉ viết tài liệu trong commit lập kế hoạch; chưa đánh dấu task sửa code nào hoàn tất.
- Hai file frontend chưa commit thuộc baseline làm việc; khi thực thi phải rà và tích hợp có chủ đích, không ghi đè hoặc coi chúng đã được commit cùng tài liệu.
- Không đổi luật lương/TODO chính sách, không xoá bảng lịch sử AI, không đụng dữ liệu thật hoặc `.env` thật, không deploy.
- Giữ hành vi ngoài các lỗi G9 nêu trong spec; giữ rollback, khoá lạc quan, requestId, phân quyền và SSE sau COMMIT.
- Chạy test trên dependency đúng hệ điều hành; không dùng binary trong `/tmp` của phiên audit làm dependency lâu dài.
- Không đánh dấu đạt nếu lệnh bị `EPERM`, thiếu binary, thiếu DB hoặc trình duyệt. Số test audit là tham khảo, không thay cho lượt kiểm mới.

## Review Focus

1. Kỳ có hơn một trang phiếu hoặc đang lọc một người: duyệt theo toàn kỳ, không theo trang; test A1/A2.
2. Có phiếu lỗi ngoài trang hiện tại: toàn bộ lý do phải tới đúng người ở DB; test A2.
3. Dữ liệu cũ `pending`, `reviewed`, `flags_json`: duyệt tiếp được, không chạy AI; test A1/A3.
4. Hai yêu cầu ghi đồng thời hoặc lỗi giữa giao dịch: một kết quả hợp lệ, rollback đầy đủ, không có SSE thành công giả; test C1–C4 và cổng cuối.
5. DB được đóng/mở lại trong test hoặc sandbox: provider/repository không giữ kết nối cũ; test C1/C7.

## Phạm vi file của lượt lập kế hoạch

- Audit giữ nguyên làm bằng chứng lịch sử; không sửa các kết luận thành “đã sửa”.
- Thiết kế mới: `docs/superpowers/specs/2026-11-02-remediation-design.md`.
- Ba kế hoạch con ở cùng thư mục `plans/` như bảng dưới.
- `PROGRAM.md`: thêm liên kết và trạng thái kế hoạch, giữ nguyên các dòng lịch sử.

## Thứ tự thực thi

| Thứ tự | Kế hoạch                                                            | Điều kiện qua giai đoạn                                                                                |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A      | [Sửa luồng duyệt lương G9](2026-11-02-remediation-payroll.md)       | Không buộc duyệt từng phiếu, không bỏ sót qua trang, lưu lý do; tương thích lịch sử không chạy AI.     |
| B      | [Khôi phục kiểm tra và spec](2026-11-02-remediation-quality.md)     | `params:check` đạt, reference sinh mã và spec viết tay phản ánh G9/PG, ghi baseline test mới.          |
| C      | [Hoàn thiện class/service và DI](2026-11-02-remediation-backend.md) | Mỗi module có service có kiểu, không còn nghiệp vụ trong controller/container cũ; đối chiếu trước/sau. |
| D      | Cổng cuối bên dưới                                                  | Full suite, DB thử, UI, Docker/HTTPS thử có bằng chứng; cập nhật spec sau refactor.                    |

Phụ thuộc: A → B → C → D. Không chạy task sửa chung `src/platform/db.ts` hoặc `src/core/*` đồng thời.

## Checklist điều phối

- [ ] Chụp baseline `git status`, SHA, môi trường, TODO/skip và kết quả kiểm hiện tại; giữ hai thay đổi frontend đã có.
- [ ] Hoàn tất A1–A3, cập nhật ledger từng commit và kiểm lại luồng duyệt toàn kỳ.
- [ ] Hoàn tất B1–B3; không bỏ qua lỗi vì “đã có từ trước”.
- [ ] Hoàn tất C1–C8 và từng dòng chuyển module trong C6; không ghi toàn backend hoàn tất khi bảng trách nhiệm còn phần chưa phân công.
- [ ] Chạy toàn bộ cổng D, ghi lệnh/kết quả thật, review diff và các thay đổi hợp đồng.
- [ ] Chỉ commit/push phần đã kiểm, không force push. Không có remote thì lấy URL repo đích, không tự tạo repo công khai.

## D — Cổng cuối và bàn giao

**Files:** cập nhật `PROGRAM.md`, spec viết tay và `spec/reference/*`; tạo `docs/superpowers/verification/2026-11-02-remediation.md` khi thực thi. Không thêm báo cáo này vào baseline như bằng chứng thành công trước khi chạy.

**Interfaces:** nhận code hoàn tất từ A/B/C; xuất ma trận task → commit → lệnh → kết quả → giới hạn kiểm.

- [ ] Chạy `npm run typecheck`, `npm run typecheck:web`, `npm run format:check`, `npm run params:check`, `npm run spec:check` và `npm --prefix web run build`. Tất cả phải exit 0.
- [ ] Chạy `npm test` trên PGlite với localhost được phép; chạy lại với `PG_TEST_URL` trỏ DB PostgreSQL thử riêng. Đọc toàn bộ lỗi/TODO/skip; không dùng DB lương thật. Tổng test mới được báo theo output thực, không dùng số 64 hay 2.784 làm chuẩn đếm bắt buộc.
- [ ] Chạy E2E đã thêm ở A2: tài khoản đúng/sai quyền, 20 phiếu, ít nhất hai trang, phiếu lỗi ngoài trang đang mở, rev thay đổi; đăng nhập → chốt công → tính → duyệt kỳ → chi trả. Kiểm không còn request AI hoặc duyệt lô từ Vue.
- [ ] Build image và chạy compose bằng project name/volume thử riêng, secrets tạm không commit; kiểm health, `/`, login và khởi động lại giữ dữ liệu. Dọn đúng tài nguyên thử vừa tạo.
- [ ] Chạy backup → verify → drill → restore vào DB thử mới, đối chiếu số dòng và tiền. Chạy HTTPS profile Caddy cục bộ với chứng chỉ thử, không đổi DNS hay domain thật.
- [ ] Sinh lại reference sau C, sửa đường dẫn/tên class trong spec; chạy `spec:check` lần nữa. Kiểm bảng trách nhiệm không còn controller có nghiệp vụ hoặc facade sống ngoài danh sách tương thích có lý do.
- [ ] Review diff cuối, ghi rủi ro/giới hạn còn lại vào biên bản. Task chưa kiểm được giữ ô trống; không công bố G0–G9 hoàn tất nếu còn cổng bắt buộc chưa đạt.
- [ ] Commit biên bản/spec cuối bằng `docs: record remediation verification`; push nhánh đã thống nhất, kiểm SHA local bằng SHA remote.

## Tự rà kế hoạch

| Phát hiện audit                         | Task xử lý                                     |
| --------------------------------------- | ---------------------------------------------- |
| 1: dialog chặn duyệt kỳ                 | A1/A2                                          |
| 2: chọn tất cả bỏ sót trang             | A1/A2: gỡ luồng chọn phiếu, dùng duyệt toàn kỳ |
| 3: mất lý do loại phiếu                 | A2                                             |
| 4: class/service còn dở                 | C1–C8                                          |
| 5: `params:check` hỏng                  | B1                                             |
| 6: spec lệch                            | B2 và D                                        |
| 7: AI còn chạy qua nhánh cũ             | A3                                             |
| Kiểu lỏng, chưa kiểm UI/PG/HTTPS sau G9 | C8 và D                                        |

Trạng thái lúc viết: **đã lập kế hoạch, chưa thực thi sửa code**. Việc commit/push tài liệu không chứng minh các task trên đã hoàn tất.
