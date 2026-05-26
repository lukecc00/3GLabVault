import type { ReactNode } from "react";
import { MailContextProvider } from "./_components/mail-context";
import { MailLayoutShell } from "./_components/mail-layout-shell";

export default function PortalMailLayout({ children }: { children: ReactNode }) {
  return (
    <MailContextProvider>
      <MailLayoutShell>{children}</MailLayoutShell>
    </MailContextProvider>
  );
}
