// Organizer-site page: embeds the Kadenza iframe, runs every check, shows a table and a copyable line.
(function () {
	"use strict";
	var C = window.SPIKE_CONFIG, S = window.Spike;
	var KZ = C.kadenzaOrigin;
	var HOST = location.origin;

	var K = {
		results: "spike:host:results",
		runs: "spike:host:runs",
		lastIframeId: "spike:host:lastIframeId",
		helloRuns: "spike:host:helloRuns",
		knownSeed: "spike:host:knownSeed",
		handedToken: "spike:host:handedToken",
		session: "spike:host:session",
		popupPending: "spike:host:popupPending",
	};

	var ROWS = [
		["env", "-", "Browser (from user agent)"],
		["host.ls", "-", "Host page localStorage works"],
		["q1.reload", "Q1", "Iframe storage survives a reload"],
		["q1.newSession", "Q1", "Iframe storage survives closing the tab or app"],
		["q1.siteSession", "Q1", "Site session handed in by the popup survives a reload"],
		["q2.vsTop", "Q2", "Iframe storage is separate from Kadenza top level"],
		["q2.vsOtherSite", "Q2", "Iframe storage is separate from other organizer sites"],
		["q2.cookie", "Q2", "Iframe cookies (info): own write / top-level seed cookie"],
		["q2.bc", "Q2", "BroadcastChannel popup → iframe (info; arrives only if unpartitioned)"],
		["q3.iframeToHost", "Q3", "postMessage iframe → host"],
		["q3.hostToIframe", "Q3", "postMessage host → iframe → host"],
		["q4.host.open", "Q4", "Popup opens from a tap on the host page"],
		["q4.host.toOpener", "Q4", "That popup posts back to the host page"],
		["q4.host.topStorage", "Q4", "That popup reads Kadenza top-level storage"],
		["q4.host.toIframe", "Q4", "That popup posts to the iframe (opener.frames[0])"],
		["q4.iframe.open", "Q4", "Popup opens from a tap inside the iframe"],
		["q4.iframe.toIframe", "Q4", "That popup posts back to the iframe"],
		["q4.iframe.topStorage", "Q4", "That popup reads Kadenza top-level storage"],
		["q5.api", "Q5", "Storage Access API present; hasStorageAccess()"],
		["q5.request", "Q5", "requestStorageAccess() from a tap in the iframe"],
	];
	var HOST_JS = "host.3";
	var VALUE_MAX = 400;
	var CODE = { pass: "P", fail: "F", unsupported: "U", pending: "-", info: "I" };

	var env = S.env();
	var hostLsErr = S.lsError();
	var results = {};
	try { results = JSON.parse(S.lsGet(K.results) || "{}"); } catch (e) { results = {}; }
	var runs = Number(S.lsGet(K.runs) || 0) + 1;
	S.lsSet(K.runs, String(runs));
	var sameSession = S.ssGet(K.session) === "1";
	S.ssSet(K.session, "1");

	var iframe = null;
	var hello = null;
	var popupWin = null;
	var popupReported = false;
	// Set once this load has direct evidence that the iframe shares top-level localStorage; later checks never undo it.
	var q2Shared = null;

	function set(id, status, value) {
		results[id] = { s: status, v: value == null ? "" : String(value), r: runs };
		S.lsSet(K.results, JSON.stringify(results));
		render();
	}

	function render() {
		document.getElementById("results").innerHTML = ROWS.map(function (row) {
			var r = results[row[0]] || { s: "pending", v: "", r: "" };
			return "<tr><td>" + row[1] + "</td><td>" + S.esc(row[2]) + "</td><td class='st st-" + r.s + "'>" +
				r.s + "</td><td class=v>" + S.esc(r.v) + "</td><td>" + r.r + "</td></tr>";
		}).join("");
		document.getElementById("line").value = line();
	}

	function clean(v) {
		return String(v).replace(/[|;\n]/g, " ").slice(0, VALUE_MAX);
	}

	function line() {
		var parts = ["KZSPIKE " + C.version + " " + HOST_JS, clean(env.label), "runs=" + runs,
			"helloRuns=" + (S.lsGet(K.helloRuns) || 0)];
		ROWS.forEach(function (row) {
			if (row[0] === "env") return;
			var r = results[row[0]];
			parts.push(row[0] + "=" + (r ? CODE[r.s] + ":" + clean(r.v) : "-"));
		});
		parts.push("ua=" + navigator.userAgent);
		return parts.join(" | ");
	}

	function toIframe(msg) {
		if (!iframe || !iframe.contentWindow) return;
		msg.spike = 1;
		iframe.contentWindow.postMessage(msg, KZ);
	}

	function markShared(why) {
		q2Shared = why;
		set("q2.vsTop", "fail", "shared: " + why);
	}

	function evalQ2() {
		if (!hello || q2Shared) return;
		var known = S.lsGet(K.knownSeed);
		if (hello.lsErr) {
			set("q2.vsTop", "fail", "iframe localStorage unavailable: " + hello.lsErr);
		} else if (hello.seedSeen) {
			set("q2.vsTop", "fail", "shared: iframe sees top-level seed " + hello.seedSeen);
		} else if (known) {
			set("q2.vsTop", "pass", "partitioned: iframe sees no seed; top level has " + known);
		} else {
			set("q2.vsTop", "pending", "iframe sees no seed; seed on Kadenza first, or open the popup to confirm");
		}
	}

	function onHello(d) {
		hello = d;
		set("q3.iframeToHost", "pass", "hello received" + (d.ancestorOrigins ? "; ancestorOrigins=" + d.ancestorOrigins.join(",") : ""));
		toIframe({ type: "ping", t: Date.now() });

		// Q1: the iframe keeps a random id in its own localStorage; the host remembers the last one it saw.
		// Only loads that got a hello count: a load whose iframe failed (503, blocked) leaves nothing to compare.
		var helloRuns = Number(S.lsGet(K.helloRuns) || 0) + 1;
		S.lsSet(K.helloRuns, String(helloRuns));
		var prev = S.lsGet(K.lastIframeId);
		var q1 = sameSession ? "q1.reload" : "q1.newSession";
		if (d.lsErr) {
			set("q1.reload", "fail", "iframe localStorage unavailable: " + d.lsErr);
		} else if (!prev && !d.idCreated && d.visitsBefore > 0) {
			// The host has no record, but the iframe found its own id from an earlier load.
			set(q1, "pass", "iframe kept id " + d.iframeId + " (iframe visits before: " + d.visitsBefore + "; host had no earlier id)");
		} else if (!prev) {
			set("q1.reload", "pending", "first load that reached the iframe (page load " + runs + ", loads with a hello: " +
				helloRuns + "): reload the page");
		} else if (prev === d.iframeId) {
			set(q1, "pass", "same id " + d.iframeId + " (iframe visits before: " + d.visitsBefore + ")");
		} else {
			set(q1, "fail", "id changed " + prev + " → " + d.iframeId);
		}
		S.lsSet(K.lastIframeId, d.iframeId);

		var handed = S.lsGet(K.handedToken);
		if (handed) {
			set("q1.siteSession", d.siteSession === handed ? "pass" : "fail",
				d.siteSession === handed ? "kept " + handed : "expected " + handed + ", iframe has " + (d.siteSession || "none"));
		}

		evalQ2();
		var others = (d.embedders || []).filter(function (o) { return o !== HOST; });
		if (others.length) {
			set("q2.vsOtherSite", "fail", "shared: iframe storage also saw " + others.join(","));
		} else if (C.hostOrigins.length < 2) {
			set("q2.vsOtherSite", "unsupported", "only one organizer origin configured");
		} else {
			set("q2.vsOtherSite", "pending", "only this site seen; pass if the other site was tested first in this browser");
		}
		set("q2.cookie", "info", "own cookie " + (d.cookie3p ? "kept" : "dropped") + "; seed cookie " + (d.seedCookie || "not visible"));
		if (!d.bcSupported) set("q2.bc", "unsupported", "no BroadcastChannel");

		var saa = d.saa || {};
		if (!saa.has && !saa.req) {
			set("q5.api", "unsupported", "no hasStorageAccess / requestStorageAccess");
		} else {
			set("q5.api", "pass", "has=" + saa.has + " req=" + saa.req + " reqFor=" + saa.reqFor + " hasStorageAccess()=" + saa.hasResult);
		}
	}

	function onPopupReport(d, where) {
		// where: "host" (popup → host page) or "iframe" (popup opened by the iframe, forwarded)
		if (d.seed) S.lsSet(K.knownSeed, d.seed);
		set("q4." + where + ".topStorage", d.seed ? "pass" : "fail",
			d.seed ? "top-level seed " + d.seed : "popup sees no seed: seed on the Kadenza page first");
		if (hello && d.topIframeId && d.topIframeId === hello.iframeId) {
			markShared("top level holds the iframe's id " + d.topIframeId);
		} else if (d.seedNow) {
			// The popup wrote or read the seed at top level; the iframe now reads it from its own localStorage.
			markShared("iframe reads the top-level seed " + d.seedNow + " after the popup");
		} else {
			evalQ2();
		}
	}

	window.addEventListener("message", function (e) {
		var d = e.data;
		if (e.origin !== KZ || !d || d.spike !== 1) return;
		var fromIframe = iframe && e.source === iframe.contentWindow;
		if (d.type === "popup-report" && !fromIframe) {
			popupReported = true;
			S.ssDel(K.popupPending);
			set("q4.host.toOpener", "pass", "received" + (e.source === popupWin ? "" : " (source is not the window.open handle)"));
			onPopupReport(d, "host");
			return;
		}
		if (!fromIframe) return;
		if (d.type === "hello") onHello(d);
		else if (d.type === "pong") set("q3.hostToIframe", "pass", "round trip " + (Date.now() - d.t) + " ms");
		else if (d.type === "bc") {
			set("q2.bc", "info", "delivered: BroadcastChannel NOT partitioned (" + JSON.stringify(d.data) + "); iframe localStorage seed now: " +
				(d.seedNow || "none"));
			if (d.seedNow) markShared("iframe reads the top-level seed " + d.seedNow + " after the popup");
		}
		else if (d.type === "cleared") set("host.ls", hostLsErr ? "fail" : "pass", "reset; iframe cleared " + d.n + " keys");
		else if (d.type === "popup-to-iframe") {
			if (d.stored) S.lsSet(K.handedToken, d.token);
			set("q4.host.toIframe", "pass", "iframe got token " + d.token + ", stored=" + d.stored);
			if (d.stored) set("q1.siteSession", "pending", "token handed in; reload the page to check it is kept");
		} else if (d.type === "iframe-popup") onIframePopup(d);
		else if (d.type === "saa") onSaa(d);
	});

	function onIframePopup(d) {
		if (d.stage === "open") {
			set("q4.iframe.open", d.ok ? "pass" : "fail", d.ok ? "window returned" : d.why);
			if (d.ok) set("q4.iframe.toIframe", "pending", "waiting for the popup");
		} else if (d.stage === "report") {
			if (d.stored) S.lsSet(K.handedToken, d.token);
			set("q4.iframe.toIframe", "pass", "opener=" + d.openerPresent + "; token " + d.token + " stored=" + d.stored);
			if (d.stored) set("q1.siteSession", "pending", "token handed in; reload the page to check it is kept");
			onPopupReport(d, "iframe");
		} else if (d.stage === "lost") {
			set("q4.iframe.toIframe", "fail", d.why);
		}
	}

	function onSaa(d) {
		if (!d.supported) return set("q5.request", "unsupported", "no requestStorageAccess");
		if (!d.granted) return set("q5.request", "fail", "rejected: " + d.err);
		var seen = d.seedViaHandle || d.seedViaWindow;
		set("q5.request", seen ? "pass" : "fail",
			"granted; handle.localStorage=" + d.handle + " seedViaHandle=" + (d.seedViaHandle || "none") +
			" seedViaWindow=" + (d.seedViaWindow || "none") + " seedCookie=" + (d.seedCookie || "none") +
			" hasStorageAccess()=" + d.hasNow);
	}

	document.getElementById("popup").onclick = function () {
		popupReported = false;
		var url = KZ + "/popup.html?from=host&host=" + encodeURIComponent(HOST) + "&nonce=" + S.rand();
		S.ssSet(K.popupPending, String(Date.now()));
		var w = null;
		try {
			w = window.open(url, "kzspike_popup", "popup,width=420,height=640");
		} catch (err) {
			S.ssDel(K.popupPending);
			return set("q4.host.open", "fail", "threw " + err);
		}
		if (!w) {
			S.ssDel(K.popupPending);
			return set("q4.host.open", "fail", "window.open returned null");
		}
		popupWin = w;
		set("q4.host.open", "pass", "window returned");
		set("q4.host.toOpener", "pending", "waiting for the popup");
		var started = Date.now();
		var timer = setInterval(function () {
			var closed;
			try { closed = w.closed; } catch (err) { closed = "unknown"; }
			if (popupReported) {
				if (closed === true) clearInterval(timer);
				return;
			}
			if (closed === true || Date.now() - started > 30000) {
				clearInterval(timer);
				S.ssDel(K.popupPending);
				set("q4.host.toOpener", "fail", closed === true ? "popup closed without a message" : "no message in 30 s");
			}
		}, 500);
	};

	document.getElementById("reload").onclick = function () { location.reload(); };

	document.getElementById("copy").onclick = function () {
		var text = line();
		var ta = document.getElementById("line");
		var st = document.getElementById("copyStatus");
		ta.value = text;
		function fallback() {
			ta.focus();
			ta.select();
			ta.setSelectionRange(0, text.length);
			var ok = false;
			try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
			st.textContent = ok ? "Copied." : "Copy blocked: the text is selected above; copy it by hand.";
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(function () { st.textContent = "Copied."; }, fallback);
		} else {
			fallback();
		}
	};

	document.getElementById("reset").onclick = function () {
		toIframe({ type: "clear" });
		Object.keys(K).forEach(function (k) { try { localStorage.removeItem(K[k]); } catch (e) { /* ignore */ } });
		S.ssDel(K.session);
		results = {};
		runs = 0;
		render();
	};

	// Start.
	document.getElementById("env").textContent = env.label + " · run " + runs + (sameSession ? " (reload)" : " (new tab or session)");
	document.getElementById("ua").textContent = navigator.userAgent;
	set("env", "info", env.label);
	set("host.ls", hostLsErr ? "fail" : "pass", hostLsErr || "ok");

	if (S.ssGet(K.popupPending)) {
		S.ssDel(K.popupPending);
		set("q4.host.toOpener", "fail", "page was reloaded or replaced while the popup was pending (popup opened in this tab?)");
	}

	if (C.hostOrigins.indexOf(HOST) < 0) {
		document.getElementById("frameBox").textContent = "This origin (" + HOST + ") is not in config.js hostOrigins.";
		render();
		return;
	}

	iframe = document.createElement("iframe");
	iframe.className = "kz";
	iframe.title = "Kadenza";
	iframe.src = KZ + "/iframe.html?host=" + encodeURIComponent(HOST) + "&run=" + runs;
	document.getElementById("frameBox").appendChild(iframe);
	setTimeout(function () {
		if (!hello) set("q3.iframeToHost", "fail", "no hello in 10 s (iframe blocked, not loaded, or storage threw)");
	}, 10000);
	render();
})();
