/** Bỏ dấu, viết thường, để tìm tên không phân biệt dấu. */
export const foldText = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
