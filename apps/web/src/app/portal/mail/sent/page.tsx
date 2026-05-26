import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailSentPage() {
  return (
    <MailFolderPage
      folder="sent"
      title="已发送"
      description="查看自己已经发出的内部邮件，保留星标、归档与删除恢复等企业邮箱常见操作。"
    />
  );
}
