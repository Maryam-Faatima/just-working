# Repo acquisition

understand/acquire.py turns the developer's input into a folder to scan.
Input is either a local path a local path, a .zip file, or a git URL (https or ssh)

## How it works
- Local path: used as is, never modified.
- Git URL: shallow clone (depth 1, one branch) into a temporary folder, scanned, then deleted.
- The commit hash is stored with every scan, so evidence is tied to an exact version of the code.

## Safety
- The target code is only parsed, never imported or executed.
- URLs must start with https://, git@ or ssh://. The "--" separator blocks git option injection.
- Password prompts are disabled and cloning has a timeout.
- The temporary clone is always deleted, even if scanning fails.

## Limitations (stated openly)
- Private repos are not supported (there is no authentication system, see the scope table). Cloning fails with a clear error.
- Only the default branch is scanned. Submodules are not fetched.
- No size cap on the repo yet.
- Requires git on PATH.

## Zip files
- Unpacked into a temporary folder that is always deleted afterwards.
- A single wrapper folder (GitHub's Download ZIP layout) is stepped into, so evidence paths are relative to the repo root.
- Checks before anything is written: no paths escaping the folder (zip slip), no symbolic links,
  no password-protected entries, at most 20,000 files and 500 MB unpacked (zip bomb guard).

## Additional limitations
- Zip URLs (https://.../archive.zip) are not downloaded. Download the file first, then pass its path.
- Zip files carry no commit hash, so the commit field is empty for them.