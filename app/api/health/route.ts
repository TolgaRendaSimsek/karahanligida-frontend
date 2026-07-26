import { NextResponse } from "next/server";
import { readCatalog } from "@/lib/catalog-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await readCatalog();
    return NextResponse.json({
      status: "ok",
      catalogProducts: catalog.products.length,
      release: process.env.APP_RELEASE || "development",
    });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
