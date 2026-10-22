import { Handle, Position } from '@xyflow/react'
import type { PortResult } from '../../core/solver/solve'
import type { TimeUnit } from '../../core/units'
import { formatPercent, formatRate } from '../format'
import { ItemIcon, ItemName } from '../ItemIcon'
import { handleId } from './handles'

export function PortRow({
  side,
  port,
  unit,
}: {
  side: 'in' | 'out'
  port: PortResult
  unit: TimeUnit
}) {
  const problem =
    side === 'in' && port.shortage > 1e-6
      ? `Missing ${formatRate(port.shortage, unit)}`
      : side === 'out' && port.surplus > 1e-6
        ? `Surplus ${formatRate(port.surplus, unit)}`
        : undefined

  return (
    <div className={`port port-${side}`}>
      <Handle
        type={side === 'in' ? 'target' : 'source'}
        position={side === 'in' ? Position.Left : Position.Right}
        id={handleId(side, port.item)}
      />
      <ItemIcon item={port.item} />
      <span className="port-name">
        <ItemName item={port.item} />
        {port.chance !== undefined && (
          <span className="port-chance"> {formatPercent(port.chance)}</span>
        )}
      </span>
      <span className="port-rate">{formatRate(port.perMinute, unit)}</span>
      {problem && (
        <span
          className={`port-problem ${side === 'in' ? 'is-shortage' : 'is-surplus'}`}
        >
          {problem}
        </span>
      )}
    </div>
  )
}
