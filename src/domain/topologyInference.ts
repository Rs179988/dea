import { ForeignKeyCandidate, RelationalTopology, TableProfile } from './types.js';

export function inferRelationalTopology(tables: TableProfile[], sampleRowData: Record<string, Record<string, Set<string>>>): RelationalTopology {
  const tableMap: Record<string, TableProfile> = {};
  const relationships: ForeignKeyCandidate[] = [];

  for (const t of tables) {
    tableMap[t.tableName] = t;
  }

  for (const childTable of tables) {
    for (const [colName, colProfile] of Object.entries(childTable.columns)) {
      if (colProfile.isPrimaryKeyCandidate) continue;

      const childValues = sampleRowData[childTable.tableName]?.[colName];
      if (!childValues || childValues.size === 0) continue;

      for (const parentTable of tables) {
        if (parentTable.tableName === childTable.tableName) continue;
        if (!parentTable.primaryKeyCandidate) continue;

        const parentCol = parentTable.primaryKeyCandidate;
        const parentValues = sampleRowData[parentTable.tableName]?.[parentCol];
        if (!parentValues || parentValues.size === 0) continue;

        // Check value containment: how many child FK values exist in parent PK values
        let matchCount = 0;
        for (const cv of childValues) {
          if (parentValues.has(cv)) {
            matchCount++;
          }
        }

        const containmentRatio = matchCount / childValues.size;

        // Name match bonus: e.g. customer_id matches customers.id
        const cleanCol = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const parentClean = parentTable.tableName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nameMatch = cleanCol.includes(parentClean) || cleanCol.startsWith(parentClean.slice(0, -1));

        if (containmentRatio >= 0.95 || (containmentRatio >= 0.8 && nameMatch)) {
          relationships.push({
            fromTable: childTable.tableName,
            fromColumn: colName,
            toTable: parentTable.tableName,
            toColumn: parentCol,
            containmentRatio,
            confidence: nameMatch ? Math.min(1.0, containmentRatio + 0.1) : containmentRatio * 0.9,
          });
        }
      }
    }
  }

  return {
    tables: tableMap,
    relationships: relationships.sort((a, b) => b.confidence - a.confidence),
  };
}
