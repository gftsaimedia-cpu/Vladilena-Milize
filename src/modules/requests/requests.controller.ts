import { Controller, Get, Post, Patch, Param, Body, Query, UseFilters, Inject, Optional } from '@nestjs/common';
import { RequestIdPipe } from './request-id.pipe';
import { ApiExceptionFilter, BadRequestError, HttpError, NotFoundError, CurrentUser, UserSession, RequireCap, requireBulkIds, requireBulkItems } from '../../common';
import { AuditEntryError } from '../audit';
import { StaffDirectory, isNeutralStaffFilter, staffFilterFromQuery, type EmployeeBlock } from '../departments';
import { RequestsService } from './requests.service';
import { ExplanationsService, type DueItem } from './explanations.service';
import { createdBody, dayConflictHttp } from './request-http';
import { RequestType, RequestStatus, ISAT_CONDITIONS, LEAVE_TYPES, EXPLANATION_CASES, requireDateText } from './domain';

// Các route này là của Admin làm thay nhân viên: người được thao tác phải ghi rõ, không suy ra từ phiên.
function requireEmployeeId(body: any): string {
  const id = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
  if (!id) throw new Error('Thiếu employeeId của nhân viên');
  return id;
}

@Controller('api/v2/requests')
@UseFilters(ApiExceptionFilter)
export class RequestsController {
  constructor(
    @Inject(RequestsService) private readonly service: RequestsService,
    @Optional() @Inject(ExplanationsService) private readonly explanations?: ExplanationsService,
    // Bắt buộc khi chạy thật (Nest tiêm); kiểu TS tuỳ chọn để test dựng tay các route không cần nó.
    @Inject(StaffDirectory) private readonly directory?: StaffDirectory
  ) {}

  private staffDirectory(): StaffDirectory {
    if (!this.directory) throw new Error('StaffDirectory chưa được cấu hình');
    return this.directory;
  }

  private explanationsService(): ExplanationsService {
    if (!this.explanations) throw new Error('ExplanationsService chưa được cấu hình');
    return this.explanations;
  }

  @RequireCap('requests.review')
  @Post('leave')
  async createLeave(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const created = await this.service.createLeaveRequest({ ...body, employeeId });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('leave-with-makeup')
  async createLeaveWithMakeup(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Số ngày nghỉ và giờ bù do server tính: `daysCount`/`leaveType` client gửi không được chuyển xuống.
      const created = await this.service.createLeaveWithMakeupRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        startDate: body.startDate,
        endDate: body.endDate,
        slots: body.slots
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('shift-change')
  async createShiftChange(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Giờ ra của ca lấy từ khung (§4); `endTime` client gửi không được chuyển xuống.
      const created = await this.service.createShiftChangeRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        startDate: body.startDate,
        endDate: body.endDate,
        shiftType: body.shiftType,
        startTime: body.startTime
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('overtime')
  async createOvertime(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Giờ OT do server tính từ khung: `hours`/`otHours`/`otRateMultiplier` client gửi không được chuyển xuống.
      const created = await this.service.createOvertimeRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        otDate: body.otDate,
        targetDate: body.targetDate,
        startTime: body.startTime,
        endTime: body.endTime
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('advance')
  async createAdvance(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // Số tiền, tiêu đề và lý do do server đặt (spec 2.5): chỉ nhận nhân sự và kỳ.
      const created = await this.service.createAdvanceRequest({ employeeId, period: body.period });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('explanation')
  async createExplanation(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      // `targetPunchType`/`actualPunchTime` của bản cũ không còn; chỉ chuyển các trường của §6.5.
      const created = await this.service.createExplanationRequest({
        employeeId,
        title: body.title,
        reason: body.reason,
        workDate: body.workDate,
        cases: body.cases,
        actualCheckIn: body.actualCheckIn,
        actualCheckOut: body.actualCheckOut
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Post('isat')
  async createIsat(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const created = await this.service.createIsatRequest({
        employeeId,
        saturday: body.saturday,
        team: body.team,
        conditions: body.conditions
      });
      return createdBody(created);
    } catch (err: any) {
      throw dayConflictHttp(err, 400) ?? new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Phải khai báo trước @Get(':id') để 'isat' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('isat/conditions')
  listIsatConditions(): { conditions: Array<{ code: string; label: string }> } {
    return { conditions: ISAT_CONDITIONS.map(({ code, label }) => ({ code, label })) };
  }

  // 6 loại nghỉ (§9) cho form đơn nghỉ; khai báo trước @Get(':id') để 'leave-types' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('leave-types')
  listLeaveTypes(): { leaveTypes: typeof LEAVE_TYPES } {
    return { leaveTypes: LEAVE_TYPES };
  }

  // 7 trường hợp giải trình cho form; khai báo trước @Get(':id') để 'explanation-cases' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('explanation-cases')
  listExplanationCases(): { cases: typeof EXPLANATION_CASES } {
    return { cases: EXPLANATION_CASES };
  }

  // Ngày cần giải trình của mọi nhân sự (chuông của Admin); khai báo trước @Get(':id') để 'explanations-due' không bị bắt làm id
  @RequireCap('requests.review')
  @Get('explanations-due')
  async listExplanationsDue(
    @Query('staffStatus') staffStatus?: string,
    @Query('departmentId') departmentId?: string,
    @Query('q') q?: string
  ): Promise<{ items: Array<DueItem & { employee: EmployeeBlock | null }> }> {
    const filter = staffFilterFromQuery({ staffStatus, departmentId, q });
    try {
      const people = await this.staffDirectory().find(filter);
      const items = await this.explanationsService().listDue(isNeutralStaffFilter(filter) ? {} : { onlyIds: people.map(p => p.id) });
      const byId = new Map(people.map(p => [p.id, p]));
      return { items: items.map(item => ({ ...item, employee: byId.get(item.employeeId) ?? null })) };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Admin nhắc nhân viên giải trình một ngày; người nhắc là Admin đang đăng nhập. Kỳ đã phê duyệt hay đã trả → 409
  // PERIOD_LOCKED giữ nguyên; lý do khác → 400.
  @RequireCap('requests.review')
  @Post('explanations-due/remind')
  async remindExplanation(@Body() body: any, @CurrentUser() user: UserSession): Promise<{ reminded: true; remindedAt: string }> {
    try {
      const employeeId = requireEmployeeId(body);
      const date = requireDateText(body?.date, 'date');
      const { remindedAt } = await this.explanationsService().remind(employeeId, date, user.username);
      return { reminded: true, remindedAt };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Nhắc nhiều (người, ngày) một lúc: 200 { done, failed }; phần tử lỗi (kỳ đã khoá → PERIOD_LOCKED...) không kéo phần tử khác.
  @RequireCap('requests.review')
  @Post('explanations-due/remind-many')
  async remindExplanationMany(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    const items = requireBulkItems<{ employeeId: string; date: string }>(body?.items, item => {
      const employeeId = typeof item.employeeId === 'string' ? item.employeeId.trim() : '';
      const date = typeof item.date === 'string' ? item.date : '';
      if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return `${employeeId}|${date}`;
    }).map(item => ({ employeeId: item.employeeId.trim(), date: item.date }));
    return await this.explanationsService().remindMany(items, user.username);
  }

  @RequireCap('requests.review')
  @Get()
  async listRequests(
    @Query('employeeId') employeeId?: string,
    @Query('type') type?: RequestType,
    @Query('status') status?: RequestStatus,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('staffStatus') staffStatus?: string,
    @Query('departmentId') departmentId?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string
  ): Promise<unknown> {
    const filter = staffFilterFromQuery({ staffStatus, departmentId, q });
    if (sort !== undefined && sort !== '' && sort !== 'inbox') {
      throw new BadRequestError('sort chỉ nhận inbox', { code: 'INVALID_SORT' });
    }
    try {
      const limit = limitStr ? Number(limitStr) : undefined;
      const offset = offsetStr ? Number(offsetStr) : undefined;
      const people = await this.staffDirectory().find(filter);
      // Bộ lọc không loại ai thì không giới hạn nhân sự (giữ cả đơn của người không còn trong bảng nhân sự).
      const staffIds = isNeutralStaffFilter(filter) ? undefined : StaffDirectory.idsOf(people);
      const result = await this.service.listRequests({
        employeeId,
        type,
        status,
        limit,
        offset,
        staffIds,
        sort: sort === 'inbox' ? 'inbox' : undefined,
        withCounts: true
      });
      const byId = new Map(people.map(p => [p.id, p]));
      return { ...result, items: result.items.map(item => ({ ...item, employee: byId.get(item.employeeId) ?? null })) };
    } catch (err: any) {
      if (err instanceof HttpError) throw err;
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  @RequireCap('requests.review')
  @Get(':id')
  async getRequest(@Param('id', RequestIdPipe) id: string): Promise<unknown> {
    const request = await this.service.getById(id);
    if (!request) {
      throw new NotFoundError('Không tìm thấy yêu cầu', { code: 'REQUEST_NOT_FOUND' });
    }
    return { request };
  }

  @RequireCap('requests.review')
  @Patch(':id/review')
  async reviewRequest(
    @Param('id', RequestIdPipe) id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const reviewerId = user.username;
      // Duyệt đơn của tháng đã tính lương thì phiếu của người nộp được tính lại sau khi lưu; kết quả nằm ở `recalculated`.
      const { request, recalculated } = await this.service.reviewAndRecalculate(id, reviewerId, body.action, body.note);
      return { updated: true, request, recalculated };
    } catch (err: any) {
      // Lỗi ghi nhật ký là lỗi lập trình (spec audit-log mục 4): để filter trả 500.
      if (err instanceof AuditEntryError) throw err;
      const conflict = dayConflictHttp(err, 409);
      if (conflict) throw conflict;
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }

  // Duyệt nhiều đơn một lúc, chỉ APPROVE (mỗi đơn từ chối cần lý do riêng). Duyệt tuần tự theo thứ tự `ids`; đơn lỗi vào
  // `failed`; phiếu lương của mỗi người tính lại một lần ở mỗi tháng đang `calculated` (trong `recalculated`).
  @RequireCap('requests.review')
  @Post('review-many')
  async reviewMany(@Body() body: any, @CurrentUser() user: UserSession): Promise<unknown> {
    if (body?.action === 'REJECT') {
      throw new BadRequestError('Từ chối cần lý do riêng cho từng đơn, không từ chối nhiều đơn một lúc', {
        code: 'BULK_REJECT_NOT_ALLOWED'
      });
    }
    if (body?.action !== 'APPROVE') {
      throw new BadRequestError('action phải là APPROVE', { code: 'BAD_REQUEST' });
    }
    const ids = requireBulkIds(body?.ids);
    return await this.service.approveMany(ids, user.username);
  }

  @RequireCap('requests.review')
  @Patch(':id/cancel')
  async cancelRequest(
    @Param('id', RequestIdPipe) id: string,
    @Body() body: { reason?: string; employeeId?: string },
    @CurrentUser() user: UserSession
  ): Promise<unknown> {
    try {
      const employeeId = requireEmployeeId(body);
      const request = await this.service.cancelRequest(id, employeeId, body.reason, user.username);
      return { updated: true, request };
    } catch (err: any) {
      if (err instanceof AuditEntryError) throw err;
      if (err.message?.includes('not found')) {
        throw new NotFoundError(err.message, { code: 'REQUEST_NOT_FOUND' });
      }
      throw new BadRequestError(err.message, { code: 'BAD_REQUEST' });
    }
  }
}
