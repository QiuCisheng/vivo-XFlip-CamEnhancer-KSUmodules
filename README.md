# 相机增强 · vivo X Flip

vivo X Flip 外屏原生相机的增强模块（KernelSU）。

- **取景镜像修正** —— 外屏拍照取景不再左右翻转（只改预览，不动成片）
- **满血相机** —— 外屏跑内屏版相机界面
- **录像规格** —— 1080p / 4K 可选，1080p 支持 60 帧；默认 0.6x 超广角
- **颠倒世间之物** —— 竖着拿时相机界面倒置，自动翻转 180°

不修改系统分区、boot、相机 APK 或任何 App 数据。

## 适用环境

| 项 | 要求 |
|---|---|
| 机型 | vivo X Flip（V2256A / PD2256） |
| 系统 | Android 15 |
| 相机 | 原生相机 V13.1.0.0 |
| 权限 | root（KernelSU 已验证） |

相机版本不匹配时 hook 不生效，控制台顶部会亮红字提示。

## 安装

1. 用 KernelSU 管理器刷入 ZIP，重启
2. 点模块的「操作」按钮，浏览器打开控制台
3. 建议把控制台「添加到主屏幕」

## 使用

控制台 2 秒刷新一次，显示当前模式、hook 是否生效、相机进程、守护进程状态。

| 模式 | 说明 |
|---|---|
| **相机增强** | 外屏原生 UI + 去镜像，功能全开 |
| **满血相机** | 内屏版 UI 跑在外屏，界面更完整，但夜景 / 5000 万 / 变焦不可用 |
| **关闭** | 不干预 |

- 相机增强 ↔ 关闭：1 秒内生效，不用重开相机
- 切满血相机：约 3~5 秒自动重建界面

**录像规格**（仅「相机增强」模式下显示）：

- 画质：1080p / 4K
- 帧率：30 / 60 —— 4K 时强制 30（4K60 本机不可行），1080p 可用 60
- 镜头：默认 0.6x 超广角，可关

改完重启相机生效。低电量 / 省电模式下系统会把帧率压到 24，属正常。

「颠倒世间之物」默认开启，一般不用动；系统更新后若竖屏已正常，可以关掉。

## 卸载

KernelSU 管理器里卸载即可，自动清理 `/data/local/cammirror/`。

临时停用：新建空文件 `/data/adb/modules/cammirror/disable` 后重载。

## 如果重根卡住

本模块脚本全部非阻塞，理论上不会拖住 `ksud late-load`。若仍遇到卡住，在重根前执行：

```sh
rm -rf /data/adb/modules/cammirror
```

运行数据：

```
/data/adb/modules/cammirror/   模块本体
/data/local/cammirror/         控制台、日志、守护进程
```

日志：`/data/local/cammirror/install.log`、`daemon.log`

## 更新记录

### v4-release

- 控制台：模式行加标题；「颠倒世间之物」名称移到区块标题，按钮只留开 / 关；超广角同样处理
- 满血相机模式下两条重复提示合并成一条
- 作者署名 Cisheng & Minis

### v3.3

- 修复录像参数解析 bug（旧写法用贪婪匹配，会抓到 `pf=1` 里的 `f=`，60 帧写不进去）
- 1080p 60 帧可用

### v3.2

- 颠倒世间之物：`CameraUIController_FlipSub.setOrientation()` 在 90°/270° 时 +180°

### v2.7

- 录像规格仅在「相机增强」模式生效
- 4K 与 60 帧互斥

### v2.4

- 录像 1080p → 4K：hook `Utils.getVideoProfile(cameraId, quality)`，quality 传 8
- 录像默认超广角 0.6x

### v2.0

- 新增内屏 UI 模式（`IUIController.create` + `Resources.getDisplayMetrics` + 镜像 hook）

### v1.1

- 修复重复注入导致 hook 全部失效（单实例守卫 + 心跳文件）

### v1.0

- 首个版本

## 实现备注

- 相机在 `Utils.initFlipState()` 中靠 `display.getDisplayId() != 0` 判断处于外屏，
  因而 `RenderParamsHolder.isPreviewMirror()` 恒为 true。模块 hook 掉这一项，
  保留前摄 / 后置自拍的设计镜像。
- 不要 hook `getDeviceState()` / `isFlipOuterScreen()`：`DimensUtils.initBaseInfo()`
  依赖它选 display 0/1 的尺寸，改掉会取到内屏尺寸导致黑屏或界面错乱。
- 不要给外屏 UI 增加它没有的控件（如录像变焦档）：没有控件承载，会崩在 `ListPreference.setValue`。
- CGI 取参数必须按键精确匹配，不能用 `.*f=` 这类贪婪写法（见 v3.3）。
