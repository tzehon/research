import { DatabaseSync } from 'node:sqlite';
export const phases = ['Investigating', 'Fixing', 'Validating', 'PR Ready', 'Blocked'] as const;
export type Phase = (typeof phases)[number];
export type Incident = {
  id: string;
  phase: Phase;
  created: number;
  revision: string;
  deployment: string;
  threadId?: string;
  turnId?: string;
  worktree?: string;
  branch?: string;
  attempts: number;
  tokens: number;
  deadline: number;
  diagnosis?: string;
  outcome?: unknown;
  validation?: any;
  diff?: string;
  prUrl?: string;
  publishing?: string;
  error?: string;
  deployed?: boolean;
  recovered?: boolean;
  candidateRevision?: string;
};
const edges: Record<Phase, Phase[]> = {
  Investigating: ['Fixing', 'Blocked'],
  Fixing: ['Validating', 'Blocked'],
  Validating: ['PR Ready', 'Blocked'],
  'PR Ready': ['Blocked'],
  Blocked: ['Investigating', 'Fixing', 'Validating', 'PR Ready'],
};
export function transition(from: Phase, to: Phase) {
  if (from !== to && !edges[from].includes(to))
    throw new Error(`Invalid transition ${from} → ${to}`);
}
export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, deployment TEXT UNIQUE NOT NULL, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, incident TEXT, at INTEGER NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL);`
    );
  }
  get<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as any;
    return r ? JSON.parse(r.value) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare('INSERT INTO kv VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, JSON.stringify(value));
  }
  all(): Incident[] {
    return (this.db.prepare('SELECT json FROM incidents ORDER BY rowid DESC').all() as any[]).map(
      (r) => JSON.parse(r.json)
    );
  }
  incident(id: string): Incident {
    const i = this.all().find((i) => i.id === id);
    if (!i) throw new Error('Incident not found');
    return i;
  }
  create(i: Incident) {
    if (this.all().some((x) => !x.recovered)) return false;
    const result = this.db
      .prepare('INSERT OR IGNORE INTO incidents VALUES (?,?,?)')
      .run(i.id, i.deployment, JSON.stringify(i));
    return result.changes === 1;
  }
  save(i: Incident) {
    const old = this.incident(i.id);
    transition(old.phase, i.phase);
    this.db.prepare('UPDATE incidents SET json=? WHERE id=?').run(JSON.stringify(i), i.id);
  }
  event(incident: string | null, kind: string, data: unknown) {
    this.db
      .prepare('INSERT INTO events(incident,at,kind,json) VALUES (?,?,?,?)')
      .run(incident, Date.now(), kind, JSON.stringify(data));
  }
  events(after = 0) {
    return (
      this.db.prepare('SELECT * FROM events WHERE id>? ORDER BY id LIMIT 1000').all(after) as any[]
    ).map((r) => ({ ...r, data: JSON.parse(r.json), json: undefined }));
  }
  reset() {
    this.db.exec('DELETE FROM incidents; DELETE FROM events; DELETE FROM kv;');
  }
  close() {
    this.db.close();
  }
}
