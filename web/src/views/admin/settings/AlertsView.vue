<script setup lang="ts">
// Cài đặt › Cảnh báo AI: 24 ngưỡng AI dùng khi kiểm tra dữ liệu, chia nhóm, gõ mức ngay trong ô.
// Đề xuất = AI đang dùng, công ty chưa xác nhận · Đã chốt = công ty đã xác nhận.
import { computed, ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { toast } from '@/components/shell/toast';
import { getAgents, getAlerts, saveAgents, saveAlerts } from '@/services/admin-settings';
import { useSessionStore } from '@/stores/session';
import SettingsFrame from './SettingsFrame.vue';
import CheckBox from './fields/CheckBox.vue';
import FieldDate from './fields/FieldDate.vue';
import FieldNum from './fields/FieldNum.vue';
import SaveBar from './fields/SaveBar.vue';
import { useDraft } from './lib/useDraft';

const { data } = useLoad(() => getAlerts());
const form = useDraft(() => data.value);
const { draft } = form;

// Công tắc Agents (GET/PUT /settings/agents)
const session = useSessionStore();
const agents = ref(false);
const agentsBusy = ref(true);
getAgents()
  .then(r => (agents.value = r.enabled))
  .catch(e => toast.error(e.message))
  .finally(() => (agentsBusy.value = false));
async function setAgents(on?) {
  agentsBusy.value = true;
  try {
    const r = await saveAgents(on);
    agents.value = r.enabled;
    session.agentsEnabled = r.enabled;
  } catch (e) {
    toast.error(e.message);
  } finally {
    agentsBusy.value = false;
  }
}

const filter = ref('all'); // all | proposed | locked
const CHIPS = [
  ['all', 'Tất cả'],
  ['proposed', 'Đề xuất'],
  ['locked', 'Đã chốt']
];
const STATUS = { proposed: ['p-pend', 'Đề xuất'], locked: ['p-done', 'Đã chốt'] };

// Hai cột như thiết kế; mỗi nhóm giữ các dòng khớp chip đang chọn
const columns = computed(() => {
  if (!draft.value) return [[], []];
  const shown = draft.value.groups
    .map(g => ({ ...g, rows: g.items.filter(i => filter.value === 'all' || i.status === filter.value) }))
    .filter(g => g.rows.length);
  return [0, 1].map(c => shown.filter(g => g.col === c));
});
</script>

<template>
  <SettingsFrame active="canh-bao">
    <template #sub>
      <template v-if="data">
        <b>{{ data.counts.all }} ngưỡng</b> AI dùng khi kiểm tra dữ liệu · <b>{{ data.counts.locked }}</b> đã chốt,
        <b>{{ data.counts.proposed }}</b> còn là đề xuất
      </template>
    </template>

    <section v-if="draft" class="card">
      <div class="card-h">
        <h2>Ngưỡng cảnh báo</h2>
        <span class="r" style="display: flex; gap: 8px; align-items: center; margin-right: 16px">
          <CheckBox :model-value="agents" :locked="agentsBusy" label="Agents" @update:model-value="setAgents" />
          Agents
        </span>
        <span class="r" style="display: flex; gap: 8px">
          <button
            v-for="[key, label] in CHIPS"
            :key="key"
            type="button"
            class="chip"
            :class="{ on: filter === key }"
            @click="filter = key"
          >
            {{ label }} <small>{{ data.counts[key] }}</small>
          </button>
        </span>
      </div>
      <div class="expl">
        <span><span class="pill p-pend">Đề xuất</span>AI đang dùng, công ty chưa xác nhận</span>
        <span><span class="pill p-done">Đã chốt</span>Công ty đã xác nhận</span>
      </div>
      <div class="cols">
        <div v-for="(col, ci) in columns" :key="ci">
          <template v-for="g in col" :key="g.key">
            <div class="grp-h">
              {{ g.name }}<span>{{ g.rows.length }}</span>
            </div>
            <div v-for="t in g.rows" :key="t.key" class="th">
              <span class="nm">{{ t.label }}</span>
              <FieldDate v-if="t.kind === 'date'" v-model="t.value" :label="t.label" />
              <FieldNum v-else v-model="t.value" :unit="t.unit" :money="t.kind === 'money'" :label="t.label" />
              <span class="pill" :class="STATUS[t.status][0]">{{ STATUS[t.status][1] }}</span>
            </div>
          </template>
        </div>
      </div>
      <SaveBar
        :changes="form.changes.value"
        :saving="form.saving.value"
        :saved="form.saved.value"
        :error="form.error.value"
        @cancel="form.reset"
        @save="form.save(d => saveAlerts(d))"
      />
    </section>
  </SettingsFrame>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 32px;
  padding: 0 24px 8px;
}
.grp-h {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  padding: 16px 0 6px;
  border-bottom: 1px solid var(--border);
}
.grp-h span {
  font-weight: 400;
}
.th {
  display: grid;
  grid-template-columns: 1fr 112px 72px;
  gap: 10px;
  align-items: center;
  min-height: 46px;
  border-bottom: 1px solid var(--rule);
  font-size: 13px;
  line-height: 18px;
}
.th .fi {
  min-width: 0;
}
.th .pill {
  justify-self: end;
}
.expl {
  display: flex;
  gap: 20px;
  padding: 0 24px 4px;
  color: var(--muted);
  font-size: 12px;
}
.expl span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
</style>
