"""OSINT chat agent Lambda handler — invoked by chat_handler with a message."""

from osint_chat_agent.agent import create_chat_agent
from shared.agent_handler import make_chat_handler

handler = make_chat_handler("OSINT", create_chat_agent)
