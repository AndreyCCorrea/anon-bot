import Database from 'better-sqlite3';
import path from 'path';

// Create or open the media.db file
const dbPath = path.resolve(process.cwd(), 'media.db');
const db = new Database(dbPath);

// Initialize table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS SentMessage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    messageId INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertStmt = db.prepare('INSERT INTO SentMessage (telegramId, messageId) VALUES (?, ?)');
const getAllStmt = db.prepare('SELECT telegramId, messageId FROM SentMessage');
const truncateStmt = db.prepare('DELETE FROM SentMessage');

export function insertMedia(telegramId: number | string, messageId: number) {
  insertStmt.run(telegramId.toString(), messageId);
}

export function getAllMedia(): { telegramId: string; messageId: number }[] {
  return getAllStmt.all() as { telegramId: string; messageId: number }[];
}

export function deleteAllMedia() {
  truncateStmt.run();
}
