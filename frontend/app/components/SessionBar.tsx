'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Me = { email: string; subsystemRole: string };

/**
 * Who is signed in, plus "ออกจากระบบ". Logout is a POST to /auth/logout, which
 * the backend answers with a 303 to Core Hub's /logout (auth-contract.md ข้อ 5).
 */
export default function SessionBar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let current = true;
    api<Me>('/api/v1/me').then((result) => {
      if (current && result.ok) setMe(result.data);
    });
    return () => {
      current = false;
    };
  }, []);

  if (!me) return null;

  // LOCAL_TEST_ROLE on the backend: no Core Hub, so there is nothing to sign out of.
  const isLocalTest = me.email.endsWith('@localhost');

  return (
    <div className="flex items-center justify-end gap-3 bg-slate-900 px-4 py-2 text-xs text-slate-200">
      <span>
        {me.email} · {me.subsystemRole}
      </span>
      {isLocalTest ? (
        <span className="rounded bg-amber-500 px-2 py-1 font-semibold text-slate-900">
          โหมดทดสอบ (ไม่มี Core Hub)
        </span>
      ) : (
        <form method="post" action="/auth/logout">
          <button type="submit" className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600">
            ออกจากระบบ
          </button>
        </form>
      )}
    </div>
  );
}
