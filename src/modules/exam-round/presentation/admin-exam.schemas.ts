import type { SchemaObject } from '@nestjs/swagger';

const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
export const roundRecord: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'name',
    'createdById',
    'opensAt',
    'closesAt',
    'durationMinutes',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: uuid,
    name: { type: 'string' },
    createdById: uuid,
    opensAt: date,
    closesAt: date,
    durationMinutes: { type: 'integer' },
    status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'] },
    createdAt: date,
    updatedAt: date,
  },
};
export const roundListRecord: SchemaObject = {
  ...roundRecord,
  required: [
    ...(roundRecord.required ?? []),
    'participantCount',
    'effectiveStatus',
  ],
  properties: {
    ...roundRecord.properties,
    participantCount: { type: 'integer' },
    effectiveStatus: {
      type: 'string',
      enum: ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED'],
    },
  },
};
export const updateRound: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    opensAt: date,
    closesAt: date,
    durationMinutes: { type: 'integer', minimum: 5, maximum: 180 },
  },
};
const gridRow: SchemaObject = {
  type: 'object',
  required: ['studentId', 'studentCode', 'note'],
  properties: {
    studentId: uuid,
    studentCode: { type: 'string' },
    note: { type: 'string' },
  },
};
export const gridResponse: SchemaObject = {
  type: 'object',
  required: ['grid', 'operationId'],
  properties: {
    grid: { type: 'array', items: gridRow },
    operationId: { ...uuid, nullable: true },
  },
};
export const uploadResponse: SchemaObject = {
  type: 'object',
  required: ['grid', 'operationId', 'rejected', 'added', 'ignoredDuplicates'],
  properties: {
    ...gridResponse.properties,
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        required: ['row', 'studentCode', 'reason'],
        properties: {
          row: { type: 'integer' },
          studentCode: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    added: { type: 'integer' },
    ignoredDuplicates: { type: 'integer' },
  },
};
export const saveRequest: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['operationId'],
  properties: { operationId: uuid },
};
export const saveResponse: SchemaObject = {
  type: 'object',
  required: ['operationId', 'added'],
  properties: { operationId: uuid, added: { type: 'integer' } },
};
const nullableDate: SchemaObject = { ...date, nullable: true };
export const participantsResponse: SchemaObject = {
  type: 'object',
  required: ['data', 'total', 'page', 'pageSize', 'summary'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'studentId',
          'studentCode',
          'fullName',
          'note',
          'status',
          'sessionId',
          'startedAt',
          'completedAt',
          'expiresAt',
          'overdue',
          'thetaFinal',
          'cefrLevel',
        ],
        properties: {
          studentId: uuid,
          studentCode: { type: 'string', nullable: true },
          fullName: { type: 'string' },
          note: { type: 'string', nullable: true },
          status: {
            type: 'string',
            enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
          },
          sessionId: { ...uuid, nullable: true },
          startedAt: nullableDate,
          completedAt: nullableDate,
          expiresAt: nullableDate,
          overdue: { type: 'boolean' },
          thetaFinal: { type: 'number', nullable: true },
          cefrLevel: { type: 'string', nullable: true },
        },
      },
    },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
    summary: {
      type: 'object',
      required: ['notStarted', 'inProgress', 'completed', 'abandoned'],
      properties: {
        notStarted: { type: 'integer' },
        inProgress: { type: 'integer' },
        completed: { type: 'integer' },
        abandoned: { type: 'integer' },
      },
    },
  },
};
