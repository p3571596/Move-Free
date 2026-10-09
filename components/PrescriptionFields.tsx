"use client";
import { parameterKeys, parameterSpecs, type ParameterKey, type Prescription } from '@/lib/prescription';

export function PrescriptionFields({id, value, onChange}: {id: string; value: Prescription; onChange: (value: Prescription) => void}) {
  const patch = (key: ParameterKey, entry: {value: number | null; unit: string} | undefined) => {
    const next = {...value};
    if (entry) next[key] = entry; else delete next[key];
    onChange(next);
  };
  return <fieldset className="prescription-fields"><legend>Prescription parameters</legend>
    <p className="muted">Select only what applies to this exercise. Leave unprescribed values blank.</p>
    <div className="grid two">{parameterKeys.map(key => {
      const spec = parameterSpecs[key], entry = value[key];
      return <div className="field" key={key}>
        <label><input type="checkbox" checked={!!entry} onChange={e => patch(key, e.target.checked ? {value: null, unit: spec.units[0]} : undefined)}/> {spec.label}</label>
        {entry ? <div className="prescription-value">
          <label htmlFor={`${id}-${key}`} className="sr-only">{spec.label} value</label>
          <input id={`${id}-${key}`} type="number" inputMode={'integer' in spec ? 'numeric' : 'decimal'} min={0} max={entry.unit === 'RPE/10' ? 10 : entry.unit === 'days/week' ? 7 : entry.unit.startsWith('%') ? 100 : 100000} step={'integer' in spec ? 1 : 'any'} value={entry.value ?? ''} onChange={e => patch(key, {...entry, value: e.target.value === '' ? null : Number(e.target.value)})}/>
          <label htmlFor={`${id}-${key}-unit`} className="sr-only">{spec.label} unit</label>
          <select id={`${id}-${key}-unit`} value={entry.unit} onChange={e => patch(key, {...entry, unit: e.target.value})}>{spec.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
        </div> : null}
      </div>;
    })}</div>
    <p className="muted">Use notes/key cues for band colors, assistance, tempo, or other clinical detail.</p>
  </fieldset>;
}
