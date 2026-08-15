/**
 * Stub for the harness UI primitives used by the customizer row: a minimal
 * DisclosureRow that renders its title as a toggle button and its body only
 * while open, plus a no-op icon. Enough surface for the row's wiring tests.
 */
import { createElement, type ReactNode } from 'react'

interface DisclosureRowProps {
  title: ReactNode
  open?: boolean
  onToggle?: () => void
  children?: ReactNode
}

/** Disclosure row: title button + collapsible body. */
export function DisclosureRow(props: DisclosureRowProps): ReactNode {
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', onClick: props.onToggle }, props.title),
    props.open ? createElement('div', null, props.children) : null,
  )
}

/** No-op icon component (decorative in the row header). */
export function IconPersonalizationOutline16(): ReactNode {
  return createElement('span')
}
