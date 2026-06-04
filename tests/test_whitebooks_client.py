import pytest

from apps.integrations.whitebooks.client import WhiteBooksClient
from apps.integrations.whitebooks.exceptions import (
    WhiteBooksAuthenticationError,
    WhiteBooksSessionLimitError,
    WhiteBooksSubmissionError,
)


def test_whitebooks_auth_payload_success():
    client = WhiteBooksClient()
    payload = client._normalize_auth_payload(
        {
            "status_cd": "1",
            "data": {"otp_requested": True},
        }
    )
    assert payload["status_cd"] == "1"


def test_whitebooks_auth_payload_maps_auth403_to_session_limit():
    client = WhiteBooksClient()
    with pytest.raises(WhiteBooksSessionLimitError) as exc:
        client._normalize_auth_payload(
            {
                "status_cd": "0",
                "error": {
                    "message": "Maximum session allowed for user with this GSP account exceeded.",
                    "error_cd": "AUTH403",
                },
            }
        )
    assert "Maximum session allowed" in str(exc.value)


def test_whitebooks_auth_payload_maps_other_auth_failures():
    client = WhiteBooksClient()
    with pytest.raises(WhiteBooksAuthenticationError) as exc:
        client._normalize_auth_payload(
            {
                "status_cd": "0",
                "error": {
                    "message": "Invalid credentials.",
                    "error_cd": "AUTH401",
                },
            }
        )
    assert "AUTH401" in str(exc.value)


def test_whitebooks_auth_token_requires_txn():
    client = WhiteBooksClient()
    with pytest.raises(WhiteBooksAuthenticationError) as exc:
        client.request_auth_token(email="user@example.com", otp="575757", txn="")
    assert "txn" in str(exc.value).lower()


def test_whitebooks_authenticate_sandbox_returns_authenticated_session(settings):
    settings.WHITEBOOKS_SANDBOX_MODE = True
    client = WhiteBooksClient()

    session = client.authenticate()

    assert session.mode == "sandbox"
    assert session.authenticated is True
    assert session.response_contract_confirmed is True


def test_whitebooks_authenticate_live_returns_otp_challenge(monkeypatch, settings):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_CONTACT_EMAIL = "ops@example.com"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "33"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.1"

    monkeypatch.setattr(
        WhiteBooksClient,
        "request_otp",
        lambda self, email: {
            "status_cd": "1",
            "status_desc": "user name exists",
            "header": {"txn": "2ac85ae689ce442180b2079bb7169897"},
        },
    )

    session = WhiteBooksClient().authenticate()

    assert session.mode == "otp_requested"
    assert session.authenticated is False
    assert session.metadata["requires_otp_verification"] is True
    assert session.metadata["response_contract_confirmed"] is True
    assert session.raw_response["status_cd"] == "1"
    assert session.raw_response["status_desc"] == "user name exists"
    assert session.raw_response["header"]["txn"] == "2ac85ae689ce442180b2079bb7169897"


def test_whitebooks_exchange_otp_for_session_preserves_unconfirmed_payload(monkeypatch):
    monkeypatch.setattr(
        WhiteBooksClient,
        "request_auth_token",
        lambda self, email, otp, txn: {
            "status_cd": "1",
            "status_desc": "If authentication succeeds",
            "header": {"txn": "2ac85ae689ce442180b2079bb7169897"},
        },
    )

    session = WhiteBooksClient().exchange_otp_for_session(
        email="ops@example.com",
        otp="575757",
        txn="txn-001",
    )

    assert session.mode == "live"
    assert session.authenticated is True
    assert session.response_contract_confirmed is False
    assert session.metadata["txn"] == "2ac85ae689ce442180b2079bb7169897"
    assert session.metadata["auth_token_exchange_confirmed"] is True
    assert session.metadata["session_credentials_present"] is False
    assert session.metadata["resolution_status"] == "session_credentials_missing_from_confirmed_auth_response"
    assert session.raw_response["status_desc"] == "If authentication succeeds"


def test_whitebooks_exchange_otp_for_session_keeps_requested_txn_when_header_txn_missing(monkeypatch):
    monkeypatch.setattr(
        WhiteBooksClient,
        "request_auth_token",
        lambda self, email, otp, txn: {"status_cd": "1", "status_desc": "If authentication succeeds"},
    )

    session = WhiteBooksClient().exchange_otp_for_session(
        email="ops@example.com",
        otp="575757",
        txn="txn-001",
    )

    assert session.metadata["txn"] == "txn-001"


def test_whitebooks_submit_return_live_stays_disabled_without_verified_session_contract(settings, monkeypatch):
    settings.WHITEBOOKS_SANDBOX_MODE = False
    settings.WHITEBOOKS_BASE_URL = "https://apisandbox.whitebooks.in"
    settings.WHITEBOOKS_API_KEY = "client-id"
    settings.WHITEBOOKS_API_SECRET = "client-secret"
    settings.WHITEBOOKS_CONTACT_EMAIL = "ops@example.com"
    settings.WHITEBOOKS_GST_USERNAME = "GSTUSER"
    settings.WHITEBOOKS_STATE_CODE = "33"
    settings.WHITEBOOKS_IP_ADDRESS = "192.168.1.1"

    monkeypatch.setattr(
        WhiteBooksClient,
        "request_otp",
        lambda self, email: {"status_cd": "1", "data": {"txn": "otp-123"}},
    )

    with pytest.raises(WhiteBooksAuthenticationError) as exc:
        WhiteBooksClient().submit_return({"prepared_return_id": "prep-001"})

    assert "OTP verification" in str(exc.value)


def test_whitebooks_file_gstr1_return_uses_confirmed_endpoint_contract(monkeypatch):
    captured = {}

    def fake_request_json(self, path, *, method, query_params, headers, body=None):
        captured.update(
            {
                "path": path,
                "method": method,
                "query_params": query_params,
                "headers": headers,
                "body": body,
            }
        )
        return {"status_cd": "1"}

    monkeypatch.setattr(WhiteBooksClient, "_request_json", fake_request_json)

    WhiteBooksClient().file_gstr1_return(
        email="ops@example.com",
        pan="ABCDE1234P",
        gstin="27ABCDE1234P1Z5",
        ret_period="042024",
        txn="txn-001",
        payload={"chksum": "abc", "sec_sum": []},
    )

    assert captured["path"] == "/gstr1/retfile"
    assert captured["method"] == "POST"
    assert captured["query_params"] == {"email": "ops@example.com", "pan": "ABCDE1234P"}
    assert captured["headers"]["gstin"] == "27ABCDE1234P1Z5"
    assert captured["headers"]["ret_period"] == "042024"
    assert captured["headers"]["txn"] == "txn-001"
    assert captured["body"] == {"chksum": "abc", "sec_sum": []}


def test_whitebooks_proceed_gstr1_filing_uses_confirmed_endpoint_contract(monkeypatch):
    captured = {}

    def fake_request_json(self, path, *, method, query_params, headers, body=None):
        captured.update(
            {
                "path": path,
                "method": method,
                "query_params": query_params,
                "headers": headers,
                "body": body,
            }
        )
        return {"status_cd": "1", "status_desc": "Proceed accepted"}

    monkeypatch.setattr(WhiteBooksClient, "_request_json", fake_request_json)

    WhiteBooksClient().proceed_gstr1_filing(
        email="ops@example.com",
        gstin="27ABCDE1234P1Z5",
        retperiod="042024",
        txn="txn-001",
        is_nil="N",
    )

    assert captured["path"] == "/all/newproceedfile"
    assert captured["method"] == "GET"
    assert captured["query_params"] == {
        "gstin": "27ABCDE1234P1Z5",
        "retperiod": "042024",
        "type": "GSTR1",
        "isNil": "N",
        "email": "ops@example.com",
    }
    assert captured["headers"]["txn"] == "txn-001"
    assert captured["body"] is None


def test_whitebooks_get_return_status_supports_newretstatus_contract(monkeypatch):
    captured = {}

    def fake_request_json(self, path, *, method, query_params, headers, body=None):
        captured.update(
            {
                "path": path,
                "method": method,
                "query_params": query_params,
                "headers": headers,
                "body": body,
            }
        )
        return {"status_cd": "1"}

    monkeypatch.setattr(WhiteBooksClient, "_request_json", fake_request_json)

    WhiteBooksClient().get_return_status(
        email="ops@example.com",
        gstin="27ABCDE1234P1Z5",
        returnperiod="042024",
        refid="ref-001",
        txn="txn-001",
        rettype="GSTR1",
    )

    assert captured["path"] == "/all/newretstatus"
    assert captured["method"] == "GET"
    assert captured["query_params"]["rettype"] == "GSTR1"
    assert captured["query_params"]["refid"] == "ref-001"
    assert captured["headers"]["txn"] == "txn-001"
    assert captured["body"] is None


def test_whitebooks_search_taxpayer_uses_confirmed_public_endpoint_contract(monkeypatch):
    captured = {}

    def fake_request_json(self, path, *, method, query_params, headers, body=None):
        captured.update(
            {
                "path": path,
                "method": method,
                "query_params": query_params,
                "headers": headers,
                "body": body,
            }
        )
        return {"status_cd": "1", "data": {"gstin": "29ABCDE1234F1Z5", "lgnm": "Orion Retail Private Limited"}}

    monkeypatch.setattr(WhiteBooksClient, "_request_json", fake_request_json)

    result = WhiteBooksClient().search_taxpayer(
        gstin="29ABCDE1234F1Z5",
        email="ops@example.com",
    )

    assert captured["path"] == "/public/search"
    assert captured["method"] == "GET"
    assert captured["query_params"] == {
        "email": "ops@example.com",
        "gstin": "29ABCDE1234F1Z5",
    }
    assert "client_id" in captured["headers"]
    assert "client_secret" in captured["headers"]
    assert captured["body"] is None
    assert result["legal_name"] == "Orion Retail Private Limited"
    assert result["pan"] == "ABCDE1234F"
    assert result["state_code"] == "29"


def test_whitebooks_search_taxpayer_normalizes_common_gstn_fields(monkeypatch):
    monkeypatch.setattr(
        WhiteBooksClient,
        "_request_json",
        lambda self, path, *, method, query_params, headers, body=None: {
            "status_cd": "1",
            "data": {
                "ctin": "27ABCDE1234P1Z5",
                "lgnm": "Acme Industries Private Limited",
                "trdnam": "Acme Industries",
                "sts": "Active",
                "dty": "Regular",
            },
        },
    )

    result = WhiteBooksClient().search_taxpayer(gstin="27ABCDE1234P1Z5", email="ops@example.com")

    assert result == {
        "gstin": "27ABCDE1234P1Z5",
        "pan": "ABCDE1234P",
        "legal_name": "Acme Industries Private Limited",
        "trade_name": "Acme Industries",
        "state_code": "27",
        "registration_type": "regular",
        "status": "Active",
        "raw_payload": {
            "status_cd": "1",
            "data": {
                "ctin": "27ABCDE1234P1Z5",
                "lgnm": "Acme Industries Private Limited",
                "trdnam": "Acme Industries",
                "sts": "Active",
                "dty": "Regular",
            },
        },
    }


def test_whitebooks_request_otp_uses_explicit_state_code_over_env(monkeypatch):
    captured = {}

    def fake_request_json(self, path, *, method, query_params, headers, body=None):
        captured["headers"] = headers
        return {"status_cd": "1"}

    monkeypatch.setattr(WhiteBooksClient, "_request_json", fake_request_json)

    WhiteBooksClient().request_otp(email="ops@example.com", state_code="29")

    assert captured["headers"]["state_cd"] == "29"


def test_whitebooks_sanitize_response_payload_redacts_secret_fields():
    client = WhiteBooksClient()

    payload = client.sanitize_response_payload(
        {
            "header": {
                "client_secret": "secret-value",
                "txn": "txn-001",
            },
            "data": [
                {"token": "abc"},
                {"nested": {"access_token": "def"}},
            ],
        }
    )

    assert payload["header"]["client_secret"] == "[REDACTED]"
    assert payload["header"]["txn"] == "txn-001"
    assert payload["data"][0]["token"] == "[REDACTED]"
    assert payload["data"][1]["nested"]["access_token"] == "[REDACTED]"


def test_whitebooks_submission_payload_maps_errors():
    client = WhiteBooksClient()

    with pytest.raises(WhiteBooksSubmissionError) as exc:
        client._normalize_submission_payload(
            {
                "status_cd": "0",
                "error": {
                    "error_cd": "RET422",
                    "message": "Return data is invalid.",
                },
            },
            default_message="Submission failed.",
        )

    assert "RET422" in str(exc.value)
