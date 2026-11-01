# Luật nghiệp vụ dạng lớp

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `src/domain/**/rules/*.js` và các file `*-rule.js` (lớp kế thừa `Rule`). Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Mỗi luật là một lớp kế thừa `Rule` (`src/domain/shared/rule.ts`), trả về `Violation` (`block` = từ chối, `warn` = cảnh báo kèm hệ quả); `RuleSet` chạy lần lượt. Con số của luật nằm ở bộ tham số (một nguồn, ví dụ `OtLimits` trong `src/domain/overtime/ot-limits.ts`), không nằm trong luật.
