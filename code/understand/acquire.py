"""Repo acquisition: turn a local path or a git URL into a folder we can scan.

Git URLs are cloned (shallow). By default the clone goes into a temporary folder that is
deleted afterwards. With clone_dir the clone is kept in <clone_dir>/<name> and replaced by a
fresh clone on every run. The target code is only ever read. It is never imported or executed.
"""
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path

GIT_URL_PREFIXES = ("https://", "git@", "ssh://")
CLONE_TIMEOUT_SECONDS = 120
MAX_ZIP_FILES = 20_000
MAX_ZIP_BYTES = 500 * 1024 * 1024  # 500 MB unpacked
DEFAULT_CLONE_DIR = Path(__file__).resolve().parent.parent / "repos"


class AcquireError(Exception):
    """Raised when a repo cannot be obtained. The message is safe to show the user."""


def is_git_url(source):
    return str(source).startswith(GIT_URL_PREFIXES)


def check_source(source):
    """Raise AcquireError early if source is not a git URL, a .zip file or a folder."""
    path = Path(str(source))
    if is_git_url(source) or path.is_dir() or (path.is_file() and path.suffix.lower() == ".zip"):
        return
    raise AcquireError(f"Not a folder, zip file or git URL: {source}")


def clone_repo(url, dest, timeout=CLONE_TIMEOUT_SECONDS):
    """Shallow-clone url into dest."""
    if not is_git_url(url):
        raise AcquireError("Only https:// and ssh git URLs are supported.")
    cmd = [
        "git", "clone", "--depth", "1", "--single-branch", "--no-tags",
        "--", url, str(dest),
    ]
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}  # fail instead of asking for a password
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, env=env, check=False
        )
    except FileNotFoundError as exc:
        raise AcquireError("git is not installed or not on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise AcquireError(f"Cloning timed out after {timeout} seconds.") from exc
    if proc.returncode != 0:
        detail = proc.stderr.strip() or "unknown error"
        raise AcquireError(f"git clone failed: {detail}")


def head_commit(path):
    """Commit hash of the scanned repo, or None if it is not a git repo."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(path), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return proc.stdout.strip() if proc.returncode == 0 else None


def extract_zip(zip_path, dest, max_files=MAX_ZIP_FILES, max_bytes=MAX_ZIP_BYTES):
    """Safely unpack zip_path into dest. Nothing is written until every entry passes the checks."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    try:
        with zipfile.ZipFile(zip_path) as zf:
            infos = zf.infolist()
            if len(infos) > max_files:
                raise AcquireError(f"Zip has too many files (limit {max_files}).")
            if sum(i.file_size for i in infos) > max_bytes:
                raise AcquireError(f"Zip is too large when unpacked (limit {max_bytes // (1024 * 1024)} MB).")
            for info in infos:
                if info.flag_bits & 0x1:
                    raise AcquireError("Password-protected zip files are not supported.")
                if stat.S_ISLNK(info.external_attr >> 16):
                    raise AcquireError(f"Zip contains a symbolic link: {info.filename}")
                target = (root / info.filename).resolve()
                if not target.is_relative_to(root):
                    raise AcquireError(f"Unsafe path in zip: {info.filename}")
            zf.extractall(root)
    except zipfile.BadZipFile as exc:
        raise AcquireError("Not a valid zip file.") from exc


def _single_root(dest):
    """GitHub's Download ZIP wraps everything in one folder (repo-main/). Step inside it."""
    entries = [e for e in Path(dest).iterdir() if e.name != "__MACOSX"]
    if len(entries) == 1 and entries[0].is_dir() and entries[0].name != ".git":
        return entries[0]
    return Path(dest)


def _on_remove_error(func, path, _exc):
    """Windows keeps .git files read-only. Make them writable and retry."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def _remove_tree(path):
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=_on_remove_error)
    else:
        shutil.rmtree(path, onerror=_on_remove_error)


@contextmanager
def _workspace(fill):
    """Make a temp folder, let fill(dest) put the code in it, and always delete it afterwards."""
    workspace = tempfile.mkdtemp(prefix="greattest_")
    try:
        dest = Path(workspace) / "repo"
        fill(dest)
        yield _single_root(dest)
    finally:
        _remove_tree(workspace)


def _name_from_url(url):
    return re.split(r"[/:]", str(url).rstrip("/"))[-1].removesuffix(".git") or "repo"


def _fresh_clone(url, dest):
    """Clone url into dest, replacing a clone that is already there.

    The new clone is made next to dest first, so a failed clone (no network, wrong URL)
    leaves the old one in place.
    """
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    staging = dest.with_name(dest.name + ".new")
    if staging.exists():
        _remove_tree(staging)
    try:
        clone_repo(url, staging)
        if dest.exists():
            _remove_tree(dest)
        staging.rename(dest)
    except BaseException:
        if staging.exists():
            _remove_tree(staging)
        raise


@contextmanager
def open_source(source, clone_dir=None, name=None):
    """Yield a folder to scan from a git URL, a .zip file, or a local folder.

    A git URL is cloned into a temporary folder that is deleted afterwards, unless clone_dir
    is given. Then it is cloned fresh into <clone_dir>/<name> and kept, replacing any clone
    that is already there.
    """
    path = Path(str(source))
    if is_git_url(source):
        if clone_dir is None:
            with _workspace(lambda dest: clone_repo(str(source), dest)) as root:
                yield root
        else:
            dest = Path(clone_dir) / (name or _name_from_url(source))
            _fresh_clone(str(source), dest)
            yield dest
    elif path.is_file() and path.suffix.lower() == ".zip":
        with _workspace(lambda dest: extract_zip(path, dest)) as root:
            yield root
    elif path.is_dir():
        yield path.resolve()
    else:
        raise AcquireError(f"Not a folder, zip file or git URL: {source}")