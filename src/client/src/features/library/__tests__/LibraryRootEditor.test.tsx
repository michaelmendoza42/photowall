import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryRootEditor } from '../LibraryRootEditor.js';

describe('LibraryRootEditor', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (root && host) {
      await act(async () => {
        root?.unmount();
      });
    }
    host?.remove();
    host = null;
    root = null;
  });

  async function renderEditor(props: ComponentProps<typeof LibraryRootEditor>) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<LibraryRootEditor {...props} />);
    });

    const getInput = () => {
      const input = host?.querySelector<HTMLInputElement>('input[name="library-root-path"]');
      if (!input) {
        throw new Error('Expected library root input');
      }
      return input;
    };

    const getButton = (text: string) => {
      const buttons = [...(host?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const match = buttons.find((button) => button.textContent?.match(new RegExp(text, 'i')));
      if (!match) {
        throw new Error(`Expected button matching ${text}`);
      }
      return match;
    };

    return { getInput, getButton };
  }

  it('submits the edited root path and exposes a named input for forms', async () => {
    const onSubmit = vi.fn();
    const { getInput, getButton } = await renderEditor({
      currentRoot: '/photos',
      onSubmit,
    });

    const input = getInput();
    expect(input.getAttribute('name')).toBe('library-root-path');

    await act(async () => {
      input.value = '/photos/2024';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await act(async () => {
      getButton('save root').click();
    });

    expect(onSubmit).toHaveBeenCalledWith('/photos/2024');
  });

  it('uses the local picker path when the browser exposes one', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => ({ path: '/mounted/photos' })));

    const { getInput, getButton } = await renderEditor({
      currentRoot: '',
      onSubmit: vi.fn(),
    });

    await act(async () => {
      getButton('use local picker').click();
    });

    expect(getInput().value).toBe('/mounted/photos');
  });

  it('explains the limitation when the picker cannot reveal a path', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => ({ name: 'Photos' })));

    const { getButton } = await renderEditor({
      currentRoot: '',
      onSubmit: vi.fn(),
    });

    await act(async () => {
      getButton('use local picker').click();
    });

    expect(host?.textContent).toContain('cannot reveal the path the server needs');
  });
});
