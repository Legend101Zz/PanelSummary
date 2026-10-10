import type { ReactNode } from "react";

/**
 * v0.1 header, kept only so the v0.1 screens still compile. The app layout
 * (app/(app)/layout.tsx) now draws the one Header, so this renders nothing
 * (two headers would show otherwise). The `action` prop is dropped: the
 * header's "Add a book" button replaces the shelf's old action. Screen tracks
 * delete the calls to this component when they rewrite their screens.
 */
export function SiteHeader(_props: { action?: ReactNode }) {
  return null;
}
