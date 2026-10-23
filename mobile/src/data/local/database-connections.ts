import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

const connections = new Map<string, Promise<SQLiteDatabase>>();

/**
 * Keep one native connection lease per scoped database for this app process.
 * Expo's provider closes its lease immediately on unmount, while outstanding
 * reads/finalizers can still use that handle. Its native cached connection is
 * reference counted: this extra lease prevents closing a busy handle during an
 * account switch. The provider still selects only the authenticated owner's DB.
 */
export async function retainScopedDatabaseConnection(
  name: string,
  database: SQLiteDatabase,
) {
  const path = database.databasePath;
  let connection = connections.get(path);
  if (!connection) {
    connection = openDatabaseAsync(name);
    connections.set(path, connection);
  }
  try {
    await connection;
  } catch (error) {
    if (connections.get(path) === connection) connections.delete(path);
    throw error;
  }
}
