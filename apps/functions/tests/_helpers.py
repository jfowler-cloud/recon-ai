"""Shared test helpers — importable by test modules."""

import importlib.util
from pathlib import Path

_functions_dir = Path(__file__).resolve().parent.parent


def import_handler(function_name: str):
    """Import the handler module from a specific Lambda function directory.

    Avoids name collisions since every Lambda dir has a ``handler.py``.
    Returns the module object so callers can access ``handler`` and any
    other module-level names (e.g. ``DATA_SOURCES`` in seed_data).
    """
    handler_path = _functions_dir / function_name / "handler.py"
    spec = importlib.util.spec_from_file_location(f"{function_name}_handler", handler_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
