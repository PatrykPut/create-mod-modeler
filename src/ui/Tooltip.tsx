import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const TIP_ID = 'app-tooltip'
const GAP = 6
const MARGIN = 8

interface Tip {
  text: string
  anchor: DOMRect
}

/** The ⓘ icon that explains an assumption; focusable for keyboard users. */
export function Info({ tip }: { tip: string }) {
  return (
    <span className="info" tabIndex={0} data-tip={tip}>
      ⓘ
    </span>
  )
}

/**
 * One styled tooltip for the whole app: any element with a `data-tip`
 * attribute shows it on hover or keyboard focus.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip>()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current: HTMLElement | undefined
    const show = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.('[data-tip]')
      if (!(target instanceof HTMLElement) || target === current) return
      hide()
      const text = target.dataset.tip
      if (!text) return
      current = target
      target.setAttribute('aria-describedby', TIP_ID)
      setTip({ text, anchor: target.getBoundingClientRect() })
    }
    const hide = () => {
      current?.removeAttribute('aria-describedby')
      current = undefined
      setTip(undefined)
    }
    const leave = (event: Event) => {
      const next = (event as PointerEvent | FocusEvent).relatedTarget as Node
      if (current && !current.contains(next)) hide()
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    document.addEventListener('pointerover', show)
    document.addEventListener('focusin', show)
    document.addEventListener('pointerout', leave)
    document.addEventListener('focusout', leave)
    document.addEventListener('keydown', escape)
    document.addEventListener('wheel', hide, { passive: true })
    return () => {
      document.removeEventListener('pointerover', show)
      document.removeEventListener('focusin', show)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('focusout', leave)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('wheel', hide)
    }
  }, [])

  // above the element when there is room, else below; kept inside the window
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!tip || !box) return
    const { anchor } = tip
    const { width, height } = box.getBoundingClientRect()
    const above = anchor.top - GAP - height >= MARGIN
    const left = anchor.left + anchor.width / 2 - width / 2
    box.style.left = `${Math.max(MARGIN, Math.min(left, innerWidth - width - MARGIN))}px`
    box.style.top = `${above ? anchor.top - GAP - height : anchor.bottom + GAP}px`
    box.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return (
    <div id={TIP_ID} role="tooltip" className="tooltip" ref={boxRef}>
      {tip.text}
    </div>
  )
}
