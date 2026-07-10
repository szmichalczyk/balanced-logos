"use client";

import * as React from "react";

/**
 * Reads the runtime's resolved theme from the DOM. The InfoCard renders outside ToolcraftApp's
 * themed wrapper, so it must mirror `data-toolcraft-theme` itself for the theme tokens to resolve.
 */
function useToolcraftTheme(): "dark" | "light" {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  React.useEffect(() => {
    const el = document.querySelector("[data-toolcraft-theme]");
    if (!el) {
      return;
    }
    const read = (): void => {
      setTheme(el.getAttribute("data-toolcraft-theme") === "light" ? "light" : "dark");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { attributeFilter: ["data-toolcraft-theme"], attributes: true });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/**
 * Branding + description card, pinned above the Layers panel as the first card in the left column.
 * Uses the same surface tokens as the runtime panels (var(--card) + a foreground ring) so it matches
 * them and adapts to light/dark mode. Matches the Layers panel width, radius, and left inset.
 */
export function InfoCard(): React.JSX.Element {
  const theme = useToolcraftTheme();
  return (
    <div
      className="pointer-events-auto absolute left-2.5 top-2.5 z-40 w-[240px] rounded-lg bg-[color:var(--card)] p-3.5 shadow-lg ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)]"
      data-toolcraft-theme={theme}
    >
      <h1 className="text-sm font-semibold tracking-tight text-[color:var(--foreground)]">
        Balance your logos
      </h1>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
        Drop a set of logos and get them optically balanced inside matching frames, ready to
        export. Save time, no manual work.
      </p>
      <p className="mt-2.5 text-[10px] text-[color:color-mix(in_oklab,var(--muted-foreground)_65%,transparent)]">
        created with ♥ by{" "}
        <a
          className="underline decoration-current/30 underline-offset-2 transition-colors hover:text-[color:var(--foreground)]"
          href="https://x.com/szmichalczyk"
          rel="noreferrer"
          target="_blank"
        >
          @szmichalczyk
        </a>
      </p>
    </div>
  );
}
