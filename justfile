# llman-sdd 任务编排(基线对齐 ../crystalith)

# ---- QA verbosity 三档(issue #1,对标 scalim qa-step.sh) ----
# L0(默认,agent/CI):只显示错误+警告计数+每步一行 [check]/[pass] 摘要
# L1:与 L0 重合(bun/oxlint 的安静输出即一行摘要)
# L2:`just QA_VERBOSE=2 qa` 关闭全部安静旗标,全量输出排障
# 原则:只用工具自带安静开关(禁止 grep/sed 过滤管道作门禁主路径);
# 任何档位失败详情与 exit code 均完整(--only-failures 只藏 pass 行)。
QA_VERBOSE := ""
BUN_RUN := if QA_VERBOSE == "2" { "bun run" } else { "bun run --silent" }
BUN_TEST_FLAGS := if QA_VERBOSE == "2" { "" } else { "--only-failures" }
OXLINT_FLAGS := if QA_VERBOSE == "2" { "" } else { "--quiet" }

# 默认:列出全部 recipe
default:
    @just --list

# 安装依赖(frozen lockfile,与 CI 一致)
install:
    bun install --frozen-lockfile

# 静态门禁:typecheck + lint + format(缺一不可)
check:
    @{{BUN_RUN}} typecheck && echo "[check] typecheck"
    @{{BUN_RUN}} lint {{OXLINT_FLAGS}} && echo "[check] lint"
    @{{BUN_RUN}} format:check && echo "[check] format"

# 主门禁:check + test(等价 CI)
qa: check
    @{{BUN_RUN}} test {{BUN_TEST_FLAGS}} && echo "[pass] test"

# 测试:单元 + BDD runner(tests/bdd)
test:
    @{{BUN_RUN}} test {{BUN_TEST_FLAGS}} && echo "[pass] test"

# lint 自动修复
lint-fix:
    bun run lint:fix

# 格式化写回
format:
    bun run format:write

# pending 计量门:无配对 @executable 验收的规则数不得高于基线(阶段 QA,随 executable 化批次下调)
pending-gate:
    bun run scripts/pending-gate.ts

# 构建 CLI 单二进制(apps/cli/dist/)
build:
    bun run build

# golden 门:skills 渲染 vs v2 自有快照基线(版本号归一化)
golden-generate:
    bun run golden:generate

golden-check:
    bun run golden:check

golden:
    bun run golden:check

# 真实 LLM 链路冒烟(env 守卫,未配置模型时干净跳过)
smoke-context:
    bun run smoke:context

# 单文件二进制冒烟:先构建再跑 tests/integration/binary.test.ts
smoke-binary: build
    bun test tests/integration/binary.test.ts

# config schema artifact:生成 / 漂移门
gen-schema:
    bun run gen:schema

check-schema:
    bun run check:schema

# 清理构建产物
clean:
    rm -rf apps/cli/dist
