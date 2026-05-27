import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailTrashPage() {
  return (
    <MailFolderPage
      folder="trash"
      title="回收站"
      description="查看已删除邮件，可恢复或彻底删除。"
    />
  );
}
