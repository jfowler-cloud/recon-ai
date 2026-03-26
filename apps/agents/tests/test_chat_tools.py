"""Tests for shared chat_tools module."""

import json
from unittest.mock import MagicMock, patch

import boto3
import pytest
from moto import mock_aws


class TestGenerateChartConfig:
    """Tests for generate_chart_config tool."""

    def test_bar_chart(self):
        from shared.chat_tools import generate_chart_config, _collected_output

        _collected_output.clear()
        result = generate_chart_config(
            chart_type="bar",
            data=[{"name": "A", "value": 10}, {"name": "B", "value": 20}],
            title="Test Bar Chart",
            x_key="name",
            y_key="value",
        )
        assert result["chartType"] == "bar"
        assert result["title"] == "Test Bar Chart"
        assert result["xKey"] == "name"
        assert result["yKeys"] == ["value"]
        assert len(result["data"]) == 2
        assert len(_collected_output) == 1

    def test_pie_chart(self):
        from shared.chat_tools import generate_chart_config, _collected_output

        _collected_output.clear()
        result = generate_chart_config(
            chart_type="pie",
            data=[{"name": "Critical", "value": 5}],
            title="Severity Distribution",
        )
        assert result["chartType"] == "pie"
        assert result["type"] == "chart"

    def test_multi_series(self):
        from shared.chat_tools import generate_chart_config, _collected_output

        _collected_output.clear()
        result = generate_chart_config(
            chart_type="line",
            data=[{"date": "Jan", "open": 10, "closed": 5}],
            title="Trend",
            x_key="date",
            y_key="open,closed",
        )
        assert result["yKeys"] == ["open", "closed"]

    def test_collected_output_cleared(self):
        from shared.chat_tools import clear_collected_output, get_collected_output, generate_chart_config, _collected_output

        _collected_output.clear()
        generate_chart_config(
            chart_type="bar", data=[], title="T1",
        )
        generate_chart_config(
            chart_type="pie", data=[], title="T2",
        )
        assert len(get_collected_output()) == 2
        clear_collected_output()
        assert len(get_collected_output()) == 0


class TestSearchDocuments:
    """Tests for search_documents tool."""

    @mock_aws
    @patch("shared.chat_tools.generate_embedding")
    def test_search_no_vectors(self, mock_embed):
        """Search returns empty when no vectors exist."""
        mock_embed.return_value = [0.1] * 1024

        # Create empty bucket
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="ra-vectors-test")

        # Reset the cached s3 client
        import shared.chat_tools as ct
        ct._s3 = None
        ct._config.vectors_bucket = "ra-vectors-test"

        result = ct.search_documents(query="test query")
        assert result["results"] == []
        assert "No vectorized" in result.get("message", "")

    @mock_aws
    @patch("shared.chat_tools.generate_embedding")
    def test_search_with_vectors(self, mock_embed):
        """Search finds matching documents from S3 vectors."""
        mock_embed.return_value = [0.1] * 1024

        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="ra-vectors-test")

        # Store a vector batch
        vectors = [
            {
                "uploadId": "upload-1",
                "documentId": "doc-1",
                "embedding": [0.1] * 1024,
                "importance": "high",
                "sourceType": "shodan_json",
            }
        ]
        s3.put_object(
            Bucket="ra-vectors-test",
            Key="embeddings/upload-1/batch-1.json",
            Body=json.dumps(vectors),
        )

        # Create DynamoDB table for document enrichment
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        ddb.create_table(
            TableName="RA-Documents",
            KeySchema=[
                {"AttributeName": "uploadId", "KeyType": "HASH"},
                {"AttributeName": "documentId", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "uploadId", "AttributeType": "S"},
                {"AttributeName": "documentId", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        ddb.Table("RA-Documents").put_item(Item={
            "uploadId": "upload-1",
            "documentId": "doc-1",
            "text": "Open port 443 on target server",
            "sourceType": "shodan_json",
            "metadata": {"ip": "10.0.0.1"},
        })

        import shared.chat_tools as ct
        import os
        ct._s3 = None
        ct._vector_cache = []
        ct._vector_cache_ts = 0.0
        ct._config.vectors_bucket = "ra-vectors-test"
        ct._config.documents_table = "RA-Documents"
        # Clear /tmp disk cache
        for f in ["/tmp/vectors_cache.json", "/tmp/vectors_cache_meta.json"]:
            if os.path.exists(f):
                os.remove(f)

        # Reset DynamoDB connection to use moto
        import shared.db as db_mod
        db_mod._dynamodb = None

        result = ct.search_documents(query="open ports")
        assert len(result["results"]) == 1
        assert result["results"][0]["documentId"] == "doc-1"
        assert result["results"][0]["score"] > 0

    @mock_aws
    @patch("shared.chat_tools.generate_embedding")
    def test_search_with_source_filter(self, mock_embed):
        """Search filters by source_types."""
        mock_embed.return_value = [0.1] * 1024

        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="ra-vectors-test")

        vectors = [
            {"uploadId": "u1", "documentId": "d1", "embedding": [0.1] * 1024, "importance": "standard", "sourceType": "shodan_json"},
            {"uploadId": "u2", "documentId": "d2", "embedding": [0.1] * 1024, "importance": "standard", "sourceType": "nmap_xml"},
        ]
        s3.put_object(
            Bucket="ra-vectors-test",
            Key="embeddings/batch/batch-1.json",
            Body=json.dumps(vectors),
        )

        import shared.chat_tools as ct
        import os
        ct._s3 = None
        ct._vector_cache = []
        ct._vector_cache_ts = 0.0
        ct._config.vectors_bucket = "ra-vectors-test"
        for f in ["/tmp/vectors_cache.json", "/tmp/vectors_cache_meta.json"]:
            if os.path.exists(f):
                os.remove(f)

        result = ct.search_documents(query="test", source_types=["nmap_xml"])
        assert len(result["results"]) == 1
        assert result["results"][0]["documentId"] == "d2"
