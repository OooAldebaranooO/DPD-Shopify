import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

if (!global.prismaGlobal) {
  global.prismaGlobal = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL + "&connection_limit=1&pool_timeout=20",
      },
    },
  });
}

const prisma = global.prismaGlobal;
export default prisma;