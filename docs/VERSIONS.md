# Verified dependency versions

The lockfile is authoritative. Compatible stable versions were checked against npm metadata and upstream documentation before installation; installed packages were then type-checked, built and exercised together. Node 24 LTS is required.

| Component                                | Installed version |
| ---------------------------------------- | ----------------- |
| Node used for local checks               | 24.13.0           |
| React / React DOM                        | 19.3.1            |
| Vite / React plugin                      | 8.3.7 / 6.3.0     |
| TypeScript                               | 5.9.3             |
| Tailwind / Vite plugin                   | 4.3.5             |
| Radix Dialog / Slot                      | 1.3.1 / 1.5.0     |
| Class Variance Authority                 | 0.7.1             |
| Lucide React                             | 0.554.0           |
| React Router                             | 7.18.5            |
| TanStack Query                           | 5.107.1           |
| React Hook Form / resolvers              | 7.91.0 / 5.9.2    |
| Zod                                      | 4.6.7             |
| Recharts                                 | 3.10.1            |
| Dexie / React hooks                      | 4.4.7 / 4.4.0     |
| Vite PWA plugin                          | 2.0.0             |
| Workbox build / window                   | 7.4.1             |
| Express                                  | 5.3.0             |
| Prisma CLI / Client / PostgreSQL adapter | 7.10.1            |
| PostgreSQL used for integration tests    | 16.8              |
| PostgreSQL driver                        | 8.23.1            |
| Argon2                                   | 0.44.0            |
| Helmet                                   | 8.3.0             |
| Express rate limit                       | 8.7.4             |
| Pino / HTTP logger                       | 10.4.0 / 11.0.0   |
| Vitest                                   | 5.1.0             |
| React Testing Library / jest-dom         | 16.3.3 / 6.9.1    |
| Playwright                               | 1.65.0            |
| esbuild                                  | 0.28.2            |
| Sharp (icon generation only)             | 0.35.5            |
| Prettier                                 | 3.9.10            |

shadcn-style source components live in `apps/web/src/components/ui`; they use Radix, CVA, clsx and tailwind-merge and remain editable application source. The shadcn CLI is not a runtime dependency.
