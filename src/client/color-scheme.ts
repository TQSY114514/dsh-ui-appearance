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
  /** Light mode colors. */
  light?: Partial<Record<AppearanceRole, string>>
  /** Dark mode colors. */
  dark?: Partial<Record<AppearanceRole, string>>
}

/**
 * Result of parsing an imported scheme: role colors at top level for backward
 * compatibility, plus optional mode-specific sections.
 */
export interface ParsedColorSchemeResult extends Partial<Record<AppearanceRole, string>> {
  colors?: Partial<Record<AppearanceRole, string>>
  light?: Partial<Record<AppearanceRole, string>>
  dark?: Partial<Record<AppearanceRole, string>>
}

/**
 * Serialize the current color roles into the portable scheme JSON.
 * @param settings - current appearance settings.
 * @returns the scheme JSON string.
 */
export function exportColorScheme(settings: AppearanceSettings): string {
  const colors: Partial<Record<AppearanceRole, string>> = {}
  const light: Partial<Record<AppearanceRole, string>> = {}
  const dark: Partial<Record<AppearanceRole, string>> = {}
  for (const role of APPEARANCE_ROLES) {
    colors[role] = settings.dark?.[role] || settings.light?.[role] || settings[role] || ''
    light[role] = settings.light?.[role] || settings[role] || ''
    dark[role] = settings.dark?.[role] || settings[role] || ''
  }
  return JSON.stringify({ version: SCHEME_VERSION, colors, light, dark }, null, 2)
}

function parseRoleMap(source: unknown, fieldName: string): Partial<Record<AppearanceRole, string>> {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error(`scheme.${fieldName} must be an object`)
  }
  const result: Partial<Record<AppearanceRole, string>> = {}
  for (const [role, value] of Object.entries(source)) {
    if (!APPEARANCE_ROLES.includes(role as AppearanceRole)) continue
    if (value !== '' && !(typeof value === 'string' && isHexColor(value))) {
      throw new Error(`role "${role}" has an invalid color: ${JSON.stringify(value)}`)
    }
    result[role as AppearanceRole] = value as string
  }
  return result
}

/**
 * Parse and validate an imported scheme JSON.
 * @param json - the pasted scheme text.
 * @returns the validated role colors, or throws with a descriptive message.
 */
export function parseColorScheme(json: string): ParsedColorSchemeResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('not valid JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('scheme root must be an object')
  }
  const rawColors = (raw as { colors?: unknown }).colors
  const rawLight = (raw as { light?: unknown }).light
  const rawDark = (raw as { dark?: unknown }).dark

  if (rawColors === undefined && rawLight === undefined && rawDark === undefined) {
    throw new Error('scheme.colors must be an object')
  }

  const parsedColors = rawColors !== undefined ? parseRoleMap(rawColors, 'colors') : {}
  const parsedLight = rawLight !== undefined ? parseRoleMap(rawLight, 'light') : undefined
  const parsedDark = rawDark !== undefined ? parseRoleMap(rawDark, 'dark') : undefined

  const result: ParsedColorSchemeResult = {
    ...parsedColors,
  }
  if (parsedLight !== undefined) result.light = parsedLight
  if (parsedDark !== undefined) result.dark = parsedDark
  return result
}
