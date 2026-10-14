# Design

## D1 管辖范围条款放置:仅 apply,不全铺

候选:四 skill(apply/propose/quick/explore)各写一遍 vs 只写 apply。选只写 apply——实施循环是 agent 直改仓库文件的高频入口;propose/quick 自身已经表达了"何时入 SDD 流程"的路由判据,四处重复同一句话是漂移温床(一个意思只用一处表述,其余引用)。代价:explore/archive 阶段读不到该条款,可接受——这两个阶段不直接改仓库工程文件。

## D2 验证块:纯动态发现,不列载体名(用户定案)

用户裁定:skill 不得假定用户用 `just test`,甚至不得假定 `just` 存在——写成“使用对应/本仓已声明的验证手段”这类动态描述。落法:执行本仓已声明的验证手段(仓库文档与配置记载为准);唯一工具锚点是产品自有约定 `specs.check_command`(它属 llman-sdd 配置合约,不是对用户技术栈的假定);未声明则问用户。不列 package.json/justfile/Makefile 载体清单——发现载体是 agent 的基本能力,写进模板反而成了新的假定面。

## D3 验证阶梯 L1/L2:能力描述替代命令拼写

L1/L2 的价值是成本递增纪律,不是 bun 命令本身。L1 改述为"项目单测入口中可直接导入被改模块的最小层";L2 改述为"定向执行 `specs.check_command`(或项目等价手段)中匹配当前场景的子集"——`specs.check_command` 是产品既有概念(config 合约已定义),非本仓私产。L3(`validate --check`)/L4(finalize)本就是产品命令,不动。

## D4 产物刷新:同 commit 内 regenerate + init --update

模板改动使 golden 基线与本仓 `.agents/skills` 同时过期。在绑定分支一次完成 `generate:skills-template-baseline` 与 `init --update`,与模板改动同 commit 提交,render 门(r80)即时守新鲜度;不允许"模板先行、产物后补"的中间态进主线。
