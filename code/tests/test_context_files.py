from understand import context_files as cf


def write(root, rel, text):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def found(root):
    return {e["file"]: e for e in cf.list_context_files(root)}


def text_of(root):
    return cf.render_context(root, cf.list_context_files(root))


def test_finds_docs_and_configs(tmp_path):
    write(tmp_path, "README.md", "# Bot\nBooks rooms.\n" * 20)
    write(tmp_path, "docs/design.md", "Design notes\n" * 30)
    write(tmp_path, "config.yaml", "max_retries: 2\n" * 20)
    got = found(tmp_path)
    assert got["README.md"]["kind"] == "doc"
    assert got["docs/design.md"]["kind"] == "doc"
    assert got["config.yaml"]["kind"] == "config"


def test_readme_comes_first(tmp_path):
    write(tmp_path, "a_config.yaml", "x: 1\n")
    write(tmp_path, "README.md", "hello")
    assert cf.list_context_files(tmp_path)[0]["file"] == "README.md"


def test_real_env_file_is_never_read(tmp_path):
    write(tmp_path, ".env", "GROQ_API_KEY=gsk_real_secret_value\n")
    write(tmp_path, "README.md", "hi")
    entries = cf.list_context_files(tmp_path)
    assert [e["file"] for e in entries] == ["README.md"]
    assert "gsk_real_secret_value" not in cf.render_context(tmp_path, entries)


def test_example_env_is_read_but_values_are_redacted(tmp_path):
    write(tmp_path, ".env.example", "GROQ_API_KEY=gsk_looks_real_123\nGROQ_MODEL=some-model\n")
    text = text_of(tmp_path)
    assert ".env.example" in text and "GROQ_MODEL=some-model" in text
    assert "gsk_looks_real_123" not in text and "<redacted>" in text


def test_a_secret_written_in_prose_is_redacted(tmp_path):
    write(tmp_path, "README.md", "Set `OPENAI_API_KEY=sk-abc123` before running.")
    assert "sk-abc123" not in text_of(tmp_path)


def test_files_with_secret_like_names_are_skipped(tmp_path):
    write(tmp_path, "secrets.yaml", "a: 1\n")
    write(tmp_path, "token.json", "{}")
    assert cf.list_context_files(tmp_path) == []


def test_tests_vendor_and_output_folders_are_skipped(tmp_path):
    for folder in ("tests", ".venv", "outputs", "node_modules", ".github"):
        write(tmp_path, f"{folder}/README.md", "noise")
    assert cf.list_context_files(tmp_path) == []


def test_big_json_data_is_skipped_small_json_is_kept(tmp_path):
    write(tmp_path, "data/flights.json", "[" + '{"a": 1},' * 1000 + "{}]")
    write(tmp_path, "langgraph.json", '{"graphs": {"agent": "./graph.py:app"}}')
    assert set(found(tmp_path)) == {"langgraph.json"}


def test_budget_is_respected(tmp_path):
    for i in range(10):
        write(tmp_path, f"doc{i}.md", "word " * 2000)
    entries = cf.list_context_files(tmp_path)
    assert len(entries) <= cf.MAX_FILES
    assert sum(e["chars"] for e in entries) <= cf.MAX_TOTAL_CHARS
    assert all(e["truncated"] for e in entries)


def test_binary_and_empty_files_are_skipped(tmp_path):
    (tmp_path / "bin.md").write_bytes(b"\x00\x01binary")
    write(tmp_path, "empty.md", "")
    assert cf.list_context_files(tmp_path) == []


def test_background_says_it_is_data_not_instructions(tmp_path):
    write(tmp_path, "README.md", "Cancels bookings.")
    text = text_of(tmp_path)
    assert "not instructions" in text.lower()
    assert "README.md" in text and text.rstrip().endswith("end of background ---")


def test_nothing_to_show_gives_empty_text(tmp_path):
    assert cf.render_context(tmp_path, []) == ""