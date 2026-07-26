import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
if (!email) {
  console.error("Kullanım: npm run set-admin -- admin@example.com");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { admin: true });
console.log(`${email} kullanıcısına admin yetkisi verildi.`);
