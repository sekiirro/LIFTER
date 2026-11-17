-- F9 T064a [FR-022, FR-028, SC-019]: read-only C5 synthetic-only and dependency preflight.
-- app_private.package_c5_preflight(uuid[]) returns jsonb. STABLE, zero writes, owned by
-- postgres, not executable by API roles. It reports; it never deletes or changes anything.
-- Dependent tables are discovered from the pg_constraint FK graph (not a hand-written list),
-- so a table added later is detected; a package-id column with no FK edge escalates.
create function app_private.package_c5_preflight(target_package_ids uuid[] default null)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  ids uuid[];
  q_oid oid[] := array['public.packages'::regclass::oid];
  q_name text[] := array['public.packages'];
  q_tmpl text[] := array['@.id = any($1)'];
  q_lvl int[] := array[0];
  visited oid[] := array['public.packages'::regclass::oid];
  e_name text[] := '{}';
  e_kind text[] := '{}';
  e_ikind text[] := '{}';
  e_lvl int[] := '{}';
  e_child text[] := '{}';
  e_rel text[] := '{}';
  e_tmpl text[] := '{}';
  e_hasid boolean[] := '{}';
  e_count int[] := '{}';
  r record;
  i int := 1;
  k int;
  n int;
  p uuid;
  v_edge text;
  v_tmpl text;
  v_ikind text;
  v_code text;
  v_unknown boolean;
  v_json boolean;
  pats text[];
  audit_named int;
  audit_fin int := 0;
  r_pkg uuid[] := '{}';
  r_code text[] := '{}';
  targets jsonb;
  deps jsonb := '[]'::jsonb;
  refusals jsonb;
  syn_only boolean;
  v_status text;
  fin_pkgs uuid[] := '{}';
begin
  if target_package_ids is null then
    ids := array(select x.id from public.packages x order by x.id);
  else
    ids := array(select distinct t from unnest(target_package_ids) t where t is not null order by t);
  end if;

  -- Breadth-first walk of the FK graph from packages (catalog driven).
  while i <= cardinality(q_oid) loop
    for r in
      select con.conrelid as child_oid, cn.nspname::text as child_schema, cc.relname::text as child_name,
        (select string_agg(format('@P.%I = @C.%I', pa.attname, ca.attname), ' and ' order by u.ord)
           from unnest(con.confkey, con.conkey) with ordinality as u(fk, ck, ord)
           join pg_catalog.pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = u.fk
           join pg_catalog.pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = u.ck) as join_cond,
        (select ca.attname::text
           from unnest(con.confkey, con.conkey) with ordinality as u(fk, ck, ord)
           join pg_catalog.pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = u.fk
           join pg_catalog.pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = u.ck
          order by (pa.attname::text = 'id') desc, (ca.attname::text = 'workspace_id') asc, u.ord
          limit 1) as edge_col,
        exists (select 1 from pg_catalog.pg_attribute a
                 where a.attrelid = con.conrelid and a.attname::text = 'id' and a.attnum > 0 and not a.attisdropped) as has_id
        from pg_catalog.pg_constraint con
        join pg_catalog.pg_class cc on cc.oid = con.conrelid
        join pg_catalog.pg_namespace cn on cn.oid = cc.relnamespace
       where con.contype = 'f' and con.confrelid = q_oid[i] and con.conrelid <> con.confrelid
       order by cn.nspname, cc.relname, con.conname
    loop
      v_edge := r.child_schema || '.' || r.child_name || '.' || r.edge_col;
      continue when v_edge = any(e_name);
      v_tmpl := format('exists (select 1 from %s p%s where %s and %s)', q_name[i], q_lvl[i],
        replace(replace(r.join_cond, '@P', 'p' || q_lvl[i]), '@C', '@'),
        replace(q_tmpl[i], '@', 'p' || q_lvl[i]));
      v_ikind := case
        when r.child_schema = 'public' and r.child_name in ('package_offers', 'package_versions') then 'fk'
        when r.child_schema = 'public' and r.child_name = 'registration_links' then 'registration_link'
        when r.child_schema = 'public' and r.child_name = 'clients' then 'client'
        when r.child_schema = 'public' and r.child_name in ('subscriptions', 'subscription_renewals', 'subscription_upgrades') then 'subscription'
        when r.child_schema = 'public' and r.child_name in ('subscription_installments', 'payment_events', 'subscription_activations', 'subscription_renewal_date_revisions') then 'payment'
        else 'unknown' end;
      e_name := e_name || v_edge;
      e_ikind := e_ikind || v_ikind;
      e_kind := e_kind || case v_ikind when 'client' then 'registration_link' when 'unknown' then 'fk' else v_ikind end;
      e_lvl := e_lvl || (q_lvl[i] + 1);
      e_child := e_child || format('%I.%I', r.child_schema, r.child_name);
      e_rel := e_rel || r.child_name;
      e_tmpl := e_tmpl || v_tmpl;
      e_hasid := e_hasid || r.has_id;
      if not (r.child_oid = any(visited)) then
        visited := visited || r.child_oid;
        if v_ikind not in ('client', 'unknown') then
          q_oid := q_oid || r.child_oid;
          q_name := q_name || format('%I.%I', r.child_schema, r.child_name);
          q_tmpl := q_tmpl || v_tmpl;
          q_lvl := q_lvl || (q_lvl[i] + 1);
        end if;
      end if;
    end loop;
    i := i + 1;
  end loop;

  -- Row counts per edge for the target set.
  for k in 1 .. coalesce(cardinality(e_name), 0) loop
    execute format('select count(*)::int from %s c0 where %s', e_child[k], replace(e_tmpl[k], '@', 'c0'))
      into n using ids;
    e_count := e_count || n;
  end loop;

  -- Unknown dependency state: a package-id column on a table with no FK edge into the package tables.
  select exists (
    select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname in ('public', 'app_private')
       and c.relkind in ('r', 'p', 'f')
       and a.attnum > 0 and not a.attisdropped
       and a.attname::text in ('package_id', 'package_offer_id', 'package_version_id')
       and c.relname::text not in ('packages', 'package_offers', 'package_versions')
       and not exists (
         select 1 from pg_catalog.pg_constraint con
          where con.contype = 'f' and con.conrelid = c.oid
            and con.confrelid in ('public.packages'::regclass, 'public.package_offers'::regclass, 'public.package_versions'::regclass))
  ) into v_unknown;

  -- Per-package refusals from the dependency edges.
  for k in 1 .. coalesce(cardinality(e_name), 0) loop
    continue when e_count[k] = 0;
    v_code := case
      when e_ikind[k] = 'fk' then 'attached_offers_or_versions'
      when e_ikind[k] = 'unknown' and e_lvl[k] = 1 then 'unknown_dependency_state'
      else 'required_financial_dependency' end;
    if cardinality(ids) = 1 then
      r_pkg := r_pkg || ids[1];
      r_code := r_code || v_code;
    else
      foreach p in array ids loop
        execute format('select count(*)::int from %s c0 where %s', e_child[k], replace(e_tmpl[k], '@', 'c0'))
          into n using array[p];
        if n > 0 then
          r_pkg := r_pkg || p;
          r_code := r_code || v_code;
        end if;
      end loop;
    end if;
    if e_ikind[k] in ('registration_link', 'client', 'subscription', 'payment') and e_hasid[k] then
      execute format(
        'select count(*)::int from public.audit_events e where e.target_table = %L and e.target_id in (select c0.id from %s c0 where %s)',
        e_rel[k], e_child[k], replace(e_tmpl[k], '@', 'c0'))
        into n using ids;
      audit_fin := audit_fin + n;
    end if;
  end loop;

  -- Audit rows that merely name a target package/offer/version are reported, not blocking (PO Q1=A).
  select count(*)::int into audit_named
    from public.audit_events e
   where (e.target_table = 'packages' and e.target_id = any(ids))
      or (e.target_table = 'package_offers' and e.target_id in (
            select o.id from public.package_offers o where o.package_id = any(ids)))
      or (e.target_table = 'package_versions' and e.target_id in (
            select v.id from public.package_versions v join public.package_offers o on o.id = v.offer_id
             where o.package_id = any(ids)));

  -- Audit rows that belong to a client/financial dependent block (PO Q1=A: only those block).
  if audit_fin > 0 then
    for k in 1 .. cardinality(r_pkg) loop
      if r_code[k] = 'required_financial_dependency' then
        fin_pkgs := fin_pkgs || r_pkg[k];
      end if;
    end loop;
    foreach p in array fin_pkgs loop
      r_pkg := r_pkg || p;
      r_code := array_append(r_code, 'required_audit_dependency'::text);
    end loop;
  end if;

  -- Classification, structural real-catalog exclusion (review finding 2) and unknown ids.
  for r in select x.id, x.code, x.workspace_id from public.packages x where x.id = any(ids) loop
    if r.code is null or r.code !~ '^(test|fixture)-[a-z0-9-]+$' then
      r_pkg := r_pkg || r.id;
      r_code := array_append(r_code, 'non_synthetic'::text);
    end if;
    if r.workspace_id is not null
       or exists (select 1 from public.package_versions v join public.package_offers o on o.id = v.offer_id
                   where o.package_id = r.id and v.market is not null)
       or exists (select 1 from public.package_offers o where o.package_id = r.id and o.available) then
      r_pkg := r_pkg || r.id;
      r_code := array_append(r_code, 'real_catalog_row'::text);
    end if;
  end loop;
  -- Package ids stored in json/jsonb columns without an FK (review finding 9): any hit escalates.
  if cardinality(ids) > 0 then
    pats := array(
      select '%' || t::text || '%' from unnest(ids) t
      union all select '%' || o.id::text || '%' from public.package_offers o where o.package_id = any(ids)
      union all select '%' || v.id::text || '%' from public.package_versions v
        join public.package_offers o on o.id = v.offer_id where o.package_id = any(ids));
    for r in
      select ns.nspname::text as s, c.relname::text as t, a.attname::text as col
        from pg_catalog.pg_attribute a
        join pg_catalog.pg_class c on c.oid = a.attrelid
        join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname in ('public', 'app_private') and c.relkind in ('r', 'p')
         and a.attnum > 0 and not a.attisdropped
         and a.atttypid in ('pg_catalog.jsonb'::regtype, 'pg_catalog.json'::regtype)
         and not (ns.nspname = 'public' and c.relname = 'audit_events')
    loop
      execute format('select exists (select 1 from %I.%I c0 where c0.%I::text like any($1))', r.s, r.t, r.col)
        into v_json using pats;
      if v_json then
        v_unknown := true;
      end if;
    end loop;
  end if;
  for p in select t from unnest(ids) t where not exists (select 1 from public.packages x where x.id = t) loop
    r_pkg := r_pkg || p;
    r_code := array_append(r_code, 'unknown_dependency_state'::text);
  end loop;
  if v_unknown then
    foreach p in array ids loop
      r_pkg := r_pkg || p;
      r_code := array_append(r_code, 'unknown_dependency_state'::text);
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('package_id', t.package_id, 'code', t.code) order by t.package_id, t.code), '[]'::jsonb)
    into refusals
    from (select distinct u.package_id, u.code from unnest(r_pkg, r_code) as u(package_id, code)) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'package_id', x.id, 'code', x.code,
           'synthetic', x.code ~ '^(test|fixture)-[a-z0-9-]+$') order by x.code, x.id), '[]'::jsonb),
         coalesce(bool_and(x.code ~ '^(test|fixture)-[a-z0-9-]+$'), true)
    into targets, syn_only
    from public.packages x where x.id = any(ids);

  for k in 1 .. coalesce(cardinality(e_name), 0) loop
    deps := deps || jsonb_build_object('edge', e_name[k], 'kind', e_kind[k], 'count', e_count[k]);
  end loop;
  deps := deps
    || jsonb_build_object('edge', 'public.audit_events.target_id', 'kind', 'audit', 'count', audit_named)
    || jsonb_build_object('edge', 'public.audit_events.target_id[client_financial]', 'kind', 'audit', 'count', audit_fin);

  v_status := case
    when v_unknown or exists (select 1 from jsonb_array_elements(refusals) j where j ->> 'code' = 'unknown_dependency_state') then 'escalate'
    when jsonb_array_length(refusals) > 0 then 'refused'
    else 'clean' end;

  return jsonb_build_object(
    'status', v_status,
    'synthetic_only', syn_only,
    'targets', targets,
    'dependencies', deps,
    'refusals', refusals);
end;
$$;
alter function app_private.package_c5_preflight(uuid[]) owner to postgres;
revoke all on function app_private.package_c5_preflight(uuid[]) from public, anon, authenticated, service_role;
comment on function app_private.package_c5_preflight(uuid[]) is
  'F9 T064a read-only C5 preflight: synthetic-only proof and FK/audit dependency inventory. No writes.';
