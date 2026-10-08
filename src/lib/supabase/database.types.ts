// Generated from the Supabase schema. Regenerate after every migration.
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
      campaign_email_accounts: {
        Row: {
          campaign_id: string
          created_at: string
          email_account_id: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email_account_id: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email_account_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_email_accounts_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "campaign_email_accounts_email_account_id_workspace_id_fkey"
            columns: ["email_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      campaign_leads: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          email_account_id: string | null
          id: string
          last_error: string | null
          last_message_id: string | null
          last_sent_at: string | null
          lead_id: string
          next_send_at: string | null
          next_step: number
          replied_at: string | null
          status: string
          thread_message_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          email_account_id?: string | null
          id?: string
          last_error?: string | null
          last_message_id?: string | null
          last_sent_at?: string | null
          lead_id: string
          next_send_at?: string | null
          next_step?: number
          replied_at?: string | null
          status?: string
          thread_message_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          email_account_id?: string | null
          id?: string
          last_error?: string | null
          last_message_id?: string | null
          last_sent_at?: string | null
          lead_id?: string
          next_send_at?: string | null
          next_step?: number
          replied_at?: string | null
          status?: string
          thread_message_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leads_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "campaign_leads_email_account_id_workspace_id_fkey"
            columns: ["email_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "campaign_leads_lead_id_workspace_id_fkey"
            columns: ["lead_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          daily_limit: number
          gap_max_minutes: number
          gap_min_minutes: number
          id: string
          include_unsubscribe: boolean
          name: string
          next_available_at: string | null
          send_days: number[]
          started_at: string | null
          status: string
          stop_on_reply: boolean
          timezone: string
          track_clicks: boolean
          track_opens: boolean
          updated_at: string
          use_lead_timezone: boolean
          window_end: string
          window_start: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          gap_max_minutes?: number
          gap_min_minutes?: number
          id?: string
          include_unsubscribe?: boolean
          name: string
          next_available_at?: string | null
          send_days?: number[]
          started_at?: string | null
          status?: string
          stop_on_reply?: boolean
          timezone?: string
          track_clicks?: boolean
          track_opens?: boolean
          updated_at?: string
          use_lead_timezone?: boolean
          window_end?: string
          window_start?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          gap_max_minutes?: number
          gap_min_minutes?: number
          id?: string
          include_unsubscribe?: boolean
          name?: string
          next_available_at?: string | null
          send_days?: number[]
          started_at?: string | null
          status?: string
          stop_on_reply?: boolean
          timezone?: string
          track_clicks?: boolean
          track_opens?: boolean
          updated_at?: string
          use_lead_timezone?: boolean
          window_end?: string
          window_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_account_secrets: {
        Row: {
          api_key_enc: string
          email_account_id: string
          updated_at: string
        }
        Insert: {
          api_key_enc: string
          email_account_id: string
          updated_at?: string
        }
        Update: {
          api_key_enc?: string
          email_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_account_secrets_email_account_id_fkey"
            columns: ["email_account_id"]
            isOneToOne: true
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          body_format: string
          created_at: string
          id: string
          name: string
          subject: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string
          body_format?: string
          created_at?: string
          id?: string
          name: string
          subject?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          body_format?: string
          created_at?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          daily_limit: number
          email: string
          from_name: string
          id: string
          last_error: string | null
          last_sent_at: string | null
          last_tested_at: string | null
          next_available_at: string | null
          postal_server_id: string
          signature: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          email: string
          from_name?: string
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_tested_at?: string | null
          next_available_at?: string | null
          postal_server_id: string
          signature?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          email?: string
          from_name?: string
          id?: string
          last_error?: string | null
          last_sent_at?: string | null
          last_tested_at?: string | null
          next_available_at?: string | null
          postal_server_id?: string
          signature?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_postal_server_fkey"
            columns: ["postal_server_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "postal_servers"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "email_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: number
          lead_id: string | null
          metadata: Json
          sent_message_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          lead_id?: string | null
          metadata?: Json
          sent_message_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: never
          lead_id?: string | null
          metadata?: Json
          sent_message_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "events_lead_id_workspace_id_fkey"
            columns: ["lead_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "events_sent_message_id_workspace_id_fkey"
            columns: ["sent_message_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sent_messages"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_messages: {
        Row: {
          campaign_id: string | null
          category: string | null
          deleted_at: string | null
          created_at: string
          direction: string
          email_account_id: string
          from_email: string
          from_name: string | null
          html_body: string | null
          id: string
          in_reply_to: string | null
          is_read: boolean
          kind: string
          lead_id: string | null
          match_method: string | null
          message_id: string
          received_at: string
          references_header: string | null
          sent_message_id: string | null
          subject: string
          text_body: string | null
          to_email: string | null
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          category?: string | null
          deleted_at?: string | null
          created_at?: string
          direction?: string
          email_account_id: string
          from_email: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          kind?: string
          lead_id?: string | null
          match_method?: string | null
          message_id: string
          received_at?: string
          references_header?: string | null
          sent_message_id?: string | null
          subject?: string
          text_body?: string | null
          to_email?: string | null
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          category?: string | null
          deleted_at?: string | null
          created_at?: string
          direction?: string
          email_account_id?: string
          from_email?: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          is_read?: boolean
          kind?: string
          lead_id?: string | null
          match_method?: string | null
          message_id?: string
          received_at?: string
          references_header?: string | null
          sent_message_id?: string | null
          subject?: string
          text_body?: string | null
          to_email?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "inbox_messages_email_account_id_workspace_id_fkey"
            columns: ["email_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "inbox_messages_lead_id_workspace_id_fkey"
            columns: ["lead_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "inbox_messages_sent_message_id_workspace_id_fkey"
            columns: ["sent_message_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sent_messages"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string
          custom_fields: Json
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          linkedin_url: string | null
          notes: string
          phone: string | null
          tags: string[]
          timezone: string | null
          title: string | null
          updated_at: string
          verification_status: string
          website: string | null
          workspace_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          custom_fields?: Json
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          notes?: string
          phone?: string | null
          tags?: string[]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
          workspace_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          notes?: string
          phone?: string | null
          tags?: string[]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      postal_servers: {
        Row: {
          api_url: string
          check_message_id: string | null
          check_sent_at: string | null
          created_at: string
          hook_token: string
          id: string
          last_inbound_at: string | null
          last_webhook_at: string | null
          route_ok_at: string | null
          updated_at: string
          warning: string | null
          warning_at: string | null
          webhook_ok_at: string | null
          workspace_id: string
        }
        Insert: {
          api_url: string
          check_message_id?: string | null
          check_sent_at?: string | null
          created_at?: string
          hook_token: string
          id?: string
          last_inbound_at?: string | null
          last_webhook_at?: string | null
          route_ok_at?: string | null
          updated_at?: string
          warning?: string | null
          warning_at?: string | null
          webhook_ok_at?: string | null
          workspace_id: string
        }
        Update: {
          api_url?: string
          check_message_id?: string | null
          check_sent_at?: string | null
          created_at?: string
          hook_token?: string
          id?: string
          last_inbound_at?: string | null
          last_webhook_at?: string | null
          route_ok_at?: string | null
          updated_at?: string
          warning?: string | null
          warning_at?: string | null
          webhook_ok_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "postal_servers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_messages: {
        Row: {
          body_html: string | null
          bounced_at: string | null
          campaign_id: string
          campaign_lead_id: string
          click_count: number
          clicked_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_detail: string | null
          delivery_status: string | null
          email_account_id: string | null
          error: string | null
          id: string
          in_reply_to: string | null
          lead_id: string
          message_id: string
          open_count: number
          opened_at: string | null
          provider_message_id: string | null
          replied_at: string | null
          sent_at: string | null
          sequence_step_id: string
          status: string
          step_position: number
          subject: string
          to_email: string
          workspace_id: string
        }
        Insert: {
          body_html?: string | null
          bounced_at?: string | null
          campaign_id: string
          campaign_lead_id: string
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string | null
          email_account_id?: string | null
          error?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id: string
          message_id: string
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string | null
          replied_at?: string | null
          sent_at?: string | null
          sequence_step_id: string
          status?: string
          step_position: number
          subject?: string
          to_email: string
          workspace_id: string
        }
        Update: {
          body_html?: string | null
          bounced_at?: string | null
          campaign_id?: string
          campaign_lead_id?: string
          click_count?: number
          clicked_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_detail?: string | null
          delivery_status?: string | null
          email_account_id?: string | null
          error?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string
          message_id?: string
          open_count?: number
          opened_at?: string | null
          provider_message_id?: string | null
          replied_at?: string | null
          sent_at?: string | null
          sequence_step_id?: string
          status?: string
          step_position?: number
          subject?: string
          to_email?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_messages_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sent_messages_campaign_lead_id_workspace_id_fkey"
            columns: ["campaign_lead_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaign_leads"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sent_messages_email_account_id_workspace_id_fkey"
            columns: ["email_account_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sent_messages_lead_id_workspace_id_fkey"
            columns: ["lead_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "sent_messages_sequence_step_id_workspace_id_fkey"
            columns: ["sequence_step_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          body: string
          body_format: string
          campaign_id: string
          created_at: string
          delay_days: number
          delay_hours: number
          id: string
          position: number
          subject: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string
          body_format?: string
          campaign_id: string
          created_at?: string
          delay_days?: number
          delay_hours?: number
          id?: string
          position: number
          subject?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          body_format?: string
          campaign_id?: string
          created_at?: string
          delay_days?: number
          delay_hours?: number
          id?: string
          position?: number
          subject?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_campaign_id_workspace_id_fkey"
            columns: ["campaign_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          active_workspace_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_workspace_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_workspace_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_lead_tags: {
        Args: { p_lead_ids: string[]; p_tags: string[] }
        Returns: number
      }
      add_leads_to_campaign: {
        Args: { p_campaign_id: string; p_lead_ids?: string[]; p_tag?: string }
        Returns: number
      }
      claim_send: {
        Args: {
          p_account_id: string
          p_campaign_lead_id: string
          p_in_reply_to?: string
          p_message_id: string
          p_step_id: string
        }
        Returns: { out_result: string; out_sent_message_id: string }[]
      }
      complete_lead: {
        Args: { p_campaign_lead_id: string }
        Returns: undefined
      }
      fail_send: {
        Args: {
          p_count?: boolean
          p_error: string
          p_mode: string
          p_retry_in?: string
          p_sent_message_id: string
        }
        Returns: string
      }
      finalize_send: {
        Args: { p_body_html?: string; p_metadata?: Json; p_sent_message_id: string; p_subject: string }
        Returns: boolean
      }
      ingest_inbound: {
        Args: {
          p_account_id: string
          p_kind: string
          p_match_method: string
          p_message: Json
          p_sent_message_id: string
        }
        Returns: string
      }
      record_click: {
        Args: { p_meta?: Json; p_sent_message_id: string; p_url: string }
        Returns: boolean
      }
      record_open: {
        Args: { p_meta?: Json; p_sent_message_id: string }
        Returns: boolean
      }
      unsubscribe_by_message: {
        Args: { p_sent_message_id: string }
        Returns: { out_email: string; out_result: string }[]
      }
      unsubscribe_info: {
        Args: { p_sent_message_id: string }
        Returns: { out_already: boolean; out_email: string; out_sender: string }[]
      }
      sweep_stale_sends: {
        Args: { p_older_than?: string }
        Returns: number
      }
      campaign_activity: {
        Args: {
          p_campaign_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_since?: string
          p_step?: number
          p_type?: string
        }
        Returns: {
          created_at: string
          id: number
          inbox_email: string | null
          lead_email: string | null
          lead_id: string | null
          lead_name: string | null
          metadata: Json
          step_position: number | null
          subject: string | null
          total_count: number
          type: string
        }[]
      }
      campaign_stats: { Args: { p_campaign_id: string }; Returns: Json }
      dashboard_activity: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          id: number
          lead_email: string | null
          lead_id: string | null
          lead_name: string | null
          step_position: number | null
          type: string
        }[]
      }
      dashboard_stats: { Args: { p_days?: number; p_workspace_id: string }; Returns: Json }
      import_leads: {
        Args: {
          p_rows: Json
          p_update_existing?: boolean
          p_workspace_id: string
        }
        Returns: {
          inserted: number
          skipped: number
          updated: number
        }[]
      }
      remove_lead_tags: {
        Args: { p_lead_ids: string[]; p_tags: string[] }
        Returns: number
      }
      remove_leads_from_campaign: {
        Args: { p_campaign_id: string; p_campaign_lead_ids: string[] }
        Returns: number
      }
      save_sequence: {
        Args: { p_campaign_id: string; p_steps: Json }
        Returns: {
          body: string
          body_format: string
          campaign_id: string
          created_at: string
          delay_days: number
          id: string
          position: number
          subject: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sequence_steps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      unibox_bulk: {
        Args: { p_action: string; p_ids: string[]; p_value?: string }
        Returns: number
      }
      unibox_list: {
        Args: { p_category?: string; p_filter?: string; p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          category: string
          from_email: string
          from_name: string
          id: string
          inbox_email: string
          is_read: boolean
          kind: string
          lead_id: string
          lead_name: string
          message_count: number
          preview: string
          received_at: string
          subject: string
          total_count: number
          unread_count: number
        }[]
      }
      unibox_sent_list: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          campaign_id: string | null
          campaign_name: string | null
          clicked: boolean
          delivery_status: string | null
          id: string
          inbox_email: string | null
          lead_id: string | null
          lead_name: string | null
          opened: boolean
          preview: string
          replied: boolean
          sent_at: string
          source: string
          status: string
          step_position: number | null
          subject: string
          to_email: string
          total_count: number
        }[]
      }
      workspace_custom_field_keys: {
        Args: { p_workspace_id: string }
        Returns: {
          key: string
        }[]
      }
      workspace_lead_tags: {
        Args: { p_workspace_id: string }
        Returns: {
          lead_count: number
          tag: string
        }[]
      }
      my_workspaces: {
        Args: never
        Returns: {
          id: string
          is_active: boolean
          name: string
          role: string
        }[]
      }
      switch_workspace: { Args: { p_workspace_id: string }; Returns: undefined }
      create_workspace: { Args: { p_name: string }; Returns: string }
      delete_workspace: { Args: { p_workspace_id: string }; Returns: undefined }
      duplicate_campaign: { Args: { p_campaign_id: string }; Returns: string }
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
