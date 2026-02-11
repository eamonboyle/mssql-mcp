#!/usr/bin/env node

// External imports
import * as dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Internal imports
import { UpdateDataTool } from './tools/UpdateDataTool.js';
import { InsertDataTool } from './tools/InsertDataTool.js';
import { ReadDataTool } from './tools/ReadDataTool.js';
import { CreateTableTool } from './tools/CreateTableTool.js';
import { CreateIndexTool } from './tools/CreateIndexTool.js';
import { ListTableTool } from './tools/ListTableTool.js';
import { DropTableTool } from './tools/DropTableTool.js';
import { DescribeTableTool } from './tools/DescribeTableTool.js';

const updateDataTool = new UpdateDataTool();
const insertDataTool = new InsertDataTool();
const readDataTool = new ReadDataTool();
const createTableTool = new CreateTableTool();
const createIndexTool = new CreateIndexTool();
const listTableTool = new ListTableTool();
const dropTableTool = new DropTableTool();
const describeTableTool = new DescribeTableTool();

const server = new Server(
    {
        name: 'mssql-mcp-server',
        version: '0.1.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// Read READONLY env variable
const isReadOnly = process.env.READONLY === 'true';

// Request handlers

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: isReadOnly
        ? [listTableTool, readDataTool, describeTableTool] // todo: add searchDataTool to the list of tools available in readonly mode once implemented
        : [insertDataTool, readDataTool, describeTableTool, updateDataTool, createTableTool, createIndexTool, dropTableTool, listTableTool], // add all new tools here
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        let result;
        switch (name) {
            case insertDataTool.name:
                result = await insertDataTool.run(args);
                break;
            case readDataTool.name:
                result = await readDataTool.run(args);
                break;
            case updateDataTool.name:
                result = await updateDataTool.run(args);
                break;
            case createTableTool.name:
                result = await createTableTool.run(args);
                break;
            case createIndexTool.name:
                result = await createIndexTool.run(args);
                break;
            case listTableTool.name:
                result = await listTableTool.run(args);
                break;
            case dropTableTool.name:
                result = await dropTableTool.run(args);
                break;
            case describeTableTool.name:
                if (!args || typeof args.tableName !== 'string') {
                    return {
                        content: [{ type: 'text', text: `Missing or invalid 'tableName' argument for describe_table tool.` }],
                        isError: true,
                    };
                }
                result = await describeTableTool.run(args as { tableName: string; databaseName?: string });
                break;
            default:
                return {
                    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                    isError: true,
                };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
    } catch (error) {
        return {
            content: [{ type: 'text', text: `Error occurred: ${error}` }],
            isError: true,
        };
    }
});

// Server startup
async function runServer() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    } catch (error) {
        console.error('Fatal error running server:', error);
        process.exit(1);
    }
}

runServer().catch((error) => {
    console.error('Fatal error running server:', error);
    process.exit(1);
});

// Tools call getSqlRequest(databaseName) internally - no wrapping needed
