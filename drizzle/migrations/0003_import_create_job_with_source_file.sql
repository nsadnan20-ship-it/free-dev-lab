ALTER TABLE public.import_jobs ADD COLUMN IF NOT EXISTS file_name text;

CREATE OR REPLACE FUNCTION public.import_create_job(
  p_company_id uuid,
  p_entity_type text,
  p_total_rows integer,
  p_source_object_path text,
  p_file_name text,
  p_file_size bigint,
  p_file_mime text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_file_id uuid;
  v_job_id uuid;
  v_name text := NULLIF(trim(p_file_name), '');
  v_path text := NULLIF(trim(p_source_object_path), '');
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF v_name IS NULL OR length(v_name) > 512 THEN RAISE EXCEPTION 'FILE_NAME_INVALID'; END IF;
  IF v_path IS NULL OR position((v_company_id::text || '/') in v_path) <> 1 OR v_path LIKE '%..%' THEN
    RAISE EXCEPTION 'SOURCE_OBJECT_PATH_INVALID';
  END IF;

  INSERT INTO file_records(company_id, file_name, file_extension, file_mime, file_size, status, security_status, metadata)
  VALUES (v_company_id, v_name, lower(substring(v_name from '\.([^.]+)$')), p_file_mime, GREATEST(COALESCE(p_file_size,0),0),
          'uploaded', 'pending', jsonb_build_object('storage_bucket','documents','storage_path',v_path))
  RETURNING id INTO v_file_id;

  INSERT INTO import_jobs(company_id, file_record_id, file_name, job_type, entity_type, status, processing_mode,
                          total_rows, processed_rows, progress, result_summary, idempotency_key, created_at, updated_at)
  VALUES (v_company_id, v_file_id, v_name, 'import', COALESCE(p_entity_type,'import'), 'processing', 'import',
          GREATEST(COALESCE(p_total_rows,0),0), 0, 0, jsonb_build_object('entity_type',p_entity_type),
          'upload:' || v_file_id::text, now(), now())
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.import_create_job(uuid,text,integer,text,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_create_job(uuid,text,integer,text,text,bigint,text) TO authenticated, service_role;