with open("dataloom-backend/app/utils/upload_limits.py", "r") as f:
    text = f.read()

import re

# We need to add the import for JSONResponse if not there
if "from fastapi.responses import JSONResponse" not in text:
    text = text.replace("from fastapi import HTTPException", "from fastapi import HTTPException\nfrom fastapi.responses import JSONResponse")

replacement = """class UploadTooLarge(HTTPException):
    \"\"\"413 for an upload whose body exceeds the configured limit.\"\"\"

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(
            status_code=413,
            detail=f"File exceeds the maximum upload size of {format_size_limit(limit_bytes)}.",
        )

    def as_response(self) -> JSONResponse:
        return JSONResponse({"detail": self.detail}, status_code=self.status_code, headers=self.headers)"""

text = re.sub(r"class UploadTooLarge\(HTTPException\):.*?\n        \)", replacement, text, flags=re.DOTALL)

with open("dataloom-backend/app/utils/upload_limits.py", "w") as f:
    f.write(text)
