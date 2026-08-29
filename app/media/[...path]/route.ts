import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const SEGMENT = /^[a-z0-9-]+$/;
const FILE = /^[a-f0-9]{16}(?:-[a-z0-9-]+)?-(?:full|thumb)\.webp$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = (await params).path;
  if (
    segments.length !== 3
    || segments[0] !== "products"
    || !SEGMENT.test(segments[1])
    || !FILE.test(segments[2])
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  const mediaRoot = process.env.MEDIA_ROOT || path.resolve(process.cwd(), "data", "media");
  const filePath = path.resolve(mediaRoot, ...segments);
  const root = path.resolve(mediaRoot);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return new NextResponse("Not found", { status: 404 });
  try {
    const file = await readFile(filePath);
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
