'use strict';
// Bảng "Tải & sao lưu" của sandbox (máy chủ: sandbox-ops.cjs). Chỉ dựng DOM bằng textContent, không innerHTML.
(function () {
  const dialog = document.getElementById('ops-dialog');
  const $ = id => document.getElementById(id);
  let timer = null;
  let current = null;
  let pending = false;

  async function call(path, data) {
    const response = await fetch(
      '/__sandbox/' + path,
      data === undefined
        ? { cache: 'no-store' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Sandbox-Control': '1' },
            body: JSON.stringify(data)
          }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Không thực hiện được.');
    return result;
  }
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const verdictClass = verdict => (verdict === 'ĐẠT' ? 'ok' : 'bad');
  const kb = bytes =>
    bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  function renderServer(server) {
    const h = server.health;
    const gate = server.hashGate;
    $('ops-server').textContent = h
      ? `Máy chủ: bộ nhớ ${h.rssMb} MB · trễ vòng lặp p50 ${h.loopLagMs.p50} / p99 ${h.loopLagMs.p99} / max ${h.loopLagMs.max} ms · băm mật khẩu đang chạy ${gate?.running ?? '?'} (chờ ${gate?.queued ?? '?'}) · đã từ chối quá tải ${server.shed ?? '?'} lượt`
      : 'Máy chủ: không đọc được /api/health';
  }

  function renderLoad(load) {
    $('ld-seeded').textContent = load.seeded
      ? `Đã nạp ${load.seeded} người (+ lt_admin)`
      : 'Chưa nạp người dùng đo tải';
    const job = load.job;
    const box = $('ld-result');
    box.replaceChildren();
    const log = $('ld-log');
    $('ld-run').disabled = !load.seeded || job?.status === 'running';
    $('ld-seed').disabled = job?.status === 'running';
    $('ld-cancel').disabled = job?.status !== 'running';
    if (!job) {
      log.hidden = true;
      return;
    }
    const states = { running: 'đang chạy…', passed: 'XONG — ĐẠT', failed: 'XONG — KHÔNG ĐẠT', cancelled: 'đã hủy' };
    box.append(
      el(
        'div',
        `Lần chạy (${job.options.scenarios.join(' → ')}, ${job.options.users} người): ${states[job.status]} · ${job.elapsedSec}s`,
        job.status === 'failed' ? 'bad' : ''
      )
    );
    if (job.summaries.length) {
      const table = el('table');
      const head = el('tr');
      for (const name of ['pha', 'yêu cầu', 'rps', 'p50', 'p95', 'p99', 'max', 'từ chối', 'lỗi', 'kết quả'])
        head.append(el('th', name));
      table.append(head);
      for (const s of job.summaries) {
        const row = el('tr');
        for (const value of [s.phase, s.requests, s.rps, s.p50, s.p95, s.p99, s.max, s.rejected, s.failures])
          row.append(el('td', String(value)));
        row.append(el('td', s.verdict, verdictClass(s.verdict)));
        table.append(row);
      }
      box.append(table);
    }
    if (job.reconciled) {
      const r = job.reconciled;
      box.append(
        el(
          'div',
          `Đối soát ghi: ${r.confirmed} lượt Check-in đã được xác nhận — mất ${r.missing}, mồ côi ${r.orphan}, lệch ${r.mismatch}, trùng ${r.duplicateSessions}, thừa ${r.extraSessions} → ${r.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'}`,
          r.pass ? 'ok' : 'bad'
        )
      );
    }
    log.hidden = !job.lines.length;
    log.textContent = job.lines.join('\n');
    log.scrollTop = log.scrollHeight;
  }

  function renderBackups(state) {
    const select = $('bk-select');
    const chosen = select.value;
    select.replaceChildren(
      ...state.backups.map(b => {
        const option = el('option', `${b.name}${b.kind === 'corrupt' ? ' (đã làm hỏng)' : ''}`);
        option.value = b.name;
        return option;
      })
    );
    if (state.backups.some(b => b.name === chosen)) select.value = chosen;
    else if (state.backups.length) select.value = state.backups[state.backups.length - 1].name;
    const hasBackup = state.backups.length > 0;
    for (const id of ['bk-verify', 'bk-drill', 'bk-corrupt']) $(id).disabled = !hasBackup || state.toolRunning;
    $('bk-make').disabled = state.toolRunning;
    const list = $('bk-list');
    list.replaceChildren();
    if (state.backups.length) {
      const table = el('table');
      const head = el('tr');
      for (const name of ['tên', 'loại', 'dung lượng', 'integrity_check']) head.append(el('th', name));
      table.append(head);
      for (const b of state.backups) {
        const row = el('tr');
        row.append(el('td', b.name), el('td', b.kind === 'corrupt' ? 'làm hỏng' : 'sao lưu'), el('td', kb(b.bytes)));
        row.append(el('td', b.integrity || '', b.integrity === 'ok' ? 'ok' : 'bad'));
        table.append(row);
      }
      list.append(table);
    }
    const tool = $('bk-tool');
    tool.replaceChildren();
    if (state.toolRunning) tool.append(el('div', 'Đang chạy kiểm/diễn tập…'));
    else if (state.tool) {
      const labels = { verify: 'Kiểm', drill: 'Diễn tập khôi phục' };
      tool.append(
        el(
          'div',
          `${labels[state.tool.action]} ${state.tool.name}: ${state.tool.verdict} (mã thoát ${state.tool.exitCode}, ${state.tool.ms} ms)`,
          verdictClass(state.tool.verdict)
        )
      );
      const pre = el('pre', state.tool.lines.join('\n'));
      tool.append(pre);
    }
  }

  function render(state) {
    current = state;
    renderServer(state.server);
    renderLoad(state.load);
    renderBackups(state);
  }

  async function refresh() {
    if (pending || !dialog.open) return;
    pending = true;
    try {
      render(await call('ops'));
    } catch (error) {
      $('ops-server').textContent = error.message;
    } finally {
      pending = false;
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!dialog.open) return;
    const active = current && (current.load.job?.status === 'running' || current.toolRunning);
    timer = setTimeout(
      async () => {
        await refresh();
        schedule();
      },
      active ? 1000 : 3000
    );
  }

  // Bấm một nút: gọi, hiện kết quả ngay; lỗi hiện ở dòng máy chủ
  async function act(path, data) {
    try {
      pending = true;
      render(await call(path, data));
    } catch (error) {
      window.alert(error.message);
    } finally {
      pending = false;
      schedule();
    }
  }
  const selectedScenarios = () =>
    Array.from(document.querySelectorAll('input[name="ld-scn"]:checked')).map(input => input.value);
  const num = id => Number($(id).value);

  $('ops-open').addEventListener('click', async () => {
    dialog.showModal();
    await refresh();
    schedule();
  });
  $('ops-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => clearTimeout(timer));
  $('ld-seed').addEventListener('click', () => act('load-seed', { count: num('ld-users') }));
  $('ld-run').addEventListener('click', () =>
    act('load-run', {
      users: num('ld-users'),
      scenarios: selectedScenarios(),
      spread: num('ld-spread'),
      seconds: num('ld-seconds'),
      admins: num('ld-admins')
    })
  );
  $('ld-cancel').addEventListener('click', () => act('load-cancel', {}));
  $('bk-make').addEventListener('click', () => act('backup', {}));
  $('bk-verify').addEventListener('click', () => act('verify', { name: $('bk-select').value }));
  $('bk-drill').addEventListener('click', () => act('drill', { name: $('bk-select').value }));
  $('bk-corrupt').addEventListener('click', () => act('corrupt', { name: $('bk-select').value }));
})();
