/**
 * Shared brand mark for the parking recheck inspector app and admin console.
 * "P" = parking ticket · check arc = field verification / 複核.
 */

function LogoMark({ fill = "#fff", checkStroke = "#e6a020" }) {
  return (
    <g fill={fill}>
      {/* Parking "P" stem */}
      <rect x="7.2" y="6.4" width="5.2" height="19.2" rx="2.4" />
      {/* Parking "P" bowl */}
      <path
        fillRule="evenodd"
        d="M12.4 6.4h7.4a6.1 6.1 0 0 1 0 12.2h-7.4V6.4zm4.8 4.2h2.6a1.9 1.9 0 0 1 0 3.8h-2.6V10.6z"
      />
      {/* Verification badge */}
      <circle cx="23.2" cy="23.4" r="6.1" />
      <path
        d="M20.4 23.5l2 2.1 4.4-4.6"
        fill="none"
        stroke={checkStroke}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export default function AppLogo({
  size = 36,
  className = "",
  variant = "full",
  title = "停車單稽查系統",
}) {
  if (variant === "mono") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        className={className}
        role="img"
        aria-label={title}
      >
        <LogoMark fill="currentColor" checkStroke="var(--color-surface, #fff)" />
      </svg>
    );
  }

  if (variant === "glyph") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        className={className}
        role="img"
        aria-label={title}
      >
        <LogoMark fill="currentColor" checkStroke="var(--color-primary, #e6a020)" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id="app-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2b950" />
          <stop offset="0.55" stopColor="#e6a020" />
          <stop offset="1" stopColor="#d1901a" />
        </linearGradient>
        <linearGradient id="app-logo-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0.8" y="0.8" width="30.4" height="30.4" rx="8.8" fill="url(#app-logo-bg)" />
      <rect x="0.8" y="0.8" width="30.4" height="30.4" rx="8.8" fill="url(#app-logo-shine)" />
      <LogoMark />
    </svg>
  );
}
