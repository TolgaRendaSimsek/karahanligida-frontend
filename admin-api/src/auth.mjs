function googleIdentity(decoded) {
  return decoded.email_verified === true
    && decoded.firebase?.sign_in_provider === "google.com"
    && typeof decoded.email === "string";
}

export function createRequireGoogleUser(auth) {
  return async function requireGoogleUser(request, response, next) {
    const match = request.headers.authorization?.match(/^Bearer (.+)$/);
    if (!match) return response.status(401).json({ error: "Google ile oturum açmanız gerekiyor." });
    try {
      const decoded = await auth.verifyIdToken(match[1], true);
      if (!googleIdentity(decoded)) {
        return response.status(403).json({ error: "Yalnızca doğrulanmış Google hesapları kullanılabilir." });
      }
      request.googleUser = { uid: decoded.uid, email: decoded.email.toLowerCase() };
      next();
    } catch {
      response.status(401).json({ error: "Geçersiz veya süresi dolmuş Google oturumu." });
    }
  };
}

export function createRequireAdmin(auth) {
  return async function requireAdmin(request, response, next) {
    const match = request.headers.authorization?.match(/^Bearer (.+)$/);
    if (!match) return response.status(401).json({ error: "Oturum açmanız gerekiyor." });
    try {
      const decoded = await auth.verifyIdToken(match[1], true);
      if (!googleIdentity(decoded)) {
        return response.status(403).json({ error: "Yalnızca doğrulanmış Google hesapları kullanılabilir." });
      }
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
