import fs from 'node:fs';
import { ColumnProfile, DataType, TableProfile } from './types.js';

export function inferPrimitiveType(val: string): DataType {
  const trimmed = val.trim();
  if (!trimmed) return 'STRING';

  if (/^(true|false|t|f|1|0)$/i.test(trimmed)) {
    if (trimmed.toLowerCase() === 'true' || trimmed.toLowerCase() === 'false') return 'BOOLEAN';
  }

  if (/^-?\d+$/.test(trimmed)) {
    return 'INTEGER';
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return 'FLOAT';
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return 'UUID';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'DATE';
  }

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return 'TIMESTAMP';
  }

  return 'STRING';
}

export function parseSimpleCsv(content: string, maxRows = 10000): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());

  const rows: string[][] = [];
  const limit = Math.min(lines.length, maxRows + 1);

  for (let i = 1; i < limit; i++) {
    const rawCols = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());
    if (rawCols.length === headers.length) {
      rows.push(rawCols);
    }
  }

  return { headers, rows };
}

export function profileTableFromCsv(tableName: string, filePath: string, maxRows = 10000): TableProfile {
  const content = fs.readFileSync(filePath, 'utf8');
  const { headers, rows } = parseSimpleCsv(content, maxRows);

  const totalRows = rows.length;
  const colStats: Record<string, { nulls: number; distinct: Set<string>; types: Record<DataType, number>; samples: string[] }> = {};

  for (const h of headers) {
    colStats[h] = { nulls: 0, distinct: new Set(), types: { INTEGER: 0, FLOAT: 0, BOOLEAN: 0, TIMESTAMP: 0, DATE: 0, UUID: 0, STRING: 0 }, samples: [] };
  }

  for (const row of rows) {
    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const val = row[c] ?? '';
      if (!val || val.toLowerCase() === 'null' || val.toLowerCase() === 'nan') {
        colStats[colName].nulls++;
      } else {
        colStats[colName].distinct.add(val);
        const t = inferPrimitiveType(val);
        colStats[colName].types[t]++;
        if (colStats[colName].samples.length < 5) {
          colStats[colName].samples.push(val);
        }
      }
    }
  }

  const columns: Record<string, ColumnProfile> = {};
  let bestPkCandidate: string | undefined = undefined;

  for (const h of headers) {
    const stat = colStats[h];
    const nonNullCount = totalRows - stat.nulls;
    const uniqueness = totalRows > 0 ? stat.distinct.size / totalRows : 0;
    const nullRatio = totalRows > 0 ? stat.nulls / totalRows : 0;

    // Pick dominant type
    let dominantType: DataType = 'STRING';
    let maxTypeCount = 0;
    for (const [t, count] of Object.entries(stat.types)) {
      if (count > maxTypeCount) {
        maxTypeCount = count;
        dominantType = t as DataType;
      }
    }

    const isPk = nullRatio === 0 && uniqueness === 1.0 && totalRows > 0;
    if (isPk && !bestPkCandidate) {
      if (h.toLowerCase().includes('id') || h.toLowerCase() === 'key') {
        bestPkCandidate = h;
      }
    }

    columns[h] = {
      name: h,
      inferredType: dominantType,
      totalCount: totalRows,
      nullCount: stat.nulls,
      nullRatio,
      distinctCount: stat.distinct.size,
      uniquenessRatio: uniqueness,
      isPrimaryKeyCandidate: isPk,
      sampleValues: stat.samples,
    };
  }

  return {
    tableName,
    filePath,
    rowCount: totalRows,
    columns,
    primaryKeyCandidate: bestPkCandidate || Object.values(columns).find((c) => c.isPrimaryKeyCandidate)?.name,
  };
}
