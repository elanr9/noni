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
      attribution_links: {
        Row: {
          code: string
          company_id: string
          creator_id: string | null
          id: string
          task_id: string | null
          url: string | null
        }
        Insert: {
          code: string
          company_id: string
          creator_id?: string | null
          id?: string
          task_id?: string | null
          url?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          creator_id?: string | null
          id?: string
          task_id?: string | null
          url?: string | null
        }
        Relationships: [
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
      brand_profiles: {
        Row: {
          audience: string | null
          buying_path: string | null
          company_id: string
          content_pillars: Json | null
          id: string
          products: Json | null
          source_urls: string[] | null
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          audience?: string | null
          buying_path?: string | null
          company_id: string
          content_pillars?: Json | null
          id?: string
          products?: Json | null
          source_urls?: string[] | null
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          audience?: string | null
          buying_path?: string | null
          company_id?: string
          content_pillars?: Json | null
          id?: string
          products?: Json | null
          source_urls?: string[] | null
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
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json | null
          slug: string
          website: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json | null
          slug: string
          website?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      content_tasks: {
        Row: {
          assigned_to: string | null
          brief: string | null
          caption: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          due_date: string | null
          estimated_seconds: number | null
          format: string
          id: string
          inspiration_trend_id: string | null
          platforms: string[] | null
          script: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          brief?: string | null
          caption?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          estimated_seconds?: number | null
          format?: string
          id?: string
          inspiration_trend_id?: string | null
          platforms?: string[] | null
          script?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          brief?: string | null
          caption?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          estimated_seconds?: number | null
          format?: string
          id?: string
          inspiration_trend_id?: string | null
          platforms?: string[] | null
          script?: string | null
          status?: string
          title?: string
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
            foreignKeyName: "content_tasks_inspiration_trend_id_fkey"
            columns: ["inspiration_trend_id"]
            isOneToOne: false
            referencedRelation: "trend_items"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          comments: number | null
          fetched_at: string | null
          id: string
          likes: number | null
          post_id: string
          shares: number | null
          views: number | null
        }
        Insert: {
          comments?: number | null
          fetched_at?: string | null
          id?: string
          likes?: number | null
          post_id: string
          shares?: number | null
          views?: number | null
        }
        Update: {
          comments?: number | null
          fetched_at?: string | null
          id?: string
          likes?: number | null
          post_id?: string
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
      posts: {
        Row: {
          provider_post_id: string | null
          id: string
          platform: string | null
          post_url: string | null
          posted_at: string | null
          status: string | null
          submission_id: string
          task_id: string
        }
        Insert: {
          provider_post_id?: string | null
          id?: string
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          status?: string | null
          submission_id: string
          task_id: string
        }
        Update: {
          provider_post_id?: string | null
          id?: string
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          status?: string | null
          submission_id?: string
          task_id?: string
        }
        Relationships: [
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
      profiles: {
        Row: {
          avatar_path: string | null
          company_id: string
          created_at: string | null
          expo_push_token: string | null
          full_name: string | null
          id: string
          onboarded: boolean | null
          role: string
          upload_post_profile: string | null
        }
        Insert: {
          avatar_path?: string | null
          company_id: string
          created_at?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          id: string
          onboarded?: boolean | null
          role: string
          upload_post_profile?: string | null
        }
        Update: {
          avatar_path?: string | null
          company_id?: string
          created_at?: string | null
          expo_push_token?: string | null
          full_name?: string | null
          id?: string
          onboarded?: boolean | null
          role?: string
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
          created_at: string | null
          id: string
          note: string | null
          reviewer_id: string
          submission_id: string
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          reviewer_id: string
          submission_id: string
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          reviewer_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_events_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      submissions: {
        Row: {
          created_at: string | null
          creator_id: string
          duration_seconds: number | null
          id: string
          segment_paths: string[] | null
          task_id: string
          version: number | null
          video_path: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          duration_seconds?: number | null
          id?: string
          segment_paths?: string[] | null
          task_id: string
          version?: number | null
          video_path: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          duration_seconds?: number | null
          id?: string
          segment_paths?: string[] | null
          task_id?: string
          version?: number | null
          video_path?: string
        }
        Relationships: [
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
      trend_items: {
        Row: {
          author_handle: string | null
          comments: number | null
          company_id: string
          cover_url: string | null
          hook: string | null
          id: string
          likes: number | null
          platform: string | null
          scraped_at: string | null
          shares: number | null
          source_url: string | null
          transcript: string | null
          views: number | null
          why_it_works: string | null
        }
        Insert: {
          author_handle?: string | null
          comments?: number | null
          company_id: string
          cover_url?: string | null
          hook?: string | null
          id?: string
          likes?: number | null
          platform?: string | null
          scraped_at?: string | null
          shares?: number | null
          source_url?: string | null
          transcript?: string | null
          views?: number | null
          why_it_works?: string | null
        }
        Update: {
          author_handle?: string | null
          comments?: number | null
          company_id?: string
          cover_url?: string | null
          hook?: string | null
          id?: string
          likes?: number | null
          platform?: string | null
          scraped_at?: string | null
          shares?: number | null
          source_url?: string | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_company_id: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
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
