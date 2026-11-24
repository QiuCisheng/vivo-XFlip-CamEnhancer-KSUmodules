#!/system/bin/sh
B=/data/local/cammirror/bin
BB=/data/adb/ksu/bin/busybox
echo "== 打补丁"
printf '/dev/input/pwrkey\0' | $BB dd of=$B/pwrkeyvol bs=1 seek=$((0xe400)) conv=notrunc 2>&1 | tail -1
strings -t x $B/pwrkeyvol | grep "dev/input/pwrkey" || echo "PATCH FAIL"
echo "== 更新守护脚本"
$BB wget -q -O $B/pwrkeyvol-watch.sh http://127.0.0.1:8894/pwrkeyvol-watch.sh && chmod 755 $B/pwrkeyvol-watch.sh && echo "watch ok"
echo "== 解析节点"
for n in /sys/class/input/event*/device/name; do
  [ -f "$n" ] || continue
  if [ "$(cat "$n" 2>/dev/null)" = "pmic_pwrkey" ]; then
    d="/dev/input/$(basename "$(dirname "$(dirname "$n")")")"
    ln -sf "$d" /dev/input/pwrkey; echo "pwrkey -> $d"; break
  fi
done
ls -l /dev/input/pwrkey
echo "== 启动"
setsid $B/pwrkeyvol-watch.sh < /dev/null > /dev/null 2>&1 &
sleep 3
echo "bin=$(pidof pwrkeyvol) watch=$(pgrep -f 'pwrkeyvol-watch')"
