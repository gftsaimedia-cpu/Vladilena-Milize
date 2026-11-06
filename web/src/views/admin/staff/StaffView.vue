<script setup lang="ts">
// Màn Nhân sự (nhan-su) trên dữ liệu giả: bốn thẻ chỉ số và thẻ danh sách 10 hồ sơ đầu của 131.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import ResultLine from '@/components/select-mode/ResultLine.vue';
import SelectBar from '@/components/select-mode/SelectBar.vue';
import { useSelectMode } from '@/components/select-mode/useSelectMode';
import { deptOptions, useMineDepts, type StaffPst } from '@/components/staff-scope/staffScope';
import { toast } from '@/components/shell/toast';
import { SHIFT_OPTIONS, STAFF_BULK, assignShift, getStaffList, moveStaffToDept } from '@/services/admin-hr';
import StaffDrawer from './StaffDrawer.vue';
import StaffStats from './parts/StaffStats.vue';
import StaffTable from './parts/StaffTable.vue';
import StaffToolbar from './parts/StaffToolbar.vue';
import { downloadStaffCsv } from './staffCsv';
import { filterStaff, isFiltered } from './staffFilter';

const route = useRoute();
const router = useRouter();
const { data, reload } = useLoad(() => getStaffList());

const asText = (v: unknown) => (typeof v === 'string' ? v : '');
const q = ref(asText(route.query.q));
const pst = ref<StaffPst>('all');
const dept = ref('');
const mine = useMineDepts();

// ?q hai chiều: URL đổi (ô tìm trên thanh trên) thì cập nhật ô tìm; gõ thì thay URL, ô trống bỏ q.
watch(
  () => route.query.q,
  v => {
    if (asText(v) !== q.value) q.value = asText(v);
  }
);
watch(q, v => {
  if (asText(route.query.q) !== v) router.replace({ query: { ...route.query, q: v || undefined } });
});

const opts = computed(() => ({ q: q.value, scope: { pst: pst.value, dept: dept.value }, mine }));
const shown = computed(() => filterStaff(data.value?.rows ?? [], opts.value));
const depts = computed(() => deptOptions(data.value?.rows ?? []));
const exportCsv = () => downloadStaffCsv(shown.value);

// Chế độ chọn (06/11): "Gán ca" và "Đổi phòng ban" mới hiện cột ô chọn. Người đã nghỉ việc mờ và không chọn được.
// Số đếm và danh sách gửi đi chỉ tính người đang hiện; đổi bộ lọc trong lúc chọn vẫn được.
type BulkMode = 'shift' | 'move';
const sel = useSelectMode<BulkMode>();
const result = ref('');
const shiftCode = ref<string>(SHIFT_OPTIONS[0].code);
const toDept = ref('');
const pickable = computed(() => shown.value.filter(r => r.status !== 'out').map(r => r.id));
const chosen = computed(() => sel.pickedIn(pickable.value));
function start(mode: BulkMode) {
  sel.enter(mode);
  result.value = '';
  shiftCode.value = SHIFT_OPTIONS[0].code;
  toDept.value = '';
}
const barTitle = computed(() => (sel.mode.value === 'shift' ? 'Gán ca' : 'Đổi phòng ban'));
const goLabel = computed(() => {
  const n = chosen.value.length;
  if (!n) return 'Chọn ít nhất 1 người';
  if (sel.mode.value === 'move' && !toDept.value) return 'Chọn phòng ban mới';
  return `${barTitle.value} cho ${n} người`;
});
const goDisabled = computed(() => !chosen.value.length || (sel.mode.value === 'move' && !toDept.value));
const running = ref(false);
async function run() {
  if (goDisabled.value || running.value) return;
  running.value = true;
  const ids = chosen.value;
  try {
    if (sel.mode.value === 'move') {
      const done = await moveStaffToDept(ids, toDept.value);
      result.value = `Đã chuyển ${done.length} người sang phòng ${toDept.value}.`;
    } else {
      const label = SHIFT_OPTIONS.find(s => s.code === shiftCode.value)!.label;
      const done = await assignShift(ids, shiftCode.value);
      result.value = `Đã gán ca ${label} cho ${done.length} người.`;
    }
    sel.quit();
    await reload();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    running.value = false;
  }
}

// Hồ sơ mở bằng ?nv=<id>. Người trước / sau đi trong các dòng đang hiện lúc mở và không đổi theo tìm hay công tắc.
const openId = computed(() => (typeof route.query.nv === 'string' ? route.query.nv : ''));
const navIds = ref<string[]>([]);
const valid = computed(() => !!openId.value && !!data.value?.rows.some(r => r.id === openId.value));
const withNv = (id?: string) => ({ query: { ...route.query, nv: id } });
watch([data, openId], () => {
  if (!openId.value) navIds.value = [];
  else if (data.value && !valid.value) router.replace(withNv());
  else if (valid.value && !navIds.value.includes(openId.value)) navIds.value = shown.value.map(r => r.id);
});
const navIdx = computed(() => navIds.value.indexOf(openId.value));
const hasPrev = computed(() => navIdx.value > 0);
const hasNext = computed(() => navIdx.value >= 0 && navIdx.value < navIds.value.length - 1);
const go = (step: number) => router.replace(withNv(navIds.value[navIdx.value + step]));

const footer = computed(() =>
  isFiltered(opts.value)
    ? `${shown.value.length} kết quả trên trang này`
    : `Hiển thị 1–${data.value?.rows.length ?? 0} trong ${data.value?.total ?? 0} hồ sơ`
);
</script>

<template>
  <div class="staff">
    <div class="title">
      <h1>Nhân sự</h1>
    </div>

    <template v-if="data">
      <StaffStats :stats="data.stats" />

      <section class="lc" aria-labelledby="staff-list-h">
        <div class="lc-h">
          <h2 id="staff-list-h">Danh sách nhân sự</h2>
          <span>{{ data.total }} hồ sơ</span>
        </div>
        <StaffToolbar
          v-model:q="q"
          v-model:pst="pst"
          v-model:dept="dept"
          :depts="depts"
          :bulk="STAFF_BULK && !sel.mode.value"
          :none="!pickable.length"
          @export="exportCsv"
          @shift="start('shift')"
          @move="start('move')"
        />
        <SelectBar
          v-if="sel.mode.value"
          :title="barTitle"
          :count="chosen.length"
          :total="pickable.length"
          unit="người"
          :go-label="goLabel"
          :go-disabled="goDisabled || running"
          :running="running"
          @quit="sel.quit()"
          @run="run"
        >
          <select v-if="sel.mode.value === 'shift'" v-model="shiftCode" aria-label="Ca làm">
            <option v-for="o in SHIFT_OPTIONS" :key="o.code" :value="o.code">{{ o.label }}</option>
          </select>
          <select v-else v-model="toDept" aria-label="Phòng ban mới">
            <option value="" disabled>Chuyển sang phòng…</option>
            <option v-for="d in depts" :key="d" :value="d">{{ d }}</option>
          </select>
        </SelectBar>
        <ResultLine v-else :text="result" />
        <StaffTable
          :rows="shown"
          :selecting="!!sel.mode.value"
          :picked="sel.picked.value"
          :all-state="sel.stateOf(pickable)"
          @toggle="sel.toggle"
          @toggle-all="sel.toggleAll(pickable)"
        />
        <div class="lc-f">{{ footer }}</div>
      </section>
    </template>

    <StaffDrawer
      v-if="valid"
      :id="openId"
      :has-prev="hasPrev"
      :has-next="hasNext"
      @close="router.replace(withNv())"
      @prev="go(-1)"
      @next="go(1)"
    />
  </div>
</template>

<style scoped>
.staff {
  min-width: 0;
}
.lc {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-card);
  background: var(--surface);
}
.lc-h {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 20px 20px 0;
}
.lc-h h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.lc-h span {
  font-size: 14px;
  color: var(--muted);
}
.lc-f {
  padding: 14px 20px 18px;
  text-align: right;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
</style>
