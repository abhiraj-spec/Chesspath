"use client";

import { useEffect } from "react";

/**
 * Some free hosts (Netlify's free plan, for one) add a fixed badge to the bottom corner of every
 * page. ChessPath does not hide or change it; instead the app's own bottom bars move up so the
 * badge never sits on top of a button. The measured height is published as the CSS variable
 * --host-inset (0px when there is no badge, or once the visitor closes it).
 */
const SELECTOR = "body > iframe[id^='nl-']";
/** A badge taller than this is an opened panel, not a badge: do not chase it. */
const MAX_INSET = 96;

export function HostBadgeInset() {
  useEffect(() => {
    const root = document.documentElement;
    let frame: Element | null = null;
    const sizes = new ResizeObserver(() => measure());
    const attrs = new MutationObserver(() => measure());
    function measure() {
      let inset = 0;
      if (frame?.isConnected) {
        const r = frame.getBoundingClientRect();
        const style = getComputedStyle(frame);
        const shown = r.width > 0 && r.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.position === "fixed";
        const atBottom = window.innerHeight - r.bottom < 24;
        if (shown && atBottom && r.height <= MAX_INSET) inset = Math.ceil(window.innerHeight - r.top);
      }
      root.style.setProperty("--host-inset", `${inset}px`);
    }
    function attach() {
      const found = document.querySelector(SELECTOR);
      if (found !== frame) {
        sizes.disconnect();
        attrs.disconnect();
        frame = found;
        if (frame) {
          sizes.observe(frame);
          attrs.observe(frame, { attributes: true });
        }
      }
      measure();
    }
    const children = new MutationObserver(attach);
    children.observe(document.body, { childList: true });
    window.addEventListener("resize", measure);
    attach();
    return () => {
      children.disconnect();
      sizes.disconnect();
      attrs.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--host-inset");
    };
  }, []);
  return null;
}
