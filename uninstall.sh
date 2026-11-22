#!/system/bin/sh
# uninstall.sh —— 模块被移除时执行
# 安全护栏：绝不允许 rm -rf 落到预期路径之外

BASE=/data/local/cammirror

# ---- 护栏：路径必须是预期值，否则一律不动手 ----
if [ "$BASE" != "/data/local/cammirror" ] || [ ${#BASE} -lt 20 ]; then
    echo "uninstall aborted: unexpected BASE='$BASE'" > /dev/kmsg 2>/dev/null
    exit 0
fi

# 停「虚假之天」（守护包装 + 本体）。必须最先杀：它独占着电源键设备，
# 留着会让卸载后的手机电源键一直停在"音量键"状态。
for p in $(ps -A -o PID,ARGS 2>/dev/null | grep 'pwrkeyvol' | grep -v grep | awk '{print $1}'); do
    kill $p 2>/dev/null
done

# 停守护进程
DPID=$(cat $BASE/daemon.pid 2>/dev/null)
# 核对 cmdline 再杀：pid 会被复用，直接 kill 可能杀到无关进程
if [ -n "$DPID" ] && [ -r "/proc/$DPID/cmdline" ] \
   && tr '\0' ' ' < "/proc/$DPID/cmdline" 2>/dev/null | grep -q 'cammirror-watch[.]sh'; then
    kill $DPID 2>/dev/null
fi

# 停 httpd
for p in $(ps -A -o PID,ARGS 2>/dev/null | grep 'httpd -p 127.0.0.1:8899' | grep -v grep | awk '{print $1}'); do
    kill $p 2>/dev/null
done

sleep 1

# 二次确认后再删
if [ -d "$BASE" ] && [ "$BASE" = "/data/local/cammirror" ]; then
    rm -rf "$BASE"
fi

exit 0
