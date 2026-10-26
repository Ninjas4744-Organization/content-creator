"""Read installation-specific LTI settings without including them in source or media."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit


def platform_settings(library: Path) -> dict[str, str]:
    path = Path(os.environ.get("LTI_PLATFORM_CONFIG") or library / "lti.platform.local.json")
    profile = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    values = {name: os.environ.get(name) or profile.get(field, "") for name, field in (
        ("PLATFORM_ISSUER", "platform_issuer"), ("OUTCOME_EXTENSION", "outcome_extension"))}
    if values["PLATFORM_ISSUER"]:
        issuer = urlsplit(values["PLATFORM_ISSUER"])
        if issuer.scheme != "https" or not issuer.netloc or issuer.username or issuer.password or issuer.query or issuer.fragment or issuer.geturl() != values["PLATFORM_ISSUER"] or values["PLATFORM_ISSUER"].endswith("/"):
            raise ValueError("The platform issuer must be a canonical HTTPS URL")
    if values["OUTCOME_EXTENSION"] and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}", values["OUTCOME_EXTENSION"]):
        raise ValueError("Invalid outcome extension element name")
    return values
