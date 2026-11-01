<script setup lang="ts">
// Thu nhập: "Tháng này tôi được khoảng bao nhiêu, và vì sao?" → một con số, rồi phiếu lương đọc từ trên xuống.
// ?kb=thang-10: phiếu chính thức tháng 10; ?kb=ca-dem|ctv|quen-checkout|tts: phiếu của người khác.
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getIncome, getMonthContext } from '@/services/staff-phone';
import { monthLabel } from '@/utils/format';
import IncomeSlip from './components/IncomeSlip.vue';
import KpiSelf from './components/KpiSelf.vue';
import MonthSwitch from './components/MonthSwitch.vue';

const route = useRoute();
const kbRaw = computed(() => String(route.query.kb || ''));
const kb = computed(() => (kbRaw.value === 'thang-10' ? 'mac-dinh' : kbRaw.value || 'mac-dinh'));
const month = ref('');
getMonthContext().then(c => (month.value = c.month));
const { data, loading, error } = useLoad(
  async () => getIncome(month.value || (await getMonthContext()).month),
  () => `${month.value}|${kb.value}`
);
const monthNo = computed(() => Number(month.value.slice(5, 7)));
</script>

<template>
  <div class="inc">
    <header class="ph">
      <h1>Thu nhập</h1>
      <p v-if="data">{{ data.intro }}</p>
    </header>
    <MonthSwitch
      :title="monthLabel(month)"
      :state="data?.stateLabel || ''"
      :official="!!data?.official"
      :has-prev="!!data?.prevMonth"
      :has-next="!!data?.nextMonth"
      @prev="month = data.prevMonth"
      @next="month = data.nextMonth"
    />

    <template v-if="data && !data.empty && !error">
      <IncomeSlip :figure="data.figure" :groups="data.groups" :total="data.total" :official="data.official" />

      <template v-for="(s, i) in data.sections" :key="i">
        <section v-if="s.kind === 'notice'" class="sec">
          <div class="card">
            <div class="note notice">
              <Icon :name="s.icon" :size="16" /><span>{{ s.text }}</span>
            </div>
          </div>
        </section>

        <section v-else-if="s.kind === 'facts'" class="sec">
          <div class="h2">
            {{ s.title }} <small v-if="s.hint">{{ s.hint }}</small>
          </div>
          <div class="card">
            <div v-for="r in s.rows" :key="r.label" class="kv">
              <span class="k"
                >{{ r.label }}<small v-if="r.hint">{{ r.hint }}</small></span
              >
              <span class="v">{{ r.value }}</span>
            </div>
          </div>
        </section>

        <section v-else class="sec">
          <div v-if="s.title" class="h2">{{ s.title }}</div>
          <div class="card">
            <div class="wait">
              <span class="ico"><Icon :name="s.icon" :size="18" /></span>
              <div>
                <div class="t">{{ s.heading }}</div>
                <div class="s">{{ s.text }}</div>
              </div>
            </div>
          </div>
        </section>
      </template>
      <KpiSelf :month="month" />
    </template>
    <p v-else-if="error" class="none">{{ error.message }}</p>
    <p v-else-if="!loading" class="none">Chưa có phiếu thu nhập tháng {{ monthNo }}.</p>
  </div>
</template>

<style scoped>
.ph-app .notice {
  background: var(--pend-bg);
  border-radius: 20px;
}
.wait {
  display: flex;
  gap: 12px;
  padding: 16px;
}
.wait .ico {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f1f1f1;
  display: grid;
  place-items: center;
  flex: none;
}
.wait .t {
  font-weight: 600;
  font-size: 15px;
}
.wait .s {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
  margin-top: 2px;
}
.none {
  margin: 24px 16px 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
