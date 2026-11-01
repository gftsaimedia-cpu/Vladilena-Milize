// Khoá cuộn trang khi có hộp thoại hoặc ngăn kéo đang mở (đếm số lớp đang mở, lớp cuối đóng mới mở khoá).
let open = 0;
export function lockScroll() {
  open += 1;
  if (open === 1) document.documentElement.style.overflow = 'hidden';
}
export function unlockScroll() {
  open = Math.max(0, open - 1);
  if (open === 0) document.documentElement.style.overflow = '';
}
