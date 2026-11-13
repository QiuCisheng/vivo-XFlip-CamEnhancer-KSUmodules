# vivo-XFlip-CamEnhancer-KSUmodules

一个适用于 vivo X Flip 外屏相机的 KernelSU 模块。

没有修改系统分区，适用于临时Root。

主要用来自定义外屏录制的分辨率和帧率，并支持在录制视频时开启超广角，解锁外屏相机的更多玩法。

> **⚠️ 郑重声明**
> 本模块完全免费，禁止任何形式的二次打包倒卖！发现必举报！仅供个人学习交流，刷机有风险，请自行承担。

*   **开发者**：
*   Deepseek V4.1
*   Cisheng

---

## ✨ 主要功能

*   **录像规格自定义**：支持 1080p / 4K 切换。1080p 下支持 60 帧，4K 强制 30 帧（本机 4K60 跑不动）；默认开启 0.6x 超广角录制。
*   **外屏取景镜像修正**：外屏拍照取景不再左右翻转。修复了成品和预览的镜像问题。
*   **满血相机模式**：强行把内屏版的相机界面跑在外屏上，界面更完整，部分功能尚不可用。
*   **颠倒世间之物**：修复竖屏使用时界面的上下颠倒。


## 📱 测试环境

*   **机型**：vivo X Flip（V2256A / PD2256）
*   **系统**：Android 15-Origin5
*   **相机**：原生相机 V13.1.0.0 
*   **权限**：临时Root-KernelSu


## 🚀 安装与使用

1. 用 KernelSU 管理器刷入 ZIP 包，然后重启手机。
2. 在 KSU 管理器里找到本模块，点击「操作」按钮，会通过浏览器打开 WebUI 控制台（建议把控制台添加到桌面，方便下次进入）。
3. 控制台 2 秒刷新一次，会显示当前模式、Hook 是否生效、相机进程状态等。
    *   **相机增强**：外屏原生 UI + 去镜像，功能全开（推荐）。
    *   **满血相机**：内屏版 UI 跑在外屏，切换需要 3~5 秒自动重建界面。
    *   **关闭**：不干预相机。

**💡 录像规格说明**：
只有在「相机增强」模式下才能调录像规格。改完后重启相机生效。低电量/省电模式下，系统会自动把帧率压到 24，这是正常的。

## 🗑️ 卸载与急救

*   **常规卸载**：直接在 KernelSU 管理器里卸载即可，会自动清理 `/data/local/cammirror/`。
*   **临时停用**：新建空文件 `/data/adb/modules/cammirror/disable` 后重载。
*   **重根卡住急救**：本模块脚本全部非阻塞，理论上不会卡。如果重根时真的卡住了，请在重根前执行：`rm -rf /data/adb/modules/cammirror`

**数据路径**：
*   模块本体：`/data/adb/modules/cammirror/`
*   控制台与日志：`/data/local/cammirror/` (查看 `install.log` 和 `daemon.log` 排错)

## 🛠️ 避坑与技术备注

*   相机在 `Utils.initFlipState()` 中靠 `display.getDisplayId() != 0` 判断处于外屏，导致 `RenderParamsHolder.isPreviewMirror()` 恒为 true。模块 Hook 掉了这一项，保留前摄/后置自拍的设计镜像。
*   **千万别 Hook** `getDeviceState()` / `isFlipOuterScreen()`：`DimensUtils.initBaseInfo()` 依赖它选 display 0/1 的尺寸，改掉会取到内屏尺寸导致黑屏或界面错乱。
*   **千万别**给外屏 UI 增加它没有的控件（如录像变焦档）：没有控件承载，会直接崩在 `ListPreference.setValue`。
*   CGI 取参数必须按键精确匹配，不能用 `.*f=` 这类贪婪写法，否则会抓到 `pf=1` 里的 `f=`，导致 60 帧写不进去。

