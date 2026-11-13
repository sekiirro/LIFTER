-- Task: T077. FR: FR-002, FR-034, FR-036.
-- Operator-reviewed local cleanup, separate from migrations. Run only after recording
-- the target stack and its before counts. This never cascades or deletes protected rows.
begin;

do $$
begin
  if exists (
    select 1 from public.package_offers o
    join public.packages p on p.id = o.package_id
    where p.code !~ '^(test|fixture)-[a-z0-9-]+$'
  ) then
    raise exception 'cleanup_refused_unverified_offer';
  end if;
end;
$$;

create temp table t077_cleanup_candidates (offer_id uuid primary key) on commit drop;
insert into t077_cleanup_candidates (offer_id)
select o.id
from public.package_offers o
join public.packages p on p.id = o.package_id
where p.code ~ '^(test|fixture)-[a-z0-9-]+$'
  and not exists (select 1 from public.package_versions v where v.offer_id = o.id)
  and not exists (select 1 from public.audit_events e where e.target_table = 'package_offers' and e.target_id = o.id)
  and not exists (
    select 1 from public.audit_events e join public.package_versions v on v.id = e.target_id
    where e.target_table = 'package_versions' and v.offer_id = o.id
  )
  and not exists (select 1 from public.registration_links l join public.package_versions v on v.id = l.package_version_id where v.offer_id = o.id)
  and not exists (select 1 from public.clients c join public.package_versions v on v.id = c.package_version_id where v.offer_id = o.id)
  and not exists (select 1 from public.subscriptions s join public.package_versions v on v.id = s.package_version_id where v.offer_id = o.id)
  and not exists (select 1 from public.subscription_renewals r where r.package_offer_id = o.id);

-- A no-delete trigger is bypassed only inside this reviewed, explicit maintenance transaction.
-- Foreign keys remain enabled and restrictive; every referenced row above disqualifies its offer.
do $$
begin
  if exists (select 1 from t077_cleanup_candidates) then
    execute 'alter table public.package_offers disable trigger package_offers_no_delete';
    delete from public.package_offers o using t077_cleanup_candidates c where o.id = c.offer_id;
    execute 'alter table public.package_offers enable trigger package_offers_no_delete';
  end if;
end;
$$;

select 'remaining_unranked_offers=' || count(*) from public.package_offers;
select 'deleted_safe_offers=' || count(*) from t077_cleanup_candidates;
commit;
