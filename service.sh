#!/system/bin/sh
# 非阻塞：新会话后台执行，立刻退出。
# 用 setsid 是为了避免 ksud 在脚本退出后清理进程组，把后台任务一起杀掉。
if [ -x /system/bin/setsid ]; then
    setsid sh /data/adb/modules/cammirror/bin/install.sh < /dev/null > /dev/null 2>&1 &
else
    sh /data/adb/modules/cammirror/bin/install.sh < /dev/null > /dev/null 2>&1 &
fi
exit 0
