import { PatientWorkspaceClient } from "./PatientWorkspaceClient";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientWorkspaceClient patientId={id} />;
}
