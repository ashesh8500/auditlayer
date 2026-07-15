/**
 * Database types for the AuditLayer Supabase schema.
 *
 * Hand-maintained to match the authoritative contract in
 * `docs/architecture-contract.md` and the SQL in `supabase/migrations/`.
 * Regenerate with the Supabase CLI once a project is linked:
 *   pnpm dlx supabase gen types typescript --linked > src/lib/supabase/types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AuditStatus =
  | "draft"
  | "queued"
  | "running"
  | "ready"
  | "needs_review"
  | "blocked"
  | "failed";

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
  | "refinement";

export type UserRole = "client" | "admin";

export type Plan = "free" | "starter" | "pro" | "enterprise";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string;
          role: UserRole;
          plan: Plan;
          subscription_status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_end: string | null;
          onboarding_status: string;
          account_type: string;
          gifted_audits: number;
          trial_link_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string;
          role?: UserRole;
          plan?: Plan;
          subscription_status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          onboarding_status?: string;
          account_type?: string;
          gifted_audits?: number;
          trial_link_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string;
          role?: UserRole;
          plan?: Plan;
          subscription_status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          onboarding_status?: string;
          account_type?: string;
          gifted_audits?: number;
          trial_link_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audits: {
        Row: {
          id: string;
          user_id: string;
          handle: string;
          platform: string;
          goal: string;
          context: string;
          status: AuditStatus;
          limitations: Json;
          admin_notes: string;
          milestone_label: string | null;
          model: string | null;
          report_path: string | null;
          report_url: string | null;
          pdf_url: string | null;
          cost_usd: number;
          tokens_in: number;
          tokens_out: number;
          retry_count: number;
          last_failed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          handle: string;
          platform?: string;
          goal?: string;
          context?: string;
          status?: AuditStatus;
          limitations?: Json;
          admin_notes?: string;
          milestone_label?: string | null;
          model?: string | null;
          report_path?: string | null;
          report_url?: string | null;
          pdf_url?: string | null;
          cost_usd?: number;
          tokens_in?: number;
          tokens_out?: number;
          retry_count?: number;
          last_failed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          handle?: string;
          platform?: string;
          goal?: string;
          context?: string;
          status?: AuditStatus;
          limitations?: Json;
          admin_notes?: string;
          milestone_label?: string | null;
          model?: string | null;
          report_path?: string | null;
          report_url?: string | null;
          pdf_url?: string | null;
          cost_usd?: number;
          tokens_in?: number;
          tokens_out?: number;
          retry_count?: number;
          last_failed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audits_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: string;
          audit_id: string;
          actor: string;
          event_type: string;
          phase: AuditEventPhase | null;
          detail: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          actor?: string;
          event_type: string;
          phase?: AuditEventPhase | null;
          detail?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          audit_id?: string;
          actor?: string;
          event_type?: string;
          phase?: AuditEventPhase | null;
          detail?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
      refinements: {
        Row: {
          id: string;
          audit_id: string;
          user_id: string | null;
          section: string;
          instruction: string;
          status: string;
          error: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          user_id?: string | null;
          section: string;
          instruction: string;
          status?: string;
          error?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          audit_id?: string;
          user_id?: string | null;
          section?: string;
          instruction?: string;
          status?: string;
          error?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refinements_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
      app_settings: {
        Row: {
          id: number;
          hermes_model: string;
          hermes_api_base: string;
          enabled_toolsets: Json;
          token_cap: number;
          cost_cap_usd: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          hermes_model?: string;
          hermes_api_base?: string;
          enabled_toolsets?: Json;
          token_cap?: number;
          cost_cap_usd?: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          hermes_model?: string;
          hermes_api_base?: string;
          enabled_toolsets?: Json;
          token_cap?: number;
          cost_cap_usd?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      trial_links: {
        Row: {
          id: string;
          token: string;
          audits_granted: number;
          created_by: string;
          label: string | null;
          max_uses: number | null;
          used_count: number;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          audits_granted?: number;
          created_by: string;
          label?: string | null;
          max_uses?: number | null;
          used_count?: number;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          audits_granted?: number;
          created_by?: string;
          label?: string | null;
          max_uses?: number | null;
          used_count?: number;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trial_links_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_actions: {
        Row: {
          id: string;
          actor_id: string;
          target_user_id: string | null;
          action: string;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          target_user_id?: string | null;
          action: string;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          target_user_id?: string | null;
          action?: string;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_actions_actor_id_fkey";
            columns: ["actor_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey";
            columns: ["target_user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wellness_benchmarks: {
        Row: {
          id: string;
          niche: string;
          followers_bracket: string;
          avg_engagement: number;
          top_formats: Json;
          post_freq: string;
          cta: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          niche: string;
          followers_bracket: string;
          avg_engagement?: number;
          top_formats?: Json;
          post_freq?: string;
          cta?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          niche?: string;
          followers_bracket?: string;
          avg_engagement?: number;
          top_formats?: Json;
          post_freq?: string;
          cta?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      peer_graph: {
        Row: {
          id: string;
          handle: string;
          niche: string;
          followers: number;
          platform: string;
          avg_likes: number;
          avg_comments: number;
          top_format: string;
          last_scraped: string | null;
          benchmarks_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          handle: string;
          niche: string;
          followers?: number;
          platform?: string;
          avg_likes?: number;
          avg_comments?: number;
          top_format?: string;
          last_scraped?: string | null;
          benchmarks_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          handle?: string;
          niche?: string;
          followers?: number;
          platform?: string;
          avg_likes?: number;
          avg_comments?: number;
          top_format?: string;
          last_scraped?: string | null;
          benchmarks_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "peer_graph_benchmarks_id_fkey";
            columns: ["benchmarks_id"];
            referencedRelation: "wellness_benchmarks";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
