"use client";
import { useState } from "react";
import { convertDoseUnit, parameterKeys, parameterSpecs, type DoseParameter, type ParameterKey, type Prescription } from '@/lib/prescription';

export function PrescriptionFields({id, value, onChange, keys=parameterKeys, lockedSelection=false}: {lockedSelection?:boolean;keys?: ParameterKey[];id: string; value: Prescription; onChange: (value: Prescription) => void}) {
  const [unitError,setUnitError]=useState('');
  const patch = (key: ParameterKey, entry: DoseParameter | undefined) => {
    const next = {...value};
    if (entry) next[key] = entry; else delete next[key];
    onChange(next);
  };
  return <fieldset className="prescription-fields"><legend>Prescription parameters</legend>
    <p className="muted">{lockedSelection?"These parameters vary across profiles. Change the selection in Step 1.":"Select only what applies to this exercise. Leave unprescribed values blank."}</p>
    <div className="grid two">{keys.map(key => {
      const spec = parameterSpecs[key], entry = value[key];
      return <div className="field" key={key}>
        <label>{lockedSelection?null:<input type="checkbox" checked={!!entry} onChange={e => patch(key, e.target.checked ? {value: null, unit: spec.units[0]} : undefined)}/>} {spec.label}</label>
        {entry ? <div className="prescription-value" style={{flexWrap:'wrap'}}>
          <label className="sr-only" htmlFor={`${id}-${key}-mode`}>{spec.label} prescription mode</label>
          <select id={`${id}-${key}-mode`} value={entry.mode??'exact'} onChange={e=>patch(key,e.target.value==='range'?{value:null,unit:entry.unit,mode:'range',min:entry.value,max:entry.value}:{value:entry.target??entry.min??entry.value,unit:entry.unit})}><option value="exact">Exact</option><option value="range">Range</option></select>
          {entry.mode==='range' ? <>{(['min','max','target'] as const).map(part=><label key={part}>{part==='min'?'Minimum':part==='max'?'Maximum':'Preferred target (optional)'}<input aria-label={`${spec.label} ${part}`} type="number" min={0} step={'integer' in spec?1:'any'} required={part!=='target'} value={entry[part]??''} onChange={e=>patch(key,{...entry,[part]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</> : <>

          <label htmlFor={`${id}-${key}`} className="sr-only">{spec.label} value</label>
          <input id={`${id}-${key}`} type="number" inputMode={'integer' in spec ? 'numeric' : 'decimal'} min={0} max={entry.unit === 'RPE/10' ? 10 : entry.unit === 'days/week' ? 7 : entry.unit.startsWith('%') ? 100 : 100000} step={'integer' in spec ? 1 : 'any'} value={entry.value ?? ''} onChange={e => patch(key, {...entry, value: e.target.value === '' ? null : Number(e.target.value)})}/>
          </>}<label htmlFor={`${id}-${key}-unit`} className="sr-only">{spec.label} unit</label>
          <select id={`${id}-${key}-unit`} value={entry.unit} onChange={e => {try{patch(key,convertDoseUnit(entry,e.target.value));setUnitError('');}catch(error){setUnitError((error as Error).message);}}}>{spec.units.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select>
        </div> : null}
      </div>;
    })}</div>
    {unitError?<p role="alert">{unitError}</p>:null}
    <p className="muted">Use notes/key cues for band colors, assistance, tempo, or other clinical detail.</p>
  </fieldset>;
}
