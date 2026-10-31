/* Cài đặt › Chế độ theo loại: tab theo chức vụ (GET /api/positions), bảng "Phụ cấp và lương KPI" và bảng "Được gửi yêu cầu",
   mỗi BẬC một hàng. Dữ liệu từng ô lấy từ GET /api/entitlements → levelCells[{ position, level, name, cells: { <đuôi>: { value, source, key } } }].
   Mỗi ô hiện GIÁ TRỊ ĐANG HIỆU LỰC của bậc (riêng của bậc nếu có, không thì của chức vụ; ca đêm không có danh sách thì theo mức chung
   shift.night.bonus), không phân biệt ô riêng hay ô kế thừa. Giá trị gốc của ô là đúng số đang hiện: gõ khác thì lưu khoá của bậc
   level.<mã>.<bậc>.<đuôi> (PUT /api/settings/params); xoá trắng ô thì ghi null (bậc về theo chức vụ).
   Máy chủ chưa trả levelCells (hoặc chức vụ chưa có bậc) thì dùng hàng "Mọi bậc" theo khoá của chức vụ.
   Cột nào máy chủ chưa có cờ tương ứng (iDorm) hiện ô khoá. Không có số nghiệp vụ ở đây. Mọi chuỗi qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;
  const kt = () => A.PxKit;
  const ui = () => A.CaiDatUi;
  const kh = () => A.Khung;

  /* [nhãn cột, đuôi khoá, kiểu] — kiểu: pct (tỷ lệ %), flag (có/không), list (MỘT mức %, lưu thành [số]), soon (chưa có cờ) */
  const ALLOW_COLS = [
    ['Phụ cấp đi lại', 'travel', 'pct'],
    ['Phụ cấp chuyên cần', 'attendance', 'pct'],
    ['Phụ cấp Flex', 'flexBonus', 'pct'],
    ['Phụ cấp ca đêm', 'nightOptions', 'list'],
    ['Lương KPI', 'benefit.kpi', 'flag'],
    ['iDorm', 'benefit.idorm', 'flag']
  ];
  const REQ_COLS = [
    ['Nghỉ phép năm', 'benefit.paidLeave', 'flag'],
    ['iSAT', 'benefit.isat', 'flag'],
    ['Nghỉ được duyệt', 'benefit.approvedLeave', 'flag'],
    ['OT', 'benefit.ot', 'flag'],
    ['Làm bù theo giờ', 'benefit.makeupHours', 'flag']
  ];
  const REFRESH_MS = 15000;
  const tab = () => {
    const codes = A.positions.list().map(p => p.code);
    return codes.includes(S.f.qlTab) ? S.f.qlTab : codes[0];
  };

  /* ---------- dữ liệu theo bậc ---------- */
  const QL = { month: null, ent: null, state: 'idle', at: 0, metaRef: null, busy: false };
  async function fetchCells() {
    if (QL.busy) return;
    QL.busy = true;
    const month = S.month;
    try {
      const res = await A.api('GET', '/entitlements' + A.qs({ month }));
      QL.ent = res && Array.isArray(res.levelCells) ? res.levelCells : [];
      QL.state = 'ok';
    } catch {
      QL.ent = []; // chưa có đường dẫn hoặc lỗi: dùng hàng "Mọi bậc" của chức vụ
      QL.state = 'ok';
    }
    // ô đã dựng từ số cũ không được giữ lại (orig cũ): bỏ khỏi kho trước khi vẽ lại
    for (const k of [...kt().PS.meta.keys()])
      if (/^level\.[a-z][a-z0-9]*\.\d+\.(travel|attendance|flexBonus|nightOptions|benefit\.)/.test(k))
        kt().PS.meta.delete(k);
    QL.month = month;
    QL.at = Date.now();
    QL.metaRef = kt().PS.meta;
    QL.busy = false;
    A.render();
  }
  /* Nạp lần đầu, khi đổi tháng, sau khi lưu (kho tham số bị đặt lại) và định kỳ khi quay lại màn */
  function ensure() {
    if (QL.busy) return;
    const stale =
      QL.state !== 'ok' || QL.month !== S.month || QL.metaRef !== kt().PS.meta || Date.now() - QL.at > REFRESH_MS;
    if (!stale) return;
    // đang có thay đổi chưa lưu thì không nạp đè giữa chừng (trừ khi chưa có dữ liệu hoặc đổi tháng)
    if (QL.state === 'ok' && QL.month === S.month && kt().dirtyCount() > 0) return;
    fetchCells();
  }
  const levelsOf = code => (QL.ent || []).filter(l => l.position === code).sort((a, b) => a.level - b.level);
  /* Giá trị đang hiệu lực của ô theo bậc: riêng của bậc, không thì của chức vụ; ca đêm thêm một bước về mức chung */
  const sharedNight = () => {
    const v = kh().valueOf('shift.night.bonus');
    return typeof v === 'number' ? [Number((v * 100).toPrecision(12))] : [];
  };
  function effective(code, tail, kind, c) {
    if (kind === 'list') {
      if (Array.isArray(c.value) && c.value.length) return [c.value[0]];
      const po = (A.positions.get(code) || {}).nightOptions;
      if (Array.isArray(po) && po.length) return [po[0]];
      const pv = kh().valueOf(`type.${code}.${tail}`);
      return Array.isArray(pv) && pv.length ? [pv[0]] : sharedNight();
    }
    if (c.value !== null && c.value !== undefined) return c.value;
    const pv = kh().valueOf(`type.${code}.${tail}`);
    return pv === undefined ? null : pv;
  }

  /* ---------- ô ---------- */
  function cellFor(c, tail, label, title, kind) {
    const base = kh().descOf(`type.${(/^level\.([a-z][a-z0-9]*)\./.exec(c.key) || [])[1]}.${tail}`);
    const flag = kind === 'flag';
    const list = kind === 'list';
    const rules = {
      ...(list
        ? { type: 'list', single: true, messages: {} }
        : (base && base.rules) || (flag ? { type: 'bool' } : { type: 'number', unit: 'ratio', min: 0, messages: {} })),
      nullable: true
    };
    return kh().cellOf(
      {
        key: c.key,
        value: c.value,
        rules,
        comp: list ? 'list' : (base && base.comp) || (flag ? 'toggle' : 'percent'),
        unit: list ? null : (base && base.unit) || (flag ? null : 'ratio')
      },
      label,
      title
    );
  }
  function levelCell(code, l, [label, tail, kind]) {
    if (kind === 'soon' || !tail) return `<td>${ui().lockedTag()}</td>`;
    const c0 = l.cells[tail];
    if (!c0) return `<td>${ui().lockedTag()}</td>`;
    const title = `${(A.positions.get(code) || {}).label || code}, ${l.name || `bậc ${l.level}`}: ${label}`;
    const cell = cellFor({ ...c0, value: effective(code, tail, kind, c0) }, tail, label, title, kind);
    const raw = kt().cellRaw(cell);
    let body;
    if (kind === 'list') {
      body = `<span class="z-pin"><input id="${ui().dom(cell.key)}" class="z-ni${ui().inputCls(cell, raw)}" inputmode="numeric" autocomplete="off" value="${esc(raw)}" data-input="drin" data-key="${esc(cell.key)}" aria-label="${esc(title)}"><span class="pf">%</span></span>`;
    } else if (kind === 'flag') {
      body = `<label class="z-cb${kt().isDirty(cell) ? ' ed' : ''}"><input type="checkbox" id="${ui().dom(cell.key)}" ${raw === '1' ? 'checked' : ''} data-input="drck" data-key="${esc(cell.key)}" aria-label="${esc(title)}"><span class="bx">${ic('check', 12, 3)}</span></label>`;
    } else {
      body = `<span class="z-pin"><input id="${ui().dom(cell.key)}" class="z-ni${ui().inputCls(cell, raw)}" inputmode="decimal" autocomplete="off" value="${esc(raw)}" data-input="drin" data-key="${esc(cell.key)}" aria-label="${esc(title)}"><span class="pf">${esc(kt().unitTxt(cell.unit))}</span></span>`;
    }
    return `<td><span class="ql-c">${body}</span>${ui().msgs(cell)}</td>`;
  }

  /* Chức vụ chưa có dữ liệu theo bậc: hàng "Mọi bậc" theo khoá của chức vụ */
  function legacyCell(code, [label, tail, kind]) {
    if (kind === 'soon' || !tail) return `<td>${ui().lockedTag()}</td>`;
    const key = `type.${code}.${tail}`;
    if (kind === 'list') {
      const v = (A.positions.get(code) || {}).nightOptions;
      const eff = Array.isArray(v) && v.length ? [v[0]] : sharedNight();
      return `<td>${eff.length ? `<span class="cap">${esc(`${eff[0]} %`)}</span>` : '—'}</td>`;
    }
    const f = ui().fieldFor(key, label, `${label}`);
    if (!f) return `<td>${ui().lockedTag()}</td>`;
    if (!f.cell) return `<td><span class="cap">${esc(kt().fmtVal(f.d.unit, f.d.value))}</span></td>`;
    return `<td><span class="z-cell">${kind === 'flag' ? ui().checkbox(f.cell, label) : ui().numInput(f.cell, { width: 'w' })}</span>${ui().msgs(f.cell)}</td>`;
  }
  function table(code, cols, title, cap, extraCols) {
    const lv = levelsOf(code);
    const head = `<tr><th>Bậc</th>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}${extraCols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
    const extra = ec => ec.map(c => c.cell(code)).join('');
    const body = lv.length
      ? lv
          .map(
            l =>
              `<tr><td class="k">${esc(l.name || `Bậc ${l.level}`)}</td>${cols.map(c => levelCell(code, l, c)).join('')}${extra(extraCols)}</tr>`
          )
          .join('')
      : `<tr><td class="k">Mọi bậc</td>${cols.map(c => legacyCell(code, c)).join('')}${extra(extraCols)}</tr>`;
    return `<div class="cdx-qsec"><h3>${esc(title)}</h3><span class="cap">${esc(cap)}</span></div><div class="tblwrap"><table class="z-mx cdx-qt"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  /* Khoản phụ cấp do C&B thêm: mỗi khoản một cột, bấm ô mở hộp chi tiết của bảng quyền lợi */
  function addedCols() {
    const m = A.Khung.matrix();
    return (m.rows || [])
      .filter(r => r.meta && r.meta.added)
      .map(r => ({
        label: r.label,
        cell: code => {
          const cm = r.cells[code];
          if (!cm) return '<td>—</td>';
          const on = cm.onCell ? kt().cellRaw(cm.onCell) === '1' : cm.onStatic;
          return `<td><button type="button" class="z-addb" data-act="khcell" data-r="${esc(r.id)}" data-p="${esc(code)}">${on ? 'Bật' : 'Tắt'}${cm.mainCell ? ' · ' + esc(kt().showRaw(cm.mainCell, kt().cellRaw(cm.mainCell))) : ''}</button></td>`;
        }
      }));
  }

  A.actions.qltab = el => {
    S.f.qlTab = el.dataset.v;
    A.render();
  };
  /* ---------- lưu: cùng hộp "Xem trước và lưu"; ô theo bậc có/không → true/false, về theo chức vụ → null ---------- */
  const LEVEL_KEY_RE = /^level\.[a-z][a-z0-9]*\.\d+\.(travel|attendance|flexBonus|nightOptions|benefit\.)/;
  function dirtyCells() {
    const PS = kt().PS;
    return [...PS.meta.values()].filter(
      c => !c.readonly && !c.isNew && Object.hasOwn(PS.vals, c.key) && PS.vals[c.key] !== c.orig
    );
  }
  function valueOf(c) {
    const raw = kt().cellRaw(c);
    if (LEVEL_KEY_RE.test(c.key) && c.kind === 'bool') return raw === '' ? null : raw === '1';
    return kt().typedValue(c, raw);
  }
  const INH_TXT = 'Theo chức vụ';
  /* Chữ "về đâu" khi xoá mức riêng: ca đêm của chức vụ không có danh sách mức riêng thì về mức chung */
  const inhName = c => {
    const code = (/^level\.([a-z][a-z0-9]*)\./.exec(c.key) || [])[1];
    return c.kind === 'list' && !((A.positions.get(code) || {}).nightOptions || []).length ? 'Theo mức chung' : INH_TXT;
  };
  A.actions.qlsave = () => {
    if (A.Params.saveApi !== 'yes') return;
    const items = dirtyCells().map(c => {
      const raw = kt().cellRaw(c);
      return {
        key: c.key,
        value: valueOf(c),
        label: c.title || c.label,
        before: c.orig === '' ? inhName(c) : kt().showRaw(c, c.orig),
        after: raw === '' ? inhName(c) : kt().showRaw(c, raw)
      };
    });
    if (!items.length) return;
    A.Params.openSave(items, {
      onSaved: async () => {
        QL.state = 'idle';
        A.Params.reset();
        await A.Params.load();
        A.render();
      }
    });
  };
  /* Số người đang làm của một chức vụ (tài khoản bị khoá không tính) */
  const peopleOf = code =>
    A.staff.state === 'ok' ? A.people().filter(s => s.type === code && !s.locked && !s.lockedAt).length : null;
  function render() {
    kt().resetCells();
    const ready = kt().PS.index.length && kt().PS.index.every(g => kt().PS.cache.has(g.id));
    if (ready) ensure();
    if (!ready || QL.state !== 'ok')
      return '<section class="card" aria-busy="true"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div></section>';
    const cur = tab();
    const tabs = A.positions
      .list()
      .map(p => {
        const n = peopleOf(p.code);
        return `<button type="button" role="tab" aria-selected="${p.code === cur}" class="${p.code === cur ? 'on' : ''}" data-act="qltab" data-v="${esc(p.code)}">${esc(p.label)}${n === null ? '' : ` <small>${A.nf(n)}</small>`}</button>`;
      })
      .join('');
    const extra = addedCols();
    const label = (A.positions.get(cur) || {}).label || '';
    const acts = `<span class="end"><button type="button" class="link" data-act="cdsec" data-v="nhat-ky">Nhật ký</button><button type="button" class="btn sm" data-act="khaddblock">${ic('plus', 14)}Thêm chế độ</button></span>`;
    return `<section class="card flush cdx-ql"><div class="cdx-qltop"><div class="tabs" role="tablist" aria-label="Chức vụ">${tabs}</div>${acts}</div>${cur ? `${table(cur, ALLOW_COLS, 'Phụ cấp và lương KPI', `Mức theo từng bậc của ${label}`, extra)}${table(cur, REQ_COLS, 'Được gửi yêu cầu', 'Bậc nào được gửi loại yêu cầu nào trên app nhân viên', [])}` : ''}${A.CaiDatSaveFoot('qlsave')}</section>`;
  }
  A.QuyenLoi = { render, tab };
})(window.Admin);
