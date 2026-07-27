function adminRecord(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    disabled: Boolean(user.disabled),
  };
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export async function listAdminUsers(auth) {
  const admins = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    admins.push(...page.users.filter((user) => user.customClaims?.admin === true).map(adminRecord));
    pageToken = page.pageToken;
  } while (pageToken);
  return admins.sort((left, right) => left.email.localeCompare(right.email, "tr"));
}

export async function grantAdminByEmail(auth, rawEmail) {
  const email = String(rawEmail || "").trim().toLocaleLowerCase("tr-TR");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Geçerli bir e-posta adresi girin.", "invalid-email");
  }
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw httpError(
        404,
        "Bu e-posta Firebase Authentication kullanıcılarında bulunamadı.",
        "auth-user-not-found",
      );
    }
    throw error;
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
  return adminRecord({ ...user, customClaims: { ...(user.customClaims || {}), admin: true } });
}

export async function revokeAdminByUid(auth, uid, actorUid) {
  if (uid === actorUid) {
    throw httpError(409, "Kendi admin yetkinizi kaldıramazsınız.", "self-revoke");
  }
  const [target, admins] = await Promise.all([auth.getUser(uid), listAdminUsers(auth)]);
  if (target.customClaims?.admin !== true) {
    throw httpError(404, "Admin kullanıcı bulunamadı.", "admin-not-found");
  }
  if (admins.length <= 1) {
    throw httpError(409, "Son admin kullanıcının yetkisi kaldırılamaz.", "last-admin");
  }
  const claims = { ...(target.customClaims || {}) };
  delete claims.admin;
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);
  return adminRecord(target);
}
