"use client";

import { useEffect, useState } from "react";
import { Button, CheckIcon, ProblemIcon, RetryIcon, SegmentedControl, Switch, TextLink } from "@/components/ui";
import { OfflineGate } from "@/components/shelf/OfflineGate";
import { useServerStatus } from "@/components/shelf/useServerStatus";
import { readReviewPlan, writeReviewPlan } from "@/lib/prefs";
import type { ThemePref } from "@/lib/theme";
import { useTheme } from "@/lib/useTheme";
import {
  GITHUB_URL,
  NOT_AVAILABLE,
  REVIEW_PLAN_NOTE,
  SETTINGS_COST,
  SETTINGS_CREDITS,
  SETTINGS_DATA,
  SETTINGS_LEAVES,
  SETTINGS_LEDE,
  SETTINGS_MODELS_NOTE,
  SETTINGS_SET_NOTE,
  SETTINGS_VERSION,
  STEP_NAMES,
  thinkingSent,
  limitsSettingsLine,
  REPLAY_WORKER_LINE,
} from "@/lib/words";
import styles from "./settings.module.css";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Use the system setting" },
];

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `row-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={styles.row} aria-labelledby={id}>
      <h2 id={id} className={styles.rowTitle}>
        {title}
      </h2>
      <div className={styles.rowBody}>{children}</div>
    </section>
  );
}

function Fact({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd className={ok ? undefined : styles.bad}>
        {ok ? <CheckIcon size={16} /> : <ProblemIcon size={16} />}
        {ok ? yes : no}
      </dd>
    </div>
  );
}

export function SettingsScreen() {
  const { status, refresh } = useServerStatus();
  const { pref, setPref } = useTheme();
  // The plan review choice is per viewer (localStorage). Until the viewer chooses, the server default decides.
  const [review, setReview] = useState<boolean | null>(null);
  useEffect(() => setReview(readReviewPlan()), []);
  const reviewOn = review ?? status?.plan_review_default ?? false;

  return (
    <main id="main" className={styles.main}>
      {status === null ? <OfflineGate onRetry={refresh} /> : null}
      <h1 className={styles.h1}>Settings and about</h1>
      <p className={styles.lede}>{SETTINGS_LEDE}</p>

      <Row title="Theme">
        <SegmentedControl name="theme" legend="Theme" options={THEME_OPTIONS} value={pref} onChange={setPref} />
        <p className={styles.small}>The reader keeps its own dark room in every theme.</p>
      </Row>

      <Row title="Plan review">
        <Switch
          label="Review the plan before drawing"
          checked={reviewOn}
          onChange={(e) => {
            setReview(e.target.checked);
            writeReviewPlan(e.target.checked);
          }}
        />
        <p className={styles.small}>{REVIEW_PLAN_NOTE}</p>
        <p className={styles.small}>This choice is kept in this browser only.</p>
      </Row>

      <Row title="Server status">
        {status === undefined ? <p className={styles.small}>Checking the server</p> : null}
        {status === null ? (
          <dl className={styles.facts}>
            <Fact label="PanelSummary server" ok={false} yes="" no="Not reachable" />
          </dl>
        ) : status ? (
          <dl className={styles.facts}>
            <Fact label="PanelSummary server" ok yes="Reachable" no="" />
            <Fact label="Job runner" ok={status.runner.running} yes="Running" no="Not running" />
            {status.worker.reachable && status.worker.replay ? (
              <Fact label="Drawing service" ok yes={REPLAY_WORKER_LINE} no="" />
            ) : (
              <Fact label="Drawing service key" ok={status.worker.reachable && status.worker.key_set} yes="Set" no={status.worker.reachable ? "Not set" : "Drawing service not reachable"} />
            )}
          </dl>
        ) : null}
        <p className={styles.small}>{SETTINGS_SET_NOTE}</p>
        <DisabledAction label="Check again" icon={<RetryIcon size={20} />} />
      </Row>

      <Row title="Models for each step">
        {status ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Model</th>
                <th scope="col">Thinking (sent)</th>
              </tr>
            </thead>
            <tbody>
              {status.models.map((m) => (
                <tr key={m.step}>
                  <th scope="row">{STEP_NAMES[m.step] ?? m.step}</th>
                  <td>{m.model}</td>
                  <td>
                    {thinkingSent(m.model, m.thinking)}
                    {thinkingSent(m.model, m.thinking) !== m.thinking ? <span className={styles.asked}>Asked: {m.thinking}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.small}>The models are shown when the server can be reached.</p>
        )}
        <p className={styles.small}>{SETTINGS_MODELS_NOTE}</p>
        <DisabledAction label="Change models" />
      </Row>

      <Row title="Limits">{status ? <p>{limitsSettingsLine({ ...status.limits })}</p> : <p>A book can be up to 60 MB, 75 PDF pages and 17,500 words.</p>}</Row>
      <Row title="Where the data is">
        <p>{SETTINGS_DATA}</p>
      </Row>
      <Row title="What leaves your computer">
        <p>{SETTINGS_LEAVES}</p>
      </Row>
      <Row title="Cost">
        <p>{SETTINGS_COST}</p>
      </Row>
      <Row title="Version">
        <p>{SETTINGS_VERSION}</p>
        <p>
          <TextLink href={GITHUB_URL} rel="noopener noreferrer">
            PanelSummary on GitHub
          </TextLink>
        </p>
      </Row>
      <Row title="Credits and licences">
        <p>{SETTINGS_CREDITS}</p>
      </Row>
    </main>
  );
}

/** A control that is off, with the reason written beside it (never only in a tooltip). */
function DisabledAction({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className={styles.off}>
      <Button variant="secondary" size="sm" disabled why={NOT_AVAILABLE} iconStart={icon}>
        {label}
      </Button>
    </div>
  );
}
