# NEGATIVE FIXTURE for check-auth-inventory (TKT-268). NOT production code and NOT scanned by the
# normal run (it lives outside services/functions). The unit test points the guard's --scan mode here
# and asserts it FAILS: this file introduces a new token-cache + bounded-retry site that the checked
# inventory does not list. If the guard stops flagging it, the auth-inventory drift guard has regressed.
#
# The markers below (_CachedToken, _RETRY_SAFE_STATUS) are what a real new auth client would carry.
import time

_RETRY_SAFE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 4


class _CachedToken:
    def __init__(self, access_token: str, expires_at_monotonic: float) -> None:
        self.access_token = access_token
        self.expires_at_monotonic = expires_at_monotonic

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at_monotonic


class NewUnlistedClient:
    """A client that a careless change added without registering it in the inventory."""

    def __init__(self) -> None:
        self._token: _CachedToken | None = None

    def get_token(self, force_refresh: bool = False) -> str:
        if force_refresh or self._token is None or not self._token.is_valid():
            self._token = _CachedToken("tok", time.monotonic() + 3000)
        return self._token.access_token
