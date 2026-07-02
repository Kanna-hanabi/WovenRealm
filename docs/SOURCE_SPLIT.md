# 源码分离说明

织境空间现在按发布范围拆成两套源码。

## 公开版

路径：`D:\Dol\WovenRealm-public\src\AIStoryGen`

用途：

- 剧情生成
- 选项生成
- 记忆与物品
- 地点控制
- 场景生图
- 设置 UI

这个目录会推送到公开 GitHub 仓库。

## 亲密扩展

路径：`D:\Dol\WovenRealm-intimate-addon-src\AIStoryGenIntimateAddon`

用途：

- 依托公开版加载
- 单独提供亲密/战斗相关扩展入口和桥接文件

这个目录不放入公开 GitHub 仓库。需要发布附属包时，从该目录单独打包。

## 同步规则

公开源码只从 `AIStoryGen/boot.json` 列出的文件同步，避免把开发目录里的缓存、临时文件、旧版文件和附属包文件混入公开仓库。

亲密扩展源码只从 `AIStoryGenIntimateAddon/boot.json` 列出的文件同步，避免和公开版源码混杂。

同步命令：

```powershell
.\tools\sync-source.ps1 -DolRoot D:\Dol
```

公开版打包命令：

```powershell
.\tools\build-public.ps1
```
