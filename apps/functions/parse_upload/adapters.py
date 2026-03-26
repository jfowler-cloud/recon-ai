"""Data source adapters — extensible text extraction for different file formats.

Each adapter takes raw bytes, uploadId, and s3Key, and returns a list of
document dicts: {text, metadata, sourceType, importance}.

To add a new source type:
1. Define an adapter function following the signature below.
2. Register it in ADAPTERS dict.
3. Add to config.json dataSources.
"""

import os


def text_passthrough(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Pass through plain text, splitting on double newlines for chunking."""
    text = content.decode("utf-8", errors="replace")
    chunks = [c.strip() for c in text.split("\n\n") if c.strip()]

    if not chunks:
        return [{"text": text, "metadata": {"s3Key": s3_key}, "sourceType": "custom", "importance": "standard"}]

    # Combine small chunks, split large ones
    documents = []
    current = ""
    for chunk in chunks:
        if len(current) + len(chunk) > 6000:
            if current:
                documents.append({
                    "text": current,
                    "metadata": {"s3Key": s3_key, "chunkIndex": len(documents)},
                    "sourceType": "custom",
                    "importance": "standard",
                })
            current = chunk
        else:
            current = f"{current}\n\n{chunk}" if current else chunk

    if current:
        documents.append({
            "text": current,
            "metadata": {"s3Key": s3_key, "chunkIndex": len(documents)},
            "sourceType": "custom",
            "importance": "standard",
        })

    return documents


def _shodan_importance(record: dict) -> str:
    """Determine importance level for a Shodan record.

    - critical: vulns with CVSS >= 9.0
    - high: any vulns, expired SSL, exposed DB ports, admin panels
    - medium: deprecated TLS, cloud-exposed services
    - standard: everything else
    """
    vulns = record.get("vulns", {})
    vuln_dict = vulns if isinstance(vulns, dict) else {}

    # Critical: any vuln with CVSS >= 9.0
    for _cve, details in vuln_dict.items():
        if isinstance(details, dict):
            cvss = details.get("cvss", 0)
            if isinstance(cvss, (int, float)) and cvss >= 9.0:
                return "critical"

    port = record.get("port", 0)
    ssl_info = record.get("ssl", {}) or {}
    cert = ssl_info.get("cert", {}) or {}
    http_info = record.get("http", {}) or {}
    http_title = str(http_info.get("title", "") or "").lower()
    cloud = record.get("cloud", {}) or {}

    # High: any vulns at all
    if vuln_dict:
        return "high"

    # High: expired SSL
    if cert.get("expired") is True:
        return "high"

    # High: exposed database ports
    db_ports = {3306, 5432, 27017, 6379, 9200}
    if port in db_ports:
        return "high"

    # High: admin panels in HTTP title
    admin_panels = ["jenkins", "phpmyadmin", "grafana", "kibana"]
    if any(panel in http_title for panel in admin_panels):
        return "high"

    # Medium: deprecated TLS versions
    cipher = ssl_info.get("cipher", {}) or {}
    tls_version = str(cipher.get("version", "") or "").lower()
    if tls_version in ("tlsv1", "tlsv1.1"):
        return "medium"

    # Medium: cloud-exposed service
    if cloud.get("provider"):
        return "medium"

    return "standard"


def shodan_json(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Parse Shodan JSON export (one JSON object per line or array)."""
    import json

    text = content.decode("utf-8", errors="replace")
    documents = []

    # Try JSONL format first (Shodan default export)
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    for i, line in enumerate(lines):
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue

        ip = record.get("ip_str", record.get("ip", "unknown"))
        port = record.get("port", "")
        org = record.get("org", "")
        product = record.get("product", "")
        vulns = record.get("vulns", {})
        vuln_list = list(vulns.keys()) if isinstance(vulns, dict) else []

        # Extended fields
        hostnames = record.get("hostnames", []) or []
        domains = record.get("domains", []) or []
        transport = record.get("transport", "")
        version = record.get("version", "")
        os_name = record.get("os", "")
        asn = record.get("asn", "")
        isp = record.get("isp", "")
        country_code = record.get("country_code", "")
        city = record.get("city", "")
        region_code = record.get("region_code", "")
        timestamp = record.get("timestamp", "")

        # SSL/TLS info
        ssl_info = record.get("ssl", {}) or {}
        cert = ssl_info.get("cert", {}) or {}
        cipher = ssl_info.get("cipher", {}) or {}
        ssl_subject_cn = ""
        ssl_issuer = ""
        ssl_expires = ""
        ssl_expired = cert.get("expired", False)
        ssl_cipher_version = cipher.get("version", "")
        if cert.get("subject", {}):
            ssl_subject_cn = (cert["subject"].get("CN", "") or "")
        if cert.get("issuer", {}):
            issuer_parts = cert["issuer"]
            ssl_issuer = issuer_parts.get("O", "") or issuer_parts.get("CN", "") or ""
        ssl_expires = cert.get("expires", "")

        # HTTP info
        http_info = record.get("http", {}) or {}
        http_title = http_info.get("title", "")
        http_server = http_info.get("server", "")
        http_waf = http_info.get("waf", "")
        http_components = http_info.get("components", {}) or {}
        http_status = http_info.get("status", "")

        # Cloud info
        cloud = record.get("cloud", {}) or {}
        cloud_provider = cloud.get("provider", "")
        cloud_region = cloud.get("region", "")
        cloud_service = cloud.get("service", "")

        # Location
        location = record.get("location", {}) or {}
        latitude = location.get("latitude", "")
        longitude = location.get("longitude", "")

        # Build semantic search text
        text_parts = [f"Host: {ip}:{port}"]
        if hostnames:
            text_parts.append(f"Hostnames: {', '.join(hostnames)}")
        if domains:
            text_parts.append(f"Domains: {', '.join(domains)}")
        text_parts.append(f"Organization: {org}")
        if isp and isp != org:
            text_parts.append(f"ISP: {isp}")
        if asn:
            text_parts.append(f"ASN: {asn}")
        if product:
            text_parts.append(f"Product: {product}")
        if version:
            text_parts.append(f"Version: {version}")
        if transport:
            text_parts.append(f"Transport: {transport}")
        if os_name:
            text_parts.append(f"OS: {os_name}")

        # Geo
        geo_parts = [p for p in [city, region_code, country_code] if p]
        if geo_parts:
            text_parts.append(f"Location: {', '.join(geo_parts)}")
        if latitude and longitude:
            text_parts.append(f"Coordinates: {latitude}, {longitude}")

        # Cloud
        if cloud_provider:
            cloud_str = f"Cloud: {cloud_provider}"
            if cloud_region:
                cloud_str += f" ({cloud_region})"
            if cloud_service:
                cloud_str += f" [{cloud_service}]"
            text_parts.append(cloud_str)

        # SSL/TLS
        if ssl_subject_cn or ssl_cipher_version:
            ssl_parts = ["SSL/TLS:"]
            if ssl_subject_cn:
                ssl_parts.append(f"  Subject: {ssl_subject_cn}")
            if ssl_issuer:
                ssl_parts.append(f"  Issuer: {ssl_issuer}")
            if ssl_expires:
                ssl_parts.append(f"  Expires: {ssl_expires}")
            if ssl_expired:
                ssl_parts.append("  Status: EXPIRED")
            if ssl_cipher_version:
                ssl_parts.append(f"  Cipher: {ssl_cipher_version}")
            text_parts.append("\n".join(ssl_parts))

        # HTTP
        if http_title or http_server:
            http_parts = ["HTTP:"]
            if http_status:
                http_parts.append(f"  Status: {http_status}")
            if http_title:
                http_parts.append(f"  Title: {http_title}")
            if http_server:
                http_parts.append(f"  Server: {http_server}")
            if http_waf:
                http_parts.append(f"  WAF: {http_waf}")
            if http_components:
                comp_str = ", ".join(f"{k} {v}" if isinstance(v, str) else k for k, v in http_components.items())
                http_parts.append(f"  Components: {comp_str}")
            text_parts.append("\n".join(http_parts))

        if vuln_list:
            text_parts.append(f"Vulnerabilities: {', '.join(vuln_list)}")

        if record.get("data"):
            text_parts.append(f"Banner: {str(record['data'])[:2000]}")

        if timestamp:
            text_parts.append(f"Timestamp: {timestamp}")

        doc_text = "\n".join(text_parts)

        importance = _shodan_importance(record)

        documents.append({
            "text": doc_text,
            "metadata": {
                "s3Key": s3_key,
                "ip": ip,
                "port": str(port),
                "vulns": vuln_list,
                "recordIndex": i,
                "hostnames": hostnames,
                "domains": domains,
                "transport": transport,
                "os": os_name,
                "asn": asn,
                "isp": isp,
                "countryCode": country_code,
                "city": city,
                "regionCode": region_code,
                "cloudProvider": cloud_provider,
                "cloudRegion": cloud_region,
                "sslSubject": ssl_subject_cn,
                "sslExpired": ssl_expired,
                "sslCipherVersion": ssl_cipher_version,
                "httpTitle": str(http_title or ""),
                "httpServer": str(http_server or ""),
                "timestamp": timestamp,
            },
            "sourceType": "shodan",
            "importance": importance,
        })

    return documents


def nmap_xml(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Parse Nmap XML output."""
    import defusedxml.ElementTree as ET

    documents = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return text_passthrough(content, upload_id, s3_key)

    for host in root.findall(".//host"):
        # IP address (prefer ipv4)
        addr_elem = host.find("address")
        ip = addr_elem.get("addr", "unknown") if addr_elem is not None else "unknown"

        # MAC address and vendor
        mac_address = ""
        mac_vendor = ""
        for addr in host.findall("address"):
            if addr.get("addrtype") == "mac":
                mac_address = addr.get("addr", "")
                mac_vendor = addr.get("vendor", "")

        hostnames = [h.get("name", "") for h in host.findall(".//hostname")]
        hostname_str = ", ".join(hostnames) if hostnames else "N/A"

        # OS detection
        os_matches = []
        for osmatch in host.findall(".//osmatch"):
            os_name = osmatch.get("name", "")
            os_accuracy = osmatch.get("accuracy", "")
            if os_name:
                os_matches.append({"name": os_name, "accuracy": os_accuracy})

        ports_info = []
        all_cpes = []
        nse_outputs = {}
        for port in host.findall(".//port"):
            port_id = port.get("portid", "")
            protocol = port.get("protocol", "")
            state = port.find("state")
            state_str = state.get("state", "") if state is not None else ""
            service = port.find("service")
            service_name = service.get("name", "") if service is not None else ""
            service_product = service.get("product", "") if service is not None else ""
            service_version = service.get("version", "") if service is not None else ""

            port_line = f"  {port_id}/{protocol} {state_str} {service_name}"
            if service_product:
                port_line += f" {service_product}"
            if service_version:
                port_line += f" {service_version}"

            # CPE strings from service element
            if service is not None:
                for cpe_elem in service.findall("cpe"):
                    if cpe_elem.text:
                        all_cpes.append(cpe_elem.text)
                        port_line += f" ({cpe_elem.text})"

            ports_info.append(port_line.strip())

            # NSE script outputs
            for script in port.findall("script"):
                script_id = script.get("id", "")
                script_output = script.get("output", "")
                if script_id and script_output:
                    nse_outputs[f"{port_id}/{protocol}:{script_id}"] = script_output.strip()

        # Host-level scripts
        hostscript = host.find("hostscript")
        if hostscript is not None:
            for script in hostscript.findall("script"):
                script_id = script.get("id", "")
                script_output = script.get("output", "")
                if script_id and script_output:
                    nse_outputs[f"host:{script_id}"] = script_output.strip()

        # Build document text
        text_parts = [f"Host: {ip}", f"Hostnames: {hostname_str}"]

        if mac_address:
            mac_str = f"MAC: {mac_address}"
            if mac_vendor:
                mac_str += f" ({mac_vendor})"
            text_parts.append(mac_str)

        if os_matches:
            os_str = "; ".join(f"{m['name']} ({m['accuracy']}% accuracy)" for m in os_matches[:3])
            text_parts.append(f"OS: {os_str}")

        text_parts.append("Ports:\n" + "\n".join(ports_info))

        if all_cpes:
            text_parts.append(f"CPE: {', '.join(all_cpes)}")

        # Include key NSE script outputs in text
        notable_scripts = ["http-title", "ssl-cert", "rdp-ntlm-info"]
        for key, output in nse_outputs.items():
            script_name = key.split(":")[-1]
            if script_name in notable_scripts or len(nse_outputs) <= 10:
                text_parts.append(f"Script ({key}): {output[:500]}")

        doc_text = "\n".join(text_parts)

        open_ports = [p for p in host.findall(".//port") if p.find("state") is not None and p.find("state").get("state") == "open"]
        importance = "high" if len(open_ports) > 10 else "medium" if len(open_ports) > 3 else "standard"

        documents.append({
            "text": doc_text,
            "metadata": {
                "s3Key": s3_key,
                "ip": ip,
                "hostnames": hostnames,
                "openPorts": len(open_ports),
                "macAddress": mac_address,
                "macVendor": mac_vendor,
                "osMatches": os_matches,
                "cpes": all_cpes,
                "nseScripts": list(nse_outputs.keys()),
            },
            "sourceType": "nmap",
            "importance": importance,
        })

    return documents


def social_csv(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Parse CSV social media exports."""
    import csv
    import io

    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    documents = []

    for i, row in enumerate(reader):
        doc_text = "\n".join(f"{k}: {v}" for k, v in row.items() if v)
        documents.append({
            "text": doc_text,
            "metadata": {"s3Key": s3_key, "rowIndex": i, **{k: v for k, v in row.items() if v}},
            "sourceType": "social",
            "importance": "standard",
        })

    return documents


def log_text(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Parse log files, grouping lines into chunks."""
    text = content.decode("utf-8", errors="replace")
    lines = text.split("\n")

    chunk_size = 50
    documents = []
    for i in range(0, len(lines), chunk_size):
        chunk = "\n".join(lines[i:i + chunk_size]).strip()
        if not chunk:
            continue

        # Detect severity keywords for importance
        lower_chunk = chunk.lower()
        if any(kw in lower_chunk for kw in ["critical", "emergency", "fatal"]):
            importance = "high"
        elif any(kw in lower_chunk for kw in ["error", "warning", "alert"]):
            importance = "medium"
        else:
            importance = "standard"

        documents.append({
            "text": chunk,
            "metadata": {"s3Key": s3_key, "lineStart": i, "lineEnd": min(i + chunk_size, len(lines))},
            "sourceType": "logs",
            "importance": importance,
        })

    return documents


def _enrich_with_comprehend(documents: list[dict]) -> list[dict]:
    """Optionally enrich documents with Comprehend entity/sentiment/key-phrase detection.

    Controlled by COMPREHEND_ENRICHMENT env var (default: true).
    Appends entities, sentiment, and key phrases to each document's metadata.
    """
    if os.environ.get("COMPREHEND_ENRICHMENT", "true").lower() != "true":
        return documents

    import boto3

    comprehend = boto3.client("comprehend")

    for doc in documents:
        text = doc.get("text", "")[:4500]  # Comprehend limit is 5000 bytes UTF-8
        if not text.strip():
            continue

        try:
            # Detect entities (people, orgs, locations, IPs, dates, etc.)
            entities_resp = comprehend.detect_entities(Text=text, LanguageCode="en")
            entities = [
                {"text": e["Text"], "type": e["Type"], "score": round(e["Score"], 3)}
                for e in entities_resp.get("Entities", [])
                if e["Score"] >= 0.8
            ]

            # Detect sentiment
            sentiment_resp = comprehend.detect_sentiment(Text=text, LanguageCode="en")
            sentiment = sentiment_resp.get("Sentiment", "NEUTRAL")

            # Detect key phrases
            phrases_resp = comprehend.detect_key_phrases(Text=text, LanguageCode="en")
            key_phrases = [
                p["Text"] for p in phrases_resp.get("KeyPhrases", [])
                if p["Score"] >= 0.8
            ][:20]  # Cap at 20 to keep metadata reasonable

            doc.setdefault("metadata", {})
            doc["metadata"]["entities"] = entities
            doc["metadata"]["sentiment"] = sentiment
            doc["metadata"]["keyPhrases"] = key_phrases

            # Boost importance if high-value entities are detected
            entity_types = {e["type"] for e in entities}
            if entity_types & {"PERSON", "ORGANIZATION"} and sentiment == "NEGATIVE":
                doc["importance"] = "high"

        except Exception:
            # Comprehend enrichment is best-effort; don't fail the pipeline
            pass

    return documents


def document_textract(content: bytes, upload_id: str, s3_key: str) -> list[dict]:
    """Extract text from PDFs and images using Amazon Textract, then optionally enrich with Comprehend.

    Supports: PDF, PNG, JPEG, TIFF.
    - Single-page docs (<= 1 page): synchronous DetectDocumentText
    - Multi-page PDFs: async StartDocumentTextDetection + polling

    Falls back to text_passthrough if Textract fails.
    """
    import time as _time

    import boto3

    # Determine if we should use sync or async API
    # Sync API accepts raw bytes (max 10MB, single page for images, multi-page PDF up to 3000 pages via S3)
    # For reliability, use S3 reference for all Textract calls
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else ""
    is_pdf = ext == "pdf"

    try:
        textract = boto3.client("textract")
        bucket = os.environ.get("UPLOADS_BUCKET", "")
        if is_pdf:
            # Async API for PDFs (handles multi-page)
            start_resp = textract.start_document_text_detection(
                DocumentLocation={"S3Object": {"Bucket": bucket, "Name": s3_key}},
            )
            job_id = start_resp["JobId"]

            # Poll for completion (max ~5 minutes with backoff)
            status = "IN_PROGRESS"
            wait = 2
            for _ in range(60):
                _time.sleep(wait)
                result = textract.get_document_text_detection(JobId=job_id)
                status = result["JobStatus"]
                if status in ("SUCCEEDED", "FAILED"):
                    break
                wait = min(wait * 1.5, 10)

            if status != "SUCCEEDED":
                return text_passthrough(content, upload_id, s3_key)

            # Collect all pages (paginated results)
            pages_text = []
            blocks = result.get("Blocks", [])
            next_token = result.get("NextToken")

            while True:
                for block in blocks:
                    if block["BlockType"] == "LINE":
                        pages_text.append(block.get("Text", ""))

                if not next_token:
                    break
                result = textract.get_document_text_detection(JobId=job_id, NextToken=next_token)
                blocks = result.get("Blocks", [])
                next_token = result.get("NextToken")

            full_text = "\n".join(pages_text)

        else:
            # Sync API for images (PNG, JPEG, TIFF)
            resp = textract.detect_document_text(
                Document={"S3Object": {"Bucket": bucket, "Name": s3_key}},
            )
            lines = [b.get("Text", "") for b in resp.get("Blocks", []) if b["BlockType"] == "LINE"]
            full_text = "\n".join(lines)

    except Exception:
        # Textract failed — fall back to raw text extraction
        return text_passthrough(content, upload_id, s3_key)

    if not full_text.strip():
        return [{"text": "(No text extracted)", "metadata": {"s3Key": s3_key}, "sourceType": "document", "importance": "standard"}]

    # Chunk the extracted text (6000 chars per chunk, 500 char overlap)
    chunk_size = 6000
    overlap = 500
    documents = []
    start = 0
    while start < len(full_text):
        end = start + chunk_size
        chunk = full_text[start:end].strip()
        if chunk:
            documents.append({
                "text": chunk,
                "metadata": {
                    "s3Key": s3_key,
                    "chunkIndex": len(documents),
                    "extractionMethod": "textract",
                    "fileType": ext,
                },
                "sourceType": "document",
                "importance": "standard",
            })
        start = end - overlap if end < len(full_text) else end

    # Chain Comprehend enrichment
    documents = _enrich_with_comprehend(documents)

    return documents


# Adapter registry — add new adapters here
ADAPTERS = {
    "text_passthrough": text_passthrough,
    "shodan_json": shodan_json,
    "nmap_xml": nmap_xml,
    "social_csv": social_csv,
    "log_text": log_text,
    "document_textract": document_textract,
}


def get_adapter(source_type: str):
    """Get adapter function by source type, falling back to text_passthrough."""
    return ADAPTERS.get(source_type, text_passthrough)
