import type { Metadata } from "next";
import { AdminClient, type FirebaseClientConfig } from "@/components/admin-client";

export const metadata: Metadata = {
  title: "Katalog Yönetimi",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  const firebaseConfig: FirebaseClientConfig = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    appId: process.env.FIREBASE_WEB_APP_ID || "",
  };
  return <AdminClient firebaseConfig={firebaseConfig} />;
}
