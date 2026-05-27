import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailInboxPage() {
  return (
    <MailFolderPage
      folder="inbox"
      title="收件箱"
      description="处理收到的邮件。"
    />
  );
}
