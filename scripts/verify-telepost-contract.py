"""Run the built producer against TelePost's actual HTTP/application/SQLite path.

Usage: python scripts/verify-telepost-contract.py /path/to/TelePost
Only identity verification and the external Telegram staging port are doubles.
No real account, source content, network service or production database is used.
"""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

PRODUCER = Path(__file__).resolve().parent.parent
CONSUMER = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(CONSUMER))
os.environ.update(TESTING="true", TOKEN="test_token_123456789", CHANNEL_ID="@test_channel",
                  OWNER_ID="123456789", REVIEW_CHAT_ID="-100123", SUBMIT_LIMIT_PER_HOUR="1000")

from aiohttp import web
from aiohttp.test_utils import TestServer
from database import db_manager
from handlers import review
from utils import api_server


class Stager:
    def __init__(self):
        self.stages = 0
        self.controls = 0

    async def stage_local(self, files, *, message_ids, specs, **kwargs):
        self.stages += 1
        media, documents = [], []
        for index, item in enumerate(files):
            assert Path(item["path"]).read_bytes(), "multipart upload lost its bytes"
            entry = {"type": item["kind"], "file_id": f"fixture-{self.stages}-{index}"}
            if item["kind"] == "document":
                entry["filename"] = item["filename"]
                documents.append(entry)
            else:
                media.append(entry)
            message_ids.append(self.stages * 100 + index)
            specs.append({"kind": item["kind"], "file_id": entry["file_id"]})
        return media, documents, message_ids, []

    async def send_control_message_id(self, **kwargs):
        self.controls += 1
        return self.controls * 1000

    async def notify_reused(self, row):
        pass

    async def cleanup_files(self, files):
        pass

    async def delete_preview_messages(self, ids):
        pass


async def main():
    principal = {
        "kind": "service",
        "telegram_user_id": 123456789,
        "name": "contract-fixture",
        "surface": "api",
        "actor_subject": "api_token:1",
        "token_id": 1,
    }
    with tempfile.TemporaryDirectory(prefix="telepost-contract-") as temporary, ExitStack() as stack:
        previous = Path.cwd()
        os.chdir(temporary)
        stack.callback(os.chdir, previous)
        stack.enter_context(patch.object(db_manager, "DB_PATH", str(Path(temporary) / "reviews.db")))
        stack.enter_context(patch.object(api_server, "REVIEW_CHAT_ID", -100123))
        stack.enter_context(patch.object(review, "REVIEW_CHAT_ID", -100123))
        stack.enter_context(patch.object(api_server, "_resolve_principal", AsyncMock(return_value=principal)))
        stager = Stager()
        stack.enter_context(patch.object(review, "_stager", lambda bot: stager))
        await db_manager.init_db()
        application = MagicMock()
        app = web.Application()
        api_server.add_api_routes(app, application)
        server = TestServer(app)
        await server.start_server()
        try:
            process = await asyncio.create_subprocess_exec(
                shutil.which("node") or "node", str(PRODUCER / "scripts/verify-telepost-contract.cjs"),
                str(server.make_url("/api/v1/submissions")), temporary,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            try:
                output, _ = await asyncio.wait_for(process.communicate(), timeout=90)
            except BaseException:
                process.kill()
                await process.wait()
                raise
            print(output.decode("utf-8", errors="replace"))
            assert process.returncode == 0, "producer/consumer contract failed"
            async with db_manager.get_db() as conn:
                rows = await (await conn.execute("SELECT * FROM pending_reviews")).fetchall()
            assert len(rows) == 3, "ACK loss or validation rejection created extra reviews"
            assert stager.stages == stager.controls == 3, "replay repeated external staging"
            assert all(row["status"] == "pending" for row in rows)
            assert all(row["submitter_user_id"] is None and row["actor_kind"] == "service" for row in rows)
            assert sorted(len(json.loads(row["media_json"] or "[]")) for row in rows) == [0, 0, 12]
            print("VERIFIED: real HTTP parsing, durable review, ownership, replay, validation; 3 reviews / 3 stages")
        finally:
            await server.close()


if __name__ == "__main__":
    asyncio.run(main())
    # The transport harness doubles the external staging port. Keep the actual
    # Telegram adapters' album/typing/retry/recovery regressions in this SAME
    # required check, so a broken sender cannot hide behind a green wire test.
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--no-cov", "-o", "log_cli=false", "-o", "addopts=",
         "tests/test_staging_recovery.py", "tests/test_media_delivery_pipeline.py",
         "tests/test_mixed_media_integrity.py", "tests/test_review_service.py",
         "tests/test_publish_regressions.py", "tests/test_submission_timeout_idempotency.py"],
        cwd=CONSUMER, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
    )
    print(result.stdout if result.returncode else "\n".join(result.stdout.splitlines()[-8:]))
    if result.returncode:
        print(result.stderr)
        raise SystemExit(result.returncode)
