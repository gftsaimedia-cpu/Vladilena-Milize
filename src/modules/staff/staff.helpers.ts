const Roles = require('../../../lib/roles'); // vai trò tuỳ chỉnh (dữ liệu ở settings)

export const rolesOfStaff = async (s: any) => await Roles.rolesOfStaff(s);
export const rolesRevOf = Roles.rolesRevOf;
