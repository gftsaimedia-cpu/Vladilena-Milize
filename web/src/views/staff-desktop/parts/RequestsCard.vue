<script setup lang="ts">
// Khối "Yêu cầu": các nút gửi yêu cầu, danh sách yêu cầu của tháng hoặc dòng báo chưa có.
import Icon from '@/components/ui/Icon.vue';

defineProps({
  data: { type: Object as () => any, required: true },
  explanations: { type: Object as () => any, default: null }
});
defineEmits(['open', 'answer', 'cancel']);
</script>

<template>
  <section class="card">
    <div class="card-h">
      <h2>Yêu cầu</h2>
      <span class="cap">{{ data.cap }}</span>
    </div>
    <div class="acts2">
      <button
        v-for="a in data.actions"
        :key="a.label"
        type="button"
        class="btn"
        :class="{ soon: a.soon }"
        :disabled="a.soon"
        @click="$emit('open', a)"
      >
        <Icon :name="a.icon" />{{ a.label
        }}<small v-if="a.hint || a.soon" :class="a.soon ? 'soon-tag' : 'hint'">{{ a.soon ? 'Sắp có' : a.hint }}</small>
      </button>
    </div>
    <div v-for="r in data.items" :key="r.day + r.title" class="req2">
      <span class="dt"
        ><b>{{ r.day }}</b
        >{{ r.mon }}</span
      >
      <div>
        <div class="t">{{ r.title }}</div>
        <div class="s">{{ r.sub }}</div>
        <button v-if="r.canCancel" type="button" class="btn" @click="$emit('cancel', r)">Huỷ yêu cầu</button>
      </div>
      <span class="pill" :class="r.pill.cls">{{ r.pill.text }}</span>
    </div>
    <div v-for="x in explanations ? explanations.absent : []" :key="'ex' + x.id" class="req2">
      <span class="dt"
        ><b>{{ x.date.slice(8, 10) }}</b
        >/{{ x.date.slice(5, 7) }}</span
      >
      <div>
        <div class="t">{{ x.prompt }}</div>
        <button type="button" class="btn" @click="$emit('answer', x)">Giải trình</button>
      </div>
    </div>
    <div v-for="x in explanations ? explanations.items : []" :key="'ex' + x.id" class="req2">
      <span class="dt"
        ><b>{{ x.date.slice(8, 10) }}</b
        >/{{ x.date.slice(5, 7) }}</span
      >
      <div>
        <div class="t">{{ x.prompt }}</div>
        <div v-if="x.decisionNote" class="s">{{ x.decisionNote }}</div>
        <button v-if="x.canAnswer || x.canResubmit" type="button" class="btn" @click="$emit('answer', x)">
          {{ x.canAnswer ? 'Trả lời' : 'Giải trình lại' }}
        </button>
      </div>
      <span class="pill" :class="'p-' + x.status">{{ x.statusLabel }}</span>
    </div>
    <div v-if="data.empty" class="empty">
      <b>{{ data.empty.title }}</b
      >{{ data.empty.text }}
    </div>
  </section>
</template>

<style scoped>
.acts2 {
  display: grid;
  gap: 8px;
  padding: 0 24px 16px;
}
.acts2 .btn {
  justify-content: flex-start;
  height: 40px;
}
.acts2 .btn.soon {
  color: #767676;
  border-color: var(--border);
}
.acts2 .btn small {
  margin-left: auto;
}
.acts2 .btn .hint {
  color: var(--muted);
  font-weight: 400;
}
.acts2 .btn .soon-tag {
  font-size: 11px;
  font-weight: 400;
}
.empty {
  padding: 14px 24px 18px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
}
.empty b {
  color: var(--text);
  font-weight: 600;
  display: block;
  font-size: 14px;
}
.req2 {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 24px;
  border-top: 1px solid var(--rule);
  font-size: 13px;
}
.req2 .dt {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #f1f1f1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--muted);
  line-height: 12px;
}
.req2 .dt b {
  font-size: 15px;
  line-height: 18px;
  color: var(--text);
}
.req2 .t {
  font-weight: 600;
  font-size: 14px;
}
.req2 .s {
  color: var(--muted);
  font-size: 12px;
}
</style>
