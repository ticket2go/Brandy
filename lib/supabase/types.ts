export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          website: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          website?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          website?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          legal_name: string;
          slug: string;
          logo_url: string | null;
          manager_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          legal_name: string;
          slug: string;
          logo_url?: string | null;
          manager_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          legal_name?: string;
          slug?: string;
          logo_url?: string | null;
          manager_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role:
            | "manager"
            | "grafik"
            | "projektmanagement"
            | "marketing"
            | "geschaeftsfuehrung"
            | "mitglied";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?:
            | "manager"
            | "grafik"
            | "projektmanagement"
            | "marketing"
            | "geschaeftsfuehrung"
            | "mitglied";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?:
            | "manager"
            | "grafik"
            | "projektmanagement"
            | "marketing"
            | "geschaeftsfuehrung"
            | "mitglied";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          owner_id: string | null;
          organization_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          legal_name: string | null;
          primary_color: string | null;
          secondary_color: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          organization_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          legal_name?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          organization_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          legal_name?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_color_categories: {
        Row: {
          id: string;
          brand_id: string;
          group: "print" | "digital";
          key: string;
          label: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          group: "print" | "digital";
          key: string;
          label: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          group?: "print" | "digital";
          key?: string;
          label?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_colors: {
        Row: {
          id: string;
          brand_id: string;
          group: "print" | "digital";
          name: string;
          hex: string;
          role: "primary" | "secondary" | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          group: "print" | "digital";
          name: string;
          hex: string;
          role?: "primary" | "secondary" | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          group?: "print" | "digital";
          name?: string;
          hex?: string;
          role?: "primary" | "secondary" | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_color_values: {
        Row: {
          id: string;
          color_id: string;
          category_id: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          color_id: string;
          category_id: string;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          color_id?: string;
          category_id?: string;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_fonts: {
        Row: {
          id: string;
          brand_id: string;
          family: string;
          source: "google" | "custom";
          license_confirmed: boolean;
          google_category: string | null;
          roles: string[];
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          family: string;
          source: "google" | "custom";
          license_confirmed?: boolean;
          google_category?: string | null;
          roles?: string[];
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          family?: string;
          source?: "google" | "custom";
          license_confirmed?: boolean;
          google_category?: string | null;
          roles?: string[];
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_font_files: {
        Row: {
          id: string;
          font_id: string;
          variant: string;
          style_label: string;
          weight: number;
          italic: boolean;
          format: string;
          storage_path: string;
          size_bytes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          font_id: string;
          variant: string;
          style_label: string;
          weight?: number;
          italic?: boolean;
          format: string;
          storage_path: string;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          font_id?: string;
          variant?: string;
          style_label?: string;
          weight?: number;
          italic?: boolean;
          format?: string;
          storage_path?: string;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_logos: {
        Row: {
          id: string;
          brand_id: string;
          file_name: string;
          format: "eps" | "jpg" | "png" | "svg" | "pdf";
          variant: "bildmarke" | "wortmarke" | "wort-bildmarke" | null;
          polarity: "positiv" | "negativ" | null;
          color_space: "cmyk" | "rgb" | null;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          file_name: string;
          format: "eps" | "jpg" | "png" | "svg" | "pdf";
          variant?: "bildmarke" | "wortmarke" | "wort-bildmarke" | null;
          polarity?: "positiv" | "negativ" | null;
          color_space?: "cmyk" | "rgb" | null;
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          file_name?: string;
          format?: "eps" | "jpg" | "png" | "svg" | "pdf";
          variant?: "bildmarke" | "wortmarke" | "wort-bildmarke" | null;
          polarity?: "positiv" | "negativ" | null;
          color_space?: "cmyk" | "rgb" | null;
          storage_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_local_entries: {
        Row: {
          id: string;
          brand_id: string;
          content: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          content: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          content?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          brand_id: string;
          title: string;
          type: "logo" | "image" | "font" | "document" | "other";
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          title: string;
          type: "logo" | "image" | "font" | "document" | "other";
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          title?: string;
          type?: "logo" | "image" | "font" | "document" | "other";
          storage_path?: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      asset_type: "logo" | "image" | "font" | "document" | "other";
    };
  };
}
