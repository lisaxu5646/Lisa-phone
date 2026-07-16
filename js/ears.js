// EARS：只在当前设备上提取声学轮廓。没有录音文件、没有情绪诊断。
(function () {
  "use strict";

  const STORE_KEY = "lisa_ears_profile_v1";
  const BASELINE_TARGET = 8;
  const MAX_SAMPLES = 40;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const median = values => {
    const a = (values || []).filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const mad = values => {
    const m = median(values);
    return m == null ? null : median(values.map(v => Math.abs(v - m)));
  };
  const storageKey = ownerKey => STORE_KEY + ":" + String(ownerKey || "default").replace(/[^\w\-\u4e00-\u9fff]/g, "_").slice(0, 60);
  const readProfile = ownerKey => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey(ownerKey)) || "null");
      return v && Array.isArray(v.samples) ? v : { version: 1, samples: [] };
    } catch (_) { return { version: 1, samples: [] }; }
  };
  const writeProfile = (p, ownerKey) => {
    try { localStorage.setItem(storageKey(ownerKey), JSON.stringify(p)); } catch (_) {}
  };
  const profileInfo = ownerKey => {
    const p = readProfile(ownerKey);
    return { count: p.samples.length, ready: p.samples.length >= BASELINE_TARGET, target: BASELINE_TARGET };
  };
  const resetProfile = ownerKey => { localStorage.removeItem(storageKey(ownerKey)); return profileInfo(ownerKey); };
  const forgetLast = ownerKey => {
    const p = readProfile(ownerKey);
    p.samples.pop();
    writeProfile(p, ownerKey);
    return profileInfo(ownerKey);
  };

  // 简单自相关：只取人声常见音高范围；无稳定基频时返回 null。
  function estimatePitch(buf, sampleRate) {
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.012) return null;
    const minLag = Math.floor(sampleRate / 420);
    const maxLag = Math.min(Math.floor(sampleRate / 70), buf.length - 1);
    let bestLag = 0, best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0, a = 0, b = 0;
      for (let i = 0; i < buf.length - lag; i += 2) {
        const x = buf[i], y = buf[i + lag];
        sum += x * y; a += x * x; b += y * y;
      }
      const corr = sum / Math.sqrt(a * b || 1);
      if (corr > best) { best = corr; bestLag = lag; }
    }
    return best > 0.55 && bestLag ? sampleRate / bestLag : null;
  }

  function summarize(frames, duration) {
    const rms = frames.map(x => x.rms);
    const pitches = frames.map(x => x.pitch).filter(Number.isFinite);
    const active = frames.filter(x => x.rms >= 0.018);
    let starts = 0;
    for (let i = 1; i < frames.length; i++) if (frames[i].rms >= 0.018 && frames[i - 1].rms < 0.018) starts++;
    const pitchMed = median(pitches);
    const pitchSpread = pitchMed && pitches.length > 2 ? (mad(pitches) || 0) / pitchMed : 0;
    return {
      duration: Math.round(duration * 10) / 10,
      volume: median(active.map(x => x.rms)) || median(rms) || 0,
      pitch: pitchMed || 0,
      pitchSpread,
      pauseRatio: frames.length ? 1 - active.length / frames.length : 1,
      pace: duration > 0 ? starts / duration : 0
    };
  }

  function compareToBaseline(features, samples) {
    const rules = [
      ["volume", "声音比平时更有力", "声音比平时更轻"],
      ["pitch", "音高比平时偏高", "音高比平时偏低"],
      ["pitchSpread", "语调起伏比平时更多", "语调比平时更平稳"],
      ["pauseRatio", "停顿比平时更多", "停顿比平时更少"],
      ["pace", "说话节奏比平时更快", "说话节奏比平时更慢"]
    ];
    const out = [];
    rules.forEach(([key, high, low]) => {
      const vals = samples.map(s => s[key]).filter(Number.isFinite);
      const mid = median(vals), spread = mad(vals);
      if (mid == null || !Number.isFinite(features[key])) return;
      const floor = Math.max(Math.abs(mid) * 0.12, 0.00001);
      const threshold = Math.max((spread || 0) * 2.5, floor);
      if (features[key] > mid + threshold) out.push(high);
      else if (features[key] < mid - threshold) out.push(low);
    });
    return out.slice(0, 3);
  }

  async function start(opts) {
    opts = opts || {};
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !AudioCtx) {
      throw new Error("这个浏览器暂时不能读取麦克风声学信息");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    const ctx = new AudioCtx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const frames = [];
    const startedAt = performance.now();
    let stopped = false, timer = null, finalText = "", interimText = "", recognition = null;

    const sample = () => {
      if (stopped) return;
      analyser.getFloatTimeDomainData(buf);
      let sq = 0;
      for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i];
      const rms = Math.sqrt(sq / buf.length);
      frames.push({ rms, pitch: estimatePitch(buf, ctx.sampleRate) });
      opts.onLevel && opts.onLevel(Math.min(1, rms * 12));
      timer = setTimeout(sample, 100);
    };
    sample();

    if (SpeechRecognition) {
      try {
        recognition = new SpeechRecognition();
        recognition.lang = opts.lang || "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = e => {
          interimText = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = e.results[i][0].transcript;
            if (e.results[i].isFinal) finalText += text;
            else interimText += text;
          }
          opts.onTranscript && opts.onTranscript((finalText + interimText).trim());
        };
        recognition.onerror = e => opts.onSpeechError && opts.onSpeechError(e.error || "unavailable");
        recognition.start();
      } catch (_) { recognition = null; }
    } else opts.onSpeechError && opts.onSpeechError("unsupported");

    const cleanup = async () => {
      clearTimeout(timer);
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
      }
      try { recognition && recognition.stop(); } catch (_) {}
      stream.getTracks().forEach(t => t.stop());
      try { source.disconnect(); analyser.disconnect(); await ctx.close(); } catch (_) {}
    };
    return {
      async cancel() {
        if (stopped) return;
        stopped = true;
        await cleanup();
      },
      async stop() {
        if (stopped) return null;
        stopped = true;
        await cleanup();
        const duration = (performance.now() - startedAt) / 1000;
        if (duration < 0.5) throw new Error("太短啦，至少说半秒钟");
        const features = summarize(frames, duration);
        const p = readProfile(opts.ownerKey);
        const baselineReady = p.samples.length >= BASELINE_TARGET;
        const observations = baselineReady ? compareToBaseline(features, p.samples) : [];
        // 只留数字轮廓；不留声音、不留逐字稿。极端短/几乎全静音的样本不进基线。
        const valid = features.duration >= 0.8 && features.pauseRatio < 0.92 && features.volume > 0.004;
        if (valid) {
          p.samples.push(features);
          p.samples = p.samples.slice(-MAX_SAMPLES);
          writeProfile(p, opts.ownerKey);
        }
        return {
          transcript: (finalText + interimText).trim(),
          duration: features.duration,
          valid,
          tone: {
            version: 1,
            observations,
            baselineReady,
            baselineCount: p.samples.length,
            deviceLocal: true
          }
        };
      }
    };
  }

  window.Ears = {
    start, profileInfo, resetProfile, forgetLast,
    _test: { median, mad, summarize, compareToBaseline }
  };
})();
