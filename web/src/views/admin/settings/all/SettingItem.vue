<script setup lang="ts">
// Một mục cài đặt sửa được trong Tất cả cài đặt: tên + nhãn trạng thái + mô tả bên trái, ô sửa bên phải
// (mỗi loại nhân sự một ô, hoặc chọn một trong các phương án).
import { ref } from 'vue';
import { dmy, monthShort } from '@/utils/format';
import FieldNum from '../fields/FieldNum.vue';

defineProps({
  item: { type: Object as () => any, required: true },
  changed: { type: Boolean, default: false },
  canRevert: { type: Boolean, default: false }
});
defineEmits(['undo', 'revert']);

const showHistory = ref(false);

const BADGE = { adjusted: ['p-gold', 'Admin đã sửa'], unconfirmed: ['p-pend', 'Chưa xác nhận'] };
const pickOption = (item?, o?) => {
  if (!o.disabled) item.value = o.key;
};
</script>

<template>
  <div class="it2">
    <div class="l">
      <div class="nm">
        {{ item.name }}
        <span v-if="BADGE[item.badge]" class="pill" :class="BADGE[item.badge][0]">{{ BADGE[item.badge][1] }}</span>
        <button v-if="item.history" type="button" class="link hist" @click="showHistory = !showHistory">Lịch sử</button>
        <button type="button" class="link undo" :disabled="!changed" @click="$emit('undo')">Hoàn tác</button>
      </div>
      <div v-if="item.history && showHistory" class="hl">
        <div v-for="h in item.history.rows" :key="h.key + h.version" class="hr">
          <div>
            <b>{{ h.label ? h.label + ': ' : '' }}{{ h.value }}</b>
            <span v-if="h.version === 0">Mặc định</span>
            <span v-else>
              {{ monthShort(h.month) }} · {{ h.by }} · {{ dmy(h.at)
              }}<template v-if="h.reason"> · {{ h.reason }}</template>
            </span>
          </div>
          <span v-if="h.current" class="pill p-gold">Đang áp dụng</span>
          <button v-else-if="canRevert" type="button" class="link" @click="$emit('revert', h)">
            Hoàn tác về mức này
          </button>
        </div>
      </div>
      <div v-if="item.desc" class="ds">{{ item.desc }}</div>
      <div v-if="item.base" class="bs">{{ item.base }}</div>
    </div>
    <div class="c">
      <div v-if="item.kind === 'per'" class="per">
        <div v-for="p in item.rows" :key="p.label" class="pr">
          <span>{{ p.label }}</span>
          <FieldNum
            v-if="p.field.type === 'num'"
            v-model="p.field.value"
            :unit="p.field.unit"
            style="width: 110px"
            :label="`${item.name} · ${p.label}`"
          />
          <span v-else class="seg">
            <button
              v-for="o in p.field.options"
              :key="o"
              type="button"
              :class="{ on: p.field.value === o }"
              @click="p.field.value = o"
            >
              {{ o }}
            </button>
          </span>
        </div>
      </div>
      <template v-else>
        <button
          v-for="o in item.options"
          :key="o.key"
          type="button"
          class="opt"
          :class="{ on: item.value === o.key, dis: o.disabled }"
          role="radio"
          :aria-checked="item.value === o.key"
          :disabled="o.disabled"
          @click="pickOption(item, o)"
        >
          <span class="rd"></span>
          <div>
            {{ o.label }}
            <small v-if="o.note">{{ o.note }}</small>
          </div>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.it2 {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
  padding: 18px 24px;
  border-top: 1px solid var(--rule);
}
.it2 .nm {
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.it2 .nm .hist {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
}
.it2 .nm .undo {
  font-size: 12px;
  font-weight: 500;
}
.it2 .nm .undo:disabled {
  opacity: 0.4;
  cursor: default;
}
.hl {
  margin-top: 10px;
  border-top: 1px solid var(--rule);
}
.hr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--rule);
  font-size: 12px;
}
.hr > div {
  flex: 1;
  min-width: 0;
}
.hr b {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.hr > div > span {
  color: var(--muted);
}
.it2 .ds {
  font-size: 13px;
  color: var(--text);
  margin-top: 6px;
  line-height: 19px;
}
.it2 .bs {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  line-height: 17px;
}
.per {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--muted);
}
.opt {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: inherit;
  background: #fff;
  margin-bottom: 6px;
  cursor: pointer;
}
.opt.on {
  border-color: var(--text);
  box-shadow: inset 0 0 0 1px var(--text);
  font-weight: 500;
}
.opt.dis {
  color: #767676;
  background: var(--raised);
  cursor: default;
}
.opt small {
  display: block;
  font-size: 11px;
  font-weight: 400;
}
.opt .rd {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid #9e9e9e;
  flex: none;
  margin-top: 1px;
}
.opt.on .rd {
  border: 5px solid var(--text);
}
</style>
