#!/system/bin/sh
# 停掉 虚假之天（守护 + 本体），按 /proc 扫描并排除自己
SELF=$$
PAT='pwrkeyvol'
for d in /proc/[0-9]*; do
    pid=${d#/proc/}
    [ "$pid" = "$SELF" ] && continue
    [ -r "$d/cmdline" ] || continue
    cl=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
    case "$cl" in
        *"$PAT"*) echo "kill $pid: ${cl% }"; kill "$pid" 2>/dev/null ;;
    esac
done
sleep 2
