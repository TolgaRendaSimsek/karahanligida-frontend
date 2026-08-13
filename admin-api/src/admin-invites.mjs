import { createHash } from "node:crypto";

function normalizeEmail(rawEmail) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Geçerli bir Google hesabı e-postası girin.");
    error.status = 400;
    error.code = "invalid-email";
    throw error;
  }
  return email;
}

function inviteId(email) {
  return createHash("sha256").update(email).digest("hex");
}

export async function listAdminInvites(db) {
  const snapshot = await db.collection("adminInvites").where("status", "==", "pending").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => a.email.localeCompare(b.email, "tr"));
}

export async function createAdminInvite(db, rawEmail, actor) {
  const email = normalizeEmail(rawEmail);
  const reference = db.collection("adminInvites").doc(inviteId(email));
  await reference.set({
    email,
    status: "pending",
    invitedByUid: actor.uid,
    invitedByEmail: actor.email,
    createdAt: new Date(),
    acceptedAt: null,
  });
  return { id: reference.id, email, status: "pending" };
}

export async function cancelAdminInvite(db, id, actor) {
  const reference = db.collection("adminInvites").doc(id);
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data().status !== "pending") {
    const error = new Error("Bekleyen davet bulunamadı.");
    error.status = 404;
    throw error;
  }
  await reference.set({
    ...snapshot.data(),
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledByUid: actor.uid,
  });
  return { id, email: snapshot.data().email };
}

export async function claimAdminInvite({ db, auth, user }) {
  const reference = db.collection("adminInvites").doc(inviteId(normalizeEmail(user.email)));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data().status !== "pending" || snapshot.data().email !== user.email) {
      const error = new Error("Bu Google hesabı için bekleyen admin daveti yok.");
      error.status = 403;
      error.code = "invite-required";
      throw error;
    }
    transaction.update(reference, { status: "claiming", claimingUid: user.uid, claimingAt: new Date() });
  });
  try {
    const account = await auth.getUser(user.uid);
    await auth.setCustomUserClaims(user.uid, { ...(account.customClaims || {}), admin: true });
    await reference.update({ status: "accepted", acceptedAt: new Date(), acceptedByUid: user.uid });
  } catch (error) {
    await reference.update({ status: "pending", claimingUid: null, claimingAt: null });
    throw error;
  }
  return { uid: user.uid, email: user.email };
}
