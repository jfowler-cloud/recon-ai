"""Tests for parse_upload adapters."""

import json
from unittest.mock import patch, MagicMock

import pytest

from adapters import (
    get_adapter,
    text_passthrough,
    shodan_json,
    _shodan_importance,
    nmap_xml,
    social_csv,
    log_text,
    document_textract,
    _enrich_with_comprehend,
    ADAPTERS,
)


# ---- text_passthrough ----

def test_text_simple():
    docs = text_passthrough(b"Hello world", "u1", "test.txt")
    assert len(docs) == 1
    assert docs[0]["text"] == "Hello world"
    assert docs[0]["sourceType"] == "custom"


def test_text_chunking_on_double_newline():
    content = b"Paragraph one.\n\nParagraph two.\n\nParagraph three."
    docs = text_passthrough(content, "u1", "test.txt")
    assert len(docs) == 1  # All fit in one chunk
    assert "Paragraph one." in docs[0]["text"]
    assert "Paragraph three." in docs[0]["text"]


def test_text_large_splits():
    chunk = "A" * 4000
    content = f"{chunk}\n\n{chunk}".encode()
    docs = text_passthrough(content, "u1", "test.txt")
    assert len(docs) == 2


def test_text_empty_content():
    docs = text_passthrough(b"", "u1", "test.txt")
    assert len(docs) == 1
    assert docs[0]["text"] == ""


# ---- shodan_json ----

def test_shodan_jsonl_parsing():
    records = [
        {"ip_str": "1.2.3.4", "port": 80, "org": "TestOrg", "product": "nginx"},
        {"ip_str": "5.6.7.8", "port": 443, "org": "Corp", "vulns": {"CVE-2021-1234": {}}},
    ]
    content = "\n".join(json.dumps(r) for r in records).encode()
    docs = shodan_json(content, "u1", "scan.json")

    assert len(docs) == 2
    assert docs[0]["metadata"]["ip"] == "1.2.3.4"
    assert docs[0]["importance"] == "standard"
    assert docs[1]["importance"] == "high"  # has vulns
    assert "CVE-2021-1234" in docs[1]["metadata"]["vulns"]


def test_shodan_invalid_json_lines_skipped():
    content = b'{"ip_str": "1.1.1.1", "port": 22}\nnot-json\n{"ip_str": "2.2.2.2", "port": 80}'
    docs = shodan_json(content, "u1", "scan.json")
    assert len(docs) == 2


def test_shodan_empty_content():
    docs = shodan_json(b"", "u1", "scan.json")
    assert len(docs) == 0


def test_shodan_banner_truncation():
    record = {"ip_str": "1.1.1.1", "port": 80, "data": "X" * 5000}
    content = json.dumps(record).encode()
    docs = shodan_json(content, "u1", "scan.json")
    assert len(docs[0]["text"]) < 3000  # Banner truncated to 2000


def test_shodan_full_export_fields():
    """Test that enhanced Shodan fields are extracted into text and metadata."""
    record = {
        "ip_str": "93.184.216.34",
        "port": 443,
        "org": "Edgecast",
        "product": "nginx",
        "version": "1.25.3",
        "transport": "tcp",
        "os": "Linux",
        "asn": "AS15133",
        "isp": "Edgecast Inc",
        "country_code": "US",
        "city": "Los Angeles",
        "region_code": "CA",
        "hostnames": ["example.com", "www.example.com"],
        "domains": ["example.com"],
        "timestamp": "2026-03-20T12:00:00.000000",
        "ssl": {
            "cert": {
                "subject": {"CN": "example.com"},
                "issuer": {"O": "Let's Encrypt", "CN": "R3"},
                "expires": "2026-06-01T00:00:00",
                "expired": False,
            },
            "cipher": {"version": "TLSv1.3"},
        },
        "http": {
            "title": "Example Domain",
            "server": "nginx/1.25.3",
            "waf": "Cloudflare",
            "components": {"jQuery": "3.6.0", "Bootstrap": "5.3"},
            "status": 200,
        },
        "cloud": {"provider": "AWS", "region": "us-west-2", "service": "EC2"},
        "location": {"latitude": 34.0522, "longitude": -118.2437},
    }
    content = json.dumps(record).encode()
    docs = shodan_json(content, "u1", "scan.json")
    assert len(docs) == 1
    doc = docs[0]

    # Text should contain all searchable fields
    assert "example.com" in doc["text"]
    assert "www.example.com" in doc["text"]
    assert "Edgecast" in doc["text"]
    assert "AS15133" in doc["text"]
    assert "Los Angeles" in doc["text"]
    assert "nginx" in doc["text"]
    assert "1.25.3" in doc["text"]
    assert "Linux" in doc["text"]
    assert "TLSv1.3" in doc["text"]
    assert "Let's Encrypt" in doc["text"]
    assert "Example Domain" in doc["text"]
    assert "Cloudflare" in doc["text"]
    assert "AWS" in doc["text"]
    assert "us-west-2" in doc["text"]
    assert "34.0522" in doc["text"]
    assert "2026-03-20" in doc["text"]

    # Metadata
    assert doc["metadata"]["hostnames"] == ["example.com", "www.example.com"]
    assert doc["metadata"]["domains"] == ["example.com"]
    assert doc["metadata"]["asn"] == "AS15133"
    assert doc["metadata"]["countryCode"] == "US"
    assert doc["metadata"]["city"] == "Los Angeles"
    assert doc["metadata"]["cloudProvider"] == "AWS"
    assert doc["metadata"]["cloudRegion"] == "us-west-2"
    assert doc["metadata"]["sslSubject"] == "example.com"
    assert doc["metadata"]["sslExpired"] is False
    assert doc["metadata"]["sslCipherVersion"] == "TLSv1.3"
    assert doc["metadata"]["httpTitle"] == "Example Domain"
    assert doc["metadata"]["httpServer"] == "nginx/1.25.3"
    assert doc["metadata"]["timestamp"] == "2026-03-20T12:00:00.000000"

    # Cloud-exposed => medium (no vulns, no expired SSL, no DB port, no admin panel)
    assert doc["importance"] == "medium"


def test_shodan_importance_critical_cvss():
    """Critical importance for CVSS >= 9.0."""
    record = {"ip_str": "1.1.1.1", "port": 80, "vulns": {"CVE-2024-9999": {"cvss": 9.8}}}
    assert _shodan_importance(record) == "critical"


def test_shodan_importance_high_any_vulns():
    """High importance for any vulns (even without CVSS)."""
    record = {"ip_str": "1.1.1.1", "port": 80, "vulns": {"CVE-2024-1234": {}}}
    assert _shodan_importance(record) == "high"


def test_shodan_importance_high_expired_ssl():
    """High importance for expired SSL certificate."""
    record = {"ip_str": "1.1.1.1", "port": 443, "ssl": {"cert": {"expired": True}}}
    assert _shodan_importance(record) == "high"


def test_shodan_importance_high_db_ports():
    """High importance for exposed database ports."""
    for db_port in [3306, 5432, 27017, 6379, 9200]:
        record = {"ip_str": "1.1.1.1", "port": db_port}
        assert _shodan_importance(record) == "high", f"Port {db_port} should be high"


def test_shodan_importance_high_admin_panels():
    """High importance for admin panels in HTTP title."""
    for panel in ["Jenkins", "phpMyAdmin", "Grafana Dashboard", "Kibana"]:
        record = {"ip_str": "1.1.1.1", "port": 80, "http": {"title": panel}}
        assert _shodan_importance(record) == "high", f"{panel} should be high"


def test_shodan_importance_medium_deprecated_tls():
    """Medium importance for deprecated TLS versions."""
    for ver in ["TLSv1", "TLSv1.1"]:
        record = {"ip_str": "1.1.1.1", "port": 443, "ssl": {"cipher": {"version": ver}}}
        assert _shodan_importance(record) == "medium", f"{ver} should be medium"


def test_shodan_importance_medium_cloud():
    """Medium importance for cloud-exposed services."""
    record = {"ip_str": "1.1.1.1", "port": 80, "cloud": {"provider": "AWS"}}
    assert _shodan_importance(record) == "medium"


def test_shodan_importance_standard():
    """Standard importance for plain records."""
    record = {"ip_str": "1.1.1.1", "port": 80}
    assert _shodan_importance(record) == "standard"


def test_shodan_importance_priority_order():
    """Critical > high: vuln with CVSS 9.5 + expired SSL should be critical."""
    record = {
        "ip_str": "1.1.1.1", "port": 3306,
        "vulns": {"CVE-2024-0001": {"cvss": 9.5}},
        "ssl": {"cert": {"expired": True}},
    }
    assert _shodan_importance(record) == "critical"


# ---- nmap_xml ----

def test_nmap_basic_xml():
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="10.0.0.1" addrtype="ipv4"/>
        <hostnames><hostname name="server1.local"/></hostnames>
        <ports>
          <port portid="22" protocol="tcp">
            <state state="open"/>
            <service name="ssh" product="OpenSSH"/>
          </port>
          <port portid="80" protocol="tcp">
            <state state="open"/>
            <service name="http" product="nginx"/>
          </port>
        </ports>
      </host>
    </nmaprun>"""

    docs = nmap_xml(xml, "u1", "scan.xml")
    assert len(docs) == 1
    assert docs[0]["metadata"]["ip"] == "10.0.0.1"
    assert docs[0]["metadata"]["openPorts"] == 2
    assert "server1.local" in docs[0]["metadata"]["hostnames"]


def test_nmap_invalid_xml_falls_back():
    docs = nmap_xml(b"not xml at all", "u1", "scan.xml")
    assert len(docs) >= 1
    assert docs[0]["sourceType"] == "custom"  # fell back to text_passthrough


def test_nmap_many_open_ports_high_importance():
    ports = "".join(
        f'<port portid="{i}" protocol="tcp"><state state="open"/><service name="svc{i}"/></port>'
        for i in range(1, 15)
    )
    xml = f'<?xml version="1.0"?><nmaprun><host><address addr="10.0.0.1"/><ports>{ports}</ports></host></nmaprun>'
    docs = nmap_xml(xml.encode(), "u1", "scan.xml")
    assert docs[0]["importance"] == "high"


def test_nmap_no_hosts():
    xml = b'<?xml version="1.0"?><nmaprun></nmaprun>'
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert len(docs) == 0


def test_nmap_os_detection():
    """Test OS detection extraction."""
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="10.0.0.1" addrtype="ipv4"/>
        <os>
          <osmatch name="Linux 5.4" accuracy="95"/>
          <osmatch name="Linux 5.10" accuracy="90"/>
        </os>
        <ports>
          <port portid="22" protocol="tcp">
            <state state="open"/>
            <service name="ssh"/>
          </port>
        </ports>
      </host>
    </nmaprun>"""
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert len(docs) == 1
    assert "Linux 5.4" in docs[0]["text"]
    assert "95% accuracy" in docs[0]["text"]
    assert docs[0]["metadata"]["osMatches"][0]["name"] == "Linux 5.4"
    assert docs[0]["metadata"]["osMatches"][0]["accuracy"] == "95"


def test_nmap_cpe_extraction():
    """Test CPE string extraction from services."""
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="10.0.0.1" addrtype="ipv4"/>
        <ports>
          <port portid="22" protocol="tcp">
            <state state="open"/>
            <service name="ssh" product="OpenSSH" version="8.9">
              <cpe>cpe:/a:openbsd:openssh:8.9</cpe>
            </service>
          </port>
        </ports>
      </host>
    </nmaprun>"""
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert "cpe:/a:openbsd:openssh:8.9" in docs[0]["text"]
    assert "cpe:/a:openbsd:openssh:8.9" in docs[0]["metadata"]["cpes"]


def test_nmap_nse_scripts():
    """Test NSE script output extraction."""
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="10.0.0.1" addrtype="ipv4"/>
        <ports>
          <port portid="443" protocol="tcp">
            <state state="open"/>
            <service name="https"/>
            <script id="http-title" output="Welcome to Example"/>
            <script id="ssl-cert" output="Subject: CN=example.com"/>
          </port>
        </ports>
      </host>
    </nmaprun>"""
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert "Welcome to Example" in docs[0]["text"]
    assert "CN=example.com" in docs[0]["text"]
    assert "443/tcp:http-title" in docs[0]["metadata"]["nseScripts"]
    assert "443/tcp:ssl-cert" in docs[0]["metadata"]["nseScripts"]


def test_nmap_mac_address():
    """Test MAC address and vendor extraction."""
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="192.168.1.1" addrtype="ipv4"/>
        <address addr="AA:BB:CC:DD:EE:FF" addrtype="mac" vendor="Cisco"/>
        <ports>
          <port portid="80" protocol="tcp">
            <state state="open"/>
            <service name="http"/>
          </port>
        </ports>
      </host>
    </nmaprun>"""
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert "AA:BB:CC:DD:EE:FF" in docs[0]["text"]
    assert "Cisco" in docs[0]["text"]
    assert docs[0]["metadata"]["macAddress"] == "AA:BB:CC:DD:EE:FF"
    assert docs[0]["metadata"]["macVendor"] == "Cisco"


def test_nmap_service_version_in_text():
    """Test that service version info appears in text."""
    xml = b"""<?xml version="1.0"?>
    <nmaprun>
      <host>
        <address addr="10.0.0.1" addrtype="ipv4"/>
        <ports>
          <port portid="80" protocol="tcp">
            <state state="open"/>
            <service name="http" product="Apache" version="2.4.52"/>
          </port>
        </ports>
      </host>
    </nmaprun>"""
    docs = nmap_xml(xml, "u1", "scan.xml")
    assert "Apache" in docs[0]["text"]
    assert "2.4.52" in docs[0]["text"]


def test_nmap_xxe_billion_laughs_rejected():
    """defusedxml rejects XML bomb (billion laughs) attacks."""
    xxe_payload = b"""<?xml version="1.0"?>
    <!DOCTYPE lolz [
      <!ENTITY lol "lol">
      <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
      <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
    ]>
    <nmaprun>&lol3;</nmaprun>"""

    # defusedxml should reject this and fall back to text_passthrough
    docs = nmap_xml(xxe_payload, "u1", "malicious.xml")
    # Should not crash; falls back to text passthrough
    assert len(docs) >= 1
    # Should NOT contain expanded entity (would be millions of "lol")
    assert len(docs[0]["text"]) < 10000


def test_nmap_external_entity_rejected():
    """defusedxml rejects external entity references."""
    xxe_payload = b"""<?xml version="1.0"?>
    <!DOCTYPE foo [
      <!ENTITY xxe SYSTEM "file:///etc/passwd">
    ]>
    <nmaprun><host><address addr="&xxe;"/></host></nmaprun>"""

    docs = nmap_xml(xxe_payload, "u1", "xxe.xml")
    # Should fall back to text_passthrough, not leak /etc/passwd
    assert len(docs) >= 1
    for doc in docs:
        assert "root:" not in doc.get("text", "")


# ---- social_csv ----

def test_social_basic_csv():
    content = b"username,message,timestamp\njdoe,Hello world,2024-01-01\njane,Test post,2024-01-02"
    docs = social_csv(content, "u1", "feed.csv")
    assert len(docs) == 2
    assert "jdoe" in docs[0]["text"]
    assert docs[0]["metadata"]["username"] == "jdoe"


def test_social_empty_csv():
    content = b"col1,col2\n"
    docs = social_csv(content, "u1", "feed.csv")
    assert len(docs) == 0


# ---- log_text ----

def test_log_basic():
    lines = "\n".join(f"2024-01-01 INFO Line {i}" for i in range(100))
    docs = log_text(lines.encode(), "u1", "app.log")
    assert len(docs) == 2  # 100 lines / 50 per chunk


def test_log_critical_high_importance():
    content = b"2024-01-01 CRITICAL System failure detected"
    docs = log_text(content, "u1", "app.log")
    assert docs[0]["importance"] == "high"


def test_log_error_medium_importance():
    content = b"2024-01-01 ERROR Connection refused"
    docs = log_text(content, "u1", "app.log")
    assert docs[0]["importance"] == "medium"


def test_log_info_standard_importance():
    content = b"2024-01-01 INFO Application started"
    docs = log_text(content, "u1", "app.log")
    assert docs[0]["importance"] == "standard"


def test_log_empty():
    docs = log_text(b"", "u1", "app.log")
    assert len(docs) == 0


# ---- document_textract ----

def test_textract_pdf_async(monkeypatch):
    """Test PDF extraction via async Textract API."""
    monkeypatch.setenv("UPLOADS_BUCKET", "test-bucket")

    mock_textract = MagicMock()
    mock_textract.start_document_text_detection.return_value = {"JobId": "job-123"}
    mock_textract.get_document_text_detection.return_value = {
        "JobStatus": "SUCCEEDED",
        "Blocks": [
            {"BlockType": "LINE", "Text": "Page 1 line 1"},
            {"BlockType": "LINE", "Text": "Page 1 line 2"},
            {"BlockType": "WORD", "Text": "ignored"},
        ],
    }

    with patch("boto3.client") as mock_client:
        mock_client.return_value = mock_textract
        with patch("time.sleep"):
            docs = document_textract(b"%PDF-fake", "u1", "report.pdf")

    assert len(docs) >= 1
    assert "Page 1 line 1" in docs[0]["text"]
    assert docs[0]["metadata"]["extractionMethod"] == "textract"
    assert docs[0]["metadata"]["fileType"] == "pdf"


def test_textract_image_sync(monkeypatch):
    """Test image extraction via sync Textract API."""
    monkeypatch.setenv("UPLOADS_BUCKET", "test-bucket")

    mock_textract = MagicMock()
    mock_textract.detect_document_text.return_value = {
        "Blocks": [
            {"BlockType": "LINE", "Text": "OCR text from image"},
        ],
    }

    with patch("boto3.client") as mock_client:
        mock_client.return_value = mock_textract
        docs = document_textract(b"fake-png", "u1", "screenshot.png")

    assert len(docs) >= 1
    assert "OCR text from image" in docs[0]["text"]


def test_textract_failure_fallback(monkeypatch):
    """Test that Textract failure falls back to text_passthrough."""
    monkeypatch.setenv("UPLOADS_BUCKET", "test-bucket")

    with patch("boto3.client") as mock_client:
        mock_client.side_effect = Exception("Textract unavailable")
        docs = document_textract(b"Some raw text", "u1", "broken.pdf")

    assert len(docs) >= 1
    assert docs[0]["sourceType"] == "custom"


def test_textract_empty_result(monkeypatch):
    """Test that empty Textract result returns placeholder."""
    monkeypatch.setenv("UPLOADS_BUCKET", "test-bucket")

    mock_textract = MagicMock()
    mock_textract.detect_document_text.return_value = {"Blocks": []}

    with patch("boto3.client") as mock_client:
        mock_client.return_value = mock_textract
        docs = document_textract(b"fake-png", "u1", "blank.png")

    assert len(docs) == 1
    assert "No text extracted" in docs[0]["text"]


def test_textract_pdf_job_failed(monkeypatch):
    """Test that failed Textract job falls back to text_passthrough."""
    monkeypatch.setenv("UPLOADS_BUCKET", "test-bucket")

    mock_textract = MagicMock()
    mock_textract.start_document_text_detection.return_value = {"JobId": "job-fail"}
    mock_textract.get_document_text_detection.return_value = {"JobStatus": "FAILED", "Blocks": []}

    with patch("boto3.client") as mock_client:
        mock_client.return_value = mock_textract
        with patch("time.sleep"):
            docs = document_textract(b"bad pdf content", "u1", "bad.pdf")

    assert docs[0]["sourceType"] == "custom"


# ---- _enrich_with_comprehend ----

def test_enrichment_enabled(monkeypatch):
    """Test Comprehend enrichment adds metadata."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "true")

    mock_comprehend = MagicMock()
    mock_comprehend.detect_entities.return_value = {
        "Entities": [{"Text": "John Doe", "Type": "PERSON", "Score": 0.99}]
    }
    mock_comprehend.detect_sentiment.return_value = {"Sentiment": "NEUTRAL"}
    mock_comprehend.detect_key_phrases.return_value = {
        "KeyPhrases": [{"Text": "security breach", "Score": 0.95}]
    }

    docs = [{"text": "John Doe reported a security breach", "metadata": {}}]

    with patch("boto3.client", return_value=mock_comprehend):
        result = _enrich_with_comprehend(docs)

    assert result[0]["metadata"]["entities"][0]["text"] == "John Doe"
    assert result[0]["metadata"]["sentiment"] == "NEUTRAL"
    assert "security breach" in result[0]["metadata"]["keyPhrases"]


def test_enrichment_disabled(monkeypatch):
    """Test Comprehend enrichment skipped when disabled."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "false")

    docs = [{"text": "Some text", "metadata": {}}]
    result = _enrich_with_comprehend(docs)
    assert "entities" not in result[0].get("metadata", {})


def test_enrichment_boosts_importance(monkeypatch):
    """Test importance boost when person/org + negative sentiment."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "true")

    mock_comprehend = MagicMock()
    mock_comprehend.detect_entities.return_value = {
        "Entities": [{"Text": "ACME Corp", "Type": "ORGANIZATION", "Score": 0.95}]
    }
    mock_comprehend.detect_sentiment.return_value = {"Sentiment": "NEGATIVE"}
    mock_comprehend.detect_key_phrases.return_value = {"KeyPhrases": []}

    docs = [{"text": "ACME Corp data breach detected", "metadata": {}, "importance": "standard"}]

    with patch("boto3.client", return_value=mock_comprehend):
        result = _enrich_with_comprehend(docs)

    assert result[0]["importance"] == "high"


def test_enrichment_handles_errors(monkeypatch):
    """Test Comprehend errors don't break pipeline."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "true")

    mock_comprehend = MagicMock()
    mock_comprehend.detect_entities.side_effect = Exception("throttled")

    docs = [{"text": "Some text", "metadata": {}}]

    with patch("boto3.client", return_value=mock_comprehend):
        result = _enrich_with_comprehend(docs)

    # Should not raise, doc returned unchanged
    assert "entities" not in result[0].get("metadata", {})


def test_enrichment_skips_empty_text(monkeypatch):
    """Test Comprehend skips docs with empty text."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "true")

    mock_comprehend = MagicMock()

    docs = [{"text": "", "metadata": {}}, {"text": "   ", "metadata": {}}]

    with patch("boto3.client", return_value=mock_comprehend):
        result = _enrich_with_comprehend(docs)

    mock_comprehend.detect_entities.assert_not_called()


def test_low_confidence_entities_filtered(monkeypatch):
    """Test entities below 0.8 confidence are filtered out."""
    monkeypatch.setenv("COMPREHEND_ENRICHMENT", "true")

    mock_comprehend = MagicMock()
    mock_comprehend.detect_entities.return_value = {
        "Entities": [
            {"Text": "Confident", "Type": "PERSON", "Score": 0.95},
            {"Text": "Unsure", "Type": "PERSON", "Score": 0.5},
        ]
    }
    mock_comprehend.detect_sentiment.return_value = {"Sentiment": "NEUTRAL"}
    mock_comprehend.detect_key_phrases.return_value = {"KeyPhrases": []}

    docs = [{"text": "Confident and Unsure were here", "metadata": {}}]

    with patch("boto3.client", return_value=mock_comprehend):
        result = _enrich_with_comprehend(docs)

    assert len(result[0]["metadata"]["entities"]) == 1
    assert result[0]["metadata"]["entities"][0]["text"] == "Confident"


# ---- get_adapter ----

def test_known_adapters():
    for name in ADAPTERS:
        adapter = get_adapter(name)
        assert callable(adapter)


def test_unknown_falls_back():
    adapter = get_adapter("unknown_type")
    assert adapter is text_passthrough


def test_document_textract_registered():
    assert "document_textract" in ADAPTERS
