import type { ReactNode } from "react";
import Script from "next/script";

export default function TmaLayout({ children }: { children: ReactNode }) {
  return (
    <body>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      {children}
    </body>
  );
}
