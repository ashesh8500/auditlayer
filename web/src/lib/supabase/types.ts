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
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
