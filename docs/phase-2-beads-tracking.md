# Phase 2 Beads Tracking

Last updated: 2026-02-24

## Epic

- `lmtt-3ko` — Phase 2: LaTeX parser port with Python parity (`epic`, P1)

## Child Beads

1. `lmtt-3ko.1` — Port parser primitives: comments + math protection (`task`, P1)
2. `lmtt-3ko.2` — Port include resolution + preamble parsing + structure detection (`task`, P1)
3. `lmtt-3ko.3` — Port section/list/environment parsing (`task`, P1)
4. `lmtt-3ko.4` — Implement LaTeXParser facade integration (`feature`, P1)
5. `lmtt-3ko.5` — Add parser parity fixture tests (8+ files) (`task`, P1)
6. `lmtt-3ko.6` — Run Phase 2 parity verification and document gaps (`task`, P1)

## Dependency Order

- `lmtt-3ko.1 -> lmtt-3ko.2 -> lmtt-3ko.3 -> lmtt-3ko.4 -> lmtt-3ko.5 -> lmtt-3ko.6`

## Step 1 (Current Session)

Objective:
- Start Dolt SQL server for beads.
- Move Phase 2 epic and first child bead to `in_progress`.

Commands:

```bash
dolt sql-server --data-dir .beads/dolt-data --host 127.0.0.1 --port 3307
bd update lmtt-3ko --status in_progress --json
bd update lmtt-3ko.1 --status in_progress --json
```

## Resume Checklist

- Check ready work: `bd ready --json`
- View epic children: `bd children lmtt-3ko --json`
- Mark completed task: `bd close <id> --reason "Completed" --json`
- Move next task in progress: `bd update <next-id> --status in_progress --json`
