<script setup lang="ts">
// Dấu hiệu gọn của một ngày trên ô lịch: chữ loại ngày (OT, Bù, Lễ, P, KL, NB, iS), nhãn phụ (OT/Bù/½/Ca) và dấu kết quả
// chấm công (✓ hợp lệ, ! cần giải trình, … chờ duyệt, ✓✓ được duyệt, ✕ từ chối, ⊘ quá hạn). Dùng chung cho lịch Admin và nhân viên.
//   <DayMarks :tag="cell.tag" />
import { computed } from 'vue';
import { EXTRA_SHORT, PLAN_SHORT, REVIEW_GLYPH, type DayTag } from '@/builders/api/day-tag';

const props = defineProps<{ tag?: DayTag | null }>();
const plan = computed(() => (props.tag ? PLAN_SHORT[props.tag.plan] : ''));
// Nhãn phụ trùng với chữ loại ngày (ngày OT đã có "OT") thì bỏ.
const extras = computed(() => (props.tag?.extras ?? []).filter(e => EXTRA_SHORT[e.code] !== plan.value));
const glyph = computed(() => (props.tag ? REVIEW_GLYPH[props.tag.review] : ''));
const any = computed(() => !!plan.value || extras.value.length > 0 || !!glyph.value || !!props.tag?.requestPending);
</script>

<template>
  <span v-if="tag && any" class="dmk" aria-hidden="true">
    <i v-if="plan" class="mk plan" :class="tag.plan" :title="tag.planLabel">{{ plan }}</i>
    <i v-for="e in extras" :key="e.code" class="mk extra" :class="e.code" :title="e.text">{{ EXTRA_SHORT[e.code] }}</i>
    <i v-if="tag.requestPending" class="mk wait" title="Có đơn chờ duyệt">⏳</i>
    <i v-if="glyph" class="mk review" :class="tag.review" :title="tag.reviewLabel">{{ glyph }}</i>
  </span>
</template>

<style scoped>
.dmk {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1px 2px;
  max-width: 100%;
  line-height: 1;
}
.mk {
  font-style: normal;
  font-size: 9px;
  line-height: 11px;
  padding: 0 3px;
  border-radius: 4px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text);
  background: var(--ground);
}
.mk.plan.ot,
.mk.plan.makeup,
.mk.extra.ot,
.mk.extra.makeup {
  background: var(--gold-pale);
  color: var(--accent);
}
.mk.plan.holiday {
  background: var(--status-done);
  color: #fff;
}
.mk.plan.leave_paid,
.mk.plan.leave_makeup,
.mk.plan.isat {
  background: #dfe8f6;
  color: var(--status-done);
}
.mk.plan.leave_unpaid {
  background: var(--status-draft);
  color: var(--muted);
}
.mk.review {
  background: none;
  padding: 0 1px;
  font-size: 10px;
}
.mk.review.valid {
  color: var(--muted);
}
.mk.review.needs_explanation,
.mk.review.pending {
  color: var(--status-pending);
}
.mk.review.approved {
  color: var(--status-done);
}
.mk.review.rejected,
.mk.review.expired {
  color: var(--status-rejected);
}
</style>
