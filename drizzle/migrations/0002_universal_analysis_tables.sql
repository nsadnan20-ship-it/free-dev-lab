CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_name text NOT NULL,
  file_hash text,
  row_count integer NOT NULL DEFAULT 0,
  column_count integer NOT NULL DEFAULT 0,
  archetype text,
  domain text,
  quality_score numeric,
  available_count integer NOT NULL DEFAULT 0,
  engine_version text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analyses select" ON public.analyses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own analyses insert" ON public.analyses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own analyses update" ON public.analyses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own analyses delete" ON public.analyses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.work_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  finding_id text,
  role text NOT NULL,
  title text NOT NULL,
  detail text,
  priority text NOT NULL DEFAULT 'medium',
  due_date date,
  status text NOT NULL DEFAULT 'todo',
  outcome_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_tasks TO authenticated;
GRANT ALL ON public.work_tasks TO service_role;
ALTER TABLE public.work_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks all" ON public.work_tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  verdict text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, finding_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decisions all" ON public.decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.mapping_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  header_norm text NOT NULL,
  field text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, header_norm)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mapping_feedback TO authenticated;
GRANT ALL ON public.mapping_feedback TO service_role;
ALTER TABLE public.mapping_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mapping all" ON public.mapping_feedback FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);