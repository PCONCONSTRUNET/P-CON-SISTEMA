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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
          type: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      affiliate_clicks: {
        Row: {
          affiliate_link_id: string
          created_at: string
          id: string
          ip_hash: string | null
          referer: string | null
          user_agent: string | null
        }
        Insert: {
          affiliate_link_id: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          referer?: string | null
          user_agent?: string | null
        }
        Update: {
          affiliate_link_id?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          referer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_leads: {
        Row: {
          affiliate_link_id: string
          converted_at: string | null
          created_at: string
          expires_at: string
          id: string
          is_converted: boolean
          lead_email: string | null
          lead_name: string
          lead_phone: string | null
          source: string | null
        }
        Insert: {
          affiliate_link_id: string
          converted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_converted?: boolean
          lead_email?: string | null
          lead_name: string
          lead_phone?: string | null
          source?: string | null
        }
        Update: {
          affiliate_link_id?: string
          converted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_converted?: boolean
          lead_email?: string | null
          lead_name?: string
          lead_phone?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_leads_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_links: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          is_active: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: true
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_rewards: {
        Row: {
          affiliate_lead_id: string
          affiliate_link_id: string
          amount: number
          approved_at: string | null
          created_at: string
          description: string | null
          id: string
          paid_at: string | null
          reward_type: string
          status: Database["public"]["Enums"]["referral_reward_status"]
          updated_at: string
        }
        Insert: {
          affiliate_lead_id: string
          affiliate_link_id: string
          amount?: number
          approved_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          reward_type?: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
        }
        Update: {
          affiliate_lead_id?: string
          affiliate_link_id?: string
          amount?: number
          approved_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          reward_type?: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_rewards_affiliate_lead_id_fkey"
            columns: ["affiliate_lead_id"]
            isOneToOne: true
            referencedRelation: "affiliate_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_rewards_affiliate_link_id_fkey"
            columns: ["affiliate_link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_sessions: {
        Row: {
          affiliate_user_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          affiliate_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          affiliate_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_sessions_affiliate_user_id_fkey"
            columns: ["affiliate_user_id"]
            isOneToOne: false
            referencedRelation: "affiliate_users"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_users: {
        Row: {
          affiliate_id: string
          created_at: string
          email: string
          id: string
          last_login: string | null
          password_hash: string
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          email: string
          id?: string
          last_login?: string | null
          password_hash: string
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          email?: string
          id?: string
          last_login?: string | null
          password_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_users_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          pix_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          pix_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          pix_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_coupons: {
        Row: {
          client_id: string
          created_at: string
          current_balance: number
          description: string | null
          id: string
          initial_amount: number
          origin: string | null
          referral_reward_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_amount?: number
          origin?: string | null
          referral_reward_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          initial_amount?: number
          origin?: string | null
          referral_reward_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_sessions: {
        Row: {
          client_user_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          client_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          token: string
        }
        Update: {
          client_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_sessions_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          last_login: string | null
          password_hash: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          last_login?: string | null
          password_hash: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          last_login?: string | null
          password_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_vault: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notes: string | null
          password: string | null
          title: string
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          password?: string | null
          title: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          password?: string | null
          title?: string
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_vault_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          document: string | null
          email: string
          id: string
          name: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email: string
          id?: string
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string
          id?: string
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          client_id: string
          content: string | null
          created_at: string
          file_path: string | null
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_transactions: {
        Row: {
          amount: number
          coupon_id: string
          created_at: string
          description: string
          id: string
        }
        Insert: {
          amount: number
          coupon_id: string
          created_at?: string
          description: string
          id?: string
        }
        Update: {
          amount?: number
          coupon_id?: string
          created_at?: string
          description?: string
          id?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string | null
          expense_type: string
          id: string
          notes: string | null
          paid_at: string | null
          recurrence: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description: string
          due_date?: string | null
          expense_type?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          recurrence?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string | null
          expense_type?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          recurrence?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      implementation_requests: {
        Row: {
          admin_notes: string | null
          client_id: string
          created_at: string
          id: string
          implementation_id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          client_id: string
          created_at?: string
          id?: string
          implementation_id: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          client_id?: string
          created_at?: string
          id?: string
          implementation_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_requests_implementation_id_fkey"
            columns: ["implementation_id"]
            isOneToOne: false
            referencedRelation: "implementations"
            referencedColumns: ["id"]
          },
        ]
      }
      implementations: {
        Row: {
          availability: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          short_description: string | null
          status: string
          tags: string[] | null
          updated_at: string
          value: number
        }
        Insert: {
          availability?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          short_description?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          value?: number
        }
        Update: {
          availability?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          short_description?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          client_id: string
          description: string | null
          id: string
          issued_at: string
          number: string
          payment_id: string | null
          status: string
        }
        Insert: {
          amount: number
          client_id: string
          description?: string | null
          id?: string
          issued_at?: string
          number: string
          payment_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          client_id?: string
          description?: string | null
          id?: string
          issued_at?: string
          number?: string
          payment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          client_id: string
          id: string
          message: string
          sent_at: string
          status: string
          type: string
        }
        Insert: {
          client_id: string
          id?: string
          message: string
          sent_at?: string
          status?: string
          type: string
        }
        Update: {
          client_id?: string
          id?: string
          message?: string
          sent_at?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          asaas_id: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          proposal_id: string | null
          proposal_payment_type: string | null
          status: string
          subscription_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          asaas_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          proposal_id?: string | null
          proposal_payment_type?: string | null
          status?: string
          subscription_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          asaas_id?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          proposal_id?: string | null
          proposal_payment_type?: string | null
          status?: string
          subscription_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          allow_online_approval: boolean
          allow_partial_payment: boolean
          allow_payment: boolean
          approved_at: string | null
          approved_notification_sent_at: string | null
          client_company: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          delivery_deadline: string | null
          discount_amount: number
          entry_amount: number | null
          entry_paid_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          monthly_amount: number | null
          notes: string | null
          paid_at: string | null
          project_description: string | null
          project_title: string
          public_link_enabled: boolean
          public_slug: string
          rejected_at: string | null
          rejected_notification_sent_at: string | null
          scope_items: string[]
          sent_at: string | null
          start_deadline: string | null
          status: string
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string
          valid_until: string
          view_count: number
          view_notification_sent_at: string | null
        }
        Insert: {
          allow_online_approval?: boolean
          allow_partial_payment?: boolean
          allow_payment?: boolean
          approved_at?: string | null
          approved_notification_sent_at?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          delivery_deadline?: string | null
          discount_amount?: number
          entry_amount?: number | null
          entry_paid_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          monthly_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          project_description?: string | null
          project_title: string
          public_link_enabled?: boolean
          public_slug?: string
          rejected_at?: string | null
          rejected_notification_sent_at?: string | null
          scope_items?: string[]
          sent_at?: string | null
          start_deadline?: string | null
          status?: string
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
          valid_until: string
          view_count?: number
          view_notification_sent_at?: string | null
        }
        Update: {
          allow_online_approval?: boolean
          allow_partial_payment?: boolean
          allow_payment?: boolean
          approved_at?: string | null
          approved_notification_sent_at?: string | null
          client_company?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          delivery_deadline?: string | null
          discount_amount?: number
          entry_amount?: number | null
          entry_paid_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          monthly_amount?: number | null
          notes?: string | null
          paid_at?: string | null
          project_description?: string | null
          project_title?: string
          public_link_enabled?: boolean
          public_slug?: string
          rejected_at?: string | null
          rejected_notification_sent_at?: string | null
          scope_items?: string[]
          sent_at?: string | null
          start_deadline?: string | null
          status?: string
          terms_and_conditions?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string
          view_count?: number
          view_notification_sent_at?: string | null
        }
        Relationships: []
      }
      referral_clicks: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          referer: string | null
          referral_link_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          referer?: string | null
          referral_link_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          referer?: string | null
          referral_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_leads: {
        Row: {
          converted_at: string | null
          created_at: string
          expires_at: string
          id: string
          is_converted: boolean
          lead_email: string | null
          lead_name: string
          lead_phone: string | null
          referral_link_id: string
          source: string | null
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_converted?: boolean
          lead_email?: string | null
          lead_name: string
          lead_phone?: string | null
          referral_link_id: string
          source?: string | null
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_converted?: boolean
          lead_email?: string | null
          lead_name?: string
          lead_phone?: string | null
          referral_link_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_leads_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string
          description: string | null
          id: string
          paid_at: string | null
          referral_lead_id: string
          referral_link_id: string
          reward_type: string
          status: Database["public"]["Enums"]["referral_reward_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          referral_lead_id: string
          referral_link_id: string
          reward_type?: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          referral_lead_id?: string
          referral_link_id?: string
          reward_type?: string
          status?: Database["public"]["Enums"]["referral_reward_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_lead_id_fkey"
            columns: ["referral_lead_id"]
            isOneToOne: true
            referencedRelation: "referral_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_settings: {
        Row: {
          client_reward_description: string
          client_reward_value: number
          created_at: string
          id: string
          is_active: boolean
          reward_value: number
          updated_at: string
          validity_days: number
        }
        Insert: {
          client_reward_description?: string
          client_reward_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          reward_value?: number
          updated_at?: string
          validity_days?: number
        }
        Update: {
          client_reward_description?: string
          client_reward_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          reward_value?: number
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      referral_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          referred_name: string
          referred_phone: string
          referrer_document: string | null
          referrer_email: string | null
          referrer_name: string
          referrer_phone: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          referred_name: string
          referred_phone: string
          referrer_document?: string | null
          referrer_email?: string | null
          referrer_name: string
          referrer_phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          referred_name?: string
          referred_phone?: string
          referrer_document?: string | null
          referrer_email?: string | null
          referrer_name?: string
          referrer_phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          asaas_id: string | null
          client_id: string
          created_at: string
          id: string
          next_payment: string
          plan_name: string
          start_date: string
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          asaas_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          next_payment: string
          plan_name: string
          start_date?: string
          status?: string
          updated_at?: string
          value: number
        }
        Update: {
          asaas_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          next_payment?: string
          plan_name?: string
          start_date?: string
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          btzap_message_id: string | null
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          message: string
          message_type: string
          phone: string
          remote_jid: string | null
          status: string
          status_updated_at: string | null
          updated_at: string
        }
        Insert: {
          btzap_message_id?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          message_type?: string
          phone: string
          remote_jid?: string | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          btzap_message_id?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          message_type?: string
          phone?: string
          remote_jid?: string | null
          status?: string
          status_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          button_enabled: boolean
          button_text: string | null
          button_url: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          message_template: string
          name: string
          template_key: string
          updated_at: string
        }
        Insert: {
          button_enabled?: boolean
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message_template: string
          name: string
          template_key: string
          updated_at?: string
        }
        Update: {
          button_enabled?: boolean
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message_template?: string
          name?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_admin_notification: {
        Args: {
          p_category: string
          p_message: string
          p_metadata?: Json
          p_title: string
          p_type: string
        }
        Returns: string
      }
      generate_referral_slug: { Args: never; Returns: string }
      record_proposal_view: {
        Args: { p_public_slug: string }
        Returns: {
          allow_online_approval: boolean
          allow_partial_payment: boolean
          allow_payment: boolean
          approved_at: string | null
          approved_notification_sent_at: string | null
          client_company: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          delivery_deadline: string | null
          discount_amount: number
          entry_amount: number | null
          entry_paid_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          monthly_amount: number | null
          notes: string | null
          paid_at: string | null
          project_description: string | null
          project_title: string
          public_link_enabled: boolean
          public_slug: string
          rejected_at: string | null
          rejected_notification_sent_at: string | null
          scope_items: string[]
          sent_at: string | null
          start_deadline: string | null
          status: string
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string
          valid_until: string
          view_count: number
          view_notification_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_proposal: {
        Args: { p_action: string; p_public_slug: string }
        Returns: {
          allow_online_approval: boolean
          allow_partial_payment: boolean
          allow_payment: boolean
          approved_at: string | null
          approved_notification_sent_at: string | null
          client_company: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          delivery_deadline: string | null
          discount_amount: number
          entry_amount: number | null
          entry_paid_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          monthly_amount: number | null
          notes: string | null
          paid_at: string | null
          project_description: string | null
          project_title: string
          public_link_enabled: boolean
          public_slug: string
          rejected_at: string | null
          rejected_notification_sent_at: string | null
          scope_items: string[]
          sent_at: string | null
          start_deadline: string | null
          status: string
          terms_and_conditions: string | null
          total_amount: number
          updated_at: string
          valid_until: string
          view_count: number
          view_notification_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "proposals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      referral_reward_status: "pending" | "approved" | "paid"
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
  public: {
    Enums: {
      referral_reward_status: ["pending", "approved", "paid"],
    },
  },
} as const
