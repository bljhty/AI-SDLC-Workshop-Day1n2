import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { holidayDB } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const year = request.nextUrl.searchParams.get("year");
  const month = request.nextUrl.searchParams.get("month");

  if (year && month) {
    return NextResponse.json(holidayDB.listByMonth(Number(year), Number(month)));
  }
  return NextResponse.json(holidayDB.listAll());
}
