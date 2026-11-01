import { Inject, Injectable } from '@nestjs/common';
import { AUTHZ } from '../../core/tokens';
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()

/** Bộ lọc "khoản này người gọi có quyền duyệt không" (theo năng lực request.decide.<loại> ở phạm vi người khai). */

@Injectable()
export class ApprovalsHelpers {
  constructor(@Inject(AUTHZ) private readonly authz: any) {}

  decidableBy = (me: any) => async (row: { item: string; username: string }) =>
    await this.authz.can(me, `request.decide.${row.item}`, { username: row.username });
}
