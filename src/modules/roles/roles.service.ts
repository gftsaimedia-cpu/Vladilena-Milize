import { Injectable, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

@Injectable()
export class RolesService {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  async listRoles(): Promise<any> {
    const defaultRoles = [
      { code: 'admin', label: 'Quản trị viên (Admin)', isDefault: true },
      { code: 'manager', label: 'Quản lý (Manager)', isDefault: true },
      { code: 'staff', label: 'Nhân viên (Staff)', isDefault: true },
    ];

    const customRoles = await this.qb
      .selectFrom('staff_roles')
      .select(['role'])
      .distinct()
      .where('revoked_at', 'is', null)
      .execute();

    const existingCodes = new Set(defaultRoles.map((r) => r.code));
    for (const row of customRoles) {
      if (!existingCodes.has(row.role)) {
        defaultRoles.push({
          code: row.role,
          label: row.role.toUpperCase(),
          isDefault: false,
        });
      }
    }

    return { roles: defaultRoles };
  }
}
