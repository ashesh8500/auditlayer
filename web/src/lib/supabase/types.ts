export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Application-level event vocabulary; SQL stores this as validated text.
export type AuditEventPhase =
  | "intake"
  | "queued"
  | "approved"
  | "started"
  | "researching"
  | "metrics"
  | "peers"
  | "scoring"
  | "composing"
  | "uploaded"
  | "succeeded"
  | "failed"
  | "refinement"

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
          top_format: string
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
          top_format?: string
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
          top_format?: string
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
      claim_next_queued: { Args: { worker_id: string }; Returns: Json }
      claim_next_refinement: { Args: { worker_id: string }; Returns: Json }
      disconnect_instagram_connection: {
        Args: { p_connection_id: string; p_user_id: string }
        Returns: undefined
      }
      finalize_initial_report: {
        Args: {
          p_audit_id: string
          p_delivery_status: string
          p_prompt_version: string
          p_report_path: string
          p_template_version: string
        }
        Returns: number
      }
      finalize_refinement_report: {
        Args: {
          p_audit_id: string
          p_change_summary: string
          p_changed_section: string
          p_prompt_version: string
          p_refinement_id: string
          p_report_path: string
          p_template_version: string
        }
        Returns: number
      }
      get_benchmarks: {
        Args: { p_bracket: string; p_niche: string }
        Returns: Json
      }
      increment_share_view: { Args: { p_token: string }; Returns: undefined }
      ingest_operator_incident: {
        Args: {
          p_environment: string
          p_external_url: string | null
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
      owns_audit: { Args: { target_audit_id: string }; Returns: boolean }
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
      reap_stale_running: { Args: { cutoff_minutes?: number }; Returns: number }
      redeem_trial_link: {
        Args: { p_token: string; p_user_id: string }
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
