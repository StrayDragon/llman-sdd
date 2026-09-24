// Domain step definitions: spec 解析能力 — 覆盖 r9(中文关键字 IR 分类)、
// r10(req 全局注册表重复对)、r7(语言兜底链与 locale 映射 + skeleton 语言头)、
// r8(capability 头注释逐项缺失报告)。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReqRegistry,
  localeToGherkinLang,
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

  @req:r9 @human
  场景: 规则样例
    - 系统 MUST 提供样例能力
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

bdd.thenStep('IR 中规则场景分类为 {classification}', (ctx, classification) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const rule = doc?.scenarios.find((s) => s.classification === 'human');
  if (!rule) throw new Error('no human-classified scenario in IR');
  if (classification !== 'human')
    throw new Error(`unexpected classification arg: ${classification}`);
});

bdd.thenStep('req 链接为 {reqId}', (ctx, reqId) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const ids = doc?.scenarios.flatMap((s) => s.reqIds) ?? [];
  if (!ids.includes(reqId)) throw new Error(`expected req link ${reqId}, got [${ids.join(', ')}]`);
});

bdd.given('两个 spec 文件都含 @req:{reqId} 标签', (ctx, reqId) => {
  const make = (capability: string): string => `# language: zh-CN
# capability: ${capability}
# purpose: 验证重复
# scope: x/

功能: ${capability}

  @req:${reqId} @human
  场景: 规则
    - 系统 MUST 提供能力
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

  @req:r7 @human
  场景: 规则
    - 系统 MUST 提供兜底
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

  @req:r8 @human
  场景: 规则
    - 系统 MUST 报告缺失
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
  if (!content.includes('功能: demo-cap') || !content.includes('系统 MUST')) {
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
// r9 — tag-layer violations reported item by item (acceptance)
// ---------------------------------------------------------------------------

interface ViolationFixture {
  docs: CapabilityDoc[];
}

bdd.given(
  '一组分别含残留 @manual、@human 与 @executable 同用、@human 描述缺语义词的 feature 内容',
  (ctx) => {
    const make = (tags: string, statement: string): string =>
      `# language: zh-CN\n# capability: 标签违例\n# purpose: p\n# scope: x/\n\n功能: 标签违例\n\n  @req:r9 ${tags}\n  场景: ${tags.replaceAll('@', '')}\n    - ${statement}\n`;
    ctx.fixtures['违例样本'] = {
      sources: [
        make('@manual @executable', '系统提供能力'), // 残留 @manual
        make('@human @executable', '系统 MUST 提供能力'), // 互斥
        make('@human', '系统提供能力'), // 缺语义词
      ],
    };
  },
);

bdd.when('逐个解析这些 feature', (ctx) => {
  const { sources } = ctx.fixtures['违例样本'] as { sources: string[] };
  ctx.fixtures['违例样本'] = {
    docs: sources.map((src) => parseCapability(src, 'violation.feature')),
  } satisfies ViolationFixture;
});

bdd.thenStep('残留 @manual 报迁移错误且信息含 "@manual"', (ctx) => {
  const { docs } = ctx.fixtures['违例样本'] as ViolationFixture;
  const hit = docs.flatMap((d) => d.errors).find((e) => e.code === 'tag:manual-removed');
  if (!hit) throw new Error('tag:manual-removed not reported');
  if (!hit.message.includes('@manual')) {
    throw new Error(`message must name @manual: ${hit.message}`);
  }
});

bdd.thenStep('同用报互斥错误', (ctx) => {
  const { docs } = ctx.fixtures['违例样本'] as ViolationFixture;
  if (!docs.flatMap((d) => d.errors).some((e) => e.code === 'tag:mutually-exclusive')) {
    throw new Error('tag:mutually-exclusive not reported');
  }
});

bdd.thenStep('缺语义词报 MUST/SHALL 缺失错误', (ctx) => {
  const { docs } = ctx.fixtures['违例样本'] as ViolationFixture;
  const hit = docs.flatMap((d) => d.errors).find((e) => e.code === 'rule:missing-must-word');
  if (!hit) throw new Error('rule:missing-must-word not reported');
  if (!hit.message.includes('MUST/SHALL')) {
    throw new Error(`message must mention MUST/SHALL: ${hit.message}`);
  }
});
