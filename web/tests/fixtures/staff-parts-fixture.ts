// Gắn riêng một phần dùng chung của app nhân viên với dữ liệu tự dựng (không qua services, không gọi /api).
//   ?part=day&start=06:00&end=14:00   DayBody của một ngày đã ra ca, ca 06:00–14:00 (vào đúng giờ vào ca, ra đúng giờ ra ca)
//   ?part=day&…&in=23:00&out=05:00    giờ vào / giờ ra khác giờ ca
//   ?part=month&prev=2026-09&next=    MonthSwitch; bấm nút thì ghi tháng nhận được vào #went
//   ?part=error                       LoadError với lỗi máy chủ (ApiError); bấm "Thử lại" thì tăng #retries
//   ?part=error&kind=bug              LoadError với lỗi lập trình (TypeError) thay vì lỗi máy chủ
//   ?part=shift&location=…            ShiftCard đã vào ca; thiếu location thì location = null
import { createApp, h, ref } from 'vue';
import LoadError from '../../src/views/staff-phone/components/LoadError.vue';
import DayBody from '../../src/views/staff-phone/components/DayBody.vue';
import MonthSwitch from '../../src/views/staff-phone/components/MonthSwitch.vue';
import ShiftCard from '../../src/views/staff-phone/components/ShiftCard.vue';
import { ApiError } from '../../src/services/http';
import '../../src/styles/base.css';
import '../../src/styles/phone.css';

const q = new URLSearchParams(location.search);
const part = q.get('part');

function day() {
  const start = q.get('start') ?? '08:00';
  const end = q.get('end') ?? '17:00';
  return h(DayBody, {
    day: {
      date: '2026-11-03', title: 'Thứ Ba 03/11/2026', shiftLine: `Ca ${start}–${end}`, kind: 'work', today: false,
      statusText: 'Đi làm', shiftStart: start, shiftEnd: end, now: '20:00', in: q.get('in') ?? start, out: q.get('out') ?? end,
      lateMin: 0, leave: null, claim: null
    }
  });
}

function month() {
  const went = ref('');
  return () => [
    h(MonthSwitch, { label: 'Tháng 10/2026', state: 'Kỳ công đang mở', prev: q.get('prev') || null, next: q.get('next') || null, onGo: (m: string) => (went.value = m) }),
    h('output', { id: 'went' }, went.value)
  ];
}

const failure = () =>
  q.get('kind') === 'bug'
    ? new TypeError("Cannot read properties of undefined (reading 'net')")
    : new ApiError(0, 'Không kết nối được máy chủ.', { code: 'network' });

function error() {
  const retries = ref(0);
  return () => [
    h(LoadError, { error: failure(), onRetry: () => retries.value++ }),
    h('output', { id: 'retries' }, String(retries.value))
  ];
}

function shift() {
  return h(ShiftCard, {
    home: {
      greeting: 'Chào buổi sáng', name: 'Lê Hoàng Nam', initials: 'HN', weekday: 'Thứ Năm', date: '05/11/2026',
      shiftLabel: 'Ca HC · 08:00–17:00', shiftStart: '08:00', shiftEnd: '17:00', now: '09:40', checkIn: '07:59', checkOut: null,
      workedMin: 101, shiftMin: 540, worked: '1g 41p', location: q.get('location'),
      week: { range: '', cells: [] }, alert: null, income: { label: '', net: '' }, requests: []
    }
  });
}

const parts: Record<string, () => any> = {
  day: () => day,
  month,
  error,
  shift: () => shift
};

createApp({ setup: parts[part ?? ''] ?? (() => () => h('p', `Không có phần "${part}"`)) }).mount('#app');
