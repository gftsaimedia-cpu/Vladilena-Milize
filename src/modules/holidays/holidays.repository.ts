import { Injectable, Inject } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

/** Một ngày lễ của công ty; `date` dạng YYYY-MM-DD. */
export interface Holiday {
  date: string;
  name: string;
}

@Injectable()
export class HolidaysRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Các ngày lễ trong [from, to], gồm cả hai đầu, sắp theo ngày. Cột DATE đọc qua to_char để pg không đổi thành Date theo múi giờ máy. */
  async listBetween(from: string, to: string): Promise<Holiday[]> {
    return this.qb
      .selectFrom('company_holidays')
      .select([sql<string>`to_char(${sql.ref('holiday_date')}, 'YYYY-MM-DD')`.as('date'), 'name'])
      .where('holiday_date', '>=', from)
      .where('holiday_date', '<=', to)
      .orderBy('holiday_date')
      .execute();
  }

  /** false nếu ngày đó đã có trong lịch (giữ nguyên dòng cũ). */
  async insert(holiday: Holiday, createdBy: string | null): Promise<boolean> {
    const rows = await this.qb
      .insertInto('company_holidays')
      .values({ holiday_date: holiday.date, name: holiday.name, created_by: createdBy })
      .onConflict(oc => oc.column('holiday_date').doNothing())
      .returning('holiday_date')
      .execute();
    return rows.length > 0;
  }

  /** false nếu không có ngày đó. */
  async remove(date: string): Promise<boolean> {
    const rows = await this.qb.deleteFrom('company_holidays').where('holiday_date', '=', date).returning('holiday_date').execute();
    return rows.length > 0;
  }
}
