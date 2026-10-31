<script setup>
// Thẻ "Cảnh báo AI" của Trợ lý AI: lọc theo trạng thái và quy tắc, danh sách xếp theo mức độ, phân trang.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { warningText } from '@/views/admin/requests/helpers.js';
import SelectBox from '@/views/admin/requests/SelectBox.vue';

const props = defineProps({
  data: { type: Object, required: true },
  status: { type: String, required: true },
  rule: { type: String, default: '' }
});
const emit = defineEmits(['update:status', 'update:rule', 'update:page', 'reason']);

const STATUS = [
  ['open', 'Chưa xử lý', 'open'],
  ['skipped', 'Đã bỏ qua', 'skipped'],
  ['all', 'Tất cả', 'all']
];
const ruleOptions = computed(() => [
  { value: '', label: 'Mọi quy tắc' },
  ...props.data.rules.map(r => ({ value: r, label: r }))
]);
const from = computed(() => (props.data.page - 1) * props.data.pageSize + 1);
</script>

<template>
  <section class="card wl">
    <div class="card-h">
      <h2>Cảnh báo AI</h2>
      <span class="cap">Xếp theo mức độ</span>
    </div>
    <div class="ctl">
      <span class="seg">
        <button
          v-for="[key, label, field] in STATUS"
          :key="key"
          type="button"
          :class="{ on: status === key }"
          @click="emit('update:status', key)"
        >
          {{ label }} · {{ data.counts[field] }}
        </button>
      </span>
      <SelectBox
        :model-value="rule"
        :options="ruleOptions"
        label="Quy tắc"
        style="margin-left: auto"
        @update:model-value="emit('update:rule', $event)"
      />
    </div>
    <div v-if="data.meta.notice" class="notice">
      <Icon name="alert" />
      <span>{{ data.meta.notice.text }}</span>
      <RouterLink v-if="data.meta.notice.link" class="link" :to="data.meta.notice.link.to">{{ data.meta.notice.link.label }}</RouterLink>
    </div>
    <div>
      <div v-for="w in data.items" :key="w.id" class="row">
        <span class="pill" :class="w.level === 'Cao' ? 'p-err' : 'p-pend'">{{ w.level }}</span>
        <div>
          <div class="rule">{{ w.rule }} · {{ w.thresholdLabel }}</div>
          <div class="t">
            <b>{{ w.person }}</b> {{ warningText(w) }}
          </div>
        </div>
        <div class="acts">
          <button type="button" class="tact" @click="emit('reason', w.id)">Xem lý do</button>
          <RouterLink class="tact" :to="w.fixTo">Sửa</RouterLink>
        </div>
      </div>
      <div v-if="!data.items.length" class="empty">Không có cảnh báo nào.</div>
    </div>
    <div class="foot">
      <span v-if="data.total">{{ from }}–{{ from + data.items.length - 1 }} trên {{ data.total }} cảnh báo</span>
      <span v-else>0 cảnh báo</span>
      <span class="pager">
        <span>Trang {{ data.page }}/{{ data.pages }}</span>
        <button
          type="button"
          class="pb"
          aria-label="Trang trước"
          :disabled="data.page <= 1"
          @click="emit('update:page', data.page - 1)"
        >
          <Icon name="chevl" />
        </button>
        <button
          type="button"
          class="pb"
          aria-label="Trang sau"
          :disabled="data.page >= data.pages"
          @click="emit('update:page', data.page + 1)"
        >
          <Icon name="chevr" />
        </button>
      </span>
    </div>
  </section>
</template>

<style scoped>
.ctl {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px 16px;
}
.notice {
  margin: 0 24px 8px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--raised);
  border: 1px solid var(--border);
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.notice svg {
  color: var(--pend-ink);
}
.notice .link {
  margin-left: auto;
}
.wl .row {
  grid-template-columns: 84px 1fr auto;
  padding-top: 14px;
  padding-bottom: 14px;
  align-items: center;
  column-gap: 12px;
}
.wl .rule {
  font-size: 12px;
  color: var(--muted);
  line-height: 16px;
}
.wl .t {
  font-weight: 400;
  margin-top: 4px;
  line-height: 20px;
}
.wl .t b {
  font-weight: 600;
}
.wl .acts {
  display: flex;
  gap: 16px;
  padding-left: 12px;
}
.wl .row > .pill {
  justify-self: start;
}
.empty {
  border-top: 1px solid var(--rule);
  padding: 20px 24px;
  color: var(--muted);
}
.pb:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
