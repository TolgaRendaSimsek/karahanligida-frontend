export function createRequireAdmin(auth) {
  return async function requireAdmin(request, response, next) {
    const match = request.headers.authorization?.match(/^Bearer (.+)$/);
    if (!match) return response.status(401).json({ error: "Oturum açmanız gerekiyor." });
    try {
      const decoded = await auth.verifyIdToken(match[1], true);
      if (decoded.admin !== true) {
        return response.status(403).json({ error: "Admin yetkisi gerekiyor." });
      }
      request.admin = { uid: decoded.uid, email: decoded.email || decoded.uid };
      next();
    } catch {
      response.status(401).json({ error: "Geçersiz veya süresi dolmuş oturum." });
    }
  };
}
