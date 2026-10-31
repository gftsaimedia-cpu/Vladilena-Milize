/* Màn Cài đặt › Phân quyền: hai tab Vai trò,
   Tài khoản. Khung gọi A.PhanQuyen.render() (trả HTML, tự gắn vào #pq-host) và A.PhanQuyen.sub() (dòng phụ dưới tiêu đề "Cài đặt").
   Vai trò và ai giữ vai trò nào: GET /api/roles; gán vai trò kèm lý do: PUT /api/staff/:username/roles { roles, reason, expectedRev? }; khoá, mở khoá: PUT /api/staff/:username { locked };
   tạo tài khoản: PUT /api/staff/:username với payrollSubject: false (không vào bảng lương, không chấm công; người cần tính lương thêm ở
   Nhân sự). Ma trận khu vực × Không/Xem/Sửa suy từ năng lực thật của vai trò. Sửa, tạo, sao chép, ngưng dùng vai trò
   hiện cổng đọc phòng thủ: chỉ bật khi máy chủ báo vai trò là dữ liệu (editable, hoặc vai trò có system/custom/active/perms), chưa có route (404, 405, 403 NO_ROUTE_POLICY)
   thì hiện "Đang cập nhật". Mọi luật (không tự bỏ quyền Admin của mình, không bỏ Admin cuối cùng, vai trò lạ) do máy chủ kiểm, lỗi hiện nguyên văn.
   Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic } = A;

  const REASON_MAX = 300;
  /* Nhãn hiển thị (không phải luật): vai trò và năng lực theo tên máy chủ dùng trong lib/authz.js */
  const ROLE_TXT = {
    admin: 'Admin',
    cb: 'C&B',
    accounting: 'Kế toán',
    hr: 'Nhân sự',
    manager: 'Quản lý',
    staff: 'Nhân viên'
  };
  const CAP_TXT = {
    'profile.read': 'Xem hồ sơ',
    'profile.write': 'Sửa hồ sơ',
    'profile.read.pii': 'Xem dữ liệu cá nhân',
    'profile.sensitive.read': 'Xem số tài khoản, mã số thuế',
    'profile.sensitive.write': 'Sửa số tài khoản, mã số thuế',
    'contract.read': 'Xem hợp đồng',
    'contract.write': 'Sửa hợp đồng',
    'salary.read': 'Xem lương',
    'salary.write': 'Sửa lương',
    'attendance.read': 'Xem chấm công',
    'attendance.correct': 'Sửa chấm công',
    'attendance.lock': 'Chốt công',
    'attendance.import': 'Nhập chấm công',
    'kpi.score.write': 'Nhập điểm KPI',
    'payroll.view': 'Xem bảng lương',
    'payroll.calculate': 'Tính lương',
    'payroll.approve': 'Phê duyệt phiếu và kỳ lương',
    'payroll.override': 'Sửa số trên phiếu',
    'payroll.pay': 'Đánh dấu đã trả lương',
    'period.reopen': 'Mở lại kỳ (về đã tính lương)',
    'period.reopen.inputs': 'Mở lại kỳ (về chốt công, chưa tính lương)',
    'config.read': 'Xem cấu hình',
    'config.payroll': 'Sửa cấu hình lương',
    'config.legal': 'Sửa tham số luật',
    'config.profile': 'Sửa cấu hình hồ sơ',
    'ai.review.read': 'Xem cảnh báo AI',
    'ai.review.dismiss': 'Bỏ qua cảnh báo AI',
    'audit.read': 'Xem nhật ký thay đổi',
    'report.read': 'Xem báo cáo',
    'report.export': 'Xuất báo cáo',
    'roles.manage': 'Quản lý vai trò',
    'staff.lock': 'Khoá, mở khoá tài khoản',
    'request.decide.*': 'Xử lý mọi loại yêu cầu'
  };
  const capLabel = c =>
    CAP_TXT[c] ||
    (String(c).startsWith('request.decide.')
      ? `Xử lý yêu cầu nhóm "${String(c).slice('request.decide.'.length)}"`
      : String(c));
  const CAP_ORDER = Object.keys(CAP_TXT);
  const byCapOrder = (a, b) => {
    const ia = CAP_ORDER.indexOf(a),
      ib = CAP_ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || String(a).localeCompare(String(b));
  };
  const roleLabel = r => r.label || ROLE_TXT[r.id] || r.id;
  /* Tên khu vực và loại yêu cầu; khu vực lạ giữ nhãn máy chủ */
  const AREA_TXT = {
    profile: 'Nhân sự',
    attendance: 'Chấm công & phép',
    pay: 'Bảng lương',
    kpi: 'Đánh giá KPI',
    report: 'Báo cáo',
    settings_formula: 'Cách tính lương & chế độ',
    settings_tax: 'Bảo hiểm & thuế',
    settings_period: 'Lịch, ca & chấm công',
    access: 'Phân quyền & tài khoản'
  };
  const areaLabel = a => AREA_TXT[a.id] || a.label || a.id;
  const ITEM_TXT = { ot: 'OT' };
  const itemLabel = x => ITEM_TXT[x.id] || x.label || x.id;

  const PQ = { state: 'idle', data: null, error: '' };
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));

  /* ---------- đọc phản hồi ---------- */
  function normalize(d) {
    const raw = (d && (d.roles || d.items)) || [];
    const list = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([id, v]) => ({ id, ...(Array.isArray(v) ? { caps: v } : v) }));
    const roles = list.map(r => ({
      id: String(r.id ?? r.code ?? r.key ?? r.role ?? r.name ?? ''),
      label: r.label || (r.name && r.id ? r.name : null),
      caps: Array.isArray(r.caps) ? r.caps : Array.isArray(r.capabilities) ? r.capabilities : [],
      scope: r.scope || null,
      perms: r.perms && typeof r.perms === 'object' ? r.perms : null,
      approve: Array.isArray(r.approve) ? r.approve : Array.isArray(r.approvals) ? r.approvals : null,
      extras: Array.isArray(r.extras) ? r.extras : null,
      system: r.system ?? r.builtin ?? null,
      editable: r.editable === true && r.readOnly !== true,
      isDefault: !!r.isDefault,
      deprecated: r.deprecated === true || r.active === false,
      users: Number.isInteger(r.users) ? r.users : null,
      rev: r.rev ?? null
    }));
    const sraw = (d && (d.staff || d.users || d.assignments || d.members)) || [];
    const people = (
      Array.isArray(sraw)
        ? sraw
        : Object.entries(sraw).map(([username, v]) => ({ username, ...(Array.isArray(v) ? { roles: v } : v) }))
    ).map(s => ({
      username: String(s.username),
      name: s.name || (A.staff.byUser.get(s.username) || {}).name || s.username,
      roles: Array.isArray(s.roles)
        ? s.roles.map(x => (typeof x === 'string' ? x : String(x.id ?? x.code ?? x.role)))
        : [],
      rev: s.rev ?? s.rolesRev ?? null,
      locked: !!s.locked
    }));
    const capsList = Array.isArray(d && (d.caps || d.capabilities)) ? d.caps || d.capabilities : null;
    const caps = capsList || [...new Set(roles.flatMap(r => r.caps))];
    caps.sort(byCapOrder);
    /* Khu vực, việc khác, loại yêu cầu, phạm vi và giới hạn độ dài đều do máy chủ khai (GET /api/roles); không khai lại ở đây */
    const areas = Array.isArray(d && d.areas) ? d.areas : [];
    const extras = Array.isArray(d && d.extras) ? d.extras : [];
    const approvalItems = Array.isArray(d && d.approvalItems) ? d.approvalItems : [];
    const scopes = Array.isArray(d && d.scopes) ? d.scopes : [];
    const limits = (d && d.limits) || {};
    return {
      roles,
      people,
      caps,
      areas,
      extras,
      approvalItems,
      scopes,
      limits,
      rev: d && d.rev !== undefined ? d.rev : null
    };
  }

  async function load() {
    PQ.state = 'loading';
    PQ.error = '';
    try {
      const staffP = A.loadStaff().catch(() => {});
      let res;
      try {
        res = await A.api('GET', '/roles');
      } finally {
        await staffP; // cả hai nhánh (có route hay chưa) đều cần danh sách tài khoản
      }
      PQ.data = normalize(res);
      PQ.state = 'ok';
    } catch (e) {
      PQ.state = missingRoute(e) ? 'na' : 'fail';
      PQ.error = A.errText(e);
    }
  }

  /* ---------- ô của hộp thoại: nhãn đậm 13, phần trong ngoặc chữ nhỏ xám ---------- */
  const fld = (id, label, control, small) =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</label>${control}</div>`;
  /* Lý do không bắt buộc, máy chủ nhận lý do trống */
  const reasonBox = () =>
    fld(
      'pq-rr',
      'Lý do',
      `<textarea id="pq-rr" class="input" maxlength="${REASON_MAX}" placeholder="Ví dụ: Kế toán cần xem bảng lương để đối chiếu"></textarea>`,
      '(không bắt buộc)'
    );
  const readReason = api => {
    const reason = (api.root.querySelector('#pq-rr').value || '').trim();
    if (reason.length > REASON_MAX) throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`);
    return reason;
  };
  const DLG = { width: 560, cls: 'cdv-dlg' };

  /* ---------- đổi vai trò của một tài khoản (ô chọn trong bảng; kèm lý do không bắt buộc) ---------- */
  const roleIdOf = p => {
    const ids = PQ.data.roles.map(r => r.id);
    const base = new Set(PQ.data.roles.filter(r => r.isDefault).map(r => r.id)); // vai trò mặc định (staff) chỉ hiện khi không có vai trò thêm
    return p.roles.find(x => ids.includes(x) && !base.has(x)) || p.roles.find(x => ids.includes(x)) || p.roles[0] || '';
  };
  A.inputs.pqrole = el => {
    const p = PQ.data.people.find(x => x.username === el.dataset.u);
    if (!p) return;
    const from = roleIdOf(p),
      to = el.value;
    el.value = from; // chỉ đổi sau khi máy chủ nhận
    if (!to || to === from) return;
    /* Vai trò mặc định (staff của nhân sự được trả lương) máy chủ không cho gỡ: ô chọn chỉ đổi vai trò thêm, giữ vai trò mặc định đang có */
    const keep = new Set(PQ.data.roles.filter(r => r.isDefault).map(r => r.id));
    const next = [...new Set([...p.roles.filter(x => x !== from || keep.has(x)), to])];
    const target = PQ.data.roles.find(r => r.id === to);
    A.openDialog({
      title: 'Gán vai trò',
      sub: `${p.name} (${p.username})${target ? ` · ${roleLabel(target)}` : ''}`,
      ...DLG,
      body: reasonBox(),
      foot: [
        { label: 'Huỷ', onClick: api => api.close() },
        {
          label: 'Lưu vai trò',
          cls: 'pri',
          icon: 'check',
          onClick: async api => {
            const reason = readReason(api);
            const body = { roles: next, reason, ...(p.rev !== null ? { expectedRev: p.rev } : {}) };
            try {
              await A.api('PUT', `/staff/${encodeURIComponent(p.username)}/roles`, body);
            } catch (e) {
              // 409: có người đổi trước. Tải lại danh sách phía sau hộp thoại, giữ nguyên lỗi của máy chủ để Admin đọc rồi mở lại.
              if (e && e.status === 409) load().then(paint);
              throw e;
            }
            api.close();
            A.toast(`Đã lưu vai trò của ${p.name}`);
            await load();
            paint();
          }
        }
      ]
    });
  };

  /* ---------- khu vực của ma trận: khu vực, việc khác, loại yêu cầu do máy chủ khai ---------- */
  const LEVEL_TXT = { khong: 'Không', xem: 'Xem', sua: 'Sửa' };
  const LEVEL_OF = { none: 'khong', view: 'xem', edit: 'sua' };
  const SCOPE_OPT = { all: 'Tất cả', team: 'Nhóm mình', self: 'Chỉ bản thân' };
  const areasOf = group => PQ.data.areas.filter(a => (a.group || 'main') === group);
  const scopesOf = () => (PQ.data.scopes.length ? PQ.data.scopes : Object.keys(SCOPE_OPT));

  const hasCap = (r, c) =>
    r.caps.includes(c) || (String(c).startsWith('request.decide.') && r.caps.includes('request.decide.*'));
  const levelOf = (r, a) => {
    if (r.perms && r.perms[a.id]) return r.perms[a.id];
    if (a.edit.some(c => hasCap(r, c))) return 'sua';
    if (a.view.some(c => hasCap(r, c))) return 'xem';
    return 'khong';
  };
  const approveOf = (r, code) =>
    Array.isArray(r.approve) ? r.approve.includes(code) : hasCap(r, 'request.decide.' + code);
  const extraOf = (r, cap) => (Array.isArray(r.extras) ? r.extras.includes(cap) : hasCap(r, cap));
  /* Tạo, sao chép: cần quyền quản lý vai trò và máy chủ đã khai khu vực (GET /api/roles). Sửa, ngưng dùng một vai trò: máy chủ báo vai trò đó editable (vai trò mặc định chỉ xem). */
  const manageOk = () => !!PQ.data && PQ.data.areas.length > 0 && can('roles.manage');
  const roleEditableOf = r => manageOk() && !!r.editable;
  const isFull = r => r.id === 'admin';

  /* ---------- trạng thái giao diện ---------- */
  const UI = { tab: 'vt', role: null, draft: null, q: '', filter: 'all', host: null, show: false, pwOn: false };
  const caps_ = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  function can(c) {
    const l = caps_();
    return !l || l.includes(c);
  }
  const selRole = () => {
    const roles = PQ.data.roles;
    return roles.find(r => r.id === UI.role) || roles[0];
  };
  const draftOf = r => (UI.draft && UI.draft.id === r.id ? UI.draft : null);
  const viewRole = r => {
    const d = draftOf(r);
    if (!d) return r;
    return {
      ...r,
      label: d.label ?? r.label,
      scope: d.scope ?? r.scope,
      perms: { ...(r.perms || {}), ...d.perms },
      approve: d.approve ?? r.approve,
      extras: d.extras ?? r.extras
    };
  };
  /* Bản nháp của vai trò đang xem: bắt đầu từ cách hiển thị hiện tại để gửi đủ, không chỉ phần đổi */
  function ensureDraft(r) {
    if (UI.draft && UI.draft.id === r.id) return UI.draft;
    UI.draft = {
      id: r.id,
      label: null,
      scope: null,
      perms: Object.fromEntries(PQ.data.areas.map(a => [a.id, levelOf(r, a)])),
      approve: PQ.data.approvalItems.filter(x => approveOf(r, x.id)).map(x => x.id),
      extras: PQ.data.extras.filter(x => extraOf(r, x.cap)).map(x => x.cap),
      touched: false
    };
    return UI.draft;
  }

  A.actions.pqtab = el => {
    UI.tab = el.dataset.t;
    paint();
  };
  /* Số thay đổi chưa lưu của vai trò đang sửa (so với giá trị máy chủ); bản nháp trùng bản đã lưu không tính */
  const draftCount = () => {
    const d = UI.draft;
    if (!d || !d.touched) return 0;
    const r = PQ.data && PQ.data.roles && PQ.data.roles.find(x => x.id === d.id);
    if (!r) return 1;
    const same = (a, b) => [...a].sort().join('|') === [...b].sort().join('|');
    let n = 0;
    for (const a of PQ.data.areas) if (d.perms[a.id] !== levelOf(r, a)) n++;
    if (
      !same(
        d.approve,
        PQ.data.approvalItems.filter(x => approveOf(r, x.id)).map(x => x.id)
      )
    )
      n++;
    if (
      !same(
        d.extras,
        PQ.data.extras.filter(x => extraOf(r, x.cap)).map(x => x.cap)
      )
    )
      n++;
    if (d.label !== null && d.label !== roleLabel(r)) n++;
    if (d.scope !== null && d.scope !== r.scope) n++;
    return n;
  };
  A.drafts.register('vai-tro', draftCount, ['roles']);
  A.actions.pqrole = el => {
    if (el.dataset.r === selRole().id) return;
    A.drafts.guard(
      () => {
        UI.role = el.dataset.r;
        UI.draft = null;
        paint();
      },
      { scope: 'roles', sub: 'Đổi sang vai trò khác' }
    );
  };
  A.actions.pqperm = el => {
    const r = selRole();
    if (!roleEditableOf(r)) return;
    const d = ensureDraft(r);
    d.perms[el.dataset.a] = el.dataset.v;
    d.touched = true;
    paint();
  };
  A.inputs.pqscope = el => {
    const r = selRole();
    if (!roleEditableOf(r)) return;
    const d = ensureDraft(r);
    d.scope = el.value;
    d.touched = true;
    paint();
  };
  A.inputs.pqname = el => {
    const r = selRole();
    if (!roleEditableOf(r)) return;
    const d = ensureDraft(r);
    d.label = el.value;
    d.touched = true;
    const bar = UI.host && UI.host.querySelector('#pq-bar');
    if (bar) {
      const html = barHtml(r);
      if (bar.innerHTML !== html) bar.innerHTML = html;
      bar.hidden = !html;
    }
  };
  A.inputs.pqapp = el => {
    const r = selRole();
    if (!roleEditableOf(r)) return;
    const d = ensureDraft(r);
    d.approve = el.checked ? [...new Set([...d.approve, el.dataset.k])] : d.approve.filter(x => x !== el.dataset.k);
    d.touched = true;
    paint();
  };
  A.inputs.pqext = el => {
    const r = selRole();
    if (!roleEditableOf(r)) return;
    const d = ensureDraft(r);
    d.extras = el.checked ? [...new Set([...d.extras, el.dataset.k])] : d.extras.filter(x => x !== el.dataset.k);
    d.touched = true;
    paint();
  };
  A.actions.pqundo = () => {
    UI.draft = null;
    paint();
  };
  /* Gọi máy chủ để lưu, tạo, ngưng dùng vai trò. Chưa có đường dẫn thì nói rõ "Đang cập nhật", không giả vờ đã lưu. */
  const ROLE_API = {
    save: (id, body) => A.api('PUT', '/roles/' + encodeURIComponent(id), body),
    create: body => A.api('POST', '/roles', body),
    retire: (id, body) => A.api('POST', '/roles/' + encodeURIComponent(id) + '/deprecate', body)
  };
  const wrapMissing = async fn => {
    try {
      return await fn();
    } catch (e) {
      if (missingRoute(e)) throw new Error('Đang cập nhật: máy chủ chưa nhận việc lưu vai trò.');
      if (e && e.status === 409 && e.data && e.data.code === 'ROLE_STALE') load().then(paint); // có người đổi trước: tải lại sau hộp thoại, giữ nguyên câu của máy chủ
      throw e;
    }
  };
  const labelMax = () => PQ.data.limits.labelMax || 40;
  const payloadOf = (r, d) => ({
    label: (d.label ?? roleLabel(r)).trim(),
    perms: d.perms,
    scope: d.scope ?? r.scope,
    approve: d.approve,
    extras: d.extras,
    ...(r.rev !== null && r.rev !== undefined ? { rev: r.rev } : {})
  });
  A.actions.pqsave = () => {
    const r = selRole(),
      d = draftOf(r);
    if (!d) return;
    const body = payloadOf(r, d);
    if (!body.label) return A.toast('Vai trò cần có tên.', 'err');
    A.openDialog({
      title: 'Lưu vai trò',
      sub: body.label,
      ...DLG,
      body: `${A.note('Đổi quyền của vai trò đổi quyền của mọi người đang giữ vai trò này. Thay đổi ghi vào nhật ký kèm lý do.', 'alert')}${reasonBox()}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Lưu vai trò',
          cls: 'pri',
          icon: 'check',
          onClick: async api => {
            const reason = readReason(api);
            await wrapMissing(() => ROLE_API.save(r.id, { ...body, reason }));
            api.close();
            UI.draft = null;
            A.toast('Đã lưu vai trò');
            await load();
            paint();
          }
        }
      ]
    });
  };
  const newRoleDialog = copy => {
    const src = copy ? selRole() : null;
    A.openDialog({
      title: copy ? 'Sao chép thành vai trò mới' : 'Tạo vai trò',
      sub: copy
        ? `Từ vai trò ${roleLabel(src)} · sửa quyền sau khi tạo`
        : 'Vai trò mới bắt đầu không có quyền nào · tick quyền sau khi tạo',
      ...DLG,
      body: `${fld('pq-nn', 'Tên vai trò', `<input id="pq-nn" class="input" maxlength="${esc(labelMax())}" value="${copy ? esc((roleLabel(src) + ' (bản sao)').slice(0, labelMax())) : ''}" placeholder="Ví dụ: Trưởng nhóm C&B" autocomplete="off">`)}${reasonBox()}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: copy ? 'Sao chép' : 'Tạo vai trò',
          cls: 'pri',
          icon: 'plus',
          onClick: async api => {
            const label = api.root.querySelector('#pq-nn').value.trim();
            if (!label) throw new Error('Nhập tên vai trò.');
            const reason = readReason(api);
            const res = await wrapMissing(() =>
              ROLE_API.create({ label, ...(copy ? { copyFrom: src.id } : {}), reason })
            );
            api.close();
            A.toast('Đã tạo vai trò');
            await load();
            const made = res && ((res.role && (res.role.id || res.role.code)) || res.id || res.code);
            if (made) UI.role = made;
            UI.draft = null;
            paint();
          }
        }
      ]
    });
  };
  /* Tạo hoặc sao chép vai trò chuyển sang vai trò mới và bỏ bản nháp đang sửa: hỏi trước */
  A.actions.pqnew = () => A.drafts.guard(() => newRoleDialog(false), { scope: 'roles', sub: 'Tạo vai trò mới' });
  A.actions.pqcopy = () => A.drafts.guard(() => newRoleDialog(true), { scope: 'roles', sub: 'Sao chép vai trò' });
  A.actions.pqretire = () => {
    const r = selRole();
    A.openDialog({
      title: 'Xoá vai trò',
      sub: roleLabel(r),
      ...DLG,
      body: `${A.note('Vai trò ngưng dùng không gán thêm được. Lịch sử và nhật ký được giữ nguyên.', 'alert')}${reasonBox()}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Xoá vai trò',
          cls: 'danger',
          onClick: async api => {
            const reason = readReason(api);
            await wrapMissing(() =>
              ROLE_API.retire(r.id, { reason, ...(r.rev !== null && r.rev !== undefined ? { rev: r.rev } : {}) })
            );
            api.close();
            UI.role = null;
            UI.draft = null;
            A.toast('Đã xoá vai trò');
            await load();
            paint();
          }
        }
      ]
    });
  };

  /* ---------- tab Vai trò ---------- */
  const holders = r => PQ.data.people.filter(p => p.roles.includes(r.id)).length;
  const holdersOf = r => (r.users !== null ? r.users : holders(r));
  function seg(a, lvl, dis) {
    const opts = (a.levels && a.levels.length ? a.levels : ['none', 'view', 'edit'])
      .map(k => LEVEL_OF[k])
      .filter(Boolean);
    return `<span class="pq-seg${dis ? ' lk' : ''}" role="group" aria-label="${esc(areaLabel(a))}">${opts
      .map(
        k =>
          `<button type="button" class="${lvl === k ? 'on' : ''}" aria-pressed="${lvl === k}" data-act="pqperm" data-a="${esc(a.id)}" data-v="${k}" ${dis ? 'disabled' : ''}>${LEVEL_TXT[k]}</button>`
      )
      .join('')}</span>`;
  }
  /* Thanh lưu dưới ma trận: chỉ hiện khi vai trò đang sửa có thay đổi */
  const barHtml = r => {
    const d = draftOf(r);
    if (!d || !d.touched) return '';
    const n = draftCount();
    return `<span>${n ? `<b>${nf(n)} thay đổi chưa lưu</b>` : 'Chưa có thay đổi'}</span><span class="sp"></span><button class="btn sm" type="button" data-act="pqundo">Hoàn tác</button><button class="btn pri sm" type="button" data-act="pqsave">${ic('check', 16)}Lưu vai trò</button>`;
  };
  function tabVaiTro() {
    const roles = PQ.data.roles.filter(x => !x.deprecated || x.id === UI.role);
    const base = selRole();
    const r = viewRole(base);
    const edit = roleEditableOf(base);
    const full = isFull(base);
    const chips = roles
      .map(x => {
        const on = x.id === base.id;
        const tag = on
          ? `${x.isDefault ? 'mặc định · ' : ''}${nf(holdersOf(x))} tài khoản`
          : x.isDefault
            ? 'mặc định'
            : x.deprecated
              ? 'ngưng dùng'
              : '';
        return `<button type="button" class="chip${on ? ' on' : ''}" aria-pressed="${on}" data-act="pqrole" data-r="${esc(x.id)}">${esc(roleLabel(x))}${tag ? ` <small>${esc(tag)}</small>` : ''}</button>`;
      })
      .join('');
    const addBtn = manageOk()
      ? `<button type="button" class="pq-add" data-act="pqnew">${ic('plus', 14)}Tạo vai trò</button>`
      : '';
    const scopeCell = a => {
      if (a.group === 'settings' || !a.scoped || levelOf(r, a) === 'khong') return '<span class="pq-dash">—</span>';
      const cur = r.scope || 'all';
      return `<select class="input sm pq-sel" data-input="pqscope" aria-label="Phạm vi: ${esc(areaLabel(a))}" ${edit ? '' : 'disabled'}>${scopesOf()
        .map(k => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(SCOPE_OPT[k] || k)}</option>`)
        .join('')}</select>`;
    };
    const row = a =>
      `<tr><td class="k">${esc(areaLabel(a))}</td><td>${seg(a, levelOf(r, a), !edit)}</td><td>${scopeCell(a)}</td></tr>`;
    const n = holdersOf(base);
    const retireOk = edit && !base.isDefault && !base.deprecated && n === 0;
    const retireTip = n ? `Còn ${nf(n)} tài khoản giữ vai trò này` : '';
    const lockPill = txt => `<span class="pill p-lock">${ic('lock', 12)}${esc(txt)}</span>`;
    const tag = full
      ? lockPill('Toàn quyền, không sửa được')
      : base.deprecated
        ? lockPill('Đã ngưng dùng')
        : !edit
          ? lockPill(base.isDefault ? 'Vai trò mặc định, không sửa được' : 'Vai trò có sẵn, không sửa được')
          : '';
    const name = edit
      ? `<input class="input pq-nm" value="${esc(draftOf(base)?.label ?? roleLabel(base))}" maxlength="${esc(labelMax())}" data-input="pqname" aria-label="Tên vai trò">`
      : `<h3>${esc(roleLabel(base))}</h3>`;
    const links = `${manageOk() ? '<button type="button" class="link" data-act="pqcopy">Sao chép thành vai trò mới</button>' : ''}${edit && !base.isDefault ? `<button type="button" class="link dang" data-act="pqretire" ${retireOk ? '' : 'disabled'} ${retireTip ? `title="${esc(retireTip)}"` : ''}>Xoá vai trò</button>` : ''}`;
    const head = `<div class="pq-rh">${name}${tag}<span class="pq-hacts">${links}</span></div>`;
    const chk = (act, k, txt, on) =>
      `<label class="pq-ck"><input type="checkbox" class="pq-cbx" data-input="${act}" data-k="${esc(k)}" ${on ? 'checked' : ''} ${edit ? '' : 'disabled'}><span>${esc(txt)}</span></label>`;
    const exMain = PQ.data.extras.filter(x => x.design !== false);
    const side = `<div class="pq-side"><h4>Được xử lý yêu cầu</h4>${PQ.data.approvalItems.map(x => chk('pqapp', x.id, itemLabel(x), approveOf(r, x.id))).join('')}
<h4 class="mt">Việc khác</h4>${exMain.map(x => chk('pqext', x.cap, x.label, extraOf(r, x.cap))).join('')}</div>`;
    const table = `<table class="pq-pt"><colgroup><col><col class="c-lv"><col class="c-sc"></colgroup><thead><tr><th>Khu vực</th><th>Quyền</th><th>Phạm vi</th></tr></thead><tbody><tr class="gh"><td colspan="3">Màn làm việc</td></tr>${areasOf('main').map(row).join('')}<tr class="gh"><td colspan="3">Cài đặt</td></tr>${areasOf('settings').map(row).join('')}</tbody></table>`;
    const bar = barHtml(base);
    return `<div class="pq-roles" role="group" aria-label="Vai trò">${chips}${addBtn}</div>${head}
<div class="pq-grid"><div class="l"><div class="pq-tw">${table}</div></div>${side}</div>
<div class="card-f pq-bar" id="pq-bar" ${bar ? '' : 'hidden'}>${bar}</div>`;
  }

  /* ---------- tab Tài khoản ---------- */
  const PAGE = 10;
  const slug = s =>
    A.fold(s)
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '');
  A.inputs.pqq = el => {
    UI.q = el.value;
    S_page(1);
    paintKeep('pq-q');
  };
  const S_page = n => (A.S.page['pq-ac'] = n);
  A.actions.pqfilter = el => {
    UI.filter = el.dataset.v;
    S_page(1);
    paint();
  };
  function paintKeep(id) {
    const a = document.getElementById(id);
    const pos = a && a.selectionStart;
    paint();
    const b = document.getElementById(id);
    if (b) {
      b.focus();
      if (pos != null) b.setSelectionRange(pos, pos);
    }
  }
  A.actions.pqlock = el => {
    const p = PQ.data.people.find(x => x.username === el.dataset.u);
    if (!p) return;
    const lock = !p.locked;
    A.confirmDialog({
      title: lock ? 'Khoá tài khoản' : 'Mở khoá tài khoản',
      sub: p.name,
      body: A.note(
        lock
          ? 'Người này không đăng nhập được và mọi phiên cũ hết hiệu lực. Lịch sử chấm công và lương được giữ nguyên; tài khoản không bị xoá.'
          : 'Người này đăng nhập lại được bằng mật khẩu hiện tại.'
      ),
      label: lock ? 'Khoá tài khoản' : 'Mở khoá',
      cls: lock ? 'danger' : 'pri',
      onConfirm: async () => {
        await A.api('PUT', '/staff/' + encodeURIComponent(p.username), { locked: lock });
        A.toast(lock ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản');
        await load();
        paint();
      }
    });
  };
  /* Dòng phụ dưới tên: Admin, tài khoản không vào bảng lương, hoặc loại · chức danh/bậc của người trong Nhân sự */
  const whoSub = (p, s) => {
    if (s.role === 'admin' || p.roles.includes('admin')) return 'Admin';
    if (s.payrollSubject === false) return 'Không vào bảng lương';
    if (!s.type) return '';
    const lv = s.jobTitle || (s.level ? A.levelLabel(s, A.S.month) : '');
    return [A.typeShort(s), lv].filter(Boolean).join(' · ');
  };
  function tabTaiKhoan() {
    const { roles, people } = PQ.data;
    const byRole = new Map(roles.map(r => [r.id, r]));
    const q = A.fold(UI.q.trim());
    const list = people.filter(
      p =>
        (UI.filter === 'all' || p.roles.includes(UI.filter)) &&
        (!q || A.fold(p.name).includes(q) || p.username.includes(q))
    );
    const pg = A.pager('pq-ac', list.length, PAGE);
    const canAssign = can('roles.manage'),
      canLock = can('staff.lock'),
      canCreate = can('profile.write');
    const me = (A.S.me || {}).username;
    const rows = pg
      .slice(list)
      .map(p => {
        const s = A.staff.byUser.get(p.username) || {};
        const sub = whoSub(p, s);
        const cur = roleIdOf(p);
        const opts = roles.filter(r => !r.deprecated || r.id === cur);
        const roleCell = canAssign
          ? `<select class="input sm pq-rsel" data-input="pqrole" data-u="${esc(p.username)}" aria-label="Vai trò của ${esc(p.name)}">${cur ? '' : '<option value="" selected></option>'}${opts.map(r => `<option value="${esc(r.id)}" ${r.id === cur ? 'selected' : ''}>${esc(roleLabel(r))}</option>`).join('')}</select>`
          : esc(byRole.has(cur) ? roleLabel(byRole.get(cur)) : cur);
        const mine = p.username === me;
        const acts = `${canAssign ? `<button type="button" class="tact" data-act="pqreset" data-u="${esc(p.username)}" ${mine ? 'disabled title="Đổi mật khẩu của chính bạn ở menu tài khoản"' : ''}>Đặt lại mật khẩu</button>` : ''}${canLock && !(mine && !p.locked) ? `<button type="button" class="tact${p.locked ? '' : ' dang'}" data-act="pqlock" data-u="${esc(p.username)}">${p.locked ? 'Mở khoá' : 'Khoá'}</button>` : ''}`;
        return `<tr><td class="who" data-label="Người"><div class="pq-who">${A.avatar(p.name)}<div class="col"><span class="t">${esc(p.name)}${mine ? A.pill('draft', 'Bạn') : ''}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</div></div></td><td class="u" data-label="Tên đăng nhập">${esc(p.username)}</td><td data-label="Vai trò">${roleCell}</td><td data-label="Trạng thái">${p.locked ? A.pill('draft', 'Đã khoá') : '<span class="pq-on">Đang dùng</span>'}</td><td class="act"><span class="pq-acts">${acts}</span></td></tr>`;
      })
      .join('');
    /* Số trên nút lọc: tổng, và vai trò thêm đang có người giữ (vai trò mặc định ai cũng có nên không ghi số) */
    const countOf = r => people.filter(p => p.roles.includes(r.id)).length;
    const chips = [
      ['all', 'Tất cả', people.length],
      ...roles.filter(r => !r.deprecated).map(r => [r.id, roleLabel(r), r.isDefault ? 0 : countOf(r)])
    ]
      .map(
        ([k, n, c]) =>
          `<button type="button" class="chip ${UI.filter === k ? 'on' : ''}" data-act="pqfilter" data-v="${esc(k)}" aria-pressed="${UI.filter === k}">${esc(n)}${c ? ` <small>${nf(c)}</small>` : ''}</button>`
      )
      .join('');
    const pages = Math.max(1, Math.ceil(list.length / PAGE)),
      pageNo = Math.min(Math.max(1, A.S.page['pq-ac'] || 1), pages);
    const createBtn = `<button type="button" class="btn sm" data-act="pqnewacct">${ic('plus', 16)}Tạo tài khoản</button>`;
    const foot = `<div class="card-f pq-foot"><span>${list.length ? `${nf(pg.start + 1)}–${nf(pg.end)} trên ${nf(list.length)} tài khoản` : '0 tài khoản'}</span><span class="cdv-pg"><span>Trang ${nf(pageNo)}/${nf(pages)}</span><button type="button" class="cdv-pb" data-act="page" data-k="pq-ac" data-p="${pageNo - 1}" ${pageNo <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="cdv-pb" data-act="page" data-k="pq-ac" data-p="${pageNo + 1}" ${pageNo >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></span></div>`;
    return `<div class="pq-tools"><div class="chips" role="group" aria-label="Lọc theo vai trò">${chips}</div><label class="field pq-srch"><span class="sr">Tìm tài khoản</span>${ic('search', 16)}<input id="pq-q" class="input" type="search" placeholder="Tìm tên" value="${esc(UI.q)}" data-input="pqq" autocomplete="off"></label>${canCreate ? `<span class="pq-mob">${createBtn}</span>` : ''}</div>
<div class="pq-tw"><table class="rtable pq-tk"><colgroup><col class="c-who"><col class="c-u"><col class="c-r"><col class="c-st"><col></colgroup><thead><tr><th>Người</th><th>Tên đăng nhập</th><th>Vai trò</th><th>Trạng thái</th><th class="r">${canCreate ? createBtn : ''}</th></tr></thead><tbody>${rows || `<tr><td colspan="5">${A.empty('Không có tài khoản nào khớp')}</td></tr>`}</tbody></table></div>
${foot}`;
  }

  /* ---------- Đặt lại mật khẩu của người khác (POST /api/staff/:u/password { password, reason }, cần roles.manage) ---------- */
  A.actions.pqreset = el => {
    const p = PQ.data.people.find(x => x.username === el.dataset.u);
    if (!p) return;
    const pw = tempPassword();
    let show = false;
    A.openDialog({
      title: 'Đặt lại mật khẩu',
      sub: `${p.name} (${p.username})`,
      ...DLG,
      body: `${A.note('Người này phải đăng nhập lại bằng mật khẩu tạm bên dưới; các phiên đang mở của họ hết hiệu lực. Hãy gửi mật khẩu cho họ qua kênh riêng.', 'alert')}
<div class="formrow"><span class="lbl">Mật khẩu tạm</span><div class="row" style="gap:8px"><input id="rp-pw" class="input mono" readonly style="flex:1 1 auto" value="" aria-label="Mật khẩu tạm"><button type="button" class="btn sm" id="rp-show">${ic('eye', 15)}Hiện</button><button type="button" class="btn sm" id="rp-copy">Sao chép</button></div></div>
${reasonBox()}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Đặt lại mật khẩu',
          cls: 'danger',
          onClick: async api => {
            const reason = readReason(api);
            try {
              await A.api('POST', `/staff/${encodeURIComponent(p.username)}/password`, { password: pw, reason });
            } catch (e) {
              if (missingRoute(e)) throw new Error('Đang cập nhật: máy chủ chưa nhận việc đặt lại mật khẩu.');
              throw e;
            }
            api.close();
            A.toast(`Đã đặt lại mật khẩu của ${p.name}`);
          }
        }
      ],
      onMount: api => {
        const q = id => api.root.querySelector('#' + id);
        const sync = () => (q('rp-pw').value = show ? pw : '•'.repeat(pw.length));
        sync();
        q('rp-show').addEventListener('click', e => {
          show = !show;
          e.currentTarget.lastChild.textContent = show ? 'Ẩn' : 'Hiện';
          sync();
        });
        q('rp-copy').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(pw);
            A.toast('Đã sao chép mật khẩu tạm');
          } catch {
            show = true;
            sync();
            A.toast('Không sao chép được: hãy chọn và chép mật khẩu đang hiện.', 'err');
          }
        });
      }
    });
  };

  /* ---------- Tạo tài khoản (ngăn kéo bên phải) ---------- */
  const PW_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function tempPassword() {
    const buf = new Uint32Array(10);
    crypto.getRandomValues(buf);
    return [...buf].map(n => PW_CHARS[n % PW_CHARS.length]).join('');
  }
  const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;
  A.actions.pqnewacct = () => {
    let pw = tempPassword(),
      show = false,
      userTouched = false;
    /* Vai trò Nhân viên (vai trò mặc định) đứng đầu danh sách: có vai trò này là vào bảng lương, máy chủ gộp hai việc làm một */
    const def = PQ.data.roles.find(r => r.isDefault);
    const roles = [
      ...(def && !def.deprecated ? [def] : []),
      ...PQ.data.roles.filter(r => !r.deprecated && !r.isDefault && (r.id !== 'admin' || can('roles.manage')))
    ];
    const staffId = def ? def.id : 'staff';
    A.openDialog({
      title: 'Tạo tài khoản',
      sub: 'Chọn vai trò: có vai trò Nhân viên thì được tính lương',
      drawer: true,
      cls: 'cdv-dlg',
      body: `${fld('na-name', 'Họ tên', '<input id="na-name" class="input" maxlength="80" placeholder="Ví dụ: Nguyễn Văn A" autocomplete="off">')}
${fld('na-u', 'Tên đăng nhập', '<input id="na-u" class="input mono" maxlength="40" placeholder="Tự điền theo họ tên, sửa được" autocomplete="off">')}
${fld('na-role', 'Vai trò', `<select id="na-role" class="input" style="max-width:260px"><option value="">Chọn vai trò</option>${roles.map(r => `<option value="${esc(r.id)}">${esc(roleLabel(r))}</option>`).join('')}</select>`)}
<div class="formrow"><span class="lbl">Mật khẩu tạm</span><div class="row" style="gap:8px"><input id="na-pw" class="input mono" readonly style="flex:1 1 auto" value="" aria-label="Mật khẩu tạm"><button type="button" class="btn sm" id="na-show">${ic('eye', 15)}Hiện</button><button type="button" class="btn sm" id="na-copy">Sao chép</button></div><span class="cap">Gửi mật khẩu tạm cho người này qua kênh riêng.</span></div>
${A.note(`Tài khoản có vai trò <b>${esc(def ? roleLabel(def) : 'Nhân viên')}</b> là người trong bảng lương: có Check-in/out, lịch ước tính và phiếu lương. Tài khoản chỉ có vai trò khác thì <b>không vào bảng lương</b>, không Check-in/out và không có phiếu lương.`)}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Tạo tài khoản',
          cls: 'pri',
          icon: 'plus',
          onClick: async api => {
            const q = id => api.root.querySelector('#' + id);
            const name = q('na-name').value.trim(),
              username = q('na-u').value.trim().toLowerCase(),
              roleId = q('na-role').value;
            if (!name) throw new Error('Nhập họ tên.');
            if (!roleId) throw new Error('Chọn vai trò.');
            if (!USERNAME_RE.test(username))
              throw new Error('Tên đăng nhập: chữ thường, số, dấu . _ - (2 đến 40 ký tự), bắt đầu bằng chữ hoặc số.');
            if (A.staff.byUser.has(username)) throw new Error(`Tên đăng nhập "${username}" đã có.`);
            /* payrollSubject: có vai trò Nhân viên thì vào bảng lương; vai trò khác thì không (tránh tính như nhân sự: Thực tập sinh bậc 1, phiếu 0 ₫) */
            const inPayroll = roleId === staffId;
            await A.api('PUT', '/staff/' + encodeURIComponent(username), {
              name,
              role: roleId === 'admin' ? 'admin' : 'staff',
              payrollSubject: inPayroll,
              password: pw
            });
            if (roleId !== 'admin' && roleId !== staffId) {
              try {
                /* Giữ vai trò máy chủ đã suy ra cho người mới (ví dụ nhân viên mặc định): đặt lại danh sách là thay cả bộ */
                await load();
                const made = PQ.data.people.find(x => x.username === username);
                await A.api('PUT', `/staff/${encodeURIComponent(username)}/roles`, {
                  roles: [...new Set([...(made ? made.roles : []), roleId])],
                  ...(made && made.rev !== null ? { expectedRev: made.rev } : {}),
                  reason: 'Gán vai trò khi tạo tài khoản mới'
                });
              } catch (e) {
                await load();
                A.loadStaff(true).then(() => paint());
                throw new Error(
                  `Đã tạo tài khoản ${username} nhưng chưa gán được vai trò: ${A.errText(e)}. Gán lại ở danh sách tài khoản.`
                );
              }
            }
            api.close();
            A.toast(`Đã tạo tài khoản ${username}`);
            await Promise.all([load(), A.loadStaff(true)]);
            paint();
          }
        }
      ],
      onMount: api => {
        const q = id => api.root.querySelector('#' + id);
        const sync = () => (q('na-pw').value = show ? pw : '•'.repeat(pw.length));
        sync();
        q('na-name').addEventListener('input', () => {
          if (!userTouched) q('na-u').value = slug(q('na-name').value).slice(0, 40);
        });
        q('na-u').addEventListener('input', () => (userTouched = true));
        q('na-show').addEventListener('click', e => {
          show = !show;
          e.currentTarget.lastChild.textContent = show ? 'Ẩn' : 'Hiện';
          sync();
        });
        q('na-copy').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(pw);
            A.toast('Đã sao chép mật khẩu tạm');
          } catch {
            show = true;
            sync();
            A.toast('Không sao chép được: hãy chọn và chép mật khẩu đang hiện.', 'err');
          }
        });
      }
    });
  };

  /* ---------- vỏ ---------- */
  A.actions.pqhist = () =>
    A.actions.cdsec ? A.actions.cdsec({ dataset: { v: 'nhat-ky' } }) : A.go('cai-dat', 'nhat-ky');
  function shell(inner) {
    const d = PQ.data;
    const nRoles = d ? d.roles.filter(r => !r.deprecated).length : null;
    const nAcc = d ? d.people.length : null;
    const tabs = [
      ['vt', 'Vai trò', nRoles],
      ['tk', 'Tài khoản', nAcc]
    ]
      .map(
        ([k, n, c]) =>
          `<button type="button" role="tab" class="${UI.tab === k ? 'on' : ''}" aria-selected="${UI.tab === k}" data-act="pqtab" data-t="${k}">${n}${c !== null ? ` <small>${nf(c)}</small>` : ''}</button>`
      )
      .join('');
    return `<section class="card flush pq-card"><div class="pq-tabs"><div class="pq-tl" role="tablist" aria-label="Phân quyền">${tabs}</div><span class="end"><button type="button" class="link" data-act="pqhist">Nhật ký</button></span></div>
<div id="pq-body" class="pq-body">${inner}</div></section>`;
  }
  /* Máy chủ chưa có GET /api/roles: chỉ hiện những gì /api/me cho biết (vai trò và năng lực của chính bạn). Không giả lập thành công. */
  function soon() {
    const me = A.meInfo || {};
    const myRoles = Array.isArray(me.roles) ? me.roles : [];
    const myCaps = Array.isArray(me.caps) ? [...me.caps].sort(byCapOrder) : [];
    return `<div class="pq-pad"><div class="col" style="gap:4px"><b>Đang cập nhật</b><span class="cap">Máy chủ này chưa hỗ trợ xem bảng quyền của từng vai trò và gán vai trò cho từng người. Tạm thời chỉ hiện quyền của tài khoản đang đăng nhập.</span></div>
${
  myCaps.length || myRoles.length
    ? `<div class="row wrap" style="gap:6px"><span class="lbl">Vai trò</span>${myRoles.map(r => A.pill(r === 'admin' ? 'gold' : 'line', ROLE_TXT[r] || r)).join('') || '<span class="cap">chưa có</span>'}</div>
<div class="pq-caps">${myCaps.map(c => A.pill('line', capLabel(c))).join('')}</div>`
    : A.empty('Chưa đọc được quyền của bạn', 'Tải lại trang để thử lại.')
}</div>`;
  }
  function body() {
    if (!PQ.data && (PQ.state === 'idle' || PQ.state === 'loading'))
      return `<div aria-busy="true" class="pq-pad"><div class="skel" style="width:50%"></div><div class="skel" style="width:80%"></div></div>`;
    if (PQ.state === 'fail') return `<div class="pq-pad">${A.errorBox(PQ.error)}</div>`;
    if (PQ.state === 'na') return soon();
    return UI.tab === 'tk' ? tabTaiKhoan() : tabVaiTro();
  }
  const html = () => shell(body());

  /* ---------- dòng phụ dưới tiêu đề "Cài đặt" ---------- */
  function sub() {
    if (!PQ.data) return '';
    const { roles, people } = PQ.data;
    const def = roles.find(r => r.isDefault);
    if (UI.tab === 'tk') {
      const adm = roles.find(isFull);
      const nAdm = adm ? people.filter(p => p.roles.includes(adm.id)).length : 0;
      const nLock = people.filter(p => p.locked).length;
      return [
        `${nf(people.length)} tài khoản`,
        adm ? `${nf(nAdm)} ${esc(roleLabel(adm))}` : '',
        `${nf(nLock)} đã khoá`,
        def ? `mỗi người trong Nhân sự tự có tài khoản vai trò ${esc(roleLabel(def))}` : ''
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return `${nf(roles.filter(r => !r.deprecated).length)} vai trò · ${nf(people.length)} tài khoản · vai trò quyết định ai xem, ai sửa và ai được xử lý loại yêu cầu nào`;
  }
  /* Khung chỉ vẽ dòng phụ khi vẽ cả màn; đổi tab hay dữ liệu về sau thì tự cập nhật */
  function syncSub() {
    if (!UI.host || !UI.host.isConnected) return;
    const cdx = UI.host.closest('.cdx');
    const p = cdx && cdx.querySelector(':scope > .hdr .sub');
    const t = sub();
    if (p && p.innerHTML !== t) p.innerHTML = t; // xoá cả khi rỗng: tab không có dòng phụ thì phải xoá dòng cũ
  }
  function paint() {
    if (!UI.host || !UI.host.isConnected) return;
    UI.host.innerHTML = html();
    syncSub();
  }
  /* Khung gọi A.PhanQuyen.render() không kèm phần tử: trả sẵn HTML (không nháy trang trống) và gắn vào #pq-host ngay sau lượt vẽ.
     Gọi với phần tử thì vẽ thẳng vào đó. */
  function render(el) {
    if (PQ.state === 'idle') load().then(paint);
    if (!(el instanceof Element)) {
      Promise.resolve().then(() => {
        const h = document.getElementById('pq-host');
        if (!h) return;
        UI.host = h;
        syncSub();
      });
      return `<div id="pq-host">${html()}</div>`;
    }
    UI.host = el;
    paint();
  }
  const reset = () => {
    PQ.state = 'idle';
    UI.draft = null;
  };

  A.PhanQuyen = { load, render, reset, sub, _state: PQ, _ui: UI };
})(window.Admin);
