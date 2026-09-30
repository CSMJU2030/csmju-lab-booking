/**
 * Validates a `next` value before the subsystem redirects the browser to it.
 *
 * Returns a path inside this subsystem, or null when the value must not be
 * followed. A value is accepted only when every rule holds (auth-contract
 * 5.2, SSO spec 4.5):
 *
 *  1. a string of 1-512 characters;
 *  2. starts with `/` but not `//`, and contains no backslash - browsers read
 *     `/` + backslash + `host` the same as `//host`, which leaves the site;
 *  3. no control characters (0-31, 127);
 *  4. still resolves to this origin after `new URL(next, origin)`;
 *  5. is not one of `blockedPrefixes` or below one of them. The subsystem
 *     passes `['/auth']`, so a `next` can never send the browser back into the
 *     sign-in flow it is finishing.
 *
 * Checked twice: when /auth/login stores the value, and again at the callback
 * right before the redirect, because the stored copy came back from a cookie.
 */
export function safeNextPath(raw: unknown, blockedPrefixes: readonly string[]): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) {
    return null;
  }

  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return null;
  }

  // A loop rather than a regex range: eslint's no-control-regex rejects one.
  for (const char of raw) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      return null;
    }
  }

  const base = new URL('http://self.invalid');
  const url = new URL(raw, base);

  if (url.origin !== base.origin) {
    return null;
  }

  const blocked = blockedPrefixes.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );

  return blocked ? null : `${url.pathname}${url.search}${url.hash}`;
}

/** Paths a subsystem `next` may never point at. */
export const SUBSYSTEM_BLOCKED_NEXT = ['/auth'] as const;
