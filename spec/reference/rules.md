# Luật nghiệp vụ dạng lớp

> Sinh tự động bởi `scripts/docs/gen-spec.js` (`npm run spec:gen`) từ `lib/domain/**/rules/*.js` và các file `*-rule.js` (lớp kế thừa `Rule`). Đừng sửa tay: `test/unit/spec-reference.test.js` so sánh file này với bản dựng từ mã.

Mỗi luật là một lớp kế thừa `Rule` (`lib/domain/shared/rule.ts`), trả về `Violation` (`block` = từ chối, `warn` = cảnh báo kèm hệ quả); `RuleSet` chạy lần lượt. Con số của luật nằm ở bộ tham số (một nguồn, ví dụ `OtLimits` trong `lib/domain/overtime/ot-limits.ts`), không nằm trong luật.
