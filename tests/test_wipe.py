import asyncio
from dataclasses import fields

from personaparlour.config import config
from personaparlour.state import ConnState, wipe_connection_state
from personaparlour.utils.file import wipe_user_data


def test_wipe_connection_state_matches_a_fresh_connection():
    async def exercise_wipe():
        state = ConnState()
        state.messages.append({"role": "user", "content": "Remember this"})
        state.lorebook = [{"title": "Old world"}]
        state.author_note = "Keep this secret"
        state.adult_mode = True
        state.scene_location = "The archive"
        state.presence_mode = "often"
        state.memory_summary = "A long-running story"
        state.memory_covered = 42
        state.canon = [{"id": "fact-1", "fact": "The gate is locked"}]
        state.continuity_alert = {"items": [{"fact_id": "fact-1"}]}
        state.story_threads = [{"id": "thread-1", "title": "Find the key"}]
        state.story_threads_covered = 42

        sleepers = [asyncio.create_task(asyncio.sleep(60)) for _ in range(4)]
        state.llm_task, state.memory_task, state.continuity_task, state.story_threads_task = sleepers

        await wipe_connection_state(state)

        fresh = ConnState()
        for state_field in fields(ConnState):
            if state_field.name == "auxiliary_lock":
                assert isinstance(state.auxiliary_lock, asyncio.Lock)
                assert state.auxiliary_lock is not fresh.auxiliary_lock
            else:
                assert getattr(state, state_field.name) == getattr(fresh, state_field.name)
        assert all(task.cancelled() for task in sleepers)

    asyncio.run(exercise_wipe())


def test_wipe_user_data_clears_unknown_feature_stores(monkeypatch, tmp_path):
    user_data = tmp_path / "user_data"
    images = user_data / "images"
    characters = user_data / "characters"
    logs = user_data / "logs"
    sessions = user_data / "sessions"
    future_store = user_data / "future_feature_memory"

    for directory in (images, characters, logs, sessions, future_store):
        directory.mkdir(parents=True)
        (directory / "record.dat").write_text("private data", encoding="utf-8")
    nested = future_store / "nested"
    nested.mkdir()
    (nested / "more.dat").write_text("more private data", encoding="utf-8")
    legacy_root_file = user_data / "legacy-memory.json"
    legacy_root_file.write_text("{}", encoding="utf-8")

    monkeypatch.setattr(config, "user_data_dir", str(user_data))
    monkeypatch.setattr(config, "user_images_dir", str(images))
    monkeypatch.setattr(config, "user_characters_dir", str(characters))
    monkeypatch.setattr(config, "user_logs_dir", str(logs))

    summary = wipe_user_data(clear_logs=True)

    assert not legacy_root_file.exists()
    assert all(directory.is_dir() for directory in (images, characters, logs, sessions))
    assert all(not any(directory.iterdir()) for directory in (images, characters, logs, sessions))
    assert future_store.is_dir()
    assert not any(future_store.iterdir())
    assert summary["root_files_removed"] == 1
    assert summary["directories_cleared"]["future_feature_memory"] == 2
    assert summary["entries_removed"] >= 6
