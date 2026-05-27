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
] as const;

export default function Home() {
  return (
    <main className="app-shell flex min-h-dvh items-center">
      <div className="app-container w-full py-10">
        <section className="app-panel px-8 py-10 lg:px-10 lg:py-12">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div className="flex items-center gap-4">
                <img
                  src="/lab-logo.svg"
                  alt="移动应用开发实验室圆形 Logo"
                  className="size-24 rounded-full bg-white shadow-sm sm:size-28"
                />
                <div className="app-eyebrow app-eyebrow-sky">移动应用开发实验室</div>
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold text-balance text-foreground-strong md:text-6xl">
                移动应用开发实验室
              </h1>
              <p className="mt-5 max-w-[65ch] text-base leading-8 text-foreground-muted text-pretty">
                聚焦实验室知识沉淀与协作共享。
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {platformStats.map((item) => (
                  <div key={item.label} className="app-panel-muted p-5">
                    <div className="text-xs font-medium uppercase text-foreground-soft">
                      {item.label}
                    </div>
                    <div className="mt-3 text-lg font-semibold text-foreground-strong">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div className="space-y-5">
              {capabilityColumns.map((column) => (
                <section key={column.title} className="app-panel-muted p-6">
                  <div className="app-eyebrow app-eyebrow-neutral">{column.title}</div>
                  <p className="mt-4 text-sm leading-7 text-foreground-muted text-pretty">
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
                <h2 className="text-lg font-semibold text-foreground-strong">技术基座</h2>
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
