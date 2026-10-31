'use strict';
const dateInput = document.getElementById('test-date');
const timeInput = document.getElementById('test-time');
const userInput = document.getElementById('test-user');
const frame = document.getElementById('app-frame');
const statusLine = document.getElementById('status');
const resetDialog = document.getElementById('reset-dialog');
let currentState;
let busy = false;

function status(message, error = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle('error', error);
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('.controls button, .controls input, .controls select, #reset-confirm').forEach(control => {
    control.disabled = value;
  });
}
async function request(path, data) {
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
  if (!response.ok) throw new Error(result.error || 'Không thể cập nhật bản test.');
  return result;
}
function renderState(state) {
  currentState = state;
  dateInput.value = state.local.slice(0, 10);
  dateInput.min = state.initialLocal.slice(0, 10);
  timeInput.value = state.local.slice(11, 19);
  document.getElementById('applied-time').textContent = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(state.now));
  userInput.replaceChildren(
    ...state.users.map(user => {
      const option = document.createElement('option');
      const shifts = {
        n1: '08:00–17:00',
        n2: '10:00–19:00',
        f1: '06:00–15:00',
        f2: '13:00–22:00',
        g1: '21:00–06:00',
        g2: '22:00–07:00'
      };
      option.value = user.username;
      option.textContent =
        user.name +
        (user.role === 'admin' ? ' · Xem Check-in/out' : shifts[user.shiftCode] ? ' · ' + shifts[user.shiftCode] : '');
      return option;
    })
  );
  userInput.value = state.user;
}
function reloadApp() {
  document.getElementById('loading').hidden = false;
  frame.src = '/app?reload=' + Date.now();
}
frame.addEventListener('load', () => {
  if (frame.getAttribute('src')) document.getElementById('loading').hidden = true;
});
async function update(path, data, message) {
  if (busy) return;
  setBusy(true);
  status('Đang cập nhật…');
  try {
    renderState(await request(path, data));
    reloadApp();
    status(message);
    return true;
  } catch (error) {
    if (currentState) userInput.value = currentState.user;
    status(error.message || 'Không kết nối được bản test. Kiểm tra máy chủ rồi thử lại.', true);
    return false;
  } finally {
    setBusy(false);
  }
}
document.getElementById('clock-form').addEventListener('submit', event => {
  event.preventDefault();
  update(
    'clock',
    { local: dateInput.value + 'T' + timeInput.value },
    'Đã áp dụng giờ. Bạn có thể bấm Check-in hoặc Check-out bên dưới.'
  );
});
document.querySelectorAll('[data-minutes]').forEach(button =>
  button.addEventListener('click', () => {
    if (!currentState) return;
    const next = new Date(new Date(currentState.now).getTime() + Number(button.dataset.minutes) * 60000 + 7 * 3600000);
    update('clock', { local: next.toISOString().slice(0, 19) }, 'Đã tua thời gian và tải lại bảng chấm công.');
  })
);
userInput.addEventListener('change', () =>
  update('user', { username: userInput.value }, 'Đã đổi tài khoản thử. Dữ liệu chấm công của từng người được giữ lại.')
);
document.getElementById('reset-open').addEventListener('click', () => resetDialog.showModal());
document.getElementById('reset-cancel').addEventListener('click', () => resetDialog.close());
document.getElementById('reset-confirm').addEventListener('click', async () => {
  resetDialog.close();
  await update('reset', { confirm: true }, 'Đã xóa dữ liệu thử. Bắt đầu lại với NV, 07:55 ngày 01/10/2026.');
});
(async function start() {
  setBusy(true);
  try {
    renderState(await request('state'));
    reloadApp();
    status('Sẵn sàng. Đồng hồ giữ nguyên ở giờ bạn chọn; dữ liệu chỉ dùng cho bản test này.');
    setBusy(false);
  } catch (error) {
    document.getElementById('loading').textContent = 'Chưa kết nối được bản test. Tải lại trang để thử lại.';
    status(error.message || 'Không kết nối được bản test. Tải lại trang để thử lại.', true);
  }
})();
