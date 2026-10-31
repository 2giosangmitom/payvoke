Result files go through presigned uploads. Request an upload, PUT the exact bytes to the returned URL with the returned headers, then complete the upload. Payvoke copies the bytes and checks their size and SHA-256 before the file becomes READY. List READY files in your `result` report as `files: [{ "fileId": "…" }]`.

Buyer files frozen into a paid input are listed in `input.context.files` of `invocation.ready`; download them with a short-lived URL.
