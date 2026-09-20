// Adapted directly from docs/clinical-engine/original-v0.1.html.
// Source SHA256 f358f82a05b6540e466790eade6f2dd5950ac3c87d6f2fe4910256da749fe3a4.
// Clinical branch order, thresholds, and wording below are preserved from v0.1.
// Integration adds explicit missing/invalid input handling before those branches.
export const ENGINE_VERSION = "0.1-integration.1";
export const engineFields = {
  "redFlag": {
    "label": "Red flag or urgent medical concern",
    "kind": "boolean"
  },
  "newNeuro": {
    "label": "New or worsening neurological signs",
    "kind": "boolean"
  },
  "fracture": {
    "label": "Fracture suspicion or significant new trauma",
    "kind": "boolean"
  },
  "systemic": {
    "label": "New systemic, bowel/bladder, or otherwise unexplained symptom change",
    "kind": "boolean"
  },
  "patternChange": {
    "label": "Pain/symptom pattern is meaningfully different from evaluation",
    "kind": "boolean"
  },
  "adherence": {
    "label": "Exercise adherence (%)",
    "kind": "number",
    "min": 0,
    "max": 100.0
  },
  "sleep": {
    "label": "Sleep/recovery",
    "kind": "choice",
    "options": {
      "good": "Adequate",
      "mixed": "Variable",
      "poor": "Poor"
    }
  },
  "dailyLoad": {
    "label": "Daily activity effect",
    "kind": "choice",
    "options": {
      "neutral": "No clear interference",
      "under": "Underactive / avoiding",
      "over": "Overdoing / aggravating",
      "changed": "Major lifestyle or routine change"
    }
  },
  "technique": {
    "label": "Program execution verified?",
    "kind": "choice",
    "options": {
      "yes": "Yes, technique and dosage reviewed",
      "no": "No / uncertain",
      "incorrect": "Incorrect technique or dosage identified"
    }
  },
  "exercisePain": {
    "label": "Peak pain during exercise (0\u201310)",
    "kind": "number",
    "min": 0,
    "max": 10.0
  },
  "painIncrease": {
    "label": "Maximum increase from baseline (0\u201310)",
    "kind": "number",
    "min": 0,
    "max": 10.0
  },
  "recoveryHours": {
    "label": "Time to return to baseline (hours)",
    "kind": "number",
    "min": 0,
    "max": 8760
  },
  "swelling": {
    "label": "Increased swelling or inflammatory response",
    "kind": "boolean"
  },
  "fatigue": {
    "label": "Excessive fatigue/tiredness or reduced willingness to exercise",
    "kind": "boolean"
  },
  "otherAdverse": {
    "label": "Other unexpected adverse response",
    "kind": "boolean"
  },
  "rpe": {
    "label": "Exercise RPE (0\u201310)",
    "kind": "number",
    "min": 0,
    "max": 10.0
  },
  "movement": {
    "label": "Movement quality",
    "kind": "choice",
    "options": {
      "good": "Good / expected",
      "mixed": "Inconsistent",
      "poor": "Poor or compensatory"
    }
  },
  "objective": {
    "label": "Objective findings",
    "kind": "choice",
    "options": {
      "improving": "Improving",
      "stable": "Stable",
      "worsening": "Worsening",
      "unknown": "Not measured"
    }
  },
  "function": {
    "label": "Function/activity goal",
    "kind": "choice",
    "options": {
      "improving": "Improving",
      "stable": "Stable",
      "worsening": "Worsening",
      "unknown": "Not measured"
    }
  },
  "painTrend": {
    "label": "Overall pain trend",
    "kind": "choice",
    "options": {
      "improving": "Improving",
      "stable": "Stable",
      "worsening": "Worsening"
    }
  },
  "expected": {
    "label": "Is progress broadly expected for this stage?",
    "kind": "choice",
    "options": {
      "yes": "Yes",
      "slower": "Slower than expected",
      "no": "No meaningful progression"
    }
  },
  "psych": {
    "label": "Psychological factors, fear, low confidence, or pain/activity mismatch require attention",
    "kind": "boolean"
  }
} as const;
export type EngineKey = keyof typeof engineFields;
export type EngineInputs = Partial<Record<EngineKey, string | number | boolean | null>>;
export type EngineResult = {
  version: string; status: "evaluated" | "missing_information";
  recommendation: string; bottleneck: string; reasons: string[]; flags: string[];
  urgency: string; ruleId: string; missing: EngineKey[]; inputs: EngineInputs;
};
const safetyFields: EngineKey[] = ["redFlag", "newNeuro", "fracture", "systemic"];
export function evaluateEngine(inputs: EngineInputs): EngineResult {
  const missing = (Object.keys(engineFields) as EngineKey[]).filter(key => {
    const field = engineFields[key]; const value = inputs[key];
    if (value === null || value === undefined || value === "" || value === "unknown") return true;
    if (field.kind === "boolean") return typeof value !== "boolean";
    if (field.kind === "number") return typeof value !== "number" || !Number.isFinite(value) || value < field.min || value > field.max;
    return typeof value !== "string" || !(value in field.options);
  });
  // A known positive safety finding is sufficient to surface the original safety rule.
  // Otherwise unknowns block evaluation; they are never converted into normal findings.
  if (missing.length && !safetyFields.some(key => inputs[key] === true)) return {
    version: ENGINE_VERSION, status: "missing_information", recommendation: "More information needed",
    bottleneck: "Required clinical inputs have not been assessed", reasons: missing.map(key => engineFields[key].label + ": not assessed"),
    flags: ["Complete the relevant assessment before using the v0.1 pathway. No treatment suggestion has been generated."],
    urgency: "info", ruleId: "integration.missing_information", missing, inputs: {...inputs},
  };
  const val = (key: EngineKey) => inputs[key];
  const num = (key: EngineKey) => Number(inputs[key]);
  const checked = (key: EngineKey) => inputs[key] === true;

  const reasons: string[]=[]; const flags: string[]=[]; let recommendation=''; let bottleneck=''; let urgency='info';
  const safety = checked('redFlag') || checked('newNeuro') || checked('fracture') || checked('systemic');
  const changedPattern = checked('patternChange');
  const adverse = checked('swelling') || checked('fatigue') || checked('otherAdverse') || num('painIncrease')>2 || num('exercisePain')>5 || num('recoveryHours')>=48;
  const progressionReady = !adverse && val('movement')==='good' && num('rpe')<7 && val('expected')==='yes';
  const notProgressing = val('expected')!=='yes' || val('objective')==='stable' || val('objective')==='worsening' || val('function')==='stable' || val('function')==='worsening' || val('painTrend')==='worsening';
  const executionUnproven = num('adherence')<90 || val('technique')!=='yes' || val('dailyLoad')!=='neutral' || val('sleep')==='poor';

  if(safety){
    recommendation='Refer / urgent escalation'; bottleneck='Safety or possible non-routine pathology'; urgency='danger';
    if(checked('redFlag')) reasons.push('A red flag or urgent concern was selected.');
    if(checked('newNeuro')) reasons.push('New or worsening neurological signs require escalation or focused reassessment.');
    if(checked('fracture')) reasons.push('Fracture suspicion or significant trauma changes the treatment pathway.');
    if(checked('systemic')) reasons.push('New systemic or bowel/bladder-related change requires medical consideration.');
    flags.push('Do not use the progression pathway until safety is resolved.');
  } else if(changedPattern && notProgressing){
    recommendation='Reassess diagnosis'; bottleneck='New information no longer fully fits the working hypothesis'; urgency='warn';
    reasons.push('The symptom pattern changed meaningfully.','Progress is not following the expected course.');
    flags.push('Consider alternate or additional diagnoses and referral when appropriate.');
  } else if(adverse){
    recommendation='Regress or reduce load'; bottleneck='Load tolerance / recovery'; urgency='warn';
    if(num('painIncrease')>2) reasons.push('Pain increased more than 2/10 from baseline.');
    if(num('exercisePain')>5) reasons.push('Exercise pain exceeded the general 5/10 guideline.');
    if(num('recoveryHours')>=48) reasons.push('Symptoms did not return to baseline within 48 hours.');
    if(checked('swelling')) reasons.push('Swelling or inflammatory response increased.');
    if(checked('fatigue')) reasons.push('Excessive fatigue or reduced willingness to exercise was reported.');
    if(checked('otherAdverse')) reasons.push('An unexpected adverse response was reported.');
    flags.push('Reduce dosage or exercise difficulty, then reassess response before progressing.');
  } else if(notProgressing && executionUnproven){
    recommendation='Review execution / improve adherence'; bottleneck='The current plan may not have been fully tested'; urgency='warn';
    if(num('adherence')<90) reasons.push(`Adherence was ${num('adherence')}%, below your current 90% target.`);
    if(val('technique')==='no') reasons.push('Exercise technique and dosage have not been verified.');
    if(val('technique')==='incorrect') reasons.push('Incorrect execution or dosage was identified.');
    if(val('dailyLoad')!=='neutral') reasons.push('Daily activity may be underloading, overloading, or disrupting the plan.');
    if(val('sleep')==='poor') reasons.push('Poor sleep/recovery may be limiting adaptation.');
    flags.push('Spend a session clarifying the program and addressing the most likely barrier before redesigning it.');
  } else if(notProgressing && checked('psych')){
    recommendation='Address psychological or symptom-management factors'; bottleneck='Psychological/contextual factors'; urgency='warn';
    reasons.push('Progress remains slower than expected despite a sufficiently tested plan.','Psychological factors or a mismatch between pain report and activity/progress were identified.');
    flags.push('Consider education, graded exposure, confidence-building, co-management, or referral.');
  } else if(notProgressing){
    recommendation='Maintain briefly, then reconsider intervention'; bottleneck='Unexplained lack of expected progression'; urgency='warn';
    reasons.push('The patient is not progressing as expected.','No clear adherence, execution, recovery, or psychological bottleneck was identified.');
    flags.push('Verify objective data and consider changing the intervention; reassess the diagnosis if second thoughts emerge.');
  } else if(progressionReady){
    recommendation='Progress — repetitions'; bottleneck='No current barrier identified'; urgency='good';
    reasons.push('No adverse response was identified.','Symptoms remained within the general pain and recovery thresholds.','Movement quality is good.','RPE is below 7/10.','Progress is occurring as expected.');
    flags.push('Increase repetitions first. Consider frequency next if the response remains expected.');
  } else {
    recommendation='Maintain current plan'; bottleneck='One or more progression criteria are not yet met'; urgency='info';
    if(val('movement')!=='good') reasons.push('Movement quality is not consistently good.');
    if(num('rpe')>=7) reasons.push('RPE is 7/10 or higher.');
    if(val('expected')!=='yes') reasons.push('Progress is not clearly on the expected trajectory.');
    if(!reasons.length) reasons.push('The patient is stable, but the full progression threshold was not met.');
    flags.push('Continue the current dosage and reassess the limiting criterion.');
  }

  const ruleIds: Record<string, string> = {
    "Refer / urgent escalation": "v0.1.safety",
    "Reassess diagnosis": "v0.1.changed_pattern",
    "Regress or reduce load": "v0.1.adverse_response",
    "Review execution / improve adherence": "v0.1.execution",
    "Address psychological or symptom-management factors": "v0.1.contextual_factors",
    "Maintain briefly, then reconsider intervention": "v0.1.unexplained_plateau",
    "Progress — repetitions": "v0.1.progress_repetitions",
    "Maintain current plan": "v0.1.maintain",
  };
  return {version: ENGINE_VERSION, status: "evaluated", recommendation, bottleneck, reasons, flags, urgency,
    ruleId: ruleIds[recommendation], missing, inputs: {...inputs}};
}
