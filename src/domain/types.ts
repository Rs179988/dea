export type DataType = 'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'TIMESTAMP' | 'DATE' | 'UUID' | 'STRING';

export interface ColumnProfile {
  name: string;
  inferredType: DataType;
  totalCount: number;
  nullCount: number;
  nullRatio: number;
  distinctCount: number;
  uniquenessRatio: number;
  isPrimaryKeyCandidate: boolean;
  sampleValues: any[];
}

export interface TableProfile {
  tableName: string;
  filePath: string;
  rowCount: number;
  columns: Record<string, ColumnProfile>;
  primaryKeyCandidate?: string;
}

export interface ForeignKeyCandidate {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  containmentRatio: number; // e.g. 1.0 means 100% of FK values exist in PK column
  confidence: number;
}

export interface RelationalTopology {
  tables: Record<string, TableProfile>;
  relationships: ForeignKeyCandidate[];
}
