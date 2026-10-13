"use client";
import { useState } from "react";
import { ProgramExerciseRecording } from "@/components/ProgramExerciseRecording";
import { PrescriptionFields } from "@/components/PrescriptionFields";
import type { Prescription } from "@/lib/prescription";
export function PilotPreview() {
  const [prescription, setPrescription] = useState<Prescription>({
      sets: { value: 2, unit: "sets" },
      reps: { value: 8, unit: "reps" },
    }),
    [notes, setNotes] = useState("Move slowly within your comfortable range.");
  return (
    <main
      className="form"
      style={{ maxWidth: 900, margin: "auto", padding: 24 }}
    >
      <p className="eyebrow">Synthetic preview · no clinical writes</p>
      <h1>Patient Program — Synthetic Case</h1>
      <p>Summary · Progress · Patient Log · Program</p>
      <section className="panel form">
        <h2>Edit exercise — Squat</h2>
        <PrescriptionFields
          id="synthetic"
          value={prescription}
          onChange={setPrescription}
        />
        <label className="field">
          Clinical notes and cues
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <ProgramExerciseRecording
          item={{
            id: "synthetic-assignment",
            exercise: {
              id: "synthetic-exercise",
              name: "Squat",
              patient_instructions:
                "Bend your knees within a comfortable range.",
            },
            notes,
          }}
          patientId="synthetic-patient"
          onChanged={() => {}}
          demonstrationOnly
        />
        <p>
          This preview supports local recording and file preview. Upload,
          database saving, approval and assignment require the isolated
          integration database and release checks. AI remains disabled.
        </p>
      </section>
    </main>
  );
}
