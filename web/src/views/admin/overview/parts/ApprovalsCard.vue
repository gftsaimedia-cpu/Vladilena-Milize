<script setup lang="ts">
// Thẻ Việc cần duyệt: 3 yêu cầu đầu của danh sách chờ; Từ chối / Duyệt báo lên màn qua emit.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { PendingRequest } from '@/mock/approvals';

const props = defineProps<{ approvals: PendingRequest[] }>();
defineEmits<{ approve: [id: string]; reject: [id: string] }>();

const SHOWN = 3;
const shown = computed(() => props.approvals.slice(0, SHOWN));
</script>

<template>
  <section class="card ap" aria-labelledby="ov-ap-h">
    <div class="head">
      <h2 id="ov-ap-h">Việc cần duyệt</h2>
      <span class="count">{{ approvals.length }}</span>
      <RouterLink to="/admin/yeu-cau" class="link all">Xem tất cả</RouterLink>
    </div>

    <ul v-if="shown.length" class="list" aria-label="Việc cần duyệt">
      <li v-for="r in shown" :key="r.id">
        <span class="av">{{ r.initials }}</span>
        <div class="wh">
          <div class="t">{{ r.name }}</div>
          <div class="s">{{ r.kind }} · {{ r.detail }}</div>
        </div>
        <div class="acts">
          <button
            type="button"
            class="ib no"
            :aria-label="`Từ chối yêu cầu của ${r.name}`"
            @click="$emit('reject', r.id)"
          >
            <Icon name="x" :size="16" />
          </button>
          <button
            type="button"
            class="ib yes"
            :aria-label="`Duyệt yêu cầu của ${r.name}`"
            @click="$emit('approve', r.id)"
          >
            <Icon name="check" :size="16" />
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="empty">Không còn yêu cầu nào chờ duyệt.</p>
  </section>
</template>

<style scoped>
.ap {
  padding: 24px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.count {
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--r-pill);
  display: inline-grid;
  place-items: center;
  background: var(--surface-dark);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.all {
  margin-left: auto;
  font-size: 14px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
}
.wh {
  flex: 1;
  min-width: 0;
}
.t {
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s {
  margin-top: 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.acts {
  display: flex;
  gap: 8px;
  flex: none;
}
.ib {
  width: 32px;
  height: 32px;
  border-radius: var(--r-ctl);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.ib.no {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--control);
}
.ib.yes {
  background: #000;
  color: #fff;
  border: 1px solid #000;
}
.empty {
  margin: 0;
  padding: 24px 0;
  border-top: 1px solid var(--rule);
  font-size: 14px;
  color: var(--muted);
  text-align: center;
}
@media (max-width: 480px) {
  .ap {
    padding: 20px 16px;
  }
}
</style>
