# NSPB MCP Assistant — Documentation

All user-facing and packaging documentation lives in this folder.

---

## 📚 For end users

Read in this order if you're new:

| # | Document | What it covers |
|---|---|---|
| 1 | [`HOW_TO_INSTALL.md`](HOW_TO_INSTALL.md) | What the installer does, where files / registry keys go, how to load the add-in inside Excel |
| 2 | [`QUICKSTART_USER.md`](QUICKSTART_USER.md) | First-time setup (credentials, KB load) and a 5-minute smoke test |
| 3 | [`USAGE_GUIDE.md`](USAGE_GUIDE.md) | How to use the chat, organized **by what you want to do** — open a form, run a rule, update variables, export a dim, etc. |
| 4 | [`USAGE_CHEATSHEET.md`](USAGE_CHEATSHEET.md) | 1-page printable reference of every command |

## 🛠️ For consultants / IT admins distributing the add-in

| Document | What it covers |
|---|---|
| [`PACKAGING_GUIDE.md`](PACKAGING_GUIDE.md) | How to build the install ZIP, what files to include, permissions the user needs, distribution options (manual / Centralized Deployment), versioning |

## 📦 Legacy (kept for backward compat)

| Document | Notes |
|---|---|
| [`INSTALL_AND_USER_GUIDE.md`](INSTALL_AND_USER_GUIDE.md) | Original combined guide. Superseded by `HOW_TO_INSTALL.md` + `QUICKSTART_USER.md` + `USAGE_GUIDE.md`. Safe to delete once teams are on the new docs. |

---

## Suggested distribution per audience

| Audience | Ship them |
|---|---|
| **End user** (consultant or client analyst) | `HOW_TO_INSTALL.md` + `QUICKSTART_USER.md` + `USAGE_GUIDE.md` + `USAGE_CHEATSHEET.md` |
| **IT admin** packaging the ZIP | `PACKAGING_GUIDE.md` |
| **Power user / champion** of the tool | All four end-user docs above |

---

*Documentation index — last updated with the v0.2x release.*
