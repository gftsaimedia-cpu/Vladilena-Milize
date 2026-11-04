<script setup lang="ts">
// Màn Nhân sự (nhan-su) trên dữ liệu giả: bốn thẻ chỉ số và thẻ danh sách 10 hồ sơ đầu của 131.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { getStaffList } from '@/services/admin-hr';
import StaffDrawer from './StaffDrawer.vue';
import StaffStats from './parts/StaffStats.vue';
import StaffTable from './parts/StaffTable.vue';
import StaffToolbar from './parts/StaffToolbar.vue';
import { downloadStaffCsv } from './staffCsv';
import { filterStaff, isFiltered } from './staffFilter';

const route = useRoute();
const router = useRouter();
const { data } = useLoad(() => getStaffList());

const asText = (v: unknown) => (typeof v === 'string' ? v : '');
const q = ref(asText(route.query.q));
const inactiveOnly = ref(false);

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

const inactiveCount = computed(() => (data.value?.rows ?? []).filter(r => !r.activated).length);
const opts = computed(() => ({ q: q.value, inactiveOnly: inactiveOnly.value }));
const shown = computed(() => filterStaff(data.value?.rows ?? [], opts.value));
// Chọn theo id, giữ qua mọi lần đổi tìm hay công tắc; số đếm và CSV chỉ tính các dòng đang hiện.
const selected = ref<string[]>([]);
const picked = computed(() => shown.value.filter(r => selected.value.includes(r.id)));
function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id];
}
function toggleAll() {
  const ids = shown.value.map(r => r.id);
  selected.value = ids.every(id => selected.value.includes(id))
    ? selected.value.filter(id => !ids.includes(id))
    : [...selected.value, ...ids.filter(id => !selected.value.includes(id))];
}
const exportCsv = () => downloadStaffCsv(picked.value.length ? picked.value : shown.value);

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
          v-model:inactive-only="inactiveOnly"
          :inactive-count="inactiveCount"
          :selected-count="picked.length"
          @export="exportCsv"
        />
        <StaffTable :rows="shown" :selected="selected" @toggle="toggle" @toggle-all="toggleAll" />
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
