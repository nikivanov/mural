import type { ReactNode, CSSProperties } from 'react'
import { computeWallLayout } from '../layoutGeometry'

export const hatchStyle: CSSProperties = {
  backgroundColor: '#111',
  backgroundImage: [
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 0, transparent 50%)',
    'repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 0, transparent 50%)',
  ].join(', '),
  backgroundSize: '8px 8px',
}

export const fmtMm = (v: number) => `${Math.round(v)} mm`

const dimLineClass = 'absolute border-dashed border-gray-500/60 pointer-events-none z-10'

function DimLabel({ left, top, centerY = true, children }: {
  left: string
  top: string
  centerY?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`absolute -translate-x-1/2 ${centerY ? '-translate-y-1/2' : ''} text-[10px] leading-none px-1 py-0.5 rounded bg-gray-900/80 text-gray-300 whitespace-nowrap tabular-nums pointer-events-none z-20`}
      style={{ left, top }}
    >
      {children}
    </span>
  )
}

interface Props {
  /** Distance between the hanging pins [mm] */
  dPins: number
  xFraction?: number
  yFraction?: number
  /** Drawing height [mm] — determines the diagram's aspect ratio */
  drawingHeight: number
  /** Replaces the formatted drawing height, e.g. when the height is not known yet */
  heightLabel?: string
  /** Content placed inside the drawing area; it is stretched to fill it */
  children?: ReactNode
}

/**
 * Dimensioned sketch of the wall: both pins, margins and the drawing area.
 * Must be placed inside a container with `containerType: 'size'` — it contain-fits itself into it.
 */
export function WallLayoutDiagram({ dPins, xFraction, yFraction, drawingHeight, heightLabel, children }: Props) {
  const { marginX, marginTop, width } = computeWallLayout(dPins, xFraction, yFraction)
  const totalH = marginTop + drawingHeight

  const leftPct = (marginX / dPins) * 100
  const topPct = (marginTop / totalH) * 100
  const widthPct = (width / dPins) * 100
  const heightPct = (drawingHeight / totalH) * 100
  // Dimension annotation anchors: centre of the left margin, centre of the right margin, drawing mid-height
  const leftGapXPct = leftPct / 2
  const rightGapXPct = leftPct + widthPct + leftPct / 2
  const midYPct = topPct + heightPct / 2

  const drawingStyle: CSSProperties = {
    position: 'absolute',
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: `${widthPct}%`,
    height: `${heightPct}%`,
  }

  return (
    <div
      className="relative"
      style={{ aspectRatio: `${dPins} / ${totalH}`, width: `min(100cqw, calc(100cqh * ${dPins / totalH}))` }}
    >
      {/* Safe-area dashed outline */}
      <div className="absolute border border-dashed border-gray-600 pointer-events-none z-10" style={drawingStyle} />
      {/* Hanging pins */}
      <div className="absolute w-2.5 h-2.5 rounded-full bg-gray-500 -translate-x-1/2 -translate-y-1/2" style={{ left: '0%', top: '0%' }} />
      <div className="absolute w-2.5 h-2.5 rounded-full bg-gray-500 translate-x-1/2 -translate-y-1/2" style={{ right: '0%', top: '0%' }} />
      {/* Drawing content */}
      <div style={drawingStyle}>{children}</div>
      {/* Dimension annotations (mm) */}
      {/* Pin to pin */}
      <div className={`${dimLineClass} border-t`} style={{ left: 0, right: 0, top: 0 }} />
      <DimLabel left="50%" top="2px" centerY={false}>{fmtMm(dPins)}</DimLabel>
      {/* Top (Y) margin */}
      <div className={`${dimLineClass} border-l`} style={{ left: `${leftGapXPct}%`, top: 0, height: `${topPct}%` }} />
      {/* Kept ≥60px left of centre so it never collides with the centred pin/width labels in narrow layouts */}
      <DimLabel left={`min(${leftGapXPct}%, calc(50% - 60px))`} top={`max(${topPct / 2}%, 8px)`}>{fmtMm(marginTop)}</DimLabel>
      {/* Side (X) margin */}
      <div className={`${dimLineClass} border-t`} style={{ left: 0, width: `${leftPct}%`, top: `${midYPct}%` }} />
      <DimLabel left={`${leftGapXPct}%`} top={`${midYPct}%`}>{fmtMm(marginX)}</DimLabel>
      {/* Drawing width — just above the drawing; slides onto its top edge rather than under the pin label when the top margin is tiny */}
      <DimLabel left={`${leftPct + widthPct / 2}%`} top={`max(calc(${topPct}% - 9px), 25px)`}>{fmtMm(width)}</DimLabel>
      {/* Drawing height */}
      <div className={`${dimLineClass} border-l`} style={{ left: `${rightGapXPct}%`, top: `${topPct}%`, bottom: 0 }} />
      <DimLabel left={`${rightGapXPct}%`} top={`${midYPct}%`}>{heightLabel ?? fmtMm(drawingHeight)}</DimLabel>
    </div>
  )
}
