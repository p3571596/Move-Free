import { PatientSectionClient } from "../PatientSectionClient";

export default async function PatientProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientSectionClient patientId={id} section="progress" />;
}
