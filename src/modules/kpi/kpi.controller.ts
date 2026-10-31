import { Controller, Get, Put, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const { AsyncList } = require('../../../lib/shared/async-list');
const store = require('../../../lib/db');
const { HttpError, send, readJson } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { rulesFor, monthParams, vnToday } = require('../../../lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validMonth, USERNAME_RE, NOTE_MAX } = require('../../../lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const {
  hasKpi,
  cleanKpiAmt,
  kpiScoreItem,
  kpiPartsView,
  kpiHttpError,
  selfScoreOnly
} = require('../../../lib/domain/kpi'); // KPI: trần, điểm, hiển thị
const authz = require('../../../lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const audit = require('../../../lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const events = require('../../../lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const warnings = require('../../../lib/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class KpiController {
  /* ---------- KPI 5 thành phần: Admin nhập điểm ---------- */
  @Get('kpi/scores')
  async getKpiScores(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { res, url, needAdmin } = c;
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const KpiScore = (await rulesFor(month)).kpi;
    const kpiParams = await monthParams(month),
      rows = new Map((await store.listKpiScores(month)).map(row => [row.username, row]));
    return send(res, 200, {
      month,
      method: 'five',
      weights: Object.fromEntries(KpiScore.COMPONENTS.map(c => [c.key, c.weight])),
      items: await AsyncList.map(
        await AsyncList.filter(await store.listStaff(), staff => hasKpi(staff, kpiParams)),
        staff => kpiScoreItem(staff, month, rows.get(staff.username) || null, kpiParams)
      )
    });
  }

  @Put('kpi/scores')
  async putKpiScores(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { req, res, me, actx, need, guardPeriod } = c;
    const actor = need();
    const body = await readJson(req);
    const { month, scores, amt, reason } = body;
    const user = body.user !== undefined ? body.user : body.username; // nhận cả user lẫn username
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Nhân sự không có kpi.score.write ở phạm vi all chỉ lưu được điểm `self` của chính mình (bỏ trống user = chính mình)
    const full = (await authz.scopeOf(me, 'kpi.score.write')) === 'all';
    const wanted = user === undefined && !full ? me.username : typeof user === 'string' ? user.toLowerCase() : '';
    if (!full) selfScoreOnly(me, wanted, scores, amt);
    if (!USERNAME_RE.test(wanted)) throw new HttpError(400, 'user không hợp lệ');
    const target = await store.getStaff(wanted);
    if (!target) throw new HttpError(404, 'Không có nhân sự này');
    if (!(await hasKpi(target, await monthParams(month)))) throw new HttpError(400, 'Nhân sự này không có KPI');
    // Người có quyền đầy đủ tự nhập điểm self của mình cũng là việc của chính chủ, không phải tự quyết định điểm của người khác
    const ownSelfEntry =
      target.username === me.username && amt === undefined && Object.keys(scores || {}).join() === 'self';
    if (!ownSelfEntry)
      selfDecision(authz.isSelfDecision(me, target.username), {
        doing: 'nhập điểm KPI'
      });
    await guardPeriod(month);
    const KpiScore = (await rulesFor(month)).kpi;
    warnIf('KPI_MONTH_FUTURE', month > vnToday().slice(0, 7), {
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
      patch.amt = await cleanKpiAmt(amt, target, month); // không âm, không vượt trần level
    }
    if (reason != null && typeof reason !== 'string') throw new HttpError(400, 'Lý do phải là chữ');
    const note = (reason || '').trim();
    if (note.length > NOTE_MAX) throw new HttpError(400, `Lý do tối đa ${NOTE_MAX} ký tự`);
    if (!Object.keys(patch).length) throw new HttpError(400, 'Không có điểm hoặc mức KPI nào để lưu');
    let result;
    try {
      result = await store.transaction(async () => {
        const saved = await store.setKpiScores(target.username, month, patch, actor.username, note || null);
        // Giá trị điểm nằm ở kpi_score_log (từng ô, cũ, mới); nhật ký hệ thống chỉ ghi ô nào đổi
        if (saved.changed.length)
          await audit.write(actx, {
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
      throw kpiHttpError(error);
    }
    if (result.changed.length) await events.emit.estimateChanged(target.username, month);
    // Nhân sự tự nhập điểm self chỉ nhận lại phần của mình, không nhận dòng điểm đầy đủ (điểm các thành phần khác chưa lộ)
    if (!full)
      return send(res, 200, {
        ok: true,
        changed: result.changed,
        kpiParts: await kpiPartsView(result.item, month, me)
      });
    return send(res, 200, {
      ok: true,
      item: await kpiScoreItem(target, month, result.item),
      changed: result.changed
    });
  }
}
