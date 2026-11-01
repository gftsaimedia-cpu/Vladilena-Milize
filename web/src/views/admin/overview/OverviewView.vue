<script setup lang="ts">
// Tổng quan (tong-quan): kỳ lương còn gì chặn trước khi chốt công, yêu cầu chờ, chỉ số chính, mốc sắp tới.
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { approveRequest, getOverview } from '@/services/admin-main';
import { usePeriodStore } from '@/stores/period';
import { dm, initials, num, vnd, vndc } from '@/utils/format';
import { monthNo } from '@/views/admin/requests/helpers';

const route = useRoute();
const period = usePeriodStore();
const { data, reload } = useLoad(
  () => getOverview(period.month),
  () => period.month
);

async function approve(r?) {
  await approveRequest(r.id);
  reload();
}
</script>

<template>
  <div v-if="data">
    <div class="title">
      <div>
        <h1>Tổng quan</h1>
        <p>
          Còn <b>{{ data.blocking }} việc</b> phải xong trước khi chốt công tháng {{ monthNo(data.month)
          }}<template v-if="data.closeOn"> · hạn {{ dm(data.closeOn) }}, còn {{ data.daysLeft }} ngày</template>
        </p>
      </div>
    </div>

    <div class="grid2">
      <section class="card blk fill">
        <div class="card-h">
          <h2>Trước khi chốt công</h2>
          <span class="cap">{{ data.blockers.cap }}</span>
        </div>
        <div v-for="b in data.blockers.rows" :key="b.key" class="row">
          <span class="cnt">{{ b.count }}</span>
          <div>
            <div class="t">{{ b.title }}</div>
            <div class="s">{{ b.sub }}</div>
          </div>
          <RouterLink :to="b.action.to" class="btn sm">
            {{ b.action.label }}
            <Icon name="arrow" :size="14" />
          </RouterLink>
        </div>
        <div class="foot">
          <span class="note">{{ data.blockers.note }}</span>
        </div>
      </section>

      <section class="card ap fill">
        <div class="card-h">
          <h2>Yêu cầu chờ xử lý</h2>
          <span class="cap"
            >{{ data.approvals.total }} · {{ data.approvals.month }} của tháng {{ monthNo(data.month) }}</span
          >
        </div>
        <div v-for="r in data.approvals.items" :key="r.id" class="row">
          <div class="who">
            <span class="av">{{ initials(r.name) }}</span>
            <div>
              <div class="t">{{ r.name }}</div>
              <div class="s">{{ r.kind }} · {{ dm(r.date) }}</div>
            </div>
          </div>
          <button type="button" class="tact" @click="approve(r)">Đồng ý</button>
        </div>
        <div class="foot">
          <RouterLink to="/admin/yeu-cau/moi-thang" class="link">Xem cả {{ data.approvals.total }} yêu cầu</RouterLink>
        </div>
      </section>
    </div>

    <div class="kpis">
      <div v-for="k in data.kpis" :key="k.key" class="kpi">
        <div class="l">{{ k.label }}</div>
        <div v-if="k.money != null" class="v" :class="{ 'est-u': k.est }">
          {{ vnd(k.money) }}<span class="unit">₫</span>
        </div>
        <div v-else class="v">
          {{ num(k.value) }}<span v-if="k.of != null" class="of"> / {{ num(k.of) }}</span>
        </div>
        <div class="n">
          {{ k.note }}<template v-if="k.noteMoney != null"> {{ vndc(k.noteMoney) }}</template>
        </div>
      </div>
    </div>

    <div class="grid2">
      <section class="card up fill">
        <div class="card-h"><h2>Mốc sắp tới</h2></div>
        <div v-for="u in data.upcoming" :key="u.date" class="row">
          <span class="dt">{{ dm(u.date) }}</span>
          <div>
            <div class="t">{{ u.title }}</div>
            <div v-if="u.sub" class="s">{{ u.sub }}</div>
          </div>
        </div>
        <div class="foot"><RouterLink to="/admin/cai-dat/lich" class="link">Đổi lịch trong Cài đặt</RouterLink></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.blk .row {
  grid-template-columns: 64px 1fr auto;
  height: 64px;
}
.blk .cnt {
  font-size: 26px;
  line-height: 30px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ap .row {
  grid-template-columns: 1fr auto;
  height: 76px;
}
.ap .row .who .s {
  max-width: 210px;
}
.ai .row {
  grid-template-columns: 1fr auto;
  padding-top: 14px;
  padding-bottom: 14px;
}
.ai .rule {
  font-size: 12px;
  color: var(--muted);
  display: flex;
  gap: 8px;
  align-items: center;
}
.ai .t {
  margin-top: 2px;
}
.up .row {
  grid-template-columns: 64px 1fr;
  height: 56px;
}
.up .dt {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* tong-quan không nạp ui.css: trả .note về dáng ghi chú nhạt của thiết kế */
.note {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  line-height: 20px;
  color: var(--muted);
  font-size: 13px;
}
.kpi .of {
  color: var(--muted);
  font-weight: 500;
}
button.pill {
  font-family: inherit;
  cursor: pointer;
}
</style>
