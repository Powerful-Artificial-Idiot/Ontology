import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { validateAgentDeploymentConfiguration } from "../../services/agent-api/deploymentConfig";

const checkScript = resolve("scripts/deployment/check-deepseek-config.sh");
const verifyScript = resolve("scripts/deployment/verify-deepseek-api.sh");
const environmentTemplate = resolve("deploy/env/app.env.example");
const serviceTemplate = resolve("deploy/systemd/manufacturing-graph-explorer.service");
const nginxTemplate = resolve("deploy/nginx/manufacturing-graph-explorer.conf");
const neo4jTemplate = resolve("deploy/neo4j/compose.yml");
const fakeKey = "deployment-test-key-not-a-secret";

describe("DeepSeek systemd deployment assets", () => {
  it("validates configured values without echoing the API key", () => {
    const result = runCheck(validEnvironment());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DeepSeek deployment configuration: OK");
    expect(`${result.stdout}${result.stderr}`).not.toContain(fakeKey);
  });

  it("fails closed when the API key is missing", () => {
    const environment = validEnvironment();
    delete environment.MKG_DEEPSEEK_API_KEY;
    const result = runCheck(environment);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("MKG_DEEPSEEK_API_KEY: missing");
  });

  it("fails closed when either model is missing", () => {
    for (const name of ["MKG_DEEPSEEK_MODEL", "MKG_DEEPSEEK_ANSWER_MODEL"] as const) {
      const environment = validEnvironment();
      delete environment[name];
      const result = runCheck(environment);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${name}: missing`);
    }
  });

  it("rejects non-official or non-HTTPS base URLs", () => {
    for (const value of ["http://api.deepseek.com", "https://example.test"]) {
      const result = runCheck({ ...validEnvironment(), MKG_DEEPSEEK_BASE_URL: value });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("MKG_DEEPSEEK_BASE_URL: invalid-url");
    }
  });

  it("rejects command-line arguments and never enables shell tracing", () => {
    const result = spawnSync("bash", [checkScript, fakeKey], { encoding: "utf8", env: validEnvironment() });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(fakeKey);
    expect(readFileSync(checkScript, "utf8")).not.toMatch(/set\s+-[^\n]*x/u);
    expect(readFileSync(verifyScript, "utf8")).not.toMatch(/set\s+-[^\n]*x|curl\s+[^\n]*-(?:v|-verbose)/u);
  });

  it("keeps every credential field empty in committed templates", () => {
    const environment = readFileSync(environmentTemplate, "utf8");
    const service = readFileSync(serviceTemplate, "utf8");
    expect(environment).toContain("MKG_DEEPSEEK_API_KEY=\n");
    expect(environment).toContain("MKG_AGENT_AUTH_STATIC_TOKEN=\n");
    expect(environment).not.toMatch(/MKG_(?:DEEPSEEK_API_KEY|AGENT_AUTH_STATIC_TOKEN|NEO4J_PASSWORD)=.+/u);
    expect(service).not.toMatch(/Authorization|Bearer|API[_ ]?key/iu);
  });

  it("keeps DeepSeek credentials and direct provider calls out of frontend source", () => {
    const frontend = sourceFiles(resolve("src")).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(frontend).not.toMatch(/VITE_DEEPSEEK_API_KEY|NEXT_PUBLIC_DEEPSEEK_API_KEY|REACT_APP_DEEPSEEK_API_KEY/iu);
    expect(frontend).not.toMatch(/import\.meta\.env[^\n]*DEEPSEEK[^\n]*KEY/iu);
    expect(frontend).not.toContain("api.deepseek.com/chat/completions");
  });

  it("uses protected systemd paths and the actual Agent API start script", () => {
    const service = readFileSync(serviceTemplate, "utf8");
    expect(service).toContain("WorkingDirectory=/opt/manufacturing-graph-explorer/current");
    expect(service).toContain("EnvironmentFile=/etc/manufacturing-graph-explorer/app.env");
    expect(service).toContain("ExecStart=/usr/bin/node /opt/manufacturing-graph-explorer/current/dist-agent-api/server.mjs");
    expect(service).toContain("ReadWritePaths=/var/lib/manufacturing-graph-explorer");
    expect(service).toContain("ProtectSystem=strict");
  });

  it("fails closed for missing production credentials and invalid data paths", async () => {
    const base = productionEnvironment();
    await expect(validateAgentDeploymentConfiguration({ ...base, MKG_DEEPSEEK_API_KEY: "" })).rejects.toThrow(/DeepSeek/u);
    await expect(validateAgentDeploymentConfiguration({ ...base, MKG_AGENT_AUTH_STATIC_TOKEN: "" })).rejects.toThrow(/authentication/u);
    await expect(validateAgentDeploymentConfiguration({ ...base, MKG_DATA_DIR: ".data" })).rejects.toThrow(/absolute path/u);
    await expect(validateAgentDeploymentConfiguration({ ...base, MKG_DATA_DIR: resolve(".data/production") })).rejects.toThrow(/outside the repository/u);
  });

  it("rejects an unwritable production data target and defaults the API host to loopback", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "mkg-deployment-"));
    const file = resolve(directory, "not-a-directory");
    writeFileSync(file, "occupied");
    await expect(validateAgentDeploymentConfiguration({ ...productionEnvironment(), MKG_DATA_DIR: file })).rejects.toThrow();
    const validDirectory = mkdtempSync(resolve(tmpdir(), "mkg-data-"));
    const result = await validateAgentDeploymentConfiguration({ ...productionEnvironment(), MKG_DATA_DIR: validDirectory, MKG_AGENT_API_HOST: undefined });
    expect(result.status.apiLoopbackOnly).toBe(true);
  });

  it("keeps Nginx and Neo4j on loopback with a dedicated unbuffered SSE route", () => {
    const nginx = readFileSync(nginxTemplate, "utf8");
    const neo4j = readFileSync(neo4jTemplate, "utf8");
    expect(nginx).toContain("location ~ ^/api/agent/runs/[^/]+/events$");
    expect(nginx).toContain("proxy_buffering off;");
    expect(nginx).toContain("try_files $uri $uri/ /index.html;");
    expect(nginx).toContain("location ~ /\\.(?:git|data|env) { deny all; }");
    expect(neo4j).toContain("127.0.0.1:7474:7474");
    expect(neo4j).toContain("127.0.0.1:7687:7687");
    expect(neo4j).not.toContain("development-password");
  });

  it("uses same-origin Agent API and tab-scoped runtime access credentials", () => {
    const factory = readFileSync(resolve("src/features/agent-demo/agentClientFactory.ts"), "utf8");
    const page = readFileSync(resolve("src/features/agent-demo/AgentDemoPage.tsx"), "utf8");
    const example = readFileSync(resolve(".env.example"), "utf8");
    expect(factory).toContain('?? "/api/agent"');
    expect(factory).not.toContain("VITE_AGENT_API_TOKEN");
    expect(page).toContain("sessionStorage");
    expect(page).not.toMatch(/localStorage[^\\n]*access/iu);
    expect(example).not.toContain("VITE_AGENT_API_TOKEN");
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    MKG_DEEPSEEK_API_KEY: fakeKey,
    MKG_DEEPSEEK_MODEL: "deepseek-v4-flash",
    MKG_DEEPSEEK_ANSWER_MODEL: "deepseek-v4-flash",
    MKG_DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  };
}

function runCheck(environment: NodeJS.ProcessEnv) {
  return spawnSync("bash", [checkScript], { encoding: "utf8", env: environment });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|html)$/u.test(path) ? [path] : [];
  });
}

function productionEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    MKG_DATA_DIR: mkdtempSync(resolve(tmpdir(), "mkg-production-data-")),
    MKG_AGENT_API_HOST: "127.0.0.1",
    MKG_LLM_PROVIDER: "deepseek",
    MKG_DEEPSEEK_API_KEY: "test-only-deepseek-credential",
    MKG_DEEPSEEK_MODEL: "deepseek-v4-flash",
    MKG_DEEPSEEK_ANSWER_MODEL: "deepseek-v4-flash",
    MKG_AGENT_SEMANTIC_PARSER_MODE: "llm",
    MKG_AGENT_ANSWER_COMPOSER_MODE: "llm",
    MKG_AGENT_KNOWLEDGE_MODE: "neo4j",
    MKG_NEO4J_URI: "bolt://127.0.0.1:7687",
    MKG_NEO4J_USERNAME: "neo4j",
    MKG_NEO4J_PASSWORD: "test-only-neo4j-credential",
    MKG_AGENT_DOCUMENT_MODE: "governed",
    MKG_AGENT_SECURITY_PROFILE: "production",
    MKG_AGENT_AUTH_MODE: "static-bearer",
    MKG_AGENT_AUTH_STATIC_TOKEN: "test-only-agent-access-token",
    MKG_AGENT_AUTH_PRINCIPAL_ID: "principal.test",
    MKG_AGENT_AUTH_TENANT_ID: "tenant.test",
    MKG_AGENT_AUTH_ROLE_IDS: "agent-admin",
    MKG_AGENT_AUTH_DOMAIN_IDS: "quality",
  };
}
