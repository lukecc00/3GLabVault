import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailArchivePage() {
  return (
    <MailFolderPage
      folder="archive"
      title="归档"
      description="把已处理邮件从主收件流程移出，但仍保留检索和后续恢复能力，适合长期沉淀。"
    />
  );
}
