/** Host registration for the appearance settings section. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { APPEARANCE_SETTINGS_NAMESPACE, AppearanceSettingsSchema } from './appearance-settings.ts'

export {
  APPEARANCE_SETTINGS_NAMESPACE, APPEARANCE_ROLES, DEFAULT_SETTINGS,
  type AppearanceRole, type AppearanceSettings,
} from './appearance-settings.ts'

const APPEARANCE_NAMESPACE = settingsNamespace(APPEARANCE_SETTINGS_NAMESPACE)

/**
 * Register the durable appearance section when the settings service is
 * composed; the browser scope validates against this schema.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(APPEARANCE_NAMESPACE, AppearanceSettingsSchema)
  })
}
