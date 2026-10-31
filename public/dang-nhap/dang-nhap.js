/* Trang đăng nhập: POST /api/login (không cần gì thêm), rồi GET /api/me và đưa người dùng tới giao diện của họ (HomeRoute.homeFor).
   Thông báo sai mật khẩu, bị khoá, đăng nhập sai quá nhiều lần lấy nguyên văn từ máy chủ, qua textContent (không dựng HTML từ dữ liệu).
   Sai tên đăng nhập hoặc mật khẩu (401): ô Mật khẩu viền đỏ và thêm câu gợi ý. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const msg = $('dn-msg');
  const go = $('dn-go');
  const user = $('dn-user');
  const pass = $('dn-pass');
  const showBtn = $('dn-show');
  const WRONG_HINT = 'Kiểm tra lại chữ hoa, chữ thường, hoặc nhờ Admin đặt lại mật khẩu.';

  /* Đánh dấu ô sai (aria-invalid làm viền đỏ); gõ lại thì bỏ đánh dấu */
  const mark = (el, bad) => (bad ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid'));
  const sentence = s => (/[.!?…]$/.test(s) ? s : s + '.');
  /* Hộp báo lỗi: phần đậm là câu chính, phần sau là gợi ý (đều qua textContent) */
  function show(bold, rest) {
    msg.textContent = '';
    if (!bold) return;
    const box = document.createElement('div');
    box.className = 'dn-msg';
    const b = document.createElement('b');
    b.textContent = sentence(bold);
    box.appendChild(b);
    if (rest) box.appendChild(document.createTextNode(' ' + rest));
    msg.appendChild(box);
  }
  async function readJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  for (const el of [user, pass])
    el.addEventListener('input', () => {
      mark(el, false);
      if (!user.hasAttribute('aria-invalid') && !pass.hasAttribute('aria-invalid')) show('');
    });
  /* Nút Hiện / Ẩn mật khẩu trong ô */
  showBtn.addEventListener('click', () => {
    const on = pass.type === 'password';
    pass.type = on ? 'text' : 'password';
    showBtn.textContent = on ? 'Ẩn' : 'Hiện';
    showBtn.setAttribute('aria-pressed', String(on));
    showBtn.setAttribute('aria-label', on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  });
  /* Đã đăng nhập sẵn (cookie còn hạn) thì vào thẳng giao diện của mình */
  async function enterIfLoggedIn() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      const me = await readJson(res);
      if (me && me.user) location.replace(window.HomeRoute.homeFor(me));
    } catch {
      /* không hỏi được: ở lại trang đăng nhập */
    }
  }
  $('dn-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const username = user.value.trim().toLowerCase();
    const password = pass.value;
    mark(user, !username);
    mark(pass, !password);
    if (!username || !password) {
      show('Nhập tên đăng nhập và mật khẩu');
      (username ? pass : user).focus();
      return;
    }
    show('');
    go.disabled = true;
    go.textContent = 'Đang đăng nhập…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await readJson(res);
      if (!res.ok) {
        const text = (data && data.error) || `Lỗi ${res.status}`;
        if (res.status === 401) {
          mark(pass, true);
          show(text, WRONG_HINT);
          pass.focus();
        } else show(text);
        return;
      }
      const meRes = await fetch('/api/me', { credentials: 'same-origin' });
      const me = await readJson(meRes);
      location.replace(me && me.user ? window.HomeRoute.homeFor(me) : '/nhan-vien.html');
    } catch {
      show('Không kết nối được máy chủ', 'Kiểm tra mạng rồi thử lại.');
    } finally {
      go.disabled = false;
      go.textContent = 'Đăng nhập';
    }
  });
  enterIfLoggedIn();
  user.focus();
})();
