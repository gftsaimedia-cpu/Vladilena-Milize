// Gắn riêng một phần dùng chung của app nhân viên với dữ liệu tự dựng (không qua services, không gọi /api).
//   ?part=day&start=06:00&end=14:00   DayBody của một ngày đã ra ca, ca 06:00–14:00
//   ?part=month&prev=2026-09&next=    MonthSwitch; bấm nút thì ghi tháng nhận được vào #went
//   ?part=error                       LoadError; bấm "Thử lại" thì tăng #retries
//   ?part=shift&location=…            ShiftCard đã vào ca; thiếu location thì location = null
import { createApp, h, ref } from 'vue';
import LoadError from '../../src/views/staff-phone/components/LoadError.vue';
import DayBody from '../../src/views/staff-phone/components/DayBody.vue';
import MonthSwitch from '../../src/views/staff-phone/components/MonthSwitch.vue';
import ShiftCard from '../../src/views/staff-phone/components/ShiftCard.vue';
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
      statusText: 'Đi làm', shiftStart: start, shiftEnd: end, now: '20:00', in: start, out: end, lateMin: 0, leave: null, claim: null
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

function error() {
  const retries = ref(0);
  return () => [
    h(LoadError, { error: new Error('Mất kết nối tới máy chủ'), onRetry: () => retries.value++ }),
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
