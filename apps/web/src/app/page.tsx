import Link from "next/link";

const platformStats = [
  { label: "统一入口", value: "Login First" },
  { label: "知识协作", value: "Spaces / Pages" },
  { label: "组织治理", value: "Users / Roles / Groups" },
];

const capabilityColumns = [
  {
    title: "统一登录",
    description: "所有用户先完成账号密码登录，再由系统根据账号角色自动分流到对应工作区。",
    links: [
      { href: "/login", label: "登录系统", style: "primary" },
      { href: "/register", label: "用户注册", style: "secondary" },
    ],
  },
  {
    title: "自动分流",
    description: "登录成功后无需手动区分页面类型，系统会按账号权限直接进入正确工作区。",
    links: [{ href: "/login", label: "前往登录", style: "secondary" }],
  },
] as const;

export default function Home() {
  return (
    <main className="app-shell">
      <div className="app-container py-10">
        <section className="app-panel px-8 py-10 lg:px-10 lg:py-12">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="app-eyebrow app-eyebrow-sky">3GLabVault 工作入口</div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold text-balance text-slate-50 md:text-6xl">
                用一个登录入口承接实验室知识沉淀、成员协作和后台治理。
              </h1>
              <p className="mt-5 max-w-[65ch] text-base leading-8 text-slate-300 text-pretty">
                当前版本采用统一登录入口。所有用户都需要先完成账号密码登录，系统再根据账号权限自动进入对应工作区，知识库也不再对未登录状态提供直接入口。
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {platformStats.map((item) => (
                  <div key={item.label} className="app-panel-muted p-5">
                    <div className="text-xs font-medium uppercase text-slate-400">
                      {item.label}
                    </div>
                    <div className="mt-3 text-lg font-semibold text-slate-100">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className="app-button-primary">
                  账号登录
                </Link>
                <Link href="/register" className="app-button-secondary">
                  用户注册
                </Link>
              </div>
            </div>

            <div className="space-y-5">
              {capabilityColumns.map((column) => (
                <section key={column.title} className="app-panel-muted p-6">
                  <div className="app-eyebrow app-eyebrow-neutral">{column.title}</div>
                  <p className="mt-4 text-sm leading-7 text-slate-300 text-pretty">
                    {column.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {column.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={
                          link.style === "primary"
                            ? "app-button-primary-emerald"
                            : "app-button-secondary"
                        }
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}

              <section className="app-panel-muted p-6">
                <h2 className="text-lg font-semibold text-slate-50">技术基座</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  {["Next.js 16", "NestJS 11", "PostgreSQL", "Redis", "MinIO", "Keycloak"].map(
                    (item) => (
                      <span key={item} className="app-pill">
                        {item}
                      </span>
                    ),
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
