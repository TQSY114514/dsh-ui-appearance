/**
 * The Appearance customizer row registered into the General section item slot
 * (below ui-theme's Appearance preference row): preset chips, eight color
 * pickers, the background upload/drop zone with opacity and blur sliders,
 * Wallpaper Engine integration, and the interface transparency / glass sliders.
 * All writes go through the injected face; the scope round-trip reconciles.
 */
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import clsx from 'clsx'
import {
  DisclosureRow, IconPersonalizationOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { APPEARANCE_ROLES, type AppearanceRole, type AppearanceSettings } from '../appearance-settings.ts'
import { formatHex, isHexColor, parseHex } from './color.ts'
import { ACCEPTED_IMAGE_TYPES, derivePalette, MAX_INPUT_BYTES, prepareImage } from './image.ts'
import { getImage, saveImage } from './image-store.ts'
import { ACCEPTED_VIDEO_TYPES, deleteVideo, MAX_VIDEO_BYTES, saveVideo } from './video-store.ts'
import { classifyUrl, loadImageFromUrl, loadVideoFromUrl, urlToName, UrlLoadFailure, type UrlLoadError } from './url-load.ts'
import { exportColorScheme, parseColorScheme } from './color-scheme.ts'
import { APPEARANCE_PRESETS, BACKGROUND_BLUR_MAX, EMPHASIS_ALPHA_MAX, EMPHASIS_ALPHA_MIN, GLASS_BLUR_MAX } from './tokens.ts'
import { fetchCurrentWallpaper, fetchWallpaperInventory, loadWallpaperBlob } from './wallpaper-engine.ts'
import type { WallpaperInventoryItem } from '../wallpaper-engine/types.ts'
import type { AppearanceKey } from './locales.ts'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceCustomizerRow.module.css'

/** Injected business face: the row's whole write path. */
export interface AppearanceCustomizerInjected {
  /** Update one settings field (optimistic + debounced persistence). */
  set: (field: keyof AppearanceSettings, value: string | number | boolean) => void
  /** Set or clear the background image (null removes it). */
  setImage: (image: { url: string; imageDark: boolean } | null) => void
  /** Set or clear the background video by its IndexedDB record key. */
  setVideo: (key: string | null) => void
  /** Apply one shipped preset (colors only). */
  applyPreset: (id: string) => void
  /** Apply a batch of role colors in one write (scheme import). */
  applyColors: (colors: Partial<Record<AppearanceRole, string>>) => void
  /** Restore every setting to its stock value. */
  resetAll: () => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceCustomizerComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.appearance'> & AppearanceCustomizerInjected

/** Stock (light-mode) display color per role, shown when the role is unset
 * so the swatch always mirrors what the theme actually uses. */
const STOCK_ROLE_COLORS: Record<AppearanceRole, string> = {
  accent: '#4176e6',
  background: '#ffffff',
  panel: '#ffffff',
  input: '#ffffff',
  text: '#0f1115',
  border: '#d9dde3',
}

/** One color field row: native swatch + hex text input. */
function ColorField(props: { label: string; value: string; stock: string; onChange: (hex: string) => void; t: (key: AppearanceKey) => string }) {
  const { label, value, stock, onChange } = props
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
      <span className={css.colorSwatch} style={{ backgroundColor: value === '' ? stock : value }}>
        <input
          type="color"
          className={css.colorSwatchInput}
          aria-label={`${label} (color picker)`}
          value={value === '' ? stock : value}
          onChange={event => { onChange(event.target.value) }}
        />
      </span>
      <input
        type="text"
        className={css.colorHex}
        aria-label={`${label} (hex)`}
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
        aria-label={label}
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

/** Map a remote-load failure code to the localized message key. */
function urlErrorText(code: UrlLoadError, t: (key: AppearanceKey) => string): string {
  const key: AppearanceKey = `background.urlError.${code}` as AppearanceKey
  return t(key)
}

/** Map a local-read failure code to the localized message key ('read' keeps
 * the base key as the catch-all). */
function localErrorText(prefix: 'background.readError' | 'background.videoError', code: 'type' | 'size' | 'read', t: (key: AppearanceKey) => string): string {
  const key: AppearanceKey = (code === 'read' ? prefix : `${prefix}.${code}`) as AppearanceKey
  return t(key)
}

/** Thumbnail for the stored wallpaper. Legacy tokens are inline data URLs
 * (rendered directly); current tokens are IndexedDB keys resolved to object
 * URLs, revoked when the token changes or the row unmounts. */
function BackgroundThumb(props: { token: string }) {
  const { token } = props
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (token === '') {
      setSrc('')
      return
    }
    if (token.startsWith('data:')) {
      setSrc(token)
      return
    }
    let stale = false
    let objectUrl: string | undefined
    void getImage(token).then(blob => {
      if (blob === undefined || stale) return
      objectUrl = URL.createObjectURL(blob)
      setSrc(objectUrl)
    })
    return () => {
      stale = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [token])
  if (src === '') return null
  return <img className={css.thumb} src={src} alt="" />
}

/**
 * Render the appearance customizer row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceCustomizerRow({
  t, useStore, set, setImage, setVideo, applyPreset, applyColors, resetAll,
}: AppearanceCustomizerComponentProps) {
  const settings = useStore(s => s.settings)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<'type' | 'size' | 'read' | null>(null)
  const [videoReading, setVideoReading] = useState(false)
  const [videoError, setVideoError] = useState<'type' | 'size' | 'read' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [urlReading, setUrlReading] = useState(false)
  const [urlError, setUrlError] = useState<UrlLoadError | null>(null)
  const [weSyncing, setWeSyncing] = useState(false)
  const [weError, setWeError] = useState<string | null>(null)
  const [weSuccessTitle, setWeSuccessTitle] = useState<string | null>(null)
  const [weLibraryOpen, setWeLibraryOpen] = useState(false)
  const [weLibraryLoading, setWeLibraryLoading] = useState(false)
  const [weInventory, setWeInventory] = useState<WallpaperInventoryItem[]>([])
  const [weSearch, setWeSearch] = useState('')
  const [weFilter, setWeFilter] = useState<'all' | 'workshop' | 'default'>('all')
  const [schemeOpen, setSchemeOpen] = useState(false)
  const [schemeDraft, setSchemeDraft] = useState('')
  const [schemeError, setSchemeError] = useState(false)
  const [exported, setExported] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLInputElement | null>(null)

  const openWallpaperLibrary = async (): Promise<void> => {
    setWeLibraryOpen(true)
    setWeLibraryLoading(true)
    setWeError(null)
    try {
      const inventory = await fetchWallpaperInventory()
      const unique = Array.from(new Map(inventory.map(item => [item.id.toLowerCase(), item])).values())
      setWeInventory(unique)
    } catch {
      setWeInventory([])
    } finally {
      setWeLibraryLoading(false)
    }
  }

  const applyWallpaperPalette = (accentHex: string): void => {
    // The accent always follows the sampled hue; the derived surfaces fill
    // in only the roles the user has not customized, so a hand-tuned theme
    // is never overwritten.
    set('accent', accentHex)
    const palette = derivePalette(accentHex)
    for (const [role, hex] of Object.entries(palette)) {
      if (settings[role as AppearanceRole] === '') set(role as AppearanceRole, hex)
    }
    set('preset', 'custom')
  }

  const readFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    // Pre-classify the common failures so the hint can say why; the same
    // guards stay authoritative inside readImageFile.
    if (!file.type.startsWith('image/')) {
      setReadError('type')
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setReadError('size')
      return
    }
    setReading(true)
    setReadError(null)
    try {
      const payload = await prepareImage(file)
      // Store by reference; the settings only carry the record key.
      const key = await saveImage(payload.blob, file.name)
      setImage({ url: key, imageDark: payload.imageDark })
      // Auto-palette: the wallpaper's dominant hue becomes the accent color
      // and fills the untouched surface roles.
      if (payload.accent !== null) applyWallpaperPalette(payload.accent)
    } catch {
      setReadError('read')
    } finally {
      setReading(false)
    }
  }

  const readVideo = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    if (!file.type.startsWith('video/')) {
      setVideoError('type')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError('size')
      return
    }
    setVideoReading(true)
    setVideoError(null)
    try {
      // Replacing a video must drop the previous IndexedDB record, or the
      // store accumulates one entry per upload.
      const oldKey = settings.backgroundVideo
      if (oldKey !== '') void deleteVideo(oldKey)
      const key = await saveVideo(file, file.name)
      setVideo(key)
    } catch {
      setVideoError('read')
    } finally {
      setVideoReading(false)
    }
  }

  const removeVideo = (): void => {
    if (settings.backgroundVideo !== '') void deleteVideo(settings.backgroundVideo)
    setVideo(null)
  }

  const loadFromUrl = async (): Promise<void> => {
    const url = urlDraft.trim()
    if (url === '') return
    setUrlReading(true)
    setUrlError(null)
    try {
      if (classifyUrl(url) === 'video') {
        const file = await loadVideoFromUrl(url)
        setImage(null)
        const oldKey = settings.backgroundVideo
        if (oldKey !== '') void deleteVideo(oldKey)
        const key = await saveVideo(file, file.name)
        setVideo(key)
      } else {
        const payload = await loadImageFromUrl(url)
        if (settings.backgroundVideo !== '') {
          void deleteVideo(settings.backgroundVideo)
          setVideo(null)
        }
        const key = await saveImage(payload.blob, urlToName(url))
        setImage({ url: key, imageDark: payload.imageDark })
        if (payload.accent !== null) applyWallpaperPalette(payload.accent)
      }
      setUrlDraft('')
    } catch (error) {
      setUrlError(error instanceof UrlLoadFailure ? error.code : 'network')
    } finally {
      setUrlReading(false)
    }
  }

  const syncCurrentWallpaper = async (): Promise<void> => {
    setWeSyncing(true)
    setWeError(null)
    setWeSuccessTitle(null)
    try {
      const info = await fetchCurrentWallpaper()
      if (!info.success) {
        if (info.error === 'not_found') {
          setWeError(t('background.weNotFound'))
        } else {
          setWeError(t('background.weNoActive'))
        }
        return
      }

      const targetUrl = info.mediaUrl || info.previewUrl
      if (targetUrl) {
        let blob = await loadWallpaperBlob(targetUrl)
        if (blob.type.startsWith('video/')) {
          const key = await saveVideo(blob, info.title || 'wallpaper-engine.mp4')
          setVideo(key)
          setWeSuccessTitle(info.title || '')
        } else {
          if (!blob.type.startsWith('image/') && info.previewUrl && info.previewUrl !== targetUrl) {
            try {
              blob = await loadWallpaperBlob(info.previewUrl)
            } catch {
              // keep existing blob
            }
          }
          const file = new File([blob], `${info.title || 'wallpaper-engine'}.jpg`, {
            type: blob.type || 'image/jpeg',
          })
          const payload = await prepareImage(file)
          const key = await saveImage(payload.blob, file.name)
          setImage({ url: key, imageDark: payload.imageDark })
          if (payload.accent !== null) applyWallpaperPalette(payload.accent)
          setWeSuccessTitle(info.title || '')
        }
      }
    } catch {
      setWeError(t('background.weNotFound'))
    } finally {
      setWeSyncing(false)
    }
  }

  const filteredInventory = weInventory.filter(item => {
    const isWorkshop = /^\d+$/.test(item.id)
    if (weFilter === 'workshop' && !isWorkshop) return false
    if (weFilter === 'default' && isWorkshop) return false
    if (weSearch.trim() !== '') {
      const q = weSearch.toLowerCase().trim()
      return (
        item.title.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
      )
    }
    return true
  })

  const applyInventoryItem = async (item: WallpaperInventoryItem): Promise<void> => {
    setWeSyncing(true)
    setWeError(null)
    setWeSuccessTitle(null)
    try {
      const targetUrl = item.mediaUrl || item.previewUrl
      if (targetUrl) {
        let blob = await loadWallpaperBlob(targetUrl)
        if (blob.type.startsWith('video/')) {
          const key = await saveVideo(blob, item.title || 'wallpaper-engine.mp4')
          setVideo(key)
          setWeSuccessTitle(item.title)
        } else {
          if (!blob.type.startsWith('image/') && item.previewUrl && item.previewUrl !== targetUrl) {
            try {
              blob = await loadWallpaperBlob(item.previewUrl)
            } catch {
              // keep existing blob
            }
          }
          const file = new File([blob], `${item.title || 'wallpaper'}.jpg`, {
            type: blob.type || 'image/jpeg',
          })
          const payload = await prepareImage(file)
          const key = await saveImage(payload.blob, file.name)
          setImage({ url: key, imageDark: payload.imageDark })
          if (payload.accent !== null) applyWallpaperPalette(payload.accent)
          setWeSuccessTitle(item.title)
        }
      }
      setWeLibraryOpen(false)
    } catch {
      setWeError(t('background.readError'))
    } finally {
      setWeSyncing(false)
    }
  }

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void readFile(file)
  }
  const onPickVideo = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    void readVideo(file)
  }
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file?.type.startsWith('video/')) void readVideo(file)
    else void readFile(file)
  }
  const changeRole = (role: AppearanceRole, hex: string): void => {
    const normalized = hex.length === 4 ? formatHex(parseHex(hex)) : hex.toLowerCase()
    set(role, normalized)
    set('preset', 'custom')
  }
  const doExport = async (): Promise<void> => {
    setExported(false)
    try {
      await navigator.clipboard.writeText(exportColorScheme(settings))
      setExported(true)
    } catch {
      setSchemeError(true)
    }
  }
  const doImport = (): void => {
    setSchemeError(false)
    try {
      const colors = parseColorScheme(schemeDraft)
      applyColors(colors)
      setSchemeOpen(false)
      setSchemeDraft('')
    } catch {
      setSchemeError(true)
    }
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
                  stock={STOCK_ROLE_COLORS[role]}
                  onChange={hex => { changeRole(role, hex) }}
                  t={t}
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
                  <BackgroundThumb token={settings.backgroundImage} />
                  <button type="button" className={css.ghostButton} onClick={() => { setImage(null) }}>
                    {t('background.remove')}
                  </button>
                </>
              )}
              <input
                ref={videoRef}
                className={css.fileInput}
                type="file"
                accept={ACCEPTED_VIDEO_TYPES.join(',')}
                onChange={onPickVideo}
              />
              <button
                type="button"
                className={css.ghostButton}
                disabled={videoReading}
                onClick={() => { videoRef.current?.click() }}
              >
                {videoReading
                  ? t('background.reading')
                  : settings.backgroundVideo !== ''
                    ? t('background.replace')
                    : t('background.videoUpload')}
              </button>
              {settings.backgroundVideo !== '' && (
                <button type="button" className={css.ghostButton} onClick={removeVideo}>
                  {t('background.videoRemove')}
                </button>
              )}
            </div>

            {/* Wallpaper Engine integration container */}
            <div className={css.weContainer}>
              <div className={css.weActions}>
                <button
                  type="button"
                  className={clsx(css.ghostButton, css.accentButton)}
                  disabled={weSyncing}
                  onClick={() => { void syncCurrentWallpaper() }}
                >
                  {weSyncing ? t('background.weSyncing') : t('background.weSync')}
                </button>
                <button
                  type="button"
                  className={css.ghostButton}
                  onClick={() => { void openWallpaperLibrary() }}
                >
                  {t('background.weBrowse')}
                </button>
                {weSuccessTitle && (
                  <span className={clsx(css.hint, css.hintSuccess)}>
                    {t('background.weSynced')}: 《{weSuccessTitle}》
                  </span>
                )}
              </div>
              {weError && (
                <div className={css.hint} style={{ color: 'var(--dsw-static-state-danger-600, #ef4444)' }}>
                  {weError}
                </div>
              )}
              {weLibraryOpen && (
                <div className={css.weLibraryPanel}>
                  <div className={css.weLibraryHeader}>
                    <span>{t('background.weBrowseTitle')} ({filteredInventory.length}/{weInventory.length})</span>
                    <button
                      type="button"
                      className={css.ghostButton}
                      onClick={() => { setWeLibraryOpen(false) }}
                    >
                      {t('background.weClose')}
                    </button>
                  </div>
                  <div className={css.weLibraryControls}>
                    <input
                      type="text"
                      className={css.weSearchInput}
                      placeholder={t('background.weSearchPlaceholder')}
                      value={weSearch}
                      onChange={e => { setWeSearch(e.target.value) }}
                    />
                    <div className={css.weFilterRow}>
                      <button
                        type="button"
                        className={clsx(css.weFilterChip, weFilter === 'all' && css.weFilterChipActive)}
                        onClick={() => { setWeFilter('all') }}
                      >
                        {t('background.weFilterAll')}
                      </button>
                      <button
                        type="button"
                        className={clsx(css.weFilterChip, weFilter === 'workshop' && css.weFilterChipActive)}
                        onClick={() => { setWeFilter('workshop') }}
                      >
                        {t('background.weFilterWorkshop')}
                      </button>
                      <button
                        type="button"
                        className={clsx(css.weFilterChip, weFilter === 'default' && css.weFilterChipActive)}
                        onClick={() => { setWeFilter('default') }}
                      >
                        {t('background.weFilterDefault')}
                      </button>
                    </div>
                  </div>
                  {weLibraryLoading ? (
                    <div className={css.hint}>{t('background.weLoading')}</div>
                  ) : filteredInventory.length === 0 ? (
                    <div className={css.hint}>{t('background.weEmpty')}</div>
                  ) : (
                    <div className={css.weGrid}>
                      {filteredInventory.map(item => {
                        const isWorkshop = /^\d+$/.test(item.id)
                        return (
                          <div
                            key={item.id + item.folderPath}
                            className={css.weCard}
                            onClick={() => { void applyInventoryItem(item) }}
                          >
                            {item.previewUrl && (
                              <img
                                className={css.weCardThumb}
                                src={item.previewUrl}
                                alt={item.title}
                                loading="lazy"
                              />
                            )}
                            <div className={css.weCardTitle} title={`${item.title} (${item.id})`}>
                              {item.title}
                            </div>
                            <div className={css.weCardMeta}>
                              <span className={css.weCardTag}>{item.type}</span>
                              <span className={clsx(css.weCardSource, isWorkshop ? css.weCardWorkshop : css.weCardBuiltin)}>
                                {isWorkshop ? `#${item.id}` : t('background.weFilterDefault')}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={css.urlRow}>
              <input
                type="url"
                className={css.urlInput}
                aria-label={t('background.url')}
                placeholder={t('background.urlPlaceholder')}
                value={urlDraft}
                spellCheck={false}
                onChange={event => { setUrlDraft(event.target.value); setUrlError(null) }}
                onKeyDown={event => { if (event.key === 'Enter') void loadFromUrl() }}
              />
              <button
                type="button"
                className={css.ghostButton}
                disabled={urlReading || urlDraft.trim() === ''}
                onClick={() => { void loadFromUrl() }}
              >
                {urlReading ? t('background.urlLoading') : t('background.urlLoad')}
              </button>
            </div>
            <div className={css.hint}>
              {urlError !== null
                ? urlErrorText(urlError, t)
                : videoError !== null
                  ? localErrorText('background.videoError', videoError, t)
                  : settings.backgroundVideo !== ''
                    ? t('background.videoHint')
                    : readError !== null
                      ? localErrorText('background.readError', readError, t)
                      : t('background.dropHint')}
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
            <Slider
              label={t('background.scrim')}
              value={settings.scrim}
              min={0}
              max={1}
              step={0.05}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('scrim', value) }}
            />
            <div className={css.hint}>{t('background.scrimHint')}</div>
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
              label={t('surface.inputOpacity')}
              value={settings.inputAlpha}
              min={0}
              max={1}
              step={0.01}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('inputAlpha', value) }}
            />
            <Slider
              label={t('surface.codeOpacity')}
              value={settings.codeAlpha}
              min={0}
              max={1}
              step={0.01}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('codeAlpha', value) }}
            />
            <Slider
              label={t('surface.emphasis')}
              value={settings.emphasisAlpha}
              min={EMPHASIS_ALPHA_MIN}
              max={EMPHASIS_ALPHA_MAX}
              step={0.01}
              format={value => `${Math.round(value * 100)}%`}
              onChange={value => { set('emphasisAlpha', value) }}
            />
            <label className={css.checkRow}>
              <input
                type="checkbox"
                className={css.checkbox}
                checked={settings.sidebarOpaque}
                onChange={event => { set('sidebarOpaque', event.target.checked) }}
              />
              <span className={css.sliderLabel}>{t('surface.sidebar')}</span>
            </label>
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

          <div className={css.section}>
            <div className={css.sectionTitle}>{t('scheme.title')}</div>
            <div className={css.uploadRow}>
              <button type="button" className={css.ghostButton} onClick={() => { void doExport() }}>
                {t('scheme.export')}
              </button>
              <button
                type="button"
                className={css.ghostButton}
                onClick={() => { setSchemeOpen(value => !value) }}
              >
                {t('scheme.import')}
              </button>
              {exported && <span className={css.hint}>{t('scheme.exported')}</span>}
            </div>
            {schemeOpen && (
              <div className={css.schemePanel}>
                <textarea
                  className={css.schemeInput}
                  aria-label={t('scheme.import')}
                  rows={4}
                  placeholder={t('scheme.importPlaceholder')}
                  value={schemeDraft}
                  onChange={event => { setSchemeDraft(event.target.value); setSchemeError(false) }}
                />
                {schemeError && <div className={css.hint}>{t('scheme.invalid')}</div>}
                <div className={css.uploadRow}>
                  <button type="button" className={css.ghostButton} onClick={doImport}>
                    {t('scheme.apply')}
                  </button>
                  <button
                    type="button"
                    className={css.ghostButton}
                    onClick={() => { setSchemeOpen(false); setSchemeDraft(''); setSchemeError(false) }}
                  >
                    {t('scheme.cancel')}
                  </button>
                </div>
              </div>
            )}
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
