'use client';

import { useEffect, useState } from 'react';
import TeamActivity from './team-activity';
type Person = {
  id: string;
  name: string;
  team_id: string | null;
};

type P = {
  profile: {
    id: string;
    name: string;
    team_id: string | null;
    is_admin: boolean;
  };
  week: { id: string; status: string } | null;
  teams: { id: string; name: string }[];
  role: string | null;
  balances: { team_id: string; balance: number }[];
  keys: {
    team_id: string;
    key_number: number;
    result: string;
    kind: string;
  }[];
  events: { message: string }[];
  people: Person[];
};

export default function Dashboard({
  profile,
  week,
  teams,
  role,
  balances,
  keys,
  events,
  people
}: P) {
  const [key, setKey] = useState(1);
  const [finalKey, setFinalKey] = useState(1);
  const [finalInfo, setFinalInfo] = useState<{
    final: { status: string; first_team_id: string; winner_team_id: string | null } | null;
    counts: Record<string, number>;
    total_attempts: number;
    next_team_id: string | null;
    sales?: { team_id: string; amount_million: number }[];
  } | null>(null);
  const [finalError, setFinalError] = useState('');
  const [finalBusy, setFinalBusy] = useState(false);

  async function loadFinal() {
    try {
      const r = await fetch('/api/vault-final', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setFinalError(j.error || 'خطا در دریافت وضعیت فینال'); return; }
      setFinalInfo(j);
      setFinalError('');
    } catch { setFinalError('ارتباط با سرور فینال برقرار نشد'); }
  }
  useEffect(() => { if (week) void loadFinal(); }, [week?.id]);
  async function finalAction(action: 'open_final' | 'attempt_key') {
    setFinalBusy(true);
    setFinalError('');
    try {
      const r = await fetch('/api/vault-final', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(action === 'attempt_key' ? { key_number: finalKey } : {}) })
      });
      const j = await r.json();
      if (!r.ok) setFinalError(j.error || 'عملیات انجام نشد');
      else { setMessage(j.message || 'ثبت شد'); await loadFinal(); }
    } catch { setFinalError('ارتباط با سرور برقرار نشد'); }
    finally { setFinalBusy(false); }
  }

  type RankingRow = {
    id: string;
    name: string;
    team_id: string;
    team_name: string;
    amount_million: number;
    base_coins: number;
    bonus_coins: number;
    earned_coins: number;
    team_rank: number;
  };
  const [rankings, setRankings] = useState<{ self: RankingRow | null; players: RankingRow[] } | null>(null);
  const [rankingError, setRankingError] = useState('');
  async function loadRankings() {
    try {
      const response = await fetch('/api/leaderboard', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setRankingError(data.error ?? 'خطا در دریافت جدول رتبه‌بندی');
        return;
      }
      setRankings(data);
      setRankingError('');
    } catch {
      setRankingError('ارتباط با سرور رتبه‌بندی برقرار نشد');
    }
  }
  useEffect(() => { if (week) void loadRankings(); }, [week?.id]);

  type SettlementDay = { day: string; submitted: number; expected: number; pending_operations: number; round_status: string };
  const [settlementDays, setSettlementDays] = useState<SettlementDay[]>([]);
  const [settlementError, setSettlementError] = useState('');
  const [settlementBusy, setSettlementBusy] = useState(false);
  async function loadSettlementDays() {
    try {
      const r = await fetch('/api/daily-settlement',{cache:'no-store'});
      const j = await r.json();
      if (!r.ok) {setSettlementError(j.error || 'خطا در دریافت گزارش روزانه'); return;}
      setSettlementDays(j.days ?? []); setSettlementError('');
    } catch {setSettlementError('ارتباط با سرویس تسویه برقرار نشد');}
  }
  useEffect(() => {if (profile.is_admin && week) void loadSettlementDays();},[profile.is_admin,week?.id]);
  async function settlementAction(action:'lock_day'|'resolve_day'|'settle_day',day:string) {
    const labels = {lock_day:'قفل عملیات',resolve_day:'پردازش عملیات نقش‌ها',settle_day:'تسویه مالی'};
    if (!window.confirm(`برای ${day}، «${labels[action]}» اجرا شود؟\nاین اقدام می‌تواند وضعیت دیتابیس را تغییر دهد.`)) return;
    setSettlementBusy(true); setSettlementError('');
    try {
      const r=await fetch('/api/daily-settlement',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,day})
      });
      const j=await r.json();
      if (!r.ok) setSettlementError(j.error || 'عملیات انجام نشد');
      else {setMessage(j.message || 'انجام شد'); await loadSettlementDays();}
    } catch {setSettlementError('ارتباط با سرور برقرار نشد');}
    finally {setSettlementBusy(false);}
  }

  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
const [equipment, setEquipment] = useState<{
  id: string;
  code: string;
  status: string;
  purchased_at: string;
  activation_day: string | null;
  used_at: string | null;
  result_private: Record<string, unknown> | null;
}[]>([]);
const [intelKeys, setIntelKeys] = useState<Record<string, number[]>>({});

useEffect(() => {
  if (role !== 'commander') return;

  async function loadEquipment() {
    try {
      const response = await fetch('/api/shop');
      if (!response.ok) return;

      const data = await response.json();
      setEquipment(data.equipment ?? []);
    } catch {
      // خطای ارتباط موقت
    }
  }

  loadEquipment();
}, [role]);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newTeam, setNewTeam] = useState('');

  const [salePlayer, setSalePlayer] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [salesSummary, setSalesSummary] = useState<{
    week_start: string | null;
    days: {day:string;submitted:number;expected:number;round_status:string}[];
  } | null>(null);
  const [salesSummaryError,setSalesSummaryError] = useState('');
  useEffect(() => {
    if (!profile.is_admin || !week) return;
    fetch('/api/admin',{cache:'no-store'}).then(async r=>{
      const j=await r.json();
      if(!r.ok)throw new Error(j.error || 'خطا در گزارش فروش');
      setSalesSummary(j);
      setSaleDate(prev=>prev || j.days?.[j.days.length-1]?.day || '');
    }).catch(e=>setSalesSummaryError(String(e.message || e)));
  },[profile.is_admin,week?.id]);
  const [targetHit, setTargetHit] = useState(false);
  const [topSeller, setTopSeller] = useState(false);

  const team = teams.find(t => t.id === profile.team_id);
  const myKeys = keys.filter(k => k.team_id === profile.team_id);
  const myBalance =
    balances.find(b => b.team_id === profile.team_id)?.balance ?? 0;

  const rivals = people.filter(p => p.team_id !== profile.team_id);
  const allies = people.filter(p => p.team_id === profile.team_id);

  const estimated =
    Math.floor(Number(saleAmount) || 0) +
    (targetHit ? 5 : 0) +
    (topSeller ? 10 : 0);

  const debug = {
    name: !!newName.trim(),
    email: !!newEmail.trim(),
    password: newPassword.length >= 12,
    team: !!newTeam,
    week: !!week,
    busy
  };

  const canCreatePlayer =
    debug.name &&
    debug.email &&
    debug.password &&
    debug.team &&
    !debug.week &&
    !debug.busy;

  async function act(
    action: string,
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    setMessage('');

    try {
      const adminActions = [
        'create_teams',
        'create_player',
        'sale_one',
        'start_week'
      ];
const r = await fetch(
  ['buy_equipment', 'activate_shield', 'activate_key_intel'].includes(action)
    ? '/api/shop'
    : adminActions.includes(action)
      ? '/api/admin'
      : '/api/action',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  }
);
   
      const j = await r.json();
      setMessage(j.error || j.message || 'ثبت شد');

      if (r.ok) {
        if (action === 'activate_key_intel') {
          const response = await fetch('/api/shop');
          if (response.ok) {
            const data = await response.json();
            setEquipment(data.equipment ?? []);
          }
        } else {
          setTimeout(() => location.reload(), 1200);
        }
      }
    } catch {
      setMessage('ارتباط با سرور برقرار نشد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gv-royal-shell" id="gv-dashboard" dir="rtl">
      <aside className="gv-royal-sidebar" aria-label="منوی اصلی">
        <div className="gv-brand"><span className="gv-brand-symbol">♛</span><div>GOLDEN <em>VAULT</em><small>بازی استراتژیک فروش</small></div></div>
        <nav className="gv-menu">
          <a href="#gv-dashboard"><span>⌂</span> داشبورد</a>
          <a href="#gv-player"><span>♜</span> تیم و نقش</a>
          <a href="#gv-vault"><span>⚿</span> کلیدهای صندوق</a>
          <a href="#gv-command"><span>⚒</span> عملیات و فروشگاه</a>
          <a href="#gv-events"><span>✦</span> رویدادها</a>
        </nav>
        <div className="gv-side-note">GOLDEN VAULT <strong>بازی فعال</strong><span>عملیات ساعت ۱۰ صبح به وقت تهران قفل می‌شود</span></div>
      </aside>
      <main className="gv-royal-main">

      <div className="nav gv-topnav">
        <h1>⚜ GOLDEN VAULT</h1>

        <a href="/change-password" className="btn">🔐 تغییر رمز عبور</a>
<button
          onClick={async () => {
            const { createBrowserClient } = await import('@supabase/ssr');
            const db = createBrowserClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            await db.auth.signOut();
            location.href = '/login';
          }}
        >
          خروج از حساب
        </button>
      </div>

      <section className="gv-hero" id="gv-player">
        <div className="gv-hero-copy">
          <span className="gv-eyebrow">♛ نقش محرمانه شما</span>
          <h2>{profile.is_admin ? 'مدیر بازی' : ({commander:'فرمانده',thief:'سارق',killer:'قاتل',guardian:'محافظ',spy:'جاسوس'} as Record<string,string>)[role || ''] || 'بازیکن'}</h2>
          <p>{profile.is_admin ? 'مدیریت رقابت و برگزاری مراسم نهایی صندوق' : 'استراتژی، رقابت و یک صندوق طلایی برای فتح کردن'}</p>
          <span className="gv-hero-team">⚜ {team?.name || 'Golden Vault'}</span>
        </div>
        <div className="gv-hero-crest" aria-hidden="true">♛</div>
      </section>
      <p>
        سلام، {profile.name} ·{' '}
        {profile.is_admin ? 'مدیر بازی' : team?.name || 'بازیکن'}
      </p>

      {profile.is_admin && (
        <div className="card">
          <h2 id="gv-command">⚙ مدیریت تیم‌ها و حساب بازیکنان</h2>

          {teams.length === 0 ? (
            <button disabled={busy} onClick={() => act('create_teams')}>
              ساخت تیم امیرعلی و تیم میلاد
            </button>
          ) : (
            <p className="success">
              تیم‌ها: {teams.map(t => t.name).join(' | ')}
            </p>
          )}

          <p className="muted">
            نام، ایمیل، رمز اولیه و تیم بازیکن را مشخص کنید.
            حساب بدون دعوت‌نامه ساخته می‌شود.
          </p>

          <label>نام بازیکن</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="مثلاً یگانه"
          />

          <label>ایمیل بازیکن</label>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="player@example.com"
          />

          <label>رمز اولیه (حداقل ۱۲ کاراکتر)</label>
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="یک رمز قوی و اختصاصی"
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              style={{ width: 'auto' }}
              type="checkbox"
              checked={showPassword}
              onChange={e => setShowPassword(e.target.checked)}
            />
            نمایش رمز عبور
          </label>

          <label>تیم</label>
          <select
            value={newTeam}
            onChange={e => setNewTeam(e.target.value)}
          >
            <option value="">انتخاب تیم</option>
            {teams.map(t => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <p>
            <button
              disabled={!canCreatePlayer}
              onClick={() =>
                act('create_player', {
                  name: newName,
                  email: newEmail,
                  password: newPassword,
                  team_id: newTeam
                })
              }
            >
              ساخت حساب بازیکن
            </button>
          </p>

          <div className="card">
            <h3>🔍 بررسی شرایط ساخت حساب</h3>

            <p>نام وارد شده: {debug.name ? '✅' : '❌'}</p>
            <p>ایمیل وارد شده: {debug.email ? '✅' : '❌'}</p>
            <p>
              رمز حداقل ۱۲ کاراکتر: {debug.password ? '✅' : '❌'}
            </p>
            <p>تیم انتخاب شده: {debug.team ? '✅' : '❌'}</p>
            <p>
              هفته فعال وجود ندارد: {!debug.week ? '✅' : '❌'}
            </p>
            <p>
              آماده ثبت: {!debug.busy ? '✅' : '❌'}
            </p>

            <p className={canCreatePlayer ? 'success' : 'danger'}>
              {canCreatePlayer
                ? '✅ آماده ساخت حساب بازیکن'
                : '❌ ابتدا تمام شرایط را کامل کنید'}
            </p>
          </div>

          <p className="muted">
            {people.length} بازیکن از ۱۰ بازیکن ثبت‌شده.
            حساب‌ها را می‌توان قبل از شروع هفته ایجاد کرد.
          </p>

          {teams.map(t => (
            <div key={t.id}>
              <strong>{t.name}: </strong>
              {people
                .filter(p => p.team_id === t.id)
                .map(p => p.name)
                .join('، ') || 'هنوز بازیکنی ثبت نشده'}
            </div>
          ))}
        </div>
      )}

      {!week ? (
        <div className="card">
          <h2>هنوز هفته فعالی برای بازی وجود ندارد.</h2>

          {profile.is_admin && (
            <>
              <p>ابتدا دو تیم و هر ده بازیکن را ثبت کنید.</p>

              <button
                disabled={
                  busy ||
                  people.length !== 10 ||
                  teams.length !== 2 ||
                  teams.some(
                    t =>
                      people.filter(p => p.team_id === t.id).length !== 5
                  )
                }
                onClick={() => act('start_week')}
              >
                شروع هفته و قرعه‌کشی نقش‌ها
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <span className="muted">نقش محرمانه شما</span>
              <h2>
                {profile.is_admin
                  ? 'مدیر بازی'
                  : (
                      {
                        commander: '♛ فرمانده',
                        thief: '🥷 سارق',
                        killer: '⚔️ قاتل',
                        guardian: '🛡️ محافظ',
                        spy: '👁️ جاسوس'
                      } as Record<string, string>
                    )[role || ''] || 'در انتظار قرعه‌کشی نقش‌ها'}
              </h2>
            </div>

            <div className="card">
              <span className="muted">خزانه تیم</span>
              <h2>🪙 {myBalance} سکه</h2>
            </div>
          </div>

          {(profile.is_admin || role === 'commander') && (
            <div className="card">
              <h2>🏆 مراسم نهایی صندوق طلایی</h2>
              {finalError && <p className="danger">{finalError}</p>}
              {!finalInfo?.final ? (
                <>
                  <p className="muted">مراسم نهایی هنوز آغاز نشده است.</p>
                  {profile.is_admin && (
                    <>
                      <p>فروش ثبت‌شده (میلیون تومان):</p>
                      {(finalInfo?.sales ?? []).map(sale => (
                        <p key={sale.team_id}>{teams.find(t => t.id === sale.team_id)?.name ?? 'تیم'}: {sale.amount_million}</p>
                      ))}
                      <p className="muted">مراسم نهایی از پنجشنبه و بعد از تسویه کامل روزها قابل شروع است.</p>
                      <button disabled={finalBusy} onClick={() => {
                        if (window.confirm('مراسم فینال صندوق شروع شود؟')) void finalAction('open_final');
                      }}>🎬 شروع مراسم نهایی</button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p>وضعیت: {finalInfo.final.status === 'open' ? '🔓 مراسم در جریان است' : finalInfo.final.status === 'won' ? '🏆 صندوق باز شد' : '📦 جایزه به هفته بعد منتقل شد'}</p>
                  <p>تیم آغازکننده: {teams.find(t => t.id === finalInfo.final?.first_team_id)?.name ?? 'نامشخص'}</p>
                  <p>تلاش‌ها: {finalInfo.total_attempts} از ۶</p>
                  {teams.map(t => <p key={t.id}>{t.name}: {finalInfo.counts[t.id] ?? 0} از ۳ تلاش</p>)}
                  {finalInfo.final.status === 'won' && <p className="success">برنده: {teams.find(t => t.id === finalInfo.final?.winner_team_id)?.name ?? 'تیم برنده'}</p>}
                  {finalInfo.final.status === 'open' && (
                    <>
                      <p>نوبت فعلی: {teams.find(t => t.id === finalInfo.next_team_id)?.name ?? 'نامشخص'}</p>
                      {role === 'commander' && profile.team_id === finalInfo.next_team_id && (
                        <>
                          <label>شماره کلید فینال</label>
                          <select value={finalKey} onChange={e => setFinalKey(Number(e.target.value))}>
                            {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <button disabled={finalBusy} onClick={() => {
                            if (window.confirm(`تلاش با کلید ${finalKey} ثبت شود؟ این تلاش از سهمیه فینال کم می‌کند.`))
                              void finalAction('attempt_key');
                          }}>🗝️ امتحان کلید صندوق</button>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <button disabled={finalBusy} onClick={() => void loadFinal()}>↻ به‌روزرسانی وضعیت فینال</button>
            </div>
          )}

          <div className="card">
            <h2>🏅 سکه‌های فروش و رتبه‌بندی</h2>
            <p className="muted">مخصوص هفته فعال؛ شامل سکه‌های پایه فروش و پاداش تارگت و تاپ‌سلر، بدون محاسبه خریدها و انتقال سکه.</p>
            {rankingError && <p className="danger">{rankingError}</p>}
            {!profile.is_admin && rankings?.self && (
              <div className="card">
                <h3>🪙 {rankings.self.earned_coins} سکه کسب‌شده توسط شما</h3>
                <p>رتبه شما در تیم: <strong>{rankings.self.team_rank} / 5</strong></p>
                <p>فروش ثبت‌شده: {rankings.self.amount_million} میلیون تومان</p>
                <p>سکه پایه: {rankings.self.base_coins} · پاداش‌ها: {rankings.self.bonus_coins}</p>
              </div>
            )}
            {profile.is_admin && (
              <>
                {teams.map(t => (
                  <div key={t.id} className="card">
                    <h3>{t.name}</h3>
                    {rankings?.players.filter(p => p.team_id === t.id).map(p => (
                      <p key={p.id}>
                        <strong>رتبه {p.team_rank} · {p.name}</strong> — {p.earned_coins} سکه
                        <span className="muted"> (پایه {p.base_coins} + پاداش {p.bonus_coins}؛ فروش {p.amount_million} میلیون)</span>
                      </p>
                    ))}
                  </div>
                ))}
              </>
            )}
            <button onClick={() => void loadRankings()}>↻ به‌روزرسانی رتبه‌بندی</button>
          </div>

          {profile.is_admin && (
            <div className="card">
              <h2>🧾 مدیریت تسویه روزانه</h2>
              <p className="muted">بعد از ساعت ۱۰ صبح تهران، عملیات روز را قفل کنید، نقش‌ها را پردازش کنید و پس از ثبت فروش هر ۱۰ نفر تسویه را انجام دهید. ابتدا روزهای قدیمی‌تر را رسیدگی کنید.</p>
              {settlementError && <p className="danger">{settlementError}</p>}
              {settlementDays.map(d => (
                <div key={d.day} className="card">
                  <strong>{d.day}</strong>
                  <p>فروش ثبت‌شده: {d.submitted} از {d.expected} نفر</p>
                  <p>وضعیت: {d.round_status === 'settled' ? '✅ تسویه شده' : d.round_status === 'locked' ? '🔒 قفل شده' : '⏳ قفل نشده'}</p>
                  <p>عملیات در انتظار: {d.pending_operations}</p>
                  {d.round_status !== 'settled' && <div className="actions">
                    {d.round_status !== 'locked' && <button disabled={settlementBusy} onClick={() => void settlementAction('lock_day',d.day)}>🔒 قفل کردن روز</button>}
                    {d.round_status === 'locked' && <button disabled={settlementBusy} onClick={() => void settlementAction('resolve_day',d.day)}>⚔️ پردازش نقش‌ها</button>}
                    {d.round_status === 'locked' && d.submitted === d.expected && d.pending_operations === 0 &&
                      <button disabled={settlementBusy} onClick={() => void settlementAction('settle_day',d.day)}>🪙 تسویه سکه‌ها</button>}
                  </div>}
                </div>
              ))}
              <button disabled={settlementBusy} onClick={() => void loadSettlementDays()}>↻ به‌روزرسانی وضعیت روزها</button>
              <p className="muted">پایگاه داده قبل از اعمال تغییرات، شرایط تسویه را بررسی می‌کند.</p>
            </div>
          )}

          <div className="card">
            <h2 id="gv-vault">⚿ صندوق تیم · ۲۰ کلید</h2>

            <div className="keys">
              {Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
                const k = myKeys.find(k => k.key_number === n);

                return (
                  <div
                    className={
                      'key ' +
                      (k?.result === 'correct'
                        ? 'correct'
                        : k
                          ? 'wrong'
                          : '')
                    }
                    key={n}
                  >
                    {k?.result === 'correct'
                      ? '✓ '
                      : k
                        ? '✕ '
                        : '🔑 '}
                    {n}
                  </div>
                );
              })}
            </div>

            <p className="mini">
              اطلاعات کلیدهای تیم حریف محرمانه می‌ماند.
            </p>
          </div>

          <div className="card">
            <h2 id="gv-events">✦ اطلاعیه‌های عمومی</h2>
            {events.length ? (
              events.map((e, i) => <p key={i}>{e.message}</p>)
            ) : (
              <p>هنوز اطلاعیه‌ای منتشر نشده است.</p>
            )}
          </div>

          {role === 'commander' && (
            <div className="card">
              <h2 id="gv-command">♛ اتاق فرماندهی</h2>
              
<div className="card">
  <div className="card">
  <h3>📦 انبار تجهیزات تیم</h3>

  {equipment.length === 0 ? (
    <p className="muted">هنوز تجهیزی خریداری نشده است.</p>
  ) : (
    equipment.map(item => (
      <div className="card" key={item.id}>
        <strong>
          {{
            team_shield: '🛡️ سپر تیمی',
            key_duel: '⚔️ دوئل کلیدها',
            three_key_scanner: '🔍 اسکنر سه کلید',
            parity_oracle: '🔮 گوی پیشگو'
          }[item.code] ?? item.code}
        </strong>

        <p>
          وضعیت: {
            item.status === 'owned'
              ? '📦 آماده فعال‌سازی'
              : item.status === 'scheduled'
                ? '⏳ برنامه‌ریزی شده'
                : '✅ مصرف شده'
          }
        </p>

{item.code === 'team_shield' && item.status === 'owned' && (
  <button
    disabled={busy}
    onClick={() => {
      if (
        window.confirm(
          'سپر محافظ برای امروز فعال شود؟ این عملیات فقط قبل از ساعت ۱۰ صبح تهران و از روز بعد خرید مجاز است.'
        )
      ) {
        act('activate_shield', { equipment_id: item.id });
      }
    }}
  >
    🛡️ فعال‌سازی سپر برای امروز
  </button>
)}


        {item.status === 'owned' && ['key_duel', 'three_key_scanner', 'parity_oracle'].includes(item.code) && (
          <div>
            {item.code !== 'parity_oracle' && (
              <div>
                <p className="muted">شماره کلیدها را انتخاب کنید:</p>
                {Array.from({ length: item.code === 'key_duel' ? 2 : 3 }, (_, index) => (
                  <label key={index}>
                    کلید {index + 1}
                    <select
                      value={(intelKeys[item.id] ?? [])[index] ?? ''}
                      onChange={e => setIntelKeys(previous => {
                        const next = [...(previous[item.id] ?? [])];
                        next[index] = Number(e.target.value);
                        return { ...previous, [item.id]: next };
                      })}
                    >
                      <option value="">انتخاب کنید</option>
                      {Array.from({ length: 20 }, (_, k) => k + 1).map(n => (
                        <option value={n} key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <button
              disabled={busy || (() => {
                const selected = intelKeys[item.id] ?? [];
                const required = item.code === 'key_duel' ? 2 : item.code === 'three_key_scanner' ? 3 : 0;
                return Array.from({ length: required }, (_, i) => selected[i]).some(n => !Number.isInteger(n) || n < 1 || n > 20) ||
                  new Set(Array.from({ length: required }, (_, i) => selected[i])).size !== required;
              })()}
              onClick={() => {
                if (window.confirm('این تجهیز فقط یک بار مصرف می‌شود. فعال شود؟')) {
                  act('activate_key_intel', {
                    equipment_id: item.id,
                    keys: item.code === 'parity_oracle' ? [] : (intelKeys[item.id] ?? [])
                  });
                }
              }}
            >
              🔍 فعال‌سازی و مشاهده نتیجه
            </button>
          </div>
        )}

        {item.status === 'used' && item.result_private && (
          <div className="card">
            <strong>🔐 نتیجه محرمانه</strong>
            {item.code === 'parity_oracle' && (
              <p>شماره کلید اصلی {item.result_private.parity === 'even' ? 'زوج' : 'فرد'} است.</p>
            )}
            {item.code === 'three_key_scanner' && (
              <p>کلید اصلی {item.result_private.winning_key_among_selected === true
                ? 'بین سه کلید انتخابی هست ✅' : 'بین سه کلید انتخابی نیست ❌'}</p>
            )}
            {item.code === 'key_duel' && (
              <p>{item.result_private.equal_distance === true
                ? 'فاصله دو کلید انتخابی تا کلید اصلی یکسان است.'
                : `کلید شماره ${String(item.result_private.closer_key ?? 'نامشخص')} نزدیک‌تر است.`}</p>
            )}
          </div>
        )}

        {item.activation_day && (
          <p>تاریخ فعال‌سازی: {item.activation_day}</p>
        )}
      </div>
    ))
  )}
</div>
  <h3>🛒 فروشگاه تجهیزات</h3>

  <p className="muted">
    خرید تجهیزات در تمام ساعات ممکن است. هر تیم در هر هفته از هر نوع تجهیز فقط یک بار می‌تواند خرید کند.
  </p>

  {[
    { code: 'team_shield', title: '🛡️ سپر تیمی', price: 30 },
    { code: 'key_duel', title: '⚔️ دوئل کلیدها', price: 60 },
    { code: 'three_key_scanner', title: '🔍 اسکنر سه کلید', price: 70 },
    { code: 'parity_oracle', title: '🔮 گوی پیشگو', price: 90 },
  ].map(item => (
    <div className="card" key={item.code}>
      <strong>{item.title}</strong>
      <p>{item.price} سکه</p>

      <button
        disabled={busy}
        onClick={() => {
          if (window.confirm(
            `آیا می‌خواهید ${item.title} را با ${item.price} سکه بخرید؟`
          )) {
            act('buy_equipment', { code: item.code });
          }
        }}
      >
        خرید تجهیز
      </button>
    </div>
  ))}
</div>

              <label>شماره کلید</label>

              <select
                value={key}
                onChange={e => setKey(Number(e.target.value))}
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>

              <div className="actions" style={{ marginTop: 15 }}>
                <button
                  disabled={busy}
                  onClick={() => act('test_key', { key })}
                >
                  آزمایش کلید · ۵۰ سکه
                </button>

                <button
                  disabled={busy}
                  onClick={() => act('eliminate_key')}
                >
                  حذف کلید اشتباه · ۳۰ سکه
                </button>

                <button disabled={busy} onClick={() => act('attack')}>
                  فرمان حمله
                </button>
              </div>
            </div>
          )}

          {['thief', 'killer', 'guardian', 'spy'].includes(role || '') && (
            <div className="card">
              <h2 id="gv-command">⚡ قدرت ویژه شما</h2>

              <p>
                {role === 'guardian'
  ? 'هر روز قبل از ساعت ۱۰ صبح تهران از یکی از هم‌تیمی‌ها محافظت کنید.'
  : role === 'spy'
    ? 'حداکثر سه نقش حریف را در هفته و روزی یک بار شناسایی کنید. استعلام کلید و تجهیزات سهمیه جداگانه دارند.'
    : role === 'thief'
      ? 'حداکثر پنج تلاش برای سرقت در هفته، روزی یک بار و قبل از ساعت ۱۰ صبح.'
      : role === 'killer'
        ? 'حداکثر سه تلاش برای ترور در هفته، روزی یک بار و قبل از ساعت ۱۰ صبح.'
        : ''}
              </p>

              {role === 'spy' ? (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => act('spy_key')}
                  >
                    آیا حریف کلید را پیدا کرده است؟
                  </button>

                  <button
                    disabled={busy || !target}
                    onClick={() =>
                      act('spy_role', { target_id: target })
                    }
                  >
                    شناسایی نقش
                  </button>
                </div>
              ) : (
                <button
                  disabled={busy || !target}
                  onClick={() =>
                    act(role || '', { target_id: target })
                  }
                >
                  ثبت عملیات محرمانه
                </button>
              )}

              <label>
                انتخاب بازیکن{' '}
                {role === 'guardian'
                  ? 'از تیم خودتان'
                  : 'از تیم حریف'}
              </label>

              <select
                value={target}
                onChange={e => setTarget(e.target.value)}
              >
                <option value="">انتخاب کنید</option>
                {(role === 'guardian' ? allies : rivals).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {profile.is_admin && (
            <div className="card">
              <h2>📊 ثبت فروش بازیکنان</h2>

              <p className="muted">
                فروش روزانه را به میلیون تومان وارد کنید. هر یک میلیون تومان فروش، یک سکه پایه ایجاد می‌کند.
              </p>

              <label>بازیکن</label>
              <select
                value={salePlayer}
                onChange={e => setSalePlayer(e.target.value)}
              >
                <option value="">انتخاب بازیکن</option>

                {people.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} —{' '}
                    {teams.find(t => t.id === p.team_id)?.name}
                  </option>
                ))}
              </select>

              <h3>📆 وضعیت فروش روزانه</h3>
              {salesSummaryError && <p className="danger">{salesSummaryError}</p>}
              {(salesSummary?.days ?? []).map(d=>(
                <p key={d.day}>
                  {d.day}: {d.submitted} از {d.expected} فروش ثبت‌شده ·
                  {d.round_status==='settled'?' ✅ تسویه شده':
                    d.round_status==='locked'?' 🔒 قفل شده':' ⏳ تسویه نشده'}
                </p>
              ))}
              <p className="mini">برای بازیکنان بدون فروش، عدد صفر را ثبت کنید. پایگاه داده جلوی ثبت تکراری را می‌گیرد.</p>
              <label>تاریخ فروش</label>
              <input type="date" value={saleDate}
                min={salesSummary?.week_start ?? undefined}
                max={salesSummary?.days?.[salesSummary.days.length-1]?.day ?? undefined}
                onChange={e=>setSaleDate(e.target.value)}/>
              <p className="muted">تاریخ را از هفته فعال انتخاب کن. برای جلوگیری از خطای تبدیل تاریخ، ذخیره در پایگاه داده به میلادی انجام می‌شود.</p>

              <label>مجموع فروش (میلیون تومان)</label>
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={saleAmount}
                onChange={e => setSaleAmount(e.target.value)}
                placeholder="مثلاً 25"
              />

              <label
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <input
                  style={{ width: 'auto' }}
                  type="checkbox"
                  checked={targetHit}
                  onChange={e => setTargetHit(e.target.checked)}
                />
                تارگت روزانه محقق شد (+۵ سکه)
              </label>

              <label
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <input
                  style={{ width: 'auto' }}
                  type="checkbox"
                  checked={topSeller}
                  onChange={e => setTopSeller(e.target.checked)}
                />
                تاپ‌سلر روز (+۱۰ سکه)
              </label>

              <p>
                🪙 سکه این ثبت: <strong>{estimated}</strong>
              </p>

              <button
                disabled={
                  busy ||
                  !salePlayer ||
                  !saleDate ||
                  saleAmount === '' ||
                  !Number.isFinite(Number(saleAmount)) ||
                  Number(saleAmount) < 0
                }
                onClick={() =>
                  act('sale_one', {
                    player_id: salePlayer,
                    sale_date: saleDate,
                    amount_million: Number(saleAmount),
                    target_hit: targetHit,
                    top_seller: topSeller
                  })
                }
              >
                ثبت فروش بازیکن
              </button>

              <p className="danger mini">
                توجه: تسویه سرقت، قتل، ریتارگت و فرمان حمله
                هنوز پیاده‌سازی نشده است.
              </p>
            </div>
          )}
        </>
      )}

      {!profile.is_admin && week && <TeamActivity />}

      {message && <div className="notice">{message}</div>}
      </main>
      <nav className="gv-mobile-dock" aria-label="منوی موبایل">
        <a href="#gv-dashboard"><span>⌂</span>خانه</a>
        <a href="#gv-player"><span>♜</span>تیم</a>
        <a href="#gv-command"><span>⚒</span>عملیات</a>
        <a href="#gv-vault"><span>⚿</span>صندوق</a>
      </nav>
    </div>
  );
}
