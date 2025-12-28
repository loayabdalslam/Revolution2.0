import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

/**
 * Migration helper to convert Crew YAML configurations to Gang JavaScript configurations
 * 
 * ⚠️  DEPRECATED: CrewEngine has been removed from the codebase.
 * This script is provided for migrating legacy YAML configurations to Gang format.
 * 
 * Usage:
 *   node migrate-crew-to-gang.js path/to/crew.yaml > path/to/gang.js
 * 
 * Migration Steps:
 * 1. Convert your YAML files using this script
 * 2. Update your code to use GangEngine instead of CrewEngine
 * 3. Remove YAML configuration files
 */

function migrateYamlToJS(yamlContent, filename) {
  const config = YAML.parse(yamlContent);
  
  // Transform agents to members
  if (config.agents) {
    config.members = config.agents.map(agent => ({
      name: agent.name,
      role: agent.role,
      tools: agent.tools || [],
      memoryId: agent.memoryId || "shared"
    }));
    delete config.agents;
  }
  
  // Transform teams to squads
  if (config.teams) {
    config.squads = config.teams.map(team => ({
      name: team.name,
      members: team.members,
      mode: team.mode || "parallel"
    }));
    delete config.teams;
  }
  
  // Update observability report path
  if (config.observability?.markdownReport) {
    config.observability.markdownReport.file = 
      config.observability.markdownReport.file?.replace('crew_reports', 'gang_reports') ||
      './reports/gang_run.md';
  }
  
  // Convert to JavaScript export
  const jsContent = `// Migrated from Crew YAML: ${filename}
import { createMember, createWorkflow, createSquad } from "./src/workflows/gangEngine.js";

export const gangConfig = ${JSON.stringify(config, null, 2)};

// Optional: Use factory functions for better readability
export const formattedConfig = {
  name: config.name,
  version: config.version,
  
  llm: config.llm,
  
  members: ${config.members ? config.members.map(m => 
    `createMember("${m.name}", "${m.role}", ${JSON.stringify(m.tools || [])}, "${m.memoryId || 'shared'}")`
  ).join(',\n  ') : '[]'},
  
  ${config.squads ? 
    `squads: ${config.squads.map(s => 
      `createSquad("${s.name}", ${JSON.stringify(s.members)}, "${s.mode}")`
    ).join(',\n  ')},` : ''
  }
  
  workflow: ${config.workflow ? 
    `createWorkflow("${config.workflow.entry}", ${JSON.stringify(config.workflow.steps || [])})` : 
    '{ entry: "worker", steps: [] }'
  },
  
  observability: ${JSON.stringify(config.observability || {}, null, 2)}
};
`;
  
  return jsContent;
}

// Main execution
async function main() {
  const yamlFile = process.argv[2];
  
  if (!yamlFile) {
    console.error('Usage: node migrate-crew-to-gang.js <path-to-crew-yaml>');
    process.exit(1);
  }
  
  try {
    const yamlContent = await fs.readFile(yamlFile, 'utf8');
    const jsContent = migrateYamlToJS(yamlContent, path.basename(yamlFile));
    console.log(jsContent);
  } catch (error) {
    console.error(`Error processing ${yamlFile}:`, error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { migrateYamlToJS };