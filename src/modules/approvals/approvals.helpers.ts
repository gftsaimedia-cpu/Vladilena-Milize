const authz = require('../../platform/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()

/** Bộ lọc "khoản này người gọi có quyền duyệt không" (theo năng lực request.decide.<loại> ở phạm vi người khai). */
export const decidableBy = (me: any) => async (row: { item: string; username: string }) =>
  await authz.can(me, `request.decide.${row.item}`, { username: row.username });
