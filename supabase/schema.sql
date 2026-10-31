-- Shiftbuck database for Supabase.
-- Run this once in Supabase → SQL Editor → New query.
--
-- Every Shiftbuck document (settings, shifts, payslips, spending, holiday…) is one row.
-- path   = the document's full path, e.g. data/users/<user id>/main/shifts/2026-10-27
-- parent = the collection it sits in,  e.g. data/users/<user id>/main/shifts

create table if not exists public.documents (
  path        text primary key,
  parent      text not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  -- a document must live under its owner's own folder
  constraint path_belongs_to_owner check (path like 'data/users/' || user_id::text || '/%')
);

-- Cap each document at 256 KB so one account can't fill the database. Real documents are a few KB.
do $$ begin
  alter table public.documents add constraint documents_size_limit check (pg_column_size(data) <= 262144);
exception when duplicate_object then null;
end $$;

create index if not exists documents_parent_idx on public.documents (parent, path);
create index if not exists documents_user_idx   on public.documents (user_id);

-- Row-level security: people can only ever see and change their own rows.
alter table public.documents enable row level security;

drop policy if exists "read own documents"   on public.documents;
drop policy if exists "add own documents"    on public.documents;
drop policy if exists "change own documents" on public.documents;
drop policy if exists "delete own documents" on public.documents;

create policy "read own documents"   on public.documents for select using (user_id = auth.uid());
create policy "add own documents"    on public.documents for insert with check (user_id = auth.uid());
create policy "change own documents" on public.documents for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own documents" on public.documents for delete using (user_id = auth.uid());

-- Live updates between a person's own devices.
do $$ begin
  alter publication supabase_realtime add table public.documents;
exception when duplicate_object then null;
end $$;

-- "Delete my account": removes the person's sign-in and, through the cascade, all their documents.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.documents where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================================
-- Carers' community
-- People only ever see nicknames. Nobody can read the tables directly: posts are read through
-- the community_feed view (which leaves out user ids) and changed through the functions below.
-- ============================================================================

create table if not exists public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  nickname    text not null check (nickname ~ '^[A-Za-z0-9_]{3,20}$'),
  area        text check (char_length(area) <= 60),
  space       text not null check (space in ('pay', 'rights', 'rest', 'meet', 'general')),
  body        text not null check (char_length(body) between 1 and 1000),
  reply_to    uuid references public.community_posts (id) on delete cascade,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);

create table if not exists public.community_reports (
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('person', 'details', 'abuse', 'spam', 'other')),
  created_at  timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

-- Add moderators by hand: insert into public.community_moderators (user_id) values ('<their user id>');
create table if not exists public.community_moderators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Public profiles: the only things other carers see are the nickname and the area.
create table if not exists public.community_profiles (
  id            uuid primary key default gen_random_uuid(),   -- the public id other carers see, never the user id
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  nickname      text not null check (nickname ~ '^[A-Za-z0-9_]{3,20}$'),
  area          text check (char_length(area) <= 60),
  dm_open       boolean not null default true,                 -- "let carers message me"
  dm_restricted boolean not null default false,                -- set by a moderator: can't send private messages
  created_at    timestamptz not null default now()
);
create unique index if not exists community_profiles_nick_idx on public.community_profiles (lower(nickname));

-- Row-level security on with no policies: no direct reads or writes for anyone signed in.
alter table public.community_profiles   enable row level security;
alter table public.community_posts      enable row level security;
alter table public.community_reports    enable row level security;
alter table public.community_moderators enable row level security;

create or replace function public.community_is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.community_moderators where user_id = auth.uid());
$$;

-- The feed: nickname, area and post, plus "mine". Never the user id. Hidden posts only show to
-- their author and to moderators. (This view runs as its owner on purpose, so it can read the table.)
create or replace view public.community_feed as
  select p.id, p.nickname, p.area, p.space, p.body, p.reply_to, p.created_at, p.hidden,
         (p.user_id = auth.uid()) as mine,
         (select pr.id from public.community_profiles pr where pr.user_id = p.user_id) as author_id
  from public.community_posts p
  where auth.uid() is not null
    and (not p.hidden or p.user_id = auth.uid() or public.community_is_moderator());
revoke all on public.community_feed from public, anon;
grant select on public.community_feed to authenticated;

-- Posts always go out under the poster's own profile. p_nickname and p_area are only used to create that
-- profile on a first post (which fails if the nickname is someone else's), so nobody can post as another carer.
create or replace function public.community_post(p_space text, p_body text, p_reply_to uuid, p_nickname text, p_area text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; parent_space text; me public.community_profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into me from public.community_profiles where user_id = auth.uid();
  if me.id is null then
    perform public.community_upsert_profile(p_nickname, p_area);
    select * into me from public.community_profiles where user_id = auth.uid();
  end if;
  if (select count(*) from public.community_posts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many posts. Try again later.';
  end if;
  if p_reply_to is not null then
    select space into parent_space from public.community_posts where id = p_reply_to and not hidden;
    if parent_space is null then raise exception 'That post is no longer available'; end if;
    p_space := parent_space;
  end if;
  insert into public.community_posts (user_id, nickname, area, space, body, reply_to)
  values (auth.uid(), me.nickname, me.area, p_space, trim(p_body), p_reply_to)
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.community_delete(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.community_posts where id = p_id and user_id = auth.uid();
$$;

-- Three reports from different people hide a post until a moderator looks at it.
create or replace function public.community_report(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.community_reports (post_id, reporter_id, reason) values (p_id, auth.uid(), p_reason)
  on conflict (post_id, reporter_id) do update set reason = excluded.reason;
  if (select count(*) from public.community_reports where post_id = p_id) >= 3 then
    update public.community_posts set hidden = true where id = p_id;
  end if;
end; $$;

create or replace function public.community_reports()
returns table (post_id uuid, reason text, reports bigint) language sql stable security definer set search_path = public as $$
  select r.post_id, r.reason, count(*) from public.community_reports r
  where public.community_is_moderator()
  group by r.post_id, r.reason;
$$;

create or replace function public.community_hide(p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.community_is_moderator() then raise exception 'Moderators only'; end if;
  update public.community_posts set hidden = p_hidden where id = p_id;
end; $$;

revoke all on function public.community_post(text, text, uuid, text, text), public.community_delete(uuid),
  public.community_report(uuid, text), public.community_reports(), public.community_hide(uuid, boolean),
  public.community_is_moderator() from public, anon;
grant execute on function public.community_post(text, text, uuid, text, text), public.community_delete(uuid),
  public.community_report(uuid, text), public.community_reports(), public.community_hide(uuid, boolean),
  public.community_is_moderator() to authenticated;

-- ============================================================================
-- Profiles, private messages, messages to the Shiftbuck team, announcements
--
-- * Other carers see a profile's nickname and area, through the community_people view. Never the user id.
-- * A private message can only be read by the two carers in the conversation. If the person who received
--   it reports it, moderators can read that one message so they can act on it.
-- * Messages to the Shiftbuck team are read only by the carer and the team (the community_moderators table).
-- * Every table has row-level security on and no policies: all access goes through the functions below.
-- ============================================================================

create table if not exists public.dm_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists dm_messages_sender_idx    on public.dm_messages (sender_id, created_at desc);
create index if not exists dm_messages_recipient_idx on public.dm_messages (recipient_id, created_at desc);

create table if not exists public.dm_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.dm_reports (
  message_id  uuid not null references public.dm_messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('unwanted', 'abuse', 'details', 'spam', 'other')),
  created_at  timestamptz not null default now(),
  primary key (message_id, reporter_id)
);

create table if not exists public.team_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,   -- the carer this conversation belongs to
  from_team  boolean not null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists team_messages_user_idx on public.team_messages (user_id, created_at desc);

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.dm_messages   enable row level security;
alter table public.dm_blocks     enable row level security;
alter table public.dm_reports    enable row level security;
alter table public.team_messages enable row level security;
alter table public.announcements enable row level security;

-- ---------- profiles ----------
create or replace view public.community_people as
  select pr.id, pr.nickname, pr.area, pr.dm_open, pr.created_at, (pr.user_id = auth.uid()) as me
  from public.community_profiles pr
  where auth.uid() is not null;
revoke all on public.community_people from public, anon;
grant select on public.community_people to authenticated;

create or replace function public.community_upsert_profile(p_nickname text, p_area text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.community_profiles where lower(nickname) = lower(p_nickname) and user_id <> auth.uid()) then
    raise exception 'That nickname is taken';
  end if;
  insert into public.community_profiles (user_id, nickname, area)
  values (auth.uid(), p_nickname, nullif(trim(coalesce(p_area, '')), ''))
  on conflict (user_id) do update set nickname = excluded.nickname, area = excluded.area
  returning id into pid;
  return pid;
end;
$$;

create or replace function public.community_set_dm_open(p_open boolean)
returns void language sql security definer set search_path = public as $$
  update public.community_profiles set dm_open = p_open where user_id = auth.uid();
$$;

-- ---------- private messages between carers ----------
create or replace function public.dm_send(p_to uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me public.community_profiles; them public.community_profiles; new_id uuid;
begin
  select * into me from public.community_profiles where user_id = auth.uid();
  if me.id is null then raise exception 'Join the community first'; end if;
  if me.dm_restricted then raise exception 'You can''t send private messages'; end if;
  select * into them from public.community_profiles where id = p_to;
  if them.id is null or them.user_id = auth.uid()
     or exists (select 1 from public.dm_blocks b
                where (b.blocker_id = them.user_id and b.blocked_id = auth.uid())
                   or (b.blocker_id = auth.uid() and b.blocked_id = them.user_id))
     -- someone who has turned messages off can still get replies in a conversation they started
     or (not them.dm_open and not exists (select 1 from public.dm_messages m
                                          where m.sender_id = them.user_id and m.recipient_id = auth.uid())) then
    raise exception 'This carer is not taking messages';
  end if;
  if (select count(*) from public.dm_messages where sender_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages. Try again later';
  end if;
  -- a first message to someone new counts against a tighter daily limit, to stop mass messaging
  if not exists (select 1 from public.dm_messages m where (m.sender_id = auth.uid() and m.recipient_id = them.user_id)
                                                     or (m.sender_id = them.user_id and m.recipient_id = auth.uid()))
     and (select count(distinct recipient_id) from public.dm_messages
          where sender_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many new conversations today. Try again tomorrow';
  end if;
  insert into public.dm_messages (sender_id, recipient_id, body)
  values (auth.uid(), them.user_id, trim(p_body)) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.dm_threads()
returns table (pid uuid, nickname text, area text, last_body text, last_at timestamptz, last_mine boolean, unread int)
language sql stable security definer set search_path = public as $$
  with mine as (
    select case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other_user,
           m.body, m.created_at, (m.sender_id = auth.uid()) as is_mine
    from public.dm_messages m
    where auth.uid() in (m.sender_id, m.recipient_id)
  ), latest as (
    select distinct on (x.other_user) x.other_user, x.body, x.created_at, x.is_mine
    from mine x order by x.other_user, x.created_at desc
  )
  select pr.id, pr.nickname, pr.area, l.body, l.created_at, l.is_mine,
         (select count(*)::int from public.dm_messages u
          where u.sender_id = l.other_user and u.recipient_id = auth.uid() and u.read_at is null)
  from latest l join public.community_profiles pr on pr.user_id = l.other_user
  order by l.created_at desc
  limit 100;
$$;

create or replace function public.dm_thread(p_with uuid)
returns table (id uuid, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.body, m.created_at, (m.sender_id = auth.uid())
  from public.dm_messages m
  join public.community_profiles pr on pr.id = p_with
  where (m.sender_id = auth.uid() and m.recipient_id = pr.user_id)
     or (m.sender_id = pr.user_id and m.recipient_id = auth.uid())
  order by m.created_at desc
  limit 200;
$$;

create or replace function public.dm_mark_read(p_with uuid)
returns void language sql security definer set search_path = public as $$
  update public.dm_messages set read_at = now()
  where recipient_id = auth.uid() and read_at is null
    and sender_id = (select user_id from public.community_profiles where id = p_with);
$$;

create or replace function public.dm_block(p_who uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.dm_blocks (blocker_id, blocked_id)
  select auth.uid(), pr.user_id from public.community_profiles pr where pr.id = p_who and pr.user_id <> auth.uid()
  on conflict do nothing;
$$;

create or replace function public.dm_unblock(p_who uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.dm_blocks
  where blocker_id = auth.uid() and blocked_id = (select user_id from public.community_profiles where id = p_who);
$$;

create or replace function public.dm_blocked()
returns setof uuid language sql stable security definer set search_path = public as $$
  select pr.id from public.dm_blocks b join public.community_profiles pr on pr.user_id = b.blocked_id
  where b.blocker_id = auth.uid();
$$;

-- Only the person who received a message can report it.
create or replace function public.dm_report(p_message uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into public.dm_reports (message_id, reporter_id, reason)
  select m.id, auth.uid(), p_reason from public.dm_messages m
  where m.id = p_message and m.recipient_id = auth.uid()
  on conflict do nothing;
$$;

-- Moderators: reported private messages, and stopping someone from sending them.
create or replace function public.dm_reports_list()
returns table (message_id uuid, body text, sender_nickname text, reasons text, reports int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.message_id, m.body, sp.nickname, string_agg(distinct r.reason, ', '), count(*)::int, m.created_at
  from public.dm_reports r
  join public.dm_messages m on m.id = r.message_id
  left join public.community_profiles sp on sp.user_id = m.sender_id
  where public.community_is_moderator() and not coalesce(sp.dm_restricted, false)
  group by r.message_id, m.body, sp.nickname, m.created_at
  order by m.created_at desc
  limit 200;
$$;

create or replace function public.dm_mod_restrict(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.community_is_moderator() then raise exception 'Moderators only'; end if;
  update public.community_profiles set dm_restricted = true
  where user_id = (select sender_id from public.dm_messages where id = p_message);
end;
$$;

-- ---------- messages to and from the Shiftbuck team ----------
create or replace function public.team_send(p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.community_profiles where user_id = auth.uid()) then
    raise exception 'Join the community first';
  end if;
  if (select count(*) from public.team_messages
      where user_id = auth.uid() and not from_team and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many messages. Try again later';
  end if;
  insert into public.team_messages (user_id, from_team, body) values (auth.uid(), false, trim(p_body));
end;
$$;

create or replace function public.team_thread()
returns table (id uuid, body text, created_at timestamptz, from_team boolean, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.body, t.created_at, t.from_team, t.read_at from public.team_messages t
  where t.user_id = auth.uid() order by t.created_at desc limit 200;
$$;

create or replace function public.team_mark_read()
returns void language sql security definer set search_path = public as $$
  update public.team_messages set read_at = now() where user_id = auth.uid() and from_team and read_at is null;
$$;

create or replace function public.team_inbox()
returns table (pid uuid, nickname text, area text, last_body text, last_at timestamptz, last_from_team boolean, unread int)
language sql stable security definer set search_path = public as $$
  with latest as (
    select distinct on (t.user_id) t.user_id, t.body, t.created_at, t.from_team
    from public.team_messages t order by t.user_id, t.created_at desc
  )
  select pr.id, pr.nickname, pr.area, l.body, l.created_at, l.from_team,
         (select count(*)::int from public.team_messages u where u.user_id = l.user_id and not u.from_team and u.read_at is null)
  from latest l join public.community_profiles pr on pr.user_id = l.user_id
  where public.community_is_moderator()
  order by l.created_at desc
  limit 500;
$$;

create or replace function public.team_thread_for(p_who uuid)
returns table (id uuid, body text, created_at timestamptz, from_team boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.body, t.created_at, t.from_team from public.team_messages t
  join public.community_profiles pr on pr.user_id = t.user_id
  where pr.id = p_who and public.community_is_moderator()
  order by t.created_at desc limit 200;
$$;

create or replace function public.team_reply(p_who uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if not public.community_is_moderator() then raise exception 'Shiftbuck team only'; end if;
  select user_id into who from public.community_profiles where id = p_who;
  if who is null then raise exception 'No such carer'; end if;
  insert into public.team_messages (user_id, from_team, body) values (who, true, trim(p_body));
  update public.team_messages set read_at = now() where user_id = who and not from_team and read_at is null;
end;
$$;

create or replace function public.team_mark_read_for(p_who uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.community_is_moderator() then raise exception 'Shiftbuck team only'; end if;
  update public.team_messages set read_at = now()
  where user_id = (select user_id from public.community_profiles where id = p_who) and not from_team and read_at is null;
end;
$$;

-- ---------- announcements from the team to everyone ----------
create or replace view public.announcements_feed as
  select a.id, a.body, a.created_at from public.announcements a
  where auth.uid() is not null
  order by a.created_at desc
  limit 20;
revoke all on public.announcements_feed from public, anon;
grant select on public.announcements_feed to authenticated;

create or replace function public.announce(p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.community_is_moderator() then raise exception 'Shiftbuck team only'; end if;
  insert into public.announcements (body) values (trim(p_body));
end;
$$;

create or replace function public.announce_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.community_is_moderator() then raise exception 'Shiftbuck team only'; end if;
  delete from public.announcements where id = p_id;
end;
$$;

revoke all on function
  public.community_upsert_profile(text, text), public.community_set_dm_open(boolean),
  public.dm_send(uuid, text), public.dm_threads(), public.dm_thread(uuid), public.dm_mark_read(uuid),
  public.dm_block(uuid), public.dm_unblock(uuid), public.dm_blocked(), public.dm_report(uuid, text),
  public.dm_reports_list(), public.dm_mod_restrict(uuid),
  public.team_send(text), public.team_thread(), public.team_mark_read(), public.team_inbox(),
  public.team_thread_for(uuid), public.team_reply(uuid, text), public.team_mark_read_for(uuid),
  public.announce(text), public.announce_delete(uuid)
from public, anon;
grant execute on function
  public.community_upsert_profile(text, text), public.community_set_dm_open(boolean),
  public.dm_send(uuid, text), public.dm_threads(), public.dm_thread(uuid), public.dm_mark_read(uuid),
  public.dm_block(uuid), public.dm_unblock(uuid), public.dm_blocked(), public.dm_report(uuid, text),
  public.dm_reports_list(), public.dm_mod_restrict(uuid),
  public.team_send(text), public.team_thread(), public.team_mark_read(), public.team_inbox(),
  public.team_thread_for(uuid), public.team_reply(uuid, text), public.team_mark_read_for(uuid),
  public.announce(text), public.announce_delete(uuid)
to authenticated;
