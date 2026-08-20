import { env, isProd } from "@/lib/env";
import { logger } from "@/server/logger";
import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

type DbRow = Record<string, unknown>;
interface Statement {
  get: (...p: unknown[]) => Promise<DbRow | undefined>;
  all: (...p: unknown[]) => Promise<DbRow[]>;
  run: (...p: unknown[]) => Promise<{ lastInsertRowid?: number; changes: number }>;
}

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
      // Prevent pool exhaustion hang
      allowExitOnIdle: false,
    });
    pgPool.on("error", (e) => logger.error({ err: e }, "pg pool error"));
    // Metrics
    setInterval(() => {
      logger.info({ total: pgPool?.totalCount, idle: pgPool?.idleCount, waiting: pgPool?.waitingCount }, "pg pool stats");
    }, 60000).unref();
  }
  return pgPool;
}

function getSqlite(): InstanceType<typeof DatabaseSync> {
  if (!sqliteDb) {
    const dbPath = env.LEISH_DB_PATH || "./data/leish.db";
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqliteDb = new DatabaseSync(dbPath);
    // FIX: Enable WAL for concurrent writes + foreign keys + busy timeout
    sqliteDb.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;");
    const schemaPath = "src/server/db/schema.sql";
    if (fs.existsSync(schemaPath)) sqliteDb.exec(fs.readFileSync(schemaPath,"utf8"));
  }
  return sqliteDb;
}

export function getDb() {
  const usePostgres = !!env.DATABASE_URL;
  return {
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      if (usePostgres) {
        const client = await getPgPool().connect();
        try { 
          await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); 
          const r = await fn({
            query: (sql:string, params:any[]) => client.query(sql, params),
            prepare: (sql:string) => ({
              get: async (...p:any[]) => (await client.query(sql, p)).rows[0],
              all: async (...p:any[]) => (await client.query(sql, p)).rows,
              run: async (...p:any[]) => { const res = await client.query(sql, p); return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows[0]?.id }; }
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
    prepare(sql: string): Statement {
      if (/\$\{/.test(sql)) throw new Error("SQL injection risk: template literal detected");
      // Enforce parameterized
      if (usePostgres) {
        return {
          get: async (...params) => { 
            const res = await getPgPool().query(sql, params); 
            return res.rows[0]; 
          },
          all: async (...params) => { 
            const res = await getPgPool().query(sql, params); 
            return res.rows; 
          },
          run: async (...params) => { 
            const res = await getPgPool().query(sql, params); 
            return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows[0]?.id }; 
          },
        };
      } else {
        const stmt = getSqlite().prepare(sql);
        return {
          get: async (...p) => stmt.get(...p) as any,
          all: async (...p) => stmt.all(...p) as any,
          run: async (...p) => { const r = stmt.run(...p); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; },
        };
      }
    },
  };
}
