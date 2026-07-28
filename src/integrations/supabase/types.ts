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
      about_sections: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          section_key: string
          sort_order: number
          title: string | null
          updated_at: string
          video_url: string | null
          video_url_2: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          section_key: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          video_url?: string | null
          video_url_2?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          section_key?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
          video_url?: string | null
          video_url_2?: string | null
        }
        Relationships: []
      }
      company_attachments: {
        Row: {
          created_at: string
          description: string | null
          file_url: string
          id: string
          is_active: boolean
          kind: string
          mime_type: string | null
          owner_id: string
          owner_type: string
          size_bytes: number | null
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          is_active?: boolean
          kind: string
          mime_type?: string | null
          owner_id: string
          owner_type: string
          size_bytes?: number | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          is_active?: boolean
          kind?: string
          mime_type?: string | null
          owner_id?: string
          owner_type?: string
          size_bytes?: number | null
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exhibition_companies: {
        Row: {
          address: string | null
          catalog_url: string | null
          category: string | null
          city: string | null
          company_id: string
          created_at: string
          description: string | null
          email: string | null
          export_potential: string | null
          founded_at: string | null
          founders: string | null
          headcount: number | null
          headcount_full_time: number | null
          headcount_part_time: number | null
          intro: string | null
          is_active: boolean
          knowledge_products_intro: string | null
          latitude: number | null
          linkedin_url: string | null
          logo_url: string | null
          longitude: number | null
          map_zoom: number | null
          name: string
          owner_user_id: string | null
          park_id: string | null
          phone: string | null
          rejection_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          status: string
          submitted_at: string | null
          tagline: string | null
          updated_at: string
          video_url: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          catalog_url?: string | null
          category?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          email?: string | null
          export_potential?: string | null
          founded_at?: string | null
          founders?: string | null
          headcount?: number | null
          headcount_full_time?: number | null
          headcount_part_time?: number | null
          intro?: string | null
          is_active?: boolean
          knowledge_products_intro?: string | null
          latitude?: number | null
          linkedin_url?: string | null
          logo_url?: string | null
          longitude?: number | null
          map_zoom?: number | null
          name: string
          owner_user_id?: string | null
          park_id?: string | null
          phone?: string | null
          rejection_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: string
          submitted_at?: string | null
          tagline?: string | null
          updated_at?: string
          video_url?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          catalog_url?: string | null
          category?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          email?: string | null
          export_potential?: string | null
          founded_at?: string | null
          founders?: string | null
          headcount?: number | null
          headcount_full_time?: number | null
          headcount_part_time?: number | null
          intro?: string | null
          is_active?: boolean
          knowledge_products_intro?: string | null
          latitude?: number | null
          linkedin_url?: string | null
          logo_url?: string | null
          longitude?: number | null
          map_zoom?: number | null
          name?: string
          owner_user_id?: string | null
          park_id?: string | null
          phone?: string | null
          rejection_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          status?: string
          submitted_at?: string | null
          tagline?: string | null
          updated_at?: string
          video_url?: string | null
          website?: string | null
        }
        Relationships: []
      }
      exhibition_images: {
        Row: {
          caption: string | null
          company_id: string
          created_at: string
          id: string
          image_url: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          company_id: string
          created_at?: string
          id?: string
          image_url: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          company_id?: string
          created_at?: string
          id?: string
          image_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "exhibition_images_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "exhibition_companies"
            referencedColumns: ["company_id"]
          },
        ]
      }
      exhibition_products: {
        Row: {
          catalog_url: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          link_url: string | null
          name: string
          sort_order: number
          updated_at: string
          video_url: string | null
        }
        Insert: {
          catalog_url?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          name: string
          sort_order?: number
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          catalog_url?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exhibition_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "exhibition_companies"
            referencedColumns: ["company_id"]
          },
        ]
      }
      park_content: {
        Row: {
          description: string | null
          display_name: string | null
          logo_url: string | null
          park_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          display_name?: string | null
          logo_url?: string | null
          park_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          display_name?: string | null
          logo_url?: string | null
          park_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      park_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string
          park_id: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          park_id: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          park_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      park_news: {
        Row: {
          body: string | null
          created_at: string
          id: string
          park_id: string
          published_at: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          park_id: string
          published_at?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          park_id?: string
          published_at?: string
          title?: string
        }
        Relationships: []
      }
      parks: {
        Row: {
          area: number
          city: string | null
          color: string
          companies_hint: number
          created_at: string
          is_active: boolean
          jobs: number
          mx: number
          my: number
          name: string
          park_id: string
          province: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          area?: number
          city?: string | null
          color?: string
          companies_hint?: number
          created_at?: string
          is_active?: boolean
          jobs?: number
          mx?: number
          my?: number
          name: string
          park_id: string
          province?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area?: number
          city?: string | null
          color?: string
          companies_hint?: number
          created_at?: string
          is_active?: boolean
          jobs?: number
          mx?: number
          my?: number
          name?: string
          park_id?: string
          province?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "company_owner"
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
      app_role: ["admin", "user", "company_owner"],
    },
  },
} as const
