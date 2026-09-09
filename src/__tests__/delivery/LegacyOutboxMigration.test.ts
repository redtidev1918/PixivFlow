/**
 * Legacy file-based outbox -> SQLite outbox migration (idempotent, crash-safe).
 */
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../../storage/Database";
import { migrateLegacyOutbox, legacyOutboxDir } from "../../delivery/LegacyOutboxMigration";

describe("migrateLegacyOutbox", () => {
  let dir: string;
  let db: Database;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pf-legacy-"));
    db = new Database(join(dir, "pixivflow.db"));
    db.migrate();
  });
  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("imports a pending delivery manifest as a due outbox row", async () => {
    const outDir = legacyOutboxDir(db.getDatabasePath());
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "m1.json"), JSON.stringify({
      version: 1, id: "abc", kind: "delivery", status: "pending", deliveryTarget: "bot1",
      artifact: { pixivId: "123", type: "illustration", files: ["/tmp/a.jpg"], title: "T", tags: ["x"] },
      request: { fields: { caption: "hi" } },
    }));

    const res1 = migrateLegacyOutbox(db);
    expect(res1.imported).toBe(1);

    const counts = db.outbox.counts();
    expect(counts.pending + counts.processing + counts.retryWait).toBe(1);
    // manifest archived after commit
    const due = db.outbox.claimDue("test", 60_000, 10);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe("delivery");

    // Idempotent: archived manifests are not re-imported.
    const res2 = migrateLegacyOutbox(db);
    expect(res2.scanned).toBe(0);
    expect(res2.imported).toBe(0);
  });

  it("backfills already-delivered manifests into the delivery ledger", async () => {
    const outDir = legacyOutboxDir(db.getDatabasePath());
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "d1.json"), JSON.stringify({
      version: 1, id: "done", kind: "delivery", status: "delivered", deliveryTarget: "bot2",
      artifact: { pixivId: "999", type: "novel", files: ["/x.txt"] },
    }));

    const res = migrateLegacyOutbox(db);
    expect(res.delivered).toBe(1);
    expect(db.deliveries.isDelivered("bot2", "novel", "999")).toBe(true);
  });
});