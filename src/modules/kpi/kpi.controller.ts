import { AUDIT, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from '../../core/tokens';
import { Controller, Get, Put, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const { AsyncList } = require('../../shared/async-list');

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth, USERNAME_RE, NOTE_MAX } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
// các lớp của src/domain dựng một lần
const { KpiScoring } = require('../../domain/kpi/kpi-scoring');
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class KpiController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(STORE) private readonly store: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  /* ---------- KPI 5 thành phần: Admin nhập điểm ---------- */
  @Get('kpi/scores')
  async getKpiScores(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, needAdmin } = c;
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const KpiScore = (await this.rules.rulesFor(month)).kpi;
    const kpiParams = await this.rules.monthParams(month),
      rows = new Map((await this.store.listKpiScores(month)).map(row => [row.username, row]));
    return {
      month,
      method: 'five',
      weights: Object.fromEntries(KpiScore.COMPONENTS.map(c => [c.key, c.weight])),
      items: await AsyncList.map(
        await AsyncList.filter(await this.store.listStaff(), staff => this.domain.kpi.has(staff, kpiParams)),
        staff => this.domain.kpi.scoreItem(staff, month, rows.get(staff.username) || null, kpiParams)
      )
    };
  }

  @Put('kpi/scores')
  async putKpiScores(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx, need, guardPeriod } = c;
    const actor = need();
    const body = await readJson(req);
    const { month, scores, amt, reason } = body;
    const user = body.user !== undefined ? body.user : body.username; // nhận cả user lẫn username
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Nhân sự không có kpi.score.write ở phạm vi all chỉ lưu được điểm `self` của chính mình (bỏ trống user = chính mình)
    const full = (await this.authz.scopeOf(me, 'kpi.score.write')) === 'all';
    const wanted = user === undefined && !full ? me.username : typeof user === 'string' ? user.toLowerCase() : '';
    if (!full) KpiScoring.selfScoreOnly(me, wanted, scores, amt);
    if (!USERNAME_RE.test(wanted)) throw new HttpError(400, 'user không hợp lệ');
    const target = await this.store.getStaff(wanted);
    if (!target) throw new HttpError(404, 'Không có nhân sự này');
    if (!(await this.domain.kpi.has(target, await this.rules.monthParams(month))))
      throw new HttpError(400, 'Nhân sự này không có KPI');
    // Người có quyền đầy đủ tự nhập điểm self của mình cũng là việc của chính chủ, không phải tự quyết định điểm của người khác
    const ownSelfEntry =
      target.username === me.username && amt === undefined && Object.keys(scores || {}).join() === 'self';
    if (!ownSelfEntry)
      selfDecision(this.authz.isSelfDecision(me, target.username), {
        doing: 'nhập điểm KPI'
      });
    await guardPeriod(month);
    const KpiScore = (await this.rules.rulesFor(month)).kpi;
    warnIf('KPI_MONTH_FUTURE', month > this.rules.vnToday().slice(0, 7), {
      message: `Tháng ${month} chưa bắt đầu: điểm KPI nhập trước được lưu và dùng khi tháng đó tính lương; nếu đánh giá đổi, cần nhập lại trước khi chốt.`
    });
    // Mọi giá trị được kiểm xong rồi mới ghi: một giá trị sai thì không lưu gì. Điểm sai bị từ chối, không kẹp.
    const patch: Record<string, any> = {};
    if (scores !== undefined) {
      if (!scores || typeof scores !== 'object' || Array.isArray(scores))
        throw new HttpError(400, 'scores phải là đối tượng { wework, user, peer, manager, self }');
      const keys = KpiScore.COMPONENTS.map(c => c.key);
      for (const [key, value] of Object.entries(scores)) {
        if (!keys.includes(key))
          throw new HttpError(400, `Không có thành phần KPI "${key.slice(0, 40)}" (chỉ nhận ${keys.join(', ')})`);
        if (value === undefined) continue;
        const checked = KpiScore.checkScore(value);
        if (!checked.ok) throw new HttpError(400, `Điểm ${key}: ${checked.error}`);
        patch[key] = checked.value === null ? null : KpiScore.toUnits(checked.value);
      }
    }
    if (amt !== undefined) {
      if (amt !== null && (typeof amt !== 'number' || !Number.isFinite(amt)))
        throw new HttpError(400, 'Lương KPI phải là số không âm');
      patch.amt = await this.domain.kpi.cleanAmount(amt, target, month); // không âm, không vượt trần level
    }
    if (reason != null && typeof reason !== 'string') throw new HttpError(400, 'Lý do phải là chữ');
    const note = (reason || '').trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Lý do tối đa ${NOTE_MAX} ký tự`);
    if (!Object.keys(patch).length) throw new HttpError(400, 'Không có điểm hoặc mức KPI nào để lưu');
    let result;
    try {
      result = await this.store.transaction(async () => {
        const saved = await this.store.setKpiScores(target.username, month, patch, actor.username, note || null);
        // Giá trị điểm nằm ở kpi_score_log (từng ô, cũ, mới); nhật ký hệ thống chỉ ghi ô nào đổi
        if (saved.changed.length)
          await this.audit.write(actx, {
            action: 'kpi.score',
            entityKind: 'kpi',
            entityId: `${target.username}:${month}`,
            subject: target.username,
            month,
            after: { changed: saved.changed },
            reason: note || null,
            sensitivity: 'pay'
          });
        return saved;
      });
    } catch (error) {
      throw KpiScoring.httpError(error);
    }
    if (result.changed.length) await this.events.emit.estimateChanged(target.username, month);
    // Nhân sự tự nhập điểm self chỉ nhận lại phần của mình, không nhận dòng điểm đầy đủ (điểm các thành phần khác chưa lộ)
    if (!full)
      return {
        ok: true,
        changed: result.changed,
        kpiParts: await this.domain.kpi.partsView(result.item, month, me)
      };
    return {
      ok: true,
      item: await this.domain.kpi.scoreItem(target, month, result.item),
      changed: result.changed
    };
  }
}
