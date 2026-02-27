import { Elysia } from "elysia";
import { auth, betterAuthPlugin } from "@/auth";
import cors from "@elysiajs/cors";
import { RouteLoader } from "@/lib/loadRoutes";
import chalk from "chalk";
import { db } from "@/drizzle";
import { ip } from "elysia-ip";
import { rateLimitPlugin } from "./lib/rateLimit";

const app = new Elysia()
    .use(ip())
    .state("start", performance.now())
    .use(
        cors({
            origin: [
                process.env.CORS_URL!,
                "http://localhost:3000",
                "https://web.lovics.app",
            ],
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    )
    .onBeforeHandle(({ store, request, headers }) => {
        store.start = performance.now();
    })
    .onAfterHandle(async ({ request, path, headers, store }) => {
        const end = performance.now();
        let methodColor = chalk.bold.white;
        if (request.method === "GET") methodColor = chalk.bold.green;
        else if (request.method === "POST") methodColor = chalk.bold.yellow;
        else if (request.method === "PUT") methodColor = chalk.bold.blue;
        else if (request.method === "DELETE") methodColor = chalk.bold.red;
        else if (request.method === "PATCH") methodColor = chalk.bold.magenta;

        const session = await auth.api.getSession({
            headers,
        });

        console.log(
            `${methodColor(request.method.padEnd(7))} ${path} ${chalk.gray(
                "→",
            )} ${chalk.white((end - store.start).toFixed(2) + "ms")} ${
                session ? chalk.green("(" + session?.user?.email + ")") : ""
            }`,
        );
    })
    .derive(async ({ request: { headers } }) => {
        const session = await auth.api.getSession({
            headers,
        });

        return session
            ? {
                  user: session.user,
                  session: session.session,
              }
            : {
                  user: null,
                  session: null,
              };
    })
    .use(betterAuthPlugin)
    .use(rateLimitPlugin)
    .derive(({ set }) => {
        const res = async ({
            json,
            status,
        }: {
            json: any;
            status?: number;
        }) => {
            set.status = status || 200;
            return json;
        };
        return {
            res: {
                error: (message: string, status?: number) => {
                    return res({ json: { message, success: false }, status });
                },
                success: (data: any, status?: number) => {
                    return res({ json: { success: true, data }, status });
                },
            },
        };
    });

app.get("/", ({ res }) => {
    return res.success({
        status: "ok",
        appId: "com.voilabs.lovics",
        appVersion: "1.0.0",
        appBuild: "1",
        appScheme: "lovics",
        backedBy:
            "https://voilabs.com?utm_source=lovics&utm_medium=referral&utm_campaign=api-index",
        mainPage: "https://lovics.app",
        privacyPolicy: "https://lovics.app/privacy-policy",
        termsOfService: "https://lovics.app/terms-of-service",
        supportEmail: "support@voilabs.com",
    });
});

export type App = typeof app;
console.log("\n" + chalk.cyan("➜"), chalk.bold(" Routes loading..."));
const start = performance.now();
let routesCount = 0;
new RouteLoader("./src/routes").load().forEach((route) => {
    const routeTree = route.routeTree;
    const prefix = route.config.prefix;
    const routes = Object.keys(routeTree).map((key) => {
        const [method, path]: any = key.split("_");
        const hooks = route.router.history.find(
            (e: any) => e.path === path && e.method === method,
        )?.hooks;
        return {
            method,
            path: (path.endsWith("/") ? path.slice(0, -1) : path)
                .split(prefix)
                .join(""),
            hooks,
            isAuthRequired: hooks?.auth === true,
        };
    });
    routesCount += routes.length;
    app.use(route);

    console.log(
        chalk.cyan(`\n📦  Group: ${chalk.bold.white(prefix || "root")}`),
    );

    routes.forEach((r) => {
        let methodColor = chalk.white;
        if (r.method === "GET") methodColor = chalk.green;
        else if (r.method === "POST") methodColor = chalk.yellow;
        else if (r.method === "PUT") methodColor = chalk.blue;
        else if (r.method === "DELETE") methodColor = chalk.red;
        else if (r.method === "PATCH") methodColor = chalk.magenta;

        console.log(
            `   ${chalk.gray("├")} ${methodColor(
                r.method.padEnd(6),
            )} ${chalk.gray("→")} ${r.path || "/"} ${
                r.isAuthRequired ? chalk.red.bold("(Auth Required)") : ""
            }`,
        );
    });
});

const end = performance.now();
console.log(
    chalk.bold.green(
        `\n✨ ${chalk.bold.white(routesCount)} routes loaded in ${chalk.bold.white(
            (end - start).toFixed(2) + "ms",
        )}.`,
    ),
);
app.listen(80);
console.log(
    chalk.cyan("➜"),
    chalk.blue(" Service started at"),
    chalk.green(`${app.server?.hostname}:${app.server?.port}`),
    chalk.blue("address."),
);
