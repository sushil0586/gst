def api_response(*, data=None, message="Success", status="success", **extra):
    payload = {"status": status, "message": message, "data": data}
    payload.update(extra)
    return payload
