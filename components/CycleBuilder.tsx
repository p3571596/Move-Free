"use client";
import { useState } from "react";
import type { HomeProgram, HomeProgramExercise, Json } from "@/lib/types";
import {
  parameterSpecs,
  formatPrescription,
  prescriptionFor,
  type ParameterKey,
} from "@/lib/prescription";
import {
  validateProgressionPlan,
  type ProgressionPlan,
  type DayTemplate,
} from "@/lib/progression";
import {
  addDays,
  dayDifference,
  newCyclePlan,
  applicableParameters,
  commonParameters,
  inheritedProfile,
  cycleOccurrences,
  cyclePrescription,
  changeCycleOccurrence,
  suggestPattern,
  type CycleConfig,
} from "@/lib/cycle";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { PrescriptionFields } from "./PrescriptionFields";

const steps = [
  "Variable parameters",
  "Cycle profiles",
  "Schedule",
  "Review and approve",
];
export function CycleBuilder({
  program,
  items,
  disabled = false,
  onSaved,
  onPreviewSave,
}: {
  program: HomeProgram;
  items: HomeProgramExercise[];
  disabled?: boolean;
  onSaved?: (message: string) => Promise<void>;
  onPreviewSave?: (plan: ProgressionPlan | null, approved: boolean) => void;
}) {
  const [plan, setPlan] = useState<ProgressionPlan>(() =>
    structuredClone(
      program.progression_plan?.cycle
        ? program.progression_plan
        : newCyclePlan(items),
    ),
  );
  const [step, setStep] = useState(0),
    [profileId, setProfileId] = useState(plan.templates[0].id),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      plan.templates.map((t) => [
        t.id,
        plan.cycle!.pattern.filter((id) => id === t.id).length,
      ]),
    ),
  );
  const [inspectDate, setInspectDate] = useState(plan.startDate),
    [replacement, setReplacement] = useState(plan.templates[0].id),
    [scope, setScope] = useState<"one" | "future" | "template">("one");
  const [history, setHistory] = useState<
    {
      id: string;
      approved: boolean;
      created_at: string;
      document: ProgressionPlan | null;
    }[]
  >([]);
  const cycle = plan.cycle!,
    profile =
      plan.templates.find((t) => t.id === profileId) ?? plan.templates[0];
  const normalized = {
    ...plan,
    weeks: [{ ...plan.weeks[0], templateIds: plan.templates.map((t) => t.id) }],
    templates: plan.templates.map((t) => inheritedProfile(plan, t, items)),
  };
  const selectedCount = Object.values(cycle.variables).reduce(
    (n, keys) => n + keys.length,
    0,
  );
  let issue = "",
    occurrences: ReturnType<typeof cycleOccurrences> = [];
  try {
    validateProgressionPlan(normalized, items);
    occurrences = cycleOccurrences(normalized);
  } catch (e) {
    issue = (e as Error).message;
  }
  const edit = (next: ProgressionPlan) => {
    setPlan(next);
    setReviewed(false);
    setStatus("");
  };
  const patchCycle = (patch: Partial<CycleConfig>) =>
    edit({ ...plan, cycle: { ...cycle, ...patch } });
  const patchProfile = (patch: Partial<DayTemplate>) =>
    edit({
      ...plan,
      templates: plan.templates.map((t) =>
        t.id === profile.id ? { ...t, ...patch } : t,
      ),
    });
  const title = (id: string) =>
    items.find((i) => i.id === id)?.patient_name ??
    items.find((i) => i.id === id)?.exercise?.name ??
    "Exercise";
  function setVariables(id: string, keys: ParameterKey[]) {
    patchCycle({ variables: { ...cycle.variables, [id]: keys } });
  }
  function duplicate() {
    const id = crypto.randomUUID();
    edit({
      ...plan,
      templates: [
        ...plan.templates,
        { ...structuredClone(profile), id, name: `${profile.name} copy` },
      ],
    });
    setProfileId(id);
    setCounts({ ...counts, [id]: 0 });
  }
  function removeProfile() {
    const id = profile.id;
    if (["high", "low", "recovery"].includes(id)) return;
    const templates = plan.templates.filter((t) => t.id !== id);
    edit({
      ...plan,
      templates,
      cycle: {
        ...cycle,
        pattern: cycle.pattern.map((p) => (p === id ? "recovery" : p)),
        occurrenceEdits: Object.fromEntries(
          Object.entries(cycle.occurrenceEdits).filter(([, p]) => p !== id),
        ),
        futureEdits: cycle.futureEdits.filter((r) => r.profileId !== id),
        adjustments: cycle.adjustments.filter((r) => r.profileId !== id),
      },
    });
    setCounts(
      Object.fromEntries(Object.entries(counts).filter(([key]) => key !== id)),
    );
    setProfileId(templates[0].id);
  }
  async function save(approved: boolean) {
    if (
      busy ||
      disabled ||
      (approved && (!reviewed || (selectedCount > 0 && issue)))
    )
      return;
    setBusy(true);
    setStatus("");
    try {
      const document = selectedCount ? normalized : null;
      if (document) validateProgressionPlan(document, items);
      if (onPreviewSave) onPreviewSave(document, approved);
      else {
        const result = await createSupabaseBrowserClient().rpc(
          "save_progression_plan",
          {
            p_program: program.id,
            p_expected: program.updated_at ?? null,
            p_plan: document as unknown as Json,
            p_approve: approved,
          },
        );
        if (result.error) throw result.error;
      }
      const message = approved
        ? document
          ? `Cycle approved: ${document.startDate} through ${cycle.endDate}.`
          : "Fixed prescription approved. Previous plan history retained."
        : "Draft saved. Patient prescription unchanged.";
      setReviewed(false);
      setStatus(message);
      if (!onPreviewSave) await onSaved?.(message);
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String(e.message)
            : "Could not save cycle.",
      );
    } finally {
      setBusy(false);
    }
  }
  function generate() {
    try {
      const pattern = suggestPattern(
        Object.fromEntries(
          plan.templates.map((t) => [t.id, counts[t.id] ?? 0]),
        ),
        cycle.highProfileId,
        cycle.minHighSpacingDays,
        {
          restIds: plan.templates.filter((t) => t.fullRest).map((t) => t.id),
          blockedSlots: Array.from(
            { length: Object.values(counts).reduce((a, b) => a + b, 0) },
            (_, slot) => slot,
          ).filter((slot) =>
            Array.from(
              {
                length: Math.ceil(
                  (dayDifference(cycle.endDate, plan.startDate) + 1) /
                    Math.max(
                      1,
                      Object.values(counts).reduce((a, b) => a + b, 0),
                    ),
                ),
              },
              (_, n) =>
                slot + n * Object.values(counts).reduce((a, b) => a + b, 0),
            )
              .filter((n) => n <= dayDifference(cycle.endDate, plan.startDate))
              .some(
                (n) =>
                  !cycle.allowedWeekdays.includes(
                    new Date(
                      addDays(plan.startDate, n) + "T00:00:00Z",
                    ).getUTCDay(),
                  ),
              ),
          ),
        },
      );
      patchCycle({ pattern, occurrenceEdits: {}, futureEdits: [] });
      setStatus(
        "Repeating arrangement generated. Review dates and restrictions below.",
      );
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  const shown = occurrences.filter(
    (o) =>
      dayDifference(o.date, inspectDate) >= -3 &&
      dayDifference(o.date, inspectDate) <= 10,
  );
  return (
    <details
      className="panel cycle-builder"
      open={!!program.progression_plan?.cycle}
    >
      <summary>Build a repeating cycle (optional)</summary>
      <p className="muted">
        Choose what varies, configure profiles once, then review the dated
        schedule.
      </p>
      <fieldset
        disabled={disabled || busy}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        {disabled ? (
          <p>Save base exercise edits before building a cycle.</p>
        ) : null}
        <nav className="cycle-steps" aria-label="Cycle builder steps">
          {steps.map((name, i) => (
            <button
              type="button"
              key={name}
              aria-current={step === i ? "step" : undefined}
              aria-pressed={step === i}
              onClick={() => {
                setStep(i);
                setReviewed(false);
              }}
            >
              {i + 1}. {name}
            </button>
          ))}
        </nav>
        <h3>
          {step + 1}. {steps[step]}
        </h3>
        {step === 0 ? (
          <div className="form">
            <p>
              Only selected parameters require profile editing. All others
              inherit the base prescription. Add any missing parameters in the
              base exercise editor first.
            </p>
            {items.map((item) => {
              const keys = applicableParameters(item),
                selected = cycle.variables[item.id] ?? [];
              return (
                <fieldset key={item.id}>
                  <legend>{title(item.id)}</legend>
                  <p>
                    {formatPrescription(prescriptionFor(item)) ||
                      "No structured base parameters yet"}
                  </p>
                  <div className="cycle-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setVariables(item.id, keys)}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setVariables(item.id, [])}
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setVariables(
                          item.id,
                          keys.filter((k) => commonParameters.includes(k)),
                        )
                      }
                    >
                      Select Common Parameters
                    </button>
                  </div>
                  <div className="cycle-checkboxes">
                    {keys.map((key) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={selected.includes(key)}
                          onChange={(e) =>
                            setVariables(
                              item.id,
                              e.target.checked
                                ? [...selected, key]
                                : selected.filter((k) => k !== key),
                            )
                          }
                        />
                        {parameterSpecs[key].label}
                      </label>
                    ))}
                  </div>
                  <p>{selected.length} selected</p>
                </fieldset>
              );
            })}
            <p role="status">
              {selectedCount} variable parameters selected.
              {!selectedCount
                ? " Continue with a fixed prescription; no cycle is required."
                : ""}
            </p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="form">
            {!selectedCount ? (
              <p>
                No parameters vary. Continue to review the fixed prescription.
              </p>
            ) : (
              <>
                <div
                  className="segment-options"
                  role="group"
                  aria-label="Cycle profiles"
                >
                  {plan.templates.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      aria-pressed={t.id === profile.id}
                      onClick={() => setProfileId(t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <label>
                  Profile name
                  <input
                    value={profile.name}
                    onChange={(e) => patchProfile({ name: e.target.value })}
                  />
                </label>
                <div className="cycle-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={plan.templates.length >= 30}
                    onClick={() => {
                      const id = crypto.randomUUID();
                      edit({
                        ...plan,
                        templates: [
                          ...plan.templates,
                          {
                            ...structuredClone(plan.templates[0]),
                            id,
                            name: "Custom profile",
                          },
                        ],
                      });
                      setProfileId(id);
                      setCounts({ ...counts, [id]: 0 });
                    }}
                  >
                    Add custom profile
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={plan.templates.length >= 30}
                    onClick={duplicate}
                  >
                    Duplicate profile
                  </button>
                  {!["high", "low", "recovery"].includes(profile.id) ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={removeProfile}
                    >
                      Remove profile
                    </button>
                  ) : null}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={!!profile.fullRest}
                    onChange={(e) =>
                      patchProfile({
                        fullRest: e.target.checked,
                        exercises: e.target.checked
                          ? profile.exercises
                          : profile.exercises.length
                            ? profile.exercises
                            : items.map((i) => ({
                                assignmentId: i.id,
                                prescription: structuredClone(
                                  prescriptionFor(i),
                                ),
                                notes: i.notes ?? "",
                                prerequisiteIds: i.prerequisite_ids ?? [],
                              })),
                      })
                    }
                  />{" "}
                  Full rest (no exercise dose)
                </label>
                <label>
                  Instructions
                  <textarea
                    value={profile.notes}
                    onChange={(e) => patchProfile({ notes: e.target.value })}
                  />
                </label>
                <label>
                  Minimum hours between sessions of this profile
                  <input
                    type="number"
                    min={0}
                    max={720}
                    value={profile.minRestHours}
                    onChange={(e) =>
                      patchProfile({ minRestHours: Number(e.target.value) })
                    }
                  />
                </label>
                {profile.fullRest ? (
                  <p>
                    Full rest. Choose active recovery by clearing Full rest and
                    selecting clinician-approved exercises.
                  </p>
                ) : (
                  items.map((item) => {
                    const entry = profile.exercises.find(
                        (x) => x.assignmentId === item.id,
                      ),
                      keys = cycle.variables[item.id] ?? [];
                    return (
                      <article className="panel" key={item.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!entry}
                            onChange={(e) =>
                              patchProfile({
                                exercises: e.target.checked
                                  ? [
                                      ...profile.exercises,
                                      {
                                        assignmentId: item.id,
                                        prescription: structuredClone(
                                          prescriptionFor(item),
                                        ),
                                        notes: item.notes ?? "",
                                        prerequisiteIds:
                                          item.prerequisite_ids ?? [],
                                      },
                                    ]
                                  : profile.exercises.filter(
                                      (x) => x.assignmentId !== item.id,
                                    ),
                              })
                            }
                          />
                          {title(item.id)}
                        </label>
                        {entry ? (
                          <>
                            <p>
                              Inherited base:{" "}
                              {formatPrescription(prescriptionFor(item))}
                            </p>
                            {keys.length ? (
                              <PrescriptionFields
                                id={`profile-${profile.id}-${item.id}`}
                                keys={keys}
                                value={Object.fromEntries(
                                  keys
                                    .filter((k) => entry.prescription[k])
                                    .map((k) => [k, entry.prescription[k]]),
                                )}
                                onChange={(prescription) =>
                                  patchProfile({
                                    exercises: profile.exercises.map((x) =>
                                      x.assignmentId === item.id
                                        ? {
                                            ...x,
                                            prescription: {
                                              ...x.prescription,
                                              ...prescription,
                                            },
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            ) : (
                              <p>No variable parameters for this exercise.</p>
                            )}
                            <label>
                              Exercise cues
                              <textarea
                                value={entry.notes}
                                onChange={(e) =>
                                  patchProfile({
                                    exercises: profile.exercises.map((x) =>
                                      x.assignmentId === item.id
                                        ? { ...x, notes: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                          </>
                        ) : null}
                      </article>
                    );
                  })
                )}
                <details>
                  <summary>All profile prescriptions</summary>
                  {normalized.templates.map((t) => (
                    <div key={t.id}>
                      <h4>{t.name}</h4>
                      {t.fullRest ? (
                        <p>Full rest</p>
                      ) : (
                        t.exercises.map((e) => (
                          <p key={e.assignmentId}>
                            {title(e.assignmentId)}:{" "}
                            {formatPrescription(e.prescription) ||
                              "Follow clinician instructions"}
                          </p>
                        ))
                      )}
                    </div>
                  ))}
                </details>
              </>
            )}
          </div>
        ) : null}
        {step === 2 && selectedCount > 0 ? (
          <div className="form">
            <div className="grid two">
              <label>
                Start date
                <input
                  type="date"
                  value={plan.startDate}
                  onChange={(e) => edit({ ...plan, startDate: e.target.value })}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={cycle.endDate}
                  onChange={(e) => patchCycle({ endDate: e.target.value })}
                />
              </label>
            </div>
            <label>
              Repeat for weeks
              <input
                type="number"
                min={1}
                max={104}
                value={
                  Math.ceil(
                    (dayDifference(cycle.endDate, plan.startDate) + 1) / 7,
                  ) || 1
                }
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 1 && n <= 104)
                    patchCycle({ endDate: addDays(plan.startDate, n * 7 - 1) });
                }}
              />
            </label>
            <label>
              Scheduling mode
              <select
                value={cycle.mode}
                onChange={(e) =>
                  patchCycle({ mode: e.target.value as "fixed" | "flexible" })
                }
              >
                <option value="fixed">Fixed Schedule</option>
                <option value="flexible">Flexible Schedule</option>
              </select>
            </label>
            <p>
              {cycle.mode === "fixed"
                ? "Patients follow the approved dated arrangement."
                : "Patients choose approved sessions within each seven-day window. Counts are limits; recovery and allowed weekdays still apply."}
            </p>
            <fieldset>
              <legend>
                Distribution per cycle (total 1–28 days; use 7 for weekly)
              </legend>
              {plan.templates.map((t) => (
                <label key={t.id}>
                  {t.name}
                  <input
                    type="number"
                    min={0}
                    max={28}
                    value={counts[t.id] ?? 0}
                    onChange={(e) =>
                      setCounts({ ...counts, [t.id]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </fieldset>
            <label>
              Minimum days between High sessions
              <input
                type="number"
                min={0}
                max={28}
                value={cycle.minHighSpacingDays}
                onChange={(e) =>
                  patchCycle({ minHighSpacingDays: Number(e.target.value) })
                }
              />
            </label>
            <fieldset>
              <legend>Allowed exercise weekdays</legend>
              <div className="cycle-checkboxes">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (name, i) => (
                    <label key={name}>
                      <input
                        type="checkbox"
                        checked={cycle.allowedWeekdays.includes(i)}
                        onChange={(e) =>
                          patchCycle({
                            allowedWeekdays: e.target.checked
                              ? [...cycle.allowedWeekdays, i]
                              : cycle.allowedWeekdays.filter((d) => d !== i),
                          })
                        }
                      />
                      {name}
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <label>
              <input
                type="checkbox"
                checked={cycle.multipleSessionsPerDay}
                onChange={(e) =>
                  patchCycle({ multipleSessionsPerDay: e.target.checked })
                }
              />{" "}
              Allow multiple sessions in a day (frequency and recovery limits
              still apply)
            </label>
            <button type="button" className="button" onClick={generate}>
              Generate repeating schedule
            </button>
            <p>
              Generating replaces draft occurrence edits. It never changes the
              active patient program.
            </p>
            <div className="cycle-pattern">
              {cycle.pattern.map((id, i) => (
                <label key={i}>
                  Day {i + 1}
                  <select
                    value={id}
                    onChange={(e) =>
                      patchCycle({
                        pattern: cycle.pattern.map((p, j) =>
                          i === j ? e.target.value : p,
                        ),
                      })
                    }
                  >
                    {plan.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <h4>Inspect or customize a session</h4>
            <label>
              Session date
              <input
                type="date"
                min={plan.startDate}
                max={cycle.endDate}
                value={inspectDate}
                onChange={(e) => setInspectDate(e.target.value)}
              />
            </label>
            <label>
              Change session to
              <select
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              >
                {plan.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Change scope
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
              >
                <option value="one">This occurrence only</option>
                <option value="future">
                  This and future occurrences of this cycle day
                </option>
                <option value="template">Repeating cycle template</option>
              </select>
            </label>
            <p>
              {scope === "one"
                ? `Only ${inspectDate} changes.`
                : scope === "future"
                  ? `Changes this cycle slot from ${inspectDate} onward; explicit one-day edits keep priority.`
                  : "Changes this slot throughout this proposed cycle; explicit occurrence and future edits keep priority."}{" "}
              All changes require approval. Recorded history remains unchanged.
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                edit(
                  changeCycleOccurrence(plan, inspectDate, replacement, scope),
                )
              }
            >
              Apply to draft
            </button>
            <details>
              <summary>Weekly, monthly or phase adjustments</summary>
              <p>
                Enter explicit effective dates. Different parameters may
                overlap; two rules for the same parameter conflict. Calendar
                months use their actual dates.
              </p>
              {cycle.adjustments.map((a, index) => (
                <fieldset key={a.id}>
                  <legend>Adjustment {index + 1}</legend>
                  <label>
                    Adjustment name
                    <input
                      value={a.name}
                      onChange={(e) =>
                        patchCycle({
                          adjustments: cycle.adjustments.map((r) =>
                            r.id === a.id ? { ...r, name: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="grid two">
                    {(["startDate", "endDate"] as const).map((k) => (
                      <label key={k}>
                        {k === "startDate"
                          ? "Effective from"
                          : "Effective through"}
                        <input
                          type="date"
                          value={a[k]}
                          onChange={(e) =>
                            patchCycle({
                              adjustments: cycle.adjustments.map((r) =>
                                r.id === a.id
                                  ? { ...r, [k]: e.target.value }
                                  : r,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label>
                    Adjustment profile
                    <select
                      value={a.profileId}
                      onChange={(e) =>
                        patchCycle({
                          adjustments: cycle.adjustments.map((r) =>
                            r.id === a.id
                              ? {
                                  ...r,
                                  profileId: e.target.value,
                                  prescription: {},
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      {plan.templates
                        .filter((t) => !t.fullRest)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Adjustment exercise
                    <select
                      value={a.assignmentId}
                      onChange={(e) =>
                        patchCycle({
                          adjustments: cycle.adjustments.map((r) =>
                            r.id === a.id
                              ? {
                                  ...r,
                                  assignmentId: e.target.value,
                                  prescription: {},
                                }
                              : r,
                          ),
                        })
                      }
                    >
                      {plan.templates
                        .find((t) => t.id === a.profileId)
                        ?.exercises.map((x) => (
                          <option key={x.assignmentId} value={x.assignmentId}>
                            {title(x.assignmentId)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <PrescriptionFields
                    id={`adjust-${a.id}`}
                    keys={cycle.variables[a.assignmentId] ?? []}
                    value={a.prescription}
                    onChange={(prescription) =>
                      patchCycle({
                        adjustments: cycle.adjustments.map((r) =>
                          r.id === a.id ? { ...r, prescription } : r,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      patchCycle({
                        adjustments: cycle.adjustments.filter(
                          (r) => r.id !== a.id,
                        ),
                      })
                    }
                  >
                    Remove adjustment
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const t = plan.templates.find(
                    (t) => !t.fullRest && t.exercises.length,
                  );
                  if (t)
                    patchCycle({
                      adjustments: [
                        ...cycle.adjustments,
                        {
                          id: crypto.randomUUID(),
                          name: "Dated adjustment",
                          startDate: inspectDate,
                          endDate: cycle.endDate,
                          profileId: t.id,
                          assignmentId: t.exercises[0].assignmentId,
                          prescription: {},
                        },
                      ],
                    });
                }}
              >
                Add dated adjustment
              </button>
            </details>
            <div className="cycle-calendar">
              {shown.map((o) => {
                const t = plan.templates.find((t) => t.id === o.profileId)!;
                return (
                  <details key={o.date}>
                    <summary>
                      {o.date} · {t.name}
                      {cycle.occurrenceEdits[o.date] ? " · Edited" : ""}
                    </summary>
                    {t.fullRest ? (
                      <p>Full rest. No mandatory exercise.</p>
                    ) : (
                      t.exercises.map((e) => (
                        <p key={e.assignmentId}>
                          {title(e.assignmentId)}:{" "}
                          {formatPrescription(
                            cyclePrescription(
                              normalized,
                              o.date,
                              t.id,
                              e.assignmentId,
                            ),
                          )}
                        </p>
                      ))
                    )}
                    {Object.keys(o.overrides).length ? (
                      <p>Includes dated approved adjustments.</p>
                    ) : null}
                  </details>
                );
              })}
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="form">
            {selectedCount ? (
              <>
                <p>
                  <strong>
                    {plan.startDate} through {cycle.endDate}
                  </strong>{" "}
                  · {occurrences.length} days · {cycle.pattern.length}-day
                  repeating cycle · {cycle.mode}
                </p>
                <p>
                  Distribution:{" "}
                  {plan.templates
                    .map(
                      (t) =>
                        `${cycle.pattern.filter((id) => id === t.id).length} ${t.name}`,
                    )
                    .join(" + ")}{" "}
                  per cycle.
                </p>
                <p>
                  High spacing: {cycle.minHighSpacingDays} days.{" "}
                  {cycle.multipleSessionsPerDay
                    ? "Multiple sessions allowed within limits."
                    : "One session per day."}
                </p>
                {normalized.templates.map((t) => (
                  <details key={t.id}>
                    <summary>
                      {t.name} ·{" "}
                      {t.fullRest
                        ? "Full rest"
                        : `${t.exercises.length} exercises`}
                    </summary>
                    <p>{t.notes}</p>
                    {t.exercises.map((e) => (
                      <p key={e.assignmentId}>
                        {title(e.assignmentId)} ·{" "}
                        {formatPrescription(e.prescription)} · Varies:{" "}
                        {(cycle.variables[e.assignmentId] ?? [])
                          .map((k) => parameterSpecs[k].label)
                          .join(", ") || "Fixed"}
                      </p>
                    ))}
                  </details>
                ))}
                <p>
                  {cycle.adjustments.length} dated adjustments;{" "}
                  {Object.keys(cycle.occurrenceEdits).length} individual edits;{" "}
                  {cycle.futureEdits.length} future-slot edits.
                </p>
                <p>
                  Resolution: base → profile → occurrence profile selection →
                  dated parameter adjustments. Conflicting dated parameters
                  block approval.
                </p>
                {issue ? (
                  <p role="alert">{issue}</p>
                ) : (
                  <p>Schedule and numerical validation passed.</p>
                )}
              </>
            ) : (
              <>
                <p>Fixed prescription. No repeating cycle will be activated.</p>
                {items.map((i) => (
                  <p key={i.id}>
                    {title(i.id)}: {formatPrescription(prescriptionFor(i))}
                  </p>
                ))}
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />{" "}
              I reviewed all dated prescriptions, exercise selections, recovery
              and scheduling restrictions. I approve this proposed program.
            </label>
            <button
              type="button"
              className="button"
              disabled={!reviewed || !!(selectedCount && issue)}
              onClick={() => void save(true)}
            >
              {selectedCount ? "Approve cycle" : "Approve fixed prescription"}
            </button>
          </div>
        ) : null}
        {step < 3 && issue && selectedCount > 0 ? (
          <p role="status">Review needed: {issue}</p>
        ) : null}
        <div className="cycle-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              className="button"
              onClick={() => setStep(!selectedCount ? 3 : step + 1)}
            >
              {selectedCount ? "Continue" : "Continue with fixed prescription"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            disabled={!!(selectedCount && issue)}
            onClick={() => void save(false)}
          >
            Save cycle draft
          </button>
        </div>
        {!onPreviewSave ? (
          <details>
            <summary
              onClick={() => {
                void createSupabaseBrowserClient()
                  .from("program_progression_revisions")
                  .select("*")
                  .eq("home_program_id", program.id)
                  .order("created_at", { ascending: false })
                  .limit(30)
                  .then((r) => {
                    if (r.error) setStatus(r.error.message);
                    else setHistory(r.data ?? []);
                  });
              }}
            >
              Saved cycle drafts and approval history
            </summary>
            {history.map((r) => (
              <p key={r.id}>
                {r.approved ? "Approved" : "Draft"} ·{" "}
                {new Date(r.created_at).toLocaleString()}
                {r.document?.cycle ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      edit(structuredClone(r.document!));
                      setStep(0);
                      setProfileId(r.document!.templates[0].id);
                    }}
                  >
                    Load for review
                  </button>
                ) : null}
              </p>
            ))}
          </details>
        ) : null}
      </fieldset>
      <p role="status">{status}</p>
    </details>
  );
}
