import { useId } from "react";
import type { ReactNode } from "react";
import { CheckIcon } from "./icons";
import { cx } from "./cx";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** An option that cannot be chosen shows this reason as a second line. */
  disabledReason?: string;
}

export interface SegmentedControlProps<V extends string = string> {
  /** The group name for the radio inputs. */
  name: string;
  /** The accessible name of the group (for example "Theme"). */
  legend: string;
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/** One choice out of a few. Real radio inputs: arrow keys work. The chosen option has a check as well as the fill. */
export function SegmentedControl<V extends string = string>({ name, legend, options, value, onChange, className }: SegmentedControlProps<V>) {
  const uid = useId();
  return (
    <div role="radiogroup" aria-label={legend} className={cx(styles.group, className)}>
      {options.map((o) => {
        const chosen = o.value === value;
        const off = Boolean(o.disabledReason);
        const reasonId = `${uid}-${o.value}-why`;
        return (
          <label key={o.value} className={cx(styles.option, chosen && styles.chosen, off && styles.off)}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={o.value}
              checked={chosen}
              disabled={off}
              aria-describedby={off ? reasonId : undefined}
              onChange={() => onChange(o.value)}
            />
            <span className={styles.row}>
              {chosen ? <CheckIcon size={16} strokeWidth={2.75} /> : null}
              {o.label}
            </span>
            {off ? (
              <span id={reasonId} className={styles.reason}>
                {o.disabledReason}
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
