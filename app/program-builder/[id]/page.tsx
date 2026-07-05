import { ProgramBuilderClient } from "./ProgramBuilderClient";

export default async function ProgramBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgramBuilderClient patientId={id} />;
}
