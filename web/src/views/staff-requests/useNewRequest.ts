// Luồng "Tạo yêu cầu" của nhân viên (spec staff-requests 4.1, 4.5), dùng chung cho điện thoại và máy tính.
// URL: trên /nv/yeu-cau, ?tao=chon là menu J8, ?tao=<slug> là một form (TAO_SLUG); Giải trình thêm &ngay=YYYY-MM-DD.
// Vỏ (BottomSheet / SideDrawer) mở khi có ?tao= (useTaoParam), đóng thì bỏ tao và ngay (withoutFlow).
// useNewRequest (trong NewRequestBody): tải request-context, giữ loại đang mở, đưa giá trị lạ, loại ẩn hay khoá về menu, xem
// trước 300ms sau lần sửa cuối, gửi. Nút Gửi chỉ bật khi lần xem trước gần nhất trả ok (spec 4.5).
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import type { PreviewResult, RequestContext, RequestDraft, RequestKind } from '@/mock/staff-requests-types';
import { createRequest, getRequestContext, previewRequest } from '@/services/staff-requests';

export type TaoSlug = 'nghi' | 'nghi-bu' | 'nghi-giua-ca' | 'ot' | 'doi-ca' | 'giai-trinh' | 'tam-ung';
export const TAO_SLUG: Record<RequestKind, TaoSlug> = {
  leave: 'nghi',
  'leave-with-makeup': 'nghi-bu',
  'half-shift-leave': 'nghi-giua-ca',
  overtime: 'ot',
  'shift-change': 'doi-ca',
  explanation: 'giai-trinh',
  advance: 'tam-ung'
};
/** ?tao= của menu J8. */
export const TAO_MENU = 'chon';
export const REQUESTS_PATH = '/nv/yeu-cau';
const PREVIEW_DELAY_MS = 300;
const KIND_OF = Object.fromEntries(Object.entries(TAO_SLUG).map(([kind, slug]) => [slug, kind])) as Record<string, RequestKind>;

const first = (v: unknown): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s ? s : null;
};
const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** ?tao= của /nv/yeu-cau; null ở đường dẫn khác. Giá trị lạ vẫn mở luồng: luồng tự về menu. */
export function useTaoParam() {
  const route = useRoute();
  return computed(() => (route.path === REQUESTS_PATH ? first(route.query.tao) : null));
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Query sau khi đóng luồng: bỏ tao, ngay và thang, giữ phần còn lại. */
export function withoutFlow(query: LocationQuery): LocationQuery {
  const { tao: _tao, ngay: _ngay, thang: _thang, ...rest } = query;
  return rest;
}

export function useNewRequest() {
  const route = useRoute();
  const router = useRouter();
  const tao = useTaoParam();
  const ngay = computed(() => first(route.query.ngay));
  // Tháng đang xem ở màn Chấm công (?thang=YYYY-MM): form Giải trình chỉ hiện ngày của tháng đó. Mở thẳng từ một ngày (?ngay=) thì
  // lấy tháng của ngày đó.
  const explicitMonth = computed(() => {
    const m = first(route.query.thang);
    return m && MONTH.test(m) ? m : null;
  });
  const thang = computed(() => explicitMonth.value ?? (ngay.value && /^\d{4}-\d{2}-\d{2}$/.test(ngay.value) ? ngay.value.slice(0, 7) : null));

  const ctx = shallowRef<RequestContext | null>(null);
  /** Câu lỗi khi chưa có request-context nào; tải lại hỏng khi đã có thì giữ request-context cũ, không đụng form. */
  const loadError = ref('');
  async function loadContext() {
    try {
      ctx.value = await getRequestContext();
      loadError.value = '';
    } catch (e) {
      if (!ctx.value) loadError.value = messageOf(e, 'Chưa tải được dữ liệu tạo yêu cầu.');
    }
  }
  loadContext();

  /** Loại mở được: có trong kinds (quyền lợi) và đang bật (không khoá). */
  const openable = (kind: RequestKind) => !!ctx.value?.kinds.find(k => k.kind === kind)?.enabled;
  const wanted = computed(() => (tao.value ? (KIND_OF[tao.value] ?? null) : null));
  /** Loại đang mở; null là menu J8 (cả khi chưa tải xong request-context). */
  const kind = computed(() => (ctx.value && wanted.value && openable(wanted.value) ? wanted.value : null));

  // Đổi bước bằng replace, bỏ ngay: ngày điền sẵn chỉ đi kèm liên kết mở thẳng form Giải trình.
  const go = (slug: string) =>
    router.replace({ path: REQUESTS_PATH, query: { ...withoutFlow(route.query), tao: slug, ...(explicitMonth.value ? { thang: explicitMonth.value } : {}) } });
  const pick = (k: RequestKind) => go(TAO_SLUG[k]);
  const toMenu = () => go(TAO_MENU);

  // Giá trị lạ về menu ngay; loại ẩn hoặc khoá về menu khi đã có request-context (Review Focus 1).
  watch(
    [tao, ctx],
    () => {
      if (!tao.value || tao.value === TAO_MENU) return;
      if (!wanted.value || (ctx.value && !openable(wanted.value))) toMenu();
    },
    { immediate: true }
  );

  // ---------- Xem trước và gửi ----------
  const draft = shallowRef<RequestDraft[RequestKind] | null>(null);
  /** Kết quả xem trước của bản nháp hiện tại; null khi đang chờ. Chỉ cái này bật nút Gửi. */
  const preview = shallowRef<PreviewResult | null>(null);
  /**
   * Kết quả xem trước gần nhất đã về, giữ trên màn trong lúc chờ lần sau (form vẽ cảnh báo hoặc câu từ chối từ đây, không
   * nhấp nháy mỗi lần gõ). Bỏ khi form chưa đủ trường hoặc đổi loại.
   */
  const shownPreview = shallowRef<PreviewResult | null>(null);
  const sending = ref(false);
  const sendError = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0; // kết quả xem trước của bản nháp cũ bị bỏ
  let reloading = false; // đang tải lại request-context sau khi server từ chối

  function runPreview() {
    const k = kind.value;
    const d = draft.value;
    const n = ++seq;
    clearTimeout(timer);
    if (!k || !d) return;
    previewRequest(k, d)
      .catch((e): PreviewResult => ({ ok: false, message: messageOf(e, 'Chưa kiểm tra được đơn.') }))
      .then(r => {
        if (n !== seq) return;
        preview.value = r;
        shownPreview.value = r;
      });
  }

  /**
   * Form phát bản nháp đủ trường hoặc null. Bản nháp như cũ (form vẽ lại) thì bỏ qua. Người dùng sửa form thì câu lỗi của lần
   * gửi trước mất; form tự sửa vì request-context vừa tải lại (ngày không còn chọn được) thì câu lỗi vẫn ở đó.
   */
  function setDraft(next: RequestDraft[RequestKind] | null) {
    if (JSON.stringify(next) === JSON.stringify(draft.value)) return;
    draft.value = next;
    preview.value = null;
    if (!next) shownPreview.value = null;
    if (!reloading) sendError.value = '';
    seq++;
    clearTimeout(timer);
    if (next) timer = setTimeout(runPreview, PREVIEW_DELAY_MS);
  }
  watch(kind, () => {
    setDraft(null);
    shownPreview.value = null;
    sendError.value = '';
  });
  onBeforeUnmount(() => clearTimeout(timer));

  // Tải lại request-context sau khi server từ chối. Form nhận request-context mới và tự bỏ lựa chọn không còn hợp lệ trong
  // lần vẽ kế tiếp; nextTick chờ lần vẽ đó xong rồi mới coi mọi thay đổi bản nháp là của người dùng.
  async function reloadAfterRefusal() {
    reloading = true;
    try {
      await loadContext();
      await nextTick();
    } finally {
      reloading = false;
    }
  }

  const canSend = computed(() => !!kind.value && !!draft.value && preview.value?.ok === true && !sending.value);

  /** Gửi một lần: bấm đúp hay bấm khi đang gửi không tạo đơn thứ hai. Thành công thì giữ trạng thái đang gửi tới khi luồng đóng. */
  async function send(): Promise<boolean> {
    const k = kind.value;
    const d = draft.value;
    if (!k || !d || !canSend.value) return false;
    sending.value = true;
    sendError.value = '';
    try {
      await createRequest(k, d);
      return true;
    } catch (e) {
      // Server từ chối (đua giữa hai thiết bị, mất mạng): giữ form, câu lỗi dưới nút Gửi, tải lại request-context (spec 4.5),
      // rồi xem trước lại bản nháp (form có thể đã tự sửa theo request-context mới). Tải lại hỏng thì giữ request-context cũ.
      sendError.value = messageOf(e, 'Chưa gửi được yêu cầu. Bạn thử lại sau ít phút.');
      preview.value = null;
      sending.value = false;
      await reloadAfterRefusal();
      runPreview();
      return false;
    }
  }

  return {
    ctx,
    loadError,
    retryContext: loadContext,
    kind,
    ngay,
    thang,
    pick,
    toMenu,
    draft,
    setDraft,
    preview,
    shownPreview,
    canSend,
    sending,
    sendError,
    send
  };
}
