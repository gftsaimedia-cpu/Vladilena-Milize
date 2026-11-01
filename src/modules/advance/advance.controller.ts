import { AdvanceRequestsHandlers } from './advance-requests.handlers';
import { AdvanceApprovalsHandlers } from './advance-approvals.handlers';
import { Controller, Get, Post, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

/**
 * Tạm ứng lương. Số tạm ứng là số theo quy tắc do bộ máy lương tính (src/domain/advance/advance-cap.ts); không ai nhập số.
 * CHỈ người cần mới gửi yêu cầu; chỉ trừ vào phiếu khi Admin đã duyệt. Quyền ở cổng ROUTE_CAPS (src/platform/authz.ts).
 */
@Controller('api')
export class AdvanceController {
  constructor(
    @Inject(AdvanceRequestsHandlers) private readonly advanceRequestsHandlers: AdvanceRequestsHandlers,
    @Inject(AdvanceApprovalsHandlers) private readonly advanceApprovalsHandlers: AdvanceApprovalsHandlers
  ) {}

  /** ?month=[&username=][&status=] lịch sử yêu cầu ứng lương: { month, scope, items, pending?, cap, granted, remaining, eligible, reason? } */
  @Get('advance-requests')
  async requests(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceRequestsHandlers.list(c);
  }

  /** ?month=[&username=] yêu cầu tạm ứng của tháng: người duyệt thấy người đã gửi yêu cầu, nhân sự thấy của mình */
  @Get('advance-approvals')
  async approvals(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.list(c);
  }

  /** { month, expectedRev? } nhân sự xin tạm ứng cho chính mình (mỗi tháng một yêu cầu) */
  @Post('advance-approvals/request')
  async request(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.own(c, 'request');
  }

  /** { month, expectedRev? } nhân sự rút yêu cầu đang chờ của mình */
  @Post('advance-approvals/withdraw')
  async withdraw(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.own(c, 'withdraw');
  }

  /** { month, username, expectedRev? } duyệt yêu cầu đang chờ */
  @Post('advance-approvals/approve')
  async approve(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.decideOne(c, 'approve');
  }

  /** { month, username, expectedRev?, reason? } từ chối yêu cầu đang chờ */
  @Post('advance-approvals/reject')
  async reject(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.decideOne(c, 'reject');
  }

  /** { month, username, expectedRev?, reason? } huỷ duyệt (yêu cầu về lại chờ duyệt) */
  @Post('advance-approvals/cancel')
  async cancel(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.decideOne(c, 'cancel');
  }

  /** { month, expectedRev? } duyệt mọi yêu cầu ĐANG CHỜ */
  @Post('advance-approvals/approve-all')
  async approveEveryone(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.advanceApprovalsHandlers.approveAll(c);
  }
}
