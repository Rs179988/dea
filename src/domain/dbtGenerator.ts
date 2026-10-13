import { RelationalTopology, TableProfile } from './types.js';

function toSqlType(type: string): string {
  switch (type) {
    case 'INTEGER':
      return 'INT64';
    case 'FLOAT':
      return 'FLOAT64';
    case 'BOOLEAN':
      return 'BOOL';
    case 'TIMESTAMP':
      return 'TIMESTAMP';
    case 'DATE':
      return 'DATE';
    case 'UUID':
    case 'STRING':
    default:
      return 'STRING';
  }
}

export function generateDbtStagingModel(table: TableProfile): string {
  const colCasts = Object.values(table.columns).map((c) => {
    return `        cast(${c.name} as ${toSqlType(c.inferredType)}) as ${c.name}`;
  });

  return `with source as (
    select * from {{ source('raw_data', '${table.tableName}') }}
),

renamed as (
    select
${colCasts.join(',\n')}
    from source
)

select * from renamed
`;
}

export function generateDbtSchemaYml(topology: RelationalTopology): string {
  const modelsYaml: string[] = [];

  for (const [tName, table] of Object.entries(topology.tables)) {
    const columnsYaml: string[] = [];

    for (const [cName, col] of Object.entries(table.columns)) {
      const tests: string[] = [];
      if (col.nullRatio === 0) {
        tests.push('          - not_null');
      }
      if (col.isPrimaryKeyCandidate) {
        tests.push('          - unique');
      }

      // Check relationships
      const rel = topology.relationships.find((r) => r.fromTable === tName && r.fromColumn === cName);
      if (rel) {
        tests.push(`          - relationships:\n              to: ref('stg_${rel.toTable}')\n              field: ${rel.toColumn}`);
      }

      const testsBlock = tests.length > 0 ? `\n        tests:\n${tests.join('\n')}` : '';
      columnsYaml.push(`      - name: ${cName}\n        description: "Inferred ${col.inferredType} field."${testsBlock}`);
    }

    modelsYaml.push(`  - name: stg_${tName}
    description: "Staged clean model for ${tName} with explicit typing and invariants."
    columns:
${columnsYaml.join('\n')}`);
  }

  return `version: 2

sources:
  - name: raw_data
    tables:
${Object.keys(topology.tables)
  .map((t) => `      - name: ${t}`)
  .join('\n')}

models:
${modelsYaml.join('\n')}
`;
}
