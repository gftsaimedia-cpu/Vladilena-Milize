import { AUTHZ, DOMAIN, STORE } from '../../core/tokens';
import { ExplanationsHandlers } from './explanations.handlers';
import { Controller, Get, Post, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const { AsyncList } = require('../../shared/async-list');

const { HttpError, readJson } = require('../../platform/http');
const { USERNAME_RE } = require('../../domain/input');

/**
 * Giải trình Check-out muộn, ngày vắng và yêu cầu giải trình của Admin (nghiệp vụ ở src/domain/explanation/explanation-service.ts).
 * Chưa duyệt / không duyệt thì ngày đó không tính lương. expectedRev lệch → 409 EXPLANATION_STALE.
 */
@Controller('api')
export class ExplanationsController {
  constructor(
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(STORE) private readonly store: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(ExplanationsHandlers) private readonly explanationsHandlers: ExplanationsHandlers
  ) {}

  /** [?status=][&user=] nhân sự: của mình; người có attendance.correct (Admin): mọi người (user= lọc một người) */
  @Get('explanations')
  async list(@Ctx() c: ApiContext): Promise<unknown> {
    const { url, me, res } = c;
    const explanations = this.domain.explanations;
    const status = url.searchParams.get('status') || undefined;
    const asked = (url.searchParams.get('user') || '').toLowerCase();
    if (asked && !USERNAME_RE.test(asked)) throw new HttpError(400, 'user không hợp lệ');
    const admin = await this.explanationsHandlers.isAdmin(me);
    const username = admin ? asked || undefined : me.username;
    return {
      items: await AsyncList.map(await explanations.list({ username, status }), this.explanationsHandlers.withName),
      waitingForYou: await explanations.countOpen(me.username), // yêu cầu đang chờ chính người xem trả lời
      toRead: admin ? await explanations.countOpen() : 0 // đã trả lời, Admin chưa đọc
    };
  }

  /**
   * Ba dạng thân: { sessionId, text } nhân sự giải trình Check-out muộn của CHÍNH MÌNH; { date, text } nhân sự tự giải trình ngày vắng
   * (chờ Admin duyệt một công theo giờ ca hoặc từ chối); { username, date, prompt, source?, ruleId? } Admin yêu cầu một người giải trình.
   */
  @Post('explanations')
  async submit(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx } = c;
    const explanations = this.domain.explanations;
    const body = await readJson(req);
    if (body && body.username && String(body.username).toLowerCase() !== me.username) {
      if (!(await this.explanationsHandlers.isAdmin(me)))
        throw new HttpError(403, 'Chỉ Admin được yêu cầu người khác giải trình', { code: 'FORBIDDEN_CAP' });
      const row = await this.store.transaction(async () => {
        const made = await explanations.request({
          username: String(body.username).toLowerCase(),
          date: body.date,
          prompt: body.prompt,
          kind: body.source === 'ai' ? 'ai' : 'admin',
          requestedBy: body.source === 'ai' ? `ai (${me.username})` : me.username,
          ruleId: body.ruleId
        });
        await this.explanationsHandlers.auditRow(actx, 'explanation.request', null, made, made.prompt);
        return made;
      });
      await this.explanationsHandlers.changed(row);
      return { item: await this.explanationsHandlers.withName(row) };
    }
    if (body && body.sessionId === undefined && body.date !== undefined) {
      const row = await this.store.transaction(async () => {
        const made = await explanations.submitAbsentDay({
          username: me.username,
          date: body.date,
          text: body.text,
          stateOf: async (username: string, date: string) =>
            await this.explanationsHandlers.absentDay.stateOf(username, date)
        });
        await this.explanationsHandlers.auditRow(actx, 'explanation.self', null, made, null);
        return made;
      });
      await this.explanationsHandlers.changed(row);
      return { item: await this.explanationsHandlers.withName(row) };
    }
    const session = await this.store.getSession(Number(body && body.sessionId));
    const row = await this.store.transaction(async () => {
      if (session && session.state === 'closed' &&
          ((session.entry.forgotIn || (!session.entry.presIn && session.entry.presOut)) ||
           (session.entry.presIn && !session.entry.presOut && session.entry.reason === 'forgot-out'))) {
        const prior = await this.domain.explanationRepository.forSessions([session.id]);
        const made = await explanations.submitMissingPunch({ username: me.username, session, text: body && body.text });
        await this.explanationsHandlers.auditRow(actx, 'explanation.punch', prior[0] || null, made, null);
        return made;
      }
      const before = session ? await this.domain.explanationRepository.lateFor(session.id) : null;
      const made = await explanations.submitLate({ username: me.username, session, text: body && body.text });
      await this.explanationsHandlers.auditRow(actx, 'explanation.late-checkout', before && before.view(), made, null);
      return made;
    });
    await this.explanationsHandlers.changed(row);
    return { item: await this.explanationsHandlers.withName(row) };
  }

  /** { text } nhân sự trả lời yêu cầu của mình */
  @Post('explanations/:id/answer')
  async answer(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.move(c, 'answer');
  }

  /**
   * { approve, note?, expectedRev? } Admin duyệt hoặc không duyệt. Giải trình Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt;
   * giải trình ngày: duyệt ngày quên Check-in/out thì ghi công theo giờ ca, từ chối thì bỏ công đó.
   */
  @Post('explanations/:id/decide')
  async decide(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.move(c, 'decide');
  }

  private async move({ req, res, seg, me, actx }: ApiContext, step: 'answer' | 'decide'): Promise<unknown> {
    const explanations = this.domain.explanations;
    if (!/^\d+$/.test(seg[2])) throw new HttpError(404, 'Không có đường dẫn này');
    const id = Number(seg[2]);
    const body = await readJson(req);
    const row = await this.store.transaction(async () => {
      const before = await explanations.byId(id);
      const done =
        step === 'answer'
          ? await explanations.answer({ id, username: me.username, text: body && body.text })
          : await explanations.decide({
              id,
              by: me.username,
              approve: !!(body && body.approve),
              note: body && body.note,
              expectedRev: body && body.expectedRev,
              isSelf: !!before && this.authz.isSelfDecision(me, before.username)
            });
      await this.explanationsHandlers.auditRow(actx, `explanation.${step}`, before, done, null);
      // Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt, không duyệt thì lượt giữ "Quên Check-out" (cùng giao dịch)
      if (step === 'decide') await this.domain.lateCheckout.sync(done, actx);
      // Giải trình ngày: duyệt ngày quên chấm thì ghi công theo giờ ca, không duyệt thì bỏ công đã ghi theo giải trình này (cùng giao dịch)
      const day = step === 'decide' ? await this.domain.adminPresence.syncExplanation({ view: done, actx }) : null;
      return { done, recorded: !!(day && day.set.length) };
    });
    await this.explanationsHandlers.changed(row.done);
    return { item: await this.explanationsHandlers.withName(row.done), recorded: row.recorded };
  }
}
