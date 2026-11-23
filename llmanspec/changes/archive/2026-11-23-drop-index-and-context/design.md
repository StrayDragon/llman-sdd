# 索引与检索

## 为什么两组一起删

索引没有第二个读者。留下 `index rebuild`、删掉 `context`，会得到一份没有命令消费的 `tree.json`，技能还得学会去读这个私有文件。这比直读 `.feature` 多一个约定。

留下 `context`、删掉 `index`，检索就没有本地树。现在的实现先建树再让模型调用工具。拆开之后两条都不成立。

## 版本戳

`sdd-state.json` 今天放在 `llmanspec/.context/`，是因为当初和索引共用目录。索引删除后，戳改放到 `llmanspec/.sdd-state.json`。

读取顺序：新路径，然后旧路径。写入只发生在新路径。这样已经跑过 `init` 的仓库在升级后，版本漂移 NOTE 仍能看到上次的 CLI 版本。旧文件不删除。
