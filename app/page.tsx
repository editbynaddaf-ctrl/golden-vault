import LogoutButton from "./logout-button";

import {redirect} from 'next/navigation';
import {serverDb} from '../lib/supabase';
import Dashboard from './ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const db = await serverDb();

  const {data: {user}} = await db.auth.getUser();

  if (!user) redirect('/login');

  const {data: profile} = await db
    .from('profiles')
    .select('id,name,team_id,is_admin')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return (
  <main dir="ltr" style={{ padding: 32, textAlign: "center" }}>
    <p>Your account has not been assigned to the game yet.</p>
    <LogoutButton />
  </main>
);
  }

  const {data: weekData, error: weekError} =
    await db.rpc('current_week_safe');

  if (weekError) {
    return <main>خطا در دریافت وضعیت هفته: {weekError.message}</main>;
  }

  // Supabase can return an empty array when no week exists.
  const week = Array.isArray(weekData)
    ? (weekData[0] ?? null)
    : (weekData ?? null);

  const {data: teams} = await db
    .from('teams')
    .select('id,name');

  const {data: people} = await db
    .from('profiles')
    .select('id,name,team_id')
    .eq('is_admin', false);

  const {data: roles} = week
    ? await db.from('assignments')
        .select('role')
        .eq('week_id', week.id)
        .eq('user_id', user.id)
        .limit(1)
    : {data: []};

  const {data: balances} = week
    ? await db.from('team_balances')
        .select('team_id,balance')
        .eq('week_id', week.id)
    : {data: []};

  const {data: keys} = week
    ? await db.from('key_checks')
        .select('team_id,key_number,result,kind')
        .eq('week_id', week.id)
    : {data: []};

  const {data: events} = week
    ? await db.from('announcements')
        .select('message')
        .eq('week_id', week.id)
        .order('created_at', {ascending: false})
        .limit(8)
    : {data: []};

  return (
    <Dashboard
      profile={profile}
      week={week ? {id: week.id, status: week.status} : null}
      teams={teams || []}
      role={roles?.[0]?.role || null}
      balances={balances || []}
      keys={keys || []}
      events={events || []}
      people={people || []}
    />
  );
}
