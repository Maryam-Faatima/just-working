# Output layout

Every run writes into outputs/<agent>/ at the repo root. The folder is git-ignored,
because it contains copies of the structure of other people's code.

outputs/<agent>/
  scan.json     full scan (tools, registrations, graph nodes and edges, checks)
  scan.md       readable report with tables and a workflow diagram
  (later phases add model_v0.json, tests, traces, findings, report.md here)

## Agent name
Derived from the source: repo name for a git URL, file name for a zip, folder name for a folder.
Use --name to override. Two different repos with the same name would share a folder,
so use --name when that can happen.

## Options
--name NAME   output folder name
--out DIR     base folder instead of <repo>/outputs
--json        print the full JSON instead of the summary