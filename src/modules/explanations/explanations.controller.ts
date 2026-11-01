import { Controller, Get, Post } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { isAdmin, auditRow, withName, changed, absentDay } from './explanations.handlers';
const { AsyncList } = require('../../../lib/shared/async-list');
const store = require('../../../lib/db');
const authz = require('../../../lib/authz');
const { HttpError, readJson } = require('../../../lib/http');
const { USERNAME_RE } = require('../../../lib/domain/input');
const { container } = require('../../../lib/domain/container');

/**
 * Giải trình Check-out muộn, ngày vắng và yêu cầu giải trình của Admin (nghiệp vụ ở lib/domain/explanation/explanation-service.ts).
 * Chưa duyệt / không duyệt thì ngày đó không tính lương. expectedRev lệch → 409 EXPLANATION_STALE.
 */
@Controller('api')
export class ExplanationsController {
  /** [?status=][&user=] nhân sự: của mình; người có attendance.correct (Admin): mọi người (user= lọc một người) */
  @Get('explanations')
  async list(@Ctx() c: ApiContext): Promise<unknown> {
    const { url, me, res } = c;
    const explanations = container.explanations;
    const status = url.searchParams.get('status') || undefined;
    const asked = (url.searchParams.get('user') || '').toLowerCase();
    if (asked && !USERNAME_RE.test(asked)) throw new HttpError(400, 'user không hợp lệ');
    const admin = await isAdmin(me);
    const username = admin ? asked || undefined : me.username;
    return {
      items: await AsyncList.map(await explanations.list({ username, status }), withName),
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
    const explanations = container.explanations;
    const body = await readJson(req);
    if (body && body.username && String(body.username).toLowerCase() !== me.username) {
      if (!(await isAdmin(me)))
        throw new HttpError(403, 'Chỉ Admin được yêu cầu người khác giải trình', { code: 'FORBIDDEN_CAP' });
      const row = await store.transaction(async () => {
        const made = await explanations.request({
          username: String(body.username).toLowerCase(),
          date: body.date,
          prompt: body.prompt,
          kind: body.source === 'ai' ? 'ai' : 'admin',
          requestedBy: body.source === 'ai' ? `ai (${me.username})` : me.username,
          ruleId: body.ruleId
        });
        await auditRow(actx, 'explanation.request', null, made, made.prompt);
        return made;
      });
      await changed(row);
      return { item: await withName(row) };
    }
    if (body && body.sessionId === undefined && body.date !== undefined) {
      const row = await store.transaction(async () => {
        const made = await explanations.submitAbsentDay({
          username: me.username,
          date: body.date,
          text: body.text,
          stateOf: async (username: string, date: string) => await absentDay.stateOf(username, date)
        });
        await auditRow(actx, 'explanation.self', null, made, null);
        return made;
      });
      await changed(row);
      return { item: await withName(row) };
    }
    const session = await store.getSession(Number(body && body.sessionId));
    const row = await store.transaction(async () => {
      const before = session ? await container.explanationRepository.lateFor(session.id) : null;
      const made = await explanations.submitLate({ username: me.username, session, text: body && body.text });
      await auditRow(actx, 'explanation.late-checkout', before && before.view(), made, null);
      return made;
    });
    await changed(row);
    return { item: await withName(row) };
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
    const explanations = container.explanations;
    if (!/^\d+$/.test(seg[2])) throw new HttpError(404, 'Không có đường dẫn này');
    const id = Number(seg[2]);
    const body = await readJson(req);
    const row = await store.transaction(async () => {
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
              isSelf: !!before && authz.isSelfDecision(me, before.username)
            });
      await auditRow(actx, `explanation.${step}`, before, done, null);
      // Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt, không duyệt thì lượt giữ "Quên Check-out" (cùng giao dịch)
      if (step === 'decide') await container.lateCheckout.sync(done, actx);
      // Giải trình ngày: duyệt ngày quên chấm thì ghi công theo giờ ca, không duyệt thì bỏ công đã ghi theo giải trình này (cùng giao dịch)
      const day = step === 'decide' ? await container.adminPresence.syncExplanation({ view: done, actx }) : null;
      return { done, recorded: !!(day && day.set.length) };
    });
    await changed(row.done);
    return { item: await withName(row.done), recorded: row.recorded };
  }
}
