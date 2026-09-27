export class ApiError extends Error {
  constructor(status, code, message, details = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, "ROUTE_NOT_FOUND", "API route not found", "Check the API path and HTTP method."));
}

export function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "The request could not be completed.";
  let details = "Retry the request. Internal error details are not exposed.";

  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error?.status && error?.code) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details || error.message;
  } else if (error?.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body must be valid JSON.";
    details = "Correct the JSON syntax and try again.";
  } else if (error?.type === "entity.too.large") {
    status = 413;
    code = "REQUEST_TOO_LARGE";
    message = "Request body exceeds the allowed size.";
    details = "The analyzer accepts only small control requests.";
  }

  if (status >= 500) {
    console.error(`ReleaseGuard API error: ${code}`);
  }
  res.status(status).json({
    error: { code, message, details },
  });
}
