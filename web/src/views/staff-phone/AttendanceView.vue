<script setup lang="ts">
// Chấm công: "Tháng này tôi đi làm đủ chưa, ngày nào có vấn đề?" → ba con số, lịch chỉ tô màu ngày đáng chú ý, giờ bấm hôm nay.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getAttendance, getMonthContext } from '@/services/staff-phone';
import { dayLong, monthLabel } from '@/utils/format';
import AttendanceCalendar from './components/AttendanceCalendar.vue';
import DayDetailSheet from './components/DayDetailSheet.vue';
import DayRequestSheet from './components/DayRequestSheet.vue';
import MonthSwitch from './components/MonthSwitch.vue';
import { useHop } from './useHop';

const month = ref('');
getMonthContext().then(c => (month.value = c.month));
const { data, loading } = useLoad(
  async () => getAttendance(month.value || (await getMonthContext()).month),
  () => month.value
);
const { hop, close } = useHop();

// Ngày đang xem chi tiết / đang khai: mở từ lịch, từ hộp "Khai ngày này", hoặc từ ?hop=
const detailDate = ref(null);
const declareDate = ref(null);
const shownDetail = computed(() => detailDate.value || (hop.value === 'chi-tiet-ngay' ? data.value?.sheetDate : null));

function closeDetail() {
  detailDate.value = null;
  close();
}
function declare(date?) {
  closeDetail();
  declareDate.value = date;
}
const todayLabel = computed(() => dayLong(data.value.today.date));
</script>

<template>
  <div class="att">
    <header class="ph">
      <h1>Chấm công</h1>
      <p v-if="data">{{ data.shiftLine }}</p>
    </header>
    <MonthSwitch
      :title="monthLabel(month)"
      :state="data?.stateLabel || ''"
      :has-prev="!!data?.prevMonth"
      :has-next="!!data?.nextMonth"
      @prev="month = data.prevMonth"
      @next="month = data.nextMonth"
    />

    <template v-if="data">
      <section class="sec card">
        <div class="stats">
          <div v-for="s in data.stats" :key="s.label">
            <b>{{ s.value }}</b>
            <span>{{ s.label }}</span>
          </div>
        </div>
        <div class="zero"><Icon name="check" :size="16" />{{ data.zeroNote }}</div>
      </section>

      <AttendanceCalendar :days="data.days" @select="detailDate = $event" />

      <section class="sec">
        <div class="h2">
          Hôm nay <small>{{ todayLabel }}</small>
        </div>
        <div class="card">
          <div class="punch">
            <div>
              <div class="tm">{{ data.today.time }}</div>
              <div class="s">{{ data.today.note }}</div>
            </div>
            <span class="pill live">{{ data.today.statusLabel }}</span>
          </div>
          <button type="button" class="act" @click="declareDate = data.today.date">
            <Icon name="cal" :size="18" />Khai ngày này
          </button>
        </div>
      </section>

      <section class="sec rc">
        <div class="h2">Gần đây</div>
        <div class="card">
          <div v-for="r in data.recent" :key="r.date" class="kv">
            <span class="k"
              >{{ dayLong(r.date) }}<small v-if="r.note">{{ r.note }}</small></span
            >
            <span class="v" :class="{ m: r.muted }"
              >{{ r.value }}<small v-if="r.valueNote">{{ r.valueNote }}</small></span
            >
          </div>
        </div>
      </section>
    </template>
    <p v-else-if="!loading" class="empty-month">Tháng này chưa có dữ liệu chấm công.</p>

    <DayDetailSheet v-if="shownDetail" :date="shownDetail" @close="closeDetail" @declare="declare" />
    <DayRequestSheet v-if="declareDate" :preset="{ date: declareDate, type: 'di-lam' }" @close="declareDate = null" />
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 16px 4px 14px;
}
.stats div {
  text-align: center;
}
.stats div + div {
  border-left: 1px solid var(--rule);
}
.stats b {
  display: block;
  font-size: 26px;
  line-height: 32px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stats span {
  font-size: 13px;
  color: var(--muted);
}
.zero {
  border-top: 1px solid var(--rule);
  padding: 12px 16px;
  font-size: 14px;
  line-height: 20px;
  color: var(--muted);
  display: flex;
  gap: 8px;
  align-items: center;
}
.zero svg {
  color: var(--done-ink);
}
.punch {
  padding: 14px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.punch .tm {
  font-size: 20px;
  line-height: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.punch .s {
  font-size: 14px;
  color: var(--muted);
  line-height: 20px;
}
.punch .pill {
  margin-left: auto;
}
.pill.live {
  background: var(--gold-light);
  color: #5c4310;
}
.act {
  width: calc(100% - 32px);
  margin: 0 16px 16px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--control);
  background: none;
  color: inherit;
  font: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}
.rc .kv .v small {
  display: block;
  font-weight: 400;
  color: var(--pend-ink);
  font-size: 12px;
  line-height: 16px;
}
.empty-month {
  margin: 24px 16px 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
