// Nút đã mở chế độ chọn (BulkButton). Nút đó ẩn khi đang chọn và được dựng lại khi thoát, nên nhớ theo chữ trên nút
// rồi tìm lại; thanh chọn đóng thì trả tiêu điểm về nút đó, không còn nút (vd. hết đơn chờ) thì về dòng kết quả.
let label = '';

export function rememberOpener(text: string) {
  label = text.trim();
}

export function focusOpener() {
  const again = [...document.querySelectorAll<HTMLButtonElement>('button.smbb')].find(
    b => !b.disabled && b.querySelector('.smbl')?.textContent?.trim() === label
  );
  const target = again ?? document.querySelector<HTMLElement>('.rsl');
  target?.focus();
}
