# Auto Mover X

An enhanced version of [Auto Note Mover](https://github.com/farux/obsidian-auto-note-mover) for Obsidian with advanced multi-tag support and batch operations.

## What's New

### Multi-Tag Rules with AND/OR Logic

Each rule can now include **multiple tags** with two matching modes:

- **Match any tag (OR)**: Note matches if it has at least one of the specified tags
- **Match all tags (AND)**: Note matches only if it has all of the specified tags

Examples:
- Move notes with both `#project` AND `#completed` to an archive folder
- Move notes with either `#work` OR `#office` to a work folder

### Batch Folder Scanning

New commands to process multiple notes at once:

- **Scan folder and move notes**: Select a folder and move all matching notes recursively
- **Scan folder (dry-run)**: Preview what would be moved without making changes

## How It Works

1. Create rules with destination folder, tags, and/or title patterns
2. Choose tag match mode (AND/OR) for multi-tag rules
3. When a note matches a rule, it automatically moves to the destination folder

Rules are checked in order from top to bottom. The note moves to the first matching rule's folder.

## Commands

| Command | Description |
|---------|-------------|
| **Move the note** | Manually trigger move for the active note |
| **Toggle Auto-Manual** | Switch between Automatic and Manual trigger modes |
| **Scan folder and move notes** | Batch move all matching notes in a folder |
| **Scan folder (dry-run)** | Preview batch operation without moving files |

## Rule Configuration

1. Set the destination folder
2. Add one or more tags (with `#` prefix) and/or a title pattern (regex)
3. Choose tag match mode:
   - **Match any tag (OR)** — matches if note has at least one tag
   - **Match all tags (AND)** — matches only if note has all tags

## Examples

### AND Mode: Archive Completed Projects

Move notes with BOTH `#project` AND `#done` to `Archive/Projects`:

- Tags: `#project`, `#done`
- Match mode: **Match all tags (AND)**

Result:
- `#project #done` — Moved
- `#project` only — Not moved
- `#done` only — Not moved

### OR Mode: Consolidate Work Notes

Move notes with EITHER `#work` OR `#office` to `Work/`:

- Tags: `#work`, `#office`
- Match mode: **Match any tag (OR)**

Result:
- `#work` — Moved
- `#office` — Moved
- `#personal` — Not moved

## Triggers

**Automatic**: Moves notes when you create, edit, or rename them.

**Manual**: Only moves notes when you run the command.

## Notes

- Attached files are not moved but remain linked in the note
- Add `AutoNoteMover: disable` in frontmatter to exclude a note from auto-moving
- Use dry-run before batch operations to preview changes

## Migration

If migrating from the original Auto Note Mover, your settings are automatically converted:
- Single `tag` becomes `tags: [tag]`
- `tagMatchMode` defaults to `any` (same behavior as before)

## Attribution

This plugin is a fork of [Auto Note Mover](https://github.com/farux/obsidian-auto-note-mover) by [faru](https://github.com/farux).

- `suggest.ts` and `file-suggest.ts` from [obsidian-periodic-notes](https://github.com/liamcain/obsidian-periodic-notes) by Liam Cain
- [Popper.js](https://popper.js.org/)

Special thanks to [@pjeby](https://github.com/pjeby) for help with the original plugin.