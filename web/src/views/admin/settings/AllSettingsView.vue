<script setup lang="ts">
// Cài đặt › Tất cả cài đặt: tám nhóm cài đặt đã lưu, tìm trong mọi nhóm, mở đúng mục để xem hoặc sửa.
// ?group=<khoá nhóm> chọn nhóm (mặc định lam-them), ?setting=<khoá mục> cuộn tới mục, ?q=<từ khoá> điền sẵn ô tìm.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { ALL_GROUPS, searchSettings } from '@/builders/api/settings-screens';
import SettingsFrame from './SettingsFrame.vue';
import GroupPanel from './all/GroupPanel.vue';

const route = useRoute();
const router = useRouter();

const DEFAULT_GROUP = ALL_GROUPS[0].key;
const routeGroup = (value: unknown) => (ALL_GROUPS.some(g => g.key === String(value)) ? String(value) : DEFAULT_GROUP);
const group = computed(() => routeGroup(route.query.group));
const current = computed(() => ALL_GROUPS.find(g => g.key === group.value)!);
const setting = computed(() => String(route.query.setting || ''));

const q = ref(String(route.query.q || ''));
watch(
  () => route.query.q,
  v => (q.value = String(v || ''))
);
const results = computed(() => searchSettings(q.value));

// Còn chỗ sửa dở trong nhóm đang mở (thẻ nhóm báo lên): đổi nhóm hay rời trang thì hỏi trước.
const dirty = ref(false);
function confirmDiscard() {
  return !dirty.value || window.confirm('Bạn có thay đổi chưa lưu. Bỏ bản nháp này và tiếp tục?');
}
onBeforeRouteUpdate((to, from) => (routeGroup(to.query.group) === routeGroup(from.query.group) ? true : confirmDiscard()));
onBeforeRouteLeave(() => confirmDiscard());
function guardUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
window.addEventListener('beforeunload', guardUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', guardUnload));

function selectGroup(next: string) {
  if (next === group.value) return;
  const { setting: _dropped, ...rest } = route.query;
  const query = { ...rest, group: next };
  router.push({ query });
}
function openResult(r: { groupKey: string; itemKey: string }) {
  router.push({ query: { ...route.query, group: r.groupKey, setting: r.itemKey, q: q.value.trim() } });
}
</script>

<template>
  <SettingsFrame active="tat-ca">
    <template #acts>
      <span aria-hidden="true"></span>
    </template>
    <template #sub>Tìm theo tên, hoặc chọn một nhóm để xem và sửa từng mục</template>

    <section class="card">
      <div class="card-h">
        <h2>Tất cả cài đặt</h2>
        <span class="cap">Chọn một nhóm để xem và sửa từng mục</span>
      </div>
      <label class="srch">
        <Icon name="search" />
        <input
          v-model="q"
          type="text"
          placeholder="Tìm theo tên cài đặt, ở mọi nhóm"
          aria-label="Tìm theo tên cài đặt"
        />
      </label>
      <div v-if="q.trim()" class="results" aria-live="polite">
        <p class="result-label">
          {{ results.length ? `${results.length} kết quả trên mọi nhóm` : 'Không có kết quả trên mọi nhóm' }}
        </p>
        <button
          v-for="r in results"
          :key="r.groupKey + ':' + r.itemKey"
          type="button"
          class="result"
          @click="openResult(r)"
        >
          <span
            ><b>{{ r.title }}</b
            ><small>{{ r.groupName }}</small></span
          >
          <small>Mở mục</small>
        </button>
      </div>
      <div class="gl">
        <button
          v-for="g in ALL_GROUPS"
          :key="g.key"
          type="button"
          class="gbtn"
          :class="{ on: group === g.key }"
          @click="selectGroup(g.key)"
        >
          {{ g.name }} <small>{{ g.items.length }}</small>
        </button>
      </div>
    </section>

    <GroupPanel :key="current.key" :group="current" :setting="setting" @dirty="dirty = $event" />
  </SettingsFrame>
</template>

<style scoped>
.srch {
  margin: 4px 24px 2px;
  height: 40px;
  border: 1px solid var(--control);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: #8a8a8a;
  font-size: 14px;
}
.srch input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  padding: 0;
  background: transparent;
  font: inherit;
  color: var(--text);
}
.results {
  padding: 0 24px 12px;
}
.result-label {
  margin: 4px 0 6px;
  color: var(--muted);
  font-size: 12px;
}
.result {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 10px;
  text-align: left;
  border-top: 1px solid var(--rule);
}
.result:hover,
.result:focus-visible {
  background: var(--surface-2, #f7f7f7);
  outline: 2px solid var(--control);
  outline-offset: -2px;
}
.result span {
  min-width: 0;
}
.result b,
.result small {
  display: block;
}
.result small {
  color: var(--muted);
  font-size: 12px;
}
.gl {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  width: fit-content;
  max-width: calc(100% - 48px);
  margin: 16px 24px 24px;
  padding: 4px;
  border-radius: 8px;
  background: var(--ground);
}
.gbtn {
  height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #424242;
  white-space: nowrap;
  cursor: pointer;
}
.gbtn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.gbtn.on {
  background: var(--surface-dark);
  color: var(--on-primary);
  font-weight: 500;
}
.gbtn small {
  font-size: inherit;
  color: var(--muted);
  font-weight: 400;
}
.gbtn.on small {
  color: var(--gold);
  font-weight: 600;
}
@media (max-width: 640px) {
  .srch {
    margin: 8px 14px 2px;
  }
  .results {
    padding-left: 14px;
    padding-right: 14px;
  }
  .gl {
    margin-left: 14px;
    margin-right: 14px;
    max-width: calc(100% - 28px);
  }
  .result {
    align-items: flex-start;
  }
}
</style>
