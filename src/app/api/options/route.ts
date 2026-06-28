import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAllOptions, seedDefaultOptions } from "@/lib/options";

export const runtime = "nodejs";

// GET /api/options — returns all dropdown options (available to all logged-in users)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Auto-seed defaults on first access
    await seedDefaultOptions();
    const options = await getAllOptions();
    return NextResponse.json(options);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/options — add a new option (admin only)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await req.json();
    const { category, value } = body;
    if (!category || !value) return NextResponse.json({ error: "category and value are required" }, { status: 400 });

    const validCategories = ["assignedTo", "status", "activityCategory", "sender"];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    // Check for duplicates (case-insensitive)
    const existing = await db.dropdownOption.findFirst({
      where: { category, value: { equals: value, mode: "insensitive" } },
    });
    if (existing) return NextResponse.json({ error: `"${value}" already exists in this category` }, { status: 400 });

    // Get max sortOrder
    const maxSort = await db.dropdownOption.aggregate({
      where: { category },
      _max: { sortOrder: true },
    });

    const option = await db.dropdownOption.create({
      data: {
        category,
        value: value.trim(),
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });
    return NextResponse.json({ option });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/options?category=xxx&value=yyy — delete an option (admin only)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const category = url.searchParams.get("category");
    const value = url.searchParams.get("value");

    if (id) {
      await db.dropdownOption.delete({ where: { id } });
    } else if (category && value) {
      await db.dropdownOption.deleteMany({ where: { category, value } });
    } else {
      return NextResponse.json({ error: "Either id or (category + value) is required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
