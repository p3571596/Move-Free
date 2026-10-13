import { notFound } from "next/navigation";
import { PilotPreview } from "./preview";
export default function Page() {
  if (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.PRIVATE_PILOT_PREVIEW !== "1"
  )
    notFound();
  return <PilotPreview />;
}
