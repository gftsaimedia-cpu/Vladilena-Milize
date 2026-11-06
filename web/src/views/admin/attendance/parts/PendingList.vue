<script setup lang="ts">
// Tab "Cần xử lý": mỗi việc có ngày chấm công một dòng (đã xếp theo ngày đầu), trong vùng cuộn riêng cao cố định.
// - `wide` (từ 900px): bấm dòng chọn việc, emit('pick', id); khung chi tiết nằm bên phải do màn cha dựng. Dòng đang chọn có aria-current.
// - Màn hẹp: chỉ còn danh sách, bấm dòng mở hộp chi tiết ngày đầu của việc, emit('open-day').
import { dm } from '@/utils/format';
import type { PendingDay } from '@/builders/api/attendance';

defineProps<{ pending: PendingDay[]; wide: boolean; selectedId: string | null }>();
const emit = defineEmits<{ 'open-day': [personId: string, date: string]; pick: [id: string] }>();
</script>

<template>
  <div class="pl" :class="{ wide }">
    <div
      class="pls"
      tabindex="0"
      role="region"
      aria-label="Danh sách việc cần xử lý, cuộn để xem thêm"
      :class="{ narrow: !wide }"
    >
      <template v-if="pending.length">
        <div class="pl-hint">Xếp theo ngày công, cũ nhất trước</div>
        <ul class="pend" aria-label="Việc cần xử lý chấm công">
          <li v-for="p in pending" :key="p.item.id">
            <button
              type="button"
              class="pr"
              :class="{ on: wide && p.item.id === selectedId }"
              :data-id="p.item.id"
              :aria-current="wide && p.item.id === selectedId ? 'true' : undefined"
              :aria-label="`${p.person.name}, ${p.item.groupLabel} · ${p.item.what}, ${dm(p.date)}`"
              @click="wide ? emit('pick', p.item.id) : emit('open-day', p.person.id, p.date)"
            >
              <span class="av" aria-hidden="true">{{ p.person.initials }}</span>
              <span class="pn">
                <span class="hd">
                  <span class="nn">{{ p.person.name }}</span>
                  <span class="dt">{{ dm(p.date) }}</span>
                </span>
                <span class="dp">{{ p.item.groupLabel }} · {{ p.item.what }}</span>
              </span>
            </button>
          </li>
        </ul>
      </template>
      <p v-else class="none">Không còn việc nào cần xử lý.</p>
    </div>
  </div>
</template>

<style scoped>
.pl {
  min-width: 0;
}
.pl.wide {
  border-right: 1px solid var(--border);
}
.pls {
  height: 640px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--status-draft) transparent;
  padding: 4px 12px 12px;
}
.pls:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.pls.narrow {
  height: auto;
  max-height: 520px;
}
.pl-hint {
  padding: 12px 12px 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.pend {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pr {
  width: 100%;
  min-height: 56px;
  box-sizing: border-box;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.pr:hover {
  background: var(--ground);
}
.pr.on {
  background: #fff9ec;
}
.pr.on .nn {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pr:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.av {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50px;
  display: grid;
  place-items: center;
  background: var(--status-draft);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}
.pn {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.hd {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.nn {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt {
  flex: none;
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.dp {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.none {
  margin: 48px 12px;
  text-align: center;
  color: var(--muted);
}
</style>
