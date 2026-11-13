#!/system/bin/sh
# cammirror-watch.sh —— 守护进程：盯相机进程 + 负责所有界面重建
# 重建只在这里做，CGI 不再插手，避免双重重建互相打架。

BASE=/data/local/cammirror
INJ=$BASE/bin/frida-inject16
JS=$BASE/bin/cammirror.js
MODEF=$BASE/mode
LOG=$BASE/daemon.log

echo $$ > $BASE/daemon.pid
trap 'rm -f $BASE/daemon.pid; exit 0' TERM INT

# 重建一次界面；相机若被 finish 会自动拉回
rebuild_ui() {
    am start -n com.android.camera/.CameraActivity --activity-clear-task > /dev/null 2>&1
    sleep 2
    # clear-task 会让相机自行退出进程；无条件再拉一次（幂等：活着就带到前台）
    am start -n com.android.camera/.CameraActivity > /dev/null 2>&1
    echo "$(date '+%F %T') ui rebuilt ($1)" >> $LOG
}

LAST=""
LASTMODE=""

while true; do
    MODE=$(cat $MODEF 2>/dev/null)
    [ -z "$MODE" ] && MODE=C

    PID=$(pidof com.android.camera 2>/dev/null | awk '{print $1}')

    # ---- 1. 模式变化 → 相机已在跑且已注入时，重建界面（只重建一次）----
    if [ -n "$LASTMODE" ] && [ "$MODE" != "$LASTMODE" ]; then
        case "$MODE$LASTMODE" in
            *A*)
                if [ -n "$PID" ] && [ "$PID" = "$LAST" ]; then
                    sleep 1.5                       # 等脚本自己换好 hook
                    rebuild_ui "mode $LASTMODE->$MODE"
                fi
                ;;
        esac
    fi
    LASTMODE=$MODE

    # ---- 2. 新相机进程 → 注入 ----
    if [ -z "$PID" ]; then
        LAST=""
    else
        if [ "$MODE" != "OFF" ] && [ "$PID" != "$LAST" ]; then
            $INJ -p "$PID" -s "$JS" -e >> $LOG 2>&1
            RC=$?
            printf 'pid=%s\nrc=%s\ntime=%s\n' \
                "$PID" "$RC" "$(date '+%F %T')" > $BASE/lastinject
            LAST=$PID
            # 注入成功后，A 模式需要重建一次界面
            if [ "$MODE" = "A" ] && [ "$RC" = "0" ]; then
                sleep 1.5
                if [ -n "$(pidof com.android.camera)" ]; then
                    rebuild_ui "inject pid=$PID"
                else
                    echo "$(date '+%F %T') skip rebuild: camera gone" >> $LOG
                fi
            fi
        fi
    fi

    printf 'daemonPid=%s\ncameraPid=%s\nts=%s\n' \
        "$$" "$PID" "$(date '+%F %T')" > $BASE/daemon.state

    sleep 0.2
done
