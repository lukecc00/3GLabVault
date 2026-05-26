import Link from "next/link";
import { PortalShell } from "./_components/portal-shell";

const directions = ["Android", "iOS", "Web", "Server", "HarmonyOS"];

export default function PortalHomePage() {
  return (
    <PortalShell
      title="知识工作台"
      description="面向实验室成员的日常协作入口，当前已接入知识库浏览、页面查看与编辑能力，后续会继续补充个人中心与内部邮件能力。"
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="app-panel p-6 lg:p-7">
            <div className="app-eyebrow app-eyebrow-sky">Member Portal</div>
            <h2 className="mt-5 text-2xl font-semibold text-balance text-slate-50">
              从这里进入知识沉淀与邮件协作流程
            </h2>
            <p className="mt-4 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              成员日常最常用的入口已经汇总到这里：知识空间浏览、页面阅读与编辑、内部邮件收发、草稿保存和归档处理。更高权限的审核与编排仍由系统自动分流。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/portal/mail/inbox" className="app-button-primary">
                打开内部邮箱
              </Link>
              <Link href="/portal/knowledge" className="app-button-secondary">
                打开知识库
              </Link>
            </div>
          </section>

          <section className="app-panel p-6">
            <div className="app-eyebrow app-eyebrow-sky">内部邮件</div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-50">企业邮箱式工作区</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
              已支持收件箱、已发送、草稿箱、归档、回收站、搜索筛选、回复和转发，所有内容仅在内部系统中流转。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/portal/mail/inbox" className="app-button-primary">
                查看收件箱
              </Link>
              <Link href="/portal/mail/compose" className="app-button-secondary">
                写邮件
              </Link>
            </div>
          </section>
        </div>

        <section className="app-panel-muted p-6">
          <h2 className="text-xl font-semibold text-slate-50">当前知识方向</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {directions.map((direction) => (
              <span key={direction} className="app-pill">
                {direction}
              </span>
            ))}
          </div>
          <div className="app-panel mt-6 p-4 text-sm leading-7 text-slate-300">
            已支持知识空间、页面详情、Markdown 展示和 `TipTap + Markdown`
            编辑链路，同时新增企业邮箱式内部收件箱、草稿箱和归档入口。
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
