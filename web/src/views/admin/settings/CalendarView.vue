<script setup lang="ts">
// Cài đặt › Lịch, ca & chấm công: lịch năm (ngày lễ, ngày trả lương) và 6 ca cố định chỉ xem.
// ?hop=them-ngay-le mở hộp thêm ngày lễ.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { payDatesIn } from '@/builders/api/settings';
import { useLoad } from '@/composables/useLoad';
import { getCalendar, quickAddHolidays, removeHoliday } from '@/services/admin-settings';
import { getPayDays, getSettings, getShifts } from '@/services/settings-store';
import { usePeriodStore } from '@/stores/period';
import { dm } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import HolidayDialog from './calendar/HolidayDialog.vue';
import YearCalendar from './calendar/YearCalendar.vue';
import { useHop } from './lib/useHop';

const year = ref(Number(usePeriodStore().month.slice(0, 4))); // năm của kỳ lương đang xem
const { data, reload } = useLoad(
  () => getCalendar(year.value),
  () => year.value
);
const { data: settings } = useLoad(() => getSettings());
const { data: shifts } = useLoad(() => getShifts());
// Ngày trả lương của tháng 12 năm trước rơi vào tháng 1 năm nay, nên tải cả hai năm rồi lọc theo năm đang xem.
const { data: payDates } = useLoad(
  async () => {
    const [prev, cur] = await Promise.all([getPayDays(year.value - 1), getPayDays(year.value)]);
    return payDatesIn(year.value, [...prev.items, ...cur.items]);
  },
  () => year.value
);
// Ngày trả lương đang hiệu lực ở tháng của getSettings.
const payDay = computed(() => (settings.value ? settings.value.groups.payCalendar.values.payDay : null));
const { hop, open, close } = useHop(['them-ngay-le']);

const pickedDay = ref(''); // ngày bấm trên lịch → điền sẵn vào hộp Thêm ngày lễ
const openHoliday = (iso = '') => {
  pickedDay.value = iso;
  open('them-ngay-le');
};

// Ngày lễ dương lịch cố định (1/1, 30/4, 1/5, 2/9) của năm đang xem; ngày đã có thì máy chủ bỏ qua.
const quickBusy = ref(false);
async function quickAdd() {
  if (quickBusy.value) return;
  quickBusy.value = true;
  try {
    const res = await quickAddHolidays(year.value);
    const n = (res && res.added && res.added.length) || 0;
    toast.ok(n ? `Đã thêm ${n} ngày lễ cố định.` : 'Các ngày lễ cố định đã có đủ.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    quickBusy.value = false;
  }
  reload();
}

const rangeLabel = (h?) => (h.from === h.to ? dm(h.from) : `${dm(h.from)} – ${dm(h.to)}`);
async function dropHoliday(id?) {
  try {
    await removeHoliday(id);
  } catch (e) {
    toast.error(e.message);
  }
  reload();
}

// Loại ca: chấm màu như thiết kế
const KIND_TEXT = { normal: 'Normal', flex: 'Flex', night: 'Night' };
const DOT = { normal: '#1f3d73', flex: '#b5803f', night: '#212121' };
// Giờ ra nhỏ hơn giờ vào: ca qua nửa đêm, kết thúc vào hôm sau.
const nextDay = (s?) => s.endTime < s.startTime;
</script>

<template>
  <SettingsFrame active="lich">
    <template #sub>
      <template v-if="data && payDay">
        Năm {{ data.year }} · <b>{{ data.holidayDays }} ngày lễ</b> · trả lương ngày {{ payDay }} tháng sau
      </template>
    </template>

    <section v-if="data && payDay" class="card">
      <div class="card-h" style="align-items: center">
        <h2>Lịch năm</h2>
        <span class="yr">
          <button type="button" class="pb" aria-label="Năm trước" @click="year--"><Icon name="chevl" /></button>
          <b>{{ year }}</b>
          <button type="button" class="pb" aria-label="Năm sau" @click="year++"><Icon name="chevr" /></button>
        </span>
        <span class="lgd">
          <span>
            <span
              style="border-bottom: 1.5px solid var(--text); font-weight: 600; color: var(--text); padding: 0 3px"
              >{{ data.startDay }}</span
            >
            Bắt đầu tính công: <b>ngày {{ data.startDay }}</b> hằng tháng
          </span>
          <span>
            <span class="paydot">{{ payDay }}</span>
            Trả lương: <b>ngày {{ payDay }}</b> tháng sau
          </span>
          <span>
            <i
              style="
                width: 14px;
                height: 14px;
                border-radius: 4px;
                background: var(--gold-light);
                display: inline-block;
              "
            ></i>
            Ngày lễ: <b>{{ data.holidayDays }} ngày</b>
          </span>
        </span>
      </div>
      <div class="cap" style="padding: 0 24px 8px; color: var(--muted); font-size: 13px">
        Bấm vào một ngày để đặt ngày lễ, ngày trả lương hoặc ngày bắt đầu tính công
      </div>
      <YearCalendar
        :year="data.year"
        :holidays="data.holidays"
        :start-day="data.startDay"
        :pay-dates="payDates || []"
        @pick="openHoliday"
      />
      <div class="hol">
        <span v-for="h in data.holidays" :key="h.id" class="h" :title="h.name || undefined">
          {{ rangeLabel(h) }}
          <button type="button" class="rm" :aria-label="`Bỏ ngày lễ ${rangeLabel(h)}`" @click="dropHoliday(h.id)">
            <Icon name="x" :size="12" :stroke="2" />
          </button>
        </span>
        <button type="button" class="add" @click="openHoliday()"><Icon name="plus" />Thêm ngày lễ</button>
        <button type="button" class="add" :disabled="quickBusy" @click="quickAdd">
          <Icon name="plus" />Thêm các ngày lễ cố định {{ data.year }}
        </button>
      </div>
    </section>

    <div v-if="shifts" class="row2">
      <section class="card">
        <div class="card-h">
          <h2>Ca làm</h2>
          <span class="cap">{{ shifts.length }} ca cố định</span>
        </div>
        <table class="tbl ca">
          <colgroup>
            <col />
            <col style="width: 96px" />
            <col style="width: 150px" />
            <col style="width: 96px" />
          </colgroup>
          <thead>
            <tr>
              <th>Tên ca</th>
              <th>Giờ vào</th>
              <th>Giờ ra</th>
              <th>Loại</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in shifts" :key="s.code">
              <td>{{ s.name }}</td>
              <td>{{ s.startTime }}</td>
              <td>
                {{ s.endTime }}
                <span v-if="nextDay(s)" class="ns">hôm sau</span>
              </td>
              <td>
                <span class="tg">
                  <i :style="{ background: DOT[s.kind] }"></i>
                  {{ KIND_TEXT[s.kind] || s.kind }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Chỗ của thẻ "Ngày trả lương" (Task 4) và "Vùng chấm công" (Task 5). -->
      <div class="slots">
        <section class="slot-pay-day"></section>
        <section class="slot-zone"></section>
      </div>
    </div>
  </SettingsFrame>

  <HolidayDialog
    v-if="hop === 'them-ngay-le' && data"
    :year="data.year"
    :from="pickedDay"
    @close="close"
    @saved="reload"
  />
</template>

<style scoped>
.yr {
  display: flex;
  align-items: center;
  gap: 8px;
}
.yr b {
  font-size: 16px;
}
.yr .pb {
  width: 28px;
  height: 28px;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--muted);
  background: #fff;
}
.lgd {
  margin-left: auto;
  display: flex;
  gap: 18px;
  font-size: 12px;
  color: var(--muted);
  align-items: center;
}
.lgd span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.lgd b {
  color: var(--text);
  font-weight: 600;
}
.lgd .paydot {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}
.hol {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 24px 18px;
  border-top: 1px solid var(--rule);
  align-items: center;
}
.hol .h {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px 0 12px;
  border-radius: 999px;
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.hol .rm {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: none;
  padding: 0;
  color: #9e9e9e;
  cursor: pointer;
}
.hol .add {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed #b5b5b5;
  font-size: 13px;
  font-weight: 500;
  background: none;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
}
.row2 {
  display: grid;
  grid-template-columns: 504px 364px;
  gap: 24px;
  align-items: stretch;
}
.ca td {
  height: 52px;
}
.ca .tg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.ca .tg i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex: none;
}
.ca .ns {
  color: var(--muted);
  font-size: 12px;
  margin-left: 6px;
}
.slots {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
