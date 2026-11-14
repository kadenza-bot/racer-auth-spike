// Helpers shared by the host and Kadenza pages. No dependencies.
(function () {
	"use strict";

	function m(ua, re) {
		var r = re.exec(ua);
		return r ? r[1] : null;
	}

	// Best effort from the user agent; the raw UA is always reported too.
	function detect(ua, touchPoints) {
		var os = "other";
		var osVer = null;
		if (/Android/.test(ua)) {
			os = "Android";
			osVer = m(ua, /Android (\d+(?:\.\d+)?)/);
		} else if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) {
			os = "iOS";
			osVer = (m(ua, /OS (\d+[_.]\d+)/) || m(ua, /Version\/(\d+(?:\.\d+)?)/) || "").replace("_", ".") || null;
		} else if (/Macintosh|Mac OS X/.test(ua)) {
			os = "macOS";
		} else if (/Windows/.test(ua)) {
			os = "Windows";
		} else if (/Linux|CrOS/.test(ua)) {
			os = "Linux";
		}

		var inApp = null;
		if (/Instagram/.test(ua)) inApp = "Instagram";
		else if (/MessengerForiOS|Orca-Android|MessengerLite|FBAN\/Messenger/.test(ua)) inApp = "Messenger";
		else if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/.test(ua)) inApp = "Facebook";
		else if (/Barcelona/.test(ua)) inApp = "Threads";
		else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) inApp = "TikTok";
		else if (/ Line\//.test(ua)) inApp = "LINE";
		else if (/GSA\//.test(ua)) inApp = "GoogleApp";

		var browser = "unknown";
		var ver = null;
		var v;
		if ((v = m(ua, /SamsungBrowser\/(\d+(?:\.\d+)?)/))) { browser = "Samsung Internet"; ver = v; }
		else if ((v = m(ua, /(?:EdgiOS|EdgA|Edg)\/(\d+)/))) { browser = "Edge"; ver = v; }
		else if ((v = m(ua, /FxiOS\/(\d+)/))) { browser = "Firefox iOS"; ver = v; }
		else if ((v = m(ua, /Firefox\/(\d+)/))) { browser = "Firefox"; ver = v; }
		else if ((v = m(ua, /CriOS\/(\d+)/))) { browser = "Chrome iOS"; ver = v; }
		else if ((v = m(ua, /OPR\/(\d+)/))) { browser = "Opera"; ver = v; }
		else if (os === "Android" && /; wv\)/.test(ua)) { browser = "Android WebView"; ver = m(ua, /Chrome\/(\d+)/); }
		else if ((v = m(ua, /Chrome\/(\d+)/))) { browser = "Chrome"; ver = v; }
		else if ((v = m(ua, /Version\/(\d+(?:\.\d+)?).*Safari/))) { browser = "Safari"; ver = v; }
		else if (os === "iOS") { browser = "WKWebView"; }

		var engine = os === "iOS" ? "WebKit"
			: /Firefox/.test(browser) ? "Gecko"
			: browser === "Safari" ? "WebKit"
			: /Chrome|Edge|Opera|Samsung|WebView/.test(browser) ? "Blink"
			: "?";

		var label = (inApp ? inApp + " in-app / " : "") + browser + (ver ? " " + ver : "") +
			" / " + os + (osVer ? " " + osVer : "") + " / " + engine;
		return { os: os, osVer: osVer, inApp: inApp, browser: browser, ver: ver, engine: engine, label: label };
	}

	function rand() {
		return Math.random().toString(36).slice(2, 10);
	}

	function lsGet(k) {
		try { return window.localStorage.getItem(k); } catch (e) { return null; }
	}

	function lsSet(k, v) {
		try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; }
	}

	// Returns null when localStorage works, else the error text.
	function lsError() {
		try {
			window.localStorage.setItem("spike:probe", "1");
			var ok = window.localStorage.getItem("spike:probe") === "1";
			window.localStorage.removeItem("spike:probe");
			return ok ? null : "write did not read back";
		} catch (e) {
			return String(e && e.name ? e.name + ": " + e.message : e);
		}
	}

	function ssGet(k) {
		try { return window.sessionStorage.getItem(k); } catch (e) { return null; }
	}

	function ssSet(k, v) {
		try { window.sessionStorage.setItem(k, v); } catch (e) { /* reported elsewhere */ }
	}

	function ssDel(k) {
		try { window.sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
	}

	function cookie(name) {
		var r = new RegExp("(?:^|; )" + name + "=([^;]*)").exec(document.cookie || "");
		return r ? decodeURIComponent(r[1]) : null;
	}

	function spikeKeys() {
		var out = {};
		try {
			for (var i = 0; i < localStorage.length; i++) {
				var k = localStorage.key(i);
				if (k && k.indexOf("spike:") === 0) out[k] = localStorage.getItem(k);
			}
		} catch (e) { out.error = String(e); }
		return out;
	}

	function clearSpike() {
		var keys = Object.keys(spikeKeys());
		keys.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
		document.cookie = "spike_seed=; Path=/; Max-Age=0; SameSite=None; Secure";
		return keys.length;
	}

	// Storage Access API surface, without prompting.
	function saaProbe() {
		var info = {
			has: typeof document.hasStorageAccess === "function",
			req: typeof document.requestStorageAccess === "function",
			reqFor: typeof document.requestStorageAccessFor === "function",
		};
		if (!info.has) return Promise.resolve(info);
		return document.hasStorageAccess().then(
			function (r) { info.hasResult = r; return info; },
			function (e) { info.hasResult = "error " + e; return info; }
		);
	}

	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
		});
	}

	window.Spike = {
		detect: detect,
		rand: rand,
		lsGet: lsGet,
		lsSet: lsSet,
		lsError: lsError,
		ssGet: ssGet,
		ssSet: ssSet,
		ssDel: ssDel,
		cookie: cookie,
		spikeKeys: spikeKeys,
		clearSpike: clearSpike,
		saaProbe: saaProbe,
		esc: esc,
		env: function () { return detect(navigator.userAgent, navigator.maxTouchPoints || 0); },
	};
})();
