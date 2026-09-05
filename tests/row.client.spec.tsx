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
  const setImage = vi.fn()
  const setVideo = vi.fn()
  const applyPreset = vi.fn()
  const applyColors = vi.fn()
  const resetAll = vi.fn()
  const props: AppearanceCustomizerComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    set,
    setImage,
    setVideo,
    applyPreset,
    applyColors,
    resetAll,
  }
  render(<AppearanceCustomizerRow {...props} />)
  return { store, set, setImage, setVideo, applyPreset, applyColors, resetAll }
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
    expect(b.set).toHaveBeenCalledWith('accent', '#ff0000')
    expect(b.set).toHaveBeenCalledWith('preset', 'custom')
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
    expect(b.set).toHaveBeenCalledWith('accent', '#ff00aa')
    expect(b.set).toHaveBeenCalledWith('preset', 'custom')
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
})
