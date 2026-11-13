#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'private-domain-assistant';
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const locations = {
  codex: { project: '.agents/skills', user: '.agents/skills' },
  'claude-code': { project: '.claude/skills', user: '.claude/skills' },
  cursor: { project: '.cursor/skills', user: '.cursor/skills' },
  'github-copilot': { project: '.github/skills', user: '.copilot/skills' },
  'gemini-cli': { project: '.gemini/skills', user: '.gemini/skills' },
  opencode: { project: '.opencode/skills', user: '.config/opencode/skills' },
};

function help() {
  console.log(`私域运营助理安装器（Node.js 18+，无第三方依赖）

用法：
  node scripts/install.mjs --agent codex --scope user
  node scripts/install.mjs --agent claude-code --scope project --project "/path/to/workspace"
  node scripts/install.mjs --agent cursor --scope user --dry-run

参数：
  --agent    ${Object.keys(locations).join(' | ')}
  --scope    project（默认）| user
  --project  项目目录；仅用于 project 范围，默认当前目录
  --dry-run  显示安装计划，不写入文件
  --help     显示帮助

安装器复制完整技能包，不联网、不执行技能内容、不覆盖已有同名目录。
更新时请先把旧目录备份到技能扫描范围以外，再安装新版本。`);
}

function parse(args) {
  const options = { scope: 'project', dryRun: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error(`参数重复：${arg}`);
    seen.add(arg);
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--agent', '--scope', '--project'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`参数缺少值：${arg}`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`未知参数：${arg}。使用 --help 查看用法。`);
  }
  return options;
}

function verifyTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`技能包包含符号链接，请使用完整实体文件：${path.join(directory, entry.name)}`);
    if (entry.isDirectory()) verifyTree(path.join(directory, entry.name));
    else if (!entry.isFile()) throw new Error(`不支持的文件类型：${entry.name}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const options = parse(args);
  if (!args.length || options.help) return help();
  if (!Object.hasOwn(locations, options.agent)) throw new Error('请用 --agent 指定一个支持的工具。');
  if (!['user', 'project'].includes(options.scope)) throw new Error('--scope 只能是 user 或 project。');
  if (options.scope === 'user' && options.project) throw new Error('--project 只能与 --scope project 一起使用。');

  const base = fs.realpathSync(options.scope === 'user' ? os.homedir() : path.resolve(options.project || process.cwd()));
  if (!fs.statSync(base).isDirectory()) throw new Error('项目路径必须是已存在的目录。');
  const target = path.resolve(base, locations[options.agent][options.scope], name);
  const relativeTarget = path.relative(base, target);
  if (!relativeTarget || relativeTarget === '..' || relativeTarget.startsWith('..' + path.sep) || path.isAbsolute(relativeTarget) || path.basename(target) !== name) {
    throw new Error('安装路径超出选定范围。');
  }

  const entries = ['SKILL.md', 'README.md', 'LICENSE', 'agents', 'assets', 'references', 'scripts'];
  for (const entry of entries) {
    const full = path.join(source, entry);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`技能包包含符号链接：${entry}`);
    if (stat.isDirectory()) verifyTree(full);
    else if (!stat.isFile()) throw new Error(`技能包缺少可用文件：${entry}`);
  }
  if (!/^name: private-domain-assistant\r?$/m.test(fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8'))) {
    throw new Error('技能名称与安装器不一致。');
  }
  let exists = false;
  try { fs.lstatSync(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (options.dryRun) {
    console.log(JSON.stringify({ agent: options.agent, scope: options.scope, source, target, exists, action: exists ? 'keep-existing' : 'copy', dryRun: true }, null, 2));
    return;
  }
  if (exists) throw new Error(`目标已存在，未覆盖：${target}\n请先把旧版本备份到技能扫描范围以外，再重试。`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.mkdirSync(target);
  for (const entry of entries) {
    fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true, force: false, errorOnExist: true });
  }
  console.log(`已安装：${target}\n请在对应 Agent 中重新加载技能或打开新会话，再调用 ${name}。`);
}

try { main(); }
catch (error) { console.error(`安装未完成：${error.message}`); process.exitCode = 1; }
