import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailDraftsPage() {
  return (
    <MailFolderPage
      folder="drafts"
      title="草稿箱"
      description="继续编辑未发送邮件。"
    />
  );
}
