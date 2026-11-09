<script setup lang="ts">
// Chi tiết nhãn của một ngày (hộp chi tiết ngày của Admin và nhân viên): ngày là gì + ca, OT / bù / nửa ca / đổi ca,
// kết quả chấm công và giải trình, đơn đang chờ duyệt. Chữ do BE dựng, FE chỉ xếp lại.
//   <DayTagLines :tag="cell.tag" />
import { computed } from 'vue';
import type { DayTag } from '@/builders/api/day-tag';
import DayMarks from './DayMarks.vue';

const props = defineProps<{ tag?: DayTag | null }>();
const lines = computed<[string, string][]>(() => {
  const t = props.tag;
  if (!t) return [];
  const out: [string, string][] = [['Loại ngày', t.shift ? `${t.planLabel} · ${t.shift}` : t.planLabel]];
  if (t.extras.length) out.push(['Bổ sung', t.extras.map(e => e.text).join(' · ')]);
  if (t.reviewLabel) out.push(['Kết quả', t.reviewLabel]);
  if (t.requestPending) out.push(['Đơn', t.text.split(' · ').find(x => x.endsWith('chờ duyệt')) ?? 'Có đơn chờ duyệt']);
  if (t.declined) out.push(['Đơn', t.declined.text]);
  return out;
});
</script>

<template>
  <dl v-if="tag" class="dtl" aria-label="Loại ngày và kết quả">
    <div v-for="[k, v] in lines" :key="k" class="r">
      <dt>{{ k }}</dt>
      <dd>{{ v }}</dd>
    </div>
    <div class="r mk"><DayMarks :tag="tag" /></div>
  </dl>
</template>

<style scoped>
.dtl {
  margin: 0;
  display: grid;
  gap: 6px;
  font-size: 14px;
  line-height: 20px;
}
.r {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  text-align: right;
  font-weight: 600;
}
.r.mk {
  justify-content: flex-end;
}
</style>
