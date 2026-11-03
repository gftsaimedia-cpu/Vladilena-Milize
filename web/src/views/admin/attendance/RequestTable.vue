<script setup lang="ts">
// Thẻ danh sách yêu cầu có thanh lọc trạng thái và trạng thái rỗng (tab Sửa giờ, tab Giờ OT).
// rows: [{ id, name, sub, cols: [chữ từng cột giữa], pill: { cls, label } }]
import { initials } from '@/utils/format';
import Icon from '@/components/ui/Icon.vue';

defineProps({
  title: { type: String, required: true },
  cap: { type: String, default: '' },
  chips: { type: Array as () => any[], required: true }, // [{ key, label, count? }]
  active: { type: String, required: true },
  columns: { type: Array as () => any[], required: true }, // tên cột, kể cả cột đầu (Nhân sự) và cuối (Trạng thái)
  rows: { type: Array as () => any[], default: () => [] },
  empty: { type: Object as () => any, required: true }, // { icon, title, lines: [] }
  showActions: { type: Boolean, default: false }
});
defineEmits(['select', 'approve', 'reject']);
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>{{ title }}</h2>
      <span class="cap">{{ cap }}</span>
    </div>
    <div class="tools">
      <button
        v-for="c in chips"
        :key="c.key"
        type="button"
        class="chip"
        :class="{ on: c.key === active }"
        @click="$emit('select', c.key)"
      >
        {{ c.label }} <small v-if="c.count != null">{{ c.count }}</small>
      </button>
    </div>
    <table class="tbl">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c">{{ c }}</th>
          <th v-if="showActions">Thao tác</th>
        </tr>
      </thead>
      <tbody v-if="rows.length">
        <tr v-for="r in rows" :key="r.id">
          <td>
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.sub }}</div>
              </div>
            </div>
          </td>
          <td v-for="(c, i) in r.cols" :key="i">{{ c }}</td>
          <td>
            <span class="pill" :class="r.pill.cls">{{ r.pill.label }}</span>
          </td>
          <td v-if="showActions">
            <div v-if="r.canDecide" class="acts" style="display: flex; gap: 8px;">
              <button type="button" class="btn sm pri" @click="$emit('approve', r)">Đồng ý</button>
              <button type="button" class="btn sm" @click="$emit('reject', r)">Từ chối</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length" class="empty">
      <div class="ico"><Icon :name="empty.icon" :size="20" /></div>
      <b>{{ empty.title }}</b>
      <template v-for="(line, i) in empty.lines" :key="i"><br v-if="i" />{{ line }}</template>
    </div>
  </section>
</template>

<style scoped>
.empty {
  padding: 36px 24px 40px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  line-height: 20px;
}
.empty b {
  display: block;
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.empty .ico {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #f1f1f1;
  display: grid;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--muted);
}
</style>
