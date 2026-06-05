import json
import inspect
import ssl
from json import JSONDecodeError
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

from apps.integrations.whitebooks.exceptions import (
    WhiteBooksAuthenticationError,
    WhiteBooksSubmissionError,
    WhiteBooksSessionLimitError,
    WhiteBooksSessionPayloadUnresolvedError,
    WhiteBooksTemporaryError,
)
from apps.integrations.whitebooks.types import WhiteBooksSession, WhiteBooksSubmissionResult


class WhiteBooksClient:
    def __init__(self):
        self.base_url = settings.WHITEBOOKS_BASE_URL
        self.api_key = settings.WHITEBOOKS_API_KEY
        self.api_secret = settings.WHITEBOOKS_API_SECRET
        self.username = settings.WHITEBOOKS_USERNAME
        self.password = settings.WHITEBOOKS_PASSWORD
        self.sandbox_mode = settings.WHITEBOOKS_SANDBOX_MODE
        self.contact_email = settings.WHITEBOOKS_CONTACT_EMAIL
        self.gst_username = settings.WHITEBOOKS_GST_USERNAME
        self.state_code = settings.WHITEBOOKS_STATE_CODE
        self.ip_address = settings.WHITEBOOKS_IP_ADDRESS
        self.timeout_seconds = settings.WHITEBOOKS_TIMEOUT_SECONDS
        self.ssl_verify = settings.WHITEBOOKS_SSL_VERIFY
        self.ca_bundle = settings.WHITEBOOKS_CA_BUNDLE

    def authenticate(self) -> WhiteBooksSession:
        if self.sandbox_mode:
            return WhiteBooksSession(
                mode="sandbox",
                authenticated=True,
                raw_response={"mode": "sandbox"},
                metadata={
                    "response_contract_confirmed": True,
                    "submission_path": "sandbox_stub",
                },
            )
        if not (self.base_url and self.api_key and self.api_secret and self.contact_email and self.gst_username and self.state_code and self.ip_address):
            raise WhiteBooksAuthenticationError("WhiteBooks credentials are not configured.")
        payload = self.request_otp(email=self.contact_email)
        return WhiteBooksSession(
            mode="otp_requested",
            authenticated=False,
            raw_response=payload,
            metadata={
                "email": self.contact_email,
                "requires_otp_verification": True,
                "response_contract_confirmed": True,
            },
        )

    def request_otp(self, *, email: str, state_code: str | None = None, gst_username: str | None = None) -> dict:
        if not email:
            raise WhiteBooksAuthenticationError("WhiteBooks contact email is required for OTP request.")
        payload = self._request_json(
            "/authentication/otprequest",
            method="GET",
            query_params={"email": email},
            headers=self._auth_headers(state_code=state_code, gst_username=gst_username),
        )
        return self._normalize_auth_payload(payload)

    def request_auth_token(
        self,
        *,
        email: str,
        otp: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict:
        if not email:
            raise WhiteBooksAuthenticationError("WhiteBooks contact email is required for auth token request.")
        if not otp:
            raise WhiteBooksAuthenticationError("WhiteBooks OTP is required for auth token request.")
        if not txn:
            raise WhiteBooksAuthenticationError("WhiteBooks txn header is required for auth token request.")
        payload = self._request_json(
            "/authentication/authtoken",
            method="GET",
            query_params={"email": email, "otp": otp},
            headers=self._auth_headers({"txn": txn}, state_code=state_code, gst_username=gst_username),
        )
        return self._normalize_auth_payload(payload)

    def search_taxpayer(self, *, gstin: str, email: str | None = None) -> dict:
        resolved_email = email or self.contact_email
        if not resolved_email:
            raise WhiteBooksAuthenticationError("WhiteBooks contact email is required for taxpayer search.")
        if not gstin:
            raise WhiteBooksSubmissionError("GSTIN is required for taxpayer search.")
        payload = self._request_json(
            "/public/search",
            method="GET",
            query_params={"email": resolved_email, "gstin": gstin},
            headers={
                "accept": "*/*",
                "client_id": self.api_key,
                "client_secret": self.api_secret,
            },
        )
        normalized = self._normalize_submission_payload(
            payload,
            default_message="WhiteBooks taxpayer search failed.",
        )
        return self._normalize_taxpayer_search_payload(normalized)

    def exchange_otp_for_session(
        self,
        *,
        email: str,
        otp: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> WhiteBooksSession:
        payload = self._invoke_with_optional_state_code(
            self.request_auth_token,
            email=email,
            otp=otp,
            txn=txn,
            state_code=state_code,
            gst_username=gst_username,
        )
        return self._build_session_from_auth_token_payload(payload=payload, email=email, requested_txn=txn)

    def submit_return(self, payload: dict) -> WhiteBooksSubmissionResult:
        session = self.authenticate()
        if self.sandbox_mode:
            prepared_return_id = payload.get("prepared_return_id", "unknown")
            return WhiteBooksSubmissionResult(
                provider_reference_id=f"wb-ref-{prepared_return_id}",
                provider_acknowledgement_id=f"wb-ack-{prepared_return_id}",
                submission_state="submitted",
                provider_stage="sandbox_submitted",
                raw_response={
                    "mode": "sandbox",
                    "provider_stage": "sandbox_submitted",
                    "message": "Sandbox submission accepted.",
                },
            )
        if not session.authenticated:
            raise WhiteBooksAuthenticationError(
                "WhiteBooks live filing requires OTP verification before submission can begin."
            )
        if not session.response_contract_confirmed:
            raise WhiteBooksSessionPayloadUnresolvedError(
                "WhiteBooks auth token response format is not confirmed yet, so live submission stays disabled."
            )
        raise WhiteBooksSessionPayloadUnresolvedError(
            "WhiteBooks live session handling is not confirmed yet, so live submission stays disabled."
        )

    def save_gstr1_return(self, *, email: str, gstin: str, ret_period: str, txn: str, payload: dict) -> dict:
        response = self._request_json(
            "/gstr1/retsave",
            method="PUT",
            query_params={"email": email},
            headers=self._filing_headers(gstin=gstin, ret_period=ret_period, txn=txn),
            body=payload,
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-1 draft save failed.")

    def proceed_gstr1_filing(self, *, email: str, gstin: str, retperiod: str, txn: str, is_nil: str = "N") -> dict:
        response = self._request_json(
            "/all/newproceedfile",
            method="GET",
            query_params={
                "gstin": gstin,
                "retperiod": retperiod,
                "type": "GSTR1",
                "isNil": is_nil,
                "email": email,
            },
            headers=self._auth_headers({"txn": txn}),
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-1 proceed-to-file failed.")

    def file_gstr1_return(self, *, email: str, pan: str, gstin: str, ret_period: str, txn: str, payload: dict) -> dict:
        response = self._request_json(
            "/gstr1/retfile",
            method="POST",
            query_params={"email": email, "pan": pan},
            headers=self._filing_headers(gstin=gstin, ret_period=ret_period, txn=txn),
            body=payload,
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-1 filing failed.")

    def save_gstr3b_return(self, *, email: str, gstin: str, ret_period: str, txn: str, payload: dict) -> dict:
        response = self._request_json(
            "/gstr3b/retsave",
            method="PUT",
            query_params={"email": email},
            headers=self._filing_headers(gstin=gstin, ret_period=ret_period, txn=txn),
            body=payload,
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-3B draft save failed.")

    def offset_gstr3b_liability(self, *, email: str, gstin: str, ret_period: str, txn: str, payload: dict) -> dict:
        response = self._request_json(
            "/gstr3b/retoffset",
            method="PUT",
            query_params={"email": email},
            headers=self._filing_headers(gstin=gstin, ret_period=ret_period, txn=txn),
            body=payload,
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-3B liability offset failed.")

    def file_gstr3b_return(self, *, email: str, pan: str, gstin: str, ret_period: str, txn: str, payload: dict) -> dict:
        response = self._request_json(
            "/gstr3b/retfile",
            method="POST",
            query_params={"email": email, "pan": pan},
            headers=self._filing_headers(gstin=gstin, ret_period=ret_period, txn=txn),
            body=payload,
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-3B filing failed.")

    def generate_gstr2b(
        self,
        *,
        email: str,
        gstin: str,
        ret_period: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict:
        response = self._request_json(
            "/gstr2b/gen2b",
            method="PUT",
            query_params={"email": email},
            headers=self._filing_headers(
                gstin=gstin,
                ret_period=ret_period,
                txn=txn,
                state_code=state_code,
                gst_username=gst_username,
            ),
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-2B generation failed.")

    def get_gstr2b_generate_status(
        self,
        *,
        email: str,
        gstin: str,
        int_tran_id: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict:
        response = self._request_json(
            "/gstr2b/get2b",
            method="GET",
            query_params={"gstin": gstin, "int_tran_id": int_tran_id, "email": email},
            headers=self._auth_headers({"txn": txn}, state_code=state_code, gst_username=gst_username),
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-2B generation status check failed.")

    def fetch_gstr2b_all(
        self,
        *,
        email: str,
        gstin: str,
        rtnprd: str,
        filenum: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict:
        response = self._request_json(
            "/gstr2b/all",
            method="GET",
            query_params={"gstin": gstin, "rtnprd": rtnprd, "filenum": filenum, "email": email},
            headers=self._auth_headers({"txn": txn}, state_code=state_code, gst_username=gst_username),
        )
        return self._normalize_submission_payload(response, default_message="WhiteBooks GSTR-2B fetch failed.")

    def get_return_status(self, *, email: str, gstin: str, returnperiod: str, refid: str, txn: str, rettype: str | None = None) -> dict:
        path = "/all/newretstatus" if rettype else "/gstr/retstatus"
        query_params = {
            "gstin": gstin,
            "returnperiod": returnperiod,
            "refid": refid,
            "email": email,
        }
        if rettype:
            query_params["rettype"] = rettype
        return self._request_json(
            path,
            method="GET",
            query_params=query_params,
            headers=self._auth_headers({"txn": txn}),
        )

    def track_return(self, *, email: str, gstin: str, returnperiod: str, return_type: str, txn: str) -> dict:
        return self._request_json(
            "/gstr/rettrack",
            method="GET",
            query_params={
                "gstin": gstin,
                "returnperiod": returnperiod,
                "type": return_type,
                "email": email,
            },
            headers=self._auth_headers({"txn": txn}),
        )

    def _build_url(self, path: str, query_params: dict[str, str]) -> str:
        base_url = self.base_url.rstrip("/")
        return f"{base_url}{path}?{urlencode(query_params)}"

    def _request_json(self, path: str, *, method: str, query_params: dict[str, str], headers: dict[str, str], body: dict | None = None) -> dict:
        endpoint = self._build_url(path, query_params)
        request_headers = dict(headers)
        data = None
        if body is not None:
            request_headers.setdefault("Content-Type", "application/json")
            data = json.dumps(body).encode("utf-8")
        request = Request(endpoint, method=method, headers=request_headers, data=data)
        try:
            with urlopen(request, timeout=self.timeout_seconds, context=self._build_ssl_context()) as response:
                return self._decode_json_response(response.read(), endpoint=endpoint)
        except HTTPError as exc:
            try:
                return self._decode_json_response(exc.read(), endpoint=endpoint, status_code=exc.code)
            except WhiteBooksTemporaryError as parse_exc:  # pragma: no cover - defensive fallback
                raise WhiteBooksTemporaryError(f"WhiteBooks HTTP error {exc.code}. {parse_exc}") from parse_exc
        except (URLError, TimeoutError, OSError) as exc:
            raise WhiteBooksTemporaryError("WhiteBooks request could not be completed due to a temporary transport error.") from exc

    def _decode_json_response(self, raw_body: bytes, *, endpoint: str, status_code: int | None = None) -> dict:
        decoded = raw_body.decode("utf-8", errors="replace").strip()
        if not decoded:
            suffix = f" from {endpoint}" if endpoint else ""
            if status_code is not None:
                suffix = f" for HTTP {status_code}{suffix}"
            raise WhiteBooksTemporaryError(f"WhiteBooks returned an empty response{suffix}.")
        try:
            return json.loads(decoded)
        except JSONDecodeError as exc:
            preview = decoded[:160].replace("\n", " ")
            suffix = f" from {endpoint}" if endpoint else ""
            if status_code is not None:
                suffix = f" for HTTP {status_code}{suffix}"
            raise WhiteBooksTemporaryError(
                f"WhiteBooks returned a non-JSON response{suffix}. Response preview: {preview}"
            ) from exc

    def _auth_headers(
        self,
        extra_headers: dict[str, str] | None = None,
        *,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict[str, str]:
        resolved_state_code = str(state_code or self.state_code or "").strip()
        resolved_gst_username = str(gst_username or self.gst_username or "").strip()
        headers = {
            "accept": "*/*",
            "ip_address": self.ip_address,
            "client_id": self.api_key,
            "client_secret": self.api_secret,
        }
        if resolved_gst_username:
            headers["gst_username"] = resolved_gst_username
        if resolved_state_code:
            headers["state_cd"] = resolved_state_code
        if extra_headers:
            headers.update({key: value for key, value in extra_headers.items() if value})
        return headers

    def _filing_headers(
        self,
        *,
        gstin: str,
        ret_period: str,
        txn: str,
        state_code: str | None = None,
        gst_username: str | None = None,
    ) -> dict[str, str]:
        return self._auth_headers(
            {
                "gstin": gstin,
                "ret_period": ret_period,
                "txn": txn,
            },
            state_code=state_code,
            gst_username=gst_username,
        )

    def _normalize_auth_payload(self, payload: dict) -> dict:
        status_code = str(payload.get("status_cd", ""))
        if status_code == "1":
            return payload

        error = payload.get("error") or {}
        error_code = error.get("error_cd", "")
        error_message = error.get("message", "WhiteBooks authentication failed.")
        if error_code == "AUTH403":
            raise WhiteBooksSessionLimitError(error_message)
        raise WhiteBooksAuthenticationError(f"{error_code}: {error_message}" if error_code else error_message)

    def _build_session_from_auth_token_payload(self, *, payload: dict, email: str, requested_txn: str) -> WhiteBooksSession:
        header = payload.get("header") if isinstance(payload.get("header"), dict) else {}
        resolved_txn = str(header.get("txn") or requested_txn or "")
        auth_success = str(payload.get("status_cd") or "") == "1"
        session_credentials_present = bool(resolved_txn) or any(
            payload.get(key) for key in ("auth_token", "token", "sek", "session_key", "access_token")
        )
        return WhiteBooksSession(
            mode="live",
            authenticated=True,
            raw_response=payload,
            metadata={
                "email": email,
                "txn": resolved_txn,
                "status_desc": payload.get("status_desc", ""),
                "auth_token_exchange_confirmed": True,
                "response_contract_confirmed": auth_success and bool(resolved_txn),
                "session_credentials_present": session_credentials_present,
                "resolution_status": (
                    "txn_valid_for_6_hours"
                    if auth_success and bool(resolved_txn)
                    else "session_credentials_missing_from_confirmed_auth_response"
                    if not session_credentials_present
                    else "session_credentials_present_but_submission_contract_unconfirmed"
                ),
            },
        )

    def _normalize_submission_payload(self, payload: dict, *, default_message: str) -> dict:
        status_code = str(payload.get("status_cd", ""))
        if not status_code or status_code == "1":
            return payload

        error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
        error_code = error.get("error_cd", "")
        error_message = (
            error.get("message")
            or payload.get("status_desc")
            or payload.get("message")
            or default_message
        )
        if error_code:
            raise WhiteBooksSubmissionError(f"{error_code}: {error_message}")
        raise WhiteBooksSubmissionError(error_message)

    def sanitize_response_payload(self, payload):
        if isinstance(payload, dict):
            sanitized = {}
            for key, value in payload.items():
                if key.lower() in {"client_secret", "authorization", "access_token", "auth_token", "token", "sek", "session_key"}:
                    sanitized[key] = "[REDACTED]"
                else:
                    sanitized[key] = self.sanitize_response_payload(value)
            return sanitized
        if isinstance(payload, list):
            return [self.sanitize_response_payload(item) for item in payload]
        return payload

    def _normalize_taxpayer_search_payload(self, payload: dict) -> dict:
        candidate = self._extract_taxpayer_candidate(payload)
        gstin = self._first_non_empty(
            candidate.get("gstin") if isinstance(candidate, dict) else None,
            candidate.get("ctin") if isinstance(candidate, dict) else None,
            payload.get("gstin"),
            payload.get("ctin"),
        )
        gstin_value = str(gstin or "").strip().upper()
        legal_name = self._first_non_empty(
            candidate.get("legal_name") if isinstance(candidate, dict) else None,
            candidate.get("lgnm") if isinstance(candidate, dict) else None,
            candidate.get("name") if isinstance(candidate, dict) else None,
            payload.get("legal_name"),
            payload.get("lgnm"),
            payload.get("name"),
        )
        trade_name = self._first_non_empty(
            candidate.get("trade_name") if isinstance(candidate, dict) else None,
            candidate.get("trdnam") if isinstance(candidate, dict) else None,
            candidate.get("tradeNam") if isinstance(candidate, dict) else None,
            payload.get("trade_name"),
            payload.get("trdnam"),
            payload.get("tradeNam"),
        )
        state_code = self._first_non_empty(
            candidate.get("state_code") if isinstance(candidate, dict) else None,
            candidate.get("stateCode") if isinstance(candidate, dict) else None,
            payload.get("state_code"),
            payload.get("stateCode"),
            gstin_value[:2] if len(gstin_value) >= 2 else "",
        )
        registration_type = self._normalize_registration_type(
            self._first_non_empty(
                candidate.get("registration_type") if isinstance(candidate, dict) else None,
                candidate.get("dty") if isinstance(candidate, dict) else None,
                payload.get("registration_type"),
                payload.get("dty"),
            )
        )
        status = self._first_non_empty(
            candidate.get("status") if isinstance(candidate, dict) else None,
            candidate.get("sts") if isinstance(candidate, dict) else None,
            payload.get("status"),
            payload.get("sts"),
        )
        return {
            "gstin": gstin_value,
            "pan": gstin_value[2:12] if len(gstin_value) == 15 else "",
            "legal_name": legal_name,
            "trade_name": trade_name,
            "state_code": str(state_code or "").strip(),
            "registration_type": registration_type,
            "status": status,
            "raw_payload": payload,
        }

    def _extract_taxpayer_candidate(self, payload: dict) -> dict:
        for key in ("data", "taxpayer", "result", "tp"):
            value = payload.get(key)
            if isinstance(value, dict):
                return value
        return payload

    def _normalize_registration_type(self, value):
        normalized = str(value or "").strip().lower()
        if "composition" in normalized:
            return "composition"
        if normalized:
            return "regular"
        return ""

    def _first_non_empty(self, *values):
        for value in values:
            if value is None:
                continue
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    return stripped
                continue
            return value
        return ""

    def _invoke_with_optional_state_code(self, func, **kwargs):
        signature = inspect.signature(func)
        for optional_parameter in ("state_code", "gst_username"):
            if optional_parameter not in signature.parameters:
                kwargs.pop(optional_parameter, None)
        return func(**kwargs)

    def _build_ssl_context(self):
        if not self.ssl_verify:
            return ssl._create_unverified_context()
        if self.ca_bundle:
            return ssl.create_default_context(cafile=self.ca_bundle)
        return ssl.create_default_context()
