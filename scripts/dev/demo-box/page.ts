export const PAGE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hộp demo</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#1c2430; --mute:#667085; --line:#e3e6eb; --accent:#2f5bea; --bad:#b42318; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14181f; --card:#1d232d; --ink:#e8ecf2; --mute:#98a2b3; --line:#2c3441; --accent:#7b9cff; --bad:#ff8a80; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,sans-serif; padding:24px 16px; }
  main { max-width:640px; margin:0 auto; display:grid; gap:16px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:16px; }
  h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; margin:0 0 10px; }
  .now { font-size:28px; font-weight:600; font-variant-numeric:tabular-nums; }
  .mute { color:var(--mute); } .bad { color:var(--bad); }
  .row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  button, input { font:inherit; border-radius:8px; border:1px solid var(--line); padding:8px 12px; background:var(--card); color:var(--ink); }
  button { cursor:pointer; } button:hover { border-color:var(--accent); } button.main { background:var(--accent); color:#fff; border-color:var(--accent); }
  button:disabled { opacity:.5; cursor:default; }
  table { border-collapse:collapse; width:100%; } td { padding:4px 8px 4px 0; } code { background:var(--bg); padding:1px 6px; border-radius:6px; }
</style></head>
<body><main>
  <section>
    <h1>Hộp demo</h1>
    <div class="now" id="now">…</div>
    <div class="mute" id="status"></div>
  </section>
  <section>
    <h2>Chỉnh đồng hồ (giờ chạy tiếp từ mốc đã đặt)</h2>
    <div class="row">
      <button data-min="60">+1 giờ</button><button data-min="1440">+1 ngày</button><button data-min="10080">+1 tuần</button>
      <button data-min="-1440">−1 ngày</button>
    </div>
    <div class="row" style="margin-top:8px">
      <input type="datetime-local" id="at"><button class="main" id="set">Đặt giờ (giờ Việt Nam)</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button data-at="2026-11-06T10:30">Về 06/11 10:30 (hôm nay của demo)</button>
      <button data-at="2026-11-10T09:00">Ngày trả lương 10/11</button>
      <button data-at="2026-12-01T09:00">Sang 01/12 (chốt tháng 11)</button>
    </div>
    <p class="mute">Đổi giờ xong hộp chạy lại job ngày công, nên ngày vắng, chờ giải trình… cập nhật ngay. Đi lùi quá xa có thể làm phiên đăng nhập hết hạn: đăng nhập lại.</p>
  </section>
  <section>
    <h2>Vị trí chấm công của nhân viên</h2>
    <div class="row">
      <button data-where="office">Trong văn phòng</button>
      <button data-where="far">Ngoài vùng (cách 2 km)</button>
      <button data-where="real">Vị trí thật của trình duyệt</button>
    </div>
    <p class="mute" id="where">…</p>
    <p class="mute">Hộp sửa toạ độ trong lượt Check-in / Check-out nên không cần bật định vị trên trình duyệt. Vùng văn phòng: tâm 10.8000, 106.7000, bán kính 500 m.</p>
  </section>
  <section>
    <h2>Chấm công hộ nhân viên</h2>
    <div id="staff" class="mute">Đang tải danh sách…</div>
    <div class="row" style="margin-top:8px">
      <button id="pin">Chấm vào bây giờ</button><button id="pout">Chấm ra bây giờ</button>
    </div>
    <div class="row" style="margin-top:8px">
      <label><input type="checkbox" id="autoon"> Tự chấm theo ca cho người đã chọn, vào trễ</label>
      <input type="number" id="late" min="0" max="600" value="0" style="width:72px"> phút
      <button id="autosave">Áp dụng</button>
    </div>
    <p class="mute">Tự chấm: mỗi khi giờ giả qua giờ vào ca thì chấm vào, qua giờ ra ca thì chấm ra (ca đêm tính cả sang hôm sau), bỏ qua Chủ nhật hoặc ngày lễ. Đổi giờ giả thì hộp bù luôn các lượt còn thiếu.</p>
    <p class="mute" id="log"></p>
  </section>
  <section>
    <h2>Cách dùng</h2>
    <p class="mute">1) Giữ trang này ở một tab, mở app ở tab khác. 2) Đặt giờ và vị trí ở đây. 3) Sang tab app, tải lại (F5) rồi đăng nhập nhân viên và bấm Check-in / Check-out. Muốn chấm ngày tiếp theo thì quay lại đây bấm +1 ngày.</p>
  </section>
  <section>
    <h2>Dữ liệu</h2>
    <div class="row"><button id="reset">Nạp lại dữ liệu demo (về 06/11/2026 10:30)</button></div>
    <p class="mute">Xoá mọi thay đổi bạn đã làm trong hộp và dựng lại 3 tháng kịch bản, mất khoảng 1 phút.</p>
  </section>
  <section>
    <h2>Tài khoản</h2>
    <table>
      <tr><td><code>boss</code></td><td>Admin</td></tr>
      <tr><td><code>an</code> <code>binh</code> <code>chi</code> <code>dung</code> <code>giang</code> <code>hanh</code> <code>nam</code> …</td><td>Nhân viên</td></tr>
    </table>
    <p class="mute">Mật khẩu chung: <code>Demo@123456</code>. <a href="/">Mở app</a></p>
  </section>
</main>
<script>
  const $ = id => document.getElementById(id);
  const vn = iso => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function say(text, bad) { const el = $('status'); el.textContent = text; el.className = bad ? 'bad' : 'mute'; }
  async function call(path, body) {
    const r = await fetch('/__box/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) say(String(j.error || r.status), true);
    return j;
  }
  async function refresh() {
    try {
      const s = await (await fetch('/__box/state')).json();
      $('now').textContent = vn(s.now);
      const names = { office: 'Đang đặt: trong văn phòng', far: 'Đang đặt: ngoài vùng, cách 2 km', real: 'Đang dùng vị trí thật của trình duyệt' };
      $('where').textContent = names[s.where] || '';
      say(s.error ? 'Lỗi nạp dữ liệu: ' + s.error : s.busy ? 'Hộp đang bận: ' + s.busy : 'Sẵn sàng', !!s.error);
      for (const b of document.querySelectorAll('button')) b.disabled = !!s.busy;
    } catch { $('status').textContent = 'Không nối được hộp'; }
  }
  document.querySelectorAll('[data-min]').forEach(b => b.onclick = async () => { await call('advance', { minutes: Number(b.dataset.min) }); refresh(); });
  document.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => { await call('clock', { at: b.dataset.at + ':00+07:00' }); refresh(); });
  document.querySelectorAll('[data-where]').forEach(b => b.onclick = async () => { await call('where', { mode: b.dataset.where }); refresh(); });
  $('set').onclick = async () => { if ($('at').value) { await call('clock', { at: $('at').value + ':00+07:00' }); refresh(); } };
  $('reset').onclick = async () => { if (confirm('Xoá mọi thay đổi và nạp lại dữ liệu demo?')) { await call('reset'); refresh(); } };
  const picked = new Set();
  async function loadStaff() {
    const j = await (await fetch('/__box/staff')).json().catch(() => ({ staff: [] }));
    const box = $('staff');
    box.textContent = '';
    for (const p of j.staff || []) {
      const label = document.createElement('label');
      label.style.marginRight = '12px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.onchange = () => (cb.checked ? picked.add(p.username) : picked.delete(p.username));
      label.append(cb, ' ' + p.name + ' (' + p.start + '–' + p.end + ')');
      box.append(label);
    }
  }
  async function punchNow(type) {
    const j = await call('punch', { type, users: [...picked] });
    $('log').textContent = (j.results || []).join(' · ');
  }
  $('pin').onclick = () => punchNow('IN');
  $('pout').onclick = () => punchNow('OUT');
  $('autosave').onclick = async () => {
    const users = $('autoon').checked ? [...picked] : [];
    const j = await call('auto', { users, lateMinutes: Number($('late').value) });
    $('log').textContent = (j.log || []).join(' · ');
  };
  loadStaff();
  refresh(); setInterval(refresh, 1000);
</script></body></html>`;
