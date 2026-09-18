// @vitest-environment jsdom
/** Appearance customizer row: disclosure, preset chips, color fields, sliders,
 * image upload via drop, and the reset action — all through the injected face. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { AppearanceCustomizerRow, type AppearanceCustomizerComponentProps } from '../src/client/AppearanceCustomizerRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
// Pulls the settings.appearance LocaleNamespaceMap augmentation into the program.
import type {} from '../src/client/index.ts'

vi.mock('../src/client/image.ts', () => ({
  ACCEPTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_INPUT_BYTES: 200 * 1024 * 1024,
  prepareImage: vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/png' }), imageDark: true, accent: null })),
}))

vi.mock('../src/client/image-store.ts', () => ({
  saveImage: vi.fn(async () => 'img-key-1'),
  getImage: vi.fn(async () => undefined),
  deleteImage: vi.fn(async () => {}),
}))

vi.mock('../src/client/video-store.ts', () => ({
  ACCEPTED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg', '.mp4', '.webm', '.mov', '.mkv', '.m4v'],
  MAX_VIDEO_BYTES: 50 * 1024 * 1024,
  isVideoFile: (file: File): boolean =>
    file.type.startsWith('video/') || /\.(mp4|webm|ogv|ogg|mov|mkv|m4v)$/i.test(file.name),
  saveVideo: vi.fn(async () => 'video-key-1'),
  deleteVideo: vi.fn(async () => {}),
}))

afterEach(cleanup)

const COPY: Record<string, string> = {
  'row.title': 'Appearance',
  'mode.light': 'Light Mode',
  'mode.dark': 'Dark Mode',
  'mode.active': 'Active',
  'presets.title': 'Presets',
  'preset.default': 'Default',
  'preset.midnight': 'Midnight',
  'colors.title': 'Theme colors',
  'color.accent': 'Accent',
  'color.background': 'Background color',
  'background.title': 'Background',
  'background.upload': 'Upload image',
  'background.remove': 'Remove image',
  'background.dropHint': 'drop an image here',
  'background.reading': 'Reading…',
  'background.replace': 'Replace image',
  'background.videoUpload': 'Upload video',
  'background.videoReplace': 'Replace video',
  'background.videoRemove': 'Remove video',
  'background.videoError': 'Could not read that video, try another one',
  'background.videoError.type': 'That is not a video file',
  'background.videoHint': 'video plays muted in a loop',
  'background.videoUnsupported': 'this browser cannot play that codec',
  'background.opacity': 'Image opacity',
  'background.blur': 'Background blur',
  'background.scrim': 'Background scrim',
  'background.scrimHint': 'Raise the scrim to keep text readable',
  'surface.title': 'Interface',
  'surface.opacity': 'Panel opacity',
  'surface.glass': 'Glass blur',
  'surface.hint': 'Lower panel opacity',
  'scheme.title': 'Color scheme',
  'scheme.export': 'Export colors',
  'scheme.import': 'Import colors',
  'scheme.importPlaceholder': 'Paste an exported color scheme JSON…',
  'scheme.apply': 'Apply',
  'scheme.cancel': 'Cancel',
  'scheme.invalid': 'Invalid color scheme JSON',
  'scheme.exported': 'Copied to clipboard',
  'actions.reset': 'Reset to default',
  'actions.resetMode': 'Reset current mode',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

function mount() {
  const store = createAppearanceRowStore().create()
  const set = vi.fn()
  const setModeRole = vi.fn((mode, role, hex) => {
    store.actions.patch({ [mode]: { ...store.getSnapshot().settings[mode], [role]: hex, preset: 'custom' } })
  })
  const setImage = vi.fn()
  const setVideo = vi.fn()
  const applyPreset = vi.fn()
  const applyColors = vi.fn()
  const resetAll = vi.fn()
  const resetMode = vi.fn((mode) => {
    const cleared = { accent: '', background: '', panel: '', input: '', text: '', border: '', preset: 'default' }
    store.actions.patch({ [mode]: cleared, preset: 'default' })
  })
  const props: AppearanceCustomizerComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    set,
    setModeRole,
    setImage,
    setVideo,
    applyPreset,
    applyColors,
    resetAll,
    resetMode,
  }
  render(<AppearanceCustomizerRow {...props} />)
  return { store, set, setModeRole, setImage, setVideo, applyPreset, applyColors, resetAll, resetMode }
}

function openRow() {
  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
}

describe('AppearanceCustomizerRow', () => {
  it('starts collapsed and expands on the disclosure toggle', () => {
    mount()
    expect(screen.queryByText('Presets')).toBeNull()
    openRow()
    expect(screen.getByText('Presets')).toBeDefined()
    expect(screen.getByText('Theme colors')).toBeDefined()
    expect(screen.getByText('Background')).toBeDefined()
    expect(screen.getByText('Interface')).toBeDefined()
  })

  it('preset chips drive applyPreset and the selected chip follows the store', () => {
    const b = mount()
    openRow()
    fireEvent.click(screen.getByRole('tab', { name: /Dark Mode/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Midnight' }))
    expect(b.applyPreset).toHaveBeenCalledWith('midnight')
    act(() => { b.store.actions.patch({ preset: 'midnight' }) })
    expect(screen.getByRole('button', { name: 'Midnight' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a color picker change writes the role and marks the preset custom', () => {
    const b = mount()
    openRow()
    const accent = document.querySelector('input[type="color"]')
    expect(accent).not.toBeNull()
    fireEvent.change(accent as HTMLInputElement, { target: { value: '#ff0000' } })
    expect(b.setModeRole).toHaveBeenCalledWith('light', 'accent', '#ff0000')
  })

  it('shows the stock blue for an empty accent in both the swatch and picker', () => {
    const b = mount()
    act(() => { b.store.actions.patch({ accent: '' }) })
    openRow()
    const accent = document.querySelector('input[type="color"]') as HTMLInputElement
    expect(accent.value).toBe('#4176e6')
    expect(accent.parentElement?.getAttribute('style')).toBe('background-color: rgb(65, 118, 230);')
  })

  it('a hex text commit normalizes three-digit input', () => {
    const b = mount()
    openRow()
    const hex = document.querySelector('input[type="text"]')
    expect(hex).not.toBeNull()
    fireEvent.change(hex as HTMLInputElement, { target: { value: '#F0A' } })
    fireEvent.keyDown(hex as HTMLInputElement, { key: 'Enter' })
    expect(b.setModeRole).toHaveBeenCalledWith('light', 'accent', '#ff00aa')
  })

  it('sliders write their settings fields', () => {
    const b = mount()
    openRow()
    const sliders = document.querySelectorAll('input[type="range"]')
    fireEvent.change(sliders[0]!, { target: { value: '0.5' } })
    expect(b.set).toHaveBeenCalledWith('backgroundOpacity', 0.5)
    fireEvent.change(sliders[1]!, { target: { value: '10' } })
    expect(b.set).toHaveBeenCalledWith('backgroundBlur', 10)
    fireEvent.change(sliders[2]!, { target: { value: '0.4' } })
    expect(b.set).toHaveBeenCalledWith('scrim', 0.4)
  })

  it('shows the preview and remove action once an image is set', () => {
    const b = mount()
    act(() => { b.store.actions.patch({ backgroundImage: 'data:image/jpeg;base64,AAAA' }) })
    openRow()
    expect(screen.getByText('Remove image')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(b.setImage).toHaveBeenCalledWith(null)
  })

  it('reads a dropped file through the injected setImage', async () => {
    const b = mount()
    openRow()
    const hint = screen.getByText('drop an image here')
    if (hint === undefined) throw new Error('missing drop hint')
    const section = hint.parentElement
    if (section === null) throw new Error('missing background section')
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    Object.defineProperty(file, 'type', { value: 'image/png' })
    fireEvent.drop(section, { dataTransfer: { files: [file] } })
    await act(async () => { await Promise.resolve() })
    expect(b.setImage).toHaveBeenCalledWith({ url: 'img-key-1', imageDark: true })
  })

  it('explains a background video the browser refused to decode', () => {
    const b = mount()
    act(() => { b.store.actions.patch({ backgroundVideo: 'video-key' }) })
    openRow()
    // A stored video normally shows the generic hint...
    expect(screen.getByText('video plays muted in a loop')).toBeDefined()
    // ...which the applier's decode failure replaces.
    act(() => { b.store.actions.setVideoPlaybackError(true) })
    expect(screen.getByText('this browser cannot play that codec')).toBeDefined()
    expect(screen.queryByText('video plays muted in a loop')).toBeNull()
    act(() => { b.store.actions.setVideoPlaybackError(false) })
    expect(screen.getByText('video plays muted in a loop')).toBeDefined()
  })

  it('reads a dropped video through the injected setVideo', async () => {
    const b = mount()
    openRow()
    const hint = screen.getByText('drop an image here')
    const section = hint.parentElement
    if (section === null) throw new Error('missing background section')
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    fireEvent.drop(section, { dataTransfer: { files: [file] } })
    await act(async () => { await Promise.resolve() })
    expect(b.setVideo).toHaveBeenCalledWith('video-key-1')
  })

  it('routes an empty-MIME container like .mkv to the video pipeline', async () => {
    const b = mount()
    openRow()
    const hint = screen.getByText('drop an image here')
    const section = hint.parentElement
    if (section === null) throw new Error('missing background section')
    const file = new File(['x'], 'clip.mkv', { type: '' })
    fireEvent.drop(section, { dataTransfer: { files: [file] } })
    await act(async () => { await Promise.resolve() })
    expect(b.setVideo).toHaveBeenCalledWith('video-key-1')
  })

  it('tells the user when a picked file is not a video at all', async () => {
    const b = mount()
    openRow()
    const input = document.querySelector('input[accept^="video/mp4"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing video input')
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    Object.defineProperty(input, 'files', { value: [file] })
    await act(async () => { fireEvent.change(input); await Promise.resolve() })
    expect(screen.getByText('That is not a video file')).toBeDefined()
  })

  it('never renders a blank hint when an error message key is missing', async () => {
    const b = mount()
    openRow()
    const saved = COPY['background.videoError.type']
    delete COPY['background.videoError.type']
    try {
      const input = document.querySelector('input[accept^="video/mp4"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('missing video input')
      const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
      Object.defineProperty(input, 'files', { value: [file] })
      await act(async () => { fireEvent.change(input); await Promise.resolve() })
      // Falls back to the catch-all message instead of rendering nothing.
      expect(screen.getByText('Could not read that video, try another one')).toBeDefined()
    } finally {
      COPY['background.videoError.type'] = saved
    }
  })

  it('shows the video remove action once a video is set', () => {
    const b = mount()
    act(() => { b.store.actions.patch({ backgroundVideo: 'video-key-1' }) })
    openRow()
    expect(screen.getByRole('button', { name: 'Remove video' })).toBeDefined()
    // The upload button flips to its video-specific replace label...
    expect(screen.getByRole('button', { name: 'Replace video' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Upload video' })).toBeNull()
    // ...and the image controls stay out of the way (image and video are exclusive).
    expect(screen.queryByRole('button', { name: 'Replace image' })).toBeNull()
  })

  it('reset drives the injected resetAll', () => {
    const b = mount()
    openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(b.resetAll).toHaveBeenCalled()
  })

  it('scheme import parses the pasted JSON and applies colors in one batch', () => {
    const b = mount()
    openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Import colors' }))
    const textarea = screen.getByPlaceholderText('Paste an exported color scheme JSON…')
    fireEvent.change(textarea, {
      target: { value: JSON.stringify({ version: 1, colors: { accent: '#112233', background: '#445566' } }) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(b.applyColors).toHaveBeenCalledWith({ accent: '#112233', background: '#445566' })
  })

  it('scheme import keeps the panel open and flags invalid JSON', () => {
    const b = mount()
    openRow()
    fireEvent.click(screen.getByRole('button', { name: 'Import colors' }))
    const textarea = screen.getByPlaceholderText('Paste an exported color scheme JSON…')
    fireEvent.change(textarea, { target: { value: '{not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(b.applyColors).not.toHaveBeenCalled()
    expect(screen.getByText('Invalid color scheme JSON')).toBeDefined()
    expect(screen.getByPlaceholderText('Paste an exported color scheme JSON…')).toBeDefined()
  })

  it('mode selector tabs switch between light and dark presets and palettes', () => {
    mount()
    openRow()
    // By default in light mode, light presets like Dawn are visible
    expect(screen.getByRole('button', { name: 'preset.dawn' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Midnight' })).toBeNull()

    // Switch to dark mode tab
    fireEvent.click(screen.getByRole('tab', { name: /Dark Mode/ }))
    expect(screen.getByRole('button', { name: 'Midnight' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'preset.dawn' })).toBeNull()
  })

  it('reset-mode button restores the active mode swatches to stock', () => {
    const b = mount()
    openRow()
    // Pick a custom accent in light mode.
    const accent = document.querySelector('input[type="color"]') as HTMLInputElement
    fireEvent.change(accent, { target: { value: '#ff0000' } })
    expect(accent.parentElement?.getAttribute('style')).toBe('background-color: rgb(255, 0, 0);')

    // Reset the current (light) mode.
    fireEvent.click(screen.getByRole('button', { name: 'Reset current mode' }))
    expect(b.resetMode).toHaveBeenCalledWith('light')
    // Swatch falls back to the stock blue once the role is cleared.
    expect(accent.parentElement?.getAttribute('style')).toBe('background-color: rgb(65, 118, 230);')
  })
})
