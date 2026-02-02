import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import crypto from "crypto";

import { authOptions } from "@/lib/auth";

function safeFilename(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  const original = safeFilename(file.name || "upload.bin");
  const id = crypto.randomUUID();
  const relDir = path.posix.join("uploads", day);
  const relPath = path.posix.join(relDir, `${id}-${original}`);

  // Write into public/ so Next can serve it at /uploads/...
  const absDir = path.join(process.cwd(), "public", relDir);
  const absPath = path.join(process.cwd(), "public", relPath);
  await mkdir(absDir, { recursive: true });
  await writeFile(absPath, buffer);

  return NextResponse.json({
    url: `/${relPath}`,
    fileName: original,
    mimeType: file.type || "application/octet-stream",
    fileSize: buffer.length,
    storagePath: relPath,
  });
}
