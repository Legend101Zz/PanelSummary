"use client";

import { useId, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ProblemIcon, UploadIcon } from "./icons";
import { cx } from "./cx";
import styles from "./DropZone.module.css";

export interface DropZoneProps {
  /** Called with the first file, from a drop or from the chooser. `extra` is how many more files were dropped (they are ignored). */
  onFile: (file: File, info: { extra: number }) => void;
  /** An error block at the top. It replaces the zone's text; the chooser stays in the page. */
  error?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** A quiet line under the title, before the button ("or choose it from your computer"). */
  subtitle?: string;
  buttonLabel?: string;
  /** Buttons that come before "Choose a PDF" in the error state (a primary "Try again"). "Choose a PDF" then turns secondary. */
  errorActions?: ReactNode;
  /** The hint under the button. Default says what a PDF must be. */
  hint?: ReactNode;
  accept?: string;
  className?: string;
}

const DEFAULT_HINT = "Selectable text, not a scan. English. Up to 60 MB, 75 PDF pages and 17,500 words.";

/**
 * The drop place: the only dashed edge besides the "Add a book" tile. A REAL <input type="file"> sits inside
 * (visually hidden), so a click, a keyboard press and a test script all use it. Drag-over: 3 px dashed action
 * edge on the action wash and "Drop to add". Several files: the first is used and the zone says so.
 */
export function DropZone({ onFile, error, disabled = false, title = "Drop a PDF here", subtitle, buttonLabel = "Choose a PDF", hint = DEFAULT_HINT, accept = "application/pdf", className, errorActions }: DropZoneProps) {
  const [over, setOver] = useState(false);
  const [extra, setExtra] = useState(0);
  const depth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteId = useId();

  const take = (files: FileList | File[] | null | undefined) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setExtra(list.length - 1);
    onFile(list[0], { extra: list.length - 1 });
  };
  const onDragEnter = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDragOver = (e: DragEvent) => {
    if (disabled) return;
    e.preventDefault();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    if (disabled) return;
    take(e.dataTransfer?.files);
  };

  const chooser = (
    <label className={cx(styles.choose, error && errorActions ? styles.chooseSecondary : undefined)} aria-disabled={disabled || undefined}>
      <input
        ref={inputRef}
        className={styles.input}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={extra > 0 ? noteId : undefined}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
      <UploadIcon size={20} />
      {buttonLabel}
    </label>
  );
  const extraNote = extra > 0 ? (
    <p id={noteId} className={styles.extra} role="status">
      {`You dropped ${extra + 1} files. Only the first one is added.`}
    </p>
  ) : null;

  return (
    <div className={cx(styles.zone, over && styles.over, error ? styles.hasError : undefined, className)} onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      {error ? (
        <>
          <div className={styles.errorBlock} role="alert">
            <ProblemIcon size={20} />
            <span>{error}</span>
          </div>
          <div className={styles.errorBody}>
            {errorActions ? (
              <div className={styles.errorActions}>
                {errorActions}
                {chooser}
              </div>
            ) : (
              chooser
            )}
            {extraNote}
            <p className={styles.hint}>{hint}</p>
          </div>
        </>
      ) : (
        <>
          <UploadIcon className={styles.icon} size={24} />
          <p className={styles.title}>{over ? "Drop to add" : title}</p>
          {subtitle && !over ? <p className={styles.sub}>{subtitle}</p> : null}
          {chooser}
          {extraNote}
          <p className={styles.hint}>{over ? "If you drop more than one file, only the first is added." : hint}</p>
        </>
      )}
    </div>
  );
}
