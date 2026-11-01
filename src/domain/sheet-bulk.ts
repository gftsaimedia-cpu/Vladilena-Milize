'use strict';
const { AsyncList } = require('../shared/async-list');
// Admin chấm công thay hàng loạt (PUT /api/sheet/bulk): gán MỘT ca cho nhiều ngày của nhiều người trong một tháng.
// Mỗi người đi đúng đường của PUT /api/sheet kèm user: lịch ước tính đang lưu của người đó cộng các ngày mới (ngày đã khai khác đi làm
// giữ nguyên), rồi checkSheet, checkSheetLimits, setSheet, reconcile, approveOnBehalf. Cả lô nằm trong MỘT giao dịch: một lỗi cứng của
// bất kỳ người nào thì không ai được lưu. Cảnh báo của từng người mở đầu bằng họ tên và mang details.username.
const store = require('../platform/db');
const { HttpError } = require('../platform/http');
const authz = require('../platform/authz');
const audit = require('../platform/audit');
const events = require('../platform/events');
const warnings = require('../platform/warnings');
const { rulesFor, vnToday } = require('../platform/request-rules');
const { validMonth, validDate, USERNAME_RE } = require('./input');
const { estimateSheet } = require('./sheet');
const { timesheet } = require('./timesheet/services');
const { DayMath } = require('./timesheet/day-math');
const { checkSheetLimits } = require('./overtime/hour-limits').HourLimits;
const { approveOnBehalf } = require('./sheet-on-behalf');
const { AdminPresence } = require('./attendance/admin-presence');

const MAX_DAYS = 31; // số ngày tối đa của một tháng: giới hạn đầu vào
const DAY_KEYS = ['kind', 'preset']; // một ngày gửi lên chỉ gồm loại ngày và mã ca, giờ vào – ra lấy từ ca
const isObject = (value?) => !!value && typeof value === 'object' && !Array.isArray(value);
const bad = (message?, code?) => new HttpError(400, message, { code });

// Kiểm đầu vào và đổi mỗi ngày thành ngày đi làm theo giờ của ca: { month, usernames, shiftDays: [[ngày, ngày đi làm]], confirmDays, expectedRevs }
async function parse(body?) {
  if (!isObject(body)) throw new HttpError(400, 'Thân yêu cầu phải là object');
  const { month, usernames: rawNames, days: rawDays, confirmDays, expectedRevs } = body;
  if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
  if (!Array.isArray(rawNames) || !rawNames.length)
    throw bad('Chọn ít nhất một người để chấm công thay', 'USERNAMES_REQUIRED');
  const bulkMax = (await rulesFor()).params['system.staff.bulkMax'];
  if (rawNames.length > bulkMax) throw bad(`Mỗi lần chấm công thay tối đa ${bulkMax} người`, 'TOO_MANY');
  const usernames = rawNames.map(u => (typeof u === 'string' ? u.toLowerCase() : u));
  if (usernames.some(u => typeof u !== 'string' || !USERNAME_RE.test(u)))
    throw new HttpError(400, 'Danh sách tên đăng nhập không hợp lệ');
  if (new Set<any>(usernames).size !== usernames.length) throw new HttpError(400, 'Danh sách có tên đăng nhập bị lặp');

  const dates = isObject(rawDays) ? Object.keys(rawDays).sort() : [];
  if (!dates.length || dates.length > MAX_DAYS)
    throw bad(`days phải có từ 1 đến ${MAX_DAYS} ngày, mỗi ngày dạng { kind: "work", preset }`, 'BULK_DAY_INVALID');
  const punch = (await rulesFor(month)).punch;
  const today = vnToday();
  const shiftDays = dates.map(date => {
    if (!validDate(date) || !date.startsWith(`${month}-`))
      throw bad(`Ngày ${date.slice(0, 20)} không thuộc tháng ${month}`, 'BULK_DAY_INVALID');
    const day = rawDays[date];
    const plain = isObject(day) && day.kind === 'work' && typeof day.preset === 'string';
    if (!plain || Object.keys(day).some(key => !DAY_KEYS.includes(key)))
      throw bad(
        `Ngày ${DayMath.dm(date)}: chỉ nhận { kind: "work", preset } (mã ca), không nhận giờ tự nhập`,
        'BULK_DAY_INVALID'
      );
    if (!Object.hasOwn(punch.SHIFT, day.preset)) throw bad('Ca cố định không hợp lệ', 'SHIFT_UNKNOWN');
    if (date > today) throw bad(`Ngày ${DayMath.dm(date)} chưa tới: chỉ chấm công thay đến hôm nay`, 'BULK_DAY_FUTURE');
    const canonical = punch.canonicalOf(day.preset);
    const preset = Object.hasOwn(punch.SHIFT, canonical) ? canonical : day.preset;
    const [from, to] = punch.SHIFT[preset];
    return [date, { kind: 'work', in: from, out: to, preset }];
  });

  if (expectedRevs !== undefined && !isObject(expectedRevs))
    throw new HttpError(400, 'expectedRevs phải là object { tên đăng nhập: rev }');
  const revs: Record<string, any> = {};
  for (const [name, rev] of Object.entries<any>(expectedRevs || {})) {
    if (!usernames.includes(name.toLowerCase()) || !Number.isInteger(rev) || rev < 0)
      throw new HttpError(400, 'expectedRevs phải là số nguyên không âm theo tên đăng nhập có trong danh sách');
    revs[name.toLowerCase()] = rev;
  }
  const confirmed =
    confirmDays === undefined || confirmDays === null ? dates : AdminPresence.confirmed(confirmDays, month);
  return { month, usernames, shiftDays, confirmDays: confirmed, expectedRevs: revs };
}

// Hồ sơ những người được chấm: mỗi người cần request.decide.* ở phạm vi người đó (403 trước cả khi tìm người), có tài khoản và thuộc bảng lương
async function owners(caller?, usernames?) {
  for (const username of usernames)
    if (!(await authz.can(caller, authz.DECIDE_ALL, { username })))
      throw new HttpError(403, 'Bạn không có quyền chấm công thay người khác', {
        code: 'FORBIDDEN_CAP',
        cap: authz.DECIDE_ALL,
        username
      });
  const found = await AsyncList.map(usernames, async username => await store.getStaff(username));
  const missing = usernames.filter((username, i) => !found[i]);
  if (missing.length)
    throw new HttpError(404, `Không có tài khoản: ${missing.join(', ')}`, { code: 'STAFF_NOT_FOUND', missing });
  const outside = found.filter(owner => !owner.payrollSubject).map(owner => owner.username);
  if (outside.length)
    throw new HttpError(400, `Không thuộc bảng lương nên không có lịch để chấm: ${outside.join(', ')}`, {
      code: 'NOT_PAYROLL_SUBJECT',
      usernames: outside
    });
  return found;
}

// Bước kiểm đầu vào của route: trả kế hoạch { month, owners, shiftDays, confirmDays, expectedRevs }
async function plan(caller?, body?) {
  const input = await parse(body);
  return { ...input, owners: await owners(caller, input.usernames) };
}

// Lịch mới của một người: lịch ước tính đang lưu cộng các ngày được chấm. Ngày đã khai đi làm chỉ đổi giờ vào, giờ ra và mã ca (phần làm thêm,
// giờ ra khỏi văn phòng và giải trình đã khai giữ nguyên); ngày chưa khai thành ngày đi làm theo ca. Ngày đang khai nghỉ (khác đi làm)
// không bị ghi đè và được trả ở skipped
function mergeDays(prevDays?, shiftDays?) {
  const days = { ...prevDays };
  const skipped: any[] = [];
  for (const [date, shiftDay] of shiftDays) {
    const old = prevDays[date];
    if (old && old.kind !== 'work') skipped.push({ date, kind: old.kind });
    else days[date] = old ? { ...old, in: shiftDay.in, out: shiftDay.out, preset: shiftDay.preset } : shiftDay;
  }
  return { days, skipped };
}

// Lưu lịch của một người; gọi TRONG giao dịch của cả lô. Trả phần kết quả của người đó và các dòng duyệt ngay.
async function saveOne({ caller, actx, month, owner, shiftDays, confirmDays, expectedRev, cleanDays }: any) {
  await timesheet().revision.assert(owner.username, month, expectedRev);
  const prevDays = (await estimateSheet(owner.username, month)).days;
  const merged = mergeDays(prevDays, shiftDays);
  const clean = await cleanDays(merged.days);
  const { sheetParams, sched, holidays } = await timesheet().validator.validate({
    u: owner,
    month,
    clean,
    prevDays,
    onBehalf: true
  });
  await checkSheetLimits({ params: sheetParams, month, clean, prevDays, holidays });
  warnings.selfDecision(authz.isSelfDecision(caller, owner.username), { doing: 'chấm công thay' });
  const kept = await store.getSheet(owner.username, month);
  await store.setSheet(owner.username, month, clean, kept.kpiPct, kept.kpiAmt);
  const found = await store.approvals.reconcile(
    owner.username,
    month,
    store.approvals.declaredItems(clean, { holidays: [...holidays], staffType: owner.type, schedule: sched })
  );
  const skippedDates = new Set<any>(merged.skipped.map(item => item.date));
  const { decided, presence } = await approveOnBehalf({
    caller,
    owner,
    month,
    found,
    prevDays,
    clean,
    actx,
    confirmDays: confirmDays.filter(date => !skippedDates.has(date))
  });
  const result = {
    username: owner.username,
    rev: (await store.getSheet(owner.username, month)).rev,
    autoApproved: decided.length,
    reset: found.reset,
    resubmitted: found.resubmitted,
    removed: found.removed,
    presence,
    skipped: merged.skipped
  };
  const changed = [found.added, found.reset, found.resubmitted, found.removed].some(list => list.length > 0);
  return { result, decided, changed };
}

// Lưu cả lô theo kế hoạch của plan(); trả thân phản hồi 200 { ok, month, results }
async function save({ caller, actx, plan: input, cleanDays }: any) {
  const { month, owners: people, shiftDays, confirmDays, expectedRevs } = input;
  const saved = await store.transaction(async () => {
    const out = await AsyncList.map(people, async owner => {
      const label = owner.name || owner.username;
      try {
        const expectedRev = expectedRevs[owner.username];
        return await warnings.scope(
          { label, details: { username: owner.username } },
          async () => await saveOne({ caller, actx, month, owner, shiftDays, confirmDays, expectedRev, cleanDays })
        );
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        throw new HttpError(error.status, `${label}: ${error.message}`, { ...error.details, username: owner.username });
      }
    });
    await audit.write(actx, {
      action: 'sheet.onBehalfBulk',
      entityKind: 'timesheet',
      entityId: month,
      month,
      after: {
        people: people.length,
        days: shiftDays.length,
        shifts: [...new Set<any>(shiftDays.map(([, day]: any) => day.preset))]
      }
    });
    return out;
  });
  if (saved.some(item => item.changed)) await events.emit.approvalsChanged(month);
  for (const owner of people) events.emit.estimateChanged(owner.username, month); // máy của người được chấm nạp lại lịch
  const decided = saved.flatMap(item => item.decided);
  if (decided.length) events.emit.requestsDecided(decided);
  return { ok: true, month, results: saved.map(item => item.result) };
}

export = { plan, save, MAX_DAYS };
