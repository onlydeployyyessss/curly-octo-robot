import { db } from '../db/client.js';
import { creators, scheduledActions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const acts = await db.select().from(scheduledActions).limit(3);
  for (const a of acts) {
    console.log('action creatorId:', a.creatorId);
    const c1 = await db.query.creators.findFirst({ where: eq(creators.id, a.creatorId as any) });
    console.log('via query API:', c1?.username ?? 'NOT FOUND');
  }
  const all = await db.select({ id: creators.id, username: creators.username }).from(creators).limit(5);
  console.log('creators in table:', all);
  process.exit(0);
}
main();
