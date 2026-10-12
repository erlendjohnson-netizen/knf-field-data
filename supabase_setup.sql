-- KNF Field & Lab Data: Supabase setup. Paste into the Supabase SQL editor and run once.
-- One synced table ("records") holds every record as JSON; typed views below expose each record type
-- with the Access/GeoPackage column names for QGIS, R and reports. The app never uploads drafts, so the
-- server only holds finished records (excavations can also be "open" = in progress; see record_status).

create extension if not exists postgis;

create table if not exists public.records (
  id uuid primary key,
  tbl text not null,
  site_id uuid,
  parent_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz not null,
  created_by text,
  updated_by text,
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp(),
  synced_by uuid default auth.uid()
);
create index if not exists records_synced_at on public.records (synced_at);
create index if not exists records_tbl on public.records (tbl);
create index if not exists records_parent on public.records (parent_id);
create index if not exists records_site on public.records (site_id);

-- last write wins by the device's edit time; every write gets a fresh server timestamp for pulling
create or replace function public.records_stamp() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;  -- an older edit arrived late: keep the newer one
  end if;
  new.synced_at := clock_timestamp();
  new.synced_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records for each row execute function public.records_stamp();

-- history of every change (who/when/what), so nothing is ever truly lost
create table if not exists public.records_history (
  hist_id bigserial primary key, id uuid, tbl text, data jsonb, deleted boolean, updated_at timestamptz, updated_by text,
  synced_by uuid, saved_at timestamptz default now());
create or replace function public.records_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.records_history (id, tbl, data, deleted, updated_at, updated_by, synced_by)
  values (new.id, new.tbl, new.data, new.deleted, new.updated_at, new.updated_by, new.synced_by);
  return new;
end $$;
drop trigger if exists records_log on public.records;
create trigger records_log after insert or update on public.records for each row execute function public.records_log();

-- Only signed-in crew accounts can read/write. Turn OFF public sign-ups in Auth settings and
-- create each person's account under Authentication > Users.
alter table public.records enable row level security;
alter table public.records_history enable row level security;
drop policy if exists crew_rw on public.records;
create policy crew_rw on public.records for all to authenticated using (true) with check (true);
drop policy if exists crew_read_hist on public.records_history;
create policy crew_read_hist on public.records_history for select to authenticated using (true);
-- Hard deletes are not allowed from the app (deletions are flagged); only the dashboard can purge.
revoke delete on public.records from authenticated;

-- Practice table for the app's TEST MODE: same shape and rules, never mixed with project data.
create table if not exists public.records_test (like public.records including all);
alter table public.records_test alter column synced_by set default auth.uid();
drop trigger if exists records_test_stamp on public.records_test;
create trigger records_test_stamp before insert or update on public.records_test for each row execute function public.records_stamp();
alter table public.records_test enable row level security;
drop policy if exists crew_rw on public.records_test;
create policy crew_rw on public.records_test for all to authenticated using (true) with check (true);

-- Private KNF site list used by the app's site picker (loaded separately; not in the public code)
create table if not exists public.site_registry (id int primary key, payload jsonb not null, updated_at timestamptz default now());
alter table public.site_registry enable row level security;
drop policy if exists crew_read on public.site_registry;
create policy crew_read on public.site_registry for select to authenticated using (true);

-- Photo storage (private bucket)
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict (id) do nothing;
drop policy if exists crew_photos_read on storage.objects;
create policy crew_photos_read on storage.objects for select to authenticated using (bucket_id = 'photos');
drop policy if exists crew_photos_write on storage.objects;
create policy crew_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists crew_photos_update on storage.objects;
create policy crew_photos_update on storage.objects for update to authenticated using (bucket_id = 'photos');

-- ---------- typed views ----------
drop view if exists public.v_provenience cascade;
create or replace view public.v_provenience with (security_invoker = on) as
select r.id, r.tbl, s.data->>'sitename' as sitename,
  coalesce(case when r.tbl='excavations' then r.id end, case when p.tbl='excavations' then p.id end, case when gp.tbl='excavations' then gp.id end) as excavation_uuid,
  case when r.tbl='levels' then r.id when p.tbl='levels' then p.id end as level_uuid
from public.records r
left join public.records s on s.id = r.site_id
left join public.records p on p.id = r.parent_id
left join public.records gp on gp.id = p.parent_id;

-- One view per record type, built from this column list (name:type, t=text n=number i=integer b=yes/no).
-- <type>_all includes everything on the server; <type> leaves out anything not finished.
do $do$
declare spec jsonb := '{"sites":["record_kind:t","district:t","site_name:t","temp_name:t","requested_by:t","purpose:t","site_code:t","project:t","parish:t","usgsquad:t","notes:t"],"excavations":["excavation_type:t","excavation_name:t","seq:i","excavationid:t","transect:t","date:t","crew:t","datum_desc:t","azimuth:n","positive:b","depthcm:n","depthsterile:n","strata:i","lengthcm:n","widthcm:n","number_of_eu:t","feature:b","dateablematerial:b","not_excavated_reason:t","photos:t","plan_drawing_1:t","profile_drawing_1:t","comments:t","lat:n","lon:n","utme:n","utmn:n","gps_acc_m:n","elev_m:n","utmzone:i","gps_n:i","gps_time:t","gps_source:t","datum:t"],"levels":["excavation_unit:t","levelno:i","levelid:t","top_cm:n","bgscm:n","excdepth:t","volume_l:t","excavation_method:t","screen:t","munsell:t","munsell2:t","soil_texture:t","strata:t","artifacts:b","field_count:i","soil_change:b","feature:b","special_find:b","special_find_desc:t","terminal_level:b","notes:t"],"bags":["qr:t","bag_no:i","contents:t","field_count:i","date:t","notes:t"],"features":["featurnumbersite:i","feature_type:t","excavation_unit:t","levelno:i","depth_bgs:n","bottom_bgs:n","length_cm:n","width_cm:n","munsell:t","cultural:t","soil_sample_taken:b","carbon_sample:b","drawing:t","photo:t","description:t"],"samples":["sample_type:t","sample_number:i","excavation_unit:t","levelno:i","depth:n","lower_bgs:n","material:t","collection:t","volume_l:n","weight:n","feature_no:i","context:t","lab:t","notes:t"],"tabulation":["labtech:t","primaryflakect:i","primaryfakewghtg:n","secondaryflakect:i","secondaryflakwght:n","tertiaryflakect:i","tertiaryflakwght:n","shatter:i","shatterwght:n","utlzdflkct:i","utlzdflkwgt:n","corecnt:i","corwght:n","tstcobblect:i","tstcobblewght:n","diagnosticlithicsct:i","diagnosticlithicswght:n","fcrcount:i","fcrwght:n","grndstnct:i","grndstnwght:n","plainsherdct:i","plainsherdwght:n","plnsherdrimct:i","plnsherdrimwght:n","decsherdct:i","decsherdwght:n","decsherdrimct:i","decsherdrimwght:n","diagnosticcermct:i","diagnosticceramwght:n","historicct:i","historicwght:n","debitage_count:t","artifact_count:t","artifactwght:t","notes:t"],"lithic_tools":["catalogno:i","labtech:t","tool_type:t","point_type:t","portion:t","material_class:t","sourcing_basis:t","cnt:i","wt:n","mlen:n","maxwid:n","maxthk:n","bladelen:n","bladewid:n","haftlen:n","neckwid:n","neckhgt:n","basewid:n","shoulder2corner:n","flaking_style:t","shoulder:t","stem:t","base:t","notching:t","thinning:t","basal_thinning:b","edge_shape:t","cortex_stage:t","retpcnt:t","color1:t","color2:t","patina:b","heat:b","usewear:b","excavator_damage:b","photo:t","discarded:b","missing:b","comments:t"],"prehistoric_ceramics":["catalogno:i","labtech:t","type_name:t","sherd_type:t","vessel_class:t","cnt:i","wt:n","temper:t","decoration1:t","decoration2:t","paste_color:t","firing_technique:t","completeness:t","condition:t","lip_type:t","orifice_diameter:n","polished:b","excavator_damage:b","discarded:b","missing:b","comments:t"],"exotic_lithics":["tooltype:t","raw_material:t","sourcing_basis:t","heat:b","cnt:i","weight:n","color:t","notes:t"],"ground_stone":["catalog_number:i","artifact_type:t","raw_material:t","texture:t","length:n","width:n","thickness:n","weight:n","photo:t","notes:t"],"historic_artifacts":["catalogn:i","material:t","artifact_type:t","color_1:t","decoration_type:t","cnt:i","weight:n","length:n","width:n","date:t","notes:t"],"flotation":["volomel:n","primaryflakect:i","primaryflakewgt:n","secondaryflakect:i","seconaryflakewgt:n","tertiaryflakect:i","tertiaryflakwgt:n","microlithct:i","microlithwgt:n","shatterct:i","shatterwgt:n","fcrct:i","fcrwgt:n","pottery:i","potterywght:n","sent_for_analysis:b","notes:t"],"subunits":["letter:t","parts:t","size_label:t","area_m2:t","opened:t","reason:t","notes:t"],"mappoints":["kind:t","label:t","corner:t","notes:t","lat:n","lon:n","utme:n","utmn:n","gps_acc_m:n","elev_m:n","utmzone:i","gps_n:i","gps_time:t","gps_source:t","datum:t","local_x:n","local_y:n"],"boxes":["qr:t","box_no:t","location:t","notes:t"],"custody":["item_qr:t","item_kind:t","action:t","to_person:t","from_person:t","location:t","box_qr:t","time:t","notes:t"],"photos":["kind:t","caption:t","path:t","taken_at:t","width:i","height:i","bytes:i"]}'; t text; cols text;
begin
  for t in select jsonb_object_keys(spec) loop
    select string_agg(case split_part(c, ':', 2)
        when 'i' then format('nullif(r.data->>%L, '''')::numeric::int as %I', split_part(c, ':', 1), split_part(c, ':', 1))
        when 'n' then format('nullif(r.data->>%L, '''')::numeric as %I', split_part(c, ':', 1), split_part(c, ':', 1))
        when 'b' then format('(nullif(r.data->>%L, ''''))::numeric::int::boolean as %I', split_part(c, ':', 1), split_part(c, ':', 1))
        else format('r.data->>%L as %I', split_part(c, ':', 1), split_part(c, ':', 1)) end, ', ')
      into cols from jsonb_array_elements_text(spec->t) c;
    execute format('create or replace view public.%I with (security_invoker = on) as select r.id as uuid, r.parent_id as parent_uuid, pv.sitename, pv.excavation_uuid, pv.level_uuid, %s, r.data->>''_status'' as record_status, r.created_by, r.created_at, r.updated_by, r.updated_at from public.records r join public.v_provenience pv on pv.id = r.id where r.tbl = %L and not r.deleted', t || '_all', cols, t);
    execute format('create or replace view public.%I with (security_invoker = on) as select * from public.%I where coalesce(record_status, ''complete'') <> ''draft''', t, t || '_all');
  end loop;
end $do$;

-- ---------- unit geometry for QGIS ----------
-- Subunit pieces are stored in metres on the unit's own grid (x east, y north of the unit datum);
-- this turns them into real polygons using the datum's UTM position and the unit azimuth.
create or replace function public.unit_xy(e0 float8, n0 float8, az float8, x float8, y float8)
returns geometry language sql immutable as $f$
  select st_makepoint(e0 + x * cos(radians(az)) + y * sin(radians(az)), n0 - x * sin(radians(az)) + y * cos(radians(az)))
$f$;
drop view if exists public.subunits_poly cascade;
create or replace view public.subunits_poly with (security_invoker = on) as
select s.id as uuid, e.id as excavation_uuid, st.data->>'sitename' as sitename, e.data->>'excavation_name' as excavation_name,
  s.data->>'letter' as letter, s.data->>'size_label' as size_label, nullif(s.data->>'area_m2','')::numeric as area_m2,
  st_multi(st_union(st_makepolygon(st_makeline(array[
    public.unit_xy(v.e0, v.n0, v.az, v.px, v.py), public.unit_xy(v.e0, v.n0, v.az, v.px + v.pw, v.py),
    public.unit_xy(v.e0, v.n0, v.az, v.px + v.pw, v.py + v.ph), public.unit_xy(v.e0, v.n0, v.az, v.px, v.py + v.ph),
    public.unit_xy(v.e0, v.n0, v.az, v.px, v.py)]))))::geometry(MultiPolygon) as geom_raw
from public.records s
join public.records e on e.id = s.parent_id
left join public.records st on st.id = s.site_id
cross join lateral jsonb_array_elements(case when jsonb_typeof(s.data->'parts') = 'array' then s.data->'parts' else '[]'::jsonb end) p
cross join lateral (select (e.data->>'utme')::float8 as e0, (e.data->>'utmn')::float8 as n0, coalesce(nullif(e.data->>'azimuth','')::float8, 0) as az,
  (p->>'x')::float8 as px, (p->>'y')::float8 as py, (p->>'w')::float8 as pw, (p->>'h')::float8 as ph) v
where s.tbl = 'subunits' and not s.deleted and not e.deleted and nullif(e.data->>'utme','') is not null
group by s.id, e.id, st.data, e.data, s.data;
-- UTM zone 15N (all of Kisatchie); WGS84 frame from the device/Emlid
create or replace view public.subunits_utm15 with (security_invoker = on) as
select uuid, excavation_uuid, sitename, excavation_name, letter, size_label, area_m2, st_setsrid(geom_raw, 32615)::geometry(MultiPolygon, 32615) as geom
from public.subunits_poly;
drop view if exists public.mappoints_pts cascade;
create or replace view public.mappoints_pts with (security_invoker = on) as
select m.*, st_setsrid(st_makepoint(m.lon, m.lat), 4326)::geometry(Point, 4326) as geom
from (select r.id as uuid, r.parent_id as excavation_uuid, r.data->>'kind' as kind, r.data->>'label' as label, r.data->>'corner' as corner,
  nullif(r.data->>'lat','')::float8 as lat, nullif(r.data->>'lon','')::float8 as lon, nullif(r.data->>'gps_acc_m','')::numeric as gps_acc_m,
  r.data->>'gps_time' as gps_time, r.created_by, r.created_at
  from public.records r where r.tbl = 'mappoints' and not r.deleted) m
where m.lat is not null;

-- point layer for QGIS (complete excavations with a GPS capture); add as a PostGIS layer
drop view if exists public.excavations_pts cascade;
create or replace view public.excavations_pts with (security_invoker = on) as
select e.*, st_setsrid(st_makepoint(e.lon, e.lat), 4326)::geometry(Point, 4326) as geom
from public.excavations_all e where e.lat is not null;
