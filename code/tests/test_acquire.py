import stat
import subprocess
import zipfile
from pathlib import Path

import pytest

from understand import acquire
from understand.acquire import AcquireError, check_source, is_git_url, open_source
from understand.scanner import scan_repo


def test_is_git_url():
    assert is_git_url("https://github.com/user/repo.git")
    assert is_git_url("git@github.com:user/repo.git")
    assert not is_git_url("D:/FYP/GreatTest")
    assert not is_git_url("./agents/booking_agent")


@pytest.mark.parametrize("bad", ["http://example.com/r.git", "--upload-pack=evil", "ftp://x/y"])
def test_unsafe_or_unsupported_urls_are_rejected(bad, tmp_path):
    with pytest.raises(AcquireError):
        acquire.clone_repo(bad, tmp_path / "repo")


def test_local_folder_is_used_as_is(tmp_path):
    with open_source(tmp_path) as root:
        assert root == tmp_path.resolve()


def test_missing_local_folder_is_an_error(tmp_path):
    with pytest.raises(AcquireError), open_source(tmp_path / "nope"):
        pass


def test_clone_uses_safe_flags_and_cleans_up(monkeypatch):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        dest = Path(cmd[-1])
        dest.mkdir(parents=True)
        (dest / "agent.py").write_text("x = 1\n", encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(acquire.subprocess, "run", fake_run)
    with open_source("https://github.com/user/repo.git") as root:
        assert (root / "agent.py").exists()
        kept = root
    cmd, kwargs = calls[0]
    assert "--depth" in cmd and "--" in cmd
    assert kwargs["env"]["GIT_TERMINAL_PROMPT"] == "0"
    assert kwargs["timeout"] == acquire.CLONE_TIMEOUT_SECONDS
    assert not kept.exists()  # temp clone is deleted afterwards


def test_failed_clone_gives_a_clear_error(monkeypatch):
    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 128, "", "fatal: repository not found")

    monkeypatch.setattr(acquire.subprocess, "run", fake_run)
    with pytest.raises(AcquireError, match="repository not found"), open_source("https://github.com/user/missing.git"):
        pass


def test_git_not_installed_gives_a_clear_error(monkeypatch):
    def fake_run(cmd, **kwargs):
        raise FileNotFoundError

    monkeypatch.setattr(acquire.subprocess, "run", fake_run)
    with pytest.raises(AcquireError, match="not installed"), open_source("https://github.com/user/repo.git"):
        pass

def make_zip(path, files):
    with zipfile.ZipFile(path, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return path


def test_zip_with_one_top_folder_scans_inside_it(tmp_path):
    z = make_zip(
        tmp_path / "agent.zip",
        {"booking-main/agent.py": "x = 1\n", "__MACOSX/._junk": "junk"},
    )
    with open_source(z) as root:
        assert root.name == "booking-main"
        assert (root / "agent.py").exists()
        kept = root
    assert not kept.exists()  # temp copy is deleted afterwards


def test_zip_with_files_at_top_level(tmp_path):
    z = make_zip(tmp_path / "agent.zip", {"agent.py": "x = 1\n", "tools.py": "y = 2\n"})
    with open_source(z) as root:
        assert (root / "agent.py").exists()
        assert (root / "tools.py").exists()


def test_zip_slip_path_is_rejected(tmp_path):
    z = make_zip(tmp_path / "evil.zip", {"../evil.py": "boom"})
    with pytest.raises(AcquireError, match="Unsafe path"), open_source(z):
        pass


def test_zip_symlink_is_rejected(tmp_path):
    z = tmp_path / "link.zip"
    with zipfile.ZipFile(z, "w") as zf:
        info = zipfile.ZipInfo("link")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        zf.writestr(info, "/etc/passwd")
    with pytest.raises(AcquireError, match="symbolic link"), open_source(z):
        pass


def test_zip_with_too_many_files_is_rejected(tmp_path):
    z = make_zip(tmp_path / "many.zip", {"a.py": "1", "b.py": "2"})
    with pytest.raises(AcquireError, match="too many files"):
        acquire.extract_zip(z, tmp_path / "out", max_files=1)


def test_zip_that_unpacks_too_large_is_rejected(tmp_path):
    z = make_zip(tmp_path / "big.zip", {"a.py": "x" * 100})
    with pytest.raises(AcquireError, match="too large"):
        acquire.extract_zip(z, tmp_path / "out", max_bytes=10)


def test_file_that_is_not_a_zip_is_rejected(tmp_path):
    bad = tmp_path / "bad.zip"
    bad.write_text("this is not a zip", encoding="utf-8")
    with pytest.raises(AcquireError, match="valid zip"), open_source(bad):
        pass


def test_scanning_a_zip_end_to_end(tmp_path):
    source = '@tool\ndef cancel_booking(booking_id):\n    """Cancel."""\n'
    z = make_zip(tmp_path / "agent.zip", {"agent-main/agent.py": source})
    with open_source(z) as root:
        result = scan_repo(root)
    assert [t["name"] for t in result["tools"]] == ["cancel_booking"]
    assert result["tools"][0]["file"] == "agent.py"  # no wrapper folder in the evidence path

URL = "https://github.com/user/repo.git"


def fake_git():
    calls = []

    def run(cmd, **kwargs):
        calls.append(cmd)
        if cmd[1] == "clone":
            dest = Path(cmd[-1])
            dest.mkdir(parents=True)
            (dest / "agent.py").write_text("x = 1\n", encoding="utf-8")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    return run, calls


def clones(calls):
    return [c for c in calls if c[1] == "clone"]


def test_check_source(tmp_path):
    check_source(tmp_path)
    check_source(URL)
    z = tmp_path / "a.zip"
    z.write_bytes(b"")
    check_source(z)  # only the file type is checked here
    with pytest.raises(AcquireError, match="Not a folder"):
        check_source(tmp_path / "nope")


def test_clone_dir_keeps_the_clone(monkeypatch, tmp_path):
    run, calls = fake_git()
    monkeypatch.setattr(acquire.subprocess, "run", run)
    with open_source(URL, clone_dir=tmp_path / "repos", name="repo") as root:
        assert root == tmp_path / "repos" / "repo"
        assert (root / "agent.py").exists()
    assert (tmp_path / "repos" / "repo" / "agent.py").exists()  # kept after the run
    assert len(clones(calls)) == 1


def test_clone_name_defaults_to_the_repo_name(monkeypatch, tmp_path):
    run, _ = fake_git()
    monkeypatch.setattr(acquire.subprocess, "run", run)
    with open_source(URL, clone_dir=tmp_path / "repos") as root:
        assert root == tmp_path / "repos" / "repo"


def test_existing_clone_is_replaced_by_a_fresh_one(monkeypatch, tmp_path):
    old = tmp_path / "repos" / "repo"
    old.mkdir(parents=True)
    (old / "stale.py").write_text("old", encoding="utf-8")
    run, calls = fake_git()
    monkeypatch.setattr(acquire.subprocess, "run", run)
    with open_source(URL, clone_dir=tmp_path / "repos", name="repo") as root:
        assert (root / "agent.py").exists()
        assert not (root / "stale.py").exists()
    assert len(clones(calls)) == 1
    assert not (tmp_path / "repos" / "repo.new").exists()  # no leftovers


def test_failed_clone_keeps_the_old_one(monkeypatch, tmp_path):
    old = tmp_path / "repos" / "repo"
    old.mkdir(parents=True)
    (old / "stale.py").write_text("old", encoding="utf-8")

    def run(cmd, **kwargs):
        return subprocess.CompletedProcess(cmd, 128, "", "fatal: repository not found")

    monkeypatch.setattr(acquire.subprocess, "run", run)
    with pytest.raises(AcquireError, match="repository not found"), open_source(
            URL, clone_dir=tmp_path / "repos", name="repo"):
        pass
    assert (old / "stale.py").exists()
    assert not (tmp_path / "repos" / "repo.new").exists()