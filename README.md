# 相机增强 · vivo X Flip

vivo X Flip 外屏原生相机的增强模块（KernelSU）。

- **取景镜像修正** —— 外屏拍照取景不再左右翻转（只改预览，不动成片）
- **满血相机** —— 外屏跑内屏版相机界面
- **录像规格** —— 1080p / 4K 可选，1080p 支持 60 帧；默认 0.6x 超广角
- **颠倒世间之物** —— 竖着拿时相机界面倒置，自动翻转 180°
- **虚假之天** —— 相机在前台时电源键变成音量键，退出相机立刻还原

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

覆盖安装不会动 `/data/local/cammirror/` 里已有的设置（模式、画质、帧率、开关等）。

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

### 虚假之天

相机界面在前台时，**电源键 = 音量键**（默认音量减）；相机一退出，1~2 秒内自动还原成正常的电源键。默认开启，控制台里可以一键关掉。

实现方式：不碰系统分区、不改按键布局文件，而是用 root 独占 `pmic_pwrkey` 设备（`EVIOCGRAB`），再通过虚拟键盘把事件转发成音量键。所以：

- 平时完全不拦截电源键，行为与原生一致
- 进程被杀死 / 崩溃，独占立即自动释放，电源键回到正常状态，不会卡死
- **代价**：相机前台时电源键无法锁屏（这正是这个功能的定义）。长按 10 秒的硬件强制重启由 PMIC 负责，不受影响
- 在 vivo 相机里音量键通常是快门键，所以按电源键可能是**拍照**

想改方向或更换生效的应用，编辑 `/data/local/cammirror/pwrkeyvol.conf`：

```
VOL=down            # 改成 up 就是音量加
PKG=com.android.camera
PKG=com.vivo.alphacamera
PKG=net.sourceforge.opencamera
PKG=com.android.cameraextensions
```

改完不需要重启进程，1 秒内生效。

## 卸载

KernelSU 管理器里卸载即可，自动停掉所有后台进程并清理 `/data/local/cammirror/`。

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

日志：`/data/local/cammirror/install.log`、`daemon.log`、`pwrkeyvol.log`

## 版本号规则

- `version`：只用于在 KernelSU 管理器里显示，**可以用空格**，越易读越好 —— `v5 preview 01`
- `versionCode`：唯一参与升级比较的值，纯数字 —— 主版本 ×1000 + 次版本 ×100 + 序号，`5001` = 5.0 第 1 个预览
- 文件名：**不要有空格**（命令行和管理器选文件容易出岔子）—— `cammirror-v5preview01.zip`

| 含义 | version（可读） | versionCode | 文件名 |
|---|---|---|---|
| v5 第 01 个预览 | `v5 preview 01` | 5001 | `cammirror-v5preview01.zip` |
| v5 第 02 个预览 | `v5 preview 02` | 5002 | `cammirror-v5preview02.zip` |
| v5 正式版 | `v5` | 5000 | `cammirror-v5.zip` |
| v5.1 | `v5.1` | 5100 | `cammirror-v5.1.zip` |

## 更新记录

### v5preview01

- 新增「虚假之天」：相机前台时电源键 → 音量键，退出即还原
  - `bin/pwrkeyvol`（静态二进制，`EVIOCGRAB` 独占 `pmic_pwrkey` + uinput 回注）+ `bin/pwrkeyvol-watch.sh` 守护包装
  - 控制台新增开关；`status` 增加 `fk` / `pv` 字段
- 修复相机退出后不立即还原：vivo 相机退到后台时进程 `oom_score_adj` 仍为 0，单靠 `/proc` 会误判为"还在前台"，表现为要切到别的 App 才恢复。已改为在独占状态下用 `topResumedActivity` 精确判定
- 修复 `pgrep -f` 自匹配：Android 的 `pgrep` 不排除自身，导致 `install.sh` 永远认为"守护已在运行"而不启动
- 修复单实例锁失效：锁文件路径改为派生自配置目录，建不出锁时程序直接退出，避免两个实例同时独占电源键
- 卸载脚本补充停止「虚假之天」，避免卸载后电源键停留在音量键状态
- 版本号：`version` 用空格分隔的人类可读写法 `v5 preview 01`，`versionCode` 按 主×1000+次×100+序号 编码为 5001

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
- 「虚假之天」只能走 root 层拦截：`keylayout` 是开机时读一次的，改它做不到"按 App 切换"，
  而且会让电源键的锁屏 / 关机功能永久消失。
- 判前台不要只看 `oom_score_adj`：vivo 相机退出后该值仍为 0（见 v5preview01）。
