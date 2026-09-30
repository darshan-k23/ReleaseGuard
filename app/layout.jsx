import React from "react";
import "../src/index.css";

export const metadata = {
  title: "ReleaseGuard — Release Readiness",
  description: "Evidence-driven release readiness console",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
