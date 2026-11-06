<script setup lang="ts">
// Cài đặt › Lịch, ca & chấm công: lịch năm (ngày lễ, ngày trả lương), 6 ca cố định chỉ xem, ngày trả lương và vùng chấm công.
// ?hop=them-ngay-le mở hộp thêm ngày lễ.
import ScrollX from '@/components/ui/ScrollX.vue';
import { computed, ref, watch, type Ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { payDatesIn, payDayHint, zoneErrors, zoneLines } from '@/builders/api/settings';
import { useLoad } from '@/composables/useLoad';
import { getCalendar, quickAddHolidays, removeHoliday } from '@/services/admin-settings';
import {
  getAttendanceZone,
  getPayDays,
  getSettings,
  getShifts,
  isStale,
  saveAttendanceZone,
  STALE_TEXT
} from '@/services/settings-store';
import { usePeriodStore } from '@/stores/period';
import { dm } from '@/utils/format';
import SettingsFrame from './SettingsFrame.vue';
import HolidayDialog from './calendar/HolidayDialog.vue';
import YearCalendar from './calendar/YearCalendar.vue';
import FieldNum from './fields/FieldNum.vue';
import LoadFail from './fields/LoadFail.vue';
import SaveConfirmDialog from './fields/SaveConfirmDialog.vue';
import SelectBox from './fields/SelectBox.vue';
import TextBox from './fields/TextBox.vue';
import { REASON_MAX } from './lib/rules';
import { useHop } from './lib/useHop';
import { useSettingsDraft } from './lib/useSettingsDraft';

const year = ref(Number(usePeriodStore().month.slice(0, 4))); // năm của kỳ lương đang xem
const {
  data,
  error: calendarError,
  reload
} = useLoad(
  () => getCalendar(year.value),
  () => year.value
);
const { data: settings, error: settingsError, reload: reloadSettings } = useLoad(() => getSettings());
const { data: shifts, error: shiftsError, reload: reloadShifts } = useLoad(() => getShifts());
// Ngày trả lương của tháng 12 năm trước rơi vào tháng 1 năm nay, nên tải cả hai năm rồi lọc theo năm đang xem.
const {
  data: payDates,
  error: payDatesError,
  reload: reloadPayDates
} = useLoad(
  async () => {
    const [prev, cur] = await Promise.all([getPayDays(year.value - 1), getPayDays(year.value)]);
    return payDatesIn(year.value, [...prev.items, ...cur.items]);
  },
  () => year.value
);
// Ngày trả lương đang hiệu lực ở tháng của getSettings.
const payDay = computed(() => (settings.value ? settings.value.groups.payCalendar.values.payDay : null));
// Thẻ "Lịch năm" cần cả lịch nghỉ lễ, ngày trả lương đang hiệu lực và các ngày trả lương của năm.
const yearError = computed(() => calendarError.value || settingsError.value || payDatesError.value);
function retryYear() {
  if (calendarError.value) reload();
  if (settingsError.value) reloadSettings();
  if (payDatesError.value) reloadPayDates();
}
const { hop, open, close } = useHop(['them-ngay-le']);

// Thẻ "Ngày trả lương": ngày trả 1–28, áp dụng từ một tháng; lưu xong thì tải lại để các chấm ngày trả lương dời theo.
const pay = useSettingsDraft('payCalendar', ['payDay']);
// Nhóm payCalendar chỉ có ô số; Values cho phép cả mảng bậc nên ép kiểu cho v-model của FieldNum.
const payNums = pay.draft as unknown as Ref<Record<string, number>>;
const payDraftDay = computed(() => pay.draft.value.payDay as number | null);
const payError = computed(() => pay.errors.value.payDay || '');
const payHint = computed(() => payError.value || (pay.ready.value ? payDayHint(pay.month.value, payDraftDay.value as number) : ''));
const payFoot = computed(() => {
  const first = Object.values(pay.errors.value)[0];
  if (first) return first;
  const n = pay.changed.value.length;
  return n ? `Có ${n} thay đổi chưa lưu` : 'Chưa có thay đổi';
});
const confirming = ref(false);
async function confirmPay() {
  const ok = await pay.save();
  confirming.value = false;
  if (ok) {
    reloadPayDates();
    reloadSettings();
  }
}

// Thẻ "Vùng chấm công": lưu là áp dụng ngay, không theo tháng, không có ô lý do. Không dùng useSettingsDraft vì vùng không có tháng.
const { data: zoneData, error: zoneError, reload: reloadZone } = useLoad(() => getAttendanceZone());
const zLat = ref<number | null>(null);
const zLng = ref<number | null>(null);
const zRadius = ref<number | null>(null);
const zoneReady = computed(() => !!zoneData.value);
// Mỗi lần đọc xong (lần đầu, sau khi lưu, sau khi tải lại vì 409): ô chưa gõ (còn bằng vùng đọc lần trước) theo vùng
// vừa đọc, ô đã gõ giữ số đã gõ, như các màn cài đặt khác; nhờ vậy 409 chỉ làm mới vùng đã lưu và stamp.
watch(
  zoneData,
  (v, old) => {
    const z = v ? v.zone : null;
    const prev = old ? old.zone : null;
    if (zLat.value === (prev ? prev.lat : null)) zLat.value = z ? z.lat : null;
    if (zLng.value === (prev ? prev.lng : null)) zLng.value = z ? z.lng : null;
    if (zRadius.value === (prev ? prev.radiusM : null)) zRadius.value = z ? z.radiusM : null;
  },
  { immediate: true }
);
const zErrors = computed(() => zoneErrors({ lat: zLat.value, lng: zLng.value, radiusM: zRadius.value }));
const zoneSaved = computed(() => (zoneData.value ? zoneData.value.zone : null));
const zChanged = computed(() => {
  const s = zoneSaved.value;
  if (!s) return true; // chưa có vùng nào: điền đủ là có gì đó để lưu
  return s.lat !== zLat.value || s.lng !== zLng.value || s.radiusM !== zRadius.value;
});
const zConfirming = ref(false);
const zSaving = ref(false);
const zCanSave = computed(() => zoneReady.value && zChanged.value && !Object.keys(zErrors.value).length && !zSaving.value);
const zFoot = computed(() => {
  const first = Object.values(zErrors.value)[0];
  if (first) return first;
  return zChanged.value ? 'Có thay đổi chưa lưu' : 'Chưa có thay đổi';
});
const zLines = computed(() =>
  zConfirming.value ? zoneLines(zoneSaved.value, { lat: zLat.value, lng: zLng.value, radiusM: zRadius.value }) : []
);
async function confirmZone() {
  const stamp = zoneData.value.stamp;
  zSaving.value = true;
  try {
    await saveAttendanceZone({ lat: zLat.value, lng: zLng.value, radiusM: zRadius.value, reason: null, stamp });
    toast.ok('Đã lưu');
    zConfirming.value = false;
    await reloadZone();
  } catch (e) {
    zConfirming.value = false;
    if (isStale(e)) {
      toast.error(STALE_TEXT);
      await reloadZone();
    } else toast.error(e.message);
  } finally {
    zSaving.value = false;
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
function useHere() {
  if (!navigator.geolocation) {
    toast.error('Không lấy được vị trí');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => {
      zLat.value = round6(p.coords.latitude);
      zLng.value = round6(p.coords.longitude);
    },
    () => toast.error('Không lấy được vị trí')
  );
}

// Hình minh hoạ: bán kính vòng tròn vẽ theo bán kính thật (mét), giữ trong 10–72 px.
const PX_PER_METER = 40 / 150;
const circleR = computed(() => Math.min(72, Math.max(10, (zRadius.value || 0) * PX_PER_METER)));

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

    <section v-if="data && payDay && payDates" class="card">
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
    <section v-else-if="yearError" class="card">
      <div class="card-h"><h2>Lịch năm</h2></div>
      <LoadFail what="lịch năm" @retry="retryYear" />
    </section>

    <div class="row2">
      <!-- Thẻ "Ngày trả lương". -->
      <div class="slots">
        <section class="card pd">
          <div class="card-h">
            <h2>Ngày trả lương</h2>
          </div>
          <div v-if="pay.ready.value" class="pd-body">
            <div class="pd-fld pd-first">
              <label>Ngày trả lương hằng tháng</label>
              <FieldNum v-model="payNums.payDay" label="Ngày trả lương hằng tháng" integer :max="28" />
            </div>
            <p class="pd-hint" :class="{ bad: payError }">{{ payHint }}</p>
            <div class="pd-fld">
              <label>Áp dụng từ tháng</label>
              <SelectBox v-model="pay.month.value" variant="inp" :options="pay.months.value" label="Áp dụng từ tháng" />
            </div>
            <div class="pd-fld">
              <label>Lý do <small>(không bắt buộc)</small></label>
              <TextBox v-model="pay.reason.value" area :maxlength="REASON_MAX" label="Lý do" />
              <small class="pd-count">{{ pay.reason.value.length }}/{{ REASON_MAX }}</small>
            </div>
            <p class="pd-fix">Bắt đầu tính công: <b>ngày 1</b></p>
          </div>
          <LoadFail v-else-if="pay.error.value" what="ngày trả lương" @retry="pay.retry" />
          <div v-if="!pay.error.value" class="foot">
            <span :class="{ bad: Object.keys(pay.errors.value).length }">{{ payFoot }}</span>
            <button
              type="button"
              class="btn sm r"
              :class="pay.canSave.value ? 'pri' : 'off'"
              :disabled="!pay.canSave.value"
              @click="confirming = true"
            >
              Lưu
            </button>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-h">
          <h2>Ca làm</h2>
          <span v-if="shifts" class="cap">{{ shifts.length }} ca cố định</span>
        </div>
        <LoadFail v-if="shiftsError" what="ca làm" @retry="reloadShifts" />
        <ScrollX v-else-if="shifts" label="Các ca làm"><table class="tbl ca">
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
              <td class="nm">{{ s.name }}</td>
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
        </table></ScrollX>
      </section>
    </div>

    <section v-if="zoneReady" class="card zn">
      <div class="card-h">
        <h2>Vùng chấm công</h2>
        <span class="cap">Nhân viên chấm công được khi ở trong vùng này</span>
      </div>
      <div class="zn-body">
        <div class="map">
          <svg width="100%" height="100%" viewBox="0 0 316 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <rect width="316" height="150" fill="#f1efe9" />
            <g stroke="#ffffff" stroke-width="9"><path d="M0 40H316M0 104H316M58 0V150M150 0V150M244 0V150" /></g>
            <g stroke="#ffffff" stroke-width="4"><path d="M0 72H316M104 0V150M198 0V150" /></g>
            <circle cx="176" cy="80" :r="circleR" fill="#b5803f" fill-opacity=".14" stroke="#b5803f" stroke-width="1.5" />
            <circle cx="176" cy="80" r="8" fill="#212121" />
            <circle cx="176" cy="80" r="3" fill="#fff" />
            <circle :cx="176 + circleR" cy="80" r="5" fill="#fff" stroke="#b5803f" stroke-width="2" />
          </svg>
        </div>
        <div class="zn-fields">
          <div class="zn-fld">
            <label>Bán kính</label>
            <FieldNum v-model="zRadius" label="Bán kính vùng chấm công" integer :max="5000" unit="m" />
            <small class="zn-hint" :class="{ bad: zErrors.radiusM }">Từ 20 đến 5.000 m</small>
          </div>
          <div class="zn-fld">
            <label>Vĩ độ</label>
            <FieldNum v-model="zLat" label="Vĩ độ" :decimals="6" :max="90" />
            <small v-if="zErrors.lat" class="zn-hint bad">{{ zErrors.lat }}</small>
          </div>
          <div class="zn-fld">
            <label>Kinh độ</label>
            <FieldNum v-model="zLng" label="Kinh độ" :decimals="6" :max="180" />
            <small v-if="zErrors.lng" class="zn-hint bad">{{ zErrors.lng }}</small>
          </div>
          <button type="button" class="btn sm zn-here" @click="useHere"><Icon name="pin" />Dùng vị trí hiện tại</button>
        <div class="foot zn-foot">
          <span :class="{ bad: Object.keys(zErrors).length }">{{ zFoot }} · lưu là áp dụng ngay, không theo tháng</span>
          <button
            type="button"
            class="btn sm r"
            :class="zCanSave ? 'pri' : 'off'"
            :disabled="!zCanSave"
            @click="zConfirming = true"
          >
            Lưu
          </button>
        </div>
        </div>
      </div>
    </section>
    <section v-else-if="zoneError" class="card zn">
      <div class="card-h"><h2>Vùng chấm công</h2></div>
      <LoadFail what="vùng chấm công" @retry="reloadZone" />
    </section>
  </SettingsFrame>

  <SaveConfirmDialog
    v-if="confirming"
    :lines="pay.lines.value"
    :reason="pay.reason.value.trim()"
    :saving="pay.saving.value"
    @confirm="confirmPay"
    @close="confirming = false"
  />

  <SaveConfirmDialog
    v-if="zConfirming"
    :lines="zLines"
    reason=""
    :saving="zSaving"
    @confirm="confirmZone"
    @close="zConfirming = false"
  />

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
  grid-template-columns: 384px minmax(0, 1fr);
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
.pd-body {
  padding: 0 24px 16px;
}
.pd-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.pd-fld.pd-first {
  margin-top: 0;
}
.pd-first :deep(.fi) {
  width: 116px;
  box-sizing: border-box;
}
.pd-fix {
  margin: 20px 0 0;
  font-size: 14px;
}
.pd-fix b {
  font-weight: 600;
}
.ca td.nm {
  font-weight: 600;
}
.pd-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--muted);
}
.pd-hint.bad,
.foot .bad {
  color: var(--status-rejected);
}
.pd-fld {
  margin-top: 14px;
}
.pd-fld > label:not(.fi) {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.pd-fld > label:not(.fi) small,
.pd-count {
  font-weight: 400;
  color: var(--muted);
}
.pd-count {
  display: block;
  text-align: right;
  margin-top: 4px;
  font-size: 12px;
}
.pd .foot .btn {
  margin-left: auto;
}
.pd :deep(.inp) {
  border-radius: 8px;
}
.zn-body {
  display: grid;
  grid-template-columns: minmax(0, 376px) minmax(0, 1fr);
  gap: 24px;
  padding: 0 24px 16px;
  align-items: start;
}
.map {
  height: 310px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.zn-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
  align-items: start;
  align-content: start;
}
.zn-fields > .zn-fld:first-child {
  grid-column: 1 / -1;
}
.zn-fields > .zn-fld:first-child :deep(.fi) {
  width: 154px;
}
.zn-fields > .zn-fld:first-child :deep(.fi > input) {
  width: auto !important;
  flex: 1 1 0;
  min-width: 0;
}
.zn-foot {
  grid-column: 1 / -1;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 0 0;
}
.zn-fields :deep(.fi) {
  box-sizing: border-box;
  height: 40px;
  border-radius: 8px;
}
.zn-fields > .zn-fld:not(:first-child) :deep(.fi) {
  width: 100%;
}
.zn-fields :deep(.fi > input) {
  width: 100% !important;
}
.zn-fld > label:not(.fi) {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.zn-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.zn-hint.bad,
.zn .foot .bad {
  color: var(--status-rejected);
}
.zn-here {
  grid-column: 1 / -1;
  justify-self: start;
}
.zn .foot .btn {
  margin-left: 0;
}
/* Hẹp (điện thoại): các thẻ hai cột xếp dọc, chú giải năm xuống dòng. Đặt cuối để thắng luật hai cột ở trên. */
@media (max-width: 900px) {
  .row2,
  .zn-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .card-h :deep(.lgd) {
    flex-wrap: wrap;
  }
}
</style>
