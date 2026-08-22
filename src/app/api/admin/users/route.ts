import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb, bind, toPublicUser, type UserRow } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { statefulRoute, tryRoute, readJson, jsonError } from "@/server/http";
import { hashPassword } from "@/server/password";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const role = url.searchParams.get("role")?.trim() ?? "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

    const db = getDb();
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    if (search) {
      conditions.push("(name ILIKE @search OR email ILIKE @search)");
      params.search = `%${search}%`;
    }
    if (role && ["customer", "artist", "studio", "admin"].includes(role)) {
      conditions.push("role = @role");
      params.role = role;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    interface CountRow {
      total: number;
    }

    const [rows, countRow] = await Promise.all([
      db
        .prepare(
          `SELECT id, email, name, role, email_verified, created_at
         FROM users ${where}
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit, offset }),
      db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get<CountRow>(params),
    ]);

    return NextResponse.json({
      users: rows,
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  },
  { route: "GET /api/admin/users" },
);

export const POST = statefulRoute(
  async function POST(request: Request) {
    const { user: admin, error } = await requireAdmin(request);
    if (error) return error;

    const body = await readJson<{
      name?: string;
      email?: string;
      role?: string;
      password?: string;
    }>(request);
    if (!body.ok) return body.error;
    const { name, email, role, password } = body.data;

    if (!name || !email || !password) {
      return jsonError("name, email, and password are required", 400);
    }
    if (!["customer", "artist", "studio", "admin"].includes(role ?? "")) {
      return jsonError("role must be customer, artist, studio, or admin", 400);
    }

    const db = getDb();

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return jsonError("A user with this email already exists", 409);
    }

    const id = randomUUID();
    const hashedPassword = hashPassword(password);

    await db
      .prepare(
        `INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at)
       VALUES (@id, @email, @name, @role, @password, 0, 0, @created_at)`,
      )
      .run(
        bind({
          id,
          email,
          name,
          role: role ?? "customer",
          password: hashedPassword,
          created_at: new Date().toISOString(),
        }),
      );

    const created = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(id);
    if (!created) {
      return jsonError("Failed to create user", 500);
    }

    await logAdminAction(admin.id, "create_user", "users", id, { email, role });

    return NextResponse.json({ user: toPublicUser(created) }, { status: 201 });
  },
  { route: "POST /api/admin/users" },
);
