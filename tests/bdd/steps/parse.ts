// Domain step definitions: spec 解析能力 — 覆盖 r7(语言兜底链与 locale 映射 +
// skeleton 语言头)、r8(capability 头注释逐项缺失报告)、r9(原生 功能→规则→场景
// 分层解析 IR + 历史标签惰性)、r10(req 全局注册表重复对)。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReqRegistry,
  localeToGherkinLang,
  migrateNativeSource,
  parseCapability,
  parseFeatureSource,
  SpecParseError,
  type CapabilityDoc,
} from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, field, makeTempRepo, type TempRepo } from './shared.ts';

interface ParseResult {
  doc: CapabilityDoc;
}

interface RegistryResult {
  duplicates: { reqId: string; files: string[] }[];
}

const SAMPLE_FEATURE = `# language: zh-CN
# capability: 样例能力
# purpose: 验证中文关键字解析
# scope: x/

功能: 样例能力

  @req:r9
  规则: 规则样例
    系统 MUST 提供样例能力(自由文本描述)

    场景: 验收样例
      假如 一个初始状态
      当 执行一个动作
      那么 得到一个结果
`;

bdd.given('一个使用中文关键字的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = { 源文本: SAMPLE_FEATURE };
  return ctx.fixtures['feature'];
});

bdd.when('解析该 feature', (ctx) => {
  const source = String(field(ctx.fixtures['feature'], '源文本') ?? '');
  ctx.fixtures['解析结果'] = {
    doc: parseCapability(source, 'inline.feature'),
  } satisfies ParseResult;
});

bdd.thenStep('IR 含带描述与嵌套场景的规则块且 req 句柄为 {reqId}', (ctx, reqId) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const rule = doc?.rules[0];
  if (!rule) throw new Error('no rule block in IR');
  if (rule.reqId !== reqId) {
    throw new Error(`expected req handle ${reqId}, got ${rule.reqId}`);
  }
  if (rule.description === '') {
    throw new Error(`rule block must carry its description, got nothing`);
  }
  if (rule.scenarios.length === 0) {
    throw new Error('rule block must carry at least one nested scenario');
  }
});

bdd.thenStep('该规则块内嵌套场景步骤按关键字保留', (ctx) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const rule = doc?.rules[0];
  const nested = rule?.scenarios.find((s) => s.name === '验收样例');
  if (!nested) throw new Error('nested acceptance scenario missing from IR');
  const kinds = nested.steps.map((s) => s.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(['given', 'when', 'then'])) {
    throw new Error(`steps must keep their keywords, got [${kinds.join(', ')}]`);
  }
});

bdd.thenStep('解析不报标签语义错误', (ctx) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const errors = doc?.errors ?? [];
  const tagErrors = errors.filter((e) => e.code.startsWith('tag:') || e.code.startsWith('rule:'));
  if (tagErrors.length > 0) {
    throw new Error(`legacy tags must be inert, got: ${JSON.stringify(tagErrors)}`);
  }
});

bdd.thenStep('规则块与其嵌套场景按结构进入 IR', (ctx) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const rule = doc?.rules[0];
  if (!rule || rule.title !== '带历史标签的规则') {
    throw new Error(`rule block did not enter IR:\n${JSON.stringify(doc?.rules)}`);
  }
  if (rule.scenarios.map((s) => s.name).join(',') !== '嵌套验收') {
    throw new Error('nested scenario did not enter IR under its rule');
  }
});

bdd.given('一个含 `规则:` 块与嵌套场景、且带历史 @human/@executable 标签的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = {
    源文本: `# language: zh-CN
# capability: 样例能力
# purpose: p
# scope: x/

功能: 样例能力

  @req:r9 @human @executable
  规则: 带历史标签的规则
    系统 MUST 提供样例能力

    场景: 嵌套验收
      假如 前置
      当 动作
      那么 结果
`,
  };
});

bdd.given('两个 spec 文件都含 @req:{reqId} 标签', (ctx, reqId) => {
  const make = (capability: string): string => `# language: zh-CN
# capability: ${capability}
# purpose: 验证重复
# scope: x/

功能: ${capability}

  @req:${reqId}
  规则: 规则
    系统 MUST 提供能力
`;
  ctx.fixtures['重复样本'] = {
    docs: [
      { fileName: 'alpha.feature', doc: parseCapability(make('alpha'), 'alpha.feature') },
      { fileName: 'beta.feature', doc: parseCapability(make('beta'), 'beta.feature') },
    ],
  };
});

bdd.when('构建全局注册表', (ctx) => {
  const docs =
    (ctx.fixtures['重复样本'] as { docs: { fileName: string; doc: CapabilityDoc }[] })?.docs ?? [];
  const reg = buildReqRegistry(docs);
  ctx.fixtures['注册表'] = {
    duplicates: reg.duplicates,
  } satisfies RegistryResult;
});

bdd.thenStep('报告包含重复对 {reqId}', (ctx, reqId) => {
  const reg = ctx.fixtures['注册表'] as RegistryResult | undefined;
  if (!reg?.duplicates.some((d) => d.reqId === reqId)) {
    throw new Error(`expected duplicate pair for ${reqId}, got ${JSON.stringify(reg?.duplicates)}`);
  }
});

// ---------------------------------------------------------------------------
// r7 — parse language fallback chain + locale mapping (acceptance)
// ---------------------------------------------------------------------------

interface LangParseResult {
  zhLang: string;
  zhFeatureName: string;
  enLang: string;
  bothFailedMessage: string | null;
}

const LANG_EN_SAMPLE = `Feature: en capability

  Scenario: rule
    Then system MUST x
`;

bdd.given('一个无语言头使用中文关键字的 feature 内容', (ctx) => {
  const zhOnly = `功能: 中文能力

  @req:r7
  规则: 规则
    系统 MUST 提供兜底
`;
  ctx.fixtures['语言样本'] = {
    zhOnly,
    enOnly: LANG_EN_SAMPLE,
    garbage: 'not a feature at all',
  };
  return ctx.fixtures['语言样本'];
});

bdd.when('依次以 en 与 zh-CN 匹配器解析该内容', (ctx) => {
  const sample = ctx.fixtures['语言样本'] as { zhOnly: string; enOnly: string; garbage: string };
  const zh = parseFeatureSource(sample.zhOnly);
  const en = parseFeatureSource(sample.enOnly);
  let bothFailedMessage: string | null = null;
  try {
    parseFeatureSource(sample.garbage);
  } catch (error) {
    bothFailedMessage = error instanceof Error ? error.message : String(error);
    if (!(error instanceof SpecParseError)) {
      throw new Error(`expected SpecParseError, got: ${bothFailedMessage}`, { cause: error });
    }
  }
  ctx.fixtures['语言解析'] = {
    zhLang: zh.language,
    zhFeatureName: zh.doc.feature?.name ?? '',
    enLang: en.language,
    bothFailedMessage,
  } satisfies LangParseResult;
});

bdd.thenStep('en 起步失败回退 zh-CN 解析成功', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.zhLang !== 'zh-CN') {
    throw new Error(`zh feature must resolve via zh-CN fallback, got ${r.zhLang}`);
  }
  if (r.zhFeatureName !== '中文能力') {
    throw new Error(`fallback parse produced wrong feature name: ${r.zhFeatureName}`);
  }
});

bdd.thenStep('纯 en 内容以 en 匹配器起步成功', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.enLang !== 'en') {
    throw new Error(`en feature must parse under the en matcher, got ${r.enLang}`);
  }
});

bdd.thenStep('双匹配器均失败才报错', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.bothFailedMessage === null) {
    throw new Error('garbage input must throw after both matchers fail');
  }
  if (!r.bothFailedMessage.includes('tried en, zh-CN')) {
    throw new Error(`error must report the fallback chain: ${r.bothFailedMessage}`);
  }
});

bdd.thenStep('locale zh-Hans 映射为 zh-CN 且其余透传', (ctx) => {
  if (localeToGherkinLang('zh-Hans') !== 'zh-CN') {
    throw new Error(`zh-Hans must map to zh-CN, got ${localeToGherkinLang('zh-Hans')}`);
  }
  if (localeToGherkinLang('en') !== 'en' || localeToGherkinLang('fr') !== 'fr') {
    throw new Error('non zh-Hans locales must pass through unchanged');
  }
});

// ---------------------------------------------------------------------------
// r8 — capability header comments reported item by item (acceptance)
// ---------------------------------------------------------------------------

const NO_HEADER_FEATURE = `功能: 裸能力

  @req:r8
  规则: 规则
    系统 MUST 报告缺失
`;

bdd.given('一个缺失全部头注释的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = { 源文本: NO_HEADER_FEATURE };
});

bdd.thenStep('错误逐项报告三处缺失头注释', (ctx) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const codes = doc?.errors.map((e) => e.code) ?? [];
  for (const key of ['capability', 'purpose', 'scope']) {
    if (!codes.includes(`missing-header:${key}`)) {
      throw new Error(`missing-header:${key} not reported; got [${codes.join(', ')}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// r7 — skeleton `# language:` header derives from the locale mapping
// ---------------------------------------------------------------------------

interface SkeletonResult {
  code: number;
  out: string;
  content: string | null;
}

bdd.given('一个 locale 为 zh-Hans 的已初始化临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n',
  );
  ctx.fixtures['skeleton仓库'] = { repo };
});

bdd.when('运行 spec skeleton demo-cap', (ctx) => {
  const { repo } = ctx.fixtures['skeleton仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'spec', 'skeleton', 'demo-cap']);
  const path = join(repo.root, 'llmanspec', 'specs', 'demo-cap.feature');
  const content = existsSync(path) ? readFileSync(path, 'utf8') : null;
  ctx.fixtures['skeleton结果'] = {
    code: result.code,
    out: `${result.stdout}${result.stderr}`,
    content,
  } satisfies SkeletonResult;
});

bdd.thenStep('生成的 spec 首行为 "# language: zh-CN" 且规则体使用中文', (ctx) => {
  const r = ctx.fixtures['skeleton结果'] as SkeletonResult;
  if (r.code !== 0) throw new Error(`skeleton failed: ${r.out}`);
  const content = r.content ?? '';
  if (!content.startsWith('# language: zh-CN\n')) {
    throw new Error(`zh-Hans skeleton must start with the zh-CN header:\n${content}`);
  }
  if (
    !content.includes('功能: demo-cap') ||
    !content.includes('规则:') ||
    !content.includes('假如')
  ) {
    throw new Error(`zh skeleton body must be localized:\n${content}`);
  }
});

bdd.when('在 locale 为 en 的已初始化临时仓库运行 spec skeleton demo-cap', (ctx) => {
  const repo = makeTempRepo();
  const result = repo.run('bun', [CLI, 'spec', 'skeleton', 'demo-cap']);
  const path = join(repo.root, 'llmanspec', 'specs', 'demo-cap.feature');
  const content = existsSync(path) ? readFileSync(path, 'utf8') : null;
  ctx.fixtures['skeleton结果'] = {
    code: result.code,
    out: `${result.stdout}${result.stderr}`,
    content,
  } satisfies SkeletonResult;
});

bdd.thenStep('生成的 spec 首行为 "# language: en"', (ctx) => {
  const r = ctx.fixtures['skeleton结果'] as SkeletonResult;
  if (r.code !== 0) throw new Error(`skeleton failed: ${r.out}`);
  const content = r.content ?? '';
  if (!content.startsWith('# language: en\n')) {
    throw new Error(`en skeleton must start with the en header:\n${content}`);
  }
});

// ---------------------------------------------------------------------------
// r65 — migration keeps a rule scenario's own inline steps (acceptance)
// ---------------------------------------------------------------------------

type MigrateOutcome = ReturnType<typeof migrateNativeSource>;

const SAME_BODY_LEGACY = `# language: zh-CN
# capability: 同体迁移
# purpose: p
# scope: x/

功能: 同体迁移

  @req:r1 @human
  场景: 稳定输出
    - 系统 MUST 输出稳定结果。
    假如 输入为 \`1\`
    当 系统执行
    那么 输出 MUST 为 \`1\`
`;

const SAME_BODY_LEGACY_SKIP = SAME_BODY_LEGACY.replace(
  '  @req:r1 @human',
  '  @req:r1 @human @skip',
);

bdd.given('一个「描述与验收步骤同体」的 zh-CN legacy feature 内容', (ctx) => {
  ctx.fixtures['同体迁移'] = { 源文本: SAME_BODY_LEGACY };
});

bdd.given('一个带 @skip 的「描述与验收步骤同体」legacy feature 内容', (ctx) => {
  ctx.fixtures['同体迁移'] = { 源文本: SAME_BODY_LEGACY_SKIP };
});

bdd.when('迁移该 feature 为原生格式', (ctx) => {
  const f = ctx.fixtures['同体迁移'] as { 源文本: string } | undefined;
  if (!f) throw new Error('missing 同体迁移 fixture');
  ctx.fixtures['迁移结果'] = migrateNativeSource(f.源文本) satisfies MigrateOutcome;
});

bdd.thenStep('迁移产物为含自动嵌套场景的规则块且步骤关键字序列原样保留', (ctx) => {
  const res = ctx.fixtures['迁移结果'] as MigrateOutcome | undefined;
  if (!res?.ok) throw new Error(`migration failed: ${res?.message}`);
  const doc = parseCapability(res.content, '同体迁移.feature');
  const rule = doc.rules[0];
  if (!rule) throw new Error('no rule block in migrated output');
  const nested = rule.scenarios[0];
  if (nested?.name !== '验收示例') {
    throw new Error(`inline steps must nest as 验收示例, got ${JSON.stringify(nested?.name)}`);
  }
  const kinds = nested.steps.map((s) => s.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(['given', 'when', 'then'])) {
    throw new Error(`inline steps must keep their keywords, got [${kinds.join(', ')}]`);
  }
});

bdd.thenStep('迁移产物以官方解析器解析无错误', (ctx) => {
  const res = ctx.fixtures['迁移结果'] as MigrateOutcome | undefined;
  if (!res?.ok) throw new Error(`migration failed: ${res?.message}`);
  const doc = parseCapability(res.content, '同体迁移.feature');
  if (doc.errors.length > 0) {
    throw new Error(`migrated output must parse cleanly, got: ${JSON.stringify(doc.errors)}`);
  }
});

bdd.thenStep('摘要计数含该自动嵌套场景', (ctx) => {
  const res = ctx.fixtures['迁移结果'] as MigrateOutcome | undefined;
  if (!res?.ok) throw new Error(`migration failed: ${res?.message}`);
  if (res.rules !== 1 || res.scenarios !== 1) {
    throw new Error(
      `summary must count the auto-nested scenario, got ${res.rules} rule(s), ${res.scenarios} scenario(s)`,
    );
  }
});

bdd.thenStep('自动嵌套场景带 @skip 标签', (ctx) => {
  const res = ctx.fixtures['迁移结果'] as MigrateOutcome | undefined;
  if (!res?.ok) throw new Error(`migration failed: ${res?.message}`);
  const doc = parseCapability(res.content, '同体迁移.feature');
  const nested = doc.rules[0]?.scenarios[0];
  // IR 消费规则:@skip 不留在 tags,折叠为 runnable=false
  if (!nested || nested.runnable) {
    throw new Error(
      `auto-nested scenario must inherit @skip (runnable=false), got ${JSON.stringify(nested)}`,
    );
  }
});
