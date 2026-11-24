#!/system/bin/sh
# 用法: k3.sh <down|up>  —— 设置映射并重启守护
B=/data/local/cammirror
V=$1
[ -n "$V" ] || V=down
sed -i "s/^VOL=.*/VOL=$V/" $B/pwrkeyvol.conf
head -1 $B/pwrkeyvol.conf
SELF=$$
for d in /proc/[0-9]*; do
    pid=${d#/proc/}
    [ "$pid" = "$SELF" ] && continue
    [ -r "$d/cmdline" ] || continue
    cl=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
    case "$cl" in
        */pwrkeyvol-watch.sh*|*/bin/pwrkeyvol\ *) kill "$pid" 2>/dev/null ;;
    esac
done
sleep 2
setsid $B/bin/pwrkeyvol-watch.sh < /dev/null > /dev/null 2>&1 &
sleep 3
echo "bin=$(pidof pwrkeyvol) conf=$(head -1 $B/pwrkeyvol.conf)"
