/* Màn Chấm công & phép.
   Tab: Bảng công (GET /api/attendance; lịch làm việc và yêu cầu nghỉ chờ xử lý từ GET /api/team), Ca làm (từ hồ sơ),
   Phép còn lại (leave của hồ sơ), Hôm nay (GET /api/today), Giờ OT (GET/PUT /api/ot).
   Hộp một ngày có hai phần: "Lịch đã khai" (khai lịch thay ngay tại ô, cham-cong-khai.js → A.CcKhai, có nút lưu) và "Check-in/out"
   (chỉ xem: lượt, giờ bấm gốc và lịch sử điều chỉnh cũ). Giờ Check-in/out không sửa được (cả Admin và nhân viên),
   nên hộp không có ô sửa giờ; lịch sử sửa giờ đã có vẫn hiện để đối chiếu.
   Phần Check-in/out đứng đầu, phần khai lịch ở sau.
   Ô có lượt Check-in/out hiện nhãn trạng thái do máy chủ tính cho từng lượt (session.status; AttendanceStatus đổi ra chữ và chọn nhãn
   của ngày), lý do ngắn (session.statusNote) là chữ nhỏ; ngày chưa có lượt Check-in thì hiện loại ngày đã khai. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const AS = window.AttendanceStatus;
  const PAGE = 'cc';
  const PAGE_SIZE = 20; // số dòng mỗi trang của các bảng tính ở trình duyệt
  const UNASSIGNED_SHOWN = 20; // số người "Chưa có ca" nêu tên
  const C = {
    att: { loading: false, error: null, rows: [], month: null },
    today: { loading: false, error: null, data: null, at: null },
    ot: { loading: false, error: null, items: [] },
    otPending: null
  };
  const tab = () => S.sub.cc || 'bang';
  const onView = () => S.view === 'cham-cong' && A.render();
  const MS_MIN = 60000; // số mili giây của một phút (đơn vị)
  /* Số phút ra sớm để hiển thị: giờ kết thúc ca trừ giờ ra thực tế (theo đồng hồ, chưa trừ giờ nghỉ), làm tròn lên phút như lý do
     "Về sớm N phút" của máy chủ. Chỉ là chú thích, không dùng để tính */
  const earlyMinutes = e => {
    const end = e && e.plannedShift ? Date.parse(e.plannedShift.endIso) : NaN,
      out = e && e.presOut ? Date.parse(e.presOut) : NaN;
    return Number.isFinite(end) && Number.isFinite(out) && end > out ? Math.ceil((end - out) / MS_MIN) : 0;
  };
  /* Phút vào muộn (cùng cách làm tròn với tính lương: ActualHours.lateMinutes) và phút ra sớm của một lượt đã đóng */
  const offMinutes = s => {
    const e = s.entry || {};
    return {
      late: e.plannedShift && e.presIn ? lateOf(e.plannedShift, e.presIn) : 0,
      early: e.presOut ? earlyMinutes(e) : 0
    };
  };
  const LEAVE_ITEMS = new Set(['leave', 'approved', 'isat']); // khoản của lịch là một ngày xin nghỉ (A.ITEM_LABEL)
  const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayLong = d => `${WD_LONG[A.dowOf(d)]} ${A.fmtDate(d)}`;
  /* Chuỗi để ô "Tìm nhân sự" khớp: tên, tài khoản, tên chức vụ (Nhân viên), nhãn ngắn (NV) và tên bậc nếu có */
  const searchText = u =>
    [u.name, u.username, A.typeLong(u), A.typeShort(u), u.level ? A.levelLabel(u, S.month) : '']
      .filter(x => x && x !== '—')
      .join(' ');
  const byName = list => list.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  const lateOf = (plannedShift, presIn) => window.ActualHours.lateMinutes(plannedShift, presIn);
  const typeOf = username => {
    const s = A.staff.byUser.get(username);
    return s ? esc(A.typeShort(s)) : esc(username);
  };

  /* ---------- tải ---------- */
  async function loadAtt(withTeam) {
    const month = S.month;
    C.att.loading = true;
    C.att.error = null;
    try {
      const [res, team] = await Promise.all([
        A.api('GET', '/attendance' + A.qs({ month })),
        // lịch làm việc theo chức vụ và theo người, yêu cầu nghỉ chờ xử lý (chưa có thì dùng cách cũ)
        withTeam ? A.api('GET', '/team' + A.qs({ month })).catch(() => null) : null,
        A.staff.promise
      ]);
      if (month !== S.month) return;
      if (withTeam) indexSchedules(team);
      C.att.rows = res.rows;
      C.att.month = month;
      index();
    } catch (e) {
      if (month === S.month) C.att.error = A.errText(e);
    } finally {
      C.att.loading = false;
    }
  }
  async function loadToday(quiet) {
    if (!quiet) {
      C.today.loading = true;
      C.today.error = null;
    }
    try {
      C.today.data = await A.api('GET', '/today');
      C.today.at = A.nowMs();
    } catch (e) {
      if (!quiet) C.today.error = A.errText(e);
    } finally {
      if (!quiet) C.today.loading = false;
    }
  }
  async function loadOt() {
    C.ot.loading = true;
    C.ot.error = null;
    const st = S.f.otStatus || 'pending';
    try {
      const [list, pend] = await Promise.all([
        A.api('GET', '/ot' + A.qs({ status: st })),
        st === 'pending' ? null : A.api('GET', '/ot' + A.qs({ status: 'pending' })).catch(() => null) // số trên chip "Chờ xử lý"
      ]);
      C.ot.items = list.ot;
      const p = st === 'pending' ? list : pend;
      if (p) C.otPending = p.ot.length;
    } catch (e) {
      C.ot.error = A.errText(e);
    } finally {
      C.ot.loading = false;
    }
  }
  /* Nạp do tin realtime (attendance.changed, boot.js gọi view.live()): lượt bấm không đổi lịch làm việc hay yêu cầu nghỉ,
     nên Bảng công không gọi lại GET /api/team (nặng như /api/attendance) nếu đã có lịch của đúng tháng */
  let liveOnly = false;
  async function load() {
    const live = liveOnly;
    liveOnly = false;
    A.Ky.load(false).then(onView);
    const t = tab();
    A.loadStaff();
    if (t === 'bang') await loadAtt(!live || SERVER_SCHED.month !== S.month);
    else {
      loadAtt(false).then(onView); // số ở dòng dưới tiêu đề (ngày chờ xử lý, bị từ chối) cần lượt của tháng
      if (t === 'hom-nay') await loadToday(false);
      else if (t === 'ot') await loadOt();
    }
    if (t !== 'hom-nay') loadToday(true).then(onView); // số "đang trong ca" trên tab Hôm nay
  }

  /* ---------- chỉ mục lượt theo người và ngày ---------- */
  let byUser = new Map();
  let byId = new Map(); // lượt theo mã, để tab Hôm nay lấy nhãn của lượt khi dòng của GET /api/today không kèm nhãn
  function index() {
    byUser = new Map();
    byId = new Map(C.att.rows.map(s => [s.id, s]));
    for (const s of C.att.rows) {
      if (!byUser.has(s.username)) byUser.set(s.username, new Map());
      const days = byUser.get(s.username);
      if (!days.has(s.date)) days.set(s.date, []);
      days.get(s.date).push(s);
    }
  }
  /* Lịch làm việc do máy chủ gửi (GET /api/team): lịch theo loại nhân sự (schedules).
     Có thì "ngày làm" là ngày nằm trong scheduledDates; thiếu thì coi mọi ngày là ngày làm (không đoán).
     Kèm các ngày xin nghỉ đang chờ xử lý (approvals của hàng: khoản nghỉ có trạng thái pending) và lịch đã khai cùng dòng duyệt của từng
     người (days, approvals) để biết ngày lễ có lượt Check-in có được tính OT ngày lễ không. */
  const SERVER_SCHED = { byType: new Map(), leave: new Map(), sheet: new Map(), month: '' };
  function indexSchedules(team) {
    SERVER_SCHED.byType = new Map();
    SERVER_SCHED.leave = new Map();
    SERVER_SCHED.sheet = new Map();
    SERVER_SCHED.month = (team && team.month) || '';
    if (A.CcKhai) A.CcKhai.index(team); // lịch đã khai của từng người: ký hiệu ô ngày chưa có lượt Check-in
    if (!team) return;
    for (const [type, sc] of Object.entries(team.schedules || {}))
      if (sc && Array.isArray(sc.scheduledDates)) SERVER_SCHED.byType.set(type, new Set(sc.scheduledDates));
    for (const row of team.rows || []) {
      const username = row && (row.username || (row.staff && row.staff.username));
      if (!username) continue;
      const lv = new Map();
      for (const [date, a] of Object.entries(row.approvals || {}))
        if (a && a.status === 'pending' && LEAVE_ITEMS.has(a.item)) lv.set(date, a.item);
      if (lv.size) SERVER_SCHED.leave.set(username, lv);
      SERVER_SCHED.sheet.set(username, { days: row.days || {}, approvals: row.approvals || {} });
    }
  }
  const sameMonth = date => date.slice(0, 7) === SERVER_SCHED.month;
  const isWorkday = (staff, date) => {
    const set = SERVER_SCHED.byType.get(staff.type);
    if (set && sameMonth(date)) return set.has(date);
    return true; // chưa có lịch từ máy chủ (GET /api/team): không đoán, coi là ngày làm
  };
  /* Cột xám: không chức vụ nào có lịch làm ngày đó (theo lịch máy chủ); chưa có lịch thì chỉ Chủ nhật */
  const offCol = date =>
    SERVER_SCHED.byType.size && sameMonth(date)
      ? ![...SERVER_SCHED.byType.values()].some(set => set.has(date))
      : A.dowOf(date) === 0;
  /* Ngày lễ có lượt Check-in: bảng lương chỉ trả giờ làm ngày lễ khi ngày lễ nằm trong lịch làm, đã khai "Đi làm" có giờ vào, ra và khoản
     OT ngày lễ đã được duyệt (approvals của máy chủ đã là trạng thái hiệu lực; ngày khai không cần duyệt thì tính theo lịch đã khai).
     Còn lại bảng lương chỉ trả lương nghỉ lễ: 'pending' / 'rejected' theo dòng duyệt, 'none' khi chưa khai OT ngày lễ hoặc ngày lễ ngoài lịch. */
  function holidayWorkOf(staff, date) {
    const sheet = sameMonth(date) && SERVER_SCHED.sheet.get(staff.username);
    const day = sheet && sheet.days[date];
    if (!day || !isWorkday(staff, date) || (day.kind || 'work') !== 'work' || !day.in || !day.out) return 'none';
    const a = sheet.approvals[date];
    return a && a.holiday ? a.status || 'pending' : 'approved';
  }
  // Khoản OT ngày lễ của ngày lễ có lượt Check-in: dữ liệu trong hộp ngày, không phải nhãn trạng thái của lượt
  const HOLIDAY_TEXT = {
    approved: 'được phê duyệt',
    pending: 'chờ xử lý',
    rejected: 'bị từ chối',
    none: 'chưa khai OT ngày lễ hoặc ngày lễ ngoài lịch làm'
  };
  const leaveOf = (username, date) => {
    const m = sameMonth(date) && SERVER_SCHED.leave.get(username);
    return (m && m.get(date)) || null;
  };

  /* ---------- một ô trong bảng ---------- */
  // Ngày có lượt: nhãn của ngày (AttendanceStatus.dayStatus) kèm lý do ngắn của các lượt; ngày chưa có lượt: xin nghỉ chờ xử lý hoặc trống
  function cellOf(sessions, leaveItem) {
    if (!sessions || !sessions.length)
      return leaveItem ? { code: 'P', text: `Xin nghỉ (${A.itemLabel(leaveItem)}), chờ xử lý` } : { code: '' };
    const code = AS.dayStatus(sessions);
    const notes = AS.dayNotes(sessions);
    return { code, text: AS.LABEL[code] + (notes.length ? `: ${notes.join('; ')}` : '') };
  }
  const MARK = {
    'checked-in': () => '<span class="cc-m in"></span>',
    'checked-out': () => '<span class="cc-m cc-ok"></span>',
    pending: () => '<span class="cc-m w"></span>',
    approved: () => '<span class="cc-m st-ap"></span>',
    rejected: () => '<span class="cc-m q">×</span>',
    admin: () => '<span class="cc-m st-ad"></span>',
    P: () => '<span class="cc-m lv">P</span>',
    K: c => c.html // loại ngày đã khai (A.CcKhai.mark dựng sẵn)
  };
  const LEGEND_ORDER = ['checked-in', 'checked-out', 'pending', 'approved', 'rejected', 'admin'];
  // Lớp màu của A.pill theo màu chung của AttendanceStatus
  const PILL_TONE = { on: 'line', done: 'done', pending: 'pending', rejected: 'rejected' };
  const statusPill = code => A.pill(PILL_TONE[AS.TONE[code]] || 'draft', AS.LABEL[code] || '');
  /* Số ở dòng dưới tiêu đề, trên CẢ THÁNG và mọi trang (không chỉ trang đang xem): số ngày có nhãn Chờ xử lý, Bị từ chối.
     users: danh sách đang lọc ở Bảng công (mọi trang); không có thì mọi người có lượt trong tháng */
  function tally(users) {
    let pending = 0,
      rejected = 0;
    const months = users ? users.map(u => byUser.get(u.username)).filter(Boolean) : [...byUser.values()];
    for (const days of months)
      for (const list of days.values()) {
        const code = AS.dayStatus(list);
        if (code === 'pending') pending++;
        else if (code === 'rejected') rejected++;
      }
    return { pending, rejected };
  }

  /* ---------- hành động ---------- */
  A.actions.cctab = el => {
    S.sub.cc = el.dataset.v;
    A.render();
    A.loadView('cham-cong');
  };
  A.actions.cccell = el => openCell(el.dataset.u, el.dataset.d);
  A.actions.ccf = el => {
    S.f.cctype = el.dataset.v;
    if (!el.dataset.v) S.f.cconly = false; // "Tất cả": bỏ mọi bộ lọc
    S.page[PAGE] = 1;
    A.render();
  };
  A.actions.ccneed = () => {
    S.f.cconly = !S.f.cconly;
    S.page[PAGE] = 1;
    A.render();
  };
  A.actions.cctf = el => {
    S.f.ccToday = el.dataset.v;
    S.page['cc-today'] = 1;
    A.render();
  };
  A.actions.cclf = el => {
    S.f.ccLeave = el.dataset.v;
    S.page['cc-phep'] = 1;
    A.render();
  };
  A.actions.ccotstatus = el => {
    S.f.otStatus = el.dataset.v;
    A.loadView('cham-cong');
  };
  A.actions.ccotdecide = el => decideOt(Number(el.dataset.id), el.dataset.a);

  /* ---------- hộp chi tiết một ngày ---------- */
  const CORRECTION = {
    pending: 'Chờ xử lý',
    approved: 'Được phê duyệt',
    rejected: 'Bị từ chối',
    replaced: 'Đã thay bằng yêu cầu sau'
  };
  /* Một lượt trong hộp ngày: nhãn do máy chủ tính (AttendanceStatus), lý do ngắn ở ô Ghi chú; giờ vào ra, phút vào muộn / ra sớm
     và làm thêm đã khai là dữ liệu để đối chiếu */
  function sessionCard(s, staff) {
    const e = s.entry || {};
    const pl = e.plannedShift;
    const off = offMinutes(s);
    const code = AS.statusOf(s);
    const note = AS.noteOf(s);
    const punches = (s.punches || [])
      .map(
        p =>
          `<span><b>${esc(A.hm(p.at))}</b>${p.type === 'in' ? 'Check-in' : 'Check-out'}${p.auto ? ' (tự động đóng lượt)' : ''}</span>`
      )
      .join('');
    const corr = (s.corrections || [])
      .map(
        c =>
          `<li><span class="num">${esc(A.fmtStamp(c.created_at))}</span><span>${esc(CORRECTION[c.status] || c.status)}: ${esc(A.hm(c.req_in))}–${esc(A.hm(c.req_out))} · ${esc(c.reason)}${c.decided_by ? ' · ' + esc(c.decided_by) : ''}</span></li>`
      )
      .join('');
    // ca của lượt khác ca đang gán (đổi ca sau khi Check-in) hoặc người chưa có ca: ghi rõ ca của lượt
    const ownShift =
      pl && A.shiftCode(pl.code) !== A.shiftCode(staff.shiftCode)
        ? `<span class="cap">ca của lượt: ${esc(A.shiftName(pl.code) || `${pl.in}–${pl.out}`)}</span>`
        : !pl
          ? '<span class="cap">lượt chưa có ca</span>'
          : '';
    const extra = e.extraKind
      ? esc((e.extraKind === 'ot' ? 'OT ' : 'Làm bù ') + [e.extraIn, e.extraOut].filter(Boolean).join(' / '))
      : '—';
    return `<div class="cc-lu"><div class="h"><b>Lượt #${esc(s.id)}</b>${ownShift}${statusPill(code)}</div>
<div class="cc-kv4"><div><span>Check-in – Check-out</span><b class="num">${e.presIn ? esc(A.hm(e.presIn)) : '—'} – ${e.presOut ? esc(A.hm(e.presOut)) : '—'}</b></div>
<div><span>Vào muộn / ra sớm</span><b class="num">${nf(off.late)} / ${nf(off.early)} phút</b></div><div><span>Làm thêm đã khai</span><b>${extra}</b></div><div><span>Ghi chú</span><b>${note ? esc(note) : '—'}</b></div></div>
${punches ? `<div class="cc-pun">${punches}<em>giờ bấm gốc, luôn được giữ nguyên</em></div>` : ''}
${corr ? `<div class="col" style="gap:6px"><span class="lbl">Lịch sử điều chỉnh</span><ul class="timeline">${corr}</ul></div>` : ''}</div>`;
  }
  /* Báo sau khi lưu: câu thành công cùng cảnh báo của máy chủ trong một thông báo (A.CcKhai.notify), để thông báo "Đã lưu" không đè cảnh báo */
  const notify = (ok, warnings) => {
    if (A.CcKhai) return A.CcKhai.notify(ok, warnings);
    A.showWarnings(warnings);
    A.toast(ok);
  };
  /* Hộp một ngày: phần Check-in/out chỉ để xem (không sửa giờ); khai lịch thay vẫn lưu được (A.CcKhai) */
  function openCell(username, date) {
    const staff = A.staff.byUser.get(username) || { username, name: username, type: A.typeCodes()[0] };
    const sessions = (byUser.get(username) && byUser.get(username).get(date)) || [];
    const leave = leaveOf(username, date);
    const khai = A.CcKhai ? A.CcKhai.section() : '';
    const cioCap = 'Giờ công ngày này tính theo Check-in/out';
    const hol =
      sessions.length && A.holidaySet().has(date)
        ? `<p class="cap">OT ngày lễ: ${esc(HOLIDAY_TEXT[holidayWorkOf(staff, date)] || '')}</p>`
        : '';
    const cioBody = `${sessions.length ? sessions.map(s => sessionCard(s, staff)).join('') : A.empty('Không có lượt Check-in/out trong ngày này')}${hol}${leave && !khai ? A.note(`Ngày này có yêu cầu ${esc(A.itemLabel(leave))} chờ xử lý ở Yêu cầu.`) : ''}`;
    const cio = `<section class="cc-sec" id="cc-cio" aria-labelledby="cc-cio-h"><div class="cc-sec-h"><h3 id="cc-cio-h">Check-in/out</h3><span class="cap">${esc(cioCap)}</span></div>${cioBody}</section>`;
    A.openDialog({
      title: `${staff.name} · ${dayLong(date)}`,
      sub: `${A.typeLong(staff)} · ${staff.shiftCode ? 'ca ' + A.shiftName(staff.shiftCode) : 'chưa gán ca cố định'}`,
      width: 760,
      cls: 'cc-day',
      body: cio + khai,
      foot: [{ label: 'Đóng' }],
      onMount: api => {
        if (khai) A.CcKhai.mount(api, { username, date, staff, first: false });
      }
    });
  }

  /* ---------- đồng ý, từ chối OT ---------- */
  /* Từ chối: ô lý do không bắt buộc (A.reasonField). Đồng ý: ghi chú luôn tuỳ chọn */
  const noteField = reject =>
    reject
      ? A.reasonField('cc-note', 'Lý do từ chối')
      : '<div class="formrow"><label class="lbl" for="cc-note">Ghi chú (không bắt buộc)</label><textarea id="cc-note" class="input" maxlength="300" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea></div>';
  function readNote(reject) {
    return reject ? A.readReason('cc-note') : document.getElementById('cc-note').value.trim();
  }
  function decideOt(id, action) {
    const o = C.ot.items.find(x => x.sessionId === id);
    if (!o) return;
    const reject = action === 'reject';
    A.confirmDialog({
      title: reject ? 'Từ chối OT' : 'Đồng ý OT',
      sub: `${o.name} · ${A.fmtDate(o.date)} · OT ${[o.extraIn, o.extraOut].filter(Boolean).join(' / ')}`,
      body: `${A.note(`Có mặt ${o.presIn ? A.hm(o.presIn) : '—'}–${o.presOut ? A.hm(o.presOut) : '—'}.${o.otDeclaration && o.otDeclaration.reason ? ' Lý do khai: ' + esc(o.otDeclaration.reason) : ''}`)}${noteField(reject)}`,
      label: reject ? 'Từ chối kèm lý do' : 'Đồng ý OT',
      cls: reject ? 'danger' : 'pri',
      onConfirm: async () => {
        const note = readNote(reject);
        const res = await A.api(
          'PUT',
          '/ot',
          { sessionId: o.sessionId, version: o.version, action, note },
          { warnings: 'manual' }
        );
        notify(reject ? 'Đã từ chối OT' : 'Đã đồng ý OT', res && res.warnings);
        A.loadView('cham-cong');
      }
    });
  }

  /* ---------- phần dùng chung khi vẽ ---------- */
  const TABS = [
    ['bang', 'Bảng công'],
    ['ca', 'Ca làm'],
    ['phep', 'Phép còn lại'],
    ['hom-nay', 'Hôm nay'],
    ['ot', 'Giờ OT']
  ];
  /* Người: chữ cái đầu, tên, dòng phụ (HTML đã esc ở nơi gọi) */
  const who = (name, sub, cls = '') =>
    `<div class="cc-who${cls ? ' ' + cls : ''}">${A.avatar(name)}<div class="cc-wt"><div class="t">${esc(name)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div></div>`;
  const pagerBtns = (act, attrs, p, pages, hasMore) =>
    `<span class="cc-pg"><span class="num">Trang ${nf(p)}/${nf(pages)}</span><button type="button" class="btn sm icon" data-act="${act}" ${attrs} data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="btn sm icon" data-act="${act}" ${attrs} data-p="${p + 1}" ${hasMore ? '' : 'disabled'} aria-label="Trang sau">${ic('chevr', 16)}</button></span>`;
  /* Chân thẻ "1–20 trên 71 nhân sự" + Trang x/y; phân trang ở trình duyệt (A.pager) */
  function footer(key, total, what, extra = '') {
    const pg = A.pager(key, total, PAGE_SIZE);
    const p = S.page[key];
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const text = total ? `${nf(pg.start + 1)}–${nf(pg.end)} trên ${nf(total)} ${what}${extra}` : `0 ${what}`;
    return {
      slice: pg.slice,
      html: `<div class="card-f cc-foot"><span>${esc(text)}</span>${pagerBtns('page', `data-k="${esc(key)}"`, p, pages, p < pages)}</div>`
    };
  }
  const emptyBlock = (icon, title, lines = []) =>
    `<div class="cc-empty"><div class="ico">${ic(icon, 20)}</div><b>${esc(title)}</b>${lines.map(esc).join('<br>')}</div>`;
  const errs = (...list) =>
    list
      .filter(Boolean)
      .map(e => `<div class="cc-err">${A.errorBox(e)}</div>`)
      .join('');
  const search = (key, width = 240) => `<div class="cc-search">${A.searchBox(key, 'Tìm nhân sự', width)}</div>`;
  const dash = '<span class="cc-z">—</span>';

  /* ---------- Bảng công ---------- */
  const needs = u => {
    const m = byUser.get(u.username);
    if (!m) return false;
    for (const list of m.values()) if (AS.dayStatus(list) === 'pending') return true;
    return false;
  };
  function capBang() {
    const m1 = `${S.month}-01`,
      m2 = `${S.month}-${A.pad(A.daysInMonth(S.month))}`;
    const me = A.meInfo || {};
    const gps = me.geofenceRequired ? ' có GPS' : '';
    const src = `tính theo Check-in/out trên app${gps}`;
    const tip = A.canActFor() ? 'bấm vào ô để khai lịch và xem giờ Check-in/out' : 'bấm vào ô để xem giờ vào, ra';
    return `Tháng công ${A.fmtDM(m1)} – ${A.fmtDM(m2)} · ${src} · ${tip}`;
  }
  function rowBang(u, days, colCls, seen) {
    const m = byUser.get(u.username) || new Map();
    const start = u.startDate && u.startDate.slice(0, 7) === S.month ? u.startDate : '';
    const sh = A.shiftOf(u.shiftCode);
    // có ngày bắt đầu trong tháng thì chỉ ghi tên ca cho gọn ("Normal 1 · bắt đầu 16/11")
    const shiftTxt = !u.shiftCode ? 'chưa gán ca' : sh ? (start ? sh[1] : A.shiftName(u.shiftCode)) : u.shiftCode;
    const sub = `${esc(A.typeShort(u))} · ${esc(shiftTxt)}${start ? ` · bắt đầu ${esc(A.fmtDM(start))}` : ''}`;
    /* Khai lịch thay (nút nhỏ biểu tượng lịch cạnh tên, mở lịch ước tính của người này cho tháng đang chọn): chỉ khi tài khoản
       đang dùng có năng lực xử lý yêu cầu, người này còn hoạt động và vào bảng lương */
    const act =
      u.locked || u.payrollSubject === false
        ? ''
        : A.actForButton(u.username, 'Khai lịch thay', 'btn sm icon ghost cc-act', true, u.name);
    const name = `<td><div class="cc-nm">${who(u.name, u.shiftCode ? sub : `<span class="cc-bad">${sub}</span>`)}${act}</div></td>`;
    // Khai lịch ngay tại ô (A.CcKhai): mọi ô bấm được, kể cả ngày không có lịch làm và người chưa gán ca
    const khai = !!A.CcKhai && A.canActFor() && !u.locked && u.payrollSubject !== false;
    if (!u.shiftCode && !m.size && !khai)
      return `<tr>${name}<td class="cc-span" colspan="${days.length}">Chưa gán ca nên chưa tính được ngày công từ Check-in/out<button type="button" class="link" data-act="hsopen" data-u="${esc(u.username)}">Gán ca</button></td><td class="num cc-s z">0</td><td class="num cc-s z">0</td></tr>`;
    let present = 0,
      waiting = 0;
    const cells = days
      .map(d => {
        const sessions = m.get(d);
        const workday = isWorkday(u, d);
        let c = cellOf(sessions, leaveOf(u.username, d));
        // ngày chưa có lượt Check-in: loại ngày đã khai (nghỉ phép, không lương, iSAT, làm thêm...)
        const k = !(sessions && sessions.length) && A.CcKhai ? A.CcKhai.mark(u.username, d) : null;
        if (k) {
          c = k;
          (seen.k = seen.k || new Set()).add(k.key);
          if (k.st === 'pending') seen.kpd = true;
          if (k.st === 'rejected') seen.krj = true;
        }
        if (sessions && sessions.length) {
          present++;
          if (c.code === 'pending') waiting++;
        }
        const cls = ['d', colCls(d) || (workday ? '' : 'pof')].filter(Boolean).join(' ');
        if (!c.code && !workday && !khai) return `<td class="${cls}"></td>`;
        if (k && (k.key === 'O' || k.key === 'B')) seen[k.key] = true;
        const blank = khai ? 'chưa khai, chưa có lượt Check-in/out' : 'chưa có lượt Check-in/out';
        const text = c.text || blank;
        // id theo người và ngày: sau khi lưu và vẽ lại, con trỏ về đúng ô vừa khai (A.render giữ ô có id đang được chọn)
        return `<td class="${cls}"><button type="button" id="ccc-${esc(u.username)}-${d}" class="cell"${c.code ? ` title="${esc(text)}"` : ''} data-act="cccell" data-u="${esc(u.username)}" data-d="${d}" aria-label="${esc(u.name)}, ${esc(A.fmtDate(d))}: ${esc(text)}">${c.code ? MARK[c.code](c) : ''}</button></td>`;
      })
      .join('');
    return `<tr>${name}${cells}<td class="num cc-s${present ? '' : ' z'}">${present}</td><td class="num cc-s${waiting ? ' p' : ' z'}">${waiting}</td></tr>`;
  }
  /* Bộ lọc của Bảng công (chức vụ, "Cần xử lý", ô tìm): danh sách người khớp, mọi trang */
  const bangFiltered = () => !!(S.f.cctype || S.f.cconly || (S.q[PAGE] || '').trim());
  function bangList(people = byName(A.people())) {
    const type = S.f.cctype || '',
      only = !!S.f.cconly,
      qtext = A.fold(S.q[PAGE] || '');
    return people.filter(
      u => (!type || u.type === type) && (!only || needs(u)) && (!qtext || A.fold(searchText(u)).includes(qtext))
    );
  }
  function renderBang() {
    const type = S.f.cctype || '',
      only = !!S.f.cconly;
    const holidays = A.holidaySet();
    const days = Array.from({ length: A.daysInMonth(S.month) }, (_, i) => `${S.month}-${A.pad(i + 1)}`);
    const people = byName(A.people());
    const list = bangList(people);
    const f = footer(PAGE, list.length, 'nhân sự', ' · xếp theo tên');
    const today = A.vnToday(); // ngày hôm nay theo giờ Việt Nam: cột này được đánh dấu và cuộn tới
    const colCls = d => (holidays.has(d) ? 'hol' : offCol(d) ? 'off' : '');
    const head = days
      .map(d => {
        const cls = ['cc-dh', colCls(d), d === today ? 'today' : '', d > today ? 'fut' : ''].filter(Boolean).join(' ');
        return `<th class="${cls}" scope="col" ${d === today ? 'aria-current="date"' : ''}><span class="dn">${Number(d.slice(8))}</span><span class="wd">${holidays.has(d) ? 'Lễ' : A.DOW_SHORT[A.dowOf(d)]}</span></th>`;
      })
      .join('');
    const seen = {};
    const rows = f
      .slice(list)
      .map(u => rowBang(u, days, colCls, seen))
      .join('');
    // Có lịch đã khai của tháng (GET /api/team): ký hiệu loại ngày đã khai thay cho "P" xin nghỉ chờ xử lý
    const declared = !!A.CcKhai && A.CcKhai.ready();
    const legend = [
      ...LEGEND_ORDER.map(code => [MARK[code](), AS.LABEL[code]]),
      ...(declared ? [] : [['<span class="cc-m lv">P</span>', 'Xin nghỉ, chờ xử lý']]),
      ...(seen.O ? [['<span class="cc-m x">OT</span>', 'Có OT khai']] : []),
      ...(seen.B ? [['<span class="cc-m x">bù</span>', 'Có làm bù khai']] : []),
      ...(declared ? A.CcKhai.legend(seen) : []),
      ['<span class="cc-sw"></span>', 'Ô xám: ngày không có lịch làm'],
      ['', declared ? 'Ô trống: chưa khai, chưa có lượt Check-in' : 'Ô trống: chưa có lượt Check-in nào']
    ]
      .map(([m, t]) => `<span class="k">${m}${esc(t)}</span>`)
      .join('');
    const count = t => people.filter(u => u.type === t).length;
    const chips =
      A.chip(!type && !only, 'ccf', 'data-v=""', 'Tất cả', people.length) +
      A.chip(only, 'ccneed', '', AS.LABEL.pending) +
      A.typeCodes()
        .filter(t => count(t) || type === t)
        .map(t => A.chip(type === t, 'ccf', `data-v="${esc(t)}"`, A.TYPE_LONG[t] || t, count(t)))
        .join('');
    const stale = C.att.month !== S.month;
    const span = days.length + 3;
    const skel = Array.from(
      { length: 5 },
      () => `<tr><td class="cc-none" colspan="${span}"><div class="skel" style="width:60%"></div></td></tr>`
    ).join('');
    const body =
      C.att.loading && (stale || !C.att.rows.length)
        ? skel
        : rows || `<tr><td class="cc-none" colspan="${span}">${A.empty('Không có dòng nào khớp bộ lọc')}</td></tr>`;
    return `<section class="card flush cc-card">
<div class="card-h"><h2>Bảng công tháng ${Number(S.month.slice(5))}</h2><span class="cap">${esc(capBang())}</span></div>
<div class="cc-tools">${chips}${search(PAGE)}</div>
<div class="cc-legend">${legend}</div>
${errs(C.att.error, A.staff.state === 'fail' && A.staff.error)}
<div class="tblwrap"><table class="cc-bc${days.length > 30 ? ' cc-d31' : ''}"><colgroup><col class="cc-cn">${days.map(() => '<col class="cc-cd">').join('')}<col class="cc-cs1"><col class="cc-cs2"></colgroup>
<thead><tr><th scope="col">Nhân sự</th>${head}<th class="cc-s" scope="col" title="Số ngày có lượt Check-in/out">Số ngày</th><th class="cc-s" scope="col">${esc(AS.LABEL.pending)}</th></tr></thead>
<tbody>${body}</tbody></table></div>
${f.html}</section>`;
  }

  /* ---------- Ca làm ---------- */
  // Loại ca lấy từ danh mục ca (A.SHIFTS cột 6), không đoán theo chữ đầu của mã (mã ca dạng Normal1 …)
  const SHIFT_KIND_LABEL = { normal: 'Normal', flex: 'Flex', night: 'Night' };
  function renderCa() {
    const people = A.people();
    const loading = A.staff.state === 'loading' && !people.length;
    const unassigned = byName(people.filter(p => !p.shiftCode));
    const counts = A.SHIFTS.map(([code]) => people.filter(p => A.shiftCode(p.shiftCode) === code).length);
    const max = Math.max(0, ...counts);
    const rows = A.SHIFTS.map(([, name, a, b, , kind], i) => {
      const n = counts[i];
      return `<tr><td class="cc-b">${esc(name)}</td><td class="num">${esc(a)} – ${esc(b)}${b <= a ? ' hôm sau' : ''}</td><td>${esc(SHIFT_KIND_LABEL[kind] || '')}</td><td class="num r">${nf(n)}</td><td class="cc-barc"><div class="cc-bar" aria-hidden="true"><i style="width:${max ? Math.round((n / max) * 100) : 0}%"></i></div></td></tr>`;
    }).join('');
    const un = unassigned.slice(0, UNASSIGNED_SHOWN);
    const right = unassigned.length
      ? un
          .map(
            p =>
              `<div class="cc-urow">${who(p.name, esc(A.typeShort(p)) + (p.level ? ' · ' + esc(A.levelLabel(p, S.month)) : ''), 'lg')}<button class="btn sm" type="button" data-act="hsopen" data-u="${esc(p.username)}">Gán ca</button></div>`
          )
          .join('') +
        (unassigned.length > un.length
          ? `<div class="cc-urow cap">và ${nf(unassigned.length - un.length)} người khác</div>`
          : '') +
        `<div class="card-f">Chưa có ca thì Check-in/out chưa tính ra giờ công. Gán cho nhiều người cùng lúc ở <button type="button" class="link" data-act="nav" data-t="ho-so">Nhân sự</button>.</div>`
      : `<div class="cc-urow">${A.empty(loading ? 'Đang tải…' : 'Mọi người đều đã có ca')}</div>`;
    return `<div class="cc-ca"><section class="card flush cc-card">
<div class="card-h"><h2>${nf(A.SHIFTS.length)} ca cố định</h2><span class="cap">${nf(people.length - unassigned.length)} người đã có ca · Admin gán ca cho từng người, nhân viên không tự chọn</span><span class="end"><button type="button" class="link" data-act="nav" data-t="cai-dat" data-s="cham-cong">Sửa ca trong Cài đặt</button></span></div>
<div class="tblwrap"><table class="cc-t cc-cat"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col></colgroup>
<thead><tr><th>Ca</th><th>Giờ</th><th>Loại</th><th class="r">Số người</th><th><span class="sr">Tỉ lệ người theo ca</span></th></tr></thead>
<tbody>${loading ? A.skelRows(5, 6) : rows}</tbody></table></div></section>
<section class="card flush cc-card cc-unas"><div class="card-h"><h2>Chưa có ca</h2>${unassigned.length ? `<span class="cap">${nf(unassigned.length)} người</span>` : ''}</div>${right}</section></div>`;
  }

  /* ---------- Phép còn lại: số do máy chủ tính (leave của từng người), tính đến hôm nay ---------- */
  function renderPhep() {
    const flt = S.f.ccLeave || '';
    const qtext = A.fold(S.q['cc-phep'] || '');
    const bal = s => Number(s.leave.balance) || 0;
    const adjOf = s => Number(s.leave.adjust) || 0;
    const FILTER = { neg: s => bal(s) < 0, zero: s => bal(s) === 0, adj: s => adjOf(s) !== 0 };
    const all = byName(A.people().filter(s => s.leave));
    const list = all.filter(s => (!FILTER[flt] || FILTER[flt](s)) && (!qtext || A.fold(searchText(s)).includes(qtext)));
    const f = footer('cc-phep', list.length, 'nhân sự có phép năm', ' · ngày');
    const year = A.vnToday().slice(0, 4);
    const z = v => (v === 0 ? ' cc-z' : '');
    const LL = A.LeaveLedger; // sổ phép và nút cập nhật (leave-ledger.js)
    const rows = f
      .slice(list)
      .map(s => {
        const l = s.leave;
        const adj = adjOf(s),
          total = (Number(l.total) || 0) - adj,
          used = Number(l.used) || 0,
          b = bal(s);
        const sub = `${esc(A.typeShort(s))}${s.startDate && s.startDate.slice(0, 4) === year ? ` · vào làm ${esc(A.fmtDate(s.startDate))}` : ''}`;
        const pill =
          b < 0
            ? A.pill('rejected', 'Phép âm')
            : b === 0
              ? A.pill('draft', 'Hết phép')
              : adj
                ? '<span class="pill cc-p-gold">Có điều chỉnh</span>'
                : '';
        return `<tr><td class="who">${who(s.name, sub, 'lg')}</td><td class="num r${z(total)}" data-label="Được cộng">${nf(total)}</td><td class="num r${z(used)}" data-label="Đã dùng">${nf(used)}</td><td class="num r${z(adj)}" data-label="Điều chỉnh">${adj > 0 ? '+' : ''}${nf(adj)}</td><td class="num r cc-b${b < 0 ? ' cc-neg' : ''}" data-label="Còn lại">${nf(b)}</td><td class="act">${pill}${LL ? LL.rowButton(s) : ''}</td></tr>`;
      })
      .join('');
    const chips = [
      ['', 'Tất cả', all.length],
      ['neg', 'Phép âm', all.filter(FILTER.neg).length || null],
      ['zero', 'Hết phép'],
      ['adj', 'Có điều chỉnh']
    ]
      .map(([v, l, n]) => A.chip(flt === v, 'cclf', `data-v="${v}"`, l, n))
      .join('');
    return `<section class="card flush cc-card">
<div class="card-h"><h2>Phép năm còn lại</h2><span class="cap">Tính đến ${esc(A.fmtDate(A.vnToday()))} · được cộng theo ngày bắt đầu làm và sinh nhật · đã dùng là ngày nghỉ phép đã xin tới hôm nay</span>${LL ? LL.refreshButton() : ''}</div>
<div class="cc-tools">${chips}${search('cc-phep')}</div>
${errs(A.staff.state === 'fail' && A.staff.error)}
<div class="tblwrap"><table class="rtable cc-t cc-lt"><colgroup><col><col class="cn"><col class="cn"><col class="cn"><col class="cn"><col class="cp"></colgroup>
<thead><tr><th>Nhân sự</th><th class="r">Được cộng</th><th class="r">Đã dùng</th><th class="r">Điều chỉnh</th><th class="r">Còn lại</th><th><span class="sr">Ghi chú</span></th></tr></thead>
<tbody>${A.staff.state === 'loading' && !all.length ? A.skelRows(6, 5) : rows}</tbody></table></div>
${rows ? '' : A.staff.state === 'loading' ? '' : emptyBlock('users', 'Không có nhân sự nào khớp')}
${f.html}</section>`;
  }

  /* ---------- Hôm nay ---------- */
  /* Nhãn của một dòng GET /api/today: status do máy chủ gửi kèm dòng; không có thì của lượt cùng mã trong tháng đang xem (cùng nhãn với
     Bảng công); không có nữa thì AttendanceStatus.statusOf suy tối thiểu từ dòng. Dòng chưa có lượt trả '' */
  const todaySession = r => (r.sessionId ? byId.get(r.sessionId) : null);
  function todayCode(r) {
    if (!r.sessionId) return '';
    const s = todaySession(r);
    if (r.status || !(s && s.status))
      return AS.statusOf(r.status ? r : { state: r.open ? 'open' : 'closed', entry: r });
    return AS.statusOf(s);
  }
  const todayNote = r => (r.status ? AS.noteOf(r) : AS.noteOf(todaySession(r)));
  function renderToday() {
    const d = C.today.data;
    const flt = S.f.ccToday || '';
    const qtext = A.fold(S.q['cc-today'] || '');
    const FILTER = {
      open: r => todayCode(r) === 'checked-in',
      pending: r => todayCode(r) === 'pending',
      none: r => !r.sessionId
    };
    const all = d ? byName(d.rows) : [];
    const rows = all.filter(r => (!FILTER[flt] || FILTER[flt](r)) && (!qtext || A.fold(searchText(r)).includes(qtext)));
    const f = footer('cc-today', rows.length, 'nhân sự');
    const st = r => {
      const code = todayCode(r);
      if (!code) return A.pill('draft', 'Chưa có lượt');
      const note = todayNote(r);
      return `<div class="col" style="gap:2px;align-items:flex-start">${statusPill(code)}${note ? `<span class="cap">${esc(note)}</span>` : ''}</div>`;
    };
    const shift = r =>
      r.plannedShift
        ? esc(A.shiftName(r.plannedShift.code) || `${r.plannedShift.in}–${r.plannedShift.out}`)
        : r.shiftCode
          ? esc(A.shiftName(r.shiftCode))
          : '<span class="cc-bad">Chưa có ca</span>';
    const body = f
      .slice(rows)
      .map(
        r =>
          `<tr><td class="who">${who(r.name, esc(A.typeShort(r)), 'lg')}</td><td data-label="Ca">${shift(r)}</td><td class="num r" data-label="Vào">${r.in ? esc(r.in) : dash}</td><td class="num r" data-label="Ra">${r.out ? esc(r.out) : dash}</td><td class="num r" data-label="Muộn">${r.late ? `<span class="cc-late">${nf(r.late)}'</span>` : ''}</td><td data-label="Trạng thái">${st(r)}</td><td class="num r${r.sessionCount ? '' : ' cc-z'}" data-label="Số lượt">${nf(r.sessionCount)}</td></tr>`
      )
      .join('');
    const chips = [
      ['', 'Tất cả', d ? all.length : null],
      ['open', AS.LABEL['checked-in'], d ? all.filter(FILTER.open).length : null],
      ['pending', AS.LABEL.pending, d ? all.filter(FILTER.pending).length : null],
      ['none', 'Chưa có lượt']
    ]
      .map(([v, l, n]) => A.chip(flt === v, 'cctf', `data-v="${v}"`, l, n))
      .join('');
    const at = C.today.at ? ` · cập nhật lúc ${A.hm(new Date(C.today.at).toISOString())}` : '';
    return `<section class="card flush cc-card">
<div class="card-h"><h2>Hôm nay${d ? ' · ' + esc(dayLong(d.today)) : ''}</h2><span class="cap">Lượt Check-in/out mới nhất của từng người theo giờ máy chủ${esc(at)}</span></div>
<div class="cc-tools">${chips}${search('cc-today')}</div>
${errs(C.today.error)}
<div class="tblwrap"><table class="rtable cc-t cc-tt"><colgroup><col><col class="c2"><col class="cn"><col class="cn"><col class="cn"><col class="c6"><col class="cn"></colgroup>
<thead><tr><th>Nhân sự</th><th>Ca</th><th class="r">Vào</th><th class="r">Ra</th><th class="r">Muộn</th><th>Trạng thái</th><th class="r">Số lượt</th></tr></thead>
<tbody>${C.today.loading && !d ? A.skelRows(7) : body}</tbody></table></div>
${body || (C.today.loading && !d) || C.today.error ? '' : emptyBlock('clock', 'Không có dòng nào khớp bộ lọc')}
${f.html}</section>`;
  }

  /* Nút Từ chối / Đồng ý của một dòng (tab Giờ OT) */
  const decideBtns = (act, id) =>
    `<button class="cc-tact" type="button" data-act="${act}" data-a="reject" data-id="${esc(id)}">Từ chối</button><button class="btn sm pri" type="button" data-act="${act}" data-a="approve" data-id="${esc(id)}">Đồng ý</button>`;

  /* ---------- Giờ OT ---------- */
  function renderOt() {
    const st = S.f.otStatus || 'pending';
    const rows = C.ot.items
      .map(o => {
        const pend = !o.otReview;
        // kết quả duyệt giờ OT là dữ liệu của dòng (chữ thường), không phải nhãn trạng thái của lượt chấm công
        const decided = o.otReview
          ? `OT ${(o.otReview.ok ? AS.LABEL.approved : AS.LABEL.rejected).toLowerCase()}`
          : `OT ${AS.LABEL.pending.toLowerCase()}`;
        return `<tr><td class="who">${who(o.name, typeOf(o.username), 'lg')}</td><td class="num" data-label="Ngày">${esc(A.fmtDate(o.date))}</td><td data-label="Ca">${o.plannedShift ? esc(A.shiftName(o.plannedShift.code) || o.plannedShift.in + '–' + o.plannedShift.out) : '—'}</td><td class="num" data-label="OT đã khai">${esc([o.extraIn, o.extraOut].filter(Boolean).join(' / ') || '—')}</td><td class="num" data-label="Có mặt">${o.presIn ? esc(A.hm(o.presIn)) : '—'} – ${o.presOut ? esc(A.hm(o.presOut)) : '—'}</td><td data-label="Duyệt OT"><div class="col" style="gap:4px;align-items:flex-start"><span>${esc(decided)}</span>${o.otReview && o.otReview.note ? `<span class="cap">${esc(o.otReview.note)}</span>` : ''}</div></td><td class="act">${pend ? decideBtns('ccotdecide', o.sessionId) : ''}</td></tr>`;
      })
      .join('');
    const EMPTY = {
      pending: [
        'Không có lượt OT nào chờ đối chiếu',
        'Lượt Check-in/out có khai OT sẽ hiện ở đây để đối chiếu với giờ có mặt.',
        'OT nhân viên xin trên lịch nằm ở Yêu cầu.'
      ],
      approved: ['Chưa có lượt OT nào được phê duyệt'],
      rejected: ['Chưa có lượt OT nào bị từ chối']
    };
    const [title, ...lines] = EMPTY[st] || EMPTY.pending;
    const chips = [
      ['pending', AS.LABEL.pending, C.otPending],
      ['approved', AS.LABEL.approved],
      ['rejected', AS.LABEL.rejected]
    ]
      .map(([v, l, n]) => A.chip(st === v, 'ccotstatus', `data-v="${v}"`, l, n))
      .join('');
    const loading = C.ot.loading && !C.ot.items.length;
    return `<section class="card flush cc-card">
<div class="card-h"><h2>Giờ OT thực tế</h2><span class="cap">OT khai được đối chiếu với lượt Check-in/out · chỉ trả OT khi có mặt đúng khoảng đã khai</span></div>
<div class="cc-tools">${chips}</div>
${errs(C.ot.error)}
<div class="tblwrap"><table class="rtable cc-t cc-ot"><thead><tr><th>Nhân sự</th><th>Ngày</th><th>Ca</th><th>OT đã khai</th><th>Có mặt</th><th>Duyệt OT</th><th><span class="sr">Thao tác</span></th></tr></thead>
<tbody>${loading ? A.skelRows(7) : rows}</tbody></table></div>
${rows || loading || C.ot.error ? '' : emptyBlock('clock', title, lines)}</section>`;
  }

  /* Bảng nhiều cột ngày rộng hơn màn: khi mở tab hoặc đổi sang tháng có hôm nay thì cuộn ngang một lần để cột hôm nay
     nằm giữa phần nhìn thấy (bên phải cột tên cố định). Không cuộn lại khi vẽ lại do sự kiện hay khi người dùng đã tự kéo. */
  let scrolledFor = null; // tháng đã đặt vị trí cuộn ban đầu
  const goBase = A.go;
  A.go = (key, sub) => {
    if (S.view !== 'cham-cong' || key !== 'cham-cong') scrolledFor = null; // vào lại màn thì đặt vị trí lại
    return goBase(key, sub);
  };
  function after() {
    if (tab() !== 'bang') {
      scrolledFor = null;
      return;
    }
    if (scrolledFor === S.month || C.att.loading || C.att.month !== S.month) return; // chờ dữ liệu của đúng tháng
    const table = document.querySelector('#view table.cc-bc');
    const wrap = table && table.closest('.tblwrap');
    if (!wrap) return;
    scrolledFor = S.month;
    const th = table.querySelector('th[aria-current="date"]');
    if (!th) {
      wrap.scrollLeft = 0; // tháng khác tháng hiện tại: mở ở đầu tháng
      return;
    }
    const nameW = table.querySelector('th').getBoundingClientRect().width; // cột tên cố định che phần bên trái
    const x = th.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft;
    wrap.scrollLeft = Math.max(0, x + th.offsetWidth / 2 - nameW - (wrap.clientWidth - nameW) / 2);
  }

  /* ---------- đầu trang ---------- */
  /* Dòng dưới tiêu đề: số ngày Chờ xử lý và Bị từ chối của tháng (nhãn của ngày như ở Bảng công) */
  function subLine() {
    if (C.att.month !== S.month) return '';
    // Bảng công đang lọc: hai số này tính trên danh sách đang lọc (mọi trang) và nói rõ như vậy
    const filtered = tab() === 'bang' && bangFiltered();
    const t = tally(filtered ? bangList() : null);
    const of = filtered ? ' (danh sách đang lọc)' : '';
    const parts = [];
    if (t.pending) parts.push([`${nf(t.pending)} ngày`, `chờ xử lý${of}`]);
    if (t.rejected) parts.push([`${nf(t.rejected)} ngày`, `bị từ chối${of}`]);
    if (!parts.length) return 'Không còn ngày nào chờ xử lý trước khi chốt công';
    return parts.map(([a, b], i) => (i ? `${esc(a)} ${esc(b)}` : `<b>${esc(a)}</b> ${esc(b)}`)).join(' · ');
  }
  /* Nút chốt công: "Chốt công" hoặc "Đã chốt công" kèm "Mở lại" của kỳ lương thật (A.Ky.congActs).
     Không chặn chốt công, nên luôn là nút "Chốt công" bình thường (kylock, danh sách kiểm chỉ cảnh báo) */
  function headActs() {
    return (
      A.Ky.congActs() ||
      `<button class="btn" type="button" data-act="nav" data-t="duyet">${ic('inbox', 16)}Xin nghỉ, khai OT ở Yêu cầu</button>`
    );
  }

  function render() {
    const t = tab();
    const head = A.header('Chấm công & phép', subLine(), headActs(), 'cc-head');
    const todayIn = C.today.data ? C.today.data.rows.filter(r => todayCode(r) === 'checked-in').length : 0;
    const small = {
      'hom-nay': todayIn ? `${nf(todayIn)} ${AS.LABEL['checked-in']}` : '',
      ot: C.otPending ? `${nf(C.otPending)} chờ xử lý` : ''
    };
    const tabs = `<nav class="tabs cc-tabs" aria-label="Mục chấm công">${TABS.map(([k, l]) => `<button type="button" class="${t === k ? 'on' : ''}" data-act="cctab" data-v="${k}" ${t === k ? 'aria-current="page"' : ''}>${esc(l)}${small[k] ? ` <small>${esc(small[k])}</small>` : ''}</button>`).join('')}</nav>`;
    const bodyHtml =
      {
        bang: renderBang,
        'hom-nay': renderToday,
        ot: renderOt,
        ca: renderCa,
        phep: renderPhep
      }[t] || renderBang;
    return head + tabs + bodyHtml();
  }
  A.register('cham-cong', {
    load,
    render,
    after,
    fail: e => (C.att.error = A.errText(e)),
    live: () => {
      liveOnly = true;
      return A.loadView('cham-cong');
    }
  });
})(window.Admin);
