"""Tests for shared.config module."""

import os

from shared.config import AppConfig


def test_default_table_names():
    """AppConfig uses RA- prefixed defaults when env vars are unset."""
    cfg = AppConfig()
    assert cfg.data_sources_table == "RA-DataSources"
    assert cfg.uploads_table == "RA-Uploads"
    assert cfg.documents_table == "RA-Documents"
    assert cfg.tickets_table == "RA-Tickets"
    assert cfg.ticket_notes_table == "RA-TicketNotes"
    assert cfg.targets_table == "RA-Targets"
    assert cfg.leadership_context_table == "RA-LeadershipContext"
    assert cfg.tool_actions_table == "RA-ToolActions"
    assert cfg.chat_sessions_table == "RA-ChatSessions"
    assert cfg.chat_messages_table == "RA-ChatMessages"
    assert cfg.config_table == "RA-Config"
    assert cfg.scoring_history_table == "RA-ScoringHistory"


def test_default_bucket_names():
    """Buckets default to empty strings."""
    cfg = AppConfig()
    assert cfg.uploads_bucket == ""
    assert cfg.vectors_bucket == ""


def test_default_ai_models():
    """AI model IDs have sensible defaults."""
    cfg = AppConfig()
    assert "haiku" in cfg.bedrock_model_id
    assert "titan-embed" in cfg.embedding_model_id


def test_default_runtime_settings():
    """Runtime defaults: testing tier, 365d doc TTL, 90d session TTL."""
    cfg = AppConfig()
    assert cfg.deployment_tier == "testing"
    assert cfg.ttl_documents_days == 365
    assert cfg.ttl_sessions_days == 90


def test_env_override_table(monkeypatch):
    """Environment variables override table names."""
    monkeypatch.setenv("DATA_SOURCES_TABLE", "CustomSources")
    # The config module reads os.environ at import time for defaults,
    # so we need to reload it to pick up the new env var.
    import importlib
    import shared.config as cfg_mod

    monkeypatch.setattr(os, "environ", {**os.environ, "DATA_SOURCES_TABLE": "CustomSources"})
    importlib.reload(cfg_mod)
    cfg = cfg_mod.AppConfig()
    assert cfg.data_sources_table == "CustomSources"


def test_env_override_buckets(monkeypatch):
    """Environment variables override bucket names."""
    monkeypatch.setenv("UPLOADS_BUCKET", "my-uploads")
    monkeypatch.setenv("VECTORS_BUCKET", "my-vectors")
    import importlib
    import shared.config as cfg_mod

    importlib.reload(cfg_mod)
    cfg = cfg_mod.AppConfig()
    assert cfg.uploads_bucket == "my-uploads"
    assert cfg.vectors_bucket == "my-vectors"


def test_env_override_ai_models(monkeypatch):
    """Environment variables override AI model IDs."""
    monkeypatch.setenv("BEDROCK_MODEL_ID", "custom-model")
    monkeypatch.setenv("EMBEDDING_MODEL_ID", "custom-embed")
    import importlib
    import shared.config as cfg_mod

    importlib.reload(cfg_mod)
    cfg = cfg_mod.AppConfig()
    assert cfg.bedrock_model_id == "custom-model"
    assert cfg.embedding_model_id == "custom-embed"


def test_env_override_runtime(monkeypatch):
    """Environment variables override runtime settings."""
    monkeypatch.setenv("DEPLOYMENT_TIER", "premium")
    monkeypatch.setenv("TTL_DOCUMENTS_DAYS", "30")
    monkeypatch.setenv("TTL_SESSIONS_DAYS", "7")
    import importlib
    import shared.config as cfg_mod

    importlib.reload(cfg_mod)
    cfg = cfg_mod.AppConfig()
    assert cfg.deployment_tier == "premium"
    assert cfg.ttl_documents_days == 30
    assert cfg.ttl_sessions_days == 7
