import { PrismaClient } from '@prisma/client';
import { generateAccessKey } from './db';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration...');

  // 1. Find the latest access key, or create one if it doesn't exist
  let activeKey = await prisma.accessKey.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (!activeKey) {
    console.log('No access key found in DB. Creating a legacy one...');
    const newKeyStr = generateAccessKey();
    activeKey = await prisma.accessKey.create({
      data: { key: newKeyStr }
    });
  }

  console.log(`Using AccessKey ${activeKey.id} (${activeKey.key}) for legacy users.`);

  // 2. Assign this key to all users who don't have registeredWithKeyId
  const result = await prisma.user.updateMany({
    where: { registeredWithKeyId: null },
    data: { registeredWithKeyId: activeKey.id }
  });

  console.log(`Updated ${result.count} users to use AccessKey ${activeKey.id}.`);

  // 3. Recalculate usageCount for ALL keys
  const allKeys = await prisma.accessKey.findMany();
  for (const key of allKeys) {
    const activeUsersCount = await prisma.user.count({
      where: {
        registeredWithKeyId: key.id,
        isBanned: false
      }
    });

    await prisma.accessKey.update({
      where: { id: key.id },
      data: { usageCount: activeUsersCount }
    });
    console.log(`Key ${key.id} usageCount recalculated to ${activeUsersCount}.`);
  }

  console.log('Migration completed successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
