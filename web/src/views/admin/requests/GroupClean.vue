<script setup lang="ts">
// Nhóm "Không có cảnh báo" của Yêu cầu: chọn nhiều rồi đồng ý cả loạt, hoặc từ chối từng cái.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import RequestTable from './RequestTable.vue';

const props = defineProps({
  items: { type: Array as () => any[], required: true },
  selected: { type: Array as () => any[], default: () => [] },
  olderCount: { type: Number, default: 0 }
});
const emit = defineEmits(['update:selected', 'approve-selected', 'approve', 'reject', 'all-months']);
const HEADS = ['Nhân sự', 'Loại yêu cầu', 'Chi tiết', 'Ảnh hưởng'];
const WIDTHS = [64, 270, 170, 230, '', 130];

const allOn = computed(() => props.items.length > 0 && props.selected.length === props.items.length);
const toggleAll = () => emit('update:selected', allOn.value ? [] : props.items.map(r => r.id));
const toggle = (id?) =>
  emit('update:selected', props.selected.includes(id) ? props.selected.filter(x => x !== id) : [...props.selected, id]);
</script>

<template>
  <section class="card">
    <div class="grp-h">
      <h2>Yêu cầu chờ xử lý</h2>
      <span class="cap">{{ items.length }} yêu cầu · có thể đồng ý cả loạt</span>
      <div class="r">
        <span class="sel-bar">
          <span v-if="selected.length">
            <b>Đã chọn {{ selected.length }}</b>
          </span>
          <span v-else>Chưa chọn yêu cầu nào</span>
          <button v-if="selected.length" type="button" class="tact" @click="emit('update:selected', [])">
            Bỏ chọn
          </button>
        </span>
        <button
          type="button"
          class="btn"
          :class="selected.length ? 'pri' : 'off'"
          :disabled="!selected.length"
          @click="emit('approve-selected')"
        >
          <Icon name="check" />
          {{ selected.length ? `Đồng ý ${selected.length} yêu cầu` : 'Đồng ý cả loạt' }}
        </button>
      </div>
    </div>
    <RequestTable :items="items" :heads="HEADS" :widths="WIDTHS" lead :selected="selected">
      <template #head-lead>
        <button
          type="button"
          class="cb"
          :class="{ on: allOn }"
          aria-label="Chọn tất cả"
          :aria-pressed="allOn"
          @click="toggleAll"
        >
          <Icon v-if="allOn" name="check" :size="12" :stroke="3" />
        </button>
      </template>
      <template #lead="{ r }">
        <button
          type="button"
          class="cb"
          :class="{ on: selected.includes(r.id) }"
          :aria-label="`Chọn yêu cầu của ${r.name}`"
          :aria-pressed="selected.includes(r.id)"
          @click="toggle(r.id)"
        >
          <Icon v-if="selected.includes(r.id)" name="check" :size="12" :stroke="3" />
        </button>
      </template>
      <template #extra="{ r }">{{ r.impact }}</template>
      <template #act="{ r }">
        <button type="button" class="tact" @click="emit('reject', r)">Từ chối</button>
        <button type="button" class="btn sm pri" style="margin-left: 8px" @click="emit('approve', r)">Đồng ý</button>
      </template>
    </RequestTable>
    <div v-if="olderCount" class="later">
      <Icon name="info" />
      <span>
        {{ olderCount }} yêu cầu của các tháng trước, cần xử lý từng cái ở
        <button type="button" class="link" @click="emit('all-months')">Mọi tháng</button>
      </span>
    </div>
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
.grp-h .r {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}
.sel-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--muted);
}
.sel-bar b {
  color: var(--text);
}
.later {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  color: var(--muted);
}
</style>
