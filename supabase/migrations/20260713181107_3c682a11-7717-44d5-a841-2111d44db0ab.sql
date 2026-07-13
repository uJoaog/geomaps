
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  link TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read locations" ON public.locations FOR SELECT USING (true);
CREATE POLICY "Public insert locations" ON public.locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete locations" ON public.locations FOR DELETE USING (true);
