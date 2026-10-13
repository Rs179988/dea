import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { profileTableFromCsv, parseSimpleCsv } from '../domain/csvSampler.js';
import { inferRelationalTopology } from '../domain/topologyInference.js';
import { generateDbtSchemaYml, generateDbtStagingModel } from '../domain/dbtGenerator.js';
import { generateIcebergDdl } from '../domain/icebergGenerator.js';
import { TableProfile } from '../domain/types.js';
import fs from 'node:fs';

export function runMcpServer() {
  const server = new Server(
    {
      name: 'dea-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'inspect_dataset',
          description: 'Profiles CSV files, computing exact null counts, distinct values, dominant data types, and primary key candidates.',
          inputSchema: {
            type: 'object',
            properties: {
              filePaths: { type: 'array', items: { type: 'string' }, description: 'Array of CSV/JSON file paths' },
            },
            required: ['filePaths'],
          },
        },
        {
          name: 'infer_relational_topology',
          description: 'Discovers primary-foreign key relationships and cardinality across multiple tables.',
          inputSchema: {
            type: 'object',
            properties: {
              filePaths: { type: 'array', items: { type: 'string' }, description: 'Array of CSV/JSON file paths' },
            },
            required: ['filePaths'],
          },
        },
        {
          name: 'generate_dbt_pipeline',
          description: 'Synthesizes complete production dbt Core staging models and schema.yml with automated tests.',
          inputSchema: {
            type: 'object',
            properties: {
              filePaths: { type: 'array', items: { type: 'string' }, description: 'Array of dataset file paths' },
            },
            required: ['filePaths'],
          },
        },
        {
          name: 'generate_iceberg_ddl',
          description: 'Generates Apache Iceberg Lakehouse DDLs with partition specs and Parquet zstd compression settings.',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to CSV dataset' },
              catalogName: { type: 'string', description: 'Lakehouse catalog name' },
            },
            required: ['filePath'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'generate_iceberg_ddl') {
      const p = args?.filePath as string;
      const tName = path.basename(p, path.extname(p));
      const profile = profileTableFromCsv(tName, p);
      const ddl = generateIcebergDdl(profile, (args?.catalogName as string) || 'lakehouse');
      return { content: [{ type: 'text', text: ddl }] };
    }

    const filePaths = (args?.filePaths as string[]) || [];
    if (filePaths.length === 0) throw new Error('filePaths array must not be empty');

    const tableProfiles: TableProfile[] = [];
    const sampleData: Record<string, Record<string, Set<string>>> = {};

    for (const fp of filePaths) {
      const tName = path.basename(fp, path.extname(fp));
      const prof = profileTableFromCsv(tName, fp);
      tableProfiles.push(prof);

      // Extract set of values for containment testing
      const { headers, rows } = parseSimpleCsv(fs.readFileSync(fp, 'utf8'), 2000);
      sampleData[tName] = {};
      for (const h of headers) sampleData[tName][h] = new Set();
      for (const r of rows) {
        for (let c = 0; c < headers.length; c++) {
          if (r[c]) sampleData[tName][headers[c]].add(r[c]);
        }
      }
    }

    const topology = inferRelationalTopology(tableProfiles, sampleData);

    switch (name) {
      case 'inspect_dataset':
        return {
          content: [{ type: 'text', text: JSON.stringify(tableProfiles, null, 2) }],
        };

      case 'infer_relational_topology':
        return {
          content: [{ type: 'text', text: JSON.stringify(topology, null, 2) }],
        };

      case 'generate_dbt_pipeline': {
        const schemaYml = generateDbtSchemaYml(topology);
        const models: Record<string, string> = {};
        for (const t of tableProfiles) {
          models[`stg_${t.tableName}.sql`] = generateDbtStagingModel(t);
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ schemaYml, models }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport);
}
