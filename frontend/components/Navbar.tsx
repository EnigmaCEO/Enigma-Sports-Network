import React, { useState } from "react";
import Link from "next/link";

type NavLink = { label: string; href: string };

interface NavbarProps {
  logoSrc?: string; // optional image src for logo
  logoAlt?: string;
  links?: NavLink[]; // default links will be used if not provided
  className?: string;
}

/**
 * Minimal responsive Navbar:
 * - Left: logo (image if logoSrc provided, fallback text)
 * - Right: links and optional CTA button
 * - Hamburger toggles menu on small screens
 */
export default function Navbar({
  logoSrc,
  logoAlt = "Enigma Sports",
  links = [
    { label: "Home1", href: "/" },
    { label: "Teams", href: "/teams" },
    { label: "Events", href: "/events" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  className = "",
}: NavbarProps) {
  const [open, setOpen] = useState(false);

  const styles: { [k: string]: React.CSSProperties } = {
    bar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.5rem 2rem", // increased horizontal padding
      borderBottom: "1px solid rgba(0,0,0,0.08)",
      background: "#fff",
      position: "sticky",
      top: 0,
      zIndex: 50,
      width: "100%",
      maxWidth: 1400, // allow wider center content on large screens
      margin: "0 auto",
    },
    brand: { display: "flex", alignItems: "center", gap: 8, textDecoration: "none" },
    logoImg: { height: 44, width: "auto", display: "block" }, // slightly larger logo
    logoText: { fontWeight: 700, fontSize: 18, color: "#111" },
    nav: {
      display: "flex",
      alignItems: "center",
      gap: 16, // more spacing between links
    },
    ul: {
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      alignItems: "center",
      width: 500, // requested width
      justifyContent: "space-around", // requested spacing
    },
    link: {
      textDecoration: "none",
      color: "#111",
      padding: "8px 10px", // slightly larger hit area
      borderRadius: 6,
      fontSize: 14,
    },
    cta: {
      marginLeft: 8,
      padding: "8px 14px",
      background: "#0b74ff",
      color: "#fff",
      borderRadius: 6,
      textDecoration: "none",
      fontSize: 14,
    },
    // mobile menu
    mobileBtn: {
      display: "none",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      padding: 6,
    },
    mobileMenu: {
      display: "none",
      flexDirection: "column",
      gap: 6,
      padding: "8px 1rem 12px",
      borderTop: "1px solid rgba(0,0,0,0.04)",
    },
  };

  // Basic responsive rules via inline style fallback: small viewport detection
  // (allows this component to be usable without external CSS; for production prefer CSS/Tailwind)
  const isSmall = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  // Use JS-driven responsive behavior for the mobile menu display
  const showMobile = isSmall;

  return (
    <header className={className}>
      <div style={styles.bar}>
        <Link href="/" style={styles.brand} aria-label="Enigma Sports Home">
          {logoSrc ? (
            <img src={logoSrc} alt={logoAlt} style={styles.logoImg} />
          ) : (
            <span style={styles.logoText}>Enigma Sports</span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: showMobile ? "none" : "block" }}>
          <ul style={{ ...styles.ul }}>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} style={styles.link}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/signup" style={styles.cta}>
                Join
              </Link>
            </li>
          </ul>
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen((s) => !s)}
          aria-expanded={open}
          aria-label="Toggle navigation"
          style={{
            ...styles.mobileBtn,
            display: showMobile ? "inline-flex" : "none",
            alignItems: "center",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="#111" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Mobile menu (simple) */}
      {showMobile && open && (
        <div style={styles.mobileMenu}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} style={{ ...styles.link, display: "block" }} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link href="/signup" style={{ ...styles.cta, display: "inline-block" }} onClick={() => setOpen(false)}>
            Join
          </Link>
        </div>
      )}
    </header>
  );
}
