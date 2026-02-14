import json
import time
import urllib.request
from threading import Lock

import jwt


class CloudflareJWTError(Exception):
    pass


class CloudflareJWTVerifier:
    def __init__(self, team_domain: str, audience: str, cache_ttl_seconds: int = 300):
        normalized_domain = team_domain.strip()
        if not normalized_domain.startswith("https://"):
            normalized_domain = f"https://{normalized_domain}"

        self.team_domain = normalized_domain.rstrip("/")
        self.certs_url = f"{self.team_domain}/cdn-cgi/access/certs"
        self.audience = audience.strip()
        self.cache_ttl_seconds = cache_ttl_seconds
        self._keys_by_kid = {}
        self._cached_at = 0.0
        self._lock = Lock()

    def _fetch_keys(self):
        with urllib.request.urlopen(self.certs_url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))

        keys = {}
        for jwk in payload.get("keys", []):
            kid = jwk.get("kid")
            if not kid:
                continue
            keys[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        return keys

    def _refresh_keys_if_needed(self, force: bool = False):
        with self._lock:
            now = time.time()
            is_cache_valid = self._keys_by_kid and now - self._cached_at < self.cache_ttl_seconds
            if not force and is_cache_valid:
                return

            self._keys_by_kid = self._fetch_keys()
            self._cached_at = now

    def verify(self, token: str):
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise CloudflareJWTError("Invalid JWT header.") from exc

        kid = header.get("kid")
        if not kid:
            raise CloudflareJWTError("JWT is missing a key id.")

        self._refresh_keys_if_needed()
        key = self._keys_by_kid.get(kid)
        if key is None:
            self._refresh_keys_if_needed(force=True)
            key = self._keys_by_kid.get(kid)
        if key is None:
            raise CloudflareJWTError("JWT key id is not recognized.")

        try:
            return jwt.decode(
                token,
                key=key,
                algorithms=["RS256"],
                audience=self.audience,
                options={"require": ["exp", "aud"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise CloudflareJWTError("Access JWT is expired.") from exc
        except jwt.InvalidAudienceError as exc:
            raise CloudflareJWTError("Access JWT audience is invalid.") from exc
        except jwt.PyJWTError as exc:
            raise CloudflareJWTError("Access JWT signature is invalid.") from exc
