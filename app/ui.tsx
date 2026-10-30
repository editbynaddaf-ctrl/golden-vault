
'use client';

import { useState } from 'react';

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
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newTeam, setNewTeam] = useState('');

  const [salePlayer, setSalePlayer] = useState('');
  const [saleAmount, setSaleAmount] = useState('');
  const [saleDay, setSaleDay] = useState<'yesterday' | 'today'>(
    'yesterday'
  );
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
        adminActions.includes(action) ? '/api/admin' : '/api/action',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...extra })
        }
      );

      const j = await r.json();
      setMessage(j.error || j.message || 'ثبت شد');

      if (r.ok) {
        setTimeout(() => location.reload(), 1200);
      }
    } catch {
      setMessage('ارتباط با سرور برقرار نشد');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="nav">
        <h1>👑 GOLDEN VAULT</h1>

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
          خروج
        </button>
      </div>

      <p>
        سلام {profile.name} ·{' '}
        {profile.is_admin ? 'مدیر بازی' : team?.name || 'بازیکن'}
      </p>

      {profile.is_admin && (
        <div className="card">
          <h2>🧑‍💼 مدیریت تیم‌ها و حساب بازیکنان</h2>

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
            نام، ایمیل، رمز اولیه و تیم بازیکن را مشخص کن.
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

          <label>رمز عبور اولیه (حداقل ۱۲ کاراکتر)</label>
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
              ساخت مستقیم حساب بازیکن
            </button>
          </p>

          <div className="card">
            <h3>🔍 بررسی علت غیرفعال بودن دکمه</h3>

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
              سیستم آماده پردازش است: {!debug.busy ? '✅' : '❌'}
            </p>

            <p className={canCreatePlayer ? 'success' : 'danger'}>
              {canCreatePlayer
                ? '✅ دکمه باید فعال باشد.'
                : '❌ یک یا چند شرط ساخت حساب کامل نیست.'}
            </p>
          </div>

          <p className="muted">
            {people.length} از ۱۰ بازیکن ثبت‌شده.
            تا قبل از شروع هفته می‌توان حساب ساخت.
          </p>

          {teams.map(t => (
            <div key={t.id}>
              <strong>{t.name}: </strong>
              {people
                .filter(p => p.team_id === t.id)
                .map(p => p.name)
                .join('، ') || 'هنوز بازیکنی ندارد'}
            </div>
          ))}
        </div>
      )}

      {!week ? (
        <div className="card">
          <h2>هنوز هفته فعالی وجود ندارد.</h2>

          {profile.is_admin && (
            <>
              <p>ابتدا دو تیم و تمام ده بازیکن را کامل کن.</p>

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
                        commander: '👑 فرمانده',
                        thief: '🥷 سارق',
                        killer: '⚔️ قاتل',
                        guardian: '🛡️ محافظ',
                        spy: '👁️ جاسوس'
                      } as Record<string, string>
                    )[role || ''] || 'در انتظار قرعه‌کشی'}
              </h2>
            </div>

            <div className="card">
              <span className="muted">خزانه تیم</span>
              <h2>🪙 {myBalance} سکه</h2>
            </div>
          </div>

          <div className="card">
            <h2>🗝️ نقشه ۲۰ کلیدی تیم</h2>

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
              اطلاعات کلیدهای حریف محرمانه است.
            </p>
          </div>

          <div className="card">
            <h2>📣 اطلاعیه‌های عمومی</h2>
            {events.length ? (
              events.map((e, i) => <p key={i}>{e.message}</p>)
            ) : (
              <p>هنوز اطلاعیه‌ای منتشر نشده است.</p>
            )}
          </div>

          {role === 'commander' && (
            <div className="card">
              <h2>👑 اتاق فرماندهی</h2>
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
              <h2>⚡ قدرت ویژه</h2>

              <p>
                {role === 'guardian'
                  ? 'هر روز قبل از ساعت ۱۰ یک نفر از تیم خودت را محافظت کن.'
                  : role === 'spy'
                    ? 'یکی از دو عملیات جاسوسی را انتخاب کن.'
                    : 'یک بار در هفته قبل از ساعت ۱۰ هدف را انتخاب کن.'}
              </p>

              {role === 'spy' ? (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() => act('spy_key')}
                  >
                    آیا حریف کلید را یافته؟
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
                انتخاب فرد{' '}
                {role === 'guardian'
                  ? 'از تیم خودت'
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
              <h2>📊 ثبت فروش هر بازیکن</h2>

              <p className="muted">
                فروش کل یک روز را به میلیون تومان ثبت کن.
                هر یک میلیون، یک سکه پایه.
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

              <label>روز فروش</label>
              <select
                value={saleDay}
                onChange={e =>
                  setSaleDay(e.target.value as 'yesterday' | 'today')
                }
              >
                <option value="yesterday">دیروز</option>
                <option value="today">امروز</option>
              </select>

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
                تارگت روزانه محقق شده (+۵ سکه)
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
                  saleAmount === '' ||
                  !Number.isFinite(Number(saleAmount)) ||
                  Number(saleAmount) < 0
                }
                onClick={() =>
                  act('sale_one', {
                    player_id: salePlayer,
                    day_choice: saleDay,
                    amount_million: Number(saleAmount),
                    target_hit: targetHit,
                    top_seller: topSeller
                  })
                }
              >
                ثبت نهایی فروش این بازیکن
              </button>

              <p className="danger mini">
                توجه: تسویه سرقت، قتل، ریتارگت و فرمان حمله
                هنوز پیاده‌سازی نشده است.
              </p>
            </div>
          )}
        </>
      )}

      {message && <div className="notice">{message}</div>}
    </main>
  );
}
