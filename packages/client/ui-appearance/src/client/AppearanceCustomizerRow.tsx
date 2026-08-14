/**
 * The Appearance customizer row registered into the General section item slot
 * (below ui-theme's Appearance preference row): preset chips, eight color
 * pickers, the background upload/drop zone with opacity and blur sliders, and
 * the interface transparency / glass sliders. All writes go through the
 * injected face; the scope round-trip reconciles.
 */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import clsx from 'clsx'
import {
  DisclosureRow, IconPersonalizationOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { APPEARANCE_ROLES, type AppearanceRole, type AppearanceSettings } from '../appearance-settings.ts'
import { formatHex, isHexColor, parseHex } from './color.ts'
import { ACCEPTED_IMAGE_TYPES, readImageFile } from './image.ts'
import { APPEARANCE_PRESETS, BACKGROUND_BLUR_MAX, GLASS_BLUR_MAX } from './tokens.ts'
import type { AppearanceKey } from './locales.ts'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceCustomizerRow.module.css'

/** Injected business face: the row's whole write path. */
export interface AppearanceCustomizerInjected {
  /** Update one settings field (optimistic + debounced persistence). */
  set: (field: keyof AppearanceSettings, value: string | number) => void
  /** Set or clear the background image (null removes it). */
  setImage: (dataUrl: string | null) => void
  /** Apply one shipped preset (colors only). */
  applyPreset: (id: string) => void
  /** Restore every setting to its stock value. */
  resetAll: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceCustomizerComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.appearance'> & AppearanceCustomizerInjected

/** One color field row: native swatch + hex text input. */
function ColorField(props: { label: string; value: string; onChange: (hex: string) => void }) {
  const { label, value, onChange } = props
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = (): void => {
    const hex = draft.trim()
    if (hex === value) return
    if (isHexColor(hex)) onChange(hex)
    else setDraft(value)
  }
  return (
    <label className={css.colorField}>
      <span className={css.colorLabel}>{label}</span>
      <input
        type="color"
        className={css.colorSwatch}
        value={value === '' ? '#ffffff' : value}
        onChange={event => { onChange(event.target.value) }}
      />
      <input
        type="text"
        className={css.colorHex}
        value={draft}
        spellCheck={false}
        onChange={event => { setDraft(event.target.value) }}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') commit() }}
      />
    </label>
  )
}

/** One labeled slider with a formatted value readout. */
function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const { label, value, min, max, step, format, onChange } = props
  return (
    <div className={css.sliderRow}>
      <span className={css.sliderLabel}>{label}</span>
      <input
        type="range"
        className={css.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => { onChange(Number(event.target.value)) }}
      />
      <span className={css.sliderValue}>{format(value)}</span>
    </div>
  )
}

/**
 * Render the appearance customizer row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceCustomizerRow({
  t, useStore, set, setImage, applyPreset, resetAll,
}: AppearanceCustomizerComponentProps) {
  const settings = useStore(s => s.settings)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const readFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setReading(true)
    setReadError(false)
    try {
      setImage(await readImageFile(file))
    } catch {
      setReadError(true)
    } finally {
      setReading(false)
    }
  }
  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void readFile(file)
  }
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    void readFile(event.dataTransfer.files?.[0])
  }
  const changeRole = (role: AppearanceRole, hex: string): void => {
    const normalized = hex.length === 4 ? formatHex(parseHex(hex)) : hex.toLowerCase()
    set(role, normalized)
    set('preset', 'custom')
  }

  return (
    <div className={css.group}>
      <DisclosureRow
        icon={<IconPersonalizationOutline16 />}
        title={t('row.title')}
        open={open}
        expandable
        expandOnRowClick
        onToggle={() => { setOpen(value => !value) }}
      >
        <div className={css.body} onClick={event => { event.stopPropagation() }}>
          <div className={css.section}>
            <div className={css.sectionTitle}>{t('presets.title')}</div>
            <div className={css.chipRow} role="group">
              {APPEARANCE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  className={clsx(css.chip, settings.preset === preset.id && css.chipSelected)}
                  aria-pressed={settings.preset === preset.id}
                  onClick={() => { applyPreset(preset.id) }}
                >
                  {t(`preset.${preset.id}` as AppearanceKey)}
                </button>
              ))}
            </div>
          </div>

          <div className={css.section}>
            <div className={css.sectionTitle}>{t('colors.title')}</div>
            <div className={css.colorGrid}>
              {APPEARANCE_ROLES.map(role => (
                <ColorField
                  key={role}
                  label={t(`color.${role}` as AppearanceKey)}
                  value={settings[role]}
                  onChange={hex => { changeRole(role, hex) }}
                />
              ))}
            </div>
          </div>

          <div
            className={clsx(css.section, dragging && css.dragging)}
            onDragOver={event => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => { setDragging(false) }}
            onDrop={onDrop}
          >
            <div className={css.sectionTitle}>{t('background.title')}</div>
            <div className={css.uploadRow}>
              <input
                ref={fileRef}
                className={css.fileInput}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={onPick}
              />
              <button
                type="button"
                className={css.ghostButton}
                disabled={reading}
                onClick={() => { fileRef.current?.click() }}
              >
                {reading
                  ? t('background.reading')
                  : settings.backgroundImage === ''
                    ? t('background.upload')
                    : t('background.replace')}
              </button>
              {settings.backgroundImage !== '' && (
                <>
                  <img className={css.thumb} src={settings.backgroundImage} alt="" />
                  <button type="button" className={css.ghostButton} onClick={() => { setImage(null) }}>
                    {t('background.remove')}
                  </button>
                </>
              )}
            </div>
            <div className={css.hint}>
              {readError ? t('background.readError') : t('background.dropHint')}
            </div>
            <Slider
              label={t('background.opacity')}
              value={settings.backgroundOpacity}
              min={0}
              max={1}
              step={0.01}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('backgroundOpacity', value) }}
            />
            <Slider
              label={t('background.blur')}
              value={settings.backgroundBlur}
              min={0}
              max={BACKGROUND_BLUR_MAX}
              step={1}
              format={value => `${value}px`}
              onChange={value => { set('backgroundBlur', value) }}
            />
          </div>

          <div className={css.section}>
            <div className={css.sectionTitle}>{t('surface.title')}</div>
            <Slider
              label={t('surface.opacity')}
              value={settings.surfaceAlpha}
              min={0}
              max={1}
              step={0.01}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('surfaceAlpha', value) }}
            />
            <Slider
              label={t('surface.glass')}
              value={settings.glassBlur}
              min={0}
              max={GLASS_BLUR_MAX}
              step={1}
              format={value => `${value}px`}
              onChange={value => { set('glassBlur', value) }}
            />
            <div className={css.hint}>{t('surface.hint')}</div>
          </div>

          <div className={css.footer}>
            <button type="button" className={css.ghostButton} onClick={resetAll}>
              {t('actions.reset')}
            </button>
          </div>
        </div>
      </DisclosureRow>
    </div>
  )
}
