import { BadRequestError } from '../../common';
import { InvalidStaffFilterError, parseStaffFilter, type StaffFilter } from './domain';

/** Ba tham số lọc chung của route danh sách; giá trị lạ thành 400 INVALID_FILTER. */
export function staffFilterFromQuery(raw: { staffStatus?: string; departmentId?: string; q?: string }): StaffFilter {
  try {
    return parseStaffFilter(raw);
  } catch (err) {
    if (err instanceof InvalidStaffFilterError) throw new BadRequestError(err.message, { code: 'INVALID_FILTER' });
    throw err;
  }
}
