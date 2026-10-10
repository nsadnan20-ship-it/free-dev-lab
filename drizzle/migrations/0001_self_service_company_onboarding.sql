-- Lets a signed-in user with no company create their own workspace once.
-- The caller becomes its owner and default membership; no client-chosen ids.
CREATE OR REPLACE FUNCTION public.create_my_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'COMPANY_NAME_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_memberships WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'COMPANY_ALREADY_EXISTS';
  END IF;
  INSERT INTO public.companies (name) VALUES (v_name) RETURNING id INTO v_company;
  INSERT INTO public.company_memberships (company_id, user_id, role, is_active, is_default)
  VALUES (v_company, v_user, 'owner', true, true);
  RETURN v_company;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_my_company(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_company(text) TO authenticated;