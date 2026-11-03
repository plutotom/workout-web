import type { SQLiteDatabase } from "expo-sqlite";

const writes = new WeakMap<SQLiteDatabase, Promise<unknown>>();
const serialized = new WeakSet<SQLiteDatabase>();

const BUSY_RETRIES = 8;
const BUSY_BASE_MS = 15;
const BUSY_TIMEOUT_MS = 5000;

/** Applied on every connection. WAL lets a live-workout read overlap a write. */
export const LOCAL_DATABASE_PRAGMAS = `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`;

/**
 * Expo's `withExclusiveTransactionAsync` opens a *second* native connection
 * and `BEGIN`s there. Set autosave, outbox drain, and statement `finalizeAsync`
 * used to overlap that connection with the provider connection, which surfaces
 * as `database is locked` (SQLITE_BUSY). One JS queue per database object
 * makes writers wait their turn; WAL + busy_timeout + retries cover leftover
 * races with reads.
 */
export function serializeDatabaseWrites(db: SQLiteDatabase) {
  if (serialized.has(db)) return db;
  serialized.add(db);

  const exclusive = db.withExclusiveTransactionAsync?.bind(db);
  if (exclusive) {
    db.withExclusiveTransactionAsync = async (operation) => {
      await enqueueDatabaseWrite(db, () =>
        retryBusy(() =>
          exclusive(async (txn) => {
            await prepareWriteConnection(txn);
            await operation(txn);
          }),
        ),
      );
    };
  }

  return db;
}

/**
 * A workout aggregate, its revision, and its outbox snapshot are one commit.
 * Cloud adoption uses the same queue, so it cannot inspect a half-saved edit.
 * Pass the transaction handle to helpers; never open a nested transaction.
 */
export async function withWorkoutTransaction<T>(
  db: SQLiteDatabase,
  operation: (txn: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  serializeDatabaseWrites(db);
  let result!: T;
  await db.withExclusiveTransactionAsync(async (txn) => {
    result = await operation(txn);
  });
  return result;
}

/** Standalone writes (outbox attempts) wait for exclusive workout saves. */
export async function runDatabaseWrite<T>(
  db: SQLiteDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  serializeDatabaseWrites(db);
  return enqueueDatabaseWrite(db, () => retryBusy(operation));
}

export async function enqueueDatabaseWrite<T>(
  db: SQLiteDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = writes.get(db) ?? Promise.resolve();
  let result!: T;
  const write = previous
    .catch(() => undefined)
    .then(async () => {
      result = await operation();
    });
  writes.set(db, write);
  try {
    await write;
    return result;
  } finally {
    if (writes.get(db) === write) writes.delete(db);
  }
}

export function isTransientDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(message) ||
    (/Error code 5/.test(message) && /SQLite/i.test(message)) ||
    (/finalizeAsync/i.test(message) &&
      /SQLite|database is locked/i.test(message))
  );
}

export function isRawSqliteErrorMessage(message: string) {
  return /SQLiteErrorException|FunctionCallException|finalizeAsync|ExpoModulesCore|ExpoSQLite|Error code \d+|database is locked|SQLITE_/i.test(
    message,
  );
}

export function userFacingDatabaseError(error: unknown, fallback: string) {
  if (
    isTransientDatabaseError(error) ||
    (error instanceof Error && isRawSqliteErrorMessage(error.message))
  ) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

async function prepareWriteConnection(db: SQLiteDatabase) {
  if (typeof db.execAsync !== "function") return;
  try {
    await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  } catch {
    // Node adapters and some in-flight transactions reject this PRAGMA.
  }
}

async function retryBusy<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < BUSY_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === BUSY_RETRIES - 1) {
        throw error;
      }
      await delay(BUSY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
