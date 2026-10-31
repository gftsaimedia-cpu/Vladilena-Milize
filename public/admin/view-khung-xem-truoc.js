/* Cài đặt › hộp "Xem trước và lưu": phần giàu hơn (ripple theo thành phần ①–⑧, chi phí công ty, người bị giảm, dưới lương tối thiểu,
   phạm vi chức vụ, gợi ý). Trường nào máy chủ chưa gửi thì không hiện.
   Mọi chuỗi qua A.esc(). Không có phép tính lương ở đây. */
(function (A) {
  'use strict';
  const { esc, ic } = A;
  const { NAME_OF, DEDUCT_IDS } = A.Khung;
  const SHOWN_NAMES = 5; // số tên nêu trong thông báo của hộp xem trước
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  /* Tên thành phần trong ripple của máy chủ (nếu gửi tên thay vì số) */
  const RIPPLE_NAME = {
    luongNgayCong: '1',
    lamThem: '2',
    phuCap: '3',
    luongKpi: '4',
    kpi: '4',
    truDiTreVeSom: '5',
    tamUng: '6',
    baoHiem: '7',
    thueTncn: '8'
  };

  /* ---------- hộp xem trước: phần giàu hơn ---------- */
  const people = v =>
    Array.isArray(v) ? v : v && Array.isArray(v.people) ? v.people : v && Array.isArray(v.list) ? v.list : [];
  const countOf = v => (typeof v === 'number' ? v : v && num(v.count) !== null ? v.count : people(v).length);
  const nameList = list => {
    const names = list.slice(0, SHOWN_NAMES).map(p => esc(p && (p.name || p.username) ? p.name || p.username : ''));
    const more = list.length - SHOWN_NAMES;
    return names.filter(Boolean).join(', ') + (more > 0 ? ` và ${esc(A.nf(more))} người khác` : '');
  };
  const nameOf = list => (people(list).length ? ` ${nameList(people(list))}.` : '');
  function rippleRows(r) {
    if (!r || typeof r !== 'object') return [];
    const src = r.components || r.byComponent || r.total || r.totals || r;
    const idOf = x => {
      const raw = String(x ?? '');
      return /^[1-8]$/.test(raw) ? raw : RIPPLE_NAME[raw] || '';
    };
    let rows = [];
    if (Array.isArray(src))
      rows = src.map(x => ({
        id: idOf(x.component ?? x.id ?? x.key ?? x.no),
        before: num(x.before),
        after: num(x.after),
        delta: num(x.delta ?? x.diff ?? x.change)
      }));
    else
      rows = Object.entries(src).map(([k, v]) =>
        typeof v === 'number'
          ? { id: idOf(k), delta: v, before: null, after: null }
          : {
              id: idOf(k),
              before: num(v && v.before),
              after: num(v && v.after),
              delta: num(v && (v.delta ?? v.diff ?? v.change))
            }
      );
    return rows
      .map(x => ({
        ...x,
        delta: x.delta !== null ? x.delta : x.before !== null && x.after !== null ? x.after - x.before : null
      }))
      .filter(x => x.id && x.delta !== null)
      .sort((a, b) => Number(a.id) - Number(b.id));
  }
  /* d: phản hồi xem trước; fmt: { moneyTxt, diffTxt } của view-tham-so.js. Trường nào chưa có thì không hiện. */
  function previewExtras(d, fmt) {
    if (!d) return '';
    const pick = k => (d.impact && d.impact[k] !== undefined ? d.impact[k] : d[k]);
    const out = [];
    const sc = pick('scope');
    if (sc && typeof sc === 'object') {
      const inside = num(sc.inside ?? sc.insideCount ?? sc.in);
      const outside = num(sc.outside ?? sc.outsideCount ?? sc.out);
      const leakN = num(sc.outsideAffected) ?? outside;
      const codes = Array.isArray(sc.positions) ? sc.positions : sc.position ? [sc.position] : [];
      const who = codes.map(c => A.TYPE_LONG[c] || c).join(', ');
      const leak = sc.leak === true || (sc.leak === undefined && !!leakN);
      if (leak)
        out.push(
          `<div class="px-warn" role="status">${ic('alert', 16)}<span><b>Thay đổi chạm ${esc(A.nf(leakN || 0))} người ngoài chức vụ${who ? ` ${esc(who)}` : ''}.</b>${nameOf(sc.outsidePeople)} Kiểm tra lại trước khi lưu.</span></div>`
        );
      else if (inside !== null)
        out.push(
          `<div class="note" role="status">${ic('info', 16)}<span>${who ? `Chức vụ <b>${esc(who)}</b>: ` : ''}${esc(A.nf(inside))} người${num(sc.insideAffected) !== null ? `, ${esc(A.nf(sc.insideAffected))} người có số đổi` : ''}.</span></div>`
        );
    }
    const dec = pick('decreased');
    if (dec !== undefined && dec !== null) {
      const n = countOf(dec);
      if (n > 0)
        out.push(
          `<div class="px-warn" role="status">${ic('alert', 16)}<span><b>${esc(A.nf(n))} người bị giảm thực nhận.</b>${people(dec).length ? ` ${nameList(people(dec))}.` : ''}</span></div>`
        );
    }
    const bmw = pick('belowMinWage');
    if (bmw !== undefined && bmw !== null) {
      const n = countOf(bmw);
      if (n > 0)
        out.push(
          `<div class="px-warn" role="status">${ic('alert', 16)}<span><b>${esc(A.nf(n))} người có mức lương thấp hơn lương tối thiểu vùng${num(bmw.minWage) !== null ? ` (${esc(fmt.moneyTxt(bmw.minWage))})` : ''}.</b>${people(bmw).length ? ` ${nameList(people(bmw))}.` : ''} Đây là cảnh báo, không chặn lưu.</span></div>`
        );
    }
    const cc = pick('companyCost');
    if (cc && typeof cc === 'object') {
      const before = num(cc.before ?? (cc.total && cc.total.before));
      const after = num(cc.after ?? (cc.total && cc.total.after));
      const delta =
        num(cc.delta ?? cc.diff ?? cc.change) ?? (before !== null && after !== null ? after - before : null);
      if (before !== null || after !== null)
        out.push(
          `<div class="kh-cc"><span class="lbl">Chi phí công ty (tổng thu nhập và bảo hiểm công ty đóng)</span><span class="num">${esc(fmt.moneyTxt(before))} → ${esc(fmt.moneyTxt(after))}${delta !== null ? ` <b>(${esc(fmt.diffTxt(delta))})</b>` : ''}</span></div>`
        );
    }
    const rows = rippleRows(pick('ripple'));
    if (rows.length) {
      const r0 = v => (v === null ? null : Math.round(v)); // làm tròn khi hiện: số thành phần của máy chủ có phần lẻ
      const body = rows
        .map(
          x =>
            `<tr><td class="wrapcell"><span class="kh-no sm" aria-hidden="true">${esc(x.id)}</span> ${esc(NAME_OF[x.id] || '')}${DEDUCT_IDS.has(x.id) ? ' <span class="cap">(khoản trừ)</span>' : ''}</td><td class="num r">${x.before !== null && x.after !== null ? `${esc(fmt.moneyTxt(r0(x.before)))} → ${esc(fmt.moneyTxt(r0(x.after)))}` : ''}</td><td class="num r">${esc(fmt.diffTxt(r0(x.delta)))}</td></tr>`
        )
        .join('');
      out.push(
        `<div class="col" style="gap:6px"><h3>Thay đổi lan sang các thành phần</h3><div class="tblwrap sv-impact" style="margin:0 -24px"><table><thead><tr><th>Thành phần</th><th class="r">Trước → sau</th><th class="r">Chênh lệch</th></tr></thead><tbody>${body}</tbody></table></div></div>`
      );
    }
    /* Gợi ý của AI soát (cục bộ, theo quy tắc): chỉ hiện nội dung, không hiện mã luật; không bao giờ chặn lưu */
    const sug = (Array.isArray(pick('suggestions')) ? pick('suggestions') : []).filter(x => x && x.message);
    if (sug.length)
      out.push(
        `<div class="col" style="gap:6px"><h3>Gợi ý</h3>${sug
          .map(
            x =>
              `<div class="${/^(warn|warning|high|medium)$/.test(String(x.severity || '')) ? 'px-warn' : 'note'}" role="status">${ic('info', 16)}<span>${esc(x.message)}</span></div>`
          )
          .join('')}<span class="cap">Gợi ý chỉ để tham khảo, không chặn lưu.</span></div>`
      );
    return out.length ? `<div class="col" style="gap:12px">${out.join('')}</div>` : '';
  }

  A.Khung.previewExtras = previewExtras;
})(window.Admin);
