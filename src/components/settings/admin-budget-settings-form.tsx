"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import type { OrganizationSettings } from "@/lib/types";
import {
  syncAmountWarningFromMargin,
  targetCostPct,
  validateBudgetThresholds,
} from "@/lib/domain/org-settings";
import { cn } from "@/lib/cn";

function ThresholdPreview({
  warningPct,
  overPct,
  labels,
}: {
  warningPct: number;
  overPct: number;
  labels: { healthy: string; warning: string; over: string };
}) {
  const blueEnd = Math.max(0, Math.min(100, warningPct));
  const orangeEnd = Math.max(blueEnd, Math.min(100, overPct));
  const blueW = blueEnd;
  const orangeW = Math.max(0, orangeEnd - blueEnd);
  const redW = Math.max(0, 100 - orangeEnd);
  const segments = [
    { key: "healthy", width: blueW, className: "bg-[var(--accent)]", title: labels.healthy },
    { key: "warning", width: orangeW, className: "bg-[var(--status-near)]", title: labels.warning },
    { key: "over", width: redW, className: "bg-[var(--status-over)]", title: labels.over },
  ].filter((s) => s.width > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
        {segments.map((s, idx) => (
          <div
            key={s.key}
            className={cn(
              "h-full shrink-0",
              s.className,
              segments.length === 1 && "rounded-full",
              segments.length > 1 && idx === 0 && "rounded-l-full",
              segments.length > 1 &&
                idx === segments.length - 1 &&
                "rounded-r-full",
            )}
            style={{ width: `${s.width}%` }}
            title={s.title}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          {labels.healthy}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--status-near)]" />
          {labels.warning}
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--status-over)]" />
          {labels.over}
        </span>
      </div>
    </div>
  );
}

export function AdminBudgetSettingsForm({
  initial,
  onSave,
}: {
  initial: OrganizationSettings;
  onSave: (next: OrganizationSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const hoursErr = validateBudgetThresholds({
    warningPct: draft.hours_warning_pct,
    overPct: draft.hours_over_pct,
  });
  const amountErr = validateBudgetThresholds({
    warningPct: draft.amount_warning_pct,
    overPct: draft.amount_over_pct,
  });
  const capacityErr =
    draft.capacity_low_max_pct >= 0 &&
    draft.capacity_near_pct > draft.capacity_low_max_pct &&
    draft.capacity_over_pct > draft.capacity_near_pct
      ? null
      : "Capacity thresholds must increase: low < near < over.";

  const invalid = Boolean(hoursErr || amountErr || capacityErr);

  async function save() {
    if (invalid) {
      setError(hoursErr || amountErr || capacityErr || "Invalid settings");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function setMargin(margin: number) {
    const target_profit_margin_pct = Math.min(99, Math.max(0, margin));
    setDraft((d) => ({
      ...d,
      target_profit_margin_pct,
      amount_warning_pct: syncAmountWarningFromMargin(target_profit_margin_pct),
    }));
  }

  const healthyCost = targetCostPct(draft);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Default Rates</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Used when a person has no cost rate, or an hourly project has no bill
          rate.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default Cost Rate ($/hr)">
            <input
              type="number"
              min={0}
              step={1}
              className={inputClass}
              value={draft.default_cost_rate}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  default_cost_rate: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Default Bill Rate ($/hr)">
            <input
              type="number"
              min={0}
              step={1}
              className={inputClass}
              value={draft.default_bill_rate}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  default_bill_rate: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Hourly Project Health</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Based on schedule hours used vs the hours budget.
        </p>
        <ThresholdPreview
          warningPct={draft.hours_warning_pct}
          overPct={draft.hours_over_pct}
          labels={{
            healthy: `Healthy 0–${Math.max(0, draft.hours_warning_pct - 0.01).toFixed(0)}%`,
            warning: `Warning ${draft.hours_warning_pct}–${draft.hours_over_pct}%`,
            over: `Over >${draft.hours_over_pct}%`,
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warning at (% hours)">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              className={inputClass}
              value={draft.hours_warning_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  hours_warning_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Over at (% hours)">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              className={inputClass}
              value={draft.hours_over_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  hours_over_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
        {hoursErr ? (
          <p className="text-xs text-[var(--status-over)]">{hoursErr}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Fixed Fee Project Health</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Burn is labor cost (hours × cost rate) + expenses vs the fixed fee.
          Target profit margin {draft.target_profit_margin_pct}% means healthy
          cost burn stays at or below {healthyCost}%.
        </p>
        <ThresholdPreview
          warningPct={draft.amount_warning_pct}
          overPct={draft.amount_over_pct}
          labels={{
            healthy: `On target 0–${healthyCost}%`,
            warning: `Eroding ${draft.amount_warning_pct}–${Math.max(0, draft.amount_over_pct - 0.01).toFixed(0)}%`,
            over: `Over ≥${draft.amount_over_pct}%`,
          }}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Target Profit Margin (%)">
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              className={inputClass}
              value={draft.target_profit_margin_pct}
              onChange={(e) => setMargin(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Warning at (% of fee)">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              className={inputClass}
              value={draft.amount_warning_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  amount_warning_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Over at (% of fee)">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              className={inputClass}
              value={draft.amount_over_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  amount_over_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
        {amountErr ? (
          <p className="text-xs text-[var(--status-over)]">{amountErr}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Capacity Utilization</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Color breakpoints for people utilization heatmaps and schedule
          capacity.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Low below (%)">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className={inputClass}
              value={draft.capacity_low_max_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  capacity_low_max_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Near at (%)">
            <input
              type="number"
              min={0}
              max={200}
              step={1}
              className={inputClass}
              value={draft.capacity_near_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  capacity_near_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
          <Field label="Over at (%)">
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              className={inputClass}
              value={draft.capacity_over_pct}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  capacity_over_pct: Number(e.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
        {capacityErr ? (
          <p className="text-xs text-[var(--status-over)]">{capacityErr}</p>
        ) : null}
      </section>

      {error ? (
        <p className="text-sm text-[var(--status-over)]">{error}</p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          className={cn(buttonClass(), invalid && "opacity-60")}
          disabled={busy || invalid}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save Admin Settings"}
        </button>
      </div>
    </div>
  );
}
