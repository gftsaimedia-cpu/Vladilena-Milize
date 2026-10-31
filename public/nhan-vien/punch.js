/* Giao diện Nhân viên: bấm Check-in / Check-out.
   Luật vị trí: chỉ hỏi vị trí khi người dùng BẤM Check-in và chỉ khi máy chủ báo geofenceRequired; toạ độ chỉ nằm
   trong biến cục bộ của một lần bấm, không đưa vào trạng thái trang, không ghi log, không lưu trình duyệt, không gửi đi đâu ngoài
   thân yêu cầu POST /api/punch. Mỗi lần bấm dùng một requestId; thử lại sau lỗi mạng dùng lại đúng requestId đó.
   Check-in ngoài vùng hay thiếu vị trí vẫn được máy chủ ghi nhận (lượt có cờ
   outsideZone) và phản hồi kèm warnings: khay kết quả hiện nguyên văn từng câu. Trình duyệt không cho lấy vị trí thì vẫn gửi Check-in,
   không kèm vị trí (máy chủ cảnh báo). */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;

  /* ---------- nhớ lần bấm chưa có kết quả (sống qua lần tải lại trang) ---------- */
  // Máy chủ nhớ requestId để bấm lại không chấm công hai lần (server.js → POST /punch, bảng punch_requests). Vì vậy mã của một
  // lần bấm chưa có kết quả phải sống lâu hơn một lần tải lại trang: giữ trong NV.store (localStorage) rồi đọc lại khi nạp trang.
  // Hạn 2 giờ, NGẮN HƠN hạn dọn của máy chủ (lib/config.js → PUNCH_REQUEST_KEEP_DAYS, 30 ngày).
  const ATTEMPT_KEY = 'punch-attempt';
  const ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;
  // Cùng dạng requestId máy chủ nhận (server.js → POST /punch): dài 8–120 ký tự, chỉ chữ/số và . _ : -
  const REQUEST_ID = /^[A-Za-z0-9._:-]{8,120}$/;
  function readAttempt() {
    const raw = NV.store.get(ATTEMPT_KEY);
    if (!raw) return null;
    try {
      const a = JSON.parse(raw);
      if (!a || typeof a.requestId !== 'string' || !REQUEST_ID.test(a.requestId)) return null;
      if (!(Date.now() - Number(a.at) < ATTEMPT_TTL_MS)) return null; // hết hạn: lần bấm tới dùng mã mới
      return { type: a.type, sessionId: a.sessionId ?? null, requestId: a.requestId };
    } catch {
      return null;
    }
  }
  function saveAttempt(attempt) {
    if (!attempt) return NV.store.remove(ATTEMPT_KEY);
    NV.store.set(
      ATTEMPT_KEY,
      JSON.stringify({
        type: attempt.type,
        sessionId: attempt.sessionId ?? null,
        requestId: attempt.requestId,
        at: Date.now()
      })
    );
  }
  // Lần bấm dở của lần tải trang trước: bấm lại đúng thao tác đó thì dùng lại đúng requestId cũ, không sinh mã mới
  S.attempt = readAttempt();
  // Lỗi mạng = fetch không tới được máy chủ (NV.api gói thành ApiError status 0). Chỉ lỗi này mới thử lại.
  const isNetworkError = err => !err || err.status === 0 || err instanceof TypeError;
  // Đúng MỘT lần tự thử lại khi lỗi mạng, giữ nguyên requestId (máy chủ trả lại phản hồi cũ nên không chấm hai lần).
  // Máy chủ đã trả lời (mọi mã HTTP, kể cả 5xx) thì không thử lại ở đây: người dùng bấm lại sẽ dùng lại mã cũ.
  async function postPunch(payload) {
    try {
      return await NV.api('POST', '/punch', payload, { warnings: 'manual' });
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      return NV.api('POST', '/punch', payload, { warnings: 'manual' });
    }
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject({ code: 2 });
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        e => reject({ code: e && e.code }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  /* ---------- khay báo lỗi vị trí ---------- */
  function geoSheet(kind, extra = {}) {
    const t = L.GEO_TEXT[kind] || L.GEO_TEXT.unavailable;
    const body = extra.serverText || t.body; // lỗi do máy chủ trả: câu của máy chủ, nguyên văn
    const outside = kind === 'outside';
    const steps = t.steps.length ? `<ol class="nv-steps">${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '';
    const diagram = outside
      ? `<div class="nv-diagram" aria-hidden="true"><svg viewBox="0 0 320 110" role="img"><circle cx="70" cy="55" r="42" fill="var(--gold-pale)" stroke="var(--gold-deep)" stroke-width="1.5" stroke-dasharray="5 4"/><g stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(58 43)"><rect x="3" y="1" width="18" height="22" rx="1.5"/><path d="M8 6h3M13 6h3M8 11h3M13 11h3"/><path d="M10 23v-5h4v5"/></g><path d="M118 55H262" stroke="var(--ctrl)" stroke-width="1.5" stroke-dasharray="3 5"/><circle cx="282" cy="55" r="16" fill="#f6e3e3"/><circle cx="282" cy="55" r="8" fill="var(--rejected)"/>${extra.distance ? `<text x="190" y="46" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)">${esc(extra.distance)}</text>` : ''}<text x="70" y="106" text-anchor="middle" font-size="11" fill="var(--muted)">Vùng chấm công</text><text x="282" y="86" text-anchor="middle" font-size="11" fill="var(--muted)">Bạn</text></svg></div>`
      : '';
    const rows = [];
    if (extra.accuracy != null)
      rows.push(
        `<div class="nv-kvx"><span>Độ chính xác vị trí</span><b>± ${esc(Math.round(extra.accuracy))} m</b></div>`
      );
    rows.push(
      `<div class="nv-kvx"><span>Thời điểm thử</span><b>${esc(L.vnTime(NV.nowIso()))} · ${esc(L.dmy(NV.today()))}</b></div>`
    );
    NV.openSheet({
      label: t.title,
      html: `<div class="nv-sheet-row"><span class="nv-bigicon is-bad">${ic(outside ? 'pin' : 'alert', 26, 2)}</span><div><h2>${esc(t.title)}</h2><p class="nv-muted">${esc(body)}</p></div></div>
${diagram}${steps}<div class="nv-kvs">${rows.join('')}</div>
${outside ? `<button type="button" class="nv-btn" aria-disabled="true" title="Sắp có">Đang đi công tác? Gửi yêu cầu Công tác${NV.soon()}</button><p class="nv-hint nv-center">${S.geofence ? 'Vị trí và bán kính chấm công do Admin cấu hình.' : 'Vùng chấm công do Admin cấu hình.'}</p>` : ''}
<div class="nv-bt"><button type="button" class="nv-btn" data-act="close-sheet">Đóng</button><button type="button" class="nv-btn is-pri" data-act="geo-retry" data-autofocus>${ic('refresh', 18)}Thử lại</button></div>`
    });
  }

  /* ---------- khay kết quả ---------- */
  // Dòng "Trạng thái lượt": nhãn và lý do ngắn do máy chủ tính cho lượt (AttendanceStatus); trang chưa nạp module thì bỏ dòng
  function statusRows(rows, session) {
    const AS = window.AttendanceStatus;
    if (!AS || !session) return;
    rows.push(['Trạng thái lượt', AS.labelOf(session)]);
    const note = AS.noteOf(session);
    if (note) rows.push(['Lý do', note]);
  }
  function resultSheet(type, after, accuracy, warnings) {
    const pv = after.pv,
      cell = after.cell;
    const rows = [];
    let title, sub;
    const lastEntry = (S.punch && S.punch.lastSession && S.punch.lastSession.entry) || {};
    const waitsApproval = type === 'out' && lastEntry.reason === 'forgot-out' && !!lastEntry.requestedOut;
    if (type === 'in') {
      const open = S.punch && S.punch.openSession;
      const e = (open && open.entry) || {};
      title = `Đã check-in lúc ${L.vnTime(e.presIn || NV.nowIso())}`;
      sub = e.outsideZone === true ? L.OUTSIDE_ZONE : S.geofenceRequired ? 'Bạn đang trong vùng chấm công.' : '';
      const planned = e.plannedShift || null;
      if (planned) {
        rows.push(['Ca', `${L.shiftInfo(planned.code) ? L.shiftInfo(planned.code).label : planned.code}`]);
        if (planned.startIso) rows.push(['Giờ vào ca', L.vnTime(planned.startIso)]);
        // Giờ bị trừ do vào muộn: số của máy chủ (checkoutPreview.cutStart); không có thì không hiện, không tự tính phút muộn
        const cp = S.punch && S.punch.checkoutPreview;
        if (cp && Number.isFinite(cp.cutStart))
          rows.push(['Giờ bị trừ do vào muộn', cp.cutStart ? L.fmtMin(cp.cutStart) : 'Không trừ']);
      } else rows.push(['Ca', 'Ngoài ca hoặc ngoài lịch: chờ Admin xử lý']);
      statusRows(rows, open);
      if (accuracy != null) rows.push(['Độ chính xác vị trí', `± ${Math.round(accuracy)} m`]);
    } else if (waitsApproval) {
      // Check-out muộn: chỉ ghi nhận giờ bấm, lượt Chờ xử lý cho tới khi Admin duyệt giải trình
      title = `Đã ghi nhận giờ bấm Check-out ${L.vnTime(lastEntry.requestedOut)}`;
      sub = 'Giờ này chưa được tính: lượt đang Chờ xử lý cho tới khi Admin duyệt giải trình.';
      statusRows(rows, S.punch.lastSession);
      rows.push(['Giải trình', 'Chờ xử lý']);
      rows.push(['Khi Admin duyệt', `Giờ Check-out là ${L.vnTime(lastEntry.requestedOut)}`]);
      rows.push(['Khi Admin từ chối', 'Cả ngày không tính công']);
    } else {
      const e = lastEntry;
      title = `Đã check-out lúc ${L.vnTime(e.presOut || NV.nowIso())}`;
      sub = '';
      if (e.presIn && e.presOut)
        rows.push([
          'Thời gian trong lượt',
          L.fmtMin(Math.round((Date.parse(e.presOut) - Date.parse(e.presIn)) / 60000))
        ]);
      const r = cell && cell.report;
      if (r && r.state === 'ok') {
        if (r.late)
          rows.push([
            'Phút muộn / giờ bị trừ',
            `${r.late} phút / ${r.cutStartMin ? L.fmtMin(r.cutStartMin) : 'không trừ'}`
          ]);
        if (r.early)
          rows.push([
            'Phút về sớm / giờ bị trừ',
            `${r.early} phút / ${r.cutEndMin ? L.fmtMin(r.cutEndMin) : 'không trừ'}`
          ]);
        rows.push(['Công hôm nay', L.fmtMin(r.paidMin)]);
      }
      statusRows(rows, S.punch && S.punch.lastSession);
    }
    const body = rows.map(([k, v]) => `<div class="nv-kvx"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const remind =
      type === 'in' ? NV.noteBox('info', 'Nhớ Check-out khi hết ca. Ngày quên chấm một đầu sẽ chờ Admin xử lý.') : '';
    // Cảnh báo của máy chủ cho lần bấm này (ví dụ Check-in ngoài vùng GPS): nguyên văn, ngay đầu khay
    const warnBox = (warnings || []).map(w => NV.noteBox(w.severity === 'danger' ? 'bad' : 'warn', w.message)).join('');
    NV.openSheet({
      label: title,
      html: `<div class="nv-sheet-top"><span class="nv-bigicon${waitsApproval ? ' is-warn' : ''}">${ic(waitsApproval ? 'clock' : 'check', 34, 2.25)}</span><h2>${esc(title)}</h2>${sub ? `<p class="nv-muted">${esc(sub)}</p>` : ''}</div>
${warnBox ? `<div class="nv-warns" role="alert">${warnBox}</div>` : ''}<div class="nv-kvs">${body}</div>${remind}<div class="nv-bt is-one"><button type="button" class="nv-btn is-pri" data-act="close-sheet" data-autofocus>Xong</button></div>`
    });
  }

  /* ---------- bấm nút ---------- */
  // explanation: giải trình gửi cùng lần bấm (máy chủ đòi bằng 409 CHECKIN_NEEDS_EXPLANATION / CHECKOUT_NEEDS_EXPLANATION khi lần bấm
  // không hợp lệ: trễ, về sớm, Check-out muộn, ngoài ca, ngoài vùng GPS, lượt thứ hai trong ca)
  async function doPunch(type, explanation) {
    if (S.busy) return;
    S.busy = true;
    S.punchMsg = null;
    NV.render();
    let loc,
      accuracy = null,
      distance = '',
      warnings = [];
    try {
      if (type === 'in' && S.geofenceRequired) {
        S.punchMsg = { tone: 'warn', text: 'Đang lấy vị trí…' };
        NV.render();
        try {
          const p = await getPosition();
          loc = { lat: p.lat, lng: p.lng, accuracy: p.accuracy };
          accuracy = p.accuracy;
          // Chỉ tính khoảng cách khi máy chủ cho nhân sự biết vị trí văn phòng (hiện chỉ Admin thấy); không lưu lại
          if (S.geofence && Number.isFinite(S.geofence.lat) && Number.isFinite(S.geofence.lng))
            distance = L.fmtDistance(window.PunchRules.distanceM(S.geofence.lat, S.geofence.lng, p.lat, p.lng));
        } catch {
          // Không lấy được vị trí: vẫn Check-in, không kèm vị trí (máy chủ ghi nhận và cảnh báo)
          loc = undefined;
        }
      }
      const sessionId = type === 'out' && S.punch && S.punch.openSession ? S.punch.openSession.id : null;
      const same = S.attempt && S.attempt.type === type && S.attempt.sessionId === sessionId;
      const attempt = same ? S.attempt : { type, sessionId, requestId: NV.uuid() };
      if (!same) {
        S.attempt = attempt;
        saveAttempt(attempt); // mã sống qua lần tải lại trang cho tới khi máy chủ trả lời dứt khoát
      }
      try {
        S.punch = await postPunch({
          type,
          requestId: attempt.requestId,
          ...(sessionId ? { sessionId } : {}),
          ...(loc ? { location: loc } : {}),
          ...(explanation ? { explanation } : {})
        });
        warnings = NV.warnList(S.punch && S.punch.warnings);
        NV.syncClock(S.punch);
        S.punchStatus = 'ok';
        S.attempt = null;
        saveAttempt(null); // máy chủ đã trả lời: không cần nhớ nữa
      } catch (err) {
        loc = null; // không giữ toạ độ lâu hơn một lần bấm
        // Máy chủ đã trả lời dứt khoát (mã 4xx): bỏ mã đã lưu, lần bấm sau là một lượt mới
        if (err.status && err.status < 500) {
          S.attempt = null;
          saveAttempt(null);
        }
        const kind = type === 'in' ? L.geoServerError(err.status, err.message, err.data && err.data.code) : '';
        if (kind) {
          S.busy = false;
          S.punchMsg = null;
          NV.render();
          geoSheet(kind, { accuracy, distance, serverText: err.message });
          return;
        }
        S.busy = false;
        if (
          err.status === 409 &&
          err.data &&
          ['CHECKIN_NEEDS_EXPLANATION', 'CHECKOUT_NEEDS_EXPLANATION'].includes(err.data.code) &&
          NV.askPressExplanation
        ) {
          // Lần bấm không hợp lệ: hỏi giải trình rồi gửi kèm lần bấm (huỷ hộp thì không ghi gì: Check-in không có lượt, Check-out thì lượt vẫn mở).
          // Lượt Chờ xử lý cho tới khi Admin quyết định; Check-out muộn thì máy chủ chỉ ghi nhận giờ bấm
          NV.render();
          const text = await NV.askPressExplanation(err.data);
          if (text) return doPunch(type, text);
          return;
        }
        if (err.status === 409) {
          await NV.loadPunch();
          S.punchMsg = { tone: 'warn', text: err.message };
        } else if (err.status === 403) {
          // Ví dụ "Tài khoản không thuộc bảng lương không chấm công": hiện nguyên câu của máy chủ, không kèm mã lỗi;
          // hồ sơ có thể vừa đổi nên đọc lại /api/me (không thuộc bảng lương thì thẻ bỏ nút Check-in/out)
          S.punchMsg = { tone: 'err', text: err.message };
          NV.loadMe().then(NV.render);
        } else
          S.punchMsg = {
            tone: 'err',
            text: err.status
              ? err.message
              : 'Chưa nhận được xác nhận. Kiểm tra mạng rồi bấm lại: lần thử lại dùng cùng một lượt ghi nhận, không bị chấm hai lần.'
          };
        NV.render();
        return;
      }
    } finally {
      loc = null;
    }
    S.busy = false;
    S.punchMsg = null;
    // Lấy lại lịch tháng để số muộn, số phút bị trừ, trạng thái ngày khớp máy chủ
    await NV.loadMonth(NV.curMonth(), true);
    NV.render();
    const model = NV.model(NV.curMonth());
    const cell = model && model.cells.get(NV.today());
    NV.showWarnings(warnings.filter(w => w.severity === 'danger')); // mức 'danger' còn lên băng đầu trang
    if (explanation && NV.loadExplanations) NV.loadExplanations(true); // giải trình vừa gửi kèm hiện ngay trong mục Giải trình
    resultSheet(type, { pv: NV.punchView(), cell }, accuracy, warnings);
  }

  NV.actions.punch = el => doPunch(el.dataset.type);
  NV.actions['geo-retry'] = () => {
    NV.closeSheet(true);
    doPunch('in');
  };
  NV.actions['close-sheet'] = () => NV.closeSheet();
})(window.NV);
