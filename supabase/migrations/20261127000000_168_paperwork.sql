-- 168: paperwork. The agreement a creator signs now covers tax forms and the
-- use of their name and face, and every signature keeps where it came from
-- (IP address and browser) next to the name, time and hash already stored.
--
-- Noni pays creators from its own bank, so Noni is the payer: it collects the
-- W-9 during payout setup (Mercury invite, requireTaxDocument) and files the
-- 1099-NEC. Companies file nothing.

-- 1. Signature record --------------------------------------------------------

alter table public.marketplace_applications
  add column if not exists signed_ip text,
  add column if not exists signed_user_agent text;

comment on column public.marketplace_applications.signed_ip is
  'Where the signature came from. x-signer-ip when a server signs for the creator (noni-web forwards the browser address), else the first x-forwarded-for hop.';

create or replace function public.stamp_signature()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_headers json;
begin
  if new.signed_at is null then
    new.signed_ip := null;
    new.signed_user_agent := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.signed_at is not distinct from old.signed_at then
    return new;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  new.signed_ip := left(nullif(trim(split_part(
    coalesce(nullif(v_headers ->> 'x-signer-ip', ''), v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''), 64);
  new.signed_user_agent := left(nullif(trim(
    coalesce(nullif(v_headers ->> 'x-signer-agent', ''), v_headers ->> 'user-agent', '')), ''), 400);
  return new;
end;
$$;

drop trigger if exists marketplace_applications_stamp_signature on public.marketplace_applications;
create trigger marketplace_applications_stamp_signature
  before insert or update on public.marketplace_applications
  for each row execute function public.stamp_signature();

-- 2. The agreement -----------------------------------------------------------

-- Listings still carrying the agreement nobody edited follow the new text.
create temporary table _unedited_listings on commit drop as
  select l.id
  from public.marketplace_listings l
  join public.companies c on c.id = l.company_id
  where l.contract_body = public.listing_contract(l, c.name);

create or replace function public.listing_contract(l public.marketplace_listings, p_company text)
returns text
language sql
immutable
set search_path = public
as $$
  select format(
$c$This agreement is between %1$s ("the Company") and you ("the Creator"). It starts the day the Company accepts your application.

1. The work. You make short videos and posts for the Company from the briefs it gives you in Noni, and post them on your own accounts. The target is %2$s a day. Your first post is due within %3$s days of being accepted.

2. Pay. You earn %4$s for each video and %5$s for each slideshow once it is live and has %6$s views, plus %7$s for every 1,000 views in the first 30 days, up to %8$s in view pay per post. Noni pays out to your bank every Sunday.

3. Approval. Every post is reviewed in Noni before it goes live. Only approved posts are paid. Posts must stay up for at least 90 days.

4. Content rights. You keep ownership of what you make. You give the Company a worldwide, royalty free licence to repost, edit and run your content as ads, with no end date, for the content you make under this agreement.

5. Your name and face. The Company can show your name, handle, voice and likeness as they appear in that content, including in ads.

6. Honesty. You follow the brief, say only what the brief allows about the product, and label the content as a paid partnership where the platform or the law requires it. No bought views, likes or followers.

7. Independent creator. You are an independent contractor, not an employee. You are responsible for your own taxes. You are 18 or older.

8. Tax forms. Noni pays you on the Company's behalf. You give Noni a W-9 before your first payout, or a W-8BEN if you are outside the United States. Noni sends you a 1099-NEC for each year your pay reaches the IRS reporting amount.

9. Ending it. Either side can end this agreement at any time in Noni. Posts approved before it ends are still paid.

You agree to sign and receive this agreement electronically. Typing your name below and tapping Sign has the same effect as a handwritten signature.$c$,
    coalesce(nullif(trim(p_company), ''), 'the Company'),
    case when l.posts_per_day_max > l.posts_per_day_min
      then l.posts_per_day_min || ' to ' || l.posts_per_day_max || ' posts'
      when l.posts_per_day_min = 1 then '1 post' else l.posts_per_day_min || ' posts' end,
    greatest(0, coalesce(l.start_days, 3)),
    public.cents_label(l.video_post_cents),
    public.cents_label(l.static_post_cents),
    to_char(l.min_views, 'FM999,999,990'),
    public.cents_label(l.cents_per_1k_views),
    public.cents_label(l.view_pay_cap_cents)
  );
$$;

update public.marketplace_listings l
set contract_body = public.listing_contract(l, c.name),
    contract_version = l.contract_version + 1
from public.companies c
where c.id = l.company_id
  and l.id in (select id from _unedited_listings);
