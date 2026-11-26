import { Module } from '@nestjs/common';
import { EMBEDDING_CLIENT } from './domain/embedding-client';
import { createEmbeddingClientFromEnv } from './infrastructure/litellm-embedding-client';

@Module({
  providers: [
    {
      provide: EMBEDDING_CLIENT,
      useFactory: () => createEmbeddingClientFromEnv(),
    },
  ],
  exports: [EMBEDDING_CLIENT],
})
export class LlmGatewayModule {}
