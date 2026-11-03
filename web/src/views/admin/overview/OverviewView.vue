<script setup lang="ts">
// Tổng quan (tong-quan): kỳ lương còn gì chặn trước khi chốt công, yêu cầu chờ, chỉ số chính, mốc sắp tới.
import { useRoute } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { approveRequest, getOverview, rejectRequest } from '@/services/admin-main';
import { usePeriodStore } from '@/stores/period';
import { dm, initials, num, vnd, vndc } from '@/utils/format';
import { monthNo } from '@/views/admin/requests/helpers';

const route = useRoute();
const period = usePeriodStore();
const { data, reload } = useLoad(
  () => getOverview(period.month),
  () => period.month
);

async function approve(r?: any) {
  await approveRequest(r.id);
  reload();
}

async function reject(r?: any) {
  await rejectRequest(r.id);
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
      <div class="acts">
        <RouterLink to="/admin/bang-luong" class="btn pri">
          <Icon name="cash" />Mở bảng lương
        </RouterLink>
      </div>
    </div>

    <div class="kpis">
      <div v-for="(k, i) in data.kpis" :key="k.key" class="kpi" :class="{ 'kpi-hero': i === 0 }">
        <div class="kpi-top">
          <span class="l">{{ k.label }}</span>
          <span class="kpi-ico">
            <Icon :name="k.key === 'staff' ? 'file' : k.key === 'attend' ? 'check' : 'cash'" :size="16" />
          </span>
        </div>
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

    <div class="ov-grid">
      <section class="card blk fill">
        <div class="card-h">
          <div>
            <h2>
              Kỳ lương tháng {{ monthNo(data.month) }}/{{ data.month.slice(0, 4) }}
              <span class="pill" :class="data.periodCard?.statusCls">{{ data.periodCard?.statusLabel }}</span>
            </h2>
            <div class="cap">{{ data.blockers.cap }} · {{ data.periodCard?.people || 0 }} phiếu lương</div>
          </div>
          <RouterLink to="/admin/bang-luong" class="link">Mở bảng lương →</RouterLink>
        </div>

        <div class="seg-wrap">
          <div class="seg-bar">
            <div
              v-if="data.periodCard?.approved"
              class="seg seg-done"
              :style="{ width: `${(data.periodCard.approved / (data.periodCard.people || 1)) * 100}%` }"
              :title="`Đã duyệt: ${data.periodCard.approved}`"
            />
            <div
              v-if="data.periodCard?.pending"
              class="seg seg-pend"
              :style="{ width: `${(data.periodCard.pending / (data.periodCard.people || 1)) * 100}%` }"
              :title="`Chờ duyệt: ${data.periodCard.pending}`"
            />
            <div
              v-if="data.periodCard?.draft"
              class="seg seg-draft"
              :style="{ width: `${(data.periodCard.draft / (data.periodCard.people || 1)) * 100}%` }"
              :title="`Nháp: ${data.periodCard.draft}`"
            />
            <div
              v-if="data.periodCard?.error"
              class="seg seg-err"
              :style="{ width: `${(data.periodCard.error / (data.periodCard.people || 1)) * 100}%` }"
              :title="`Lỗi: ${data.periodCard.error}`"
            />
          </div>
          <div class="seg-legend">
            <span class="leg-item"><i class="dot done" />Đã duyệt <b>{{ data.periodCard?.approved || 0 }}</b></span>
            <span class="leg-item"><i class="dot pend" />Chờ duyệt <b>{{ data.periodCard?.pending || 0 }}</b></span>
            <span class="leg-item"><i class="dot draft" />Nháp <b>{{ data.periodCard?.draft || 0 }}</b></span>
            <span v-if="data.periodCard?.error" class="leg-item"><i class="dot err" />Lỗi <b>{{ data.periodCard.error }}</b></span>
          </div>
        </div>

        <div v-if="data.blocking > 0" class="blk-banner">
          <Icon name="alert" :size="16" />
          <span>Phát hiện <b>{{ data.blocking }} nhóm việc</b> cần xử lý trước khi chốt công và khoá kỳ lương.</span>
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

      <div class="ov-side">
        <section class="card ap fill">
          <div class="card-h">
            <h2>Việc cần duyệt</h2>
            <span class="pill p-draft">{{ data.approvals.total }} việc</span>
          </div>
          <div v-for="r in data.approvals.items" :key="r.id" class="row">
            <div class="who">
              <span class="av">{{ initials(r.name) }}</span>
              <div>
                <div class="t">{{ r.name }}</div>
                <div class="s">{{ r.kind }} · {{ dm(r.date) }}</div>
              </div>
            </div>
            <div class="ap-acts">
              <button type="button" class="btn sm" @click="reject(r)">Từ chối</button>
              <button type="button" class="btn sm pri" @click="approve(r)">Duyệt</button>
            </div>
          </div>
          <div v-if="!data.approvals.items.length" class="empty-row">
            Không có yêu cầu nào chờ duyệt.
          </div>
          <div class="foot">
            <RouterLink to="/admin/yeu-cau/moi-thang" class="link">
              Xem tất cả {{ data.approvals.total }} việc →
            </RouterLink>
          </div>
        </section>

        <section class="card up fill">
          <div class="card-h">
            <h2>Sắp tới</h2>
          </div>
          <div v-for="u in data.upcoming" :key="u.date" class="row">
            <span class="dt-box">
              <b>{{ u.date.slice(8, 10) }}</b>
              <small>Th{{ Number(u.date.slice(5, 7)) }}</small>
            </span>
            <div>
              <div class="t">{{ u.title }}</div>
              <div v-if="u.sub" class="s">{{ u.sub }}</div>
            </div>
          </div>
          <div class="foot">
            <RouterLink to="/admin/cai-dat/lich" class="link">Đổi lịch trong Cài đặt</RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov-grid {
  display: grid;
  grid-template-columns: 1.65fr 1fr;
  gap: 24px;
  align-items: start;
}
.ov-side {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.kpis {
  margin-bottom: 24px;
}
.kpi {
  position: relative;
  display: flex;
  flex-direction: column;
}
.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kpi-ico {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--surface-raised, rgba(0, 0, 0, 0.04));
  color: var(--muted);
  display: grid;
  place-items: center;
}
.kpi.kpi-hero {
  background: linear-gradient(135deg, #e8c372 0%, #dfb456 100%);
  border-color: #d6ab4c;
  color: #181816;
}
.kpi.kpi-hero .l {
  color: #5c4712;
  font-weight: 500;
}
.kpi.kpi-hero .v {
  color: #181816;
  font-weight: 700;
}
.kpi.kpi-hero .n {
  color: #4a3a0e;
}
.kpi.kpi-hero .kpi-ico {
  background: rgba(24, 24, 22, 0.12);
  color: #181816;
}
.blk-banner {
  background: var(--gold-pale, #fdf9ee);
  border: 1px solid #f0dfb4;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 12px 24px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #634f19;
}
.blk-banner svg {
  color: #c99726;
  flex-shrink: 0;
}
.seg-wrap {
  padding: 16px 24px 8px;
}
.seg-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  background: var(--surface-raised, #f0f0ee);
  overflow: hidden;
  gap: 2px;
}
.seg {
  height: 100%;
  transition: width 0.3s ease;
}
.seg-done { background: #2e7d32; }
.seg-pend { background: #e0a82e; }
.seg-draft { background: #9e9e9e; }
.seg-err { background: #d32f2f; }
.seg-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.leg-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.leg-item b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.leg-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}
.leg-item .dot.done { background: #2e7d32; }
.leg-item .dot.pend { background: #e0a82e; }
.leg-item .dot.draft { background: #9e9e9e; }
.leg-item .dot.err { background: #d32f2f; }
.blk .row {
  grid-template-columns: 56px 1fr auto;
  min-height: 60px;
}
.blk .cnt {
  font-size: 24px;
  line-height: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.ap .row {
  grid-template-columns: 1fr auto;
  min-height: 64px;
  padding: 10px 24px;
}
.ap .row .who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ap .row .who .s {
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ap-acts {
  display: flex;
  align-items: center;
  gap: 8px;
}
.empty-row {
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.dt-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--surface-raised, #f5f5f4);
  border: 1px solid var(--border);
  line-height: 1.1;
}
.dt-box b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.dt-box small {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
}
.up .row {
  grid-template-columns: 44px 1fr;
  min-height: 58px;
  gap: 14px;
}
.note {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  line-height: 20px;
  color: var(--muted);
  font-size: 13px;
}
.kpi .of {
  color: var(--muted);
  font-weight: 500;
}
</style>
