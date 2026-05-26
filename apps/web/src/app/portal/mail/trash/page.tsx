import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailTrashPage() {
  return (
    <MailFolderPage
      folder="trash"
      title="回收站"
      description="查看已删除的内部邮件，并按需要恢复到原工作流；第一版暂不提供彻底删除。"
    />
  );
}
