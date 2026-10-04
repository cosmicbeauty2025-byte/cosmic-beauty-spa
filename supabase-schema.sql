-- ============================================================
-- Cosmic Beauty Spa — Supabase Database Schema
-- ============================================================
-- HOW TO RUN:
--   1. Open your Supabase project → SQL Editor → New Query
--   2. Paste this entire file and click Run
--   3. After running, go to Authentication → Email and
--      turn OFF "Confirm email" so clients can log in immediately
--   4. Create Christina's account:
--      Authentication → Users → "Invite user" or "Add user"
--      Email: christina@cosmicbeautyspa.com  Password: (choose a strong one)
--      Her profile row is auto-created with is_admin = true
-- ============================================================

-- ── Helper function (bypasses RLS safely) ──────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── Profiles ───────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key,
  email        text,
  first_name   text default '',
  last_name    text default '',
  phone        text default '',
  is_admin     boolean default false,
  skin_type    text,
  concerns     text[] default '{}',
  streak       integer default 0,
  routine_am   jsonb default '[]',
  routine_pm   jsonb default '[]',
  quiz_answers jsonb default '{}',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Auto-create profile when a new Supabase Auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    -- Christina's account automatically gets admin
    new.email = 'christina@cosmicbeautyspa.com'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Appointments ───────────────────────────────────────────
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.profiles(id) on delete set null,
  client_name text default '',
  appt_date   date,
  appt_time   time,
  service     text default '',
  notes       text default '',
  created_at  timestamptz default now()
);

-- ── Treatments (facial log) ────────────────────────────────
create table if not exists public.treatments (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.profiles(id) on delete set null,
  service          text default '',
  treatment_date   timestamptz default now(),
  conditions       text default '',
  pre_notes        text default '',
  post_notes       text default '',
  steps            jsonb default '[]',
  products         text default '',
  next_appointment text default '',
  created_at       timestamptz default now()
);

-- ── Reviews ────────────────────────────────────────────────
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  platform      text default 'Google',
  reviewer_name text default '',
  review_text   text default '',
  rating        integer default 5 check (rating between 1 and 5),
  review_date   text,
  is_featured   boolean default true,
  display_order integer default 0,
  created_at    timestamptz default now()
);

-- ── Esthetician Notes ──────────────────────────────────────
create table if not exists public.esthe_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.profiles(id) on delete cascade,
  notes      text default '',
  updated_at timestamptz default now(),
  unique (client_id)
);

-- ── Reorder Flags ──────────────────────────────────────────
create table if not exists public.reorder_flags (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.profiles(id) on delete cascade,
  product         text default '',
  days_until_empty integer,
  created_at      timestamptz default now()
);

-- ── Orders ─────────────────────────────────────────────────
create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  items        jsonb default '[]',
  amount_total numeric default 0,
  status       text default 'paid',
  created_at   timestamptz default now()
);

-- ── Skin Photos ────────────────────────────────────────────
create table if not exists public.skin_photos (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.profiles(id) on delete cascade,
  url        text,
  notes      text default '',
  created_at timestamptz default now()
);

-- ── Enable Row Level Security ──────────────────────────────
alter table public.profiles      enable row level security;
alter table public.appointments  enable row level security;
alter table public.treatments    enable row level security;
alter table public.reviews       enable row level security;
alter table public.esthe_notes   enable row level security;
alter table public.reorder_flags enable row level security;
alter table public.skin_photos   enable row level security;

-- ── RLS Policies: Profiles ────────────────────────────────
drop policy if exists "Own profile read"  on public.profiles;
drop policy if exists "Admin read all"    on public.profiles;
drop policy if exists "Own profile write" on public.profiles;
drop policy if exists "Admin write all"   on public.profiles;
drop policy if exists "Trigger insert"    on public.profiles;

create policy "Own profile read" on public.profiles
  for select using (auth.uid() = id);

create policy "Admin read all" on public.profiles
  for select using (public.is_admin());

create policy "Own profile write" on public.profiles
  for update using (auth.uid() = id);

create policy "Admin write all" on public.profiles
  for all using (public.is_admin());

-- allow insert so the trigger can create the row
create policy "Trigger insert" on public.profiles
  for insert with check (true);

-- ── RLS Policies: Appointments ────────────────────────────
drop policy if exists "Admin appointments" on public.appointments;
drop policy if exists "Own appointments"   on public.appointments;

create policy "Admin appointments" on public.appointments
  for all using (public.is_admin());

create policy "Own appointments" on public.appointments
  for select using (client_id = auth.uid());

-- ── RLS Policies: Treatments ─────────────────────────────
drop policy if exists "Admin treatments" on public.treatments;
drop policy if exists "Own treatments"   on public.treatments;

create policy "Admin treatments" on public.treatments
  for all using (public.is_admin());

create policy "Own treatments" on public.treatments
  for select using (client_id = auth.uid());

-- ── RLS Policies: Reviews ─────────────────────────────────
drop policy if exists "Public read featured" on public.reviews;
drop policy if exists "Admin reviews"        on public.reviews;

create policy "Public read featured" on public.reviews
  for select using (is_featured = true or public.is_admin());

create policy "Admin reviews" on public.reviews
  for all using (public.is_admin());

-- ── RLS Policies: Esthe Notes ─────────────────────────────
drop policy if exists "Admin esthe_notes" on public.esthe_notes;

create policy "Admin esthe_notes" on public.esthe_notes
  for all using (public.is_admin());

-- ── RLS Policies: Reorder Flags ──────────────────────────
drop policy if exists "Admin reorder_flags" on public.reorder_flags;

create policy "Admin reorder_flags" on public.reorder_flags
  for all using (public.is_admin());

-- ── RLS Policies: Skin Photos ────────────────────────────
drop policy if exists "Admin skin_photos" on public.skin_photos;
drop policy if exists "Own skin_photos"   on public.skin_photos;

create policy "Admin skin_photos" on public.skin_photos
  for all using (public.is_admin());

create policy "Own skin_photos" on public.skin_photos
  for select using (client_id = auth.uid());

-- ── Done ──────────────────────────────────────────────────
-- After running this script:
-- 1. Disable email confirmation in Auth → Email settings
-- 2. Create Christina's esthetician account in Auth → Users
--    Email: christina@cosmicbeautyspa.com
--    The trigger will auto-set is_admin = true for that email
-- 3. Optionally create a demo account: demo@cosmicbeautyspa.com / demo1234
