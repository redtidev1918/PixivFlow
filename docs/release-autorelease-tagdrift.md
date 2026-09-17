# Release tag / autorelease label repair (2026-09-18)

release-please aborts with "untagged, merged release PRs outstanding" while a
merged release-please PR still carries the `autorelease: pending` label. This
happened for PR #99 (v2.23.0) after that version was shipped through an alternate
`chore(release)` branch, leaving the release-please state stale.

When a merge/publish bypasses the release-please PR, reconcile the PR label to
the state the rest of the history uses:

\`\`\`bash
gh pr edit <N> --add-label "autorelease: tagged" --remove-label "autorelease: pending"
\`\`\`

The v2.23.0 tag was also re-pointed at the release-please merge commit so the
tag matches the actual release commit (code is byte-identical; only the pinned
ReleaseGraph workflow ref differs, and deployments pin commit SHAs, not tags).
