-- Access-policy tests. Everything runs as the anon role, exactly like the browser does.
\set QUIET on
set role anon;

-- direct table access must be denied
do $$ begin
  begin perform 1 from public.plans limit 1; raise exception 'anon could read plans';
  exception when insufficient_privilege then null; end;
  begin insert into public.plans(edit_token_hash, view_token_hash, view_token, doc) values ('a','b','c','{}');
        raise exception 'anon could insert plans';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.plan_snapshots limit 1; raise exception 'anon could read snapshots';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.plan_assets limit 1; raise exception 'anon could read assets';
  exception when insufficient_privilege then null; end;
  begin perform public._token_hash('x'); raise exception 'anon could call helper';
  exception when insufficient_privilege then null; end;
end $$;

do $$
declare
  c jsonb; e text; v text; g jsonb; s jsonb; snap jsonb; a jsonb;
begin
  c := public.create_plan('Test', '{"name":"Test","guests":{"g1":{"id":"g1"}}}');
  e := c->>'edit_token'; v := c->>'view_token';
  assert length(e) = 48 and length(v) = 48 and e <> v, 'tokens';

  g := public.get_plan(e);
  assert g->>'role' = 'edit', 'edit role';
  assert g->>'view_token' = v, 'editor sees view token';
  g := public.get_plan(v);
  assert g->>'role' = 'view', 'view role';
  assert g->'view_token' = 'null'::jsonb, 'viewer does not get tokens';
  assert public.get_plan('nope') is null, 'unknown token';
  assert public.get_plan(null) is null, 'null token';

  -- viewer cannot write
  begin perform public.save_plan(v, '{"name":"hacked"}', 1); raise exception 'viewer saved';
  exception when insufficient_privilege then null; end;
  begin perform public.create_snapshot(v, 'x'); raise exception 'viewer snapshot';
  exception when insufficient_privilege then null; end;
  begin perform public.put_asset(v, 'image/png', 'AAAA'); raise exception 'viewer asset';
  exception when insufficient_privilege then null; end;
  begin perform public.list_snapshots(v); raise exception 'viewer listed snapshots';
  exception when insufficient_privilege then null; end;

  -- optimistic concurrency
  s := public.save_plan(e, '{"name":"Renamed"}', 1);
  assert (s->>'ok')::boolean and (s->>'version')::int = 2, 'save ok';
  s := public.save_plan(e, '{"name":"Stale"}', 1);
  assert not (s->>'ok')::boolean and (s->>'version')::int = 2 and s->'doc'->>'name' = 'Renamed', 'conflict';
  assert public.get_plan(v)->'doc'->>'name' = 'Renamed', 'viewer sees save';

  -- snapshots: autosave snapshot + manual
  perform public.create_snapshot(e, 'Manual');
  snap := public.list_snapshots(e);
  assert jsonb_array_length(snap) = 2, 'two snapshots: ' || snap::text;
  assert public.get_snapshot(e, (snap->0->>'id')::bigint)->>'name' = 'Renamed', 'get snapshot';
  begin perform public.get_snapshot(v, (snap->0->>'id')::bigint); raise exception 'viewer read snapshot';
  exception when insufficient_privilege then null; end;
  for i in 1..40 loop perform public.create_snapshot(e, 'n' || i); end loop;
  assert jsonb_array_length(public.list_snapshots(e)) = 30, 'pruned to 30';

  -- assets
  a := public.put_asset(e, 'image/png', encode('hello'::bytea, 'base64'));
  assert decode(public.get_asset(v, (a->>'id')::uuid)->>'data', 'base64') = 'hello'::bytea, 'viewer reads asset';
  assert public.get_asset('wrong', (a->>'id')::uuid) is null, 'asset needs token';
  begin perform public.put_asset(e, 'text/html', 'AAAA'); raise exception 'bad mime accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.put_asset(e, 'image/png', encode(repeat('x', 5*1024*1024)::bytea, 'base64'));
        raise exception 'oversized asset accepted';
  exception when invalid_parameter_value then null; end;

  -- another plan's token cannot touch this plan's snapshot
  c := public.create_plan('Other', '{}');
  begin perform public.get_snapshot(c->>'edit_token', (snap->0->>'id')::bigint); raise exception 'cross-plan read';
  exception when insufficient_privilege then null; end;
  begin perform public.create_plan('x', '[]'); raise exception 'array doc accepted';
  exception when invalid_parameter_value then null; end;
end $$;
\echo ok
