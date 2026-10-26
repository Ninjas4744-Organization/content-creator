"""Prepare signing material locally; never print it or send it to a remote service."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm
from davinci_creator.lti.protocol import generate_key
from lti_settings import platform_settings


def prepare(library: Path = ROOT / "projects/learning-library") -> Path:
    directory = library / "output/lti"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    private = directory / "tool.private.pem"
    if not private.exists():
        generate_key(private)
    key = serialization.load_pem_private_key(private.read_bytes(), password=None)
    if not isinstance(key, rsa.RSAPrivateKey) or key.key_size < 2048:
        raise ValueError("A valid RSA signing key is required")
    public = json.loads(RSAAlgorithm.to_jwk(key.public_key()))
    # PUBLIC_JWK is public, but the same file also holds the private signing key.
    values = {"PRIVATE_KEY_PEM": private.read_text(encoding="utf-8"), "PUBLIC_JWK": json.dumps(public)}
    values.update({name: value for name, value in platform_settings(library).items() if value})
    output = directory / "cloudflare-secrets.json"
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(values, stream)
    output.chmod(0o600)
    return output


if __name__ == "__main__":
    try:
        output = prepare()
        print(f"Signing material prepared: {output.relative_to(ROOT)}")
        print("Keep this file private. Upload it only with the documented Cloudflare secrets command.")
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
