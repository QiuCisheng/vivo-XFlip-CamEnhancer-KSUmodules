'use strict';
/*
 * cammirror.js —— 相机外屏取景镜像控制（带诊断埋点）
 *
 * 模式（/data/local/cammirror/mode，1 秒轮询）：
 *   C    修正   A  对照   OFF  关闭
 *
 * 诊断：计数器在 hook 的最开头自增，任何异常都不影响计数。
 *       前若干次调用会记录详细日志到 JSON 的 evt 数组。
 */

var MODE_FILE = '/data/local/cammirror/mode';
var STAT_FILE = '/data/data/com.android.camera/files/cammirror.json';
var TUNE_FILE = '/data/local/cammirror/tune';
var VQ_FILE = '/data/local/cammirror/vquality';   /* 录像画质：6=1080p 8=4K */
var VF_FILE = '/data/local/cammirror/vfps';        /* 录像帧率：30 / 60 */
var PF_FILE = '/data/local/cammirror/portraitfix';  /* 颠倒世间之物（竖屏 180° 修正） */
var UW_FILE = '/data/local/cammirror/ultrawide';   /* 超广角：1=开 0=关 */   /* 录像画质档位码，如 8 */   /* 内容: CAM_PACKAGE_DENSITY 的值，如 1.875 */

var RPH = null, NRRB = null, Utils = null, DeviceState = null, SizeUtil = null;
var SMGR = null, JBool = null, noMirrorHits = 0;
var IUIController = null, UIVersion = null, DimensUtils = null;
var JReader = null, JReaderStream = null, JStream = null,
    JFos = null, JString = null;

var current = null;
var hits = 0, outHits = 0, vfHits = 0, lastVal = null, ticks = 0;
var tuneVal = null;
var vqVal = null, vfVal = null, uwVal = null, pfVal = null;
var evt = [];           /* 最近若干条事件，供诊断 */
var evtSeq = 0;

function log(m) {
    try { console.log('[cammirror] ' + m); } catch (e) {}
    try {
        evtSeq++;
        if (evt.length > 24) evt.shift();
        evt.push(evtSeq + ' ' + m);
    } catch (e2) {}
}

function readMode() {
    var r = null;
    try {
        r = JReader.$new(JReaderStream.$new(JStream.$new(MODE_FILE), 'UTF-8'));
        var line = r.readLine();
        if (line) {
            var s = String(line).trim().toUpperCase();
            if (s === 'A' || s === 'C' || s === 'OFF') return s;
        }
    } catch (e) {
        log('readMode err ' + e);
    } finally {
        try { if (r) r.close(); } catch (e2) {}
    }
    return current || 'C';
}

function readTune() {
    var r = null;
    try {
        r = JReader.$new(JReaderStream.$new(JStream.$new(TUNE_FILE), 'UTF-8'));
        var line = r.readLine();
        if (line) {
            var v = parseFloat(String(line).trim());
            /* 0.5~3 是 CAM_PACKAGE_DENSITY；100~2000 是 SW（越小界面越小） */
            if (!isNaN(v) && v > 0 && v <= 2000) return v;
        }
    } catch (e) {
        /* 文件不存在 = 不调节 */
    } finally {
        try { if (r) r.close(); } catch (e2) {}
    }
    return null;
}

function readVq() {
    var r = null;
    try {
        r = JReader.$new(JReaderStream.$new(JStream.$new(VQ_FILE), 'UTF-8'));
        var line = r.readLine();
        if (line) {
            var t = String(line).trim();
            if (/^[0-9]{1,2}$/.test(t)) return t;
        }
    } catch (e) {
    } finally {
        try { if (r) r.close(); } catch (e2) {}
    }
    return null;
}

function readSimple(file, ok) {
    var r = null;
    try {
        r = JReader.$new(JReaderStream.$new(JStream.$new(file), 'UTF-8'));
        var line = r.readLine();
        if (line) {
            var t = String(line).trim();
            if (ok.indexOf(t) >= 0) return t;
        }
    } catch (e) {
    } finally {
        try { if (r) r.close(); } catch (e2) {}
    }
    return null;
}

function readVf() {
    var v = readSimple(VF_FILE, ['30','60']);
    if (vqVal === '8') v = '30';    /* 4K60 本机不可用，4K 强制 30 帧 */
    return v;
}

/* 是否要求 1080p 60 帧（4K 强制 30，避免和 4K 抢资源） */
function want60() {
    return vfVal === '60' && vqVal !== '8';
}

function applyTune() {
    if (tuneVal === null) return;
    try {
        /* tune >= 100  → 视为 SMALLEST_SCREEN_WIDTH_DP_CURRENT（控制整体缩放，越小越小）
           tune <  100  → 视为 CAM_PACKAGE_DENSITY（只影响显式换算的尺寸） */
        if (tuneVal >= 100) {
            if (DimensUtils) {
                DimensUtils.SMALLEST_SCREEN_WIDTH_DP_CURRENT.value = Math.round(tuneVal);
            }
        } else if (SizeUtil) {
            SizeUtil.CAM_PACKAGE_DENSITY.value = tuneVal;
        }
    } catch (e) {}
}

function writeStat() {
    var fos = null;
    try {
        var swNow = -1;
        try {
            if (DimensUtils) swNow = DimensUtils.SMALLEST_SCREEN_WIDTH_DP_CURRENT.value;
        } catch (e0) {}
        var s = JSON.stringify({
            pid: Process.id, mode: current,
            pmHits: hits, outHits: outHits, vfHits: vfHits, last: lastVal,
            ticks: ticks, sw: swNow, tune: tuneVal, nm: noMirrorHits, ts: Date.now(),
            evt: evt.slice(-8)
        });
        fos = JFos.$new(STAT_FILE);
        fos.write.overload('[B').call(fos, JString.$new(s).getBytes('UTF-8'));
        fos.flush();
    } catch (e) {
        try { console.log('[cammirror] writeStat err ' + e); } catch (e2) {}
    } finally {
        try { if (fos) fos.close(); } catch (e2) {}
    }
}

/* 关闭「镜像保存」：相机读 pref_camera_mirrorstorage_key 时一律返回 Boolean false，
   自拍 / 外屏拍照存盘不再左右翻转（实测有效，2026-11-22）。 */
function installNoMirrorSave() {
    if (!SMGR || !JBool) return;
    try {
        SMGR.getSettingValueFromKey.overloads.forEach(function (m) {
            m.implementation = function (key) {
                var r = m.apply(this, arguments);
                try {
                    if (String(key).toLowerCase().indexOf('mirrorstorage') >= 0) {
                        noMirrorHits++;
                        return JBool.$new(false);
                    }
                } catch (e) {}
                return r;
            };
        });
        log('nomirror hook installed');
    } catch (e) { log('nomirror hook err ' + e); }
}

function uninstallNoMirrorSave() {
    if (!SMGR) return;
    try {
        SMGR.getSettingValueFromKey.overloads.forEach(function (m) { m.implementation = null; });
    } catch (e) {}
}

function uninstallAll() {
    uninstallNoMirrorSave();
    try { if (RPH) RPH.isPreviewMirror.implementation = null; } catch (e) {}
    try { if (NRRB) NRRB.getPreviewSurfaceOutput.implementation = null; } catch (e) {}
    try { if (Utils) Utils.isFlipOuterScreen.implementation = null; } catch (e) {}
    try { if (Utils) Utils.getDeviceState.implementation = null; } catch (e) {}
    try { if (IUIController) IUIController.create.implementation = null; } catch (e) {}
    current = null;
}

function installMode(mode) {
    if (current === mode) return;
    uninstallAll();
    hits = 0; outHits = 0;

    if (mode === 'OFF') {
        log('mode=OFF (no hooks)');
    } else if (mode === 'A') {
        /* A 模式：只换 UI 壳子，不动设备状态。
           这样 isFlipDeviceInnerScreen() 仍为 false，
           相机自己的 convertCurrentPixelToStandard() 缩放会生效。 */
        var inHook = false;
        IUIController.create.implementation = function (ctx, a, b, ver) {
            if (inHook) return this.create(ctx, a, b, ver);
            var forced = ver;
            try {
                if (Utils.isFlipDevice()) forced = UIVersion.UI_VERSION_3.value;
            } catch (e) {}
            inHook = true;
            try { return this.create(ctx, a, b, forced); }
            finally { inHook = false; }
        };
        installNoMirrorSave();
        /* 镜像照样要修 */
        RPH.isPreviewMirror.implementation = function () {
            hits++;
            var r = this.mCameraFacing.value === 0
                || Utils.isRearSelfieState()
                || Utils.isRearSelfieExiting();
            lastVal = r;
            return r;
        };
        NRRB.getPreviewSurfaceOutput.implementation = function () {
            outHits++;
            var out = this.getPreviewSurfaceOutput();
            try { out.setMirror(false); } catch (e) {}
            return out;
        };
        /* 注意：不要 hook isFlipOuterScreen() —— DimensUtils.initBaseInfo()
           会用它决定取 display 0 还是 display 1 的尺寸，改了会导致黑屏闪退。
           代价：夜景 / 5000万 / 变焦档位仍按"外屏"限制。 */
        /* 已确认：动了 getDeviceState() / isFlipOuterScreen() 会让布局尺寸取值
           走到 display 0，界面必乱。所以只换 UI 壳 + 用密度 hook 控尺寸。
           代价：夜景 / 5000万 / 变焦档位仍按外屏限制。 */
        log('mode=A installed (UI=inner, density hook)');
    } else {
        installNoMirrorSave();
        RPH.isPreviewMirror.implementation = function () {
            hits++;                                  /* 先计数，绝不丢失 */
            var r;
            try {
                r = this.mCameraFacing.value === 0
                    || Utils.isRearSelfieState()
                    || Utils.isRearSelfieExiting();
            } catch (e) {
                if (hits <= 3) log('pm#ERR ' + e);
                r = lastVal === null ? false : lastVal;
            }
            if (hits <= 3) log('pm#' + hits + ' -> ' + r);
            lastVal = r;
            return r;
        };
        NRRB.getPreviewSurfaceOutput.implementation = function () {
            outHits++;
            var out = null;
            try {
                out = this.getPreviewSurfaceOutput();
                out.setMirror(false);
            } catch (e) {
                if (outHits <= 3) log('out#ERR ' + e);
            }
            if (outHits <= 3) log('out#' + outHits);
            return out;
        };
        log('mode=C installed');
    }
    current = mode;
}

function anotherInstanceAlive() {
    /* 若同一进程里已有实例在写心跳（5 秒内），说明它在正常工作，
       本次注入直接退出，避免多个实例互相 uninstall 打架。 */
    var r = null;
    try {
        r = JReader.$new(JReaderStream.$new(JStream.$new(STAT_FILE), 'UTF-8'));
        var txt = r.readLine();
        if (txt) {
            var j = JSON.parse(String(txt));
            if (j && j.pid === Process.id && j.ts && (Date.now() - j.ts) < 5000) {
                return true;
            }
        }
    } catch (e) {
        /* 文件不存在 / 解析失败 → 说明没有活着的实例 */
    } finally {
        try { if (r) r.close(); } catch (e2) {}
    }
    return false;
}

Java.perform(function () {
    try {
        RPH = Java.use('com.android.camera.glrender.holder.RenderParamsHolder');
        NRRB = Java.use('com.android.camera.glrender.core.request.NormalRenderRequestBuilder');
        Utils = Java.use('com.android.camera.utils.Utils');
        DeviceState = Java.use('com.android.camera.DeviceState');
        SizeUtil = Java.use('com.android.camera.utils.SizeUtil');
        IUIController = Java.use('com.android.camera.ui.api.IUIController');
        UIVersion = Java.use('com.android.camera.constant.ui.UIVersion');
        DimensUtils = Java.use('com.android.camera.res.utils.DimensUtils');
        try { SMGR = Java.use('com.android.camera.setting.SettingManager'); } catch (e1) {}
        try { JBool = Java.use('java.lang.Boolean'); } catch (e2) {}
        JReader = Java.use('java.io.BufferedReader');
        JReaderStream = Java.use('java.io.InputStreamReader');
        JStream = Java.use('java.io.FileInputStream');
        JFos = Java.use('java.io.FileOutputStream');
        JString = Java.use('java.lang.String');
        log('resolved pid=' + Process.id);
    } catch (e) {
        try { console.log('[cammirror] FATAL ' + e); } catch (e2) {}
        return;
    }

    /* 最底层杠杆：直接改 Resources 的密度，让 @dimen/ 按新密度解析。
       tune < 100 时生效（tune 即目标 density，如 1.0 = 160dpi）。 */
    try {
        var Res = Java.use('android.content.res.Resources');
        Res.getDisplayMetrics.implementation = function () {
            var dm = this.getDisplayMetrics();
            try {
                /* 只在 A 模式生效，C/OFF 必须保持外屏原生密度 */
                if (current === 'A' && tuneVal !== null && tuneVal > 0 && tuneVal < 100) {
                    dm.density.value = tuneVal;
                    dm.densityDpi.value = Math.round(tuneVal * 160);
                    dm.scaledDensity.value = tuneVal;
                }
            } catch (e) {}
            return dm;
        };
        log('Resources density hook installed');
    } catch (e) {
        log('res hook err ' + e);
    }

    /* 关键：DimensUtils.init()/initBaseInfo() 会用配置值重置 SW，
       必须在它们返回后立刻覆盖，否则 inflate 时用的还是原值。 */
    try {
        var applying = false;
        var forceSW = function () {
            if (applying) return;
            if (tuneVal === null || tuneVal < 100) return;
            applying = true;
            try {
                DimensUtils.SMALLEST_SCREEN_WIDTH_DP_CURRENT.value = Math.round(tuneVal);
            } catch (e) {}
            applying = false;
        };
        DimensUtils.init.implementation = function (ctx) {
            this.init(ctx);
            forceSW();
        };
        DimensUtils.initBaseInfo.implementation = function (ctx) {
            this.initBaseInfo(ctx);
            forceSW();
        };
        log('DimensUtils hooks installed');
    } catch (e) {
        log('dimens hook err ' + e);
    }

    /* 外屏录像解锁：实测切到录像模式会闪退，已移除。
       原因推测：isSupportVideoQualityAndFpsDefaultSetting 放出来后，
       录像菜单会去取外屏不支持的画质配置，导致崩溃。
       （限制位置：FeatureConfig_meat_PD2256.isModuleSupportCameraType
         里硬编码 video+WideSelfie→false；isSupportVideoQualityAndFpsDefaultSetting
         里 return !isFlipOuterScreen()） */

    /* ===== 录像默认超广角 0.6x =====
       NormalVideoSettingController_Flip.doCheckChangeCameraType() 外屏时
       恒返回 "MasterSelfie"（1.0 主摄），改为 "WideSelfie"（0.6 超广角）。
       只改默认档，不新增任何 UI 控件 —— 避免上次那种"凭空多出变焦档"的崩溃。 */
    try {
        var NV = Java.use('com.android.camera.normalvideo.setting.NormalVideoSettingController_Flip');
        NV.doCheckChangeCameraType.overload('java.lang.String').implementation = function (str) {
            try {
                /* 超广角：仅「相机增强」生效。
                   满血相机用的是内屏 UI，自带变焦控件，再指定默认值会跟它打架。 */
                if (current === 'C' && Utils.isFlipOuterScreen() && uwVal !== '0') return 'WideSelfie';
            } catch (e) {}
            return this.doCheckChangeCameraType(str);
        };
        log('video default 0.6x installed');
    } catch (e) {
        log('video 0.6x err: ' + e);
    }

    /* 录像画质/帧率解锁：实测会崩 —— 放开后相机去设外屏配置里不存在的
       画质档，崩在 ListPreference.setValue()（切模式时触发）。已移除。
       保留的限制：isSupportVideoQualityAndFpsDefaultSetting() 在外屏返回 false。 */

    /* ===== 录像画质档位 =====
       直接 hook 最底层：Utils.getVideoProfile(cameraId, quality)。
       它内部用 CamcorderProfile.hasProfile() 校验，拿不到就回退 quality=1，
       所以只要相机支持 4K（HAL 里有 3840x2160），传 8 就能拿到 4K profile。
       档位码：4=480p 5=720p 6=1080p 8=4K 13=8K（见 Utils.VIDEO_QUALITY_*） */
    try {
        Utils.getVideoProfile.implementation = function (cameraId, quality) {
            try {
                if (current === 'C' && vqVal !== null && Utils.isFlipOuterScreen()) {
                    quality = parseInt(vqVal, 10);
                }
            } catch (e) {}
            var prof = this.getVideoProfile(cameraId, quality);
            try {
                /* 编码器也要 60，否则源是 60、编码器仍按 30 抽帧 */
                if (want60() && current === 'C' && prof !== null) {
                    prof.videoFrameRate.value = 60;
                }
            } catch (e) {}
            return prof;
        };
        log('video profile override installed');
    } catch (e) {
        log('video profile override err: ' + e);
    }

    /* 录像 60fps —— 2026-11-07 实测结论（推翻以前的"不可能"）
       标准的 aeTargetFpsRange 走到头只有 [30,30]（本机 HAL 不给 60 档，
       硬要 [30,60] 会被协商成 24 帧）。但 vivo 每个请求都自带一个私有 tag：
           vivo.control.videoFrameRate = 30
       而 HAL 的 StreamBasedFPSTable 里明确有
           [1920 1080 30 60] / [1920 1080 60 60]
       （4K 虽然也有 [3840 2160 60 60]，但实测走不通）。
       所以 1080p60 的做法：把 vivo.control.videoFrameRate 改成 60，
       不动 aeTargetFpsRange，并让编码器 profile 也是 60。 */

    /* ===== 会话帧率 =====
       非 60 时钉回 [30,30]（4K 会取到 24 那档，导致录出 24fps）。
       60 时保持相机自己算出来的档位，帧率交给下面的 vendor tag。 */
    try {
        var JInt30 = Java.use('java.lang.Integer');
        var JRange30 = Java.use('android.util.Range');
        var SCC30 = Java.use('com.android.camera.setting.SettingCameraCharacteristicsManager');
        SCC30.getVideoFps.overload().implementation = function () {
            try {
                if (current === 'C' && Utils.isFlipOuterScreen() && !want60()) {
                    var n30 = JInt30.valueOf(30);
                    return JRange30.create(n30, n30);
                }
            } catch (e) {}
            return this.getVideoFps();
        };
        log('session fps hook installed (30 pinned unless 60)');
    } catch (e) {
        log('session fps pin err: ' + e);
    }

    /* ===== 60fps 的真正开关：vivo 私有 vendor tag =====
       set() 是热路径，只做一次字符串比较，命中才替换值。 */
    try {
        var JInt60 = Java.use('java.lang.Integer');
        var CBuilder = Java.use('android.hardware.camera2.CaptureRequest$Builder');
        var setOvs = CBuilder.set.overloads;
        for (var si = 0; si < setOvs.length; si++) {
            (function (ov) {
                ov.implementation = function (k, v) {
                    try {
                        if (vfVal === '60' && current === 'C'
                            && String(k.getName()) === 'vivo.control.videoFrameRate') {
                            v = JInt60.valueOf(60);
                            vfHits++;
                        }
                    } catch (e) {}
                    return ov.call(this, k, v);
                };
            })(setOvs[si]);
        }
        log('vivo videoFrameRate hook installed (' + setOvs.length + ' ov)');
    } catch (e) {
        log('videoFrameRate hook err: ' + e);
    }

    /* ===== 竖屏方向修正 =====
       实测：外屏竖屏时 display rotation=3(270°)，但相机窗口按 0° 排布 → 差 180°，界面倒。
       横屏时两者都是 0，正常。这里在竖屏(90/270)时给相机自己的方向补偿加 180°。 */
    try {
        var CUC = Java.use('com.android.camera.flipui.subui.CameraUIController_FlipSub');
        CUC.setOrientation.implementation = function (o) {
            try {
                if (pfVal !== '0' && (o === 90 || o === 270)) o = (o + 180) % 360;
            } catch (e) {}
            return this.setOrientation(o);
        };
        /* 满血相机走的是另一个 controller，同样需要 180° 补偿 */
        var CUF = Java.use('com.android.camera.flipui.CameraUIController_Flip');
        CUF.setOrientation.implementation = function (o) {
            try {
                if (pfVal !== '0' && (o === 90 || o === 270)) o = (o + 180) % 360;
            } catch (e) {}
            return this.setOrientation(o);
        };
        log('portrait orientation fix installed (FlipSub + Flip)');
    } catch (e) {
        log('portrait fix err: ' + e);
    }

    if (anotherInstanceAlive()) {
        try { console.log('[cammirror] another instance alive, skip'); } catch (e) {}
        return;
    }

    installMode(readMode());          /* 先装 hook —— 这是主线功能 */
    try {
        tuneVal = readTune();
        vqVal = readVq();
        vfVal = readVf();
        uwVal = readSimple(UW_FILE, ['0','1']);
        pfVal = readSimple(PF_FILE, ['0','1']);
        log('tune=' + tuneVal + ' vq=' + vqVal + ' vf=' + vfVal + ' uw=' + uwVal);
        applyTune();
    } catch (e) {
        log('tune err ' + e);
    }
    writeStat();

    setInterval(function () {
        try {
            ticks++;
            tuneVal = readTune();
            vqVal = readVq();
            vfVal = readVf();
            uwVal = readSimple(UW_FILE, ['0','1']);
                pfVal = readSimple(PF_FILE, ['0','1']);
                applyTune();
            var m = readMode();
            if (m !== current) installMode(m);
            writeStat();
        } catch (e) {
            try { console.log('[cammirror] poll err ' + e); } catch (e2) {}
        }
    }, 1000);
});
