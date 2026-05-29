export async function loader({ request }: { request: Request }) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== "delete123") {
    return new Response("Unauthorized", { status: 401 });
  }
  
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.session.deleteMany({});
  await prisma.$disconnect();
  
  return new Response("Sessions deleted", { status: 200 });
}