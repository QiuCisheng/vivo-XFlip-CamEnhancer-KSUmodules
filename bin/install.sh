#!/system/bin/sh
# install.sh —— 载荷安装 + 服务拉起（幂等，可反复执行）
# 设计原则：
#   1) 绝不阻塞 —— 任何失败都只是"没生效"，不影响系统与重根流程
#   2) 绝不越界 —— 所有路径写死，删除前二次校验
#   3) 可重入 —— 用带存活检测的锁避免并发

MODDIR=/data/adb/modules/cammirror
BASE=/data/local/cammirror
PAYLOAD_VER=33      # 每次更新载荷内容都要 +1，否则已装设备不会刷新
LOG=$BASE/install.log

# ---------- 安全护栏：路径必须是预期值 ----------
if [ "$MODDIR" != "/data/adb/modules/cammirror" ] || [ "$BASE" != "/data/local/cammirror" ]; then
    echo "install aborted: unexpected paths" > /dev/kmsg 2>/dev/null
    exit 0
fi

# 判断 pid 是否"还是我们那个进程"：重启后 pid 会被复用，
# 只看 /proc/<pid> 存在会把别人的进程当成自己的。
alive_as() {   # alive_as <pid> <cmdline 子串(正则)>
    [ -n "$1" ] && [ -r "/proc/$1/cmdline" ] || return 1
    tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null | grep -q "$2"
}

# ---------- 并发锁（带陈旧检测，不会被死锁卡住） ----------
LOCK=$BASE/.lock
if [ -d "$LOCK" ]; then
    LPID=$(cat $LOCK/pid 2>/dev/null)
    # 注意：这里也必须核对 cmdline，否则重启后 pid 复用会让安装永远被"锁住"
    if alive_as "$LPID" 'cammirror/bin/install[.]sh'; then
        exit 0
    fi
    rm -rf "$LOCK" 2>/dev/null
fi
mkdir -p "$LOCK" 2>/dev/null || exit 0
echo $$ > "$LOCK/pid" 2>/dev/null
trap 'rm -rf "$LOCK"' EXIT INT TERM

mkdir -p $BASE/bin $BASE/www/cgi-bin $BASE/state 2>/dev/null
echo "=== $(date '+%F %T') install start ===" >> $LOG

# ---------- 1. 载荷完整性检查 ----------
if [ ! -d "$MODDIR/bin" ] || [ ! -d "$MODDIR/www" ]; then
    echo "ERROR: payload missing in $MODDIR" >> $LOG
    exit 0
fi

# ---------- 2. 找 busybox（httpd 依赖它） ----------
BB=""
for c in $MODDIR/bin/busybox /data/adb/ksu/bin/busybox /system/bin/busybox; do
    if [ -x "$c" ]; then BB="$c"; break; fi
done
echo "busybox=$BB" >> $LOG

# ---------- 3. 铺载荷（仅在版本变化时覆盖） ----------
if [ "$(cat $BASE/.payload_ver 2>/dev/null)" != "$PAYLOAD_VER" ]; then
    cp -rf $MODDIR/bin/. $BASE/bin/ 2>>$LOG
    cp -rf $MODDIR/www/. $BASE/www/ 2>>$LOG
    chmod 755 $BASE $BASE/bin $BASE/www $BASE/www/cgi-bin 2>/dev/null
    chmod 755 $BASE/bin/frida-inject16 $BASE/bin/cammirror-watch.sh \
              $BASE/bin/install.sh $BASE/bin/busybox $BASE/bin/pwrkeyvol \
              $BASE/bin/pwrkeyvol-watch.sh \
              $BASE/www/cgi-bin/status $BASE/www/cgi-bin/ctl 2>/dev/null
    chmod 644 $BASE/bin/cammirror.js $BASE/www/index.html 2>/dev/null
    chmod 755 $BASE/state 2>/dev/null
    # 校验关键二进制真的到位了，再认账
    if [ -x "$BASE/bin/frida-inject16" ] && [ -f "$BASE/bin/cammirror.js" ]; then
        echo "$PAYLOAD_VER" > $BASE/.payload_ver
        echo "payload refreshed" >> $LOG
    else
        echo "WARN: payload incomplete, will retry next time" >> $LOG
    fi
fi

# 模式文件：不存在才写，不覆盖用户设置
[ -f $BASE/mode ] || echo C > $BASE/mode
chmod 644 $BASE/mode 2>/dev/null

# 录像画质档位：4=480p 5=720p 6=1080p 8=4K 13=8K
[ -f $BASE/vquality ] || echo 8 > $BASE/vquality
chmod 644 $BASE/vquality 2>/dev/null

# 录像帧率与超广角
[ -f $BASE/vfps ] || echo 30 > $BASE/vfps
[ -f $BASE/ultrawide ] || echo 1 > $BASE/ultrawide
chmod 644 $BASE/vfps $BASE/ultrawide 2>/dev/null

# 颠倒世间之物（竖屏 180° 修正），默认开
[ -f $BASE/portraitfix ] || echo 1 > $BASE/portraitfix
chmod 644 $BASE/portraitfix 2>/dev/null

# A 模式的密度基准（2.0 = 320dpi）
[ -f $BASE/tune ] || echo 2.2 > $BASE/tune
chmod 644 $BASE/tune 2>/dev/null

# 虚假之天：相机前台时把电源键变成音量键
# VOL=down：映射到音量减（相机里音量键=快门）。
if [ ! -f $BASE/pwrkeyvol.conf ]; then
    printf 'VOL=down\nPKG=com.android.camera\nPKG=com.vivo.alphacamera\nPKG=net.sourceforge.opencamera\nPKG=com.android.cameraextensions\n' > $BASE/pwrkeyvol.conf
fi
[ -f $BASE/fakesky ] || echo 1 > $BASE/fakesky
chmod 644 $BASE/pwrkeyvol.conf $BASE/fakesky 2>/dev/null

# ---------- 4. 起 httpd（界面的服务端） ----------
if [ -n "$BB" ]; then
    # 端口在监听还不够：可能是不属于本载荷的旧 httpd，仍在服务旧页面
    HPID=$($BB netstat -ltnp 2>/dev/null | grep '127.0.0.1:8899' \
           | head -n 1 | awk '{print $NF}' | cut -d/ -f1)
    case "$HPID" in ''|*[!0-9]*) HPID="" ;; esac
    if alive_as "$HPID" "cammirror/www"; then
        echo "httpd already listening" >> $LOG
    else
        [ -n "$HPID" ] && kill $HPID 2>/dev/null && echo "stale httpd $HPID killed" >> $LOG
        setsid $BB httpd -p 127.0.0.1:8899 -h $BASE/www \
            < /dev/null > /dev/null 2>&1 &
        echo "httpd started" >> $LOG
    fi
else
    echo "WARN: no busybox, GUI unavailable" >> $LOG
fi

# ---------- 5. 起守护进程 ----------
# 只看 /proc/$DPID 存在不够：重启后 pid 会被复用，旧 daemon.pid 里的号
# 可能已属于别的进程，导致守护永远起不来。必须核对 cmdline。
DPID=$(cat $BASE/daemon.pid 2>/dev/null)
DPID_OK=no
alive_as "$DPID" 'cammirror-watch[.]sh' && DPID_OK=yes
if [ "$DPID_OK" = "no" ]; then
    [ -n "$DPID" ] && echo "stale daemon.pid=$DPID (pid reused), restarting" >> $LOG
    rm -f $BASE/daemon.pid
    if [ -x "$BASE/bin/cammirror-watch.sh" ]; then
        setsid $BASE/bin/cammirror-watch.sh < /dev/null > /dev/null 2>&1 &
        echo "daemon started" >> $LOG
    else
        echo "WARN: watcher not executable, skip" >> $LOG
    fi
else
    echo "daemon already running pid=$DPID" >> $LOG
fi


# 电源键设备节点：重启后 eventN 的编号会变（曾经 event2，后来变成 event1），
# 所以二进制里不再写死路径，统一用 /dev/input/pwrkey 这个软链，这里按设备名解析。
ensure_pwrkey_node() {
    for n in /sys/class/input/event*/device/name; do
        [ -f "$n" ] || continue
        if [ "$(cat "$n" 2>/dev/null)" = "pmic_pwrkey" ]; then
            dev="/dev/input/$(basename "$(dirname "$(dirname "$n")")")"
            ln -sf "$dev" /dev/input/pwrkey 2>/dev/null
            return 0
        fi
    done
    return 1
}

# ---------- 6. 起「虚假之天」（电源键→音量键） ----------
# 单实例由程序自身的 flock 保护；这里只负责"没在跑就拉起来"
if [ -x "$BASE/bin/pwrkeyvol-watch.sh" ]; then
    ensure_pwrkey_node || echo "WARN: pmic_pwrkey not found, 虚假之天 will not work" >> $LOG
    if ! pgrep -f "pwrkeyvol-watch[.]sh" > /dev/null 2>&1; then
        setsid $BASE/bin/pwrkeyvol-watch.sh < /dev/null > /dev/null 2>&1 &
        echo "pwrkeyvol started" >> $LOG
    else
        echo "pwrkeyvol already running" >> $LOG
    fi
else
    echo "WARN: pwrkeyvol-watch missing, skip" >> $LOG
fi

echo "=== install done ===" >> $LOG
exit 0
