// Luồng "Tạo yêu cầu" của nhân viên (spec staff-requests 4.1, 4.5), dùng chung cho điện thoại và máy tính.
// URL: trên /nv/yeu-cau, ?tao=chon là menu J8, ?tao=<slug> là một form (TAO_SLUG); Giải trình thêm &ngay=YYYY-MM-DD.
// Vỏ (BottomSheet / SideDrawer) mở khi có ?tao= (useTaoParam), đóng thì bỏ tao và ngay (withoutFlow).
// useNewRequest (trong NewRequestBody): tải request-context, giữ loại đang mở, đưa giá trị lạ, loại ẩn, khoá hay chưa có form
// về menu, xem trước 300ms sau lần sửa cuối, gửi. Nút Gửi chỉ bật khi lần xem trước gần nhất trả ok (spec 4.5).
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import type { PreviewResult, RequestContext, RequestDraft, RequestKind } from '@/mock/staff-requests-types';
import { createRequest, getRequestContext, previewRequest } from '@/services/staff-requests';

export type TaoSlug = 'nghi' | 'nghi-bu' | 'ot' | 'doi-ca' | 'giai-trinh' | 'tam-ung';
export const TAO_SLUG: Record<RequestKind, TaoSlug> = {
  leave: 'nghi',
  'leave-with-makeup': 'nghi-bu',
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

/** Query sau khi đóng luồng: bỏ tao và ngay, giữ phần còn lại. */
export function withoutFlow(query: LocationQuery): LocationQuery {
  const { tao: _tao, ngay: _ngay, ...rest } = query;
  return rest;
}

/** hasForm: loại đã có form trong NewRequestBody. Loại chưa có form không mở được, kể cả khi server cho phép. */
export function useNewRequest(hasForm: (kind: RequestKind) => boolean) {
  const route = useRoute();
  const router = useRouter();
  const tao = useTaoParam();
  const ngay = computed(() => first(route.query.ngay));

  const ctx = shallowRef<RequestContext | null>(null);
  const loadError = ref('');
  async function loadContext() {
    try {
      ctx.value = await getRequestContext();
      loadError.value = '';
    } catch (e) {
      loadError.value = messageOf(e, 'Chưa tải được dữ liệu tạo yêu cầu.');
    }
  }
  loadContext();

  /** Loại mở được: có trong kinds (quyền lợi), đang bật (không khoá) và đã có form. */
  const openable = (kind: RequestKind) => !!ctx.value?.kinds.find(k => k.kind === kind)?.enabled && hasForm(kind);
  const wanted = computed(() => (tao.value ? (KIND_OF[tao.value] ?? null) : null));
  /** Loại đang mở; null là menu J8 (cả khi chưa tải xong request-context). */
  const kind = computed(() => (ctx.value && wanted.value && openable(wanted.value) ? wanted.value : null));

  // Đổi bước bằng replace, bỏ ngay: ngày điền sẵn chỉ đi kèm liên kết mở thẳng form Giải trình.
  const go = (slug: string) => router.replace({ path: REQUESTS_PATH, query: { ...withoutFlow(route.query), tao: slug } });
  const pick = (k: RequestKind) => go(TAO_SLUG[k]);
  const toMenu = () => go(TAO_MENU);

  // Giá trị lạ về menu ngay; loại ẩn, khoá hoặc chưa có form về menu khi đã có request-context (Review Focus 1).
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
  const preview = shallowRef<PreviewResult | null>(null);
  const sending = ref(false);
  const sendError = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0; // kết quả xem trước của bản nháp cũ bị bỏ

  function runPreview() {
    const k = kind.value;
    const d = draft.value;
    const n = ++seq;
    if (!k || !d) return;
    previewRequest(k, d).then(
      r => {
        if (n === seq) preview.value = r;
      },
      e => {
        if (n === seq) preview.value = { ok: false, message: messageOf(e, 'Chưa kiểm tra được đơn.') };
      }
    );
  }

  /**
   * Form phát bản nháp đủ trường hoặc null. Bản nháp như cũ (form vẽ lại) thì bỏ qua. Câu lỗi của lần gửi trước chỉ mất khi
   * có bản nháp đủ trường mới: form tự bỏ ngày không còn chọn được sau khi tải lại request-context thì câu lỗi vẫn ở đó.
   */
  function setDraft(next: RequestDraft[RequestKind] | null) {
    if (JSON.stringify(next) === JSON.stringify(draft.value)) return;
    draft.value = next;
    preview.value = null;
    if (next) sendError.value = '';
    seq++;
    clearTimeout(timer);
    if (next) timer = setTimeout(runPreview, PREVIEW_DELAY_MS);
  }
  watch(kind, () => {
    setDraft(null);
    sendError.value = '';
  });
  onBeforeUnmount(() => clearTimeout(timer));

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
      // Server từ chối (đua giữa hai thiết bị, mất mạng): giữ form, câu lỗi dưới nút Gửi, tải lại request-context (spec 4.5).
      sendError.value = messageOf(e, 'Chưa gửi được yêu cầu. Bạn thử lại sau ít phút.');
      preview.value = null;
      sending.value = false;
      await loadContext();
      runPreview();
      return false;
    }
  }

  return { ctx, loadError, kind, ngay, pick, toMenu, draft, setDraft, preview, canSend, sending, sendError, send };
}
