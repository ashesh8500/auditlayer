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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_progression: {
        Row: {
          account_id: string
          audit_id: string
          avg_comments: number | null
          avg_likes: number | null
          engagement: number | null
          followers: number | null
          id: string
          recorded_at: string
          score: number | null
        }
        Insert: {
          account_id: string
          audit_id: string
          avg_comments?: number | null
          avg_likes?: number | null
          engagement?: number | null
          followers?: number | null
          id?: string
          recorded_at?: string
          score?: number | null
        }
        Update: {
          account_id?: string
          audit_id?: string
          avg_comments?: number | null
          avg_likes?: number | null
          engagement?: number | null
          followers?: number | null
          id?: string
          recorded_at?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "account_progression_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_progression_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          avatar_url: string | null
          cache_valid_until: string | null
          created_at: string
          display_name: string | null
          handle: string
          id: string
          ig_connection_id: string | null
          ig_metrics_snapshot: string | null
          last_researched_at: string | null
          ownership_status: string
          platform: string
          research_snapshot: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          cache_valid_until?: string | null
          created_at?: string
          display_name?: string | null
          handle: string
          id?: string
          ig_connection_id?: string | null
          ig_metrics_snapshot?: string | null
          last_researched_at?: string | null
          ownership_status?: string
          platform?: string
          research_snapshot?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          cache_valid_until?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          ig_connection_id?: string | null
          ig_metrics_snapshot?: string | null
          last_researched_at?: string | null
          ownership_status?: string
          platform?: string
          research_snapshot?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_ig_connection_id_fkey"
            columns: ["ig_connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          detail: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          detail?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          detail?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          cost_cap_usd: number
          enabled_toolsets: Json
          hermes_api_base: string
          hermes_model: string
          id: number
          token_cap: number
          updated_at: string | null
        }
        Insert: {
          cost_cap_usd?: number
          enabled_toolsets?: Json
          hermes_api_base?: string
          hermes_model?: string
          id?: number
          token_cap?: number
          updated_at?: string | null
        }
        Update: {
          cost_cap_usd?: number
          enabled_toolsets?: Json
          hermes_api_base?: string
          hermes_model?: string
          id?: number
          token_cap?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      audit_batches: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string
          status: string
          subject_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key: string
          status?: string
          subject_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string
          status?: string
          subject_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_batches_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_batches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: string
          audit_id: string
          created_at: string | null
          detail: string
          event_type: string
          id: string
          phase: string | null
        }
        Insert: {
          actor?: string
          audit_id: string
          created_at?: string | null
          detail?: string
          event_type: string
          id?: string
          phase?: string | null
        }
        Update: {
          actor?: string
          audit_id?: string
          created_at?: string | null
          detail?: string
          event_type?: string
          id?: string
          phase?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_report_versions: {
        Row: {
          actor: string
          agent_bundle_version: string | null
          audit_id: string
          change_summary: string | null
          change_type: string
          changed_section: string | null
          created_at: string
          id: string
          intelligence_run_id: string | null
          prompt_version: string | null
          report_path: string
          source_refinement_id: string | null
          template_version: string
          version: number
        }
        Insert: {
          actor?: string
          agent_bundle_version?: string | null
          audit_id: string
          change_summary?: string | null
          change_type?: string
          changed_section?: string | null
          created_at?: string
          id?: string
          intelligence_run_id?: string | null
          prompt_version?: string | null
          report_path: string
          source_refinement_id?: string | null
          template_version?: string
          version: number
        }
        Update: {
          actor?: string
          agent_bundle_version?: string | null
          audit_id?: string
          change_summary?: string | null
          change_type?: string
          changed_section?: string | null
          created_at?: string
          id?: string
          intelligence_run_id?: string | null
          prompt_version?: string | null
          report_path?: string
          source_refinement_id?: string | null
          template_version?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_report_versions_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_report_versions_intelligence_run_id_fkey"
            columns: ["intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_report_versions_source_refinement_id_fkey"
            columns: ["source_refinement_id"]
            isOneToOne: false
            referencedRelation: "refinements"
            referencedColumns: ["id"]
          },
        ]
      }
      audits: {
        Row: {
          account_id: string | null
          admin_notes: string
          agent_bundle_version: string | null
          claimed_at: string | null
          claimed_by: string | null
          context: string
          cost_usd: number
          created_at: string | null
          force_refresh: boolean
          goal: string
          handle: string
          id: string
          last_failed_at: string | null
          limitations: Json
          milestone_label: string | null
          model: string | null
          platform: string
          prompt_version: string | null
          report_path: string | null
          report_type: string
          report_url: string | null
          report_version: number
          research_cache: string
          retry_count: number
          status: string
          template_version: string
          tokens_in: number
          tokens_out: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          admin_notes?: string
          agent_bundle_version?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          context?: string
          cost_usd?: number
          created_at?: string | null
          force_refresh?: boolean
          goal?: string
          handle: string
          id?: string
          last_failed_at?: string | null
          limitations?: Json
          milestone_label?: string | null
          model?: string | null
          platform?: string
          prompt_version?: string | null
          report_path?: string | null
          report_type?: string
          report_url?: string | null
          report_version?: number
          research_cache?: string
          retry_count?: number
          status?: string
          template_version?: string
          tokens_in?: number
          tokens_out?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          admin_notes?: string
          agent_bundle_version?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          context?: string
          cost_usd?: number
          created_at?: string | null
          force_refresh?: boolean
          goal?: string
          handle?: string
          id?: string
          last_failed_at?: string | null
          limitations?: Json
          milestone_label?: string | null
          model?: string | null
          platform?: string
          prompt_version?: string | null
          report_path?: string | null
          report_type?: string
          report_url?: string | null
          report_version?: number
          research_cache?: string
          retry_count?: number
          status?: string
          template_version?: string
          tokens_in?: number
          tokens_out?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audits_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_audits: {
        Row: {
          audit_id: string
          batch_id: string
        }
        Insert: {
          audit_id: string
          batch_id: string
        }
        Update: {
          audit_id?: string
          batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_audits_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_audits_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "audit_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      context_update_proposals: {
        Row: {
          base_version: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          evidence_ids: Json
          id: string
          intelligence_run_id: string | null
          operation: string
          path: string
          proposed_value: Json
          reason: string
          semantic_fingerprint: string | null
          status: string
          subject_id: string
        }
        Insert: {
          base_version: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence_ids?: Json
          id?: string
          intelligence_run_id?: string | null
          operation: string
          path: string
          proposed_value: Json
          reason?: string
          semantic_fingerprint?: string | null
          status?: string
          subject_id: string
        }
        Update: {
          base_version?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence_ids?: Json
          id?: string
          intelligence_run_id?: string | null
          operation?: string
          path?: string
          proposed_value?: Json
          reason?: string
          semantic_fingerprint?: string | null
          status?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_update_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_update_proposals_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_context_update_proposals_run"
            columns: ["intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string
          decision: string
          id: string
          note: string
          subject_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          note?: string
          subject_id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          note?: string
          subject_id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      embedding_models: {
        Row: {
          created_at: string
          dims: number
          distance_metric: string
          id: string
          notes: string
          provider: string
        }
        Insert: {
          created_at?: string
          dims: number
          distance_metric?: string
          id: string
          notes?: string
          provider?: string
        }
        Update: {
          created_at?: string
          dims?: number
          distance_metric?: string
          id?: string
          notes?: string
          provider?: string
        }
        Relationships: []
      }
      evidence: {
        Row: {
          channel_id: string | null
          confidence: string
          content_hash: string
          coverage: Json
          created_at: string
          expires_at: string | null
          id: string
          observed_at: string
          payload: Json
          snapshot_id: string | null
          source_type: string
          source_url: string | null
          subject_id: string
        }
        Insert: {
          channel_id?: string | null
          confidence: string
          content_hash: string
          coverage?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          observed_at: string
          payload?: Json
          snapshot_id?: string | null
          source_type: string
          source_url?: string | null
          subject_id: string
        }
        Update: {
          channel_id?: string | null
          confidence?: string
          content_hash?: string
          coverage?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          observed_at?: string
          payload?: Json
          snapshot_id?: string | null
          source_type?: string
          source_url?: string | null
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "subject_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_embeddings: {
        Row: {
          content_hash: string
          created_at: string
          dims: number
          embedding: string | null
          evidence_id: string
          id: string
          model_id: string
          subject_id: string
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          dims: number
          embedding?: string | null
          evidence_id: string
          id?: string
          model_id: string
          subject_id: string
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          dims?: number
          embedding?: string | null
          evidence_id?: string
          id?: string
          model_id?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_embeddings_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_embeddings_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "embedding_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_embeddings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_embeddings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_snapshot_members: {
        Row: {
          added_at: string
          evidence_id: string
          snapshot_id: string
        }
        Insert: {
          added_at?: string
          evidence_id: string
          snapshot_id: string
        }
        Update: {
          added_at?: string
          evidence_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_snapshot_members_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_snapshot_members_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "evidence_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_snapshots: {
        Row: {
          created_at: string
          id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subject_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_snapshots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          channel_type: string | null
          claim: string
          confidence: string
          created_at: string
          dimension_impacts: Json
          evidence_ids: Json
          finding_ref: string
          id: string
          intelligence_run_id: string
        }
        Insert: {
          channel_type?: string | null
          claim: string
          confidence: string
          created_at?: string
          dimension_impacts?: Json
          evidence_ids?: Json
          finding_ref: string
          id?: string
          intelligence_run_id: string
        }
        Update: {
          channel_type?: string | null
          claim?: string
          confidence?: string
          created_at?: string
          dimension_impacts?: Json
          evidence_ids?: Json
          finding_ref?: string
          id?: string
          intelligence_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_intelligence_run_id_fkey"
            columns: ["intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_connections: {
        Row: {
          access_token: string | null
          account_type: string | null
          created_at: string
          followers_count: number | null
          id: string
          ig_user_id: number
          ig_username: string
          is_active: boolean
          last_refreshed_at: string | null
          long_lived_expires_at: string
          long_lived_token: string
          media_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_type?: string | null
          created_at?: string
          followers_count?: number | null
          id?: string
          ig_user_id: number
          ig_username: string
          is_active?: boolean
          last_refreshed_at?: string | null
          long_lived_expires_at: string
          long_lived_token: string
          media_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_type?: string | null
          created_at?: string
          followers_count?: number | null
          id?: string
          ig_user_id?: number
          ig_username?: string
          is_active?: boolean
          last_refreshed_at?: string | null
          long_lived_expires_at?: string
          long_lived_token?: string
          media_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_run_progress: {
        Row: {
          created_at: string
          customer_state: string
          detail: string
          intelligence_run_id: string
          subject_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_state?: string
          detail?: string
          intelligence_run_id: string
          subject_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_state?: string
          detail?: string
          intelligence_run_id?: string
          subject_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_run_progress_intelligence_run_id_fkey"
            columns: ["intelligence_run_id"]
            isOneToOne: true
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_run_progress_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_run_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_runs: {
        Row: {
          batch_id: string | null
          brief_version: number
          cache_mode: string | null
          cost_usd: number
          created_at: string
          evidence_snapshot_id: string
          expertise_pack_version: string
          id: string
          latency_ms: number | null
          methodology_version: string
          model_config_hash: string
          output_schema_version: string
          prompt_version: string
          stage_state: Json
          status: string
          subject_id: string
          tokens_in: number
          tokens_out: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          brief_version: number
          cache_mode?: string | null
          cost_usd?: number
          created_at?: string
          evidence_snapshot_id: string
          expertise_pack_version: string
          id?: string
          latency_ms?: number | null
          methodology_version: string
          model_config_hash: string
          output_schema_version?: string
          prompt_version: string
          stage_state?: Json
          status?: string
          subject_id: string
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          brief_version?: number
          cache_mode?: string | null
          cost_usd?: number
          created_at?: string
          evidence_snapshot_id?: string
          expertise_pack_version?: string
          id?: string
          latency_ms?: number | null
          methodology_version?: string
          model_config_hash?: string
          output_schema_version?: string
          prompt_version?: string
          stage_state?: Json
          status?: string
          subject_id?: string
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_intelligence_runs_brief_version"
            columns: ["subject_id", "brief_version"]
            isOneToOne: false
            referencedRelation: "living_brief_versions"
            referencedColumns: ["subject_id", "version"]
          },
          {
            foreignKeyName: "fk_intelligence_runs_evidence_snapshot"
            columns: ["evidence_snapshot_id"]
            isOneToOne: false
            referencedRelation: "evidence_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "audit_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_runs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      living_brief_versions: {
        Row: {
          audience: Json
          confirmed: boolean
          constraints: Json
          created_at: string
          created_by: string | null
          decisions: Json
          experiments: Json
          goals: Json
          id: string
          identity: Json
          offers: Json
          positioning: Json
          schema_version: string
          subject_id: string
          version: number
        }
        Insert: {
          audience?: Json
          confirmed?: boolean
          constraints?: Json
          created_at?: string
          created_by?: string | null
          decisions?: Json
          experiments?: Json
          goals?: Json
          id?: string
          identity?: Json
          offers?: Json
          positioning?: Json
          schema_version?: string
          subject_id: string
          version: number
        }
        Update: {
          audience?: Json
          confirmed?: boolean
          constraints?: Json
          created_at?: string
          created_by?: string | null
          decisions?: Json
          experiments?: Json
          goals?: Json
          id?: string
          identity?: Json
          offers?: Json
          positioning?: Json
          schema_version?: string
          subject_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "living_brief_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "living_brief_versions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_incidents: {
        Row: {
          created_at: string
          environment: string
          event_count: number
          external_url: string | null
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          severity: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: string
          event_count?: number
          external_url?: string | null
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          severity: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          event_count?: number
          external_url?: string | null
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          severity?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      operator_jobs: {
        Row: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          audit_id: string | null
          created_at: string
          error: string
          id: string
          instruction: string
          kind: string
          requested_by: string | null
          result: string
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          audit_id?: string | null
          created_at?: string
          error?: string
          id?: string
          instruction: string
          kind: string
          requested_by?: string | null
          result?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          audit_id?: string | null
          created_at?: string
          error?: string
          id?: string
          instruction?: string
          kind?: string
          requested_by?: string | null
          result?: string
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_jobs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_jobs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_jobs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "operator_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_messages: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          run_id: string
          thread_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          run_id: string
          thread_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          run_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "operator_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_threads: {
        Row: {
          audit_id: string
          created_at: string
          created_by: string | null
          hermes_session_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          created_by?: string | null
          hermes_session_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          created_by?: string | null
          hermes_session_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_threads_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_graph: {
        Row: {
          avg_comments: number
          avg_likes: number
          benchmarks_id: string
          created_at: string
          followers: number
          handle: string
          id: string
          last_scraped: string | null
          niche: string
          platform: string
          relationship_evidence: Json
          relationship_status: string
          source_observed_at: string | null
          source_url: string
          top_format: string
          verification_status: string
        }
        Insert: {
          avg_comments?: number
          avg_likes?: number
          benchmarks_id: string
          created_at?: string
          followers?: number
          handle: string
          id?: string
          last_scraped?: string | null
          niche: string
          platform?: string
          relationship_evidence?: Json
          relationship_status?: string
          source_observed_at?: string | null
          source_url?: string
          top_format?: string
          verification_status?: string
        }
        Update: {
          avg_comments?: number
          avg_likes?: number
          benchmarks_id?: string
          created_at?: string
          followers?: number
          handle?: string
          id?: string
          last_scraped?: string | null
          niche?: string
          platform?: string
          relationship_evidence?: Json
          relationship_status?: string
          source_observed_at?: string | null
          source_url?: string
          top_format?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_graph_benchmarks_id_fkey"
            columns: ["benchmarks_id"]
            isOneToOne: false
            referencedRelation: "wellness_benchmarks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: string
          created_at: string | null
          current_period_end: string | null
          email: string | null
          full_name: string
          gifted_audits: number
          id: string
          onboarding_status: string
          plan: string
          role: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          trial_expires_at: string | null
          trial_link_id: string | null
          trial_plan: string | null
          trial_report_types: string[]
        }
        Insert: {
          account_type?: string
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          full_name?: string
          gifted_audits?: number
          id: string
          onboarding_status?: string
          plan?: string
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_expires_at?: string | null
          trial_link_id?: string | null
          trial_plan?: string | null
          trial_report_types?: string[]
        }
        Update: {
          account_type?: string
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          full_name?: string
          gifted_audits?: number
          id?: string
          onboarding_status?: string
          plan?: string
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_expires_at?: string | null
          trial_link_id?: string | null
          trial_plan?: string | null
          trial_report_types?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_trial_link_id_fkey"
            columns: ["trial_link_id"]
            isOneToOne: false
            referencedRelation: "trial_links"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_event_receipts: {
        Row: {
          applied: boolean
          command_type: string
          created_at: string
          current_period_end_epoch: number | null
          customer_id: string
          digest: string
          id: string
          outcome_code: string
          plan: string
          profile_id: string
          provider: string
          provider_created_epoch: number
          provider_event_id: string
          subscription_id: string
          subscription_status: string
        }
        Insert: {
          applied: boolean
          command_type: string
          created_at?: string
          current_period_end_epoch?: number | null
          customer_id: string
          digest: string
          id?: string
          outcome_code?: string
          plan: string
          profile_id: string
          provider?: string
          provider_created_epoch: number
          provider_event_id: string
          subscription_id: string
          subscription_status: string
        }
        Update: {
          applied?: boolean
          command_type?: string
          created_at?: string
          current_period_end_epoch?: number | null
          customer_id?: string
          digest?: string
          id?: string
          outcome_code?: string
          plan?: string
          profile_id?: string
          provider?: string
          provider_created_epoch?: number
          provider_event_id?: string
          subscription_id?: string
          subscription_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_event_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_outcomes: {
        Row: {
          confounding_notes: Json
          created_at: string
          created_by: string | null
          decision_state: string
          evidence_ids: Json
          id: string
          outcome_data: Json
          outcome_summary: string
          recommendation_id: string
          subject_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          confounding_notes?: Json
          created_at?: string
          created_by?: string | null
          decision_state: string
          evidence_ids?: Json
          id?: string
          outcome_data?: Json
          outcome_summary?: string
          recommendation_id: string
          subject_id: string
          window_end: string
          window_start: string
        }
        Update: {
          confounding_notes?: Json
          created_at?: string
          created_by?: string | null
          decision_state?: string
          evidence_ids?: Json
          id?: string
          outcome_data?: Json
          outcome_summary?: string
          recommendation_id?: string
          subject_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_outcomes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_outcomes_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_outcomes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          channel_type: string | null
          content: Json
          created_at: string
          evidence_ids: Json
          id: string
          intelligence_run_id: string
          recommendation_ref: string
          status: string
        }
        Insert: {
          channel_type?: string | null
          content?: Json
          created_at?: string
          evidence_ids?: Json
          id?: string
          intelligence_run_id: string
          recommendation_ref: string
          status?: string
        }
        Update: {
          channel_type?: string | null
          content?: Json
          created_at?: string
          evidence_ids?: Json
          id?: string
          intelligence_run_id?: string
          recommendation_ref?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_intelligence_run_id_fkey"
            columns: ["intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      refinements: {
        Row: {
          audit_id: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string | null
          error: string
          id: string
          instruction: string
          section: string
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          audit_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          error?: string
          id?: string
          instruction: string
          section: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          audit_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string | null
          error?: string
          id?: string
          instruction?: string
          section?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refinements_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      rejected_context_proposals: {
        Row: {
          evidence_ids: Json
          id: string
          operation: string
          path: string
          proposal_id: string
          proposed_value: Json
          rejected_at: string
          rejected_by: string | null
          semantic_fingerprint: string
          subject_id: string
        }
        Insert: {
          evidence_ids?: Json
          id?: string
          operation: string
          path: string
          proposal_id: string
          proposed_value: Json
          rejected_at?: string
          rejected_by?: string | null
          semantic_fingerprint: string
          subject_id: string
        }
        Update: {
          evidence_ids?: Json
          id?: string
          operation?: string
          path?: string
          proposal_id?: string
          proposed_value?: Json
          rejected_at?: string
          rejected_by?: string | null
          semantic_fingerprint?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejected_context_proposals_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "context_update_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejected_context_proposals_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rejected_context_proposals_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      report_generation_runs: {
        Row: {
          account_mode: string
          audit_id: string | null
          bundle_version: string | null
          cache_mode: string
          cost_usd: number
          created_at: string
          error_code: string | null
          evidence_items: number
          finished_at: string | null
          format_retry_used: boolean
          id: string
          model: string
          prompt_version: string
          quality_score: number | null
          report_type: string
          research_cache_used: boolean
          run_kind: string
          stage_timings: Json
          started_at: string
          status: string
          tokens_in: number
          tokens_out: number
          total_seconds: number | null
          updated_at: string
          worker_id: string
        }
        Insert: {
          account_mode?: string
          audit_id?: string | null
          bundle_version?: string | null
          cache_mode?: string
          cost_usd?: number
          created_at?: string
          error_code?: string | null
          evidence_items?: number
          finished_at?: string | null
          format_retry_used?: boolean
          id?: string
          model: string
          prompt_version: string
          quality_score?: number | null
          report_type: string
          research_cache_used?: boolean
          run_kind?: string
          stage_timings?: Json
          started_at?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
          total_seconds?: number | null
          updated_at?: string
          worker_id: string
        }
        Update: {
          account_mode?: string
          audit_id?: string | null
          bundle_version?: string | null
          cache_mode?: string
          cost_usd?: number
          created_at?: string
          error_code?: string | null
          evidence_items?: number
          finished_at?: string | null
          format_retry_used?: boolean
          id?: string
          model?: string
          prompt_version?: string
          quality_score?: number | null
          report_type?: string
          research_cache_used?: boolean
          run_kind?: string
          stage_timings?: Json
          started_at?: string
          status?: string
          tokens_in?: number
          tokens_out?: number
          total_seconds?: number | null
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_generation_runs_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          change_kind: string | null
          created_at: string
          dimension: string
          evidence_ids: Json
          id: string
          intelligence_run_id: string
          methodology_version: string
          previous_value: number | null
          value: number | null
        }
        Insert: {
          change_kind?: string | null
          created_at?: string
          dimension: string
          evidence_ids?: Json
          id?: string
          intelligence_run_id: string
          methodology_version: string
          previous_value?: number | null
          value?: number | null
        }
        Update: {
          change_kind?: string | null
          created_at?: string
          dimension?: string
          evidence_ids?: Json
          id?: string
          intelligence_run_id?: string
          methodology_version?: string
          previous_value?: number | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_intelligence_run_id_fkey"
            columns: ["intelligence_run_id"]
            isOneToOne: false
            referencedRelation: "intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          audit_id: string
          created_at: string | null
          created_by: string
          email: string | null
          expires_at: string | null
          id: string
          mode: string
          revoked_at: string | null
          token: string
          updated_at: string
          verification_code: string | null
          verification_code_expires: string | null
          verified_at: string | null
          view_count: number
        }
        Insert: {
          audit_id: string
          created_at?: string | null
          created_by: string
          email?: string | null
          expires_at?: string | null
          id?: string
          mode: string
          revoked_at?: string | null
          token: string
          updated_at?: string
          verification_code?: string | null
          verification_code_expires?: string | null
          verified_at?: string | null
          view_count?: number
        }
        Update: {
          audit_id?: string
          created_at?: string | null
          created_by?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          mode?: string
          revoked_at?: string | null
          token?: string
          updated_at?: string
          verification_code?: string | null
          verification_code_expires?: string | null
          verified_at?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_channels: {
        Row: {
          account_id: string | null
          channel_type: string
          created_at: string
          id: string
          locator: string
          managed: boolean
          subject_id: string
        }
        Insert: {
          account_id?: string | null
          channel_type: string
          created_at?: string
          id?: string
          locator: string
          managed?: boolean
          subject_id: string
        }
        Update: {
          account_id?: string | null
          channel_type?: string
          created_at?: string
          id?: string
          locator?: string
          managed?: boolean
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_channels_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_channels_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          id: string
          name: string
          subject_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          subject_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          subject_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_links: {
        Row: {
          access_days: number
          audits_granted: number
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          label: string | null
          max_uses: number | null
          offer_plan: string
          report_types: string[]
          revoked_at: string | null
          token: string
          used_count: number
        }
        Insert: {
          access_days?: number
          audits_granted?: number
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          offer_plan?: string
          report_types?: string[]
          revoked_at?: string | null
          token: string
          used_count?: number
        }
        Update: {
          access_days?: number
          audits_granted?: number
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          max_uses?: number | null
          offer_plan?: string
          report_types?: string[]
          revoked_at?: string | null
          token?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "trial_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wellness_benchmarks: {
        Row: {
          avg_engagement: number
          created_at: string
          cta: string
          followers_bracket: string
          id: string
          niche: string
          post_freq: string
          top_formats: Json
        }
        Insert: {
          avg_engagement?: number
          created_at?: string
          cta?: string
          followers_bracket: string
          id?: string
          niche: string
          post_freq?: string
          top_formats?: Json
        }
        Update: {
          avg_engagement?: number
          created_at?: string
          cta?: string
          followers_bracket?: string
          id?: string
          niche?: string
          post_freq?: string
          top_formats?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_audit_to_batch: {
        Args: { p_audit_id: string; p_batch_id: string }
        Returns: undefined
      }
      admin_set_access: {
        Args: {
          p_account_type: string
          p_actor_id: string
          p_gifted_audits: number
          p_plan: string
          p_reason: string
          p_target_user_id: string
        }
        Returns: Json
      }
      apply_brief_pointer: {
        Args: {
          p_base: Json
          p_operation: string
          p_path: string
          p_value: Json
        }
        Returns: Json
      }
      apply_brief_pointer_inner: {
        Args: {
          p_base: Json
          p_operation: string
          p_tokens: string[]
          p_value: Json
        }
        Returns: Json
      }
      approve_operator_job: {
        Args: { p_approved: boolean; p_job_id: string }
        Returns: undefined
      }
      attach_evidence_embedding: {
        Args: {
          p_content_hash: string
          p_embedding: string
          p_evidence_id: string
          p_model_id: string
        }
        Returns: string
      }
      backfill_connected_subjects: {
        Args: never
        Returns: {
          action: string
          detail: string
        }[]
      }
      brief_path_is_protected: { Args: { p_path: string }; Returns: boolean }
      brief_path_tokens: { Args: { p_path: string }; Returns: string[] }
      claim_next_queued: { Args: { worker_id: string }; Returns: Json }
      claim_next_refinement: { Args: { worker_id: string }; Returns: Json }
      create_audit_batch: {
        Args: {
          p_idempotency_key: string
          p_subject_id: string
          p_user_id: string
        }
        Returns: string
      }
      create_context_update_proposals: {
        Args: { p_proposals: Json }
        Returns: string[]
      }
      create_evidence_snapshot: {
        Args: { p_subject_id: string }
        Returns: string
      }
      create_subject: {
        Args: { p_name: string; p_subject_type?: string; p_user_id: string }
        Returns: string
      }
      disconnect_instagram_connection: {
        Args: { p_connection_id: string; p_user_id: string }
        Returns: undefined
      }
      finalize_initial_report: {
        Args: {
          p_agent_bundle_version: string
          p_audit_id: string
          p_delivery_status: string
          p_intelligence_run_id?: string
          p_prompt_version: string
          p_report_path: string
          p_template_version: string
        }
        Returns: number
      }
      finalize_intelligence_run: {
        Args: {
          p_cache_mode?: string
          p_cost_usd: number
          p_latency_ms: number
          p_run_id: string
          p_status: string
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
      finalize_refinement_report: {
        Args: {
          p_agent_bundle_version: string
          p_audit_id: string
          p_change_summary: string
          p_changed_section: string
          p_intelligence_run_id?: string
          p_prompt_version: string
          p_refinement_id: string
          p_report_path: string
          p_template_version: string
        }
        Returns: number
      }
      founder_transition_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_audit_id: string
          p_note?: string
        }
        Returns: Json
      }
      get_benchmarks: {
        Args: { p_bracket: string; p_niche: string }
        Returns: Json
      }
      increment_share_view: { Args: { p_token: string }; Returns: undefined }
      ingest_operator_incident: {
        Args: {
          p_environment: string
          p_external_url: string
          p_fingerprint: string
          p_metadata: Json
          p_severity: string
          p_source: string
          p_title: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_share_link_valid: { Args: { p_token: string }; Returns: string }
      link_subject_channel: {
        Args: {
          p_account_id?: string
          p_channel_type: string
          p_locator: string
          p_managed?: boolean
          p_subject_id: string
        }
        Returns: string
      }
      lookup_entitled_audit_batch_retry: {
        Args: { p_idempotency_key: string; p_user_id: string }
        Returns: Json
      }
      owns_audit: { Args: { target_audit_id: string }; Returns: boolean }
      owns_subject: { Args: { target_subject_id: string }; Returns: boolean }
      persist_instagram_connection: {
        Args: {
          p_account_type: string
          p_followers_count: number
          p_ig_user_id: number
          p_ig_username: string
          p_long_lived_expires_at: string
          p_long_lived_token: string
          p_media_count: number
          p_user_id: string
        }
        Returns: {
          account_id: string
          connection_id: string
        }[]
      }
      pin_evidence_to_snapshot: {
        Args: { p_evidence_ids: string[]; p_snapshot_id: string }
        Returns: number
      }
      reap_stale_report_generation_runs: {
        Args: { p_cutoff_minutes?: number }
        Returns: number
      }
      reap_stale_running: { Args: { cutoff_minutes?: number }; Returns: number }
      reconcile_stripe_subscription: {
        Args: {
          p_current_period_end_epoch: number
          p_customer_id: string
          p_digest: string
          p_event_created: number
          p_event_id: string
          p_event_type: string
          p_plan: string
          p_profile_id: string
          p_status: string
          p_subscription_id: string
        }
        Returns: Json
      }
      record_decision: {
        Args: {
          p_decision: string
          p_note?: string
          p_subject_id: string
          p_target_id: string
          p_target_type: string
          p_user_id: string
        }
        Returns: string
      }
      record_findings: { Args: { p_findings: Json }; Returns: undefined }
      record_living_brief_version: {
        Args: {
          p_audience: Json
          p_confirmed?: boolean
          p_constraints: Json
          p_created_by?: string
          p_decisions: Json
          p_experiments: Json
          p_goals: Json
          p_identity: Json
          p_offers: Json
          p_positioning: Json
          p_schema_version: string
          p_subject_id: string
          p_version: number
        }
        Returns: string
      }
      record_recommendation_outcome: {
        Args: {
          p_confounding_notes?: Json
          p_decision_state: string
          p_evidence_ids?: Json
          p_outcome_data?: Json
          p_outcome_summary?: string
          p_recommendation_id: string
          p_subject_id: string
          p_user_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: string
      }
      record_recommendations: {
        Args: { p_recommendations: Json }
        Returns: undefined
      }
      record_scores: { Args: { p_scores: Json }; Returns: undefined }
      redeem_trial_link: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      register_embedding_model: {
        Args: {
          p_dims: number
          p_distance_metric?: string
          p_id: string
          p_notes?: string
          p_provider?: string
        }
        Returns: string
      }
      resolve_context_update_proposal: {
        Args: {
          p_explicit_confirmation?: boolean
          p_proposal_id: string
          p_status: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_intelligence_run_progress: {
        Args: { p_customer_state: string; p_detail?: string; p_run_id: string }
        Returns: undefined
      }
      start_intelligence_run: {
        Args: {
          p_batch_id?: string
          p_brief_version: number
          p_evidence_snapshot_id: string
          p_expertise_pack_version: string
          p_methodology_version: string
          p_model_config_hash: string
          p_output_schema_version?: string
          p_prompt_version: string
          p_subject_id: string
        }
        Returns: string
      }
      submit_audit_batch: {
        Args: {
          p_audit_ids: string[]
          p_idempotency_key: string
          p_subject_id: string
          p_user_id: string
        }
        Returns: string
      }
      submit_entitled_audit_batch: {
        Args: {
          p_audits: Json
          p_idempotency_key: string
          p_subject_id: string
          p_user_id: string
        }
        Returns: Json
      }
      submit_entitled_audit_batch_v2: {
        Args: {
          p_audits: Json
          p_idempotency_key: string
          p_subject_draft: Json | null
          p_subject_id: string | null
          p_user_id: string
        }
        Returns: Json
      }
      submit_entitled_audit: {
        Args: {
          p_context: string
          p_goal: string
          p_handle: string
          p_limitations: Json
          p_milestone_label: string
          p_platform: string
          p_report_type: string
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      sweep_retryable_audits: {
        Args: {
          p_base_delay_seconds?: number
          p_max_retries?: number
          p_transient_delay_seconds?: number
        }
        Returns: Json
      }
      upsert_evidence: { Args: { p_items: Json }; Returns: string[] }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
