import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailSentPage() {
  return (
    <MailFolderPage
      folder="sent"
      title="已发送"
      description="查看已发送邮件。"
    />
  );
}
