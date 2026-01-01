"""
Centralized logging configuration for TTS/STT Pipeline
Uses Rich library for beautiful terminal output
All logs are written to user_data/logs directory
"""

import logging
import os
from datetime import datetime

from rich.console import Console
from rich.logging import RichHandler

from aiassistant.config import config


class LoggerManager:
    """
    Singleton logger manager with Rich formatting
    """

    _instance: "LoggerManager | None" = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if LoggerManager._initialized:
            return

        self.console = Console()
        self.logger = self._setup_logger()
        LoggerManager._initialized = True

    def _setup_logger(self, name: str = "aiassistant", level: int = logging.INFO) -> logging.Logger:
        """
        Setup a logger with Rich formatting that writes to user_data/logs directory

        Args:
            name: Logger name
            level: Logging level (default: INFO)

        Returns:
            Configured logger instance
        """
        logger = logging.getLogger(name)

        # Only configure if not already configured
        if not logger.handlers:
            logger.setLevel(level)

            # Create log filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d")
            log_file = os.path.join(config.user_logs_dir, f"app_{timestamp}.log")

            # File handler - writes to user_data/logs (plain format)
            file_handler = logging.FileHandler(log_file, encoding="utf-8")
            file_handler.setLevel(level)
            file_formatter = logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
            )
            file_handler.setFormatter(file_formatter)

            # Rich console handler - beautiful terminal output
            console_handler = RichHandler(
                console=self.console,
                rich_tracebacks=True,
                tracebacks_show_locals=True,
                markup=True,
            )
            console_handler.setLevel(level)

            logger.addHandler(file_handler)
            logger.addHandler(console_handler)

            logger.info(f"Logger initialized. Writing to: {log_file}")

        return logger

    def info(self, message: str):
        """Log info message"""
        self.logger.info(message)

    def error(self, message: str, exc_info: bool = False):
        """Log error message"""
        self.logger.error(message, exc_info=exc_info)

    def warning(self, message: str):
        """Log warning message"""
        self.logger.warning(message)

    def debug(self, message: str):
        """Log debug message"""
        self.logger.debug(message)


# Global logger instance
logger = LoggerManager()
