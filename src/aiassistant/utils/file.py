import os

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
