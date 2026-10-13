import test from 'node:test';
import assert from 'node:assert';
import { inferPrimitiveType } from '../domain/csvSampler.js';
import { inferRelationalTopology } from '../domain/topologyInference.js';
import { TableProfile } from '../domain/types.js';

test('inferPrimitiveType classifies strings, integers, and timestamps', () => {
  assert.strictEqual(inferPrimitiveType('12345'), 'INTEGER');
  assert.strictEqual(inferPrimitiveType('45.99'), 'FLOAT');
  assert.strictEqual(inferPrimitiveType('true'), 'BOOLEAN');
  assert.strictEqual(inferPrimitiveType('2026-10-14T04:35:00Z'), 'TIMESTAMP');
  assert.strictEqual(inferPrimitiveType('rohit@example.com'), 'STRING');
});

test('inferRelationalTopology discovers foreign keys based on value containment', () => {
  const customersTable: TableProfile = {
    tableName: 'customers',
    filePath: 'customers.csv',
    rowCount: 2,
    columns: {
      id: { name: 'id', inferredType: 'INTEGER', totalCount: 2, nullCount: 0, nullRatio: 0, distinctCount: 2, uniquenessRatio: 1.0, isPrimaryKeyCandidate: true, sampleValues: [1, 2] },
      name: { name: 'name', inferredType: 'STRING', totalCount: 2, nullCount: 0, nullRatio: 0, distinctCount: 2, uniquenessRatio: 1.0, isPrimaryKeyCandidate: false, sampleValues: ['A', 'B'] },
    },
    primaryKeyCandidate: 'id',
  };

  const ordersTable: TableProfile = {
    tableName: 'orders',
    filePath: 'orders.csv',
    rowCount: 3,
    columns: {
      order_id: { name: 'order_id', inferredType: 'INTEGER', totalCount: 3, nullCount: 0, nullRatio: 0, distinctCount: 3, uniquenessRatio: 1.0, isPrimaryKeyCandidate: true, sampleValues: [101, 102, 103] },
      customer_id: { name: 'customer_id', inferredType: 'INTEGER', totalCount: 3, nullCount: 0, nullRatio: 0, distinctCount: 2, uniquenessRatio: 0.66, isPrimaryKeyCandidate: false, sampleValues: [1, 2] },
    },
    primaryKeyCandidate: 'order_id',
  };

  const sampleData = {
    customers: { id: new Set(['1', '2']) },
    orders: { customer_id: new Set(['1', '2']) },
  };

  const topology = inferRelationalTopology([customersTable, ordersTable], sampleData);
  assert.strictEqual(topology.relationships.length, 1);
  assert.strictEqual(topology.relationships[0].fromTable, 'orders');
  assert.strictEqual(topology.relationships[0].fromColumn, 'customer_id');
  assert.strictEqual(topology.relationships[0].toTable, 'customers');
  assert.strictEqual(topology.relationships[0].toColumn, 'id');
  assert.strictEqual(topology.relationships[0].containmentRatio, 1.0);
});
