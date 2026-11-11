'use client';

import { useEffect, useState } from 'react';

type TeamEvent = {
  id: string;
  day: string;
  kind: string;
  actor: string;
  target: string | null;
  actor_team: boolean;
  created_at: string;
  status: string;
  outcome: string | null;
};

const actionNames: Record<string, string> = {
  thief: '🥷 سرقت',
  killer: '⚔️ ترور',
  guardian: '🛡️ محافظت',
  spy_role: '👁️ شناسایی نقش',
  spy_key: '👁️ استعلام کلید',
  spy_shop: '👁️ بررسی خریدهای حریف',
  attack: '⚔️ فرمان حمله',
  golden_day: '☀️ روز طلایی',
};

const outcomeNames: Record<string, string> = {
  protected: 'محافظت ثبت شد',
  blocked_by_protection: 'حمله با محافظت خنثی شد',
  guardian_immune: 'محافظ مصون بود',
  commander_penalty_pending_sales: 'سرقت از فرمانده ناموفق شد',
  guardian_penalty_pending_sales: 'ترور محافظ ناموفق شد',
  robbery_success_pending_sales: 'سرقت موفق؛ اثر مالی وابسته به فروش',
  assassination_success_pending_sales: 'ترور موفق؛ اثر مالی وابسته به فروش',
  assassination_failed: 'ترور ناموفق',
  canceled_by_assassination: 'عملیات به دلیل ترور لغو شد',
  awaiting_sales: 'نتیجه مالی وابسته به فروش',
  invalid_target: 'هدف نامعتبر',
};

export default function TeamActivity() {
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function reload() {
      try {
        const r = await fetch('/api/team-activity', { cache: 'no-store' });
        const data = await r.json();
        if (!mounted) return;
        if (!r.ok) { setError(data.error ?? 'دریافت فعالیت‌ها ناموفق بود'); return; }
        setEvents(data.items ?? []);
        setError('');
      } catch {
        if (mounted) setError('ارتباط با گزارش فعالیت‌ها برقرار نشد');
      }
    }
    void reload();
    // Short polling offers near-live team visibility without exposing database rows via RLS.
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 10000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  return (
    <section className="card gv-team-activity" id="gv-team-activity" dir="rtl">
      <h2>⚔️ عملیات تیم و حملات دریافتی</h2>
      <p className="muted">
        ثبت عملیات هم‌تیمی‌ها تقریباً بلافاصله نمایش داده می‌شود.
        نتیجه برای تیم انجام‌دهنده از ساعت ۱۲ و برای بازیکن هدف از ساعت ۱۸ به وقت تهران قابل مشاهده است.
      </p>
      {error && <p className="danger">{error}</p>}
      {events.length === 0 && <p className="muted">هنوز عملیاتی برای نمایش وجود ندارد.</p>}
      {events.map(e => (
        <article key={e.id} className="card" style={{ margin: '9px 0', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong>{actionNames[e.kind] ?? e.kind}</strong>
            <span className="muted">{e.day}</span>
          </div>
          <p style={{ margin: '7px 0' }}>
            <strong>{e.actor}</strong>
            {e.target ? ` ← هدف: ${e.target}` : ' — عملیات تیمی'}
          </p>
          <p className={e.outcome ? 'success mini' : 'muted mini'}>
            {e.outcome ? (outcomeNames[e.outcome] ?? e.outcome) :
              (e.actor_team ? 'نتیجه از ساعت ۱۲ قابل مشاهده است' : 'نتیجه از ساعت ۱۸ قابل مشاهده است')}
          </p>
        </article>
      ))}
    </section>
  );
}
