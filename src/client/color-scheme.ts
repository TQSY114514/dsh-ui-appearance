/**
 * Color scheme export/import: a portable JSON carrier for the eight color
 * roles. Pure functions — no DOM, no storage — so the format is unit-testable
 * and shared by the settings row.
 */
import { APPEARANCE_ROLES, type AppearanceRole, type AppearanceSettings } from '../appearance-settings.ts'
import { isHexColor } from './color.ts'

/** Current scheme format version. */
const SCHEME_VERSION = 1

/** Parsed color scheme envelope. */
export interface ColorScheme {
  /** Format version (forward-compatible guard). */
  version: number
  /** Role colors; absent roles keep the current value on import. */
  colors: Partial<Record<AppearanceRole, string>>
}

/**
 * Serialize the current color roles into the portable scheme JSON.
 * @param settings - current appearance settings.
 * @returns the scheme JSON string.
 */
export function exportColorScheme(settings: AppearanceSettings): string {
  const colors: Partial<Record<AppearanceRole, string>> = {}
  for (const role of APPEARANCE_ROLES) colors[role] = settings[role]
  return JSON.stringify({ version: SCHEME_VERSION, colors }, null, 2)
}

/**
 * Parse and validate an imported scheme JSON.
 * @param json - the pasted scheme text.
 * @returns the validated role colors, or throws with a descriptive message.
 */
export function parseColorScheme(json: string): Partial<Record<AppearanceRole, string>> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('scheme root must be an object')
  }
  const colors = (raw as { colors?: unknown }).colors
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    throw new Error('scheme.colors must be an object')
  }
  const result: Partial<Record<AppearanceRole, string>> = {}
  for (const [role, value] of Object.entries(colors)) {
    if (!APPEARANCE_ROLES.includes(role as AppearanceRole)) continue
    if (value !== '' && !(typeof value === 'string' && isHexColor(value))) {
      throw new Error(`role "${role}" has an invalid color: ${JSON.stringify(value)}`)
    }
    result[role as AppearanceRole] = value as string
  }
  return result
}
