// Tiện ích dùng chung của dữ liệu giả nhóm Chấm công, Nhân sự, KPI (thay phần máy chủ lọc, tìm, chia trang).
export const MONTH = '2026-11'; // tháng duy nhất có dữ liệu giả
export const PAGE_SIZE = 20;

/** Bỏ dấu, hạ chữ thường để tìm tên không phân biệt dấu. */
export const fold = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export const matches = (name, q) => !q || fold(name).includes(fold(q));
export const pageOf = (rows, page = 1, size = PAGE_SIZE) => rows.slice((page - 1) * size, page * size);
export const pagesOf = (total, size = PAGE_SIZE) => Math.max(1, Math.ceil(total / size));

export const pad = n => String(n).padStart(2, '0');
export const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const hhmm = m => `${pad(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad(((m % 60) + 60) % 60)}`;
