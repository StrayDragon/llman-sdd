# llman-sdd 任务编排(基线对齐 ../crystalith)

# 默认:列出全部 recipe
default:
    @just --list

# 安装依赖(frozen lockfile,与 CI 一致)
install:
    bun install --frozen-lockfile

# 静态门禁:typecheck + lint + format(缺一不可)
check:
    bun run typecheck
    bun run lint
    bun run format:check

# 主门禁:check + test(等价 CI)
qa: check
    bun run test

# 测试:单元 + BDD runner(tests/bdd)
test:
    bun test tests/

# lint 自动修复
lint-fix:
    bun run lint:fix

# 格式化写回
format:
    bun run format:write

# 构建 CLI 单二进制(apps/cli/dist/)
build:
    bun run build

# golden 基线:v1 渲染产物生成 / 漂移对照
golden-generate:
    bun run golden:generate

golden-check:
    bun run golden:check

golden-cli:
    bun run golden:cli

# golden 四门统一入口:skills 渲染(免 v1)+ validate 对照 + 活体 CLI 对照 + 冷备兼容
# (后三门需要 PATH 上的 v1 `llman`;CI 只跑 golden:check)
golden:
    bun run golden:check
    bun run golden:validate
    bun run golden:cli
    bun test tests/integration/freeze-compat.test.ts

# 真实 LLM 链路冒烟(env 守卫,未配置模型时干净跳过)
smoke-context:
    bun run smoke:context

# config schema artifact:生成 / 漂移门
gen-schema:
    bun run gen:schema

check-schema:
    bun run check:schema

# 清理构建产物
clean:
    rm -rf apps/cli/dist
