/* Màn Cài đặt › Nhật ký thay đổi: đọc GET /api/audit (lọc, phân trang theo con trỏ)
   và GET /api/audit/verify (kiểm chuỗi băm). Chỉ đọc. Giá trị cũ, mới lấy đúng từ máy chủ: màn chỉ đổi cách hiện (tên trường, ngày dd/mm/yyyy,
   trạng thái bằng chữ), không tính toán gì (lương nhạy cảm cũng vậy). Mức nhạy cảm do máy chủ lọc theo quyền người xem.
   Khung gọi A.NhatKy.render() và A.NhatKy.sub() (dòng phụ dưới tiêu đề "Cài đặt"); nút "Kiểm tra nhật ký không bị sửa" đặt vào chỗ nút của tiêu đề.
   Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic } = A;

  const PAGE_SIZE = 25; // số dòng một trang; máy chủ tự cắt theo AUDIT_PAGE_MAX
  const WINDOW_MAX = 200; // số dòng tối đa của "cửa sổ" khi con trỏ không dùng được (bằng AUDIT_PAGE_MAX của máy chủ)
  const SUMMARY_FIELDS = 2; // số trường hiện trong cột "Thay đổi" của bảng
  const SUMMARY_CHARS = 48; // cắt giá trị dài trong cột "Thay đổi"
  const VN_OFFSET_MS = 7 * 3600 * 1000; // giờ Việt Nam để chia nhóm theo ngày (giống core.js)

  /* Nhãn tiếng Việt cho mã hành động máy chủ ghi (lib/audit.js, lib/periods.js, lib/pay-entries.js, lib/roles.js, lib/findings.js,
     lib/params/save.js, lib/domain/*.js, server.js); mã lạ (chưa có nhãn) mới hiện nguyên mã */
  const ACTION_TXT = {
    'password.change': 'Đổi mật khẩu',
    'password.reset': 'Đặt lại mật khẩu',
    'staff.create': 'Tạo hồ sơ nhân sự',
    'staff.update': 'Sửa hồ sơ nhân sự',
    'staff.lock': 'Khoá tài khoản',
    'staff.unlock': 'Mở khoá tài khoản',
    'staff.payrollSubject': 'Đổi việc tính lương của tài khoản',
    'sheet.onBehalf': 'Admin khai lịch thay nhân viên',
    'slip.override': 'Sửa số trên phiếu lương',
    'holiday.set': 'Đặt ngày lễ',
    'setting.checkin': 'Đổi ngày dùng Check-in',
    'setting.actual-hours': 'Đổi ngày tính giờ theo Check-in/out',
    'setting.geofence': 'Đổi vùng chấm công',
    'setting.kpi-five': 'Đặt tháng bắt đầu KPI 5 thành phần',
    'setting.agents': 'Bật hoặc tắt Agents',
    'param.set': 'Sửa cài đặt',
    'param.mode': 'Đổi chế độ cài đặt',
    'role.create': 'Tạo vai trò',
    'role.update': 'Sửa vai trò',
    'role.deprecate': 'Xoá vai trò',
    'role.grant': 'Gán vai trò',
    'role.revoke': 'Gỡ vai trò',
    'schedule.person.set': 'Đặt lịch làm việc riêng',
    'entry.create': 'Thêm khoản cộng/trừ thêm',
    'entry.update': 'Sửa khoản cộng/trừ thêm',
    'entry.decide': 'Xử lý khoản cộng/trừ thêm',
    'entry.void': 'Huỷ khoản cộng/trừ thêm',
    'entry.confirmFlags': 'Xác nhận cờ của khoản cộng/trừ thêm',
    'approval.decide': 'Xử lý yêu cầu',
    // thao tác sửa giờ không còn dùng; giữ nhãn để dòng nhật ký cũ vẫn đọc được
    'correction.create': 'Tạo yêu cầu sửa giờ',
    'correction.decide': 'Xử lý yêu cầu sửa giờ',
    'ot.declare': 'Khai OT',
    'ot.decide': 'Xử lý OT',
    // Check-out muộn theo quyết định giải trình (lib/domain/explanation/late-checkout-session.js → sync)
    'checkout.late.apply': 'Duyệt check-out muộn',
    'checkout.late.revert': 'Hủy check-out muộn',
    'kpi.score': 'Nhập điểm KPI',
    'kpi.approve': 'Xác nhận KPI',
    'period.lock-attendance': 'Chốt công',
    'period.calculate': 'Tính lương',
    'period.ai-review': 'AI kiểm tra dữ liệu',
    'period.approve': 'Phê duyệt kỳ lương',
    'period.mark-paid': 'Đánh dấu đã trả lương',
    'period.reopen': 'Mở lại kỳ lương',
    'payslip.approve': 'Phê duyệt phiếu lương',
    'payslip.return': 'Trả lại phiếu lương',
    'ai.finding.dismiss': 'Bỏ qua cảnh báo AI',
    // danh mục chức vụ, bậc, ca làm (lib/domain/position/routes.js, lib/domain/shift/routes.js)
    'catalog.position.save': 'Sửa chức vụ',
    'catalog.level.save': 'Sửa bậc',
    'catalog.shift.save': 'Sửa ca làm'
  };
  /* Bộ lọc "Mục" (mã entityKind của máy chủ) */
  const ENTITY_TXT = {
    period: 'Kỳ lương',
    payslip: 'Phiếu lương',
    slip_override: 'Số sửa trên phiếu',
    pay_entry: 'Khoản điền thêm',
    sheet_approval: 'Yêu cầu',
    correction: 'Sửa giờ chấm công',
    attendance_session: 'Chấm công',
    kpi: 'Đánh giá KPI',
    'ai-finding': 'Cảnh báo AI',
    param: 'Cài đặt tham số',
    setting: 'Cài đặt chung',
    role: 'Vai trò',
    staff_role: 'Gán vai trò',
    staff: 'Hồ sơ nhân sự',
    'staff-schedule': 'Lịch làm việc riêng',
    timesheet: 'Lịch ước tính',
    position: 'Chức vụ',
    'position-level': 'Bậc lương',
    shift: 'Ca làm'
  };
  /* Tên trường của before/after (hiển thị); trường lạ hiện nguyên mã */
  const FIELD_TXT = {
    status: 'Trạng thái',
    rev: 'Phiên bản',
    version: 'Phiên bản',
    paidAt: 'Ngày trả lương',
    excluded: 'Phiếu loại ra',
    rule: 'Quy tắc',
    runId: 'Lượt kiểm tra',
    runNo: 'Lần tính',
    findings: 'Phát hiện',
    flagged: 'Người có cảnh báo',
    slips: 'Số phiếu',
    errors: 'Phiếu chưa tính được',
    paramsRev: 'Phiên bản cài đặt',
    acknowledged: 'Mục đã bỏ qua',
    checklist: 'Danh sách kiểm',
    to: 'Về trạng thái',
    reopenCount: 'Số lần mở lại',
    from: 'Từ ngày',
    dates: 'Ngày lễ',
    names: 'Tên ngày lễ',
    value: 'Giá trị',
    effectiveMonth: 'Áp dụng từ',
    locked: 'Khoá',
    enabled: 'Bật',
    radiusM: 'Bán kính (m)',
    centreChanged: 'Đổi tâm vùng',
    role: 'Vai trò',
    active: 'Đang giữ',
    label: 'Tên',
    scope: 'Phạm vi',
    copiedFrom: 'Sao chép từ',
    changed: 'Trường đã đổi',
    sessionId: 'Phiên chấm công',
    passwordSet: 'Đặt mật khẩu',
    advance: 'Tạm ứng',
    tax: 'Thuế TNCN',
    insurance: 'Bảo hiểm bắt buộc',
    lateCut: 'Tiền trừ đi muộn, về sớm',
    kpiPay: 'Lương KPI',
    otPay: 'Tiền làm thêm giờ',
    // khai lịch thay (sheet.onBehalf), việc tính lương của tài khoản (staff.payrollSubject)
    changedDays: 'Số ngày đổi',
    autoApproved: 'Khoản được đồng ý ngay',
    payrollSubject: 'Tính lương',
    enabled: 'Bật Agents',
    // chế độ cài đặt (param.mode), vai trò (role.*), lịch riêng (schedule.person.set)
    mode: 'Chế độ',
    caps: 'Năng lực',
    approvals: 'Yêu cầu được xử lý',
    deprecated: 'Ngưng dùng',
    effective: 'Lịch đang áp dụng',
    entry: 'Lịch mới',
    workdaysStd: 'Ngày công chuẩn',
    // hồ sơ nhân sự (staff.update): cùng chữ với ô của ngăn kéo hồ sơ
    name: 'Họ tên',
    familyName: 'Họ và tên đệm',
    givenName: 'Tên',
    contractStatus: 'Tình trạng hợp đồng',
    resignedOn: 'Ngày nghỉ việc',
    shiftCode: 'Ca',
    startDate: 'Ngày bắt đầu làm',
    jobTitle: 'Chức danh',
    type: 'Loại nhân sự',
    level: 'Bậc',
    idorm: 'Ở iDorm',
    contract: 'Hợp đồng',
    dependants: 'Số người phụ thuộc',
    leaveAdjust: 'Điều chỉnh phép',
    taxOn: 'Khấu trừ thuế TNCN',
    deductOn: 'Giảm trừ gia cảnh',
    advanceOn: 'Được tạm ứng',
    // khoản cộng/trừ thêm (entry.*: lib/pay-entries.js → AUDIT_FIELDS)
    username: 'Nhân sự',
    month: 'Tháng',
    direction: 'Loại khoản',
    amount: 'Số tiền',
    slipLine: 'Dòng trên phiếu',
    taxMode: 'Thuế',
    taxCap: 'Hạn mức miễn thuế',
    insuranceBase: 'Phần tính vào nền bảo hiểm',
    flagsConfirmedBy: 'Kế toán xác nhận cờ',
    // danh mục chức vụ, bậc, ca (catalog.*.save): cùng chữ với màn Cài đặt › Chức vụ & bậc
    workdays: 'Ngày công chuẩn',
    flexPct: 'Phụ cấp Flex (%)',
    nightPct: 'Phụ cấp Night (%)',
    travelPct: 'Phụ cấp đi lại (%)',
    attendancePct: 'Phụ cấp chuyên cần (%)',
    regularDows: 'Ngày làm việc',
    benefits: 'Quyền lợi đang bật',
    baseSalary: 'Lương cơ bản',
    kpiMax: 'Lương KPI tối đa',
    kind: 'Loại ca',
    sort: 'Thứ tự'
  };
  /* Giá trị chữ của vài trường mã (khoản cộng/trừ thêm); trường tiền ghi kèm ₫ */
  const VALUE_TXT = {
    direction: { add: 'Cộng thêm', deduct: 'Trừ' },
    taxMode: { none: 'Chịu thuế', full: 'Miễn thuế toàn bộ', cap: 'Miễn thuế đến hạn mức' },
    contractStatus: { probation: 'Thử việc', official: 'Chính thức' },
    kind: { normal: 'Normal', flex: 'Flex', night: 'Night' }
  };
  const MONEY_FIELDS = new Set(['amount', 'taxCap', 'insuranceBase', 'baseSalary', 'kpiMax']);
  const MONEY_KINDS = new Set(['pay_entry', 'position-level']);
  /* Danh mục ghi cả dạng xem của dòng vào before/after: số phiên bản, người và lúc sửa đã có ở các cột khác nên không nhắc lại */
  const CATALOG_KINDS = new Set(['position', 'position-level', 'shift']);
  const CATALOG_SKIP = new Set(['rev', 'updatedBy', 'updatedAt']);
  const CATALOG_ID = new Set(['code', 'preset', 'level']); // đã nói ở dòng "đối tượng" đầu (catalogTarget)
  /* Thứ tự trong cột "Thay đổi": trường người xem cần thấy ngay lên đầu, tháng áp dụng (đổi kèm mỗi lần sửa đầu tháng) xuống cuối */
  const STAFF_FIRST = ['contractStatus', 'resignedOn'];
  const STAFF_NAME_PARTS = new Set(['familyName', 'givenName']);
  const keyRank = (k, row) => {
    if (CATALOG_KINDS.has(row.entityKind)) return k === 'effectiveMonth' ? 1 : 0;
    const i = row.entityKind === 'staff' ? STAFF_FIRST.indexOf(k) : -1;
    return i < 0 ? STAFF_FIRST.length : i;
  };
  /* Tên trường riêng theo loại mục: cùng mã trường nhưng nghĩa khác (period.approve ghi số phiếu tự duyệt, tự loại) */
  const FIELD_TXT_BY_KIND = {
    period: { autoApproved: 'Phiếu được phê duyệt cùng kỳ', autoExcluded: 'Phiếu lỗi tự loại khỏi kỳ' },
    position: { name: 'Tên chức vụ' },
    'position-level': { name: 'Tên bậc' },
    shift: { name: 'Tên ca' }
  };
  /* Giá trị chữ của trường "Chế độ": params_mode (param.mode) */
  const MODE_TXT = {
    active: 'Đang áp dụng cài đặt đã lưu',
    'defaults-only': 'Chỉ dùng giá trị mặc định'
  };
  /* Trường máy chủ thêm vào after khi thao tác có cảnh báo (lib/audit.js → withWarnings): không hiện ở cột "Thay đổi" (mã kỹ thuật)
     mà thành nhãn ở cột "Việc": after.self = true là việc tự làm về chính mình ("Tự thực hiện");
     after.warnings = mã cảnh báo của lần lưu ("Lưu kèm cảnh báo"). */
  const MARK_FIELDS = new Set(['self', 'warnings']);
  const SELF_CODES = new Set(['SELF_DECISION_FORBIDDEN', 'APPROVAL_SELF']);
  const isSelf = row => !!(row && isObj(row.after) && row.after.self === true);
  // Số mã cảnh báo còn lại sau nhãn "Tự thực hiện" (dòng không mang after.self thì đếm hết, kể cả mã tự duyệt của dòng khác cùng lô)
  const otherWarnings = row => {
    const list = row && isObj(row.after) && Array.isArray(row.after.warnings) ? row.after.warnings : [];
    return isSelf(row) ? list.filter(c => !SELF_CODES.has(c)).length : list.length;
  };
  /* Trạng thái bằng chữ; yêu cầu của nhân viên dùng "Đã đồng ý" thay cho "Đã phê duyệt" */
  const STATUS_TXT = {
    open: 'Chưa tính lương',
    attendance_locked: 'Đã chốt công',
    calculated: 'Đã tính lương',
    reviewed: 'Đã kiểm tra',
    approved: 'Đã phê duyệt',
    paid: 'Đã trả lương',
    returned: 'Đã trả lại',
    pending: 'Chờ xử lý',
    rejected: 'Từ chối'
  };
  const REQUEST_KINDS = new Set(['sheet_approval', 'correction', 'attendance_session']);
  const VERIFY_TXT = {
    PREV_HASH: 'Chuỗi bị đứt hoặc thiếu dòng: dòng này không nối đúng với dòng liền trước.',
    ID_GAP: 'Số thứ tự bị nhảy cách: có dòng đã bị xoá khỏi chuỗi.',
    HASH: 'Nội dung dòng này không còn khớp với dấu kiểm của nó: dòng đã bị sửa.',
    AUDIT_KEY_MISSING:
      'Kiểm được chuỗi nối nhau, nhưng chưa kiểm được nội dung các dòng có khoá bí mật vì máy chủ thiếu khoá.'
  };
  const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const FILTER_KEYS = ['actor', 'subject', 'action', 'entity', 'month', 'from', 'to'];

  const blank = () => Object.fromEntries(FILTER_KEYS.map(k => [k, '']));
  const NK = {
    state: 'idle', // idle | loading | ok | fail
    error: '',
    rows: [],
    total: 0,
    applied: blank(), // bộ lọc đang áp dụng
    draft: blank(), // ô lọc đang gõ, chưa áp dụng
    cursors: [null], // cursors[i] = beforeId của trang i
    page: 0,
    next: null,
    token: 0,
    windowed: false,
    open: new Set(), // nhóm dòng giống nhau đang mở ra (theo id dòng đầu)
    refocus: false,
    verify: { state: 'idle', res: null, error: '' }
  };

  const actionTxt = code => ACTION_TXT[code] || code;
  const can = () => !A.meInfo || !Array.isArray(A.meInfo.caps) || A.meInfo.caps.includes('audit.read');
  const nameOf = username => {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(username);
    return s ? s.name : '';
  };
  const short = t => (t.length > SUMMARY_CHARS ? t.slice(0, SUMMARY_CHARS) + '…' : t);
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const vnParts = iso => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t + VN_OFFSET_MS);
    return { day: d.toISOString().slice(0, 10), dow: d.getUTCDay(), hm: d.toISOString().slice(11, 16) };
  };

  /* ---------- tải ---------- */
  function params(page) {
    const f = NK.applied;
    return {
      limit: PAGE_SIZE,
      beforeId: NK.cursors[page] || undefined,
      actor: f.actor,
      subject: f.subject,
      action: f.action.trim(),
      entity: f.entity.trim(),
      month: f.month,
      from: f.from,
      to: f.to
    };
  }
  /* Một trang. Bình thường đi theo con trỏ beforeId. Máy chủ hiện từ chối mọi beforeId (400, lỗi biểu thức kiểm tham số trong
     server.js → GET /audit): khi gặp lỗi đó màn tự lấy "cửa sổ" các dòng mới nhất (tối đa AUDIT_PAGE_MAX) rồi cắt trang tại chỗ. */
  async function get(page) {
    const asWindow = async () => {
      const size = Math.min(WINDOW_MAX, (page + 1) * PAGE_SIZE);
      const res = await A.api('GET', '/audit' + A.qs({ ...params(0), limit: size }));
      const rows = (res.rows || []).slice(page * PAGE_SIZE);
      const more = (page + 1) * PAGE_SIZE < Math.min(res.total || 0, WINDOW_MAX);
      return { rows, total: res.total, next: more ? 1 : null }; // next chỉ cần khác null để bật nút Trang sau
    };
    if (NK.windowed) return asWindow();
    try {
      const res = await A.api('GET', '/audit' + A.qs(params(page)));
      return { rows: res.rows || [], total: res.total, next: res.nextBeforeId ?? null };
    } catch (e) {
      if (page > 0 && e.status === 400 && /beforeId/.test(e.message || '')) {
        NK.windowed = true;
        return asWindow();
      }
      throw e;
    }
  }
  async function fetchPage(page) {
    const token = ++NK.token;
    NK.state = 'loading';
    NK.error = '';
    try {
      const [res] = await Promise.all([get(page), A.loadStaff()]);
      if (token !== NK.token) return;
      NK.rows = res.rows;
      NK.total = res.total || 0;
      NK.next = res.next;
      NK.page = page;
      if (NK.next !== null) NK.cursors[page + 1] = NK.next;
      NK.state = 'ok';
    } catch (e) {
      if (token !== NK.token) return;
      NK.state = 'fail';
      NK.error = A.errText(e);
    }
  }
  function load() {
    if (!can()) return Promise.resolve();
    NK.cursors = [null];
    return fetchPage(0);
  }
  const go = page => {
    const p = fetchPage(page);
    A.render();
    p.then(() => A.render());
  };

  /* ---------- bộ lọc ---------- */
  A.inputs.nkf = el => {
    NK.draft[el.dataset.k] = el.value; // chỉ nhớ giá trị, không vẽ lại để không mất chỗ gõ
  };
  function apply() {
    NK.applied = { ...NK.draft };
    NK.cursors = [null];
    go(0);
  }
  document.addEventListener('submit', ev => {
    if (!ev.target.matches('[data-nkform]')) return;
    ev.preventDefault();
    apply();
  });
  A.actions.nkclear = () => {
    NK.draft = blank();
    apply();
  };
  A.actions.nkpage = el => go(Number(el.dataset.p));
  A.actions.nkexp = el => {
    const id = el.dataset.id;
    if (NK.open.has(id)) NK.open.delete(id);
    else NK.open.add(id);
    A.render();
  };

  /* ---------- kiểm tra toàn vẹn ---------- */
  A.actions.nkverify = async () => {
    if (NK.verify.state === 'loading') return;
    NK.verify = { state: 'loading', res: null, error: '' };
    NK.refocus = true;
    A.render();
    try {
      NK.verify = { state: 'ok', res: await A.api('GET', '/audit/verify'), error: '' };
    } catch (e) {
      NK.verify = { state: 'fail', res: null, error: A.errText(e) };
    }
    NK.refocus = true;
    A.render();
  };
  function verifyHtml() {
    const v = NK.verify;
    if (v.state === 'idle') return '';
    if (v.state === 'loading')
      return `<div class="note" role="status">${ic('refresh', 16)}<span>Đang đi lại cả chuỗi nhật ký…</span></div>`;
    if (v.state === 'fail')
      return `<div class="note warn" role="alert">${ic('alert', 16)}<span>${esc(v.error)}</span></div>`;
    const r = v.res || {};
    if (r.ok)
      return `<div class="note ok" role="status">${ic('check', 16)}<span><b>Chuỗi nhật ký toàn vẹn.</b> Đã kiểm ${esc(nf(r.checked))} dòng, không có dòng nào bị sửa, xoá hay thiếu.</span></div>`;
    const why = VERIFY_TXT[r.reason] || r.reason || 'Không rõ lý do';
    return `<div class="note warn" role="alert">${ic('alert', 16)}<span><b>${r.reason === 'AUDIT_KEY_MISSING' ? 'Chưa kiểm đủ.' : 'Chuỗi nhật ký có vấn đề.'}</b> ${esc(why)}${r.firstBadId != null ? ` Dòng đầu tiên có vấn đề: số ${esc(r.firstBadId)}.` : ''}${r.unverifiable ? ` ${esc(nf(r.unverifiable))} dòng chưa kiểm được nội dung.` : ''} Đã kiểm ${esc(nf(r.checked))} dòng.</span></div>`;
  }
  const verifyBtn = () =>
    `<button class="btn nk-vbtn" type="button" id="nk-verify" data-act="nkverify" ${NK.verify.state === 'loading' ? 'disabled aria-busy="true"' : ''}>${ic('shield', 16)}Kiểm tra nhật ký không bị sửa</button>`;
  /* Nút kiểm tra đặt ở chỗ nút của tiêu đề "Cài đặt" (thay ô tìm cài đặt). Khung chưa có móc cho chỗ đó nên trang tự đặt nút vào
     ngay sau lượt vẽ (trước khi trình duyệt vẽ ra màn hình). */
  function mountActs() {
    const root = document.querySelector('#view .nk-root');
    const cdx = root && root.closest('.cdx');
    const acts = cdx && cdx.querySelector(':scope > .hdr .acts');
    if (!acts) return;
    acts.innerHTML = verifyBtn();
    if (NK.refocus) {
      NK.refocus = false;
      const b = acts.querySelector('#nk-verify');
      if (b && !b.disabled) b.focus({ preventScroll: true });
    }
  }

  /* ---------- cột "Thay đổi": giá trị đúng như máy chủ trả, chỉ đổi cách hiện ---------- */
  const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  function valText(k, v, row) {
    if (v === undefined || v === null || v === '') return 'trống';
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (typeof v === 'number') return MONEY_FIELDS.has(k) && MONEY_KINDS.has(row.entityKind) ? `${nf(v)} ₫` : nf(v);
    if (/Dows$/.test(k) && Array.isArray(v) && A.dowsText) return A.dowsText(v);
    if (k === 'benefits' && isObj(v)) {
      const label = (A.CatalogPositions && A.CatalogPositions.benefitLabel) || (code => code);
      const on = Object.keys(v).filter(code => v[code] === true);
      return on.length ? on.map(label).join(', ') : 'không có';
    }
    if (typeof v === 'string') {
      if (k === 'mode' && MODE_TXT[v]) return MODE_TXT[v];
      if (VALUE_TXT[k] && VALUE_TXT[k][v]) return VALUE_TXT[k][v];
      if (k === 'type' && A.TYPE_LONG && A.TYPE_LONG[v]) return A.TYPE_LONG[v];
      if (k === 'shiftCode' && A.shiftName && A.shiftName(v)) return A.shiftName(v);
      if (k === 'status' || k === 'to') {
        if (v === 'approved' && REQUEST_KINDS.has(row.entityKind)) return 'Đã đồng ý';
        return STATUS_TXT[v] || v;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return A.fmtDate(v);
      if (/^\d{4}-\d{2}$/.test(v)) return `${v.slice(5)}/${v.slice(0, 4)}`;
      if (STAMP_RE.test(v)) return A.fmtStamp(v);
      return v;
    }
    if (Array.isArray(v))
      return v.length ? v.map(x => (isObj(x) ? JSON.stringify(x) : valText('', x, row))).join(', ') : 'trống';
    return JSON.stringify(v);
  }
  const fieldTxt = (k, row) => {
    const own = row && FIELD_TXT_BY_KIND[row.entityKind];
    return (own && own[k]) || FIELD_TXT[k];
  };
  /* Quy tắc AI: có nhãn thì chỉ hiện nhãn (mã nằm ở title để tra), chưa có nhãn mới hiện mã */
  const ruleTxt = v =>
    A.ruleLabel && A.ruleLabel(v) !== String(v)
      ? `<span title="${esc(v)}">${esc(short(A.ruleLabel(v)))}</span>`
      : `<code>${esc(v)}</code>`;
  /* Tên của tham số (param.set): tra trong kho tham số đã nạp, không có thì hiện mã */
  const paramName = id => {
    const e = A.PxKit && A.PxKit.PS && A.PxKit.PS.byId ? A.PxKit.PS.byId.get(id) : null;
    return e && e.label ? esc(e.label) : `<code>${esc(id)}</code>`;
  };
  /* Dòng đầu của danh mục: sửa chức vụ nào, bậc mấy của chức vụ nào, ca nào (entityId: mã chức vụ, "mã:bậc", mã ca) */
  const positionName = code => {
    const p = A.positions && typeof A.positions.get === 'function' ? A.positions.get(code) : null;
    return (p && p.label) || (A.TYPE_LONG && A.TYPE_LONG[code]) || code;
  };
  function catalogTarget(row, b, a) {
    const id = String(row.entityId || '');
    if (row.entityKind === 'position') return `Chức vụ: ${esc(a.name || b.name || positionName(id))}`;
    if (row.entityKind === 'position-level') {
      const [code, level] = id.split(':');
      return `Chức vụ: ${esc(positionName(code))} · Bậc ${esc(a.level ?? b.level ?? level ?? '')}`;
    }
    return `Ca: ${esc(a.name || b.name || id)}`;
  }
  /* Quyền lợi: chỉ nêu cờ vừa bật, vừa tắt (danh sách đủ quá dài, bị cắt mất phần đổi) */
  function benefitDiff(was, now) {
    const label = (A.CatalogPositions && A.CatalogPositions.benefitLabel) || (code => code);
    const codes = [...new Set([...Object.keys(was), ...Object.keys(now)])];
    const on = codes.filter(c => now[c] === true && was[c] !== true).map(label);
    const off = codes.filter(c => was[c] === true && now[c] !== true).map(label);
    const parts = [];
    if (on.length) parts.push(`bật ${on.join(', ')}`);
    if (off.length) parts.push(`tắt ${off.join(', ')}`);
    return esc(parts.join('; ') || 'không đổi');
  }
  /* Một dòng "Tên: cũ → mới". Trạng thái luôn ghi đủ hai đầu; dòng không có "cũ" (tạo mới) thì các trường khác chỉ ghi giá trị mới */
  function lines(row, max = SUMMARY_FIELDS) {
    const hasBefore = isObj(row.before);
    const b = hasBefore ? row.before : {},
      a = isObj(row.after) ? row.after : {};
    const catalog = CATALOG_KINDS.has(row.entityKind);
    const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
    const same = k => JSON.stringify(own(b, k)) === JSON.stringify(own(a, k));
    // Danh mục ghi cả dòng (mọi trường) vào before/after: khi sửa chỉ hiện trường đã đổi, nếu không bảng (2 trường đầu) chỉ thấy
    // mã và tên còn số vừa sửa (lương cơ bản…) bị dồn vào "và N trường khác". Mã, mã cũ, số bậc thay bằng một dòng "đối tượng" ở đầu
    const skip = k =>
      MARK_FIELDS.has(k) || (catalog && (CATALOG_SKIP.has(k) || CATALOG_ID.has(k) || (hasBefore && same(k))));
    const all = [...new Set([...Object.keys(b), ...Object.keys(a)])];
    // Hồ sơ (bảng): họ/tên riêng đã gộp trong "Họ tên" khi tên đổi, bỏ để tình trạng HĐ, ngày nghỉ việc không bị dồn vào
    // "và N trường khác"; xem chi tiết (max = Infinity) vẫn hiện đủ
    const staffName = Number.isFinite(max) && row.entityKind === 'staff' && all.includes('name');
    const keys = all
      .filter(k => !skip(k) && !(staffName && STAFF_NAME_PARTS.has(k)))
      .sort((x, y) => keyRank(x, row) - keyRank(y, row));
    const out = [];
    if (row.entityKind === 'param' && row.entityId) out.push(`Mục: ${paramName(row.entityId)}`);
    if (catalog) out.push(catalogTarget(row, b, a));
    for (const k of keys) {
      const label = fieldTxt(k, row);
      const name = label ? esc(label) : `<code>${esc(k)}</code>`;
      const was = Object.hasOwn(b, k) ? b[k] : undefined,
        now = Object.hasOwn(a, k) ? a[k] : undefined;
      if (k === 'rule' && typeof now === 'string' && was === undefined) {
        out.push(`${name}: ${ruleTxt(now)}`);
        continue;
      }
      if (k === 'benefits' && isObj(was) && isObj(now)) {
        out.push(`Quyền lợi: ${benefitDiff(was, now)}`); // nhãn 'đang bật' không hợp với 'tắt …'
        continue;
      }
      const single = same(k) || (!hasBefore && k !== 'status');
      const one = v => esc(short(valText(k, v, row)));
      out.push(single ? `${name}: ${one(now === undefined ? was : now)}` : `${name}: ${one(was)} → ${one(now)}`);
    }
    if (!out.length) return '—';
    // dòng "đối tượng" của danh mục không tính vào số trường hiện, nếu không chỉ còn một chỗ cho số vừa sửa
    const shown = out.slice(0, catalog ? max + 1 : max);
    const more = out.length - shown.length;
    if (more) shown[shown.length - 1] += ` · và ${nf(more)} trường khác`;
    return shown.map(t => `<div>${t}</div>`).join('');
  }

  /* ---------- màn ---------- */
  function filtersHtml() {
    const d = NK.draft;
    const people = (A.staff.list || [])
      .map(
        s => `<option value="${esc(s.username)}" ${d.actor === s.username ? 'selected' : ''}>${esc(s.name)}</option>`
      )
      .join('');
    const kinds = Object.entries(ENTITY_TXT)
      .map(([k, t]) => `<option value="${esc(k)}" ${d.entity === k ? 'selected' : ''}>${esc(t)}</option>`)
      .join('');
    const field = (id, label, control) =>
      `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}</label>${control}</div>`;
    const dis = NK.state === 'loading' ? 'disabled' : '';
    return `<form data-nkform class="nk-flt" aria-label="Lọc nhật ký">
${field('nk-actor', 'Người', `<select id="nk-actor" class="input" data-input="nkf" data-k="actor"><option value="">Tất cả</option>${people}</select>`)}
${field('nk-entity', 'Mục', `<select id="nk-entity" class="input" data-input="nkf" data-k="entity"><option value="">Tất cả</option>${kinds}</select>`)}
${field('nk-from', 'Từ ngày', `<input id="nk-from" class="input" type="date" value="${esc(d.from)}" data-input="nkf" data-k="from">`)}
${field('nk-to', 'Đến ngày', `<input id="nk-to" class="input" type="date" value="${esc(d.to)}" data-input="nkf" data-k="to">`)}
<div class="nk-fb"><button class="btn sm pri" type="submit" ${dis}>${ic('search', 16)}Lọc</button><button class="btn sm" type="button" data-act="nkclear" ${dis}>Xoá lọc</button></div></form>`;
  }
  /* Gộp các dòng liền nhau giống hệt nhau (cùng ngày, người, việc, thay đổi, lý do) thành một dòng "× N", bấm "Mở ra" để xem đủ */
  function groups(rows) {
    const out = [];
    for (const r of rows) {
      const p = vnParts(r.at);
      const key = JSON.stringify([
        p && p.day,
        r.actor,
        r.action,
        r.reason || '',
        lines(r),
        isSelf(r),
        otherWarnings(r)
      ]);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, rows: [r], day: p && p.day, dow: p && p.dow });
    }
    return out;
  }
  function rowHtml(r, extra) {
    const p = vnParts(r.at);
    const nm = nameOf(r.actor);
    const who = r.actor
      ? `<div class="t">${esc(nm || r.actor)}</div>${nm ? `<div class="s">${esc(r.actor)}</div>` : ''}`
      : '—';
    // Nhãn của việc: tự làm về chính mình (máy chủ đánh dấu after.self) và lần lưu có cảnh báo (after.warnings)
    const nWarn = otherWarnings(r);
    const marks =
      isSelf(r) || nWarn
        ? `<div class="row wrap" style="gap:6px;margin-top:4px">${isSelf(r) ? A.pill('pending', 'Tự thực hiện') : ''}${nWarn ? `<span title="${esc(`Lần lưu này có ${nWarn} cảnh báo của máy chủ`)}">${A.pill('line', 'Lưu kèm cảnh báo')}</span>` : ''}</div>`
        : '';
    return `<tr><td class="tm" data-label="Lúc"><span title="${esc(A.fmtStamp(r.at))}">${esc(p ? p.hm : '—')}</span></td><td data-label="Người">${who}</td><td class="v" data-label="Việc">${esc(actionTxt(r.action))}${extra || ''}${marks}</td><td class="df" data-label="Thay đổi">${lines(r)}</td><td class="ly" data-label="Lý do">${r.reason ? `<span class="nk-ly" title="${esc(r.reason)}">${esc(r.reason)}</span>` : '—'}</td></tr>`;
  }
  function tableHtml() {
    if (NK.state === 'fail') return `<div class="nk-pad">${A.errorBox(NK.error)}</div>`;
    let day = null;
    let body = '';
    for (const g of groups(NK.rows)) {
      if (g.day && g.day !== day) {
        day = g.day;
        body += `<tr class="nk-day"><td colspan="5">${esc(WD_LONG[g.dow])}, ${esc(A.fmtDate(g.day))}</td></tr>`;
      }
      const first = g.rows[0];
      const id = String(first.id ?? first.at);
      if (g.rows.length === 1) body += rowHtml(first);
      else if (!NK.open.has(id))
        body += rowHtml(
          first,
          ` <span class="nk-x">× ${nf(g.rows.length)}</span><div class="s">${nf(g.rows.length)} dòng giống nhau được gộp · <button type="button" class="link" data-act="nkexp" data-id="${esc(id)}">Mở ra</button></div>`
        );
      else
        body += g.rows
          .map((r, i) =>
            rowHtml(
              r,
              i
                ? ''
                : `<div class="s">${nf(g.rows.length)} dòng giống nhau · <button type="button" class="link" data-act="nkexp" data-id="${esc(id)}">Thu gọn</button></div>`
            )
          )
          .join('');
    }
    const filtered = FILTER_KEYS.some(k => NK.applied[k]);
    const start = NK.page * PAGE_SIZE;
    const pages = Math.max(1, Math.ceil((NK.total || 0) / PAGE_SIZE));
    const busy = NK.state === 'loading';
    const info = NK.rows.length
      ? NK.page === 0
        ? `${nf(NK.rows.length)} dòng đầu trên ${nf(NK.total)}`
        : `Dòng ${nf(start + 1)}–${nf(start + NK.rows.length)} trên ${nf(NK.total)}`
      : `${nf(NK.total)} dòng`;
    return `<div class="nk-tw"><table class="rtable nk-lg"><colgroup><col class="c-tm"><col class="c-who"><col class="c-v"><col><col class="c-ly"></colgroup><thead><tr><th>Lúc</th><th>Người</th><th>Việc</th><th>Thay đổi</th><th>Lý do</th></tr></thead><tbody>${
      busy && !NK.rows.length
        ? A.skelRows(5, 6)
        : body ||
          `<tr><td colspan="5">${A.empty(filtered ? 'Không có dòng nào khớp bộ lọc' : 'Chưa có dòng nhật ký nào')}</td></tr>`
    }</tbody></table></div>
<div class="card-f nk-foot" ${busy ? 'aria-busy="true"' : ''}><span>${info}</span><span class="cdv-pg"><span>Trang ${nf(NK.page + 1)}/${nf(Math.max(pages, NK.page + 1))}</span><button type="button" class="cdv-pb" data-act="nkpage" data-p="${NK.page - 1}" ${NK.page <= 0 || busy ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="cdv-pb" data-act="nkpage" data-p="${NK.page + 1}" ${NK.next === null || busy ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></span></div>`;
  }
  function render() {
    if (!can()) return `<section class="card flush">${A.empty('Bạn chưa có quyền xem nhật ký thay đổi')}</section>`;
    Promise.resolve().then(mountActs);
    return `<div class="nk-root"><div class="nk-live" aria-live="polite">${verifyHtml()}</div>
<section class="card flush nk-card">${filtersHtml()}${tableHtml()}</section></div>`;
  }
  /* Dòng phụ dưới tiêu đề "Cài đặt" */
  function sub() {
    if (!can() || NK.state === 'idle' || NK.state === 'fail' || (NK.state === 'loading' && !NK.rows.length)) return '';
    const filtered = FILTER_KEYS.some(k => NK.applied[k]);
    return `${nf(NK.total)} dòng${filtered ? ' khớp bộ lọc' : ''} · ghi lại ai làm gì, lúc nào, đổi từ gì sang gì`;
  }

  /* Mô tả một dòng nhật ký cho chỗ khác dùng lại (Lịch sử thay đổi trong hồ sơ, staff-history.js): chữ của việc và mọi trường đổi
     (HTML đã qua esc), cùng cờ tự làm và số cảnh báo; không đụng trạng thái của màn này */
  const describe = row => ({
    action: actionTxt(row.action),
    changes: lines(row, Infinity),
    self: isSelf(row),
    warnings: otherWarnings(row)
  });

  A.NhatKy = { load, render, sub, actionText: actionTxt, isSelf, describe };
})(window.Admin);
