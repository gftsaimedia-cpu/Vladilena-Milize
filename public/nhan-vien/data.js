/* Giao diện Nhân viên: nạp dữ liệu thật (GET /api/me, /api/punch, /api/sheet) và dựng mô hình tháng bằng NhanVienLogic. */
(function (NV) {
  'use strict';
  const S = NV.S,
    L = NV.L;

  NV.applyMe = data => {
    // Cờ quyền lợi của chức vụ (máy chủ gửi ở gốc hoặc trong user); chưa có thì logic.js suy từ loại nhân sự.
    // Chế độ khai thay: cờ và nhãn là của người được khai (thay.js), không lấy của người đăng nhập.
    if (!NV.thay)
      L.setBenefits(
        (data && data.benefits) || (data && data.user && data.user.benefits) || null,
        (data && data.positionLabel) || (data && data.user && data.user.positionLabel) || ''
      );
    S.caps = (data && Array.isArray(data.caps) && data.caps) || [];
    // Tài khoản không thuộc bảng lương (máy chủ báo payrollSubject: false): không Check-in/out, không có thẻ thu nhập
    S.payroll = NV.thay ? true : !(data && data.payrollSubject === false);
    S.holidays = (data && data.holidays) || [];
    S.geofenceRequired = !!(data && data.geofenceRequired);
    // Nhân sự chỉ biết có bật vùng hay không; vị trí và bán kính chỉ hiện khi máy chủ gửi (hiện mới có cho Admin)
    S.geofence = data && data.geofence && Number.isFinite(data.geofence.radiusM) ? data.geofence : null;
    NV.syncClock(data);
  };

  // Giờ máy chủ (serverNow của GET /api/me, GET/POST /api/punch): mọi "bây giờ" của app (khung Check-in, nhắc ra ca sớm, "hôm nay")
  // đi qua NV.nowIso() = đồng hồ điện thoại + độ lệch này, nên điện thoại sai giờ không làm sai ngày công
  NV.syncClock = data => {
    if (data && typeof data.serverNow === 'string' && Number.isFinite(Date.parse(data.serverNow)))
      NV.skewMs = Date.parse(data.serverNow) - Date.now();
  };

  /* ---------- hồ sơ và cấu hình của chính mình (GET /api/me): nạp lại để Admin đổi ca, ngày lễ, vùng chấm công thì app thấy ngay ---------- */
  NV.loadMe = async () => {
    const seq = (NV._meSeq = (NV._meSeq || 0) + 1);
    let data;
    try {
      data = await NV.api('GET', '/me');
    } catch {
      return; // lỗi mạng hoặc hết phiên (NV.api đã chuyển về trang đăng nhập): giữ hồ sơ đang có
    }
    if (seq !== NV._meSeq) return;
    if (!data || !data.user) return location.replace(window.HomeRoute.LOGIN_PAGE);
    if (NV.thay) {
      // Khai thay: người đăng nhập mất quyền duyệt thì thôi chế độ này; hồ sơ đang hiện (S.me) vẫn là của người được khai
      if (!NV.canThay(data)) return NV.leaveThay(data);
      return NV.applyMe(data);
    }
    if (window.HomeRoute.adminCapable(data)) return location.replace('/admin.html');
    S.me = data.user;
    NV.applyMe(data);
  };

  /* ---------- check-in / check-out (khai thay: không có, đó là việc của chính người được khai) ---------- */
  NV.loadPunch = async () => {
    if (NV.thay || !S.payroll) return;
    const seq = (NV._punchSeq = (NV._punchSeq || 0) + 1);
    if (!S.punch) S.punchStatus = 'loading';
    try {
      const data = await NV.api('GET', '/punch');
      if (seq !== NV._punchSeq) return;
      NV.syncClock(data);
      S.punch = data;
      S.punchStatus = 'ok';
      S.punchError = '';
    } catch (e) {
      if (seq !== NV._punchSeq) return;
      S.punchError = NV.errText(e);
      if (!S.punch) S.punchStatus = 'error'; // đã có dữ liệu cũ thì giữ để dùng tiếp
    }
  };

  /* ---------- lịch một tháng ---------- */
  // Khai thay: đọc lịch của người được khai (GET /api/sheet?user=, quyền attendance.read)
  const sheetPath = month =>
    '/sheet?month=' + encodeURIComponent(month) + (NV.thay ? '&user=' + encodeURIComponent(NV.thay.username) : '');
  // Tin realtime của một tháng không đang xem: chỉ đánh dấu cũ, nạp lại khi mở tháng đó (loadMonth, loadEstimate không có force)
  NV.markStale = month => {
    if (S.sheets[month]) S.sheets[month].stale = true;
    if (S.estimates[month]) S.estimates[month].stale = true;
    if (S.advance && S.advance[month]) S.advance[month].stale = true;
  };
  /* Tài khoản không thuộc bảng lương: GET /api/sheet của chính họ trả 200, lịch rỗng, payrollSubject: false,
     nên vẫn gọi như mọi người; payrollSubject: false thì các màn hiện câu "Tài khoản này không thuộc bảng lương".
     Khai thay: phản hồi kèm owner (hồ sơ tóm tắt người được khai), thay.js dùng nó làm S.me. */
  /* rev của lịch mà màn đang dựa vào, theo tháng: NV.putSheet gửi làm expectedRev, nên ai đó (Admin khai thay) lưu sau lần đọc này
     thì máy chủ trả 409 SHEET_STALE thay vì để lần lưu của nhân sự đè mất. Nạp không ép (mở khay Khai ngày, đổi tháng) lấy rev đang có;
     nạp ép do tin trực tiếp trong lúc khay đang mở thì GIỮ rev cũ, vì biểu mẫu trong khay dựng từ lịch trước đó (khay chưa vẽ lại). */
  const baseRev = new Map();
  const setBase = (month, data) =>
    data && Number.isInteger(data.rev) ? baseRev.set(month, data.rev) : baseRev.delete(month);
  // rebase: luôn lấy rev của lần nạp này (sau khi chính trang vừa lưu, hoặc vừa nhận 409 và đã báo người dùng)
  NV.loadMonth = async (month, force, rebase) => {
    const cur = S.sheets[month];
    if (cur && cur.status === 'loading') return;
    if (cur && cur.status === 'ok' && !force && !cur.stale) return void setBase(month, cur.data);
    S.sheets[month] = { status: cur && cur.data ? 'ok' : 'loading', data: cur && cur.data, error: '', loading: true };
    // Sổ phép đi cùng nhịp nạp của tháng hiện tại (số phép tính đến hôm nay), gọi song song và KHÔNG chờ: lịch tháng hiện ngay khi về,
    // sổ về sau thì vẽ lại (máy chủ còn làm mới số dư khi đọc sổ nên lượt này có thể chậm hơn lượt lịch)
    if (!NV.thay && month === NV.curMonth())
      NV.loadLedger().then(changed => {
        if (changed && NV.render) NV.render();
      });
    try {
      const data = await NV.api('GET', sheetPath(month));
      S.sheets[month] = { status: 'ok', data, error: '' };
      if (rebase || !force || !NV.sheetOpen || !baseRev.has(month)) setBase(month, data);
      L.setScheduleInfo(month, data); // lịch làm việc của tháng do máy chủ gửi (nếu có)
      if (data && NV.thay && data.owner) NV.thayOwner(data.owner);
      else if (data && !NV.thay && data.payrollSubject === false) S.payroll = false;
    } catch (e) {
      S.sheets[month] = { status: cur && cur.data ? 'ok' : 'error', data: cur && cur.data, error: NV.errText(e) };
    }
  };

  /* ---------- sổ phép của chính mình (GET /api/leave/ledger): các lần cộng / hết hạn do máy chủ lưu ----------
     Chỉ để hiện thêm ở thẻ Phép năm; lỗi thì giữ sổ đang có (hoặc không có) và thẻ hiện như khi không có sổ. Khai thay: không nạp
     (sổ của người khác cần năng lực xem hồ sơ, người khai thay có thể không có). Trả true khi sổ vừa nạp xong (để nơi gọi vẽ lại). */
  NV.loadLedger = async () => {
    const seq = (NV._ledgerSeq = (NV._ledgerSeq || 0) + 1);
    try {
      const data = await NV.api('GET', '/leave/ledger');
      if (seq !== NV._ledgerSeq) return false;
      S.ledger = data && typeof data === 'object' ? data : null;
      return true;
    } catch {
      return false; // không có sổ thì thẻ Phép năm hiện như khi không có sổ
    }
  };
  // Sổ phép đã nạp và có tài khoản phép; null khi chưa có
  NV.ledger = () => (!NV.thay && S.ledger && S.ledger.hasAccount && Array.isArray(S.ledger.events) ? S.ledger : null);

  /* ---------- số ước tính lương của chính mình (GET /api/me/estimate): máy chủ tính, giao diện chỉ hiện ---------- */
  /* status: ok (có số), na (máy chủ báo chưa có số cho tháng này), loading, error (câu lỗi của máy chủ, nguyên văn) */
  // Tài khoản không thuộc bảng lương: máy chủ trả estimate null kèm payrollSubject false (status 'na'), thẻ thu nhập hiện câu riêng
  NV.loadEstimate = async (month, force) => {
    const cur = S.estimates[month];
    if (cur && cur.status === 'loading') return;
    if (cur && ['ok', 'na'].includes(cur.status) && !force && !cur.stale) return;
    S.estimates[month] = {
      status: cur && cur.data ? cur.status : 'loading',
      data: cur && cur.data,
      error: '',
      loading: true
    };
    // Khai thay: số ước tính của người được khai lấy từ route của Admin (thay.js đổi về cùng dạng với GET /api/me/estimate)
    if (NV.thay) {
      S.estimates[month] = await NV.thayEstimate(month, cur);
      return;
    }
    try {
      const data = await NV.api('GET', '/me/estimate?month=' + encodeURIComponent(month));
      S.estimates[month] = { status: data && data.estimate === null ? 'na' : 'ok', data, error: '' };
    } catch (e) {
      S.estimates[month] = {
        status: cur && cur.data ? cur.status : 'error',
        data: cur && cur.data,
        error: NV.errText(e)
      };
    }
  };

  /* ---------- ghi lịch ước tính: PUT /api/sheet thay cả tháng (lịch kèm % và mức KPI đề xuất đang lưu) ----------
     Luôn đọc lại tháng ngay trước khi ghi để không đè thay đổi mới; change(days, kpi) sửa bản sao rồi gửi đúng phần máy chủ cần.
     Thiếu kpiPct / kpiAmt trong yêu cầu là xoá hai số đó, nên luôn gửi lại giá trị đang có. Lỗi của máy chủ được ném nguyên văn.
     Khai thay: gửi thêm user (người được khai) và KHÔNG gửi kpiPct / kpiAmt (máy chủ giữ nguyên số của người đó);
     phản hồi có onBehalf: true, autoApproved: số khoản cần duyệt được duyệt luôn. opts đi thẳng vào NV.api (ví dụ { warnings: 'manual' }).
     expectedRev: rev của lịch màn đang dựa vào (baseRev; chưa có thì rev vừa đọc). Lệch thì máy chủ trả 409 SHEET_STALE, không ghi gì:
     nạp lại lịch và số ước tính rồi ném lỗi để khay hiện nguyên văn câu của máy chủ; lần lưu sau dùng rev mới. */
  NV.putSheet = async (month, change, opts) => {
    const fresh = await NV.api('GET', sheetPath(month));
    const days = JSON.parse(JSON.stringify((fresh && fresh.days) || {}));
    const kpi = {
      kpiPct: fresh && fresh.kpiPct !== undefined ? fresh.kpiPct : null,
      kpiAmt: fresh ? fresh.kpiAmt : null
    };
    change(days, kpi);
    const rev = baseRev.has(month) ? baseRev.get(month) : fresh && fresh.rev;
    const lock = Number.isInteger(rev) ? { expectedRev: rev } : {};
    let res;
    try {
      res = await NV.api(
        'PUT',
        '/sheet',
        NV.thay
          ? { month, days, user: NV.thay.username, ...lock }
          : {
              month,
              days,
              kpiPct: kpi.kpiPct == null ? null : kpi.kpiPct,
              kpiAmt: kpi.kpiAmt == null ? null : kpi.kpiAmt,
              ...lock
            },
        opts
      );
    } catch (e) {
      if (e && e.status === 409 && e.data && e.data.code === 'SHEET_STALE') {
        setBase(month, e.data);
        await Promise.all([NV.loadMonth(month, true, true), NV.loadEstimate(month, true)]);
        if (NV.liveRender) NV.liveRender(); // khay đang mở thì lịch phía sau vẽ lại khi đóng khay
      }
      throw e;
    }
    setBase(month, res);
    // Số mới của tháng này: lịch, trạng thái duyệt và ước tính thu nhập
    await Promise.all([NV.loadMonth(month, true, true), NV.loadEstimate(month, true)]);
    return res;
  };

  /* ---------- mô hình tháng (nhớ theo dữ liệu và phút hiện tại) ---------- */
  const memo = new Map();
  NV.model = month => {
    const sh = S.sheets[month];
    if (!sh || !sh.data) return null;
    const nowIso = NV.nowIso();
    const key = nowIso.slice(0, 16);
    const hit = memo.get(month);
    if (hit && hit.data === sh.data && hit.key === key && hit.me === S.me && hit.hol === S.holidays) return hit.model;
    const d = sh.data;
    const model = L.buildMonth({
      month,
      me: S.me,
      days: d.days,
      approvals: d.approvals,
      sessions: d.attendanceSessions,
      holidays: S.holidays,
      actualReport: d.actualReport || null, // báo cáo từng ngày của máy chủ; null = không có báo cáo
      cutRule: d.cutRule || null,
      nowIso
    });
    memo.set(month, { data: sh.data, key, me: S.me, hol: S.holidays, model });
    return model;
  };
  NV.curMonth = () => NV.today().slice(0, 7);
  NV.punchView = () =>
    L.punchView({ me: S.me, punch: S.punch, nowIso: NV.nowIso(), geofenceRequired: S.geofenceRequired });
  // Tham số chung cho L.dayPlan: tên người được khai (lời trong biểu mẫu khi khai thay) và
  // requestOnly: nhân viên tự gửi yêu cầu thì không có mục "Đi làm" thường (khai thay của Admin giữ đủ)
  NV.planCtx = () => ({ forName: NV.thay ? NV.thay.name : '', requestOnly: !NV.thay });
  // Phép năm còn lại: số của máy chủ (GET /api/sheet → leaveBalance, tính đến hôm nay); null khi chưa tải hoặc chưa có tài khoản phép
  NV.leave = () => {
    // Số tính đến hôm nay nên tháng nào cũng như nhau; khai thay có thể chỉ nạp tháng đang khai
    const sh =
      (S.sheets[NV.curMonth()] && S.sheets[NV.curMonth()].data ? S.sheets[NV.curMonth()] : null) || S.sheets[S.month];
    const lv = sh && sh.data && sh.data.leaveBalance;
    return lv && typeof lv === 'object' ? lv : null;
  };
})(window.NV);
