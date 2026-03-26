"""Red team chat agent Lambda handler — invoked by chat_handler with a message."""

from redteam_chat_agent.agent import create_chat_agent
from shared.agent_handler import make_chat_handler

handler = make_chat_handler("Red team", create_chat_agent)
