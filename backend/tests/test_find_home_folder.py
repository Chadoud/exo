"""Bounded home-folder name search."""

from __future__ import annotations

from pathlib import Path

import pytest

from actions.find_home_folder import find_home_folder
from actions.system_safe import list_directory


@pytest.mark.parametrize(
    ("on_disk", "spoken"),
    [
        ("Q3 invoices", "q3-invoices"),
        ("q3-invoices", "Q3 invoices"),
        ("tax_2024", "Tax 2024"),
        ("Mon Dossier", "mon-dossier"),
        ("Hilal files", "Hilal files"),
    ],
)
def test_find_home_folder_matches_any_separators(
    monkeypatch, tmp_path: Path, on_disk: str, spoken: str
) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    target = tmp_path / "Downloads" / on_disk
    target.mkdir(parents=True)
    result = find_home_folder({"query": spoken})
    assert str(target.resolve()) in result["data"]["folders"]


def test_find_home_folder_uses_name_tokens_in_a_sentence(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    target = tmp_path / "Downloads" / "q3-invoices"
    target.mkdir(parents=True)
    result = find_home_folder({"query": "please sort the files in Q3 invoices"})
    assert str(target.resolve()) in result["data"]["folders"]


def test_find_home_folder_skips_ssh(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    secret = tmp_path / ".ssh" / "Q3 invoices"
    secret.mkdir(parents=True)

    result = find_home_folder({"query": "Q3 invoices"})
    assert result["ok"] is True
    assert result["data"]["folders"] == []


def test_find_home_folder_empty_query_lists_nearby(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    target = tmp_path / "Downloads" / "q3-invoices"
    target.mkdir(parents=True)
    result = find_home_folder({"query": ""})
    assert result["ok"] is True
    assert result["data"]["folders"] == []
    assert str(target.resolve()) in result["data"]["nearby"]


def test_find_home_folder_priority_over_many_siblings(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    for i in range(450):
        (tmp_path / f"proj-{i:03d}").mkdir()
        (tmp_path / f"proj-{i:03d}" / "src").mkdir()
    target = tmp_path / "Downloads" / "q3-invoices"
    target.mkdir(parents=True)
    result = find_home_folder({"query": "Q3 invoices"})
    assert str(target.resolve()) in result["data"]["folders"]


def test_find_home_folder_follows_downloads_symlink(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    real = tmp_path / "real-downloads"
    real.mkdir()
    target = real / "q3-invoices"
    target.mkdir()
    (tmp_path / "Downloads").symlink_to(real)
    result = find_home_folder({"query": "Q3 invoices"})
    assert any(Path(p).name == "q3-invoices" for p in result["data"]["folders"])


def test_list_directory_skips_hidden_and_lists_dirs_first(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    (tmp_path / ".hidden").mkdir()
    (tmp_path / "Downloads").mkdir()
    (tmp_path / "zzz.txt").write_text("x", encoding="utf-8")

    result = list_directory({"path": str(tmp_path)})
    assert result["ok"] is True
    names = [item["name"] for item in result["data"]["items"]]
    assert ".hidden" not in names
    assert names[0] == "Downloads"
