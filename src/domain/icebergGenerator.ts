import { TableProfile } from './types.js';

export function generateIcebergDdl(table: TableProfile, catalogName = 'lakehouse', schemaName = 'raw'): string {
  const columnsDef = Object.values(table.columns)
    .map((c) => {
      const nullable = c.nullRatio > 0 ? '' : ' NOT NULL';
      return `  \`${c.name}\` ${toIcebergType(c.inferredType)}${nullable} COMMENT 'Inferred unique ratio: ${(c.uniquenessRatio * 100).toFixed(1)}%'`;
    })
    .join(',\n');

  // Find date/timestamp column for partition evolution
  const partitionCol = Object.values(table.columns).find((c) => c.inferredType === 'TIMESTAMP' || c.inferredType === 'DATE');
  const partitionClause = partitionCol ? `\nPARTITIONED BY (days(\`${partitionCol.name}\`))` : '';

  return `CREATE TABLE IF NOT EXISTS \`${catalogName}\`.\`${schemaName}\`.\`${table.tableName}\` (
${columnsDef}
)
USING iceberg${partitionClause}
TBLPROPERTIES (
  'write.format.default' = 'parquet',
  'write.parquet.compression-codec' = 'zstd',
  'history.expire.max-snapshot-age-ms' = '604800000'
);`;
}

function toIcebergType(type: string): string {
  switch (type) {
    case 'INTEGER':
      return 'bigint';
    case 'FLOAT':
      return 'double';
    case 'BOOLEAN':
      return 'boolean';
    case 'TIMESTAMP':
      return 'timestamp';
    case 'DATE':
      return 'date';
    case 'UUID':
      return 'uuid';
    case 'STRING':
    default:
      return 'string';
  }
}
