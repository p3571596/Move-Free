import { notFound } from "next/navigation";
import { WorkflowPreview } from "./WorkflowPreview";
export default function PreviewPage() {
  if (process.env.VERCEL_ENV !== "preview" && process.env.WORKFLOW_PREVIEW !== "1") notFound();
  return <WorkflowPreview/>;
}
