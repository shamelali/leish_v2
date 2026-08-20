import { env, isProd } from "@/lib/env";
import { logger } from "@/server/logger";
import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

let pgPool: pg.Pool | null = null;
let sqliteDb: InstanceType<typeof DatabaseSync> | null = null;

function getPgPool() {
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: isProd ? { rejectUnauthorized: false } : false,
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      maxUses: 7500,
      // Prevent pool exhaustion hang - fail fast
      statement_timeout: 10000,
      query_timeout: 10000,
    });
    pgPool.on("error", (e) => logger.error({ err: e }, "pg pool error"));
    // Metrics
    setInterval(() => {
      logger.info({ total: pgPool!.totalCount, idle: pgPool!.idleCount, waiting: pgPool!.waitingCount }, "pg pool stats");
    }, 60000).unref();
  }
  return pgPool;
}

function getSqlite(): InstanceType<typeof DatabaseSync> {
  if (!sqliteDb) {
    const dbPath = env.LEISH_DB_PATH || "./data/leish.db";
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqliteDb = new DatabaseSync(dbPath);
    // CRITICAL: Enable WAL for concurrent writes
    sqliteDb.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    const schemaPath = "src/server/db/schema.sql";
    if (fs.existsSync(schemaPath)) sqliteDb.exec(fs.readFileSync(schemaPath,"utf8"));
  }
  return sqliteDb;
}

export function getDbV2() {
  const usePostgres = !!env.DATABASE_URL;
  return {
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      if (usePostgres) {
        const client = await getPgPool().connect();
        try { 
          await client.query("BEGIN"); 
          const r = await fn({
            query: (sql:string, params:any[]) => client.query(sql, params),
            prepare: (sql:string) => ({
              get: async (...p:any[]) => (await client.query(sql, p)).rows[0],
              all: async (...p:any[]) => (await client.query(sql, p)).rows,
              run: async (...p:any[]) => { const res = await client.query(sql, p); return { changes: res.rowCount ?? 0 }; }
            })
          }); 
          await client.query("COMMIT"); 
          return r; 
        }
        catch(e){ await client.query("ROLLBACK"); throw e; } finally { client.release(); }
      } else {
        const db = getSqlite();
        db.exec("BEGIN IMMEDIATE");
        try { const r = await fn(db); db.exec("COMMIT"); return r; } catch(e){ db.exec("ROLLBACK"); throw e; }
      }
    },
    prepare(sql: string) {
      if (/\$\{/.test(sql)) throw new Error("SQL injection risk");
      if (usePostgres) {
        return {
          get: async (...params:any[]) => { const res = await getPgPool().query(sql, params); return res.rows[0]; },
          all: async (...params:any[]) => { const res = await getPgPool().query(sql, params); return res.rows; },
          run: async (...params:any[]) => { const res = await getPgPool().query(sql, params); return { changes: res.rowCount ?? 0 }; },
        };
      } else {
        const stmt = getSqlite().prepare(sql);
        return {
          get: async (...p:any[]) => stmt.get(...p) as any,
          all: async (...p:any[]) => stmt.all(...p) as any,
          run: async (...p:any[]) => { const r = stmt.run(...p); return { changes: Number(r.changes) }; },
        };
      }
    },
  };
}
