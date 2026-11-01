<script setup lang="ts">
// Thẻ "Hỏi nhanh" của Trợ lý AI: câu hỏi dựng sẵn và câu trả lời (mỗi câu là một kịch bản ?kb=).
import { atLabel } from '@/views/admin/requests/helpers';

defineProps({ data: { type: Object as () => any, required: true } });
defineEmits(['select']);
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Hỏi nhanh</h2>
      <span class="cap">Câu hỏi dựng sẵn</span>
    </div>
    <div class="qs">
      <button
        v-for="q in data.questions"
        :key="q.key"
        type="button"
        class="q"
        :class="{ on: q.key === data.key, off: q.soon }"
        :disabled="q.soon"
        @click="$emit('select', q.key)"
      >
        {{ q.label }}<span v-if="q.soon" class="soon">Sắp có</span>
      </button>
    </div>
    <div class="ans">
      <h3>{{ data.answer.title }}</h3>
      <div class="sub">{{ data.answer.sub }}</div>
    </div>

    <template v-for="(g, gi) in data.answer.groups" :key="gi">
      <div v-if="g.label" class="sec-l">{{ g.label }}</div>
      <div :style="gi === 0 ? 'margin-top: 12px' : null">
        <div v-for="r in g.rows" :key="r.text" class="ar" :class="{ info: g.info }">
          <span class="c">{{ r.count }}</span>
          <span>{{ r.text }}</span>
          <RouterLink v-if="r.link" class="link" :to="r.link.to">{{ r.link.label }}</RouterLink>
          <span v-else />
        </div>
      </div>
    </template>

    <table v-if="data.answer.table" class="ph">
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th class="n">Cộng</th>
          <th class="n">Dùng</th>
          <th class="n">Còn</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in data.answer.table" :key="p.name">
          <td>
            {{ p.name }}<span class="ty">{{ p.type }}</span>
          </td>
          <td class="n">{{ p.added }}</td>
          <td class="n" :class="{ z: p.used === 0 }">{{ p.used }}</td>
          <td class="n b">{{ p.left }}</td>
        </tr>
      </tbody>
    </table>
    <div v-for="r in data.answer.footRows" :key="r.text" class="ar info">
      <span class="c">{{ r.count }}</span>
      <span>{{ r.text }}</span>
      <RouterLink v-if="r.link" class="link" :to="r.link.to">{{ r.link.label }}</RouterLink>
      <span v-else />
    </div>

    <div class="src">
      {{ data.answer.source }}<br />
      Tính lúc {{ atLabel(data.answer.computedAt) }}
    </div>
  </section>
</template>

<style scoped>
.qs {
  padding: 0 24px 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 500;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.q.on {
  background: var(--text);
  color: #fff;
  border-color: var(--text);
}
.q.off {
  color: #767676;
  cursor: default;
}
.q .soon {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
}
.ans {
  padding: 16px 24px 4px;
}
.ans h3 {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.ans .sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 2px;
}
.ar {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  border-top: 1px solid var(--rule);
  padding: 8px 24px;
  font-size: 13px;
  line-height: 18px;
}
.ar .c {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ar.info .c {
  color: var(--muted);
  font-weight: 500;
}
.ar.info {
  color: var(--muted);
}
.sec-l {
  padding: 14px 24px 6px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--rule);
}
.src {
  padding: 12px 24px 14px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
}
.ask {
  margin: 0 24px 20px;
  height: 44px;
  border-radius: 12px;
  background: var(--raised);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 8px 0 14px;
  color: #767676;
  font-size: 13px;
}
.ask .sb {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #b0b0b0;
  border: 0;
  background: none;
}
.ph {
  margin: 10px 0 8px;
}
.ph th {
  padding: 6px 10px;
  font-size: 11px;
}
.ph th:first-child,
.ph td:first-child {
  padding-left: 24px;
}
.ph th:last-child,
.ph td:last-child {
  padding-right: 24px;
}
.ph td {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
}
.ph td.z {
  color: #a3a3a3;
}
.ph td.b {
  font-weight: 600;
}
.ph .ty {
  color: var(--muted);
  font-size: 11px;
  margin-left: 6px;
}
</style>
