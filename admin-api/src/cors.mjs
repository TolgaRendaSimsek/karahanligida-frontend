export function createAdminCors(allowedOrigin) {
  if (!allowedOrigin) {
    throw new Error("ADMIN_ORIGIN tanımlanmalıdır.");
  }

  return function adminCors(request, response, next) {
    const origin = request.headers.origin;
    response.setHeader("Vary", "Origin");

    if (origin && origin !== allowedOrigin) {
      return response.status(403).json({ error: "Bu kaynak API'ye erişemez." });
    }

    if (origin === allowedOrigin) {
      response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
      response.setHeader("Access-Control-Max-Age", "600");
    }

    if (request.method === "OPTIONS") {
      return response.status(204).end();
    }

    next();
  };
}
