<script setup lang="ts">
// Thân của một ngày (J3 trên điện thoại, K2 trên máy tính): thanh giờ trên trục ca, dòng khoá – giá trị, hộp giải trình
// (ngày có đơn giải trình chờ duyệt). Không có đầu hộp, không có nút Đóng: vỏ (hộp trượt hay ngăn kéo) tự thêm. Ngày nghỉ không
// có thanh giờ. Ngày còn cần giải trình (`due`) có nút phụ "Giải trình": liên kết mở form Giải trình điền sẵn ngày này
// (/nv/yeu-cau?tao=giai-trinh&ngay=…, spec staff-requests 4.3). Đã có đơn thì hộp trạng thái đơn thay cho nút.
//   <DayBody :day="day" />
import { computed } from 'vue';
import type { DayDetail } from '@/mock/staff-phone';
import DayTagLines from '@/components/day/DayTagLines.vue';
import { REQUESTS_PATH, TAO_SLUG } from '@/views/staff-requests/useNewRequest';

const props = defineProps<{ day: DayDetail }>();

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Ba mốc dưới thanh: giờ vào ca, giữa ca, giờ ra ca của chính ngày đó (08:00–17:00 → 12:30). Ca qua đêm thì giờ ra thuộc
// ngày sau (22:00–06:00 → 02:00).
const axis = computed(() => {
  const start = toMin(props.day.shiftStart);
  let end = toMin(props.day.shiftEnd);
  if (end <= start) end += 1440;
  return [props.day.shiftStart, hhmm(Math.round((start + end) / 2) % 1440), props.day.shiftEnd];
});

// Thanh giờ: trục là ca của ngày (vd. 08:00–17:00 = 540 phút); mỗi đoạn là [trái, phải] theo phần trăm của trục.
// Ca qua đêm (giờ ra ca không sau giờ vào ca, vd. 22:00–06:00): giờ ra ca thuộc ngày sau (+1440 phút); mỗi giờ vào, giờ ra,
// giờ hiện tại lấy t hay t + 1440, cái nào gần giữa ca hơn (vào 23:00 ở ngày đầu, ra 05:00 ở ngày sau). Ca ban ngày giữ nguyên.
const track = computed(() => {
  const d = props.day;
  if (!d.in) return null;
  const start = toMin(d.shiftStart);
  let end = toMin(d.shiftEnd);
  const night = end <= start;
  if (night) end += 1440;
  const mid = (start + end) / 2;
  const at = (time: string) => {
    const t = toMin(time);
    return night && Math.abs(t + 1440 - mid) < Math.abs(t - mid) ? t + 1440 : t;
  };
  const pct = (min: number) => Math.min(100, Math.max(0, ((min - start) / (end - start)) * 100));
  const inAt = at(d.in);
  const from = pct(Math.max(inAt, start));
  const late = inAt > start ? { left: 0, width: pct(inAt) } : null;
  // Chưa có giờ ra: hôm nay thì đoạn đã làm dừng ở giờ đồng hồ giả; ngày đã qua thì sọc tới hết ca.
  const outAt = d.out ?? (d.today ? d.now : null);
  const worked = outAt ? { left: from, width: Math.max(0, pct(at(outAt)) - from) } : null;
  const missing = outAt ? null : { left: from, width: 100 - from };
  return { late, worked, missing };
});

const pos = (s: { left: number; width: number }) => ({ left: `${s.left}%`, width: `${s.width}%` });
const explain = computed(() => ({ path: REQUESTS_PATH, query: { tao: TAO_SLUG.explanation, ngay: props.day.date } }));
</script>

<template>
  <div v-if="track">
    <div class="ds-trk" aria-hidden="true">
      <i v-if="track.late" class="ds-late" :style="pos(track.late)" />
      <i v-if="track.worked" class="ds-worked" :style="pos(track.worked)" />
      <i v-if="track.missing" class="ds-missing" :style="pos(track.missing)" />
    </div>
    <div class="sh mut sm ds-axis" aria-hidden="true"><span v-for="t in axis" :key="t">{{ t }}</span></div>
  </div>
  <div v-if="day.in">
    <div class="kv"><span class="k">Giờ vào</span><span class="v">{{ day.in }}</span></div>
    <div class="kv"><span class="k">Giờ ra</span><span class="v">{{ day.out ?? 'Chưa có' }}</span></div>
    <div v-if="day.lateMin > 0" class="kv"><span class="k">Đi muộn</span><span class="v">{{ day.lateMin }} phút</span></div>
  </div>
  <div v-else-if="day.leave">
    <div class="kv"><span class="k">Hình thức</span><span class="v">{{ day.leave.type }}</span></div>
    <div class="kv"><span class="k">Thời gian</span><span class="v">{{ day.leave.span }}</span></div>
  </div>
  <DayTagLines v-if="day.tag" class="ds-tag" :tag="day.tag" />
  <div v-if="day.claim" class="ds-claim">
    <i class="dot pend" />
    <div>
      <div class="ds-b">Đã gửi giải trình lúc {{ day.claim.sentAt }}</div>
      <div class="mut">{{ day.claim.outClaim ? `Giờ ra khai ${day.claim.outClaim} · chờ Admin duyệt` : 'Chờ Admin duyệt' }}</div>
    </div>
  </div>
  <RouterLink v-else-if="day.due" :to="explain" class="b2">Giải trình</RouterLink>
  <div v-else-if="day.expired" class="ds-claim ds-expired" role="status">
    <i class="dot rej" />
    <div>
      <div class="ds-b">Quá hạn giải trình</div>
      <div class="mut">Ngày này không còn giải trình được. Nhờ Admin xử lý nếu cần.</div>
    </div>
  </div>
</template>

<style scoped>
/* Thanh giờ: cao 12px bo 50px nền --page; ba đoạn vẽ chồng theo phần trăm của trục ca */
.ds-trk {
  position: relative;
  height: 12px;
  border-radius: 50px;
  background: var(--page);
  overflow: hidden;
}
.ds-trk i {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 50px;
}
.ds-late {
  background: var(--gold);
}
.ds-worked {
  background: var(--surface-dark);
}
.ds-missing {
  background: repeating-linear-gradient(90deg, #1c1c1c 0 6px, transparent 6px 10px);
  opacity: 0.35;
}
.ds-axis {
  margin-top: 6px;
}
/* Loại ngày và kết quả chấm công: dùng chung với hộp chi tiết ngày của Admin */
.ds-tag {
  margin: 12px 0;
}
/* Hộp giải trình: nền vàng nhạt bo 12px, chấm Chờ duyệt */
.ds-claim {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--gold-pale);
}
.ds-claim .dot {
  margin-top: 6px;
}
.ds-b {
  font-weight: 600;
}
</style>
