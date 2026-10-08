import { defineConfig } from "prisma/config";

// Read process.env directly (not the prisma env() helper): `prisma generate`
// must work when DATABASE_URL is absent, for example in CI or image builds.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
