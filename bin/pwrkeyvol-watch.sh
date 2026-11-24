#!/system/bin/sh
# pwrkeyvol-watch.sh —— 「虚假之天」守护包装
# 程序自身有 flock 单实例锁：返回 2 表示已有实例在跑，此时本包装应退出，
# 避免两个包装互相打架。其余退出码（uinput 未就绪、设备未出现等）都是
# 可恢复的，等 3 秒重试。
B=/data/local/cammirror

while true; do
    # 每次拉起前解析 pmic_pwrkey 的实际节点（重启后 eventN 会变）
    for n in /sys/class/input/event*/device/name; do
        [ -f "$n" ] || continue
        if [ "$(cat "$n" 2>/dev/null)" = "pmic_pwrkey" ]; then
            ln -sf "/dev/input/$(basename "$(dirname "$(dirname "$n")")")" /dev/input/pwrkey 2>/dev/null
            break
        fi
    done
    "$B/bin/pwrkeyvol" -c "$B/pwrkeyvol.conf" -s "$B/fakesky" -l "$B/pwrkeyvol.log"
    rc=$?
    [ "$rc" -eq 2 ] && exit 0
    sleep 3
done
