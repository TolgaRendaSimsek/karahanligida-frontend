import { NextRequest, NextResponse } from "next/server";
import { publishedProducts } from "@/lib/catalog-repository";
import { queryCatalog } from "@/lib/catalog-query";
import { toCatalogCard } from "@/lib/catalog-schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ids = (params.get("ids") || "").split(",").filter(Boolean).slice(0, 100);
  const result = queryCatalog(await publishedProducts(), {
    q: params.get("q") || "",
    brand: params.get("brand") || "",
    category: params.get("category") || "",
    subcategory: params.get("subcategory") || "",
    ids,
    cursor: params.get("cursor") || "",
    limit: Number(params.get("limit")) || 24,
  });
  return NextResponse.json({ ...result, items: result.items.map(toCatalogCard) }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
