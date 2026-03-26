"""Tests for manage_tools handler — CRUD + vectorization."""

import json
from unittest.mock import patch, MagicMock

from _helpers import import_handler


def _make_tool_body(name="Nmap Scanner", **overrides):
    """Build a minimal tool creation payload."""
    body = {
        "action": "create",
        "name": name,
        "description": "Network discovery and security auditing tool",
        "category": "reconnaissance",
        "version": "7.94",
        "framework": "nmap",
        "targetTypes": ["network", "infrastructure"],
        "protocols": ["tcp", "udp"],
        "cveTargets": [],
        "riskProfile": {
            "serviceDisruption": "low",
            "systemDamage": "none",
            "detectionLikelihood": "medium",
            "requiresAuth": False,
            "reversible": True,
            "noisy": True,
        },
        "successProfile": {
            "estimatedSuccessRate": 95,
            "avgExecutionTime": "30s",
            "requiredAccess": "network",
            "outputType": "data",
        },
        "notes": "Use -sS for stealth SYN scan",
    }
    body.update(overrides)
    return body


def test_create_tool_success(aws_env, lambda_context):
    """Create a tool with full risk/success profiles."""
    mod = import_handler("manage_tools")
    with patch.object(mod, "_vectorize_tool"):
        result = mod.handler(_make_tool_body(), lambda_context)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    tool = body["tool"]
    assert tool["name"] == "Nmap Scanner"
    assert tool["category"] == "reconnaissance"
    assert tool["riskProfile"]["serviceDisruption"] == "low"
    assert tool["successProfile"]["estimatedSuccessRate"] == 95
    assert tool["status"] == "active"
    assert "toolId" in tool


def test_create_tool_missing_name(aws_env, lambda_context):
    """Missing name returns 400."""
    mod = import_handler("manage_tools")
    result = mod.handler({"action": "create"}, lambda_context)
    assert result["statusCode"] == 400
    assert "name is required" in json.loads(result["body"])["error"]


def test_create_tool_vectorizes(aws_env, lambda_context):
    """Create triggers vectorization."""
    mod = import_handler("manage_tools")
    with patch.object(mod, "_vectorize_tool") as mock_vec:
        mod.handler(_make_tool_body(), lambda_context)
    mock_vec.assert_called_once()
    call_arg = mock_vec.call_args[0][0]
    assert call_arg["name"] == "Nmap Scanner"


def test_list_tools(aws_env, lambda_context):
    """List returns all tools."""
    mod = import_handler("manage_tools")
    with patch.object(mod, "_vectorize_tool"):
        mod.handler(_make_tool_body(name="Tool A"), lambda_context)
        mod.handler(_make_tool_body(name="Tool B"), lambda_context)

    result = mod.handler({"action": "list"}, lambda_context)
    assert result["statusCode"] == 200
    tools = json.loads(result["body"])["tools"]
    assert len(tools) == 2


def test_get_tool(aws_env, lambda_context):
    """Get by toolId."""
    mod = import_handler("manage_tools")
    with patch.object(mod, "_vectorize_tool"):
        create_result = mod.handler(_make_tool_body(), lambda_context)
    tool_id = json.loads(create_result["body"])["tool"]["toolId"]

    result = mod.handler({"action": "get", "toolId": tool_id}, lambda_context)
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["tool"]["name"] == "Nmap Scanner"


def test_get_tool_not_found(aws_env, lambda_context):
    """Get nonexistent tool returns 404."""
    mod = import_handler("manage_tools")
    result = mod.handler({"action": "get", "toolId": "nonexistent"}, lambda_context)
    assert result["statusCode"] == 404


def test_update_tool(aws_env, lambda_context):
    """Update tool fields and re-vectorize."""
    mod = import_handler("manage_tools")
    with patch.object(mod, "_vectorize_tool"):
        create_result = mod.handler(_make_tool_body(), lambda_context)
    tool_id = json.loads(create_result["body"])["tool"]["toolId"]

    with patch.object(mod, "_vectorize_tool") as mock_vec:
        result = mod.handler({
            "action": "update",
            "toolId": tool_id,
            "description": "Updated description",
            "riskProfile": {"serviceDisruption": "high", "systemDamage": "medium"},
        }, lambda_context)

    assert result["statusCode"] == 200
    tool = json.loads(result["body"])["tool"]
    assert tool["description"] == "Updated description"
    assert tool["riskProfile"]["serviceDisruption"] == "high"
    mock_vec.assert_called_once()


def test_update_tool_not_found(aws_env, lambda_context):
    """Update nonexistent tool returns 404."""
    mod = import_handler("manage_tools")
    result = mod.handler({"action": "update", "toolId": "nonexistent", "name": "X"}, lambda_context)
    assert result["statusCode"] == 404


def test_build_embedding_text(aws_env, lambda_context):
    """Embedding text includes risk analysis, pros, and cons."""
    mod = import_handler("manage_tools")
    item = {
        "name": "Metasploit",
        "description": "Penetration testing framework",
        "category": "exploitation",
        "framework": "metasploit",
        "targetTypes": ["web", "network"],
        "protocols": ["tcp", "http"],
        "cveTargets": ["CVE-2024-1234"],
        "riskProfile": {
            "serviceDisruption": "high",
            "systemDamage": "critical",
            "detectionLikelihood": "high",
            "requiresAuth": False,
            "reversible": False,
            "noisy": True,
        },
        "successProfile": {
            "estimatedSuccessRate": 75,
            "avgExecutionTime": "2m",
            "requiredAccess": "network",
            "outputType": "shell",
        },
        "notes": "Use with caution",
    }
    text = mod._build_tool_embedding_text(item)
    assert "Metasploit" in text
    assert "High success rate (75%)" in text
    assert "NOT reversible" in text
    assert "could nuke infrastructure" in text.lower() or "Could damage/destroy systems" in text
    assert "Noisy" in text
    assert "CVE-2024-1234" in text


def test_vectorize_tool_stores_to_s3(aws_env, lambda_context):
    """Vectorize stores embedding in S3."""
    mod = import_handler("manage_tools")
    import boto3
    s3 = boto3.client("s3", region_name="us-east-1")

    fake_embedding = [0.1] * 256
    with patch.object(mod, "_generate_embedding", return_value=fake_embedding):
        mod._vectorize_tool({
            "toolId": "test-tool-123",
            "name": "Test Tool",
            "category": "recon",
            "riskProfile": {},
            "successProfile": {},
            "targetTypes": [],
            "protocols": [],
            "cveTargets": [],
            "status": "active",
        })

    obj = s3.get_object(Bucket="recon-ai-vectors-test", Key="embeddings/tools/test-tool-123.json")
    data = json.loads(obj["Body"].read())
    assert len(data) == 1
    assert data[0]["toolId"] == "test-tool-123"
    assert data[0]["sourceType"] == "tool_registry"
    assert len(data[0]["embedding"]) == 256
