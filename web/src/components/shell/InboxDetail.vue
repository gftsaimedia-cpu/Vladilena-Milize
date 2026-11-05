<script setup lang="ts">
// Thẻ việc chờ xử lý của một ngày, chỉ dùng trong hộp chi tiết ngày của màn Chấm công (DayDetailDialog; chuông dùng
// BellDetail): đầu thẻ, các dòng nhãn – giá trị và nút xử lý. Người và liên kết hồ sơ do hộp chứa tự hiện.
// Tự gọi useShellStore().decide; xong thì emit('decided') để hộp chứa báo câu kết quả rồi đóng.
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { InboxItem } from '@/mock/inbox';
import { ALREADY_HANDLED, decisionText, type DecisionVerb } from '@/services/admin-main';
import { useShellStore } from '@/stores/shell';

const props = defineProps<{ item: InboxItem }>();
const emit = defineEmits<{ decided: [result: { id: string; ok: boolean; text: string }]; close: [] }>();

const shell = useShellStore();
const busy = ref(false);

async function act(verb: DecisionVerb) {
  if (busy.value) return;
  busy.value = true;
  try {
    const hit = await shell.decide(props.item.id, verb);
    emit('decided', {
      id: props.item.id,
      ok: hit !== null,
      text: hit ? decisionText(verb, hit.name) : ALREADY_HANDLED
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="idetail" role="region" aria-label="Chi tiết yêu cầu" tabindex="-1">
    <button type="button" class="x" aria-label="Đóng chi tiết" @click="emit('close')"><Icon name="x" /></button>
    <h4>{{ item.head }}</h4>
    <p class="sub">{{ item.sub }}</p>
    <dl>
      <div v-for="[label, value] in item.facts" :key="label" class="fact">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </div>
    </dl>
    <div class="acts">
      <template v-if="item.action === 'decide'">
        <button
          type="button"
          class="btn"
          :disabled="busy"
          :aria-label="`Từ chối yêu cầu của ${item.name}`"
          @click="act('reject')"
        >
          Từ chối
        </button>
        <button
          type="button"
          class="btn pri"
          :disabled="busy"
          :aria-label="`Duyệt yêu cầu của ${item.name}`"
          @click="act('approve')"
        >
          Duyệt
        </button>
      </template>
      <template v-else>
        <button type="button" class="btn pri" :disabled="busy" @click="act('remind')">Nhắc giải trình</button>
        <button type="button" class="btn" :disabled="busy" @click="act('declare')">
          {{ item.missing === 'in' ? 'Khai thay giờ vào' : 'Khai thay giờ ra' }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.idetail {
  position: relative;
  outline: none;
}
.idetail:focus-visible,
.x:focus-visible,
.acts .btn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.idetail:focus-visible {
  outline-offset: -2px;
  border-radius: 8px;
}
.x {
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  border-radius: var(--r-ctl);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--muted);
}
h4 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.sub {
  margin: 2px 0 16px;
  font-size: 14px;
  line-height: 20px;
  color: var(--muted);
}
dl {
  margin: 0 0 20px;
}
.fact {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid var(--rule);
  font-size: 14px;
  line-height: 20px;
}
dt {
  color: var(--muted);
  flex: none;
}
dd {
  margin: 0;
  text-align: right;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.acts {
  display: flex;
  gap: 12px;
}
.acts .btn {
  flex: 1;
  justify-content: center;
  cursor: pointer;
}
.acts .btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
