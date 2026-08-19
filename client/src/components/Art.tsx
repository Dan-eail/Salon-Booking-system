import { useId } from 'react';

/** Drawn (not photographic) arch art. Real salon photos replace these wherever owners upload gallery images. */
const palettes: Record<string, [string, string, string]> = {
  hair: ['#3F1230', '#B8893A', '#F1D6D3'],
  nails: ['#7A2142', '#F1D6D3', '#E2BC72'],
  bridal: ['#5C244A', '#F9E9E6', '#B8893A'],
  other: ['#3F1230', '#F1D6D3', '#B8893A'],
};

export function ArchArt({ kind = 'hair', className, seed = 0 }: { kind?: string; className?: string; seed?: number }) {
  const id = useId().replace(/:/g, '');
  const [a, b, c] = palettes[kind] ?? palettes.other;
  const strands = 7;
  return (
    <svg viewBox="0 0 240 300" className={className} role="img" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath id={`arch-${id}`}><path d="M0 300V120C0 54 54 0 120 0s120 54 120 120v180z" /></clipPath>
      </defs>
      <g clipPath={`url(#arch-${id})`}>
        <rect width="240" height="300" fill={a} />
        <circle cx={120 + ((seed * 37) % 40) - 20} cy="96" r="58" fill={c} opacity=".16" />
        {kind === 'nails' ? (
          <g fill="none" strokeLinecap="round">
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i} transform={`translate(${46 + i * 36} ${210 - (i === 2 ? 26 : i === 1 || i === 3 ? 14 : 0) - (i === 0 || i === 4 ? 0 : 0)})`}>
                <rect x="0" y="0" width="26" height="90" rx="13" fill={b} opacity={0.92 - i * 0.04} />
                <rect x="4" y="6" width="18" height="26" rx="9" fill={i % 2 ? c : a} opacity=".85" />
              </g>
            ))}
          </g>
        ) : (
          <g fill="none" stroke={c} strokeLinecap="round">
            {Array.from({ length: strands }, (_, i) => {
              const x = 34 + i * 29;
              return <path key={i} d={`M${x} 40 C ${x + 22} 100, ${x - 22} 160, ${x} 230 S ${x + 14} 290, ${x} 310`} strokeWidth={i % 2 ? 7 : 11} opacity={i % 2 ? 0.5 : 0.85} />;
            })}
            <path d="M0 232H240" stroke={b} strokeWidth="3" opacity=".7" />
          </g>
        )}
        <rect y="286" width="240" height="14" fill={b} opacity=".9" />
      </g>
    </svg>
  );
}

export function Tilet({ thin, className = '' }: { thin?: boolean; className?: string }) {
  return <div className={`tilet ${thin ? 'tilet-thin' : ''} ${className}`} aria-hidden />;
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" width="32" height="32" aria-hidden>
        <rect width="40" height="40" rx="10" fill={light ? '#F1D6D3' : '#3F1230'} />
        <path d="M11 32V18a9 9 0 0 1 18 0v14" fill="none" stroke={light ? '#3F1230' : '#E2BC72'} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M16 32V19a4 4 0 0 1 8 0v13" fill="none" stroke={light ? '#7A2142' : '#F1D6D3'} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className={`font-display text-[22px] font-semibold leading-none ${light ? 'text-ivory' : 'text-plum'}`}>Belle <span className="font-normal italic">Ethiopia</span></span>
    </span>
  );
}
