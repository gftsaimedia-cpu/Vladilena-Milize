<script setup lang="ts">
// Thẻ "một cảnh báo AI" dùng trong hộp thoại ở Trợ lý AI (có dòng Nhân sự/Kỳ) và ngăn kéo ở Yêu cầu (không có).
import Icon from '@/components/ui/Icon.vue';
import { figure } from '@/views/admin/requests/helpers';
import { monthLabel, vndc } from '@/utils/format';

defineProps({
  warning: { type: Object as () => any, required: true },
  showPerson: { type: Boolean, default: false }
});
defineEmits(['skip']);
const KIND = { 'da-chot': ['p-done', 'Ngưỡng đã chốt'], 'de-xuat': ['p-gold', 'Ngưỡng đề xuất'] };
</script>

<template>
  <div class="wc" :class="{ person: showPerson }">
    <div class="h">
      <span class="tag"><Icon name="spark" :size="11" />AI</span>
      <b>{{ warning.rule }}</b>
      <span class="pill" :class="warning.level === 'Cao' ? 'p-err' : 'p-pend'">
        {{ warning.level === 'Cao' ? 'Mức cao' : 'Mức trung bình' }}
      </span>
    </div>
    <div v-if="showPerson" class="m2 grid">
      <div>
        <span>Nhân sự</span>
        <b
          >{{ warning.person }}<template v-if="warning.detail.role"> · {{ warning.detail.role }}</template></b
        >
      </div>
      <div>
        <span>Kỳ</span>
        <b>{{ monthLabel(warning.detail.month) }}</b>
      </div>
    </div>
    <div class="fact">
      {{ warning.detail.fact }}
      <template v-if="warning.detail.factMoney != null">
        <b>{{ vndc(warning.detail.factMoney) }}</b
        >.</template
      >
    </div>
    <div v-if="warning.detail.metrics.length" class="m2 flex">
      <div v-for="m in warning.detail.metrics" :key="m.label">
        <span>{{ m.label }}</span>
        <b>{{ figure(m) }}</b>
      </div>
    </div>
    <div class="rl">
      <div v-for="c in warning.detail.criteria" :key="c.text" class="r">
        <span>
          {{ c.text
          }}<template v-if="figure(c) != null"
            >: <b>{{ figure(c) }}</b></template
          >
        </span>
        <span v-if="c.kind" class="pill" :class="KIND[c.kind][0]">{{ KIND[c.kind][1] }}</span>
        <small v-if="c.basis">{{ c.basis }}</small>
      </div>
    </div>
    <div class="ft">
      <RouterLink class="link" :to="warning.detail.link.to">{{ warning.detail.link.label }}</RouterLink>
      <span style="margin-left: auto" />
      <button type="button" class="btn sm" @click="$emit('skip')">Bỏ qua cảnh báo này</button>
    </div>
  </div>
</template>

<style scoped>
.wc {
  border: 1px solid #f1e4c4;
  background: var(--gold-pale);
  border-radius: 16px;
  padding: 14px 16px 12px;
}
.wc + .wc {
  margin-top: 12px;
}
.h {
  display: flex;
  align-items: center;
  gap: 10px;
}
.h .tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--text);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
.h .tag svg {
  width: 11px;
  height: 11px;
  color: var(--gold);
}
.h b {
  font-size: 15px;
}
.h .pill {
  margin-left: auto;
}
.m2 span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.m2.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
  margin-top: 10px;
}
.m2.grid b {
  font-size: 14px;
  font-weight: 500;
}
.m2.flex {
  display: flex;
  gap: 28px;
  margin-top: 8px;
}
.m2.flex b {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.fact {
  margin-top: 8px;
  font-size: 14px;
  line-height: 21px;
}
.person .fact {
  margin-top: 10px;
}
.rl {
  margin-top: 10px;
  border-top: 1px solid #efe2c2;
}
.rl .r {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 8px 0;
  border-bottom: 1px solid #efe2c2;
  font-size: 13px;
}
.rl .r b {
  font-weight: 600;
}
.rl .r small {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.ft {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 10px;
}
.wc:not(.person) .ft .btn {
  height: 30px;
  font-size: 12px;
  padding: 0 10px;
}
</style>
