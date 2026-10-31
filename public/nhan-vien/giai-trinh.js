/* Giao diện Nhân viên: Giải trình. Hai việc:
   1) Trả lời yêu cầu giải trình do Admin hoặc AI gửi (danh sách nằm trong tab Yêu cầu, API GET/POST /api/explanations).
   2) Check-in / Check-out không hợp lệ (409 CHECKIN_NEEDS_EXPLANATION / CHECKOUT_NEEDS_EXPLANATION: trễ, về sớm, Check-out muộn, ngoài ca,
      ngoài vùng GPS, lượt thứ hai trong ca): hộp hỏi giải trình, punch.js gửi kèm lần bấm (NV.askPressExplanation). Check-out muộn chỉ có
      hiệu lực khi Admin duyệt giải trình; trong lúc chờ, máy chủ chỉ ghi nhận giờ bấm (requestedOut) và lượt là "Chờ xử lý". Trạng thái của giải trình dùng đúng ba chữ của chấm công
      (AttendanceStatus.LABEL): Chờ xử lý, Được phê duyệt, Bị từ chối. Không có phép tính tiền ở đây; mọi chuỗi từ máy chủ qua esc(). */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;

  const E = (S.explain = { items: [], waitingForYou: 0, loaded: false, loading: false, busy: false });
  const KIND = {
    'late-checkout': 'Check-out muộn',
    'punch-in': 'Check-in không hợp lệ',
    'punch-out': 'Check-out không hợp lệ',
    admin: 'Admin yêu cầu',
    ai: 'AI đề nghị'
  };
  const LABEL = window.AttendanceStatus.LABEL;
  const STATE = {
    requested: LABEL.pending,
    answered: LABEL.pending,
    approved: LABEL.approved,
    rejected: LABEL.rejected
  };
  const PILL = { requested: 'pend', answered: 'pend', approved: 'done', rejected: 'err' };
  // Giải trình chưa được Admin duyệt thì ngày đó chưa tính công, bị từ chối thì không tính công (máy chủ giữ lương ngày đó)
  const HOLD_NOTE = {
    requested: 'Ngày này chưa tính công cho tới khi Admin duyệt giải trình.',
    answered: 'Ngày này chưa tính công cho tới khi Admin duyệt giải trình.',
    rejected: 'Ngày này không tính công.'
  };

  async function load(force) {
    if (E.loading || (E.loaded && !force)) return;
    E.loading = true;
    try {
      const data = await NV.api('GET', '/explanations');
      E.items = data.items || [];
      E.waitingForYou = data.waitingForYou || 0;
      E.loaded = true;
    } catch {
      E.loaded = true; // lỗi mạng: giữ danh sách cũ, không lặp lại vô hạn
    } finally {
      E.loading = false;
    }
    NV.render();
  }
  NV.loadExplanations = load;

  const dateText = date => `${L.weekdayLong(date)}, ${L.dmy(date)}`;
  // Giờ bấm Check-out muộn: chỉ được tính khi Admin duyệt; chưa duyệt thì lượt Chờ xử lý, Admin từ chối thì lượt Bị từ chối
  const lateOutText = x =>
    x.status === 'approved'
      ? `Giờ Check-out ${L.vnTime(x.requestedOut)} đã được tính.`
      : `Giờ bấm Check-out ${L.vnTime(x.requestedOut)} chưa được tính: lượt đang ${x.status === 'rejected' ? LABEL.rejected : LABEL.pending}.`;
  const rowOf = x => {
    const open = x.status === 'requested';
    return `<div class="nv-reqrow"><span class="nv-dt"><b>${esc(x.date.slice(8))}</b>T${esc(String(Number(x.date.slice(5, 7))))}</span><div class="nv-grow"><div class="nv-rq-t">${esc(KIND[x.kind] || 'Giải trình')} · ${esc(dateText(x.date))}</div>${x.prompt ? `<div class="nv-rq-s">${esc(x.prompt)}</div>` : ''}${x.answer ? `<div class="nv-rq-r">Bạn trả lời: ${esc(x.answer)}</div>` : ''}${x.requestedOut ? `<div class="nv-rq-r">${esc(lateOutText(x))}</div>` : ''}${x.decisionNote ? `<div class="nv-rq-r">Admin: ${esc(x.decisionNote)}</div>` : ''}${HOLD_NOTE[x.status] ? `<div class="nv-rq-r">${esc(HOLD_NOTE[x.status])}</div>` : ''}</div>${open ? `<button type="button" class="nv-btn is-pri" data-act="ex-open" data-id="${esc(x.id)}">Giải trình</button>` : `<span class="nv-pill is-${PILL[x.status] || 'pend'}">${esc(STATE[x.status] || '')}</span>`}</div>`;
  };
  function inner() {
    if (!E.loaded) {
      load();
      return '';
    }
    if (!E.items.length) return '';
    return E.items.slice(0, 20).map(rowOf).join('');
  }
  // Điện thoại (tab Yêu cầu)
  NV.explainSection = () => {
    const body = inner();
    return body
      ? `<section class="nv-sec" aria-label="Giải trình"><h2 class="nv-h2">Giải trình${E.waitingForYou ? ` <small>${esc(E.waitingForYou)} chờ bạn trả lời</small>` : ''}</h2><div class="nv-card">${body}</div></section>`
      : '';
  };
  // Máy tính: khối con trong thẻ Yêu cầu
  NV.explainBlock = () => {
    const body = inner();
    return body
      ? `<div class="nv-advblock" aria-label="Giải trình"><div class="nv-card-h"><h3>Giải trình</h3>${E.waitingForYou ? `<span class="nv-cap">${esc(E.waitingForYou)} chờ bạn trả lời</span>` : ''}</div>${body}</div>`
      : '';
  };

  // Hộp nhập giải trình; onSend(text) gọi API, ném lỗi thì hiện câu của máy chủ. Trả Promise<boolean>: true khi đã gửi xong.
  function askText({ title, sub, cutLine = '', label, sendLabel, onSend }) {
    return new Promise(resolve => {
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        NV.closeSheet();
        resolve(ok);
      };
      NV.openSheet({
        label: title,
        html: `<div class="nv-dh"><h2 tabindex="-1" data-autofocus>${esc(title)}</h2></div><p class="nv-dsub">${esc(sub)}</p>${cutLine ? NV.noteBox('warn', cutLine) : ''}
<form class="nv-form" id="nv-ex-form" novalidate>
<div class="nv-field"><label class="nv-lbl" for="ex-text">${esc(label)}</label><textarea id="ex-text" class="nv-input" rows="4" maxlength="500" autocomplete="off"></textarea></div>
<div id="ex-err" role="alert" aria-live="assertive"></div>
<div class="nv-bt"><button type="button" class="nv-btn" data-act="ex-cancel">Huỷ</button><button type="submit" class="nv-btn is-pri" id="ex-send">${esc(sendLabel)}</button></div></form>`,
        onMount: sheet => {
          const err = sheet.querySelector('#ex-err');
          const show = text => (err.innerHTML = text ? NV.noteBox('bad', text) : '');
          sheet.querySelector('[data-act="ex-cancel"]').onclick = () => finish(false);
          sheet.querySelector('#nv-ex-form').addEventListener('submit', async ev => {
            ev.preventDefault();
            if (E.busy) return;
            const text = sheet.querySelector('#ex-text').value.trim();
            if (!text) return show('Nhập nội dung giải trình.');
            const btn = sheet.querySelector('#ex-send');
            E.busy = true;
            btn.disabled = true;
            btn.textContent = 'Đang gửi…';
            try {
              await onSend(text);
            } catch (e) {
              E.busy = false;
              btn.disabled = false;
              btn.textContent = sendLabel;
              return show(NV.errText(e));
            }
            E.busy = false;
            finish(true);
          });
        }
      });
    });
  }

  // Trả lời một yêu cầu giải trình của Admin/AI
  NV.actions['ex-open'] = async el => {
    const item = E.items.find(x => String(x.id) === el.dataset.id);
    if (!item) return;
    const sent = await askText({
      title: 'Giải trình',
      sub: `${KIND[item.kind] || ''} · ${dateText(item.date)}${item.prompt ? `. ${item.prompt}` : ''}`,
      label: 'Nội dung giải trình',
      sendLabel: 'Gửi giải trình',
      onSend: text => NV.api('POST', `/explanations/${encodeURIComponent(item.id)}/answer`, { text })
    });
    if (!sent) return;
    await load(true);
    NV.toast('Đã gửi giải trình cho Admin.');
  };

  // Check-in / Check-out không hợp lệ: hỏi giải trình cho lần bấm. info = err.data của máy chủ ({ note, cases, preview }): note là dòng nêu
  // trường hợp ("Vào trễ 20 phút", "Về sớm 35 phút"), preview là "nếu Check-out bây giờ" của máy chủ (chỉ có khi Check-out sớm).
  // Trả Promise<string|null>: nội dung giải trình (punch.js gửi kèm lần bấm) hoặc null khi huỷ. Không gọi API ở đây.
  NV.askPressExplanation = async info => {
    let given = '';
    const pv = info.preview;
    const grace = S.punch && S.punch.cutRule && S.punch.cutRule.graceMin;
    const early = (info.cases || []).some(c => c.code === 'early');
    // Giờ bị trừ khi về sớm: số của máy chủ (checkoutPreview), giao diện không tính
    const cutLine =
      early && pv && pv.early
        ? `Nếu Check-out bây giờ: về sớm ${pv.early} phút, ${pv.cutEnd ? `sẽ bị trừ ${L.fmtMin(pv.cutEnd)}` : `chưa bị trừ${Number.isFinite(grace) ? ` (đến ${grace} phút không trừ)` : ''}`}.`
        : '';
    const ok = await askText({
      title: 'Cần giải trình',
      sub: info.note || '',
      cutLine,
      label: 'Giải trình',
      sendLabel: 'Gửi giải trình',
      onSend: text => {
        given = text;
      }
    });
    return ok ? given : null;
  };
})(window.NV);
