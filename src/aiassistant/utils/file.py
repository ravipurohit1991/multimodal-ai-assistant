import glob
import logging
import os
import shutil

from aiassistant.utils.logger import logger


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

    Clears saved/generated/temporary images and uploaded character files, and —
    when ``clear_logs`` is set — truncates the currently-open log file(s) in place
    (they can't be deleted while the handler holds them on Windows) and removes any
    other log files. Returns a small summary for logging.
    """
    # Import here to avoid a circular import at module load time.
    from aiassistant.config import config

    summary: dict = {
        "images_removed": _clear_directory_contents(config.user_images_dir),
        "characters_removed": _clear_directory_contents(config.user_characters_dir),
    }

    if clear_logs:
        open_log_files: set[str] = set()
        # Truncate any log file currently held open by a FileHandler.
        for handler in list(logger.logger.handlers):
            if isinstance(handler, logging.FileHandler):
                try:
                    handler.acquire()
                    try:
                        handler.flush()
                        if handler.stream:
                            handler.stream.seek(0)
                            handler.stream.truncate(0)
                    finally:
                        handler.release()
                    open_log_files.add(os.path.abspath(handler.baseFilename))
                except Exception as e:  # pragma: no cover - best-effort cleanup
                    logger.warning(f"Could not truncate active log file: {e}")

        # Delete every other log file (older days, rotated files, etc.).
        removed_logs = 0
        for log_path in glob.glob(os.path.join(config.user_logs_dir, "*")):
            if os.path.abspath(log_path) in open_log_files:
                continue
            try:
                if os.path.isfile(log_path):
                    os.remove(log_path)
                    removed_logs += 1
            except Exception as e:  # pragma: no cover - best-effort cleanup
                logger.warning(f"Could not remove log file {log_path}: {e}")
        summary["logs_removed"] = removed_logs
        summary["active_logs_truncated"] = len(open_log_files)

    return summary
