SET LOCAL check_function_bodies = false;
SET LOCAL search_path = public, extensions;
CREATE TABLE public.metric_governance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    metric_id text NOT NULL,
    version integer NOT NULL,
    name text NOT NULL,
    definition text NOT NULL,
    formula text NOT NULL,
    source jsonb DEFAULT '[]'::jsonb NOT NULL,
    dimensions jsonb DEFAULT '[]'::jsonb NOT NULL,
    filters jsonb DEFAULT '[]'::jsonb NOT NULL,
    time_semantics jsonb DEFAULT '{}'::jsonb NOT NULL,
    freshness jsonb DEFAULT '{}'::jsonb NOT NULL,
    owner text NOT NULL,
    certification_status text DEFAULT 'DRAFT'::text NOT NULL,
    dependencies jsonb DEFAULT '[]'::jsonb NOT NULL,
    consumers jsonb DEFAULT '[]'::jsonb NOT NULL,
    tests jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deprecated_at timestamp with time zone,
    CONSTRAINT metric_governance_certification_status_check CHECK ((certification_status = ANY (ARRAY['DRAFT'::text, 'REVIEWED'::text, 'CERTIFIED'::text, 'DEPRECATED'::text]))),
    CONSTRAINT metric_governance_version_check CHECK ((version > 0))
);
CREATE FUNCTION public.accept_completed_report_evidence_batch(p_company_id uuid, p_limit integer DEFAULT 100) RETURNS TABLE(job_id uuid, source_path text, source_hash text, state text, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    SET statement_timeout TO '60s'
    AS $$
DECLARE r record; v_result jsonb; v_limit integer:=least(greatest(coalesce(p_limit,100),1),500);
BEGIN
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_TENANT_REQUIRED'; END IF;
  FOR r IN SELECT j.id,j.source_path,j.source_hash FROM public.report_execution_jobs j WHERE j.company_id=p_company_id AND j.status='completed' AND coalesce(j.checkpoint->>'stage','')='rendered' ORDER BY j.updated_at DESC,j.id ASC LIMIT v_limit LOOP
    BEGIN
      v_result:=public.refresh_report_evidence_passport(p_company_id,r.id);
      job_id:=r.id; source_path:=r.source_path; source_hash:=r.source_hash;
      state:=CASE WHEN v_result->>'verificationStatus'='VERIFIED' THEN 'VERIFIED' WHEN v_result->>'canonicalCoverage'='PARTIAL' THEN 'GAP_DETECTED' ELSE 'REVIEW' END;
      reason:=coalesce(v_result->>'decisionReadiness','REVIEW');
    EXCEPTION WHEN OTHERS THEN
      job_id:=r.id; source_path:=r.source_path; source_hash:=r.source_hash; state='REVIEW'; reason=SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;
CREATE TABLE public.alternative_item_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    group_id uuid NOT NULL,
    sku text NOT NULL,
    conversion_factor numeric(18,6) DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alternative_item_group_members_conversion_factor_check CHECK ((conversion_factor > (0)::numeric))
);
CREATE FUNCTION public.add_alternative_item_group_member(p_company_id uuid, p_group_id uuid, p_sku text, p_conversion_factor numeric DEFAULT 1) RETURNS public.alternative_item_group_members
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_member public.alternative_item_group_members;
BEGIN
  IF v_company IS NULL OR p_company_id IS NULL OR p_company_id <> v_company THEN
    RAISE EXCEPTION 'tenant resolution failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.alternative_item_groups
    WHERE id = p_group_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'group does not belong to current tenant';
  END IF;
  IF NULLIF(trim(p_sku), '') IS NULL THEN
    RAISE EXCEPTION 'SKU is required';
  END IF;
  IF p_conversion_factor IS NULL OR p_conversion_factor <= 0 THEN
    RAISE EXCEPTION 'conversion factor must be greater than zero';
  END IF;
  INSERT INTO public.alternative_item_group_members(company_id, group_id, sku, conversion_factor)
  VALUES (v_company, p_group_id, trim(p_sku), p_conversion_factor)
  RETURNING * INTO v_member;
  RETURN v_member;
END;
$$;
CREATE FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_worker_id text, p_checkpoint jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare affected integer;
begin
  update public.report_execution_jobs
     set checkpoint = coalesce(p_checkpoint, '{}'::jsonb), status = 'processing', updated_at = now()
   where id = p_job_id and company_id = public.current_company_id()
     and status in ('leased', 'processing') and lease_owner = p_worker_id
     and lease_expires_at is not null and lease_expires_at > now();
  get diagnostics affected = row_count; return affected > 0;
end;
$$;
CREATE FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_checkpoint jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare affected integer; old_stage text; new_stage text; old_hash text; new_hash text; old_pos integer; new_pos integer;
begin
  if p_company_id is null then raise exception 'Worker company context is required'; end if;
  if p_checkpoint is null or jsonb_typeof(p_checkpoint)<>'object' then raise exception 'Checkpoint must be a JSON object'; end if;
  new_stage=p_checkpoint->>'stage'; new_hash=p_checkpoint->>'sourceHash';
  if new_stage is null or new_stage not in ('queued','fingerprinted','extracted','canonicalized','validated','analyzed','decisioned','committed','rendered') then raise exception 'Checkpoint stage is invalid'; end if;
  if new_hash is null or btrim(new_hash)='' then raise exception 'Checkpoint source hash is required'; end if;
  if jsonb_typeof(p_checkpoint->'evidenceKeys') is distinct from 'array' then raise exception 'Checkpoint evidenceKeys must be an array'; end if;
  select checkpoint->>'stage',checkpoint->>'sourceHash' into old_stage,old_hash from public.report_execution_jobs where id=p_job_id and company_id=p_company_id and status in ('leased','processing') and lease_owner=p_worker_id and lease_token=p_lease_token and lease_expires_at is not null and lease_expires_at>now() for update;
  if not found then return false; end if;
  if old_hash is not null and btrim(old_hash)<>'' and old_hash<>new_hash then raise exception 'Checkpoint source hash cannot change during a run'; end if;
  if old_stage is null then
    if new_stage<>'queued' then raise exception 'Initial checkpoint stage must be queued'; end if;
  else
    old_pos=array_position(array['queued','fingerprinted','extracted','canonicalized','validated','analyzed','decisioned','committed','rendered'],old_stage);
    new_pos=array_position(array['queued','fingerprinted','extracted','canonicalized','validated','analyzed','decisioned','committed','rendered'],new_stage);
    if old_pos is null or new_pos<>old_pos+1 then raise exception 'Invalid checkpoint transition: % -> %',old_stage,new_stage; end if;
  end if;
  update public.report_execution_jobs set checkpoint=p_checkpoint,status='processing',updated_at=now() where id=p_job_id and company_id=p_company_id and status in ('leased','processing') and lease_owner=p_worker_id and lease_token=p_lease_token and lease_expires_at is not null and lease_expires_at>now();
  get diagnostics affected=row_count; return affected=1;
end;$$;
CREATE FUNCTION public.audit_decision_runtime_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_company uuid; v_entity_id uuid; v_action text;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  IF v_company IS NULL OR v_company <> public.current_company_id() THEN
    RAISE EXCEPTION 'AUDIT_TENANT_CONTEXT_MISMATCH';
  END IF;
  v_entity_id := COALESCE(NEW.id, OLD.id);
  v_action := TG_TABLE_NAME || ':' || lower(TG_OP);
  INSERT INTO public.audit_logs(company_id, action, entity_type, entity_id, old_value, new_value, source, user_label, correlation_id)
  VALUES (v_company, v_action, TG_TABLE_NAME, v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    'decision-runtime', auth.uid()::text, v_entity_id::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE FUNCTION public.audit_operational_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid := coalesce(new.company_id, old.company_id);
  v_entity_id uuid := coalesce(new.id, old.id);
begin
  if v_company is null then
    raise exception 'AUDIT_COMPANY_REQUIRED';
  end if;
  if v_company <> public.current_company_id() then
    raise exception 'AUDIT_TENANT_CONTEXT_MISMATCH';
  end if;
  insert into public.audit_logs (
    company_id, action, entity_type, entity_id,
    old_value, new_value, source, user_label, correlation_id
  ) values (
    v_company,
    tg_table_name || ':' || lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    'operations-runtime',
    auth.uid()::text,
    v_entity_id::text
  );
  return coalesce(new, old);
end;
$$;
CREATE FUNCTION public.autonomy_runtime_gate(p_domain_key text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT jsonb_build_object(
    'domain', p_domain_key,
    'eligible', public.can_enter_phase_l_autonomy(p_domain_key),
    'health', public.compute_control_plane_health(),
    'trust_healthy', public.is_continuous_trust_healthy('production'),
    'critical_drift', EXISTS (
      SELECT 1 FROM public.control_plane_drift_events d
      WHERE d.company_id = public.current_company_id()
        AND d.severity IN ('high','critical')
        AND d.status IN ('open','blocked')
    )
  );
$$;
CREATE FUNCTION public.billing_check_entitlement(p_capability text, p_quantity numeric DEFAULT 1) RETURNS TABLE(company_id uuid, capability text, allowed boolean, reason text, plan_code text, enabled boolean, monthly_limit numeric, used numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_status text;
  v_plan_id uuid;
  v_plan_code text;
  v_enabled boolean;
  v_limit numeric;
  v_used numeric := 0;
  v_period_start date := date_trunc('month', current_date)::date;
  v_grace_ends_at timestamptz;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'BILLING_QUANTITY_INVALID';
  end if;
  select s.status, s.plan_id, s.grace_ends_at, p.code
    into v_status, v_plan_id, v_grace_ends_at, v_plan_code
    from public.billing_subscriptions s
    join public.billing_plans p on p.id = s.plan_id and p.active = true
   where s.company_id = v_company_id;
  if not found then
    return query select v_company_id, p_capability, false, 'SUBSCRIPTION_NOT_CONFIGURED', null::text, false, null::numeric, 0::numeric;
    return;
  end if;
  select c.enabled, c.monthly_limit
    into v_enabled, v_limit
    from public.billing_plan_capabilities c
   where c.plan_id = v_plan_id and c.capability = p_capability;
  if not found then
    return query select v_company_id, p_capability, false, 'CAPABILITY_NOT_CONFIGURED', v_plan_code, false, null::numeric, 0::numeric;
    return;
  end if;
  select coalesce(sum(quantity),0)
    into v_used
    from public.billing_usage_events
   where company_id = v_company_id and capability = p_capability and period_start = v_period_start;
  if v_status = 'active' or v_status = 'trialing' then
    null;
  elsif v_status = 'past_due' and v_grace_ends_at is not null and v_grace_ends_at >= clock_timestamp() then
    null;
  else
    return query select v_company_id, p_capability, false, upper(v_status), v_plan_code, v_enabled, v_limit, v_used;
    return;
  end if;
  if not v_enabled then
    return query select v_company_id, p_capability, false, 'CAPABILITY_DISABLED', v_plan_code, v_enabled, v_limit, v_used;
  elsif v_limit is not null and v_used + p_quantity > v_limit then
    return query select v_company_id, p_capability, false, 'QUOTA_EXCEEDED', v_plan_code, v_enabled, v_limit, v_used;
  else
    return query select v_company_id, p_capability, true, 'ACTIVE', v_plan_code, v_enabled, v_limit, v_used;
  end if;
end;
$$;
CREATE FUNCTION public.billing_current_subscription() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_row record;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select s.id, s.company_id, s.plan_id, s.status, s.provider, s.current_period_start,
         s.current_period_end, s.trial_ends_at, s.grace_ends_at, s.cancel_at_period_end,
         p.code as plan_code, p.name as plan_name, p.monthly_amount_minor, p.currency, p.interval
    into v_row
    from public.billing_subscriptions s
    join public.billing_plans p on p.id = s.plan_id
   where s.company_id = v_company_id;
  if not found then
    return jsonb_build_object('status','NOT_CONFIGURED','company_id',v_company_id);
  end if;
  return jsonb_build_object(
    'status', v_row.status,
    'company_id', v_row.company_id,
    'subscription_id', v_row.id,
    'plan_id', v_row.plan_id,
    'plan_code', v_row.plan_code,
    'plan_name', v_row.plan_name,
    'provider', v_row.provider,
    'current_period_start', v_row.current_period_start,
    'current_period_end', v_row.current_period_end,
    'trial_ends_at', v_row.trial_ends_at,
    'grace_ends_at', v_row.grace_ends_at,
    'cancel_at_period_end', v_row.cancel_at_period_end,
    'monthly_amount_minor', v_row.monthly_amount_minor,
    'currency', v_row.currency,
    'interval', v_row.interval
  );
end;
$$;
CREATE FUNCTION public.billing_record_usage(p_capability text, p_quantity numeric, p_idempotency_key text, p_source text DEFAULT 'app'::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_period_start date := date_trunc('month', current_date)::date;
  v_decision record;
  v_existing public.billing_usage_events%rowtype;
  v_row public.billing_usage_events%rowtype;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'BILLING_QUANTITY_INVALID';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'BILLING_IDEMPOTENCY_KEY_REQUIRED';
  end if;
  select * into v_existing
    from public.billing_usage_events
   where company_id = v_company_id and period_start = v_period_start and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.capability <> p_capability or v_existing.quantity <> p_quantity then
      raise exception 'BILLING_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('status','IDEMPOTENT_REPLAY','id',v_existing.id,'company_id',v_existing.company_id,'capability',v_existing.capability,'quantity',v_existing.quantity,'period_start',v_existing.period_start);
  end if;
  select * into v_decision from public.billing_check_entitlement(p_capability, p_quantity) limit 1;
  if not v_decision.allowed then
    raise exception 'ENTITLEMENT_DENIED:%', v_decision.reason;
  end if;
  insert into public.billing_usage_events(company_id, capability, quantity, period_start, idempotency_key, source, metadata)
  values(v_company_id, p_capability, p_quantity, v_period_start, trim(p_idempotency_key), coalesce(nullif(trim(p_source),''),'app'), coalesce(p_metadata,'{}'::jsonb))
  returning * into v_row;
  return jsonb_build_object('status','RECORDED','id',v_row.id,'company_id',v_row.company_id,'capability',v_row.capability,'quantity',v_row.quantity,'period_start',v_row.period_start,'idempotency_key',v_row.idempotency_key);
end;
$$;
CREATE FUNCTION public.billing_set_subscription(p_plan_id uuid, p_status text, p_current_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_current_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_trial_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_grace_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cancel_at_period_end boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_row public.billing_subscriptions%rowtype;
  v_role text;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  select role into v_role from public.company_memberships where company_id = v_company_id and user_id = auth.uid() and is_active = true limit 1;
  if coalesce(v_role,'') <> 'admin' then raise exception 'BILLING_ADMIN_REQUIRED'; end if;
  if p_status not in ('trialing','active','past_due','paused','cancelled','expired') then raise exception 'BILLING_STATUS_INVALID'; end if;
  if not exists (select 1 from public.billing_plans where id = p_plan_id and active = true) then raise exception 'BILLING_PLAN_NOT_FOUND'; end if;
  insert into public.billing_subscriptions(company_id, plan_id, status, current_period_start, current_period_end, trial_ends_at, grace_ends_at, cancel_at_period_end)
  values(v_company_id, p_plan_id, p_status, p_current_period_start, p_current_period_end, p_trial_ends_at, p_grace_ends_at, p_cancel_at_period_end)
  on conflict(company_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_ends_at = excluded.trial_ends_at,
    grace_ends_at = excluded.grace_ends_at,
    cancel_at_period_end = excluded.cancel_at_period_end,
    updated_at = clock_timestamp()
  returning * into v_row;
  insert into public.billing_subscription_events(company_id, subscription_id, provider, provider_event_id, event_type, to_status, payload)
  values(v_company_id, v_row.id, v_row.provider, 'manual:' || v_row.id::text || ':' || extract(epoch from clock_timestamp())::bigint, 'MANUAL_SUBSCRIPTION_UPDATE', v_row.status, '{}'::jsonb);
  return jsonb_build_object('status','UPDATED','subscription_id',v_row.id,'company_id',v_row.company_id,'plan_id',v_row.plan_id,'subscription_status',v_row.status);
end;
$$;
CREATE FUNCTION public.can_certify_autonomous_domain(p_domain_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.autonomy_domain_controls c
    WHERE c.company_id = public.current_company_id()
      AND c.domain_key = p_domain_key
      AND c.enabled
      AND c.trust_state = 'eligible'
      AND c.rollback_enabled
  )
  AND public.is_continuous_trust_healthy('production')
  AND NOT EXISTS (
    SELECT 1
    FROM public.control_plane_drift_events d
    WHERE d.company_id = public.current_company_id()
      AND d.severity = 'critical'
      AND d.status IN ('open','blocked')
  );
$$;
CREATE FUNCTION public.can_enter_phase_l_autonomy(p_domain_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT public.can_certify_autonomous_domain(p_domain_key)
    AND public.compute_control_plane_health() >= .9
    AND NOT EXISTS (
      SELECT 1 FROM public.control_plane_drift_events
      WHERE company_id = public.current_company_id()
        AND severity IN ('high','critical')
        AND status IN ('open','blocked')
    );
$$;
CREATE FUNCTION public.can_execute_bi_decision(p_decision_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_intelligence_decisions d
    JOIN public.governance_policies p
      ON p.company_id = d.company_id
     AND p.policy_key = d.policy_key
     AND p.status = 'active'
     AND p.effective_at <= now()
     AND (p.expires_at IS NULL OR p.expires_at > now())
    LEFT JOIN public.business_risk_budgets b
      ON b.company_id = d.company_id
     AND b.domain = d.decision_type
     AND b.status = 'active'
    WHERE d.company_id = public.current_company_id()
      AND d.decision_key = p_decision_key
      AND d.status = 'APPROVED'
      AND COALESCE(d.confidence, 0) >= 0.80
      AND COALESCE(jsonb_typeof(d.evidence), 'null') = 'object'
      AND (b.id IS NULL OR b.consumed_risk < b.max_risk)
  )
  AND public.is_continuous_trust_healthy('production');
$$;
CREATE FUNCTION public.can_execute_control_plane_run(p_run_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.control_plane_optimization_runs r
    WHERE r.company_id = public.current_company_id()
      AND r.run_key = p_run_key
      AND r.status = 'approved'
      AND r.risk_budget IS NOT NULL
      AND r.risk_budget >= 0
      AND r.liquidity_reserved IS NOT NULL
      AND r.liquidity_reserved >= 0
      AND r.service_level_target IS NOT NULL
      AND r.service_level_target >= 0
      AND jsonb_typeof(r.evidence) = 'object'
      AND jsonb_typeof(r.evidence->'source_refs') = 'array'
      AND jsonb_array_length(r.evidence->'source_refs') > 0
  )
  AND public.is_continuous_trust_healthy('production')
  AND NOT EXISTS (
    SELECT 1
    FROM public.control_plane_drift_events d
    WHERE d.company_id = public.current_company_id()
      AND d.status IN ('open','blocked')
      AND d.severity = 'critical'
  );
$$;
CREATE FUNCTION public.can_release_production_certification(p_bundle_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM production_certification_bundles b
    WHERE b.company_id=public.current_company_id() AND b.bundle_key=p_bundle_key AND b.status='passed'
      AND b.tenant_isolation_passed AND b.storage_passed AND b.realtime_passed AND b.ai_isolation_passed
      AND b.backup_restore_passed AND b.migration_parity_passed AND b.artifact_integrity_passed
      AND b.rollback_passed AND b.security_audit_passed
  ) AND public.is_continuous_trust_healthy('production')
    AND NOT EXISTS (SELECT 1 FROM control_plane_drift_events d WHERE d.company_id=public.current_company_id() AND d.severity='critical' AND d.status IN ('open','blocked'));
$$;
CREATE FUNCTION public.can_run_phase_l_autonomy(p_domain_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_company_id() IS NOT NULL
    AND public.can_enter_phase_l_autonomy(p_domain_key)
    AND public.is_continuous_trust_healthy('production');
$$;
CREATE FUNCTION public.cash_liquidity_snapshot(p_company_id uuid, p_from date DEFAULT CURRENT_DATE, p_to date DEFAULT (CURRENT_DATE + 30)) RETURNS TABLE(period_date date, inflows numeric, outflows numeric, net_cash numeric, cumulative_net numeric, risk_level text)
    LANGUAGE sql STABLE
    AS $$
WITH days AS (
 SELECT generate_series(p_from,p_to,'1 day')::date d
), flow AS (
 SELECT payment_date d,
        sum(amount) FILTER (WHERE direction='in') inflow,
        sum(amount) FILTER (WHERE direction='out') outflow
 FROM payments
 WHERE company_id=p_company_id AND payment_date BETWEEN p_from AND p_to
 GROUP BY payment_date
), x AS (
 SELECT days.d, coalesce(inflow,0) inflow, coalesce(outflow,0) outflow
 FROM days LEFT JOIN flow ON flow.d=days.d
), y AS (
 SELECT d,inflow,outflow,inflow-outflow net,
        sum(inflow-outflow) OVER (ORDER BY d) cumulative
 FROM x
)
SELECT d,inflow,outflow,net,cumulative,
       CASE WHEN cumulative < 0 THEN 'critical'
            WHEN cumulative < greatest(outflow,1) THEN 'high'
            ELSE 'normal' END
FROM y ORDER BY d;
$$;
CREATE FUNCTION public.claim_report_execution_job(p_job_id uuid, p_company_id uuid, p_lease_owner text, p_lease_seconds integer DEFAULT 300) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare claimed_row jsonb;
begin
  if p_company_id is null then raise exception 'Worker company context is required'; end if;
  if p_lease_owner is null or btrim(p_lease_owner)='' then raise exception 'Worker lease owner is required'; end if;
  if p_lease_seconds is null or p_lease_seconds<30 then raise exception 'Worker lease must be at least 30 seconds'; end if;
  update public.report_execution_jobs set status='dead_letter',lease_owner=null,lease_token=null,lease_expires_at=null,last_error=jsonb_build_object('code','lease_expired_max_attempts','message','Lease expired after the maximum attempt budget was exhausted','at',now()),updated_at=now()
    where id=p_job_id and company_id=p_company_id and status in ('leased','processing') and lease_expires_at is not null and lease_expires_at<=now() and attempt>=max_attempts;
  update public.report_execution_jobs set status='leased',lease_owner=p_lease_owner,lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),attempt=attempt+1,updated_at=now()
    where id=p_job_id and company_id=p_company_id and status in ('queued','leased','processing') and (lease_expires_at is null or lease_expires_at<=now()) and attempt<max_attempts
    returning jsonb_build_object('id',id,'company_id',company_id,'job_key',job_key,'source_path',source_path,'source_hash',source_hash,'status',status,'checkpoint',checkpoint,'attempt',attempt,'max_attempts',max_attempts,'lease_owner',lease_owner,'lease_token',lease_token,'lease_expires_at',lease_expires_at) into claimed_row;
  return claimed_row;
end;$$;
CREATE TABLE public.report_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    report_id uuid,
    requested_by uuid,
    idempotency_key text NOT NULL,
    request_fingerprint text NOT NULL,
    source_snapshot_id uuid,
    status text DEFAULT 'queued'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    worker_id text,
    lease_expires_at timestamp with time zone,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    formats jsonb DEFAULT '[]'::jsonb NOT NULL,
    input_fingerprint text NOT NULL,
    engine_version text DEFAULT 'report-engine/1'::text NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    error_code text,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);
CREATE FUNCTION public.claim_report_run(p_worker_id text, p_lease_seconds integer DEFAULT 120) RETURNS SETOF public.report_runs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.current_company_id() IS NULL THEN RAISE EXCEPTION 'tenant context is required'; END IF;
  RETURN QUERY WITH candidate AS (
    SELECT id FROM report_runs WHERE company_id=public.current_company_id() AND (status='queued' OR (status='running' AND lease_expires_at < now()))
    AND attempts < max_attempts ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE report_runs r SET status='running',attempts=r.attempts+1,worker_id=p_worker_id,
    lease_expires_at=now()+make_interval(secs=>greatest(10,p_lease_seconds)),started_at=coalesce(r.started_at,now()),updated_at=now()
  FROM candidate c WHERE r.id=c.id RETURNING r.*;
END; $$;
CREATE FUNCTION public.clear_cart() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
begin
  delete from public.cart_items ci
  using public.carts c
  where ci.cart_id = c.id
    and c.user_id = auth.uid()
    and c.customer_id = public.current_customer_id()
    and c.company_id = public.current_customer_company_id();
end;
$$;
CREATE FUNCTION public.complete_decision_work_item(p_work_item_id uuid, p_actual_impact numeric, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_expected numeric;
  v_decision uuid;
  v_recommendation_key text;
  v_status text;
  v_assignee uuid;
  v_evidence_snapshot_id text := NULLIF(btrim(COALESCE(p_evidence->>'evidence_snapshot_id', '')), '');
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_evidence IS NOT NULL AND jsonb_typeof(p_evidence) <> 'object' THEN RAISE EXCEPTION 'OUTCOME_EVIDENCE_OBJECT_REQUIRED'; END IF;
  SELECT w.expected_impact, w.decision_id, w.status, w.assignee_id
    INTO v_expected, v_decision, v_status, v_assignee
  FROM public.decision_work_items w
  JOIN public.business_intelligence_decisions d
    ON d.id = w.decision_id AND d.company_id = v_company AND d.status = 'APPROVED'
  WHERE w.id = p_work_item_id AND w.company_id = v_company
  FOR UPDATE OF w;
  IF v_decision IS NULL THEN RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND_OR_DECISION_NOT_APPROVED'; END IF;
  IF v_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'WORK_ITEM_NOT_EXECUTABLE'; END IF;
  IF v_assignee IS NOT NULL AND v_assignee <> v_user THEN RAISE EXCEPTION 'WORK_ITEM_ASSIGNEE_FORBIDDEN'; END IF;
  IF v_evidence_snapshot_id IS NULL THEN RAISE EXCEPTION 'OUTCOME_EVIDENCE_REQUIRED'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.kpi_evidence_snapshots s WHERE s.id::text = v_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.business_state_snapshots s WHERE s.id::text = v_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.import_snapshots s WHERE s.id::text = v_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.operational_health_snapshots s WHERE s.id::text = v_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.decision_action_receipts r WHERE r.id::text = v_evidence_snapshot_id AND r.company_id = v_company AND r.status IN ('SUCCEEDED','RUNNING'))
  ) THEN RAISE EXCEPTION 'OUTCOME_EVIDENCE_NOT_FOUND_OR_FORBIDDEN'; END IF;
  UPDATE public.decision_work_items
    SET status='COMPLETED', actual_impact=p_actual_impact, completed_at=now(), updated_at=now()
  WHERE id=p_work_item_id AND company_id=v_company AND status='IN_PROGRESS';
  IF NOT FOUND THEN RAISE EXCEPTION 'WORK_ITEM_STATE_CHANGED'; END IF;
  SELECT COALESCE(r.id::text, d.decision_key)
    INTO v_recommendation_key
  FROM public.business_intelligence_decisions d
  LEFT JOIN public.recommendations r ON r.id=d.recommendation_id AND r.company_id=v_company
  WHERE d.id=v_decision AND d.company_id=v_company;
  v_status := CASE
    WHEN p_actual_impact IS NULL OR v_expected IS NULL THEN 'insufficient'
    WHEN p_actual_impact > v_expected THEN 'positive'
    WHEN p_actual_impact = v_expected THEN 'neutral'
    ELSE 'negative'
  END;
  INSERT INTO public.recommendation_outcomes(
    company_id,recommendation_key,decision_id,expected_impact,actual_impact,observed_by,status,evidence
  ) VALUES (
    v_company,v_recommendation_key,v_decision,v_expected,p_actual_impact,v_user,v_status,
    COALESCE(p_evidence,'{}'::jsonb) || jsonb_build_object(
      'work_item_id',p_work_item_id,
      'evidence_snapshot_id',v_evidence_snapshot_id,
      'outcome_delta',CASE WHEN v_expected IS NULL OR p_actual_impact IS NULL THEN NULL ELSE p_actual_impact-v_expected END,
      'outcome_actor_provenance','AUTHENTICATED_WORK_ITEM_COMPLETER'
    )
  )
  ON CONFLICT(company_id,recommendation_key) DO UPDATE
    SET actual_impact=EXCLUDED.actual_impact,
        observed_by=EXCLUDED.observed_by,
        status=EXCLUDED.status,
        observed_at=now(),
        evidence=EXCLUDED.evidence;
  IF EXISTS (
    SELECT 1 FROM public.decision_work_items w
    WHERE w.company_id=v_company AND w.decision_id=v_decision AND w.status <> 'COMPLETED'
  ) THEN
    RETURN true;
  END IF;
  UPDATE public.business_intelligence_decisions
    SET status='EXECUTED',executed_at=now()
  WHERE id=v_decision AND company_id=v_company AND status='APPROVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'DECISION_STATE_CHANGED'; END IF;
  RETURN true;
END;
$$;
COMMENT ON FUNCTION public.complete_decision_work_item(p_work_item_id uuid, p_actual_impact numeric, p_evidence jsonb) IS 'Canonical terminal boundary: only IN_PROGRESS work items attached to tenant-scoped APPROVED decisions can complete, and completion requires explicit outcome evidence provenance.';
CREATE FUNCTION public.complete_report_execution_job(p_job_id uuid, p_worker_id text, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare affected integer;
begin
  update public.report_execution_jobs
     set status = 'completed', evidence = coalesce(p_evidence, '{}'::jsonb), lease_owner = null,
         lease_expires_at = null, completed_at = now(), updated_at = now()
   where id = p_job_id and company_id = public.current_company_id()
     and status in ('leased', 'processing') and lease_owner = p_worker_id
     and lease_expires_at is not null and lease_expires_at > now();
  get diagnostics affected = row_count; return affected > 0;
end;
$$;
CREATE FUNCTION public.complete_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  affected integer;
  v_company_id uuid := public.current_company_id();
  v_is_service_role boolean := COALESCE(auth.jwt()->>'role','') = 'service_role';
  v_passport_result jsonb;
  v_passport_error text;
BEGIN
  IF NOT v_is_service_role AND (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
  END IF;
  IF p_company_id IS NULL OR p_job_id IS NULL OR p_worker_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'REPORT_EXECUTION_COMPLETE_INPUT_INVALID';
  END IF;
  IF NOT v_is_service_role AND (v_company_id IS NULL OR p_company_id IS DISTINCT FROM v_company_id) THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence)<>'object' THEN
    RAISE EXCEPTION 'REPORT_EXECUTION_COMPLETION_EVIDENCE_INVALID';
  END IF;
  UPDATE public.report_execution_jobs
  SET status='completed',
      evidence=coalesce(p_evidence,'{}'::jsonb),
      completed_at=clock_timestamp(),
      updated_at=clock_timestamp(),
      lease_owner=null,
      lease_token=null,
      lease_expires_at=null
  WHERE id=p_job_id
    AND company_id=p_company_id
    AND lease_owner=p_worker_id
    AND lease_token=p_lease_token
    AND lease_expires_at>clock_timestamp()
    AND status IN ('leased','processing')
    AND checkpoint->>'stage'='rendered';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN
    RETURN false;
  END IF;
  IF (
    SELECT count(*)
    FROM public.report_execution_tasks
    WHERE company_id=p_company_id AND report_execution_job_id=p_job_id
  ) <> 9 THEN
    RAISE EXCEPTION 'REPORT_EXECUTION_TASK_LEDGER_INCOMPLETE';
  END IF;
  UPDATE public.report_execution_tasks
  SET status='completed',
      attempt=GREATEST(attempt,1),
      started_at=COALESCE(started_at,clock_timestamp()),
      completed_at=COALESCE(completed_at,clock_timestamp()),
      evidence=coalesce(evidence,'{}'::jsonb) ||
        jsonb_build_object('completionEvidence',coalesce(p_evidence,'{}'::jsonb),'ledgerUpdatedAt',clock_timestamp()),
      last_error='{}'::jsonb,
      updated_at=clock_timestamp()
  WHERE company_id=p_company_id AND report_execution_job_id=p_job_id;
  IF (
    SELECT count(*)
    FROM public.report_execution_tasks
    WHERE company_id=p_company_id AND report_execution_job_id=p_job_id AND status='completed'
  ) <> 9 THEN
    RAISE EXCEPTION 'REPORT_EXECUTION_TASK_LEDGER_COMPLETION_FAILED';
  END IF;
  BEGIN
    v_passport_result := public.refresh_report_evidence_passport(p_company_id,p_job_id);
    UPDATE public.report_execution_jobs
       SET evidence = coalesce(evidence,'{}'::jsonb)
         || jsonb_build_object(
              'evidencePassportRefresh',
              jsonb_build_object(
                'status','COMPLETED',
                'result',v_passport_result
              )
            ),
           updated_at=clock_timestamp()
     WHERE id=p_job_id AND company_id=p_company_id;
  EXCEPTION WHEN OTHERS THEN
    v_passport_error := SQLERRM;
    UPDATE public.report_execution_jobs
       SET evidence = coalesce(evidence,'{}'::jsonb)
         || jsonb_build_object(
              'evidencePassportRefresh',
              jsonb_build_object(
                'status','PENDING',
                'error',v_passport_error
              )
            ),
           updated_at=clock_timestamp()
     WHERE id=p_job_id AND company_id=p_company_id;
  END;
  RETURN true;
END;
$$;
CREATE FUNCTION public.complete_report_run(p_run_id uuid, p_worker_id text, p_status text, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_status NOT IN ('running','succeeded','failed','cancelled') THEN RAISE EXCEPTION 'invalid report run status'; END IF;
  UPDATE report_runs SET status=p_status,error_code=p_error_code,error_message=p_error_message,lease_expires_at=NULL,worker_id=NULL,
    completed_at=CASE WHEN p_status IN ('succeeded','failed','cancelled') THEN now() ELSE completed_at END,updated_at=now()
  WHERE id=p_run_id AND company_id=public.current_company_id() AND worker_id=p_worker_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run not found, wrong tenant, or lease not owned'; END IF;
END; $$;
CREATE FUNCTION public.compute_control_plane_health() RETURNS numeric
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  WITH latest AS (
    SELECT
      COALESCE((SELECT quality_score FROM public.business_state_snapshots WHERE company_id=public.current_company_id() ORDER BY observed_at DESC LIMIT 1),0) AS data_score,
      COALESCE((SELECT AVG(CASE WHEN quality='verified' THEN 1 WHEN quality='estimated' THEN .7 ELSE 0 END) FROM public.executive_kpi_lineage WHERE company_id=public.current_company_id()),0) AS evidence_score,
      COALESCE((SELECT AVG(CASE WHEN status IN ('positive','neutral') THEN 1 WHEN status='negative' THEN .3 ELSE .5 END) FROM public.recommendation_outcomes WHERE company_id=public.current_company_id()),.5) AS decision_score,
      COALESCE((SELECT AVG(CASE WHEN status='completed' THEN 1 WHEN status IN ('blocked','failed') THEN 0 ELSE .5 END) FROM public.report_execution_jobs WHERE company_id=public.current_company_id()),.5) AS execution_score,
      (SELECT count(*) FROM public.control_plane_drift_events WHERE company_id=public.current_company_id() AND severity='critical' AND status IN ('open','blocked')) AS blockers
  )
  SELECT GREATEST(0,LEAST(1,((data_score+evidence_score+decision_score+execution_score)/4) - LEAST(.5,blockers*.1))) FROM latest;
$$;
CREATE TABLE public.alternative_item_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    base_unit text DEFAULT 'unit'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE FUNCTION public.create_alternative_item_group(p_company_id uuid, p_name text, p_description text DEFAULT NULL::text, p_base_unit text DEFAULT 'unit'::text) RETURNS public.alternative_item_groups
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_group public.alternative_item_groups;
BEGIN
  IF v_company IS NULL OR p_company_id IS NULL OR p_company_id <> v_company THEN
    RAISE EXCEPTION 'tenant resolution failed';
  END IF;
  IF NULLIF(trim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'group name is required';
  END IF;
  INSERT INTO public.alternative_item_groups(company_id, name, description, base_unit)
  VALUES (v_company, trim(p_name), NULLIF(trim(p_description), ''), COALESCE(NULLIF(trim(p_base_unit), ''), 'unit'))
  RETURNING * INTO v_group;
  RETURN v_group;
END;
$$;
CREATE FUNCTION public.create_decision_action_receipt(p_work_item_id uuid, p_idempotency_key text, p_decision_fingerprint text, p_evidence_snapshot_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_existing uuid;
BEGIN
  IF v_company IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF NULLIF(trim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.decision_work_items w
    JOIN public.business_intelligence_decisions d ON d.id=w.decision_id AND d.company_id=w.company_id
    WHERE w.id=p_work_item_id AND w.company_id=v_company AND w.status='IN_PROGRESS' AND d.status='APPROVED'
  ) THEN RAISE EXCEPTION 'WORK_ITEM_NOT_EXECUTABLE'; END IF;
  SELECT id INTO v_existing FROM public.decision_action_receipts
    WHERE company_id=v_company AND idempotency_key=p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO public.decision_action_receipts(
    company_id,work_item_id,idempotency_key,status,attempt,evidence_snapshot_id,decision_fingerprint
  ) VALUES(v_company,p_work_item_id,p_idempotency_key,'ACCEPTED',1,p_evidence_snapshot_id,p_decision_fingerprint)
  ON CONFLICT(company_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.decision_action_receipts
      WHERE company_id=v_company AND idempotency_key=p_idempotency_key;
  END IF;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.create_decision_work_item(p_decision_id uuid, p_recommendation_id uuid, p_department text, p_assignee_id uuid, p_assignee_label text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone, p_expected_impact numeric, p_evidence_refs jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_company is null or v_user is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.company_memberships m
    where m.company_id = v_company
      and m.user_id = v_user
      and m.is_active = true
      and lower(m.role) in ('owner','admin','administrator')
  ) then
    raise exception 'WORK_ITEM_MUTATION_FORBIDDEN';
  end if;
  if not exists (
    select 1
    from public.business_intelligence_decisions d
    where d.id = p_decision_id
      and d.company_id = v_company
      and d.status = 'APPROVED'
  ) then
    raise exception 'DECISION_NOT_APPROVED';
  end if;
  if p_recommendation_id is not null
     and not exists (
       select 1
       from public.recommendations r
       where r.id = p_recommendation_id
         and r.company_id = v_company
         and r.decision_id = p_decision_id
     ) then
    raise exception 'RECOMMENDATION_NOT_FOUND_OR_NOT_LINKED';
  end if;
  if p_assignee_id is null then
    raise exception 'WORK_ITEM_OWNER_REQUIRED';
  end if;
  if not exists (
    select 1
    from public.company_memberships m
    where m.company_id = v_company
      and m.user_id = p_assignee_id
      and m.is_active = true
  ) then
    raise exception 'ASSIGNEE_NOT_ACTIVE_TENANT_MEMBER';
  end if;
  if p_assignee_label is null or btrim(p_assignee_label) = '' then
    raise exception 'WORK_ITEM_OWNER_LABEL_REQUIRED';
  end if;
  if p_department is null or btrim(p_department) = '' then
    raise exception 'WORK_ITEM_DEPARTMENT_REQUIRED';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'WORK_ITEM_TITLE_REQUIRED';
  end if;
  if p_priority not in ('LOW','MEDIUM','HIGH','CRITICAL') then
    raise exception 'INVALID_WORK_ITEM_PRIORITY';
  end if;
  if p_evidence_refs is null
     or jsonb_typeof(p_evidence_refs) <> 'array'
     or jsonb_array_length(p_evidence_refs) = 0 then
    raise exception 'WORK_ITEM_EVIDENCE_REQUIRED';
  end if;
  insert into public.decision_work_items(
    company_id,
    decision_id,
    recommendation_id,
    department,
    assignee_id,
    assignee_label,
    title,
    description,
    priority,
    due_at,
    expected_impact,
    evidence_refs
  )
  values(
    v_company,
    p_decision_id,
    p_recommendation_id,
    p_department,
    p_assignee_id,
    p_assignee_label,
    p_title,
    p_description,
    p_priority,
    p_due_at,
    p_expected_impact,
    p_evidence_refs
  )
  returning id into v_id;
  return v_id;
end;
$$;
COMMENT ON FUNCTION public.create_decision_work_item(p_decision_id uuid, p_recommendation_id uuid, p_department text, p_assignee_id uuid, p_assignee_label text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone, p_expected_impact numeric, p_evidence_refs jsonb) IS 'Canonical decision action boundary: work items may only be created from tenant-scoped APPROVED decisions.';
CREATE FUNCTION public.create_runtime_decision(p_decision_key text, p_decision_type text, p_confidence numeric, p_expected_impact numeric, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_confidence IS NOT NULL AND (p_confidence < 0 OR p_confidence > 1) THEN
    RAISE EXCEPTION 'DECISION_CONFIDENCE_OUT_OF_RANGE';
  END IF;
  IF p_decision_key IS NULL OR btrim(p_decision_key) = '' THEN
    RAISE EXCEPTION 'DECISION_KEY_REQUIRED';
  END IF;
  INSERT INTO public.business_intelligence_decisions(
    company_id, decision_key, decision_type, status, confidence, expected_impact, evidence
  )
  VALUES(
    v_company, p_decision_key, p_decision_type, 'PROPOSED',
    p_confidence, p_expected_impact, coalesce(p_evidence, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.create_runtime_recommendation(p_category text, p_priority text, p_title text, p_description text DEFAULT NULL::text, p_evidence jsonb DEFAULT '{}'::jsonb, p_expected_impact numeric DEFAULT NULL::numeric, p_evidence_snapshot_id uuid DEFAULT NULL::uuid, p_metric_versions jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role','');
  v_id uuid;
  v_snapshot uuid;
  v_job uuid;
  v_hash text;
BEGIN
  IF v_role <> 'authenticated' OR v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_title IS NULL OR btrim(p_title)='' THEN RAISE EXCEPTION 'RECOMMENDATION_TITLE_REQUIRED'; END IF;
  IF p_evidence_snapshot_id IS NULL THEN RAISE EXCEPTION 'RECOMMENDATION_EVIDENCE_REQUIRED'; END IF;
  IF lower(coalesce(p_category,''))='source-intelligence' THEN
    BEGIN
      v_snapshot := nullif(p_evidence->>'evidenceSnapshotId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_snapshot := NULL;
    END;
    BEGIN
      v_job := nullif(p_evidence->>'reportExecutionJobId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_job := NULL;
    END;
    v_hash := nullif(trim(p_evidence->>'sourceHash'),'');
    IF v_snapshot IS NULL OR v_job IS NULL OR v_hash IS NULL OR p_evidence_snapshot_id IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.report_evidence_passports p
      WHERE p.company_id=v_company
        AND p.evidence_snapshot_id=v_snapshot
        AND p.report_execution_job_id=v_job
        AND p.source_hash=v_hash
        AND p.verification_status='VERIFIED'
        AND p.decision_readiness='READY'
    ) THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
  ELSIF NOT (
    EXISTS (SELECT 1 FROM public.kpi_evidence_snapshots s WHERE s.id=p_evidence_snapshot_id AND s.company_id=v_company)
    OR EXISTS (SELECT 1 FROM public.business_state_snapshots s WHERE s.id=p_evidence_snapshot_id AND s.company_id=v_company)
    OR EXISTS (SELECT 1 FROM public.import_snapshots s WHERE s.id=p_evidence_snapshot_id AND s.company_id=v_company)
    OR EXISTS (SELECT 1 FROM public.operational_health_snapshots s WHERE s.id=p_evidence_snapshot_id AND s.company_id=v_company)
    OR EXISTS (SELECT 1 FROM public.source_analysis_snapshots s WHERE s.id=p_evidence_snapshot_id AND s.company_id=v_company)
  ) THEN
    RAISE EXCEPTION 'RECOMMENDATION_EVIDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  INSERT INTO public.recommendations(
    company_id,category,priority,title,description,evidence,expected_impact,confidence,status,evidence_snapshot_id,metric_versions
  )
  VALUES(
    v_company,p_category,coalesce(nullif(p_priority,''),'medium'),p_title,p_description,
    coalesce(p_evidence,'{}'::jsonb),p_expected_impact,'CALCULATED','new',p_evidence_snapshot_id,coalesce(p_metric_versions,'{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.create_source_intelligence_proposal(p_report_job_id uuid, p_source_hash text, p_signal_id text, p_signal_title text, p_signal_message text, p_severity text, p_evidence jsonb, p_evidence_snapshot_id uuid) RETURNS TABLE(recommendation_id uuid, decision_id uuid, decision_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_decision_key text;
  v_existing public.business_intelligence_decisions%ROWTYPE;
  v_recommendation_id uuid;
  v_decision_id uuid;
  v_evidence jsonb;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_report_job_id IS NULL OR nullif(btrim(coalesce(p_source_hash,'')), '') IS NULL THEN RAISE EXCEPTION 'SOURCE_PROPOSAL_IDENTITY_REQUIRED'; END IF;
  IF p_evidence_snapshot_id IS NULL THEN RAISE EXCEPTION 'SOURCE_PROPOSAL_EVIDENCE_REQUIRED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.report_evidence_passports p
    WHERE p.company_id = v_company
      AND p.evidence_snapshot_id = p_evidence_snapshot_id
      AND p.report_execution_job_id = p_report_job_id
      AND p.source_hash = p_source_hash
      AND p.verification_status = 'VERIFIED'
      AND p.decision_readiness = 'READY'
  ) THEN RAISE EXCEPTION 'SOURCE_PROPOSAL_EVIDENCE_REQUIRED'; END IF;
  IF nullif(btrim(coalesce(p_signal_id,'')), '') IS NULL OR nullif(btrim(coalesce(p_signal_title,'')), '') IS NULL THEN
    RAISE EXCEPTION 'SOURCE_PROPOSAL_SIGNAL_REQUIRED';
  END IF;
  v_decision_key := 'source-intelligence:' || p_report_job_id || ':' || p_source_hash || ':' || p_signal_id;
  SELECT * INTO v_existing
    FROM public.business_intelligence_decisions d
   WHERE d.company_id = v_company
     AND d.decision_key = v_decision_key
   FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.recommendation_id IS NULL THEN
      v_evidence := coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
        'type','SOURCE_INTELLIGENCE_SIGNAL',
        'reportExecutionJobId',p_report_job_id,
        'sourceHash',p_source_hash,
        'signalId',p_signal_id,
        'signalTitle',p_signal_title,
        'signalMessage',p_signal_message,
        'severity',p_severity,
        'evidenceSnapshotId',p_evidence_snapshot_id,
        'decisionBoundary','PROPOSED_ONLY',
        'confidenceSemantics','NOT_AVAILABLE_UNTIL_VERIFIED_DECISION',
        'repairedLegacyProposal',true
      );
      INSERT INTO public.recommendations(
        company_id, category, priority, title, description, evidence,
        expected_impact, confidence, status, evidence_snapshot_id, metric_versions
      ) VALUES(
        v_company,'source-intelligence',coalesce(nullif(p_severity,''),'medium'),
        p_signal_title,p_signal_message,v_evidence,NULL,'CALCULATED','new',
        p_evidence_snapshot_id,'{}'::jsonb
      ) RETURNING id INTO v_recommendation_id;
      PERFORM public.link_recommendation_to_decision(v_recommendation_id, v_existing.id);
      RETURN QUERY SELECT v_recommendation_id, v_existing.id, coalesce(v_existing.status, 'PROPOSED');
      RETURN;
    END IF;
    RETURN QUERY SELECT v_existing.recommendation_id, v_existing.id, coalesce(v_existing.status, 'PROPOSED');
    RETURN;
  END IF;
  v_evidence := coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
    'type','SOURCE_INTELLIGENCE_SIGNAL',
    'reportExecutionJobId',p_report_job_id,
    'sourceHash',p_source_hash,
    'signalId',p_signal_id,
    'signalTitle',p_signal_title,
    'signalMessage',p_signal_message,
    'severity',p_severity,
    'evidenceSnapshotId',p_evidence_snapshot_id,
    'decisionBoundary','PROPOSED_ONLY',
    'confidenceSemantics','NOT_AVAILABLE_UNTIL_VERIFIED_DECISION'
  );
  INSERT INTO public.recommendations(
    company_id, category, priority, title, description, evidence,
    expected_impact, confidence, status, evidence_snapshot_id, metric_versions
  ) VALUES(
    v_company,'source-intelligence',coalesce(nullif(p_severity,''),'medium'),
    p_signal_title,p_signal_message,v_evidence,NULL,'CALCULATED','new',
    p_evidence_snapshot_id,'{}'::jsonb
  ) RETURNING id INTO v_recommendation_id;
  v_evidence := v_evidence || jsonb_build_object('recommendationId', v_recommendation_id);
  v_decision_id := public.create_runtime_decision(
    v_decision_key,'SOURCE_INTELLIGENCE_SIGNAL',NULL,NULL,v_evidence
  );
  PERFORM public.link_recommendation_to_decision(v_recommendation_id, v_decision_id);
  RETURN QUERY SELECT v_recommendation_id, v_decision_id, 'PROPOSED';
END;
$$;
CREATE FUNCTION public.current_company_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company_id uuid;
  v_count integer;
begin
  select count(*)
    into v_count
  from public.company_memberships cm
  where cm.user_id = auth.uid()
    and cm.is_active = true
    and cm.is_default = true;
  if v_count <> 1 then
    return null;
  end if;
  select cm.company_id
    into v_company_id
  from public.company_memberships cm
  where cm.user_id = auth.uid()
    and cm.is_active = true
    and cm.is_default = true
  limit 1;
  return v_company_id;
end;
$$;
COMMENT ON FUNCTION public.current_company_id() IS 'Tenant resolver: exactly one active default membership returns its company_id; ambiguity or absence returns null.';
CREATE FUNCTION public.current_customer_company_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;
CREATE FUNCTION public.current_customer_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.customer_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;
CREATE FUNCTION public.decide_approval(p_approval_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_decision uuid;
  v_decision_status text;
  v_status text;
  v_requested_by uuid;
begin
  if v_company is null or v_user is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select decision_id
    into v_decision
  from public.decision_approvals
  where id = p_approval_id
    and company_id = v_company;
  if v_decision is null then
    raise exception 'APPROVAL_NOT_FOUND';
  end if;
  select status
    into v_decision_status
  from public.business_intelligence_decisions
  where id = v_decision
    and company_id = v_company
  for update;
  if v_decision_status is distinct from 'PROPOSED' then
    raise exception 'DECISION_STATE_CHANGED';
  end if;
  select status, requested_by
    into v_status, v_requested_by
  from public.decision_approvals
  where id = p_approval_id
    and company_id = v_company
  for update;
  if v_status <> 'PENDING' then
    raise exception 'APPROVAL_NOT_PENDING';
  end if;
  if p_approve and v_requested_by = v_user then
    raise exception 'SELF_APPROVAL_FORBIDDEN';
  end if;
  update public.decision_approvals
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      decided_at = now(),
      decided_by = v_user,
      reason = p_reason
  where id = p_approval_id
    and company_id = v_company;
  update public.business_intelligence_decisions
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
      approved_at = case when p_approve then now() else null end,
      approved_by = case when p_approve then v_user else null end,
      rejection_reason = case when p_approve then null else p_reason end
  where id = v_decision
    and company_id = v_company;
  if not found then
    raise exception 'DECISION_STATE_CHANGED';
  end if;
  return true;
end;
$$;
CREATE FUNCTION public.demand_reorder_snapshot(p_company_id uuid, p_as_of date DEFAULT CURRENT_DATE, p_days integer DEFAULT 90, p_lead_time_days numeric DEFAULT 7, p_safety_days numeric DEFAULT 3) RETURNS TABLE(product_id uuid, sku text, product_name text, current_stock numeric, avg_daily_demand numeric, minimum_stock numeric, reorder_point numeric, maximum_stock numeric, stockout_date date, qty_for_day numeric, qty_for_week numeric, qty_for_half_month numeric, qty_for_month numeric, suggested_order_qty numeric, urgency text, confidence text)
    LANGUAGE sql STABLE
    AS $$
WITH v AS (
  SELECT * FROM inventory_liquidity_velocity(p_company_id,p_as_of,p_days)
), x AS (
 SELECT v.*, coalesce(avg_daily_sales,0) d,
        coalesce(stock_qty,0) s
 FROM v
)
SELECT product_id, sku, product_name, s, d,
       d * greatest(p_safety_days,0),
       d * greatest(p_lead_time_days+p_safety_days,0),
       d * greatest(p_lead_time_days+p_safety_days+30,0),
       CASE WHEN d > 0 THEN p_as_of + ceil(s/d)::integer ELSE NULL END,
       d, d*7, d*15, d*30,
       greatest(0, d*(p_lead_time_days+p_safety_days+30)-s),
       CASE WHEN s <= 0 THEN 'critical'
            WHEN d > 0 AND s/d <= p_lead_time_days THEN 'urgent'
            WHEN d > 0 AND s/d <= p_lead_time_days+p_safety_days THEN 'high'
            ELSE 'normal' END,
       CASE WHEN d <= 0 THEN 'insufficient_history'
            WHEN p_days >= 90 THEN 'high'
            WHEN p_days >= 30 THEN 'medium'
            ELSE 'low' END
FROM x;
$$;
CREATE FUNCTION public.enforce_item_reference_same_invoice_company() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare invoice_company uuid; parent_company uuid; invoice_table text := tg_argv[0];
begin
  execute format('select company_id from public.%I where id = $1', invoice_table) into invoice_company using new.invoice_id;
  if invoice_company is null then raise exception 'REFERENCED_ENTITY_NOT_FOUND'; end if;
  if new.product_id is not null then
    select company_id into parent_company from public.products where id = new.product_id;
    if parent_company is null or parent_company is distinct from invoice_company then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  end if;
  return new;
end;
$_$;
CREATE FUNCTION public.enforce_payment_reference_same_company() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  parent_company uuid;
begin
  if new.customer_id is not null then
    select company_id into parent_company from public.customers where id = new.customer_id;
    if parent_company is null or parent_company is distinct from new.company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  end if;
  if new.supplier_id is not null then
    select company_id into parent_company from public.suppliers where id = new.supplier_id;
    if parent_company is null or parent_company is distinct from new.company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  end if;
  if new.invoice_id is not null then
    select company_id into parent_company from public.sales_invoices where id = new.invoice_id;
    if parent_company is null or parent_company is distinct from new.company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  end if;
  return new;
end;
$$;
CREATE FUNCTION public.enforce_same_company_reference() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  referenced_id uuid;
  parent_company uuid;
  parent_table text := tg_argv[0];
  fk_column text := tg_argv[1];
begin
  if tg_nargs <> 2 then
    raise exception 'TENANT_REFERENCE_ARGUMENTS_REQUIRED';
  end if;
  referenced_id := nullif(to_jsonb(new)->>fk_column, '')::uuid;
  if referenced_id is null then
    return new;
  end if;
  execute format(
    'select company_id from public.%I where id = $1',
    parent_table
  )
  into parent_company
  using referenced_id;
  if parent_company is null then
    raise exception 'REFERENCED_ENTITY_NOT_FOUND';
  end if;
  if parent_company is distinct from new.company_id then
    raise exception 'TENANT_CONTEXT_MISMATCH';
  end if;
  return new;
end;
$_$;
CREATE FUNCTION public.enforce_source_decision_evidence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role','');
  v_company uuid := public.current_company_id();
  v_snapshot uuid;
  v_hash text;
  v_job uuid;
  v_passport public.report_evidence_passports%ROWTYPE;
BEGIN
  IF v_role = 'authenticated' THEN
    IF v_user IS NULL OR v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'SOURCE_DECISION_TENANT_CONTEXT_REQUIRED';
    END IF;
  ELSIF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'SOURCE_DECISION_AUTHORITY_REQUIRED';
  END IF;
  IF upper(coalesce(NEW.decision_type,''))='SOURCE_INTELLIGENCE_SIGNAL' THEN
    BEGIN
      v_snapshot:=nullif(NEW.evidence->>'evidenceSnapshotId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_snapshot:=NULL;
    END;
    BEGIN
      v_job:=nullif(NEW.evidence->>'reportExecutionJobId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_job:=NULL;
    END;
    v_hash:=nullif(trim(NEW.evidence->>'sourceHash'),'');
    IF v_snapshot IS NULL OR v_job IS NULL OR v_hash IS NULL THEN
      RAISE EXCEPTION 'SOURCE_DECISION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
    SELECT *
      INTO v_passport
      FROM public.report_evidence_passports p
      WHERE p.company_id=NEW.company_id
        AND p.evidence_snapshot_id=v_snapshot
        AND p.report_execution_job_id=v_job
        AND p.source_hash=v_hash
        AND p.verification_status='VERIFIED'
        AND p.decision_readiness='READY';
    IF v_passport.id IS NULL THEN
      RAISE EXCEPTION 'SOURCE_DECISION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.enforce_source_recommendation_evidence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role','');
  v_company uuid := public.current_company_id();
  v_snapshot uuid;
  v_job uuid;
  v_hash text;
  v_passport public.report_evidence_passports%ROWTYPE;
BEGIN
  IF v_role = 'authenticated' THEN
    IF v_user IS NULL OR v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_TENANT_CONTEXT_REQUIRED';
    END IF;
  ELSIF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'SOURCE_RECOMMENDATION_AUTHORITY_REQUIRED';
  END IF;
  IF lower(coalesce(NEW.category,''))='source-intelligence' THEN
    BEGIN
      v_snapshot := nullif(NEW.evidence->>'evidenceSnapshotId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_snapshot := NULL;
    END;
    BEGIN
      v_job := nullif(NEW.evidence->>'reportExecutionJobId','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_job := NULL;
    END;
    v_hash := nullif(trim(NEW.evidence->>'sourceHash'),'');
    IF v_snapshot IS NULL OR v_job IS NULL OR v_hash IS NULL THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
    IF NEW.evidence_snapshot_id IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_SNAPSHOT_MISMATCH';
    END IF;
    SELECT *
      INTO v_passport
      FROM public.report_evidence_passports p
      WHERE p.company_id=NEW.company_id
        AND p.evidence_snapshot_id=v_snapshot
        AND p.report_execution_job_id=v_job
        AND p.source_hash=v_hash
        AND p.verification_status='VERIFIED'
        AND p.decision_readiness='READY';
    IF v_passport.id IS NULL THEN
      RAISE EXCEPTION 'SOURCE_RECOMMENDATION_EVIDENCE_PASSPORT_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.enforce_source_work_item_evidence() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->>'role','');
  v_company uuid := public.current_company_id();
  v_item jsonb;
  v_snapshot uuid;
  v_job uuid;
  v_hash text;
  v_type text;
BEGIN
  IF v_role = 'authenticated' THEN
    IF v_user IS NULL OR v_company IS NULL OR NEW.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'SOURCE_WORK_TENANT_CONTEXT_REQUIRED';
    END IF;
  ELSIF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'SOURCE_WORK_AUTHORITY_REQUIRED';
  END IF;
  IF jsonb_typeof(coalesce(NEW.evidence_refs,'[]'::jsonb))='array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.evidence_refs) LOOP
      v_type:=upper(coalesce(v_item->>'type',''));
      IF v_type='SOURCE_REPORT' THEN
        BEGIN
          v_snapshot:=nullif(v_item->>'evidenceSnapshotId','')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_snapshot:=NULL;
        END;
        BEGIN
          v_job:=nullif(v_item->>'reportExecutionJobId','')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
          v_job:=NULL;
        END;
        v_hash:=nullif(trim(v_item->>'sourceHash'),'');
        IF v_snapshot IS NULL
           OR v_job IS NULL
           OR v_hash IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM public.report_evidence_passports p
             WHERE p.company_id=NEW.company_id
               AND p.evidence_snapshot_id=v_snapshot
               AND p.report_execution_job_id=v_job
               AND p.source_hash=v_hash
               AND p.verification_status='VERIFIED'
               AND p.decision_readiness='READY'
           ) THEN
          RAISE EXCEPTION 'SOURCE_WORK_EVIDENCE_PASSPORT_REQUIRED';
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[] DEFAULT '{}'::text[], p_max_attempts integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  existing public.report_execution_jobs%rowtype;
  inserted public.report_execution_jobs%rowtype;
  target_job public.report_execution_jobs%rowtype;
  initial_checkpoint jsonb;
  v_is_service_role boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_company_id uuid;
begin
  if p_company_id is null then raise exception 'company_id is required'; end if;
  if not v_is_service_role then
    if auth.uid() is null then raise exception 'AUTHENTICATED_USER_REQUIRED'; end if;
    v_company_id := public.current_company_id();
    if v_company_id is null or p_company_id is distinct from v_company_id then
      raise exception 'TENANT_CONTEXT_MISMATCH';
    end if;
  end if;
  if p_job_key is null or btrim(p_job_key) = '' then raise exception 'job_key is required'; end if;
  if p_source_path is null or btrim(p_source_path) = '' then raise exception 'source_path is required'; end if;
  if p_source_hash is null or btrim(p_source_hash) = '' then raise exception 'source_hash is required'; end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then raise exception 'max_attempts must be between 1 and 100'; end if;
  initial_checkpoint := jsonb_build_object(
    'stage','queued',
    'sourceHash',p_source_hash,
    'evidenceKeys',coalesce(p_evidence_keys,'{}'),
    'updatedAt',floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
  insert into public.report_execution_jobs(
    company_id,job_key,source_path,source_hash,status,checkpoint,max_attempts
  )
  values(
    p_company_id,btrim(p_job_key),btrim(p_source_path),btrim(p_source_hash),'queued',initial_checkpoint,p_max_attempts
  )
  on conflict(company_id,job_key) do nothing
  returning * into inserted;
  if inserted.id is null then
    select * into existing
    from public.report_execution_jobs
    where company_id=p_company_id and job_key=btrim(p_job_key)
    for update;
    if not found then
      raise exception 'Durable job conflict was not found; refusing ambiguous enqueue result';
    end if;
    if existing.source_path is null or existing.source_hash is null then
      raise exception 'Existing durable job is missing source identity; refusing provenance-unsafe enqueue';
    end if;
    if existing.source_hash <> btrim(p_source_hash) or existing.source_path <> btrim(p_source_path) then
      raise exception 'Durable job key already exists with different source identity';
    end if;
    if existing.status = 'dead_letter' then
      perform public.recover_dead_letter_report_execution_job(existing.id, p_company_id);
      select * into existing
      from public.report_execution_jobs
      where id=existing.id and company_id=p_company_id
      for update;
    end if;
    target_job := existing;
  else
    target_job := inserted;
  end if;
  insert into public.report_execution_tasks(
    company_id, report_execution_job_id, task_key, stage, ordinal, label
  )
  values
    (target_job.company_id, target_job.id, '01-queued', 'queued', 1, 'استلام العملية'),
    (target_job.company_id, target_job.id, '02-fingerprinted', 'fingerprinted', 2, 'إثبات بصمة المصدر'),
    (target_job.company_id, target_job.id, '03-extracted', 'extracted', 3, 'استخراج المحتوى'),
    (target_job.company_id, target_job.id, '04-canonicalized', 'canonicalized', 4, 'التوحيد والمطابقة'),
    (target_job.company_id, target_job.id, '05-validated', 'validated', 5, 'التحقق والجودة'),
    (target_job.company_id, target_job.id, '06-analyzed', 'analyzed', 6, 'التحليل وفهم الأعمال'),
    (target_job.company_id, target_job.id, '07-decisioned', 'decisioned', 7, 'بناء إشارة القرار'),
    (target_job.company_id, target_job.id, '08-committed', 'committed', 8, 'تثبيت الحقيقة الكانونية'),
    (target_job.company_id, target_job.id, '09-rendered', 'rendered', 9, 'إخراج التقرير ونتائج التشغيل')
  on conflict(company_id, report_execution_job_id, task_key) do nothing;
  return jsonb_build_object(
    'id',target_job.id,
    'company_id',target_job.company_id,
    'job_key',target_job.job_key,
    'source_path',target_job.source_path,
    'source_hash',target_job.source_hash,
    'status',target_job.status,
    'checkpoint',target_job.checkpoint,
    'attempt',target_job.attempt,
    'max_attempts',target_job.max_attempts,
    'lease_owner',target_job.lease_owner,
    'lease_token',target_job.lease_token,
    'lease_expires_at',target_job.lease_expires_at
  );
end;
$$;
CREATE FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[] DEFAULT '{}'::text[], p_max_attempts integer DEFAULT 5, p_force_reprocess boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  existing public.report_execution_jobs%rowtype;
  inserted public.report_execution_jobs%rowtype;
  target_job public.report_execution_jobs%rowtype;
  initial_checkpoint jsonb;
  v_is_service_role boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_company_id uuid;
begin
  if p_company_id is null then raise exception 'company_id is required'; end if;
  if not v_is_service_role then
    if auth.uid() is null then raise exception 'AUTHENTICATED_USER_REQUIRED'; end if;
    v_company_id := public.current_company_id();
    if v_company_id is null or p_company_id is distinct from v_company_id then
      raise exception 'TENANT_CONTEXT_MISMATCH';
    end if;
  end if;
  if p_job_key is null or btrim(p_job_key) = '' then raise exception 'job_key is required'; end if;
  if p_source_path is null or btrim(p_source_path) = '' then raise exception 'source_path is required'; end if;
  if p_source_hash is null or btrim(p_source_hash) = '' then raise exception 'source_hash is required'; end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 100 then raise exception 'max_attempts must be between 1 and 100'; end if;
  if p_force_reprocess and auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED_FOR_FORCE_REPROCESS'; end if;
  initial_checkpoint := jsonb_build_object(
    'stage','queued',
    'sourceHash',p_source_hash,
    'evidenceKeys',coalesce(p_evidence_keys,'{}'),
    'updatedAt',floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
  insert into public.report_execution_jobs(
    company_id,job_key,source_path,source_hash,status,checkpoint,max_attempts
  )
  values(
    p_company_id,btrim(p_job_key),btrim(p_source_path),btrim(p_source_hash),'queued',initial_checkpoint,p_max_attempts
  )
  on conflict(company_id,job_key) do nothing
  returning * into inserted;
  if inserted.id is null then
    select * into existing
    from public.report_execution_jobs
    where company_id=p_company_id and job_key=btrim(p_job_key)
    for update;
    if not found then
      raise exception 'Durable job conflict was not found; refusing ambiguous enqueue result';
    end if;
    if existing.source_path is null or existing.source_hash is null then
      raise exception 'Existing durable job is missing source identity; refusing provenance-unsafe enqueue';
    end if;
    if existing.source_hash <> btrim(p_source_hash) or existing.source_path <> btrim(p_source_path) then
      raise exception 'Durable job key already exists with different source identity';
    end if;
    if existing.status = 'dead_letter' then
      perform public.recover_dead_letter_report_execution_job(existing.id, p_company_id);
      select * into existing
      from public.report_execution_jobs
      where id=existing.id and company_id=p_company_id
      for update;
    elsif p_force_reprocess and existing.status in ('completed','succeeded','failed','cancelled') then
      update public.report_execution_jobs
      set status='queued',
          checkpoint=initial_checkpoint,
          evidence='{}'::jsonb,
          last_error=null,
          completed_at=null,
          lease_owner=null,
          lease_token=null,
          lease_expires_at=null,
          attempt=coalesce(attempt,0)+1,
          max_attempts=p_max_attempts,
          updated_at=clock_timestamp()
      where id=existing.id and company_id=p_company_id
      returning * into existing;
      delete from public.report_execution_tasks
      where company_id=p_company_id and report_execution_job_id=existing.id;
    end if;
    target_job := existing;
  else
    target_job := inserted;
  end if;
  insert into public.report_execution_tasks(
    company_id, report_execution_job_id, task_key, stage, ordinal, label
  )
  values
    (target_job.company_id, target_job.id, '01-queued', 'queued', 1, 'استلام العملية'),
    (target_job.company_id, target_job.id, '02-fingerprinted', 'fingerprinted', 2, 'إثبات بصمة المصدر'),
    (target_job.company_id, target_job.id, '03-extracted', 'extracted', 3, 'استخراج المحتوى'),
    (target_job.company_id, target_job.id, '04-canonicalized', 'canonicalized', 4, 'التوحيد والمطابقة'),
    (target_job.company_id, target_job.id, '05-validated', 'validated', 5, 'التحقق والجودة'),
    (target_job.company_id, target_job.id, '06-analyzed', 'analyzed', 6, 'التحليل وفهم الأعمال'),
    (target_job.company_id, target_job.id, '07-decisioned', 'decisioned', 7, 'بناء إشارة القرار'),
    (target_job.company_id, target_job.id, '08-committed', 'committed', 8, 'تثبيت الحقيقة الكانونية'),
    (target_job.company_id, target_job.id, '09-rendered', 'rendered', 9, 'إخراج التقرير ونتائج التشغيل')
  on conflict(company_id, report_execution_job_id, task_key) do nothing;
  return jsonb_build_object(
    'id',target_job.id,
    'company_id',target_job.company_id,
    'job_key',target_job.job_key,
    'source_path',target_job.source_path,
    'source_hash',target_job.source_hash,
    'status',target_job.status,
    'checkpoint',target_job.checkpoint,
    'attempt',target_job.attempt,
    'max_attempts',target_job.max_attempts,
    'lease_owner',target_job.lease_owner,
    'lease_token',target_job.lease_token,
    'forceReprocessed',p_force_reprocess
  );
end;
$$;
CREATE FUNCTION public.fail_report_execution_job(p_job_id uuid, p_worker_id text, p_error jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare affected integer;
begin
  IF p_error IS NULL OR jsonb_typeof(p_error) <> 'object' THEN
    RAISE EXCEPTION 'Failure transition requires a structured error payload';
  END IF;
  update public.report_execution_jobs
     set status = CASE WHEN attempt >= max_attempts THEN 'dead_letter' ELSE 'failed' END,
         last_error = p_error,
         lease_owner = null,
         lease_expires_at = null,
         completed_at = null,
         updated_at = now()
   where id = p_job_id
     and company_id = public.current_company_id()
     and status in ('leased', 'processing')
     and lease_owner = p_worker_id
     and lease_expires_at is not null
     and lease_expires_at > now();
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;
CREATE FUNCTION public.fail_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_error jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  affected integer;
  v_old_status text;
  v_attempt integer;
  v_max_attempts integer;
  v_new_status text;
  v_correlation_id text;
  v_user_id uuid;
BEGIN
  v_user_id := (SELECT auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
  END IF;
  IF public.current_company_id() IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  SELECT status, attempt, max_attempts
  INTO v_old_status, v_attempt, v_max_attempts
  FROM public.report_execution_jobs
  WHERE id = p_job_id
    AND company_id = p_company_id
    AND lease_owner = p_worker_id
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp()
    AND status IN ('leased', 'processing')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  v_new_status := CASE
    WHEN v_attempt >= v_max_attempts THEN 'dead_letter'
    ELSE 'failed'
  END;
  v_correlation_id := COALESCE(
    NULLIF(p_error ->> 'correlationId', ''),
    NULLIF(p_error ->> 'correlation_id', ''),
    p_job_id::text
  );
  UPDATE public.report_execution_jobs
  SET status = v_new_status,
      last_error = COALESCE(p_error, '{}'::jsonb),
      updated_at = clock_timestamp(),
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND company_id = p_company_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RETURN false;
  END IF;
  INSERT INTO public.alerts (
    company_id,
    severity,
    category,
    title,
    description,
    entity_type,
    entity_id,
    metric_value,
    threshold,
    is_read
  ) VALUES (
    p_company_id,
    CASE WHEN v_new_status = 'dead_letter' THEN 'high' ELSE 'warning' END,
    'report_execution',
    CASE
      WHEN v_new_status = 'dead_letter' THEN 'توقف تنفيذ التقرير وإحالته إلى قائمة الفشل النهائي'
      ELSE 'فشل تنفيذ التقرير'
    END,
    format(
      'Report execution job %s انتهى بالحالة %s. correlationId=%s',
      p_job_id::text,
      v_new_status,
      v_correlation_id
    ),
    'report_execution_job',
    p_job_id,
    v_attempt,
    v_max_attempts,
    false
  );
  INSERT INTO public.audit_logs (
    company_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    source,
    user_label,
    correlation_id
  ) VALUES (
    p_company_id,
    CASE
      WHEN v_new_status = 'dead_letter' THEN 'report_execution_job_dead_letter'
      ELSE 'report_execution_job_failed'
    END,
    'report_execution_job',
    p_job_id,
    jsonb_build_object(
      'status', v_old_status,
      'attempt', v_attempt,
      'max_attempts', v_max_attempts
    ),
    jsonb_build_object(
      'status', v_new_status,
      'attempt', v_attempt,
      'max_attempts', v_max_attempts,
      'error', COALESCE(p_error, '{}'::jsonb)
    ),
    'report_execution_runtime',
    v_user_id::text,
    v_correlation_id
  );
  RETURN true;
END;
$$;
CREATE FUNCTION public.get_abc_snapshot(p_limit integer DEFAULT 500) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_currency text; v_mismatch bigint; v_limit integer:=least(greatest(coalesce(p_limit,500),1),500); v_unknown bigint; v_rows jsonb; v_total numeric; v_status text;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 SELECT c.currency INTO v_currency FROM public.companies c WHERE c.id=v_company_id;
 SELECT count(*) FILTER(WHERE si.currency IS NOT NULL AND v_currency IS NOT NULL AND si.currency<>v_currency) INTO v_mismatch FROM public.sales_invoices si WHERE si.company_id=v_company_id AND si.status NOT IN ('cancelled','void');
 IF v_mismatch>0 THEN RETURN jsonb_build_object('rows','[]'::jsonb,'totalRevenue',null,'unknownRows',0,'status','INSUFFICIENT_DATA','currency',v_currency,'currency_status','INSUFFICIENT_DATA','currency_mismatch_rows',v_mismatch); END IF;
 WITH raw AS (SELECT item.product_id,item.line_total,p.name product_name FROM public.sale_items item JOIN public.sales_invoices si ON si.id=item.invoice_id AND si.company_id=v_company_id LEFT JOIN public.products p ON p.id=item.product_id AND p.company_id=v_company_id WHERE si.status NOT IN ('cancelled','void')), valid AS (SELECT * FROM raw WHERE product_id IS NOT NULL AND product_name IS NOT NULL AND line_total IS NOT NULL), agg AS (SELECT product_id,max(product_name) product_name,sum(line_total)::numeric revenue FROM valid GROUP BY product_id), ranked AS (SELECT a.*,sum(revenue) over(order by revenue desc,product_id rows unbounded preceding) cumulative,sum(revenue) over() total_revenue FROM agg a), final_rows AS (SELECT product_id,product_name,revenue,cumulative,case when total_revenue=0 then null else cumulative/total_revenue*100 end cumulative_pct,case when total_revenue=0 then null when cumulative/total_revenue*100<=80 then 'A' when cumulative/total_revenue*100<=95 then 'B' else 'C' end class FROM ranked ORDER BY revenue DESC,product_id LIMIT v_limit) SELECT (SELECT count(*) FILTER(where product_id IS NULL OR product_name IS NULL OR line_total IS NULL) FROM raw),coalesce((SELECT jsonb_agg(to_jsonb(fr)) FROM final_rows fr),'[]'::jsonb),coalesce((SELECT sum(revenue) FROM agg),0),case when coalesce((SELECT sum(revenue) FROM agg),0)<=0 OR NOT EXISTS(select 1 from valid) then 'INSUFFICIENT_DATA' else 'CALCULATED' end INTO v_unknown,v_rows,v_total,v_status;
 RETURN jsonb_build_object('rows',v_rows,'totalRevenue',v_total,'unknownRows',v_unknown,'status',v_status,'currency',v_currency,'currency_status','CONSISTENT','currency_mismatch_rows',0);
END; $$;
CREATE FUNCTION public.get_aging_snapshot(p_as_of date DEFAULT CURRENT_DATE) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_unknown bigint; v_rows jsonb; v_status text;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 WITH raw AS (
   SELECT si.total,si.paid_amount,si.due_date,si.invoice_date
   FROM public.sales_invoices si
   WHERE si.company_id=v_company_id AND si.status NOT IN ('cancelled','void')
 ), classified AS (
   SELECT CASE WHEN due_date IS NULL AND invoice_date IS NULL THEN 'UNDATED'
               WHEN COALESCE(due_date,invoice_date)::date>p_as_of THEN '0-30'
               WHEN p_as_of-COALESCE(due_date,invoice_date)::date<=30 THEN '0-30'
               WHEN p_as_of-COALESCE(due_date,invoice_date)::date<=60 THEN '31-60'
               WHEN p_as_of-COALESCE(due_date,invoice_date)::date<=90 THEN '61-90' ELSE '90+' END bucket,
          CASE WHEN total IS NULL OR paid_amount IS NULL THEN NULL ELSE total-paid_amount END outstanding,
          CASE WHEN total IS NULL OR paid_amount IS NULL OR (due_date IS NULL AND invoice_date IS NULL) THEN 1 ELSE 0 END unknown
   FROM raw
 ), agg AS (
   SELECT bucket,coalesce(sum(outstanding),0) amount,count(*) FILTER(WHERE outstanding IS NOT NULL AND outstanding>0) count
   FROM classified WHERE outstanding IS NULL OR outstanding>0 GROUP BY bucket
 )
 SELECT
   (SELECT count(*) FROM classified WHERE unknown=1),
   coalesce((SELECT jsonb_agg(jsonb_build_object('name',bucket,'amount',amount,'count',count)
     ORDER BY CASE bucket WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 WHEN '90+' THEN 4 ELSE 5 END) FROM agg),'[]'::jsonb),
   CASE WHEN NOT EXISTS(SELECT 1 FROM raw) THEN 'NO_DATA'
        WHEN (SELECT count(*) FROM classified WHERE unknown=1)>0 THEN 'INSUFFICIENT_DATA' ELSE 'CALCULATED' END
 INTO v_unknown,v_rows,v_status;
 RETURN jsonb_build_object('asOf',p_as_of,'rows',v_rows,'unknownRows',v_unknown,'status',v_status);
END; $$;
CREATE FUNCTION public.get_cart() RETURNS TABLE(product_id uuid, sku text, name text, unit text, quantity integer, authorized_price numeric, currency text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
begin
  return query
  select
    p.id,
    p.sku,
    p.name,
    p.unit,
    ci.quantity,
    coalesce(
      (
        select cpt.unit_price
        from public.customer_price_tiers cpt
        where cpt.customer_id = public.current_customer_id()
          and cpt.product_id = p.id
          and cpt.company_id = public.current_customer_company_id()
          and cpt.min_quantity <= ci.quantity
        order by cpt.min_quantity desc
        limit 1
      ),
      p.selling_price
    ),
    coalesce(
      (
        select c.currency
        from public.companies c
        where c.id = public.current_customer_company_id()
      ),
      'SAR'
    )
  from public.carts c
  join public.cart_items ci on ci.cart_id = c.id
  join public.products p on p.id = ci.product_id
  where c.user_id = auth.uid()
    and c.customer_id = public.current_customer_id()
    and c.company_id = public.current_customer_company_id();
end;
$$;
CREATE FUNCTION public.get_dashboard_intelligence(p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_result jsonb;
begin
  if v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select jsonb_build_object(
    'recommendations', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, company_id, category, priority, title, description,
               expected_impact, confidence, status, owner, deadline,
               impact_result, created_at
        from public.recommendations
        where company_id = v_company_id
        order by created_at desc
        limit v_limit
      ) r
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select id, company_id, severity, category, title, description,
               metric_value, threshold, is_read, created_at
        from public.alerts
        where company_id = v_company_id
        order by created_at desc
        limit v_limit
      ) a
    ), '[]'::jsonb),
    'limit', v_limit
  ) into v_result;
  return v_result;
end;
$$;
CREATE FUNCTION public.get_dashboard_snapshot(p_months integer DEFAULT 6, p_as_of date DEFAULT CURRENT_DATE) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_months integer:=LEAST(GREATEST(COALESCE(p_months,6),1),24); v_result jsonb;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 WITH sales_base AS (SELECT s.id,s.customer_id,s.subtotal,s.total,s.paid_amount,s.invoice_date,s.due_date,s.currency FROM public.sales_invoices s WHERE s.company_id=v_company_id AND s.status IS NOT NULL AND s.status NOT IN ('cancelled','void') AND s.invoice_date<=p_as_of), sale_items_base AS (SELECT si.invoice_id,si.product_id,si.quantity,si.line_total,si.cost_price FROM public.sale_items si JOIN sales_base s ON s.id=si.invoice_id), purchases_base AS (SELECT p.total,p.paid_amount,p.currency FROM public.purchase_invoices p WHERE p.company_id=v_company_id AND p.status IS NOT NULL AND p.status NOT IN ('cancelled','void') AND p.invoice_date<=p_as_of), inventory_base AS (SELECT ib.quantity,ib.unit_cost,ib.product_id FROM public.inventory_balances ib WHERE ib.company_id=v_company_id), quality AS (SELECT (SELECT count(*) FROM sales_base WHERE subtotal IS NULL OR total IS NULL OR paid_amount IS NULL) bad_invoice_rows,(SELECT count(*) FROM sale_items_base WHERE quantity IS NULL OR cost_price IS NULL OR line_total IS NULL) bad_sale_item_rows,(SELECT count(*) FROM purchases_base WHERE total IS NULL OR paid_amount IS NULL) bad_purchase_rows,(SELECT count(*) FROM inventory_base WHERE quantity IS NULL OR unit_cost IS NULL) bad_inventory_rows,(SELECT count(*) FROM sales_base WHERE currency IS NOT NULL AND c.currency IS NOT NULL AND currency<>c.currency) sales_currency_mismatch_rows,(SELECT count(*) FROM purchases_base WHERE currency IS NOT NULL AND c.currency IS NOT NULL AND currency<>c.currency) purchase_currency_mismatch_rows FROM public.companies c WHERE c.id=v_company_id), kpis AS (SELECT CASE WHEN q.bad_invoice_rows=0 AND q.sales_currency_mismatch_rows=0 THEN (SELECT sum(subtotal) FROM sales_base) END total_sales,CASE WHEN q.bad_sale_item_rows=0 AND q.sales_currency_mismatch_rows=0 THEN (SELECT sum(quantity*cost_price) FROM sale_items_base) END total_cost,CASE WHEN q.bad_invoice_rows=0 AND q.sales_currency_mismatch_rows=0 THEN (SELECT sum(total-paid_amount) FROM sales_base) END receivables,CASE WHEN q.bad_invoice_rows=0 AND q.sales_currency_mismatch_rows=0 THEN (SELECT sum(CASE WHEN due_date IS NOT NULL AND due_date<p_as_of AND paid_amount<total THEN total-paid_amount ELSE 0 END) FROM sales_base) END overdue,CASE WHEN q.bad_purchase_rows=0 AND q.purchase_currency_mismatch_rows=0 THEN (SELECT sum(total-paid_amount) FROM purchases_base) END payables,CASE WHEN q.bad_inventory_rows=0 THEN (SELECT sum(quantity*unit_cost) FROM inventory_base) END inventory_value,(SELECT count(*) FROM sales_base) invoice_count,q.bad_invoice_rows,q.bad_sale_item_rows,q.bad_purchase_rows,q.bad_inventory_rows,q.sales_currency_mismatch_rows,q.purchase_currency_mismatch_rows FROM quality q), trend AS (SELECT jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),'label',CASE EXTRACT(MONTH FROM m.month_start)::integer WHEN 1 THEN 'يناير' WHEN 2 THEN 'فبراير' WHEN 3 THEN 'مارس' WHEN 4 THEN 'أبريل' WHEN 5 THEN 'مايو' WHEN 6 THEN 'يونيو' WHEN 7 THEN 'يوليو' WHEN 8 THEN 'أغسطس' WHEN 9 THEN 'سبتمبر' WHEN 10 THEN 'أكتوبر' WHEN 11 THEN 'نوفمبر' ELSE 'ديسمبر' END,'sales',COALESCE(x.sales,0),'cost',COALESCE(x.cost,0),'profit',COALESCE(x.sales,0)-COALESCE(x.cost,0),'invoices',COALESCE(x.invoices,0)) ORDER BY m.month_start) rows FROM generate_series(date_trunc('month',p_as_of::timestamp)-((v_months-1)*interval '1 month'),date_trunc('month',p_as_of::timestamp),interval '1 month') m(month_start) LEFT JOIN LATERAL (SELECT sum(s.subtotal) sales,sum(si.quantity*si.cost_price) cost,count(DISTINCT s.id) invoices FROM sales_base s LEFT JOIN sale_items_base si ON si.invoice_id=s.id WHERE s.invoice_date>=m.month_start::date AND s.invoice_date<(m.month_start+interval '1 month')::date AND s.subtotal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sale_items_base bad WHERE bad.invoice_id=s.id AND (bad.quantity IS NULL OR bad.cost_price IS NULL))) x ON true), top_customers AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.customer_id,'name',COALESCE(cu.name,q.customer_id::text),'value',q.value) ORDER BY q.value DESC),'[]'::jsonb) rows FROM (SELECT customer_id,sum(subtotal) value FROM sales_base WHERE customer_id IS NOT NULL AND subtotal IS NOT NULL GROUP BY customer_id ORDER BY value DESC LIMIT 10) q LEFT JOIN public.customers cu ON cu.id=q.customer_id AND cu.company_id=v_company_id), top_products AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.product_id,'name',COALESCE(p.name,q.product_id::text),'value',q.value,'secondary',q.qty) ORDER BY q.value DESC),'[]'::jsonb) rows FROM (SELECT product_id,sum(line_total) value,sum(quantity) qty FROM sale_items_base WHERE product_id IS NOT NULL AND line_total IS NOT NULL AND quantity IS NOT NULL GROUP BY product_id ORDER BY value DESC LIMIT 10) q LEFT JOIN public.products p ON p.id=q.product_id AND p.company_id=v_company_id), categories AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',COALESCE(c.name,'غير مصنف'),'sales',q.sales,'profit',q.profit,'quantity',q.quantity) ORDER BY q.sales DESC),'[]'::jsonb) rows FROM (SELECT p.category_id,sum(si.line_total) sales,sum(si.line_total-(si.cost_price*si.quantity)) profit,sum(si.quantity) quantity FROM sale_items_base si LEFT JOIN public.products p ON p.id=si.product_id AND p.company_id=v_company_id WHERE si.line_total IS NOT NULL AND si.cost_price IS NOT NULL AND si.quantity IS NOT NULL GROUP BY p.category_id) q LEFT JOIN public.categories c ON c.id=q.category_id AND c.company_id=v_company_id), aging AS (SELECT jsonb_build_array(jsonb_build_object('bucket','0-30','amount',COALESCE(sum(CASE WHEN age_days BETWEEN 0 AND 30 THEN outstanding END),0),'count',count(*) FILTER(WHERE age_days BETWEEN 0 AND 30)),jsonb_build_object('bucket','31-60','amount',COALESCE(sum(CASE WHEN age_days BETWEEN 31 AND 60 THEN outstanding END),0),'count',count(*) FILTER(WHERE age_days BETWEEN 31 AND 60)),jsonb_build_object('bucket','61-90','amount',COALESCE(sum(CASE WHEN age_days BETWEEN 61 AND 90 THEN outstanding END),0),'count',count(*) FILTER(WHERE age_days BETWEEN 61 AND 90)),jsonb_build_object('bucket','90+','amount',COALESCE(sum(CASE WHEN age_days>90 THEN outstanding END),0),'count',count(*) FILTER(WHERE age_days>90)),jsonb_build_object('bucket','UNDATED','amount',COALESCE(sum(CASE WHEN due_date IS NULL THEN outstanding END),0),'count',count(*) FILTER(WHERE due_date IS NULL))) rows FROM (SELECT due_date,total-paid_amount outstanding,CASE WHEN due_date IS NULL THEN NULL ELSE GREATEST(0,p_as_of-due_date) END age_days FROM sales_base WHERE total IS NOT NULL AND paid_amount IS NOT NULL AND total-paid_amount>0) a), counts AS (SELECT (SELECT count(*) FROM public.customers WHERE company_id=v_company_id) total_customers,(SELECT count(*) FROM public.products WHERE company_id=v_company_id) total_products)
 SELECT jsonb_build_object('status',CASE WHEN k.bad_invoice_rows=0 AND k.bad_sale_item_rows=0 AND k.bad_purchase_rows=0 AND k.bad_inventory_rows=0 AND k.sales_currency_mismatch_rows=0 AND k.purchase_currency_mismatch_rows=0 AND (k.invoice_count>0 OR k.total_cost IS NOT NULL OR k.inventory_value IS NOT NULL) THEN 'CALCULATED' ELSE 'INSUFFICIENT_DATA' END,'totalSales',k.total_sales,'totalCost',k.total_cost,'grossProfit',CASE WHEN k.total_sales IS NOT NULL AND k.total_cost IS NOT NULL THEN k.total_sales-k.total_cost END,'grossMargin',CASE WHEN k.total_sales IS NOT NULL AND k.total_cost IS NOT NULL AND k.total_sales<>0 THEN ((k.total_sales-k.total_cost)/k.total_sales)*100 END,'totalReceivables',k.receivables,'overdueReceivables',k.overdue,'totalPayables',k.payables,'inventoryValue',k.inventory_value,'totalCustomers',counts.total_customers,'activeCustomers',NULL,'totalProducts',counts.total_products,'invoiceCount',k.invoice_count,'avgInvoiceValue',CASE WHEN k.invoice_count>0 AND k.total_sales IS NOT NULL THEN k.total_sales/k.invoice_count END,'collectionRate',CASE WHEN k.total_sales IS NOT NULL AND k.invoice_count>0 AND (SELECT sum(total) FROM sales_base)<>0 THEN ((SELECT sum(paid_amount) FROM sales_base)/(SELECT sum(total) FROM sales_base))*100 END,'trend',CASE WHEN k.sales_currency_mismatch_rows=0 THEN (SELECT rows FROM trend) ELSE '[]'::jsonb END,'topCustomers',CASE WHEN k.sales_currency_mismatch_rows=0 THEN (SELECT rows FROM top_customers) ELSE '[]'::jsonb END,'topProducts',CASE WHEN k.sales_currency_mismatch_rows=0 THEN (SELECT rows FROM top_products) ELSE '[]'::jsonb END,'categories',CASE WHEN k.sales_currency_mismatch_rows=0 THEN (SELECT rows FROM categories) ELSE '[]'::jsonb END,'aging',CASE WHEN k.sales_currency_mismatch_rows=0 THEN (SELECT rows FROM aging) ELSE '[]'::jsonb END,'asOf',p_as_of,'months',v_months,'quality',jsonb_build_object('badInvoiceRows',k.bad_invoice_rows,'badSaleItemRows',k.bad_sale_item_rows,'badPurchaseRows',k.bad_purchase_rows,'badInventoryRows',k.bad_inventory_rows,'salesCurrencyMismatchRows',k.sales_currency_mismatch_rows,'purchaseCurrencyMismatchRows',k.purchase_currency_mismatch_rows)) INTO v_result FROM kpis k CROSS JOIN counts;
 RETURN v_result;
END;
$$;
CREATE FUNCTION public.get_dashboard_top_entities() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  SELECT jsonb_build_object(
    'topCustomers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.customer_id,'name',COALESCE(c.name,q.customer_id::text),'value',q.value) ORDER BY q.value DESC) FROM (SELECT customer_id,sum(subtotal) value FROM public.sales_invoices WHERE company_id=public.current_company_id() AND status IS NOT NULL AND status NOT IN ('cancelled','void') AND subtotal IS NOT NULL GROUP BY customer_id ORDER BY value DESC LIMIT 10) q LEFT JOIN public.customers c ON c.id=q.customer_id AND c.company_id=public.current_company_id()),'[]'::jsonb),
    'topProducts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.product_id,'name',COALESCE(p.name,q.product_id::text),'value',q.value,'secondary',q.qty) ORDER BY q.value DESC) FROM (SELECT si.product_id,sum(si.line_total) value,sum(si.quantity) qty FROM public.sale_items si JOIN public.sales_invoices s ON s.id=si.invoice_id WHERE s.company_id=public.current_company_id() AND s.status IS NOT NULL AND s.status NOT IN ('cancelled','void') AND si.product_id IS NOT NULL AND si.line_total IS NOT NULL AND si.quantity IS NOT NULL GROUP BY si.product_id ORDER BY value DESC LIMIT 10) q LEFT JOIN public.products p ON p.id=q.product_id AND p.company_id=public.current_company_id()),'[]'::jsonb)
  );
$$;
CREATE FUNCTION public.get_data_quality_snapshot() RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  WITH c AS (
    SELECT count(*)::int total,
      count(*) FILTER (WHERE nullif(btrim(name),'') IS NULL)::int missing_name,
      count(*) FILTER (WHERE nullif(btrim(phone),'') IS NULL)::int missing_phone,
      count(*) FILTER (WHERE nullif(btrim(code),'') IS NULL)::int missing_code,
      coalesce((SELECT sum(n) FROM (SELECT count(*) n FROM customers WHERE company_id=v_company AND nullif(btrim(name),'') IS NOT NULL GROUP BY btrim(name) HAVING count(*)>1)x),0)::int duplicate_names FROM customers WHERE company_id=v_company
  ), p AS (
    SELECT count(*)::int total,
      count(*) FILTER (WHERE nullif(btrim(sku),'') IS NULL)::int missing_sku,
      count(*) FILTER (WHERE nullif(btrim(name),'') IS NULL)::int missing_name,
      count(*) FILTER (WHERE selling_price IS NOT NULL AND selling_price<=0)::int zero_price,
      count(*) FILTER (WHERE (cost_price IS NOT NULL AND cost_price<0) OR (selling_price IS NOT NULL AND selling_price<0))::int negative_price,
      coalesce((SELECT sum(n) FROM (SELECT count(*) n FROM products WHERE company_id=v_company AND nullif(btrim(sku),'') IS NOT NULL GROUP BY btrim(sku) HAVING count(*)>1)x),0)::int duplicate_sku FROM products WHERE company_id=v_company
  ), i AS (
    SELECT count(*)::int total,
      count(*) FILTER (WHERE total IS NOT NULL AND total<=0)::int zero_total,
      count(*) FILTER (WHERE total IS NOT NULL AND total<0)::int negative_total,
      count(*) FILTER (WHERE paid_amount IS NOT NULL AND total IS NOT NULL AND paid_amount>total)::int paid_exceeds,
      count(*) FILTER (WHERE customer_id IS NULL)::int missing_customer,
      count(*) FILTER (WHERE invoice_date IS NULL)::int missing_date,
      coalesce((SELECT sum(n) FROM (SELECT count(*) n FROM sales_invoices WHERE company_id=v_company AND nullif(btrim(invoice_number),'') IS NOT NULL GROUP BY btrim(invoice_number) HAVING count(*)>1)x),0)::int duplicate_number FROM sales_invoices WHERE company_id=v_company
  ), b AS (
    SELECT count(*)::int total,
      count(*) FILTER (WHERE quantity IS NOT NULL AND quantity<0)::int negative_quantity,
      count(*) FILTER (WHERE unit_cost IS NOT NULL AND unit_cost<0)::int negative_cost,
      count(*) FILTER (WHERE product_id IS NULL)::int missing_product FROM inventory_balances WHERE company_id=v_company
  ), m AS (
    SELECT c.total customer_total,c.missing_name customer_missing_name,c.missing_phone customer_missing_phone,c.missing_code customer_missing_code,c.duplicate_names customer_duplicate_names,
      p.total product_total,p.missing_sku product_missing_sku,p.missing_name product_missing_name,p.zero_price product_zero_price,p.negative_price product_negative_price,p.duplicate_sku product_duplicate_sku,
      i.total invoice_total,i.zero_total invoice_zero_total,i.negative_total invoice_negative_total,i.paid_exceeds invoice_paid_exceeds,i.missing_customer invoice_missing_customer,i.missing_date invoice_missing_date,i.duplicate_number invoice_duplicate_number,
      b.total balance_total,b.negative_quantity balance_negative_quantity,b.negative_cost balance_negative_cost,b.missing_product balance_missing_product FROM c,p,i,b
  ), n AS (
    SELECT *,customer_missing_name+customer_missing_phone+customer_missing_code+customer_duplicate_names customer_issues,
      product_missing_sku+product_missing_name+product_zero_price+product_negative_price+product_duplicate_sku product_issues,
      invoice_zero_total+invoice_negative_total+invoice_paid_exceeds+invoice_missing_customer+invoice_missing_date+invoice_duplicate_number invoice_issues,
      balance_negative_quantity+balance_negative_cost+balance_missing_product balance_issues FROM m
  )
  SELECT jsonb_build_object(
    'status',case when customer_total+product_total+invoice_total+balance_total=0 then 'EMPTY' else 'OK' end,
    'tenant_id',v_company,
    'entities',case when customer_total+product_total+invoice_total+balance_total=0 then '[]'::jsonb else jsonb_build_array(
      jsonb_build_object('name','العملاء','total',customer_total,'issues',customer_issues,'score',case when customer_total>0 then greatest(0,least(100,round(((customer_total-customer_issues)::numeric/customer_total)*100))) else 0 end,'icon','users'),
      jsonb_build_object('name','المنتجات','total',product_total,'issues',product_issues,'score',case when product_total>0 then greatest(0,least(100,round(((product_total-product_issues)::numeric/product_total)*100))) else 0 end,'icon','package'),
      jsonb_build_object('name','الفواتير','total',invoice_total,'issues',invoice_issues,'score',case when invoice_total>0 then greatest(0,least(100,round(((invoice_total-invoice_issues)::numeric/invoice_total)*100))) else 0 end,'icon','receipt'),
      jsonb_build_object('name','المخزون','total',balance_total,'issues',balance_issues,'score',case when balance_total>0 then greatest(0,least(100,round(((balance_total-balance_issues)::numeric/balance_total)*100))) else 0 end,'icon','warehouse')) end,
    'issues',case when customer_total+product_total+invoice_total+balance_total=0 then '[]'::jsonb else jsonb_build_array(
      jsonb_build_object('entity','العملاء','field','الاسم','issue','اسم فارغ','count',customer_missing_name,'severity','critical'),jsonb_build_object('entity','العملاء','field','الهاتف','issue','هاتف فارغ','count',customer_missing_phone,'severity','warning'),jsonb_build_object('entity','العملاء','field','الكود','issue','كود فارغ','count',customer_missing_code,'severity','info'),jsonb_build_object('entity','العملاء','field','الاسم','issue','أسماء مكررة','count',customer_duplicate_names,'severity','warning'),
      jsonb_build_object('entity','المنتجات','field','SKU','issue','SKU فارغ','count',product_missing_sku,'severity','critical'),jsonb_build_object('entity','المنتجات','field','الاسم','issue','اسم فارغ','count',product_missing_name,'severity','critical'),jsonb_build_object('entity','المنتجات','field','السعر','issue','سعر صفري','count',product_zero_price,'severity','warning'),jsonb_build_object('entity','المنتجات','field','السعر','issue','سعر سالب','count',product_negative_price,'severity','critical'),jsonb_build_object('entity','المنتجات','field','SKU','issue','SKU مكرر','count',product_duplicate_sku,'severity','critical'),
      jsonb_build_object('entity','الفواتير','field','الإجمالي','issue','إجمالي صفري','count',invoice_zero_total,'severity','warning'),jsonb_build_object('entity','الفواتير','field','الإجمالي','issue','إجمالي سالب','count',invoice_negative_total,'severity','critical'),jsonb_build_object('entity','الفواتير','field','المدفوع','issue','مدفوع يتجاوز الإجمالي','count',invoice_paid_exceeds,'severity','critical'),jsonb_build_object('entity','الفواتير','field','العميل','issue','عميل فارغ','count',invoice_missing_customer,'severity','critical'),jsonb_build_object('entity','الفواتير','field','التاريخ','issue','تاريخ فارغ','count',invoice_missing_date,'severity','critical'),jsonb_build_object('entity','الفواتير','field','رقم الفاتورة','issue','أرقام مكررة','count',invoice_duplicate_number,'severity','warning'),
      jsonb_build_object('entity','المخزون','field','الكمية','issue','كمية سالبة','count',balance_negative_quantity,'severity','critical'),jsonb_build_object('entity','المخزون','field','التكلفة','issue','تكلفة سالبة','count',balance_negative_cost,'severity','critical'),jsonb_build_object('entity','المخزون','field','المنتج','issue','منتج فارغ','count',balance_missing_product,'severity','critical')) end
  ) INTO v_result FROM n;
  RETURN v_result;
END;
$$;
CREATE FUNCTION public.get_entitlement_usage(p_capability text, p_period text) RETURNS numeric
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(SUM(quantity),0) FROM entitlement_usage_events WHERE company_id = public.current_company_id() AND capability = p_capability AND billing_period = p_period;
$$;
CREATE FUNCTION public.get_executive_metrics(p_company_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  WITH sales AS (
    SELECT
      coalesce(sum(si.line_total), 0)::numeric AS revenue,
      coalesce(sum(si.quantity * si.cost_price), 0)::numeric AS cost,
      count(DISTINCT si.invoice_id)::integer AS invoices
    FROM sale_items si
    JOIN sales_invoices s ON s.id = si.invoice_id
    WHERE s.company_id = v_company_id
      AND s.status NOT IN ('cancelled','void')
      AND (p_from IS NULL OR s.invoice_date >= p_from)
      AND (p_to IS NULL OR s.invoice_date <= p_to)
  ),
  purchases AS (
    SELECT coalesce(sum(pi.total), 0)::numeric AS total
    FROM purchase_invoices pi
    WHERE pi.company_id = v_company_id
      AND pi.status NOT IN ('cancelled','void')
      AND (p_from IS NULL OR pi.invoice_date >= p_from)
      AND (p_to IS NULL OR pi.invoice_date <= p_to)
  ),
  receivables AS (
    SELECT coalesce(sum(greatest(s.total - s.paid_amount, 0)), 0)::numeric AS total
    FROM sales_invoices s
    WHERE s.company_id = v_company_id
      AND s.status NOT IN ('cancelled','void')
      AND (p_to IS NULL OR s.invoice_date <= p_to)
  ),
  payables AS (
    SELECT coalesce(sum(greatest(p.total - p.paid_amount, 0)), 0)::numeric AS total
    FROM purchase_invoices p
    WHERE p.company_id = v_company_id
      AND p.status NOT IN ('cancelled','void')
      AND (p_to IS NULL OR p.invoice_date <= p_to)
  ),
  stock AS (
    SELECT
      coalesce(sum(ib.quantity), 0)::numeric AS units,
      coalesce(sum(ib.quantity * ib.unit_cost), 0)::numeric AS value,
      count(*) FILTER (WHERE ib.quantity <= coalesce(pr.reorder_point, 0))::integer AS reorder_count,
      count(*) FILTER (WHERE ib.quantity <= 0)::integer AS out_of_stock
    FROM inventory_balances ib
    JOIN products pr ON pr.id = ib.product_id AND pr.company_id = ib.company_id
    WHERE ib.company_id = v_company_id
  ),
  active_products AS (
    SELECT count(*)::integer AS total
    FROM products
    WHERE company_id = v_company_id AND is_active = true
  )
  SELECT jsonb_build_object(
    'revenue', sales.revenue,
    'cost', sales.cost,
    'gross_profit', sales.revenue - sales.cost,
    'gross_margin_pct', CASE WHEN sales.revenue = 0 THEN 0 ELSE round(((sales.revenue-sales.cost)/sales.revenue)*100,2) END,
    'invoice_count', sales.invoices,
    'purchases', purchases.total,
    'receivables', receivables.total,
    'payables', payables.total,
    'inventory_units', stock.units,
    'inventory_value', stock.value,
    'reorder_count', stock.reorder_count,
    'out_of_stock', stock.out_of_stock,
    'active_products', active_products.total,
    'as_of', coalesce(p_to, current_date)
  )
  INTO v_result
  FROM sales, purchases, receivables, payables, stock, active_products;
  RETURN v_result;
END;
$$;
CREATE FUNCTION public.get_forecast_snapshot(p_limit integer DEFAULT 500) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_result jsonb;
begin
  if v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(f) order by f.period asc, f.id asc), '[]'::jsonb),
    'limit', v_limit,
    'data_status', case when count(*) = 0 then 'NO_DATA' else 'CALCULATED' end
  ) into v_result
  from (
    select id, company_id, entity_type, entity_id, entity_name, metric,
           period, forecast_value, lower_bound, upper_bound, model_name,
           quality_score, confidence, data_points
    from public.forecasts
    where company_id = v_company_id
    order by period asc, id asc
    limit v_limit
  ) f;
  return v_result;
end;
$$;
CREATE FUNCTION public.get_inventory_export_rows(p_company_id uuid, p_max_rows integer DEFAULT 10000) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid := public.current_company_id(); v_limit integer; v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF p_max_rows IS NULL THEN v_limit := 10000; ELSIF p_max_rows < 1 OR p_max_rows > 10000 THEN RAISE EXCEPTION 'EXPORT_ROW_LIMIT_INVALID: p_max_rows must be between 1 and 10000'; ELSE v_limit := p_max_rows; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_balances ib WHERE ib.company_id=v_company_id OFFSET v_limit LIMIT 1) THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE: inventory export exceeds safe row limit'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('product',pr.name,'warehouse',w.name,'quantity',ib.quantity,'unit_cost',ib.unit_cost,'value',CASE WHEN ib.quantity IS NULL OR ib.unit_cost IS NULL THEN NULL ELSE ib.quantity*ib.unit_cost END) ORDER BY pr.name),'[]'::jsonb) INTO v_result FROM public.inventory_balances ib LEFT JOIN public.products pr ON pr.id=ib.product_id AND pr.company_id=v_company_id LEFT JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.company_id=v_company_id WHERE ib.company_id=v_company_id;
  RETURN jsonb_build_object('rows',v_result,'count',jsonb_array_length(v_result));
END; $$;
CREATE FUNCTION public.get_inventory_report_snapshot(p_page integer DEFAULT 0, p_page_size integer DEFAULT 25, p_filter text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_page integer := GREATEST(COALESCE(p_page,0),0);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size,25),1),100);
  v_filter text := CASE WHEN p_filter IN ('all','low','out') THEN p_filter ELSE 'all' END;
  v_rows jsonb;
  v_result jsonb;
  v_unknown_rows bigint;
  v_total_value numeric;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  WITH base AS (
    SELECT ib.id, ib.quantity, ib.unit_cost, ib.updated_at,
           p.id AS product_id, p.name AS product_name, p.sku AS product_sku,
           p.reorder_point, w.id AS warehouse_id, w.name AS warehouse_name
    FROM public.inventory_balances ib
    LEFT JOIN public.products p ON p.id=ib.product_id AND p.company_id=v_company_id
    LEFT JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.company_id=v_company_id
    WHERE ib.company_id=v_company_id
      AND (
        v_filter='all'
        OR (v_filter='low' AND ib.quantity IS NOT NULL AND ib.quantity > 0 AND p.reorder_point IS NOT NULL AND ib.quantity <= p.reorder_point)
        OR (v_filter='out' AND ib.quantity IS NOT NULL AND ib.quantity <= 0)
      )
  ), paged AS (
    SELECT * FROM base ORDER BY updated_at DESC, id DESC OFFSET v_page*v_page_size LIMIT v_page_size
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'quantity', quantity,
    'unit_cost', unit_cost,
    'value', CASE WHEN quantity IS NULL OR unit_cost IS NULL THEN NULL ELSE quantity*unit_cost END,
    'product', jsonb_build_object('id', product_id, 'name', product_name, 'sku', product_sku, 'reorder_point', reorder_point),
    'warehouse', jsonb_build_object('id', warehouse_id, 'name', warehouse_name)
  ) ORDER BY updated_at DESC, id DESC), '[]'::jsonb)
  INTO v_rows
  FROM paged;
  SELECT count(*) FILTER (WHERE ib.quantity IS NULL OR ib.unit_cost IS NULL),
         CASE WHEN count(*) FILTER (WHERE ib.quantity IS NULL OR ib.unit_cost IS NULL) > 0 THEN NULL
              ELSE COALESCE(sum(ib.quantity*ib.unit_cost),0) END
  INTO v_unknown_rows, v_total_value
  FROM public.inventory_balances ib
  WHERE ib.company_id=v_company_id;
  SELECT jsonb_build_object(
    'rows', v_rows,
    'page', v_page,
    'pageSize', v_page_size,
    'filter', v_filter,
    'totalRows', (SELECT count(*) FROM public.inventory_balances ib WHERE ib.company_id=v_company_id),
    'filteredRows', (SELECT count(*) FROM public.inventory_balances ib LEFT JOIN public.products p ON p.id=ib.product_id AND p.company_id=v_company_id WHERE ib.company_id=v_company_id AND (
      v_filter='all'
      OR (v_filter='low' AND ib.quantity IS NOT NULL AND ib.quantity > 0 AND p.reorder_point IS NOT NULL AND ib.quantity <= p.reorder_point)
      OR (v_filter='out' AND ib.quantity IS NOT NULL AND ib.quantity <= 0)
    )),
    'lowStock', (SELECT count(*) FROM public.inventory_balances ib LEFT JOIN public.products p ON p.id=ib.product_id AND p.company_id=v_company_id WHERE ib.company_id=v_company_id AND ib.quantity IS NOT NULL AND ib.quantity > 0 AND p.reorder_point IS NOT NULL AND ib.quantity <= p.reorder_point),
    'outOfStock', (SELECT count(*) FROM public.inventory_balances ib WHERE ib.company_id=v_company_id AND ib.quantity IS NOT NULL AND ib.quantity <= 0),
    'unknownRows', v_unknown_rows,
    'totalValue', v_total_value,
    'dataStatus', CASE WHEN (SELECT count(*) FROM public.inventory_balances WHERE company_id=v_company_id)=0 THEN 'NO_DATA' WHEN v_unknown_rows>0 THEN 'INSUFFICIENT_DATA' ELSE 'CALCULATED' END
  ) INTO v_result;
  RETURN v_result;
END;
$$;
CREATE FUNCTION public.get_inventory_valuation(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_company_id is distinct from v_company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  select jsonb_build_object(
    'value', case when count(*) filter (where ib.quantity is null or ib.unit_cost is null) > 0 then null else coalesce(sum(ib.quantity * ib.unit_cost), 0) end,
    'row_count', count(*)::integer,
    'unknown_row_count', count(*) filter (where ib.quantity is null or ib.unit_cost is null)::integer,
    'data_status', case
      when count(*) = 0 then 'NO_DATA'
      when count(*) filter (where ib.quantity is null or ib.unit_cost is null) > 0 then 'INSUFFICIENT_DATA'
      else 'CALCULATED'
    end
  ) into v_result
  from public.inventory_balances ib
  where ib.company_id = v_company_id;
  return v_result;
end;
$$;
CREATE FUNCTION public.get_profitability_snapshot(p_as_of date DEFAULT CURRENT_DATE) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_currency text; v_result jsonb;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 SELECT c.currency INTO v_currency FROM public.companies c WHERE c.id=v_company_id;
 WITH sales_base AS (SELECT s.id,s.subtotal,s.total,s.paid_amount,s.currency FROM public.sales_invoices s WHERE s.company_id=v_company_id AND s.status IS NOT NULL AND s.status NOT IN ('cancelled','void') AND s.invoice_date<=p_as_of),
 items AS (SELECT si.invoice_id,si.quantity,si.cost_price,si.line_total FROM public.sale_items si JOIN sales_base s ON s.id=si.invoice_id),
 quality AS (SELECT count(*) FILTER(WHERE subtotal IS NULL OR total IS NULL OR paid_amount IS NULL) bad_invoice_rows,(SELECT count(*) FROM items WHERE quantity IS NULL OR cost_price IS NULL OR line_total IS NULL) bad_sale_item_rows,(SELECT count(*) FROM sales_base WHERE currency IS NOT NULL AND v_currency IS NOT NULL AND currency<>v_currency) currency_mismatch_rows FROM sales_base),
 totals AS (SELECT coalesce(sum(s.subtotal) FILTER(WHERE s.subtotal IS NOT NULL),0)::numeric revenue,coalesce((SELECT sum(i.quantity*i.cost_price) FROM items i WHERE i.quantity IS NOT NULL AND i.cost_price IS NOT NULL),0)::numeric cost,count(*)::integer invoice_count FROM sales_base s)
 SELECT jsonb_build_object('status',CASE WHEN q.bad_invoice_rows=0 AND q.bad_sale_item_rows=0 AND q.currency_mismatch_rows=0 AND t.invoice_count>0 THEN 'CALCULATED' ELSE 'INSUFFICIENT_DATA' END,'currency',v_currency,'currency_status',CASE WHEN q.currency_mismatch_rows=0 AND v_currency IS NOT NULL THEN 'CONSISTENT' ELSE 'INSUFFICIENT_DATA' END,'revenue',CASE WHEN q.bad_invoice_rows=0 AND q.currency_mismatch_rows=0 THEN t.revenue END,'cost',CASE WHEN q.bad_sale_item_rows=0 AND q.currency_mismatch_rows=0 THEN t.cost END,'gross_profit',CASE WHEN q.bad_invoice_rows=0 AND q.bad_sale_item_rows=0 AND q.currency_mismatch_rows=0 THEN t.revenue-t.cost END,'gross_margin',CASE WHEN q.bad_invoice_rows=0 AND q.bad_sale_item_rows=0 AND q.currency_mismatch_rows=0 AND t.revenue<>0 THEN ((t.revenue-t.cost)/t.revenue)*100 END,'invoice_count',t.invoice_count,'bad_invoice_rows',q.bad_invoice_rows,'bad_sale_item_rows',q.bad_sale_item_rows,'currency_mismatch_rows',q.currency_mismatch_rows,'reasons',CASE WHEN q.bad_invoice_rows>0 OR q.bad_sale_item_rows>0 OR q.currency_mismatch_rows>0 OR t.invoice_count=0 THEN to_jsonb(array_remove(array[case when q.bad_invoice_rows>0 then 'INVOICE_DATA_QUALITY' end,case when q.bad_sale_item_rows>0 then 'SALE_ITEM_DATA_QUALITY' end,case when q.currency_mismatch_rows>0 then 'CURRENCY_MISMATCH' end,case when t.invoice_count=0 then 'NO_SALES_DATA' end],null)) ELSE '[]'::jsonb END,'as_of',p_as_of) INTO v_result FROM quality q CROSS JOIN totals t;
 RETURN v_result;
END; $$;
CREATE FUNCTION public.get_purchase_export_rows(p_company_id uuid, p_max_rows integer DEFAULT 10000) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid := public.current_company_id(); v_limit integer; v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF p_max_rows IS NULL THEN v_limit := 10000; ELSIF p_max_rows < 1 OR p_max_rows > 10000 THEN RAISE EXCEPTION 'EXPORT_ROW_LIMIT_INVALID: p_max_rows must be between 1 and 10000'; ELSE v_limit := p_max_rows; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_invoices p WHERE p.company_id=v_company_id AND p.status NOT IN ('cancelled','void') OFFSET v_limit LIMIT 1) THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE: purchase export exceeds safe row limit'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_number',p.invoice_number,'supplier',s.name,'invoice_date',p.invoice_date,'total',p.total,'paid_amount',p.paid_amount,'status',p.status) ORDER BY p.invoice_date DESC),'[]'::jsonb) INTO v_result FROM public.purchase_invoices p LEFT JOIN public.suppliers s ON s.id=p.supplier_id AND s.company_id=v_company_id WHERE p.company_id=v_company_id AND p.status NOT IN ('cancelled','void');
  RETURN jsonb_build_object('rows',v_result,'count',jsonb_array_length(v_result));
END; $$;
CREATE FUNCTION public.get_purchase_summary(p_company_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_currency text; v_result jsonb; v_mismatch bigint;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
 IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to THEN RAISE EXCEPTION 'REPORT_DATE_RANGE_INVALID'; END IF;
 SELECT c.currency INTO v_currency FROM public.companies c WHERE c.id=v_company_id;
 SELECT count(*) FILTER(WHERE pi.currency IS NOT NULL AND v_currency IS NOT NULL AND pi.currency<>v_currency) INTO v_mismatch FROM public.purchase_invoices pi WHERE pi.company_id=v_company_id AND pi.status NOT IN ('cancelled','void') AND (p_from IS NULL OR pi.invoice_date>=p_from) AND (p_to IS NULL OR pi.invoice_date<=p_to);
 SELECT jsonb_build_object('total',CASE WHEN v_mismatch=0 THEN coalesce(sum(pi.total),0) END,'count',count(*)::integer,'supplier_count',count(distinct pi.supplier_id)::integer,'average',CASE WHEN v_mismatch=0 AND count(*)>0 THEN sum(pi.total)/count(*) END,'as_of',coalesce(p_to,current_date),'data_status',CASE WHEN count(*)=0 THEN 'NO_DATA' WHEN v_mismatch>0 THEN 'INSUFFICIENT_DATA' ELSE 'CALCULATED' END,'currency',v_currency,'currency_status',CASE WHEN v_mismatch=0 AND v_currency IS NOT NULL THEN 'CONSISTENT' ELSE 'INSUFFICIENT_DATA' END,'currency_mismatch_rows',v_mismatch) INTO v_result FROM public.purchase_invoices pi WHERE pi.company_id=v_company_id AND pi.status NOT IN ('cancelled','void') AND (p_from IS NULL OR pi.invoice_date>=p_from) AND (p_to IS NULL OR pi.invoice_date<=p_to);
 RETURN v_result;
END; $$;
CREATE FUNCTION public.get_receivables_export_rows(p_company_id uuid, p_max_rows integer DEFAULT 10000) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid := public.current_company_id(); v_limit integer; v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF p_max_rows IS NULL THEN v_limit := 10000; ELSIF p_max_rows < 1 OR p_max_rows > 10000 THEN RAISE EXCEPTION 'EXPORT_ROW_LIMIT_INVALID: p_max_rows must be between 1 and 10000'; ELSE v_limit := p_max_rows; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_invoices s WHERE s.company_id=v_company_id AND s.status NOT IN ('cancelled','void') AND greatest(s.total-s.paid_amount,0)>0 OFFSET v_limit LIMIT 1) THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE: receivables export exceeds safe row limit'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_number',s.invoice_number,'customer',c.name,'invoice_date',s.invoice_date,'due_date',s.due_date,'total',s.total,'paid_amount',s.paid_amount,'balance',CASE WHEN s.total IS NULL OR s.paid_amount IS NULL THEN NULL ELSE greatest(s.total-s.paid_amount,0) END) ORDER BY s.invoice_date DESC),'[]'::jsonb) INTO v_result FROM public.sales_invoices s LEFT JOIN public.customers c ON c.id=s.customer_id AND c.company_id=v_company_id WHERE s.company_id=v_company_id AND s.status NOT IN ('cancelled','void') AND greatest(s.total-s.paid_amount,0)>0;
  RETURN jsonb_build_object('rows',v_result,'count',jsonb_array_length(v_result),'as_of',current_date);
END; $$;
CREATE FUNCTION public.get_receivables_report_page(p_page integer DEFAULT 0, p_page_size integer DEFAULT 25) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_total_rows integer := 0;
  v_total_outstanding numeric := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED'; END IF;
  SELECT count(*)::integer,
         coalesce(sum(greatest(coalesce(si.total, 0) - coalesce(si.paid_amount, 0), 0)), 0)
    INTO v_total_rows, v_total_outstanding
    FROM public.sales_invoices si
   WHERE si.company_id = v_company_id
     AND coalesce(si.total, 0) > coalesce(si.paid_amount, 0)
     AND coalesce(si.status, 'confirmed') <> 'cancelled';
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.invoice_date DESC, q.id ASC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT si.id, si.invoice_number, si.invoice_date, si.due_date, si.total,
             si.paid_amount,
             greatest(coalesce(si.total, 0) - coalesce(si.paid_amount, 0), 0) AS balance,
             si.status,
             jsonb_build_object('id', c.id, 'name', c.name) AS customer
        FROM public.sales_invoices si
        LEFT JOIN public.customers c ON c.id = si.customer_id AND c.company_id = v_company_id
       WHERE si.company_id = v_company_id
         AND coalesce(si.total, 0) > coalesce(si.paid_amount, 0)
         AND coalesce(si.status, 'confirmed') <> 'cancelled'
       ORDER BY si.invoice_date DESC, si.id ASC
       OFFSET v_page * v_page_size LIMIT v_page_size
    ) q;
  RETURN jsonb_build_object('status', CASE WHEN v_total_rows = 0 THEN 'NO_DATA' ELSE 'CALCULATED' END,
    'page', v_page, 'page_size', v_page_size, 'total_rows', v_total_rows,
    'total_outstanding', v_total_outstanding, 'rows', v_rows);
END;
$$;
CREATE FUNCTION public.get_report_value_cohort_candidates(p_limit integer DEFAULT 100, p_company_id uuid DEFAULT NULL::uuid) RETURNS TABLE(job_id uuid, company_id uuid, source_path text, source_hash text, job_key text, checkpoint jsonb, evidence jsonb, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
  with jobs as (
    select j.id, j.company_id, j.source_path, j.source_hash, j.job_key, j.checkpoint, j.evidence, j.updated_at
    from public.report_execution_jobs j
    where j.status = 'completed'
      and j.checkpoint->>'stage' = 'rendered'
      and j.company_id is not null
      and j.source_hash ~ '^sha256:[0-9a-fA-F]{64}$'
      and j.source_path ~* '\.(xlsx|xls|xlsm|csv|tsv|ods|pdf|docx|doc|rtf|json|jsonl|txt|md|markdown|jpg|jpeg|png|webp|tiff|bmp)$'
      and j.source_path !~* '^canonical-import:'
      and j.source_path !~* '^(customer|product|invoice)-'
      and j.job_key ~ '^canonical-import:generic:'
      and (j.evidence->'renderedOutput'->>'importId') ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,35}$'
      and (p_company_id is null or j.company_id = p_company_id)
  ),
  eligible as (
    select distinct on (j.source_hash)
      j.id as job_id,
      j.company_id,
      j.source_path,
      j.source_hash,
      j.job_key,
      j.checkpoint,
      j.evidence,
      j.updated_at
    from jobs j
    join lateral (
      select fr.id
      from public.file_records fr
      where fr.company_id = j.company_id
        and fr.file_hash = j.source_hash
        and fr.security_status = 'passed'
        and fr.status in ('ready','processed','verified')
      limit 1
    ) fr on true
    join lateral (
      select ij.id
      from public.import_jobs ij
      where ij.id = (j.evidence->'renderedOutput'->>'importId')::uuid
        and ij.company_id = j.company_id
        and ij.file_record_id = fr.id
      limit 1
    ) ij on true
    join lateral (
      select sas.id
      from public.source_analysis_snapshots sas
      where sas.company_id = j.company_id
        and sas.import_job_id = ij.id
        and sas.analysis_status = 'analyzed'
      limit 1
    ) sas on true
    order by j.source_hash, lower(j.source_path), j.company_id, j.id
  )
  select *
  from eligible
  order by lower(source_path), source_hash, company_id, job_id
  limit least(greatest(coalesce(p_limit,100),1),500);
$_$;
CREATE FUNCTION public.get_rfm_snapshot(p_as_of date DEFAULT CURRENT_DATE, p_limit integer DEFAULT 500) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid:=public.current_company_id(); v_limit integer:=LEAST(GREATEST(COALESCE(p_limit,500),1),500); v_unknown bigint; v_rows jsonb; v_status text;
BEGIN
 IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
 WITH raw AS (
   SELECT si.customer_id,c.name customer_name,si.invoice_date,si.total
   FROM public.sales_invoices si LEFT JOIN public.customers c ON c.id=si.customer_id AND c.company_id=v_company_id
   WHERE si.company_id=v_company_id AND si.status NOT IN ('cancelled','void')
 ), valid AS (
   SELECT * FROM raw WHERE customer_id IS NOT NULL AND customer_name IS NOT NULL AND invoice_date IS NOT NULL AND total IS NOT NULL
 ), agg AS (
   SELECT customer_id,max(customer_name) customer_name,(p_as_of-max(invoice_date::date))::integer recency,count(*)::integer frequency,sum(total)::numeric monetary
   FROM valid GROUP BY customer_id
 ), scored AS (
   SELECT a.*,
     least(5,floor((row_number() over(order by recency asc,customer_id)-1)::numeric/greatest(count(*) over(),1)*5)::integer+1) r_score,
     least(5,floor((row_number() over(order by frequency desc,customer_id)-1)::numeric/greatest(count(*) over(),1)*5)::integer+1) f_score,
     least(5,floor((row_number() over(order by monetary desc,customer_id)-1)::numeric/greatest(count(*) over(),1)*5)::integer+1) m_score
   FROM agg a
 ), final_rows AS (
   SELECT customer_id,customer_name,recency,frequency,monetary,r_score,f_score,m_score,
     CASE WHEN r_score+f_score+m_score>=13 THEN 'أبطال' WHEN r_score+f_score+m_score>=10 THEN 'مخلصون'
          WHEN r_score+f_score+m_score>=7 THEN 'واعدون' WHEN r_score+f_score+m_score>=4 THEN 'معرضون للخطر' ELSE 'خاملون' END rfm_segment
   FROM scored ORDER BY (r_score+f_score+m_score) DESC,monetary DESC,customer_id LIMIT v_limit
 )
 SELECT
   (SELECT count(*) FILTER(WHERE customer_id IS NULL OR customer_name IS NULL OR invoice_date IS NULL OR total IS NULL) FROM raw),
   coalesce((SELECT jsonb_agg(to_jsonb(fr)) FROM final_rows fr),'[]'::jsonb),
   CASE WHEN NOT EXISTS(SELECT 1 FROM valid) THEN 'INSUFFICIENT_DATA' ELSE 'CALCULATED' END
 INTO v_unknown,v_rows,v_status;
 RETURN jsonb_build_object('asOf',p_as_of,'rows',v_rows,'unknownRows',v_unknown,'status',v_status);
END; $$;
CREATE FUNCTION public.get_sales_export_rows(p_company_id uuid, p_max_rows integer DEFAULT 10000) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_company_id uuid := public.current_company_id(); v_limit integer; v_result jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF p_max_rows IS NULL THEN v_limit := 10000; ELSIF p_max_rows < 1 OR p_max_rows > 10000 THEN RAISE EXCEPTION 'EXPORT_ROW_LIMIT_INVALID: p_max_rows must be between 1 and 10000'; ELSE v_limit := p_max_rows; END IF;
  IF EXISTS (SELECT 1 FROM public.sales_invoices s WHERE s.company_id=v_company_id AND s.status NOT IN ('cancelled','void') OFFSET v_limit LIMIT 1) THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE: sales export exceeds safe row limit'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_number',s.invoice_number,'customer',c.name,'invoice_date',s.invoice_date,'total',s.total,'paid_amount',s.paid_amount,'status',s.status) ORDER BY s.invoice_date DESC),'[]'::jsonb) INTO v_result FROM public.sales_invoices s LEFT JOIN public.customers c ON c.id=s.customer_id AND c.company_id=v_company_id WHERE s.company_id=v_company_id AND s.status NOT IN ('cancelled','void');
  RETURN jsonb_build_object('rows',v_result,'count',jsonb_array_length(v_result));
END; $$;
CREATE FUNCTION public.get_sales_secondary_metrics(p_company_id uuid, p_months integer DEFAULT 6, p_limit integer DEFAULT 5, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_as_of date := coalesce(p_to, current_date);
  v_months integer := greatest(1, least(coalesce(p_months, 6), 24));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 100));
  v_result jsonb;
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_company_id is distinct from v_company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception 'REPORT_DATE_RANGE_INVALID'; end if;
  with filtered_invoices as (
    select s.id, s.customer_id, s.subtotal, s.total, s.paid_amount, s.due_date, s.invoice_date
    from public.sales_invoices s
    where s.company_id = v_company_id
      and s.status not in ('cancelled', 'void')
      and (p_from is null or s.invoice_date >= p_from)
      and (p_to is null or s.invoice_date <= p_to)
  ),
  filtered_items as (
    select si.invoice_id, si.product_id, si.quantity, si.line_total, si.cost_price,
           p.name as product_name, c.name as category_name
    from public.sale_items si
    join filtered_invoices fi on fi.id = si.invoice_id
    left join public.products p on p.id = si.product_id and p.company_id = v_company_id
    left join public.categories c on c.id = p.category_id and c.company_id = v_company_id
  ),
  monthly as (
    select jsonb_agg(jsonb_build_object(
      'month', to_char(m.month_start, 'YYYY-MM'),
      'label', case extract(month from m.month_start)::int
        when 1 then 'يناير' when 2 then 'فبراير' when 3 then 'مارس' when 4 then 'أبريل'
        when 5 then 'مايو' when 6 then 'يونيو' when 7 then 'يوليو' when 8 then 'أغسطس'
        when 9 then 'سبتمبر' when 10 then 'أكتوبر' when 11 then 'نوفمبر' when 12 then 'ديسمبر' end,
      'sales', coalesce(x.sales, 0), 'cost', coalesce(x.cost, 0),
      'profit', coalesce(x.sales, 0) - coalesce(x.cost, 0), 'invoices', coalesce(x.invoices, 0)
    ) order by m.month_start) as value
    from generate_series(
      date_trunc('month', v_as_of)::date - ((v_months - 1) * interval '1 month'),
      date_trunc('month', v_as_of)::date, interval '1 month'
    ) m(month_start)
    left join (
      select date_trunc('month', fi.invoice_date)::date as month_start,
             sum(fi.subtotal) as sales, sum(coalesce(fi_cost.cost, 0)) as cost, count(*)::integer as invoices
      from filtered_invoices fi
      left join (
        select invoice_id, sum(quantity * cost_price) as cost
        from filtered_items where cost_price is not null and quantity is not null group by invoice_id
      ) fi_cost on fi_cost.invoice_id = fi.id
      group by date_trunc('month', fi.invoice_date)::date
    ) x on x.month_start = m.month_start
  ),
  top_customers as (
    select coalesce(jsonb_agg(jsonb_build_object('id', q.customer_id, 'name', q.name, 'value', q.value) order by q.value desc), '[]'::jsonb) as value
    from (
      select fi.customer_id, coalesce(c.name, fi.customer_id::text) as name, sum(fi.subtotal) as value
      from filtered_invoices fi
      left join public.customers c on c.id = fi.customer_id and c.company_id = v_company_id
      group by fi.customer_id, c.name order by value desc limit v_limit
    ) q
  ),
  top_products as (
    select coalesce(jsonb_agg(jsonb_build_object('id', q.product_id, 'name', q.name, 'value', q.value, 'secondary', q.quantity) order by q.value desc), '[]'::jsonb) as value
    from (
      select fi.product_id, coalesce(fi.product_name, fi.product_id::text) as name,
             sum(fi.line_total) as value, sum(fi.quantity) as quantity
      from filtered_items fi where fi.product_id is not null
      group by fi.product_id, fi.product_name order by value desc limit v_limit
    ) q
  ),
  categories as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', q.name, 'sales', q.sales,
      'profit', case when q.missing_cost > 0 then null else q.sales - q.cost end,
      'quantity', q.quantity,
      'data_status', case when q.missing_cost > 0 then 'INSUFFICIENT_DATA' else 'CALCULATED' end
    ) order by q.sales desc), '[]'::jsonb) as value
    from (
      select coalesce(fi.category_name, 'غير مصنف') as name,
             sum(fi.line_total) as sales,
             sum(case when fi.cost_price is null or fi.quantity is null then 0 else fi.quantity * fi.cost_price end) as cost,
             sum(fi.quantity) as quantity,
             count(*) filter (where fi.cost_price is null or fi.quantity is null) as missing_cost
      from filtered_items fi group by coalesce(fi.category_name, 'غير مصنف')
    ) q
  ),
  aging_rows as (
    select case
      when fi.due_date is null then 'UNDATED'
      when greatest(0, v_as_of - fi.due_date) <= 30 then '0-30'
      when greatest(0, v_as_of - fi.due_date) <= 60 then '31-60'
      when greatest(0, v_as_of - fi.due_date) <= 90 then '61-90'
      else '90+' end as bucket,
      case
        when fi.due_date is null then 5
        when greatest(0, v_as_of - fi.due_date) <= 30 then 1
        when greatest(0, v_as_of - fi.due_date) <= 60 then 2
        when greatest(0, v_as_of - fi.due_date) <= 90 then 3
        else 4 end as bucket_order,
      greatest(fi.total - fi.paid_amount, 0) as outstanding
    from filtered_invoices fi
    where greatest(fi.total - fi.paid_amount, 0) > 0
  ),
  aging as (
    select coalesce(jsonb_agg(jsonb_build_object('bucket', q.bucket, 'amount', q.amount, 'count', q.count) order by q.bucket_order), '[]'::jsonb) as value
    from (
      select bucket, bucket_order, sum(outstanding) as amount, count(*)::integer as count
      from aging_rows group by bucket, bucket_order
    ) q
  )
  select jsonb_build_object(
    'as_of', v_as_of, 'months', v_months, 'limit', v_limit,
    'monthly_trend', coalesce(monthly.value, '[]'::jsonb),
    'top_customers', top_customers.value, 'top_products', top_products.value,
    'category_breakdown', categories.value, 'aging_buckets', aging.value
  ) into v_result
  from monthly, top_customers, top_products, categories, aging;
  return v_result;
end;
$$;
CREATE FUNCTION public.heartbeat_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer DEFAULT 300) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare affected integer;
begin
  if p_company_id is null then raise exception 'Worker company context is required'; end if;
  if p_lease_seconds is null or p_lease_seconds<30 then raise exception 'Worker lease must be at least 30 seconds'; end if;
  update public.report_execution_jobs set lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
   where id=p_job_id and company_id=p_company_id and status in ('leased','processing') and lease_owner=p_worker_id and lease_token=p_lease_token and lease_expires_at is not null and lease_expires_at>now();
  get diagnostics affected=row_count; return affected=1;
end;$$;
CREATE FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text DEFAULT 'preserve'::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_row jsonb;
  v_id uuid;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('products', 'customers', 'sales_invoices') THEN RAISE EXCEPTION 'IMPORT_ENTITY_TYPE_UNSUPPORTED'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'IMPORT_ROWS_MUST_BE_ARRAY'; END IF;
  IF jsonb_array_length(p_rows) = 0 THEN RETURN jsonb_build_object('committed', 0, 'ids', '[]'::jsonb); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF p_entity_type = 'products' THEN
      SELECT target_id INTO v_id FROM public.import_upsert_product(
        v_company_id, v_row->>'sku', v_row->>'name', v_row->>'unit',
        NULLIF(v_row->>'cost_price','')::numeric, NULLIF(v_row->>'selling_price','')::numeric,
        NULLIF(v_row->>'min_stock','')::numeric, NULLIF(v_row->>'reorder_point','')::numeric,
        CASE WHEN v_row ? 'is_active' AND v_row->>'is_active' <> '' THEN (v_row->>'is_active')::boolean ELSE NULL END,
        p_null_policy
      );
    ELSIF p_entity_type = 'customers' THEN
      SELECT target_id INTO v_id FROM public.import_upsert_customer(
        v_company_id, v_row->>'name', v_row->>'code', v_row->>'phone', v_row->>'email', v_row->>'segment',
        NULLIF(v_row->>'credit_limit','')::numeric, NULLIF(v_row->>'payment_terms_days','')::integer, p_null_policy
      );
    ELSE
      SELECT target_id INTO v_id FROM public.import_upsert_sales_invoice(
        v_company_id, v_row->>'invoice_number', NULLIF(v_row->>'invoice_date','')::date,
        NULLIF(v_row->>'customer_id','')::uuid, v_row->>'customer_name',
        NULLIF(v_row->>'subtotal','')::numeric, NULLIF(v_row->>'tax_amount','')::numeric,
        NULLIF(v_row->>'total','')::numeric, NULLIF(v_row->>'paid_amount','')::numeric,
        v_row->>'status', p_null_policy
      );
    END IF;
    IF v_id IS NULL THEN RAISE EXCEPTION 'IMPORT_TARGET_ID_MISSING'; END IF;
    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_id);
  END LOOP;
  RETURN jsonb_build_object('committed', v_count, 'ids', v_ids);
END;
$$;
COMMENT ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text) IS 'Atomic governed import chunk wrapper. Reuses canonical tenant-scoped entity RPCs; any row failure rolls back the whole chunk.';
CREATE FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text DEFAULT 'preserve'::text, p_source_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    SET statement_timeout TO '30s'
    AS $_$
declare
  v_company_id uuid := public.current_company_id();
  v_row jsonb;
  v_id uuid;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_existing public.canonical_import_commits%rowtype;
  v_coded_ids jsonb := '[]'::jsonb;
  v_null_ids jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_company_id is distinct from v_company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  if p_source_hash is null or btrim(p_source_hash) = '' then raise exception 'IMPORT_SOURCE_HASH_REQUIRED'; end if;
  if p_source_hash !~ '^sha256:[0-9a-fA-F]{64}$' then raise exception 'IMPORT_SOURCE_HASH_INVALID'; end if;
  if p_entity_type !~ '^generic:[a-z][a-z0-9_-]{0,63}$'
     and p_entity_type not in ('products','customers','sales_invoices') then
    raise exception 'IMPORT_ENTITY_TYPE_UNSUPPORTED';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'IMPORT_ROWS_MUST_BE_ARRAY'; end if;
  select * into v_existing
  from public.canonical_import_commits c
  where c.company_id=v_company_id and c.entity_type=p_entity_type and c.source_hash=p_source_hash
  for update;
  if found then
    return jsonb_build_object('committed',v_existing.committed_count,'ids',v_existing.committed_ids,'idempotent_replay',true);
  end if;
  if p_entity_type ~ '^generic:' then
    if jsonb_array_length(p_rows)=0 then
      insert into public.canonical_import_commits(company_id,entity_type,source_hash,committed_ids,committed_count)
      values(v_company_id,p_entity_type,p_source_hash,'[]'::jsonb,0)
      on conflict(company_id,entity_type,source_hash) do nothing;
      return jsonb_build_object('committed',0,'ids','[]'::jsonb,'idempotent_replay',false);
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_rows) as x(value)
      where jsonb_typeof(value) is distinct from 'object'
         or jsonb_typeof(value->'data') is distinct from 'object'
         or jsonb_typeof(value->'provenance') is distinct from 'object'
         or nullif(value->>'row_number','') is null
         or (value->>'row_number')::integer < 1
         or nullif(btrim(value->>'record_key'),'') is null
         or value->'provenance'->>'sourceHash' is distinct from p_source_hash
    ) then
      raise exception 'GENERIC_CANONICAL_ROW_INVALID';
    end if;
    if exists (
      select 1
      from (
        select value->>'record_key' as record_key, count(*) as c
        from jsonb_array_elements(p_rows) as x(value)
        group by value->>'record_key'
        having count(*) > 1
      ) d
    ) then
      raise exception 'GENERIC_CANONICAL_DUPLICATE_RECORD_KEY';
    end if;
    insert into public.canonical_import_commits(company_id,entity_type,source_hash,committed_ids,committed_count)
    values(v_company_id,p_entity_type,p_source_hash,'[]'::jsonb,0)
    on conflict(company_id,entity_type,source_hash) do nothing;
    if not found then
      select * into v_existing
      from public.canonical_import_commits c
      where c.company_id=v_company_id and c.entity_type=p_entity_type and c.source_hash=p_source_hash
      for update;
      return jsonb_build_object('committed',v_existing.committed_count,'ids',v_existing.committed_ids,'idempotent_replay',true);
    end if;
    with inserted as (
      insert into public.canonical_dataset_records(
        company_id,import_job_id,source_hash,semantic_domain,row_number,record_key,data,provenance
      )
      select
        v_company_id,
        nullif(value->'provenance'->>'sourceDocumentId','')::uuid,
        p_source_hash,
        substr(p_entity_type,9),
        (value->>'row_number')::integer,
        value->>'record_key',
        value->'data',
        value->'provenance'
      from jsonb_array_elements(p_rows) as x(value)
      order by (value->>'row_number')::integer
      returning id,row_number
    )
    select count(*)::integer, coalesce(jsonb_agg(id order by row_number),'[]'::jsonb)
      into v_count,v_ids
    from inserted;
    if v_count <> jsonb_array_length(p_rows) then raise exception 'GENERIC_CANONICAL_COMMIT_COUNT_MISMATCH'; end if;
    update public.canonical_import_commits
      set committed_ids=v_ids, committed_count=v_count, committed_at=clock_timestamp()
      where company_id=v_company_id and entity_type=p_entity_type and source_hash=p_source_hash;
    return jsonb_build_object('committed',v_count,'ids',v_ids,'idempotent_replay',false);
  end if;
  if jsonb_array_length(p_rows)=0 then
    insert into public.canonical_import_commits(company_id,entity_type,source_hash,committed_ids,committed_count)
    values(v_company_id,p_entity_type,p_source_hash,'[]'::jsonb,0);
    return jsonb_build_object('committed',0,'ids','[]'::jsonb,'idempotent_replay',false);
  end if;
  if p_entity_type='customers' and jsonb_array_length(p_rows) <= 10 then
    for v_row in select value from jsonb_array_elements(p_rows) loop
      select target_id into v_id from public.import_upsert_customer(
        v_company_id,v_row->>'name',v_row->>'code',v_row->>'phone',v_row->>'email',v_row->>'segment',
        nullif(v_row->>'credit_limit','')::numeric,nullif(v_row->>'payment_terms_days','')::integer,p_null_policy
      );
      if v_id is null then raise exception 'IMPORT_TARGET_ID_MISSING'; end if;
      v_count:=v_count+1; v_ids:=v_ids||jsonb_build_array(v_id);
    end loop;
  elsif p_entity_type='customers' then
    create temp table tmp_import_customers on commit drop as
    select ord::bigint as ord,
      nullif(btrim(value->>'name'),'') as name,
      nullif(btrim(value->>'code'),'') as code,
      nullif(btrim(value->>'phone'),'') as phone,
      nullif(btrim(value->>'email'),'') as email,
      nullif(btrim(value->>'segment'),'') as segment,
      nullif(value->>'credit_limit','')::numeric as credit_limit,
      nullif(value->>'payment_terms_days','')::integer as payment_terms_days,
      public.normalize_import_key(nullif(btrim(value->>'code'),'')) as norm_code,
      null::uuid as target_id
    from jsonb_array_elements(p_rows) with ordinality as x(value,ord);
    if exists (select 1 from tmp_import_customers where name is null or name='') then raise exception 'customer name is required'; end if;
    update public.customers c
    set name=case when p_null_policy='preserve' and t.name is null then c.name else coalesce(t.name,c.name) end,
        phone=case when p_null_policy='preserve' and t.phone is null then c.phone else coalesce(t.phone,c.phone) end,
        email=case when p_null_policy='preserve' and t.email is null then c.email else coalesce(t.email,c.email) end,
        segment=case when p_null_policy='preserve' and t.segment is null then c.segment else coalesce(t.segment,c.segment) end,
        credit_limit=case when p_null_policy='preserve' and t.credit_limit is null then c.credit_limit else coalesce(t.credit_limit,c.credit_limit) end,
        payment_terms_days=case when p_null_policy='preserve' and t.payment_terms_days is null then c.payment_terms_days else coalesce(t.payment_terms_days,c.payment_terms_days) end
    from tmp_import_customers t
    where t.norm_code is not null and c.company_id=v_company_id and c.code is not null and btrim(c.code)<>'' and public.normalize_import_key(c.code)=t.norm_code;
    insert into public.customers(company_id,name,code,phone,email,segment,credit_limit,payment_terms_days)
    select v_company_id,t.name,t.code,t.phone,t.email,coalesce(t.segment,'regular'),coalesce(t.credit_limit,0),coalesce(t.payment_terms_days,30)
    from tmp_import_customers t
    where t.norm_code is not null and not exists (
      select 1 from public.customers c where c.company_id=v_company_id and c.code is not null and btrim(c.code)<>'' and public.normalize_import_key(c.code)=t.norm_code
    ) on conflict do nothing;
    for v_row in select to_jsonb(t) from tmp_import_customers t where t.norm_code is null order by t.ord loop
      select target_id into v_id from public.import_upsert_customer(
        v_company_id,v_row->>'name',null,v_row->>'phone',v_row->>'email',v_row->>'segment',
        nullif(v_row->>'credit_limit','')::numeric,nullif(v_row->>'payment_terms_days','')::integer,p_null_policy
      );
      if v_id is null then raise exception 'IMPORT_TARGET_ID_MISSING'; end if;
      update tmp_import_customers set target_id=v_id where ord=(v_row->>'ord')::bigint;
    end loop;
    select coalesce(jsonb_agg(c.id order by t.ord),'[]'::jsonb) into v_coded_ids
    from tmp_import_customers t
    join public.customers c on c.company_id=v_company_id and c.code is not null and btrim(c.code)<>'' and public.normalize_import_key(c.code)=t.norm_code
    where t.norm_code is not null;
    select coalesce(jsonb_agg(target_id order by ord),'[]'::jsonb) into v_null_ids
    from tmp_import_customers where norm_code is null and target_id is not null;
    v_ids := v_coded_ids || v_null_ids;
    v_count := jsonb_array_length(v_ids);
    if v_count <> jsonb_array_length(p_rows) then raise exception 'IMPORT_TARGET_ID_MISSING'; end if;
  else
    for v_row in select value from jsonb_array_elements(p_rows) loop
      if p_entity_type='products' then
        select target_id into v_id from public.import_upsert_product(
          v_company_id,v_row->>'sku',v_row->>'name',v_row->>'unit',
          nullif(v_row->>'cost_price','')::numeric,nullif(v_row->>'selling_price','')::numeric,
          nullif(v_row->>'min_stock','')::numeric,nullif(v_row->>'reorder_point','')::numeric,
          case when v_row ? 'is_active' and v_row->>'is_active'<>'' then (v_row->>'is_active')::boolean else null end,p_null_policy
        );
      else
        select target_id into v_id from public.import_upsert_sales_invoice(
          v_company_id,v_row->>'invoice_number',nullif(v_row->>'invoice_date','')::date,
          nullif(v_row->>'customer_id','')::uuid,v_row->>'customer_name',
          nullif(v_row->>'subtotal','')::numeric,nullif(v_row->>'tax_amount','')::numeric,
          nullif(v_row->>'total','')::numeric,nullif(v_row->>'paid_amount','')::numeric,
          v_row->>'status',p_null_policy
        );
      end if;
      if v_id is null then raise exception 'IMPORT_TARGET_ID_MISSING'; end if;
      v_count:=v_count+1; v_ids:=v_ids||jsonb_build_array(v_id);
    end loop;
  end if;
  insert into public.canonical_import_commits(company_id,entity_type,source_hash,committed_ids,committed_count)
  values(v_company_id,p_entity_type,p_source_hash,v_ids,v_count);
  return jsonb_build_object('committed',v_count,'ids',v_ids,'idempotent_replay',false);
end;
$_$;
CREATE FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text DEFAULT 'preserve'::text, p_source_hash text DEFAULT NULL::text, p_import_job_id uuid DEFAULT NULL::uuid, p_repair boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    SET statement_timeout TO '30s'
    AS $_$
declare
  v_company_id uuid := public.current_company_id();
  v_existing public.canonical_import_commits%rowtype;
  v_file_record_id uuid;
  v_file_hash text;
  v_file_status text;
  v_file_security_status text;
  v_file_metadata jsonb;
  v_source_fingerprint text;
  v_job_type text;
  v_id uuid;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_company_id is distinct from v_company_id then raise exception 'TENANT_CONTEXT_MISMATCH'; end if;
  if p_source_hash is null or btrim(p_source_hash) = '' then raise exception 'IMPORT_SOURCE_HASH_REQUIRED'; end if;
  if p_source_hash !~ '^sha256:[0-9a-fA-F]{64}$' then raise exception 'IMPORT_SOURCE_HASH_INVALID'; end if;
  if p_entity_type !~ '^generic:[a-z][a-z0-9_-]{0,63}$' then raise exception 'IMPORT_ENTITY_TYPE_UNSUPPORTED'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'IMPORT_ROWS_MUST_BE_ARRAY'; end if;
  if p_repair and auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED_FOR_CANONICAL_REPAIR'; end if;
  if p_repair and p_import_job_id is null then raise exception 'IMPORT_JOB_ID_REQUIRED_FOR_CANONICAL_REPAIR'; end if;
  select i.file_record_id, fr.file_hash, fr.status, fr.security_status, fr.metadata, i.source_fingerprint, i.job_type
  into v_file_record_id, v_file_hash, v_file_status, v_file_security_status, v_file_metadata, v_source_fingerprint, v_job_type
  from public.import_jobs i
  join public.file_records fr on fr.id = i.file_record_id and fr.company_id = i.company_id
  where i.id = p_import_job_id and i.company_id = v_company_id
  for share of i;
  if not found or v_file_record_id is null then raise exception 'IMPORT_JOB_SOURCE_RECORD_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_file_hash is null or v_file_hash !~ '^sha256:[0-9a-fA-F]{64}$' then raise exception 'AUTHORITATIVE_SOURCE_HASH_INVALID'; end if;
  if v_file_hash is distinct from p_source_hash then raise exception 'AUTHORITATIVE_SOURCE_HASH_MISMATCH'; end if;
  if v_file_status is distinct from 'ready' or v_file_security_status is distinct from 'passed' then raise exception 'AUTHORITATIVE_SOURCE_NOT_VERIFIED'; end if;
  if coalesce(v_file_metadata->>'raw_bytes_sha256','') is distinct from v_file_hash then raise exception 'AUTHORITATIVE_SOURCE_RAW_HASH_PROOF_MISSING'; end if;
  if v_source_fingerprint is null or btrim(v_source_fingerprint) = '' then raise exception 'IMPORT_SOURCE_FINGERPRINT_REQUIRED'; end if;
  if v_source_fingerprint is distinct from v_file_hash then raise exception 'AUTHORITATIVE_SOURCE_HASH_DRIFT'; end if;
  if v_job_type is not null and v_job_type is distinct from p_entity_type then raise exception 'IMPORT_JOB_ENTITY_TYPE_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_company_id::text,'') || ':' || p_entity_type || ':' || p_source_hash, 0));
  select * into v_existing
  from public.canonical_import_commits c
  where c.company_id=v_company_id and c.entity_type=p_entity_type and c.source_hash=p_source_hash
  for update;
  if found then
    if not p_repair then
      if v_existing.committed_count <> jsonb_array_length(p_rows) then
        raise exception 'CANONICAL_EXISTING_COMMIT_COUNT_MISMATCH';
      end if;
      return jsonb_build_object('committed',v_existing.committed_count,'ids',v_existing.committed_ids,'idempotent_replay',true,'import_job_id',p_import_job_id);
    end if;
    insert into public.canonical_import_repair_history(
      company_id,entity_type,source_hash,previous_import_job_id,previous_committed_count,previous_committed_ids,reason,parser_version
    )
    values(
      v_company_id,p_entity_type,p_source_hash,p_import_job_id,v_existing.committed_count,v_existing.committed_ids,
      'SOURCE_PARSER_REPAIR','2026-09-30-arabic-sales-layout-v2'
    );
    delete from public.canonical_dataset_records
    where company_id=v_company_id and source_hash=p_source_hash;
    delete from public.canonical_import_commits
    where company_id=v_company_id and entity_type=p_entity_type and source_hash=p_source_hash;
  end if;
  if p_entity_type !~ '^generic:' then raise exception 'CANONICAL_REPAIR_GENERIC_ONLY'; end if;
  if jsonb_array_length(p_rows)=0 then raise exception 'IMPORT_ROWS_MUST_NOT_BE_EMPTY'; end if;
  insert into public.canonical_import_commits(company_id,entity_type,source_hash,committed_ids,committed_count)
  values(v_company_id,p_entity_type,p_source_hash,'[]'::jsonb,0);
  if jsonb_array_length(p_rows) > 0 then
    with inserted as (
      insert into public.canonical_dataset_records(
        company_id,import_job_id,source_hash,semantic_domain,row_number,record_key,data,provenance
      )
      select
        v_company_id,
        p_import_job_id,
        p_source_hash,
        substr(p_entity_type,9),
        (value->>'row_number')::integer,
        value->>'record_key',
        value->'data',
        value->'provenance'
      from jsonb_array_elements(p_rows) as x(value)
      order by (value->>'row_number')::integer
      returning id,row_number
    )
    select count(*)::integer, coalesce(jsonb_agg(id order by row_number),'[]'::jsonb)
    into v_count,v_ids
    from inserted;
  end if;
  if v_count <> jsonb_array_length(p_rows) then raise exception 'GENERIC_CANONICAL_COMMIT_COUNT_MISMATCH'; end if;
  update public.canonical_import_commits
  set committed_ids=v_ids, committed_count=v_count, committed_at=clock_timestamp()
  where company_id=v_company_id and entity_type=p_entity_type and source_hash=p_source_hash;
  return jsonb_build_object('committed',v_count,'ids',v_ids,'idempotent_replay',false,'import_job_id',p_import_job_id,'repair',p_repair);
end;
$_$;
CREATE FUNCTION public.import_commit_batch_governed(p_company_id uuid, p_entity_type text, p_rows jsonb, p_source_rows jsonb, p_resolutions jsonb, p_null_policy text DEFAULT 'preserve'::text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_company uuid := public.current_company_id();
  v_count integer;
  v_write_count integer;
  v_non_new integer;
  v_index integer;
  v_row jsonb;
  v_key text;
  v_identity_column text;
  v_identity_namespace text;
  v_exists boolean;
  v_seen text[] := ARRAY[]::text[];
  v_key_column text;
  v_sql text;
BEGIN
  IF v_company IS NULL OR v_company <> p_company_id THEN
    RAISE EXCEPTION 'IMPORT_TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_entity_type NOT IN ('products','customers','sales_invoices') THEN
    RAISE EXCEPTION 'IMPORT_ENTITY_TYPE_UNSUPPORTED';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array'
     OR jsonb_typeof(p_source_rows) <> 'array'
     OR jsonb_typeof(p_resolutions) <> 'array' THEN
    RAISE EXCEPTION 'IMPORT_GOVERNED_PAYLOAD_MUST_BE_JSON_ARRAYS';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count <> jsonb_array_length(p_source_rows)
     OR v_count <> jsonb_array_length(p_resolutions) THEN
    RAISE EXCEPTION 'IMPORT_GOVERNED_ROW_COUNT_MISMATCH';
  END IF;
  IF v_count > 500 THEN
    RAISE EXCEPTION 'IMPORT_BATCH_TOO_LARGE';
  END IF;
  SELECT count(*) FILTER (WHERE COALESCE(value->>'outcome','') <> 'new')
    INTO v_non_new
  FROM jsonb_array_elements(p_resolutions);
  IF v_non_new <> 0 THEN
    RAISE EXCEPTION 'IMPORT_RESOLUTION_BLOCKED_NON_NEW';
  END IF;
  SELECT count(*) FILTER (
    WHERE COALESCE(value->>'action','') = 'write_new'
      AND COALESCE((value->>'allowedToWrite')::boolean,false)
  ) INTO v_write_count
  FROM jsonb_array_elements(p_resolutions);
  IF v_write_count <> v_count THEN
    RAISE EXCEPTION 'IMPORT_RESOLUTION_WRITE_NOT_ALLOWED';
  END IF;
  v_key_column := CASE p_entity_type
    WHEN 'products' THEN 'sku'
    WHEN 'customers' THEN 'code'
    ELSE 'invoice_number'
  END;
  FOR v_row, v_index IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY
  LOOP
    v_identity_column := CASE
      WHEN p_entity_type = 'customers'
        AND NULLIF(btrim(v_row->>'code'),'') IS NULL THEN 'name'
      ELSE v_key_column
    END;
    v_identity_namespace := CASE
      WHEN p_entity_type = 'customers' AND v_identity_column = 'name' THEN 'customer_name'
      WHEN p_entity_type = 'customers' THEN 'customer_code'
      ELSE v_identity_column
    END;
    v_key := public.normalize_import_key(v_row->>v_identity_column);
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'IMPORT_IDENTITY_KEY_REQUIRED:%', v_index;
    END IF;
    -- Namespace the in-batch key so customer code "ABC" and uncoded
    -- customer name "ABC" are not treated as the same deterministic identity.
    IF (v_identity_namespace || ':' || v_key) = ANY(v_seen) THEN
      RAISE EXCEPTION 'IMPORT_DUPLICATE_IN_BATCH:%', v_index;
    END IF;
    v_seen := array_append(v_seen, v_identity_namespace || ':' || v_key);
    v_sql := format(
      'SELECT EXISTS (SELECT 1 FROM public.%I WHERE company_id = $1 AND public.normalize_import_key(%I) = $2)',
      p_entity_type,
      v_identity_column
    );
    EXECUTE v_sql INTO v_exists USING v_company, v_key;
    IF v_exists THEN
      RAISE EXCEPTION 'IMPORT_RESOLUTION_SERVER_DUPLICATE:%', v_index;
    END IF;
  END LOOP;
  RETURN public.import_commit_batch_with_lineage(
    p_company_id,
    p_entity_type,
    p_rows,
    p_source_rows,
    p_null_policy
  );
END;
$_$;
CREATE FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text DEFAULT 'import'::text, p_total_rows integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_id uuid;
BEGIN
  IF v_company_id IS NULL OR p_company_id IS NULL OR p_company_id <> v_company_id THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  IF p_total_rows < 0 THEN
    RAISE EXCEPTION 'IMPORT_TOTAL_ROWS_INVALID';
  END IF;
  INSERT INTO public.import_jobs(
    company_id, job_type, processing_mode, status, total_rows, processed_rows,
    valid_rows, invalid_rows, quarantined_rows, duplicate_rows, progress,
    started_at, result_summary
  )
  VALUES (
    v_company_id, COALESCE(NULLIF(trim(p_entity_type), ''), 'import'), 'import', 'processing',
    p_total_rows, 0, 0, 0, 0, 0, 0, now(), '{}'::jsonb
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer DEFAULT 0, p_file_record_id uuid DEFAULT NULL::uuid, p_profile_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id uuid;
  v_company_id uuid := public.current_company_id();
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  INSERT INTO public.import_jobs(
    company_id, file_record_id, profile_id, job_type, status,
    processing_mode, total_rows, processed_rows, progress,
    result_summary, created_at
  )
  VALUES (
    v_company_id, p_file_record_id, p_profile_id,
    coalesce(p_entity_type, 'import'), 'queued', 'import',
    greatest(coalesce(p_total_rows, 0), 0), 0, 0,
    jsonb_build_object('entity_type', p_entity_type), now()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer, p_file_record_id uuid, p_profile_id uuid) IS 'Tenant-scoped import creation; p_company_id must equal current_company_id().';
CREATE FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer, p_file_record_id uuid, p_profile_id uuid, p_idempotency_key text, p_source_fingerprint text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_job_id uuid;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF NULLIF(trim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  SELECT id INTO v_job_id FROM import_jobs WHERE company_id=v_company_id AND idempotency_key=trim(p_idempotency_key) LIMIT 1;
  IF v_job_id IS NOT NULL THEN RETURN v_job_id; END IF;
  INSERT INTO import_jobs(company_id,file_record_id,profile_id,job_type,entity_type,status,processing_mode,total_rows,processed_rows,progress,result_summary,idempotency_key,source_fingerprint,created_at,updated_at)
  VALUES(v_company_id,p_file_record_id,p_profile_id,COALESCE(p_entity_type,'import'),p_entity_type,'queued','import',GREATEST(COALESCE(p_total_rows,0),0),0,0,jsonb_build_object('entity_type',p_entity_type),trim(p_idempotency_key),NULLIF(trim(p_source_fingerprint),''),now(),now())
  ON CONFLICT (company_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_job_id;
  IF v_job_id IS NULL THEN SELECT id INTO v_job_id FROM import_jobs WHERE company_id=v_company_id AND idempotency_key=trim(p_idempotency_key) LIMIT 1; END IF;
  RETURN v_job_id;
END;
$$;
CREATE FUNCTION public.import_finish_job(p_job_id uuid, p_status text, p_result_summary jsonb DEFAULT '{}'::jsonb, p_error_message text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_job_company_id uuid;
  v_current_status text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_status NOT IN ('completed','partial','failed','cancelled') THEN
    RAISE EXCEPTION 'IMPORT_TERMINAL_STATUS_REQUIRED';
  END IF;
  SELECT company_id, status
    INTO v_job_company_id, v_current_status
  FROM public.import_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND OR v_job_company_id IS DISTINCT FROM v_company_id THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  IF v_current_status IN ('completed','partial','failed','cancelled') THEN
    RAISE EXCEPTION 'IMPORT_JOB_ALREADY_TERMINAL';
  END IF;
  UPDATE public.import_jobs
  SET status = p_status,
      progress = CASE WHEN p_status = 'completed' THEN 100 ELSE progress END,
      completed_at = now(),
      duration_ms = CASE
        WHEN started_at IS NULL THEN duration_ms
        ELSE extract(epoch from (now() - started_at)) * 1000
      END,
      result_summary = coalesce(p_result_summary, '{}'::jsonb),
      error_message = p_error_message
  WHERE id = p_job_id
    AND company_id = v_company_id
    AND status IN ('queued','processing');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND_OR_FORBIDDEN';
  END IF;
END;
$$;
COMMENT ON FUNCTION public.import_finish_job(p_job_id uuid, p_status text, p_result_summary jsonb, p_error_message text) IS 'Tenant-scoped import finalization.';
CREATE FUNCTION public.import_update_job_progress(p_job_id uuid, p_processed_rows integer, p_valid_rows integer, p_invalid_rows integer DEFAULT 0, p_duplicate_rows integer DEFAULT 0, p_status text DEFAULT 'processing'::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_company_id uuid := public.current_company_id();
  v_total integer;
  v_existing_processed integer;
  v_existing_valid integer;
  v_existing_invalid integer;
  v_existing_duplicate integer;
  v_current_status text;
  v_processed integer;
  v_valid integer;
  v_invalid integer;
  v_duplicate integer;
  v_status text := coalesce(nullif(trim(p_status), ''), 'processing');
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if v_status not in ('queued','processing') then raise exception 'IMPORT_NON_TERMINAL_STATUS_REQUIRED'; end if;
  select total_rows, processed_rows, valid_rows, invalid_rows, duplicate_rows, status
    into v_total, v_existing_processed, v_existing_valid, v_existing_invalid,
         v_existing_duplicate, v_current_status
    from public.import_jobs
   where id = p_job_id
     and company_id = v_company_id
   for update;
  if not found then raise exception 'IMPORT_JOB_NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_current_status in ('completed','partial','failed','cancelled') then
    raise exception 'IMPORT_JOB_ALREADY_TERMINAL';
  end if;
  if v_current_status not in ('queued','processing') then
    raise exception 'IMPORT_JOB_STATE_INVALID';
  end if;
  v_processed := greatest(coalesce(v_existing_processed, 0), least(greatest(coalesce(p_processed_rows, 0), 0), greatest(coalesce(v_total, 0), 0)));
  v_valid := greatest(coalesce(v_existing_valid, 0), least(greatest(coalesce(p_valid_rows, 0), 0), v_processed));
  v_invalid := greatest(coalesce(v_existing_invalid, 0), least(greatest(coalesce(p_invalid_rows, 0), 0), v_processed));
  v_duplicate := greatest(coalesce(v_existing_duplicate, 0), least(greatest(coalesce(p_duplicate_rows, 0), 0), v_processed));
  update public.import_jobs
     set status = v_status,
         processed_rows = v_processed,
         valid_rows = v_valid,
         invalid_rows = v_invalid,
         duplicate_rows = v_duplicate,
         progress = case when coalesce(v_total, 0) > 0 then least(100, greatest(0, round(v_processed::numeric / v_total::numeric * 100)::integer)) else 0 end,
         started_at = coalesce(started_at, now())
   where id = p_job_id
     and company_id = v_company_id
     and status in ('queued','processing');
  if not found then raise exception 'IMPORT_JOB_STATE_CHANGED'; end if;
end;
$$;
COMMENT ON FUNCTION public.import_update_job_progress(p_job_id uuid, p_processed_rows integer, p_valid_rows integer, p_invalid_rows integer, p_duplicate_rows integer, p_status text) IS 'Tenant-scoped import progress update.';
CREATE FUNCTION public.import_upsert_customer(p_company_id uuid, p_name text, p_code text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_segment text DEFAULT NULL::text, p_credit_limit numeric DEFAULT NULL::numeric, p_payment_terms_days integer DEFAULT NULL::integer, p_null_policy text DEFAULT 'preserve'::text) RETURNS TABLE(target_id uuid, action text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_code text := public.normalize_import_key(p_code);
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF NULLIF(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NAME_REQUIRED'; END IF;
  SELECT id INTO v_id
  FROM public.customers
  WHERE company_id = v_company_id
    AND v_code IS NOT NULL
    AND public.normalize_import_key(code) = v_code
  LIMIT 1
  FOR UPDATE;
  IF v_id IS NULL THEN
    IF NULLIF(trim(p_segment), '') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_SEGMENT_REQUIRED'; END IF;
    IF p_credit_limit IS NULL OR p_credit_limit::text IN ('NaN', 'Infinity', '-Infinity') THEN RAISE EXCEPTION 'CUSTOMER_CREDIT_LIMIT_REQUIRED'; END IF;
    IF p_payment_terms_days IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PAYMENT_TERMS_REQUIRED'; END IF;
    INSERT INTO public.customers(company_id, name, code, phone, email, segment, credit_limit, payment_terms_days)
    VALUES (v_company_id, trim(p_name), NULLIF(trim(p_code), ''), p_phone, p_email, trim(p_segment), p_credit_limit, p_payment_terms_days)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'inserted'::text;
    RETURN;
  END IF;
  UPDATE public.customers
  SET name = CASE WHEN p_null_policy = 'preserve' AND p_name IS NULL THEN name ELSE coalesce(NULLIF(trim(p_name), ''), name) END,
      code = CASE WHEN p_null_policy = 'preserve' AND p_code IS NULL THEN code ELSE coalesce(NULLIF(trim(p_code), ''), code) END,
      phone = CASE WHEN p_null_policy = 'preserve' AND p_phone IS NULL THEN phone ELSE coalesce(p_phone, phone) END,
      email = CASE WHEN p_null_policy = 'preserve' AND p_email IS NULL THEN email ELSE coalesce(p_email, email) END,
      segment = CASE WHEN p_null_policy = 'preserve' AND p_segment IS NULL THEN segment ELSE coalesce(NULLIF(trim(p_segment), ''), segment) END,
      credit_limit = CASE WHEN p_null_policy = 'preserve' AND p_credit_limit IS NULL THEN credit_limit ELSE p_credit_limit END,
      payment_terms_days = CASE WHEN p_null_policy = 'preserve' AND p_payment_terms_days IS NULL THEN payment_terms_days ELSE p_payment_terms_days END
  WHERE id = v_id AND company_id = v_company_id;
  RETURN QUERY SELECT v_id, 'updated'::text;
END;
$$;
COMMENT ON FUNCTION public.import_upsert_customer(p_company_id uuid, p_name text, p_code text, p_phone text, p_email text, p_segment text, p_credit_limit numeric, p_payment_terms_days integer, p_null_policy text) IS 'Canonical authenticated import gateway for customer upsert with tenant enforcement.';
CREATE FUNCTION public.import_upsert_product(p_company_id uuid, p_sku text, p_name text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_cost_price numeric DEFAULT NULL::numeric, p_selling_price numeric DEFAULT NULL::numeric, p_min_stock numeric DEFAULT NULL::numeric, p_reorder_point numeric DEFAULT NULL::numeric, p_is_active boolean DEFAULT NULL::boolean, p_null_policy text DEFAULT 'preserve'::text) RETURNS TABLE(target_id uuid, action text)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_sku text := public.normalize_import_key(p_sku);
  v_action text := 'updated';
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF v_sku IS NULL THEN RAISE EXCEPTION 'SKU_REQUIRED'; END IF;
  SELECT id INTO v_id FROM public.products WHERE company_id=v_company_id AND public.normalize_import_key(sku)=v_sku LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN
    IF NULLIF(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
    IF NULLIF(trim(p_unit),'') IS NULL THEN RAISE EXCEPTION 'UNIT_REQUIRED'; END IF;
    IF p_cost_price IS NULL OR p_cost_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'COST_PRICE_REQUIRED'; END IF;
    IF p_selling_price IS NULL OR p_selling_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'SELLING_PRICE_REQUIRED'; END IF;
    IF p_min_stock IS NULL OR p_min_stock::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'MIN_STOCK_REQUIRED'; END IF;
    IF p_reorder_point IS NULL OR p_reorder_point::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'REORDER_POINT_REQUIRED'; END IF;
    IF p_is_active IS NULL THEN RAISE EXCEPTION 'IS_ACTIVE_REQUIRED'; END IF;
    BEGIN
      INSERT INTO public.products(company_id,sku,name,unit,cost_price,selling_price,min_stock,reorder_point,is_active)
      VALUES(v_company_id,trim(p_sku),trim(p_name),trim(p_unit),p_cost_price,p_selling_price,p_min_stock,p_reorder_point,p_is_active)
      RETURNING id INTO v_id;
      v_action := 'inserted';
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_id FROM public.products WHERE company_id=v_company_id AND public.normalize_import_key(sku)=v_sku LIMIT 1 FOR UPDATE;
      IF v_id IS NULL THEN RAISE; END IF;
      v_action := 'updated';
    END;
  END IF;
  IF v_action='updated' THEN
    UPDATE public.products SET
      name=CASE WHEN p_null_policy='preserve' AND p_name IS NULL THEN name ELSE coalesce(NULLIF(trim(p_name),''),name) END,
      unit=CASE WHEN p_null_policy='preserve' AND p_unit IS NULL THEN unit ELSE coalesce(NULLIF(trim(p_unit),''),unit) END,
      cost_price=CASE WHEN p_null_policy='preserve' AND p_cost_price IS NULL THEN cost_price ELSE p_cost_price END,
      selling_price=CASE WHEN p_null_policy='preserve' AND p_selling_price IS NULL THEN selling_price ELSE p_selling_price END,
      min_stock=CASE WHEN p_null_policy='preserve' AND p_min_stock IS NULL THEN min_stock ELSE p_min_stock END,
      reorder_point=CASE WHEN p_null_policy='preserve' AND p_reorder_point IS NULL THEN reorder_point ELSE p_reorder_point END,
      is_active=CASE WHEN p_null_policy='preserve' AND p_is_active IS NULL THEN is_active ELSE p_is_active END
    WHERE id=v_id AND company_id=v_company_id;
  END IF;
  RETURN QUERY SELECT v_id,v_action;
END;
$$;
COMMENT ON FUNCTION public.import_upsert_product(p_company_id uuid, p_sku text, p_name text, p_unit text, p_cost_price numeric, p_selling_price numeric, p_min_stock numeric, p_reorder_point numeric, p_is_active boolean, p_null_policy text) IS 'Canonical tenant-scoped product import primitive. Inserts are fail-closed and never fabricate business values; updates honor the configured null policy.';
CREATE FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid, p_subtotal numeric DEFAULT NULL::numeric, p_tax_amount numeric DEFAULT NULL::numeric, p_total numeric DEFAULT NULL::numeric, p_paid_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_null_policy text DEFAULT 'preserve'::text) RETURNS TABLE(target_id uuid, action text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_number text := normalize_import_key(p_invoice_number);
  v_current_company uuid := public.current_company_id();
BEGIN
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;
  IF v_current_company IS NULL OR p_company_id <> v_current_company THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF v_number IS NULL THEN RAISE EXCEPTION 'invoice number is required'; END IF;
  IF p_customer_id IS NULL THEN RAISE EXCEPTION 'customer_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'customer does not belong to company';
  END IF;
  SELECT id INTO v_id FROM sales_invoices
  WHERE company_id = p_company_id AND normalize_import_key(invoice_number) = v_number LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO sales_invoices(company_id, customer_id, invoice_number, invoice_date, status, subtotal, tax_amount, total, paid_amount)
    VALUES (p_company_id, p_customer_id, btrim(p_invoice_number), p_invoice_date,
            coalesce(p_status, 'confirmed'), coalesce(p_subtotal, 0), coalesce(p_tax_amount, 0),
            coalesce(p_total, 0), coalesce(p_paid_amount, 0))
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'inserted'::text;
    RETURN;
  END IF;
  UPDATE sales_invoices
  SET customer_id = p_customer_id,
      invoice_date = CASE WHEN p_null_policy = 'preserve' AND p_invoice_date IS NULL THEN invoice_date ELSE coalesce(p_invoice_date, invoice_date) END,
      status = CASE WHEN p_null_policy = 'preserve' AND p_status IS NULL THEN status ELSE coalesce(p_status, status) END,
      subtotal = CASE WHEN p_null_policy = 'preserve' AND p_subtotal IS NULL THEN subtotal ELSE coalesce(p_subtotal, subtotal) END,
      tax_amount = CASE WHEN p_null_policy = 'preserve' AND p_tax_amount IS NULL THEN tax_amount ELSE coalesce(p_tax_amount, tax_amount) END,
      total = CASE WHEN p_null_policy = 'preserve' AND p_total IS NULL THEN total ELSE coalesce(p_total, total) END,
      paid_amount = CASE WHEN p_null_policy = 'preserve' AND p_paid_amount IS NULL THEN paid_amount ELSE coalesce(p_paid_amount, paid_amount) END
  WHERE id = v_id AND company_id = p_company_id;
  RETURN QUERY SELECT v_id, 'updated'::text;
END;
$$;
CREATE FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_subtotal numeric DEFAULT NULL::numeric, p_tax_amount numeric DEFAULT NULL::numeric, p_total numeric DEFAULT NULL::numeric, p_paid_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_null_policy text DEFAULT 'preserve'::text) RETURNS TABLE(target_id uuid, action text)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company_id uuid := public.current_company_id();
  v_id uuid;
  v_customer_id uuid := p_customer_id;
BEGIN
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED'; END IF;
  IF p_company_id IS DISTINCT FROM v_company_id THEN RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH'; END IF;
  IF NULLIF(trim(p_invoice_number), '') IS NULL THEN RAISE EXCEPTION 'INVOICE_NUMBER_REQUIRED'; END IF;
  IF p_invoice_date IS NULL THEN RAISE EXCEPTION 'INVOICE_DATE_REQUIRED'; END IF;
  IF v_customer_id IS NULL AND NULLIF(trim(p_customer_name), '') IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE company_id = v_company_id
      AND public.normalize_import_key(name) = public.normalize_import_key(p_customer_name)
    LIMIT 1;
  END IF;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'CUSTOMER_TENANT_MISMATCH';
  END IF;
  SELECT id INTO v_id
  FROM public.sales_invoices
  WHERE company_id = v_company_id
    AND public.normalize_import_key(invoice_number) = public.normalize_import_key(p_invoice_number)
  LIMIT 1
  FOR UPDATE;
  IF v_id IS NULL THEN
    IF p_subtotal IS NULL OR p_subtotal::text IN ('NaN', 'Infinity', '-Infinity') THEN RAISE EXCEPTION 'SUBTOTAL_REQUIRED'; END IF;
    IF p_tax_amount IS NULL OR p_tax_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN RAISE EXCEPTION 'TAX_AMOUNT_REQUIRED'; END IF;
    IF p_total IS NULL OR p_total::text IN ('NaN', 'Infinity', '-Infinity') THEN RAISE EXCEPTION 'TOTAL_REQUIRED'; END IF;
    IF p_paid_amount IS NULL OR p_paid_amount::text IN ('NaN', 'Infinity', '-Infinity') THEN RAISE EXCEPTION 'PAID_AMOUNT_REQUIRED'; END IF;
    IF NULLIF(trim(p_status), '') IS NULL THEN RAISE EXCEPTION 'STATUS_REQUIRED'; END IF;
    INSERT INTO public.sales_invoices(company_id, customer_id, invoice_number, invoice_date, status, subtotal, tax_amount, total, paid_amount)
    VALUES (v_company_id, v_customer_id, trim(p_invoice_number), p_invoice_date, trim(p_status), p_subtotal, p_tax_amount, p_total, p_paid_amount)
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'inserted'::text;
    RETURN;
  END IF;
  UPDATE public.sales_invoices
  SET customer_id = v_customer_id,
      invoice_date = CASE WHEN p_null_policy = 'preserve' AND p_invoice_date IS NULL THEN invoice_date ELSE p_invoice_date END,
      status = CASE WHEN p_null_policy = 'preserve' AND p_status IS NULL THEN status ELSE coalesce(NULLIF(trim(p_status), ''), status) END,
      subtotal = CASE WHEN p_null_policy = 'preserve' AND p_subtotal IS NULL THEN subtotal ELSE p_subtotal END,
      tax_amount = CASE WHEN p_null_policy = 'preserve' AND p_tax_amount IS NULL THEN tax_amount ELSE p_tax_amount END,
      total = CASE WHEN p_null_policy = 'preserve' AND p_total IS NULL THEN total ELSE p_total END,
      paid_amount = CASE WHEN p_null_policy = 'preserve' AND p_paid_amount IS NULL THEN paid_amount ELSE p_paid_amount END
  WHERE id = v_id AND company_id = v_company_id;
  RETURN QUERY SELECT v_id, 'updated'::text;
END;
$$;
COMMENT ON FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid, p_customer_name text, p_subtotal numeric, p_tax_amount numeric, p_total numeric, p_paid_amount numeric, p_status text, p_null_policy text) IS 'Canonical authenticated import gateway for sales invoice upsert with tenant and customer enforcement.';
CREATE FUNCTION public.inventory_liquidity_velocity(p_company_id uuid, p_as_of date DEFAULT CURRENT_DATE, p_days integer DEFAULT 90) RETURNS TABLE(product_id uuid, sku text, product_name text, stock_qty numeric, stock_value numeric, last_sale_date date, days_since_sale integer, avg_daily_sales numeric, avg_weekly_sales numeric, avg_half_month_sales numeric, avg_monthly_sales numeric, avg_half_year_sales numeric, avg_yearly_sales numeric, estimated_days_to_clear numeric, liquidity_class text)
    LANGUAGE sql STABLE
    AS $$
WITH sales AS (
  SELECT si.product_id,
         sum(si.quantity) FILTER (WHERE inv.invoice_date >= p_as_of - greatest(p_days,1)) AS qty,
         max(inv.invoice_date) AS last_sale
  FROM sale_items si
  JOIN sales_invoices inv ON inv.id = si.invoice_id
  WHERE inv.company_id = p_company_id
    AND inv.invoice_date <= p_as_of
    AND inv.status IN ('confirmed','posted','paid')
  GROUP BY si.product_id
), stock AS (
  SELECT product_id, sum(quantity) AS qty
  FROM inventory_balances
  WHERE company_id = p_company_id
  GROUP BY product_id
), base AS (
  SELECT p.id, p.sku, p.name, coalesce(st.qty,0) stock_qty,
         coalesce(st.qty,0) * coalesce(p.cost_price,0) stock_value,
         s.last_sale,
         coalesce(s.qty,0) / greatest(p_days,1)::numeric daily
  FROM products p
  LEFT JOIN stock st ON st.product_id = p.id
  LEFT JOIN sales s ON s.product_id = p.id
  WHERE p.company_id = p_company_id AND p.is_active
)
SELECT id, sku, name, stock_qty, stock_value, last_sale,
       CASE WHEN last_sale IS NULL THEN NULL ELSE (p_as_of-last_sale)::integer END,
       daily, daily*7, daily*15, daily*30, daily*182.5, daily*365,
       CASE WHEN daily > 0 THEN stock_qty/daily ELSE NULL END,
       CASE
         WHEN stock_qty <= 0 THEN 'out_of_stock'
         WHEN daily <= 0 OR last_sale IS NULL THEN 'frozen'
         WHEN stock_qty/daily > 180 THEN 'frozen'
         ELSE 'moving'
       END
FROM base;
$$;
CREATE FUNCTION public.is_continuous_trust_healthy(p_certificate_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT public.is_trust_certificate_valid(p_certificate_key)
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_isolation_canary_runs
      WHERE company_id = public.current_company_id()
        AND status IN ('failed','blocked')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_liveness_probes
      WHERE company_id = public.current_company_id()
        AND status IN ('failed','blocked')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.artifact_verification_runs
      WHERE company_id = public.current_company_id()
        AND status IN ('failed','blocked')
    );
$$;
CREATE FUNCTION public.is_trust_certificate_valid(p_certificate_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trust_certifications
    WHERE company_id = public.current_company_id()
      AND certificate_key = p_certificate_key
      AND status = 'valid'
      AND blocker_count = 0
      AND expires_at > now()
  );
$$;
CREATE FUNCTION public.link_recommendation_to_decision(p_recommendation_id uuid, p_decision_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company_id uuid;
  v_recommendation_company uuid;
  v_recommendation_decision uuid;
  v_decision_company uuid;
  v_decision_recommendation uuid;
begin
  v_company_id := public.current_company_id();
  if auth.uid() is null or v_company_id is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select company_id, decision_id
    into v_recommendation_company, v_recommendation_decision
  from public.recommendations
  where id = p_recommendation_id
    and company_id = v_company_id
  for update;
  if not found then
    raise exception 'RECOMMENDATION_NOT_FOUND_OR_FORBIDDEN';
  end if;
  select company_id, recommendation_id
    into v_decision_company, v_decision_recommendation
  from public.business_intelligence_decisions
  where id = p_decision_id
    and company_id = v_company_id
  for update;
  if not found then
    raise exception 'DECISION_NOT_FOUND_OR_FORBIDDEN';
  end if;
  if v_recommendation_decision is not null
     and v_recommendation_decision <> p_decision_id then
    raise exception 'RECOMMENDATION_ALREADY_LINKED';
  end if;
  if v_decision_recommendation is not null
     and v_decision_recommendation <> p_recommendation_id then
    raise exception 'DECISION_ALREADY_LINKED';
  end if;
  update public.recommendations
  set decision_id = p_decision_id
  where id = p_recommendation_id
    and company_id = v_company_id;
  update public.business_intelligence_decisions
  set recommendation_id = p_recommendation_id
  where id = p_decision_id
    and company_id = v_company_id;
end;
$$;
CREATE FUNCTION public.mark_alert_read(p_alert_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_company_id uuid;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  update public.alerts
     set is_read = true
   where id = p_alert_id
     and company_id = v_company_id;
  if not found then raise exception 'ALERT_NOT_FOUND_OR_FORBIDDEN'; end if;
end;
$$;
CREATE FUNCTION public.metric_governance_audit_require_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN IF NEW.company_id IS NULL THEN NEW.company_id=public.current_company_id(); END IF; IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'metric governance audit tenant context required'; END IF; RETURN NEW; END; $$;
CREATE FUNCTION public.metric_governance_guard_certified_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.certification_status='CERTIFIED' AND (NEW.metric_id<>OLD.metric_id OR NEW.version<>OLD.version OR NEW.name<>OLD.name OR NEW.definition<>OLD.definition OR NEW.formula<>OLD.formula OR NEW.source<>OLD.source OR NEW.dimensions<>OLD.dimensions OR NEW.filters<>OLD.filters OR NEW.time_semantics<>OLD.time_semantics OR NEW.freshness<>OLD.freshness OR NEW.owner<>OLD.owner OR NEW.dependencies<>OLD.dependencies OR NEW.consumers<>OLD.consumers OR NEW.tests<>OLD.tests OR NEW.evidence<>OLD.evidence) THEN RAISE EXCEPTION 'certified metric version is immutable; create a new version'; END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION public.metric_governance_require_tenant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN IF NEW.company_id IS NULL THEN NEW.company_id=public.current_company_id(); END IF; IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'metric governance tenant context required'; END IF; RETURN NEW; END; $$;
CREATE FUNCTION public.metric_governance_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE FUNCTION public.normalize_import_key(input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT NULLIF(regexp_replace(lower(trim(coalesce(input, ''))), '\s+', '', 'g'), '');
$$;
CREATE FUNCTION public.notify_decision_work_item(p_work_item_id uuid, p_title text, p_description text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM public.decision_work_items w
    WHERE w.id = p_work_item_id
      AND w.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  INSERT INTO public.alerts(
    company_id,
    severity,
    category,
    title,
    description,
    entity_type,
    entity_id
  )
  VALUES(
    v_company,
    'info',
    'decision_action',
    p_title,
    p_description,
    'decision_work_item',
    p_work_item_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.phase_l_production_autonomy_health() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'domain', p_domain_key,
    'can_run', public.can_run_phase_l_autonomy(p_domain_key),
    'tenant', public.current_company_id(),
    'trust_healthy', public.is_continuous_trust_healthy('production')
  )
  FROM (SELECT 'production'::text AS p_domain_key) s
  WHERE auth.uid() IS NOT NULL
    AND public.current_company_id() IS NOT NULL;
$$;
CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    order_number bigint NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'SAR'::text NOT NULL,
    idempotency_key text NOT NULL,
    quantity_confirmed_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT orders_total_nonnegative CHECK ((total >= (0)::numeric))
);
CREATE FUNCTION public.prepare_e2e_order(p_order_id uuid) RETURNS public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_role text;
  v_order public.orders%rowtype;
  v_invoice_id uuid;
begin
  if v_company is null or v_user is null then
    raise exception using errcode='42501', message='TENANT_CONTEXT_REQUIRED';
  end if;
  select cm.role into v_role
  from public.company_memberships cm
  where cm.company_id=v_company and cm.user_id=v_user and cm.is_active=true
  limit 1;
  if v_role not in ('owner','admin') then
    raise exception using errcode='42501', message='E2E_RESET_ADMIN_REQUIRED';
  end if;
  select * into v_order
  from public.orders
  where id=p_order_id and company_id=v_company
  for update;
  if not found then
    raise exception using errcode='P0002', message='E2E_ORDER_NOT_FOUND';
  end if;
  if coalesce(v_order.idempotency_key,'') not like 'E2E-ORDER-%' then
    raise exception using errcode='42501', message='E2E_ORDER_TAG_REQUIRED';
  end if;
  select si.id into v_invoice_id
  from public.sales_invoices si
  where si.company_id=v_company and si.order_id=v_order.id
  order by si.created_at desc
  limit 1;
  if v_invoice_id is not null then
    delete from public.payments
    where company_id=v_company and invoice_id=v_invoice_id;
    delete from public.sales_invoices
    where company_id=v_company and id=v_invoice_id;
  end if;
  if v_order.status <> 'pending' then
    insert into public.order_status_history(company_id, order_id, from_status, to_status, actor_id)
    values(v_company, v_order.id, v_order.status, 'pending', v_user);
    update public.orders
    set status='pending', updated_at=now()
    where company_id=v_company and id=v_order.id and status <> 'pending'
    returning * into v_order;
    insert into public.order_outbox_events(company_id,order_id,event_type,payload)
    values(v_company,v_order.id,'order.e2e_reset',
      jsonb_build_object('order_id',v_order.id,'order_number',v_order.order_number));
    insert into public.audit_logs(
      company_id, action, entity_type, entity_id, old_value, new_value, source
    )
    values(
      v_company,'order_e2e_reset','order',v_order.id,
      jsonb_build_object('status','non-pending'),
      jsonb_build_object('status','pending'),
      'e2e-provisioning'
    );
  end if;
  return v_order;
end;
$$;
CREATE TABLE public.company_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);
CREATE FUNCTION public.provision_e2e_test_membership(p_company_id uuid, p_user_id uuid, p_role text, p_is_default boolean DEFAULT false) RETURNS public.company_memberships
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_membership public.company_memberships;
  v_company_name text;
  v_metadata jsonb;
begin
  select c.name into v_company_name
  from public.companies c
  where c.id = p_company_id;
  if v_company_name is null then
    raise exception 'E2E_PROVISION_TENANT_NOT_FOUND';
  end if;
  if v_company_name <> 'RUNTIME-EVIDENCE-A-401117'
     and v_company_name not like 'Aghbari Report Corpus CI %' then
    raise exception 'E2E_PROVISION_TENANT_NOT_ALLOWED';
  end if;
  if p_role not in ('admin','manager','sales','warehouse') then
    raise exception 'E2E_PROVISION_ROLE_NOT_ALLOWED';
  end if;
  select u.raw_user_meta_data into v_metadata
  from auth.users u
  where u.id = p_user_id;
  if v_metadata is null then
    raise exception 'E2E_PROVISION_ACTOR_NOT_FOUND';
  end if;
  if coalesce(v_metadata ->> 'e2e_actor', '') <> 'true'
     or coalesce(v_metadata ->> 'e2e_purpose', '') <> 'full-product-browser-e2e' then
    raise exception 'E2E_PROVISION_ACTOR_NOT_TAGGED';
  end if;
  if p_is_default then
    update public.company_memberships
    set is_default = false
    where user_id = p_user_id
      and is_active = true
      and company_id <> p_company_id;
  end if;
  insert into public.company_memberships(
    id, company_id, user_id, role, is_active, created_at, is_default
  )
  values(
    gen_random_uuid(), p_company_id, p_user_id, p_role, true, now(), p_is_default
  )
  on conflict(company_id, user_id)
  do update set
    role = excluded.role,
    is_active = true,
    is_default = excluded.is_default
  returning * into v_membership;
  insert into public.audit_logs(
    id, company_id, action, entity_type, entity_id,
    old_value, new_value, source, user_label, correlation_id, created_at
  )
  values(
    gen_random_uuid(),
    p_company_id,
    'e2e_actor_membership_provisioned',
    'company_membership',
    v_membership.id,
    null,
    jsonb_build_object(
      'companyId', p_company_id,
      'userId', p_user_id,
      'role', v_membership.role,
      'isActive', v_membership.is_active,
      'isDefault', v_membership.is_default
    ),
    'e2e-actor-provisioner',
    'service_role',
    'e2e-provision:' || v_membership.id::text,
    now()
  );
  return v_membership;
end;
$$;
CREATE FUNCTION public.queue_report_run(p_company_id uuid, p_report_id uuid, p_requested_by uuid, p_idempotency_key text, p_request_fingerprint text, p_source_snapshot_id uuid, p_parameters jsonb, p_formats jsonb, p_input_fingerprint text, p_max_attempts integer DEFAULT 3) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid; v_company uuid := public.current_company_id();
BEGIN
  IF v_company IS NULL OR p_company_id IS NULL OR p_company_id <> v_company THEN RAISE EXCEPTION 'tenant context mismatch'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN RAISE EXCEPTION 'idempotency key is required'; END IF;
  INSERT INTO report_runs(company_id,report_id,requested_by,idempotency_key,request_fingerprint,source_snapshot_id,parameters,formats,input_fingerprint,max_attempts)
  VALUES(v_company,p_report_id,p_requested_by,p_idempotency_key,p_request_fingerprint,p_source_snapshot_id,coalesce(p_parameters,'{}'),coalesce(p_formats,'[]'),p_input_fingerprint,greatest(1,p_max_attempts))
  ON CONFLICT(company_id,idempotency_key) DO UPDATE SET updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
CREATE FUNCTION public.record_control_plane_health(p_overall_score numeric, p_evidence_score numeric, p_data_quality_score numeric, p_forecast_score numeric, p_decision_score numeric, p_trust_score numeric, p_critical_blocker_count integer DEFAULT 0, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO control_plane_health_snapshots(company_id,overall_score,evidence_score,data_quality_score,forecast_score,decision_score,trust_score,critical_blocker_count,evidence)
  VALUES(public.current_company_id(),LEAST(1,GREATEST(0,p_overall_score)),LEAST(1,GREATEST(0,p_evidence_score)),LEAST(1,GREATEST(0,p_data_quality_score)),LEAST(1,GREATEST(0,p_forecast_score)),LEAST(1,GREATEST(0,p_decision_score)),LEAST(1,GREATEST(0,p_trust_score)),GREATEST(0,p_critical_blocker_count),COALESCE(p_evidence,'{}'::jsonb))
  RETURNING id INTO result_id;
  RETURN result_id;
END; $$;
CREATE FUNCTION public.record_decision_outcome(p_decision_fingerprint text, p_evidence_snapshot_id text, p_action_id text, p_observed_at timestamp with time zone, p_label text, p_actual_value numeric DEFAULT NULL::numeric, p_expected_value numeric DEFAULT NULL::numeric, p_impact_value numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_id uuid;
  v_decision uuid;
  v_work_item uuid;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  IF p_decision_fingerprint IS NULL OR btrim(p_decision_fingerprint) = ''
     OR p_evidence_snapshot_id IS NULL OR btrim(p_evidence_snapshot_id) = ''
     OR p_observed_at IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_IDENTITY_INCOMPLETE';
  END IF;
  SELECT d.id INTO v_decision
  FROM public.business_intelligence_decisions d
  WHERE d.company_id = v_company
    AND d.decision_key = p_decision_fingerprint
    AND d.status = 'EXECUTED';
  IF v_decision IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_DECISION_NOT_EXECUTED_OR_FORBIDDEN';
  END IF;
  IF p_action_id IS NULL OR btrim(p_action_id) = ''
     OR p_action_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'OUTCOME_WORK_ITEM_REQUIRED';
  END IF;
  SELECT w.id INTO v_work_item
  FROM public.decision_work_items w
  WHERE w.id = p_action_id::uuid
    AND w.company_id = v_company
    AND w.decision_id = v_decision
    AND w.status = 'COMPLETED';
  IF v_work_item IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_WORK_ITEM_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.kpi_evidence_snapshots s WHERE s.id::text = p_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.business_state_snapshots s WHERE s.id::text = p_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.import_snapshots s WHERE s.id::text = p_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.operational_health_snapshots s WHERE s.id::text = p_evidence_snapshot_id AND s.company_id = v_company)
    OR EXISTS (SELECT 1 FROM public.decision_action_receipts r WHERE r.id::text = p_evidence_snapshot_id AND r.company_id = v_company AND r.status IN ('SUCCEEDED','RUNNING'))
  ) THEN
    RAISE EXCEPTION 'OUTCOME_EVIDENCE_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  IF p_label NOT IN ('correct','incorrect','partial','unknown') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME_LABEL';
  END IF;
  INSERT INTO public.decision_outcomes(
    company_id, decision_fingerprint, evidence_snapshot_id, action_id,
    observed_at, observed_by, label, actual_value, expected_value,
    impact_value, notes
  )
  VALUES(
    v_company, p_decision_fingerprint, p_evidence_snapshot_id, p_action_id,
    p_observed_at, v_user, p_label, p_actual_value, p_expected_value,
    p_impact_value, p_notes
  )
  ON CONFLICT(company_id,decision_fingerprint,observed_at) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'OUTCOME_ALREADY_RECORDED';
  END IF;
  RETURN v_id;
END;
$_$;
COMMENT ON FUNCTION public.record_decision_outcome(p_decision_fingerprint text, p_evidence_snapshot_id text, p_action_id text, p_observed_at timestamp with time zone, p_label text, p_actual_value numeric, p_expected_value numeric, p_impact_value numeric, p_notes text) IS 'Canonical outcome boundary: outcome truth requires an EXECUTED tenant-scoped decision, a COMPLETED tenant-scoped work item attached to that decision, valid tenant-scoped evidence, and generated actor provenance.';
CREATE FUNCTION public.record_entitlement_usage(p_capability text, p_quantity numeric, p_period text, p_idempotency_key text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF public.current_company_id() IS NULL THEN RAISE EXCEPTION 'tenant context is required'; END IF;
  IF p_capability IS NULL OR p_capability='' OR p_period IS NULL OR p_period='' OR p_idempotency_key IS NULL OR p_idempotency_key='' THEN RAISE EXCEPTION 'usage identity is incomplete'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'usage quantity must be positive'; END IF;
  INSERT INTO entitlement_usage_events(company_id,capability,quantity,billing_period,idempotency_key)
  VALUES(public.current_company_id(),p_capability,p_quantity,p_period,p_idempotency_key)
  ON CONFLICT(company_id,billing_period,idempotency_key) DO UPDATE SET occurred_at=entitlement_usage_events.occurred_at
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
CREATE FUNCTION public.record_executive_evidence_edge(p_source_type text, p_source_key text, p_target_type text, p_target_key text, p_relation text, p_weight numeric DEFAULT 1, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE result_id uuid;
BEGIN
  IF p_relation NOT IN ('supports','derived_from','contradicts','causes','measures','recommends','blocks') THEN RAISE EXCEPTION 'invalid evidence relation'; END IF;
  INSERT INTO executive_evidence_graph(company_id,source_type,source_key,target_type,target_key,relation,weight,evidence)
  VALUES(public.current_company_id(),p_source_type,p_source_key,p_target_type,p_target_key,p_relation,LEAST(1,GREATEST(0,p_weight)),COALESCE(p_evidence,'{}'::jsonb))
  ON CONFLICT(company_id,source_type,source_key,target_type,target_key,relation)
  DO UPDATE SET weight=EXCLUDED.weight,evidence=EXCLUDED.evidence,created_at=now()
  RETURNING id INTO result_id;
  RETURN result_id;
END; $$;
CREATE FUNCTION public.record_recommendation_outcome(p_recommendation_key text, p_observed_at timestamp with time zone, p_expected_impact numeric DEFAULT NULL::numeric, p_actual_impact numeric DEFAULT NULL::numeric, p_outcome_quality numeric DEFAULT NULL::numeric, p_status text DEFAULT 'insufficient'::text, p_decision_id uuid DEFAULT NULL::uuid, p_evidence jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company uuid:=public.current_company_id();
  v_user uuid:=auth.uid();
  v_id uuid;
  v_recommendation_id uuid;
  v_recommendation_decision uuid;
  v_decision_id uuid;
  v_evidence_snapshot_id text:=nullif(btrim(coalesce(p_evidence->>'evidence_snapshot_id','')),'');
begin
  if v_company is null or v_user is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  if p_recommendation_key is null
     or btrim(p_recommendation_key)=''
     or p_observed_at is null then
    raise exception 'OUTCOME_IDENTITY_INCOMPLETE';
  end if;
  select r.id, r.decision_id
    into v_recommendation_id, v_recommendation_decision
  from public.recommendations r
  where r.id::text = p_recommendation_key
    and r.company_id = v_company;
  if v_recommendation_id is null then
    select d.id
      into v_decision_id
    from public.business_intelligence_decisions d
    where d.decision_key = p_recommendation_key
      and d.company_id = v_company;
    if v_decision_id is null then
      raise exception 'OUTCOME_PROVENANCE_NOT_FOUND';
    end if;
  else
    if v_recommendation_decision is not null then
      v_decision_id := v_recommendation_decision;
    end if;
  end if;
  if p_decision_id is not null then
    if not exists(
      select 1
      from public.business_intelligence_decisions d
      where d.id = p_decision_id
        and d.company_id = v_company
    ) then
      raise exception 'DECISION_NOT_FOUND_OR_FORBIDDEN';
    end if;
    if v_decision_id is not null and v_decision_id <> p_decision_id then
      raise exception 'RECOMMENDATION_DECISION_MISMATCH';
    end if;
    v_decision_id := p_decision_id;
  end if;
  if v_decision_id is null then
    raise exception 'DECISION_PROVENANCE_REQUIRED';
  end if;
  if not exists(
    select 1
    from public.business_intelligence_decisions d
    where d.id = v_decision_id
      and d.company_id = v_company
      and d.status = 'APPROVED'
  ) then
    raise exception 'OUTCOME_DECISION_NOT_APPROVED_OR_FORBIDDEN';
  end if;
  if not exists(
    select 1
    from public.decision_work_items w
    where w.decision_id = v_decision_id
      and w.company_id = v_company
      and w.status = 'COMPLETED'
  ) then
    raise exception 'OUTCOME_WORK_NOT_COMPLETED';
  end if;
  if v_evidence_snapshot_id is null then
    raise exception 'OUTCOME_EVIDENCE_REQUIRED';
  end if;
  if not (
    exists(
      select 1 from public.kpi_evidence_snapshots s
      where s.id::text = v_evidence_snapshot_id
        and s.company_id = v_company
    )
    or exists(
      select 1 from public.business_state_snapshots s
      where s.id::text = v_evidence_snapshot_id
        and s.company_id = v_company
    )
    or exists(
      select 1 from public.import_snapshots s
      where s.id::text = v_evidence_snapshot_id
        and s.company_id = v_company
    )
    or exists(
      select 1 from public.operational_health_snapshots s
      where s.id::text = v_evidence_snapshot_id
        and s.company_id = v_company
    )
    or exists(
      select 1 from public.decision_action_receipts r
      where r.id::text = v_evidence_snapshot_id
        and r.company_id = v_company
        and r.status = 'SUCCEEDED'
    )
  ) then
    raise exception 'OUTCOME_EVIDENCE_NOT_FOUND_OR_FORBIDDEN';
  end if;
  if p_status not in ('positive','negative','neutral','insufficient') then
    raise exception 'INVALID_OUTCOME_STATUS';
  end if;
  if p_status in ('positive','negative','neutral')
     and (p_expected_impact is null or p_actual_impact is null) then
    raise exception 'OUTCOME_VALUES_REQUIRED_FOR_KNOWN_STATUS';
  end if;
  if p_outcome_quality is not null
     and (p_outcome_quality < 0 or p_outcome_quality > 1) then
    raise exception 'OUTCOME_QUALITY_OUT_OF_RANGE';
  end if;
  insert into public.recommendation_outcomes(
    company_id,
    recommendation_key,
    decision_id,
    observed_at,
    expected_impact,
    actual_impact,
    outcome_quality,
    status,
    evidence
  )
  values(
    v_company,
    p_recommendation_key,
    v_decision_id,
    p_observed_at,
    p_expected_impact,
    p_actual_impact,
    p_outcome_quality,
    p_status,
    coalesce(p_evidence,'{}'::jsonb)
  )
  on conflict(company_id,recommendation_key) do update set
    decision_id = excluded.decision_id,
    observed_at = excluded.observed_at,
    expected_impact = excluded.expected_impact,
    actual_impact = excluded.actual_impact,
    outcome_quality = excluded.outcome_quality,
    status = excluded.status,
    evidence = excluded.evidence
  returning id into v_id;
  return v_id;
end;
$$;
CREATE FUNCTION public.record_watched_report_file(p_folder_id uuid, p_relative_path text, p_content_hash text, p_size_bytes bigint, p_modified_at timestamp with time zone, p_state text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare v_company_id uuid := public.current_company_id(); v_id uuid;
begin
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_folder_id is null then raise exception 'FOLDER_ID_REQUIRED'; end if;
  if p_relative_path is null or length(btrim(p_relative_path))=0 then raise exception 'RELATIVE_PATH_REQUIRED'; end if;
  if p_content_hash is null or length(btrim(p_content_hash))=0 then raise exception 'CONTENT_HASH_REQUIRED'; end if;
  if p_size_bytes is null or p_size_bytes<0 then raise exception 'SIZE_BYTES_INVALID'; end if;
  if p_state is null or p_state not in ('new','changed','unchanged','processing','processed','failed','dead_letter','deleted') then raise exception 'STATE_INVALID'; end if;
  if not exists (select 1 from public.watched_report_folders f where f.id=p_folder_id and f.company_id=v_company_id) then raise exception 'FOLDER_TENANT_MISMATCH'; end if;
  insert into public.watched_report_files(company_id,folder_id,relative_path,content_hash,size_bytes,modified_at,state)
    values(v_company_id,p_folder_id,p_relative_path,p_content_hash,p_size_bytes,p_modified_at,p_state)
    on conflict(company_id,folder_id,relative_path) do update set content_hash=excluded.content_hash,size_bytes=excluded.size_bytes,modified_at=excluded.modified_at,state=excluded.state,source_version=public.watched_report_files.source_version+1,updated_at=now();
  select id into v_id from public.watched_report_files where company_id=v_company_id and folder_id=p_folder_id and relative_path=p_relative_path;
  return v_id;
end;
$$;
CREATE FUNCTION public.recover_completed_report_execution_result(p_company_id uuid, p_import_job_id uuid, p_report_execution_job_id uuid, p_entity_type text, p_source_hash text, p_row_count integer, p_rendered_output jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    SET statement_timeout TO '30s'
    AS $_$
declare
  v_job public.report_execution_jobs%rowtype;
  v_import public.import_jobs%rowtype;
  v_commit public.canonical_import_commits%rowtype;
  v_current_source public.file_records%rowtype;
  v_source_record public.file_records%rowtype;
  v_source_file_name text;
  v_source_storage_bucket text;
  v_source_storage_path text;
  v_canonical_count integer;
  v_result_summary jsonb;
  v_evidence jsonb;
begin
  if p_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_import_job_id is null or p_report_execution_job_id is null then raise exception 'RECOVERY_JOB_ID_REQUIRED'; end if;
  if p_source_hash !~ '^sha256:[0-9a-fA-F]{64}$' then raise exception 'RECOVERY_SOURCE_HASH_INVALID'; end if;
  if p_row_count < 1 then raise exception 'RECOVERY_ROW_COUNT_INVALID'; end if;
  if jsonb_typeof(p_rendered_output) is distinct from 'object' then raise exception 'RECOVERY_RENDERED_OUTPUT_INVALID'; end if;
  if coalesce(p_rendered_output->>'evidenceStatus','') = 'VERIFIED' then
    raise exception 'RECOVERY_VERIFIED_EVIDENCE_REQUIRES_SEPARATE_ACCEPTANCE';
  end if;
  select * into v_job
  from public.report_execution_jobs
  where id = p_report_execution_job_id and company_id = p_company_id
  for update;
  if not found then raise exception 'RECOVERY_REPORT_EXECUTION_JOB_NOT_FOUND'; end if;
  if v_job.status <> 'completed' then raise exception 'RECOVERY_REPORT_EXECUTION_JOB_NOT_COMPLETED'; end if;
  if coalesce(v_job.source_hash,'') <> p_source_hash then raise exception 'RECOVERY_SOURCE_HASH_MISMATCH'; end if;
  if coalesce(v_job.checkpoint->>'stage','') <> 'rendered' then raise exception 'RECOVERY_REPORT_EXECUTION_STAGE_NOT_RENDERED'; end if;
  select * into v_import
  from public.import_jobs
  where id = p_import_job_id and company_id = p_company_id
  for update;
  if not found then raise exception 'RECOVERY_IMPORT_JOB_NOT_FOUND'; end if;
  if v_import.file_record_id is null then raise exception 'RECOVERY_IMPORT_SOURCE_RECORD_MISSING'; end if;
  select * into v_current_source
  from public.file_records
  where id = v_import.file_record_id and company_id = p_company_id
  for update;
  if not found then raise exception 'RECOVERY_IMPORT_SOURCE_RECORD_NOT_FOUND'; end if;
  v_source_file_name := nullif(v_import.result_summary->>'file_name', '');
  if v_current_source.file_hash = p_source_hash
     and v_current_source.security_status = 'passed'
     and v_current_source.status in ('ready','processed','verified') then
    v_source_record := v_current_source;
  else
    select * into v_source_record
    from public.file_records
    where company_id = p_company_id
      and file_hash = p_source_hash
      and security_status = 'passed'
      and status in ('ready','processed','verified')
      and (v_source_file_name is null or file_name = v_source_file_name)
    order by created_at desc, id desc
    limit 1
    for update;
    if not found then
      raise exception 'RECOVERY_SOURCE_RECORD_HASH_NOT_VERIFIED';
    end if;
  end if;
  v_source_storage_bucket := nullif(v_source_record.metadata->>'storage_bucket', '');
  v_source_storage_path := nullif(v_source_record.metadata->>'storage_path', '');
  if v_source_storage_bucket is null or v_source_storage_path is null then
    raise exception 'RECOVERY_SOURCE_RECORD_STORAGE_MISSING';
  end if;
  select * into v_commit
  from public.canonical_import_commits c
  where c.company_id = p_company_id
    and c.entity_type = p_entity_type
    and c.source_hash = p_source_hash
  order by c.committed_at desc
  limit 1
  for update;
  if not found then raise exception 'RECOVERY_CANONICAL_COMMIT_NOT_FOUND'; end if;
  if v_commit.committed_count <> p_row_count then raise exception 'RECOVERY_CANONICAL_COMMIT_COUNT_MISMATCH'; end if;
  select count(*)::integer into v_canonical_count
  from public.canonical_dataset_records r
  where r.company_id = p_company_id
    and r.source_hash = p_source_hash
    and r.semantic_domain = case when p_entity_type like 'generic:%' then substr(p_entity_type, 9) else p_entity_type end;
  if v_canonical_count <> p_row_count then raise exception 'RECOVERY_CANONICAL_DATASET_COUNT_MISMATCH'; end if;
  v_evidence := coalesce(v_job.evidence, '{}'::jsonb)
    || jsonb_build_object(
      'renderedOutput', p_rendered_output,
      'sourceHash', p_source_hash,
      'sourceRowCount', p_row_count,
      'authoritativeCurrentRowCount', p_row_count,
      'recoveredFromCompletedDurableJob', true,
      'recoveryContract', 'recover_completed_report_execution_result:v3'
    );
  update public.report_execution_jobs
  set evidence = v_evidence
  where id = p_report_execution_job_id and company_id = p_company_id;
  update public.report_execution_tasks
  set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
    'renderedOutput', p_rendered_output,
    'recoveredFromCompletedDurableJob', true,
    'recoveryContract', 'recover_completed_report_execution_result:v3'
  )
  where report_execution_job_id = p_report_execution_job_id
    and company_id = p_company_id
    and stage = 'rendered'
    and status = 'completed';
  v_result_summary := coalesce(v_import.result_summary, '{}'::jsonb)
    || jsonb_build_object(
      'execution_job_id', p_report_execution_job_id,
      'rendered_output', p_rendered_output,
      'committed', p_row_count,
      'rendered_rows', p_row_count,
      'report_execution_status', 'completed',
      'recovered_from_completed_durable_job', true,
      'source_file_record_id', v_source_record.id,
      'source_storage_bucket', v_source_storage_bucket,
      'source_storage_path', v_source_storage_path,
      'source_hash', p_source_hash,
      'source_record_pending_hash', false,
      'source_record_security_status', v_source_record.security_status
    );
  perform set_config('app.import_finish_job_id', p_import_job_id::text, true);
  perform set_config('app.import_finish_company_id', p_company_id::text, true);
  if v_import.status in ('queued','processing') then
    update public.import_jobs
    set status = 'completed',
        progress = 100,
        processed_rows = p_row_count,
        total_rows = greatest(coalesce(total_rows, p_row_count), p_row_count),
        source_fingerprint = coalesce(source_fingerprint, p_source_hash),
        file_record_id = v_source_record.id,
        completed_at = now(),
        duration_ms = case when started_at is null then duration_ms else extract(epoch from (now() - started_at)) * 1000 end,
        result_summary = v_result_summary,
        error_message = null
    where id = p_import_job_id and company_id = p_company_id;
  elsif v_import.status = 'completed' then
    update public.import_jobs
    set source_fingerprint = coalesce(source_fingerprint, p_source_hash),
        file_record_id = v_source_record.id,
        result_summary = v_result_summary
    where id = p_import_job_id and company_id = p_company_id;
  else
    raise exception 'RECOVERY_IMPORT_JOB_TERMINAL:%', v_import.status;
  end if;
  return jsonb_build_object(
    'recovered', true,
    'importJobId', p_import_job_id,
    'reportExecutionJobId', p_report_execution_job_id,
    'sourceHash', p_source_hash,
    'entityType', p_entity_type,
    'rowCount', p_row_count,
    'sourceFileRecordId', v_source_record.id,
    'sourceStorageBucket', v_source_storage_bucket,
    'sourceStoragePath', v_source_storage_path,
    'importStatus', 'completed'
  );
end;
$_$;
CREATE FUNCTION public.recover_expired_report_execution_jobs(p_company_id uuid, p_limit integer DEFAULT 100) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  affected integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Worker company context is required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Recovery limit must be between 1 and 1000';
  END IF;
  WITH expired AS (
    SELECT id
    FROM public.report_execution_jobs
    WHERE company_id = p_company_id
      AND status IN ('leased', 'processing')
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= clock_timestamp()
    ORDER BY lease_expires_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.report_execution_jobs AS job
  SET
    status = CASE
      WHEN job.attempt >= job.max_attempts THEN 'dead_letter'
      ELSE 'queued'
    END,
    lease_owner = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error = (
      CASE
        WHEN jsonb_typeof(job.last_error) = 'object' THEN job.last_error
        ELSE '{}'::jsonb
      END
    ) || jsonb_build_object(
      'code',
      CASE
        WHEN job.attempt >= job.max_attempts
          THEN 'worker_attempts_exhausted_after_lease_expiry'
        ELSE 'worker_lease_expired_retry'
      END,
      'previous_status', job.status,
      'attempt', job.attempt,
      'max_attempts', job.max_attempts,
      'recovered_at', clock_timestamp()
    ),
    completed_at = NULL,
    updated_at = clock_timestamp()
  FROM expired
  WHERE job.id = expired.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
CREATE FUNCTION public.recover_missing_report_rendered_outputs(p_company_id uuid) RETURNS TABLE(repaired_job_id uuid, repaired_source_path text, repaired_source_hash text, repaired_output_count integer)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  r record;
  v_specialty text;
  v_outputs jsonb;
  v_evidence jsonb;
  v_metrics jsonb;
  v_import_id uuid;
begin
  if p_company_id is null then
    raise exception 'REPORT_OUTPUT_RECOVERY_TENANT_REQUIRED';
  end if;
  for r in
    select
      j.id,
      j.company_id,
      j.source_path,
      j.source_hash,
      j.job_key,
      j.status,
      j.checkpoint,
      j.evidence,
      j.completed_at,
      s.id as analysis_snapshot_id,
      s.import_job_id,
      s.quality_score,
      s.row_count,
      s.datasets
    from public.report_execution_jobs j
    join lateral (
      select s.*
      from public.source_analysis_snapshots s
      where s.company_id = j.company_id
        and s.source_hash = j.source_hash
        and s.analysis_status = 'analyzed'
      order by s.created_at desc
      limit 1
    ) s on true
    where j.company_id = p_company_id
      and j.status = 'completed'
      and coalesce(j.checkpoint->>'stage','') = 'rendered'
      and coalesce(j.evidence, '{}'::jsonb) -> 'renderedOutput' is null
      and j.job_key like 'canonical-import:generic:%'
      and j.source_path ~* '\.(xlsx|xls|csv|pdf|docx|json|txt)$'
      and j.source_path !~ '^(customer|product|invoice)-[0-9]+'
      and exists (
        select 1
        from public.canonical_import_commits c
        where c.company_id = j.company_id
          and c.source_hash = j.source_hash
          and c.committed_count = s.row_count
      )
    order by j.completed_at asc nulls first, j.id asc
  loop
    v_import_id := r.import_job_id;
    v_specialty := case
      when split_part(r.job_key, ':', 3) in ('sales','purchases','inventory','payments','receivables','profitability')
        then split_part(r.job_key, ':', 3)
      when split_part(r.job_key, ':', 3) = 'products' then 'inventory'
      when split_part(r.job_key, ':', 3) = 'customers' then 'receivables'
      when coalesce(r.datasets::text, '') ~* '(supplier|vendor|مورد)' and coalesce(r.datasets::text, '') ~* '(purchase|purchases|شراء|مشتريات)'
        then 'purchases'
      when coalesce(r.datasets::text, '') ~* '(receivable|outstanding|customer_balance|due_date|aging|ذمم|الاجل|آجل)'
        then 'receivables'
      when coalesce(r.datasets::text, '') ~* '(sales|net_sales|sales_amount|invoice_number|مبيعات|فواتير)'
        and coalesce(r.datasets::text, '') ~* '(quantity|amount|total|net)'
        then 'sales'
      when coalesce(r.datasets::text, '') ~* '(payment|payments|cash|cashier|transaction|تحصيل|الصراف|الصندوق|مدفوع)'
        then 'payments'
      when coalesce(r.datasets::text, '') ~* '(inventory|warehouse|stock|selling_price|cost_price|quantity|مخزون|المخزن|الرصيد)'
        then 'inventory'
      else null
    end;
    v_outputs := jsonb_build_array(
      jsonb_build_object(
        'key','executive',
        'path','/reports/executive',
        'label','التقرير التنفيذي',
        'stage','DECISION OUTPUT',
        'importId',v_import_id,
        'rendered',true,
        'sourceHash',r.source_hash,
        'sourceBound',true,
        'eligibility','EVIDENCE_REQUIRED'
      ),
      jsonb_build_object(
        'key','evidence',
        'path','/trust',
        'label','الثقة والأدلة',
        'stage','EVIDENCE OUTPUT',
        'importId',v_import_id,
        'rendered',true,
        'sourceHash',r.source_hash,
        'sourceBound',true,
        'eligibility','EVIDENCE_REQUIRED'
      ),
      jsonb_build_object(
        'key','decision',
        'path','/decision-experience',
        'label','مساحة القرار',
        'stage','DECISION SURFACE',
        'importId',v_import_id,
        'rendered',true,
        'sourceHash',r.source_hash,
        'sourceBound',true,
        'eligibility','EVIDENCE_REQUIRED'
      ),
      jsonb_build_object(
        'key','work-center',
        'path','/work-center',
        'label','مركز العمل',
        'stage','ACTION SURFACE',
        'importId',v_import_id,
        'rendered',true,
        'sourceHash',r.source_hash,
        'sourceBound',true,
        'eligibility','EVIDENCE_REQUIRED'
      )
    );
    if v_specialty is not null then
      v_outputs := v_outputs || jsonb_build_array(
        jsonb_build_object(
          'key','domain-' || v_specialty,
          'path',
            case v_specialty
              when 'sales' then '/reports/sales'
              when 'purchases' then '/reports/purchases'
              when 'inventory' then '/reports/inventory'
              when 'payments' then '/analytics/liquidity'
              when 'receivables' then '/reports/receivables'
              when 'profitability' then '/reports/profitability'
            end,
          'label',
            case v_specialty
              when 'sales' then 'تقرير المبيعات'
              when 'purchases' then 'تقرير المشتريات'
              when 'inventory' then 'تقرير المخزون'
              when 'payments' then 'تحليل السيولة والمدفوعات'
              when 'receivables' then 'تقرير الذمم المدينة'
              when 'profitability' then 'تقرير الربحية'
            end,
          'stage','DOMAIN OUTPUT',
          'specialty',v_specialty,
          'importId',v_import_id,
          'rendered',true,
          'sourceHash',r.source_hash,
          'sourceBound',true,
          'eligibility','EVIDENCE_REQUIRED'
        )
      );
    end if;
    v_metrics := jsonb_build_object(
      'totalAmount', null,
      'uniqueInvoiceCount', null,
      'missingCustomerRows', null,
      'missingInvoiceNumberRows', null,
      'missingInvoiceTypeRows', null,
      'receivableCandidate', null,
      'asOfStart', null,
      'asOfEnd', null,
      'fieldAvailability', jsonb_build_object(
        'total', coalesce(r.datasets::text,'') ~* '"mappedField":"(total|net_sales|sales_amount|local_amount|outstanding_balance)"',
        'invoiceNumber', coalesce(r.datasets::text,'') ~* '"mappedField":"invoice_number"',
        'customer', coalesce(r.datasets::text,'') ~* '"mappedField":"customer_name"',
        'invoiceType', coalesce(r.datasets::text,'') ~* '"mappedField":"invoice_type"',
        'date', coalesce(r.datasets::text,'') ~* '"mappedField":"(date|invoice_date|due_date)"'
      )
    );
    v_evidence := coalesce(r.evidence, '{}'::jsonb)
      || jsonb_build_object(
        'renderedOutput', jsonb_build_object(
          'outputs', v_outputs,
          'importId', v_import_id,
          'entityType', split_part(r.job_key, ':', 3),
          'sourceHash', r.source_hash,
          'sourceBound', true,
          'renderedAt', now(),
          'rowCount', r.row_count,
          'authoritativeCurrentRowCount', coalesce(nullif(r.evidence->>'authoritativeCurrentRowCount','')::integer, r.row_count),
          'sourceSpecialty', v_specialty,
          'sourceMetrics', v_metrics,
          'trustState', case
            when r.quality_score::numeric >= 75 then 'TRUSTED'
            when r.quality_score::numeric >= 50 then 'REVIEW'
            else 'BLOCKED'
          end,
          'qualityScore', r.quality_score::numeric,
          'evidenceStatus', 'AWAITING_EVIDENCE_SNAPSHOT',
          'signalStatus', 'AVAILABLE_FROM_CANONICAL_ANALYSIS',
          'intelligenceStatus', 'AVAILABLE_FROM_CANONICAL_ANALYSIS',
          'recommendationStatus', 'NOT_COMMITTED',
          'decisionStatus', 'NO_DECISION_COMMITTED',
          'approvalStatus', 'NOT_COMMITTED',
          'actionStatus', 'NO_ACTION_COMMITTED',
          'outcomeStatus', 'NOT_AVAILABLE',
          'learningStatus', 'NOT_AVAILABLE',
          'benchmarkStatus', 'INSUFFICIENT_SAMPLE',
          'replayStatus', 'NOT_AVAILABLE',
          'canonicalCommitVerified', true,
          'analysisSnapshotId', r.analysis_snapshot_id,
          'contractVersion', '2026-09-30-report-output-v1'
        ),
        'recoveredFromCompletedDurableJob', true,
        'recoveryContract', '2026-09-30-report-output-v1'
      );
    update public.report_execution_jobs
       set evidence = v_evidence,
           updated_at = now()
     where id = r.id
       and company_id = p_company_id
       and status = 'completed'
       and coalesce(evidence->'renderedOutput', 'null'::jsonb) = 'null'::jsonb;
    repaired_job_id := r.id;
    repaired_source_path := r.source_path;
    repaired_source_hash := r.source_hash;
    repaired_output_count := jsonb_array_length(v_outputs);
    return next;
  end loop;
end;
$_$;
CREATE FUNCTION public.recover_missing_source_analysis_snapshots(p_company_id uuid) RETURNS TABLE(recovered_source_hash text, recovered_job_id uuid, recovered_row_count integer, recovered_column_count integer, recovered_quality_score numeric)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
declare
  r record;
  c record;
  v_columns jsonb;
  v_preview jsonb;
  v_dataset jsonb;
  v_row_count integer;
  v_column_count integer;
  v_total_nonnull numeric;
  v_total_cells numeric;
  v_quality numeric;
  v_nonnull integer;
  v_unique integer;
  v_numeric integer;
  v_boolean integer;
  v_date_like integer;
  v_data_type text;
  v_mapped_field text;
  v_requires_review boolean;
  v_quality_issues jsonb;
  v_statistics jsonb;
  v_sample_values jsonb;
  v_source_path text;
  v_source_format text;
  v_file_name text;
  v_import_job_id uuid;
  v_canonical_commit_count integer;
begin
  if p_company_id is null then
    raise exception 'SOURCE_ANALYSIS_RECOVERY_TENANT_REQUIRED';
  end if;
  for r in
    select
      j.id as report_job_id,
      j.source_hash,
      j.source_path,
      j.job_key,
      coalesce(nullif(j.evidence->>'importId',''), null)::text as evidence_import_id,
      fr.file_name,
      fr.file_extension,
      fr.detected_format,
      fr.metadata->>'storage_bucket' as storage_bucket,
      fr.metadata->>'storage_path' as storage_path
    from public.report_execution_jobs j
    left join lateral (
      select fr.*
      from public.file_records fr
      where fr.company_id=p_company_id
        and fr.file_hash=j.source_hash
        and fr.status='ready'
        and fr.security_status='passed'
      order by fr.created_at desc, fr.id desc
      limit 1
    ) fr on true
    where j.company_id=p_company_id
      and j.status='completed'
      and coalesce(j.checkpoint->>'stage','')='rendered'
      and j.job_key like 'canonical-import:generic:%'
      and not exists (
        select 1
        from public.source_analysis_snapshots s
        where s.company_id=j.company_id
          and s.source_hash=j.source_hash
          and s.analysis_status='analyzed'
      )
      and exists (
        select 1
        from public.canonical_dataset_records cr
        where cr.company_id=j.company_id
          and cr.source_hash=j.source_hash
      )
      and exists (
        select 1
        from public.canonical_import_commits cc
        where cc.company_id=j.company_id
          and cc.source_hash=j.source_hash
      )
    order by j.completed_at asc nulls first, j.id asc
  loop
    select count(*)::integer into v_row_count
    from public.canonical_dataset_records cr
    where cr.company_id=p_company_id and cr.source_hash=r.source_hash;
    select coalesce(sum(cc.committed_count),0)::integer into v_canonical_commit_count
    from public.canonical_import_commits cc
    where cc.company_id=p_company_id and cc.source_hash=r.source_hash;
    if v_row_count < 1 or v_canonical_commit_count <> v_row_count then
      continue;
    end if;
    select count(*)::integer into v_column_count
    from (
      select distinct key_name
      from public.canonical_dataset_records cr
      cross join lateral jsonb_object_keys(cr.data) key_name
      where cr.company_id=p_company_id and cr.source_hash=r.source_hash
    ) keys;
    if v_column_count < 1 then
      continue;
    end if;
    v_columns := '[]'::jsonb;
    v_total_nonnull := 0;
    for c in
      select key_name
      from (
        select distinct key_name
        from public.canonical_dataset_records cr
        cross join lateral jsonb_object_keys(cr.data) key_name
        where cr.company_id=p_company_id and cr.source_hash=r.source_hash
      ) keys
      order by key_name
    loop
      select
        count(*) filter (
          where cr.data ? c.key_name
            and coalesce(jsonb_typeof(cr.data->c.key_name),'null') <> 'null'
            and coalesce(cr.data->>c.key_name,'') <> ''
        )::integer,
        count(distinct cr.data->>c.key_name) filter (
          where cr.data ? c.key_name
            and coalesce(jsonb_typeof(cr.data->c.key_name),'null') <> 'null'
            and coalesce(cr.data->>c.key_name,'') <> ''
        )::integer,
        count(*) filter (
          where cr.data ? c.key_name
            and jsonb_typeof(cr.data->c.key_name)='number'
        )::integer,
        count(*) filter (
          where cr.data ? c.key_name
            and jsonb_typeof(cr.data->c.key_name)='boolean'
        )::integer,
        count(*) filter (
          where cr.data ? c.key_name
            and coalesce(jsonb_typeof(cr.data->c.key_name),'null') <> 'null'
            and cr.data->>c.key_name ~ '^\\d{4}-\\d{2}-\\d{2}$'
        )::integer
      into v_nonnull, v_unique, v_numeric, v_boolean, v_date_like
      from public.canonical_dataset_records cr
      where cr.company_id=p_company_id and cr.source_hash=r.source_hash;
      v_total_nonnull := v_total_nonnull + v_nonnull;
      if v_nonnull > 0 and v_numeric=v_nonnull then
        v_data_type := 'decimal';
      elsif v_nonnull > 0 and v_boolean=v_nonnull then
        v_data_type := 'boolean';
      elsif v_nonnull > 0 and v_date_like=v_nonnull and lower(c.key_name) like '%date%' then
        v_data_type := 'date';
      elsif v_nonnull = 0 then
        v_data_type := 'unknown';
      else
        v_data_type := 'text';
      end if;
      v_mapped_field := case
        when lower(c.key_name) in ('customer_name','اسم العميل') then 'customer_name'
        when lower(c.key_name) in ('phone','رقم الجوال') then 'phone'
        when lower(c.key_name) in ('status','توقيف') then 'status'
        when lower(c.key_name) in ('branch_id','رقم الفرع') then 'branch_id'
        when lower(c.key_name) in ('invoice_number','رقم الفاتوره') then 'invoice_number'
        when lower(c.key_name) in ('invoice_type','نوع الفاتوره') then 'invoice_type'
        when lower(c.key_name) in ('date','التاريخ') and split_part(r.job_key,':',3)='sales' then 'invoice_date'
        when lower(c.key_name) in ('total','اجمالي الفاتوره') and split_part(r.job_key,':',3)='sales' then 'total'
        when lower(c.key_name) in ('charges','الاعباء') and split_part(r.job_key,':',3)='sales' then 'charges'
        when lower(c.key_name) in ('debit','مدين') and split_part(r.job_key,':',3)='payments' then 'debit'
        when lower(c.key_name) in ('credit','دائن') and split_part(r.job_key,':',3)='payments' then 'credit'
        when lower(c.key_name) in ('currency','العمله') and split_part(r.job_key,':',3)='payments'
             and exists (
               select 1 from public.canonical_dataset_records x
               where x.company_id=p_company_id and x.source_hash=r.source_hash
                 and x.data->>c.key_name = 'YER'
             ) then 'currency'
        when lower(c.key_name) in ('description','البيان') and split_part(r.job_key,':',3)='payments' then 'description'
        when lower(c.key_name) in ('date','التاريخ') and split_part(r.job_key,':',3)='payments' then 'date'
        when lower(c.key_name) in ('sku','رقم الصنف') then 'sku'
        when lower(c.key_name) in ('name','اسم الصنف') then 'name'
        else null
      end;
      v_quality_issues := '[]'::jsonb;
      if v_nonnull < ceil(v_row_count * 0.5) then
        v_quality_issues := v_quality_issues || jsonb_build_array('أكثر من 50% من القيم فارغة');
      end if;
      v_requires_review := jsonb_array_length(v_quality_issues) > 0;
      if v_numeric = v_nonnull and v_nonnull > 0 then
        select jsonb_build_object(
          'count', count(*) filter (where cr.data ? c.key_name and jsonb_typeof(cr.data->c.key_name)='number'),
          'sum', sum((cr.data->>c.key_name)::numeric),
          'mean', avg((cr.data->>c.key_name)::numeric),
          'min', min((cr.data->>c.key_name)::numeric),
          'max', max((cr.data->>c.key_name)::numeric)
        ) into v_statistics
        from public.canonical_dataset_records cr
        where cr.company_id=p_company_id and cr.source_hash=r.source_hash;
      else
        v_statistics := jsonb_build_object('count', v_nonnull);
      end if;
      select coalesce(
        (
          select jsonb_agg(sample_value)
          from (
            select cr.data->c.key_name as sample_value
            from public.canonical_dataset_records cr
            where cr.company_id=p_company_id
              and cr.source_hash=r.source_hash
              and cr.data ? c.key_name
              and jsonb_typeof(cr.data->c.key_name) <> 'null'
            order by cr.row_number
            limit 5
          ) samples
        ),
        '[]'::jsonb
      ) into v_sample_values;
      v_columns := v_columns || jsonb_build_array(
        jsonb_build_object(
          'name', c.key_name,
          'dataType', v_data_type,
          'nullCount', greatest(v_row_count-v_nonnull,0),
          'statistics', v_statistics,
          'mappedField', v_mapped_field,
          'uniqueCount', v_unique,
          'uniqueRatio', case when v_nonnull > 0 then round(v_unique::numeric/v_nonnull,6) else 0 end,
          'sampleValues', v_sample_values,
          'qualityIssues', v_quality_issues,
          'requiresReview', v_requires_review,
          'mappingConfidence', case when v_mapped_field is null then 0 else null end,
          'mappingEvidence', jsonb_build_object(
            'matchedBy', case when v_mapped_field is null then 'unmapped' else 'canonical-dataset-field' end,
            'confidence', case when v_mapped_field is null then 0 else null end,
            'canonicalField', v_mapped_field,
            'sourceHeader', c.key_name,
            'requiresReview', v_requires_review
          )
        )
      );
    end loop;
    select coalesce(
      (
        select jsonb_agg(cr.data order by cr.row_number)
        from (
          select cr.data, cr.row_number
          from public.canonical_dataset_records cr
          where cr.company_id=p_company_id and cr.source_hash=r.source_hash
          order by cr.row_number
          limit 20
        ) cr
      ),
      '[]'::jsonb
    ) into v_preview;
    v_total_cells := (v_row_count::numeric * v_column_count::numeric);
    v_quality := case when v_total_cells > 0 then round((v_total_nonnull / v_total_cells) * 100, 2) else 0 end;
    v_file_name := coalesce(r.file_name, nullif(r.source_path,''), r.source_hash);
    v_source_path := coalesce(
      r.storage_path,
      r.source_path,
      r.source_hash
    );
    v_source_format := lower(coalesce(nullif(r.detected_format,''), nullif(r.file_extension,''), 'unknown'));
    select i.id into v_import_job_id
    from public.import_jobs i
    where i.company_id=p_company_id
      and (
        i.result_summary->>'execution_job_id' = r.report_job_id::text
        or (i.result_summary->>'file_name') = v_file_name
      )
    order by (i.result_summary->>'execution_job_id' = r.report_job_id::text) desc, i.created_at desc
    limit 1;
    v_dataset := jsonb_build_array(
      jsonb_build_object(
        'name', v_file_name,
        'columns', v_columns,
        'preview', v_preview,
        'rowCount', v_row_count,
        'columnCount', v_column_count,
        'recovery', jsonb_build_object(
          'method','canonical_dataset_recovery_v1',
          'rawSourceReparse',false,
          'sourceHash',r.source_hash,
          'canonicalRowCount',v_row_count,
          'canonicalCommitCount',v_canonical_commit_count
        )
      )
    );
    insert into public.source_analysis_snapshots(
      company_id,import_job_id,source_hash,source_path,source_format,analysis_status,
      entity_type,quality_score,row_count,column_count,datasets,canonical_text,visual_assets,warnings,metadata
    )
    select
      p_company_id,v_import_job_id,r.source_hash,v_source_path,v_source_format,'analyzed',
      split_part(r.job_key,':',3),v_quality,v_row_count,v_column_count,v_dataset,
      format('Recovered analysis from canonical dataset for %s. No raw-source reparse was performed.',v_file_name),
      '[]'::jsonb,
      jsonb_build_array('RECOVERED_FROM_CANONICAL_DATASET','RAW_SOURCE_REPARSE_NOT_PERFORMED','QUALITY_SCORE_IS_COMPLETENESS_ONLY'),
      jsonb_build_object(
        'analysisMethod','canonical_dataset_recovery_v1',
        'recoveredAt',now(),
        'sourceHash',r.source_hash,
        'sourceFileRecordId',nullif(r.storage_path,''),
        'canonicalRowCount',v_row_count,
        'canonicalCommitCount',v_canonical_commit_count,
        'qualityMethod','non_null_cells_divided_by_total_cells'
      )
    where not exists (
      select 1
      from public.source_analysis_snapshots existing
      where existing.company_id=p_company_id
        and existing.source_hash=r.source_hash
        and existing.analysis_status='analyzed'
    );
    if found then
      recovered_source_hash := r.source_hash;
      recovered_job_id := r.report_job_id;
      recovered_row_count := v_row_count;
      recovered_column_count := v_column_count;
      recovered_quality_score := v_quality;
      return next;
    end if;
  end loop;
end;
$_$;
CREATE FUNCTION public.refresh_report_evidence_passport(p_company_id uuid, p_job_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
DECLARE
  v_job public.report_execution_jobs%ROWTYPE;
  v_rendered jsonb;
  v_import public.import_jobs%ROWTYPE;
  v_source public.file_records%ROWTYPE;
  v_source_version_id uuid;
  v_analysis public.source_analysis_snapshots%ROWTYPE;
  v_entity_type text;
  v_domain text;
  v_commit_count integer := 0;
  v_canonical_count integer := 0;
  v_authoritative_count integer;
  v_quality numeric;
  v_fingerprint text;
  v_snapshot_id uuid;
  v_passport_id uuid;
  v_coverage text;
  v_acceptance text;
  v_verification text;
  v_decision_readiness text;
  v_prior_state text;
  v_evidence jsonb;
BEGIN
  IF p_company_id IS NULL OR p_job_id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_PASSPORT_INPUT_REQUIRED'; END IF;
  SELECT * INTO v_job FROM public.report_execution_jobs WHERE id=p_job_id AND company_id=p_company_id FOR UPDATE;
  IF v_job.id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_REPORT_JOB_NOT_FOUND'; END IF;
  IF v_job.status <> 'completed' OR coalesce(v_job.checkpoint->>'stage','') <> 'rendered' THEN RAISE EXCEPTION 'REPORT_EVIDENCE_REPORT_NOT_RENDERED'; END IF;
  v_rendered := coalesce(v_job.evidence->'renderedOutput','{}'::jsonb);
  v_prior_state := nullif(v_rendered->>'evidenceStatus','');
  IF v_job.source_hash !~ '^sha256:[0-9a-fA-F]{64}$' THEN RAISE EXCEPTION 'REPORT_EVIDENCE_SOURCE_HASH_INVALID'; END IF;
  BEGIN
    SELECT * INTO v_import FROM public.import_jobs WHERE company_id=p_company_id AND id=nullif(v_rendered->>'importId','')::uuid FOR UPDATE;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'REPORT_EVIDENCE_IMPORT_JOB_ID_INVALID';
  END;
  IF v_import.id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_IMPORT_JOB_NOT_FOUND'; END IF;
  SELECT * INTO v_source FROM public.file_records WHERE company_id=p_company_id AND id=v_import.file_record_id AND file_hash=v_job.source_hash LIMIT 1 FOR UPDATE;
  IF v_source.id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_SOURCE_FILE_RECORD_HASH_MISMATCH'; END IF;
  IF v_source.security_status <> 'passed' OR v_source.status NOT IN ('ready','processed','verified') THEN RAISE EXCEPTION 'REPORT_EVIDENCE_SOURCE_FILE_SECURITY_PENDING'; END IF;
  SELECT * INTO v_analysis FROM public.source_analysis_snapshots WHERE company_id=p_company_id AND source_hash=v_job.source_hash AND analysis_status='analyzed' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF v_analysis.id IS NULL THEN RAISE EXCEPTION 'REPORT_EVIDENCE_SOURCE_ANALYSIS_MISSING'; END IF;
  v_quality := coalesce(v_analysis.quality_score,0);
  IF v_quality < 70 THEN v_acceptance := 'REVIEW'; ELSE v_acceptance := 'ACCEPTED'; END IF;
  v_entity_type := split_part(v_job.job_key,':',2)||':'||split_part(v_job.job_key,':',3);
  v_domain := split_part(v_job.job_key,':',3);
  SELECT coalesce(sum(c.committed_count),0)::integer INTO v_commit_count FROM public.canonical_import_commits c WHERE c.company_id=p_company_id AND c.entity_type=v_entity_type AND c.source_hash=v_job.source_hash;
  SELECT count(*)::integer INTO v_canonical_count FROM public.canonical_dataset_records cdr WHERE cdr.company_id=p_company_id AND cdr.semantic_domain=v_domain AND cdr.source_hash=v_job.source_hash;
  v_authoritative_count := nullif(v_rendered->>'authoritativeCurrentRowCount','')::integer;
  IF v_authoritative_count IS NULL THEN v_authoritative_count := nullif(v_rendered->>'rowCount','')::integer; END IF;
  IF v_authoritative_count IS NOT NULL AND v_commit_count=v_authoritative_count AND v_canonical_count=v_authoritative_count THEN
    v_coverage := 'FULL';
  ELSE
    v_coverage := 'PARTIAL';
  END IF;
  IF v_coverage <> 'FULL' THEN v_acceptance := CASE WHEN v_quality >= 70 THEN 'REVIEW' ELSE 'BLOCKED' END; END IF;
  v_verification := CASE WHEN v_acceptance='ACCEPTED' AND v_coverage='FULL' THEN 'VERIFIED' ELSE 'UNVERIFIED' END;
  v_decision_readiness := CASE WHEN v_verification='VERIFIED' THEN 'READY' WHEN v_coverage='PARTIAL' THEN 'REVIEW' WHEN v_quality<70 THEN 'BLOCKED' ELSE 'REVIEW' END;
  INSERT INTO public.report_source_versions(company_id,source_key,source_path,source_hash,change_kind,tombstone,metadata,evidence)
  VALUES(p_company_id,'report:'||v_job.source_path,v_job.source_path,v_job.source_hash,'unchanged',false,
    jsonb_build_object('reportExecutionJobId',v_job.id,'fileRecordId',v_source.id),
    jsonb_build_object('sourceHash',v_job.source_hash,'securityStatus',v_source.security_status))
  ON CONFLICT(company_id,source_key,source_hash) DO UPDATE SET source_path=excluded.source_path,metadata=report_source_versions.metadata||excluded.metadata,evidence=report_source_versions.evidence||excluded.evidence
  RETURNING id INTO v_source_version_id;
  v_fingerprint := md5(concat_ws('|',v_job.source_hash,v_analysis.id::text,v_commit_count::text,v_canonical_count::text,coalesce(v_authoritative_count,-1)::text,coalesce(v_quality,-1)::text,v_source.id::text));
  v_evidence := jsonb_build_object(
    'verificationMode','DETERMINISTIC_SOURCE_BOUND',
    'reportExecutionJobId',v_job.id,
    'source',jsonb_build_object('path',v_job.source_path,'hash',v_job.source_hash,'fileRecordId',v_source.id,'fileName',v_source.file_name,'detectedFormat',v_source.detected_format,'securityStatus',v_source.security_status),
    'sourceVersion',jsonb_build_object('id',v_source_version_id,'sourceKey','report:'||v_job.source_path,'hash',v_job.source_hash),
    'analysis',jsonb_build_object('snapshotId',v_analysis.id,'status',v_analysis.analysis_status,'qualityScore',v_quality,'rowCount',v_analysis.row_count,'columnCount',v_analysis.column_count,'sourceFormat',v_analysis.source_format),
    'canonical',jsonb_build_object('entityType',v_entity_type,'committedRows',v_commit_count,'canonicalRows',v_canonical_count,'authoritativeRows',v_authoritative_count,'coverage',v_coverage)
  );
  INSERT INTO public.report_evidence_snapshots(company_id,report_execution_job_id,source_version_id,analysis_snapshot_id,source_hash,source_path,canonical_commit_count,canonical_dataset_count,authoritative_row_count,canonical_coverage_status,acceptance_status,verification_status,accepted_at,verified_at,evidence_fingerprint,lineage,evidence)
  VALUES(p_company_id,v_job.id,v_source_version_id,v_analysis.id,v_job.source_hash,v_job.source_path,v_commit_count,v_canonical_count,v_authoritative_count,v_coverage,v_acceptance,v_verification,CASE WHEN v_acceptance='ACCEPTED' THEN clock_timestamp() END,CASE WHEN v_verification='VERIFIED' THEN clock_timestamp() END,v_fingerprint,
    jsonb_build_array(jsonb_build_object('type','SOURCE_VERSION','id',v_source_version_id,'hash',v_job.source_hash),jsonb_build_object('type','ANALYSIS_SNAPSHOT','id',v_analysis.id),jsonb_build_object('type','CANONICAL_COMMIT','entityType',v_entity_type,'rows',v_commit_count),jsonb_build_object('type','CANONICAL_DATASET','domain',v_domain,'rows',v_canonical_count),jsonb_build_object('type','FILE_RECORD','id',v_source.id,'hash',v_source.file_hash)),v_evidence)
  ON CONFLICT(company_id,evidence_fingerprint) DO UPDATE SET acceptance_status=excluded.acceptance_status,verification_status=excluded.verification_status,canonical_coverage_status=excluded.canonical_coverage_status,evidence=excluded.evidence,lineage=excluded.lineage
  RETURNING id INTO v_snapshot_id;
  INSERT INTO public.report_evidence_passports(company_id,report_execution_job_id,source_version_id,evidence_snapshot_id,source_hash,acceptance_status,verification_status,decision_readiness,prior_verification_state,lineage,evidence)
  VALUES(p_company_id,v_job.id,v_source_version_id,v_snapshot_id,v_job.source_hash,v_acceptance,v_verification,v_decision_readiness,CASE WHEN v_prior_state='VERIFIED' AND coalesce(v_rendered->>'evidenceSnapshotId','')='' THEN 'LEGACY_UNRESOLVED' END,jsonb_build_array(jsonb_build_object('type','SOURCE_VERSION','id',v_source_version_id,'hash',v_job.source_hash),jsonb_build_object('type','ANALYSIS_SNAPSHOT','id',v_analysis.id),jsonb_build_object('type','CANONICAL_COMMIT','entityType',v_entity_type,'rows',v_commit_count),jsonb_build_object('type','CANONICAL_DATASET','domain',v_domain,'rows',v_canonical_count),jsonb_build_object('type','FILE_RECORD','id',v_source.id,'hash',v_source.file_hash)),v_evidence)
  ON CONFLICT(company_id,report_execution_job_id,source_hash) DO UPDATE SET source_version_id=excluded.source_version_id,evidence_snapshot_id=excluded.evidence_snapshot_id,acceptance_status=excluded.acceptance_status,verification_status=excluded.verification_status,decision_readiness=excluded.decision_readiness,prior_verification_state=coalesce(public.report_evidence_passports.prior_verification_state,excluded.prior_verification_state),lineage=excluded.lineage,evidence=excluded.evidence,updated_at=clock_timestamp()
  RETURNING id INTO v_passport_id;
  UPDATE public.report_execution_jobs
  SET evidence=evidence||jsonb_build_object('evidencePassport',jsonb_build_object('passportId',v_passport_id,'evidenceSnapshotId',v_snapshot_id,'acceptanceStatus',v_acceptance,'verificationStatus',v_verification,'decisionReadiness',v_decision_readiness),'renderedOutput',v_rendered||jsonb_build_object('evidencePassportId',v_passport_id,'evidenceSnapshotId',v_snapshot_id,'evidenceAcceptanceStatus',v_acceptance,'evidenceVerificationStatus',v_verification,'decisionReadiness',v_decision_readiness,'evidenceStatus',CASE WHEN v_verification='VERIFIED' THEN 'VERIFIED' ELSE 'REVIEW' END)),updated_at=clock_timestamp()
  WHERE id=v_job.id AND company_id=p_company_id;
  UPDATE public.report_execution_tasks SET evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('evidencePassportId',v_passport_id,'evidenceSnapshotId',v_snapshot_id,'evidenceAcceptanceStatus',v_acceptance,'evidenceVerificationStatus',v_verification,'decisionReadiness',v_decision_readiness,'legacyPriorVerification',CASE WHEN v_prior_state='VERIFIED' AND coalesce(v_rendered->>'evidenceSnapshotId','')='' THEN true ELSE false END)
  WHERE report_execution_job_id=v_job.id AND company_id=p_company_id AND stage='rendered' AND status='completed';
  RETURN jsonb_build_object('reportJobId',v_job.id,'passportId',v_passport_id,'evidenceSnapshotId',v_snapshot_id,'sourceVersionId',v_source_version_id,'sourceHash',v_job.source_hash,'acceptanceStatus',v_acceptance,'verificationStatus',v_verification,'decisionReadiness',v_decision_readiness,'canonicalCoverage',v_coverage,'legacyPriorVerification',v_prior_state='VERIFIED' AND coalesce(v_rendered->>'evidenceSnapshotId','')='');
END;
$_$;
CREATE FUNCTION public.rehydrate_legacy_import_job(p_company_id uuid, p_file_record_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $_$
declare
  v_file public.file_records%rowtype;
  v_latest public.import_jobs%rowtype;
  v_job_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_company_id is null or p_file_record_id is null then
    raise exception 'LEGACY_REHYDRATION_INPUT_INVALID';
  end if;
  select * into v_file
  from public.file_records
  where id = p_file_record_id
    and company_id = p_company_id
  for update;
  if not found then
    raise exception 'FILE_RECORD_NOT_FOUND_OR_FORBIDDEN';
  end if;
  if coalesce(v_file.metadata->>'storage_bucket','documents') <> 'documents'
     or coalesce(v_file.metadata->>'storage_path','') = ''
     or v_file.metadata->>'storage_path' !~ ('^' || p_company_id::text || '/imports/[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,12}$') then
    raise exception 'LEGACY_SOURCE_STORAGE_BINDING_INVALID';
  end if;
  select * into v_latest
  from public.import_jobs
  where file_record_id = v_file.id
    and company_id = p_company_id
  order by created_at desc
  limit 1;
  if found and v_latest.status in ('queued','processing') then
    return v_latest.id;
  end if;
  insert into public.import_jobs(
    company_id,file_record_id,job_type,processing_mode,status,total_rows,processed_rows,
    valid_rows,invalid_rows,quarantined_rows,duplicate_rows,progress,started_at,
    source_fingerprint,result_summary
  )
  values(
    p_company_id,
    v_file.id,
    coalesce(nullif(btrim(v_latest.job_type),''),'generic:report'),
    'rehydration',
    'processing',
    0,0,0,0,0,0,0,now(),null,
    jsonb_build_object(
      'legacy_rehydration',true,
      'file_name',v_file.file_name,
      'source_storage_bucket',v_file.metadata->>'storage_bucket',
      'source_storage_path',v_file.metadata->>'storage_path',
      'rehydrated_from_import_job_id',v_latest.id
    )
  )
  returning id into v_job_id;
  return v_job_id;
end;
$_$;
CREATE FUNCTION public.release_is_verified(p_release_key text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM release_evidence_manifests r
    LEFT JOIN trust_certifications t ON t.id = r.certification_id
    WHERE r.company_id = public.current_company_id()
      AND r.release_key = p_release_key
      AND r.status = 'verified'
      AND r.verified_at IS NOT NULL
      AND (t.id IS NULL OR (t.status = 'valid' AND t.blocker_count = 0 AND t.expires_at > now()))
      AND NOT EXISTS (
        SELECT 1 FROM deployment_verification_runs d
        WHERE d.release_manifest_id = r.id
          AND d.status IN ('failed','blocked')
          AND d.phase IN ('preflight','canary','stabilization')
      )
  );
$$;
CREATE FUNCTION public.remove_alternative_item_group_member(p_company_id uuid, p_member_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
BEGIN
  IF v_company IS NULL OR p_company_id IS NULL OR p_company_id <> v_company THEN
    RAISE EXCEPTION 'tenant resolution failed';
  END IF;
  DELETE FROM public.alternative_item_group_members
  WHERE id = p_member_id AND company_id = v_company;
  RETURN FOUND;
END;
$$;
CREATE FUNCTION public.remove_cart_item(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
begin
  delete from public.cart_items ci
  using public.carts c
  where ci.cart_id = c.id
    and ci.product_id = p_product_id
    and c.user_id = auth.uid()
    and c.customer_id = public.current_customer_id()
    and c.company_id = public.current_customer_company_id();
end;
$$;
CREATE FUNCTION public.report_receivables_snapshot(p_page integer DEFAULT 0, p_page_size integer DEFAULT 25, p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(id uuid, company_id uuid, customer_id uuid, invoice_number text, invoice_date date, due_date date, total numeric, paid_amount numeric, outstanding numeric, bucket text, total_rows bigint, total_outstanding numeric, undated_rows bigint, bucket_0_30 numeric, bucket_31_60 numeric, bucket_61_90 numeric, bucket_90_plus numeric, status text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH scoped AS (
  SELECT si.id, si.company_id, si.customer_id, si.invoice_number,
         si.invoice_date::date AS invoice_date, si.due_date::date AS due_date,
         si.total, si.paid_amount,
         (si.total - si.paid_amount) AS outstanding
  FROM public.sales_invoices si
  WHERE si.company_id = public.current_company_id()
    AND lower(coalesce(si.status, '')) NOT IN ('cancelled', 'canceled', 'void')
    AND si.total IS NOT NULL
    AND si.paid_amount IS NOT NULL
    AND (si.total - si.paid_amount) > 0
), classified AS (
  SELECT s.*,
    CASE
      WHEN s.due_date IS NULL THEN 'UNDATED'
      WHEN greatest(p_as_of_date - s.due_date, 0) <= 30 THEN '0-30'
      WHEN greatest(p_as_of_date - s.due_date, 0) <= 60 THEN '31-60'
      WHEN greatest(p_as_of_date - s.due_date, 0) <= 90 THEN '61-90'
      ELSE '90+'
    END AS bucket
  FROM scoped s
), metrics AS (
  SELECT count(*)::bigint AS total_rows,
         coalesce(sum(outstanding), 0)::numeric AS total_outstanding,
         count(*) FILTER (WHERE bucket = 'UNDATED')::bigint AS undated_rows,
         coalesce(sum(outstanding) FILTER (WHERE bucket = '0-30'), 0)::numeric AS bucket_0_30,
         coalesce(sum(outstanding) FILTER (WHERE bucket = '31-60'), 0)::numeric AS bucket_31_60,
         coalesce(sum(outstanding) FILTER (WHERE bucket = '61-90'), 0)::numeric AS bucket_61_90,
         coalesce(sum(outstanding) FILTER (WHERE bucket = '90+'), 0)::numeric AS bucket_90_plus
  FROM classified
), page AS (
  SELECT * FROM classified
  ORDER BY invoice_date DESC NULLS LAST, id DESC
  OFFSET greatest(p_page, 0) * greatest(p_page_size, 1)
  LIMIT greatest(least(p_page_size, 500), 1)
)
SELECT page.id, page.company_id, page.customer_id, page.invoice_number,
       page.invoice_date, page.due_date, page.total, page.paid_amount, page.outstanding,
       page.bucket,
       metrics.total_rows, metrics.total_outstanding, metrics.undated_rows,
       metrics.bucket_0_30, metrics.bucket_31_60, metrics.bucket_61_90, metrics.bucket_90_plus,
       CASE WHEN metrics.total_rows = 0 THEN 'INSUFFICIENT_DATA' ELSE 'CALCULATED' END
FROM page CROSS JOIN metrics;
$$;
CREATE FUNCTION public.request_decision_approval(p_decision_id uuid, p_reason text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_company uuid := public.current_company_id();
  v_id uuid;
  v_user uuid := auth.uid();
  v_existing_status text;
  v_decision_status text;
begin
  if v_company is null or v_user is null then
    raise exception 'TENANT_CONTEXT_REQUIRED';
  end if;
  select d.status
    into v_decision_status
  from public.business_intelligence_decisions d
  where d.id = p_decision_id
    and d.company_id = v_company
  for update;
  if v_decision_status is distinct from 'PROPOSED' then
    raise exception 'DECISION_NOT_APPROVABLE';
  end if;
  select a.status
    into v_existing_status
  from public.decision_approvals a
  where a.company_id = v_company
    and a.decision_id = p_decision_id
  for update;
  if v_existing_status in ('APPROVED','REJECTED','CANCELLED') then
    raise exception 'APPROVAL_TERMINAL_NOT_REOPENABLE';
  end if;
  insert into public.decision_approvals(
    company_id,
    decision_id,
    status,
    requested_by,
    reason
  )
  values(
    v_company,
    p_decision_id,
    'PENDING',
    v_user,
    p_reason
  )
  on conflict(company_id,decision_id) do update
  set status = 'PENDING',
      requested_by = excluded.requested_by,
      reason = excluded.reason,
      requested_at = now(),
      decided_at = null,
      decided_by = null
  where public.decision_approvals.status not in ('APPROVED','REJECTED','CANCELLED')
  returning id into v_id;
  if v_id is null then
    raise exception 'APPROVAL_TERMINAL_NOT_REOPENABLE';
  end if;
  return v_id;
end;
$$;
CREATE FUNCTION public.retry_report_execution_job(p_job_id uuid, p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  affected integer;
  v_company_id uuid := public.current_company_id();
  v_is_service_role boolean := COALESCE(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF NOT v_is_service_role AND (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATED_USER_REQUIRED';
  END IF;
  IF p_company_id IS NULL OR p_job_id IS NULL THEN
    RAISE EXCEPTION 'REPORT_EXECUTION_RETRY_INPUT_INVALID';
  END IF;
  IF NOT v_is_service_role
     AND (v_company_id IS NULL OR p_company_id IS DISTINCT FROM v_company_id) THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_MISMATCH';
  END IF;
  UPDATE public.report_execution_jobs
  SET status = 'queued',
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      last_error = '{}'::jsonb,
      completed_at = null,
      updated_at = clock_timestamp()
  WHERE id = p_job_id
    AND company_id = p_company_id
    AND status = 'failed'
    AND attempt < max_attempts;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;
CREATE FUNCTION public.set_cart_item(p_product_id uuid, p_quantity integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_cart uuid;
  v_company uuid;
  v_customer uuid;
  v_available numeric;
begin
  v_company := public.current_customer_company_id();
  v_customer := public.current_customer_id();
  if v_company is null or v_customer is null then
    raise exception 'customer context required';
  end if;
  select coalesce(sum(ib.quantity), 0)
    into v_available
  from public.inventory_balances ib
  where ib.company_id = v_company
    and ib.product_id = p_product_id;
  if p_quantity < 1 or p_quantity > 100000 or p_quantity > v_available then
    raise exception 'quantity exceeds available stock';
  end if;
  insert into public.carts(company_id, customer_id, user_id)
  values(v_company, v_customer, auth.uid())
  on conflict(company_id, user_id)
  do update set updated_at = now()
  returning id into v_cart;
  insert into public.cart_items(cart_id, product_id, quantity)
  values(v_cart, p_product_id, p_quantity)
  on conflict(cart_id, product_id)
  do update set quantity = excluded.quantity, updated_at = now();
end;
$$;
CREATE FUNCTION public.start_decision_work_item(p_work_item_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_user uuid := auth.uid();
  v_status text;
  v_assignee uuid;
  v_decision uuid;
BEGIN
  IF v_company IS NULL OR v_user IS NULL THEN
    RAISE EXCEPTION 'TENANT_CONTEXT_REQUIRED';
  END IF;
  SELECT w.status, w.assignee_id, w.decision_id
    INTO v_status, v_assignee, v_decision
  FROM public.decision_work_items w
  JOIN public.business_intelligence_decisions d
    ON d.id = w.decision_id
   AND d.company_id = v_company
   AND d.status = 'APPROVED'
  WHERE w.id = p_work_item_id
    AND w.company_id = v_company
  FOR UPDATE OF w;
  IF v_decision IS NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND_OR_DECISION_NOT_APPROVED';
  END IF;
  IF v_status <> 'OPEN' THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_STARTABLE';
  END IF;
  IF v_assignee IS NOT NULL AND v_assignee <> v_user THEN
    RAISE EXCEPTION 'WORK_ITEM_ASSIGNEE_FORBIDDEN';
  END IF;
  UPDATE public.decision_work_items
     SET status = 'IN_PROGRESS',
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = p_work_item_id
     AND company_id = v_company
     AND status = 'OPEN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORK_ITEM_STATE_CHANGED';
  END IF;
  RETURN true;
END;
$$;
CREATE FUNCTION public.update_recommendation_status(p_recommendation_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_company_id uuid;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then raise exception 'TENANT_CONTEXT_REQUIRED'; end if;
  if p_status is null or btrim(p_status) = '' then raise exception 'RECOMMENDATION_STATUS_REQUIRED'; end if;
  if lower(p_status) not in ('new','in_progress','completed','dismissed','approved','rejected') then
    raise exception 'INVALID_RECOMMENDATION_STATUS';
  end if;
  update public.recommendations
     set status = lower(p_status)
   where id = p_recommendation_id
     and company_id = v_company_id;
  if not found then raise exception 'RECOMMENDATION_NOT_FOUND_OR_FORBIDDEN'; end if;
end;
$$;
CREATE TABLE public.alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text,
    entity_type text,
    entity_id uuid,
    metric_value numeric(18,3),
    threshold numeric(18,3),
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.anomaly_correlations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    correlation_key text NOT NULL,
    domain text NOT NULL,
    severity text NOT NULL,
    signal_count integer NOT NULL,
    confidence numeric,
    signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT anomaly_correlations_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT anomaly_correlations_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT anomaly_correlations_signal_count_check CHECK ((signal_count >= 1)),
    CONSTRAINT anomaly_correlations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'suppressed'::text])))
);
CREATE TABLE public.artifact_verification_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    artifact_sha256 text NOT NULL,
    expected_sha256 text NOT NULL,
    status text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT artifact_verification_runs_status_check CHECK ((status = ANY (ARRAY['verified'::text, 'failed'::text, 'blocked'::text, 'unknown'::text])))
);
CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    source text,
    user_label text,
    correlation_id text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.automation_execution_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    receipt_id text NOT NULL,
    action_id text NOT NULL,
    decision_fingerprint text NOT NULL,
    evidence_snapshot_id text NOT NULL,
    idempotency_key text NOT NULL,
    status text NOT NULL,
    attempt integer NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    error_code text,
    outcome jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_execution_receipts_attempt_check CHECK ((attempt >= 1)),
    CONSTRAINT automation_execution_receipts_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'blocked'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);
CREATE TABLE public.automation_remediation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    remediation_key text NOT NULL,
    component text NOT NULL,
    status text NOT NULL,
    approval_required boolean DEFAULT true NOT NULL,
    idempotency_key text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT automation_remediation_runs_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'executed'::text, 'failed'::text, 'blocked'::text])))
);
CREATE TABLE public.autonomy_certification_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    certification_key text NOT NULL,
    gate_key text NOT NULL,
    passed boolean NOT NULL,
    measured_value numeric,
    threshold numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.autonomy_certification_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    certification_key text NOT NULL,
    status text NOT NULL,
    trust_score numeric,
    evidence_quality numeric,
    risk_budget_valid boolean DEFAULT false NOT NULL,
    rollback_verified boolean DEFAULT false NOT NULL,
    isolation_verified boolean DEFAULT false NOT NULL,
    gates jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT autonomy_certification_runs_evidence_quality_check CHECK (((evidence_quality >= (0)::numeric) AND (evidence_quality <= (1)::numeric))),
    CONSTRAINT autonomy_certification_runs_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'blocked'::text]))),
    CONSTRAINT autonomy_certification_runs_trust_score_check CHECK (((trust_score >= (0)::numeric) AND (trust_score <= (1)::numeric)))
);
CREATE TABLE public.autonomy_domain_controls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    domain_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    min_evidence_quality numeric DEFAULT 0.9 NOT NULL,
    min_confidence numeric DEFAULT 0.9 NOT NULL,
    max_risk_budget numeric DEFAULT 0 NOT NULL,
    rollback_enabled boolean DEFAULT true NOT NULL,
    trust_state text DEFAULT 'blocked'::text NOT NULL,
    last_certified_at timestamp with time zone,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT autonomy_domain_controls_max_risk_budget_check CHECK ((max_risk_budget >= (0)::numeric)),
    CONSTRAINT autonomy_domain_controls_min_confidence_check CHECK (((min_confidence >= (0)::numeric) AND (min_confidence <= (1)::numeric))),
    CONSTRAINT autonomy_domain_controls_min_evidence_quality_check CHECK (((min_evidence_quality >= (0)::numeric) AND (min_evidence_quality <= (1)::numeric))),
    CONSTRAINT autonomy_domain_controls_trust_state_check CHECK ((trust_state = ANY (ARRAY['eligible'::text, 'degraded'::text, 'blocked'::text])))
);
CREATE TABLE public.autonomy_rollback_drills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    drill_key text NOT NULL,
    target_domain text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    pre_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    rollback_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    executed_at timestamp with time zone,
    CONSTRAINT autonomy_rollback_drills_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'passed'::text, 'failed'::text])))
);
CREATE TABLE public.backup_verification_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    backup_ref text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    backup_started_at timestamp with time zone,
    backup_completed_at timestamp with time zone,
    restore_started_at timestamp with time zone,
    restore_completed_at timestamp with time zone,
    rpo_seconds numeric,
    rto_seconds numeric,
    integrity_hash text,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT backup_verification_runs_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'partial'::text])))
);
CREATE TABLE public.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text,
    provider_invoice_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    amount_minor bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_invoices_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT billing_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'past_due'::text, 'void'::text, 'uncollectible'::text])))
);
CREATE TABLE public.billing_liveness_probes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    provider text NOT NULL,
    probe_key text NOT NULL,
    status text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    replay_safe boolean DEFAULT false NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT billing_liveness_probes_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'blocked'::text, 'unknown'::text])))
);
CREATE TABLE public.billing_plan_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    capability text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    monthly_limit numeric,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_plan_capabilities_capability_check CHECK ((length(TRIM(BOTH FROM capability)) > 0)),
    CONSTRAINT billing_plan_capabilities_monthly_limit_check CHECK (((monthly_limit IS NULL) OR (monthly_limit >= (0)::numeric)))
);
CREATE TABLE public.billing_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    monthly_amount_minor bigint,
    currency text,
    "interval" text DEFAULT 'month'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_plans_currency_check CHECK (((currency IS NULL) OR ((length(currency) >= 3) AND (length(currency) <= 3)))),
    CONSTRAINT billing_plans_interval_check CHECK (("interval" = ANY (ARRAY['month'::text, 'year'::text]))),
    CONSTRAINT billing_plans_monthly_amount_minor_check CHECK (((monthly_amount_minor IS NULL) OR (monthly_amount_minor >= 0)))
);
CREATE TABLE public.billing_subscription_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    subscription_id uuid,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    from_status text,
    to_status text,
    payload_hash text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE public.billing_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    provider_customer_id text,
    provider_subscription_id text,
    started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    grace_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    cancelled_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_subscriptions_check CHECK (((current_period_end IS NULL) OR (current_period_start IS NULL) OR (current_period_end > current_period_start))),
    CONSTRAINT billing_subscriptions_check1 CHECK (((grace_ends_at IS NULL) OR (current_period_end IS NULL) OR (grace_ends_at >= current_period_end))),
    CONSTRAINT billing_subscriptions_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'cancelled'::text, 'expired'::text])))
);
CREATE TABLE public.billing_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    capability text NOT NULL,
    quantity numeric NOT NULL,
    period_start date NOT NULL,
    idempotency_key text NOT NULL,
    source text DEFAULT 'app'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_usage_events_capability_check CHECK ((length(TRIM(BOTH FROM capability)) > 0)),
    CONSTRAINT billing_usage_events_idempotency_key_check CHECK ((length(TRIM(BOTH FROM idempotency_key)) > 0)),
    CONSTRAINT billing_usage_events_quantity_check CHECK ((quantity > (0)::numeric))
);
CREATE TABLE public.billing_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    event_id text NOT NULL,
    company_id uuid,
    event_type text NOT NULL,
    payload_hash text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);
CREATE TABLE public.bounded_scenario_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    scenario_key text NOT NULL,
    state_snapshot_id uuid,
    objective text NOT NULL,
    horizon_days integer NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_budget numeric NOT NULL,
    protected_liquidity numeric DEFAULT 0 NOT NULL,
    input_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bounded_scenario_runs_horizon_days_check CHECK ((horizon_days > 0)),
    CONSTRAINT bounded_scenario_runs_protected_liquidity_check CHECK ((protected_liquidity >= (0)::numeric)),
    CONSTRAINT bounded_scenario_runs_risk_budget_check CHECK ((risk_budget >= (0)::numeric)),
    CONSTRAINT bounded_scenario_runs_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'computed'::text, 'blocked'::text, 'failed'::text])))
);
CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.business_intelligence_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_key text NOT NULL,
    policy_key text,
    decision_type text NOT NULL,
    status text NOT NULL,
    confidence numeric,
    expected_impact numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_at timestamp with time zone,
    recommendation_id uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejection_reason text,
    CONSTRAINT business_intelligence_decisions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT business_intelligence_decisions_status_check CHECK ((status = ANY (ARRAY['PROPOSED'::text, 'APPROVED'::text, 'EXECUTED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'BLOCKED'::text]))),
    CONSTRAINT decision_approval_consistency CHECK ((((status = 'APPROVED'::text) AND (approved_at IS NOT NULL) AND (approved_by IS NOT NULL)) OR (status <> 'APPROVED'::text))),
    CONSTRAINT decision_approved_temporal_ck CHECK (((approved_at IS NULL) OR (approved_at >= created_at))),
    CONSTRAINT decision_execution_consistency CHECK ((((status = 'EXECUTED'::text) AND (executed_at IS NOT NULL)) OR (status <> 'EXECUTED'::text))),
    CONSTRAINT decisions_confidence_range CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT decisions_evidence_object CHECK ((jsonb_typeof(evidence) = 'object'::text))
);
CREATE TABLE public.business_risk_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    budget_key text NOT NULL,
    domain text NOT NULL,
    max_risk numeric NOT NULL,
    consumed_risk numeric DEFAULT 0 NOT NULL,
    status text NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT business_risk_budgets_consumed_risk_check CHECK ((consumed_risk >= (0)::numeric)),
    CONSTRAINT business_risk_budgets_max_risk_check CHECK ((max_risk >= (0)::numeric)),
    CONSTRAINT business_risk_budgets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'exhausted'::text, 'blocked'::text, 'expired'::text])))
);
CREATE TABLE public.business_state_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    snapshot_key text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    source_version text NOT NULL,
    sales jsonb DEFAULT '{}'::jsonb NOT NULL,
    demand jsonb DEFAULT '{}'::jsonb NOT NULL,
    inventory jsonb DEFAULT '{}'::jsonb NOT NULL,
    liquidity jsonb DEFAULT '{}'::jsonb NOT NULL,
    operations jsonb DEFAULT '{}'::jsonb NOT NULL,
    quality_score numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT business_state_snapshots_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric)))
);
CREATE TABLE public.canonical_dataset_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    import_job_id uuid,
    source_hash text NOT NULL,
    semantic_domain text NOT NULL,
    row_number integer NOT NULL,
    record_key text NOT NULL,
    data jsonb NOT NULL,
    provenance jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canonical_dataset_records_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
    CONSTRAINT canonical_dataset_records_domain_check CHECK (((length(btrim(semantic_domain)) >= 1) AND (length(btrim(semantic_domain)) <= 128))),
    CONSTRAINT canonical_dataset_records_key_check CHECK (((length(btrim(record_key)) >= 1) AND (length(btrim(record_key)) <= 512))),
    CONSTRAINT canonical_dataset_records_provenance_check CHECK ((jsonb_typeof(provenance) = 'object'::text)),
    CONSTRAINT canonical_dataset_records_row_number_check CHECK ((row_number > 0)),
    CONSTRAINT canonical_dataset_records_source_hash_check CHECK ((source_hash ~ '^sha256:[0-9a-fA-F]{64}$'::text))
);
CREATE TABLE public.canonical_import_commits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type text NOT NULL,
    source_hash text NOT NULL,
    committed_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    committed_count integer DEFAULT 0 NOT NULL,
    committed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canonical_import_commits_count_nonnegative CHECK ((committed_count >= 0)),
    CONSTRAINT canonical_import_commits_entity_type_check CHECK (((entity_type = ANY (ARRAY['products'::text, 'customers'::text, 'sales_invoices'::text])) OR (entity_type ~ '^generic:[a-z][a-z0-9_-]{0,63}$'::text))),
    CONSTRAINT canonical_import_commits_source_hash_format CHECK ((source_hash ~ '^sha256:[0-9a-fA-F]{64}$'::text))
);
CREATE TABLE public.canonical_import_repair_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type text NOT NULL,
    source_hash text NOT NULL,
    previous_import_job_id uuid,
    previous_committed_count integer NOT NULL,
    previous_committed_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    reason text NOT NULL,
    parser_version text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
CREATE TABLE public.canonical_text_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_version_id uuid NOT NULL,
    source_hash text NOT NULL,
    text_hash text NOT NULL,
    processing_version text NOT NULL,
    extraction_route text NOT NULL,
    quality_score numeric,
    canonical_text text NOT NULL,
    layout_manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT canonical_text_artifacts_extraction_route_check CHECK ((extraction_route = ANY (ARRAY['pdf_text'::text, 'table'::text, 'ocr'::text, 'structured'::text, 'fallback'::text]))),
    CONSTRAINT canonical_text_artifacts_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric)))
);
CREATE TABLE public.canonical_text_provenance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid,
    file_id uuid,
    source_hash text NOT NULL,
    text_hash text,
    source_type text NOT NULL,
    extraction_status text NOT NULL,
    analysis_input_mode text NOT NULL,
    text_storage_path text,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT canonical_text_provenance_analysis_input_mode_check CHECK ((analysis_input_mode = ANY (ARRAY['canonical_text'::text, 'structured_source_fallback'::text]))),
    CONSTRAINT canonical_text_provenance_extraction_status_check CHECK ((extraction_status = ANY (ARRAY['not_started'::text, 'succeeded'::text, 'failed'::text, 'partial'::text])))
);
CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK (((quantity > 0) AND (quantity <= 100000)))
);
CREATE TABLE public.carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.cash_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name text NOT NULL,
    currency text NOT NULL,
    opening_balance numeric DEFAULT 0 NOT NULL,
    received numeric DEFAULT 0 NOT NULL,
    spent numeric DEFAULT 0 NOT NULL,
    current_balance numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cash_accounts_currency_format CHECK (((currency = upper(btrim(currency))) AND (length(btrim(currency)) = 3))),
    CONSTRAINT cash_accounts_nonnegative CHECK (((opening_balance >= (0)::numeric) AND (received >= (0)::numeric) AND (spent >= (0)::numeric)))
);
CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.client_ui_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    config jsonb DEFAULT '{"showExcel": true, "showCredit": true, "showSearch": true, "showInventory": true, "showTemplates": true, "showCategories": true, "showQuickOrder": true, "showRetailPrice": false}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_ui_settings_config_shape_check CHECK (((jsonb_typeof(config) = 'object'::text) AND (COALESCE(jsonb_typeof((config -> 'showSearch'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showCategories'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showExcel'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showQuickOrder'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showTemplates'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showCredit'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showInventory'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showRetailPrice'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'requireQuantityConfirmation'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showTieredPricing'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showSavingsCalculator'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showImageSearch'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showVoiceSearch'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'showPaymentMethods'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'paymentOnCredit'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'paymentCash'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'paymentTransfer'::text)), 'boolean'::text) = 'boolean'::text) AND (COALESCE(jsonb_typeof((config -> 'minOrderValue'::text)), 'number'::text) = 'number'::text) AND (COALESCE(jsonb_typeof((config -> 'maxOrderValue'::text)), 'number'::text) = 'number'::text) AND (COALESCE(jsonb_typeof((config -> 'maxTemplates'::text)), 'number'::text) = 'number'::text)))
);
CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    legal_name text,
    tax_id text,
    currency text DEFAULT 'SAR'::text NOT NULL,
    timezone text DEFAULT 'Asia/Riyadh'::text NOT NULL,
    industry text DEFAULT 'retail'::text NOT NULL,
    phone text,
    email text,
    address text,
    logo_url text,
    created_at timestamp with time zone DEFAULT now()
);
COMMENT ON TABLE public.companies IS 'Production tenant boundary: authenticated access is scoped through public.current_company_id().';
CREATE TABLE public.company_entitlements (
    company_id uuid NOT NULL,
    plan_id uuid,
    status text DEFAULT 'trialing'::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    provider text,
    provider_customer_id text,
    provider_subscription_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_entitlements_status_check CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'cancelled'::text, 'expired'::text])))
);
CREATE TABLE public.control_plane_drift_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    drift_key text NOT NULL,
    domain text NOT NULL,
    severity text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    baseline jsonb DEFAULT '{}'::jsonb NOT NULL,
    observed jsonb DEFAULT '{}'::jsonb NOT NULL,
    deviation numeric,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT control_plane_drift_events_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT control_plane_drift_events_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'mitigated'::text, 'resolved'::text, 'blocked'::text])))
);
CREATE TABLE public.control_plane_health_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    overall_score numeric NOT NULL,
    evidence_score numeric NOT NULL,
    data_quality_score numeric NOT NULL,
    forecast_score numeric NOT NULL,
    decision_score numeric NOT NULL,
    trust_score numeric NOT NULL,
    critical_blocker_count integer DEFAULT 0 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT control_plane_health_snapshots_critical_blocker_count_check CHECK ((critical_blocker_count >= 0)),
    CONSTRAINT control_plane_health_snapshots_data_quality_score_check CHECK (((data_quality_score >= (0)::numeric) AND (data_quality_score <= (1)::numeric))),
    CONSTRAINT control_plane_health_snapshots_decision_score_check CHECK (((decision_score >= (0)::numeric) AND (decision_score <= (1)::numeric))),
    CONSTRAINT control_plane_health_snapshots_evidence_score_check CHECK (((evidence_score >= (0)::numeric) AND (evidence_score <= (1)::numeric))),
    CONSTRAINT control_plane_health_snapshots_forecast_score_check CHECK (((forecast_score >= (0)::numeric) AND (forecast_score <= (1)::numeric))),
    CONSTRAINT control_plane_health_snapshots_overall_score_check CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (1)::numeric))),
    CONSTRAINT control_plane_health_snapshots_trust_score_check CHECK (((trust_score >= (0)::numeric) AND (trust_score <= (1)::numeric)))
);
CREATE TABLE public.control_plane_optimization_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_key text NOT NULL,
    state_snapshot_id uuid,
    status text NOT NULL,
    objective text NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    solution jsonb DEFAULT '{}'::jsonb NOT NULL,
    risk_budget numeric,
    liquidity_reserved numeric,
    service_level_target numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT control_plane_optimization_runs_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'executed'::text, 'blocked'::text, 'rolled_back'::text, 'failed'::text])))
);
CREATE TABLE public.customer_credit_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    currency text DEFAULT 'SAR'::text NOT NULL,
    credit_limit numeric DEFAULT 0 NOT NULL,
    outstanding_balance numeric DEFAULT 0 NOT NULL,
    available_credit numeric GENERATED ALWAYS AS (GREATEST((credit_limit - outstanding_balance), (0)::numeric)) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_credit_accounts_credit_limit_nonnegative CHECK ((credit_limit >= (0)::numeric)),
    CONSTRAINT customer_credit_accounts_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT customer_credit_accounts_outstanding_nonnegative CHECK ((outstanding_balance >= (0)::numeric))
);
CREATE TABLE public.customer_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    revoked_at timestamp with time zone,
    invited_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_invitations_email_format CHECK ((POSITION(('@'::text) IN (email)) > 1))
);
CREATE TABLE public.customer_ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    reference text,
    description text NOT NULL,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    due_date date,
    status text DEFAULT 'open'::text NOT NULL,
    source_type text,
    source_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_ledger_entries_credit_nonnegative CHECK ((credit >= (0)::numeric)),
    CONSTRAINT customer_ledger_entries_debit_nonnegative CHECK ((debit >= (0)::numeric))
);
CREATE TABLE public.customer_price_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    min_quantity integer NOT NULL,
    unit_price numeric NOT NULL,
    currency text DEFAULT 'SAR'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_price_tiers_currency_format CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT customer_price_tiers_min_quantity_positive CHECK ((min_quantity > 0)),
    CONSTRAINT customer_price_tiers_unit_price_nonnegative CHECK ((unit_price >= (0)::numeric))
);
CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    email text,
    address text,
    tax_id text,
    credit_limit numeric(18,3) DEFAULT 0,
    payment_terms_days integer DEFAULT 30,
    segment text DEFAULT 'regular'::text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.data_quality_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_record_id uuid,
    job_id uuid,
    total_rows integer DEFAULT 0,
    total_columns integer DEFAULT 0,
    completeness_score numeric(5,2) DEFAULT 0,
    validity_score numeric(5,2) DEFAULT 0,
    uniqueness_score numeric(5,2) DEFAULT 0,
    consistency_score numeric(5,2) DEFAULT 0,
    overall_score numeric(5,2) DEFAULT 0,
    missing_values jsonb,
    duplicates jsonb,
    anomalies jsonb,
    statistics jsonb,
    column_profiles jsonb,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.decision_action_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    work_item_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    status text NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    evidence_snapshot_id uuid,
    decision_fingerprint text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    error_code text,
    outcome jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT decision_action_receipts_attempt_check CHECK ((attempt >= 1)),
    CONSTRAINT decision_action_receipts_status_check CHECK ((status = ANY (ARRAY['ACCEPTED'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'BLOCKED'::text, 'CANCELLED'::text])))
);
CREATE TABLE public.decision_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_id uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    requested_by uuid,
    decided_by uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    reason text,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT approval_status_consistency CHECK ((((status = 'PENDING'::text) AND (decided_at IS NULL) AND (decided_by IS NULL)) OR ((status = ANY (ARRAY['APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])) AND (decided_at IS NOT NULL) AND (decided_by IS NOT NULL)))),
    CONSTRAINT approvals_evidence_object CHECK ((jsonb_typeof(evidence) = 'object'::text)),
    CONSTRAINT decision_approval_temporal_ck CHECK (((decided_at IS NULL) OR (decided_at >= requested_at))),
    CONSTRAINT decision_approvals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);
CREATE TABLE public.decision_graph_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_key text NOT NULL,
    from_node text NOT NULL,
    to_node text NOT NULL,
    relation text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.decision_graph_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_key text NOT NULL,
    node_key text NOT NULL,
    node_type text NOT NULL,
    source_ref text,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT decision_graph_nodes_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);
CREATE TABLE public.decision_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_fingerprint text NOT NULL,
    evidence_snapshot_id text NOT NULL,
    action_id text,
    observed_at timestamp with time zone NOT NULL,
    label text NOT NULL,
    actual_value numeric,
    expected_value numeric,
    impact_value numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    observed_by uuid,
    CONSTRAINT decision_outcome_has_value CHECK (((expected_value IS NOT NULL) OR (actual_value IS NOT NULL))),
    CONSTRAINT decision_outcome_label_values CHECK ((label = ANY (ARRAY['correct'::text, 'incorrect'::text, 'partial'::text, 'unknown'::text]))),
    CONSTRAINT decision_outcome_observed_before_recorded CHECK ((observed_at <= created_at)),
    CONSTRAINT decision_outcomes_label_check CHECK ((label = ANY (ARRAY['correct'::text, 'incorrect'::text, 'partial'::text, 'unknown'::text])))
);
CREATE TABLE public.decision_portfolio_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_key text NOT NULL,
    priority_score numeric DEFAULT 0 NOT NULL,
    materiality_score numeric DEFAULT 0 NOT NULL,
    confidence_score numeric DEFAULT 0 NOT NULL,
    risk_consumption numeric DEFAULT 0 NOT NULL,
    escalation_required boolean DEFAULT false NOT NULL,
    status text DEFAULT 'candidate'::text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT decision_portfolio_items_risk_consumption_check CHECK ((risk_consumption >= (0)::numeric)),
    CONSTRAINT decision_portfolio_items_status_check CHECK ((status = ANY (ARRAY['candidate'::text, 'ready'::text, 'approved'::text, 'executed'::text, 'deferred'::text, 'blocked'::text])))
);
CREATE TABLE public.decision_work_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_id uuid NOT NULL,
    recommendation_id uuid,
    department text NOT NULL,
    assignee_id uuid,
    assignee_label text,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'MEDIUM'::text NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    due_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    expected_impact numeric,
    actual_impact numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT decision_work_items_priority_check CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'CRITICAL'::text]))),
    CONSTRAINT decision_work_items_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'BLOCKED'::text, 'CANCELLED'::text]))),
    CONSTRAINT work_item_completed_consistency CHECK ((((status = 'COMPLETED'::text) AND (completed_at IS NOT NULL)) OR (status <> 'COMPLETED'::text))),
    CONSTRAINT work_item_temporal_ck CHECK ((((started_at IS NULL) OR (started_at >= created_at)) AND ((completed_at IS NULL) OR (completed_at >= created_at)) AND ((completed_at IS NULL) OR (started_at IS NULL) OR (completed_at >= started_at)) AND (updated_at >= created_at)))
);
CREATE TABLE public.deployment_verification_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    release_manifest_id uuid NOT NULL,
    environment text NOT NULL,
    phase text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    health_window_seconds integer,
    critical_failures integer DEFAULT 0 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT deployment_verification_runs_environment_check CHECK ((environment = ANY (ARRAY['development'::text, 'staging'::text, 'production'::text]))),
    CONSTRAINT deployment_verification_runs_phase_check CHECK ((phase = ANY (ARRAY['preflight'::text, 'canary'::text, 'stabilization'::text, 'verified'::text, 'rollback'::text]))),
    CONSTRAINT deployment_verification_runs_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'blocked'::text, 'running'::text])))
);
CREATE TABLE public.entitlement_plan_capabilities (
    plan_id uuid NOT NULL,
    capability text NOT NULL,
    quota numeric DEFAULT 0 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT entitlement_plan_capabilities_quota_check CHECK ((quota >= (0)::numeric))
);
CREATE TABLE public.entitlement_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.entitlement_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    capability text NOT NULL,
    quantity numeric NOT NULL,
    billing_period text NOT NULL,
    idempotency_key text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entitlement_usage_events_quantity_check CHECK ((quantity > (0)::numeric))
);
CREATE TABLE public.executive_evidence_graph (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_type text NOT NULL,
    source_key text NOT NULL,
    target_type text NOT NULL,
    target_key text NOT NULL,
    relation text NOT NULL,
    weight numeric DEFAULT 1 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT executive_evidence_graph_relation_check CHECK ((relation = ANY (ARRAY['supports'::text, 'derived_from'::text, 'contradicts'::text, 'causes'::text, 'measures'::text, 'recommends'::text, 'blocks'::text]))),
    CONSTRAINT executive_evidence_graph_weight_check CHECK (((weight >= (0)::numeric) AND (weight <= (1)::numeric)))
);
CREATE TABLE public.executive_kpi_lineage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kpi_key text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    value numeric NOT NULL,
    source_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    transformation_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_hash text NOT NULL,
    quality text NOT NULL,
    CONSTRAINT executive_kpi_lineage_quality_check CHECK ((quality = ANY (ARRAY['verified'::text, 'estimated'::text, 'insufficient'::text])))
);
CREATE TABLE public.file_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_name text NOT NULL,
    file_extension text,
    file_mime text,
    file_size bigint DEFAULT 0,
    file_hash text,
    magic_bytes text,
    detected_format text,
    detected_encoding text,
    security_status text DEFAULT 'pending'::text,
    security_issues jsonb,
    is_duplicate boolean DEFAULT false,
    duplicate_of uuid,
    status text DEFAULT 'uploaded'::text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);
COMMENT ON TABLE public.file_records IS 'File Intelligence metadata; anonymous direct CRUD is prohibited.';
CREATE TABLE public.forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    entity_name text,
    metric text NOT NULL,
    period date NOT NULL,
    forecast_value numeric(18,3),
    lower_bound numeric(18,3),
    upper_bound numeric(18,3),
    model_name text,
    quality_score numeric(5,2),
    confidence text DEFAULT 'FORECAST'::text,
    data_points integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.governance_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    alert_key text NOT NULL,
    severity text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    reason text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT governance_alerts_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT governance_alerts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'suppressed'::text])))
);
CREATE TABLE public.governance_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    policy_key text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT governance_policies_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text, 'blocked'::text])))
);
CREATE TABLE public.governed_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    scenario_key text NOT NULL,
    assumptions jsonb DEFAULT '{}'::jsonb NOT NULL,
    outputs jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric,
    risk_score numeric,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT governed_scenarios_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT governed_scenarios_risk_score_check CHECK ((risk_score >= (0)::numeric)),
    CONSTRAINT governed_scenarios_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'simulated'::text, 'approved'::text, 'blocked'::text, 'expired'::text])))
);
CREATE TABLE public.human_override_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    decision_key text NOT NULL,
    original_status text NOT NULL,
    override_status text NOT NULL,
    reason text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    learned_signal jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.import_field_lineage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    job_row_id uuid,
    source_field text NOT NULL,
    source_locator text,
    canonical_field text NOT NULL,
    target_table text,
    target_column text,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(5,4),
    decision text DEFAULT 'review'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_field_lineage_confidence_range CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT import_field_lineage_decision_valid CHECK ((decision = ANY (ARRAY['approved'::text, 'review'::text, 'quarantine'::text, 'rejected'::text])))
);
COMMENT ON TABLE public.import_field_lineage IS 'Durable field-level provenance for governed imports; every approved mapping must retain evidence and confidence.';
CREATE TABLE public.import_job_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    row_number integer NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    source_data jsonb,
    mapped_data jsonb,
    target_table text,
    target_id uuid,
    error_message text,
    error_type text,
    lineage jsonb,
    created_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL
);
COMMENT ON COLUMN public.import_job_rows.company_id IS 'Denormalized tenant key used to enforce database-level job/row isolation.';
CREATE TABLE public.import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_record_id uuid,
    profile_id uuid,
    job_type text DEFAULT 'import'::text,
    status text DEFAULT 'queued'::text NOT NULL,
    processing_mode text DEFAULT 'import'::text,
    total_rows integer DEFAULT 0,
    processed_rows integer DEFAULT 0,
    valid_rows integer DEFAULT 0,
    invalid_rows integer DEFAULT 0,
    quarantined_rows integer DEFAULT 0,
    duplicate_rows integer DEFAULT 0,
    progress integer DEFAULT 0,
    speed_rows_per_sec integer DEFAULT 0,
    eta_seconds integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_ms bigint DEFAULT 0,
    error_message text,
    result_summary jsonb,
    created_at timestamp with time zone DEFAULT now(),
    idempotency_key text,
    source_fingerprint text,
    entity_type text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.import_jobs IS 'Import lifecycle; anonymous direct CRUD is prohibited.';
COMMENT ON COLUMN public.import_jobs.idempotency_key IS 'Caller/source supplied key used to prevent duplicate import execution within a company.';
COMMENT ON COLUMN public.import_jobs.source_fingerprint IS 'Stable source fingerprint used to detect replayed input independently of filename.';
CREATE TABLE public.import_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    entity_type text NOT NULL,
    target_table text NOT NULL,
    required_fields jsonb DEFAULT '[]'::jsonb,
    optional_fields jsonb DEFAULT '[]'::jsonb,
    matching_keys jsonb DEFAULT '[]'::jsonb,
    field_mappings jsonb DEFAULT '{}'::jsonb,
    conflict_resolution text DEFAULT 'skip'::text,
    null_policy text DEFAULT 'reject'::text,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.import_rows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    raw_data jsonb,
    mapped_data jsonb,
    error_message text,
    error_type text,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.import_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid,
    table_name text NOT NULL,
    row_count integer DEFAULT 0,
    snapshot_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.imports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_name text NOT NULL,
    file_hash text,
    file_size bigint DEFAULT 0,
    source_type text DEFAULT 'csv'::text,
    status text DEFAULT 'pending'::text NOT NULL,
    total_rows integer DEFAULT 0,
    valid_rows integer DEFAULT 0,
    invalid_rows integer DEFAULT 0,
    quarantined_rows integer DEFAULT 0,
    entity_type text,
    profile_name text,
    progress integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    file_fingerprint_id uuid,
    processing_mode text DEFAULT 'import'::text,
    profile_id uuid
);
CREATE TABLE public.incident_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    incident_key text NOT NULL,
    severity text NOT NULL,
    status text NOT NULL,
    detected_at timestamp with time zone NOT NULL,
    mitigated_at timestamp with time zone,
    resolved_at timestamp with time zone,
    root_cause text,
    impact jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT incident_evidence_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT incident_evidence_status_check CHECK ((status = ANY (ARRAY['open'::text, 'mitigated'::text, 'resolved'::text, 'closed'::text])))
);
CREATE TABLE public.incident_regression_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    incident_key text NOT NULL,
    regression_key text NOT NULL,
    test_path text NOT NULL,
    status text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT incident_regression_links_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'implemented'::text, 'verified'::text, 'failed'::text])))
);
CREATE TABLE public.intelligence_quality_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    domain text NOT NULL,
    data_quality numeric NOT NULL,
    model_quality numeric NOT NULL,
    evidence_quality numeric NOT NULL,
    composite_score numeric NOT NULL,
    status text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT intelligence_quality_scores_composite_score_check CHECK (((composite_score >= (0)::numeric) AND (composite_score <= (1)::numeric))),
    CONSTRAINT intelligence_quality_scores_data_quality_check CHECK (((data_quality >= (0)::numeric) AND (data_quality <= (1)::numeric))),
    CONSTRAINT intelligence_quality_scores_evidence_quality_check CHECK (((evidence_quality >= (0)::numeric) AND (evidence_quality <= (1)::numeric))),
    CONSTRAINT intelligence_quality_scores_model_quality_check CHECK (((model_quality >= (0)::numeric) AND (model_quality <= (1)::numeric))),
    CONSTRAINT intelligence_quality_scores_status_check CHECK ((status = ANY (ARRAY['trusted'::text, 'degraded'::text, 'blocked'::text])))
);
CREATE TABLE public.intelligence_safety_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    domain text NOT NULL,
    previous_threshold numeric NOT NULL,
    adjusted_threshold numeric NOT NULL,
    reason text NOT NULL,
    outcome_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.inventory_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    warehouse_id uuid,
    product_id uuid NOT NULL,
    quantity numeric(18,3) DEFAULT 0 NOT NULL,
    unit_cost numeric(18,3) DEFAULT 0,
    last_movement_date date,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inventory_balances_last_movement_not_future CHECK (((last_movement_date IS NULL) OR (last_movement_date <= CURRENT_DATE))),
    CONSTRAINT inventory_balances_quantity_nonnegative CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT inventory_balances_unit_cost_nonnegative CHECK ((unit_cost >= (0)::numeric))
);
CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    warehouse_id uuid,
    product_id uuid NOT NULL,
    movement_type text DEFAULT 'in'::text NOT NULL,
    quantity numeric(18,3) DEFAULT 0 NOT NULL,
    unit_cost numeric(18,3) DEFAULT 0,
    reference_type text,
    reference_id uuid,
    movement_date date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT inventory_movements_date_not_future CHECK ((movement_date <= CURRENT_DATE)),
    CONSTRAINT inventory_movements_quantity_nonnegative CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT inventory_movements_quantity_positive CHECK ((quantity > (0)::numeric)),
    CONSTRAINT inventory_movements_unit_cost_nonnegative CHECK ((unit_cost >= (0)::numeric))
);
CREATE TABLE public.kpi_evidence_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    kpi_key text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    value numeric NOT NULL,
    baseline numeric,
    target numeric,
    variance numeric,
    quality text NOT NULL,
    source_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT kpi_evidence_snapshots_quality_check CHECK ((quality = ANY (ARRAY['verified'::text, 'estimated'::text, 'insufficient'::text])))
);
CREATE TABLE public.metric_governance_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_governance_id uuid NOT NULL,
    company_id uuid,
    metric_id text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_id uuid,
    reason text NOT NULL,
    previous_version integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.operational_health_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    component text NOT NULL,
    status text NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    latency_ms numeric,
    error_rate numeric,
    queue_depth integer,
    stale_jobs integer,
    dead_letter_count integer,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT operational_health_snapshots_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'critical'::text, 'unknown'::text])))
);
CREATE TABLE public.operational_task_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    role text NOT NULL,
    horizon text NOT NULL,
    priority text NOT NULL,
    title text NOT NULL,
    reason text NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    expected_outcome text NOT NULL,
    evidence_required jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    converted_work_item_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    task_key text NOT NULL,
    decision_id uuid,
    CONSTRAINT operational_task_proposals_horizon_check CHECK ((horizon = ANY (ARRAY['today'::text, 'tomorrow'::text]))),
    CONSTRAINT operational_task_proposals_priority_check CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT operational_task_proposals_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'employee'::text, 'sales'::text, 'warehouse'::text, 'accountant'::text, 'purchasing'::text]))),
    CONSTRAINT operational_task_proposals_source_type_check CHECK ((source_type = ANY (ARRAY['recommendation'::text, 'alert'::text, 'forecast'::text, 'kpi'::text]))),
    CONSTRAINT operational_task_proposals_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'accepted'::text, 'dismissed'::text, 'converted'::text])))
);
CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric NOT NULL,
    unit text NOT NULL,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_line_total_nonnegative CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT order_items_quantity_positive CHECK ((quantity > (0)::numeric)),
    CONSTRAINT order_items_unit_price_nonnegative CHECK ((unit_price >= (0)::numeric))
);
CREATE TABLE public.order_outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    order_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone
);
CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    order_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.order_template_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_template_items_quantity_positive CHECK ((quantity > 0))
);
CREATE TABLE public.order_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    name text NOT NULL,
    branch_label text DEFAULT 'الرئيسي'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_templates_name_length CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
);
ALTER TABLE public.orders ALTER COLUMN order_number ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_order_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    direction text DEFAULT 'in'::text NOT NULL,
    customer_id uuid,
    supplier_id uuid,
    invoice_id uuid,
    amount numeric(18,3) DEFAULT 0 NOT NULL,
    payment_date date NOT NULL,
    method text DEFAULT 'cash'::text,
    reference text,
    currency text DEFAULT 'SAR'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT payments_amount_nonnegative CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payments_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_currency_nonblank CHECK (((currency IS NOT NULL) AND (btrim(currency) <> ''::text))),
    CONSTRAINT payments_date_not_future CHECK ((payment_date <= CURRENT_DATE)),
    CONSTRAINT payments_direction_valid CHECK ((direction = ANY (ARRAY['IN'::text, 'OUT'::text, 'in'::text, 'out'::text])))
);
CREATE TABLE public.production_certification_bundles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    bundle_key text NOT NULL,
    release_ref text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    tenant_isolation_passed boolean DEFAULT false NOT NULL,
    storage_passed boolean DEFAULT false NOT NULL,
    realtime_passed boolean DEFAULT false NOT NULL,
    ai_isolation_passed boolean DEFAULT false NOT NULL,
    backup_restore_passed boolean DEFAULT false NOT NULL,
    migration_parity_passed boolean DEFAULT false NOT NULL,
    artifact_integrity_passed boolean DEFAULT false NOT NULL,
    rollback_passed boolean DEFAULT false NOT NULL,
    security_audit_passed boolean DEFAULT false NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    certified_at timestamp with time zone,
    CONSTRAINT production_certification_bundles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'blocked'::text, 'passed'::text, 'failed'::text])))
);
COMMENT ON TABLE public.production_certification_bundles IS 'Release-control evidence. Authenticated clients are read-only; trusted automation persists certification evidence.';
CREATE TABLE public.production_rollback_drills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    drill_key text NOT NULL,
    release_ref text NOT NULL,
    target text NOT NULL,
    status text DEFAULT 'planned'::text NOT NULL,
    pre_state_hash text,
    rollback_state_hash text,
    forward_fix_verified boolean DEFAULT false NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    CONSTRAINT production_rollback_drills_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'running'::text, 'passed'::text, 'failed'::text, 'blocked'::text])))
);
COMMENT ON TABLE public.production_rollback_drills IS 'Release-control recovery evidence. Authenticated clients are read-only; trusted automation persists drill evidence.';
CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    category_id uuid,
    sku text NOT NULL,
    name text NOT NULL,
    barcode text,
    unit text DEFAULT 'قطعة'::text NOT NULL,
    cost_price numeric(18,3) DEFAULT 0,
    selling_price numeric(18,3) DEFAULT 0,
    min_stock numeric(18,3) DEFAULT 0,
    reorder_point numeric(18,3) DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    customer_id uuid,
    role text DEFAULT 'customer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.purchase_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    status text DEFAULT 'confirmed'::text NOT NULL,
    subtotal numeric(18,3) DEFAULT 0,
    discount_amount numeric(18,3) DEFAULT 0,
    tax_amount numeric(18,3) DEFAULT 0,
    total numeric(18,3) DEFAULT 0,
    paid_amount numeric(18,3) DEFAULT 0,
    currency text DEFAULT 'SAR'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT purchase_invoices_currency_nonblank CHECK (((currency IS NOT NULL) AND (btrim(currency) <> ''::text))),
    CONSTRAINT purchase_invoices_discount_nonnegative CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchase_invoices_nonnegative_amounts CHECK (((COALESCE(subtotal, (0)::numeric) >= (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(tax_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(total, (0)::numeric) >= (0)::numeric) AND (COALESCE(paid_amount, (0)::numeric) >= (0)::numeric))),
    CONSTRAINT purchase_invoices_paid_nonnegative CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT purchase_invoices_subtotal_nonnegative CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_invoices_tax_nonnegative CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_invoices_total_nonnegative CHECK ((total >= (0)::numeric))
);
CREATE TABLE public.purchase_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    product_id uuid,
    description text,
    quantity numeric(18,3) DEFAULT 0 NOT NULL,
    unit_price numeric(18,3) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,3) DEFAULT 0,
    tax_amount numeric(18,3) DEFAULT 0,
    line_total numeric(18,3) DEFAULT 0,
    company_id uuid,
    CONSTRAINT purchase_items_discount_nonnegative CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT purchase_items_line_total_nonnegative CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT purchase_items_nonnegative_amounts CHECK (((COALESCE(unit_price, (0)::numeric) >= (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(tax_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(line_total, (0)::numeric) >= (0)::numeric))),
    CONSTRAINT purchase_items_quantity_nonnegative CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT purchase_items_tax_nonnegative CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT purchase_items_unit_price_nonnegative CHECK ((unit_price >= (0)::numeric))
);
CREATE TABLE public.recommendation_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    recommendation_key text NOT NULL,
    decision_id uuid,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    expected_impact numeric,
    actual_impact numeric,
    outcome_quality numeric,
    status text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    observed_by uuid,
    CONSTRAINT recommendation_outcome_evidence_object CHECK ((jsonb_typeof(evidence) = 'object'::text)),
    CONSTRAINT recommendation_outcomes_outcome_quality_check CHECK (((outcome_quality >= (0)::numeric) AND (outcome_quality <= (1)::numeric))),
    CONSTRAINT recommendation_outcomes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'positive'::text, 'neutral'::text, 'negative'::text, 'insufficient'::text])))
);
CREATE TABLE public.recommendations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    category text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    title text NOT NULL,
    description text,
    evidence jsonb,
    expected_impact numeric(18,3),
    confidence text DEFAULT 'CALCULATED'::text,
    status text DEFAULT 'new'::text NOT NULL,
    owner text,
    deadline date,
    impact_result text,
    impact_measured_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    decision_id uuid,
    evidence_snapshot_id uuid,
    metric_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT recommendations_evidence_object CHECK (((evidence IS NOT NULL) AND (jsonb_typeof(evidence) = 'object'::text)))
);
CREATE TABLE public.release_evidence_manifests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    release_key text NOT NULL,
    source_sha text NOT NULL,
    migrations_fingerprint text NOT NULL,
    dependency_lock_fingerprint text NOT NULL,
    artifact_fingerprint text NOT NULL,
    trust_certificate_id uuid,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    rollback_at timestamp with time zone,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    migration_fingerprint text,
    dependency_fingerprint text,
    certification_id uuid,
    CONSTRAINT release_evidence_manifests_status_check CHECK ((status = ANY (ARRAY['candidate'::text, 'canary'::text, 'verified'::text, 'blocked'::text, 'rolled_back'::text])))
);
CREATE TABLE public.report_consolidation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    business_key text NOT NULL,
    source_version_id uuid NOT NULL,
    precedence_rank integer NOT NULL,
    selected boolean DEFAULT false NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT report_consolidation_items_precedence_rank_check CHECK ((precedence_rank >= 0))
);
CREATE TABLE public.report_consolidation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_key text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    as_of timestamp with time zone DEFAULT now() NOT NULL,
    source_precedence jsonb DEFAULT '[]'::jsonb NOT NULL,
    checkpoint jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT report_consolidation_runs_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'running'::text, 'completed'::text, 'blocked'::text, 'failed'::text])))
);
CREATE TABLE public.report_delivery_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    channel text NOT NULL,
    destination text,
    status text NOT NULL,
    provider_message_id text,
    error_message text,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_delivery_receipts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text, 'skipped'::text])))
);
CREATE TABLE public.report_evidence_passports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    report_execution_job_id uuid NOT NULL,
    source_version_id uuid,
    evidence_snapshot_id uuid NOT NULL,
    source_hash text NOT NULL,
    acceptance_status text NOT NULL,
    verification_status text NOT NULL,
    decision_readiness text NOT NULL,
    prior_verification_state text,
    lineage jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_evidence_passports_acceptance_status_check CHECK ((acceptance_status = ANY (ARRAY['ACCEPTED'::text, 'REVIEW'::text, 'BLOCKED'::text, 'LEGACY_UNRESOLVED'::text]))),
    CONSTRAINT report_evidence_passports_decision_readiness_check CHECK ((decision_readiness = ANY (ARRAY['READY'::text, 'BLOCKED'::text, 'INSUFFICIENT_SAMPLE'::text, 'REVIEW'::text]))),
    CONSTRAINT report_evidence_passports_verification_status_check CHECK ((verification_status = ANY (ARRAY['VERIFIED'::text, 'UNVERIFIED'::text, 'LEGACY_UNRESOLVED'::text])))
);
CREATE TABLE public.report_evidence_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    report_execution_job_id uuid NOT NULL,
    source_version_id uuid,
    analysis_snapshot_id uuid,
    source_hash text NOT NULL,
    source_path text NOT NULL,
    canonical_commit_count integer DEFAULT 0 NOT NULL,
    canonical_dataset_count integer DEFAULT 0 NOT NULL,
    authoritative_row_count integer,
    canonical_coverage_status text NOT NULL,
    acceptance_status text NOT NULL,
    verification_status text NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    verified_at timestamp with time zone,
    verified_by uuid,
    evidence_fingerprint text NOT NULL,
    lineage jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_evidence_snapshots_acceptance_status_check CHECK ((acceptance_status = ANY (ARRAY['ACCEPTED'::text, 'REVIEW'::text, 'BLOCKED'::text]))),
    CONSTRAINT report_evidence_snapshots_canonical_commit_count_check CHECK ((canonical_commit_count >= 0)),
    CONSTRAINT report_evidence_snapshots_canonical_coverage_status_check CHECK ((canonical_coverage_status = ANY (ARRAY['FULL'::text, 'PARTIAL'::text, 'BLOCKED'::text]))),
    CONSTRAINT report_evidence_snapshots_canonical_dataset_count_check CHECK ((canonical_dataset_count >= 0)),
    CONSTRAINT report_evidence_snapshots_verification_status_check CHECK ((verification_status = ANY (ARRAY['VERIFIED'::text, 'UNVERIFIED'::text, 'LEGACY_UNRESOLVED'::text])))
);
CREATE TABLE public.report_execution_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_key text NOT NULL,
    source_path text NOT NULL,
    source_hash text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    checkpoint jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    last_error jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    lease_token uuid,
    CONSTRAINT report_execution_jobs_attempt_bounds CHECK (((attempt >= 0) AND (max_attempts >= 1) AND (attempt <= max_attempts))),
    CONSTRAINT report_execution_jobs_lease_token_integrity CHECK ((((status = ANY (ARRAY['leased'::text, 'processing'::text])) AND (lease_token IS NOT NULL) AND (lease_owner IS NOT NULL) AND (lease_expires_at IS NOT NULL)) OR (status <> ALL (ARRAY['leased'::text, 'processing'::text])))),
    CONSTRAINT report_execution_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'leased'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'dead_letter'::text])))
);
CREATE TABLE public.report_execution_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    report_execution_job_id uuid NOT NULL,
    task_key text NOT NULL,
    stage text NOT NULL,
    ordinal integer NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    worker_id text,
    attempt integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_error jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_execution_tasks_attempt_check CHECK ((attempt >= 0)),
    CONSTRAINT report_execution_tasks_ordinal_check CHECK (((ordinal >= 1) AND (ordinal <= 9))),
    CONSTRAINT report_execution_tasks_stage_check CHECK ((stage = ANY (ARRAY['queued'::text, 'fingerprinted'::text, 'extracted'::text, 'canonicalized'::text, 'validated'::text, 'analyzed'::text, 'decisioned'::text, 'committed'::text, 'rendered'::text]))),
    CONSTRAINT report_execution_tasks_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);
CREATE TABLE public.report_row_lineage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_version_id uuid NOT NULL,
    row_key text NOT NULL,
    row_hash text NOT NULL,
    prior_row_hash text,
    state text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT report_row_lineage_state_check CHECK ((state = ANY (ARRAY['new'::text, 'changed'::text, 'unchanged'::text, 'deleted'::text, 'quarantined'::text])))
);
CREATE TABLE public.report_run_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    format text NOT NULL,
    storage_ref text NOT NULL,
    mime_type text NOT NULL,
    content_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_run_artifacts_format_check CHECK ((format = ANY (ARRAY['web'::text, 'pdf'::text, 'xlsx'::text])))
);
CREATE TABLE public.report_run_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    status text NOT NULL,
    source_snapshot_id uuid,
    input_fingerprint text NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    output_formats jsonb DEFAULT '[]'::jsonb NOT NULL,
    artifact_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.report_source_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_key text NOT NULL,
    source_path text NOT NULL,
    source_hash text NOT NULL,
    previous_version_id uuid,
    detected_at timestamp with time zone DEFAULT now() NOT NULL,
    change_kind text NOT NULL,
    tombstone boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT report_source_versions_change_kind_check CHECK ((change_kind = ANY (ARRAY['new'::text, 'changed'::text, 'renamed'::text, 'deleted'::text, 'unchanged'::text])))
);
CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    product_id uuid,
    description text,
    quantity numeric(18,3) DEFAULT 0 NOT NULL,
    unit_price numeric(18,3) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,3) DEFAULT 0,
    tax_amount numeric(18,3) DEFAULT 0,
    line_total numeric(18,3) DEFAULT 0,
    cost_price numeric(18,3) DEFAULT 0,
    company_id uuid,
    CONSTRAINT sale_items_cost_price_nonnegative CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT sale_items_discount_nonnegative CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sale_items_line_total_nonnegative CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT sale_items_nonnegative_amounts CHECK (((COALESCE(unit_price, (0)::numeric) >= (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(tax_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(line_total, (0)::numeric) >= (0)::numeric) AND (COALESCE(cost_price, (0)::numeric) >= (0)::numeric))),
    CONSTRAINT sale_items_quantity_nonnegative CHECK ((quantity >= (0)::numeric)),
    CONSTRAINT sale_items_tax_nonnegative CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT sale_items_unit_price_nonnegative CHECK ((unit_price >= (0)::numeric))
);
CREATE TABLE public.sales_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid,
    customer_id uuid NOT NULL,
    invoice_number text NOT NULL,
    invoice_date date NOT NULL,
    due_date date,
    status text DEFAULT 'confirmed'::text NOT NULL,
    subtotal numeric(18,3) DEFAULT 0,
    discount_amount numeric(18,3) DEFAULT 0,
    tax_amount numeric(18,3) DEFAULT 0,
    total numeric(18,3) DEFAULT 0,
    paid_amount numeric(18,3) DEFAULT 0,
    currency text DEFAULT 'SAR'::text,
    sales_rep text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    order_id uuid,
    CONSTRAINT sales_invoices_currency_nonblank CHECK (((currency IS NOT NULL) AND (btrim(currency) <> ''::text))),
    CONSTRAINT sales_invoices_discount_nonnegative CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT sales_invoices_nonnegative_amounts CHECK (((COALESCE(subtotal, (0)::numeric) >= (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(tax_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(total, (0)::numeric) >= (0)::numeric) AND (COALESCE(paid_amount, (0)::numeric) >= (0)::numeric))),
    CONSTRAINT sales_invoices_paid_nonnegative CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT sales_invoices_subtotal_nonnegative CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT sales_invoices_tax_nonnegative CHECK ((tax_amount >= (0)::numeric)),
    CONSTRAINT sales_invoices_total_nonnegative CHECK ((total >= (0)::numeric))
);
CREATE TABLE public.slo_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    service text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    target numeric NOT NULL,
    actual numeric NOT NULL,
    metric text NOT NULL,
    budget_remaining numeric,
    status text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slo_evidence_actual_check CHECK ((actual >= (0)::numeric)),
    CONSTRAINT slo_evidence_status_check CHECK ((status = ANY (ARRAY['pass'::text, 'breach'::text, 'unknown'::text]))),
    CONSTRAINT slo_evidence_target_check CHECK ((target >= (0)::numeric))
);
CREATE TABLE public.source_analysis_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    import_job_id uuid,
    source_hash text NOT NULL,
    source_path text NOT NULL,
    source_format text NOT NULL,
    analysis_status text NOT NULL,
    entity_type text NOT NULL,
    quality_score numeric,
    row_count integer DEFAULT 0 NOT NULL,
    column_count integer DEFAULT 0 NOT NULL,
    datasets jsonb DEFAULT '[]'::jsonb NOT NULL,
    canonical_text text DEFAULT ''::text NOT NULL,
    visual_assets jsonb DEFAULT '[]'::jsonb NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_analysis_snapshots_analysis_status_check CHECK ((analysis_status = ANY (ARRAY['analyzed'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);
CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    phone text,
    email text,
    address text,
    tax_id text,
    payment_terms_days integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.synonym_dictionary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    canonical_field text NOT NULL,
    synonym text NOT NULL,
    language text DEFAULT 'ar'::text,
    confidence numeric(5,2) DEFAULT 100.00,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
COMMENT ON TABLE public.synonym_dictionary IS 'Global curated reference data: authenticated read-only; no anonymous access or client writes.';
CREATE TABLE public.tenant_isolation_canary_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    run_key text NOT NULL,
    status text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    evidence_hash text NOT NULL,
    assertions jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tenant_isolation_canary_runs_status_check CHECK ((status = ANY (ARRAY['passed'::text, 'failed'::text, 'blocked'::text, 'unknown'::text])))
);
CREATE TABLE public.trust_certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    certificate_key text NOT NULL,
    status text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    evidence_hash text NOT NULL,
    blocker_count integer DEFAULT 0 NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT trust_certifications_blocker_count_check CHECK ((blocker_count >= 0)),
    CONSTRAINT trust_certifications_status_check CHECK ((status = ANY (ARRAY['valid'::text, 'expired'::text, 'revoked'::text, 'blocked'::text])))
);
CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    code text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.watched_report_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    relative_path text NOT NULL,
    content_hash text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    modified_at timestamp with time zone,
    state text NOT NULL,
    last_processed_at timestamp with time zone,
    last_successful_checkpoint text,
    last_error text,
    source_version bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT watched_report_files_content_hash_nonblank_check CHECK ((content_hash ~ '[^[:space:]]'::text)),
    CONSTRAINT watched_report_files_relative_path_nonblank_check CHECK ((relative_path ~ '[^[:space:]]'::text)),
    CONSTRAINT watched_report_files_size_bytes_nonnegative_check CHECK ((size_bytes >= 0)),
    CONSTRAINT watched_report_files_source_version_positive_check CHECK ((source_version >= 1)),
    CONSTRAINT watched_report_files_state_check CHECK ((state = ANY (ARRAY['new'::text, 'changed'::text, 'unchanged'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'dead_letter'::text, 'deleted'::text])))
);
CREATE TABLE public.watched_report_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    label text NOT NULL,
    logical_path text,
    enabled boolean DEFAULT true NOT NULL,
    recursive boolean DEFAULT true NOT NULL,
    poll_interval_ms integer DEFAULT 30000 NOT NULL,
    auto_process boolean DEFAULT true NOT NULL,
    process_only_changed_rows boolean DEFAULT true NOT NULL,
    max_concurrent_files integer DEFAULT 2 NOT NULL,
    retry_limit integer DEFAULT 3 NOT NULL,
    accepted_extensions text[] DEFAULT ARRAY['.pdf'::text, '.xlsx'::text, '.xls'::text, '.csv'::text, '.docx'::text, '.doc'::text, '.txt'::text] NOT NULL,
    last_scan_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT watched_report_folders_max_concurrent_files_check CHECK (((max_concurrent_files >= 1) AND (max_concurrent_files <= 8))),
    CONSTRAINT watched_report_folders_poll_interval_ms_check CHECK ((poll_interval_ms >= 1000)),
    CONSTRAINT watched_report_folders_retry_limit_check CHECK (((retry_limit >= 1) AND (retry_limit <= 10)))
);
ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.alternative_item_group_members
    ADD CONSTRAINT alternative_item_group_members_company_id_group_id_sku_key UNIQUE (company_id, group_id, sku);
ALTER TABLE ONLY public.alternative_item_group_members
    ADD CONSTRAINT alternative_item_group_members_company_id_sku_key UNIQUE (company_id, sku);
ALTER TABLE ONLY public.alternative_item_group_members
    ADD CONSTRAINT alternative_item_group_members_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.alternative_item_groups
    ADD CONSTRAINT alternative_item_groups_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.anomaly_correlations
    ADD CONSTRAINT anomaly_correlations_company_id_correlation_key_key UNIQUE (company_id, correlation_key);
ALTER TABLE ONLY public.anomaly_correlations
    ADD CONSTRAINT anomaly_correlations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.artifact_verification_runs
    ADD CONSTRAINT artifact_verification_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.automation_execution_receipts
    ADD CONSTRAINT automation_execution_receipts_company_id_idempotency_key_key UNIQUE (company_id, idempotency_key);
ALTER TABLE ONLY public.automation_execution_receipts
    ADD CONSTRAINT automation_execution_receipts_company_id_receipt_id_key UNIQUE (company_id, receipt_id);
ALTER TABLE ONLY public.automation_execution_receipts
    ADD CONSTRAINT automation_execution_receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.automation_remediation_runs
    ADD CONSTRAINT automation_remediation_runs_company_id_idempotency_key_key UNIQUE (company_id, idempotency_key);
ALTER TABLE ONLY public.automation_remediation_runs
    ADD CONSTRAINT automation_remediation_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.autonomy_certification_evidence
    ADD CONSTRAINT autonomy_certification_eviden_company_id_certification_key__key UNIQUE (company_id, certification_key, gate_key);
ALTER TABLE ONLY public.autonomy_certification_evidence
    ADD CONSTRAINT autonomy_certification_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.autonomy_certification_runs
    ADD CONSTRAINT autonomy_certification_runs_company_id_certification_key_key UNIQUE (company_id, certification_key);
ALTER TABLE ONLY public.autonomy_certification_runs
    ADD CONSTRAINT autonomy_certification_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.autonomy_domain_controls
    ADD CONSTRAINT autonomy_domain_controls_company_id_domain_key_key UNIQUE (company_id, domain_key);
ALTER TABLE ONLY public.autonomy_domain_controls
    ADD CONSTRAINT autonomy_domain_controls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.autonomy_rollback_drills
    ADD CONSTRAINT autonomy_rollback_drills_company_id_drill_key_key UNIQUE (company_id, drill_key);
ALTER TABLE ONLY public.autonomy_rollback_drills
    ADD CONSTRAINT autonomy_rollback_drills_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.backup_verification_runs
    ADD CONSTRAINT backup_verification_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_provider_provider_invoice_id_key UNIQUE (provider, provider_invoice_id);
ALTER TABLE ONLY public.billing_liveness_probes
    ADD CONSTRAINT billing_liveness_probes_company_id_probe_key_key UNIQUE (company_id, probe_key);
ALTER TABLE ONLY public.billing_liveness_probes
    ADD CONSTRAINT billing_liveness_probes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_plan_capabilities
    ADD CONSTRAINT billing_plan_capabilities_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_plan_capabilities
    ADD CONSTRAINT billing_plan_capabilities_plan_id_capability_key UNIQUE (plan_id, capability);
ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_code_key UNIQUE (code);
ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_subscription_events
    ADD CONSTRAINT billing_subscription_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_subscription_events
    ADD CONSTRAINT billing_subscription_events_provider_provider_event_id_key UNIQUE (provider, provider_event_id);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_company_id_key UNIQUE (company_id);
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_usage_events
    ADD CONSTRAINT billing_usage_events_company_id_period_start_idempotency_ke_key UNIQUE (company_id, period_start, idempotency_key);
ALTER TABLE ONLY public.billing_usage_events
    ADD CONSTRAINT billing_usage_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_provider_event_id_key UNIQUE (provider, event_id);
ALTER TABLE ONLY public.bounded_scenario_runs
    ADD CONSTRAINT bounded_scenario_runs_company_id_scenario_key_key UNIQUE (company_id, scenario_key);
ALTER TABLE ONLY public.bounded_scenario_runs
    ADD CONSTRAINT bounded_scenario_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_id_company_unique UNIQUE (id, company_id);
ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.business_intelligence_decisions
    ADD CONSTRAINT business_intelligence_decisions_company_id_decision_key_key UNIQUE (company_id, decision_key);
ALTER TABLE ONLY public.business_intelligence_decisions
    ADD CONSTRAINT business_intelligence_decisions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.business_risk_budgets
    ADD CONSTRAINT business_risk_budgets_company_id_budget_key_key UNIQUE (company_id, budget_key);
ALTER TABLE ONLY public.business_risk_budgets
    ADD CONSTRAINT business_risk_budgets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.business_state_snapshots
    ADD CONSTRAINT business_state_snapshots_company_id_snapshot_key_key UNIQUE (company_id, snapshot_key);
ALTER TABLE ONLY public.business_state_snapshots
    ADD CONSTRAINT business_state_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.canonical_dataset_records
    ADD CONSTRAINT canonical_dataset_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.canonical_dataset_records
    ADD CONSTRAINT canonical_dataset_records_unique_source_row UNIQUE (company_id, source_hash, row_number);
ALTER TABLE ONLY public.canonical_import_commits
    ADD CONSTRAINT canonical_import_commits_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.canonical_import_repair_history
    ADD CONSTRAINT canonical_import_repair_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.canonical_text_artifacts
    ADD CONSTRAINT canonical_text_artifacts_company_id_source_hash_text_hash_p_key UNIQUE (company_id, source_hash, text_hash, processing_version);
ALTER TABLE ONLY public.canonical_text_artifacts
    ADD CONSTRAINT canonical_text_artifacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_company_id_source_hash_key UNIQUE (company_id, source_hash);
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_product_id_key UNIQUE (cart_id, product_id);
ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_company_id_user_id_key UNIQUE (company_id, user_id);
ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.client_ui_settings
    ADD CONSTRAINT client_ui_settings_organization_id_key UNIQUE (organization_id);
ALTER TABLE ONLY public.client_ui_settings
    ADD CONSTRAINT client_ui_settings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_entitlements
    ADD CONSTRAINT company_entitlements_pkey PRIMARY KEY (company_id);
ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_company_id_user_id_key UNIQUE (company_id, user_id);
ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.control_plane_drift_events
    ADD CONSTRAINT control_plane_drift_events_company_id_drift_key_key UNIQUE (company_id, drift_key);
ALTER TABLE ONLY public.control_plane_drift_events
    ADD CONSTRAINT control_plane_drift_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.control_plane_health_snapshots
    ADD CONSTRAINT control_plane_health_snapshots_company_id_observed_at_key UNIQUE (company_id, observed_at);
ALTER TABLE ONLY public.control_plane_health_snapshots
    ADD CONSTRAINT control_plane_health_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.control_plane_optimization_runs
    ADD CONSTRAINT control_plane_optimization_runs_company_id_run_key_key UNIQUE (company_id, run_key);
ALTER TABLE ONLY public.control_plane_optimization_runs
    ADD CONSTRAINT control_plane_optimization_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_credit_accounts
    ADD CONSTRAINT customer_credit_accounts_customer_id_key UNIQUE (customer_id);
ALTER TABLE ONLY public.customer_credit_accounts
    ADD CONSTRAINT customer_credit_accounts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_invitations
    ADD CONSTRAINT customer_invitations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_invitations
    ADD CONSTRAINT customer_invitations_token_hash_key UNIQUE (token_hash);
ALTER TABLE ONLY public.customer_ledger_entries
    ADD CONSTRAINT customer_ledger_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customer_price_tiers
    ADD CONSTRAINT customer_price_tiers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.data_quality_reports
    ADD CONSTRAINT data_quality_reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_action_receipts
    ADD CONSTRAINT decision_action_receipts_company_id_idempotency_key_key UNIQUE (company_id, idempotency_key);
ALTER TABLE ONLY public.decision_action_receipts
    ADD CONSTRAINT decision_action_receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_approvals
    ADD CONSTRAINT decision_approvals_company_id_decision_id_key UNIQUE (company_id, decision_id);
ALTER TABLE ONLY public.decision_approvals
    ADD CONSTRAINT decision_approvals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_graph_edges
    ADD CONSTRAINT decision_graph_edges_company_id_decision_key_from_node_to_n_key UNIQUE (company_id, decision_key, from_node, to_node, relation);
ALTER TABLE ONLY public.decision_graph_edges
    ADD CONSTRAINT decision_graph_edges_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_graph_nodes
    ADD CONSTRAINT decision_graph_nodes_company_id_decision_key_node_key_key UNIQUE (company_id, decision_key, node_key);
ALTER TABLE ONLY public.decision_graph_nodes
    ADD CONSTRAINT decision_graph_nodes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_company_id_decision_fingerprint_observed__key UNIQUE (company_id, decision_fingerprint, observed_at);
ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_portfolio_items
    ADD CONSTRAINT decision_portfolio_items_company_id_decision_key_key UNIQUE (company_id, decision_key);
ALTER TABLE ONLY public.decision_portfolio_items
    ADD CONSTRAINT decision_portfolio_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.decision_work_items
    ADD CONSTRAINT decision_work_items_company_id_decision_id_title_key UNIQUE (company_id, decision_id, title);
ALTER TABLE ONLY public.decision_work_items
    ADD CONSTRAINT decision_work_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.deployment_verification_runs
    ADD CONSTRAINT deployment_verification_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.entitlement_plan_capabilities
    ADD CONSTRAINT entitlement_plan_capabilities_pkey PRIMARY KEY (plan_id, capability);
ALTER TABLE ONLY public.entitlement_plans
    ADD CONSTRAINT entitlement_plans_code_key UNIQUE (code);
ALTER TABLE ONLY public.entitlement_plans
    ADD CONSTRAINT entitlement_plans_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.entitlement_usage_events
    ADD CONSTRAINT entitlement_usage_events_company_id_billing_period_idempote_key UNIQUE (company_id, billing_period, idempotency_key);
ALTER TABLE ONLY public.entitlement_usage_events
    ADD CONSTRAINT entitlement_usage_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.executive_evidence_graph
    ADD CONSTRAINT executive_evidence_graph_company_id_source_type_source_key__key UNIQUE (company_id, source_type, source_key, target_type, target_key, relation);
ALTER TABLE ONLY public.executive_evidence_graph
    ADD CONSTRAINT executive_evidence_graph_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.executive_kpi_lineage
    ADD CONSTRAINT executive_kpi_lineage_company_id_kpi_key_observed_at_key UNIQUE (company_id, kpi_key, observed_at);
ALTER TABLE ONLY public.executive_kpi_lineage
    ADD CONSTRAINT executive_kpi_lineage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.file_records
    ADD CONSTRAINT file_records_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.forecasts
    ADD CONSTRAINT forecasts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.governance_alerts
    ADD CONSTRAINT governance_alerts_company_id_alert_key_key UNIQUE (company_id, alert_key);
ALTER TABLE ONLY public.governance_alerts
    ADD CONSTRAINT governance_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT governance_policies_company_id_policy_key_version_key UNIQUE (company_id, policy_key, version);
ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT governance_policies_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.governed_scenarios
    ADD CONSTRAINT governed_scenarios_company_id_scenario_key_key UNIQUE (company_id, scenario_key);
ALTER TABLE ONLY public.governed_scenarios
    ADD CONSTRAINT governed_scenarios_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.human_override_feedback
    ADD CONSTRAINT human_override_feedback_company_id_decision_key_created_at_key UNIQUE (company_id, decision_key, created_at);
ALTER TABLE ONLY public.human_override_feedback
    ADD CONSTRAINT human_override_feedback_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_job_rows
    ADD CONSTRAINT import_job_rows_id_company_unique UNIQUE (id, company_id);
ALTER TABLE ONLY public.import_job_rows
    ADD CONSTRAINT import_job_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_id_company_unique UNIQUE (id, company_id);
ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.import_snapshots
    ADD CONSTRAINT import_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.incident_evidence
    ADD CONSTRAINT incident_evidence_company_id_incident_key_key UNIQUE (company_id, incident_key);
ALTER TABLE ONLY public.incident_evidence
    ADD CONSTRAINT incident_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.incident_regression_links
    ADD CONSTRAINT incident_regression_links_company_id_incident_key_regressio_key UNIQUE (company_id, incident_key, regression_key);
ALTER TABLE ONLY public.incident_regression_links
    ADD CONSTRAINT incident_regression_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.intelligence_quality_scores
    ADD CONSTRAINT intelligence_quality_scores_company_id_domain_observed_at_key UNIQUE (company_id, domain, observed_at);
ALTER TABLE ONLY public.intelligence_quality_scores
    ADD CONSTRAINT intelligence_quality_scores_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.intelligence_safety_adjustments
    ADD CONSTRAINT intelligence_safety_adjustmen_company_id_domain_effective_a_key UNIQUE (company_id, domain, effective_at);
ALTER TABLE ONLY public.intelligence_safety_adjustments
    ADD CONSTRAINT intelligence_safety_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_warehouse_id_product_id_key UNIQUE (warehouse_id, product_id);
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.kpi_evidence_snapshots
    ADD CONSTRAINT kpi_evidence_snapshots_company_id_kpi_key_observed_at_key UNIQUE (company_id, kpi_key, observed_at);
ALTER TABLE ONLY public.kpi_evidence_snapshots
    ADD CONSTRAINT kpi_evidence_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.metric_governance_audit
    ADD CONSTRAINT metric_governance_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.metric_governance
    ADD CONSTRAINT metric_governance_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.operational_health_snapshots
    ADD CONSTRAINT operational_health_snapshots_company_id_component_observed__key UNIQUE (company_id, component, observed_at);
ALTER TABLE ONLY public.operational_health_snapshots
    ADD CONSTRAINT operational_health_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.operational_task_proposals
    ADD CONSTRAINT operational_task_proposals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_outbox_events
    ADD CONSTRAINT order_outbox_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_template_items
    ADD CONSTRAINT order_template_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_templates
    ADD CONSTRAINT order_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.production_certification_bundles
    ADD CONSTRAINT production_certification_bundles_company_id_bundle_key_key UNIQUE (company_id, bundle_key);
ALTER TABLE ONLY public.production_certification_bundles
    ADD CONSTRAINT production_certification_bundles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.production_rollback_drills
    ADD CONSTRAINT production_rollback_drills_company_id_drill_key_key UNIQUE (company_id, drill_key);
ALTER TABLE ONLY public.production_rollback_drills
    ADD CONSTRAINT production_rollback_drills_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE ONLY public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recommendation_outcomes
    ADD CONSTRAINT recommendation_outcomes_company_id_recommendation_key_key UNIQUE (company_id, recommendation_key);
ALTER TABLE ONLY public.recommendation_outcomes
    ADD CONSTRAINT recommendation_outcomes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.release_evidence_manifests
    ADD CONSTRAINT release_evidence_manifests_company_id_release_key_key UNIQUE (company_id, release_key);
ALTER TABLE ONLY public.release_evidence_manifests
    ADD CONSTRAINT release_evidence_manifests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_consolidation_items
    ADD CONSTRAINT report_consolidation_items_company_id_run_id_business_key_s_key UNIQUE (company_id, run_id, business_key, source_version_id);
ALTER TABLE ONLY public.report_consolidation_items
    ADD CONSTRAINT report_consolidation_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_consolidation_runs
    ADD CONSTRAINT report_consolidation_runs_company_id_run_key_key UNIQUE (company_id, run_key);
ALTER TABLE ONLY public.report_consolidation_runs
    ADD CONSTRAINT report_consolidation_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_delivery_receipts
    ADD CONSTRAINT report_delivery_receipts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_company_id_report_execution_job_i_key UNIQUE (company_id, report_execution_job_id, source_hash);
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_company_id_evidence_fingerprint_key UNIQUE (company_id, evidence_fingerprint);
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_execution_jobs
    ADD CONSTRAINT report_execution_jobs_company_id_job_key_key UNIQUE (company_id, job_key);
ALTER TABLE ONLY public.report_execution_jobs
    ADD CONSTRAINT report_execution_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_execution_tasks
    ADD CONSTRAINT report_execution_tasks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_row_lineage
    ADD CONSTRAINT report_row_lineage_company_id_source_version_id_row_key_key UNIQUE (company_id, source_version_id, row_key);
ALTER TABLE ONLY public.report_row_lineage
    ADD CONSTRAINT report_row_lineage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_run_artifacts
    ADD CONSTRAINT report_run_artifacts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_run_artifacts
    ADD CONSTRAINT report_run_artifacts_run_id_format_key UNIQUE (run_id, format);
ALTER TABLE ONLY public.report_run_evidence
    ADD CONSTRAINT report_run_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_runs
    ADD CONSTRAINT report_runs_company_id_idempotency_key_key UNIQUE (company_id, idempotency_key);
ALTER TABLE ONLY public.report_runs
    ADD CONSTRAINT report_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.report_source_versions
    ADD CONSTRAINT report_source_versions_company_id_source_key_source_hash_key UNIQUE (company_id, source_key, source_hash);
ALTER TABLE ONLY public.report_source_versions
    ADD CONSTRAINT report_source_versions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_company_id_id_key UNIQUE (company_id, id);
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.slo_evidence
    ADD CONSTRAINT slo_evidence_company_id_service_metric_window_start_window__key UNIQUE (company_id, service, metric, window_start, window_end);
ALTER TABLE ONLY public.slo_evidence
    ADD CONSTRAINT slo_evidence_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.source_analysis_snapshots
    ADD CONSTRAINT source_analysis_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.synonym_dictionary
    ADD CONSTRAINT synonym_dictionary_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.tenant_isolation_canary_runs
    ADD CONSTRAINT tenant_isolation_canary_runs_company_id_run_key_key UNIQUE (company_id, run_key);
ALTER TABLE ONLY public.tenant_isolation_canary_runs
    ADD CONSTRAINT tenant_isolation_canary_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.trust_certifications
    ADD CONSTRAINT trust_certifications_company_id_certificate_key_key UNIQUE (company_id, certificate_key);
ALTER TABLE ONLY public.trust_certifications
    ADD CONSTRAINT trust_certifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.watched_report_files
    ADD CONSTRAINT watched_report_files_company_id_folder_id_relative_path_key UNIQUE (company_id, folder_id, relative_path);
ALTER TABLE ONLY public.watched_report_files
    ADD CONSTRAINT watched_report_files_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.watched_report_folders
    ADD CONSTRAINT watched_report_folders_company_id_label_key UNIQUE (company_id, label);
ALTER TABLE ONLY public.watched_report_folders
    ADD CONSTRAINT watched_report_folders_pkey PRIMARY KEY (id);
CREATE INDEX billing_plan_capabilities_plan_idx ON public.billing_plan_capabilities USING btree (plan_id);
CREATE INDEX billing_subscription_events_company_time_idx ON public.billing_subscription_events USING btree (company_id, occurred_at DESC);
CREATE INDEX billing_subscriptions_company_status_idx ON public.billing_subscriptions USING btree (company_id, status);
CREATE INDEX billing_usage_events_company_capability_period_idx ON public.billing_usage_events USING btree (company_id, capability, period_start);
CREATE INDEX canonical_dataset_records_company_domain_idx ON public.canonical_dataset_records USING btree (company_id, semantic_domain);
CREATE INDEX canonical_dataset_records_company_source_idx ON public.canonical_dataset_records USING btree (company_id, source_hash);
CREATE INDEX canonical_dataset_records_import_job_idx ON public.canonical_dataset_records USING btree (import_job_id);
CREATE UNIQUE INDEX canonical_import_commits_company_entity_hash_key ON public.canonical_import_commits USING btree (company_id, entity_type, source_hash);
CREATE UNIQUE INDEX decisions_company_recommendation_unique_idx ON public.business_intelligence_decisions USING btree (company_id, recommendation_id) WHERE (recommendation_id IS NOT NULL);
CREATE INDEX idx_alerts_company_read ON public.alerts USING btree (company_id, is_read);
CREATE INDEX idx_alt_group_members_company ON public.alternative_item_group_members USING btree (company_id, group_id);
CREATE INDEX idx_alt_group_members_sku ON public.alternative_item_group_members USING btree (company_id, sku);
CREATE INDEX idx_alt_groups_company ON public.alternative_item_groups USING btree (company_id, is_active);
CREATE INDEX idx_audit_company ON public.audit_logs USING btree (company_id, created_at);
CREATE INDEX idx_automation_receipts_decision ON public.automation_execution_receipts USING btree (company_id, decision_fingerprint, created_at DESC);
CREATE INDEX idx_autonomy_certification_evidence ON public.autonomy_certification_evidence USING btree (company_id, certification_key, passed);
CREATE INDEX idx_backup_verification_latest ON public.backup_verification_runs USING btree (company_id, verified_at DESC);
CREATE INDEX idx_bi_decisions_company_recommendation ON public.business_intelligence_decisions USING btree (company_id, recommendation_id);
CREATE INDEX idx_bi_decisions_operational ON public.business_intelligence_decisions USING btree (company_id, status, created_at DESC);
CREATE INDEX idx_business_state_latest ON public.business_state_snapshots USING btree (company_id, observed_at DESC);
CREATE INDEX idx_canonical_text_provenance_company_hash ON public.canonical_text_provenance USING btree (company_id, source_hash);
CREATE INDEX idx_canonical_text_provenance_source ON public.canonical_text_provenance USING btree (company_id, source_type, extracted_at DESC);
CREATE INDEX idx_canonical_text_source ON public.canonical_text_artifacts USING btree (company_id, source_version_id, created_at DESC);
CREATE INDEX idx_cart_items_product_id_fk ON public.cart_items USING btree (product_id);
CREATE INDEX idx_carts_customer_id_fk ON public.carts USING btree (customer_id);
CREATE INDEX idx_carts_user_id_fk ON public.carts USING btree (user_id);
CREATE INDEX idx_cash_accounts_company_branch ON public.cash_accounts USING btree (company_id, branch_id);
CREATE INDEX idx_company_memberships_company_active ON public.company_memberships USING btree (company_id, is_active);
CREATE UNIQUE INDEX idx_company_memberships_one_default ON public.company_memberships USING btree (user_id) WHERE ((is_active = true) AND (is_default = true));
CREATE INDEX idx_company_memberships_user_active ON public.company_memberships USING btree (user_id, is_active, is_default);
CREATE INDEX idx_consolidation_items_selected ON public.report_consolidation_items USING btree (company_id, run_id, business_key, selected);
CREATE INDEX idx_control_plane_health_latest ON public.control_plane_health_snapshots USING btree (company_id, observed_at DESC);
CREATE INDEX idx_customer_credit_accounts_company_id ON public.customer_credit_accounts USING btree (company_id);
CREATE INDEX idx_customer_credit_accounts_customer_id ON public.customer_credit_accounts USING btree (customer_id);
CREATE INDEX idx_customer_invitations_company_id ON public.customer_invitations USING btree (company_id);
CREATE INDEX idx_customer_invitations_customer_id ON public.customer_invitations USING btree (customer_id);
CREATE INDEX idx_customer_invitations_invited_by ON public.customer_invitations USING btree (invited_by);
CREATE INDEX idx_customer_ledger_entries_company_customer ON public.customer_ledger_entries USING btree (company_id, customer_id);
CREATE INDEX idx_customer_ledger_entries_due_date ON public.customer_ledger_entries USING btree (due_date);
CREATE INDEX idx_customer_ledger_entries_source ON public.customer_ledger_entries USING btree (source_type, source_id);
CREATE INDEX idx_customer_price_tiers_company_customer_product ON public.customer_price_tiers USING btree (company_id, customer_id, product_id);
CREATE INDEX idx_customer_price_tiers_product ON public.customer_price_tiers USING btree (product_id);
CREATE INDEX idx_decision_action_receipts_work_item ON public.decision_action_receipts USING btree (company_id, work_item_id, started_at DESC);
CREATE INDEX idx_decision_approvals_tenant_status ON public.decision_approvals USING btree (company_id, status, requested_at DESC);
CREATE INDEX idx_decision_outcomes_quality ON public.decision_outcomes USING btree (company_id, decision_fingerprint, label, observed_at DESC);
CREATE INDEX idx_decision_outcomes_tenant_observed_by ON public.decision_outcomes USING btree (company_id, observed_by, observed_at DESC);
CREATE INDEX idx_decision_portfolio_rank ON public.decision_portfolio_items USING btree (company_id, status, priority_score DESC, materiality_score DESC);
CREATE INDEX idx_decision_work_items_decision ON public.decision_work_items USING btree (company_id, decision_id);
CREATE INDEX idx_decision_work_items_tenant_status ON public.decision_work_items USING btree (company_id, status, due_at);
CREATE INDEX idx_deployment_verification_release ON public.deployment_verification_runs USING btree (release_manifest_id, started_at DESC);
CREATE INDEX idx_entitlement_usage_period ON public.entitlement_usage_events USING btree (company_id, capability, billing_period, occurred_at);
CREATE INDEX idx_executive_evidence_graph_target ON public.executive_evidence_graph USING btree (company_id, target_type, target_key);
CREATE INDEX idx_file_records_company ON public.file_records USING btree (company_id);
CREATE INDEX idx_file_records_hash ON public.file_records USING btree (file_hash);
CREATE INDEX idx_governance_alerts_open ON public.governance_alerts USING btree (company_id, status, severity, created_at DESC);
CREATE INDEX idx_governance_policy_active ON public.governance_policies USING btree (company_id, status, priority, effective_at DESC);
CREATE INDEX idx_import_field_lineage_canonical ON public.import_field_lineage USING btree (company_id, canonical_field);
CREATE INDEX idx_import_field_lineage_company_id ON public.import_field_lineage USING btree (company_id);
CREATE INDEX idx_import_field_lineage_company_row ON public.import_field_lineage USING btree (company_id, job_row_id);
CREATE INDEX idx_import_field_lineage_job ON public.import_field_lineage USING btree (company_id, job_id);
CREATE INDEX idx_import_field_lineage_job_company ON public.import_field_lineage USING btree (job_id, company_id);
CREATE INDEX idx_import_field_lineage_job_id ON public.import_field_lineage USING btree (job_id);
CREATE INDEX idx_import_field_lineage_job_row_company ON public.import_field_lineage USING btree (job_row_id, company_id);
CREATE INDEX idx_import_field_lineage_job_row_id ON public.import_field_lineage USING btree (job_row_id);
CREATE INDEX idx_import_field_lineage_row ON public.import_field_lineage USING btree (job_row_id);
CREATE INDEX idx_import_job_rows_company_job ON public.import_job_rows USING btree (company_id, job_id);
CREATE INDEX idx_import_job_rows_company_job_row ON public.import_job_rows USING btree (company_id, job_id, row_number);
CREATE UNIQUE INDEX idx_import_job_rows_id_company ON public.import_job_rows USING btree (id, company_id);
CREATE INDEX idx_import_job_rows_job ON public.import_job_rows USING btree (job_id);
CREATE INDEX idx_import_job_rows_job_company ON public.import_job_rows USING btree (job_id, company_id);
CREATE INDEX idx_import_jobs_company_created_id ON public.import_jobs USING btree (company_id, created_at DESC, id);
CREATE UNIQUE INDEX idx_import_jobs_company_idempotency ON public.import_jobs USING btree (company_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_import_jobs_company_source_fingerprint ON public.import_jobs USING btree (company_id, source_fingerprint) WHERE (source_fingerprint IS NOT NULL);
CREATE INDEX idx_import_jobs_company_status ON public.import_jobs USING btree (company_id, status);
CREATE INDEX idx_import_jobs_company_updated ON public.import_jobs USING btree (company_id, updated_at DESC);
CREATE UNIQUE INDEX idx_import_jobs_id_company ON public.import_jobs USING btree (id, company_id);
CREATE INDEX idx_imports_company ON public.imports USING btree (company_id);
CREATE INDEX idx_incident_evidence_open ON public.incident_evidence USING btree (company_id, status, severity, detected_at DESC);
CREATE INDEX idx_inventory_bal_product ON public.inventory_balances USING btree (product_id);
CREATE INDEX idx_inventory_balances_company_product ON public.inventory_balances USING btree (company_id, product_id);
CREATE INDEX idx_inventory_balances_company_updated ON public.inventory_balances USING btree (company_id, updated_at DESC);
CREATE INDEX idx_inventory_mov_product ON public.inventory_movements USING btree (product_id);
CREATE INDEX idx_kpi_evidence_latest ON public.kpi_evidence_snapshots USING btree (company_id, kpi_key, observed_at DESC);
CREATE INDEX idx_metric_governance_audit_company_metric ON public.metric_governance_audit USING btree (company_id, metric_id, created_at DESC);
CREATE INDEX idx_metric_governance_company_metric_version ON public.metric_governance USING btree (company_id, metric_id, version DESC);
CREATE INDEX idx_metric_governance_metric_version ON public.metric_governance USING btree (metric_id, version DESC);
CREATE INDEX idx_metric_governance_status ON public.metric_governance USING btree (certification_status);
CREATE INDEX idx_operational_health_latest ON public.operational_health_snapshots USING btree (company_id, component, observed_at DESC);
CREATE INDEX idx_operational_task_proposals_company_status ON public.operational_task_proposals USING btree (company_id, status);
CREATE INDEX idx_operational_task_proposals_decision ON public.operational_task_proposals USING btree (decision_id);
CREATE INDEX idx_operational_task_proposals_task_key ON public.operational_task_proposals USING btree (company_id, task_key);
CREATE INDEX idx_operational_task_proposals_work_item ON public.operational_task_proposals USING btree (converted_work_item_id);
CREATE INDEX idx_order_items_company_product ON public.order_items USING btree (company_id, product_id);
CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_outbox_events_company_order ON public.order_outbox_events USING btree (company_id, order_id);
CREATE INDEX idx_order_outbox_events_pending ON public.order_outbox_events USING btree (company_id, delivered_at, created_at);
CREATE INDEX idx_order_status_history_actor ON public.order_status_history USING btree (actor_id);
CREATE INDEX idx_order_status_history_company_order ON public.order_status_history USING btree (company_id, order_id);
CREATE INDEX idx_order_template_items_product_id ON public.order_template_items USING btree (product_id);
CREATE INDEX idx_order_template_items_template_id ON public.order_template_items USING btree (template_id);
CREATE INDEX idx_order_templates_company_customer ON public.order_templates USING btree (company_id, customer_id);
CREATE INDEX idx_order_templates_created_by ON public.order_templates USING btree (created_by);
CREATE INDEX idx_orders_company_customer ON public.orders USING btree (company_id, customer_id);
CREATE UNIQUE INDEX idx_orders_company_idempotency_key ON public.orders USING btree (company_id, idempotency_key);
CREATE INDEX idx_orders_created_by ON public.orders USING btree (created_by);
CREATE INDEX idx_orders_warehouse ON public.orders USING btree (warehouse_id);
CREATE INDEX idx_payments_company_date ON public.payments USING btree (company_id, payment_date);
CREATE INDEX idx_payments_company_date_direction ON public.payments USING btree (company_id, payment_date, direction);
CREATE INDEX idx_products_company_active ON public.products USING btree (company_id, is_active);
CREATE INDEX idx_products_company_normalized_sku ON public.products USING btree (company_id, public.normalize_import_key(sku));
CREATE INDEX idx_purchase_company_date ON public.purchase_invoices USING btree (company_id, invoice_date);
CREATE INDEX idx_purchase_invoices_company_date_status ON public.purchase_invoices USING btree (company_id, invoice_date, status);
CREATE INDEX idx_purchase_items_company_id ON public.purchase_items USING btree (company_id);
CREATE INDEX idx_purchase_items_invoice ON public.purchase_items USING btree (invoice_id);
CREATE INDEX idx_purchase_items_invoice_product ON public.purchase_items USING btree (invoice_id, product_id);
CREATE INDEX idx_purchase_supplier ON public.purchase_invoices USING btree (supplier_id);
CREATE INDEX idx_quality_reports_file ON public.data_quality_reports USING btree (file_record_id);
CREATE INDEX idx_recommendation_outcomes_tenant_observed_by ON public.recommendation_outcomes USING btree (company_id, observed_by, observed_at DESC);
CREATE INDEX idx_recommendations_company_decision ON public.recommendations USING btree (company_id, decision_id);
CREATE INDEX idx_recs_company_status ON public.recommendations USING btree (company_id, status);
CREATE INDEX idx_release_evidence_latest ON public.release_evidence_manifests USING btree (company_id, created_at DESC);
CREATE INDEX idx_release_evidence_status ON public.release_evidence_manifests USING btree (company_id, status, created_at DESC);
CREATE INDEX idx_report_evidence_passports_ready ON public.report_evidence_passports USING btree (company_id, verification_status, decision_readiness, updated_at DESC);
CREATE INDEX idx_report_evidence_passports_source ON public.report_evidence_passports USING btree (company_id, source_hash, updated_at DESC);
CREATE INDEX idx_report_evidence_snapshots_source ON public.report_evidence_snapshots USING btree (company_id, source_hash, created_at DESC);
CREATE INDEX idx_report_evidence_snapshots_verified ON public.report_evidence_snapshots USING btree (company_id, verification_status, created_at DESC);
CREATE INDEX idx_report_execution_jobs_company ON public.report_execution_jobs USING btree (company_id, created_at DESC);
CREATE UNIQUE INDEX idx_report_execution_jobs_company_job_key ON public.report_execution_jobs USING btree (company_id, job_key);
CREATE INDEX idx_report_execution_jobs_lease ON public.report_execution_jobs USING btree (status, lease_expires_at);
CREATE INDEX idx_report_execution_jobs_queue ON public.report_execution_jobs USING btree (status, created_at);
CREATE INDEX idx_report_execution_jobs_ready ON public.report_execution_jobs USING btree (company_id, status, created_at);
CREATE INDEX idx_report_execution_tasks_company_job ON public.report_execution_tasks USING btree (company_id, report_execution_job_id);
CREATE INDEX idx_report_execution_tasks_company_stage ON public.report_execution_tasks USING btree (company_id, stage);
CREATE INDEX idx_report_row_lineage_lookup ON public.report_row_lineage USING btree (company_id, row_key, last_seen_at DESC);
CREATE INDEX idx_report_runs_company ON public.report_runs USING btree (company_id, created_at DESC);
CREATE INDEX idx_report_runs_lease ON public.report_runs USING btree (company_id, status, lease_expires_at);
CREATE INDEX idx_report_runs_queue ON public.report_runs USING btree (company_id, status, created_at);
CREATE INDEX idx_report_source_versions_latest ON public.report_source_versions USING btree (company_id, source_key, detected_at DESC);
CREATE INDEX idx_sale_items_company_id ON public.sale_items USING btree (company_id);
CREATE INDEX idx_sale_items_invoice ON public.sale_items USING btree (invoice_id);
CREATE INDEX idx_sale_items_invoice_product ON public.sale_items USING btree (invoice_id, product_id);
CREATE INDEX idx_sale_items_product ON public.sale_items USING btree (product_id);
CREATE INDEX idx_sale_items_product_invoice ON public.sale_items USING btree (product_id, invoice_id);
CREATE INDEX idx_sales_company_date ON public.sales_invoices USING btree (company_id, invoice_date);
CREATE INDEX idx_sales_customer ON public.sales_invoices USING btree (customer_id);
CREATE INDEX idx_sales_invoices_company_date_status ON public.sales_invoices USING btree (company_id, invoice_date, status);
CREATE INDEX idx_sales_invoices_order_id ON public.sales_invoices USING btree (order_id);
CREATE INDEX idx_snapshots_company ON public.import_snapshots USING btree (company_id);
CREATE INDEX idx_source_analysis_snapshots_company_source ON public.source_analysis_snapshots USING btree (company_id, source_hash);
CREATE INDEX idx_source_analysis_snapshots_import_job ON public.source_analysis_snapshots USING btree (import_job_id);
CREATE INDEX idx_synonym_canonical ON public.synonym_dictionary USING btree (canonical_field);
CREATE INDEX idx_synonym_synonym ON public.synonym_dictionary USING btree (synonym);
CREATE UNIQUE INDEX idx_synonym_unique ON public.synonym_dictionary USING btree (canonical_field, synonym);
CREATE INDEX idx_trust_certifications_expiry ON public.trust_certifications USING btree (company_id, status, expires_at);
CREATE INDEX idx_watched_report_files_company_folder ON public.watched_report_files USING btree (company_id, folder_id);
CREATE INDEX idx_watched_report_files_pending ON public.watched_report_files USING btree (company_id, folder_id, state, updated_at DESC);
CREATE INDEX idx_watched_report_files_state ON public.watched_report_files USING btree (company_id, state, updated_at);
CREATE INDEX idx_watched_report_folders_company ON public.watched_report_folders USING btree (company_id, enabled);
CREATE INDEX profiles_customer_idx ON public.profiles USING btree (customer_id);
CREATE INDEX profiles_org_idx ON public.profiles USING btree (organization_id);
CREATE UNIQUE INDEX recommendations_company_decision_unique_idx ON public.recommendations USING btree (company_id, decision_id) WHERE (decision_id IS NOT NULL);
CREATE UNIQUE INDEX uq_metric_governance_company_metric_version ON public.metric_governance USING btree (company_id, metric_id, version);
CREATE UNIQUE INDEX uq_products_company_normalized_sku ON public.products USING btree (company_id, public.normalize_import_key(sku));
COMMENT ON INDEX public.uq_products_company_normalized_sku IS 'Canonical product identity for imports: one normalized SKU per tenant.';
CREATE UNIQUE INDEX uq_watched_report_files_company_id_id ON public.watched_report_files USING btree (company_id, id);
CREATE UNIQUE INDEX uq_watched_report_folders_company_id_id ON public.watched_report_folders USING btree (company_id, id);
CREATE TRIGGER metric_governance_audit_require_tenant BEFORE INSERT ON public.metric_governance_audit FOR EACH ROW EXECUTE FUNCTION public.metric_governance_audit_require_tenant();
CREATE TRIGGER metric_governance_guard_certified_update BEFORE UPDATE ON public.metric_governance FOR EACH ROW EXECUTE FUNCTION public.metric_governance_guard_certified_update();
CREATE TRIGGER metric_governance_require_tenant BEFORE INSERT ON public.metric_governance FOR EACH ROW EXECUTE FUNCTION public.metric_governance_require_tenant();
CREATE TRIGGER metric_governance_touch_updated_at BEFORE UPDATE ON public.metric_governance FOR EACH ROW EXECUTE FUNCTION public.metric_governance_touch_updated_at();
CREATE TRIGGER trg_business_decision_runtime_audit AFTER INSERT OR DELETE OR UPDATE ON public.business_intelligence_decisions FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_decision_action_receipt_audit AFTER INSERT OR DELETE OR UPDATE ON public.decision_action_receipts FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_decision_approval_audit AFTER INSERT OR DELETE OR UPDATE ON public.decision_approvals FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_decision_work_item_audit AFTER INSERT OR DELETE OR UPDATE ON public.decision_work_items FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_orders_operational_audit AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_operational_change();
CREATE TRIGGER trg_payment_reference_company BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_reference_same_company();
CREATE TRIGGER trg_payments_operational_audit AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_operational_change();
CREATE TRIGGER trg_purchase_item_product_company BEFORE INSERT OR UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.enforce_item_reference_same_invoice_company('purchase_invoices');
CREATE TRIGGER trg_recommendation_outcome_audit AFTER INSERT OR DELETE OR UPDATE ON public.recommendation_outcomes FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_recommendation_runtime_audit AFTER INSERT OR DELETE OR UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.audit_decision_runtime_change();
CREATE TRIGGER trg_sale_item_product_company BEFORE INSERT OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.enforce_item_reference_same_invoice_company('sales_invoices');
CREATE TRIGGER trg_sales_invoices_operational_audit AFTER INSERT OR DELETE OR UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.audit_operational_change();
CREATE TRIGGER trg_source_decision_evidence BEFORE INSERT OR UPDATE ON public.business_intelligence_decisions FOR EACH ROW EXECUTE FUNCTION public.enforce_source_decision_evidence();
CREATE TRIGGER trg_source_recommendation_evidence BEFORE INSERT OR UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION public.enforce_source_recommendation_evidence();
CREATE TRIGGER trg_source_work_item_evidence BEFORE INSERT OR UPDATE ON public.decision_work_items FOR EACH ROW EXECUTE FUNCTION public.enforce_source_work_item_evidence();
CREATE TRIGGER trg_warehouse_branch_company BEFORE INSERT OR UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.enforce_same_company_reference('branches', 'branch_id');
ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.alternative_item_group_members
    ADD CONSTRAINT alternative_item_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.alternative_item_groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.anomaly_correlations
    ADD CONSTRAINT anomaly_correlations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.artifact_verification_runs
    ADD CONSTRAINT artifact_verification_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.automation_execution_receipts
    ADD CONSTRAINT automation_execution_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.automation_remediation_runs
    ADD CONSTRAINT automation_remediation_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.autonomy_certification_evidence
    ADD CONSTRAINT autonomy_certification_evidence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.autonomy_certification_runs
    ADD CONSTRAINT autonomy_certification_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.autonomy_domain_controls
    ADD CONSTRAINT autonomy_domain_controls_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.autonomy_rollback_drills
    ADD CONSTRAINT autonomy_rollback_drills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.backup_verification_runs
    ADD CONSTRAINT backup_verification_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_liveness_probes
    ADD CONSTRAINT billing_liveness_probes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_plan_capabilities
    ADD CONSTRAINT billing_plan_capabilities_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.billing_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_subscription_events
    ADD CONSTRAINT billing_subscription_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_subscription_events
    ADD CONSTRAINT billing_subscription_events_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.billing_plans(id);
ALTER TABLE ONLY public.billing_usage_events
    ADD CONSTRAINT billing_usage_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.billing_webhook_events
    ADD CONSTRAINT billing_webhook_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.bounded_scenario_runs
    ADD CONSTRAINT bounded_scenario_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.bounded_scenario_runs
    ADD CONSTRAINT bounded_scenario_runs_state_snapshot_id_fkey FOREIGN KEY (state_snapshot_id) REFERENCES public.business_state_snapshots(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.business_intelligence_decisions
    ADD CONSTRAINT business_intelligence_decisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.business_intelligence_decisions
    ADD CONSTRAINT business_intelligence_decisions_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.business_risk_budgets
    ADD CONSTRAINT business_risk_budgets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.business_state_snapshots
    ADD CONSTRAINT business_state_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_dataset_records
    ADD CONSTRAINT canonical_dataset_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_dataset_records
    ADD CONSTRAINT canonical_dataset_records_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.canonical_import_commits
    ADD CONSTRAINT canonical_import_commits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_text_artifacts
    ADD CONSTRAINT canonical_text_artifacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_text_artifacts
    ADD CONSTRAINT canonical_text_artifacts_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.report_source_versions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_company_id_file_id_fkey FOREIGN KEY (company_id, file_id) REFERENCES public.watched_report_files(company_id, id) ON DELETE SET NULL (file_id);
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_company_id_folder_id_fkey FOREIGN KEY (company_id, folder_id) REFERENCES public.watched_report_folders(company_id, id) ON DELETE SET NULL (folder_id);
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.watched_report_files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.canonical_text_provenance
    ADD CONSTRAINT canonical_text_provenance_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.watched_report_folders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_branch_company_fkey FOREIGN KEY (company_id, branch_id) REFERENCES public.branches(company_id, id);
ALTER TABLE ONLY public.cash_accounts
    ADD CONSTRAINT cash_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.client_ui_settings
    ADD CONSTRAINT client_ui_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_entitlements
    ADD CONSTRAINT company_entitlements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_entitlements
    ADD CONSTRAINT company_entitlements_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.entitlement_plans(id);
ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.company_memberships
    ADD CONSTRAINT company_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.control_plane_drift_events
    ADD CONSTRAINT control_plane_drift_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.control_plane_health_snapshots
    ADD CONSTRAINT control_plane_health_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.control_plane_optimization_runs
    ADD CONSTRAINT control_plane_optimization_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.control_plane_optimization_runs
    ADD CONSTRAINT control_plane_optimization_runs_state_snapshot_id_fkey FOREIGN KEY (state_snapshot_id) REFERENCES public.business_state_snapshots(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.customer_credit_accounts
    ADD CONSTRAINT customer_credit_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_credit_accounts
    ADD CONSTRAINT customer_credit_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_invitations
    ADD CONSTRAINT customer_invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_invitations
    ADD CONSTRAINT customer_invitations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_invitations
    ADD CONSTRAINT customer_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.customer_ledger_entries
    ADD CONSTRAINT customer_ledger_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_ledger_entries
    ADD CONSTRAINT customer_ledger_entries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_price_tiers
    ADD CONSTRAINT customer_price_tiers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_price_tiers
    ADD CONSTRAINT customer_price_tiers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customer_price_tiers
    ADD CONSTRAINT customer_price_tiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.data_quality_reports
    ADD CONSTRAINT data_quality_reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.data_quality_reports
    ADD CONSTRAINT data_quality_reports_file_record_id_fkey FOREIGN KEY (file_record_id) REFERENCES public.file_records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.data_quality_reports
    ADD CONSTRAINT data_quality_reports_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.decision_action_receipts
    ADD CONSTRAINT decision_action_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_action_receipts
    ADD CONSTRAINT decision_action_receipts_work_item_id_fkey FOREIGN KEY (work_item_id) REFERENCES public.decision_work_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_approvals
    ADD CONSTRAINT decision_approvals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_approvals
    ADD CONSTRAINT decision_approvals_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.business_intelligence_decisions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_graph_edges
    ADD CONSTRAINT decision_graph_edges_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_graph_nodes
    ADD CONSTRAINT decision_graph_nodes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_outcomes
    ADD CONSTRAINT decision_outcomes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_portfolio_items
    ADD CONSTRAINT decision_portfolio_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_work_items
    ADD CONSTRAINT decision_work_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_work_items
    ADD CONSTRAINT decision_work_items_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.business_intelligence_decisions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.decision_work_items
    ADD CONSTRAINT decision_work_items_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.recommendations(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.deployment_verification_runs
    ADD CONSTRAINT deployment_verification_runs_release_manifest_id_fkey FOREIGN KEY (release_manifest_id) REFERENCES public.release_evidence_manifests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entitlement_plan_capabilities
    ADD CONSTRAINT entitlement_plan_capabilities_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.entitlement_plans(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.entitlement_usage_events
    ADD CONSTRAINT entitlement_usage_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.executive_evidence_graph
    ADD CONSTRAINT executive_evidence_graph_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.executive_kpi_lineage
    ADD CONSTRAINT executive_kpi_lineage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.file_records
    ADD CONSTRAINT file_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.file_records
    ADD CONSTRAINT file_records_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.file_records(id);
ALTER TABLE ONLY public.forecasts
    ADD CONSTRAINT forecasts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.governance_alerts
    ADD CONSTRAINT governance_alerts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.governance_policies
    ADD CONSTRAINT governance_policies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.governed_scenarios
    ADD CONSTRAINT governed_scenarios_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.human_override_feedback
    ADD CONSTRAINT human_override_feedback_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_job_company_fk FOREIGN KEY (job_id, company_id) REFERENCES public.import_jobs(id, company_id) ON DELETE CASCADE;
COMMENT ON CONSTRAINT import_field_lineage_job_company_fk ON public.import_field_lineage IS 'Prevents lineage from referencing a job belonging to another company.';
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_job_row_id_fkey FOREIGN KEY (job_row_id) REFERENCES public.import_job_rows(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_field_lineage
    ADD CONSTRAINT import_field_lineage_row_company_fk FOREIGN KEY (job_row_id, company_id) REFERENCES public.import_job_rows(id, company_id) ON DELETE CASCADE;
COMMENT ON CONSTRAINT import_field_lineage_row_company_fk ON public.import_field_lineage IS 'Prevents lineage from referencing a row belonging to another company.';
ALTER TABLE ONLY public.import_job_rows
    ADD CONSTRAINT import_job_rows_company_job_fk FOREIGN KEY (job_id, company_id) REFERENCES public.import_jobs(id, company_id) ON DELETE CASCADE;
COMMENT ON CONSTRAINT import_job_rows_company_job_fk ON public.import_job_rows IS 'Prevents an import row from referencing a job belonging to another company.';
ALTER TABLE ONLY public.import_job_rows
    ADD CONSTRAINT import_job_rows_job_company_fk FOREIGN KEY (job_id, company_id) REFERENCES public.import_jobs(id, company_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_job_rows
    ADD CONSTRAINT import_job_rows_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.import_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_file_record_id_fkey FOREIGN KEY (file_record_id) REFERENCES public.file_records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.import_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.import_profiles
    ADD CONSTRAINT import_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_rows
    ADD CONSTRAINT import_rows_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.import_snapshots
    ADD CONSTRAINT import_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_file_fingerprint_id_fkey FOREIGN KEY (file_fingerprint_id) REFERENCES public.file_records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.import_profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.incident_evidence
    ADD CONSTRAINT incident_evidence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.incident_regression_links
    ADD CONSTRAINT incident_regression_links_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.intelligence_quality_scores
    ADD CONSTRAINT intelligence_quality_scores_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.intelligence_safety_adjustments
    ADD CONSTRAINT intelligence_safety_adjustments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.inventory_balances
    ADD CONSTRAINT inventory_balances_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.kpi_evidence_snapshots
    ADD CONSTRAINT kpi_evidence_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.metric_governance_audit
    ADD CONSTRAINT metric_governance_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.metric_governance_audit
    ADD CONSTRAINT metric_governance_audit_metric_governance_id_fkey FOREIGN KEY (metric_governance_id) REFERENCES public.metric_governance(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.operational_health_snapshots
    ADD CONSTRAINT operational_health_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.operational_task_proposals
    ADD CONSTRAINT operational_task_proposals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.operational_task_proposals
    ADD CONSTRAINT operational_task_proposals_converted_work_item_id_fkey FOREIGN KEY (converted_work_item_id) REFERENCES public.decision_work_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.operational_task_proposals
    ADD CONSTRAINT operational_task_proposals_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.business_intelligence_decisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);
ALTER TABLE ONLY public.order_outbox_events
    ADD CONSTRAINT order_outbox_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_outbox_events
    ADD CONSTRAINT order_outbox_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_template_items
    ADD CONSTRAINT order_template_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_template_items
    ADD CONSTRAINT order_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.order_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_templates
    ADD CONSTRAINT order_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.order_templates
    ADD CONSTRAINT order_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.order_templates
    ADD CONSTRAINT order_templates_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.production_certification_bundles
    ADD CONSTRAINT production_certification_bundles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.production_rollback_drills
    ADD CONSTRAINT production_rollback_drills_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_invoice_company_fkey FOREIGN KEY (company_id, invoice_id) REFERENCES public.purchase_invoices(company_id, id);
ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_company_fkey FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id);
ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recommendation_outcomes
    ADD CONSTRAINT recommendation_outcomes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.business_intelligence_decisions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.release_evidence_manifests
    ADD CONSTRAINT release_evidence_manifests_certification_id_fkey FOREIGN KEY (certification_id) REFERENCES public.trust_certifications(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.release_evidence_manifests
    ADD CONSTRAINT release_evidence_manifests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.release_evidence_manifests
    ADD CONSTRAINT release_evidence_manifests_trust_certificate_id_fkey FOREIGN KEY (trust_certificate_id) REFERENCES public.trust_certifications(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.report_consolidation_items
    ADD CONSTRAINT report_consolidation_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_consolidation_items
    ADD CONSTRAINT report_consolidation_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.report_consolidation_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_consolidation_items
    ADD CONSTRAINT report_consolidation_items_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.report_source_versions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.report_consolidation_runs
    ADD CONSTRAINT report_consolidation_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_delivery_receipts
    ADD CONSTRAINT report_delivery_receipts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_delivery_receipts
    ADD CONSTRAINT report_delivery_receipts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.report_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_evidence_snapshot_id_fkey FOREIGN KEY (evidence_snapshot_id) REFERENCES public.report_evidence_snapshots(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_report_execution_job_id_fkey FOREIGN KEY (report_execution_job_id) REFERENCES public.report_execution_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_evidence_passports
    ADD CONSTRAINT report_evidence_passports_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.report_source_versions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_analysis_snapshot_id_fkey FOREIGN KEY (analysis_snapshot_id) REFERENCES public.source_analysis_snapshots(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_report_execution_job_id_fkey FOREIGN KEY (report_execution_job_id) REFERENCES public.report_execution_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_evidence_snapshots
    ADD CONSTRAINT report_evidence_snapshots_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.report_source_versions(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.report_execution_jobs
    ADD CONSTRAINT report_execution_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_execution_tasks
    ADD CONSTRAINT report_execution_tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_execution_tasks
    ADD CONSTRAINT report_execution_tasks_report_execution_job_id_fkey FOREIGN KEY (report_execution_job_id) REFERENCES public.report_execution_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_row_lineage
    ADD CONSTRAINT report_row_lineage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_row_lineage
    ADD CONSTRAINT report_row_lineage_source_version_id_fkey FOREIGN KEY (source_version_id) REFERENCES public.report_source_versions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_run_artifacts
    ADD CONSTRAINT report_run_artifacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_run_artifacts
    ADD CONSTRAINT report_run_artifacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.report_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_run_evidence
    ADD CONSTRAINT report_run_evidence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_run_evidence
    ADD CONSTRAINT report_run_evidence_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.report_runs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_runs
    ADD CONSTRAINT report_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_source_versions
    ADD CONSTRAINT report_source_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.report_source_versions
    ADD CONSTRAINT report_source_versions_previous_version_id_fkey FOREIGN KEY (previous_version_id) REFERENCES public.report_source_versions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_invoice_company_fkey FOREIGN KEY (company_id, invoice_id) REFERENCES public.sales_invoices(company_id, id);
ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_company_fkey FOREIGN KEY (company_id, product_id) REFERENCES public.products(company_id, id);
ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);
ALTER TABLE ONLY public.slo_evidence
    ADD CONSTRAINT slo_evidence_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.source_analysis_snapshots
    ADD CONSTRAINT source_analysis_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.source_analysis_snapshots
    ADD CONSTRAINT source_analysis_snapshots_import_job_id_fkey FOREIGN KEY (import_job_id) REFERENCES public.import_jobs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.tenant_isolation_canary_runs
    ADD CONSTRAINT tenant_isolation_canary_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.trust_certifications
    ADD CONSTRAINT trust_certifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.watched_report_files
    ADD CONSTRAINT watched_report_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.watched_report_files
    ADD CONSTRAINT watched_report_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.watched_report_folders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.watched_report_folders
    ADD CONSTRAINT watched_report_folders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alternative_group_members_authenticated_tenant ON public.alternative_item_group_members TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.alternative_item_groups g
  WHERE ((g.id = alternative_item_group_members.group_id) AND (g.company_id = public.current_company_id()))))));
CREATE POLICY alternative_groups_authenticated_tenant ON public.alternative_item_groups TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.alternative_item_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alternative_item_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY anomaly_correlations_tenant ON public.anomaly_correlations TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.artifact_verification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY artifact_verification_tenant ON public.artifact_verification_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_active_entitlement_capabilities_read ON public.entitlement_plan_capabilities FOR SELECT TO authenticated USING (((enabled = true) AND (EXISTS ( SELECT 1
   FROM public.entitlement_plans p
  WHERE ((p.id = entitlement_plan_capabilities.plan_id) AND (p.is_active = true))))));
CREATE POLICY authenticated_active_entitlement_plans_read ON public.entitlement_plans FOR SELECT TO authenticated USING ((is_active = true));
CREATE POLICY authenticated_automation_receipts_tenant ON public.automation_execution_receipts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_backup_verification_tenant ON public.backup_verification_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_billing_invoices_tenant ON public.billing_invoices TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_company_entitlements_tenant ON public.company_entitlements TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_decision_outcomes_tenant ON public.decision_outcomes TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_delete_import_job_rows ON public.import_job_rows FOR DELETE TO authenticated USING (true);
CREATE POLICY authenticated_delete_import_rows ON public.import_rows FOR DELETE TO authenticated USING (true);
CREATE POLICY authenticated_deployment_verification_tenant ON public.deployment_verification_runs TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.release_evidence_manifests r
  WHERE ((r.id = deployment_verification_runs.release_manifest_id) AND (r.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.release_evidence_manifests r
  WHERE ((r.id = deployment_verification_runs.release_manifest_id) AND (r.company_id = public.current_company_id())))));
CREATE POLICY authenticated_entitlement_usage_tenant ON public.entitlement_usage_events TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_import_field_lineage_deny ON public.import_field_lineage AS RESTRICTIVE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY authenticated_import_job_rows_tenant ON public.import_job_rows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.import_jobs j
  WHERE ((j.id = import_job_rows.job_id) AND (j.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.import_jobs j
  WHERE ((j.id = import_job_rows.job_id) AND (j.company_id = public.current_company_id())))));
CREATE POLICY authenticated_incident_evidence_tenant ON public.incident_evidence TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_insert_import_job_rows ON public.import_job_rows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_insert_import_rows ON public.import_rows FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_operational_health_tenant ON public.operational_health_snapshots TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_read_synonym_dictionary ON public.synonym_dictionary FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_release_evidence_tenant ON public.release_evidence_manifests TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_report_delivery_receipts_tenant ON public.report_delivery_receipts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_report_run_artifacts_tenant ON public.report_run_artifacts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_report_run_evidence_tenant ON public.report_run_evidence TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_report_runs_tenant ON public.report_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_select_import_job_rows ON public.import_job_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_import_rows ON public.import_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_slo_evidence_tenant ON public.slo_evidence TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_trust_certifications_tenant ON public.trust_certifications TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY authenticated_update_import_job_rows ON public.import_job_rows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_update_import_rows ON public.import_rows FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE public.automation_execution_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_remediation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_remediation_tenant ON public.automation_remediation_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.autonomy_certification_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY autonomy_certification_evidence_tenant ON public.autonomy_certification_evidence TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.autonomy_certification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY autonomy_certification_runs_tenant ON public.autonomy_certification_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.autonomy_domain_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY autonomy_domain_controls_tenant ON public.autonomy_domain_controls TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.autonomy_rollback_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY autonomy_rollback_drills_tenant ON public.autonomy_rollback_drills TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.backup_verification_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bi_decisions_tenant ON public.business_intelligence_decisions TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_liveness_probes ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_liveness_tenant ON public.billing_liveness_probes TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.billing_plan_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_plan_capabilities_member_select ON public.billing_plan_capabilities FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.is_active = true)))));
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_plans_member_select ON public.billing_plans FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.is_active = true)))));
ALTER TABLE public.billing_subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_subscription_events_tenant_select ON public.billing_subscription_events FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_subscriptions_tenant_select ON public.billing_subscriptions FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.billing_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_usage_events_tenant_select ON public.billing_usage_events FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounded_scenario_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bounded_scenario_runs_tenant ON public.bounded_scenario_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_intelligence_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_risk_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_risk_budgets_tenant ON public.business_risk_budgets TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.business_state_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_state_tenant ON public.business_state_snapshots TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.canonical_dataset_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_dataset_records_select_tenant ON public.canonical_dataset_records FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.canonical_import_commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_import_commits_tenant ON public.canonical_import_commits FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY canonical_import_commits_tenant_insert ON public.canonical_import_commits FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.canonical_import_repair_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_text_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_text_artifacts_tenant ON public.canonical_text_artifacts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.canonical_text_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY canonical_text_provenance_tenant ON public.canonical_text_provenance TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY cart_items_self_select ON public.cart_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = ( SELECT auth.uid() AS uid)) AND (c.customer_id = public.current_customer_id()) AND (c.company_id = public.current_customer_company_id())))));
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY carts_self_select ON public.carts FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_accounts_tenant_select ON public.cash_accounts FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ui_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_select_current_tenant ON public.companies FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.company_memberships membership
  WHERE ((membership.company_id = companies.id) AND (membership.user_id = ( SELECT auth.uid() AS uid))))));
ALTER TABLE public.company_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_memberships_select_self ON public.company_memberships FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY control_drift_tenant ON public.control_plane_drift_events TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY control_optimization_tenant ON public.control_plane_optimization_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.control_plane_drift_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_plane_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY control_plane_health_snapshots_tenant ON public.control_plane_health_snapshots TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.control_plane_optimization_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_customer_select ON public.customer_credit_accounts FOR SELECT TO authenticated USING (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
ALTER TABLE public.customer_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_invitations_staff_select ON public.customer_invitations FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = customer_invitations.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text])))))));
ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_action_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_action_receipts_tenant ON public.decision_action_receipts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM (public.business_intelligence_decisions d
     JOIN public.decision_work_items w ON (((w.decision_id = d.id) AND (w.company_id = d.company_id))))
  WHERE ((w.id = decision_action_receipts.work_item_id) AND (w.company_id = decision_action_receipts.company_id) AND (d.status = 'APPROVED'::text))))));
ALTER TABLE public.decision_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_approvals_tenant ON public.decision_approvals TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.decision_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_graph_edges_tenant ON public.decision_graph_edges TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.decision_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_graph_nodes_tenant ON public.decision_graph_nodes TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.decision_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_portfolio_items_tenant ON public.decision_portfolio_items TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.decision_work_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_work_items_tenant ON public.decision_work_items TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.business_intelligence_decisions d
  WHERE ((d.id = decision_work_items.decision_id) AND (d.company_id = decision_work_items.company_id) AND (d.status = 'APPROVED'::text))))));
ALTER TABLE public.deployment_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_plan_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_evidence_graph ENABLE ROW LEVEL SECURITY;
CREATE POLICY executive_evidence_graph_tenant ON public.executive_evidence_graph TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.executive_kpi_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY executive_kpi_lineage_tenant ON public.executive_kpi_lineage TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.file_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY governance_alerts_tenant ON public.governance_alerts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.governance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY governance_policies_tenant ON public.governance_policies TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.governed_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY governed_scenarios_tenant ON public.governed_scenarios TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.human_override_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY human_override_feedback_tenant ON public.human_override_feedback TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.import_field_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_regression_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY incident_regression_tenant ON public.incident_regression_links TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.intelligence_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY intelligence_quality_scores_tenant ON public.intelligence_quality_scores TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.intelligence_safety_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY intelligence_safety_tenant ON public.intelligence_safety_adjustments TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_evidence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_evidence_tenant ON public.kpi_evidence_snapshots TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY ledger_customer_select ON public.customer_ledger_entries FOR SELECT TO authenticated USING (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
ALTER TABLE public.metric_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_governance_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_governance_audit_authenticated_tenant_read ON public.metric_governance_audit FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY metric_governance_authenticated_tenant_read ON public.metric_governance FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.operational_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_task_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY operational_task_proposals_insert ON public.operational_task_proposals FOR INSERT TO authenticated WITH CHECK ((( SELECT public.current_company_id() AS current_company_id) = company_id));
CREATE POLICY operational_task_proposals_select ON public.operational_task_proposals FOR SELECT TO authenticated USING ((( SELECT public.current_company_id() AS current_company_id) = company_id));
CREATE POLICY operational_task_proposals_update ON public.operational_task_proposals FOR UPDATE TO authenticated USING ((( SELECT public.current_company_id() AS current_company_id) = company_id)) WITH CHECK ((( SELECT public.current_company_id() AS current_company_id) = company_id));
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_customer_select ON public.order_items FOR SELECT TO authenticated USING (((company_id = public.current_customer_company_id()) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.customer_id = public.current_customer_id()) AND (o.company_id = public.current_customer_company_id()))))));
CREATE POLICY order_items_staff_select ON public.order_items FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = order_items.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'warehouse'::text])))))));
ALTER TABLE public.order_outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_outbox_staff_read ON public.order_outbox_events FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = order_outbox_events.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'warehouse'::text])))))));
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_status_history_staff_read ON public.order_status_history FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = order_status_history.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'warehouse'::text])))))));
ALTER TABLE public.order_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_customer_insert ON public.orders FOR INSERT TO authenticated WITH CHECK (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id()) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY orders_customer_select ON public.orders FOR SELECT TO authenticated USING (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
CREATE POLICY orders_staff_select ON public.orders FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = orders.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text, 'warehouse'::text])))))));
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_tiers_customer_select ON public.customer_price_tiers FOR SELECT TO authenticated USING (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
CREATE POLICY price_tiers_staff_select ON public.customer_price_tiers FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) AND (EXISTS ( SELECT 1
   FROM public.company_memberships cm
  WHERE ((cm.company_id = customer_price_tiers.company_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND cm.is_active AND (cm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'sales'::text])))))));
ALTER TABLE public.production_certification_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_certification_bundles_tenant_read ON public.production_certification_bundles FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.production_rollback_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_rollback_drills_tenant_read ON public.production_rollback_drills FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY recommendation_outcome_tenant ON public.recommendation_outcomes TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.recommendation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_evidence_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_consolidation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_consolidation_items_tenant ON public.report_consolidation_items TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.report_consolidation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_consolidation_runs_tenant ON public.report_consolidation_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.report_delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_evidence_passports ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_evidence_passports_tenant ON public.report_evidence_passports FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.report_evidence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_evidence_snapshots_tenant ON public.report_evidence_snapshots FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.report_execution_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_execution_jobs_tenant ON public.report_execution_jobs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.report_execution_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_execution_tasks_tenant_select ON public.report_execution_tasks FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
ALTER TABLE public.report_row_lineage ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_row_lineage_tenant ON public.report_row_lineage TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.report_run_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_run_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_source_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_source_versions_tenant ON public.report_source_versions TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slo_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_analysis_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_analysis_snapshots_insert ON public.source_analysis_snapshots FOR INSERT TO authenticated WITH CHECK ((( SELECT public.current_company_id() AS current_company_id) = company_id));
CREATE POLICY source_analysis_snapshots_select ON public.source_analysis_snapshots FOR SELECT TO authenticated USING ((( SELECT public.current_company_id() AS current_company_id) = company_id));
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synonym_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_items_customer_select ON public.order_template_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.order_templates t
  WHERE ((t.id = order_template_items.template_id) AND (t.customer_id = public.current_customer_id()) AND (t.company_id = public.current_customer_company_id())))));
CREATE POLICY templates_customer_select ON public.order_templates FOR SELECT TO authenticated USING (((customer_id = public.current_customer_id()) AND (company_id = public.current_customer_company_id())));
CREATE POLICY tenant_alerts ON public.alerts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_audit_logs ON public.audit_logs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_branches ON public.branches TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_categories ON public.categories TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_companies_select ON public.companies FOR SELECT TO authenticated USING ((id = public.current_company_id()));
CREATE POLICY tenant_companies_update ON public.companies FOR UPDATE TO authenticated USING ((id = public.current_company_id())) WITH CHECK ((id = public.current_company_id()));
CREATE POLICY tenant_customers ON public.customers TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_data_quality_reports ON public.data_quality_reports TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.alerts FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.branches FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.categories FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.customers FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.data_quality_reports FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.file_records FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.forecasts FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.import_field_lineage FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.import_jobs FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.import_profiles FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.import_snapshots FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.imports FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.inventory_balances FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.inventory_movements FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.payments FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.products FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.purchase_invoices FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.purchase_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_delete ON public.recommendations FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.sale_items FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_delete ON public.sales_invoices FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.suppliers FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete ON public.warehouses FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_delete_import_job_rows ON public.import_job_rows FOR DELETE TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_file_records ON public.file_records TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_forecasts ON public.forecasts TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_import_field_lineage ON public.import_field_lineage TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_import_job_rows ON public.import_job_rows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.import_jobs j
  WHERE ((j.id = import_job_rows.job_id) AND (j.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.import_jobs j
  WHERE ((j.id = import_job_rows.job_id) AND (j.company_id = public.current_company_id())))));
CREATE POLICY tenant_import_jobs ON public.import_jobs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_import_profiles ON public.import_profiles TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_import_rows ON public.import_rows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.imports i
  WHERE ((i.id = import_rows.import_id) AND (i.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.imports i
  WHERE ((i.id = import_rows.import_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_import_snapshots ON public.import_snapshots TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_imports ON public.imports TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.alerts FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.branches FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.categories FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.customers FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.data_quality_reports FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.file_records FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.forecasts FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.import_field_lineage FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.import_jobs FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.import_profiles FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.import_snapshots FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.imports FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.inventory_balances FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.payments FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.products FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.purchase_invoices FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.purchase_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_insert ON public.recommendations FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.sale_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_insert ON public.sales_invoices FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert ON public.warehouses FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_insert_import_job_rows ON public.import_job_rows FOR INSERT TO authenticated WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_inventory_balances ON public.inventory_balances TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_inventory_movements ON public.inventory_movements TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.tenant_isolation_canary_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_canary_tenant ON public.tenant_isolation_canary_runs TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_payments ON public.payments TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_products ON public.products TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_purchase_invoices ON public.purchase_invoices TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_purchase_items ON public.purchase_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_recommendations ON public.recommendations TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_sale_items ON public.sale_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_sales_invoices ON public.sales_invoices TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.alerts FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.audit_logs FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.branches FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.categories FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.customers FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.data_quality_reports FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.file_records FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.forecasts FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.import_field_lineage FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.import_jobs FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.import_profiles FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.import_snapshots FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.imports FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.inventory_balances FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.inventory_movements FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.payments FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.products FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.purchase_invoices FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.purchase_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_select ON public.recommendations FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.sale_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_select ON public.sales_invoices FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.suppliers FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select ON public.warehouses FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_select_import_job_rows ON public.import_job_rows FOR SELECT TO authenticated USING ((company_id = public.current_company_id()));
CREATE POLICY tenant_suppliers ON public.suppliers TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.alerts FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.branches FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.categories FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.customers FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.data_quality_reports FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.file_records FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.forecasts FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.import_field_lineage FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.import_jobs FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.import_profiles FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.import_snapshots FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.imports FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.inventory_balances FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.inventory_movements FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.payments FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.products FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.purchase_invoices FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.purchase_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_invoices i
  WHERE ((i.id = purchase_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_update ON public.recommendations FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.sale_items FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.sales_invoices i
  WHERE ((i.id = sale_items.invoice_id) AND (i.company_id = public.current_company_id())))));
CREATE POLICY tenant_update ON public.sales_invoices FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.suppliers FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update ON public.warehouses FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_update_import_job_rows ON public.import_job_rows FOR UPDATE TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
CREATE POLICY tenant_warehouses ON public.warehouses TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.trust_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY ui_settings_customer_select ON public.client_ui_settings FOR SELECT TO authenticated USING ((organization_id = public.current_customer_company_id()));
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watched_report_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY watched_report_files_tenant ON public.watched_report_files TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
ALTER TABLE public.watched_report_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY watched_report_folders_tenant ON public.watched_report_folders TO authenticated USING ((company_id = public.current_company_id())) WITH CHECK ((company_id = public.current_company_id()));
GRANT SELECT ON TABLE public.metric_governance TO authenticated;
REVOKE ALL ON FUNCTION public.accept_completed_report_evidence_batch(p_company_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_completed_report_evidence_batch(p_company_id uuid, p_limit integer) TO service_role;
GRANT SELECT ON TABLE public.alternative_item_group_members TO authenticated;
GRANT ALL ON FUNCTION public.add_alternative_item_group_member(p_company_id uuid, p_group_id uuid, p_sku text, p_conversion_factor numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_worker_id text, p_checkpoint jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_worker_id text, p_checkpoint jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_checkpoint jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.advance_report_execution_checkpoint(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_checkpoint jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.audit_decision_runtime_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_operational_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.autonomy_runtime_gate(p_domain_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.autonomy_runtime_gate(p_domain_key text) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_check_entitlement(p_capability text, p_quantity numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_check_entitlement(p_capability text, p_quantity numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_current_subscription() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_current_subscription() TO authenticated;
REVOKE ALL ON FUNCTION public.billing_record_usage(p_capability text, p_quantity numeric, p_idempotency_key text, p_source text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_usage(p_capability text, p_quantity numeric, p_idempotency_key text, p_source text, p_metadata jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_set_subscription(p_plan_id uuid, p_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone, p_grace_ends_at timestamp with time zone, p_cancel_at_period_end boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_set_subscription(p_plan_id uuid, p_status text, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone, p_grace_ends_at timestamp with time zone, p_cancel_at_period_end boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.can_certify_autonomous_domain(p_domain_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_enter_phase_l_autonomy(p_domain_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_enter_phase_l_autonomy(p_domain_key text) TO authenticated;
REVOKE ALL ON FUNCTION public.can_execute_bi_decision(p_decision_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_execute_control_plane_run(p_run_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_release_production_certification(p_bundle_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_run_phase_l_autonomy(p_domain_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_run_phase_l_autonomy(p_domain_key text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_report_execution_job(p_job_id uuid, p_company_id uuid, p_lease_owner text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_report_execution_job(p_job_id uuid, p_company_id uuid, p_lease_owner text, p_lease_seconds integer) TO service_role;
GRANT ALL ON FUNCTION public.claim_report_run(p_worker_id text, p_lease_seconds integer) TO authenticated;
REVOKE ALL ON FUNCTION public.clear_cart() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clear_cart() TO authenticated;
GRANT ALL ON FUNCTION public.clear_cart() TO service_role;
REVOKE ALL ON FUNCTION public.complete_decision_work_item(p_work_item_id uuid, p_actual_impact numeric, p_evidence jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_decision_work_item(p_work_item_id uuid, p_actual_impact numeric, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_report_execution_job(p_job_id uuid, p_worker_id text, p_evidence jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_report_execution_job(p_job_id uuid, p_worker_id text, p_evidence jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_evidence jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_evidence jsonb) TO service_role;
GRANT ALL ON FUNCTION public.complete_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_evidence jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.complete_report_run(p_run_id uuid, p_worker_id text, p_status text, p_error_code text, p_error_message text) TO authenticated;
REVOKE ALL ON FUNCTION public.compute_control_plane_health() FROM PUBLIC;
GRANT ALL ON FUNCTION public.compute_control_plane_health() TO authenticated;
GRANT SELECT ON TABLE public.alternative_item_groups TO authenticated;
GRANT ALL ON FUNCTION public.create_alternative_item_group(p_company_id uuid, p_name text, p_description text, p_base_unit text) TO authenticated;
GRANT ALL ON FUNCTION public.create_decision_action_receipt(p_work_item_id uuid, p_idempotency_key text, p_decision_fingerprint text, p_evidence_snapshot_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_decision_work_item(p_decision_id uuid, p_recommendation_id uuid, p_department text, p_assignee_id uuid, p_assignee_label text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone, p_expected_impact numeric, p_evidence_refs jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_decision_work_item(p_decision_id uuid, p_recommendation_id uuid, p_department text, p_assignee_id uuid, p_assignee_label text, p_title text, p_description text, p_priority text, p_due_at timestamp with time zone, p_expected_impact numeric, p_evidence_refs jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_runtime_decision(p_decision_key text, p_decision_type text, p_confidence numeric, p_expected_impact numeric, p_evidence jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_runtime_decision(p_decision_key text, p_decision_type text, p_confidence numeric, p_expected_impact numeric, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_runtime_recommendation(p_category text, p_priority text, p_title text, p_description text, p_evidence jsonb, p_expected_impact numeric, p_evidence_snapshot_id uuid, p_metric_versions jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_runtime_recommendation(p_category text, p_priority text, p_title text, p_description text, p_evidence jsonb, p_expected_impact numeric, p_evidence_snapshot_id uuid, p_metric_versions jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.create_source_intelligence_proposal(p_report_job_id uuid, p_source_hash text, p_signal_id text, p_signal_title text, p_signal_message text, p_severity text, p_evidence jsonb, p_evidence_snapshot_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_source_intelligence_proposal(p_report_job_id uuid, p_source_hash text, p_signal_id text, p_signal_title text, p_signal_message text, p_severity text, p_evidence jsonb, p_evidence_snapshot_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_company_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_company_id() TO service_role;
REVOKE ALL ON FUNCTION public.current_customer_company_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_customer_company_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_customer_company_id() TO service_role;
REVOKE ALL ON FUNCTION public.current_customer_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_customer_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_customer_id() TO service_role;
REVOKE ALL ON FUNCTION public.decide_approval(p_approval_id uuid, p_approve boolean, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_approval(p_approval_id uuid, p_approve boolean, p_reason text) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_source_decision_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_source_recommendation_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_source_work_item_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[], p_max_attempts integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[], p_max_attempts integer) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[], p_max_attempts integer, p_force_reprocess boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_report_execution_job(p_company_id uuid, p_job_key text, p_source_path text, p_source_hash text, p_evidence_keys text[], p_max_attempts integer, p_force_reprocess boolean) TO service_role;
REVOKE ALL ON FUNCTION public.fail_report_execution_job(p_job_id uuid, p_worker_id text, p_error jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fail_report_execution_job(p_job_id uuid, p_worker_id text, p_error jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.fail_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_error jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fail_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_error jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_abc_snapshot(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_abc_snapshot(p_limit integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_aging_snapshot(p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_aging_snapshot(p_as_of date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_cart() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_cart() TO authenticated;
GRANT ALL ON FUNCTION public.get_cart() TO service_role;
REVOKE ALL ON FUNCTION public.get_dashboard_intelligence(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_intelligence(p_limit integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_snapshot(p_months integer, p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_snapshot(p_months integer, p_as_of date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_top_entities() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_top_entities() TO authenticated;
REVOKE ALL ON FUNCTION public.get_data_quality_snapshot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_data_quality_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.get_entitlement_usage(p_capability text, p_period text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_executive_metrics(p_company_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_executive_metrics(p_company_id uuid, p_from date, p_to date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_forecast_snapshot(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_forecast_snapshot(p_limit integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_inventory_export_rows(p_company_id uuid, p_max_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_inventory_export_rows(p_company_id uuid, p_max_rows integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_inventory_report_snapshot(p_page integer, p_page_size integer, p_filter text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_inventory_report_snapshot(p_page integer, p_page_size integer, p_filter text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_inventory_valuation(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_inventory_valuation(p_company_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_profitability_snapshot(p_as_of date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_profitability_snapshot(p_as_of date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_purchase_export_rows(p_company_id uuid, p_max_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_purchase_export_rows(p_company_id uuid, p_max_rows integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_purchase_summary(p_company_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_purchase_summary(p_company_id uuid, p_from date, p_to date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_receivables_export_rows(p_company_id uuid, p_max_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_receivables_export_rows(p_company_id uuid, p_max_rows integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_receivables_report_page(p_page integer, p_page_size integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_receivables_report_page(p_page integer, p_page_size integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_report_value_cohort_candidates(p_limit integer, p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_report_value_cohort_candidates(p_limit integer, p_company_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_rfm_snapshot(p_as_of date, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_rfm_snapshot(p_as_of date, p_limit integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_sales_export_rows(p_company_id uuid, p_max_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_sales_export_rows(p_company_id uuid, p_max_rows integer) TO authenticated;
REVOKE ALL ON FUNCTION public.get_sales_secondary_metrics(p_company_id uuid, p_months integer, p_limit integer, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_sales_secondary_metrics(p_company_id uuid, p_months integer, p_limit integer, p_from date, p_to date) TO authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.heartbeat_report_execution_job(p_job_id uuid, p_company_id uuid, p_worker_id text, p_lease_token uuid, p_lease_seconds integer) TO service_role;
REVOKE ALL ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text) TO authenticated;
GRANT ALL ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text, p_source_hash text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text, p_source_hash text, p_import_job_id uuid, p_repair boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_commit_batch(p_company_id uuid, p_entity_type text, p_rows jsonb, p_null_policy text, p_source_hash text, p_import_job_id uuid, p_repair boolean) TO service_role;
GRANT ALL ON FUNCTION public.import_commit_batch_governed(p_company_id uuid, p_entity_type text, p_rows jsonb, p_source_rows jsonb, p_resolutions jsonb, p_null_policy text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer) TO authenticated;
REVOKE ALL ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer, p_file_record_id uuid, p_profile_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer, p_file_record_id uuid, p_profile_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.import_create_job(p_company_id uuid, p_entity_type text, p_total_rows integer, p_file_record_id uuid, p_profile_id uuid, p_idempotency_key text, p_source_fingerprint text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_finish_job(p_job_id uuid, p_status text, p_result_summary jsonb, p_error_message text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_finish_job(p_job_id uuid, p_status text, p_result_summary jsonb, p_error_message text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_update_job_progress(p_job_id uuid, p_processed_rows integer, p_valid_rows integer, p_invalid_rows integer, p_duplicate_rows integer, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_update_job_progress(p_job_id uuid, p_processed_rows integer, p_valid_rows integer, p_invalid_rows integer, p_duplicate_rows integer, p_status text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_upsert_customer(p_company_id uuid, p_name text, p_code text, p_phone text, p_email text, p_segment text, p_credit_limit numeric, p_payment_terms_days integer, p_null_policy text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_upsert_customer(p_company_id uuid, p_name text, p_code text, p_phone text, p_email text, p_segment text, p_credit_limit numeric, p_payment_terms_days integer, p_null_policy text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_upsert_product(p_company_id uuid, p_sku text, p_name text, p_unit text, p_cost_price numeric, p_selling_price numeric, p_min_stock numeric, p_reorder_point numeric, p_is_active boolean, p_null_policy text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_upsert_product(p_company_id uuid, p_sku text, p_name text, p_unit text, p_cost_price numeric, p_selling_price numeric, p_min_stock numeric, p_reorder_point numeric, p_is_active boolean, p_null_policy text) TO authenticated;
GRANT ALL ON FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid, p_subtotal numeric, p_tax_amount numeric, p_total numeric, p_paid_amount numeric, p_status text, p_null_policy text) TO authenticated;
REVOKE ALL ON FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid, p_customer_name text, p_subtotal numeric, p_tax_amount numeric, p_total numeric, p_paid_amount numeric, p_status text, p_null_policy text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_upsert_sales_invoice(p_company_id uuid, p_invoice_number text, p_invoice_date date, p_customer_id uuid, p_customer_name text, p_subtotal numeric, p_tax_amount numeric, p_total numeric, p_paid_amount numeric, p_status text, p_null_policy text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_continuous_trust_healthy(p_certificate_key text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trust_certificate_valid(p_certificate_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_recommendation_to_decision(p_recommendation_id uuid, p_decision_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_alert_read(p_alert_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_alert_read(p_alert_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_import_key(input text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.normalize_import_key(input text) TO authenticated;
REVOKE ALL ON FUNCTION public.notify_decision_work_item(p_work_item_id uuid, p_title text, p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_decision_work_item(p_work_item_id uuid, p_title text, p_description text) TO authenticated;
REVOKE ALL ON FUNCTION public.phase_l_production_autonomy_health() FROM PUBLIC;
GRANT ALL ON FUNCTION public.phase_l_production_autonomy_health() TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT SELECT,INSERT ON TABLE public.orders TO authenticated;
REVOKE ALL ON FUNCTION public.prepare_e2e_order(p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_e2e_order(p_order_id uuid) TO authenticated;
GRANT SELECT ON TABLE public.company_memberships TO authenticated;
REVOKE ALL ON FUNCTION public.provision_e2e_test_membership(p_company_id uuid, p_user_id uuid, p_role text, p_is_default boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.provision_e2e_test_membership(p_company_id uuid, p_user_id uuid, p_role text, p_is_default boolean) TO service_role;
GRANT ALL ON FUNCTION public.queue_report_run(p_company_id uuid, p_report_id uuid, p_requested_by uuid, p_idempotency_key text, p_request_fingerprint text, p_source_snapshot_id uuid, p_parameters jsonb, p_formats jsonb, p_input_fingerprint text, p_max_attempts integer) TO authenticated;
GRANT ALL ON FUNCTION public.record_control_plane_health(p_overall_score numeric, p_evidence_score numeric, p_data_quality_score numeric, p_forecast_score numeric, p_decision_score numeric, p_trust_score numeric, p_critical_blocker_count integer, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.record_decision_outcome(p_decision_fingerprint text, p_evidence_snapshot_id text, p_action_id text, p_observed_at timestamp with time zone, p_label text, p_actual_value numeric, p_expected_value numeric, p_impact_value numeric, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_decision_outcome(p_decision_fingerprint text, p_evidence_snapshot_id text, p_action_id text, p_observed_at timestamp with time zone, p_label text, p_actual_value numeric, p_expected_value numeric, p_impact_value numeric, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.record_entitlement_usage(p_capability text, p_quantity numeric, p_period text, p_idempotency_key text) TO authenticated;
GRANT ALL ON FUNCTION public.record_executive_evidence_edge(p_source_type text, p_source_key text, p_target_type text, p_target_key text, p_relation text, p_weight numeric, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.record_recommendation_outcome(p_recommendation_key text, p_observed_at timestamp with time zone, p_expected_impact numeric, p_actual_impact numeric, p_outcome_quality numeric, p_status text, p_decision_id uuid, p_evidence jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_recommendation_outcome(p_recommendation_key text, p_observed_at timestamp with time zone, p_expected_impact numeric, p_actual_impact numeric, p_outcome_quality numeric, p_status text, p_decision_id uuid, p_evidence jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.record_watched_report_file(p_folder_id uuid, p_relative_path text, p_content_hash text, p_size_bytes bigint, p_modified_at timestamp with time zone, p_state text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_watched_report_file(p_folder_id uuid, p_relative_path text, p_content_hash text, p_size_bytes bigint, p_modified_at timestamp with time zone, p_state text) TO authenticated;
REVOKE ALL ON FUNCTION public.recover_completed_report_execution_result(p_company_id uuid, p_import_job_id uuid, p_report_execution_job_id uuid, p_entity_type text, p_source_hash text, p_row_count integer, p_rendered_output jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_completed_report_execution_result(p_company_id uuid, p_import_job_id uuid, p_report_execution_job_id uuid, p_entity_type text, p_source_hash text, p_row_count integer, p_rendered_output jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.recover_expired_report_execution_jobs(p_company_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_expired_report_execution_jobs(p_company_id uuid, p_limit integer) TO service_role;
REVOKE ALL ON FUNCTION public.recover_missing_report_rendered_outputs(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_missing_report_rendered_outputs(p_company_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.recover_missing_source_analysis_snapshots(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_missing_source_analysis_snapshots(p_company_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_report_evidence_passport(p_company_id uuid, p_job_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_report_evidence_passport(p_company_id uuid, p_job_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rehydrate_legacy_import_job(p_company_id uuid, p_file_record_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rehydrate_legacy_import_job(p_company_id uuid, p_file_record_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.release_is_verified(p_release_key text) TO authenticated;
GRANT ALL ON FUNCTION public.remove_alternative_item_group_member(p_company_id uuid, p_member_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.remove_cart_item(p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.remove_cart_item(p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_cart_item(p_product_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.report_receivables_snapshot(p_page integer, p_page_size integer, p_as_of_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_receivables_snapshot(p_page integer, p_page_size integer, p_as_of_date date) TO authenticated;
REVOKE ALL ON FUNCTION public.request_decision_approval(p_decision_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_decision_approval(p_decision_id uuid, p_reason text) TO authenticated;
REVOKE ALL ON FUNCTION public.retry_report_execution_job(p_job_id uuid, p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retry_report_execution_job(p_job_id uuid, p_company_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_cart_item(p_product_id uuid, p_quantity integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_cart_item(p_product_id uuid, p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.set_cart_item(p_product_id uuid, p_quantity integer) TO service_role;
REVOKE ALL ON FUNCTION public.start_decision_work_item(p_work_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.start_decision_work_item(p_work_item_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_recommendation_status(p_recommendation_id uuid, p_status text) FROM PUBLIC;
GRANT SELECT ON TABLE public.autonomy_certification_runs TO authenticated;
GRANT SELECT ON TABLE public.autonomy_rollback_drills TO authenticated;
GRANT SELECT ON TABLE public.backup_verification_runs TO authenticated;
GRANT SELECT ON TABLE public.business_intelligence_decisions TO authenticated;
GRANT SELECT ON TABLE public.canonical_dataset_records TO authenticated;
GRANT SELECT,INSERT ON TABLE public.canonical_import_commits TO authenticated;
GRANT ALL ON TABLE public.canonical_import_repair_history TO service_role;
GRANT SELECT ON TABLE public.cart_items TO authenticated;
GRANT ALL ON TABLE public.cart_items TO service_role;
GRANT SELECT ON TABLE public.carts TO authenticated;
GRANT ALL ON TABLE public.carts TO service_role;
GRANT SELECT ON TABLE public.cash_accounts TO authenticated;
GRANT ALL ON TABLE public.cash_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.client_ui_settings TO authenticated;
GRANT ALL ON TABLE public.client_ui_settings TO service_role;
GRANT SELECT ON TABLE public.companies TO authenticated;
GRANT SELECT ON TABLE public.customer_credit_accounts TO authenticated;
GRANT ALL ON TABLE public.customer_credit_accounts TO service_role;
GRANT SELECT ON TABLE public.customer_invitations TO authenticated;
GRANT ALL ON TABLE public.customer_invitations TO service_role;
GRANT SELECT ON TABLE public.customer_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.customer_ledger_entries TO service_role;
GRANT SELECT ON TABLE public.customer_price_tiers TO authenticated;
GRANT ALL ON TABLE public.customer_price_tiers TO service_role;
GRANT SELECT ON TABLE public.decision_action_receipts TO authenticated;
GRANT SELECT ON TABLE public.decision_approvals TO authenticated;
GRANT SELECT ON TABLE public.decision_outcomes TO authenticated;
GRANT SELECT ON TABLE public.decision_work_items TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.import_job_rows TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.import_rows TO authenticated;
GRANT SELECT ON TABLE public.metric_governance_audit TO authenticated;
GRANT ALL ON TABLE public.operational_task_proposals TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.operational_task_proposals TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT SELECT ON TABLE public.order_outbox_events TO authenticated;
GRANT ALL ON TABLE public.order_outbox_events TO service_role;
GRANT SELECT ON TABLE public.order_status_history TO authenticated;
GRANT ALL ON TABLE public.order_status_history TO service_role;
GRANT SELECT ON TABLE public.order_template_items TO authenticated;
GRANT ALL ON TABLE public.order_template_items TO service_role;
GRANT SELECT ON TABLE public.order_templates TO authenticated;
GRANT ALL ON TABLE public.order_templates TO service_role;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.recommendation_outcomes TO authenticated;
GRANT SELECT ON TABLE public.report_evidence_passports TO authenticated;
GRANT SELECT ON TABLE public.report_evidence_snapshots TO authenticated;
GRANT SELECT ON TABLE public.report_execution_tasks TO authenticated;
GRANT ALL ON TABLE public.report_execution_tasks TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sale_items TO authenticated;
GRANT ALL ON TABLE public.sale_items TO service_role;
GRANT SELECT,INSERT ON TABLE public.source_analysis_snapshots TO authenticated;
GRANT ALL ON TABLE public.source_analysis_snapshots TO service_role;
GRANT SELECT ON TABLE public.synonym_dictionary TO authenticated;
GRANT SELECT ON TABLE public.trust_certifications TO authenticated;
-- Storage tenant isolation contract.
-- Object paths MUST be rooted at <company_id>/... for browser/API access.
-- Service-role/trusted automation remains outside these client RLS policies.

create policy "storage_objects_select_current_tenant"
on storage.objects
for select
to authenticated
using (
  (storage.foldername(name))[1] = (select current_company_id()::text)
);

create policy "storage_objects_insert_current_tenant"
on storage.objects
for insert
to authenticated
with check (
  (storage.foldername(name))[1] = (select current_company_id()::text)
  and owner_id = (select auth.uid()::text)
);

create policy "storage_objects_update_current_tenant_owner"
on storage.objects
for update
to authenticated
using (
  (storage.foldername(name))[1] = (select current_company_id()::text)
  and owner_id = (select auth.uid()::text)
)
with check (
  (storage.foldername(name))[1] = (select current_company_id()::text)
  and owner_id = (select auth.uid()::text)
);

create policy "storage_objects_delete_current_tenant_owner"
on storage.objects
for delete
to authenticated
using (
  (storage.foldername(name))[1] = (select current_company_id()::text)
  and owner_id = (select auth.uid()::text)
);

revoke all on storage.objects from anon;
-- Canonical private application document bucket for tenant-scoped storage runtime.
-- Object names remain rooted at <company_id>/... and are protected by the
-- storage.objects tenant/owner policies declared in 20260831010000.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

