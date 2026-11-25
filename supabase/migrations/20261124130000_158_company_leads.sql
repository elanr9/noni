-- 158: the B2B pipeline. Companies never make an account on their own:
-- the Get started chat saves them as a lead (no sign in), they book a call,
-- and ops turns the lead into a company and invites its admin with the
-- plan agreed on the call. Only service role code touches these tables.

create table if not exists public.company_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  company text,
  website text,
  role text,
  -- goal, platforms, creators_wanted, launch
  answers jsonb not null default '{}'::jsonb,
  -- new: answering or answered; call_booked; invited: company made and
  -- admin invited; subscribed: plan started; lost: closed by ops.
  status text not null default 'new'
    check (status in ('new', 'call_booked', 'invited', 'subscribed', 'lost')),
  finished_at timestamptz,
  call_booked_at timestamptz,
  invited_at timestamptz,
  subscribed_at timestamptz,
  company_id uuid references public.companies on delete set null,
  note text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_leads_created_idx on public.company_leads (created_at desc);
create index if not exists company_leads_email_idx on public.company_leads (lower(email));
create index if not exists company_leads_company_idx on public.company_leads (company_id);

alter table public.company_leads enable row level security;
revoke all on public.company_leads from anon, authenticated;

-- Sign-in links Noni emails itself (email-sign-in edge function), counted
-- per address so the form cannot be used to flood an inbox.
create table if not exists public.sign_in_link_requests (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists sign_in_link_requests_email_idx
  on public.sign_in_link_requests (lower(email), created_at desc);

alter table public.sign_in_link_requests enable row level security;
revoke all on public.sign_in_link_requests from anon, authenticated;

-- Whether an account with this email may get a sign-in link: it exists and
-- runs a company (admin or campaign manager seat) or is the platform admin.
-- Creators sign in with Google and in the app.
create or replace function public.can_email_sign_in(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(trim(p_email))
      and (
        p.role = 'admin'
        or exists (
          select 1 from public.company_members m
          where m.profile_id = u.id
            and m.removed_at is null
            and m.role in ('company_admin', 'campaign_manager')
        )
      )
  );
$$;

revoke all on function public.can_email_sign_in(text) from public, anon, authenticated;
grant execute on function public.can_email_sign_in(text) to service_role;
