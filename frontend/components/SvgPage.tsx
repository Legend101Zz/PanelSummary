"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Shows one persisted page SVG exactly as the renderer produced it.
 *
 * The markup goes into a shadow root: every page uses ids like "pg1-tone-dots",
 * so two pages (or two editions' page 1) on one screen would otherwise resolve
 * each other's clip paths and patterns. The shadow root scopes those ids
 * without touching the artifact. The document's @font-face rules (PS Comic,
 * PS Bangers) still apply inside it.
 *
 * Only the root element is sized (CSS width/height 100%, the default
 * preserveAspectRatio "xMidYMid meet", so it is never stretched); callers
 * that need a camera move the root viewBox through `onReady`.
 */

const SHADOW_CSS = ":host{display:block;position:relative}svg{display:block;width:100%;height:100%;overflow:hidden}";

/** Defence in depth: the renderer never emits these, but a stored page is data. */
function scrub(fragment: DocumentFragment) {
  fragment.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((el) => el.remove());
  fragment.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name === "xlink:href") && !attr.value.trim().startsWith("#")) el.removeAttribute(attr.name);
    }
  });
}

export interface SvgPageProps {
  svg: string;
  className?: string;
  /** Hide the page's own role="img" label (when the caller labels it). */
  decorative?: boolean;
  onReady?: (root: SVGSVGElement) => void;
}

export function SvgPage({ svg, className, decorative, onReady }: SvgPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const template = document.createElement("template");
    template.innerHTML = svg; // parsed inert: nothing runs or loads here
    scrub(template.content);
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    shadow.replaceChildren(style, template.content);
    const root = shadow.querySelector("svg");
    if (!root) return;
    if (decorative) {
      root.setAttribute("aria-hidden", "true");
      root.removeAttribute("role");
    }
    readyRef.current?.(root);
  }, [svg, decorative]);

  return <div ref={hostRef} className={className} />;
}
