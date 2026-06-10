import { useEffect, useId, useState } from 'react';

type DirectoryHandleLike = {
  name?: string;
  path?: string;
};

export interface LibraryRootEditorProps {
  currentRoot: string;
  onSubmit: (nextRoot: string) => void;
  pending?: boolean;
  errorMessage?: string | null;
  title?: string;
  hint?: string;
  submitLabel?: string;
}

export function LibraryRootEditor({
  currentRoot,
  onSubmit,
  pending = false,
  errorMessage = null,
  title = 'Library root',
  hint = 'Enter the server-visible path for the photo library root.',
  submitLabel = 'Save root',
}: LibraryRootEditorProps): JSX.Element {
  const [draftRoot, setDraftRoot] = useState(currentRoot);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const inputId = useId();
  const hintId = useId();
  const noteId = useId();
  const errorId = useId();

  useEffect(() => {
    setDraftRoot(currentRoot);
  }, [currentRoot]);

  const describedBy = [
    hintId,
    pickerMessage ? noteId : null,
    errorMessage ? errorId : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  async function handleUseLocalPicker(): Promise<void> {
    const picker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
      }
    ).showDirectoryPicker;

    if (!picker) {
      setPickerMessage(
        'Local picker is unavailable here. Paste the server-visible root path manually.',
      );
      return;
    }

    try {
      const handle = await picker();
      const pickedPath = typeof handle.path === 'string' ? handle.path.trim() : '';
      if (pickedPath.length > 0) {
        setDraftRoot(pickedPath);
        setPickerMessage(null);
        return;
      }
      setPickerMessage(
        'This browser can choose a folder but cannot reveal the path the server needs. Paste the server-visible path manually.',
      );
    } catch {
      // Picker cancel: keep the current draft untouched.
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(draftRoot.trim());
  }

  return (
    <form
      className="library-root-editor"
      onSubmit={handleSubmit}
      aria-busy={pending}
    >
      <div className="library-root-editor__header">
        <h3 className="library-root-editor__title">{title}</h3>
        <button
          type="button"
          className="controls__link"
          onClick={() => void handleUseLocalPicker()}
        >
          Use local picker
        </button>
      </div>
      <p id={hintId} className="library-root-editor__hint">{hint}</p>
      <label className="library-root-editor__field" htmlFor={inputId}>
        <span className="library-root-editor__label">Library root path</span>
        <input
          id={inputId}
          name="library-root-path"
          type="text"
          className="library-root-editor__input"
          value={draftRoot}
          onChange={(event) => {
            setDraftRoot(event.target.value);
            if (pickerMessage) setPickerMessage(null);
          }}
          placeholder="/photos or /path/to/library"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={describedBy}
        />
      </label>
      {pickerMessage && (
        <p id={noteId} className="library-root-editor__note">
          {pickerMessage}
        </p>
      )}
      {errorMessage && (
        <p id={errorId} className="library-root-editor__error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="library-root-editor__actions">
        <button
          type="submit"
          className="controls__create-button"
          disabled={pending || draftRoot.trim().length === 0}
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
