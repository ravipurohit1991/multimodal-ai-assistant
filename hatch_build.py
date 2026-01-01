"""Build hook implementation for compiling frontend assets during package build."""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from hatchling.builders.hooks.plugin.interface import BuildHookInterface  # type: ignore
except ImportError:
    raise ImportError("hatchling is required for building the AI Assistant frontend")


class FrontendBuildHook(BuildHookInterface):
    """Build hook implementation for compiling frontend assets during wheel packaging.

    https://hatch.pypa.io/latest/plugins/build-hook/reference/#hatchling.builders.hooks.plugin.interface.BuildHookInterface
    """

    def initialize(self, version: str, build_data: dict[str, Any]) -> None:
        """Initialize build process when invoked by the build system."""
        sys.stderr.write("Building AI Assistant frontend\n")

        self.source_dir = Path("frontend")
        self.output_dir = Path("dist")
        self.target_dir = Path("src/aiassistant/frontend")

        self.compile_frontend_assets()

        if check_editable_mode(version):
            self.deploy_compiled_assets()

        super().initialize(version, build_data)

    def compile_frontend_assets(self) -> None:
        """Compile frontend assets using the build toolchain."""
        npm_binary = locate_npm_binary()
        install_dependencies(npm_binary, self.source_dir)
        execute_build_process(npm_binary, self.source_dir)

        if not self.output_dir.exists():
            raise RuntimeError("Build output directory does not exist after build")

        validate_build_artifacts(self.output_dir)

    def deploy_compiled_assets(self) -> None:
        """Deploy compiled assets to the target package directory."""
        if self.target_dir.exists():
            sys.stderr.write("Removing existing frontend folder from src/aiassistant\n")
            cleanup_destination_dir(self.target_dir)

        sys.stderr.write("Copying compiled frontend to src/aiassistant/frontend\n")
        transfer_build_output(self.output_dir, self.target_dir)

        if not self.target_dir.exists():
            raise RuntimeError("Frontend destination directory was not created")

        validate_build_artifacts(self.target_dir)

        sys.stderr.write("Frontend build and copy completed successfully\n")


def check_editable_mode(version: str) -> bool:
    """Determine if the build is running in editable mode."""
    for argument in sys.argv:
        if "--editable" in argument or argument == "-e":
            return True
    return version == "editable"


def locate_npm_binary() -> str:
    """Locate the npm binary in the system path."""
    npm_path = shutil.which("npm")
    if npm_path is None:
        raise RuntimeError("NodeJS npm required for building AI Assistant frontend was not found")
    return npm_path


def install_dependencies(npm_binary: str, working_directory: Path) -> None:
    """Install required dependencies via package manager."""
    try:
        subprocess.run([npm_binary, "install"], check=True, cwd=working_directory)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"Failed to install node modules: {error}")


def execute_build_process(npm_binary: str, working_directory: Path) -> None:
    """Execute the build process for frontend compilation."""
    try:
        subprocess.run([npm_binary, "run", "build"], check=True, cwd=working_directory)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"Failed to build frontend: {error}")


def validate_build_artifacts(directory: Path) -> None:
    """Validate that all required build artifacts are present."""
    missing_items = []
    for artifact_name in ["index.html", "assets"]:
        if not (directory / artifact_name).exists():
            missing_items.append(artifact_name)
    missing_list = ", ".join(missing_items)
    if missing_items:
        raise RuntimeError(f"Required compiled files missing: {missing_list}")


def cleanup_destination_dir(target_path: Path) -> None:
    """Clean up the destination directory by removing it."""
    try:
        shutil.rmtree(target_path)
    except Exception as error:
        raise RuntimeError(f"Failed to remove existing frontend folder: {error}")


def transfer_build_output(source_path: Path, destination_path: Path) -> None:
    """Transfer build output from source to destination directory."""
    try:
        shutil.copytree(source_path, destination_path)
    except Exception as error:
        raise RuntimeError(f"Failed to copy frontend to src/aiassistant: {error}")
