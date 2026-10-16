import type { SQLiteDatabase } from "expo-sqlite";

const writes = new WeakMap<SQLiteDatabase, Promise<void>>();

/**
 * A workout aggregate, its revision, and its outbox snapshot are one commit.
 * Cloud adoption uses the same queue, so it cannot inspect a half-saved edit.
 * Pass the transaction handle to helpers; never open a nested transaction.
 */
export async function withWorkoutTransaction<T>(
  db: SQLiteDatabase,
  operation: (txn: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const previous = writes.get(db) ?? Promise.resolve();
  let result!: T;
  const write = previous
    .catch(() => {})
    .then(() =>
      db.withExclusiveTransactionAsync(async (txn) => {
        result = await operation(txn);
      }),
    );
  writes.set(db, write);
  try {
    await write;
    return result;
  } finally {
    if (writes.get(db) === write) writes.delete(db);
  }
}
