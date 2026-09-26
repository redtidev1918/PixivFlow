/**
 * TelePost compatibility: the vendor boundary, pinned against the vendor's code.
 *
 * `httpMultipart` exists to talk to one concrete counterparty, TelePost, and the
 * counterparty's real reply shape is not what a generic "2xx = success" client
 * would guess:
 *
 *  - `data.status` is a RECORD state (`pending_review` / `published` / `failed`),
 *    not a transport result;
 *  - `data.business_status` is the formal business ACK (`accepted` /
 *    `idempotent_replay` / `duplicate_existing` / `retryable_failure` /
 *    `permanent_failure`) and is ALWAYS paired with a matching HTTP status;
 *  - `data.reuse_reason` is the only thing that distinguishes an ACK-loss replay
 *    of OUR key (`idempotent_replay`) from a DIFFERENT intent that already
 *    published the same work (`duplicate_existing`).
 *
 * Every body below is copied from TelePost's emitter, `utils/api_server.py`
 * (`_business_ack` / `_failure_ack` / `_ok`), and every expectation is the
 * downstream consequence stated in TelePost's `docs/API.md` §「投稿业务 ACK」.
 * If either repo changes a wire fact, this file is where the two are forced to
 * disagree out loud instead of silently double-posting or losing a failure.
 */
import { DeliveryAck, parseDeliveryAck } from '../../delivery/DeliveryAck';

/** TelePost's envelope is `{ok, data}`; the parser defaults to `data`. */
function ackFrom(status: number, body: unknown): DeliveryAck {
  return parseDeliveryAck(status, body);
}

describe('TelePost submission ACK compatibility', () => {
  describe('every formal business_status maps to the right downstream kind', () => {
    const cases: Array<{ label: string; status: number; body: unknown; kind: DeliveryAck['kind']; remoteId?: string }> = [
      {
        label: 'accepted — fresh submission parked in the review queue',
        status: 201,
        kind: 'accepted',
        remoteId: '7',
        body: {
          ok: true,
          data: {
            status: 'pending_review',
            reused: false,
            review_id: 7,
            business_status: 'accepted',
          },
        },
      },
      {
        label: 'accepted — direct publish (Mini App, review disabled)',
        status: 201,
        kind: 'accepted',
        remoteId: '123',
        body: {
          ok: true,
          data: {
            status: 'published',
            reused: false,
            message_id: 123,
            link: 'https://t.me/channel/123',
            media_count: 1,
            document_count: 1,
            business_status: 'accepted',
          },
        },
      },
      {
        label: 'idempotent_replay — our key already completed; NOT a second post',
        status: 200,
        kind: 'idempotent_replay',
        remoteId: '123',
        body: {
          ok: true,
          data: {
            status: 'published',
            reused: true,
            reuse_reason: 'idempotent_replay',
            matched_idempotency_key: 'source:123',
            message_id: 123,
            business_status: 'idempotent_replay',
          },
        },
      },
      {
        label: 'duplicate_existing — another intent published the same work',
        status: 200,
        kind: 'duplicate_existing',
        remoteId: '9',
        body: {
          ok: true,
          data: {
            status: 'published',
            reused: true,
            reuse_reason: 'duplicate_existing',
            matched_idempotency_key: 'other:slot',
            message_id: 9,
            business_status: 'duplicate_existing',
          },
        },
      },
      {
        label: 'permanent_failure — deterministic rejection (reused FAILED record)',
        status: 400,
        kind: 'permanent_failure',
        body: {
          ok: false,
          data: {
            status: 'failed',
            reused: true,
            reuse_reason: 'idempotent_replay',
            business_status: 'permanent_failure',
          },
        },
      },
      {
        label: 'permanent_failure — validation rejection',
        status: 400,
        kind: 'permanent_failure',
        body: { ok: false, data: { business_status: 'permanent_failure', reason: 'invalid_tags' } },
      },
      {
        label: 'retryable_failure — Telegram state unknown after a timeout',
        status: 503,
        kind: 'retryable_failure',
        body: { ok: false, data: { business_status: 'retryable_failure', reason: 'timed out' } },
      },
    ];

    it.each(cases)('$label', ({ status, body, kind, remoteId }) => {
      const ack = ackFrom(status, body);
      expect(ack.kind).toBe(kind);
      if (remoteId !== undefined) expect(ack).toMatchObject({ remoteId });
    });
  });

  describe('the record id survives the reuse paths', () => {
    it('prefers review_id over message_id so the ledger points at the review, not a post', () => {
      // Review mode is the API-token default, so the pinned record is a review.
      // A retry can only ever return that same review — recording the channel
      // message id instead would misattribute what is still unpublishable.
      const ack = ackFrom(201, {
        ok: true,
        data: { status: 'pending_review', review_id: 7, reused: false, business_status: 'accepted' },
      });
      expect(ack).toMatchObject({ kind: 'accepted', remoteId: '7', remoteStatus: 'pending_review' });
    });

    it('falls back to message_id when there is no review (direct publish)', () => {
      const ack = ackFrom(201, {
        ok: true,
        data: { status: 'published', message_id: 123, reused: false, business_status: 'accepted' },
      });
      expect(ack).toMatchObject({ kind: 'accepted', remoteId: '123', remoteStatus: 'published' });
    });

    it('carries matched_idempotency_key through a historical duplicate for audit', () => {
      const ack = ackFrom(200, {
        ok: true,
        data: {
          status: 'published',
          reused: true,
          reuse_reason: 'duplicate_existing',
          matched_idempotency_key: 'yesterday:slot-a',
          message_id: 9,
          business_status: 'duplicate_existing',
        },
      });
      expect(ack).toMatchObject({ kind: 'duplicate_existing', remoteId: '9', matchedKey: 'yesterday:slot-a' });
    });
  });

  describe('business_status is an HTTP status, not a field we branch on', () => {
    it('never sees a 2xx carrying a failure business_status', () => {
      // TelePost computes the pair together in `_business_ack`/`_failure_ack`, so
      // the 2xx branch of the parser can trust `data.status`. The single entry
      // that classifies a 2xx as a failure is a TERMINAL record status word, and
      // that entry is tested here so a change in either repo is caught.
      const terminal = ackFrom(200, {
        ok: true,
        data: { status: 'failed', reused: true, reuse_reason: 'idempotent_replay' },
      });
      expect(terminal.kind).toBe('remote_failed');
      expect(terminal).toMatchObject({ remoteStatus: 'failed' });
    });

    it('treats a reused PUBLISHED record as a replay, not a remote failure', () => {
      const ack = ackFrom(200, {
        ok: true,
        data: {
          status: 'published',
          reused: true,
          reuse_reason: 'idempotent_replay',
          message_id: 5,
          business_status: 'idempotent_replay',
        },
      });
      expect(ack.kind).toBe('idempotent_replay');
    });
  });

  describe('a 2xx never masks a downstream failure', () => {
    it('reports a failed record as remote_failed rather than accepted', () => {
      // The production incident this guards: a reused `failed` record answered
      // with a 2xx envelope was classified as a replay, the ledger recorded
      // `delivered`, and the Slot cell was promoted to `submitted` — a remote
      // failure reported as end-to-end success.
      const ack = ackFrom(200, {
        ok: true,
        data: { status: 'failed', reused: false, review_id: 42 },
      });
      expect(ack.kind).toBe('remote_failed');
      expect(ack).toMatchObject({ remoteId: '42', remoteStatus: 'failed' });
    });
  });
});
