// Mở trang in phiếu lương ở tab mới; trang đó tự gọi hộp in của trình duyệt (?in=1).
// Gọi trực tiếp trong hàm xử lý bấm nút để trình duyệt không chặn cửa sổ mới.
export function openPrint(router, { month, username = '', scenario = '', name = '' }: any) {
  const path = username ? `/in/phieu-luong/${month}/${encodeURIComponent(username)}` : `/in/phieu-luong/${month}`;
  const query: Record<string, any> = { in: '1' };
  if (scenario) query.kb = scenario;
  if (name) query.ten = name;
  window.open(router.resolve({ path, query }).href, '_blank');
}
