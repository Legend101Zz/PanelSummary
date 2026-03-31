/**
 * store.ts — Zustand Global State
 * ==================================
 * Zustand is a simple state management library.
 * Think of it as a global variable that React knows to re-render
 * when it changes.
 *
 * WHY NOT useState: useState is local to a component.
 * When the API key is entered in a modal, we need it accessible
 * everywhere. Zustand makes this easy.
 *
 * HOW TO USE:
 *   const { apiKey, setApiKey } = useAppStore();
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SummaryStyle, LLMProvider, BookListItem } from "./types";

interface AppState {
  // ============================================================
  // API KEY (session only — never persisted to disk/localStorage)
  // ============================================================
  apiKey: string | null;
  provider: LLMProvider;
  model: string | null;
  setApiKey: (key: string, provider: LLMProvider, model?: string) => void;
  clearApiKey: () => void;

  // ============================================================
  // CURRENT STYLE PREFERENCE
  // Persisted to localStorage so it survives page refresh
  // ============================================================
  selectedStyle: SummaryStyle;
  setSelectedStyle: (style: SummaryStyle) => void;

  // ============================================================
  // BOOKS CACHE
  // Avoids re-fetching the books list on every navigation
  // ============================================================
  books: BookListItem[];
  setBooks: (books: BookListItem[]) => void;
  addBook: (book: BookListItem) => void;

  // ============================================================
  // UPLOAD STATE
  // Tracks current upload progress
  // ============================================================
  uploadTaskId: string | null;
  uploadProgress: number;
  uploadMessage: string;
  uploadBookId: string | null;
  setUploadState: (state: Partial<Pick<AppState,
    "uploadTaskId" | "uploadProgress" | "uploadMessage" | "uploadBookId"
  >>) => void;
  resetUpload: () => void;

  // ============================================================
  // REELS SCROLL POSITION
  // Restores scroll position when returning to reels feed
  // ============================================================
  reelsScrollIndex: number;
  setReelsScrollIndex: (index: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // API Key — NOT persisted (see partialize below)
      apiKey: null,
      provider: "openai",
      model: null,
      setApiKey: (key, provider, model = null) =>
        set({ apiKey: key, provider, model }),
      clearApiKey: () => set({ apiKey: null }),

      // Style — persisted
      selectedStyle: "manga",
      setSelectedStyle: (style) => set({ selectedStyle: style }),

      // Books cache
      books: [],
      setBooks: (books) => set({ books }),
      addBook: (book) =>
        set((state) => ({
          books: [book, ...state.books.filter((b) => b.id !== book.id)],
        })),

      // Upload state
      uploadTaskId: null,
      uploadProgress: 0,
      uploadMessage: "",
      uploadBookId: null,
      setUploadState: (partial) => set(partial),
      resetUpload: () =>
        set({
          uploadTaskId: null,
          uploadProgress: 0,
          uploadMessage: "",
          uploadBookId: null,
        }),

      // Reels scroll
      reelsScrollIndex: 0,
      setReelsScrollIndex: (index) => set({ reelsScrollIndex: index }),
    }),
    {
      name: "panelsummary-store",
      // SECURITY: Never persist the API key to localStorage
      // WHY: localStorage can be read by any JS on the page
      // The user re-enters their key each session intentionally
      partialize: (state) => ({
        selectedStyle: state.selectedStyle,
        reelsScrollIndex: state.reelsScrollIndex,
        // Intentionally NOT including: apiKey, provider, model
      }),
    }
  )
);
