import logging
import os
import shutil

from personaparlour.utils.logger import logger


def resolve_local_model_path(path: str) -> str:
    """
    Resolve HuggingFace cache directory structure to actual model path.
    If path points to models--org--name directory, find the latest snapshot.

    Args:
        path: Path to model directory

    Returns:
        Resolved path to actual model files
    """
    if not os.path.exists(path):
        return path

    # Check if this is a HuggingFace cache directory (contains snapshots/)
    snapshots_dir = os.path.join(path, "snapshots")
    if os.path.exists(snapshots_dir) and os.path.isdir(snapshots_dir):
        # Get all snapshot directories
        snapshots = [
            d for d in os.listdir(snapshots_dir) if os.path.isdir(os.path.join(snapshots_dir, d))
        ]
        if snapshots:
            # Use the most recent snapshot (by modification time)
            latest_snapshot = max(
                snapshots, key=lambda d: os.path.getmtime(os.path.join(snapshots_dir, d))
            )
            resolved_path = os.path.join(snapshots_dir, latest_snapshot)
            logger.info(f"Resolved HuggingFace cache path to snapshot: {resolved_path}")
            return resolved_path

    return path


def _clear_directory_contents(path: str) -> int:
    """Delete everything inside ``path`` (but keep the directory itself).

    Returns the number of top-level entries removed. Missing directories are a
    no-op. Failures on individual entries are logged and skipped.
    """
    if not path or not os.path.isdir(path):
        return 0
    removed = 0
    for entry in os.listdir(path):
        full = os.path.join(path, entry)
        try:
            if os.path.isfile(full) or os.path.islink(full):
                os.remove(full)
            else:
                shutil.rmtree(full, ignore_errors=True)
            removed += 1
        except Exception as e:  # pragma: no cover - best-effort cleanup
            logger.warning(f"Could not remove {full}: {e}")
    return removed


def wipe_user_data(clear_logs: bool = True) -> dict:
    """Erase the app's on-disk user data so no trace remains.

    Every directory and file directly under ``user_data`` is included, so stores
    introduced by newer features do not need to be manually added to this
    function. Directories remain available but their contents are emptied.
    When ``clear_logs`` is set, currently-open app log files are truncated in
    place (they cannot be deleted on Windows) and all other log entries are
    removed. Returns a small summary for logging and the UI.
    """
    # Import here to avoid a circular import at module load time.
    from personaparlour.config import config

    os.makedirs(config.user_data_dir, exist_ok=True)
    sessions_dir = os.path.join(config.user_data_dir, "sessions")
    logs_dir = os.path.abspath(config.user_logs_dir)
    known_directories = {
        os.path.abspath(config.user_images_dir): "images",
        os.path.abspath(config.user_characters_dir): "characters",
        os.path.abspath(sessions_dir): "sessions",
    }
    directory_counts: dict[str, int] = {}
    root_files_removed = 0

    for entry in os.listdir(config.user_data_dir):
        full = os.path.abspath(os.path.join(config.user_data_dir, entry))
        if full == logs_dir:
            continue
        try:
            if os.path.islink(full) or os.path.isfile(full):
                os.remove(full)
                root_files_removed += 1
            elif os.path.isdir(full):
                directory_counts[entry] = _clear_directory_contents(full)
        except Exception as e:  # pragma: no cover - best-effort cleanup
            logger.warning(f"Could not wipe user-data entry {full}: {e}")

    # Keep the standard folders available for code paths that write directly
    # into them, even when the directory did not exist before this wipe.
    for directory in (*known_directories, logs_dir):
        os.makedirs(directory, exist_ok=True)

    summary: dict = {
        "images_removed": directory_counts.get(
            os.path.basename(config.user_images_dir),
            0,
        ),
        "characters_removed": directory_counts.get(
            os.path.basename(config.user_characters_dir),
            0,
        ),
        "sessions_removed": directory_counts.get(os.path.basename(sessions_dir), 0),
        "root_files_removed": root_files_removed,
        "directories_cleared": directory_counts,
    }

    if clear_logs:
        open_log_files: set[str] = set()
        # Truncate app log files currently held open by a FileHandler.
        for handler in list(logger.logger.handlers):
            if isinstance(handler, logging.FileHandler):
                log_path = os.path.abspath(handler.baseFilename)
                try:
                    belongs_to_app = os.path.commonpath([logs_dir, log_path]) == logs_dir
                except ValueError:
                    belongs_to_app = False
                if not belongs_to_app:
                    continue
                try:
                    handler.acquire()
                    try:
                        handler.flush()
                        if handler.stream:
                            handler.stream.seek(0)
                            handler.stream.truncate(0)
                    finally:
                        handler.release()
                    open_log_files.add(log_path)
                except Exception as e:  # pragma: no cover - best-effort cleanup
                    logger.warning(f"Could not truncate active log file: {e}")

        # Delete every other log entry (older days, rotated files, nested traces).
        removed_logs = 0
        for entry in os.listdir(logs_dir):
            log_path = os.path.abspath(os.path.join(logs_dir, entry))
            if log_path in open_log_files:
                continue
            try:
                if os.path.isfile(log_path) or os.path.islink(log_path):
                    os.remove(log_path)
                elif os.path.isdir(log_path):
                    shutil.rmtree(log_path)
                removed_logs += 1
            except Exception as e:  # pragma: no cover - best-effort cleanup
                logger.warning(f"Could not remove log entry {log_path}: {e}")
        summary["logs_removed"] = removed_logs
        summary["active_logs_truncated"] = len(open_log_files)

    summary["entries_removed"] = (
        root_files_removed
        + sum(directory_counts.values())
        + int(summary.get("logs_removed", 0))
    )
    return summary
