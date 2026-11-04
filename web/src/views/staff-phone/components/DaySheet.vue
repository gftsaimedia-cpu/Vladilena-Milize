<script setup lang="ts">
// J3 · Hộp trượt một ngày (spec 6): đầu hộp (ngày, ca, nhãn trạng thái), thanh giờ trên trục ca, dòng khoá – giá trị,
// hộp giải trình (ngày có giải trình) và nút Đóng. Mở trên J2; ngày nghỉ không có thanh giờ.
//   <DaySheet :day="day" @close="…" />
import { computed } from 'vue';
import type { DayDetail } from '@/mock/staff-phone';
import BottomSheet from './BottomSheet.vue';

const props = defineProps<{ day: DayDetail }>();
defineEmits<{ close: [] }>();

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Thanh giờ: trục là ca (08:00–17:00 = 540 phút); mỗi đoạn là [trái, phải] theo phần trăm của trục.
const track = computed(() => {
  const d = props.day;
  if (!d.in) return null;
  const start = toMin(d.shiftStart);
  const span = toMin(d.shiftEnd) - start;
  const pct = (min: number) => Math.min(100, Math.max(0, ((min - start) / span) * 100));
  const inAt = toMin(d.in);
  const from = pct(Math.max(inAt, start));
  const late = inAt > start ? { left: 0, width: pct(inAt) } : null;
  // Chưa có giờ ra: hôm nay thì đoạn đã làm dừng ở giờ đồng hồ giả; ngày đã qua thì sọc tới hết ca.
  const outAt = d.out ?? (d.today ? d.now : null);
  const worked = outAt ? { left: from, width: Math.max(0, pct(toMin(outAt)) - from) } : null;
  const missing = outAt ? null : { left: from, width: 100 - from };
  return { late, worked, missing };
});

const pos = (s: { left: number; width: number }) => ({ left: `${s.left}%`, width: `${s.width}%` });
// Chấm của nhãn trạng thái theo nhóm ngày (hôm nay đang làm cũng là nhóm Đi làm).
const dotClass = computed(() => props.day.kind);
</script>

<template>
  <BottomSheet :title="day.title" :sub="day.shiftLine" @close="$emit('close')">
    <template #badge>
      <span class="st"><i class="dot" :class="dotClass" />{{ day.statusText }}</span>
    </template>
    <div v-if="track">
      <div class="ds-trk" aria-hidden="true">
        <i v-if="track.late" class="ds-late" :style="pos(track.late)" />
        <i v-if="track.worked" class="ds-worked" :style="pos(track.worked)" />
        <i v-if="track.missing" class="ds-missing" :style="pos(track.missing)" />
      </div>
      <div class="sh mut sm ds-axis" aria-hidden="true"><span>08:00</span><span>12:30</span><span>17:00</span></div>
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
    <div v-if="day.claim" class="ds-claim">
      <i class="dot pend" />
      <div>
        <div class="ds-b">Đã gửi giải trình lúc {{ day.claim.sentAt }}</div>
        <div class="mut">Giờ ra khai {{ day.claim.outClaim }} · chờ Admin duyệt</div>
      </div>
    </div>
    <button type="button" class="b2" @click="$emit('close')">Đóng</button>
  </BottomSheet>
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
