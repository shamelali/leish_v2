// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, closeDb, withTransaction, type DbFacade } from "../db";

const PG = Boolean(process.env.DATABASE_URL);
const d = PG ? describe : describe.skip;

let uid = 0;
function id(prefix: string) {
  return `${prefix}-${++uid}-${Date.now()}`;
}

beforeAll(async () => {
  if (!PG) return;
  process.env.SESSION_SECRET = "pg-txn-test-secret-32-bytes-long!!!";
  await getDb().prepare("SELECT 1").get();
});

afterAll(async () => {
  if (!PG) return;
  await closeDb();
});

// email_outbox has no foreign keys, so a row can be written without a fixture graph.
const insert = (db: DbFacade, key: string, body: string) =>
  db
    .prepare(
      "INSERT INTO email_outbox (id, to_email, subject, text, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(key, `${key}@test.local`, "txn", body, new Date().toISOString());

const selectRow = (key: string) =>
  getDb().prepare("SELECT text FROM email_outbox WHERE id = ?").get<{ text: string }>(key);

const deleteRow = (key: string) =>
  getDb().prepare("DELETE FROM email_outbox WHERE id = ?").run(key);

/**
 * The Node-only branch of withTransaction: one client checked out of the pool
 * and held for the whole BEGIN..COMMIT. This is what makes the payment
 * settlement path atomic in production — the SQLite suite in db.test.ts cannot
 * reach it, and whether BEGIN works through a transaction-mode pooler only has
 * an answer here.
 */
d("withTransaction (pg backend)", () => {
  it("commits the writes the callback made", async () => {
    const key = id("commit");
    await withTransaction(async (tx) => {
      await insert(tx, key, "inside a transaction");
    });
    expect((await selectRow(key))?.text).toBe("inside a transaction");
    await deleteRow(key);
  });

  it("rolls every write back when the callback throws", async () => {
    const key = id("rollback");
    await expect(
      withTransaction(async (tx) => {
        await insert(tx, key, "doomed");
        throw new Error("settlement blew up");
      }),
    ).rejects.toThrow("settlement blew up");

    expect(await selectRow(key)).toBeUndefined();
  });

  it("keeps uncommitted writes invisible to a reader on another connection", async () => {
    const key = id("isolation");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const writer = withTransaction(async (tx) => {
      await insert(tx, key, "uncommitted");
      await gate;
    });

    // Let the writer reach its open transaction.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const visibleDuring = await selectRow(key);
    release();
    await writer;

    expect(visibleDuring).toBeUndefined();
    expect((await selectRow(key))?.text).toBe("uncommitted");
    await deleteRow(key);
  });

  it("joins an open transaction instead of nesting a second BEGIN", async () => {
    const key = id("joined");
    await expect(
      withTransaction(async (tx) => {
        await insert(tx, key, "outer");
        await withTransaction(async () => {
          // getDb() yields the same facade, so this belongs to the outer txn.
          await getDb().prepare("UPDATE email_outbox SET text = ? WHERE id = ?").run("inner", key);
        });
        throw new Error("outer fails");
      }),
    ).rejects.toThrow("outer fails");

    expect(await selectRow(key)).toBeUndefined();
  });

  it("reuses the transaction for a later statement that fails and retries", async () => {
    const key = id("conflict");
    await insert(getDb(), key, "committed first");

    await expect(
      withTransaction(async (tx) => {
        // A duplicate key aborts the Postgres transaction; everything after it
        // in the same transaction must fail too, and none of it may persist.
        await insert(tx, key, "duplicate");
        await tx.prepare("UPDATE email_outbox SET subject = ? WHERE id = ?").run("never", key);
      }),
    ).rejects.toThrow();

    const row = await selectRow(key);
    expect(row?.text).toBe("committed first");
    await deleteRow(key);
  });
});
