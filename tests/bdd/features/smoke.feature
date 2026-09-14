# language: zh-CN
功能: BDD runner 冒烟
  作为 llman-sdd 的维护者
  我需要一个能驱动文件系统与子进程的最小 Gherkin 通道
  以便后续 @executable 场景可以在同一 runner 上执行

  场景: 能执行命令并断言退出码与输出
    假如 工作目录是仓库根
    当 执行命令 "bun --version"
    那么 退出码为 0
    而且 stdout 符合正则 "\d+\.\d+\.\d+"

  场景: 整数占位符与 fixture 存取可用
    假如 一个计数器初始为 0
    当 计数器递增 3 次
    那么 计数器的值为 3
