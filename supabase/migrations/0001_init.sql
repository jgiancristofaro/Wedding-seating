-- Wedding Seating — schema and access policies.
--
-- Access model: there are no user accounts. Every plan has two secret tokens:
--   * edit token  (192-bit, only its SHA-256 is stored)  -> read + write
--   * view token  (192-bit, hash stored for lookup; plaintext kept so editors can re-share it) -> read only
-- Tables have RLS enabled with NO policies and privileges revoked, so the anon key cannot read or write any
-- row directly. All access goes through the SECURITY DEFINER functions below, which verify the token.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  edit_token_hash  text not null unique,
  view_token_hash  text not null unique,
  view_token       text not null,
  name             text not null default 'Our wedding',
  doc              jsonb not null,
  version          bigint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_snapshot_at timestamptz
);

create table if not exists public.plan_snapshots (
  id         bigint generated always as identity primary key,
  plan_id    uuid not null references public.plans(id) on delete cascade,
  version    bigint not null,
  label      text,
  doc        jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_snapshots_plan_idx on public.plan_snapshots(plan_id, created_at desc);

create table if not exists public.plan_assets (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans(id) on delete cascade,
  mime       text not null,
  data       bytea not null,
  size       int not null,
  created_at timestamptz not null default now()
);
create index if not exists plan_assets_plan_idx on public.plan_assets(plan_id, created_at desc);

alter table public.plans enable row level security;
alter table public.plan_snapshots enable row level security;
alter table public.plan_assets enable row level security;
-- Deliberately no policies: deny-all for anon/authenticated. Belt and braces: revoke privileges too.
revoke all on public.plans, public.plan_snapshots, public.plan_assets from anon, authenticated, public;

-- ---------------------------------------------------------------------------------------------------------
-- helpers

create or replace function public._token_hash(p_token text)
returns text language sql immutable
set search_path = public, extensions
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

create or replace function public._new_token()
returns text language sql volatile
set search_path = public, extensions
as $$ select encode(extensions.gen_random_bytes(24), 'hex') $$;

-- Max sizes (enforced server-side; the client also enforces them for friendly errors).
create or replace function public._max_doc_bytes() returns int language sql immutable as $$ select 3 * 1024 * 1024 $$;
create or replace function public._max_asset_bytes() returns int language sql immutable as $$ select 4 * 1024 * 1024 $$;
create or replace function public._max_snapshots() returns int language sql immutable as $$ select 30 $$;

create or replace function public._prune_snapshots(p_plan uuid)
returns void language sql
set search_path = public
as $$
  delete from public.plan_snapshots s
  where s.plan_id = p_plan
    and s.id not in (
      select id from public.plan_snapshots where plan_id = p_plan order by created_at desc, id desc
      limit public._max_snapshots()
    );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- RPCs

create or replace function public.create_plan(p_name text, p_doc jsonb)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_edit text := public._new_token();
  v_view text := public._new_token();
  v_id uuid;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'invalid_doc' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > public._max_doc_bytes() then
    raise exception 'doc_too_large' using errcode = '22023';
  end if;
  insert into public.plans(edit_token_hash, view_token_hash, view_token, name, doc)
  values (public._token_hash(v_edit), public._token_hash(v_view), v_view, left(coalesce(p_name, 'Our wedding'), 200), p_doc)
  returning id into v_id;
  return jsonb_build_object('plan_id', v_id, 'edit_token', v_edit, 'view_token', v_view, 'version', 1);
end $$;

-- Resolves either token. Returns null for unknown tokens (no distinction leaks between "wrong" and "deleted").
create or replace function public.get_plan(p_token text)
returns jsonb language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v_hash text := public._token_hash(p_token);
  r public.plans;
  v_role text;
begin
  select * into r from public.plans where edit_token_hash = v_hash;
  if found then
    v_role := 'edit';
  else
    select * into r from public.plans where view_token_hash = v_hash;
    if not found then return null; end if;
    v_role := 'view';
  end if;
  return jsonb_build_object(
    'plan_id', r.id,
    'role', v_role,
    'doc', r.doc,
    'version', r.version,
    'updated_at', r.updated_at,
    'view_token', case when v_role = 'edit' then r.view_token else null end
  );
end $$;

-- Optimistic concurrency: the write only succeeds if p_base_version matches. On conflict the current doc is
-- returned so the client can do a 3-way merge and retry.
create or replace function public.save_plan(p_edit_token text, p_doc jsonb, p_base_version bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.plans;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    raise exception 'invalid_doc' using errcode = '22023';
  end if;
  if octet_length(p_doc::text) > public._max_doc_bytes() then
    raise exception 'doc_too_large' using errcode = '22023';
  end if;
  select * into r from public.plans where edit_token_hash = public._token_hash(p_edit_token) for update;
  if not found then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if r.version <> p_base_version then
    return jsonb_build_object('ok', false, 'version', r.version, 'doc', r.doc);
  end if;

  update public.plans
     set doc = p_doc,
         name = left(coalesce(p_doc->>'name', name), 200),
         version = r.version + 1,
         updated_at = now()
   where id = r.id;

  -- automatic snapshot at most every 10 minutes of active editing
  if r.last_snapshot_at is null or r.last_snapshot_at < now() - interval '10 minutes' then
    insert into public.plan_snapshots(plan_id, version, label, doc) values (r.id, r.version + 1, 'Autosave', p_doc);
    update public.plans set last_snapshot_at = now() where id = r.id;
    perform public._prune_snapshots(r.id);
  end if;

  return jsonb_build_object('ok', true, 'version', r.version + 1);
end $$;

create or replace function public.create_snapshot(p_edit_token text, p_label text)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.plans;
  v_id bigint;
begin
  select * into r from public.plans where edit_token_hash = public._token_hash(p_edit_token);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.plan_snapshots(plan_id, version, label, doc)
  values (r.id, r.version, left(coalesce(p_label, 'Saved version'), 120), r.doc)
  returning id into v_id;
  perform public._prune_snapshots(r.id);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.list_snapshots(p_edit_token text)
returns jsonb language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v_plan uuid;
begin
  select id into v_plan from public.plans where edit_token_hash = public._token_hash(p_edit_token);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'version', s.version, 'label', s.label, 'created_at', s.created_at,
      'guests', (select count(*) from jsonb_object_keys(coalesce(s.doc->'guests', '{}'::jsonb))),
      'tables', (select count(*) from jsonb_object_keys(coalesce(s.doc->'tables', '{}'::jsonb)))
    ) order by s.created_at desc, s.id desc)
    from public.plan_snapshots s where s.plan_id = v_plan
  ), '[]'::jsonb);
end $$;

create or replace function public.get_snapshot(p_edit_token text, p_snapshot_id bigint)
returns jsonb language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v_doc jsonb;
begin
  select s.doc into v_doc
    from public.plan_snapshots s join public.plans p on p.id = s.plan_id
   where s.id = p_snapshot_id and p.edit_token_hash = public._token_hash(p_edit_token);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  return v_doc;
end $$;

create or replace function public.put_asset(p_edit_token text, p_mime text, p_data_b64 text)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_plan uuid;
  v_bytes bytea;
  v_id uuid;
begin
  select id into v_plan from public.plans where edit_token_hash = public._token_hash(p_edit_token);
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'unsupported_type' using errcode = '22023';
  end if;
  v_bytes := decode(p_data_b64, 'base64');
  if octet_length(v_bytes) > public._max_asset_bytes() then
    raise exception 'asset_too_large' using errcode = '22023';
  end if;
  insert into public.plan_assets(plan_id, mime, data, size) values (v_plan, p_mime, v_bytes, octet_length(v_bytes))
  returning id into v_id;
  -- keep the 3 most recent images per plan (older snapshots may still point at a recent one)
  delete from public.plan_assets a where a.plan_id = v_plan and a.id not in (
    select id from public.plan_assets where plan_id = v_plan order by created_at desc limit 3);
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.get_asset(p_token text, p_asset_id uuid)
returns jsonb language plpgsql security definer stable
set search_path = public, extensions
as $$
declare
  v_hash text := public._token_hash(p_token);
  a public.plan_assets;
begin
  select a2.* into a from public.plan_assets a2 join public.plans p on p.id = a2.plan_id
   where a2.id = p_asset_id and (p.edit_token_hash = v_hash or p.view_token_hash = v_hash);
  if not found then return null; end if;
  return jsonb_build_object('mime', a.mime, 'data', encode(a.data, 'base64'));
end $$;

-- Only the RPCs are callable by the public (anon) role.
revoke all on function
  public._token_hash(text), public._new_token(), public._max_doc_bytes(), public._max_asset_bytes(),
  public._max_snapshots(), public._prune_snapshots(uuid),
  public.create_plan(text, jsonb), public.get_plan(text), public.save_plan(text, jsonb, bigint),
  public.create_snapshot(text, text), public.list_snapshots(text), public.get_snapshot(text, bigint),
  public.put_asset(text, text, text), public.get_asset(text, uuid)
from public, anon, authenticated;
grant execute on function
  public.create_plan(text, jsonb),
  public.get_plan(text),
  public.save_plan(text, jsonb, bigint),
  public.create_snapshot(text, text),
  public.list_snapshots(text),
  public.get_snapshot(text, bigint),
  public.put_asset(text, text, text),
  public.get_asset(text, uuid)
to anon, authenticated;
