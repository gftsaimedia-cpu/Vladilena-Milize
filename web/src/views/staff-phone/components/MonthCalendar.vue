<script setup lang="ts">
// Thẻ lịch tháng 10 (J2 mục 4, K1 cột 2): ô có dữ liệu là nút, bấm phát open(date); màn cha quyết định mở ngày thế nào.
//   <MonthCalendar :cells="data.cells" @open="openDay" />
import type { AttendanceView } from '@/mock/staff-phone';

defineProps<{ cells: AttendanceView['cells'] }>();
const emit = defineEmits<{ open: [date: string] }>();

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
</script>

<template>
  <section class="card at-cal" aria-label="Lịch tháng 10">
    <div class="at-grid">
      <span v-for="w in WEEKDAYS" :key="w" class="at-wd">{{ w }}</span>
      <template v-for="(c, i) in cells" :key="c ? c.date : `blank-${i}`">
        <span v-if="!c" aria-hidden="true" />
        <span v-else class="dc">
          <button
            v-if="c.open"
            type="button"
            class="dn"
            :class="[c.kind, { today: c.today, pend: c.tag?.requestPending, rej: !!c.tag?.declined }]"
            :data-date="c.date"
            :aria-label="c.label"
            @click="emit('open', c.date)"
          >
            {{ c.day }}
          </button>
          <span v-else role="img" class="dn" :class="[c.kind, { today: c.today, pend: c.tag?.requestPending, rej: !!c.tag?.declined }]" :aria-label="c.label">{{ c.day }}</span>
        </span>
      </template>
    </div>
    <div class="at-lg">
      <span><i class="dot work" />Đi làm</span>
      <span><i class="dot late" />Đi muộn</span>
      <span><i class="dot leave" />Nghỉ có lương</span>
      <span><i class="dot todo" />Cần xử lý</span>
      <span><i class="ring pend" />Đơn chờ duyệt</span>
      <span><i class="ring rej" />Đơn bị từ chối / huỷ</span>
    </div>
  </section>
</template>

<style scoped>
/* Thẻ lịch: lưới 7 cột, hàng nhãn T2…CN, chú giải ngăn bằng đường kẻ */
.at-cal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 12px;
}
.at-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  justify-items: center;
  column-gap: 6px;
  row-gap: 8px;
}
/* Ô ngày co theo cột (tối đa 40px, luôn vuông), cả nút lẫn ô role="img", để bảy ô vừa thẻ ở mọi bề ngang từ 320px */
.dc {
  width: 100%;
  display: flex;
  justify-content: center;
}
.ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--status-pending);
}
.ring.rej {
  border-color: var(--status-rejected);
}
.at-grid .dn {
  width: 100%;
  max-width: 40px;
  height: auto;
  aspect-ratio: 1;
}
.at-wd {
  padding-bottom: 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
button.dn {
  cursor: pointer;
}
.at-lg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.at-lg span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
