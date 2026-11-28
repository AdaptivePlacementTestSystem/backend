import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CreateAiBatchUseCase } from '../../src/modules/item-generation/application/create-ai-batch.use-case';
import { ProcessAiBatchUseCase } from '../../src/modules/item-generation/application/process-ai-batch.use-case';
import { ItemCheckWorker } from '../../src/modules/item-generation/application/item-check-worker';
import { ItemBatchJobStore } from '../../src/modules/item-generation/infrastructure/item-batch-job.store';
import { CheckExactDuplicatesUseCase } from '../../src/modules/item-generation/application/check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from '../../src/modules/item-generation/application/check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from '../../src/modules/item-generation/application/check-semantic-duplicates.use-case';
import { CheckIndependentAnswerUseCase } from '../../src/modules/item-generation/application/check-independent-answer.use-case';
import { RunBatchChecksUseCase } from '../../src/modules/item-generation/application/run-batch-checks.use-case';
import { createEmbeddingClientFromEnv } from '../../src/modules/llm-gateway/infrastructure/litellm-embedding-client';

async function main() {
  const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
  if (
    process.env.REAL_GEMINI_TEST !== '1' ||
    !/^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
      url,
    )
  )
    throw new Error(
      'Explicit real-provider opt-in and isolated test DB required',
    );
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID(),
    source = randomUUID();
  try {
    if (await db.itemBatchJob.count())
      throw new Error('Dedicated test DB must not contain jobs');
    await db.user.create({
      data: {
        id: admin,
        email: `${admin}@example.test`,
        fullName: 'Synthetic test',
        role: 'ADMIN',
      },
    });
    await db.itemBatch.create({
      data: {
        id: source,
        source: 'IMPORTED',
        createdById: admin,
        status: 'DONE',
      },
    });
    const examples = [
      {
        content: 'Choose a greeting.',
        options: { A: 'Hello', B: 'Soon', C: 'Blue', D: 'Quietly' },
      },
      {
        content: 'Choose a color.',
        options: { A: 'Blue', B: 'Hello', C: 'Soon', D: 'Quietly' },
      },
      {
        content: 'Choose a time word.',
        options: { A: 'Soon', B: 'Hello', C: 'Blue', D: 'Quietly' },
      },
    ];
    await db.item.createMany({
      data: examples.map((item) => ({
        ...item,
        batchId: source,
        correctAnswer: 'A',
        skill: 'VOCABULARY',
        cefrTarget: 'A2',
        irtB: 0,
        status: 'FINAL_APPROVED',
        approvedById: admin,
        approvedAt: new Date(),
      })),
    });
    const prisma = db as never;
    const batch = await new CreateAiBatchUseCase(
      prisma,
      new ConfigService({ AI_GENERATION_MAX_ITEMS: 20 }),
    ).execute(admin, {
      operationId: randomUUID(),
      skill: 'VOCABULARY',
      cefrTarget: 'A2',
      count: 1,
    });
    const checks = new RunBatchChecksUseCase(
      prisma,
      new CheckExactDuplicatesUseCase(prisma),
      new CheckNearDuplicatesUseCase(prisma),
      new CheckSemanticDuplicatesUseCase(
        prisma,
        createEmbeddingClientFromEnv(),
      ),
      new CheckIndependentAnswerUseCase(prisma),
    );
    const worker = new ItemCheckWorker(
      prisma,
      new ItemBatchJobStore(prisma),
      checks,
      new ProcessAiBatchUseCase(prisma),
    );
    await worker.processOne();
    let state = await db.itemBatch.findUniqueOrThrow({
      where: { id: batch.batchId },
      select: { status: true },
    });
    console.log(`Generation status: ${state.status}`);
    if (state.status === 'CHECKING') {
      await worker.processOne();
      state = await db.itemBatch.findUniqueOrThrow({
        where: { id: batch.batchId },
        select: { status: true },
      });
      console.log(`C1 status: ${state.status}`);
    }
    const jobs = await db.itemBatchJob.findMany({
      where: { batchId: batch.batchId },
      select: { kind: true, status: true, lastError: true },
    });
    console.log(JSON.stringify(jobs));
  } finally {
    const ids = (
      await db.itemBatch.findMany({
        where: { createdById: admin },
        select: { id: true },
      })
    ).map((entry) => entry.id);
    await db.itemCheckResult.deleteMany({
      where: { item: { batchId: { in: ids } } },
    });
    await db.item.deleteMany({ where: { batchId: { in: ids } } });
    await db.itemBatch.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: admin } });
    await db.$disconnect();
  }
}
void main();
