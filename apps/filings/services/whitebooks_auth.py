from apps.filings.services.provider_auth import request_provider_otp_session, verify_provider_otp_session


def request_whitebooks_otp_session(*, validated_data, user):
    return request_provider_otp_session(validated_data=validated_data, user=user)


def verify_whitebooks_otp_session(*, auth_session, otp, txn, user):
    return verify_provider_otp_session(auth_session=auth_session, otp=otp, txn=txn, user=user)
