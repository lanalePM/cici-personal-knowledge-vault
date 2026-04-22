import { NextRequest, NextResponse } from "next/server";
import { processItem } from "@/lib/ai/process-item";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { item_id } = await request.json();
  if (!item_id) {
    return NextResponse.json({ error: "item_id required" }, { status: 400 });
  }

  try {
    await processItem(item_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("AI processing failed:", err);
    return NextResponse.json(
      { error: "AI processing failed" },
      { status: 500 }
    );
  }
}
