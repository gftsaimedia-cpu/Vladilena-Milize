// Khoá nhận dạng các dịch vụ dùng chung trong bộ chứa phụ thuộc của Nest (xem core.module.ts).
export const STORE = 'STORE'; // kho dữ liệu (src/platform/db.ts)
export const AUTH = 'AUTH'; // phiên đăng nhập (src/platform/auth.ts)
export const AUTHZ = 'AUTHZ'; // quyền (src/platform/authz.ts)
export const AUDIT = 'AUDIT'; // nhật ký thao tác (src/platform/audit.ts)
export const EVENTS = 'EVENTS'; // báo tin cho màn đang mở (src/platform/events.ts)
export const RULES = 'RULES'; // bộ quy tắc theo yêu cầu (src/platform/request-rules.ts)
export const DOMAIN = 'DOMAIN'; // bộ dựng service nghiệp vụ (src/domain/container.ts)
