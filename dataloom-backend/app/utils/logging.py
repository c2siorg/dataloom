"""Logging configuration for the DataLoom backend.

Provides setup_logging() to configure the root logger and get_logger() to
obtain named loggers for use across the application.
"""

import logging
import sys


def setup_logging(debug: bool = False) -> None:
    """Configure the root logger with a console handler and formatter.

    Args:
        debug: If True, set log level to DEBUG. Otherwise, use INFO.
    """
    level = logging.DEBUG if debug else logging.INFO

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Avoid adding duplicate handlers on repeated calls
    if not root_logger.handlers:
        root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.

    Args:
        name: The logger name, typically __name__ of the calling module.

    Returns:
        A logging.Logger instance.
    """
    return logging.getLogger(name)
