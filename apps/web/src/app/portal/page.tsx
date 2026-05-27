import Link from "next/link";
import { PortalShell } from "./_components/portal-shell";

const directions = ["Android", "iOS", "Web", "Server", "HarmonyOS"];

export default function PortalHomePage() {
  return (
    <PortalShell
      title="知识工作台"
      description="面向实验室成员的日常协作入口，已支持知识库浏览、页面查看编辑和内部邮件处理。"
    >
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <section className="app-panel p-6 lg:p-7">
            <div className="app-eyebrow app-eyebrow-sky">成员工作台</div>
            <h2 className="mt-5 text-2xl font-semibold text-balance text-slate-50">
              从这里进入常用协作入口
            </h2>
            <p className="mt-4 max-w-[62ch] text-sm leading-7 text-slate-300 text-pretty">
              成员日常最常用的入口已经汇总到这里，优先覆盖知识浏览、页面处理和内部邮件协作。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/portal/knowledge" className="app-button-primary">
                打开知识库
              </Link>
            </div>
          </section>

          <section className="app-panel p-6">
            <div className="app-eyebrow app-eyebrow-sky">内部邮件</div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-50">内部邮件</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300 text-pretty">
              已支持收件、发件、草稿、归档和回收站处理，所有内容仅在内部系统中流转。
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
            已支持知识空间、页面详情、Markdown 展示和 `TipTap + Markdown` 编辑链路。
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
