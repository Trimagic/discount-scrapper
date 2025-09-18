// ──────────────────────────────────────────────────────────────────────────────
// Стелс-патчи: локали, WebGL vendor/renderer, WebRTC hardening
// ──────────────────────────────────────────────────────────────────────────────

/** Синхронизация языков/Intl/navigator для консистентных локалей */
export async function spoofLocale(
  page,
  localeHeader = "pl-PL,pl;q=0.9,en;q=0.8"
) {
  const primary = (localeHeader.split(",")[0] || "pl-PL").trim();
  await page.evaluateOnNewDocument(
    (primaryLang, fullHeader) => {
      const langs = fullHeader
        .split(",")
        .map((l) => l.split(";")[0].trim())
        .filter(Boolean);

      Object.defineProperty(navigator, "language", { get: () => primaryLang });
      Object.defineProperty(navigator, "languages", { get: () => langs });

      const origDTF = Intl.DateTimeFormat;
      // @ts-ignore
      Intl.DateTimeFormat = function (locale, options) {
        const l = locale || primaryLang;
        return new origDTF(l, options);
      };
      Intl.DateTimeFormat.prototype = origDTF.prototype;
    },
    primary,
    localeHeader
  );
}

/** Жёсткий патч WebGL: UNMASKED_VENDOR/RENDERER на WebGL1/2 */
export async function patchWebGLStrict(page, vendor, renderer) {
  await page.evaluateOnNewDocument(
    (v, r) => {
      const overrideGetParameter = (proto) => {
        if (!proto || !proto.getParameter) return;
        const orig = proto.getParameter;
        Object.defineProperty(proto, "getParameter", {
          value: function (p) {
            if (p === 0x9245) return v; // UNMASKED_VENDOR_WEBGL
            if (p === 0x9246) return r; // UNMASKED_RENDERER_WEBGL
            return orig.call(this, p);
          },
        });
      };
      const overrideGetExtension = (proto) => {
        if (!proto || !proto.getExtension) return;
        const orig = proto.getExtension;
        Object.defineProperty(proto, "getExtension", {
          value: function (name) {
            const ext = orig.call(this, name);
            if (name === "WEBGL_debug_renderer_info" && ext) {
              const fake = Object.create(ext);
              Object.defineProperty(fake, "UNMASKED_VENDOR_WEBGL", {
                value: 0x9245,
              });
              Object.defineProperty(fake, "UNMASKED_RENDERER_WEBGL", {
                value: 0x9246,
              });
              return fake;
            }
            return ext;
          },
        });
      };
      overrideGetParameter(WebGLRenderingContext?.prototype);
      overrideGetParameter(WebGL2RenderingContext?.prototype);
      overrideGetExtension(WebGLRenderingContext?.prototype);
      overrideGetExtension(WebGL2RenderingContext?.prototype);
    },
    vendor,
    renderer
  );
}

/** WebRTC hardening v2: SDP + icecandidate события + addEventListener */
export async function hardenWebRTC(page) {
  await page.evaluateOnNewDocument(() => {
    const stripHostMdnsFromSdp = (sdp) =>
      (sdp || "")
        .split("\r\n")
        .filter((l) => {
          const isHost = l.startsWith("a=candidate:") && / typ host /.test(l);
          const isMdns = /\.local/.test(l);
          return !(isHost || isMdns);
        })
        .join("\r\n");

    const sanitizeCandidateString = (candStr) => {
      if (!candStr) return candStr;
      if (/ typ host /.test(candStr)) return "";
      if (/\.local/.test(candStr)) return "";
      return candStr;
    };

    const sanitizeCandidateObj = (cand) => {
      try {
        if (!cand) return cand;
        if (typeof cand === "string") {
          const s = sanitizeCandidateString(cand);
          return s ? s : null;
        }
        if (cand.candidate) {
          const s = sanitizeCandidateString(cand.candidate);
          if (!s) return null;
          const clone = new RTCIceCandidate({
            candidate: s,
            sdpMid: cand.sdpMid,
            sdpMLineIndex: cand.sdpMLineIndex,
            usernameFragment: cand.usernameFragment,
          });
          return clone;
        }
      } catch {}
      return cand;
    };

    if (typeof window.RTCIceCandidate === "function") {
      const OrigIce = window.RTCIceCandidate;
      function WrappedIceCandidate(...args) {
        const inst = new OrigIce(...args);
        try {
          const raw = inst.candidate;
          const sanitized = sanitizeCandidateString(raw);
          Object.defineProperty(inst, "candidate", { get: () => sanitized });
        } catch {}
        return inst;
      }
      WrappedIceCandidate.prototype = OrigIce.prototype;
      window.RTCIceCandidate = WrappedIceCandidate;
    }

    const wrapPC = (PC) => {
      if (!PC) return PC;

      const desc = Object.getOwnPropertyDescriptor(
        PC.prototype,
        "onicecandidate"
      );
      Object.defineProperty(PC.prototype, "onicecandidate", {
        set(fn) {
          const wrapped = (ev) => {
            try {
              const c = sanitizeCandidateObj(ev?.candidate);
              if (!c) return;
              const e = new Event("icecandidate");
              Object.defineProperty(e, "candidate", { value: c });
              fn?.(e);
            } catch {
              fn?.(ev);
            }
          };
          return desc?.set?.call(this, wrapped);
        },
        get() {
          return desc?.get?.call(this);
        },
      });

      const _add = PC.prototype.addEventListener;
      PC.prototype.addEventListener = function (type, listener, options) {
        if (type === "icecandidate") {
          const wrapped = (ev) => {
            try {
              const c = sanitizeCandidateObj(ev?.candidate);
              if (!c) return;
              const e = new Event("icecandidate");
              Object.defineProperty(e, "candidate", { value: c });
              listener?.(e);
            } catch {
              listener?.(ev);
            }
          };
          return _add.call(this, type, wrapped, options);
        }
        return _add.call(this, type, listener, options);
      };

      const _setLocalDescription = PC.prototype.setLocalDescription;
      PC.prototype.setLocalDescription = async function (desc) {
        if (desc && desc.sdp) {
          const mod = new RTCSessionDescription({
            type: desc.type,
            sdp: stripHostMdnsFromSdp(desc.sdp),
          });
          return _setLocalDescription.call(this, mod);
        }
        return _setLocalDescription.call(this, desc);
      };

      const _localDesc = Object.getOwnPropertyDescriptor(
        PC.prototype,
        "localDescription"
      );
      if (_localDesc && _localDesc.get) {
        Object.defineProperty(PC.prototype, "localDescription", {
          get: function () {
            const d = _localDesc.get.call(this);
            if (d && d.sdp) {
              return new RTCSessionDescription({
                type: d.type,
                sdp: stripHostMdnsFromSdp(d.sdp),
              });
            }
            return d;
          },
        });
      }

      const _addIceCandidate = PC.prototype.addIceCandidate;
      PC.prototype.addIceCandidate = function (candidate) {
        const filtered = sanitizeCandidateObj(candidate);
        if (!filtered) return Promise.resolve();
        return _addIceCandidate.call(this, filtered);
      };

      const _getStats = PC.prototype.getStats;
      PC.prototype.getStats = async function (...a) {
        const report = await _getStats.apply(this, a);
        const map = new Map();
        report.forEach((v, k) => {
          try {
            if (
              v.type === "local-candidate" ||
              v.type === "remote-candidate" ||
              v.type === "candidate-pair"
            ) {
              if (v.candidateType === "host") return;
              if (typeof v.ip === "string" && /\.local$/.test(v.ip)) return;
            }
          } catch {}
          map.set(k, v);
        });

        return {
          forEach: (cb) => map.forEach(cb),
          get: (k) => map.get(k),
          has: (k) => map.has(k),
          keys: () => map.keys(),
          values: () => map.values(),
          entries: () => map.entries(),
          [Symbol.iterator]: function* () {
            yield* map[Symbol.iterator]();
          },
        };
      };

      return PC;
    };

    const Orig = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!Orig) return;
    const Wrapped = function (...args) {
      const pc = new Orig(...args);
      return pc;
    };
    Wrapped.prototype = Orig.prototype;
    window.RTCPeerConnection = wrapPC(Wrapped);
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
  });
}
