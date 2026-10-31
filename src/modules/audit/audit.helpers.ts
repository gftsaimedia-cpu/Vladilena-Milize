// Biên của một ngày giờ Việt Nam (Asia/Ho_Chi_Minh, +07:00, không có giờ mùa hè) dưới dạng ISO UTC
export const vnDayIso = (day, edge) =>
  new Date(`${day}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+07:00`).toISOString();
