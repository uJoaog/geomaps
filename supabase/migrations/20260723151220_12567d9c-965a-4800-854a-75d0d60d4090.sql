
DROP POLICY IF EXISTS "Public read locations" ON public.locations;
DROP POLICY IF EXISTS "Public insert locations" ON public.locations;
DROP POLICY IF EXISTS "Public delete locations" ON public.locations;

REVOKE ALL ON public.locations FROM anon;
REVOKE ALL ON public.locations FROM authenticated;
GRANT ALL ON public.locations TO service_role;
