"""Shared TEST-ONLY auth/retry conformance harness (TKT-268 / PLAN-011).

Not a runtime package — imported only by each service's tests/test_auth_conformance.py, which put
services/functions on sys.path via their tests/conftest.py. It pins the CLAIMED observable behaviours
of each client in services/functions/auth-conformance-inventory.json using respx, and ships negative
fakes proving the probes fail closed. See ADR-0032.
"""
