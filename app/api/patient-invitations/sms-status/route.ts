import { NextResponse } from "next/server";

// Automated provider delivery is postponed for the private pilot.
export async function POST() {
  return NextResponse.json({ error: "Automated SMS delivery is unavailable." }, {
    status: 410, headers: { "Cache-Control": "no-store" },
  });
}
