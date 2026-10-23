import React from "react";
import { useTheme } from "../services/theme";

/**
 * The "CODE RED" tag a screen wears while the Halloween theme is on: a siren
 * light and the words on hazard tape. Renders nothing in the neon theme, so a
 * screen can place it once and forget about it.
 */
const CodeRedBadge: React.FC<{
  /** What follows "CODE RED" — the screen's own line, if it has one. */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ label = "Halloween", size = "md", className = "" }) => {
  const theme = useTheme();
  if (theme !== "code-red") return null;

  const text = size === "lg" ? "text-xl md:text-2xl" : size === "sm" ? "text-[11px]" : "text-sm";
  return (
    <span className={`cr-badge font-creep ${text} ${className}`}>
      <span className="cr-beacon" aria-hidden="true" />
      <span>CODE RED</span>
      {label && (
        <>
          <span aria-hidden="true">·</span>
          <span>{label}</span>
        </>
      )}
      <span aria-hidden="true">🎃</span>
    </span>
  );
};

export default CodeRedBadge;
