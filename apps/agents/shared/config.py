"""Shared configuration for Recon AI agents and functions."""

import os

from pydantic_settings import BaseSettings


class AppConfig(BaseSettings):
    """Configuration loaded from Lambda environment variables."""

    # Tables
    data_sources_table: str = os.environ.get("DATA_SOURCES_TABLE", "RA-DataSources")
    uploads_table: str = os.environ.get("UPLOADS_TABLE", "RA-Uploads")
    documents_table: str = os.environ.get("DOCUMENTS_TABLE", "RA-Documents")
    tickets_table: str = os.environ.get("TICKETS_TABLE", "RA-Tickets")
    ticket_notes_table: str = os.environ.get("TICKET_NOTES_TABLE", "RA-TicketNotes")
    targets_table: str = os.environ.get("TARGETS_TABLE", "RA-Targets")
    leadership_context_table: str = os.environ.get("LEADERSHIP_CONTEXT_TABLE", "RA-LeadershipContext")
    tool_actions_table: str = os.environ.get("TOOL_ACTIONS_TABLE", "RA-ToolActions")
    tools_table: str = os.environ.get("TOOLS_TABLE", "RA-Tools")
    chat_sessions_table: str = os.environ.get("CHAT_SESSIONS_TABLE", "RA-ChatSessions")
    chat_messages_table: str = os.environ.get("CHAT_MESSAGES_TABLE", "RA-ChatMessages")
    config_table: str = os.environ.get("CONFIG_TABLE", "RA-Config")
    scoring_history_table: str = os.environ.get("SCORING_HISTORY_TABLE", "RA-ScoringHistory")

    # Buckets
    uploads_bucket: str = os.environ.get("UPLOADS_BUCKET", "")
    vectors_bucket: str = os.environ.get("VECTORS_BUCKET", "")

    # AI
    bedrock_model_id: str = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    enrichment_model_id: str = os.environ.get("ENRICHMENT_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    prioritization_model_id: str = os.environ.get("PRIORITIZATION_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    embedding_model_id: str = os.environ.get("EMBEDDING_MODEL_ID", "amazon.titan-embed-text-v2:0")

    # Runtime
    deployment_tier: str = os.environ.get("DEPLOYMENT_TIER", "testing")
    ttl_documents_days: int = int(os.environ.get("TTL_DOCUMENTS_DAYS", "365"))
    ttl_sessions_days: int = int(os.environ.get("TTL_SESSIONS_DAYS", "90"))
