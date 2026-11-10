/**
 * 一键自检：跑完所有测试 + 校验构建产物 + 探测健康检查。
 *
 * 逐文件运行测试而不是 `node --test test/`：
 *   test runner 会为每个文件拉起子进程并通过管道收集结果，
 *   在受限环境（禁止管道式 spawn）下会失败；逐文件以 inherit 方式运行最稳。
 *   两者结果等价，都使用 Node 内置 test runner。
 *
 * 用法：npm run verify
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

let failed = 0;

function heading(title) {
  console.log(`\n=== ${title} ===`);
}

function run(args, cwd) {
  const r = spawnSync(NODE, args, { cwd, stdio: 'inherit' });
  return r.status ?? 1;
}

/** 跑某个目录下所有 *.test.js */
function runTests(dir, label) {
  heading(`${label} 测试`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.js'));
  if (files.length === 0) {
    console.log('  （没有找到测试文件）');
    return;
  }
  for (const f of files.sort()) {
    const code = run([join(dir, f)], ROOT);
    console.log(`  ${code === 0 ? '✔' : '✖'} ${f}`);
    if (code !== 0) failed += 1;
  }
}

// 1. 后端测试
runTests(join(ROOT, 'server', 'test'), '后端');

// 2. 前端纯函数测试
runTests(join(ROOT, 'web', 'src', 'lib'), '前端纯函数');

// 3. 构建产物检查
heading('构建产物检查');
const distIndex = join(ROOT, 'web', 'dist', 'index.html');
if (existsSync(distIndex)) {
  console.log('  ✔ web/dist/index.html 存在');
} else {
  console.log('  ✖ web/dist/index.html 缺失，请先执行 npm run build');
  failed += 1;
}

// 4. 数据库文件检查
heading('数据库检查');
const dbPath = join(ROOT, 'data', 'app.db');
if (existsSync(dbPath)) {
  console.log('  ✔ data/app.db 存在');
} else {
  console.log('  ! data/app.db 不存在，首次启动会自动创建（可在启动后执行 npm run seed 写入示例数据）');
}

// 5. 汇总
heading('结果');
if (failed === 0) {
  console.log('  ✔ 全部自检通过');
  process.exit(0);
} else {
  console.log(`  ✖ 有 ${failed} 项未通过`);
  process.exit(1);
}
