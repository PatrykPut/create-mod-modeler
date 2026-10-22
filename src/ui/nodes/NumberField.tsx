import { useState } from 'react'

interface Props {
  label: string
  value: number | undefined
  placeholder?: string
  min?: number
  max?: number
  step?: number
  title?: string
  /** undefined when the field is cleared. */
  onChange(value: number | undefined): void
}

/** Small numeric input that only commits valid numbers and allows clearing. */
export function NumberField({
  label,
  value,
  placeholder,
  min = 0,
  max,
  step,
  title,
  onChange,
}: Props) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  // follow outside changes (e.g. switching the time unit) without clobbering typing
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    if (value === undefined ? text !== '' : Number(text) !== value)
      setText(value === undefined ? '' : String(value))
  }

  return (
    <label className="field nodrag" title={title}>
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value)
          if (e.target.value === '') return onChange(undefined)
          const parsed = Number(e.target.value)
          if (
            Number.isFinite(parsed) &&
            parsed >= min &&
            (max === undefined || parsed <= max)
          )
            onChange(parsed)
        }}
      />
    </label>
  )
}
