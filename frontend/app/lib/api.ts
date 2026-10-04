/**
 * Browser client for this subsystem's own backend.
 *
 * The frontend has no login of its own (SEC-05). Requests go to the same
 * origin (`/api/*` is proxied to the backend by next.config.ts), so the
 * HttpOnly SSO cookie set by /auth/callback travels with them and no token is
 * ever visible to this code.
 *
 * A 401 means the Core Hub session cookie is missing or expired. The whole page
 * is then sent through /auth/login (auth-contract.md ข้อ 7 - silent re-SSO):
 * top-level navigation, never fetch. If we just came back from a re-SSO and
 * still get 401, we stop instead of looping.
 */

type Envelope<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string } };

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string };

const LOOP_GUARD_KEY = 'lab_booking_sso_redirect_at';
const LOOP_GUARD_MS = 30_000;

function startSso(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(LOOP_GUARD_KEY) ?? 0);
    if (Date.now() - last < LOOP_GUARD_MS) return false;
    window.sessionStorage.setItem(LOOP_GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable: fall through and redirect once per call
  }
  const next = `${window.location.pathname}${window.location.search}`;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- /auth/login is a backend route, not a Next page: it must be a top-level navigation (auth-contract 7)
  window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
  return true;
}

/**
 * Safely pull a human-readable message out of any error body: the project's
 * envelope ({ error: { message } }), a raw NestJS error ({ message }, where
 * message may be a string[]), or anything else (returns null).
 */
function extractErrorMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { error?: { message?: unknown } | null; message?: unknown };
  const raw = b.error?.message ?? b.message;
  if (Array.isArray(raw)) {
    const joined = raw.filter((m): m is string => typeof m === 'string').join(', ');
    return joined.length > 0 ? joined : null;
  }
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, status: 0, message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' };
  }

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (res.ok && body?.success === true) {
    return { ok: true, status: res.status, data: body.data };
  }

  if (res.status === 401 && startSso()) {
    // The page is navigating away; hand back a pending-looking failure.
    return { ok: false, status: 401, message: 'กำลังเข้าสู่ระบบผ่าน CSMJU Core Hub…' };
  }

  let message: string;
  if (res.status === 401) {
    message = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
  } else if (res.status === 403) {
    message = 'สิทธิ์ไม่เพียงพอ';
  } else {
    message =
      extractErrorMessage(body) ??
      (res.status >= 500
        ? 'เซิร์ฟเวอร์ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง'
        : `เกิดข้อผิดพลาดในการเชื่อมต่อระบบ (HTTP ${res.status})`);
  }

  return { ok: false, status: res.status, message };
}