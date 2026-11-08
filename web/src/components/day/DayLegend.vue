<script setup lang="ts">
// Chú giải các dấu trên lịch ngày, giống nhau ở lịch Admin và lịch nhân viên.
import { PLAN_LEGEND, PLAN_SHORT, REVIEW_GLYPH, REVIEW_LEGEND } from '@/builders/api/day-tag';
</script>

<template>
  <div class="dlg" role="group" aria-label="Dấu hiệu của ngày">
    <span v-for="p in PLAN_LEGEND" :key="p.code"><i class="mk plan" :class="p.code">{{ PLAN_SHORT[p.code] }}</i>{{ p.label }}</span>
    <span v-for="r in REVIEW_LEGEND" :key="r.code"><i class="mk review" :class="r.code">{{ REVIEW_GLYPH[r.code] }}</i>{{ r.label }}</span>
  </div>
</template>

<style scoped>
.dlg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.dlg span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.mk {
  font-style: normal;
  font-size: 10px;
  line-height: 12px;
  padding: 0 4px;
  border-radius: 4px;
  font-weight: 700;
  background: var(--ground);
  color: var(--text);
}
.mk.plan.ot,
.mk.plan.makeup {
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
  padding: 0;
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
