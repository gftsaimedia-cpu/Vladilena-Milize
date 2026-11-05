// Gắn riêng một phần dùng chung của app nhân viên với dữ liệu tự dựng (không qua services, không gọi /api).
//   ?part=day&start=06:00&end=14:00   DayBody của một ngày đã ra ca, ca 06:00–14:00
//   ?part=day&…&in=23:00&out=05:00     giờ vào / giờ ra của ngày đó (thiếu thì vào đúng giờ vào ca, ra đúng giờ ra ca)
//   ?part=month&prev=2026-09&next=    MonthSwitch; bấm nút thì ghi tháng nhận được vào #went
//   ?part=error                       LoadError với lỗi máy chủ (ApiError); bấm "Thử lại" thì tăng #retries
//   ?part=error&kind=bug              LoadError với lỗi lập trình (TypeError) thay vì lỗi máy chủ
//   ?part=shift&location=…            ShiftCard đã vào ca; thiếu location thì location = null
//   ?part=shift&zone=1&out=17:05      zone=1: có vùng chấm công (văn phòng GFT, 150 m); out: giờ ra (ca đã xong, không còn nút)
//   ?part=shift&zone=1&in=0           in=0: chưa vào ca (nút Check-in); workday=0: hôm nay không phải ngày làm
//   ?part=load&fail=1                 khối tải giả (useLoad + useRetry + LoadError): n lần tải đầu lỗi; #loads đếm số lần tải
//   ?part=load&bad=2026-09            như trên, có chọn tháng (đang ở 10/2026, lùi được tới 09/2026); tháng bad luôn lỗi
//   ?part=net&state=Chính thức        NetCard của Tháng 9/2026 với trạng thái đó (mặc định Tạm tính)
import { createApp, h, ref } from 'vue';
import { useLoad } from '../../src/composables/useLoad';
import { backTo, useRetry } from '../../src/composables/useRetry';
import LoadError from '../../src/views/staff-phone/components/LoadError.vue';
import DayBody from '../../src/views/staff-phone/components/DayBody.vue';
import MonthSwitch from '../../src/views/staff-phone/components/MonthSwitch.vue';
import NetCard from '../../src/views/staff-phone/components/NetCard.vue';
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

function net() {
  return h(NetCard, {
    income: {
      title: 'Thu nhập', note: '', label: 'Tháng 9/2026', state: q.get('state') ?? 'Tạm tính', month: '2026-09', prev: null, next: null,
      net: '12.957.270', review: 'Admin đã duyệt phiếu', gross: '15.010.154', deduction: '2.052.884',
      kpi: { title: 'KPI tháng 9', parts: '5 phần', percent: '80%', ratio: 0.8, pay: '0', proposed: '0', scores: [] },
      lines: [], total: '12.957.270 ₫'
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
      shiftLabel: 'Ca HC · 08:00–17:00', shiftStart: '08:00', shiftEnd: '17:00', now: '09:40', checkIn: q.get('in') === '0' ? null : '07:59', checkOut: q.get('out'),
      workedMin: 101, shiftMin: 540, worked: '1g 41p', location: q.get('location'),
      zone: q.get('zone') ? { lat: 10.7769, lng: 106.7009, radiusM: 150 } : null, workday: q.get('workday') !== '0',
      week: { range: '', cells: [] }, alert: null, income: { label: '', net: '' }, requests: []
    }
  });
}

function load() {
  let fails = Number(q.get('fail') ?? 0);
  const bad = q.get('bad');
  const month = ref<string | null>(null);
  const loads = ref(0);
  const label = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
  const state = useLoad(async () => {
    loads.value++;
    const m = month.value ?? '2026-10';
    if (fails > 0 || m === bad) {
      fails = Math.max(0, fails - 1);
      throw new ApiError(0, 'Không kết nối được máy chủ.', { code: 'network' });
    }
    return { month: m, label: label(m), prev: m === '2026-10' ? '2026-09' : null, next: m === '2026-09' ? '2026-10' : null };
  }, () => month.value);
  const head = ref<HTMLElement | null>(null);
  const { errBox, retry, after } = useRetry(state, head);
  return () => {
    const { data, error } = state;
    const back = backTo(data.value, month.value);
    return [
      error.value
        ? h(LoadError, {
            ref: errBox, error: error.value, back: back?.text,
            onRetry: retry, onBack: () => after(() => (month.value = back!.month))
          })
        : data.value
          ? [
              h('h2', { ref: head, tabindex: -1 }, data.value.label),
              h(MonthSwitch, { label: data.value.label, state: '', prev: data.value.prev, next: data.value.next, onGo: (m: string) => (month.value = m) })
            ]
          : null,
      h('output', { id: 'loads' }, String(loads.value))
    ];
  };
}

const parts: Record<string, () => any> = {
  day: () => day,
  month,
  error,
  shift: () => shift,
  net: () => net,
  load
};

createApp({ setup: parts[part ?? ''] ?? (() => () => h('p', `Không có phần "${part}"`)) }).mount('#app');
