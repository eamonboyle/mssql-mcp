#!/usr/bin/env node
/**
 * Quick script to fetch first 10 rows from productions table.
 * Run from project root with: node scripts/query-productions.mjs
 * Requires .env with SERVER_NAME, DATABASE_NAME, DB_USER, DB_PASSWORD
 */
import "dotenv/config";
import sql from "mssql";

const config = {
  server: process.env.SERVER_NAME || "localhost",
  database: process.env.DATABASE_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function main() {
  if (!config.database || !config.user || !config.password) {
    console.error("Missing DB config. Set DATABASE_NAME, DB_USER, DB_PASSWORD in .env");
    process.exit(1);
  }
  const pool = await sql.connect(config);
  const result = await pool.request().query("SELECT TOP 10 * FROM productions");
  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
