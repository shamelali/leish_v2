import { NextResponse } from "next/server";
import { getDb, toPublicUser, type UserRow } from "@/server/db";
import { requireAdmin, logAdminAction, atomicAdminGuard } from "@/server/admin-auth";
import { statefulRoute, tryRoute, readJson, jsonError } from "@/server/http";
import { hashPassword } from "@/server/password";

export const GET = tryRoute(
  async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(_request);
    if (error) return error;

    const { id } = await params;
    const db = getDb();
    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(id);
    if (!user) {
      return jsonError("User not found", 404);
    }

    return NextResponse.json({ user: toPublicUser(user) });
  },
  { route: "GET /api/admin/users/[id]" },
);

export const PATCH = statefulRoute(
  async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user: admin, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const db = getDb();

    const existing = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(id);
    if (!existing) {
      return jsonError("User not found", 404);
    }

    const body = await readJson<{
      name?: string;
      email?: string;
      role?: string;
      email_verified?: boolean;
      password?: string;
    }>(request);
    if (!body.ok) return body.error;
    const { name, email, role, email_verified, password } = body.data;

    if (role && !["customer", "artist", "studio", "admin"].includes(role)) {
      return jsonError("Invalid role", 400);
    }

    // Atomic lockout guard: demote only if >1 admin remains.
    if (existing.role === "admin" && role !== undefined && role !== "admin") {
      const guard = await atomicAdminGuard(id, "demote");
      if (!guard.ok) {
        return jsonError(guard.reason, 409);
      }
    }

    if (email && email !== existing.email) {
      const dup = await db
        .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .get(email, id);
      if (dup) {
        return jsonError("A user with this email already exists", 409);
      }
    }

    const updates: string[] = [];
    const bindParams: Record<string, string | number> = {};

    if (name !== undefined) {
      updates.push("name = @name");
      bindParams.name = name;
    }
    if (email !== undefined) {
      updates.push("email = @email");
      bindParams.email = email;
    }
    if (role !== undefined) {
      updates.push("role = @role");
      bindParams.role = role;
    }
    if (email_verified !== undefined) {
      updates.push("email_verified = @email_verified");
      bindParams.email_verified = email_verified ? 1 : 0;
    }
    if (password) {
      updates.push("password = @password");
      bindParams.password = hashPassword(password);
    }

    if (updates.length === 0) {
      return jsonError("No fields to update", 400);
    }

    await db
      .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = @id`)
      .run({ ...bindParams, id });

    const updated = await db.prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(id);
    if (!updated) {
      return jsonError("User not found", 404);
    }

    await logAdminAction(
      admin.id,
      "update_user",
      "users",
      id,
      {
        fields: Object.keys(body.data).filter(
          (k) => body.data[k as keyof typeof body.data] !== undefined,
        ),
      },
      // Role changes are sensitive — require audit trail.
      { requireAudit: role !== undefined },
    );

    return NextResponse.json({ user: toPublicUser(updated) });
  },
  { route: "PATCH /api/admin/users/[id]" },
);

export const DELETE = statefulRoute(
  async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user: admin, error } = await requireAdmin(_request);
    if (error) return error;

    const { id } = await params;
    const db = getDb();

    const existing = await db.prepare("SELECT id, role FROM users WHERE id = ?").get<{
      id: string;
      role: string;
    }>(id);
    if (!existing) {
      return jsonError("User not found", 404);
    }

    // Atomic lockout guard: delete only if >1 admin remains.
    if (existing.role === "admin") {
      const guard = await atomicAdminGuard(id, "delete");
      if (!guard.ok) {
        return jsonError(guard.reason, 409);
      }
    } else {
      // Non-admin: plain delete (atomicAdminGuard already ran for admin case).
      await db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }

    await logAdminAction(admin.id, "delete_user", "users", id, {}, { requireAudit: true });

    return NextResponse.json({ ok: true });
  },
  { route: "DELETE /api/admin/users/[id]" },
);
