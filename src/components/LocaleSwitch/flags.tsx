import React from 'react'

/**
 * Flags as SVG, not as emoji.
 *
 * Windows ships no flag glyphs, so 🇯🇵 and 🇺🇸 render there as the letters JP
 * and US — which is what the first attempt showed. Drawing them keeps the
 * switcher looking the same on every machine.
 */
const FRAME = {
  width: 20,
  height: 14,
  rx: 2,
} as const

export const JapanFlag: React.FC = () => (
  <svg viewBox="0 0 20 14" width={FRAME.width} height={FRAME.height} aria-hidden="true">
    <rect width="20" height="14" rx={FRAME.rx} fill="#fff" />
    <circle cx="10" cy="7" r="4" fill="#bc002d" />
    <rect width="20" height="14" rx={FRAME.rx} fill="none" stroke="rgba(0,0,0,0.15)" />
  </svg>
)

/** Thirteen stripes read as noise at 14px, so this draws seven. */
export const UnitedStatesFlag: React.FC = () => (
  <svg viewBox="0 0 20 14" width={FRAME.width} height={FRAME.height} aria-hidden="true">
    <rect width="20" height="14" rx={FRAME.rx} fill="#fff" />
    {[0, 2, 4, 6].map(row => (
      <rect key={row} y={row * 2} width="20" height="2" fill="#b22234" />
    ))}
    <rect width="9" height="8" rx="1" fill="#3c3b6e" />
    {[1.5, 4.5, 7.5].map(y =>
      [1.5, 4.5, 7.5].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.6" fill="#fff" />)
    )}
    <rect width="20" height="14" rx={FRAME.rx} fill="none" stroke="rgba(0,0,0,0.15)" />
  </svg>
)
