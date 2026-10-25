import { useCatalog, usePackStore } from './packs'
import { usePlanStore } from './store'

// Stable placeholder colour per item, for items without a texture.
function hue(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

/** Machine icons in node headers. */
export const MACHINE_ICON_SIZE = 28

export function ItemIcon({ item, size = 20 }: { item: string; size?: number }) {
  const info = useCatalog().item(item)
  const packIcon = usePackStore((s) => s.iconUrls[item])
  // icons of addon items the plan saved, for packs that are not loaded
  const savedIcon = usePlanStore((s) => s.plan.addons?.icons?.[item])
  if (info.icon || packIcon || savedIcon)
    return (
      <img
        className={info.rendered ? 'item-icon is-rendered' : 'item-icon'}
        src={packIcon ?? savedIcon ?? import.meta.env.BASE_URL + info.icon}
        alt=""
        data-tip={info.name}
        width={size}
        height={size}
      />
    )
  const initials = info.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
  return (
    <span
      className="item-icon item-icon-placeholder"
      data-tip={info.name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `hsl(${hue(item)} 35% 35%)`,
      }}
    >
      {initials}
    </span>
  )
}

export function ItemName({ item }: { item: string }) {
  return <>{useCatalog().item(item).name}</>
}
