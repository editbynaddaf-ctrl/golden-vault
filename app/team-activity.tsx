'use client';

import { useEffect, useState } from 'react';
import {actionLabels,operationDescription,statusLabel,operationResults} from './operation-labels';

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
  private_detail: string | null;
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
            <strong>{actionLabels[e.kind] ?? 'عملیات بازی'}</strong>
            <span className="muted">{e.day}</span>
          </div>
          <p style={{ margin: '7px 0' }}>{operationDescription(e.kind,e.actor,e.target)}</p>
          <p className="muted mini">وضعیت: {statusLabel(e.status)}</p>
          {e.private_detail
            ? <p className="success mini">{e.private_detail}</p>
            : e.outcome
              ? operationResults(JSON.stringify({outcome:e.outcome}),'resolved',e.kind)
                  .map((line,i)=><p key={i} className="success mini">{line}</p>)
              : <p className="muted mini">{e.actor_team
                  ? 'نتیجه در زمان اعلام برای تیم شما نمایش داده می‌شود.'
                  : 'نتیجه در زمان اعلام برای بازیکن هدف نمایش داده می‌شود.'}</p>}
        </article>
      ))}
    </section>
  );
}
