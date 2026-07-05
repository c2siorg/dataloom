"""Regression guards for security-sensitive dependency versions.

These tests pin the *minimum* safe version of request-handling dependencies
that have published advisories in older releases. They fail if the resolved
environment ever drops below a fixed release, guarding against an accidental
downgrade or a stale lockfile.
"""

from importlib.metadata import version

from packaging.version import Version

# Each entry: distribution name -> first release that fixes all known advisories.
#   python-multipart >= 0.0.31 parses every multipart upload body and had several
#     denial-of-service advisories in older releases (e.g. GHSA-mj87-hwqh-73pj,
#     GHSA-pp6c-gr5w-3c5g, GHSA-5rvq-cxj2-64vf, GHSA-v9pg-7xvm-68hf).
#   pyjwt >= 2.13.0 signs and verifies auth tokens and had advisories in older
#     releases (e.g. GHSA-xgmm-8j9v-c9wx, GHSA-jq35-7prp-9v3f, GHSA-w7vc-732c-9m39).
MINIMUM_SAFE_VERSIONS = {
    "python-multipart": "0.0.31",
    "pyjwt": "2.13.0",
}


def test_security_sensitive_dependencies_meet_minimum_versions():
    for distribution, minimum in MINIMUM_SAFE_VERSIONS.items():
        installed = Version(version(distribution))
        assert installed >= Version(minimum), (
            f"{distribution} {installed} is below the minimum safe version "
            f"{minimum}; refresh uv.lock to a patched release"
        )
