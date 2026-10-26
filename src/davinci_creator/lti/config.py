from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


@dataclass(frozen=True)
class Settings:
    tool_url: str
    platform_issuer: str
    client_id: str
    private_key_file: Path
    database_file: Path
    site_dir: Path
    source_root: Path
    deployment_id: str = "na"
    key_id: str = "davinci-lti-1"
    pass_score: float = 0.8
    session_seconds: int = 28800
    retention_days: int = 90
    allow_local_http: bool = False

    def __post_init__(self) -> None:
        for value in (self.tool_url, self.platform_issuer):
            parsed = urlsplit(value)
            local = self.allow_local_http and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            if (parsed.scheme != "https" and not (local and parsed.scheme == "http")) or not parsed.netloc:
                raise ValueError("LTI URLs require HTTPS (local HTTP requires allow_local_http)")
            if parsed.username or parsed.password or parsed.query or parsed.fragment or value.endswith("/"):
                raise ValueError("Use canonical LTI URLs without credentials, query, fragment or trailing slash")
        if urlsplit(self.tool_url).path:
            raise ValueError("Host the LTI tool at its own origin, without a URL path prefix")
        if not self.client_id or not self.deployment_id or not self.key_id:
            raise ValueError("LTI registration identifiers must not be empty")
        if not 0 <= self.pass_score <= 1 or self.session_seconds < 300 or self.retention_days < 1:
            raise ValueError("Invalid LTI scoring or retention settings")
        for path in (self.private_key_file, self.database_file):
            if path.resolve().is_relative_to(self.site_dir.resolve()):
                raise ValueError("LTI private keys and database must be outside the public site directory")
        if not (self.site_dir / "index.html").is_file() or not (self.site_dir / "library/catalog.json").is_file():
            raise ValueError("Build the learning library before starting the LTI service")

    @classmethod
    def load(cls, path: Path | None = None) -> Settings:
        path = path or Path(os.environ["DAVINCI_LTI_CONFIG"])
        values = json.loads(path.read_text(encoding="utf-8"))
        for name in ("private_key_file", "database_file", "site_dir", "source_root"):
            values[name] = (path.resolve().parent / values[name]).resolve()
        return cls(**values)

    def platform_url(self, endpoint: str) -> str:
        return f"{self.platform_issuer}/WebServices/lti13/{endpoint}"

    def check_callback(self, value: str, endpoint: str) -> str:
        """Only the configured platform endpoint can receive credentials or a result."""
        if not isinstance(value, str):
            raise ValueError("Invalid platform callback URL")
        parsed = urlsplit(value)
        expected = urlsplit(self.platform_url(endpoint))
        query = parse_qs(parsed.query, keep_blank_values=True)
        if ((parsed.scheme, parsed.netloc, parsed.path) != (expected.scheme, expected.netloc, expected.path)
                or parsed.fragment or set(query) != {"tp_id"} or len(query["tp_id"]) != 1
                or not query["tp_id"][0].isascii() or not query["tp_id"][0].isdigit()):
            raise ValueError("Invalid platform callback URL")
        return value

    def resource(self, value: str) -> tuple[str | None, str | None]:
        if not isinstance(value, str):
            raise ValueError("Invalid lesson launch URL")
        parsed = urlsplit(value)
        if f"{parsed.scheme}://{parsed.netloc}{parsed.path}" != f"{self.tool_url}/lti/resource" or parsed.fragment:
            raise ValueError("Invalid lesson launch URL")
        query = parse_qs(parsed.query, keep_blank_values=True)
        if not query:
            return None, None
        if set(query) != {"item", "view"} or any(len(v) != 1 for v in query.values()):
            raise ValueError("Invalid lesson parameters")
        if query["view"][0] not in {"deck", "video"}:
            raise ValueError("Invalid lesson format")
        return query["item"][0], query["view"][0]
