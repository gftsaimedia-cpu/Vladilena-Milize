<script setup lang="ts">
// Màn Nhân sự (nhan-su): bốn thẻ chỉ số, thẻ danh sách và nút Thêm nhân sự (hộp StaffFormDialog ở ?hop=them-nhan-su).
// Sửa hồ sơ và Cho nghỉ việc nằm ở ngăn kéo hồ sơ (?nv=<id>); lưu xong màn báo và tải lại danh sách.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { useRealtimeReload } from '@/composables/useRealtimeReload';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import ResultLine from '@/components/select-mode/ResultLine.vue';
import SelectBar from '@/components/select-mode/SelectBar.vue';
import { useSelectMode } from '@/components/select-mode/useSelectMode';
import { deptOptions, useMineDepts, type StaffPst } from '@/components/staff-scope/staffScope';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { SHIFT_OPTIONS, STAFF_BULK, assignShift, getDepartments, getShiftOptions, getStaffList, moveStaffToDept, type ShiftOption } from '@/services/admin-hr';
import { useHop } from '../settings/lib/useHop';
import StaffDrawer from './StaffDrawer.vue';
import StaffFormDialog from './StaffFormDialog.vue';
import StaffStats from './parts/StaffStats.vue';
import StaffTable from './parts/StaffTable.vue';
import StaffToolbar from './parts/StaffToolbar.vue';
import { downloadStaffCsv } from './staffCsv';
import { filterStaff, isFiltered } from './staffFilter';

const route = useRoute();
const router = useRouter();
const { data, error, reload, refresh } = useLoad(() => getStaffList());
// Thêm, sửa, cho nghỉ việc ở nơi khác: danh sách và thẻ thống kê tự tải lại.
useRealtimeReload(refresh, { types: ['staff.changed'] });

// Hộp Thêm nhân sự ở ?hop=them-nhan-su; tạo xong thì đóng, báo và tải lại danh sách.
const { hop, open: openHop, close: closeHop } = useHop(['them-nhan-su']);
function added(who: { name: string; username: string }) {
  closeHop();
  toast.ok(`Đã thêm ${who.name} (${who.username})`);
  reload();
}
// Ngăn kéo vừa lưu hồ sơ hoặc cho nghỉ việc.
function changed(message: string) {
  toast.ok(message);
  reload();
}

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
const shiftOptions = ref<readonly ShiftOption[]>(SHIFT_OPTIONS);
const serverDepts = ref<string[]>([]);
const moveDepts = computed(() => (serverDepts.value.length ? serverDepts.value : depts.value));
const shiftCode = ref<string>(SHIFT_OPTIONS[0].code);
const toDept = ref('');
// Máy chủ thật: đủ sáu ca và mọi phòng ban (kể cả phòng chưa có người); dữ liệu giả giữ như board.
// Tải lỗi thì giữ danh sách mặc định (hai ô chọn vẫn dùng được với các dòng đang có); không để lỗi chưa bắt.
getShiftOptions()
  .then(o => {
    shiftOptions.value = o;
    if (!o.some(s => s.code === shiftCode.value)) shiftCode.value = o[0]?.code ?? '';
  })
  .catch(() => {});
getDepartments()
  .then(d => (serverDepts.value = d.map(x => x.name)))
  .catch(() => {});
const pickable = computed(() => shown.value.filter(r => r.status !== 'out').map(r => r.id));
const chosen = computed(() => sel.pickedIn(pickable.value));
function start(mode: BulkMode) {
  sel.enter(mode);
  result.value = '';
  shiftCode.value = shiftOptions.value[0]?.code ?? '';
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
      const label = shiftOptions.value.find(s => s.code === shiftCode.value)!.label;
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
      <div class="acts">
        <button type="button" class="btn pri" @click="openHop('them-nhan-su')"><Icon name="plus" />Thêm nhân sự</button>
      </div>
    </div>

    <PageLoadError v-if="error && !data" what="danh sách nhân sự" :error="error" @retry="reload" />

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
            <option v-for="o in shiftOptions" :key="o.code" :value="o.code">{{ o.label }}</option>
          </select>
          <select v-else v-model="toDept" aria-label="Phòng ban mới">
            <option value="" disabled>Chuyển sang phòng…</option>
            <option v-for="d in moveDepts" :key="d" :value="d">{{ d }}</option>
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
      @changed="changed"
    />
    <StaffFormDialog v-if="hop === 'them-nhan-su'" @close="closeHop" @saved="added" />
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
