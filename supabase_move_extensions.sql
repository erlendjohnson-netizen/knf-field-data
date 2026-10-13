-- KNF Field Data: move PostGIS and pg_net out of the public schema (Supabase Security Advisor).
-- PostGIS's spatial_ref_sys table can't be locked down while it sits in "public" (it belongs to Supabase's admin role),
-- so the extension moves to the "extensions" schema, which the API does not expose.
-- This drops the map views (sites_pts, excavations_pts, subunits_poly ... in public and test); the setup script
-- run straight after this puts them back. The records themselves are not touched.
create schema if not exists extensions;
drop extension if exists pg_net;
create extension if not exists pg_net schema extensions;
drop extension if exists postgis cascade;
create extension postgis schema extensions;
