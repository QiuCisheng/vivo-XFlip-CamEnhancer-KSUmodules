#!/system/bin/sh
# KernelSU 管理器「操作」按钮 → 激活 + 打开控制台
sh /data/adb/modules/cammirror/bin/install.sh
sleep 1
am start -a android.intent.action.VIEW -d "http://127.0.0.1:8899/" > /dev/null 2>&1
exit 0
