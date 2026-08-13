function googleIdentity(decoded) {
  return decoded.email_verified === true
    && decoded.firebase?.sign_in_provider === "google.com"
    && typeof decoded.email === "string";
}

function authenticationError(response, error, googleOnly = false) {
  const code = error?.code;
  if (code === "EACCES" || String(code || "").startsWith("app/")) {
    return response.status(503).json({
      error: "Firebase kimlik doğrulama servisine erişilemiyor.",
      code: "firebase-unavailable",
    });
  }
  if (code === "auth/id-token-revoked") {
    return response.status(401).json({
      error: "Güvenlik nedeniyle oturumunuz kapatıldı. Google ile yeniden giriş yapın.",
      code: "session-revoked",
    });
  }
  if (code === "auth/id-token-expired") {
    return response.status(401).json({
      error: "Oturumunuzun süresi doldu. Google ile yeniden giriş yapın.",
      code: "token-expired",
    });
  }
  if (code === "auth/user-disabled") {
    return response.status(403).json({ error: "Bu admin hesabı devre dışı.", code: "user-disabled" });
  }
  return response.status(401).json({
    error: googleOnly ? "Geçersiz Google oturumu." : "Geçersiz oturum. Google ile yeniden giriş yapın.",
    code: "invalid-token",
  });
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
    } catch (error) {
      authenticationError(response, error, true);
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
    } catch (error) {
      authenticationError(response, error);
    }
  };
}
