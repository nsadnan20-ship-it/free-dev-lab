export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          metric_value: number | null
          severity: string
          threshold: number | null
          title: string
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          metric_value?: number | null
          severity?: string
          threshold?: number | null
          title: string
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          metric_value?: number | null
          severity?: string
          threshold?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      alternative_item_group_members: {
        Row: {
          company_id: string
          conversion_factor: number
          created_at: string
          group_id: string
          id: string
          sku: string
        }
        Insert: {
          company_id: string
          conversion_factor?: number
          created_at?: string
          group_id: string
          id?: string
          sku: string
        }
        Update: {
          company_id?: string
          conversion_factor?: number
          created_at?: string
          group_id?: string
          id?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "alternative_item_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "alternative_item_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      alternative_item_groups: {
        Row: {
          base_unit: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          base_unit?: string
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      analyses: {
        Row: {
          archetype: string | null
          available_count: number
          column_count: number
          created_at: string
          domain: string | null
          engine_version: string
          file_hash: string | null
          file_name: string
          id: string
          quality_score: number | null
          result: Json
          row_count: number
          user_id: string
        }
        Insert: {
          archetype?: string | null
          available_count?: number
          column_count?: number
          created_at?: string
          domain?: string | null
          engine_version: string
          file_hash?: string | null
          file_name: string
          id?: string
          quality_score?: number | null
          result: Json
          row_count?: number
          user_id?: string
        }
        Update: {
          archetype?: string | null
          available_count?: number
          column_count?: number
          created_at?: string
          domain?: string | null
          engine_version?: string
          file_hash?: string | null
          file_name?: string
          id?: string
          quality_score?: number | null
          result?: Json
          row_count?: number
          user_id?: string
        }
        Relationships: []
      }
      anomaly_correlations: {
        Row: {
          company_id: string
          confidence: number | null
          correlation_key: string
          created_at: string
          domain: string
          evidence: Json
          id: string
          severity: string
          signal_count: number
          signals: Json
          status: string
        }
        Insert: {
          company_id: string
          confidence?: number | null
          correlation_key: string
          created_at?: string
          domain: string
          evidence?: Json
          id?: string
          severity: string
          signal_count: number
          signals?: Json
          status?: string
        }
        Update: {
          company_id?: string
          confidence?: number | null
          correlation_key?: string
          created_at?: string
          domain?: string
          evidence?: Json
          id?: string
          severity?: string
          signal_count?: number
          signals?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_correlations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_verification_runs: {
        Row: {
          artifact_sha256: string
          company_id: string | null
          evidence: Json
          expected_sha256: string
          id: string
          status: string
          verified_at: string
        }
        Insert: {
          artifact_sha256: string
          company_id?: string | null
          evidence?: Json
          expected_sha256: string
          id?: string
          status: string
          verified_at?: string
        }
        Update: {
          artifact_sha256?: string
          company_id?: string | null
          evidence?: Json
          expected_sha256?: string
          id?: string
          status?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_verification_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          source: string | null
          user_label: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source?: string | null
          user_label?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          source?: string | null
          user_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_execution_receipts: {
        Row: {
          action_id: string
          attempt: number
          company_id: string
          created_at: string
          decision_fingerprint: string
          error_code: string | null
          evidence_snapshot_id: string
          finished_at: string | null
          id: string
          idempotency_key: string
          outcome: Json
          receipt_id: string
          started_at: string
          status: string
        }
        Insert: {
          action_id: string
          attempt: number
          company_id: string
          created_at?: string
          decision_fingerprint: string
          error_code?: string | null
          evidence_snapshot_id: string
          finished_at?: string | null
          id?: string
          idempotency_key: string
          outcome?: Json
          receipt_id: string
          started_at: string
          status: string
        }
        Update: {
          action_id?: string
          attempt?: number
          company_id?: string
          created_at?: string
          decision_fingerprint?: string
          error_code?: string | null
          evidence_snapshot_id?: string
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          outcome?: Json
          receipt_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_execution_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_remediation_runs: {
        Row: {
          approval_required: boolean
          company_id: string | null
          completed_at: string | null
          component: string
          created_at: string
          evidence: Json
          id: string
          idempotency_key: string
          remediation_key: string
          status: string
        }
        Insert: {
          approval_required?: boolean
          company_id?: string | null
          completed_at?: string | null
          component: string
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key: string
          remediation_key: string
          status: string
        }
        Update: {
          approval_required?: boolean
          company_id?: string | null
          completed_at?: string | null
          component?: string
          created_at?: string
          evidence?: Json
          id?: string
          idempotency_key?: string
          remediation_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_remediation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_certification_evidence: {
        Row: {
          certification_key: string
          company_id: string
          created_at: string
          evidence: Json
          gate_key: string
          id: string
          measured_value: number | null
          passed: boolean
          threshold: number | null
        }
        Insert: {
          certification_key: string
          company_id: string
          created_at?: string
          evidence?: Json
          gate_key: string
          id?: string
          measured_value?: number | null
          passed: boolean
          threshold?: number | null
        }
        Update: {
          certification_key?: string
          company_id?: string
          created_at?: string
          evidence?: Json
          gate_key?: string
          id?: string
          measured_value?: number | null
          passed?: boolean
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_certification_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_certification_runs: {
        Row: {
          certification_key: string
          company_id: string
          created_at: string
          evidence: Json
          evidence_quality: number | null
          gates: Json
          id: string
          isolation_verified: boolean
          risk_budget_valid: boolean
          rollback_verified: boolean
          status: string
          trust_score: number | null
        }
        Insert: {
          certification_key: string
          company_id: string
          created_at?: string
          evidence?: Json
          evidence_quality?: number | null
          gates?: Json
          id?: string
          isolation_verified?: boolean
          risk_budget_valid?: boolean
          rollback_verified?: boolean
          status: string
          trust_score?: number | null
        }
        Update: {
          certification_key?: string
          company_id?: string
          created_at?: string
          evidence?: Json
          evidence_quality?: number | null
          gates?: Json
          id?: string
          isolation_verified?: boolean
          risk_budget_valid?: boolean
          rollback_verified?: boolean
          status?: string
          trust_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_certification_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_domain_controls: {
        Row: {
          company_id: string
          domain_key: string
          enabled: boolean
          evidence: Json
          id: string
          last_certified_at: string | null
          max_risk_budget: number
          min_confidence: number
          min_evidence_quality: number
          rollback_enabled: boolean
          trust_state: string
        }
        Insert: {
          company_id: string
          domain_key: string
          enabled?: boolean
          evidence?: Json
          id?: string
          last_certified_at?: string | null
          max_risk_budget?: number
          min_confidence?: number
          min_evidence_quality?: number
          rollback_enabled?: boolean
          trust_state?: string
        }
        Update: {
          company_id?: string
          domain_key?: string
          enabled?: boolean
          evidence?: Json
          id?: string
          last_certified_at?: string | null
          max_risk_budget?: number
          min_confidence?: number
          min_evidence_quality?: number
          rollback_enabled?: boolean
          trust_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_domain_controls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_rollback_drills: {
        Row: {
          company_id: string
          drill_key: string
          evidence: Json
          executed_at: string | null
          id: string
          pre_state: Json
          rollback_state: Json
          status: string
          target_domain: string
        }
        Insert: {
          company_id: string
          drill_key: string
          evidence?: Json
          executed_at?: string | null
          id?: string
          pre_state?: Json
          rollback_state?: Json
          status?: string
          target_domain: string
        }
        Update: {
          company_id?: string
          drill_key?: string
          evidence?: Json
          executed_at?: string | null
          id?: string
          pre_state?: Json
          rollback_state?: Json
          status?: string
          target_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_rollback_drills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_verification_runs: {
        Row: {
          backup_completed_at: string | null
          backup_ref: string
          backup_started_at: string | null
          company_id: string | null
          evidence: Json
          id: string
          integrity_hash: string | null
          restore_completed_at: string | null
          restore_started_at: string | null
          rpo_seconds: number | null
          rto_seconds: number | null
          status: string
          verified_at: string
        }
        Insert: {
          backup_completed_at?: string | null
          backup_ref: string
          backup_started_at?: string | null
          company_id?: string | null
          evidence?: Json
          id?: string
          integrity_hash?: string | null
          restore_completed_at?: string | null
          restore_started_at?: string | null
          rpo_seconds?: number | null
          rto_seconds?: number | null
          status: string
          verified_at?: string
        }
        Update: {
          backup_completed_at?: string | null
          backup_ref?: string
          backup_started_at?: string | null
          company_id?: string | null
          evidence?: Json
          id?: string
          integrity_hash?: string | null
          restore_completed_at?: string | null
          restore_started_at?: string | null
          rpo_seconds?: number | null
          rto_seconds?: number | null
          status?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_verification_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          amount_minor: number
          company_id: string
          created_at: string
          currency: string
          id: string
          period_end: string | null
          period_start: string | null
          provider: string | null
          provider_invoice_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_invoice_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          provider?: string | null
          provider_invoice_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_liveness_probes: {
        Row: {
          company_id: string | null
          evidence: Json
          id: string
          observed_at: string
          probe_key: string
          provider: string
          replay_safe: boolean
          status: string
        }
        Insert: {
          company_id?: string | null
          evidence?: Json
          id?: string
          observed_at?: string
          probe_key: string
          provider: string
          replay_safe?: boolean
          status: string
        }
        Update: {
          company_id?: string | null
          evidence?: Json
          id?: string
          observed_at?: string
          probe_key?: string
          provider?: string
          replay_safe?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_liveness_probes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plan_capabilities: {
        Row: {
          capability: string
          created_at: string
          enabled: boolean
          id: string
          metadata: Json
          monthly_limit: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          capability: string
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          monthly_limit?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          capability?: string
          created_at?: string
          enabled?: boolean
          id?: string
          metadata?: Json
          monthly_limit?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_plan_capabilities_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string | null
          description: string | null
          id: string
          interval: string
          metadata: Json
          monthly_amount_minor: number | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          interval?: string
          metadata?: Json
          monthly_amount_minor?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          interval?: string
          metadata?: Json
          monthly_amount_minor?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_subscription_events: {
        Row: {
          company_id: string
          event_type: string
          from_status: string | null
          id: string
          occurred_at: string
          payload: Json
          payload_hash: string | null
          provider: string
          provider_event_id: string
          subscription_id: string | null
          to_status: string | null
        }
        Insert: {
          company_id: string
          event_type: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          payload_hash?: string | null
          provider: string
          provider_event_id: string
          subscription_id?: string | null
          to_status?: string | null
        }
        Update: {
          company_id?: string
          event_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          payload_hash?: string | null
          provider?: string
          provider_event_id?: string
          subscription_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscription_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "billing_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_ends_at: string | null
          id: string
          metadata: Json
          plan_id: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          started_at: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_ends_at?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_ends_at?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          started_at?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_usage_events: {
        Row: {
          capability: string
          company_id: string
          id: string
          idempotency_key: string
          metadata: Json
          occurred_at: string
          period_start: string
          quantity: number
          source: string
        }
        Insert: {
          capability: string
          company_id: string
          id?: string
          idempotency_key: string
          metadata?: Json
          occurred_at?: string
          period_start: string
          quantity: number
          source?: string
        }
        Update: {
          capability?: string
          company_id?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          occurred_at?: string
          period_start?: string
          quantity?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          company_id: string | null
          event_id: string
          event_type: string
          id: string
          payload_hash: string
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          company_id?: string | null
          event_id: string
          event_type: string
          id?: string
          payload_hash: string
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          company_id?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bounded_scenario_runs: {
        Row: {
          company_id: string
          constraints: Json
          created_at: string
          horizon_days: number
          id: string
          input_evidence: Json
          objective: string
          protected_liquidity: number
          result: Json
          risk_budget: number
          scenario_key: string
          state_snapshot_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          constraints?: Json
          created_at?: string
          horizon_days: number
          id?: string
          input_evidence?: Json
          objective: string
          protected_liquidity?: number
          result?: Json
          risk_budget: number
          scenario_key: string
          state_snapshot_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          constraints?: Json
          created_at?: string
          horizon_days?: number
          id?: string
          input_evidence?: Json
          objective?: string
          protected_liquidity?: number
          result?: Json
          risk_budget?: number
          scenario_key?: string
          state_snapshot_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bounded_scenario_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bounded_scenario_runs_state_snapshot_id_fkey"
            columns: ["state_snapshot_id"]
            isOneToOne: false
            referencedRelation: "business_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      business_intelligence_decisions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          confidence: number | null
          created_at: string
          decision_key: string
          decision_type: string
          evidence: Json
          executed_at: string | null
          expected_impact: number | null
          id: string
          policy_key: string | null
          recommendation_id: string | null
          rejection_reason: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          confidence?: number | null
          created_at?: string
          decision_key: string
          decision_type: string
          evidence?: Json
          executed_at?: string | null
          expected_impact?: number | null
          id?: string
          policy_key?: string | null
          recommendation_id?: string | null
          rejection_reason?: string | null
          status: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          confidence?: number | null
          created_at?: string
          decision_key?: string
          decision_type?: string
          evidence?: Json
          executed_at?: string | null
          expected_impact?: number | null
          id?: string
          policy_key?: string | null
          recommendation_id?: string | null
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_intelligence_decisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_intelligence_decisions_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_risk_budgets: {
        Row: {
          budget_key: string
          company_id: string
          consumed_risk: number
          domain: string
          effective_at: string
          evidence: Json
          expires_at: string | null
          id: string
          max_risk: number
          status: string
        }
        Insert: {
          budget_key: string
          company_id: string
          consumed_risk?: number
          domain: string
          effective_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          max_risk: number
          status: string
        }
        Update: {
          budget_key?: string
          company_id?: string
          consumed_risk?: number
          domain?: string
          effective_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          max_risk?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_risk_budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      business_state_snapshots: {
        Row: {
          company_id: string
          demand: Json
          evidence: Json
          id: string
          inventory: Json
          liquidity: Json
          observed_at: string
          operations: Json
          quality_score: number | null
          sales: Json
          snapshot_key: string
          source_version: string
        }
        Insert: {
          company_id: string
          demand?: Json
          evidence?: Json
          id?: string
          inventory?: Json
          liquidity?: Json
          observed_at?: string
          operations?: Json
          quality_score?: number | null
          sales?: Json
          snapshot_key: string
          source_version: string
        }
        Update: {
          company_id?: string
          demand?: Json
          evidence?: Json
          id?: string
          inventory?: Json
          liquidity?: Json
          observed_at?: string
          operations?: Json
          quality_score?: number | null
          sales?: Json
          snapshot_key?: string
          source_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_state_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_dataset_records: {
        Row: {
          company_id: string
          created_at: string
          data: Json
          id: string
          import_job_id: string | null
          provenance: Json
          record_key: string
          row_number: number
          semantic_domain: string
          source_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data: Json
          id?: string
          import_job_id?: string | null
          provenance: Json
          record_key: string
          row_number: number
          semantic_domain: string
          source_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
          import_job_id?: string | null
          provenance?: Json
          record_key?: string
          row_number?: number
          semantic_domain?: string
          source_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_dataset_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_dataset_records_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_import_commits: {
        Row: {
          committed_at: string
          committed_count: number
          committed_ids: Json
          company_id: string
          entity_type: string
          id: string
          source_hash: string
        }
        Insert: {
          committed_at?: string
          committed_count?: number
          committed_ids?: Json
          company_id: string
          entity_type: string
          id?: string
          source_hash: string
        }
        Update: {
          committed_at?: string
          committed_count?: number
          committed_ids?: Json
          company_id?: string
          entity_type?: string
          id?: string
          source_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_import_commits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_import_repair_history: {
        Row: {
          company_id: string
          created_at: string
          entity_type: string
          id: string
          parser_version: string
          previous_committed_count: number
          previous_committed_ids: Json
          previous_import_job_id: string | null
          reason: string
          source_hash: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_type: string
          id?: string
          parser_version: string
          previous_committed_count: number
          previous_committed_ids?: Json
          previous_import_job_id?: string | null
          reason: string
          source_hash: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_type?: string
          id?: string
          parser_version?: string
          previous_committed_count?: number
          previous_committed_ids?: Json
          previous_import_job_id?: string | null
          reason?: string
          source_hash?: string
        }
        Relationships: []
      }
      canonical_text_artifacts: {
        Row: {
          canonical_text: string
          company_id: string
          created_at: string
          extraction_route: string
          id: string
          layout_manifest: Json
          processing_version: string
          provenance: Json
          quality_score: number | null
          source_hash: string
          source_version_id: string
          text_hash: string
        }
        Insert: {
          canonical_text: string
          company_id: string
          created_at?: string
          extraction_route: string
          id?: string
          layout_manifest?: Json
          processing_version: string
          provenance?: Json
          quality_score?: number | null
          source_hash: string
          source_version_id: string
          text_hash: string
        }
        Update: {
          canonical_text?: string
          company_id?: string
          created_at?: string
          extraction_route?: string
          id?: string
          layout_manifest?: Json
          processing_version?: string
          provenance?: Json
          quality_score?: number | null
          source_hash?: string
          source_version_id?: string
          text_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_text_artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_text_artifacts_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_text_provenance: {
        Row: {
          analysis_input_mode: string
          company_id: string
          errors: Json
          extracted_at: string
          extraction_status: string
          file_id: string | null
          folder_id: string | null
          id: string
          source_hash: string
          source_type: string
          text_hash: string | null
          text_storage_path: string | null
          warnings: Json
        }
        Insert: {
          analysis_input_mode: string
          company_id: string
          errors?: Json
          extracted_at?: string
          extraction_status: string
          file_id?: string | null
          folder_id?: string | null
          id?: string
          source_hash: string
          source_type: string
          text_hash?: string | null
          text_storage_path?: string | null
          warnings?: Json
        }
        Update: {
          analysis_input_mode?: string
          company_id?: string
          errors?: Json
          extracted_at?: string
          extraction_status?: string
          file_id?: string | null
          folder_id?: string | null
          id?: string
          source_hash?: string
          source_type?: string
          text_hash?: string | null
          text_storage_path?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "canonical_text_provenance_company_id_file_id_fkey"
            columns: ["company_id", "file_id"]
            isOneToOne: false
            referencedRelation: "watched_report_files"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "canonical_text_provenance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_text_provenance_company_id_folder_id_fkey"
            columns: ["company_id", "folder_id"]
            isOneToOne: false
            referencedRelation: "watched_report_folders"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "canonical_text_provenance_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "watched_report_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_text_provenance_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "watched_report_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_accounts: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          currency: string
          current_balance: number | null
          id: string
          name: string
          opening_balance: number
          received: number
          spent: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          currency: string
          current_balance?: number | null
          id?: string
          name: string
          opening_balance?: number
          received?: number
          spent?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          currency?: string
          current_balance?: number | null
          id?: string
          name?: string
          opening_balance?: number
          received?: number
          spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_branch_company_fkey"
            columns: ["company_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "cash_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ui_settings: {
        Row: {
          config: Json
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ui_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          currency: string
          email: string | null
          id: string
          industry: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          tax_id: string | null
          timezone: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          currency?: string
          email?: string | null
          id?: string
          industry?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          tax_id?: string | null
          timezone?: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          currency?: string
          email?: string | null
          id?: string
          industry?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          tax_id?: string | null
          timezone?: string
        }
        Relationships: []
      }
      company_entitlements: {
        Row: {
          company_id: string
          expires_at: string | null
          plan_id: string | null
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          expires_at?: string | null
          plan_id?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          expires_at?: string | null
          plan_id?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "entitlement_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      control_plane_drift_events: {
        Row: {
          baseline: Json
          company_id: string
          detected_at: string
          deviation: number | null
          domain: string
          drift_key: string
          evidence: Json
          id: string
          observed: Json
          severity: string
          status: string
        }
        Insert: {
          baseline?: Json
          company_id: string
          detected_at?: string
          deviation?: number | null
          domain: string
          drift_key: string
          evidence?: Json
          id?: string
          observed?: Json
          severity: string
          status?: string
        }
        Update: {
          baseline?: Json
          company_id?: string
          detected_at?: string
          deviation?: number | null
          domain?: string
          drift_key?: string
          evidence?: Json
          id?: string
          observed?: Json
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_plane_drift_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      control_plane_health_snapshots: {
        Row: {
          company_id: string
          critical_blocker_count: number
          data_quality_score: number
          decision_score: number
          evidence: Json
          evidence_score: number
          forecast_score: number
          id: string
          observed_at: string
          overall_score: number
          trust_score: number
        }
        Insert: {
          company_id: string
          critical_blocker_count?: number
          data_quality_score: number
          decision_score: number
          evidence?: Json
          evidence_score: number
          forecast_score: number
          id?: string
          observed_at?: string
          overall_score: number
          trust_score: number
        }
        Update: {
          company_id?: string
          critical_blocker_count?: number
          data_quality_score?: number
          decision_score?: number
          evidence?: Json
          evidence_score?: number
          forecast_score?: number
          id?: string
          observed_at?: string
          overall_score?: number
          trust_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "control_plane_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      control_plane_optimization_runs: {
        Row: {
          company_id: string
          completed_at: string | null
          constraints: Json
          created_at: string
          evidence: Json
          id: string
          liquidity_reserved: number | null
          objective: string
          risk_budget: number | null
          run_key: string
          service_level_target: number | null
          solution: Json
          state_snapshot_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          evidence?: Json
          id?: string
          liquidity_reserved?: number | null
          objective: string
          risk_budget?: number | null
          run_key: string
          service_level_target?: number | null
          solution?: Json
          state_snapshot_id?: string | null
          status: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          constraints?: Json
          created_at?: string
          evidence?: Json
          id?: string
          liquidity_reserved?: number | null
          objective?: string
          risk_budget?: number | null
          run_key?: string
          service_level_target?: number | null
          solution?: Json
          state_snapshot_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_plane_optimization_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_plane_optimization_runs_state_snapshot_id_fkey"
            columns: ["state_snapshot_id"]
            isOneToOne: false
            referencedRelation: "business_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_accounts: {
        Row: {
          available_credit: number | null
          company_id: string
          credit_limit: number
          currency: string
          customer_id: string
          id: string
          outstanding_balance: number
          updated_at: string
        }
        Insert: {
          available_credit?: number | null
          company_id: string
          credit_limit?: number
          currency?: string
          customer_id: string
          id?: string
          outstanding_balance?: number
          updated_at?: string
        }
        Update: {
          available_credit?: number | null
          company_id?: string
          credit_limit?: number
          currency?: string
          customer_id?: string
          id?: string
          outstanding_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          customer_id: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_invitations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger_entries: {
        Row: {
          company_id: string
          created_at: string
          credit: number
          customer_id: string
          debit: number
          description: string
          due_date: string | null
          id: string
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          credit?: number
          customer_id: string
          debit?: number
          description: string
          due_date?: string | null
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          credit?: number
          customer_id?: string
          debit?: number
          description?: string
          due_date?: string | null
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_price_tiers: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          customer_id: string
          id: string
          min_quantity: number
          product_id: string
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          min_quantity: number
          product_id: string
          unit_price: number
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          id?: string
          min_quantity?: number
          product_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_price_tiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_price_tiers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          created_at: string | null
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          payment_terms_days: number | null
          phone: string | null
          segment: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string | null
          credit_limit?: number | null
          email?: string | null
          id?: string
          name: string
          payment_terms_days?: number | null
          phone?: string | null
          segment?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string | null
          credit_limit?: number | null
          email?: string | null
          id?: string
          name?: string
          payment_terms_days?: number | null
          phone?: string | null
          segment?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_reports: {
        Row: {
          anomalies: Json | null
          column_profiles: Json | null
          company_id: string
          completeness_score: number | null
          consistency_score: number | null
          created_at: string | null
          duplicates: Json | null
          file_record_id: string | null
          id: string
          job_id: string | null
          missing_values: Json | null
          overall_score: number | null
          statistics: Json | null
          total_columns: number | null
          total_rows: number | null
          uniqueness_score: number | null
          validity_score: number | null
        }
        Insert: {
          anomalies?: Json | null
          column_profiles?: Json | null
          company_id: string
          completeness_score?: number | null
          consistency_score?: number | null
          created_at?: string | null
          duplicates?: Json | null
          file_record_id?: string | null
          id?: string
          job_id?: string | null
          missing_values?: Json | null
          overall_score?: number | null
          statistics?: Json | null
          total_columns?: number | null
          total_rows?: number | null
          uniqueness_score?: number | null
          validity_score?: number | null
        }
        Update: {
          anomalies?: Json | null
          column_profiles?: Json | null
          company_id?: string
          completeness_score?: number | null
          consistency_score?: number | null
          created_at?: string | null
          duplicates?: Json | null
          file_record_id?: string | null
          id?: string
          job_id?: string | null
          missing_values?: Json | null
          overall_score?: number | null
          statistics?: Json | null
          total_columns?: number | null
          total_rows?: number | null
          uniqueness_score?: number | null
          validity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_reports_file_record_id_fkey"
            columns: ["file_record_id"]
            isOneToOne: false
            referencedRelation: "file_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_action_receipts: {
        Row: {
          attempt: number
          company_id: string
          decision_fingerprint: string
          error_code: string | null
          evidence_snapshot_id: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          outcome: Json
          started_at: string
          status: string
          work_item_id: string
        }
        Insert: {
          attempt?: number
          company_id: string
          decision_fingerprint: string
          error_code?: string | null
          evidence_snapshot_id?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          outcome?: Json
          started_at?: string
          status: string
          work_item_id: string
        }
        Update: {
          attempt?: number
          company_id?: string
          decision_fingerprint?: string
          error_code?: string | null
          evidence_snapshot_id?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          outcome?: Json
          started_at?: string
          status?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_action_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_action_receipts_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "decision_work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_approvals: {
        Row: {
          company_id: string
          decided_at: string | null
          decided_by: string | null
          decision_id: string
          evidence: Json
          id: string
          reason: string | null
          requested_at: string
          requested_by: string | null
          status: string
        }
        Insert: {
          company_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id: string
          evidence?: Json
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_id?: string
          evidence?: Json
          id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_approvals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "business_intelligence_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_graph_edges: {
        Row: {
          company_id: string
          created_at: string
          decision_key: string
          evidence: Json
          from_node: string
          id: string
          relation: string
          to_node: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decision_key: string
          evidence?: Json
          from_node: string
          id?: string
          relation: string
          to_node: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decision_key?: string
          evidence?: Json
          from_node?: string
          id?: string
          relation?: string
          to_node?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_graph_edges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_graph_nodes: {
        Row: {
          company_id: string
          confidence: number | null
          created_at: string
          decision_key: string
          evidence: Json
          id: string
          node_key: string
          node_type: string
          source_ref: string | null
          value: Json
        }
        Insert: {
          company_id: string
          confidence?: number | null
          created_at?: string
          decision_key: string
          evidence?: Json
          id?: string
          node_key: string
          node_type: string
          source_ref?: string | null
          value?: Json
        }
        Update: {
          company_id?: string
          confidence?: number | null
          created_at?: string
          decision_key?: string
          evidence?: Json
          id?: string
          node_key?: string
          node_type?: string
          source_ref?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "decision_graph_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_outcomes: {
        Row: {
          action_id: string | null
          actual_value: number | null
          company_id: string
          created_at: string
          decision_fingerprint: string
          evidence_snapshot_id: string
          expected_value: number | null
          id: string
          impact_value: number | null
          label: string
          notes: string | null
          observed_at: string
          observed_by: string | null
        }
        Insert: {
          action_id?: string | null
          actual_value?: number | null
          company_id: string
          created_at?: string
          decision_fingerprint: string
          evidence_snapshot_id: string
          expected_value?: number | null
          id?: string
          impact_value?: number | null
          label: string
          notes?: string | null
          observed_at: string
          observed_by?: string | null
        }
        Update: {
          action_id?: string | null
          actual_value?: number | null
          company_id?: string
          created_at?: string
          decision_fingerprint?: string
          evidence_snapshot_id?: string
          expected_value?: number | null
          id?: string
          impact_value?: number | null
          label?: string
          notes?: string | null
          observed_at?: string
          observed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_outcomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_portfolio_items: {
        Row: {
          company_id: string
          confidence_score: number
          decision_key: string
          escalation_required: boolean
          evidence: Json
          id: string
          materiality_score: number
          priority_score: number
          risk_consumption: number
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          confidence_score?: number
          decision_key: string
          escalation_required?: boolean
          evidence?: Json
          id?: string
          materiality_score?: number
          priority_score?: number
          risk_consumption?: number
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          confidence_score?: number
          decision_key?: string
          escalation_required?: boolean
          evidence?: Json
          id?: string
          materiality_score?: number
          priority_score?: number
          risk_consumption?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_portfolio_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_work_items: {
        Row: {
          actual_impact: number | null
          assignee_id: string | null
          assignee_label: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          decision_id: string
          department: string
          description: string | null
          due_at: string | null
          evidence_refs: Json
          expected_impact: number | null
          id: string
          priority: string
          recommendation_id: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_impact?: number | null
          assignee_id?: string | null
          assignee_label?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          decision_id: string
          department: string
          description?: string | null
          due_at?: string | null
          evidence_refs?: Json
          expected_impact?: number | null
          id?: string
          priority?: string
          recommendation_id?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_impact?: number | null
          assignee_id?: string | null
          assignee_label?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          decision_id?: string
          department?: string
          description?: string | null
          due_at?: string | null
          evidence_refs?: Json
          expected_impact?: number | null
          id?: string
          priority?: string
          recommendation_id?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_work_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_work_items_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "business_intelligence_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_work_items_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          analysis_id: string
          created_at: string
          finding_id: string
          id: string
          note: string | null
          user_id: string
          verdict: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          finding_id: string
          id?: string
          note?: string | null
          user_id?: string
          verdict: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          finding_id?: string
          id?: string
          note?: string | null
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_verification_runs: {
        Row: {
          completed_at: string | null
          critical_failures: number
          environment: string
          evidence: Json
          health_window_seconds: number | null
          id: string
          phase: string
          release_manifest_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          critical_failures?: number
          environment: string
          evidence?: Json
          health_window_seconds?: number | null
          id?: string
          phase: string
          release_manifest_id: string
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          critical_failures?: number
          environment?: string
          evidence?: Json
          health_window_seconds?: number | null
          id?: string
          phase?: string
          release_manifest_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployment_verification_runs_release_manifest_id_fkey"
            columns: ["release_manifest_id"]
            isOneToOne: false
            referencedRelation: "release_evidence_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_plan_capabilities: {
        Row: {
          capability: string
          enabled: boolean
          plan_id: string
          quota: number
        }
        Insert: {
          capability: string
          enabled?: boolean
          plan_id: string
          quota?: number
        }
        Update: {
          capability?: string
          enabled?: boolean
          plan_id?: string
          quota?: number
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_plan_capabilities_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "entitlement_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_plans: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      entitlement_usage_events: {
        Row: {
          billing_period: string
          capability: string
          company_id: string
          id: string
          idempotency_key: string
          occurred_at: string
          quantity: number
        }
        Insert: {
          billing_period: string
          capability: string
          company_id: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          quantity: number
        }
        Update: {
          billing_period?: string
          capability?: string
          company_id?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_usage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_evidence_graph: {
        Row: {
          company_id: string
          created_at: string
          evidence: Json
          id: string
          relation: string
          source_key: string
          source_type: string
          target_key: string
          target_type: string
          weight: number
        }
        Insert: {
          company_id: string
          created_at?: string
          evidence?: Json
          id?: string
          relation: string
          source_key: string
          source_type: string
          target_key: string
          target_type: string
          weight?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          relation?: string
          source_key?: string
          source_type?: string
          target_key?: string
          target_type?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_evidence_graph_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_kpi_lineage: {
        Row: {
          company_id: string
          evidence_hash: string
          id: string
          kpi_key: string
          observed_at: string
          quality: string
          source_refs: Json
          transformation_refs: Json
          value: number
        }
        Insert: {
          company_id: string
          evidence_hash: string
          id?: string
          kpi_key: string
          observed_at?: string
          quality: string
          source_refs?: Json
          transformation_refs?: Json
          value: number
        }
        Update: {
          company_id?: string
          evidence_hash?: string
          id?: string
          kpi_key?: string
          observed_at?: string
          quality?: string
          source_refs?: Json
          transformation_refs?: Json
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "executive_kpi_lineage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      file_records: {
        Row: {
          company_id: string
          created_at: string | null
          detected_encoding: string | null
          detected_format: string | null
          duplicate_of: string | null
          file_extension: string | null
          file_hash: string | null
          file_mime: string | null
          file_name: string
          file_size: number | null
          id: string
          is_duplicate: boolean | null
          magic_bytes: string | null
          metadata: Json | null
          security_issues: Json | null
          security_status: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          detected_encoding?: string | null
          detected_format?: string | null
          duplicate_of?: string | null
          file_extension?: string | null
          file_hash?: string | null
          file_mime?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          is_duplicate?: boolean | null
          magic_bytes?: string | null
          metadata?: Json | null
          security_issues?: Json | null
          security_status?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          detected_encoding?: string | null
          detected_format?: string | null
          duplicate_of?: string | null
          file_extension?: string | null
          file_hash?: string | null
          file_mime?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          is_duplicate?: boolean | null
          magic_bytes?: string | null
          metadata?: Json | null
          security_issues?: Json | null
          security_status?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_records_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "file_records"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          company_id: string
          confidence: string | null
          created_at: string | null
          data_points: number | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          forecast_value: number | null
          id: string
          lower_bound: number | null
          metric: string
          model_name: string | null
          period: string
          quality_score: number | null
          upper_bound: number | null
        }
        Insert: {
          company_id: string
          confidence?: string | null
          created_at?: string | null
          data_points?: number | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          forecast_value?: number | null
          id?: string
          lower_bound?: number | null
          metric: string
          model_name?: string | null
          period: string
          quality_score?: number | null
          upper_bound?: number | null
        }
        Update: {
          company_id?: string
          confidence?: string | null
          created_at?: string | null
          data_points?: number | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          forecast_value?: number | null
          id?: string
          lower_bound?: number | null
          metric?: string
          model_name?: string | null
          period?: string
          quality_score?: number | null
          upper_bound?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_alerts: {
        Row: {
          alert_key: string
          company_id: string
          created_at: string
          evidence: Json
          id: string
          reason: string
          resolved_at: string | null
          severity: string
          status: string
        }
        Insert: {
          alert_key: string
          company_id: string
          created_at?: string
          evidence?: Json
          id?: string
          reason: string
          resolved_at?: string | null
          severity: string
          status?: string
        }
        Update: {
          alert_key?: string
          company_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          reason?: string
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_policies: {
        Row: {
          company_id: string
          effective_at: string
          evidence: Json
          expires_at: string | null
          id: string
          policy_key: string
          priority: number
          rules: Json
          status: string
          version: number
        }
        Insert: {
          company_id: string
          effective_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          policy_key: string
          priority?: number
          rules?: Json
          status: string
          version?: number
        }
        Update: {
          company_id?: string
          effective_at?: string
          evidence?: Json
          expires_at?: string | null
          id?: string
          policy_key?: string
          priority?: number
          rules?: Json
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      governed_scenarios: {
        Row: {
          assumptions: Json
          company_id: string
          confidence: number | null
          created_at: string
          expires_at: string | null
          id: string
          outputs: Json
          risk_score: number | null
          scenario_key: string
          status: string
        }
        Insert: {
          assumptions?: Json
          company_id: string
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          outputs?: Json
          risk_score?: number | null
          scenario_key: string
          status?: string
        }
        Update: {
          assumptions?: Json
          company_id?: string
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          outputs?: Json
          risk_score?: number | null
          scenario_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "governed_scenarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      human_override_feedback: {
        Row: {
          company_id: string
          created_at: string
          decision_key: string
          evidence: Json
          id: string
          learned_signal: Json
          original_status: string
          override_status: string
          reason: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decision_key: string
          evidence?: Json
          id?: string
          learned_signal?: Json
          original_status: string
          override_status: string
          reason: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decision_key?: string
          evidence?: Json
          id?: string
          learned_signal?: Json
          original_status?: string
          override_status?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_override_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_field_lineage: {
        Row: {
          canonical_field: string
          company_id: string
          confidence: number | null
          created_at: string
          decision: string
          evidence: Json
          id: string
          job_id: string
          job_row_id: string | null
          source_field: string
          source_locator: string | null
          target_column: string | null
          target_table: string | null
        }
        Insert: {
          canonical_field: string
          company_id: string
          confidence?: number | null
          created_at?: string
          decision?: string
          evidence?: Json
          id?: string
          job_id: string
          job_row_id?: string | null
          source_field: string
          source_locator?: string | null
          target_column?: string | null
          target_table?: string | null
        }
        Update: {
          canonical_field?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          decision?: string
          evidence?: Json
          id?: string
          job_id?: string
          job_row_id?: string | null
          source_field?: string
          source_locator?: string | null
          target_column?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_field_lineage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_lineage_job_company_fk"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_field_lineage_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_lineage_job_row_id_fkey"
            columns: ["job_row_id"]
            isOneToOne: false
            referencedRelation: "import_job_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_lineage_row_company_fk"
            columns: ["job_row_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_job_rows"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          error_type: string | null
          id: string
          job_id: string
          lineage: Json | null
          mapped_data: Json | null
          row_number: number
          source_data: Json | null
          status: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          job_id: string
          lineage?: Json | null
          mapped_data?: Json | null
          row_number: number
          source_data?: Json | null
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          job_id?: string
          lineage?: Json | null
          mapped_data?: Json | null
          row_number?: number
          source_data?: Json | null
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_company_job_fk"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_job_rows_job_company_fk"
            columns: ["job_id", "company_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "import_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          duplicate_rows: number | null
          duration_ms: number | null
          entity_type: string | null
          error_message: string | null
          eta_seconds: number | null
          file_name: string | null
          file_record_id: string | null
          id: string
          idempotency_key: string | null
          invalid_rows: number | null
          job_type: string | null
          processed_rows: number | null
          processing_mode: string | null
          profile_id: string | null
          progress: number | null
          quarantined_rows: number | null
          result_summary: Json | null
          source_fingerprint: string | null
          speed_rows_per_sec: number | null
          started_at: string | null
          status: string
          total_rows: number | null
          updated_at: string
          valid_rows: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          duration_ms?: number | null
          entity_type?: string | null
          error_message?: string | null
          eta_seconds?: number | null
          file_name?: string | null
          file_record_id?: string | null
          id?: string
          idempotency_key?: string | null
          invalid_rows?: number | null
          job_type?: string | null
          processed_rows?: number | null
          processing_mode?: string | null
          profile_id?: string | null
          progress?: number | null
          quarantined_rows?: number | null
          result_summary?: Json | null
          source_fingerprint?: string | null
          speed_rows_per_sec?: number | null
          started_at?: string | null
          status?: string
          total_rows?: number | null
          updated_at?: string
          valid_rows?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          duplicate_rows?: number | null
          duration_ms?: number | null
          entity_type?: string | null
          error_message?: string | null
          eta_seconds?: number | null
          file_name?: string | null
          file_record_id?: string | null
          id?: string
          idempotency_key?: string | null
          invalid_rows?: number | null
          job_type?: string | null
          processed_rows?: number | null
          processing_mode?: string | null
          profile_id?: string | null
          progress?: number | null
          quarantined_rows?: number | null
          result_summary?: Json | null
          source_fingerprint?: string | null
          speed_rows_per_sec?: number | null
          started_at?: string | null
          status?: string
          total_rows?: number | null
          updated_at?: string
          valid_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_file_record_id_fkey"
            columns: ["file_record_id"]
            isOneToOne: false
            referencedRelation: "file_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_profiles: {
        Row: {
          company_id: string
          conflict_resolution: string | null
          created_at: string | null
          entity_type: string
          field_mappings: Json | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          matching_keys: Json | null
          name: string
          null_policy: string | null
          optional_fields: Json | null
          required_fields: Json | null
          target_table: string
        }
        Insert: {
          company_id: string
          conflict_resolution?: string | null
          created_at?: string | null
          entity_type: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          matching_keys?: Json | null
          name: string
          null_policy?: string | null
          optional_fields?: Json | null
          required_fields?: Json | null
          target_table: string
        }
        Update: {
          company_id?: string
          conflict_resolution?: string | null
          created_at?: string | null
          entity_type?: string
          field_mappings?: Json | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          matching_keys?: Json | null
          name?: string
          null_policy?: string | null
          optional_fields?: Json | null
          required_fields?: Json | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string | null
          error_message: string | null
          error_type: string | null
          id: string
          import_id: string
          mapped_data: Json | null
          raw_data: Json | null
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          import_id: string
          mapped_data?: Json | null
          raw_data?: Json | null
          row_number: number
          status?: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          id?: string
          import_id?: string
          mapped_data?: Json | null
          raw_data?: Json | null
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      import_snapshots: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          job_id: string | null
          row_count: number | null
          snapshot_data: Json | null
          table_name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          job_id?: string | null
          row_count?: number | null
          snapshot_data?: Json | null
          table_name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          job_id?: string | null
          row_count?: number | null
          snapshot_data?: Json | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          entity_type: string | null
          error_message: string | null
          file_fingerprint_id: string | null
          file_hash: string | null
          file_name: string
          file_size: number | null
          id: string
          invalid_rows: number | null
          processing_mode: string | null
          profile_id: string | null
          profile_name: string | null
          progress: number | null
          quarantined_rows: number | null
          source_type: string | null
          status: string
          total_rows: number | null
          valid_rows: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          entity_type?: string | null
          error_message?: string | null
          file_fingerprint_id?: string | null
          file_hash?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          invalid_rows?: number | null
          processing_mode?: string | null
          profile_id?: string | null
          profile_name?: string | null
          progress?: number | null
          quarantined_rows?: number | null
          source_type?: string | null
          status?: string
          total_rows?: number | null
          valid_rows?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          entity_type?: string | null
          error_message?: string | null
          file_fingerprint_id?: string | null
          file_hash?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          invalid_rows?: number | null
          processing_mode?: string | null
          profile_id?: string | null
          profile_name?: string | null
          progress?: number | null
          quarantined_rows?: number | null
          source_type?: string | null
          status?: string
          total_rows?: number | null
          valid_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_file_fingerprint_id_fkey"
            columns: ["file_fingerprint_id"]
            isOneToOne: false
            referencedRelation: "file_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_evidence: {
        Row: {
          actions: Json
          company_id: string | null
          detected_at: string
          evidence: Json
          id: string
          impact: Json
          incident_key: string
          mitigated_at: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string
          status: string
        }
        Insert: {
          actions?: Json
          company_id?: string | null
          detected_at: string
          evidence?: Json
          id?: string
          impact?: Json
          incident_key: string
          mitigated_at?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity: string
          status: string
        }
        Update: {
          actions?: Json
          company_id?: string | null
          detected_at?: string
          evidence?: Json
          id?: string
          impact?: Json
          incident_key?: string
          mitigated_at?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_regression_links: {
        Row: {
          company_id: string | null
          created_at: string
          evidence: Json
          id: string
          incident_key: string
          regression_key: string
          status: string
          test_path: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          incident_key: string
          regression_key: string
          status: string
          test_path: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          incident_key?: string
          regression_key?: string
          status?: string
          test_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_regression_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_quality_scores: {
        Row: {
          company_id: string
          composite_score: number
          data_quality: number
          domain: string
          evidence: Json
          evidence_quality: number
          id: string
          model_quality: number
          observed_at: string
          status: string
        }
        Insert: {
          company_id: string
          composite_score: number
          data_quality: number
          domain: string
          evidence?: Json
          evidence_quality: number
          id?: string
          model_quality: number
          observed_at?: string
          status: string
        }
        Update: {
          company_id?: string
          composite_score?: number
          data_quality?: number
          domain?: string
          evidence?: Json
          evidence_quality?: number
          id?: string
          model_quality?: number
          observed_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_quality_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_safety_adjustments: {
        Row: {
          adjusted_threshold: number
          company_id: string
          domain: string
          effective_at: string
          id: string
          outcome_evidence: Json
          previous_threshold: number
          reason: string
        }
        Insert: {
          adjusted_threshold: number
          company_id: string
          domain: string
          effective_at?: string
          id?: string
          outcome_evidence?: Json
          previous_threshold: number
          reason: string
        }
        Update: {
          adjusted_threshold?: number
          company_id?: string
          domain?: string
          effective_at?: string
          id?: string
          outcome_evidence?: Json
          previous_threshold?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_safety_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          company_id: string
          id: string
          last_movement_date: string | null
          product_id: string
          quantity: number
          unit_cost: number | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          id?: string
          last_movement_date?: string | null
          product_id: string
          quantity?: number
          unit_cost?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          last_movement_date?: string | null
          product_id?: string
          quantity?: number
          unit_cost?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          movement_date: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
          warehouse_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          movement_date: string
          movement_type?: string
          notes?: string | null
          product_id: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_evidence_snapshots: {
        Row: {
          baseline: number | null
          company_id: string
          id: string
          kpi_key: string
          observed_at: string
          quality: string
          source_evidence: Json
          target: number | null
          value: number
          variance: number | null
        }
        Insert: {
          baseline?: number | null
          company_id: string
          id?: string
          kpi_key: string
          observed_at?: string
          quality: string
          source_evidence?: Json
          target?: number | null
          value: number
          variance?: number | null
        }
        Update: {
          baseline?: number | null
          company_id?: string
          id?: string
          kpi_key?: string
          observed_at?: string
          quality?: string
          source_evidence?: Json
          target?: number | null
          value?: number
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_evidence_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      mapping_feedback: {
        Row: {
          created_at: string
          field: string
          header_norm: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          field: string
          header_norm: string
          id?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          field?: string
          header_norm?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      metric_governance: {
        Row: {
          certification_status: string
          company_id: string | null
          consumers: Json
          created_at: string
          definition: string
          dependencies: Json
          deprecated_at: string | null
          dimensions: Json
          evidence: Json
          filters: Json
          formula: string
          freshness: Json
          id: string
          metric_id: string
          name: string
          owner: string
          source: Json
          tests: Json
          time_semantics: Json
          updated_at: string
          version: number
        }
        Insert: {
          certification_status?: string
          company_id?: string | null
          consumers?: Json
          created_at?: string
          definition: string
          dependencies?: Json
          deprecated_at?: string | null
          dimensions?: Json
          evidence?: Json
          filters?: Json
          formula: string
          freshness?: Json
          id?: string
          metric_id: string
          name: string
          owner: string
          source?: Json
          tests?: Json
          time_semantics?: Json
          updated_at?: string
          version: number
        }
        Update: {
          certification_status?: string
          company_id?: string | null
          consumers?: Json
          created_at?: string
          definition?: string
          dependencies?: Json
          deprecated_at?: string | null
          dimensions?: Json
          evidence?: Json
          filters?: Json
          formula?: string
          freshness?: Json
          id?: string
          metric_id?: string
          name?: string
          owner?: string
          source?: Json
          tests?: Json
          time_semantics?: Json
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      metric_governance_audit: {
        Row: {
          actor_id: string | null
          company_id: string | null
          created_at: string
          from_status: string | null
          id: string
          metric_governance_id: string
          metric_id: string
          previous_version: number | null
          reason: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metric_governance_id: string
          metric_id: string
          previous_version?: number | null
          reason: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          metric_governance_id?: string
          metric_id?: string
          previous_version?: number | null
          reason?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_governance_audit_metric_governance_id_fkey"
            columns: ["metric_governance_id"]
            isOneToOne: false
            referencedRelation: "metric_governance"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_health_snapshots: {
        Row: {
          company_id: string
          component: string
          dead_letter_count: number | null
          error_rate: number | null
          id: string
          latency_ms: number | null
          metadata: Json
          observed_at: string
          queue_depth: number | null
          stale_jobs: number | null
          status: string
        }
        Insert: {
          company_id: string
          component: string
          dead_letter_count?: number | null
          error_rate?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          observed_at?: string
          queue_depth?: number | null
          stale_jobs?: number | null
          status: string
        }
        Update: {
          company_id?: string
          component?: string
          dead_letter_count?: number | null
          error_rate?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json
          observed_at?: string
          queue_depth?: number | null
          stale_jobs?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_health_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_task_proposals: {
        Row: {
          company_id: string
          converted_work_item_id: string | null
          created_at: string
          decision_id: string | null
          evidence_required: Json
          expected_outcome: string
          horizon: string
          id: string
          priority: string
          reason: string
          role: string
          source_id: string | null
          source_type: string
          status: string
          task_key: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          converted_work_item_id?: string | null
          created_at?: string
          decision_id?: string | null
          evidence_required?: Json
          expected_outcome: string
          horizon: string
          id?: string
          priority: string
          reason: string
          role: string
          source_id?: string | null
          source_type: string
          status?: string
          task_key: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          converted_work_item_id?: string | null
          created_at?: string
          decision_id?: string | null
          evidence_required?: Json
          expected_outcome?: string
          horizon?: string
          id?: string
          priority?: string
          reason?: string
          role?: string
          source_id?: string | null
          source_type?: string
          status?: string
          task_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_task_proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_task_proposals_converted_work_item_id_fkey"
            columns: ["converted_work_item_id"]
            isOneToOne: false
            referencedRelation: "decision_work_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_task_proposals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "business_intelligence_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string
          quantity: number
          unit: string
          unit_price: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id: string
          quantity: number
          unit: string
          unit_price: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string
          quantity?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_outbox_events: {
        Row: {
          company_id: string
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          order_id: string
          payload: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          order_id: string
          payload?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          order_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_outbox_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_outbox_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          from_status: string | null
          id: string
          order_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          order_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          order_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_template_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          template_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          template_id: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          template_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_template_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "order_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_templates: {
        Row: {
          branch_label: string
          company_id: string
          created_at: string
          created_by: string
          customer_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          branch_label?: string
          company_id: string
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          branch_label?: string
          company_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          id: string
          idempotency_key: string
          order_number: number
          quantity_confirmed_at: string | null
          status: string
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          currency?: string
          customer_id: string
          id?: string
          idempotency_key: string
          order_number?: never
          quantity_confirmed_at?: string | null
          status?: string
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          customer_id?: string
          id?: string
          idempotency_key?: string
          order_number?: never
          quantity_confirmed_at?: string | null
          status?: string
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          currency: string | null
          customer_id: string | null
          direction: string
          id: string
          invoice_id: string | null
          method: string | null
          notes: string | null
          payment_date: string
          reference: string | null
          supplier_id: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          direction?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date: string
          reference?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          direction?: string
          id?: string
          invoice_id?: string | null
          method?: string | null
          notes?: string | null
          payment_date?: string
          reference?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_certification_bundles: {
        Row: {
          ai_isolation_passed: boolean
          artifact_integrity_passed: boolean
          backup_restore_passed: boolean
          bundle_key: string
          certified_at: string | null
          company_id: string
          created_at: string
          evidence: Json
          id: string
          migration_parity_passed: boolean
          realtime_passed: boolean
          release_ref: string
          rollback_passed: boolean
          security_audit_passed: boolean
          status: string
          storage_passed: boolean
          tenant_isolation_passed: boolean
        }
        Insert: {
          ai_isolation_passed?: boolean
          artifact_integrity_passed?: boolean
          backup_restore_passed?: boolean
          bundle_key: string
          certified_at?: string | null
          company_id: string
          created_at?: string
          evidence?: Json
          id?: string
          migration_parity_passed?: boolean
          realtime_passed?: boolean
          release_ref: string
          rollback_passed?: boolean
          security_audit_passed?: boolean
          status?: string
          storage_passed?: boolean
          tenant_isolation_passed?: boolean
        }
        Update: {
          ai_isolation_passed?: boolean
          artifact_integrity_passed?: boolean
          backup_restore_passed?: boolean
          bundle_key?: string
          certified_at?: string | null
          company_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          migration_parity_passed?: boolean
          realtime_passed?: boolean
          release_ref?: string
          rollback_passed?: boolean
          security_audit_passed?: boolean
          status?: string
          storage_passed?: boolean
          tenant_isolation_passed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "production_certification_bundles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      production_rollback_drills: {
        Row: {
          company_id: string
          completed_at: string | null
          drill_key: string
          evidence: Json
          forward_fix_verified: boolean
          id: string
          pre_state_hash: string | null
          release_ref: string
          rollback_state_hash: string | null
          started_at: string | null
          status: string
          target: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          drill_key: string
          evidence?: Json
          forward_fix_verified?: boolean
          id?: string
          pre_state_hash?: string | null
          release_ref: string
          rollback_state_hash?: string | null
          started_at?: string | null
          status?: string
          target: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          drill_key?: string
          evidence?: Json
          forward_fix_verified?: boolean
          id?: string
          pre_state_hash?: string | null
          release_ref?: string
          rollback_state_hash?: string | null
          started_at?: string | null
          status?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_rollback_drills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          company_id: string
          cost_price: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          min_stock: number | null
          name: string
          reorder_point: number | null
          selling_price: number | null
          sku: string
          unit: string
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          company_id: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name: string
          reorder_point?: number | null
          selling_price?: number | null
          sku: string
          unit?: string
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          company_id?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          min_stock?: number | null
          name?: string
          reorder_point?: number | null
          selling_price?: number | null
          sku?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          organization_id: string
          role: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id: string
          organization_id: string
          role?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          company_id: string
          created_at: string | null
          currency: string | null
          discount_amount: number | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number | null
          status: string
          subtotal: number | null
          supplier_id: string
          tax_amount: number | null
          total: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number | null
          status?: string
          subtotal?: number | null
          supplier_id: string
          tax_amount?: number | null
          total?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          currency?: string | null
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number | null
          status?: string
          subtotal?: number | null
          supplier_id?: string
          tax_amount?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          company_id: string | null
          description: string | null
          discount_amount: number | null
          id: string
          invoice_id: string
          line_total: number | null
          product_id: string | null
          quantity: number
          tax_amount: number | null
          unit_price: number
        }
        Insert: {
          company_id?: string | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id: string
          line_total?: number | null
          product_id?: string | null
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Update: {
          company_id?: string | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id?: string
          line_total?: number | null
          product_id?: string | null
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_invoice_company_fkey"
            columns: ["company_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_company_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_outcomes: {
        Row: {
          actual_impact: number | null
          company_id: string
          decision_id: string | null
          evidence: Json
          expected_impact: number | null
          id: string
          observed_at: string
          observed_by: string | null
          outcome_quality: number | null
          recommendation_key: string
          status: string
        }
        Insert: {
          actual_impact?: number | null
          company_id: string
          decision_id?: string | null
          evidence?: Json
          expected_impact?: number | null
          id?: string
          observed_at?: string
          observed_by?: string | null
          outcome_quality?: number | null
          recommendation_key: string
          status: string
        }
        Update: {
          actual_impact?: number | null
          company_id?: string
          decision_id?: string | null
          evidence?: Json
          expected_impact?: number | null
          id?: string
          observed_at?: string
          observed_by?: string | null
          outcome_quality?: number | null
          recommendation_key?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_outcomes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          category: string
          company_id: string
          confidence: string | null
          created_at: string | null
          deadline: string | null
          decision_id: string | null
          description: string | null
          evidence: Json | null
          evidence_snapshot_id: string | null
          expected_impact: number | null
          id: string
          impact_measured_at: string | null
          impact_result: string | null
          metric_versions: Json
          owner: string | null
          priority: string
          status: string
          title: string
        }
        Insert: {
          category: string
          company_id: string
          confidence?: string | null
          created_at?: string | null
          deadline?: string | null
          decision_id?: string | null
          description?: string | null
          evidence?: Json | null
          evidence_snapshot_id?: string | null
          expected_impact?: number | null
          id?: string
          impact_measured_at?: string | null
          impact_result?: string | null
          metric_versions?: Json
          owner?: string | null
          priority?: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          company_id?: string
          confidence?: string | null
          created_at?: string | null
          deadline?: string | null
          decision_id?: string | null
          description?: string | null
          evidence?: Json | null
          evidence_snapshot_id?: string | null
          expected_impact?: number | null
          id?: string
          impact_measured_at?: string | null
          impact_result?: string | null
          metric_versions?: Json
          owner?: string | null
          priority?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "business_intelligence_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      release_evidence_manifests: {
        Row: {
          artifact_fingerprint: string
          certification_id: string | null
          company_id: string | null
          created_at: string
          dependency_fingerprint: string | null
          dependency_lock_fingerprint: string
          evidence: Json
          id: string
          migration_fingerprint: string | null
          migrations_fingerprint: string
          release_key: string
          rollback_at: string | null
          source_sha: string
          status: string
          trust_certificate_id: string | null
          verified_at: string | null
        }
        Insert: {
          artifact_fingerprint: string
          certification_id?: string | null
          company_id?: string | null
          created_at?: string
          dependency_fingerprint?: string | null
          dependency_lock_fingerprint: string
          evidence?: Json
          id?: string
          migration_fingerprint?: string | null
          migrations_fingerprint: string
          release_key: string
          rollback_at?: string | null
          source_sha: string
          status: string
          trust_certificate_id?: string | null
          verified_at?: string | null
        }
        Update: {
          artifact_fingerprint?: string
          certification_id?: string | null
          company_id?: string | null
          created_at?: string
          dependency_fingerprint?: string | null
          dependency_lock_fingerprint?: string
          evidence?: Json
          id?: string
          migration_fingerprint?: string | null
          migrations_fingerprint?: string
          release_key?: string
          rollback_at?: string | null
          source_sha?: string
          status?: string
          trust_certificate_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "release_evidence_manifests_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "trust_certifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_evidence_manifests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_evidence_manifests_trust_certificate_id_fkey"
            columns: ["trust_certificate_id"]
            isOneToOne: false
            referencedRelation: "trust_certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      report_consolidation_items: {
        Row: {
          business_key: string
          company_id: string
          evidence: Json
          id: string
          precedence_rank: number
          run_id: string
          selected: boolean
          source_version_id: string
          value: Json
        }
        Insert: {
          business_key: string
          company_id: string
          evidence?: Json
          id?: string
          precedence_rank: number
          run_id: string
          selected?: boolean
          source_version_id: string
          value?: Json
        }
        Update: {
          business_key?: string
          company_id?: string
          evidence?: Json
          id?: string
          precedence_rank?: number
          run_id?: string
          selected?: boolean
          source_version_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_consolidation_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_consolidation_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_consolidation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_consolidation_items_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_consolidation_runs: {
        Row: {
          as_of: string
          checkpoint: Json
          company_id: string
          evidence: Json
          id: string
          run_key: string
          source_precedence: Json
          status: string
        }
        Insert: {
          as_of?: string
          checkpoint?: Json
          company_id: string
          evidence?: Json
          id?: string
          run_key: string
          source_precedence?: Json
          status?: string
        }
        Update: {
          as_of?: string
          checkpoint?: Json
          company_id?: string
          evidence?: Json
          id?: string
          run_key?: string
          source_precedence?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_consolidation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_delivery_receipts: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          delivered_at: string | null
          destination: string | null
          error_message: string | null
          id: string
          provider_message_id: string | null
          run_id: string
          status: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          run_id: string
          status: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          destination?: string | null
          error_message?: string | null
          id?: string
          provider_message_id?: string | null
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_delivery_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_delivery_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_evidence_passports: {
        Row: {
          acceptance_status: string
          company_id: string
          created_at: string
          decision_readiness: string
          evidence: Json
          evidence_snapshot_id: string
          id: string
          lineage: Json
          prior_verification_state: string | null
          report_execution_job_id: string
          source_hash: string
          source_version_id: string | null
          updated_at: string
          verification_status: string
        }
        Insert: {
          acceptance_status: string
          company_id: string
          created_at?: string
          decision_readiness: string
          evidence?: Json
          evidence_snapshot_id: string
          id?: string
          lineage?: Json
          prior_verification_state?: string | null
          report_execution_job_id: string
          source_hash: string
          source_version_id?: string | null
          updated_at?: string
          verification_status: string
        }
        Update: {
          acceptance_status?: string
          company_id?: string
          created_at?: string
          decision_readiness?: string
          evidence?: Json
          evidence_snapshot_id?: string
          id?: string
          lineage?: Json
          prior_verification_state?: string | null
          report_execution_job_id?: string
          source_hash?: string
          source_version_id?: string | null
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_passports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_passports_evidence_snapshot_id_fkey"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "report_evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_passports_report_execution_job_id_fkey"
            columns: ["report_execution_job_id"]
            isOneToOne: false
            referencedRelation: "report_execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_passports_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_evidence_snapshots: {
        Row: {
          acceptance_status: string
          accepted_at: string | null
          accepted_by: string | null
          analysis_snapshot_id: string | null
          authoritative_row_count: number | null
          canonical_commit_count: number
          canonical_coverage_status: string
          canonical_dataset_count: number
          company_id: string
          created_at: string
          evidence: Json
          evidence_fingerprint: string
          id: string
          lineage: Json
          report_execution_job_id: string
          source_hash: string
          source_path: string
          source_version_id: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          acceptance_status: string
          accepted_at?: string | null
          accepted_by?: string | null
          analysis_snapshot_id?: string | null
          authoritative_row_count?: number | null
          canonical_commit_count?: number
          canonical_coverage_status: string
          canonical_dataset_count?: number
          company_id: string
          created_at?: string
          evidence?: Json
          evidence_fingerprint: string
          id?: string
          lineage?: Json
          report_execution_job_id: string
          source_hash: string
          source_path: string
          source_version_id?: string | null
          verification_status: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          acceptance_status?: string
          accepted_at?: string | null
          accepted_by?: string | null
          analysis_snapshot_id?: string | null
          authoritative_row_count?: number | null
          canonical_commit_count?: number
          canonical_coverage_status?: string
          canonical_dataset_count?: number
          company_id?: string
          created_at?: string
          evidence?: Json
          evidence_fingerprint?: string
          id?: string
          lineage?: Json
          report_execution_job_id?: string
          source_hash?: string
          source_path?: string
          source_version_id?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_snapshots_analysis_snapshot_id_fkey"
            columns: ["analysis_snapshot_id"]
            isOneToOne: false
            referencedRelation: "source_analysis_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_snapshots_report_execution_job_id_fkey"
            columns: ["report_execution_job_id"]
            isOneToOne: false
            referencedRelation: "report_execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_snapshots_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_execution_jobs: {
        Row: {
          attempt: number
          checkpoint: Json
          company_id: string
          completed_at: string | null
          created_at: string
          evidence: Json
          id: string
          job_key: string
          last_error: Json
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          source_hash: string
          source_path: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          checkpoint?: Json
          company_id: string
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          job_key: string
          last_error?: Json
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          source_hash: string
          source_path: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          checkpoint?: Json
          company_id?: string
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          job_key?: string
          last_error?: Json
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          source_hash?: string
          source_path?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_execution_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_execution_tasks: {
        Row: {
          attempt: number
          company_id: string
          completed_at: string | null
          created_at: string
          evidence: Json
          id: string
          label: string
          last_error: Json
          ordinal: number
          report_execution_job_id: string
          stage: string
          started_at: string | null
          status: string
          task_key: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempt?: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          label: string
          last_error?: Json
          ordinal: number
          report_execution_job_id: string
          stage: string
          started_at?: string | null
          status?: string
          task_key: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempt?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          label?: string
          last_error?: Json
          ordinal?: number
          report_execution_job_id?: string
          stage?: string
          started_at?: string | null
          status?: string
          task_key?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_execution_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_execution_tasks_report_execution_job_id_fkey"
            columns: ["report_execution_job_id"]
            isOneToOne: false
            referencedRelation: "report_execution_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_row_lineage: {
        Row: {
          company_id: string
          evidence: Json
          first_seen_at: string
          id: string
          last_seen_at: string
          prior_row_hash: string | null
          row_hash: string
          row_key: string
          source_version_id: string
          state: string
        }
        Insert: {
          company_id: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          prior_row_hash?: string | null
          row_hash: string
          row_key: string
          source_version_id: string
          state: string
        }
        Update: {
          company_id?: string
          evidence?: Json
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          prior_row_hash?: string | null
          row_hash?: string
          row_key?: string
          source_version_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_row_lineage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_row_lineage_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_run_artifacts: {
        Row: {
          company_id: string
          content_hash: string | null
          created_at: string
          format: string
          id: string
          mime_type: string
          run_id: string
          storage_ref: string
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          created_at?: string
          format: string
          id?: string
          mime_type: string
          run_id: string
          storage_ref: string
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          created_at?: string
          format?: string
          id?: string
          mime_type?: string
          run_id?: string
          storage_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_run_artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_run_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_run_evidence: {
        Row: {
          artifact_refs: Json
          company_id: string
          created_at: string
          evidence: Json
          id: string
          input_fingerprint: string
          output_formats: Json
          row_count: number
          run_id: string
          source_snapshot_id: string | null
          status: string
        }
        Insert: {
          artifact_refs?: Json
          company_id: string
          created_at?: string
          evidence?: Json
          id?: string
          input_fingerprint: string
          output_formats?: Json
          row_count?: number
          run_id: string
          source_snapshot_id?: string | null
          status: string
        }
        Update: {
          artifact_refs?: Json
          company_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          input_fingerprint?: string
          output_formats?: Json
          row_count?: number
          run_id?: string
          source_snapshot_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_run_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_run_evidence_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          attempts: number
          company_id: string
          completed_at: string | null
          created_at: string
          engine_version: string
          error_code: string | null
          error_message: string | null
          formats: Json
          id: string
          idempotency_key: string
          input_fingerprint: string
          lease_expires_at: string | null
          max_attempts: number
          parameters: Json
          report_id: string | null
          request_fingerprint: string
          requested_by: string | null
          row_count: number
          source_snapshot_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          company_id: string
          completed_at?: string | null
          created_at?: string
          engine_version?: string
          error_code?: string | null
          error_message?: string | null
          formats?: Json
          id?: string
          idempotency_key: string
          input_fingerprint: string
          lease_expires_at?: string | null
          max_attempts?: number
          parameters?: Json
          report_id?: string | null
          request_fingerprint: string
          requested_by?: string | null
          row_count?: number
          source_snapshot_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string
          engine_version?: string
          error_code?: string | null
          error_message?: string | null
          formats?: Json
          id?: string
          idempotency_key?: string
          input_fingerprint?: string
          lease_expires_at?: string | null
          max_attempts?: number
          parameters?: Json
          report_id?: string | null
          request_fingerprint?: string
          requested_by?: string | null
          row_count?: number
          source_snapshot_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_source_versions: {
        Row: {
          change_kind: string
          company_id: string
          detected_at: string
          evidence: Json
          id: string
          metadata: Json
          previous_version_id: string | null
          source_hash: string
          source_key: string
          source_path: string
          tombstone: boolean
        }
        Insert: {
          change_kind: string
          company_id: string
          detected_at?: string
          evidence?: Json
          id?: string
          metadata?: Json
          previous_version_id?: string | null
          source_hash: string
          source_key: string
          source_path: string
          tombstone?: boolean
        }
        Update: {
          change_kind?: string
          company_id?: string
          detected_at?: string
          evidence?: Json
          id?: string
          metadata?: Json
          previous_version_id?: string | null
          source_hash?: string
          source_key?: string
          source_path?: string
          tombstone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "report_source_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_source_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "report_source_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          company_id: string | null
          cost_price: number | null
          description: string | null
          discount_amount: number | null
          id: string
          invoice_id: string
          line_total: number | null
          product_id: string | null
          quantity: number
          tax_amount: number | null
          unit_price: number
        }
        Insert: {
          company_id?: string | null
          cost_price?: number | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id: string
          line_total?: number | null
          product_id?: string | null
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Update: {
          company_id?: string | null
          cost_price?: number | null
          description?: string | null
          discount_amount?: number | null
          id?: string
          invoice_id?: string
          line_total?: number | null
          product_id?: string | null
          quantity?: number
          tax_amount?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_invoice_company_fkey"
            columns: ["company_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "sale_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_company_fkey"
            columns: ["company_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["company_id", "id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string | null
          currency: string | null
          customer_id: string
          discount_amount: number | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          order_id: string | null
          paid_amount: number | null
          sales_rep: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          total: number | null
        }
        Insert: {
          branch_id?: string | null
          company_id: string
          created_at?: string | null
          currency?: string | null
          customer_id: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          order_id?: string | null
          paid_amount?: number | null
          sales_rep?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string | null
          currency?: string | null
          customer_id?: string
          discount_amount?: number | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          order_id?: string | null
          paid_amount?: number | null
          sales_rep?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      slo_evidence: {
        Row: {
          actual: number
          budget_remaining: number | null
          company_id: string
          created_at: string
          evidence: Json
          id: string
          metric: string
          service: string
          status: string
          target: number
          window_end: string
          window_start: string
        }
        Insert: {
          actual: number
          budget_remaining?: number | null
          company_id: string
          created_at?: string
          evidence?: Json
          id?: string
          metric: string
          service: string
          status: string
          target: number
          window_end: string
          window_start: string
        }
        Update: {
          actual?: number
          budget_remaining?: number | null
          company_id?: string
          created_at?: string
          evidence?: Json
          id?: string
          metric?: string
          service?: string
          status?: string
          target?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "slo_evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      source_analysis_snapshots: {
        Row: {
          analysis_status: string
          canonical_text: string
          column_count: number
          company_id: string
          created_at: string
          datasets: Json
          entity_type: string
          id: string
          import_job_id: string | null
          metadata: Json
          quality_score: number | null
          row_count: number
          source_format: string
          source_hash: string
          source_path: string
          visual_assets: Json
          warnings: Json
        }
        Insert: {
          analysis_status: string
          canonical_text?: string
          column_count?: number
          company_id: string
          created_at?: string
          datasets?: Json
          entity_type: string
          id?: string
          import_job_id?: string | null
          metadata?: Json
          quality_score?: number | null
          row_count?: number
          source_format: string
          source_hash: string
          source_path: string
          visual_assets?: Json
          warnings?: Json
        }
        Update: {
          analysis_status?: string
          canonical_text?: string
          column_count?: number
          company_id?: string
          created_at?: string
          datasets?: Json
          entity_type?: string
          id?: string
          import_job_id?: string | null
          metadata?: Json
          quality_score?: number | null
          row_count?: number
          source_format?: string
          source_hash?: string
          source_path?: string
          visual_assets?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "source_analysis_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_analysis_snapshots_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          created_at: string | null
          email: string | null
          id: string
          name: string
          payment_terms_days: number | null
          phone: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      synonym_dictionary: {
        Row: {
          canonical_field: string
          confidence: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
          synonym: string
        }
        Insert: {
          canonical_field: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          synonym: string
        }
        Update: {
          canonical_field?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          synonym?: string
        }
        Relationships: []
      }
      tenant_isolation_canary_runs: {
        Row: {
          assertions: Json
          company_id: string | null
          completed_at: string | null
          evidence_hash: string
          id: string
          run_key: string
          started_at: string
          status: string
        }
        Insert: {
          assertions?: Json
          company_id?: string | null
          completed_at?: string | null
          evidence_hash: string
          id?: string
          run_key: string
          started_at?: string
          status: string
        }
        Update: {
          assertions?: Json
          company_id?: string | null
          completed_at?: string | null
          evidence_hash?: string
          id?: string
          run_key?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_isolation_canary_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      trust_certifications: {
        Row: {
          blocker_count: number
          certificate_key: string
          company_id: string | null
          evidence: Json
          evidence_hash: string
          expires_at: string
          id: string
          issued_at: string
          status: string
        }
        Insert: {
          blocker_count?: number
          certificate_key: string
          company_id?: string | null
          evidence?: Json
          evidence_hash: string
          expires_at: string
          id?: string
          issued_at?: string
          status: string
        }
        Update: {
          blocker_count?: number
          certificate_key?: string
          company_id?: string | null
          evidence?: Json
          evidence_hash?: string
          expires_at?: string
          id?: string
          issued_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trust_certifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          branch_id: string | null
          code: string | null
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          branch_id?: string | null
          code?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          branch_id?: string | null
          code?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_report_files: {
        Row: {
          company_id: string
          content_hash: string
          created_at: string
          folder_id: string
          id: string
          last_error: string | null
          last_processed_at: string | null
          last_successful_checkpoint: string | null
          modified_at: string | null
          relative_path: string
          size_bytes: number
          source_version: number
          state: string
          updated_at: string
        }
        Insert: {
          company_id: string
          content_hash: string
          created_at?: string
          folder_id: string
          id?: string
          last_error?: string | null
          last_processed_at?: string | null
          last_successful_checkpoint?: string | null
          modified_at?: string | null
          relative_path: string
          size_bytes?: number
          source_version?: number
          state: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          content_hash?: string
          created_at?: string
          folder_id?: string
          id?: string
          last_error?: string | null
          last_processed_at?: string | null
          last_successful_checkpoint?: string | null
          modified_at?: string | null
          relative_path?: string
          size_bytes?: number
          source_version?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_report_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watched_report_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "watched_report_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_report_folders: {
        Row: {
          accepted_extensions: string[]
          auto_process: boolean
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          label: string
          last_scan_at: string | null
          logical_path: string | null
          max_concurrent_files: number
          poll_interval_ms: number
          process_only_changed_rows: boolean
          recursive: boolean
          retry_limit: number
          updated_at: string
        }
        Insert: {
          accepted_extensions?: string[]
          auto_process?: boolean
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          last_scan_at?: string | null
          logical_path?: string | null
          max_concurrent_files?: number
          poll_interval_ms?: number
          process_only_changed_rows?: boolean
          recursive?: boolean
          retry_limit?: number
          updated_at?: string
        }
        Update: {
          accepted_extensions?: string[]
          auto_process?: boolean
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          last_scan_at?: string | null
          logical_path?: string | null
          max_concurrent_files?: number
          poll_interval_ms?: number
          process_only_changed_rows?: boolean
          recursive?: boolean
          retry_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_report_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_tasks: {
        Row: {
          analysis_id: string
          created_at: string
          detail: string | null
          due_date: string | null
          finding_id: string | null
          id: string
          outcome_note: string | null
          priority: string
          role: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          created_at?: string
          detail?: string | null
          due_date?: string | null
          finding_id?: string | null
          id?: string
          outcome_note?: string | null
          priority?: string
          role: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          analysis_id?: string
          created_at?: string
          detail?: string | null
          due_date?: string | null
          finding_id?: string | null
          id?: string
          outcome_note?: string | null
          priority?: string
          role?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tasks_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_completed_report_evidence_batch: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: {
          job_id: string
          reason: string
          source_hash: string
          source_path: string
          state: string
        }[]
      }
      add_alternative_item_group_member: {
        Args: {
          p_company_id: string
          p_conversion_factor?: number
          p_group_id: string
          p_sku: string
        }
        Returns: {
          company_id: string
          conversion_factor: number
          created_at: string
          group_id: string
          id: string
          sku: string
        }
        SetofOptions: {
          from: "*"
          to: "alternative_item_group_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      advance_report_execution_checkpoint:
        | {
            Args: {
              p_checkpoint: Json
              p_company_id: string
              p_job_id: string
              p_lease_token: string
              p_worker_id: string
            }
            Returns: boolean
          }
        | {
            Args: { p_checkpoint: Json; p_job_id: string; p_worker_id: string }
            Returns: boolean
          }
      autonomy_runtime_gate: { Args: { p_domain_key: string }; Returns: Json }
      billing_check_entitlement: {
        Args: { p_capability: string; p_quantity?: number }
        Returns: {
          allowed: boolean
          capability: string
          company_id: string
          enabled: boolean
          monthly_limit: number
          plan_code: string
          reason: string
          used: number
        }[]
      }
      billing_current_subscription: { Args: never; Returns: Json }
      billing_record_usage: {
        Args: {
          p_capability: string
          p_idempotency_key: string
          p_metadata?: Json
          p_quantity: number
          p_source?: string
        }
        Returns: Json
      }
      billing_set_subscription: {
        Args: {
          p_cancel_at_period_end?: boolean
          p_current_period_end?: string
          p_current_period_start?: string
          p_grace_ends_at?: string
          p_plan_id: string
          p_status: string
          p_trial_ends_at?: string
        }
        Returns: Json
      }
      can_certify_autonomous_domain: {
        Args: { p_domain_key: string }
        Returns: boolean
      }
      can_enter_phase_l_autonomy: {
        Args: { p_domain_key: string }
        Returns: boolean
      }
      can_execute_bi_decision: {
        Args: { p_decision_key: string }
        Returns: boolean
      }
      can_execute_control_plane_run: {
        Args: { p_run_key: string }
        Returns: boolean
      }
      can_release_production_certification: {
        Args: { p_bundle_key: string }
        Returns: boolean
      }
      can_run_phase_l_autonomy: {
        Args: { p_domain_key: string }
        Returns: boolean
      }
      cash_liquidity_snapshot: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: {
          cumulative_net: number
          inflows: number
          net_cash: number
          outflows: number
          period_date: string
          risk_level: string
        }[]
      }
      claim_report_execution_job: {
        Args: {
          p_company_id: string
          p_job_id: string
          p_lease_owner: string
          p_lease_seconds?: number
        }
        Returns: Json
      }
      claim_report_run: {
        Args: { p_lease_seconds?: number; p_worker_id: string }
        Returns: {
          attempts: number
          company_id: string
          completed_at: string | null
          created_at: string
          engine_version: string
          error_code: string | null
          error_message: string | null
          formats: Json
          id: string
          idempotency_key: string
          input_fingerprint: string
          lease_expires_at: string | null
          max_attempts: number
          parameters: Json
          report_id: string | null
          request_fingerprint: string
          requested_by: string | null
          row_count: number
          source_snapshot_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "report_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clear_cart: { Args: never; Returns: undefined }
      complete_decision_work_item: {
        Args: {
          p_actual_impact: number
          p_evidence?: Json
          p_work_item_id: string
        }
        Returns: boolean
      }
      complete_report_execution_job:
        | {
            Args: {
              p_company_id: string
              p_evidence?: Json
              p_job_id: string
              p_lease_token: string
              p_worker_id: string
            }
            Returns: boolean
          }
        | {
            Args: { p_evidence?: Json; p_job_id: string; p_worker_id: string }
            Returns: boolean
          }
      complete_report_run: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_run_id: string
          p_status: string
          p_worker_id: string
        }
        Returns: undefined
      }
      compute_control_plane_health: { Args: never; Returns: number }
      create_alternative_item_group: {
        Args: {
          p_base_unit?: string
          p_company_id: string
          p_description?: string
          p_name: string
        }
        Returns: {
          base_unit: string
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "alternative_item_groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_decision_action_receipt: {
        Args: {
          p_decision_fingerprint: string
          p_evidence_snapshot_id?: string
          p_idempotency_key: string
          p_work_item_id: string
        }
        Returns: string
      }
      create_decision_work_item: {
        Args: {
          p_assignee_id: string
          p_assignee_label: string
          p_decision_id: string
          p_department: string
          p_description: string
          p_due_at: string
          p_evidence_refs: Json
          p_expected_impact: number
          p_priority: string
          p_recommendation_id: string
          p_title: string
        }
        Returns: string
      }
      create_my_company: { Args: { p_name: string }; Returns: string }
      create_runtime_decision: {
        Args: {
          p_confidence: number
          p_decision_key: string
          p_decision_type: string
          p_evidence?: Json
          p_expected_impact: number
        }
        Returns: string
      }
      create_runtime_recommendation: {
        Args: {
          p_category: string
          p_description?: string
          p_evidence?: Json
          p_evidence_snapshot_id?: string
          p_expected_impact?: number
          p_metric_versions?: Json
          p_priority: string
          p_title: string
        }
        Returns: string
      }
      create_source_intelligence_proposal: {
        Args: {
          p_evidence: Json
          p_evidence_snapshot_id: string
          p_report_job_id: string
          p_severity: string
          p_signal_id: string
          p_signal_message: string
          p_signal_title: string
          p_source_hash: string
        }
        Returns: {
          decision_id: string
          decision_status: string
          recommendation_id: string
        }[]
      }
      current_company_id: { Args: never; Returns: string }
      current_customer_company_id: { Args: never; Returns: string }
      current_customer_id: { Args: never; Returns: string }
      decide_approval: {
        Args: { p_approval_id: string; p_approve: boolean; p_reason?: string }
        Returns: boolean
      }
      demand_reorder_snapshot: {
        Args: {
          p_as_of?: string
          p_company_id: string
          p_days?: number
          p_lead_time_days?: number
          p_safety_days?: number
        }
        Returns: {
          avg_daily_demand: number
          confidence: string
          current_stock: number
          maximum_stock: number
          minimum_stock: number
          product_id: string
          product_name: string
          qty_for_day: number
          qty_for_half_month: number
          qty_for_month: number
          qty_for_week: number
          reorder_point: number
          sku: string
          stockout_date: string
          suggested_order_qty: number
          urgency: string
        }[]
      }
      enqueue_report_execution_job:
        | {
            Args: {
              p_company_id: string
              p_evidence_keys?: string[]
              p_job_key: string
              p_max_attempts?: number
              p_source_hash: string
              p_source_path: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_company_id: string
              p_evidence_keys?: string[]
              p_force_reprocess?: boolean
              p_job_key: string
              p_max_attempts?: number
              p_source_hash: string
              p_source_path: string
            }
            Returns: Json
          }
      fail_report_execution_job:
        | {
            Args: {
              p_company_id: string
              p_error: Json
              p_job_id: string
              p_lease_token: string
              p_worker_id: string
            }
            Returns: boolean
          }
        | {
            Args: { p_error: Json; p_job_id: string; p_worker_id: string }
            Returns: boolean
          }
      get_abc_snapshot: { Args: { p_limit?: number }; Returns: Json }
      get_aging_snapshot: { Args: { p_as_of?: string }; Returns: Json }
      get_cart: {
        Args: never
        Returns: {
          authorized_price: number
          currency: string
          name: string
          product_id: string
          quantity: number
          sku: string
          unit: string
        }[]
      }
      get_dashboard_intelligence: { Args: { p_limit?: number }; Returns: Json }
      get_dashboard_snapshot: {
        Args: { p_as_of?: string; p_months?: number }
        Returns: Json
      }
      get_dashboard_top_entities: { Args: never; Returns: Json }
      get_data_quality_snapshot: { Args: never; Returns: Json }
      get_entitlement_usage: {
        Args: { p_capability: string; p_period: string }
        Returns: number
      }
      get_executive_metrics: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_forecast_snapshot: { Args: { p_limit?: number }; Returns: Json }
      get_inventory_export_rows: {
        Args: { p_company_id: string; p_max_rows?: number }
        Returns: Json
      }
      get_inventory_report_snapshot: {
        Args: { p_filter?: string; p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_inventory_valuation: { Args: { p_company_id: string }; Returns: Json }
      get_profitability_snapshot: { Args: { p_as_of?: string }; Returns: Json }
      get_purchase_export_rows: {
        Args: { p_company_id: string; p_max_rows?: number }
        Returns: Json
      }
      get_purchase_summary: {
        Args: { p_company_id: string; p_from?: string; p_to?: string }
        Returns: Json
      }
      get_receivables_export_rows: {
        Args: { p_company_id: string; p_max_rows?: number }
        Returns: Json
      }
      get_receivables_report_page: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: Json
      }
      get_report_value_cohort_candidates: {
        Args: { p_company_id?: string; p_limit?: number }
        Returns: {
          checkpoint: Json
          company_id: string
          evidence: Json
          job_id: string
          job_key: string
          source_hash: string
          source_path: string
          updated_at: string
        }[]
      }
      get_rfm_snapshot: {
        Args: { p_as_of?: string; p_limit?: number }
        Returns: Json
      }
      get_sales_export_rows: {
        Args: { p_company_id: string; p_max_rows?: number }
        Returns: Json
      }
      get_sales_secondary_metrics: {
        Args: {
          p_company_id: string
          p_from?: string
          p_limit?: number
          p_months?: number
          p_to?: string
        }
        Returns: Json
      }
      heartbeat_report_execution_job: {
        Args: {
          p_company_id: string
          p_job_id: string
          p_lease_seconds?: number
          p_lease_token: string
          p_worker_id: string
        }
        Returns: boolean
      }
      import_commit_batch:
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_null_policy?: string
              p_rows: Json
            }
            Returns: Json
          }
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_null_policy?: string
              p_rows: Json
              p_source_hash?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_import_job_id?: string
              p_null_policy?: string
              p_repair?: boolean
              p_rows: Json
              p_source_hash?: string
            }
            Returns: Json
          }
      import_commit_batch_governed: {
        Args: {
          p_company_id: string
          p_entity_type: string
          p_null_policy?: string
          p_resolutions: Json
          p_rows: Json
          p_source_rows: Json
        }
        Returns: Json
      }
      import_create_job:
        | {
            Args: {
              p_company_id: string
              p_entity_type?: string
              p_total_rows?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_file_record_id?: string
              p_profile_id?: string
              p_total_rows?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_file_record_id: string
              p_idempotency_key: string
              p_profile_id: string
              p_source_fingerprint?: string
              p_total_rows: number
            }
            Returns: string
          }
        | {
            Args: {
              p_company_id: string
              p_entity_type: string
              p_file_mime: string
              p_file_name: string
              p_file_size: number
              p_source_object_path: string
              p_total_rows: number
            }
            Returns: string
          }
      import_finish_job: {
        Args: {
          p_error_message?: string
          p_job_id: string
          p_result_summary?: Json
          p_status: string
        }
        Returns: undefined
      }
      import_update_job_progress: {
        Args: {
          p_duplicate_rows?: number
          p_invalid_rows?: number
          p_job_id: string
          p_processed_rows: number
          p_status?: string
          p_valid_rows: number
        }
        Returns: undefined
      }
      import_upsert_customer: {
        Args: {
          p_code?: string
          p_company_id: string
          p_credit_limit?: number
          p_email?: string
          p_name: string
          p_null_policy?: string
          p_payment_terms_days?: number
          p_phone?: string
          p_segment?: string
        }
        Returns: {
          action: string
          target_id: string
        }[]
      }
      import_upsert_product: {
        Args: {
          p_company_id: string
          p_cost_price?: number
          p_is_active?: boolean
          p_min_stock?: number
          p_name?: string
          p_null_policy?: string
          p_reorder_point?: number
          p_selling_price?: number
          p_sku: string
          p_unit?: string
        }
        Returns: {
          action: string
          target_id: string
        }[]
      }
      import_upsert_sales_invoice:
        | {
            Args: {
              p_company_id: string
              p_customer_id?: string
              p_customer_name?: string
              p_invoice_date: string
              p_invoice_number: string
              p_null_policy?: string
              p_paid_amount?: number
              p_status?: string
              p_subtotal?: number
              p_tax_amount?: number
              p_total?: number
            }
            Returns: {
              action: string
              target_id: string
            }[]
          }
        | {
            Args: {
              p_company_id: string
              p_customer_id: string
              p_invoice_date: string
              p_invoice_number: string
              p_null_policy?: string
              p_paid_amount?: number
              p_status?: string
              p_subtotal?: number
              p_tax_amount?: number
              p_total?: number
            }
            Returns: {
              action: string
              target_id: string
            }[]
          }
      inventory_liquidity_velocity: {
        Args: { p_as_of?: string; p_company_id: string; p_days?: number }
        Returns: {
          avg_daily_sales: number
          avg_half_month_sales: number
          avg_half_year_sales: number
          avg_monthly_sales: number
          avg_weekly_sales: number
          avg_yearly_sales: number
          days_since_sale: number
          estimated_days_to_clear: number
          last_sale_date: string
          liquidity_class: string
          product_id: string
          product_name: string
          sku: string
          stock_qty: number
          stock_value: number
        }[]
      }
      is_continuous_trust_healthy: {
        Args: { p_certificate_key: string }
        Returns: boolean
      }
      is_trust_certificate_valid: {
        Args: { p_certificate_key: string }
        Returns: boolean
      }
      link_recommendation_to_decision: {
        Args: { p_decision_id: string; p_recommendation_id: string }
        Returns: undefined
      }
      mark_alert_read: { Args: { p_alert_id: string }; Returns: undefined }
      normalize_import_key: { Args: { input: string }; Returns: string }
      notify_decision_work_item: {
        Args: { p_description: string; p_title: string; p_work_item_id: string }
        Returns: string
      }
      phase_l_production_autonomy_health: { Args: never; Returns: Json }
      prepare_e2e_order: {
        Args: { p_order_id: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string
          currency: string
          customer_id: string
          id: string
          idempotency_key: string
          order_number: number
          quantity_confirmed_at: string | null
          status: string
          total: number
          updated_at: string
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      provision_e2e_test_membership: {
        Args: {
          p_company_id: string
          p_is_default?: boolean
          p_role: string
          p_user_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_report_run: {
        Args: {
          p_company_id: string
          p_formats: Json
          p_idempotency_key: string
          p_input_fingerprint: string
          p_max_attempts?: number
          p_parameters: Json
          p_report_id: string
          p_request_fingerprint: string
          p_requested_by: string
          p_source_snapshot_id: string
        }
        Returns: string
      }
      record_control_plane_health: {
        Args: {
          p_critical_blocker_count?: number
          p_data_quality_score: number
          p_decision_score: number
          p_evidence?: Json
          p_evidence_score: number
          p_forecast_score: number
          p_overall_score: number
          p_trust_score: number
        }
        Returns: string
      }
      record_decision_outcome: {
        Args: {
          p_action_id: string
          p_actual_value?: number
          p_decision_fingerprint: string
          p_evidence_snapshot_id: string
          p_expected_value?: number
          p_impact_value?: number
          p_label: string
          p_notes?: string
          p_observed_at: string
        }
        Returns: string
      }
      record_entitlement_usage: {
        Args: {
          p_capability: string
          p_idempotency_key: string
          p_period: string
          p_quantity: number
        }
        Returns: string
      }
      record_executive_evidence_edge: {
        Args: {
          p_evidence?: Json
          p_relation: string
          p_source_key: string
          p_source_type: string
          p_target_key: string
          p_target_type: string
          p_weight?: number
        }
        Returns: string
      }
      record_recommendation_outcome: {
        Args: {
          p_actual_impact?: number
          p_decision_id?: string
          p_evidence?: Json
          p_expected_impact?: number
          p_observed_at: string
          p_outcome_quality?: number
          p_recommendation_key: string
          p_status?: string
        }
        Returns: string
      }
      record_watched_report_file: {
        Args: {
          p_content_hash: string
          p_folder_id: string
          p_modified_at: string
          p_relative_path: string
          p_size_bytes: number
          p_state: string
        }
        Returns: string
      }
      recover_completed_report_execution_result: {
        Args: {
          p_company_id: string
          p_entity_type: string
          p_import_job_id: string
          p_rendered_output: Json
          p_report_execution_job_id: string
          p_row_count: number
          p_source_hash: string
        }
        Returns: Json
      }
      recover_expired_report_execution_jobs: {
        Args: { p_company_id: string; p_limit?: number }
        Returns: number
      }
      recover_missing_report_rendered_outputs: {
        Args: { p_company_id: string }
        Returns: {
          repaired_job_id: string
          repaired_output_count: number
          repaired_source_hash: string
          repaired_source_path: string
        }[]
      }
      recover_missing_source_analysis_snapshots: {
        Args: { p_company_id: string }
        Returns: {
          recovered_column_count: number
          recovered_job_id: string
          recovered_quality_score: number
          recovered_row_count: number
          recovered_source_hash: string
        }[]
      }
      refresh_report_evidence_passport: {
        Args: { p_company_id: string; p_job_id: string }
        Returns: Json
      }
      rehydrate_legacy_import_job: {
        Args: { p_company_id: string; p_file_record_id: string }
        Returns: string
      }
      release_is_verified: { Args: { p_release_key: string }; Returns: boolean }
      remove_alternative_item_group_member: {
        Args: { p_company_id: string; p_member_id: string }
        Returns: boolean
      }
      remove_cart_item: { Args: { p_product_id: string }; Returns: undefined }
      report_receivables_snapshot: {
        Args: { p_as_of_date?: string; p_page?: number; p_page_size?: number }
        Returns: {
          bucket: string
          bucket_0_30: number
          bucket_31_60: number
          bucket_61_90: number
          bucket_90_plus: number
          company_id: string
          customer_id: string
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          outstanding: number
          paid_amount: number
          status: string
          total: number
          total_outstanding: number
          total_rows: number
          undated_rows: number
        }[]
      }
      request_decision_approval: {
        Args: { p_decision_id: string; p_reason?: string }
        Returns: string
      }
      retry_report_execution_job: {
        Args: { p_company_id: string; p_job_id: string }
        Returns: boolean
      }
      set_cart_item: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      start_decision_work_item: {
        Args: { p_work_item_id: string }
        Returns: boolean
      }
      update_recommendation_status: {
        Args: { p_recommendation_id: string; p_status: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
