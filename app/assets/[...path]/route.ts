import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const SEGMENT = /^[a-z0-9-]+$/;
const FILE = /^(?:image|web)-[a-z0-9-]+(?:-thumb)?\.webp$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;
  if (
    segments.length !== 4
    || segments[0] !== "products"
    || !segments.slice(1, 3).every((segment) => SEGMENT.test(segment))
    || !FILE.test(segments[3])
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const file = await readFile(path.join(process.cwd(), "assets", ...segments));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
