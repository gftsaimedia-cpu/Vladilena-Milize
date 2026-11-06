// Tra nhân sự kèm phòng ban và staffStatus cho mọi route danh sách có bộ lọc chung (staffStatus, departmentId, q).
// Đọc thẳng bảng staff + departments; trả đúng khối `employee` mà FE hiện ở mỗi dòng.
import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { businessDateText } from '../../common/business-date';
import { KYSELY_DB, type DB } from '../../database';
import { foldText, matchesStaffStatus, staffStatusOf, type StaffFilter, type StaffStatus } from './domain';

/** Khối thông tin người đi kèm mỗi dòng (mục 2.3 của tài liệu yêu cầu). */
export interface EmployeeBlock {
  id: string;
  username: string;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
  jobTitle: string | null;
  staffStatus: StaffStatus;
}

@Injectable()
export class StaffDirectory {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Mọi nhân sự khớp bộ lọc, theo tên. `now` chỉ để test ghim "hôm nay". */
  async find(filter: StaffFilter, now: Date = new Date()): Promise<EmployeeBlock[]> {
    const today = businessDateText(now);
    const rows = await this.qb
      .selectFrom('staff as s')
      .leftJoin('departments as d', 'd.id', 's.department_id')
      .select([
        's.uuid',
        's.username',
        's.name',
        's.department_id',
        'd.name as department_name',
        's.job_title',
        's.contract_status',
        's.on_leave_from',
        's.on_leave_to'
      ])
      .orderBy('s.name')
      .orderBy('s.username')
      .execute();

    const needle = foldText(filter.q);
    const people: EmployeeBlock[] = [];
    for (const r of rows) {
      const staffStatus = staffStatusOf(
        { contractStatus: r.contract_status, onLeaveFrom: r.on_leave_from, onLeaveTo: r.on_leave_to },
        today
      );
      if (!matchesStaffStatus(filter.staffStatus, staffStatus)) continue;
      if (filter.departmentId === 'none' ? r.department_id !== null : filter.departmentId !== undefined && r.department_id !== filter.departmentId) continue;
      if (needle && !foldText(r.username).includes(needle) && !foldText(r.name).includes(needle)) continue;
      people.push({
        id: r.uuid ?? r.username,
        username: r.username,
        name: r.name,
        departmentId: r.department_id,
        departmentName: r.department_name,
        jobTitle: r.job_title,
        staffStatus
      });
    }
    return people;
  }

  /** Mọi khoá một mã nhân sự có thể được lưu bằng (uuid và username): nhiều bảng lưu theo một trong hai. */
  static idsOf(people: ReadonlyArray<Pick<EmployeeBlock, 'id' | 'username'>>): string[] {
    return [...new Set(people.flatMap(p => [p.id, p.username]))];
  }
}
