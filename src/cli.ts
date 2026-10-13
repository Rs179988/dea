#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { profileTableFromCsv, parseSimpleCsv } from './domain/csvSampler.js';
import { inferRelationalTopology } from './domain/topologyInference.js';
import { generateDbtSchemaYml, generateDbtStagingModel } from './domain/dbtGenerator.js';
import { generateIcebergDdl } from './domain/icebergGenerator.js';
import { TableProfile } from './domain/types.js';
import { runMcpServer } from './mcp/server.js';

const program = new Command();

program
  .name('dea')
  .description('Data & Schema Engineering Anything: Ingest legacy data, infer topology, and emit dbt/Iceberg models.')
  .version('1.0.0');

function profileFiles(files: string[]): { tableProfiles: TableProfile[]; sampleData: Record<string, Record<string, Set<string>>> } {
  const tableProfiles: TableProfile[] = [];
  const sampleData: Record<string, Record<string, Set<string>>> = {};

  for (const fp of files) {
    const tName = path.basename(fp, path.extname(fp));
    const prof = profileTableFromCsv(tName, fp);
    tableProfiles.push(prof);

    const { headers, rows } = parseSimpleCsv(fs.readFileSync(fp, 'utf8'), 2000);
    sampleData[tName] = {};
    for (const h of headers) sampleData[tName][h] = new Set();
    for (const r of rows) {
      for (let c = 0; c < headers.length; c++) {
        if (r[c]) sampleData[tName][headers[c]].add(r[c]);
      }
    }
  }

  return { tableProfiles, sampleData };
}

program
  .command('inspect <files...>')
  .description('Profile datasets and print column types, null ratios, and candidate primary keys')
  .action((files) => {
    const { tableProfiles } = profileFiles(files);
    console.log(`\n📊 DEA Forensic Dataset Profiler`);
    console.log(`===============================================`);
    for (const t of tableProfiles) {
      console.log(`\nTable: ${t.tableName} (${t.rowCount} rows) [PK Candidate: ${t.primaryKeyCandidate || 'None'}]`);
      console.log(`--------------------------------------------------------------------------------`);
      for (const col of Object.values(t.columns)) {
        const pkMarker = col.isPrimaryKeyCandidate ? ' [PK]' : '';
        console.log(`  - ${col.name.padEnd(20)} ${col.inferredType.padEnd(10)} Null: ${(col.nullRatio * 100).toFixed(1)}% | Distinct: ${col.distinctCount}${pkMarker}`);
      }
    }
    console.log();
  });

program
  .command('topology <files...>')
  .description('Infer Primary/Foreign Key relational topology across tables')
  .action((files) => {
    const { tableProfiles, sampleData } = profileFiles(files);
    const topology = inferRelationalTopology(tableProfiles, sampleData);

    console.log(`\n🔗 DEA Relational Topology Inference`);
    console.log(`===============================================`);
    if (topology.relationships.length === 0) {
      console.log('No foreign key relationships detected.');
    } else {
      for (const rel of topology.relationships) {
        console.log(`  [FK] ${rel.fromTable}.${rel.fromColumn} ──▶ ${rel.toTable}.${rel.toColumn} (Containment: ${(rel.containmentRatio * 100).toFixed(1)}%, Confidence: ${(rel.confidence * 100).toFixed(1)}%)`);
      }
    }
    console.log();
  });

program
  .command('dbt <files...>')
  .description('Generate production dbt models and schema.yml')
  .option('-o, --output <dir>', 'Output directory', './dbt_models')
  .action((files, opts) => {
    const { tableProfiles, sampleData } = profileFiles(files);
    const topology = inferRelationalTopology(tableProfiles, sampleData);

    fs.mkdirSync(opts.output, { recursive: true });
    fs.writeFileSync(path.join(opts.output, 'schema.yml'), generateDbtSchemaYml(topology), 'utf8');

    for (const t of tableProfiles) {
      const sql = generateDbtStagingModel(t);
      fs.writeFileSync(path.join(opts.output, `stg_${t.tableName}.sql`), sql, 'utf8');
    }

    console.log(`✅ Production dbt models generated in: ${opts.output}`);
  });

program
  .command('iceberg <file>')
  .description('Generate Apache Iceberg Lakehouse DDL')
  .option('-c, --catalog <catalog>', 'Catalog name', 'lakehouse')
  .action((file, opts) => {
    const tName = path.basename(file, path.extname(file));
    const prof = profileTableFromCsv(tName, file);
    const ddl = generateIcebergDdl(prof, opts.catalog);
    console.log(`\n🧊 Apache Iceberg DDL:\n`);
    console.log(ddl);
    console.log();
  });

program
  .command('mcp')
  .description('Start DEA Model Context Protocol (MCP) server over stdio')
  .action(() => {
    runMcpServer();
  });

program.parse(process.argv);
