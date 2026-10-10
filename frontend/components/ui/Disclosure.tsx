"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  /** The button text, for example "Technical detail". */
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** A button that shows or hides a block of detail. Closed by default. */
export function Disclosure({ label, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={styles.root}>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className={styles.label}>{label}</span>
        {open ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
      </button>
      <div id={id} className={styles.panel} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
