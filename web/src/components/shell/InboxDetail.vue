<script setup lang="ts">
// Thẻ chi tiết một việc chờ xử lý (chuông, và sau này hồ sơ chấm công): người, đầu thẻ, các dòng nhãn – giá trị và nút xử lý.
// Tự gọi useShellStore().decide; xong thì emit('decided') để nơi chứa báo câu kết quả và chọn việc kế tiếp.
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import type { InboxItem } from '@/mock/inbox';
import { ALREADY_HANDLED, decisionText, type DecisionVerb } from '@/services/admin-main';
import { useShellStore } from '@/stores/shell';
import { employeePath } from '@/views/admin/attendance/links';

const props = withDefaults(defineProps<{ item: InboxItem; showPerson?: boolean; profileLink?: boolean }>(), {
  showPerson: true,
  profileLink: true
});
const emit = defineEmits<{ decided: [result: { id: string; ok: boolean; text: string }]; close: []; profile: [] }>();

const shell = useShellStore();
const route = useRoute();
const busy = ref(false);

const profileTo = () => ({
  path: employeePath(props.item.personId),
  query: route.query.thang ? { thang: route.query.thang } : {}
});
const hasProfile = () => props.profileLink && (props.item.group === 'att' || props.item.group === 'exp');

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
    <div v-if="showPerson" class="id-who">
      <span class="id-av">{{ item.initials }}</span>
      <div>
        <h3>{{ item.name }}</h3>
        <p>{{ item.role }}</p>
      </div>
    </div>
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
    <RouterLink v-if="hasProfile()" :to="profileTo()" class="link prof" @click="emit('profile')">
      Mở hồ sơ chấm công
    </RouterLink>
  </section>
</template>

<style scoped>
.idetail {
  position: relative;
  outline: none;
}
.idetail:focus-visible,
.x:focus-visible,
.acts .btn:focus-visible,
.prof:focus-visible {
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
.id-who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 40px;
  margin-bottom: 20px;
}
.id-av {
  border-radius: 50%;
  background: var(--draft-bg);
  color: var(--draft-ink);
  font-weight: 600;
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  font-size: 14px;
}
h3 {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 600;
}
.id-who p {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
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
.prof {
  display: inline-block;
  margin-top: 16px;
  font-size: 14px;
}
</style>
