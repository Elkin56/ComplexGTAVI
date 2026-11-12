const P: Record<string, React.ReactNode> = {
  cart: <><path d="M2 3h3l2.4 12h11l2-8H6" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></>,
  pc: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M9 6h6M9 9h6M10 18h4" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" fill="currentColor" />,
  gift: <><rect x="3" y="8" width="18" height="4" /><path d="M5 12v9h14v-9M12 8v13M12 8c-2-4-6-3-5 0M12 8c2-4 6-3 5 0" /></>,
  warn: <><path d="M12 3L2 21h20z" fill="currentColor" /><path d="M12 10v5M12 18v.2" stroke="#0a1204" /></>,
  cup: <><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3c0 4 2 5 4 5M17 6h4c0 4-2 5-4 5M12 14v4M8 21h8M10 18h4" /></>,
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" />,
  tick: <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 7v10" strokeDasharray="2 2" />,
  doc: <path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2 20a7 7 0 0 1 14 0M16 14a5 5 0 0 1 6 5" /></>,
  chart: <path d="M5 21V12M12 21V4M19 21V9" strokeWidth="4" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.2" /></>,
  chev: <path d="M9 5l7 7-7 7" strokeWidth="2.6" />,
  back: <path d="M15 5l-7 7 7 7" strokeWidth="2.4" />,
  plus: <path d="M12 5v14M5 12h14" strokeWidth="2.4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
};
export function Icon({ n, className = '', size }: { n: keyof typeof P; className?: string; size?: number }) {
  return <svg viewBox="0 0 24 24" className={`ico ${className}`} style={size ? { width: size, height: size } : undefined} aria-hidden="true">{P[n]}</svg>;
}
