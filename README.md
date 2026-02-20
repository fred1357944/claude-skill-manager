# Claude Skill Manager

An [Obsidian](https://obsidian.md/) plugin for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) slash commands (`~/.claude/commands/`) directly inside Obsidian.

Browse, search, create, edit, tag, and sync your skills — all from a sidebar panel.

## Features

- **Browse & search** — View all your Claude Code skills in a sidebar panel with instant search
- **Create & edit** — Add new slash commands or modify existing ones with frontmatter support
- **Tag management** — Organize skills with tags, stored in `~/.claude/skill_meta.json`
- **Git sync** — Push/pull your skills to a remote Git repo for cross-machine deployment
- **Shared data layer** — Works alongside other tools that read `~/.claude/commands/`

## Screenshots

### Skill list with search and detail preview

```
┌─────────────────────────────────────────────┐
│  Skills (4/4)                    [+ New] [Sync]│
│  ┌──────────────────────────────────────────┐│
│  │ Search skills...                         ││
│  ├────────────┬─────────────────────────────┤│
│  │ /recall    │ /save                       ││
│  │  #tracker  │                             ││
│  │ /save      │ Save current project        ││
│  │  #tracker  │ session progress. Use       ││
│  │ /blog      │ "/save done" to mark        ││
│  │ /press-rel │ project as completed.       ││
│  │            │                             ││
│  │            │ → [topic] [done]            ││
│  │            │ #tracker                    ││
│  │            │                             ││
│  │            │ [Edit] [Tags] [Delete]      ││
│  │            │                             ││
│  │            │ # /save — Save Current...   ││
│  ├────────────┴─────────────────────────────┤│
│  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## Example skills

The plugin manages standard Claude Code slash commands. Here are two examples:

### /save — Save session progress

```markdown
---
description: Save current project session progress. Use "/save done" to mark project as completed.
argument-hint: [done]
---

# /save — Save Current Session

You are a session tracker. Your job is to snapshot the current project state and save it.
...
```

### /recall — Recall saved sessions

```markdown
---
description: Recall saved session progress across all tracked projects.
---

# /recall — Recall Session Progress

You are a session tracker. Your job is to display saved session information clearly and helpfully.
...
```

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins**
2. Search for **Claude Skill Manager**
3. Click **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/fred1357944/claude-skill-manager/releases)
2. Create folder: `<your-vault>/.obsidian/plugins/claude-skill-manager/`
3. Copy the three files into that folder
4. Enable the plugin in **Settings → Community plugins**

## Usage

1. Click the terminal icon in the left ribbon, or use the command palette: **Open Skill Manager**
2. Browse your skills in the left panel, click one to see details on the right
3. Use the toolbar buttons:
   - **+ New** — Create a new slash command
   - **Sync** — Push/pull skills to a Git remote

### Commands

| Command | Description |
|---------|-------------|
| Open Skill Manager | Open the skill manager sidebar |
| Reload Skills | Refresh the skill list from disk |
| Push Skills to Remote | Open the Git sync dialog |

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Commands directory | Path to your Claude commands folder | `~/.claude/commands/` |
| Git remote URL | Remote repo for syncing skills | (empty) |

## How it works

- Reads `.md` files from `~/.claude/commands/`
- Parses YAML frontmatter (`description`, `argument-hint`)
- Stores tag metadata in `~/.claude/skill_meta.json`
- Git operations use the system `git` command via `child_process`

## Requirements

- **Desktop only** — Uses Node.js `fs` and `child_process` (not available on mobile)
- **Git** — Required for sync features (optional if you only browse/edit)

## Network disclosure

This plugin accesses the network only when you explicitly use the **Git Sync** feature to push/pull skills to a remote Git repository. No telemetry or analytics are collected.

## License

[MIT](LICENSE)
