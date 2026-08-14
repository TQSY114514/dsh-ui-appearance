/**
 * Typings for the browser bundle (`@deepseek-ai/dsh-client-ui-appearance/client`).
 *
 * The bundle is a ModuleLoader closure consumed by the DeepSeek Harness shell;
 * tsdown cannot emit a declaration for it because the `@deepseek-ai/*` peers
 * are host-provided (not installed in this standalone repository), so this
 * hand-written declaration mirrors its public surface. Keep in sync with
 * `src/client/index.ts`.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Required services (cordis fiber inject). */
export declare const inject: string[]

/**
 * Client plugin body: bind the `ui-appearance` settings scope, mount the DOM
 * applier, and register the customizer row into the General settings section.
 * @param ctx - client cordis context.
 */
export declare function apply(ctx: Context): void

export type { AppearanceRole, AppearanceSettings } from './index'
