"use client";
import { PatientWorkspaceClient } from './PatientWorkspaceClient';
export function PatientSectionClient({patientId,section}:{patientId:string;section:'progress'|'logs'|'decision'}) {
 return <PatientWorkspaceClient patientId={patientId} section={section==='decision'?'summary':section}/>;
}
