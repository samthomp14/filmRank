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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      catalog_sync_log: {
        Row: {
          id: number
          movies_inserted: number
          notes: string | null
          omdb_calls_used: number
          run_at: string
          tmdb_pages_scanned: number
        }
        Insert: {
          id?: number
          movies_inserted: number
          notes?: string | null
          omdb_calls_used: number
          run_at?: string
          tmdb_pages_scanned: number
        }
        Update: {
          id?: number
          movies_inserted?: number
          notes?: string | null
          omdb_calls_used?: number
          run_at?: string
          tmdb_pages_scanned?: number
        }
        Relationships: []
      }
      catalog_sync_state: {
        Row: {
          id: number
          tmdb_page: number
          updated_at: string
        }
        Insert: {
          id?: number
          tmdb_page?: number
          updated_at?: string
        }
        Update: {
          id?: number
          tmdb_page?: number
          updated_at?: string
        }
        Relationships: []
      }
      comparisons: {
        Row: {
          created_at: string
          loser_movie_id: string
          user_id: string
          winner_movie_id: string
        }
        Insert: {
          created_at?: string
          loser_movie_id: string
          user_id: string
          winner_movie_id: string
        }
        Update: {
          created_at?: string
          loser_movie_id?: string
          user_id?: string
          winner_movie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparisons_loser_movie_id_fkey"
            columns: ["loser_movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_loser_movie_id_fkey"
            columns: ["loser_movie_id"]
            isOneToOne: false
            referencedRelation: "movies_not_in_user_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_user_id_loser_movie_id_fkey"
            columns: ["user_id", "loser_movie_id"]
            isOneToOne: false
            referencedRelation: "user_movies"
            referencedColumns: ["user_id", "movie_id"]
          },
          {
            foreignKeyName: "comparisons_user_id_winner_movie_id_fkey"
            columns: ["user_id", "winner_movie_id"]
            isOneToOne: false
            referencedRelation: "user_movies"
            referencedColumns: ["user_id", "movie_id"]
          },
          {
            foreignKeyName: "comparisons_winner_movie_id_fkey"
            columns: ["winner_movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comparisons_winner_movie_id_fkey"
            columns: ["winner_movie_id"]
            isOneToOne: false
            referencedRelation: "movies_not_in_user_library"
            referencedColumns: ["id"]
          },
        ]
      }
      genres: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      movie_genres: {
        Row: {
          genre_id: string
          movie_id: string
        }
        Insert: {
          genre_id: string
          movie_id: string
        }
        Update: {
          genre_id?: string
          movie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movie_genres_genre_id_fkey"
            columns: ["genre_id"]
            isOneToOne: false
            referencedRelation: "genres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movie_genres_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movie_genres_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies_not_in_user_library"
            referencedColumns: ["id"]
          },
        ]
      }
      movie_people: {
        Row: {
          billing_order: number | null
          movie_id: string
          person_id: string
          role: string
        }
        Insert: {
          billing_order?: number | null
          movie_id: string
          person_id: string
          role: string
        }
        Update: {
          billing_order?: number | null
          movie_id?: string
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "movie_people_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movie_people_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies_not_in_user_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movie_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      movies: {
        Row: {
          alt_title: string | null
          country: string | null
          director: string | null
          genre: string | null
          id: string
          imdb_id: string | null
          imdb_rating: number | null
          language: string | null
          metadata: Json | null
          rating: string | null
          runtime: number | null
          title: string
          tmdb_id: number | null
          url: string | null
          year: number | null
        }
        Insert: {
          alt_title?: string | null
          country?: string | null
          director?: string | null
          genre?: string | null
          id?: string
          imdb_id?: string | null
          imdb_rating?: number | null
          language?: string | null
          metadata?: Json | null
          rating?: string | null
          runtime?: number | null
          title: string
          tmdb_id?: number | null
          url?: string | null
          year?: number | null
        }
        Update: {
          alt_title?: string | null
          country?: string | null
          director?: string | null
          genre?: string | null
          id?: string
          imdb_id?: string | null
          imdb_rating?: number | null
          language?: string | null
          metadata?: Json | null
          rating?: string | null
          runtime?: number | null
          title?: string
          tmdb_id?: number | null
          url?: string | null
          year?: number | null
        }
        Relationships: []
      }
      omdb_request_log: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      people: {
        Row: {
          created_at: string
          id: string
          name: string
          tmdb_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tmdb_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tmdb_id?: number | null
        }
        Relationships: []
      }
      user_movies: {
        Row: {
          bt_computed_at: string | null
          bt_score: number | null
          created_at: string | null
          elo_score: number | null
          match_count: number | null
          movie_id: string
          user_id: string
        }
        Insert: {
          bt_computed_at?: string | null
          bt_score?: number | null
          created_at?: string | null
          elo_score?: number | null
          match_count?: number | null
          movie_id: string
          user_id?: string
        }
        Update: {
          bt_computed_at?: string | null
          bt_score?: number | null
          created_at?: string | null
          elo_score?: number | null
          match_count?: number | null
          movie_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_movies_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_movies_movie_id_fkey"
            columns: ["movie_id"]
            isOneToOne: false
            referencedRelation: "movies_not_in_user_library"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_filename: string | null
          id: string
          name: string | null
          onboarding_complete: boolean
          preferences: Json
        }
        Insert: {
          avatar_filename?: string | null
          id: string
          name?: string | null
          onboarding_complete?: boolean
          preferences?: Json
        }
        Update: {
          avatar_filename?: string | null
          id?: string
          name?: string | null
          onboarding_complete?: boolean
          preferences?: Json
        }
        Relationships: []
      }
    }
    Views: {
      movies_not_in_user_library: {
        Row: {
          alt_title: string | null
          country: string | null
          director: string | null
          genre: string | null
          id: string | null
          imdb_id: string | null
          imdb_rating: number | null
          language: string | null
          metadata: Json | null
          rating: string | null
          runtime: number | null
          title: string | null
          url: string | null
          year: number | null
        }
        Insert: {
          alt_title?: string | null
          country?: string | null
          director?: string | null
          genre?: string | null
          id?: string | null
          imdb_id?: string | null
          imdb_rating?: number | null
          language?: string | null
          metadata?: Json | null
          rating?: string | null
          runtime?: number | null
          title?: string | null
          url?: string | null
          year?: number | null
        }
        Update: {
          alt_title?: string | null
          country?: string | null
          director?: string | null
          genre?: string | null
          id?: string | null
          imdb_id?: string | null
          imdb_rating?: number | null
          language?: string | null
          metadata?: Json | null
          rating?: string | null
          runtime?: number | null
          title?: string | null
          url?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      compare_movies: {
        Args: { loser_id: string; p_user_id: string; winner_id: string }
        Returns: undefined
      }
      get_two_random_movies: {
        Args: never
        Returns: {
          elo_score: number
          imdb_id: string
          match_count: number
          movie_id: string
          title: string
          url: string
        }[]
      }
      _recompute_bt_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      apply_bt_rankings_for_opted_in_users: { Args: never; Returns: undefined }
      apply_bt_rankings_now: { Args: never; Returns: undefined }
      log_omdb_request: { Args: never; Returns: undefined }
      recompute_bt_rankings: { Args: never; Returns: undefined }
      search_movies: {
        Args: { limit_count?: number; q: string }
        Returns: {
          id: string
          rank: number
          title: string
          url: string
          year: number
        }[]
      }
      search_people: {
        Args: { limit_count?: number; q: string }
        Returns: {
          id: string
          name: string
          rank: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_movie_genres: {
        Args: { p_genre: string; p_movie_id: string }
        Returns: undefined
      }
      sync_movie_people: {
        Args: {
          p_actors: string
          p_director: string
          p_movie_id: string
          p_writer: string
        }
        Returns: undefined
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
