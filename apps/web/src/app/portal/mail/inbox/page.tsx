import { MailFolderPage } from "../_components/mail-folder-page";

export default function PortalMailInboxPage() {
  return (
    <MailFolderPage
      folder="inbox"
      title="收件箱"
      description="集中处理内部邮件，支持搜索、星标、归档和删除恢复，保持和企业邮箱一致的阅读处理流程。"
    />
  );
}
