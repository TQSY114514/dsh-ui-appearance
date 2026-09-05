/**
 * Host registration for the appearance plugin.
 *
 * Deliberately empty: settings persist in browser localStorage (the harness
 * settings gateway exposes only its hard-coded product namespaces to browser
 * clients, so a third-party settings namespace cannot be written through the
 * settings RPC), which keeps this half free of any @deepseek-ai runtime
 * dependency — the plugin installs anywhere the host can load it.
 */
import type { Context } from '@deepseek-ai/cordis'

export {
  APPEARANCE_SETTINGS_NAMESPACE, APPEARANCE_ROLES, DEFAULT_SETTINGS,
  DEFAULT_MODE_THEME, DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME,
  type AppearanceRole, type AppearanceSettings, type ThemeMode, type ModeThemeSettings,
} from './appearance-settings.ts'

/**
 * No host-side work: everything runs in the browser half.
 * @param ctx - Host context (unused).
 */
export function apply(_ctx: Context): void {}
