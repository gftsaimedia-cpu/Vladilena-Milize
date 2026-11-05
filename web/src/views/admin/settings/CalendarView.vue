<script setup lang="ts">
// Cài đặt › Lịch, ca & chấm công: lịch năm và ngày lễ, ca làm và vùng chấm công.
// ?hop=them-ngay-le mở hộp thêm ngày lễ.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getCalendar, getCalendarSetup, quickAddHolidays, removeHoliday, saveCalendarSetup } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import { dm } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import HolidayDialog from './calendar/HolidayDialog.vue';
import YearCalendar from './calendar/YearCalendar.vue';
import FieldNum from './fields/FieldNum.vue';
import FieldText from './fields/FieldText.vue';
import SaveBar from './fields/SaveBar.vue';
import { useDraft } from './lib/useDraft';
import { useHop } from './lib/useHop';

const year = ref(Number(usePeriodStore().month.slice(0, 4))); // năm của kỳ lương đang xem
const { data, reload } = useLoad(
  () => getCalendar(year.value),
  () => year.value
);
const { data: setup } = useLoad(() => getCalendarSetup());
const form = useDraft(() => setup.value);
const { draft } = form;
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
const SHIFT_TYPES = ['Normal', 'Flex', 'Night'];
const DOT = { Normal: '#1f3d73', Flex: '#b5803f', Night: '#212121' };

// Hình minh hoạ vùng chấm công: bán kính vòng tròn vẽ theo bán kính thật (mét)
const PX_PER_METER = 40 / 150;
const circleR = computed(() =>
  Math.min(72, Math.max(10, (draft.value ? draft.value.zone.radius || 0 : 0) * PX_PER_METER))
);

function useHere() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    p => {
      draft.value.zone.lat = p.coords.latitude;
      draft.value.zone.lng = p.coords.longitude;
    },
    () => {}
  );
}
</script>

<template>
  <SettingsFrame active="lich">
    <template #sub>
      <template v-if="data">
        Năm {{ data.year }} · <b>{{ data.holidayDays }} ngày lễ</b> · trả lương ngày {{ data.payDay ?? "—" }} tháng sau
      </template>
    </template>

    <section v-if="data" class="card">
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
            <span class="paydot">{{ data.payDay ?? "—" }}</span>
            Trả lương: <b>ngày {{ data.payDay ?? "—" }}</b> tháng sau
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
        :pay-day="data.payDay"
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

    <div v-if="draft && data" class="row2">
      <section class="card">
        <div class="card-h">
          <h2>Ca làm</h2>
          <span class="cap">{{ draft.shifts.length }} ca</span>
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
            <tr v-for="(s, i) in draft.shifts" :key="i">
              <td>
                <FieldText v-model="s.name" placeholder="Tên ca" label="Tên ca" disabled style="min-width: 150px" />
              </td>
              <td><FieldText v-model="s.start" label="Giờ vào" /></td>
              <td>
                <FieldText v-model="s.end" label="Giờ ra" />
                <span v-if="s.nextDay" class="ns">hôm sau</span>
              </td>
              <td>
                <span class="tg">
                  <i :style="{ background: DOT[s.type] }"></i>
                  <select v-model="s.type" disabled :aria-label="`Loại ca ${s.name}`">
                    <option v-for="t in SHIFT_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <div class="card-h"><h2>Chấm công</h2></div>
        <div class="cc">
          <div style="font-weight: 600; font-size: 14px; margin-top: 18px">Vùng chấm công</div>
          <div class="map">
            <svg
              width="100%"
              height="150"
              viewBox="0 0 316 150"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
            >
              <rect width="316" height="150" fill="#f1efe9" />
              <g stroke="#ffffff" stroke-width="9"><path d="M0 40H316M0 104H316M58 0V150M150 0V150M244 0V150" /></g>
              <g stroke="#ffffff" stroke-width="4"><path d="M0 72H316M104 0V150M198 0V150" /></g>
              <circle
                cx="176"
                cy="80"
                :r="circleR"
                fill="#b5803f"
                fill-opacity=".14"
                stroke="#b5803f"
                stroke-width="1.5"
              />
              <circle cx="176" cy="80" r="8" fill="#212121" />
              <circle cx="176" cy="80" r="3" fill="#fff" />
              <circle :cx="176 + circleR" cy="80" r="5" fill="#fff" stroke="#b5803f" stroke-width="2" />
            </svg>
          </div>
          <div class="rad">
            Bán kính
            <FieldNum v-model="draft.zone.radius" unit="m" style="min-width: 84px" label="Bán kính vùng chấm công" />
            <button type="button" class="btn sm" style="margin-left: auto" @click="useHere">
              <Icon name="pin" />Dùng vị trí hiện tại
            </button>
          </div>
        </div>
      </section>
    </div>

    <section v-if="form.changes.value || form.saved.value" class="card">
      <SaveBar
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="form.save(d => saveCalendarSetup(d))"
      />
    </section>
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
.ca .tg select {
  appearance: none;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  padding: 0;
  cursor: pointer;
  outline: 0;
}
.ca .ns {
  color: var(--muted);
  font-size: 12px;
  margin-left: 6px;
}
.cc {
  padding: 0 24px 20px;
}
.cc .dt {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--raised);
  border: 1px solid var(--border);
  font-size: 13px;
  line-height: 20px;
}
.cc .dt b {
  font-weight: 600;
}
.cc .dt .link {
  display: inline-block;
  margin-top: 4px;
}
.map {
  margin-top: 14px;
  height: 150px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.rad {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  font-size: 13px;
  white-space: nowrap;
}
.cc .hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
  margin-top: 10px;
}
</style>
