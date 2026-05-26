import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailDraftsPage() {
  return (
    <MailFolderPage
      folder="drafts"
      title="草稿箱"
      description="保存尚未发出的内部邮件草稿，支持后续继续编辑、补全收件人与再次发送。"
    />
  );
}
