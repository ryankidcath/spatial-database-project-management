-- Edge Function send-web-push memakai service_role + schema core_pm via PostgREST.
-- Tanpa USAGE pada schema, API mengembalikan: permission denied for schema core_pm

grant usage on schema core_pm to service_role;
