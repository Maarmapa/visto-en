import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  published_at TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  post_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consent (
  post_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS measurements (
  phase TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  engine TEXT NOT NULL,
  cites_domain INTEGER NOT NULL,
  cites_page INTEGER NOT NULL,
  cites_creator INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (phase, prompt_id, engine)
);
`;

let warningHooked = false;

function ignoreSqliteExperimentalWarning() {
  if (warningHooked) return;
  warningHooked = true;
  process.on("warning", (warning) => {
    if (warning.name === "ExperimentalWarning" && String(warning.message).includes("SQLite")) {
      return;
    }
    console.warn(warning.stack || warning.toString());
  });
}

export async function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  ignoreSqliteExperimentalWarning();
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "visto.sqlite"));
    db.exec(SCHEMA);
    return new SqliteStore(db);
  } catch (error) {
    console.warn(`node:sqlite no disponible (${error.message}). Se usa JSON en disco.`);
    return new JsonStore(dataDir);
  }
}

class SqliteStore {
  constructor(db) {
    this.db = db;
    this.kind = "sqlite";
  }

  replacePosts(posts) {
    this.#tx(() => {
      this.db.exec("DELETE FROM posts");
      const insert = this.db.prepare("INSERT INTO posts (id, published_at, json) VALUES (?, ?, ?)");
      for (const post of posts) insert.run(post.id, post.publishedAt, JSON.stringify(post));
    });
  }

  getPosts() {
    return this.db.prepare("SELECT json FROM posts ORDER BY published_at DESC").all()
      .map((row) => JSON.parse(row.json));
  }

  replacePages(pages) {
    this.#tx(() => {
      this.db.exec("DELETE FROM pages");
      const insert = this.db.prepare("INSERT INTO pages (post_id, path, url, json) VALUES (?, ?, ?, ?)");
      for (const page of pages) insert.run(page.post.id, page.path, page.url, JSON.stringify(page));
    });
  }

  getPages() {
    return this.db.prepare("SELECT json FROM pages").all().map((row) => JSON.parse(row.json));
  }

  replaceConsent(rows) {
    this.#tx(() => {
      this.db.exec("DELETE FROM consent");
      const insert = this.db.prepare("INSERT INTO consent (post_id, status, json) VALUES (?, ?, ?)");
      for (const row of rows) insert.run(row.postId, row.status, JSON.stringify(row));
    });
  }

  getConsent() {
    return this.db.prepare("SELECT json FROM consent").all().map((row) => JSON.parse(row.json));
  }

  replaceMeasurements(rows) {
    this.#tx(() => {
      this.db.exec("DELETE FROM measurements");
      const insert = this.db.prepare(`INSERT INTO measurements
        (phase, prompt_id, engine, cites_domain, cites_page, cites_creator, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const row of rows) {
        insert.run(row.phase, row.promptId, row.engine, row.citesDomain, row.citesPage, row.citesCreator, JSON.stringify(row));
      }
    });
  }

  getMeasurements() {
    return this.db.prepare("SELECT json FROM measurements ORDER BY phase, prompt_id, engine").all()
      .map((row) => JSON.parse(row.json));
  }

  close() {
    this.db.close();
  }

  #tx(fn) {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

class JsonStore {
  constructor(dataDir) {
    this.file = join(dataDir, "store.json");
    this.kind = "json";
    this.data = { posts: [], pages: [], consent: [], measurements: [] };
    this.#flush();
  }

  replacePosts(posts) {
    this.data.posts = posts;
    this.#flush();
  }

  getPosts() {
    return this.data.posts;
  }

  replacePages(pages) {
    this.data.pages = pages;
    this.#flush();
  }

  getPages() {
    return this.data.pages;
  }

  replaceConsent(rows) {
    this.data.consent = rows;
    this.#flush();
  }

  getConsent() {
    return this.data.consent;
  }

  replaceMeasurements(rows) {
    this.data.measurements = rows;
    this.#flush();
  }

  getMeasurements() {
    return this.data.measurements;
  }

  close() {}

  #flush() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}
