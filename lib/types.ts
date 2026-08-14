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
  public: {
    Tables: {
      assignments: {
        Row: {
          bounty_amount_cents: number | null
          bounty_credited_at: string | null
          brief_id: string
          campaign_id: string | null
          company_id: string
          created_at: string | null
          creator_id: string
          id: string
          metrics: Json | null
          music_approved_at: string | null
          music_approved_by: string | null
          music_marked_by_creator_at: string | null
          post_url: string | null
          scheduled_date: string
          slot_index: number
          status: string
          submission_id: string | null
          task_id: string | null
        }
        Insert: {
          bounty_amount_cents?: number | null
          bounty_credited_at?: string | null
          brief_id: string
          campaign_id?: string | null
          company_id: string
          created_at?: string | null
          creator_id: string
          id?: string
          metrics?: Json | null
          music_approved_at?: string | null
          music_approved_by?: string | null
          music_marked_by_creator_at?: string | null
          post_url?: string | null
          scheduled_date: string
          slot_index?: number
          status?: string
          submission_id?: string | null
          task_id?: string | null
        }
        Update: {
          bounty_amount_cents?: number | null
          bounty_credited_at?: string | null
          brief_id?: string
          campaign_id?: string | null
          company_id?: string
          created_at?: string | null
          creator_id?: string
          id?: string
          metrics?: Json | null
          music_approved_at?: string | null
          music_approved_by?: string | null
          music_marked_by_creator_at?: string | null
          post_url?: string | null
          scheduled_date?: string
          slot_index?: number
          status?: string
          submission_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_music_approved_by_fkey"
            columns: ["music_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_links: {
        Row: {
          assignment_id: string | null
          code: string
          company_id: string
          creator_id: string | null
          id: string
          task_id: string | null
          url: string | null
        }
        Insert: {
          assignment_id?: string | null
          code: string
          company_id: string
          creator_id?: string | null
          id?: string
          task_id?: string | null
          url?: string | null
        }
        Update: {
          assignment_id?: string | null
          code?: string
          company_id?: string
          creator_id?: string | null
          id?: string
          task_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_links_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_links_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ban_list: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          phrase: string
          source_task_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          phrase: string
          source_task_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          phrase?: string
          source_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ban_list_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ban_list_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      banned_claims: {
        Row: {
          claim: string
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
        }
        Insert: {
          claim: string
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Update: {
          claim?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banned_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banned_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_features: {
        Row: {
          company_id: string
          created_at: string
          id: string
          idea_action: string
          idea_example: string
          idea_title: string
          name: string
          rank: number | null
          reason: string
          score: number | null
          screenshot_path: string
          sentence: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          idea_action?: string
          idea_example?: string
          idea_title?: string
          name?: string
          rank?: number | null
          reason?: string
          score?: number | null
          screenshot_path: string
          sentence: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          idea_action?: string
          idea_example?: string
          idea_title?: string
          name?: string
          rank?: number | null
          reason?: string
          score?: number | null
          screenshot_path?: string
          sentence?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_docs: {
        Row: {
          company_id: string
          content: string
          human_edited: boolean
          id: string
          kind: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          content?: string
          human_edited?: boolean
          id?: string
          kind: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          human_edited?: boolean
          id?: string
          kind?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_docs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          audience: string | null
          banned_phrases: string[]
          buying_path: string | null
          company_id: string
          content_pillars: Json | null
          hashtag_bank: string[]
          id: string
          product_type: string
          products: Json | null
          source_urls: string[] | null
          sourcing: Json
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          audience?: string | null
          banned_phrases?: string[]
          buying_path?: string | null
          company_id: string
          content_pillars?: Json | null
          hashtag_bank?: string[]
          id?: string
          product_type?: string
          products?: Json | null
          source_urls?: string[] | null
          sourcing?: Json
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          audience?: string | null
          banned_phrases?: string[]
          buying_path?: string | null
          company_id?: string
          content_pillars?: Json | null
          hashtag_bank?: string[]
          id?: string
          product_type?: string
          products?: Json | null
          source_urls?: string[] | null
          sourcing?: Json
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_review_events: {
        Row: {
          author_id: string | null
          brief_id: string
          check_id: string | null
          company_id: string
          created_at: string
          diff: Json | null
          event: string
          id: string
          tier: number | null
        }
        Insert: {
          author_id?: string | null
          brief_id: string
          check_id?: string | null
          company_id: string
          created_at?: string
          diff?: Json | null
          event: string
          id?: string
          tier?: number | null
        }
        Update: {
          author_id?: string | null
          brief_id?: string
          check_id?: string | null
          company_id?: string
          created_at?: string
          diff?: Json | null
          event?: string
          id?: string
          tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brief_review_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_review_events_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_review_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_segments: {
        Row: {
          brief_id: string
          company_id: string
          created_at: string
          id: string
          kind: string
          layout: string
          overlay_style: Json
          overlay_text: string | null
          screenshot_url: string | null
          screenshot_width: number | null
          screenshot_x: number | null
          screenshot_y: number | null
          show_on_screen: boolean
          slot_index: number
          talking_point_index: number | null
          text_y: number | null
        }
        Insert: {
          brief_id: string
          company_id: string
          created_at?: string
          id?: string
          kind: string
          layout?: string
          overlay_style?: Json
          overlay_text?: string | null
          screenshot_url?: string | null
          screenshot_width?: number | null
          screenshot_x?: number | null
          screenshot_y?: number | null
          show_on_screen?: boolean
          slot_index: number
          talking_point_index?: number | null
          text_y?: number | null
        }
        Update: {
          brief_id?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          layout?: string
          overlay_style?: Json
          overlay_text?: string | null
          screenshot_url?: string | null
          screenshot_width?: number | null
          screenshot_x?: number | null
          screenshot_y?: number | null
          show_on_screen?: boolean
          slot_index?: number
          talking_point_index?: number | null
          text_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brief_segments_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_segments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_templates: {
        Row: {
          action: string
          company_id: string
          created_at: string
          description: string
          example: string
          feature_id: string | null
          format: string
          id: string
          phrase: string
          sort_order: number
          title: string
          type_label: string
          week_start: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          description: string
          example: string
          feature_id?: string | null
          format: string
          id?: string
          phrase?: string
          sort_order?: number
          title: string
          type_label?: string
          week_start: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          description?: string
          example?: string
          feature_id?: string | null
          format?: string
          id?: string
          phrase?: string
          sort_order?: number
          title?: string
          type_label?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_templates_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "brain_features"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_validations: {
        Row: {
          attempt: number
          brief_id: string | null
          company_id: string
          created_at: string
          failures: Json
          generation_id: string
          id: string
          passed: boolean
          warnings: Json
        }
        Insert: {
          attempt?: number
          brief_id?: string | null
          company_id: string
          created_at?: string
          failures?: Json
          generation_id: string
          id?: string
          passed: boolean
          warnings?: Json
        }
        Update: {
          attempt?: number
          brief_id?: string | null
          company_id?: string
          created_at?: string
          failures?: Json
          generation_id?: string
          id?: string
          passed?: boolean
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brief_validations_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_validations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs: {
        Row: {
          archived_at: string | null
          caption: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          cta: string | null
          example_transcript: string | null
          example_url: string | null
          format: string
          generation_id: string | null
          hashtags: string[]
          hook: string | null
          hook_options: Json
          id: string
          kill_reason: string | null
          point_count: number | null
          post_type_id: string | null
          review_result: Json | null
          reviewed_at: string | null
          script: string | null
          search_phrase: string | null
          talking_points: Json
          target_words: number
          text_overlay: Json
          title: string
          why_it_works: string | null
        }
        Insert: {
          archived_at?: string | null
          caption?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          cta?: string | null
          example_transcript?: string | null
          example_url?: string | null
          format?: string
          generation_id?: string | null
          hashtags?: string[]
          hook?: string | null
          hook_options?: Json
          id?: string
          kill_reason?: string | null
          point_count?: number | null
          post_type_id?: string | null
          review_result?: Json | null
          reviewed_at?: string | null
          script?: string | null
          search_phrase?: string | null
          talking_points?: Json
          target_words?: number
          text_overlay?: Json
          title: string
          why_it_works?: string | null
        }
        Update: {
          archived_at?: string | null
          caption?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          cta?: string | null
          example_transcript?: string | null
          example_url?: string | null
          format?: string
          generation_id?: string | null
          hashtags?: string[]
          hook?: string | null
          hook_options?: Json
          id?: string
          kill_reason?: string | null
          point_count?: number | null
          post_type_id?: string | null
          review_result?: Json | null
          reviewed_at?: string | null
          script?: string | null
          search_phrase?: string | null
          talking_points?: Json
          target_words?: number
          text_overlay?: Json
          title?: string
          why_it_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefs_post_type_id_fkey"
            columns: ["post_type_id"]
            isOneToOne: false
            referencedRelation: "post_types"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          company_id: string
          created_at: string | null
          ends_on: string
          id: string
          name: string
          notes: string | null
          starts_on: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          ends_on: string
          id?: string
          name: string
          notes?: string | null
          starts_on: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          ends_on?: string
          id?: string
          name?: string
          notes?: string | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_briefs: {
        Row: {
          brief_id: string
          campaign_id: string
          company_id: string
          created_at: string | null
          pinned_day: number | null
          position: number | null
        }
        Insert: {
          brief_id: string
          campaign_id: string
          company_id: string
          created_at?: string | null
          pinned_day?: number | null
          position?: number | null
        }
        Update: {
          brief_id?: string
          campaign_id?: string
          company_id?: string
          created_at?: string | null
          pinned_day?: number | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_briefs_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_briefs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_briefs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          company_id: string
          created_at: string | null
          drop_date: string | null
          ends_on: string | null
          goal: string | null
          id: string
          name: string
          notified_at: string | null
          notify_at: string | null
          published_at: string | null
          slideshow_target: number
          starts_on: string | null
          status: string
          type_split: Json
          video_target: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          drop_date?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          name: string
          notified_at?: string | null
          notify_at?: string | null
          published_at?: string | null
          slideshow_target?: number
          starts_on?: string | null
          status?: string
          type_split?: Json
          video_target?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          drop_date?: string | null
          ends_on?: string | null
          goal?: string | null
          id?: string
          name?: string
          notified_at?: string | null
          notify_at?: string | null
          published_at?: string | null
          slideshow_target?: number
          starts_on?: string | null
          status?: string
          type_split?: Json
          video_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          audience_segment: string | null
          calendar_event_id: string | null
          claim: string
          company_id: string
          confidence: number | null
          contradicts: string | null
          created_at: string | null
          id: string
          last_used_at: string | null
          proof: string | null
          saturation_score: number | null
          source: string
          status: string
        }
        Insert: {
          audience_segment?: string | null
          calendar_event_id?: string | null
          claim: string
          company_id: string
          confidence?: number | null
          contradicts?: string | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          proof?: string | null
          saturation_score?: number | null
          source: string
          status: string
        }
        Update: {
          audience_segment?: string | null
          calendar_event_id?: string | null
          claim?: string
          company_id?: string
          confidence?: number | null
          contradicts?: string | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          proof?: string | null
          saturation_score?: number | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          admin_role: string | null
          created_at: string | null
          creator_count: number
          does_ugc: boolean
          id: string
          manager_count: number
          name: string
          payouts_enabled: boolean
          self_is_manager: boolean
          settings: Json | null
          slug: string
          website: string | null
        }
        Insert: {
          admin_role?: string | null
          created_at?: string | null
          creator_count?: number
          does_ugc?: boolean
          id?: string
          manager_count?: number
          name: string
          payouts_enabled?: boolean
          self_is_manager?: boolean
          settings?: Json | null
          slug: string
          website?: string | null
        }
        Update: {
          admin_role?: string | null
          created_at?: string | null
          creator_count?: number
          does_ugc?: boolean
          id?: string
          manager_count?: number
          name?: string
          payouts_enabled?: boolean
          self_is_manager?: boolean
          settings?: Json | null
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      company_billing: {
        Row: {
          auto_top_up: boolean
          bank_last4: string | null
          bank_name: string | null
          billing_simulated: boolean
          card_brand: string | null
          card_last4: string | null
          company_id: string
          credit_balance_cents: number
          monthly_budget_cents: number
          payouts_enabled: boolean
          stripe_account_id: string | null
          stripe_budget_subscription_id: string | null
          stripe_connected: boolean
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_subscription_id: string | null
          subscription_plan: string | null
          subscription_price_cents: number | null
          subscription_renews_at: string | null
          subscription_status: string
          updated_at: string
          weekly_budget_cents: number
        }
        Insert: {
          auto_top_up?: boolean
          bank_last4?: string | null
          bank_name?: string | null
          billing_simulated?: boolean
          card_brand?: string | null
          card_last4?: string | null
          company_id: string
          credit_balance_cents?: number
          monthly_budget_cents?: number
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          stripe_budget_subscription_id?: string | null
          stripe_connected?: boolean
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan?: string | null
          subscription_price_cents?: number | null
          subscription_renews_at?: string | null
          subscription_status?: string
          updated_at?: string
          weekly_budget_cents?: number
        }
        Update: {
          auto_top_up?: boolean
          bank_last4?: string | null
          bank_name?: string | null
          billing_simulated?: boolean
          card_brand?: string | null
          card_last4?: string | null
          company_id?: string
          credit_balance_cents?: number
          monthly_budget_cents?: number
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          stripe_budget_subscription_id?: string | null
          stripe_connected?: boolean
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan?: string | null
          subscription_price_cents?: number | null
          subscription_renews_at?: string | null
          subscription_status?: string
          updated_at?: string
          weekly_budget_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_credit_ledger: {
        Row: {
          amount_cents: number
          assignment_id: string | null
          company_id: string
          created_at: string
          creator_id: string | null
          fee_cents: number | null
          gross_cents: number | null
          id: string
          kind: string
          note: string | null
          stripe_checkout_session_id: string | null
          stripe_invoice_id: string | null
        }
        Insert: {
          amount_cents: number
          assignment_id?: string | null
          company_id: string
          created_at?: string
          creator_id?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          id?: string
          kind: string
          note?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
        }
        Update: {
          amount_cents?: number
          assignment_id?: string | null
          company_id?: string
          created_at?: string
          creator_id?: string | null
          fee_cents?: number | null
          gross_cents?: number | null
          id?: string
          kind?: string
          note?: string | null
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_credit_ledger_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_credit_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_credit_ledger_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          invited_name: string | null
          permissions: Json
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_name?: string | null
          permissions?: Json
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          invited_name?: string | null
          permissions?: Json
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          permissions: Json
          profile_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          permissions?: Json
          profile_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          permissions?: Json
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_payout_runs: {
        Row: {
          charged_cents: number
          company_id: string
          created_at: string
          creators_paid: number
          error: string | null
          id: string
          period_end: string
          period_start: string
          status: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          charged_cents?: number
          company_id: string
          created_at?: string
          creators_paid?: number
          error?: string | null
          id?: string
          period_end: string
          period_start: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          charged_cents?: number
          company_id?: string
          created_at?: string
          creators_paid?: number
          error?: string | null
          id?: string
          period_end?: string
          period_start?: string
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_payout_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tasks: {
        Row: {
          assigned_to: string | null
          audio_direction: string | null
          brief: string | null
          campaign_id: string | null
          caption: string | null
          claim_id: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          cta_keyword: string | null
          due_date: string | null
          estimated_seconds: number | null
          feedback: number | null
          feedback_reason: string | null
          filter_flags: string[]
          format: string
          format_id: string | null
          generation_meta: Json | null
          hashtags: string[] | null
          hook: string | null
          hook_variants: Json | null
          id: string
          image_direction: Json | null
          inspiration_trend_id: string | null
          kill_reason: string | null
          original_draft: Json | null
          pinned_comment: string | null
          planning_status: string
          platforms: string[] | null
          plug: boolean
          reject_reason: string | null
          scheduled_for: string | null
          script: string | null
          search_phrase: string | null
          shot_list: Json | null
          slides: Json | null
          slot_fills: Json | null
          slot_index: number
          status: string | null
          target_length_sec: number | null
          title: string
          weekly_batch_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          audio_direction?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          claim_id?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          cta_keyword?: string | null
          due_date?: string | null
          estimated_seconds?: number | null
          feedback?: number | null
          feedback_reason?: string | null
          filter_flags?: string[]
          format?: string
          format_id?: string | null
          generation_meta?: Json | null
          hashtags?: string[] | null
          hook?: string | null
          hook_variants?: Json | null
          id?: string
          image_direction?: Json | null
          inspiration_trend_id?: string | null
          kill_reason?: string | null
          original_draft?: Json | null
          pinned_comment?: string | null
          planning_status: string
          platforms?: string[] | null
          plug?: boolean
          reject_reason?: string | null
          scheduled_for?: string | null
          script?: string | null
          search_phrase?: string | null
          shot_list?: Json | null
          slides?: Json | null
          slot_fills?: Json | null
          slot_index?: number
          status?: string | null
          target_length_sec?: number | null
          title: string
          weekly_batch_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          audio_direction?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          claim_id?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          cta_keyword?: string | null
          due_date?: string | null
          estimated_seconds?: number | null
          feedback?: number | null
          feedback_reason?: string | null
          filter_flags?: string[]
          format?: string
          format_id?: string | null
          generation_meta?: Json | null
          hashtags?: string[] | null
          hook?: string | null
          hook_variants?: Json | null
          id?: string
          image_direction?: Json | null
          inspiration_trend_id?: string | null
          kill_reason?: string | null
          original_draft?: Json | null
          pinned_comment?: string | null
          planning_status?: string
          platforms?: string[] | null
          plug?: boolean
          reject_reason?: string | null
          scheduled_for?: string | null
          script?: string | null
          search_phrase?: string | null
          shot_list?: Json | null
          slides?: Json | null
          slot_fills?: Json | null
          slot_index?: number
          status?: string | null
          target_length_sec?: number | null
          title?: string
          weekly_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_inspiration_trend_id_fkey"
            columns: ["inspiration_trend_id"]
            isOneToOne: false
            referencedRelation: "trend_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tasks_weekly_batch_id_fkey"
            columns: ["weekly_batch_id"]
            isOneToOne: false
            referencedRelation: "weekly_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          beats: Json | null
          company_id: string
          created_at: string | null
          cta: string | null
          format: string
          hook_line: string | null
          hook_visual: string | null
          id: string
          niche_tags: string[] | null
          pattern_type: string
          source_trend_id: string | null
        }
        Insert: {
          beats?: Json | null
          company_id: string
          created_at?: string | null
          cta?: string | null
          format?: string
          hook_line?: string | null
          hook_visual?: string | null
          id?: string
          niche_tags?: string[] | null
          pattern_type: string
          source_trend_id?: string | null
        }
        Update: {
          beats?: Json | null
          company_id?: string
          created_at?: string | null
          cta?: string | null
          format?: string
          hook_line?: string | null
          hook_visual?: string | null
          id?: string
          niche_tags?: string[] | null
          pattern_type?: string
          source_trend_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_templates_source_trend_id_fkey"
            columns: ["source_trend_id"]
            isOneToOne: false
            referencedRelation: "trend_items"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_daily: {
        Row: {
          company_id: string
          creator_id: string | null
          day: string
          free_trials: number
          id: string
          new_accounts: number
          sales_cents: number
          sales_count: number
          synced_at: string
        }
        Insert: {
          company_id: string
          creator_id?: string | null
          day: string
          free_trials?: number
          id?: string
          new_accounts?: number
          sales_cents?: number
          sales_count?: number
          synced_at?: string
        }
        Update: {
          company_id?: string
          creator_id?: string | null
          day?: string
          free_trials?: number
          id?: string
          new_accounts?: number
          sales_cents?: number
          sales_count?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_daily_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_accounts: {
        Row: {
          company_id: string
          created_at: string
          creator_id: string
          decided_at: string | null
          decided_by: string | null
          decision: Json | null
          id: string
          instagram_handle: string | null
          instagram_recording_path: string | null
          instagram_screenshot_path: string | null
          reason: string | null
          status: string
          tiktok_handle: string | null
          tiktok_recording_path: string | null
          tiktok_screenshot_path: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          creator_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Json | null
          id?: string
          instagram_handle?: string | null
          instagram_recording_path?: string | null
          instagram_screenshot_path?: string | null
          reason?: string | null
          status?: string
          tiktok_handle?: string | null
          tiktok_recording_path?: string | null
          tiktok_screenshot_path?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          creator_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Json | null
          id?: string
          instagram_handle?: string | null
          instagram_recording_path?: string | null
          instagram_screenshot_path?: string | null
          reason?: string | null
          status?: string
          tiktok_handle?: string | null
          tiktok_recording_path?: string | null
          tiktok_screenshot_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_accounts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_accounts_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_reminders: {
        Row: {
          company_id: string
          created_at: string
          creator_id: string
          id: string
          kind: string
          sent_on: string
        }
        Insert: {
          company_id: string
          created_at?: string
          creator_id: string
          id?: string
          kind: string
          sent_on: string
        }
        Update: {
          company_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          kind?: string
          sent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_reminders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_reminders_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_streaks: {
        Row: {
          company_id: string
          creator_id: string
          current_streak: number
          grace_used_on: string | null
          id: string
          last_counted_date: string | null
          longest_streak: number
        }
        Insert: {
          company_id: string
          creator_id: string
          current_streak?: number
          grace_used_on?: string | null
          id?: string
          last_counted_date?: string | null
          longest_streak?: number
        }
        Update: {
          company_id?: string
          creator_id?: string
          current_streak?: number
          grace_used_on?: string | null
          id?: string
          last_counted_date?: string | null
          longest_streak?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_streaks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_streaks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_wallets: {
        Row: {
          available_cents: number
          company_id: string
          creator_id: string
          id: string
          pending_cents: number
          stripe_connect_account_id: string | null
        }
        Insert: {
          available_cents?: number
          company_id: string
          creator_id: string
          id?: string
          pending_cents?: number
          stripe_connect_account_id?: string | null
        }
        Update: {
          available_cents?: number
          company_id?: string
          creator_id?: string
          id?: string
          pending_cents?: number
          stripe_connect_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_wallets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_wallets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_screenshots: {
        Row: {
          company_id: string
          created_at: string
          feature_id: string
          id: string
          path: string
          shape: string
          sort_order: number
          source: string
        }
        Insert: {
          company_id: string
          created_at?: string
          feature_id: string
          id?: string
          path: string
          shape?: string
          sort_order?: number
          source?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          feature_id?: string
          id?: string
          path?: string
          shape?: string
          sort_order?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_screenshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_screenshots_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "brain_features"
            referencedColumns: ["id"]
          },
        ]
      }
      format_examples: {
        Row: {
          company_id: string
          created_at: string | null
          example: string
          format_id: string
          id: string
          slot_key: string
          source: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          example: string
          format_id: string
          id?: string
          slot_key: string
          source: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          example?: string
          format_id?: string
          id?: string
          slot_key?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "format_examples_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_examples_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
        ]
      }
      format_stats: {
        Row: {
          baseline_primary_signal: number | null
          benched_at: string | null
          company_id: string
          format_id: string
          reps: number
          retry_after: string | null
          status: string
          updated_at: string | null
          weight: number
        }
        Insert: {
          baseline_primary_signal?: number | null
          benched_at?: string | null
          company_id: string
          format_id: string
          reps?: number
          retry_after?: string | null
          status?: string
          updated_at?: string | null
          weight?: number
        }
        Update: {
          baseline_primary_signal?: number | null
          benched_at?: string | null
          company_id?: string
          format_id?: string
          reps?: number
          retry_after?: string | null
          status?: string
          updated_at?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "format_stats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_stats_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
        ]
      }
      formats: {
        Row: {
          beat_timing: string | null
          bible_version: string
          cta_keyword_policy: string
          family: string
          id: string
          kill_rules: string[]
          name: string
          primary_signal: string
          requires: string[]
          slide_count_max: number | null
          slide_count_min: number | null
          slot_schema: Json
          target_length_max_sec: number | null
          target_length_min_sec: number | null
          when_to_use: string
          why_it_works: string
        }
        Insert: {
          beat_timing?: string | null
          bible_version: string
          cta_keyword_policy: string
          family: string
          id: string
          kill_rules?: string[]
          name: string
          primary_signal: string
          requires?: string[]
          slide_count_max?: number | null
          slide_count_min?: number | null
          slot_schema: Json
          target_length_max_sec?: number | null
          target_length_min_sec?: number | null
          when_to_use: string
          why_it_works: string
        }
        Update: {
          beat_timing?: string | null
          bible_version?: string
          cta_keyword_policy?: string
          family?: string
          id?: string
          kill_rules?: string[]
          name?: string
          primary_signal?: string
          requires?: string[]
          slide_count_max?: number | null
          slide_count_min?: number | null
          slot_schema?: Json
          target_length_max_sec?: number | null
          target_length_min_sec?: number | null
          when_to_use?: string
          why_it_works?: string
        }
        Relationships: []
      }
      hook_bank: {
        Row: {
          company_id: string
          created_at: string | null
          format: string
          format_id: string | null
          hook: string
          id: string
          niche_tags: string[] | null
          pattern: string | null
          source: string
          source_task_id: string | null
          source_trend_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          format?: string
          format_id?: string | null
          hook: string
          id?: string
          niche_tags?: string[] | null
          pattern?: string | null
          source?: string
          source_task_id?: string | null
          source_trend_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          format?: string
          format_id?: string | null
          hook?: string
          id?: string
          niche_tags?: string[] | null
          pattern?: string | null
          source?: string
          source_task_id?: string | null
          source_trend_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hook_bank_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_bank_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_bank_source_task_id_fkey"
            columns: ["source_task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_bank_source_trend_id_fkey"
            columns: ["source_trend_id"]
            isOneToOne: false
            referencedRelation: "trend_items"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          creator_id: string | null
          id: string
          last_used_at: string | null
          post_id: string | null
          post_type_id: string | null
          source: string
          text: string | null
          thumbnail_url: string | null
          url: string | null
          used_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          id?: string
          last_used_at?: string | null
          post_id?: string | null
          post_type_id?: string | null
          source: string
          text?: string | null
          thumbnail_url?: string | null
          url?: string | null
          used_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          creator_id?: string | null
          id?: string
          last_used_at?: string | null
          post_id?: string | null
          post_type_id?: string | null
          source?: string
          text?: string | null
          thumbnail_url?: string | null
          url?: string | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_post_type_id_fkey"
            columns: ["post_type_id"]
            isOneToOne: false
            referencedRelation: "post_types"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_chat_reads: {
        Row: {
          chat_id: string
          last_read_at: string
          profile_id: string
        }
        Insert: {
          chat_id: string
          last_read_at?: string
          profile_id: string
        }
        Update: {
          chat_id?: string
          last_read_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_chat_reads_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "manager_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_chat_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_chats: {
        Row: {
          campaign_id: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          user_a: string | null
          user_b: string | null
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind: string
          user_a?: string | null
          user_b?: string | null
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          user_a?: string | null
          user_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_chats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_chats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_chats_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_chats_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "manager_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_messages: {
        Row: {
          assignment_id: string | null
          author_id: string
          body: string
          brief_id: string | null
          chat_id: string
          company_id: string
          created_at: string
          forward_label: string | null
          id: string
          media_kind: string | null
          media_path: string | null
          reply_to_id: string | null
          voice_duration_ms: number | null
        }
        Insert: {
          assignment_id?: string | null
          author_id: string
          body?: string
          brief_id?: string | null
          chat_id: string
          company_id: string
          created_at?: string
          forward_label?: string | null
          id?: string
          media_kind?: string | null
          media_path?: string | null
          reply_to_id?: string | null
          voice_duration_ms?: number | null
        }
        Update: {
          assignment_id?: string | null
          author_id?: string
          body?: string
          brief_id?: string | null
          chat_id?: string
          company_id?: string
          created_at?: string
          forward_label?: string | null
          id?: string
          media_kind?: string | null
          media_path?: string | null
          reply_to_id?: string | null
          voice_duration_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_messages_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_messages_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "manager_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "manager_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          assignment_id: string | null
          author_id: string
          body: string
          brief_id: string | null
          company_id: string
          created_at: string
          creator_id: string
          id: string
        }
        Insert: {
          assignment_id?: string | null
          author_id: string
          body: string
          brief_id?: string | null
          company_id: string
          created_at?: string
          creator_id: string
          id?: string
        }
        Update: {
          assignment_id?: string | null
          author_id?: string
          body?: string
          brief_id?: string | null
          company_id?: string
          created_at?: string
          creator_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_cache: {
        Row: {
          company_id: string
          created_at: string | null
          image_hash: string
          slide_text: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          image_hash: string
          slide_text: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          image_hash?: string
          slide_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          company_id: string
          completed_at: string | null
          created_at: string | null
          creator_id: string
          id: string
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          creator_id: string
          id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          creator_id?: string
          id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          comments: number | null
          completion_rate: number | null
          fetched_at: string | null
          id: string
          keyword_comment_count: number | null
          likes: number | null
          link_clicks: number | null
          post_id: string
          profile_clicks: number | null
          saves: number | null
          shares: number | null
          views: number | null
        }
        Insert: {
          comments?: number | null
          completion_rate?: number | null
          fetched_at?: string | null
          id?: string
          keyword_comment_count?: number | null
          likes?: number | null
          link_clicks?: number | null
          post_id: string
          profile_clicks?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
        }
        Update: {
          comments?: number | null
          completion_rate?: number | null
          fetched_at?: string | null
          id?: string
          keyword_comment_count?: number | null
          likes?: number | null
          link_clicks?: number | null
          post_id?: string
          profile_clicks?: number | null
          saves?: number | null
          shares?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_types: {
        Row: {
          clip_structure: string
          company_id: string
          created_at: string
          default_week_count: number
          family: string
          id: string
          key: string
          label: string
          max_points: number
          min_points: number
          requires_credential: boolean
          requires_plug: boolean
          sort_order: number
          target_words_max: number | null
          target_words_min: number | null
        }
        Insert: {
          clip_structure: string
          company_id: string
          created_at?: string
          default_week_count?: number
          family: string
          id?: string
          key: string
          label: string
          max_points: number
          min_points: number
          requires_credential?: boolean
          requires_plug?: boolean
          sort_order?: number
          target_words_max?: number | null
          target_words_min?: number | null
        }
        Update: {
          clip_structure?: string
          company_id?: string
          created_at?: string
          default_week_count?: number
          family?: string
          id?: string
          key?: string
          label?: string
          max_points?: number
          min_points?: number
          requires_credential?: boolean
          requires_plug?: boolean
          sort_order?: number
          target_words_max?: number | null
          target_words_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          assignment_id: string | null
          id: string
          milestones_fired: number[]
          platform: string | null
          post_url: string | null
          posted_at: string | null
          provider_post_id: string | null
          status: string | null
          submission_id: string
          task_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          id?: string
          milestones_fired?: number[]
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          provider_post_id?: string | null
          status?: string | null
          submission_id: string
          task_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          id?: string
          milestones_fired?: number[]
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          provider_post_id?: string | null
          status?: string | null
          submission_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          approved: boolean
          claim: string
          company_id: string
          created_at: string
          id: string
          name: string
          rejected: boolean
          source: string
          source_ref: string | null
          surface: string | null
          what_it_does: string
        }
        Insert: {
          approved?: boolean
          claim: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          rejected?: boolean
          source: string
          source_ref?: string | null
          surface?: string | null
          what_it_does: string
        }
        Update: {
          approved?: boolean
          claim?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          rejected?: boolean
          source?: string
          source_ref?: string | null
          surface?: string | null
          what_it_does?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          available: boolean
          avatar_path: string | null
          baseline_primary_signal: number | null
          baseline_updated_at: string | null
          bio_facts: Json
          birthday: string | null
          can_create: boolean
          can_film_with_second_person: boolean
          company_id: string | null
          created_at: string | null
          credential_line: string | null
          expo_push_token: string | null
          full_name: string | null
          has_credential: boolean
          has_scar_tissue: boolean
          has_transformation: boolean
          id: string
          lives_the_identity: boolean
          on_camera_comfortable: boolean
          onboarded: boolean | null
          onboarding_answers: Json
          phone: string | null
          role: string
          script_mode: string
          upload_post_profile: string | null
        }
        Insert: {
          available?: boolean
          avatar_path?: string | null
          baseline_primary_signal?: number | null
          baseline_updated_at?: string | null
          bio_facts?: Json
          birthday?: string | null
          can_create?: boolean
          can_film_with_second_person?: boolean
          company_id?: string | null
          created_at?: string | null
          credential_line?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          has_credential?: boolean
          has_scar_tissue?: boolean
          has_transformation?: boolean
          id: string
          lives_the_identity?: boolean
          on_camera_comfortable?: boolean
          onboarded?: boolean | null
          onboarding_answers?: Json
          phone?: string | null
          role: string
          script_mode?: string
          upload_post_profile?: string | null
        }
        Update: {
          available?: boolean
          avatar_path?: string | null
          baseline_primary_signal?: number | null
          baseline_updated_at?: string | null
          bio_facts?: Json
          birthday?: string | null
          can_create?: boolean
          can_film_with_second_person?: boolean
          company_id?: string | null
          created_at?: string | null
          credential_line?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          has_credential?: boolean
          has_scar_tissue?: boolean
          has_transformation?: boolean
          id?: string
          lives_the_identity?: boolean
          on_camera_comfortable?: boolean
          onboarded?: boolean | null
          onboarding_answers?: Json
          phone?: string | null
          role?: string
          script_mode?: string
          upload_post_profile?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recording_drafts: {
        Row: {
          assignment_id: string
          company_id: string
          creator_id: string
          id: string
          segments: Json
          updated_at: string
        }
        Insert: {
          assignment_id: string
          company_id: string
          creator_id: string
          id?: string
          segments?: Json
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          company_id?: string
          creator_id?: string
          id?: string
          segments?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recording_drafts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recording_drafts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_daily: {
        Row: {
          company_id: string
          date: string
          id: string
          revenue_cents: number
          signups: number
          source: string
        }
        Insert: {
          company_id: string
          date: string
          id?: string
          revenue_cents?: number
          signups?: number
          source?: string
        }
        Update: {
          company_id?: string
          date?: string
          id?: string
          revenue_cents?: number
          signups?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_events: {
        Row: {
          amount_cents: number | null
          attribution_link_id: string | null
          company_id: string
          id: string
          occurred_at: string | null
          stripe_event_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          attribution_link_id?: string | null
          company_id: string
          id?: string
          occurred_at?: string | null
          stripe_event_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          attribution_link_id?: string | null
          company_id?: string
          id?: string
          occurred_at?: string | null
          stripe_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_events_attribution_link_id_fkey"
            columns: ["attribution_link_id"]
            isOneToOne: false
            referencedRelation: "attribution_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      review_events: {
        Row: {
          action: string | null
          author_id: string
          created_at: string | null
          id: string
          note: string | null
          segment_id: string | null
          submission_id: string
        }
        Insert: {
          action?: string | null
          author_id: string
          created_at?: string | null
          id?: string
          note?: string | null
          segment_id?: string | null
          submission_id: string
        }
        Update: {
          action?: string | null
          author_id?: string
          created_at?: string | null
          id?: string
          note?: string | null
          segment_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "submission_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_used_at: string | null
          query: string
          season_end: number | null
          season_start: number | null
          source: string
          used_count: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          query: string
          season_end?: number | null
          season_start?: number | null
          source: string
          used_count?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          query?: string
          season_end?: number | null
          season_start?: number | null
          source?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "search_queries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      source_accounts: {
        Row: {
          company_id: string
          corpus: string
          created_at: string | null
          handle: string
          id: string
          keeper_count: number
          keeper_rate: number | null
          kind: string
          last_scraped_at: string | null
          muted: boolean
          platform: string
          scraped_count: number
          status: string
        }
        Insert: {
          company_id: string
          corpus?: string
          created_at?: string | null
          handle: string
          id?: string
          keeper_count?: number
          keeper_rate?: number | null
          kind?: string
          last_scraped_at?: string | null
          muted?: boolean
          platform: string
          scraped_count?: number
          status?: string
        }
        Update: {
          company_id?: string
          corpus?: string
          created_at?: string | null
          handle?: string
          id?: string
          keeper_count?: number
          keeper_rate?: number | null
          kind?: string
          last_scraped_at?: string | null
          muted?: boolean
          platform?: string
          scraped_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_segments: {
        Row: {
          attempt: number
          brief_segment_id: string | null
          company_id: string
          created_at: string
          duration_ms: number | null
          id: string
          slot_index: number
          status: string
          storage_path: string
          submission_id: string
        }
        Insert: {
          attempt?: number
          brief_segment_id?: string | null
          company_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          slot_index: number
          status?: string
          storage_path: string
          submission_id: string
        }
        Update: {
          attempt?: number
          brief_segment_id?: string | null
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          slot_index?: number
          status?: string
          storage_path?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_segments_brief_segment_id_fkey"
            columns: ["brief_segment_id"]
            isOneToOne: false
            referencedRelation: "brief_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_segments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_segments_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string | null
          created_at: string | null
          creator_id: string
          duration_seconds: number | null
          id: string
          render_error: string | null
          render_status: string
          render_timeline: Json | null
          segment_paths: string[] | null
          task_id: string | null
          version: number | null
          video_path: string
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string | null
          creator_id: string
          duration_seconds?: number | null
          id?: string
          render_error?: string | null
          render_status?: string
          render_timeline?: Json | null
          segment_paths?: string[] | null
          task_id?: string | null
          version?: number | null
          video_path: string
        }
        Update: {
          assignment_id?: string | null
          created_at?: string | null
          creator_id?: string
          duration_seconds?: number | null
          id?: string
          render_error?: string | null
          render_status?: string
          render_timeline?: Json | null
          segment_paths?: string[] | null
          task_id?: string | null
          version?: number | null
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          author_role: string
          body: string
          company_id: string
          created_at: string | null
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          author_role: string
          body: string
          company_id: string
          created_at?: string | null
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          author_role?: string
          body?: string
          company_id?: string
          created_at?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "content_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_items: {
        Row: {
          author_handle: string | null
          caption: string | null
          classify_confidence: number | null
          classify_reason: string | null
          comments: number | null
          company_id: string
          content_fingerprint: string | null
          cover_url: string | null
          cta_keyword_count: number | null
          format: string
          format_id: string | null
          hook: string | null
          id: string
          image_urls: Json | null
          is_golden: boolean
          label: string | null
          label_reason: string | null
          labeled_by: string | null
          likes: number | null
          low_signal: boolean
          platform: string | null
          relevance_reason: string | null
          relevance_score: number | null
          remake_mode: string | null
          remake_mode_overridden: boolean
          remake_reason: string | null
          scraped_at: string | null
          shares: number | null
          slide_texts: Json | null
          slot_fills: Json | null
          source_kind: string | null
          source_url: string | null
          topic: string | null
          transcript: string | null
          views: number | null
          why_it_works: string | null
        }
        Insert: {
          author_handle?: string | null
          caption?: string | null
          classify_confidence?: number | null
          classify_reason?: string | null
          comments?: number | null
          company_id: string
          content_fingerprint?: string | null
          cover_url?: string | null
          cta_keyword_count?: number | null
          format?: string
          format_id?: string | null
          hook?: string | null
          id?: string
          image_urls?: Json | null
          is_golden?: boolean
          label?: string | null
          label_reason?: string | null
          labeled_by?: string | null
          likes?: number | null
          low_signal?: boolean
          platform?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          remake_mode?: string | null
          remake_mode_overridden?: boolean
          remake_reason?: string | null
          scraped_at?: string | null
          shares?: number | null
          slide_texts?: Json | null
          slot_fills?: Json | null
          source_kind?: string | null
          source_url?: string | null
          topic?: string | null
          transcript?: string | null
          views?: number | null
          why_it_works?: string | null
        }
        Update: {
          author_handle?: string | null
          caption?: string | null
          classify_confidence?: number | null
          classify_reason?: string | null
          comments?: number | null
          company_id?: string
          content_fingerprint?: string | null
          cover_url?: string | null
          cta_keyword_count?: number | null
          format?: string
          format_id?: string | null
          hook?: string | null
          id?: string
          image_urls?: Json | null
          is_golden?: boolean
          label?: string | null
          label_reason?: string | null
          labeled_by?: string | null
          likes?: number | null
          low_signal?: boolean
          platform?: string | null
          relevance_reason?: string | null
          relevance_score?: number | null
          remake_mode?: string | null
          remake_mode_overridden?: boolean
          remake_reason?: string | null
          scraped_at?: string | null
          shares?: number | null
          slide_texts?: Json | null
          slot_fills?: Json | null
          source_kind?: string | null
          source_url?: string | null
          topic?: string | null
          transcript?: string | null
          views?: number | null
          why_it_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trend_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_items_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_items_labeled_by_fkey"
            columns: ["labeled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          phrase: string
          source: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          phrase: string
          source: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          phrase?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string | null
          creator_id: string
          id: string
          kind: string
          note: string | null
          payout_id: string | null
          post_id: string | null
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string | null
          creator_id: string
          id?: string
          kind: string
          note?: string | null
          payout_id?: string | null
          post_id?: string | null
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string | null
          creator_id?: string
          id?: string
          kind?: string
          note?: string | null
          payout_id?: string | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_batches: {
        Row: {
          company_id: string
          generated_at: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          week_start: string
        }
        Insert: {
          company_id: string
          generated_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          week_start: string
        }
        Update: {
          company_id?: string
          generated_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_batches_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      campaign_notify_at: { Args: { p_drop_date: string }; Returns: string }
      can_create: { Args: never; Returns: boolean }
      claim_pending_invite: {
        Args: never
        Returns: {
          available: boolean
          avatar_path: string | null
          baseline_primary_signal: number | null
          baseline_updated_at: string | null
          bio_facts: Json
          birthday: string | null
          can_create: boolean
          can_film_with_second_person: boolean
          company_id: string | null
          created_at: string | null
          credential_line: string | null
          expo_push_token: string | null
          full_name: string | null
          has_credential: boolean
          has_scar_tissue: boolean
          has_transformation: boolean
          id: string
          lives_the_identity: boolean
          on_camera_comfortable: boolean
          onboarded: boolean | null
          onboarding_answers: Json
          phone: string | null
          role: string
          script_mode: string
          upload_post_profile: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_post_milestone: {
        Args: { p_post_id: string; p_threshold: number }
        Returns: boolean
      }
      current_company_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      default_member_permissions: { Args: never; Returns: Json }
      full_member_permissions: { Args: never; Returns: Json }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_campaign_manager: { Args: never; Returns: boolean }
      is_company_admin: { Args: never; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      label_trend: {
        Args: { p_label?: string; p_reason?: string; p_trend_id: string }
        Returns: undefined
      }
      library_our_posts: {
        Args: {
          p_creator_id?: string
          p_days?: number
          p_limit?: number
          p_offset?: number
          p_post_type_id?: string
          p_search?: string
          p_sort?: string
        }
        Returns: {
          brief_id: string
          comments: number
          creator_id: string
          creator_name: string
          family: string
          hook: string
          likes: number
          metrics_fetched_at: string
          platform: string
          post_id: string
          post_type_id: string
          post_type_key: string
          post_type_label: string
          post_url: string
          posted_at: string
          saves: number
          title: string
          views: number
        }[]
      }
      publish_campaign_assignments: {
        Args: { p_assignments: Json; p_campaign_id: string }
        Returns: number
      }
      record_streak_approval: {
        Args: { p_company: string; p_creator: string; p_day?: string }
        Returns: Json
      }
      reset_broken_streaks: { Args: never; Returns: undefined }
      seed_company_post_types: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      spend_company_credits_for_earning: {
        Args: {
          p_assignment: string
          p_company: string
          p_creator: string
          p_gross_cents: number
          p_kind: string
          p_post_id?: string
        }
        Returns: Json
      }
      streak_bonus_cents: {
        Args: { p_days: number; p_settings: Json }
        Returns: number
      }
      streak_day_complete: {
        Args: { p_company: string; p_creator: string; p_day: string }
        Returns: boolean
      }
      streak_missed_days: {
        Args: {
          p_after: string
          p_before: string
          p_company: string
          p_creator: string
        }
        Returns: number
      }
      sync_brief_segments: {
        Args: { p_brief_id: string; p_company_id: string; p_segments: Json }
        Returns: {
          brief_id: string
          company_id: string
          created_at: string
          id: string
          kind: string
          layout: string
          overlay_style: Json
          overlay_text: string | null
          screenshot_url: string | null
          screenshot_width: number | null
          screenshot_x: number | null
          screenshot_y: number | null
          show_on_screen: boolean
          slot_index: number
          talking_point_index: number | null
          text_y: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "brief_segments"
          isOneToOne: false
          isSetofReturn: true
        }
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
  public: {
    Enums: {},
  },
} as const
