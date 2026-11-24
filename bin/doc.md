# 相机增强（cammirror）模块存档

目录：/sdcard/cammirror/

## 命名规则

```
cammirror-v<主版本>[-<阶段>][-<状态>].zip
```

- 阶段：`release` / `preview`；状态：`fix`（二次修复用 `double-fix`）
- `module.prop` 的 `version` 与文件名严格一致，`versionCode` 单调递增

## 文件

| 文件 | version | versionCode | PAYLOAD_VER | MD5 |
|---|---|---|---|---|
| cammirror-v4-release-double-fix.zip | v4-release-double-fix | 21 | 31 | 8f74505654b6cb0eeaa6dcc72ea8c694 |
| cammirror-v5-preview-02.zip | v5-preview-02 | 5002 | 33 | fc883e108e1db3e22a82a71cae0d2700 |

`cammirror.js` md5 `fe38aeae4f786ba4efcb6aee47889049`。

## 历次改动

### 成片镜像修正
`pref_camera_mirrorstorage_key`（自拍镜像/自拍翻转）。hook `SettingManager.getSettingValueFromKey`，
**只在原始值是 Boolean 时**返回 false（相机埋点会把同一 key 当 String 读，否则崩溃）。

### pid 复用修复
`alive_as()` 一律核对 `/proc/<pid>/cmdline`：install.sh 并发锁 / httpd / 守护 / ctl start|stop / status / uninstall.sh。

### 虚假之天（仅 v5）
相机前台电源键 → **音量减**（`VOL=down`）。**关键**：电源键节点 `/dev/input/eventN` 的编号随开机会变
（曾 event2，后 event1），二进制里改为固定路径 `/dev/input/pwrkey`，
由 `install.sh` / `pwrkeyvol-watch.sh` 按设备名 `pmic_pwrkey` 解析并建软链。
想换音量加：`sed -i 's/^VOL=.*/VOL=up/' /data/local/cammirror/pwrkeyvol.conf` 后重启 pwrkeyvol。

## 刷入
```sh
ksud module install /sdcard/cammirror/cammirror-v5-preview-02.zip
```
## 回退
刷入前备份：`/data/local/tmp/cammirror-backup-*.tar`
