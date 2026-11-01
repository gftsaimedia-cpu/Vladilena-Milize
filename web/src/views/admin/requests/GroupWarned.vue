<script setup lang="ts">
// Nhóm "Có cảnh báo AI" của Yêu cầu: xem lý do rồi đồng ý hoặc từ chối từng cái (không chọn hàng loạt được).
import Icon from '@/components/ui/Icon.vue';
import RequestTable from './RequestTable.vue';

defineProps({ items: { type: Array as () => any[], required: true } });
defineEmits(['reason']);
const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Chi tiết', 'Cảnh báo AI'];
const WIDTHS = [64, 270, 170, 230, '', 130];
</script>

<template>
  <section class="card" style="margin-bottom: 24px">
    <div class="grp-h">
      <h2>Có cảnh báo AI</h2>
      <span class="cap">{{ items.length }} yêu cầu · xem lý do rồi đồng ý hoặc từ chối từng cái</span>
    </div>
    <RequestTable :items="items" :heads="HEADS" :widths="WIDTHS" lead extra-class="ai">
      <template #lead>
        <span class="aim" title="Có cảnh báo AI, không chọn hàng loạt được"
          ><Icon name="spark" :size="12" :stroke="2.2"
        /></span>
      </template>
      <template #extra="{ r }">
        <div class="aic">
          <div class="t"><Icon name="spark" :size="14" :stroke="2" />{{ r.warningCount }} cảnh báo</div>
          <div class="s">{{ r.aiSummary }}</div>
        </div>
      </template>
      <template #act="{ r }">
        <button type="button" class="btn sm" @click="$emit('reason', r)">Xem lý do</button>
      </template>
    </RequestTable>
  </section>
</template>

<style scoped>
.grp-h {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 14px;
}
.grp-h h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.grp-h .cap {
  color: var(--muted);
  font-size: 13px;
}
.aic .t {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.aic .t svg {
  color: var(--accent);
}
.aic .s {
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aim {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: var(--gold-pale);
  box-shadow: inset 0 0 0 1px #f0dcae;
  color: var(--accent);
  vertical-align: middle;
}
.aim svg {
  width: 12px;
  height: 12px;
}
</style>
