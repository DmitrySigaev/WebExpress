/****************************************************************************
 * Copyright (C) 2009-2015. EPAM Systems.
 *
 * This file may be distributed and/or modified under the terms of the
 * GNU Affero General Public License version 3 as published by the Free
 * Software Foundation and appearing in the file LICENSE included in
 * the packaging of this file.
 *
 * This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
 * WARRANTY OF DESIGN, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
 ***************************************************************************/

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ketcher = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 1.1.20150716
 *
 * By Eli Grey, http://eligrey.com
 * License: X11/MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */

/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs || (function(view) {
	"use strict";
	// IE <10 is explicitly unsupported
	if (typeof navigator !== "undefined" && /MSIE [1-9]\./.test(navigator.userAgent)) {
		return;
	}
	var
		  doc = view.document
		  // only get URL when necessary in case Blob.js hasn't overridden it yet
		, get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link = "download" in save_link
		, click = function(node) {
			var event = new MouseEvent("click");
			node.dispatchEvent(event);
		}
		, webkit_req_fs = view.webkitRequestFileSystem
		, req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
		, throw_outside = function(ex) {
			(view.setImmediate || view.setTimeout)(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		, fs_min_size = 0
		// See https://code.google.com/p/chromium/issues/detail?id=375297#c7 and
		// https://github.com/eligrey/FileSaver.js/commit/485930a#commitcomment-8768047
		// for the reasoning behind the timeout and revocation flow
		, arbitrary_revoke_timeout = 500 // in ms
		, revoke = function(file) {
			var revoker = function() {
				if (typeof file === "string") { // file is an object URL
					get_URL().revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			};
			if (view.chrome) {
				revoker();
			} else {
				setTimeout(revoker, arbitrary_revoke_timeout);
			}
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		, auto_bom = function(blob) {
			// prepend BOM for UTF-8 XML and text/* types (including HTML)
			if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
				return new Blob(["\ufeff", blob], {type: blob.type});
			}
			return blob;
		}
		, FileSaver = function(blob, name, no_auto_bom) {
			if (!no_auto_bom) {
				blob = auto_bom(blob);
			}
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, blob_changed = false
				, object_url
				, target_view
				, dispatch_all = function() {
					dispatch(filesaver, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					// don't create more object URLs than needed
					if (blob_changed || !object_url) {
						object_url = get_URL().createObjectURL(blob);
					}
					if (target_view) {
						target_view.location.href = object_url;
					} else {
						var new_tab = view.open(object_url, "_blank");
						if (new_tab == undefined && typeof safari !== "undefined") {
							//Apple do not allow window.open, see http://bit.ly/1kZffRI
							view.location.href = object_url
						}
					}
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
					revoke(object_url);
				}
				, abortable = function(func) {
					return function() {
						if (filesaver.readyState !== filesaver.DONE) {
							return func.apply(this, arguments);
						}
					};
				}
				, create_if_not_found = {create: true, exclusive: false}
				, slice
			;
			filesaver.readyState = filesaver.INIT;
			if (!name) {
				name = "download";
			}
			if (can_use_save_link) {
				object_url = get_URL().createObjectURL(blob);
				save_link.href = object_url;
				save_link.download = name;
				setTimeout(function() {
					click(save_link);
					dispatch_all();
					revoke(object_url);
					filesaver.readyState = filesaver.DONE;
				});
				return;
			}
			// Object and web filesystem URLs have a problem saving in Google Chrome when
			// viewed in a tab, so I force save with application/octet-stream
			// http://code.google.com/p/chromium/issues/detail?id=91158
			// Update: Google errantly closed 91158, I submitted it again:
			// https://code.google.com/p/chromium/issues/detail?id=389642
			if (view.chrome && type && type !== force_saveable_type) {
				slice = blob.slice || blob.webkitSlice;
				blob = slice.call(blob, 0, blob.size, force_saveable_type);
				blob_changed = true;
			}
			// Since I can't be sure that the guessed media type will trigger a download
			// in WebKit, I append .download to the filename.
			// https://bugs.webkit.org/show_bug.cgi?id=65440
			if (webkit_req_fs && name !== "download") {
				name += ".download";
			}
			if (type === force_saveable_type || webkit_req_fs) {
				target_view = view;
			}
			if (!req_fs) {
				fs_error();
				return;
			}
			fs_min_size += blob.size;
			req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
				fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
					var save = function() {
						dir.getFile(name, create_if_not_found, abortable(function(file) {
							file.createWriter(abortable(function(writer) {
								writer.onwriteend = function(event) {
									target_view.location.href = file.toURL();
									filesaver.readyState = filesaver.DONE;
									dispatch(filesaver, "writeend", event);
									revoke(file);
								};
								writer.onerror = function() {
									var error = writer.error;
									if (error.code !== error.ABORT_ERR) {
										fs_error();
									}
								};
								"writestart progress write abort".split(" ").forEach(function(event) {
									writer["on" + event] = filesaver["on" + event];
								});
								writer.write(blob);
								filesaver.abort = function() {
									writer.abort();
									filesaver.readyState = filesaver.DONE;
								};
								filesaver.readyState = filesaver.WRITING;
							}), fs_error);
						}), fs_error);
					};
					dir.getFile(name, {create: false}, abortable(function(file) {
						// delete file if it already exists
						file.remove();
						save();
					}), abortable(function(ex) {
						if (ex.code === ex.NOT_FOUND_ERR) {
							save();
						} else {
							fs_error();
						}
					}));
				}), fs_error);
			}), fs_error);
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name, no_auto_bom) {
			return new FileSaver(blob, name, no_auto_bom);
		}
	;
	// IE 10+ (native saveAs)
	if (typeof navigator !== "undefined" && navigator.msSaveOrOpenBlob) {
		return function(blob, name, no_auto_bom) {
			if (!no_auto_bom) {
				blob = auto_bom(blob);
			}
			return navigator.msSaveOrOpenBlob(blob, name || "download");
		};
	}

	FS_proto.abort = function() {
		var filesaver = this;
		filesaver.readyState = filesaver.DONE;
		dispatch(filesaver, "abort");
	};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	return saveAs;
}(
	   typeof self !== "undefined" && self
	|| typeof window !== "undefined" && window
	|| this.content
));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window

if (typeof module !== "undefined" && module.exports) {
  module.exports.saveAs = saveAs;
} else if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
  define([], function() {
    return saveAs;
  });
}

},{}],2:[function(require,module,exports){
// keymage.js - Javascript keyboard event handling
// http://github.com/piranha/keymage
//
// (c) 2012 Alexander Solovyov
// under terms of ISC License

(function(define, undefined) {
define(function() {
    var VERSION = '1.1.2';
    var isOsx = typeof navigator !== 'undefined' &&
        ~navigator.userAgent.indexOf('Mac OS X');

    // Defining all keys
    var MODPROPS = ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'];
    var MODS = {
        'shift': 'shift',
        'ctrl': 'ctrl', 'control': 'ctrl',
        'alt': 'alt', 'option': 'alt',
        'win': 'meta', 'cmd': 'meta', 'super': 'meta',
                          'meta': 'meta',
        // default modifier for os x is cmd and for others is ctrl
        'defmod':  isOsx ? 'meta' : 'ctrl'
        };
    var MODORDER = ['shift', 'ctrl', 'alt', 'meta'];
    var MODNUMS = [16, 17, 18, 91];

    var KEYS = {
        'backspace': 8,
        'tab': 9,
        'enter': 13, 'return': 13,
        'pause': 19,
        'caps': 20, 'capslock': 20,
        'escape': 27, 'esc': 27,
        'space': 32,
        'pgup': 33, 'pageup': 33,
        'pgdown': 34, 'pagedown': 34,
        'end': 35,
        'home': 36,
        'ins': 45, 'insert': 45,
        'del': 46, 'delete': 46,

        'left': 37,
        'up': 38,
        'right': 39,
        'down': 40,

        '*': 106,
        '+': 107, 'plus': 107,
        'minus': 109,
        ';': 186,
        '=': 187,
        ',': 188,
        '-': 189,
        '.': 190,
        '/': 191,
        '`': 192,
        '[': 219,
        '\\': 220,
        ']': 221,
        "'": 222
    };

    var i;
    // numpad
    for (i = 0; i < 10; i++) {
        KEYS['num-' + i] = i + 95;
    }
    // top row 0-9
    for (i = 0; i < 10; i++) {
        KEYS[i.toString()] = i + 48;
    }
    // f1-f24
    for (i = 1; i < 25; i++) {
        KEYS['f' + i] = i + 111;
    }
    // alphabet
    for (i = 65; i < 91; i++) {
        KEYS[String.fromCharCode(i).toLowerCase()] = i;
    }

    // Reverse key codes
    var KEYREV = {};
    for (var k in KEYS) {
        var val = KEYS[k];
        if (!KEYREV[val] || KEYREV[val].length < k.length) {
            KEYREV[val] = k;
        }
    }

    // -----------------------
    // Actual work is done here

    var currentScope = '';
    var allChains = {};

    function parseKeyString(keystring) {
        var bits = keystring.split(/-(?!$)/);
        var button = bits[bits.length - 1];
        var key = {code: KEYS[button]};

        if (!key.code) {
            throw 'Unknown key "' + button + '" in keystring "' +
                keystring + '"';
        }

        var mod;
        for (var i = 0; i < bits.length - 1; i++) {
            button = bits[i];
            mod = MODS[button];
            if (!mod) {
                    throw 'Unknown modifier "' + button + '" in keystring "' +
                        keystring + '"';
            }
            key[mod] = true;
        }

        return key;
    }

    function stringifyKey(key) {
        var s = '';
        for (var i = 0; i < MODORDER.length; i++) {
            if (key[MODORDER[i]]) {
                s += MODORDER[i] + '-';
            }
        }
        s += KEYREV[key.code];
        return s;
    }

    function normalizeKeyChain(keychainString) {
        var keychain = [];
        var keys = keychainString.split(' ');

        for (var i = 0; i < keys.length; i++) {
            var key = parseKeyString(keys[i]);
            key = stringifyKey(key);
            keychain.push(key);
        }

        keychain.original = keychainString;
        return keychain;
    }

    function eventKeyString(e) {
        var key = {code: e.keyCode};
        for (var i = 0; i < MODPROPS.length; i++) {
            var mod = MODPROPS[i];
            if (e[mod]) {
                key[mod.slice(0, mod.length - 3)] = true;
            }
        }
        return stringifyKey(key);
    }

    function getNestedChains(chains, scope) {
        for (var i = 0; i < scope.length; i++) {
            var bit = scope[i];

            if (bit) {
                chains = chains[bit];
            }

            if (!chains) {
                break;
            }
        }
        return chains;
    }

    var sequence = [];
    function dispatch(e) {
        // Skip all modifiers
        if (~MODNUMS.indexOf(e.keyCode)) {
            return;
        }

        var seq = sequence.slice();
        seq.push(eventKeyString(e));
        var scope = currentScope.split('.');
        var matched, chains, key;

        for (var i = scope.length; i >= 0; i--) {
            chains = getNestedChains(allChains, scope.slice(0, i));
            if (!chains) {
                continue;
            }
            matched = true;
            for (var j = 0; j < seq.length; j++) {
                key = seq[j];
                if (!chains[key]) {
                    matched = false;
                    break;
                }
                chains = chains[key];
            }

            if (matched) {
                break;
            }
        }

        var definitionScope = scope.slice(0, i).join('.');
        var preventDefault = chains.preventDefault;

        // partial match, save the sequence
        if (matched && !chains.handlers) {
            sequence = seq;
            if (preventDefault) {
                e.preventDefault();
            }
            return;
        }

        if (matched) {
            for (i = 0; i < chains.handlers.length; i++) {
                var handler = chains.handlers[i];
                var options = handler._keymage;

                var res = handler.call(options.context, e, {
                    shortcut: options.original,
                    scope: currentScope,
                    definitionScope: definitionScope
                });

                if (res === false || preventDefault) {
                    e.preventDefault();
                }
            }
        }

        // either matched or not, drop the sequence
        sequence = [];
    }

    function getHandlers(scope, keychain, fn) {
        var bits = scope.split('.');
        var chains = allChains;
        bits = bits.concat(keychain);

        for (var i = 0, l = bits.length; i < l; i++) {
            var bit = bits[i];
            if (!bit) continue;

            chains = chains[bit] || (chains[bit] = {});
            if (fn && fn._keymage.preventDefault) {
                chains.preventDefault = true;
            }

            if (i === l - 1) {
                var handlers = chains.handlers || (chains.handlers = []);
                return handlers;
            }
        }
    }

    function assignKey(scope, keychain, fn) {
        var handlers = getHandlers(scope, keychain, fn);
        handlers.push(fn);
    }

    function unassignKey(scope, keychain, fn) {
        var handlers = getHandlers(scope, keychain);
        var idx = handlers.indexOf(fn);
        if (~idx) {
            handlers.splice(idx, 1);
        }
    }

    function parsed(scope, keychain, fn, options) {
        if (keychain === undefined && fn === undefined) {
            return function(keychain, fn) {
                return keymage(scope, keychain, fn);
            };
        }

        if (typeof keychain === 'function') {
            options = fn;
            fn = keychain;
            keychain = scope;
            scope = '';
        }

        var normalized = normalizeKeyChain(keychain);

        return [scope, normalized, fn, options];
    }

    // optional arguments: scope, options.
    function keymage(scope, keychain, fn, options) {
        var args = parsed(scope, keychain, fn, options);
        fn = args[2];
        options = args[3];
        fn._keymage = options || {};
        fn._keymage.original = keychain;
        assignKey.apply(null, args);
    }

    keymage.unbind = function(scope, keychain, fn) {
        var args = parsed(scope, keychain, fn);
        unassignKey.apply(null, args);
    };

    keymage.parse = parseKeyString;
    keymage.stringify = stringifyKey;

    keymage.bindings = allChains;

    keymage.setScope = function(scope) {
        currentScope = scope ? scope : '';
    };

    keymage.getScope = function() { return currentScope; };

    keymage.pushScope = function(scope) {
        currentScope = (currentScope ? currentScope + '.' : '') + scope;
        return currentScope;
    };

    keymage.popScope = function(scope) {
        var i;

        if (!scope) {
            i = currentScope.lastIndexOf('.');
            scope = currentScope.slice(i + 1);
            currentScope = i == -1 ? '' : currentScope.slice(0, i);
            return scope;
        }

        currentScope = currentScope.replace(
            new RegExp('(^|\\.)' + scope + '(\\.|$).*'), '');
        return scope;
    };

    keymage.version = VERSION;

    window.addEventListener('keydown', dispatch, false);

    return keymage;
});
})(typeof define !== 'undefined' ? define : function(factory) {
    if (typeof module !== 'undefined') {
        module.exports = factory();
    } else {
        window.keymage = factory();
    }
});

},{}],3:[function(require,module,exports){
(function(root) {

	// Use polyfill for setImmediate for performance gains
	var asap = (typeof setImmediate === 'function' && setImmediate) ||
		function(fn) { setTimeout(fn, 1); };

	// Polyfill for Function.prototype.bind
	function bind(fn, thisArg) {
		return function() {
			fn.apply(thisArg, arguments);
		}
	}

	var isArray = Array.isArray || function(value) { return Object.prototype.toString.call(value) === "[object Array]" };

	function Promise(fn) {
		if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
		if (typeof fn !== 'function') throw new TypeError('not a function');
		this._state = null;
		this._value = null;
		this._deferreds = []

		doResolve(fn, bind(resolve, this), bind(reject, this))
	}

	function handle(deferred) {
		var me = this;
		if (this._state === null) {
			this._deferreds.push(deferred);
			return
		}
		asap(function() {
			var cb = me._state ? deferred.onFulfilled : deferred.onRejected
			if (cb === null) {
				(me._state ? deferred.resolve : deferred.reject)(me._value);
				return;
			}
			var ret;
			try {
				ret = cb(me._value);
			}
			catch (e) {
				deferred.reject(e);
				return;
			}
			deferred.resolve(ret);
		})
	}

	function resolve(newValue) {
		try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
			if (newValue === this) throw new TypeError('A promise cannot be resolved with itself.');
			if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
				var then = newValue.then;
				if (typeof then === 'function') {
					doResolve(bind(then, newValue), bind(resolve, this), bind(reject, this));
					return;
				}
			}
			this._state = true;
			this._value = newValue;
			finale.call(this);
		} catch (e) { reject.call(this, e); }
	}

	function reject(newValue) {
		this._state = false;
		this._value = newValue;
		finale.call(this);
	}

	function finale() {
		for (var i = 0, len = this._deferreds.length; i < len; i++) {
			handle.call(this, this._deferreds[i]);
		}
		this._deferreds = null;
	}

	function Handler(onFulfilled, onRejected, resolve, reject){
		this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
		this.onRejected = typeof onRejected === 'function' ? onRejected : null;
		this.resolve = resolve;
		this.reject = reject;
	}

	/**
	 * Take a potentially misbehaving resolver function and make sure
	 * onFulfilled and onRejected are only called once.
	 *
	 * Makes no guarantees about asynchrony.
	 */
	function doResolve(fn, onFulfilled, onRejected) {
		var done = false;
		try {
			fn(function (value) {
				if (done) return;
				done = true;
				onFulfilled(value);
			}, function (reason) {
				if (done) return;
				done = true;
				onRejected(reason);
			})
		} catch (ex) {
			if (done) return;
			done = true;
			onRejected(ex);
		}
	}

	Promise.prototype['catch'] = function (onRejected) {
		return this.then(null, onRejected);
	};

	Promise.prototype.then = function(onFulfilled, onRejected) {
		var me = this;
		return new Promise(function(resolve, reject) {
			handle.call(me, new Handler(onFulfilled, onRejected, resolve, reject));
		})
	};

	Promise.all = function () {
		var args = Array.prototype.slice.call(arguments.length === 1 && isArray(arguments[0]) ? arguments[0] : arguments);

		return new Promise(function (resolve, reject) {
			if (args.length === 0) return resolve([]);
			var remaining = args.length;
			function res(i, val) {
				try {
					if (val && (typeof val === 'object' || typeof val === 'function')) {
						var then = val.then;
						if (typeof then === 'function') {
							then.call(val, function (val) { res(i, val) }, reject);
							return;
						}
					}
					args[i] = val;
					if (--remaining === 0) {
						resolve(args);
					}
				} catch (ex) {
					reject(ex);
				}
			}
			for (var i = 0; i < args.length; i++) {
				res(i, args[i]);
			}
		});
	};

	Promise.resolve = function (value) {
		if (value && typeof value === 'object' && value.constructor === Promise) {
			return value;
		}

		return new Promise(function (resolve) {
			resolve(value);
		});
	};

	Promise.reject = function (value) {
		return new Promise(function (resolve, reject) {
			reject(value);
		});
	};

	Promise.race = function (values) {
		return new Promise(function (resolve, reject) {
			for(var i = 0, len = values.length; i < len; i++) {
				values[i].then(resolve, reject);
			}
		});
	};

	/**
	 * Set the immediate function to execute callbacks
	 * @param fn {function} Function to execute
	 * @private
	 */
	Promise._setImmediateFn = function _setImmediateFn(fn) {
		asap = fn;
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = Promise;
	} else if (!root.Promise) {
		root.Promise = Promise;
	}

})(this);
},{}],4:[function(require,module,exports){
'use strict';
var strictUriEncode = require('strict-uri-encode');

exports.extract = function (str) {
	return str.split('?')[1] || '';
};

exports.parse = function (str) {
	if (typeof str !== 'string') {
		return {};
	}

	str = str.trim().replace(/^(\?|#|&)/, '');

	if (!str) {
		return {};
	}

	return str.split('&').reduce(function (ret, param) {
		var parts = param.replace(/\+/g, ' ').split('=');
		// Firefox (pre 40) decodes `%3D` to `=`
		// https://github.com/sindresorhus/query-string/pull/37
		var key = parts.shift();
		var val = parts.length > 0 ? parts.join('=') : undefined;

		key = decodeURIComponent(key);

		// missing `=` should be `null`:
		// http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
		val = val === undefined ? null : decodeURIComponent(val);

		if (!ret.hasOwnProperty(key)) {
			ret[key] = val;
		} else if (Array.isArray(ret[key])) {
			ret[key].push(val);
		} else {
			ret[key] = [ret[key], val];
		}

		return ret;
	}, {});
};

exports.stringify = function (obj) {
	return obj ? Object.keys(obj).sort().map(function (key) {
		var val = obj[key];

		if (Array.isArray(val)) {
			return val.sort().map(function (val2) {
				return strictUriEncode(key) + '=' + strictUriEncode(val2);
			}).join('&');
		}

		return strictUriEncode(key) + '=' + strictUriEncode(val);
	}).filter(function (x) {
		return x.length > 0;
	}).join('&') : '';
};

},{"strict-uri-encode":5}],5:[function(require,module,exports){
'use strict';
module.exports = function (str) {
	return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
		return '%' + c.charCodeAt(0).toString(16);
	});
};

},{}],6:[function(require,module,exports){
var xhrFactory = (function getXHRfactory (factories) {
  for (var i=0, xhr, X, len=factories.length; i<len; i++) {
    try { X = factories[i]; xhr = X();
      return window.XMLHttpRequest ? X : window.XMLHttpRequest = X;
    } catch (e) { continue; }
  }
})([
  function () {return new XMLHttpRequest();},// IE10+,FF,Chrome,Opera,Safari
  function () {return new ActiveXObject("Msxml3.");},            // IE9
  function () {return new ActiveXObject("Msxml2.XMLHTTP.6.0");}, // IE8
  function () {return new ActiveXObject("Msxml2.XMLHTTP.3.0");}, // IE7
  function () {return new ActiveXObject("Msxml2.XMLHTTP");},     // IE6
  function () {return new ActiveXObject("Microsoft.XMLHTTP");},  // IE5
  function () {return null;}
]);
module.exports = function getXHR() { return xhrFactory(); }

},{}],7:[function(require,module,exports){
var ajax = require('./util/ajax.js');

// stealed from https://github.com/iambumblehead/form-urlencoded/
function formEncodeString(str) {
	return str.replace(/[^ !'()~\*]*/g, encodeURIComponent)
	.replace(/ /g, '+')
	.replace(/[!'()~\*]/g, function (ch) {
		return '%' + ('0' + ch.charCodeAt(0).toString(16))
		.slice(-2).toUpperCase();
	});
}

function formEncode(obj) {
	var str = [];
	for (var prop in obj) {
		if (obj.hasOwnProperty(prop)) {// don't handle nested objects
			str.push(encodeURIComponent(prop) + '=' +
			formEncodeString(obj[prop]));
		}
	}
	return str.join('&');
}

function unwrap(xhr) {
	var data = xhr.responseText;
	var value = data.substring(data.indexOf('\n') + 1);

	if (data.startsWith('Ok.')) {
		return value;
	}
	throw Error('Unknown server error: ' + data);
}

function api (base_url) {
	function request (method, url) {
		function options(data, params, sync) {
			return {
				method: method,
				url: res.url,
				sync: sync,
				params: params,
				data: data && formEncode(data),
				headers: data && {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			};
		}
		var res = function (data, params) {
			return ajax(options(data, params)).then(unwrap);
		};
		res.sync = function (data, params) {
			// TODO: handle errors
			return unwrap(ajax(options(data, params, true)));
		};
		res.url = base_url + url;
		return res;
	}

	return {
		inchi: request('POST', 'getinchi'),
		molfile: request('POST', 'getmolfile'),
		aromatize: request('POST', 'aromatize'),
		dearomatize: request('POST', 'dearomatize'),
		calculateCip: request('POST', 'calculate_cip'),
		automap: request('POST', 'automap'),
		layout_smiles: request('GET', 'layout'),
		layout: request('POST', 'layout'),
		smiles: request('POST', 'smiles'),
		save: request('POST', 'save'),
		knocknock: function () {
			return ajax(base_url + 'knocknock').then(function (xhr) {
				if (xhr.responseText !== 'You are welcome!') {
					throw Error('Server is not compatible');
				}
			});
		}
	};
}

module.exports = api;

},{"./util/ajax.js":38}],8:[function(require,module,exports){
var Vec2 = require('../util/vec2');
var util = require('../util');
var element = require('./element');

var Atom = function (params) {
	var def = Atom.attrGetDefault;
	if (!params || !('label' in params))
		throw new Error('label must be specified!');

	this.label = params.label;
	this.fragment = !Object.isUndefined(params.fragment) ? params.fragment : -1;

	util.ifDef(this, params, 'isotope', def('isotope'));
	util.ifDef(this, params, 'radical', def('radical'));
	util.ifDef(this, params, 'charge', def('charge'));
	util.ifDef(this, params, 'rglabel', def('rglabel')); // r-group index mask, i-th bit stands for i-th r-site
	util.ifDef(this, params, 'attpnt', def('attpnt')); // attachment point
	util.ifDef(this, params, 'explicitValence', def('explicitValence'));

	this.valence = 0;
	this.implicitH = 0; // implicitH is not an attribute
	if (!Object.isUndefined(params.pp))
		this.pp = new Vec2(params.pp);
	else
		this.pp = new Vec2();

	// sgs should only be set when an atom is added to an s-group by an appropriate method,
	//   or else a copied atom might think it belongs to a group, but the group be unaware of the atom
	// TODO: make a consistency check on atom/s-group assignments
	this.sgs = {};

	// query
	util.ifDef(this, params, 'ringBondCount', def('ringBondCount'));
	util.ifDef(this, params, 'substitutionCount', def('substitutionCount'));
	util.ifDef(this, params, 'unsaturatedAtom', def('unsaturatedAtom'));
	util.ifDef(this, params, 'hCount', def('hCount'));

	// reaction
	util.ifDef(this, params, 'aam', def('aam'));
	util.ifDef(this, params, 'invRet', def('invRet'));
	util.ifDef(this, params, 'exactChangeFlag', def('exactChangeFlag'));
	util.ifDef(this, params, 'rxnFragmentType', -1); // this isn't really an attribute

	this.atomList = !Object.isUndefined(params.atomList) && params.atomList != null ? AtomList(params.atomList) : null;
	this.neighbors = []; // set of half-bonds having this atom as their origin
	this.badConn = false;
};

Atom.PATTERN =
 {
    RADICAL:
 {
        NONE: 0,
        SINGLET: 1,
        DOUPLET: 2,
        TRIPLET: 3
    }
};

Atom.attrlist = {
    'label': 'C',
    'isotope': 0,
    'radical': 0,
    'charge': 0,
    'explicitValence': -1,
    'ringBondCount': 0,
    'substitutionCount': 0,
    'unsaturatedAtom': 0,
    'hCount': 0,
    'atomList': null,
    'invRet': 0,
    'exactChangeFlag': 0,
    'rglabel': null,
    'attpnt': null,
    'aam': 0
};

Atom.getAttrHash = function (atom) {
	var attrs = new Hash();
	for (var attr in Atom.attrlist) {
		if (typeof(atom[attr]) != 'undefined') {
			attrs.set(attr, atom[attr]);
		}
	}
	return attrs;
};

Atom.attrGetDefault = function (attr) {
	if (attr in Atom.attrlist)
		return Atom.attrlist[attr];
	throw new Error('Attribute unknown');
};


Atom.prototype.clone = function (fidMap)
{
	var ret = new Atom(this);
	if (fidMap && this.fragment in fidMap) {
		ret.fragment = fidMap[this.fragment];
	}
	return ret;
};

Atom.prototype.isQuery =  function ()
{
	return this.atomList != null || this.label == 'A' || this.attpnt || this.hCount;
};

Atom.prototype.pureHydrogen =  function ()
{
	return this.label == 'H' && this.isotope == 0;
};

Atom.prototype.isPlainCarbon =  function ()
{
	return this.label == 'C' && this.isotope == 0 && this.radical == 0 && this.charge == 0
		 && this.explicitValence < 0 && this.ringBondCount == 0 && this.substitutionCount == 0
		 && this.unsaturatedAtom == 0 && this.hCount == 0 && !this.atomList;
};

Atom.prototype.isPseudo =  function ()
{
	// TODO: handle reaxys generics separately
	return !this.atomList && !this.rglabel && !element.getElementByLabel(this.label);
};

Atom.prototype.hasRxnProps =  function ()
{
	return !!(this.invRet || this.exactChangeFlag || !util.isNull(this.attpnt) || this.aam);
};


var radicalElectrons = function (radical) {
    radical = radical - 0;
    if (radical == Atom.PATTERN.RADICAL.NONE)
        return 0;
    else if (radical == Atom.PATTERN.RADICAL.DOUPLET)
        return 1;
    else if (radical == Atom.PATTERN.RADICAL.SINGLET ||
        radical == Atom.PATTERN.RADICAL.TRIPLET)
        return 2;
    throw new Error('Unknown radical value');
};

Atom.prototype.calcValence = function (conn) {
    var atom = this;
    var charge = atom.charge;
    var label = atom.label;
    if (atom.isQuery()) {
        this.implicitH = 0;
        return true;
    }
    var elem = element.getElementByLabel(label);
    if (elem == null) {
        this.implicitH = 0;
        return true;
    }

    var groupno = element.get(elem).group;
    var rad = radicalElectrons(atom.radical);

    var valence = conn;
    var hyd = 0;
    var absCharge = Math.abs(charge);

    switch (groupno) {
        case 1:
            if (label == 'H' ||
			label == 'Li' || label == 'Na' || label == 'K' ||
			label == 'Rb' || label == 'Cs' || label == 'Fr') {
                valence = 1;
                hyd = 1 - rad - conn - absCharge;
            }
            break;
        case 3:
            if (label == 'B' || label == 'Al' || label == 'Ga' || label == 'In') {
                if (charge == -1) {
                    valence = 4;
                    hyd = 4 - rad - conn;
                }
                else {
                    valence = 3;
                    hyd = 3 - rad - conn - absCharge;
                }
            }
            else {
                if (label == 'Tl') {
                    if (charge == -1) {
                        if (rad + conn <= 2) {
                            valence = 2;
                            hyd = 2 - rad - conn;
                        }
                        else {
                            valence = 4;
                            hyd = 4 - rad - conn;
                        }
                    }
                    else {
                        if (charge == -2) {
                            if (rad + conn <= 3) {
                                valence = 3;
                                hyd = 3 - rad - conn;
                            }
                            else {
                                valence = 5;
                                hyd = 5 - rad - conn;
                            }
                        }
                        else {
                            if (rad + conn + absCharge <= 1) {
                                valence = 1;
                                hyd = 1 - rad - conn - absCharge;
                            }
                            else {
                                valence = 3;
                                hyd = 3 - rad - conn - absCharge;
                            }
                        }
                    }
                }
            }
            break;
        case 4:
            if (label == 'C' || label == 'Si' || label == 'Ge') {
                valence = 4;
                hyd = 4 - rad - conn - absCharge;
            }
            else {
                if (label == 'Sn' || label == 'Pb') {
                    if (conn + rad + absCharge <= 2) {
                        valence = 2;
                        hyd = 2 - rad - conn - absCharge;
                    }
                    else {
                        valence = 4;
                        hyd = 4 - rad - conn - absCharge;
                    }
                }
            }
            break;
        case 5:
            if (label == 'N' || label == 'P') {
                if (charge == 1) {
                    valence = 4;
                    hyd = 4 - rad - conn;
                }
                else {
                    if (charge == 2) {
                        valence = 3;
                        hyd = 3 - rad - conn;
                    }
                    else {
                        if (label == 'N' || rad + conn + absCharge <= 3) {
                            valence = 3;
                            hyd = 3 - rad - conn - absCharge;
                        }
                        else // ELEM_P && rad + conn + absCharge > 3
                        {
                            valence = 5;
                            hyd = 5 - rad - conn - absCharge;
                        }
                    }
                }
            }
            else {
                if (label == 'Bi' || label == 'Sb' || label == 'As') {
                    if (charge == 1) {
                        if (rad + conn <= 2 && label != 'As') {
                            valence = 2;
                            hyd = 2 - rad - conn;
                        }
                        else {
                            valence = 4;
                            hyd = 4 - rad - conn;
                        }
                    }
                    else {
                        if (charge == 2) {
                            valence = 3;
                            hyd = 3 - rad - conn;
                        }
                        else {
                            if (rad + conn <= 3) {
                                valence = 3;
                                hyd = 3 - rad - conn - absCharge;
                            }
                            else {
                                valence = 5;
                                hyd = 5 - rad - conn - absCharge;
                            }
                        }
                    }
                }
            }
            break;
        case 6:
            if (label == 'O') {
                if (charge >= 1) {
                    valence = 3;
                    hyd = 3 - rad - conn;
                }
                else {
                    valence = 2;
                    hyd = 2 - rad - conn - absCharge;
                }
            }
            else {
                if (label == 'S' || label == 'Se' || label == 'Po') {
                    if (charge == 1) {
                        if (conn <= 3) {
                            valence = 3;
                            hyd = 3 - rad - conn;
                        }
                        else {
                            valence = 5;
                            hyd = 5 - rad - conn;
                        }
                    }
                    else {
                        if (conn + rad + absCharge <= 2) {
                            valence = 2;
                            hyd = 2 - rad - conn - absCharge;
                        }
                        else {
                            if (conn + rad + absCharge <= 4) {
                                // See examples in PubChem
                                // [S] : CID 16684216
                                // [Se]: CID 5242252
                                // [Po]: no example, just following ISIS/Draw logic here {
                                valence = 4;
                                hyd = 4 - rad - conn - absCharge;
                            }
                            else {
                                // See examples in PubChem
                                // [S] : CID 46937044
                                // [Se]: CID 59786
                                // [Po]: no example, just following ISIS/Draw logic here {
                                valence = 6;
                                hyd = 6 - rad - conn - absCharge;
                            }
                        }
                    }
                }
                else {
                    if (label == 'Te') {
                        if (charge == -1) {
                            if (conn <= 2) {
                                valence = 2;
                                hyd = 2 - rad - conn - absCharge;
                            }
                        }
                        else {
                            if (charge == 0 || charge == 2) {
                                if (conn <= 2) {
                                    valence = 2;
                                    hyd = 2 - rad - conn - absCharge;
                                }
                                else {
                                    if (conn <= 4) {
                                        valence = 4;
                                        hyd = 4 - rad - conn - absCharge;
                                    }
                                    else {
                                        if (charge == 0 && conn <= 6) {
                                            valence = 6;
                                            hyd = 6 - rad - conn - absCharge;
                                        }
                                        else {
                                            hyd = -1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            break;
        case 7:
            if (label == 'F') {
                valence = 1;
                hyd = 1 - rad - conn - absCharge;
            }
            else {
                if (label == 'Cl' || label == 'Br' || label == 'I' || label == 'At') {
                    if (charge == 1) {
                        if (conn <= 2) {
                            valence = 2;
                            hyd = 2 - rad - conn;
                        }
                        else {
                            if (conn == 3 || conn == 5 || conn >= 7)
                                hyd = -1;
                        }
                    }
                    else {
                        if (charge == 0) {
                            if (conn <= 1) {
                                valence = 1;
                                hyd = 1 - rad - conn;
                            }
                             // While the halogens can have valence 3, they can not have
                             // hydrogens in that case.
                            else {
                                if (conn == 2 || conn == 4 || conn == 6) {
                                    if (rad == 1) {
                                        valence = conn;
                                        hyd = 0;
                                    }
                                    else
                                        hyd = -1; // will throw an error in the end
                                }
                                else {
                                    if (conn > 7)
                                        hyd = -1; // will throw an error in the end
                                }
                            }
                        }
                    }
                }
            }
    }

    this.valence = valence;
    this.implicitH = hyd;
    if (this.implicitH < 0) {
        this.valence = conn;
        this.implicitH = 0;
        this.badConn = true;
        return false;
    }
    return true;
};

Atom.prototype.calcValenceMinusHyd = function (conn) {
    var atom = this;
    var charge = atom.charge;
    var label = atom.label;
    var elem = element.getElementByLabel(label);
    if (elem == null)
        throw new Error('Element ' + label + ' unknown');
    if (elem < 0) { // query atom, skip
        this.implicitH = 0;
        return null;
    }

    var groupno = element.get(elem).group;
    var rad = radicalElectrons(atom.radical);

    if (groupno == 3) {
        if (label == 'B' || label == 'Al' || label == 'Ga' || label == 'In') {
            if (charge == -1)
                if (rad + conn <= 4)
                    return rad + conn;
        }
    }
    else if (groupno == 5) {
        if (label == 'N' || label == 'P') {
            if (charge == 1)
                return rad + conn;
            if (charge == 2)
                return rad + conn;
        }
        else if (label == 'Sb' || label == 'Bi' || label == 'As') {
            if (charge == 1)
                return rad + conn;
            else if (charge == 2)
                return rad + conn;
        }
    }
    else if (groupno == 6) {
        if (label == 'O') {
            if (charge >= 1)
                return rad + conn;
        }
        else if (label == 'S' || label == 'Se' || label == 'Po') {
            if (charge == 1)
                return rad + conn;
        }
    }
    else if (groupno == 7) {
        if (label == 'Cl' || label == 'Br' ||
			label == 'I' || label == 'At') {
            if (charge == 1)
                return rad + conn;
        }
    }

    return rad + conn + Math.abs(charge);
};

var AtomList = function (params)
{
	if (!params || !('notList' in params) || !('ids' in params))
		throw new Error('\'notList\' and \'ids\' must be specified!');

	this.notList = params.notList; /*boolean*/
	this.ids = params.ids; /*Array of integers*/
};

AtomList.prototype.labelList = function ()
{
	var labels = [];
	for (var i = 0; i < this.ids.length; ++i)
		labels.push(element.get(this.ids[i]).label);
	return labels;
};

AtomList.prototype.label = function ()
{
	var label = '[' + this.labelList().join(',') + ']';
	if (this.notList)
		label = '!' + label;
	return label;
};

AtomList.prototype.equals = function (x)
{
	return this.notList == x.notList && (this.ids || []).sort().toString() == (x.ids || []).sort().toString();
};

Atom.List = AtomList;
module.exports = Atom;

},{"../util":40,"../util/vec2":44,"./element":12}],9:[function(require,module,exports){
var Vec2 = require('../util/vec2');

var Bond = function (params)
{
	if (!params || !('begin' in params) || !('end' in params) || !('type' in params))
		throw new Error('\'begin\', \'end\' and \'type\' properties must be specified!');

	this.begin = params.begin;
	this.end = params.end;
    this.type = params.type;
    this.stereo = Bond.PATTERN.STEREO.NONE;
    this.topology = Bond.PATTERN.TOPOLOGY.EITHER;
    this.reactingCenterStatus = 0;
	this.hb1 = null; // half-bonds
	this.hb2 = null;
	this.len = 0;
	this.sb = 0;
	this.sa = 0;
    this.angle = 0;

    if (params.stereo)
        this.stereo = params.stereo;
    if (params.topology)
        this.topology = params.topology;
    if (params.reactingCenterStatus)
        this.reactingCenterStatus = params.reactingCenterStatus;

    this.center = new Vec2();

};

Bond.PATTERN =
{
    TYPE:
 {
        SINGLE: 1,
        DOUBLE: 2,
        TRIPLE: 3,
        AROMATIC: 4,
        SINGLE_OR_DOUBLE: 5,
        SINGLE_OR_AROMATIC: 6,
        DOUBLE_OR_AROMATIC: 7,
        ANY: 8
    },

    STEREO:
 {
        NONE: 0,
        UP: 1,
        EITHER: 4,
        DOWN: 6,
        CIS_TRANS: 3
    },

    TOPOLOGY:
 {
        EITHER: 0,
        RING: 1,
        CHAIN: 2
    },

    REACTING_CENTER:
 {
        NOT_CENTER: -1,
        UNMARKED: 0,
        CENTER: 1,
        UNCHANGED: 2,
        MADE_OR_BROKEN: 4,
        ORDER_CHANGED: 8,
        MADE_OR_BROKEN_AND_CHANGED: 12
    }
};

Bond.attrlist = {
	'type': Bond.PATTERN.TYPE.SINGLE,
	'stereo': Bond.PATTERN.STEREO.NONE,
	'topology': Bond.PATTERN.TOPOLOGY.EITHER,
	'reactingCenterStatus': 0
};

Bond.getAttrHash = function (bond) {
	var attrs = new Hash();
	for (var attr in Bond.attrlist) {
		if (typeof(bond[attr]) !== 'undefined') {
			attrs.set(attr, bond[attr]);
		}
	}
	return attrs;
};

Bond.attrGetDefault = function (attr) {
	if (attr in Bond.attrlist)
		return Bond.attrlist[attr];
	throw new Error('Attribute unknown');
}

Bond.prototype.hasRxnProps =  function ()
{
	return !!this.reactingCenterStatus;
};

Bond.prototype.getCenter = function (struct) {
	var p1 = struct.atoms.get(this.begin).pp;
	var p2 = struct.atoms.get(this.end).pp;
	return Vec2.lc2(p1, 0.5, p2, 0.5);
}

Bond.prototype.getDir = function (struct) {
	var p1 = struct.atoms.get(this.begin).pp;
	var p2 = struct.atoms.get(this.end).pp;
	return p2.sub(p1).normalized();
}

Bond.prototype.clone = function (aidMap)
{
	var cp = new Bond(this);
	if (aidMap) {
		cp.begin = aidMap[cp.begin];
		cp.end = aidMap[cp.end];
	}
	return cp;
};

Bond.prototype.findOtherEnd = function (i)
{
	if (i == this.begin)
		return this.end;
	if (i == this.end)
		return this.begin;
	throw new Error('bond end not found');
};

module.exports = Bond;

},{"../util/vec2":44}],10:[function(require,module,exports){
var Map = require('../util/map');
var Vec2 = require('../util/vec2');
var Bond = require('./bond');

var CisTrans = function (mol, neighborsFunc, context) {
	this.molecule = mol;
	this.bonds = new Map();
	this.getNeighbors = neighborsFunc;
	this.context = context;
};

CisTrans.PARITY = {
	NONE: 0,
	CIS: 1,
	TRANS: 2
};

CisTrans.prototype.each = function (func, context) {
	this.bonds.each(func, context);
};

CisTrans.prototype.getParity = function (idx) {
	return this.bonds.get(idx).parity;
};

CisTrans.prototype.getSubstituents = function (idx) {
	return this.bonds.get(idx).substituents;
};

CisTrans.prototype.sameside = function (beg, end, neiBeg, neiEnd) {
	var diff = Vec2.diff(beg, end);
	var norm = new Vec2(-diff.y, diff.x);

	if (!norm.normalize()) {
		return 0;
	}

	var normBeg = Vec2.diff(neiBeg, beg);
	var normEnd = Vec2.diff(neiEnd, end);

	if (!normBeg.normalize()) {
		return 0;
	}
	if (!normEnd.normalize()) {
		return 0;
	}

	var prodBeg = Vec2.dot(normBeg, norm);
	var prodEnd = Vec2.dot(normEnd, norm);

	if (Math.abs(prodBeg) < 0.001 || Math.abs(prodEnd) < 0.001) {
		return 0;
	}

	return (prodBeg * prodEnd > 0) ? 1 : -1;
};

CisTrans.prototype._sameside = function (iBeg, iEnd, iNeiBeg, iNeiEnd) {
	return this.sameside(this.molecule.atoms.get(iBeg).pp, this.molecule.atoms.get(iEnd).pp,
		this.molecule.atoms.get(iNeiBeg).pp, this.molecule.atoms.get(iNeiEnd).pp);
};

CisTrans.prototype._sortSubstituents = function (substituents) {
	var h0 = this.molecule.atoms.get(substituents[0]).pureHydrogen();
	var h1 = substituents[1] < 0 || this.molecule.atoms.get(substituents[1]).pureHydrogen();
	var h2 = this.molecule.atoms.get(substituents[2]).pureHydrogen();
	var h3 = substituents[3] < 0 || this.molecule.atoms.get(substituents[3]).pureHydrogen();

	if (h0 && h1) {
		return false;
	}
	if (h2 && h3) {
		return false;
	}

	if (h1) {
		substituents[1] = -1;
	} else if (h0) {
		substituents[0] = substituents[1];
		substituents[1] = -1;
	} else if (substituents[0] > substituents[1]) {
		substituents.swap(0, 1);
	}

	if (h3) {
		substituents[3] = -1;
	} else if (h2) {
		substituents[2] = substituents[3];
		substituents[3] = -1;
	} else if (substituents[2] > substituents[3]) {
		substituents.swap(2, 3);
	}

	return true;
};

CisTrans.prototype.isGeomStereoBond = function (bondIdx, substituents) {
	// it must be [C,N,Si]=[C,N,Si] bond
	var bond = this.molecule.bonds.get(bondIdx);

	if (bond.type != Bond.PATTERN.TYPE.DOUBLE) {
		return false;
	}

	var label1 = this.molecule.atoms.get(bond.begin).label;
	var label2 = this.molecule.atoms.get(bond.end).label;

	if (label1 != 'C' && label1 != 'N' && label1 != 'Si' && label1 != 'Ge') {
		return false;
	}
	if (label2 != 'C' && label2 != 'N' && label2 != 'Si' && label2 != 'Ge') {
		return false;
	}

	// the atoms should have 1 or 2 single bonds
	// (apart from the double bond under consideration)
	var neiBegin = this.getNeighbors.call(this.context, bond.begin);
	var neiЕnd = this.getNeighbors.call(this.context, bond.end);

	if (
	neiBegin.length < 2 || neiBegin.length > 3 ||
	neiЕnd.length < 2 || neiЕnd.length > 3
	) {
		return false;
	}

	substituents[0] = -1;
	substituents[1] = -1;
	substituents[2] = -1;
	substituents[3] = -1;

	var i;
	var nei;

	for (i = 0; i < neiBegin.length; i++) {
		nei = neiBegin[i];

		if (nei.bid == bondIdx) {
			continue;
		}

		if (this.molecule.bonds.get(nei.bid).type != Bond.PATTERN.TYPE.SINGLE) {
			return false;
		}

		if (substituents[0] == -1) {
			substituents[0] = nei.aid;
		}else { // (substituents[1] == -1)
			substituents[1] = nei.aid;
		}
	}

	for (i = 0; i < neiЕnd.length; i++) {
		nei = neiЕnd[i];

		if (nei.bid == bondIdx) {
			continue;
		}

		if (this.molecule.bonds.get(nei.bid).type != Bond.PATTERN.TYPE.SINGLE) {
			return false;
		}

		if (substituents[2] == -1) {
			substituents[2] = nei.aid;
		}
		else { // (substituents[3] == -1)
			substituents[3] = nei.aid;
		}
	}

	if (substituents[1] != -1 && this._sameside(bond.begin, bond.end, substituents[0], substituents[1]) != -1) {
		return false;
	}
	if (substituents[3] != -1 && this._sameside(bond.begin, bond.end, substituents[2], substituents[3]) != -1) {
		return false;
	}

	return true;
};

CisTrans.prototype.build = function (exclude_bonds) {
	this.molecule.bonds.each(function (bid, bond) {
		var ct = this.bonds.set(bid,
		{
			parity: 0,
			substituents: new Array(4)
		});

		if (Object.isArray(exclude_bonds) && exclude_bonds[bid])
			return;

		if (!this.isGeomStereoBond(bid, ct.substituents))
			return;

		if (!this._sortSubstituents(ct.substituents))
			return;

		var sign = this._sameside(bond.begin, bond.end, ct.substituents[0], ct.substituents[2]);

		if (sign == 1)
			ct.parity = CisTrans.PARITY.CIS;
		else if (sign == -1)
			ct.parity = CisTrans.PARITY.TRANS;
	}, this);
};

module.exports = CisTrans;

},{"../util/map":41,"../util/vec2":44,"./bond":9}],11:[function(require,module,exports){
var Set = require('../util/set');

var Dfs = function (mol, atom_data, components, nReactants) {
	this.molecule = mol;
	this.atom_data = atom_data;
	this.components = components;
	this.nComponentsInReactants = -1;
	this.nReactants = nReactants;

	this.vertices = new Array(this.molecule.atoms.count()); // Minimum size
	this.molecule.atoms.each(function (aid)
	{
		this.vertices[aid] = new Dfs.VertexDesc();
	}, this);

	this.edges = new Array(this.molecule.bonds.count()); // Minimum size
	this.molecule.bonds.each(function (bid)
	{
		this.edges[bid] = new Dfs.EdgeDesc();
	}, this);

	this.v_seq = [];
};

Dfs.VertexDesc = function ()
{
	this.dfs_state = 0;       // 0 -- not on stack
	// 1 -- on stack
	// 2 -- removed from stack
	this.parent_vertex = 0;   // parent vertex in DFS tree
	this.parent_edge = 0;     // edge to parent vertex
	this.branches = 0;    // how many DFS branches go out from this vertex}
};

Dfs.EdgeDesc = function ()
{
	this.opening_cycles = 0; // how many cycles are
	// (i) starting with this edge
	// and (ii) ending in this edge's first vertex
	this.closing_cycle = 0;  // 1 if this edge closes a cycle
};

Dfs.SeqElem = function (v_idx, par_vertex, par_edge)
{
	this.idx = v_idx;                // index of vertex in _graph
	this.parent_vertex = par_vertex; // parent vertex in DFS tree
	this.parent_edge = par_edge;     // edge to parent vertex
};

Dfs.prototype.walk = function ()
{
	var v_stack = [];
	var i, j;
	var cid = 0;
	var component = 0;

	while (true)
	{
		if (v_stack.length < 1)
		{
			var selected = -1;

			var findFunc = function (aid)
			{
				if (this.vertices[aid].dfs_state == 0)
				{
					selected = aid;
					return true;
				}
				return false;
			};

			while (cid < this.components.length && selected == -1) {
				selected = Set.find(this.components[cid], findFunc, this);
				if (selected === null) {
					selected = -1;
					cid++;
					if (cid == this.nReactants) {
						this.nComponentsInReactants = component;
					}
				}
			}
			if (selected < -1) {
				this.molecule.atoms.find(findFunc, this);
			}
			if (selected == -1)
				break;
			this.vertices[selected].parent_vertex = -1;
			this.vertices[selected].parent_edge = -1;
			v_stack.push(selected);
			component++;
		}

		var v_idx = v_stack.pop();
		var parent_vertex = this.vertices[v_idx].parent_vertex;

		var seq_elem = new Dfs.SeqElem(v_idx, parent_vertex, this.vertices[v_idx].parent_edge);
		this.v_seq.push(seq_elem);

		this.vertices[v_idx].dfs_state = 2;

		var atom_d = this.atom_data[v_idx];

		for (i = 0; i < atom_d.neighbours.length; i++)
		{
			var nei_idx = atom_d.neighbours[i].aid;
			var edge_idx = atom_d.neighbours[i].bid;

			if (nei_idx == parent_vertex)
				continue;

			if (this.vertices[nei_idx].dfs_state == 2)
			{
				this.edges[edge_idx].closing_cycle = 1;

				j = v_idx;

				while (j != -1)
				{
					if (this.vertices[j].parent_vertex == nei_idx)
						break;
					j = this.vertices[j].parent_vertex;
				}

				if (j == -1)
					throw new Error('cycle unwind error');

				this.edges[this.vertices[j].parent_edge].opening_cycles++;
				this.vertices[v_idx].branches++;

				seq_elem = new Dfs.SeqElem(nei_idx, v_idx, edge_idx);
				this.v_seq.push(seq_elem);
			}
			else
			{
				if (this.vertices[nei_idx].dfs_state == 1)
				{
					j = v_stack.indexOf(nei_idx);

					if (j == -1)
						throw new Error('internal: removing vertex from stack');

					v_stack.splice(j, 1);

					var parent = this.vertices[nei_idx].parent_vertex;

					if (parent >= 0)
						this.vertices[parent].branches--;
				}

				this.vertices[v_idx].branches++;
				this.vertices[nei_idx].parent_vertex = v_idx;
				this.vertices[nei_idx].parent_edge = edge_idx;
				this.vertices[nei_idx].dfs_state = 1;
				v_stack.push(nei_idx);
			}
		}
	}
};

Dfs.prototype.edgeClosingCycle = function (e_idx)
{
	return this.edges[e_idx].closing_cycle != 0;
};

Dfs.prototype.numBranches = function (v_idx)
{
	return this.vertices[v_idx].branches;
};

Dfs.prototype.numOpeningCycles = function (e_idx)
{
	return this.edges[e_idx].opening_cycles;
};

Dfs.prototype.toString = function ()
{
	var str = '';
	this.v_seq.each(function (seq_elem) {str += seq_elem.idx + ' -> ';});
	str += '*';
	return str;
};

module.exports = Dfs;

},{"../util/set":43}],12:[function(require,module,exports){
var Map = require('../util/map');

function el(label, period, group, putHydrogenOnTheLeft, color) {
	return {
		label: label,
		period: period,
		group: group,
		putHydrogenOnTheLeft: putHydrogenOnTheLeft,
		color: color || '#000000'
	};
};

var element = new Map({
	1: el( 'H', 1, 1, false, '#000000'),
	2: el('He', 1, 8, false, '#d9ffff'),
	3: el('Li', 2, 1, false, '#cc80ff'),
	4: el('Be', 2, 2, false, '#c2ff00'),
	5: el( 'B', 2, 3, false, '#ffb5b5'),
	6: el( 'C', 2, 4, false, '#000000'),
	7: el( 'N', 2, 5, false, '#304ff7'),
	8: el( 'O', 2, 6, true, '#ff0d0d'),
	9: el( 'F', 2, 7, true, '#8fe04f'),
	10: el('Ne', 2, 8, false, '#b3e3f5'),
	11: el('Na', 3, 1, false, '#ab5cf2'),
	12: el('Mg', 3, 2, false, '#8aff00'),
	13: el('Al', 3, 3, false, '#bfa6a6'),
	14: el('Si', 3, 4, false, '#f0c7a1'),
	15: el( 'P', 3, 5, false, '#ff8000'),
	16: el( 'S', 3, 6, true, '#d9a61a'),
	17: el('Cl', 3, 7, true, '#1fd01f'),
	18: el('Ar', 3, 8, false, '#80d1e3'),
	19: el( 'K', 4, 1, false, '#8f40d4'),
	20: el('Ca', 4, 2, false, '#3dff00'),
	21: el('Sc', 4, 3, false, '#e6e6e6'),
	22: el('Ti', 4, 4, false, '#bfc2c7'),
	23: el( 'V', 4, 5, false, '#a6a6ab'),
	24: el('Cr', 4, 6, false, '#8a99c7'),
	25: el('Mn', 4, 7, false, '#9c7ac7'),
	26: el('Fe', 4, 8, false, '#e06633'),
	27: el('Co', 4, 8, false, '#f08fa1'),
	28: el('Ni', 4, 8, false, '#4fd14f'),
	29: el('Cu', 4, 1, false, '#c78033'),
	30: el('Zn', 4, 2, false, '#7d80b0'),
	31: el('Ga', 4, 3, false, '#c28f8f'),
	32: el('Ge', 4, 4, false, '#668f8f'),
	33: el('As', 4, 5, false, '#bd80e3'),
	34: el('Se', 4, 6, true, '#ffa100'),
	35: el('Br', 4, 7, true, '#a62929'),
	36: el('Kr', 4, 8, false, '#5cb8d1'),
	37: el('Rb', 5, 1, false, '#702eb0'),
	38: el('Sr', 5, 2, false, '#00ff00'),
	39: el( 'Y', 5, 3, false, '#94ffff'),
	40: el('Zr', 5, 4, false, '#94e0e0'),
	41: el('Nb', 5, 5, false, '#73c2c9'),
	42: el('Mo', 5, 6, false, '#54b5b5'),
	43: el('Tc', 5, 7, false, '#3b9e9e'),
	44: el('Ru', 5, 8, false, '#248f8f'),
	45: el('Rh', 5, 8, false, '#0a7d8c'),
	46: el('Pd', 5, 8, false, '#006985'),
	47: el('Ag', 5, 1, false, '#bfbfbf'),
	48: el('Cd', 5, 2, false, '#ffd98f'),
	49: el('In', 5, 3, false, '#a67573'),
	50: el('Sn', 5, 4, false, '#668080'),
	51: el('Sb', 5, 5, false, '#9e63b5'),
	52: el('Te', 5, 6, false, '#d47a00'),
	53: el( 'I', 5, 7, true, '#940094'),
	54: el('Xe', 5, 8, false, '#429eb0'),
	55: el('Cs', 6, 1, false, '#57178f'),
	56: el('Ba', 6, 2, false, '#00c900'),
	57: el('La', 6, 3, false, '#70d4ff'),
	58: el('Ce', 6, 3, false, '#ffffc7'),
	59: el('Pr', 6, 3, false, '#d9ffc7'),
	60: el('Nd', 6, 3, false, '#c7ffc7'),
	61: el('Pm', 6, 3, false, '#a3ffc7'),
	62: el('Sm', 6, 3, false, '#8fffc7'),
	63: el('Eu', 6, 3, false, '#61ffc7'),
	64: el('Gd', 6, 3, false, '#45ffc7'),
	65: el('Tb', 6, 3, false, '#30ffc7'),
	66: el('Dy', 6, 3, false, '#1fffc7'),
	67: el('Ho', 6, 3, false, '#00ff9c'),
	68: el('Er', 6, 3, false, '#00e675'),
	69: el('Tm', 6, 3, false, '#00d452'),
	70: el('Yb', 6, 3, false, '#00bf38'),
	71: el('Lu', 6, 3, false, '#00ab24'),
	72: el('Hf', 6, 4, false, '#4dc2ff'),
	73: el('Ta', 6, 5, false, '#4da6ff'),
	74: el( 'W', 6, 6, false, '#2194d6'),
	75: el('Re', 6, 7, false, '#267dab'),
	76: el('Os', 6, 8, false, '#266696'),
	77: el('Ir', 6, 8, false, '#175487'),
	78: el('Pt', 6, 8, false, '#d1d1e0'),
	79: el('Au', 6, 1, false, '#ffd124'),
	80: el('Hg', 6, 2, false, '#b8b8d1'),
	81: el('Tl', 6, 3, false, '#a6544d'),
	82: el('Pb', 6, 4, false, '#575961'),
	83: el('Bi', 6, 5, false, '#9e4fb5'),
	84: el('Po', 6, 6, false, '#ab5c00'),
	85: el('At', 6, 7, false, '#754f45'),
	86: el('Rn', 6, 8, false, '#428296'),
	87: el('Fr', 7, 1, false, '#420066'),
	88: el('Ra', 7, 2, false, '#007d00'),
	89: el('Ac', 7, 3, false, '#70abfa'),
	90: el('Th', 7, 3, false, '#00baff'),
	91: el('Pa', 7, 3, false, '#00a1ff'),
	92: el( 'U', 7, 3, false, '#008fff'),
	93: el('Np', 7, 3, false, '#0080ff'),
	94: el('Pu', 7, 3, false, '#006bff'),
	95: el('Am', 7, 3, false, '#545cf2'),
	96: el('Cm', 7, 3, false, '#785ce3'),
	97: el('Bk', 7, 3, false, '#8a4fe3'),
	98: el('Cf', 7, 3, false, '#a136d4'),
	99: el('Es', 7, 3, false, '#b31fd4'),
	// TODO need to fix colors for the elements below
	100: el('Fm', 7, 3, false, '#000000'),
	101: el('Md', 7, 3, false, '#000000'),
	102: el('No', 7, 3, false, '#000000'),
	103: el('Lr', 7, 3, false, '#000000'),
	104: el('Rf', 7, 4, false, '#4dc2ff'),
	105: el('Db', 7, 5, false, '#4da6ff'),
	106: el('Sg', 7, 6, false, '#2194d6'),
	107: el('Bh', 7, 7, false, '#267dab'),
	108: el('Hs', 7, 8, false, '#266696'),
	109: el('Mt', 7, 8, false, '#175487'),
	110: el('Ds', 7, 8, false, '#d1d1e0'),
	111: el('Rg', 7, 1, false, '#ffd124'),
	112: el('Cn', 7, 2, false, '#b8b8d1'),
	113: el('Uut', 7, 3, false),
	114: el('Fl', 7, 4, false),
	115: el('Uup', 7, 5, false),
	116: el('Lv', 7, 6, false),
	117: el('Uus', 7, 7, false),
	118: el('Uuo', 7, 8, false)
});

var labelMap = null;
element.getElementByLabel = function (label) {
	if (!labelMap) {
		labelMap = {};
		element.each(function (key, value) {
			labelMap[value.label] = key - 0;
		});
	}
	return labelMap[label] || null;
};

module.exports = element;

},{"../util/map":41}],13:[function(require,module,exports){
var Map = require('../util/map');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var element = require('./element');
var Struct = require('./struct');
var SGroup = require('./sgroup');
var Atom = require('./atom');
var Bond = require('./bond');

var util = require('../util');

var FRAGMENT = {
    NONE: 0,
    REACTANT: 1,
    PRODUCT: 2,
    AGENT: 3
};

var Molfile = function (v3000) {
    /* reader */
    /* saver */
    this.molecule = null;
    this.molfile = null;
    this.v3000 = v3000 || false;
};

Molfile.loadRGroupFragments = true; // TODO: set to load the fragments

var parseDecimalInt = function (str)
{
    /* reader */
	var val = parseInt(str, 10);

	return isNaN(val) ? 0 : val;
};

var partitionLine = function (/*string*/ str, /*array of int*/ parts, /*bool*/ withspace)
{
    /* reader */
	var res = [];
	for (var i = 0, shift = 0; i < parts.length; ++i)
	{
		res.push(str.slice(shift, shift + parts[i]));
		if (withspace)
			shift++;
		shift += parts[i];
	}
	return res;
};

var partitionLineFixed = function (/*string*/ str, /*int*/ itemLength, /*bool*/ withspace)
{
    /* reader */
	var res = [];
	for (var shift = 0; shift < str.length; shift += itemLength)
	{
		res.push(str.slice(shift, shift + itemLength));
		if (withspace)
			shift++;
	}
	return res;
};

Molfile.prototype.parseCTFile = function (molfile) {
	var molfileLines = Array.isArray(molfile) ? molfile : util.splitNewlines(molfile);
	var ret = null;
	if (molfileLines[0].search('\\$RXN') == 0)
		ret = parseRxn(molfileLines);
	else
		ret = parseMol(molfileLines);
	ret.initHalfBonds();
	ret.initNeighbors();
	ret.markFragments();
	return ret;
};

var fmtInfo = {
	bondTypeMap: {
		1: Bond.PATTERN.TYPE.SINGLE,
		2: Bond.PATTERN.TYPE.DOUBLE,
		3: Bond.PATTERN.TYPE.TRIPLE,
		4: Bond.PATTERN.TYPE.AROMATIC,
		5: Bond.PATTERN.TYPE.SINGLE_OR_DOUBLE,
		6: Bond.PATTERN.TYPE.SINGLE_OR_AROMATIC,
		7: Bond.PATTERN.TYPE.DOUBLE_OR_AROMATIC,
		8: Bond.PATTERN.TYPE.ANY
	},
	bondStereoMap: {
		0: Bond.PATTERN.STEREO.NONE,
		1: Bond.PATTERN.STEREO.UP,
		4: Bond.PATTERN.STEREO.EITHER,
		6: Bond.PATTERN.STEREO.DOWN,
		3: Bond.PATTERN.STEREO.CIS_TRANS
	},
	v30bondStereoMap: {
		0: Bond.PATTERN.STEREO.NONE,
		1: Bond.PATTERN.STEREO.UP,
		2: Bond.PATTERN.STEREO.EITHER,
		3: Bond.PATTERN.STEREO.DOWN
	},
	bondTopologyMap: {
		0: Bond.PATTERN.TOPOLOGY.EITHER,
		1: Bond.PATTERN.TOPOLOGY.RING,
		2: Bond.PATTERN.TOPOLOGY.CHAIN
	},
	countsLinePartition: [3,3,3,3,3,3,3,3,3,3,3,6],
	atomLinePartition: [10,10,10,1,3,2,3,3,3,3,3,3,3,3,3,3,3],
	bondLinePartition: [3,3,3,3,3,3,3],
	atomListHeaderPartition: [3,1,1,4,1,1],
	atomListHeaderLength: 11, // = atomListHeaderPartition.reduce(function(a,b) { return a + b; }, 0)
	atomListHeaderItemLength: 4,
	chargeMap: [0, +3, +2, +1, 0, -1, -2, -3],
	valenceMap: [undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0],
	implicitHydrogenMap: [undefined, 0, 1, 2, 3, 4],
	v30atomPropMap: {
		'CHG':'charge',
		'RAD':'radical',
		'MASS':'isotope',
		'VAL':'explicitValence',
		'HCOUNT':'hCount',
		'INVRET':'invRet',
		'SUBST':'substitutionCount',
		'UNSAT':'unsaturatedAtom',
		'RBCNT':'ringBondCount'
	},
	rxnItemsPartition: [3,3,3]
};

var parseAtomLine = function (atomLine)
{
    /* reader */
	var atomSplit = partitionLine(atomLine, fmtInfo.atomLinePartition);
	var params =
	{
		// generic
		pp: new Vec2(parseFloat(atomSplit[0]), -parseFloat(atomSplit[1])),
		label: atomSplit[4].strip(),
		explicitValence: fmtInfo.valenceMap[parseDecimalInt(atomSplit[10])],

		// obsolete
		massDifference: parseDecimalInt(atomSplit[5]),
		charge: fmtInfo.chargeMap[parseDecimalInt(atomSplit[6])],

		// query
		hCount: parseDecimalInt(parseDecimalInt(atomSplit[8])),
		stereoCare: parseDecimalInt(atomSplit[9]) != 0,

		// reaction
		aam: parseDecimalInt(atomSplit[14]),
		invRet: parseDecimalInt(atomSplit[15]),

		// reaction query
		exactChangeFlag: parseDecimalInt(atomSplit[16]) != 0
	};
	return new Atom(params);
};

var stripV30 = function (line)
{
    /* reader */
	if (line.slice(0, 7) != 'M  V30 ')
		throw Error('Prefix invalid');
	return line.slice(7);
};

var parseAtomLineV3000 = function (line)
{
    /* reader */
	var split, subsplit, key, value, i;
	split = spaceparsplit(line);
	var params = {
		pp: new Vec2(parseFloat(split[2]), -parseFloat(split[3])),
		aam: split[5].strip()
	};
	var label = split[1].strip();
	if (label.charAt(0) == '"' && label.charAt(label.length - 1) == '"') {
		label = label.substr(1, label.length - 2); // strip qutation marks
	}
	if (label.charAt(label.length - 1) == ']') { // assume atom list
		label = label.substr(0, label.length - 1); // remove ']'
		var atomListParams = {};
		atomListParams.notList = false;
		if (label.substr(0, 5) == 'NOT [') {
			atomListParams.notList = true;
			label = label.substr(5); // remove 'NOT ['
		} else if (label.charAt(0) != '[') {
			throw 'Error: atom list expected, found \'' + label + '\'';
		} else {
			label = label.substr(1); // remove '['
		}
		atomListParams.ids = labelsListToIds(label.split(','));
		params['atomList'] = new Atom.List(atomListParams);
		params['label'] = 'L#';
	} else {
		params['label'] = label;
	}
	split.splice(0, 6);
	for (i = 0; i < split.length; ++i) {
		subsplit = splitonce(split[i], '=');
		key = subsplit[0];
		value = subsplit[1];
		if (key in fmtInfo.v30atomPropMap) {
			var ival = parseDecimalInt(value);
			if (key == 'VAL') {
				if (ival == 0)
					continue;
				if (ival == -1)
					ival = 0;
			}
			params[fmtInfo.v30atomPropMap[key]] = ival;
		} else if (key == 'RGROUPS') {
			value = value.strip().substr(1, value.length - 2);
			var rgrsplit = value.split(' ').slice(1);
			params.rglabel = 0;
			for (var j = 0; j < rgrsplit.length; ++j) {
				params.rglabel |= 1 << (rgrsplit[j] - 1);
			}
		} else if (key == 'ATTCHPT') {
			params.attpnt = value.strip() - 0;
		}
	}
	return new Atom(params);
};

var parseBondLineV3000 = function (line)
{
    /* reader */
	var split, subsplit, key, value, i;
	split = spaceparsplit(line);
	var params = {
		begin: parseDecimalInt(split[2]) - 1,
		end: parseDecimalInt(split[3]) - 1,
		type: fmtInfo.bondTypeMap[parseDecimalInt(split[1])]
	};
	split.splice(0, 4);
	for (i = 0; i < split.length; ++i) {
		subsplit = splitonce(split[i], '=');
		key = subsplit[0];
		value = subsplit[1];
		if (key == 'CFG') {
			params.stereo = fmtInfo.v30bondStereoMap[parseDecimalInt(value)];
			if (params.type == Bond.PATTERN.TYPE.DOUBLE && params.stereo == Bond.PATTERN.STEREO.EITHER)
				params.stereo = Bond.PATTERN.STEREO.CIS_TRANS;
		} else if (key == 'TOPO') {
			params.topology = fmtInfo.bondTopologyMap[parseDecimalInt(value)];
		} else if (key == 'RXCTR') {
			params.reactingCenterStatus = parseDecimalInt(value);
		} else if (key == 'STBOX') {
			params.stereoCare = parseDecimalInt(value);
		}
	}
	return new Bond(params);
};

var parseBondLine = function (bondLine)
{
    /* reader */
	var bondSplit = partitionLine(bondLine, fmtInfo.bondLinePartition);
	var params =
	{
		begin: parseDecimalInt(bondSplit[0]) - 1,
		end: parseDecimalInt(bondSplit[1]) - 1,
		type: fmtInfo.bondTypeMap[parseDecimalInt(bondSplit[2])],
		stereo: fmtInfo.bondStereoMap[parseDecimalInt(bondSplit[3])],
		topology: fmtInfo.bondTopologyMap[parseDecimalInt(bondSplit[5])],
		reactingCenterStatus: parseDecimalInt(bondSplit[6])
	};

	return new Bond(params);
};

var parseAtomListLine = function (/* string */atomListLine)
{
    /* reader */
	var split = partitionLine(atomListLine, fmtInfo.atomListHeaderPartition);

	var number = parseDecimalInt(split[0]) - 1;
	var notList = (split[2].strip() == 'T');
	var count = parseDecimalInt(split[4].strip());

	var ids = atomListLine.slice(fmtInfo.atomListHeaderLength);
	var list = [];
	var itemLength = fmtInfo.atomListHeaderItemLength;
	for (var i = 0; i < count; ++i)
		list[i] = parseDecimalInt(ids.slice(i * itemLength, (i + 1) * itemLength - 1));

	return {
		'aid': number,
		'atomList': new Atom.List({
			'notList': notList,
			'ids': list
		})
	};
};

var readKeyValuePairs = function (str, /* bool */ valueString)
{
    /* reader */
	var ret = {};
	var partition = partitionLineFixed(str, 3, true);
	var count = parseDecimalInt(partition[0]);
	for (var i = 0; i < count; ++i)
		ret[parseDecimalInt(partition[2 * i + 1]) - 1] =
			valueString ? partition[2 * i + 2].strip() :
			parseDecimalInt(partition[2 * i + 2]);
	return ret;
};

var readKeyMultiValuePairs = function (str, /* bool */ valueString)
{
    /* reader */
	var ret = [];
	var partition = partitionLineFixed(str, 3, true);
	var count = parseDecimalInt(partition[0]);
	for (var i = 0; i < count; ++i)
		ret.push([
			parseDecimalInt(partition[2 * i + 1]) - 1,
				valueString ? partition[2 * i + 2].strip() : parseDecimalInt(partition[2 * i + 2])
			]);
	return ret;
};

var labelsListToIds = function (labels)
{
    /* reader */
	var ids = [];
	for (var i = 0; i < labels.length; ++i) {
		ids.push(element.getElementByLabel(labels[i].strip()));
	}
	return ids;
};

var parsePropertyLineAtomList = function (hdr, lst)
{
    /* reader */
	var aid = parseDecimalInt(hdr[1]) - 1;
	var count = parseDecimalInt(hdr[2]);
	var notList = hdr[4].strip() == 'T';
	var ids = labelsListToIds(lst.slice(0, count));
	var ret = {};
	ret[aid] = new Atom.List({
		'notList': notList,
		'ids': ids
	});
	return ret;
};

var initSGroup = function (sGroups, propData)
{
    /* reader */
	var kv = readKeyValuePairs(propData, true);
	for (var key in kv) {
		var type = kv[key];
		if (!(type in SGroup.TYPES))
			throw new Error('Unsupported S-group type');
		var sg = new SGroup(type);
		sg.number = key;
		sGroups[key] = sg;
	}
};

var applySGroupProp = function (sGroups, propName, propData, numeric, core)
{
	var kv = readKeyValuePairs(propData, !(numeric));
	for (var key in kv) {
		// "core" properties are stored directly in an sgroup, not in sgroup.data
		(core ? sGroups[key] : sGroups[key].data) [propName] = kv[key];
	}
};

var toIntArray = function (strArray)
{
    /* reader */
	var ret = [];
	for (var j = 0; j < strArray.length; ++j)
		ret[j] = parseDecimalInt(strArray[j]);
	return ret;
};

var applySGroupArrayProp = function (sGroups, propName, propData, shift)
{
    /* reader */
	var sid = parseDecimalInt(propData.slice(1, 4)) - 1;
	var num = parseDecimalInt(propData.slice(4, 8));
	var part = toIntArray(partitionLineFixed(propData.slice(8), 3, true));

	if (part.length != num)
		throw new Error('File format invalid');
	if (shift) {
		util.apply(part, function (v) {
			return v + shift;
		});
	}
	sGroups[sid][propName] = sGroups[sid][propName].concat(part);
};

var applyDataSGroupName = function (sg, name) {
    /* reader */
	sg.data.fieldName = name;
};

var applyDataSGroupQuery = function (sg, query) {
    /* reader */
	sg.data.query = query;
};

var applyDataSGroupQueryOp = function (sg, queryOp) {
    /* reader */
	sg.data.queryOp = queryOp;
};

var applyDataSGroupDesc = function (sGroups, propData) {
    /* reader */
	var split = partitionLine(propData, [4,31,2,20,2,3], false);
	var id = parseDecimalInt(split[0]) - 1;
	var fieldName = split[1].strip();
	var fieldType = split[2].strip();
	var units = split[3].strip();
	var query = split[4].strip();
	var queryOp = split[5].strip();
	var sGroup = sGroups[id];
	sGroup.data.fieldType = fieldType;
	sGroup.data.fieldName = fieldName;
	sGroup.data.units = units;
	sGroup.data.query = query;
	sGroup.data.queryOp = queryOp;
};

var applyDataSGroupInfo = function (sg, propData) {
    /* reader */
	var split = partitionLine(propData, [10/*x.x*/,10/*y.y*/,4/* eee*/,1/*f*/,1/*g*/,1/*h*/,3/* i */,3/*jjj*/,3/*kkk*/,3/*ll*/,2/*m*/,3/*n*/,2/*oo*/], false);

	var x = parseFloat(split[0]);
	var y = parseFloat(split[1]);
	var attached = split[3].strip() == 'A';
	var absolute = split[4].strip() == 'A';
	var showUnits = split[5].strip() == 'U';
	var nCharsToDisplay = split[7].strip();
	nCharsToDisplay = nCharsToDisplay == 'ALL' ? -1 : parseDecimalInt(nCharsToDisplay);
	var tagChar = split[10].strip();
	var daspPos = parseDecimalInt(split[11].strip());

	sg.pp = new Vec2(x, -y);
	sg.data.attached = attached;
	sg.data.absolute = absolute;
	sg.data.showUnits = showUnits;
	sg.data.nCharsToDisplay = nCharsToDisplay;
	sg.data.tagChar = tagChar;
	sg.data.daspPos = daspPos;
};

var applyDataSGroupInfoLine = function (sGroups, propData) {
    /* reader */
	var id = parseDecimalInt(propData.substr(0,4)) - 1;
	var sg = sGroups[id];
	applyDataSGroupInfo(sg, propData.substr(5));
};

var applyDataSGroupData = function (sg, data, finalize) {
    /* reader */
	sg.data.fieldValue = (sg.data.fieldValue || '') + data;
	if (finalize) {
		sg.data.fieldValue = util.stripRight(sg.data.fieldValue);
		if (sg.data.fieldValue.startsWith('"') && sg.data.fieldValue.endsWith('"'))
			sg.data.fieldValue = sg.data.fieldValue.substr(1, sg.data.fieldValue.length - 2);
		// Partially revert f556e8, from KETCHER-457 and RB with love
		// sg.data.fieldValue += '\n';
	}
};

var applyDataSGroupDataLine = function (sGroups, propData, finalize) {
    /* reader */
	var id = parseDecimalInt(propData.substr(0,5)) - 1;
	var data = propData.substr(5);
	var sg = sGroups[id];
	applyDataSGroupData(sg, data, finalize);
};

var parsePropertyLines = function (ctab, ctabLines, shift, end, sGroups, rLogic)
{
    /* reader */
	var props = new Map();
	while (shift < end)
	{
		var line = ctabLines[shift];
		if (line.charAt(0) == 'A') {
			if (!props.get('label'))
				props.set('label', new Map());
			props.get('label').set(parseDecimalInt(line.slice(3, 6)) - 1, ctabLines[++shift]);
		} else if (line.charAt(0) == 'M') {
			var type = line.slice(3, 6);
			var propertyData = line.slice(6);
			if (type == 'END') {
				break;
			} else if (type == 'CHG') {
				if (!props.get('charge'))
					props.set('charge', new Map());
				props.get('charge').update(readKeyValuePairs(propertyData));
			} else if (type == 'RAD') {
				if (!props.get('radical'))
					props.set('radical', new Map());
				props.get('radical').update(readKeyValuePairs(propertyData));
			} else if (type == 'ISO') {
				if (!props.get('isotope'))
					props.set('isotope', new Map());
				props.get('isotope').update(readKeyValuePairs(propertyData));
			} else if (type == 'RBC') {
				if (!props.get('ringBondCount'))
					props.set('ringBondCount', new Map());
				props.get('ringBondCount').update(readKeyValuePairs(propertyData));
			} else if (type == 'SUB') {
				if (!props.get('substitutionCount'))
					props.set('substitutionCount', new Map());
				props.get('substitutionCount').update(readKeyValuePairs(propertyData));
			} else if (type == 'UNS') {
				if (!props.get('unsaturatedAtom'))
					props.set('unsaturatedAtom', new Map());
				props.get('unsaturatedAtom').update(readKeyValuePairs(propertyData));
				// else if (type == "LIN") // link atom
			} else if (type == 'RGP') { // rgroup atom
				if (!props.get('rglabel'))
					props.set('rglabel', new Map());
				var rglabels = props.get('rglabel');
				var a2rs = readKeyMultiValuePairs(propertyData);
				for (var a2ri = 0; a2ri < a2rs.length; a2ri++) {
					var a2r = a2rs[a2ri];
					rglabels.set(a2r[0], (rglabels.get(a2r[0]) || 0) | (1 << (a2r[1] - 1)));
				}
			} else if (type == 'LOG') { // rgroup atom
				propertyData = propertyData.slice(4);
				var rgid = parseDecimalInt(propertyData.slice(0,3).strip());
				var iii = parseDecimalInt(propertyData.slice(4,7).strip());
				var hhh = parseDecimalInt(propertyData.slice(8,11).strip());
				var ooo = propertyData.slice(12).strip();
				var logic = {};
				if (iii > 0)
					logic.ifthen = iii;
				logic.resth = hhh == 1;
				logic.range = ooo;
				rLogic[rgid] = logic;
			} else if (type == 'APO') {
				if (!props.get('attpnt'))
					props.set('attpnt', new Map());
				props.get('attpnt').update(readKeyValuePairs(propertyData));
			} else if (type == 'ALS') { // atom list
				if (!props.get('atomList'))
					props.set('atomList', new Map());
				var list = parsePropertyLineAtomList(
				partitionLine(propertyData, [1,3,3,1,1,1]),
				partitionLineFixed(propertyData.slice(10), 4, false));
				props.get('atomList').update(
					list);
				if (!props.get('label'))
					props.set('label', new Map());
				for (var aid in list) props.get('label').set(aid, 'L#');
			} else if (type == 'STY') { // introduce s-group
				initSGroup(sGroups, propertyData);
			} else if (type == 'SST') {
				applySGroupProp(sGroups, 'subtype', propertyData);
			} else if (type == 'SLB') {
				applySGroupProp(sGroups, 'label', propertyData, true);
			} else if (type == 'SPL') {
				applySGroupProp(sGroups, 'parent', propertyData, true, true);
			} else if (type == 'SCN') {
				applySGroupProp(sGroups, 'connectivity', propertyData);
			} else if (type == 'SAL') {
				applySGroupArrayProp(sGroups, 'atoms', propertyData, -1);
			} else if (type == 'SBL') {
				applySGroupArrayProp(sGroups, 'bonds', propertyData, -1);
			} else if (type == 'SPA') {
				applySGroupArrayProp(sGroups, 'patoms', propertyData, -1);
			} else if (type == 'SMT') {
				var sid = parseDecimalInt(propertyData.slice(0, 4)) - 1;
				sGroups[sid].data.subscript = propertyData.slice(4).strip();
			} else if (type == 'SDT') {
				applyDataSGroupDesc(sGroups, propertyData);
			} else if (type == 'SDD') {
				applyDataSGroupInfoLine(sGroups, propertyData);
			} else if (type == 'SCD') {
				applyDataSGroupDataLine(sGroups, propertyData, false);
			} else if (type == 'SED') {
				applyDataSGroupDataLine(sGroups, propertyData, true);
			}
		}
		++shift;
	}
	return props;
};

var applyAtomProp = function (atoms /* Pool */, values /* Map */, propId /* string */, clean /* boolean */)
{
    /* reader */
	values.each(function (aid, propVal){
		atoms.get(aid)[propId] = propVal;
	});
};

var addGroup = function (mol, sg, atomMap) {
    // add the group to the molecule
    sg.id = mol.sgroups.add(sg);

    // apply type-specific post-processing
    sg.postLoad(mol, atomMap);

    // mark atoms in the group as belonging to it
    for (var s = 0; s < sg.atoms.length; ++s)
        if (mol.atoms.has(sg.atoms[s]))
            Set.add(mol.atoms.get(sg.atoms[s]).sgs, sg.id);

    mol.sGroupForest.insert(sg.id);
    return sg.id;
};

var filterAtoms = function (atoms, map) {
    var newAtoms = [];
    for (var i = 0; i < atoms.length; ++i) {
        var aid = atoms[i];
        if (typeof (map[aid]) != 'number') {
            newAtoms.push(aid);
        } else if (map[aid] >= 0) {
            newAtoms.push(map[aid]);
        } else {
            newAtoms.push(-1);
        }
    }
    return newAtoms;
};

var removeNegative = function (atoms) {
    var newAtoms = [];
    for (var j = 0; j < atoms.length; ++j)
        if (atoms[j] >= 0)
            newAtoms.push(atoms[j]);
    return newAtoms;
};

var SGroup_filter = function (mol, sg, atomMap) {
    sg.atoms = removeNegative(filterAtoms(sg.atoms, atomMap));
};

var parseCTabV2000 = function (ctabLines, countsSplit)
{
    /* reader */
	var ctab = new Struct();
	var i;
	var atomCount = parseDecimalInt(countsSplit[0]);
	var bondCount = parseDecimalInt(countsSplit[1]);
	var atomListCount = parseDecimalInt(countsSplit[2]);
	ctab.isChiral = parseDecimalInt(countsSplit[4]) != 0;
	var stextLinesCount = parseDecimalInt(countsSplit[5]);
	var propertyLinesCount = parseDecimalInt(countsSplit[10]);

	var shift = 0;
	var atomLines = ctabLines.slice(shift, shift + atomCount);
	shift += atomCount;
	var bondLines = ctabLines.slice(shift, shift + bondCount);
	shift += bondCount;
	var atomListLines = ctabLines.slice(shift, shift + atomListCount);
	shift += atomListCount + stextLinesCount;

	var atoms = atomLines.map(parseAtomLine);
	for (i = 0; i < atoms.length; ++i)
		ctab.atoms.add(atoms[i]);
	var bonds = bondLines.map(parseBondLine);
	for (i = 0; i < bonds.length; ++i)
		ctab.bonds.add(bonds[i]);

	var atomLists = atomListLines.map(parseAtomListLine);
	atomLists.each(function (pair){
		ctab.atoms.get(pair.aid).atomList = pair.atomList;
		ctab.atoms.get(pair.aid).label = 'L#';
	});

	var sGroups = {}, rLogic = {};
	var props = parsePropertyLines(ctab, ctabLines, shift,
	Math.min(ctabLines.length, shift + propertyLinesCount), sGroups, rLogic);
	props.each(function (propId, values) {
		applyAtomProp(ctab.atoms, values, propId);
	});

	var atomMap = {};
	var sid;
	for (sid in sGroups) {
		var sg = sGroups[sid];
		if (sg.type === 'DAT' && sg.atoms.length === 0) {
			var parent = sGroups[sid].parent;
			if (parent >= 0) {
				var psg = sGroups[parent - 1];
				if (psg.type === 'GEN') {
					sg.atoms = util.array(psg.atoms);
				}
			}
		}
	}
	for (sid in sGroups) {
		addGroup(ctab, sGroups[sid], atomMap);
	}
	var emptyGroups = [];
	for (sid in sGroups) { // TODO: why do we need that?
        sGroups[sid].atoms = SGroup_filter(sGroups[sid].atoms, atomMap);
		if (sGroups[sid].atoms.length == 0 && !sGroups[sid].allAtoms)
			emptyGroups.push(sid);
	}
	for (i = 0; i < emptyGroups.length; ++i) {
		ctab.sGroupForest.remove(emptyGroups[i]);
		ctab.sgroups.remove(emptyGroups[i]);
	}
	for (var rgid in rLogic) {
		ctab.rgroups.set(rgid, new Struct.RGroup(rLogic[rgid]));
	}
	return ctab;
};

// split a line by spaces outside parentheses
var spaceparsplit = function (line)
{
    /* reader */
	var split = [], pc = 0, c, i, i0 = -1;
	var line_array = line.toArray(); // IE7 doesn't support line[i]
	var quoted = false;

	for (i = 0; i < line.length; ++i)
	{
		c = line_array[i];
		if (c == '(')
			pc++;
		else if (c == ')')
			pc--;
		if (c == '"')
			quoted = !quoted;
		if (!quoted && line_array[i] == ' ' && pc == 0) {
			if (i > i0 + 1)
				split.push(line.slice(i0 + 1, i));
			i0 = i;
		}
	}
	if (i > i0 + 1)
		split.push(line.slice(i0 + 1, i));
	i0 = i;
	return split;
};

var splitonce = function (line, delim)
{
    /* reader */
	var p = line.indexOf(delim);
	return [line.slice(0,p),line.slice(p + 1)];
};

var splitSGroupDef = function (line)
{
    /* reader */
	var split = [];
	var braceBalance = 0;
	var quoted = false;
	for (var i = 0; i < line.length; ++i) {
		var c = line.charAt(i);
		if (c == '"') {
			quoted = !quoted;
		} else if (!quoted) {
			if (c == '(') {
				braceBalance++;
			} else if (c == ')') {
				braceBalance--;
			} else if (c == ' ' && braceBalance == 0) {
				split.push(line.slice(0, i));
				line = line.slice(i + 1).strip();
				i = 0;
			}
		}
	}
	if (braceBalance != 0)
		throw 'Brace balance broken. S-group properies invalid!';
	if (line.length > 0)
		split.push(line.strip());
	return split;
};

var parseBracedNumberList = function (line, shift)
{
    /* reader */
	if (!line)
		return null;
	var list = [];
	line = line.strip();
	line = line.substr(1, line.length - 2);
	var split = line.split(' ');
	shift = shift || 0;
	for (var i = 1; i < split.length; ++i) { // skip the first element
		list.push(split[i] - 0 + shift);
	}
	return list;
};

var v3000parseCollection = function (ctab, ctabLines, shift)
{
    /* reader */
	shift++;
	while (ctabLines[shift].strip() != 'M  V30 END COLLECTION')
		shift++;
	shift++;
	return shift;
};

var v3000parseSGroup = function (ctab, ctabLines, sgroups, atomMap, shift)
{
    /* reader */
	var line = '';
	shift++;
	while (shift < ctabLines.length) {
		line =stripV30(ctabLines[shift++]).strip();
		if (line.strip() == 'END SGROUP')
			return shift;
		while (line.charAt(line.length - 1) == '-')
			line = (line.substr(0, line.length - 1) +
			stripV30(ctabLines[shift++])).strip();
		var split = splitSGroupDef(line);
		var type = split[1];
		var sg = new SGroup(type);
		sg.number = split[0] - 0;
		sg.type = type;
		sg.label = split[2] - 0;
		sgroups[sg.number] = sg;
		var props = {};
		for (var i = 3; i < split.length; ++i) {
			var subsplit = splitonce(split[i],'=');
			if (subsplit.length != 2) {
				throw 'A record of form AAA=BBB or AAA=(...) expected, got \'' + split[i] + '\'';
			}
			var name = subsplit[0];
			if (!(name in props))
				props[name] = [];
			props[name].push(subsplit[1]);
		}
		sg.atoms = parseBracedNumberList(props['ATOMS'][0], -1);
		if (props['PATOMS'])
			sg.patoms = parseBracedNumberList(props['PATOMS'][0], -1);
		sg.bonds = props['BONDS'] ? parseBracedNumberList(props['BONDS'][0], -1) : [];
		var brkxyzStrs = props['BRKXYZ'];
		sg.brkxyz = [];
		if (brkxyzStrs) {
			for (var j = 0; j < brkxyzStrs.length; ++j)
				sg.brkxyz.push(parseBracedNumberList(brkxyzStrs[j]));
		}
		if (props['MULT']) {
			sg.data.subscript = props['MULT'][0] - 0;
		}
		if (props['LABEL']) {
			sg.data.subscript = props['LABEL'][0].strip();
		}
		if (props['CONNECT']) {
			sg.data.connectivity = props['CONNECT'][0].toLowerCase();
		}
		if (props['FIELDDISP']) {
			applyDataSGroupInfo(sg, util.stripQuotes(props['FIELDDISP'][0]));
		}
		if (props['FIELDDATA']) {
			applyDataSGroupData(sg, props['FIELDDATA'][0], true);
		}
		if (props['FIELDNAME']) {
			applyDataSGroupName(sg, props['FIELDNAME'][0]);
		}
		if (props['QUERYTYPE']) {
			applyDataSGroupQuery(sg, props['QUERYTYPE'][0]);
		}
		if (props['QUERYOP']) {
			applyDataSGroupQueryOp(sg, props['QUERYOP'][0]);
		}
		addGroup(ctab, sg, atomMap);
	}
	throw new Error('S-group declaration incomplete.');
};

var parseCTabV3000 = function (ctabLines, norgroups)
{
    /* reader */
	var ctab = new Struct();

	var shift = 0;
	if (ctabLines[shift++].strip() != 'M  V30 BEGIN CTAB')
		throw Error('CTAB V3000 invalid');
	if (ctabLines[shift].slice(0, 13) != 'M  V30 COUNTS')
		throw Error('CTAB V3000 invalid');
	var vals = ctabLines[shift].slice(14).split(' ');
	ctab.isChiral = (parseDecimalInt(vals[4]) == 1);
	shift++;

	if (ctabLines[shift].strip() == 'M  V30 BEGIN ATOM') {
		shift++;
		var line;
		while (shift < ctabLines.length) {
			line =stripV30(ctabLines[shift++]).strip();
			if (line == 'END ATOM')
				break;
			while (line.charAt(line.length - 1) == '-')
				line = (line.substring(0, line.length - 1) +stripV30(ctabLines[shift++])).strip();
			ctab.atoms.add(parseAtomLineV3000(line));
		}

		if (ctabLines[shift].strip() == 'M  V30 BEGIN BOND')
		{
			shift++;
			while (shift < ctabLines.length) {
				line =stripV30(ctabLines[shift++]).strip();
				if (line == 'END BOND')
					break;
				while (line.charAt(line.length - 1) == '-')
					line = (line.substring(0, line.length - 1) +stripV30(ctabLines[shift++])).strip();
				ctab.bonds.add(parseBondLineV3000(line));
			}
		}

		// TODO: let sections follow in arbitrary order
		var sgroups = {};
		var atomMap = {};

		while (ctabLines[shift].strip() != 'M  V30 END CTAB') {
			if (ctabLines[shift].strip() == 'M  V30 BEGIN COLLECTION') {
				// TODO: read collection information
				shift = v3000parseCollection(ctab, ctabLines, shift);
			} else if (ctabLines[shift].strip() == 'M  V30 BEGIN SGROUP') {
				shift = v3000parseSGroup(ctab, ctabLines, sgroups, atomMap, shift);
			} else {
				throw Error('CTAB V3000 invalid');
			}
		}
	}
	if (ctabLines[shift++].strip() != 'M  V30 END CTAB')
		throw Error('CTAB V3000 invalid');

	if (!norgroups) {
		readRGroups3000(ctab, ctabLines.slice(shift));
	}

	return ctab;
};

var readRGroups3000 = function (ctab, /* string */ ctabLines) /* Struct */
{
    /* reader */
	var rfrags = {};
	var rLogic = {};
	var shift = 0;
	while (shift < ctabLines.length && ctabLines[shift].search('M  V30 BEGIN RGROUP') == 0)
	{
		var id = ctabLines[shift++].split(' ').pop();
		rfrags[id] = [];
		rLogic[id] = {};
		while (true) {
			var line = ctabLines[shift].strip();
			if (line.search('M  V30 RLOGIC') == 0) {
				line = line.slice(13);
				var rlsplit = line.strip().split(/\s+/g);
				var iii = parseDecimalInt(rlsplit[0]);
				var hhh = parseDecimalInt(rlsplit[1]);
				var ooo = rlsplit.slice(2).join(' ');
				var logic = {};
				if (iii > 0)
					logic.ifthen = iii;
				logic.resth = hhh == 1;
				logic.range = ooo;
				rLogic[id] = logic;
				shift++;
				continue;
			}
			if (line != 'M  V30 BEGIN CTAB')
				throw Error('CTAB V3000 invalid');
			for (var i = 0; i < ctabLines.length; ++i)
				if (ctabLines[shift + i].strip() == 'M  V30 END CTAB')
					break;
			var lines = ctabLines.slice(shift, shift + i + 1);
			var rfrag = parseCTabV3000(lines, true);
			rfrags[id].push(rfrag);
			shift = shift + i + 1;
			if (ctabLines[shift].strip() == 'M  V30 END RGROUP') {
				shift++;
				break;
			}
		}
	}

	for (var rgid in rfrags) {
		for (var j = 0; j < rfrags[rgid].length; ++j) {
			var rg = rfrags[rgid][j];
			rg.rgroups.set(rgid, new Struct.RGroup(rLogic[rgid]));
			var frid = rg.frags.add(new Struct.Fragment());
			rg.rgroups.get(rgid).frags.add(frid);
			rg.atoms.each(function (aid, atom) {atom.fragment = frid;});
			rg.mergeInto(ctab);
		}
	}
};

var parseMol = function (/* string */ ctabLines) /* Struct */
{
    /* reader */
	if (ctabLines[0].search('\\$MDL') == 0) {
		return parseRg2000(ctabLines);
	}
	var struct = parseCTab(ctabLines.slice(3));
	struct.name = ctabLines[0].strip();
	return struct;
};

var parseCTab = function (/* string */ ctabLines) /* Struct */
{
    /* reader */
	var countsSplit = partitionLine(ctabLines[0], fmtInfo.countsLinePartition);
	var version = countsSplit[11].strip();
	ctabLines = ctabLines.slice(1);
	if (version == 'V2000')
		return parseCTabV2000(ctabLines, countsSplit);
	else if (version == 'V3000')
		return parseCTabV3000(ctabLines, !Molfile.loadRGroupFragments);
	else
		throw Error('Molfile version unknown: ' + version);
};

Molfile.prototype.prepareSGroups = function (skipErrors, preserveIndigoDesc) {
    var mol = this.molecule;
    var sgroups = mol.sgroups;
    var toRemove = [];
    var errors = 0;

    util.each(this.molecule.sGroupForest.getSGroupsBFS().reverse(), function (id) {
        var sg = mol.sgroups.get(id);
        var errorIgnore = false;

        try {
            sg.prepareForSaving(mol);
        } catch (ex) {
            if (!skipErrors || typeof (ex.id) != 'number')
                throw ex;
            errorIgnore = true;
        }
        if (errorIgnore ||
		    !preserveIndigoDesc && /^INDIGO_.+_DESC$/i.test(sg.data.fieldName)) {
            errors += errorIgnore;
            toRemove.push(sg.id);
        }
    }, this);
    if (errors) {
        alert('WARNING: ' + errors + ' invalid S-groups were detected. They will be omitted.');
    }

    for (var i = 0; i < toRemove.length; ++i) {
        mol.sGroupDelete(toRemove[i]);
    }
    return mol;
};

Molfile.prototype.getCTab = function (molecule, rgroups)
{
    /* saver */
	this.molecule = molecule.clone();
	this.molfile = '';
	this.writeCTab2000(rgroups);
	return this.molfile;
};

Molfile.prototype.saveMolecule = function (molecule, skipSGroupErrors, norgroups, preserveIndigoDesc)
{
    /* saver */
	this.reaction = molecule.rxnArrows.count() > 0;
	if (molecule.rxnArrows.count() > 1)
		throw new Error('Reaction may not contain more than one arrow');
	this.molfile = '';
	if (this.reaction) {
		if (molecule.rgroups.count() > 0)
			throw new Error('Unable to save the structure - reactions with r-groups are not supported at the moment');
		var components = molecule.getComponents();

		var reactants = components.reactants, products = components.products, all = reactants.concat(products);
		this.molfile = '$RXN\n\n\n\n' + util.paddedInt(reactants.length, 3) + util.paddedInt(products.length, 3) + util.paddedInt(0, 3) + '\n';
		for (var i = 0; i < all.length; ++i) {
			var saver = new Molfile(false);
			var submol = molecule.clone(all[i], null, true);
			var molfile = saver.saveMolecule(submol, false, true);
			this.molfile += '$MOL\n' + molfile;
		}
		return this.molfile;
	}

	if (molecule.rgroups.count() > 0) {
		if (norgroups) {
			molecule = molecule.getScaffold();
		} else {
			var scaffold = new Molfile(false).getCTab(molecule.getScaffold(), molecule.rgroups);
			this.molfile = '$MDL  REV  1\n$MOL\n$HDR\n\n\n\n$END HDR\n';
			this.molfile += '$CTAB\n' + scaffold + '$END CTAB\n';

			molecule.rgroups.each(function (rgid, rg){
				this.molfile += '$RGP\n';
				this.writePaddedNumber(rgid, 3);
				this.molfile += '\n';
				rg.frags.each(function (fnum, fid) {
					var group = new Molfile(false).getCTab(molecule.getFragment(fid));
					this.molfile += '$CTAB\n' + group + '$END CTAB\n';
				}, this);
				this.molfile += '$END RGP\n';
			}, this);
			this.molfile += '$END MOL\n';

			return this.molfile;
		}
	}

	this.molecule = molecule.clone();

	this.prepareSGroups(skipSGroupErrors, preserveIndigoDesc);

	this.writeHeader();

	// TODO: saving to V3000
	this.writeCTab2000();

	return this.molfile;
};

Molfile.prototype.writeHeader = function ()
{
    /* saver */

	var date = new Date();

	this.writeCR(); // TODO: write structure name
	this.writeWhiteSpace(2);
	this.write('Ketcher');
	this.writeWhiteSpace();
	this.writeCR((date.getMonth() + 1).toPaddedString(2) + date.getDate().toPaddedString(2) + (date.getFullYear() % 100).toPaddedString(2) +
	date.getHours().toPaddedString(2) + date.getMinutes().toPaddedString(2) + '2D 1   1.00000     0.00000     0');
	this.writeCR();
};

Molfile.prototype.write = function (str)
{
    /* saver */
	this.molfile += str;
};

Molfile.prototype.writeCR = function (str)
{
    /* saver */
	if (arguments.length == 0)
		str = '';

	this.molfile += str + '\n';
};

Molfile.prototype.writeWhiteSpace = function (length)
{
    /* saver */

	if (arguments.length == 0)
		length = 1;

	length.times(function ()
	{
		this.write(' ');
	}, this);
};

Molfile.prototype.writePadded = function (str, width)
{
    /* saver */
	this.write(str);
	this.writeWhiteSpace(width - str.length);
};

Molfile.prototype.writePaddedNumber = function (number, width)
{
    /* saver */

	var str = (number - 0).toString();

	this.writeWhiteSpace(width - str.length);
	this.write(str);
};

Molfile.prototype.writePaddedFloat = function (number, width, precision)
{
    /* saver */

	this.write(util.paddedFloat(number, width, precision));
};

Molfile.prototype.writeCTab2000Header = function ()
{
    /* saver */

	this.writePaddedNumber(this.molecule.atoms.count(), 3);
	this.writePaddedNumber(this.molecule.bonds.count(), 3);

	this.writePaddedNumber(0, 3);
	this.writeWhiteSpace(3);
	this.writePaddedNumber(this.molecule.isChiral ? 1 : 0, 3);
	this.writePaddedNumber(0, 3);
	this.writeWhiteSpace(12);
	this.writePaddedNumber(999, 3);
	this.writeCR(' V2000');
};

Molfile.prototype.writeCTab2000 = function (rgroups)
{
    /* saver */
	this.writeCTab2000Header();

	this.mapping = {};
	var i = 1;

	var atomList_list = [];
	var atomLabel_list = [];
	this.molecule.atoms.each(function (id, atom)
	{
		this.writePaddedFloat(atom.pp.x, 10, 4);
		this.writePaddedFloat(-atom.pp.y, 10, 4);
		this.writePaddedFloat(0, 10, 4);
		this.writeWhiteSpace();

		var label = atom.label;
		if (atom.atomList != null) {
			label = 'L';
			atomList_list.push(id);
		} else if (element.getElementByLabel(label) == null && ['A', 'Q', 'X', '*', 'R#'].indexOf(label) == -1) {
			label = 'C';
			atomLabel_list.push(id);
		}
		this.writePadded(label, 3);
		this.writePaddedNumber(0, 2);
		this.writePaddedNumber(0, 3);
		this.writePaddedNumber(0, 3);

		if (Object.isUndefined(atom.hCount))
			atom.hCount = 0;
		this.writePaddedNumber(atom.hCount, 3);

		if (Object.isUndefined(atom.stereoCare))
			atom.stereoCare = 0;
		this.writePaddedNumber(atom.stereoCare, 3);

		this.writePaddedNumber(atom.explicitValence < 0 ? 0 : (atom.explicitValence == 0 ? 15 : atom.explicitValence), 3);

		this.writePaddedNumber(0, 3);
		this.writePaddedNumber(0, 3);
		this.writePaddedNumber(0, 3);

		if (Object.isUndefined(atom.aam))
			atom.aam = 0;
		this.writePaddedNumber(atom.aam, 3);

		if (Object.isUndefined(atom.invRet))
			atom.invRet = 0;
		this.writePaddedNumber(atom.invRet, 3);

		if (Object.isUndefined(atom.exactChangeFlag))
			atom.exactChangeFlag = 0;
		this.writePaddedNumber(atom.exactChangeFlag, 3);

		this.writeCR();

		this.mapping[id] = i;
		i++;
	}, this);

	this.bondMapping = {};
	i = 1;
	this.molecule.bonds.each(function (id, bond)
	{
		this.bondMapping[id] = i++;
		this.writePaddedNumber(this.mapping[bond.begin], 3);
		this.writePaddedNumber(this.mapping[bond.end], 3);
		this.writePaddedNumber(bond.type, 3);

		if (Object.isUndefined(bond.stereo))
			bond.stereo = 0;
		this.writePaddedNumber(bond.stereo, 3);

		this.writeWhiteSpace(3);

		if (Object.isUndefined(bond.topology))
			bond.topology = 0;
		this.writePaddedNumber(bond.topology, 3);

		if (Object.isUndefined(bond.reactingCenterStatus))
			bond.reactingCenterStatus = 0;
		this.writePaddedNumber(bond.reactingCenterStatus, 3);

		this.writeCR();
	}, this);

	while (atomLabel_list.length > 0) {
		this.write('A  ');this.writePaddedNumber(atomLabel_list[0] + 1, 3);this.writeCR();
		this.writeCR(this.molecule.atoms.get(atomLabel_list[0]).label);
		atomLabel_list.splice(0, 1);
	}

	var charge_list = new Array();
	var isotope_list = new Array();
	var radical_list = new Array();
	var rglabel_list = new Array();
	var rglogic_list = new Array();
	var aplabel_list = new Array();
	var rbcount_list = new Array();
	var unsaturated_list = new Array();
	var substcount_list = new Array();

	this.molecule.atoms.each(function (id, atom)
	{
		if (atom.charge != 0)
			charge_list.push([id, atom.charge]);
		if (atom.isotope != 0)
			isotope_list.push([id, atom.isotope]);
		if (atom.radical != 0)
			radical_list.push([id, atom.radical]);
		if (atom.rglabel != null && atom.label == 'R#') { // TODO need to force rglabel=null when label is not 'R#'
			for (var rgi = 0; rgi < 32; rgi++) {
				if (atom.rglabel & (1 << rgi)) rglabel_list.push([id, rgi + 1]);
			}
		}
		if (atom.attpnt != null)
			aplabel_list.push([id, atom.attpnt]);
		if (atom.ringBondCount != 0)
			rbcount_list.push([id, atom.ringBondCount]);
		if (atom.substitutionCount != 0)
			substcount_list.push([id, atom.substitutionCount]);
		if (atom.unsaturatedAtom != 0)
			unsaturated_list.push([id, atom.unsaturatedAtom]);
	});

	if (rgroups)
		rgroups.each(function (rgid, rg) {
			if (rg.resth || rg.ifthen > 0 || rg.range.length > 0) {
				var line = '  1 ' + util.paddedInt(rgid, 3) + ' ' + util.paddedInt(rg.ifthen, 3) + ' ' + util.paddedInt(rg.resth ? 1 : 0, 3) + '   ' + rg.range;
				rglogic_list.push(line);
			}
		});

	var writeAtomPropList = function (prop_id, values)
	{
		while (values.length > 0)
		{
			var part = new Array();

			while (values.length > 0 && part.length < 8)
			{
				part.push(values[0]);
				values.splice(0, 1);
			}

			this.write(prop_id);
			this.writePaddedNumber(part.length, 3);

			part.each(function (value)
			{
				this.writeWhiteSpace();
				this.writePaddedNumber(this.mapping[value[0]], 3);
				this.writeWhiteSpace();
				this.writePaddedNumber(value[1], 3);
			}, this);

			this.writeCR();
		}
	};

	writeAtomPropList.call(this, 'M  CHG', charge_list);
	writeAtomPropList.call(this, 'M  ISO', isotope_list);
	writeAtomPropList.call(this, 'M  RAD', radical_list);
	writeAtomPropList.call(this, 'M  RGP', rglabel_list);
	for (var j = 0; j < rglogic_list.length; ++j) {
		this.write('M  LOG' + rglogic_list[j] + '\n');
	}
	writeAtomPropList.call(this, 'M  APO', aplabel_list);
	writeAtomPropList.call(this, 'M  RBC', rbcount_list);
	writeAtomPropList.call(this, 'M  SUB', substcount_list);
	writeAtomPropList.call(this, 'M  UNS', unsaturated_list);

	if (atomList_list.length > 0)
	{
		for (j = 0; j < atomList_list.length; ++j) {
			var aid = atomList_list[j];
			var atomList = this.molecule.atoms.get(aid).atomList;
			this.write('M  ALS');
			this.writePaddedNumber(aid + 1, 4);
			this.writePaddedNumber(atomList.ids.length, 3);
			this.writeWhiteSpace();
			this.write(atomList.notList ? 'T' : 'F');

			var labelList = atomList.labelList();
			for (var k = 0; k < labelList.length; ++k) {
				this.writeWhiteSpace();
				this.writePadded(labelList[k], 3);
			}
			this.writeCR();
		}
	}

	var sgmap = {}, cnt = 1, sgmapback = {};
	var sgorder = this.molecule.sGroupForest.getSGroupsBFS();
	util.each(sgorder, function (id) {
		sgmapback[cnt] = id;
		sgmap[id] = cnt++;
	}, this);
	for (var q = 1; q < cnt; ++q) { // each group on its own
		var id = sgmapback[q];
		var sgroup = this.molecule.sgroups.get(id);
		this.write('M  STY');
		this.writePaddedNumber(1, 3);
		this.writeWhiteSpace(1);
		this.writePaddedNumber(q, 3);
		this.writeWhiteSpace(1);
		this.writePadded(sgroup.type, 3);
		this.writeCR();

		// TODO: write subtype, M SST

		this.write('M  SLB');
		this.writePaddedNumber(1, 3);
		this.writeWhiteSpace(1);
		this.writePaddedNumber(q, 3);
		this.writeWhiteSpace(1);
		this.writePaddedNumber(q, 3);
		this.writeCR();

		var parentid = this.molecule.sGroupForest.parent.get(id);
		if (parentid >= 0) {
			this.write('M  SPL');
			this.writePaddedNumber(1, 3);
			this.writeWhiteSpace(1);
			this.writePaddedNumber(q, 3);
			this.writeWhiteSpace(1);
			this.writePaddedNumber(sgmap[parentid], 3);
			this.writeCR();
		}

		// connectivity
		if (sgroup.type == 'SRU' && sgroup.data.connectivity) {
			var connectivity = '';
			connectivity += ' ';
			connectivity += util.stringPadded(q.toString(), 3);
			connectivity += ' ';
			connectivity += util.stringPadded(sgroup.data.connectivity, 3, true);
			this.write('M  SCN');
			this.writePaddedNumber(1, 3);
			this.write(connectivity.toUpperCase());
			this.writeCR();
		}

		if (sgroup.type == 'SRU') {
			this.write('M  SMT ');
			this.writePaddedNumber(q, 3);
			this.writeWhiteSpace();
			this.write(sgroup.data.subscript || 'n');
			this.writeCR();
		}

		this.writeCR(sgroup.saveToMolfile(this.molecule, sgmap, this.mapping, this.bondMapping));
	}

	// TODO: write M  APO
	// TODO: write M  AAL
	// TODO: write M  RGP
	// TODO: write M  LOG

	this.writeCR('M  END');
};

var parseRxn = function (/* string[] */ ctabLines) /* Struct */
{
    /* reader */
	var split = ctabLines[0].strip().split(' ');
	if (split.length > 1 && split[1] == 'V3000')
		return parseRxn3000(ctabLines);
	else
		return parseRxn2000(ctabLines);
};

var parseRxn2000 = function (/* string[] */ ctabLines) /* Struct */
{
    /* reader */
	ctabLines = ctabLines.slice(4);
	var countsSplit = partitionLine(ctabLines[0], fmtInfo.rxnItemsPartition);
	var nReactants = countsSplit[0] - 0,
	nProducts = countsSplit[1] - 0,
	nAgents = countsSplit[2] - 0;
	ctabLines = ctabLines.slice(1); // consume counts line

	var mols = [];
	while (ctabLines.length > 0 && ctabLines[0].substr(0, 4) == '$MOL') {
		ctabLines = ctabLines.slice(1);
		var n = 0; while (n < ctabLines.length && ctabLines[n].substr(0, 4) != '$MOL') n++;
		mols.push(parseMol(ctabLines.slice(0, n)));
		ctabLines = ctabLines.slice(n);
	}
	return rxnMerge(mols, nReactants, nProducts, nAgents);
};

var parseRxn3000 = function (/* string[] */ ctabLines) /* Struct */
{
    /* reader */
	ctabLines = ctabLines.slice(4);
	var countsSplit = ctabLines[0].split(/\s+/g).slice(3);
	var nReactants = countsSplit[0] - 0,
	nProducts = countsSplit[1] - 0,
	nAgents = countsSplit.length > 2 ? countsSplit[2] - 0 : 0;

	var assert = function (condition) {
		util.assert(condition, 'CTab format invalid');
	};

	var findCtabEnd = function (i) {
		for (var j = i; j < ctabLines.length; ++j) {
			if (ctabLines[j].strip() == 'M  V30 END CTAB')
				return j;
		}
		assert(false);
	};

	var findRGroupEnd = function (i) {
		for (var j = i; j < ctabLines.length; ++j)
			if (ctabLines[j].strip() == 'M  V30 END RGROUP')
				return j;
		assert(false);
	};

	var molLinesReactants = [], molLinesProducts = [], current = null, rGroups = [];
	for (var i = 0; i < ctabLines.length; ++i) {
		var line = ctabLines[i].strip();

		if (line.startsWith('M  V30 COUNTS')) {
			// do nothing
		} else if (line == 'M  END') {
			break; // stop reading
		} else if (line == 'M  V30 BEGIN PRODUCT') {
			assert(current == null);
			current = molLinesProducts;
		} else if (line == 'M  V30 END PRODUCT') {
			assert(current === molLinesProducts);
			current = null;
		} else if (line == 'M  V30 BEGIN REACTANT') {
			assert(current == null);
			current = molLinesReactants;
		} else if (line == 'M  V30 END REACTANT') {
			assert(current === molLinesReactants);
			current = null;
		} else if (line.startsWith('M  V30 BEGIN RGROUP')) {
			assert(current == null);
			var j = findRGroupEnd(i);
			rGroups.push(ctabLines.slice(i,j + 1));
			i = j;
		} else if (line == 'M  V30 BEGIN CTAB') {
			var j = findCtabEnd(i);
			current.push(ctabLines.slice(i,j + 1));
			i = j;
		} else {
			throw new Error('line unrecognized: ' + line);
		}
	}
	var mols = [];
	var molLines = molLinesReactants.concat(molLinesProducts);
	for (var j = 0; j < molLines.length; ++j) {
		var mol = parseCTabV3000(molLines[j], countsSplit);
		mols.push(mol);
	}
	var ctab = rxnMerge(mols, nReactants, nProducts, nAgents);

	readRGroups3000(ctab, function (array) {
		var res = [];
		for (var k = 0; k < array.length; ++k) {
			res = res.concat(array[k]);
		}
		return res;
	}(rGroups));

	return ctab;
};

var rxnMerge = function (mols, nReactants, nProducts, nAgents) /* Struct */
{
    /* reader */
	var ret = new Struct();
	var bbReact = [],
	bbAgent = [],
	bbProd = [];
	var molReact = [],
	molAgent = [],
	molProd = [];
	var j;
	var bondLengthData = {cnt:0,totalLength:0};
	for (j = 0; j < mols.length; ++j) {
		var mol = mols[j];
		var bondLengthDataMol = mol.getBondLengthData();
		bondLengthData.cnt += bondLengthDataMol.cnt;
		bondLengthData.totalLength += bondLengthDataMol.totalLength;
	}
	var avgBondLength = 1 / (bondLengthData.cnt == 0 ? 1 : bondLengthData.totalLength / bondLengthData.cnt);
	for (j = 0; j < mols.length; ++j) {
		mol = mols[j];
		mol.scale(avgBondLength);
	}

	for (j = 0; j < mols.length; ++j) {
		mol = mols[j];
		var bb = mol.getCoordBoundingBoxObj();
		if (!bb)
			continue;

		var fragmentType = (j < nReactants ? FRAGMENT.REACTANT :
			(j < nReactants + nProducts ? FRAGMENT.PRODUCT :
					FRAGMENT.AGENT));
		if (fragmentType == FRAGMENT.REACTANT) {
			bbReact.push(bb);
			molReact.push(mol);
		} else if (fragmentType == FRAGMENT.AGENT) {
			bbAgent.push(bb);
			molAgent.push(mol);
		} else if (fragmentType == FRAGMENT.PRODUCT) {
			bbProd.push(bb);
			molProd.push(mol);
		}

		mol.atoms.each(function (aid, atom){
			atom.rxnFragmentType = fragmentType;
		});
	}

	// reaction fragment layout
	var xorig = 0;
	var shiftMol = function (ret, mol, bb, xorig, over) {
		var d = new Vec2(xorig - bb.min.x, over ? 1 - bb.min.y : -(bb.min.y + bb.max.y) / 2);
		mol.atoms.each(function (aid, atom){
			atom.pp.add_(d);
		});
		mol.sgroups.each(function (id, item){
			if (item.pp)
				item.pp.add_(d);
		});
		bb.min.add_(d);
		bb.max.add_(d);
		mol.mergeInto(ret);
		return bb.max.x - bb.min.x;
	};

	for (j = 0; j < molReact.length; ++j) {
		xorig += shiftMol(ret, molReact[j], bbReact[j], xorig, false) + 2.0;
	}
	xorig += 2.0;
	for (j = 0; j < molAgent.length; ++j) {
		xorig += shiftMol(ret, molAgent[j], bbAgent[j], xorig, true) + 2.0;
	}
	xorig += 2.0;

	for (j = 0; j < molProd.length; ++j) {
		xorig += shiftMol(ret, molProd[j], bbProd[j], xorig, false) + 2.0;
	}

	var bb1, bb2, x, y, bbReactAll = null, bbProdAll = null;
	for (j = 0; j <	bbReact.length - 1; ++j) {
		bb1 = bbReact[j];
		bb2 = bbReact[j + 1];

		x = (bb1.max.x + bb2.min.x) / 2;
		y = (bb1.max.y + bb1.min.y + bb2.max.y + bb2.min.y) / 4;

		ret.rxnPluses.add(new Struct.RxnPlus({'pp':new Vec2(x, y)}));
	}
	for (j = 0; j <	bbReact.length; ++j) {
		if (j == 0) {
			bbReactAll = {};
			bbReactAll.max = new Vec2(bbReact[j].max);
			bbReactAll.min = new Vec2(bbReact[j].min);
		} else {
			bbReactAll.max = Vec2.max(bbReactAll.max, bbReact[j].max);
			bbReactAll.min = Vec2.min(bbReactAll.min, bbReact[j].min);
		}
	}
	for (j = 0; j <	bbProd.length - 1; ++j) {
		bb1 = bbProd[j];
		bb2 = bbProd[j + 1];

		x = (bb1.max.x + bb2.min.x) / 2;
		y = (bb1.max.y + bb1.min.y + bb2.max.y + bb2.min.y) / 4;

		ret.rxnPluses.add(new Struct.RxnPlus({'pp':new Vec2(x, y)}));
	}
	for (j = 0; j <	bbProd.length; ++j) {
		if (j == 0) {
			bbProdAll = {};
			bbProdAll.max = new Vec2(bbProd[j].max);
			bbProdAll.min = new Vec2(bbProd[j].min);
		} else {
			bbProdAll.max = Vec2.max(bbProdAll.max, bbProd[j].max);
			bbProdAll.min = Vec2.min(bbProdAll.min, bbProd[j].min);
		}
	}
	bb1 = bbReactAll;
	bb2 = bbProdAll;
	if (!bb1 && !bb2) {
		ret.rxnArrows.add(new Struct.RxnArrow({'pp':new Vec2(0, 0)}));
	} else {
		var v1 = bb1 ? new Vec2(bb1.max.x, (bb1.max.y + bb1.min.y) / 2) : null;
		var v2 = bb2 ? new Vec2(bb2.min.x, (bb2.max.y + bb2.min.y) / 2) : null;
		var defaultOffset = 3;
		if (!v1)
			v1 = new Vec2(v2.x - defaultOffset, v2.y);
		if (!v2)
			v2 = new Vec2(v1.x + defaultOffset, v1.y);
		ret.rxnArrows.add(new Struct.RxnArrow({ 'pp': Vec2.lc2(v1, 0.5, v2, 0.5 ) }));
	}
	ret.isReaction = true;
	return ret;
};

var rgMerge = function (scaffold, rgroups) /* Struct */
{
    /* reader */
	var ret = new Struct();

	scaffold.mergeInto(ret, null, null, false, true);
	for (var rgid in rgroups) {
		for (var j = 0; j < rgroups[rgid].length; ++j) {
			var ctab = rgroups[rgid][j];
			ctab.rgroups.set(rgid, new Struct.RGroup());
			var frid = ctab.frags.add(new Struct.Fragment());
			ctab.rgroups.get(rgid).frags.add(frid);
			ctab.atoms.each(function (aid, atom) {atom.fragment = frid;});
			ctab.mergeInto(ret);
		}
	}

	return ret;
};

var parseRg2000 = function (/* string[] */ ctabLines) /* Struct */
{
	ctabLines = ctabLines.slice(7);
	if (ctabLines[0].strip() != '$CTAB')
		throw new Error('RGFile format invalid');
	var i = 1; while (ctabLines[i].charAt(0) != '$') i++;
	if (ctabLines[i].strip() != '$END CTAB')
		throw new Error('RGFile format invalid');
	var coreLines = ctabLines.slice(1, i);
	ctabLines = ctabLines.slice(i + 1);
	var fragmentLines = {};
	while (true) {
		if (ctabLines.length == 0)
			throw new Error('Unexpected end of file');
		var line = ctabLines[0].strip();
		if (line == '$END MOL') {
			ctabLines = ctabLines.slice(1);
			break;
		}
		if (line != '$RGP')
			throw new Error('RGFile format invalid');
		var rgid = ctabLines[1].strip() - 0;
		fragmentLines[rgid] = [];
		ctabLines = ctabLines.slice(2);
		while (true) {
			if (ctabLines.length == 0)
				throw new Error('Unexpected end of file');
			line = ctabLines[0].strip();
			if (line == '$END RGP') {
				ctabLines = ctabLines.slice(1);
				break;
			}
			if (line != '$CTAB')
				throw new Error('RGFile format invalid');
			i = 1; while (ctabLines[i].charAt(0) != '$') i++;
			if (ctabLines[i].strip() != '$END CTAB')
				throw new Error('RGFile format invalid');
			fragmentLines[rgid].push(ctabLines.slice(1, i));
			ctabLines = ctabLines.slice(i + 1);
		}
	}

	var core = parseCTab(coreLines), frag = {};
	if (Molfile.loadRGroupFragments) {
		for (var id in fragmentLines) {
			frag[id] = [];
			for (var j = 0; j < fragmentLines[id].length; ++j) {
				frag[id].push(parseCTab(fragmentLines[id][j]));
			}
		}
	}
	return rgMerge(core, frag);
};

module.exports = {
	stringify: function (molecule, options) {
		var opts = options || {};
		return new Molfile(opts.v3000).saveMolecule(molecule, opts.ignoreErrors,
		                                            opts.noRgroups, opts.preserveIndigoDesc);
	},
	parse: function (str) {
		return new Molfile().parseCTFile(str);
	}
};

},{"../util":40,"../util/map":41,"../util/set":43,"../util/vec2":44,"./atom":8,"./bond":9,"./element":12,"./sgroup":15,"./struct":18}],14:[function(require,module,exports){
var Map = require('../util/map');
var Set = require('../util/set');
var util = require('../util');

var SGroupForest = function (molecule) {
	this.parent = new Map(); // child id -> parent id
	this.children = new Map(); // parent id -> list of child ids
	this.children.set(-1, []); // extra root node
	this.molecule = molecule;
}

// returns an array or s-group ids in the order of breadth-first search
SGroupForest.prototype.getSGroupsBFS = function () {
	var order = [], queue = [], id = -1;
	queue = util.array(this.children.get(-1));
	while (queue.length > 0) {
		var id = queue.shift();
		queue = queue.concat(this.children.get(id));
		order.push(id);
	}
	return order;
}

SGroupForest.prototype.getAtomSets = function () {
	return this.molecule.sgroups.map(function (sgid, sgroup){
		return Set.fromList(sgroup.atoms);
	});
}

SGroupForest.prototype.getAtomSetRelations = function (newId, atoms /* Set */, atomSets /* Map of Set */) {
	// find the lowest superset in the hierarchy
	var isStrictSuperset = new Map(), isSubset = new Map();
	var atomSets = this.getAtomSets();
	atomSets.unset(newId);
	atomSets.each(function (id, atomSet) {
		isSubset.set(id, Set.subset(atoms, atomSet));
		isStrictSuperset.set(id, Set.subset(atomSet, atoms) && !Set.eq(atomSet, atoms));
	}, this);
	var parents = atomSets.findAll(function (id) {
		if (!isSubset.get(id))
			return false;
		if (util.findIndex(this.children.get(id), function (childId) {
			return isSubset.get(childId);
		}, this) >= 0) {
			return false;
		}
		return true;
	}, this);
	util.assert(parents.length <= 1); // there should be only one parent
	var children = atomSets.findAll(function (id, set) {
		return isStrictSuperset.get(id) && !isStrictSuperset.get(this.parent.get(id));
	}, this);
	return {
		'children': children,
		'parent': parents.length === 0 ? -1 : parents[0]
	};
}

SGroupForest.prototype.getPathToRoot = function (sgid) {
	var path = [];
	for (var id = sgid; id >= 0; id = this.parent.get(id)) {
		util.assert(path.indexOf(id) < 0, 'SGroupForest: loop detected');
		path.push(id);
	}
	return path;
}

SGroupForest.prototype.validate = function () {
	var atomSets = this.getAtomSets();
	this.molecule.sgroups.each(function (id) {
		this.getPathToRoot(id); // this will throw an exception if there is a loop in the path to root
	}, this);

	var valid = true;
	// 1) child group's atom set is a subset of the parent one's
	this.parent.each(function (id, parentId) {
		if (parentId >= 0 && !Set.subset(atomSets.get(id), atomSets.get(parentId)))
			valid = false;
	}, this);

	// 2) siblings have disjoint atom sets
	this.children.each(function (parentId) {
		var list = this.children.get(parentId);
		for (var i = 0; i < list.length; ++i)
			for (var j = i + 1; j < list.length; ++j)
				if (!Set.disjoint(atomSets.get(list[i]), atomSets.get(list[j])))
					valid = false;
	}, this);
	return valid;
}

SGroupForest.prototype.insert = function (id, parent /* int, optional */, children /* [int], optional */) {
	util.assert(!this.parent.has(id), 'sgid already present in the forest');
	util.assert(!this.children.has(id), 'sgid already present in the forest');

	util.assert(this.validate(), 's-group forest invalid');
	var atomSets = this.getAtomSets();
	var atoms = Set.fromList(this.molecule.sgroups.get(id).atoms);
	if (util.isUndefined(parent) || util.isUndefined(children)) { // if these are not provided, deduce automatically
		var guess = this.getAtomSetRelations(id, atoms, atomSets);
		parent = guess.parent;
		children = guess.children;
	}

	// TODO: make children Map<int, Set> instead of Map<int, []>?
	util.each(children, function (childId){ // reset parent links
		util.assert(util.arrayRemoveByValue(this.children.get(this.parent.get(childId)), childId) === 1);
		this.parent.set(childId, id);
	}, this);
	this.children.set(id, children);
	this.parent.set(id, parent);
	this.children.get(parent).push(id);
	util.assert(this.validate(), 's-group forest invalid');
	return {parent: parent, children: children};
}

SGroupForest.prototype.remove = function (id) {
	util.assert(this.parent.has(id), 'sgid is not in the forest');
	util.assert(this.children.has(id), 'sgid is not in the forest');

	util.assert(this.validate(), 's-group forest invalid');
	var parentId = this.parent.get(id);
	util.each(this.children.get(id), function (childId){ // reset parent links
		this.parent.set(childId, parentId);
		this.children.get(parentId).push(childId);
	}, this);
	util.assert(util.arrayRemoveByValue(this.children.get(parentId), id) === 1);
	this.children.unset(id);
	this.parent.unset(id);
	util.assert(this.validate(), 's-group forest invalid');
}

module.exports = SGroupForest;

},{"../util":40,"../util/map":41,"../util/set":43}],15:[function(require,module,exports){
(function (global){
var Box2Abs = require('../util/box2abs');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');

var Atom = require('./atom');
var Bond = require('./bond');

var rnd = global.rnd = global.rnd || {};

var SGroup = function (type) {
	if (!type || !(type in SGroup.TYPES))
		throw new Error('Invalid or unsupported s-group type');

	this.type = type;
	this.id = -1;
	SGroup.equip(this, type);
	this.label = -1;
	this.bracketBox = null;
	this.bracketDir = new Vec2(1,0);
	this.areas = [];

	this.highlight = false;
	this.highlighting = null;
	this.selected = false;
	this.selectionPlate = null;

	this.atoms = [];
	this.patoms = [];
	this.bonds = [];
	this.xBonds = [];
	this.neiAtoms = [];
	this.pp = null;
	this.data = {
		'mul': 1, // multiplication count for MUL group
		'connectivity': 'ht', // head-to-head, head-to-tail or either-unknown
		'name': '',
		'subscript': 'n',

		// data s-group fields
		'attached': false,
		'absolute': true,
		'showUnits': false,
		'nCharsToDisplay': -1,
		'tagChar': '',
		'daspPos': 1,
		'fieldType': 'F',
		'fieldName': '',
		'fieldValue': '',
		'units': '',
		'query': '',
		'queryOp': ''
	}
};

// TODO: these methods should be overridden
//      and should only accept valid attributes for each S-group type.
//      The attributes should be accessed via these methods only and not directly through this.data.
// stub
SGroup.prototype.getAttr = function (attr) {
	return this.data[attr];
};

// TODO: should be group-specific
SGroup.prototype.getAttrs = function () {
	var attrs = {};
	for (var attr in this.data)
		attrs[attr] = this.data[attr];
	return attrs;
};

// stub
SGroup.prototype.setAttr = function (attr, value) {
	var oldValue = this.data[attr];
	this.data[attr] = value;
	return oldValue;
};

// stub
SGroup.prototype.checkAttr = function (attr, value) {
	return this.data[attr] == value;
};

SGroup.equip = function (sgroup, type) {
	var impl = SGroup.TYPES[type];
	for (var method in impl)
		sgroup[method] = impl[method];
};

SGroup.numberArrayToString = function (numbers, map) {
	var str = util.stringPadded(numbers.length, 3);
	for (var i = 0; i < numbers.length; ++i) {
		str += ' ' + util.stringPadded(map[numbers[i]], 3);
	}
	return str;
};


SGroup.bracketsToMolfile = function (mol, sg, idstr) {
	var inBonds = [], xBonds = [];
	var atomSet = Set.fromList(sg.atoms);
	SGroup.getCrossBonds(inBonds, xBonds, mol, atomSet);
	SGroup.bracketPos(sg, null, mol, xBonds);
	var bb = sg.bracketBox;
	var d = sg.bracketDir, n = d.rotateSC(1, 0);
	var brackets = SGroup.getBracketParameters(mol, xBonds, atomSet, bb, d, n, null, sg.id);
	var lines = [];
	for (var i = 0; i < brackets.length; ++i) {
		var bracket = brackets[i];
		var a0 = bracket.c.addScaled(bracket.n, -0.5 * bracket.h).yComplement();
		var a1 = bracket.c.addScaled(bracket.n, 0.5 * bracket.h).yComplement();
		var line = 'M  SDI ' + idstr + util.paddedInt(4, 3);
		var coord = [a0.x, a0.y, a1.x, a1.y];
		for (var j = 0; j < coord.length; ++j) {
			line += util.paddedFloat(coord[j], 10, 4);
		}
		lines.push(line);
	}
	return lines;
};

var filterAtoms = function (atoms, map) {
	var newAtoms = [];
	for (var i = 0; i < atoms.length; ++i) {
		var aid = atoms[i];
		if (typeof(map[aid]) != 'number') {
			newAtoms.push(aid);
		} else if (map[aid] >= 0) {
			newAtoms.push(map[aid]);
		} else {
			newAtoms.push(-1);
		}
	}
	return newAtoms;
};

var removeNegative = function (atoms) {
    var newAtoms = [];
    for (var j = 0; j < atoms.length; ++j)
        if (atoms[j] >= 0)
            newAtoms.push(atoms[j]);
    return newAtoms;
};

SGroup.clone = function (sgroup, aidMap, bidMap)
{
	var cp = new SGroup(sgroup.type);

	for (var field in sgroup.data) { // TODO: remove all non-primitive properties from 'data'
		cp.data[field] = sgroup.data[field];
	}
	cp.atoms = util.mapArray(sgroup.atoms, aidMap);
	cp.pp = sgroup.pp;
	cp.bracketBox = sgroup.bracketBox;
	cp.patoms = null;
	cp.bonds = null;
	cp.allAtoms = sgroup.allAtoms;
	return cp;
};

SGroup.addAtom = function (sgroup, aid)
{
	sgroup.atoms.push(aid);
};

SGroup.removeAtom = function (sgroup, aid)
{
	for (var i = 0; i < sgroup.atoms.length; ++i) {
		if (sgroup.atoms[i] === aid) {
			sgroup.atoms.splice(i, 1);
			return;
		}
	}
	throw new Error('The atom is not found in the given s-group');
};

SGroup.getCrossBonds = function (inBonds, xBonds, mol, parentAtomSet) {
	mol.bonds.each(function (bid, bond){
		if (Set.contains(parentAtomSet, bond.begin) && Set.contains(parentAtomSet, bond.end)) {
			if (!util.isNull(inBonds))
				inBonds.push(bid);
		} else if (Set.contains(parentAtomSet, bond.begin) || Set.contains(parentAtomSet, bond.end)) {
			if (!util.isNull(xBonds))
				xBonds.push(bid);
		}
	}, this);
};

SGroup.bracketPos = function (sg, render, mol, xbonds) {
	var atoms = sg.atoms;
	if (!xbonds || xbonds.length !== 2) {
		sg.bracketDir = new Vec2(1, 0);
	} else {
		var b1 = mol.bonds.get(xbonds[0]), b2 = mol.bonds.get(xbonds[1]);
		var p1 = b1.getCenter(mol), p2 = b2.getCenter(mol);
		sg.bracketDir = Vec2.diff(p2, p1).normalized();
	}
	var d = sg.bracketDir;
	var n = d.rotateSC(1, 0);

	var bb = null;
	var contentBoxes = [];
	util.each(atoms, function (aid) {
		var atom = mol.atoms.get(aid);
		var bba = render ? render.ctab.atoms.get(aid).visel.boundingBox : null;
		var pos = new Vec2(atom.pp);
		if (util.isNull(bba)) {
			bba = new Box2Abs(pos, pos);
			var ext = new Vec2(0.05 * 3, 0.05 * 3);
			bba = bba.extend(ext, ext);
		} else {
			bba = bba.translate((render.offset || new Vec2()).negated()).transform(render.scaled2obj, render);
		}
		contentBoxes.push(bba);
	}, this);
	util.each(mol.sGroupForest.children.get(sg.id), function (sgid) {
		var bba = render ? render.ctab.sgroups.get(sgid).visel.boundingBox : null;
		if (util.isNull(bba))
			return; // TODO: use object box instead
		bba = bba.translate((render.offset || new Vec2()).negated()).transform(render.scaled2obj, render);
		contentBoxes.push(bba);
	}, this);
	util.each(contentBoxes, function (bba) {
		var bbb = null;
		util.each([bba.p0.x, bba.p1.x], function (x) {
			util.each([bba.p0.y, bba.p1.y], function (y) {
				var v = new Vec2(x, y);
				var p = new Vec2(Vec2.dot(v, d), Vec2.dot(v, n));
				bbb = util.isNull(bbb) ? new Box2Abs(p, p) : bbb.include(p);
			}, this);
		}, this);
		bb = util.isNull(bb) ? bbb : Box2Abs.union(bb, bbb);
	}, this);
	var vext = new Vec2(0.2, 0.4);
	if (!util.isNull(bb))
		bb = bb.extend(vext, vext);
	sg.bracketBox = bb;
};

SGroup.drawBrackets = function (set, render, sg, xbonds, atomSet, bb, d, n, lowerIndexText, upperIndexText, indexAttribute) {
	var brackets = SGroup.getBracketParameters(render.ctab.molecule, xbonds, atomSet, bb, d, n, render, sg.id);
	var ir = -1;
	for (var i = 0; i < brackets.length; ++i) {
		var bracket = brackets[i];
		var path = SGroup.drawBracket(render, render.paper, render.styles, bracket.d, bracket.n, bracket.c, bracket.w, bracket.h);
		set.push(path);
		if (ir < 0 || brackets[ir].d.x < bracket.d.x || (brackets[ir].d.x == bracket.d.x && brackets[ir].d.y > bracket.d.y))
			ir = i;
	}
	var bracketR = brackets[ir];
	var renderIndex = function (text, shift) {
		var indexPos = render.ps(bracketR.c.addScaled(bracketR.n, shift * bracketR.h));
		var indexPath = render.paper.text(indexPos.x, indexPos.y, text)
		.attr({
			'font': render.settings.font,
			'font-size': render.settings.fontszsub
		});
		if (indexAttribute)
			indexPath.attr(indexAttribute);
		var indexBox = Box2Abs.fromRelBox(util.relBox(indexPath.getBBox()));
		var t = Math.max(Vec2.shiftRayBox(indexPos, bracketR.d.negated(), indexBox), 3) + 2;
		indexPath.translateAbs(t * bracketR.d.x, t * bracketR.d.y);
		set.push(indexPath);
	};
	if (lowerIndexText) {
		renderIndex(lowerIndexText, 0.5);
	}
	if (upperIndexText) {
		renderIndex(upperIndexText, -0.5);
	}
};

SGroup.drawBracket = function (render, paper, styles, d, n, c, bracketWidth, bracketHeight) {
	bracketWidth = bracketWidth || 0.25;
	bracketHeight = bracketHeight || 1.0;
	var a0 = c.addScaled(n, -0.5 * bracketHeight);
	var a1 = c.addScaled(n, 0.5 * bracketHeight);
	var b0 = a0.addScaled(d, -bracketWidth);
	var b1 = a1.addScaled(d, -bracketWidth);

	a0 = render.obj2scaled(a0);
	a1 = render.obj2scaled(a1);
	b0 = render.obj2scaled(b0);
	b1 = render.obj2scaled(b1);

	return paper.path('M {0}, {1} L {2} , {3} L {4} , {5} L {6} , {7}',
		b0.x, b0.y, a0.x, a0.y, a1.x, a1.y, b1.x, b1.y)
	.attr(styles.sgroupBracketStyle);
};

SGroup.getBracketParameters = function (mol, xbonds, atomSet, bb, d, n, render, id) {
	var bracketParams = function (c, d, w, h) {
		this.c = c;
		this.d = d;
		this.n = d.rotateSC(1,0);
		this.w = w;
		this.h = h;
	};
	var brackets = [];
	if (xbonds.length < 2) {
		(function () {
			d = d || new Vec2(1, 0);
			n = n || d.rotateSC(1, 0);
			var bracketWidth = Math.min(0.25, bb.sz().x * 0.3);
			var cl = Vec2.lc2(d, bb.p0.x, n, 0.5 * (bb.p0.y + bb.p1.y));
			var cr = Vec2.lc2(d, bb.p1.x, n, 0.5 * (bb.p0.y + bb.p1.y));
			var bracketHeight = bb.sz().y;

			brackets.push(new bracketParams(cl, d.negated(), bracketWidth, bracketHeight), new bracketParams(cr, d, bracketWidth, bracketHeight));
		})();
	} else if (xbonds.length === 2) {
		(function () {
			var b1 = mol.bonds.get(xbonds[0]), b2 = mol.bonds.get(xbonds[1]);
			var cl0 = b1.getCenter(mol), cr0 = b2.getCenter(mol), tl = -1, tr = -1, tt = -1, tb = -1, cc = Vec2.centre(cl0, cr0);
			var dr = Vec2.diff(cr0, cl0).normalized(), dl = dr.negated(), dt = dr.rotateSC(1,0), db = dt.negated();

			util.each(mol.sGroupForest.children.get(id), function (sgid) {
				var bba = render ? render.ctab.sgroups.get(sgid).visel.boundingBox : null;
				if (util.isNull(bba))
					return; // TODO: use object box instead
				bba = bba.translate((render.offset || new Vec2()).negated()).transform(render.scaled2obj, render);
				tl = Math.max(tl, Vec2.shiftRayBox(cl0, dl, bba));
				tr = Math.max(tr, Vec2.shiftRayBox(cr0, dr, bba));
				tt = Math.max(tt, Vec2.shiftRayBox(cc, dt, bba));
				tb = Math.max(tb, Vec2.shiftRayBox(cc, db, bba));
			}, this);
			tl = Math.max(tl + 0.2, 0);
			tr = Math.max(tr + 0.2, 0);
			tt = Math.max(Math.max(tt, tb) + 0.1, 0);
			var bracketWidth = 0.25, bracketHeight = 1.5 + tt;
			brackets.push(new bracketParams(cl0.addScaled(dl, tl), dl, bracketWidth, bracketHeight),
			new bracketParams(cr0.addScaled(dr, tr), dr, bracketWidth, bracketHeight));
		})();

	} else {
		(function () {
			for (var i = 0; i < xbonds.length; ++i) {
				var b = mol.bonds.get(xbonds[i]);
				var c = b.getCenter(mol);
				var d = Set.contains(atomSet, b.begin) ? b.getDir(mol) : b.getDir(mol).negated();
				brackets.push(new bracketParams(c, d, 0.2, 1.0));
			}
		})();
	}
	return brackets;
};

SGroup.getObjBBox = function (atoms, mol)
{
	if (atoms.length == 0)
		throw new Error('Atom list is empty');

	var a0 = mol.atoms.get(atoms[0]).pp;
	var bb = new Box2Abs(a0, a0);
	for (var i = 1; i < atoms.length; ++i) {
		var aid = atoms[i];
		var atom = mol.atoms.get(aid);
		var p = atom.pp;
		bb = bb.include(p);
	}
	return bb;
};

SGroup.makeAtomBondLines = function (prefix, idstr, ids, map) {
	if (!ids)
		return [];
	var lines = [];
	for (var i = 0; i < Math.floor((ids.length + 14) / 15); ++i) {
		var rem = Math.min(ids.length - 15 * i, 15);
		var salLine = 'M  ' + prefix + ' ' + idstr + ' ' + util.paddedInt(rem, 2);
		for (var j = 0; j < rem; ++j) {
			salLine += ' ' + util.paddedInt(map[ids[i * 15 + j]], 3);
		}
		lines.push(salLine);
	}
	return lines;
};

SGroup.getAtoms = function (mol, sg) {
	if (!sg.allAtoms)
		return sg.atoms;
	var atoms = [];
	mol.atoms.each(function (aid){
		atoms.push(aid);
	});
	return atoms;
};

SGroup.getBonds = function (mol, sg) {
	var atoms = SGroup.getAtoms(mol, sg);
	var bonds = [];
	mol.bonds.each(function (bid, bond){
		if (atoms.indexOf(bond.begin) >= 0 && atoms.indexOf(bond.end) >= 0) bonds.push(bid);
	});
	return bonds;
};

var GroupMul = {
	draw: function (remol) {
		var render = remol.render;
		var set = render.paper.set();
		var inBonds = [], xBonds = [];
		var atomSet = Set.fromList(this.atoms);
		SGroup.getCrossBonds(inBonds, xBonds, remol.molecule, atomSet);
		SGroup.bracketPos(this, render, remol.molecule, xBonds);
		var bb = this.bracketBox;
		var d = this.bracketDir, n = d.rotateSC(1, 0);
		this.areas = [bb];
		SGroup.drawBrackets(set, render, this, xBonds, atomSet, bb, d, n, this.data.mul);
		return set;
	},

	saveToMolfile: function (mol, sgMap, atomMap, bondMap) {
		var idstr = util.stringPadded(sgMap[this.id], 3);

		var lines = [];
		lines = lines.concat(SGroup.makeAtomBondLines('SAL', idstr, util.idList(this.atomSet), atomMap)); // TODO: check atomSet
		lines = lines.concat(SGroup.makeAtomBondLines('SPA', idstr, util.idList(this.parentAtomSet), atomMap));
		lines = lines.concat(SGroup.makeAtomBondLines('SBL', idstr, this.bonds, bondMap));
		var smtLine = 'M  SMT ' + idstr + ' ' + this.data.mul;
		lines.push(smtLine);
		lines = lines.concat(SGroup.bracketsToMolfile(mol, this, idstr));
		return lines.join('\n');
	},

	prepareForSaving: function (mol) {
		var j;
		this.atoms.sort();
		this.atomSet = Set.fromList(this.atoms);
		this.parentAtomSet = Set.clone(this.atomSet);
		var inBonds = [];
		var xBonds = [];

		mol.bonds.each(function (bid, bond){
			if (Set.contains(this.parentAtomSet, bond.begin) && Set.contains(this.parentAtomSet, bond.end))
				inBonds.push(bid);
			else if (Set.contains(this.parentAtomSet, bond.begin) || Set.contains(this.parentAtomSet,bond.end))
				xBonds.push(bid);
		}, this);
		if (xBonds.length != 0 && xBonds.length != 2)
			throw {
				'id':this.id,
				'error-type':'cross-bond-number',
				'message':'Unsupported cross-bonds number'
			};

		var xAtom1 = -1,
		xAtom2 = -1;
		var crossBond = null;
		if (xBonds.length == 2) {
			var bond1 = mol.bonds.get(xBonds[0]);
			if (Set.contains(this.parentAtomSet, bond1.begin)) {
				xAtom1 = bond1.begin;
			} else {
				xAtom1 = bond1.end;
			}
			var bond2 = mol.bonds.get(xBonds[1]);
			if (Set.contains(this.parentAtomSet, bond2.begin)) {
				xAtom2 = bond2.begin;
			} else {
				xAtom2 = bond2.end;
			}
			crossBond = bond2;
		}

		var amap = null;
		var tailAtom = xAtom1;

		var newAtoms = [];
		for (j = 0; j < this.data.mul - 1; ++j) {
			amap = {};
			util.each(this.atoms, function (aid) {
				var atom = mol.atoms.get(aid);
				var aid2 = mol.atoms.add(new Atom(atom));
				newAtoms.push(aid2);
				this.atomSet[aid2] = 1;
				amap[aid] = aid2;
			}, this);
			util.each(inBonds, function (bid) {
				var bond = mol.bonds.get(bid);
				var newBond = new Bond(bond);
				newBond.begin = amap[newBond.begin];
				newBond.end = amap[newBond.end];
				mol.bonds.add(newBond);
			}, this);
			if (crossBond != null) {
				var newCrossBond = new Bond(crossBond);
				newCrossBond.begin = tailAtom;
				newCrossBond.end = amap[xAtom2];
				mol.bonds.add(newCrossBond);
				tailAtom = amap[xAtom1];
			}
		}

		util.each(newAtoms, function (aid) {
			util.each(mol.sGroupForest.getPathToRoot(this.id).reverse(), function (sgid) {
				mol.atomAddToSGroup(sgid, aid);
			}, this);
		}, this);
		if (tailAtom >= 0) {
			var xBond2 = mol.bonds.get(xBonds[0]);
			if (xBond2.begin == xAtom1)
				xBond2.begin = tailAtom;
			else
				xBond2.end = tailAtom;
		}

		this.bonds = xBonds;
	},

	postLoad: function (mol, atomMap)
	{
		this.data.mul = this.data.subscript - 0;
		var atomReductionMap = {};

		this.atoms = filterAtoms(this.atoms, atomMap);
		this.patoms = filterAtoms(this.patoms, atomMap);

		// mark repetitions for removal
		for (var k = 1; k < this.data.mul; ++k) {
			for (var m = 0; m < this.patoms.length; ++m) {
				var raid = this.atoms[k * this.patoms.length + m];
				if (raid < 0)
					continue;
				if (this.patoms[m] < 0) {
					throw new Error('parent atom missing');
				}
//                mol.atoms.get(raid).pp.y -= 3*k; // for debugging purposes
				atomReductionMap[raid] = this.patoms[m]; // "merge" atom in parent
			}
        }
        this.patoms = removeNegative(this.patoms);

		var patomsMap = util.identityMap(this.patoms);

		var bondsToRemove = [];
		mol.bonds.each(function (bid, bond){
			var beginIn = bond.begin in atomReductionMap;
			var endIn = bond.end in atomReductionMap;
			// if both adjacent atoms of a bond are to be merged, remove it
			if (beginIn && endIn
				 || beginIn && bond.end in patomsMap
				 || endIn && bond.begin in patomsMap) {
				bondsToRemove.push(bid);
				// if just one atom is merged, modify the bond accordingly
			} else if (beginIn) {
				bond.begin = atomReductionMap[bond.begin];
			} else if (endIn) {
				bond.end = atomReductionMap[bond.end];
			}
		}, this);

		// apply removal lists
		for (var b = 0; b < bondsToRemove.length; ++b) {
			mol.bonds.remove(bondsToRemove[b]);
		}
		for (var a in atomReductionMap) {
			mol.atoms.remove(a);
			atomMap[a] = -1;
		}
		this.atoms = this.patoms;
		this.patoms = null;
	}
};

var GroupSru = {
	draw: function (remol) {
		var render = remol.render;
		var set = render.paper.set();
		var inBonds = [], xBonds = [];
		var atomSet = Set.fromList(this.atoms);
		SGroup.getCrossBonds(inBonds, xBonds, remol.molecule, atomSet);
		SGroup.bracketPos(this, render, remol.molecule, xBonds);
		var bb = this.bracketBox;
		var d = this.bracketDir, n = d.rotateSC(1, 0);
		this.areas = [bb];
		var connectivity = this.data.connectivity || 'eu';
		if (connectivity == 'ht')
			connectivity = '';
		var subscript = this.data.subscript || 'n';
		SGroup.drawBrackets(set, render, this, xBonds, atomSet, bb, d, n, subscript, connectivity);
		return set;
	},

	saveToMolfile: function (mol, sgMap, atomMap, bondMap) {
		var idstr = util.stringPadded(sgMap[this.id], 3);

		var lines = [];
		lines = lines.concat(SGroup.makeAtomBondLines('SAL', idstr, this.atoms, atomMap));
		lines = lines.concat(SGroup.makeAtomBondLines('SBL', idstr, this.bonds, bondMap));
		lines = lines.concat(SGroup.bracketsToMolfile(mol, this, idstr));
		return lines.join('\n');
	},

	prepareForSaving: function (mol) {
		var xBonds = [];
		mol.bonds.each(function (bid, bond){
			var a1 = mol.atoms.get(bond.begin);
			var a2 = mol.atoms.get(bond.end);
			if (Set.contains(a1.sgs, this.id) && !Set.contains(a2.sgs, this.id) ||
			Set.contains(a2.sgs, this.id) && !Set.contains(a1.sgs, this.id))
				xBonds.push(bid);
		},this);
		if (xBonds.length != 0 && xBonds.length != 2)
			throw {'id':this.id, 'error-type':'cross-bond-number', 'message':'Unsupported cross-bonds number'};
		this.bonds = xBonds;
	},

	postLoad: function (mol, atomMap) {
		this.data.connectivity = (this.data.connectivity || 'EU').strip().toLowerCase();
	}
};

var GroupSup = {
	draw: function (remol) {
		var render = remol.render;
		var set = render.paper.set();
		var inBonds = [], xBonds = [];
		var atomSet = Set.fromList(this.atoms);
		SGroup.getCrossBonds(inBonds, xBonds, remol.molecule, atomSet);
		SGroup.bracketPos(this, render, remol.molecule, xBonds);
		var bb = this.bracketBox;
		var d = this.bracketDir, n = d.rotateSC(1, 0);
		this.areas = [bb];
		SGroup.drawBrackets(set, render, this, xBonds, atomSet, bb, d, n, this.data.name, null, {
			'font-style': 'italic'
		});
		return set;
	},

	saveToMolfile: function (mol, sgMap, atomMap, bondMap) {
		var idstr = util.stringPadded(sgMap[this.id], 3);

		var lines = [];
		lines = lines.concat(SGroup.makeAtomBondLines('SAL', idstr, this.atoms, atomMap));
		lines = lines.concat(SGroup.makeAtomBondLines('SBL', idstr, this.bonds, bondMap));
		if (this.data.name && this.data.name != '')
			lines.push('M  SMT ' + idstr + ' ' + this.data.name);
		return lines.join('\n');
	},

	prepareForSaving: function (mol) {
		// This code is also used for GroupSru and should be moved into a separate common method
		// It seems that such code should be used for any sgroup by this this should be checked
		var xBonds = [];
		mol.bonds.each(function (bid, bond){
			var a1 = mol.atoms.get(bond.begin);
			var a2 = mol.atoms.get(bond.end);
			if (Set.contains(a1.sgs, this.id) && !Set.contains(a2.sgs, this.id) ||
			Set.contains(a2.sgs, this.id) && !Set.contains(a1.sgs, this.id))
				xBonds.push(bid);
		},this);
		this.bonds = xBonds;
	},

	postLoad: function (mol, atomMap) {
		this.data.name = (this.data.subscript || '').strip();
		this.data.subscript = '';
	}
};

var GroupGen = {
	draw: function (remol) {
		var render = remol.render;
		var settings = render.settings;
		var styles = render.styles;
		var paper = render.paper;
		var set = paper.set();
		var inBonds = [], xBonds = [];
		var atomSet = Set.fromList(this.atoms);
		SGroup.getCrossBonds(inBonds, xBonds, remol.molecule, atomSet);
		SGroup.bracketPos(this, render, remol.molecule, xBonds);
		var bb = this.bracketBox;
		var d = this.bracketDir, n = d.rotateSC(1, 0);
		this.areas = [bb];
		SGroup.drawBrackets(set, render, this, xBonds, atomSet, bb, d, n);
		return set;
	},

	saveToMolfile: function (mol, sgMap, atomMap, bondMap) {
		var idstr = util.stringPadded(sgMap[this.id], 3);

		var lines = [];
		lines = lines.concat(SGroup.makeAtomBondLines('SAL', idstr, this.atoms, atomMap));
		lines = lines.concat(SGroup.makeAtomBondLines('SBL', idstr, this.bonds, bondMap));
		lines = lines.concat(SGroup.bracketsToMolfile(mol, this, idstr));
		return lines.join('\n');
	},

	prepareForSaving: function (mol) {
	},

	postLoad: function (mol, atomMap) {
	}
};

SGroup.getMassCentre = function (mol, atoms) {
	var c = new Vec2(); // mass centre
	for (var i = 0; i < atoms.length; ++i) {
		c = c.addScaled(mol.atoms.get(atoms[i]).pp, 1.0 / atoms.length);
	}
	return c;
};

SGroup.setPos = function (remol, sg, pos) {
	sg.pp = pos;
};

var GroupDat = {
	showValue: function (paper, pos, sg, settings) {
		var text = paper.text(pos.x, pos.y, sg.data.fieldValue)
		    .attr({
			    'font': settings.font,
			    'font-size': settings.fontsz
		    });
		var box = text.getBBox();
		var rect = paper.rect(box.x - 1, box.y - 1,
		                      box.width + 2, box.height + 2, 3, 3)
		    .attr({
			    fill: '#fff',
			    stroke: '#fff'
		    });
		var st = paper.set();
		st.push(
			rect,
			text.toFront()
		);
		return st;
	},

	draw: function (remol) {
		var render = remol.render;
		var settings = render.settings;
		var paper = render.paper;
		var set = paper.set();
		var atoms = SGroup.getAtoms(remol, this);
		var i;
		SGroup.bracketPos(this, render, remol.molecule);
		this.areas = this.bracketBox ? [this.bracketBox] : [];
		if (this.pp == null) {
			// NB: we did not pass xbonds parameter to the backetPos method above,
			//  so the result will be in the regular coordinate system
			SGroup.setPos(remol, this, this.bracketBox.p1.add(new Vec2(0.5, 0.5)));
		}
		var ps = this.pp.scaled(settings.scaleFactor);

		if (this.data.attached) {
			for (i = 0; i < atoms.length; ++i) {
				var atom = remol.atoms.get(atoms[i]);
				var p = render.ps(atom.a.pp);
				var bb = atom.visel.boundingBox;
				if (bb != null) {
					p.x = Math.max(p.x, bb.p1.x);
				}
				p.x += settings.lineWidth; // shift a bit to the right
				var name_i = this.showValue(paper, p, this, settings);
				var box_i = util.relBox(name_i.getBBox());
				name_i.translateAbs(0.5 * box_i.width, -0.3 * box_i.height);
				set.push(name_i);
				var sbox_i = Box2Abs.fromRelBox(util.relBox(name_i.getBBox()));
				sbox_i = sbox_i.transform(render.scaled2obj, render);
				this.areas.push(sbox_i);
			}
		} else {
			var name = this.showValue(paper, ps, this, settings);
			var box = util.relBox(name.getBBox());
			name.translateAbs(0.5 * box.width, -0.5 * box.height);
			set.push(name);
			var sbox = Box2Abs.fromRelBox(util.relBox(name.getBBox()));
			this.dataArea = sbox.transform(render.scaled2obj, render);
			if (!remol.sgroupData.has(this.id))
				remol.sgroupData.set(this.id, new rnd.ReDataSGroupData(this));
		}
		return set;
	},

	saveToMolfile: function (mol, sgMap, atomMap, bondMap) {
		var idstr = util.stringPadded(sgMap[this.id], 3);

		var data = this.data;
		var pp = this.pp;
		if (!data.absolute)
			pp = pp.sub(SGroup.getMassCentre(mol, this.atoms));
		var lines = [];
		lines = lines.concat(SGroup.makeAtomBondLines('SAL', idstr, this.atoms, atomMap));
		var sdtLine = 'M  SDT ' + idstr +
			' ' + util.stringPadded(data.fieldName, 30, true) +
		util.stringPadded(data.fieldType, 2) +
		util.stringPadded(data.units, 20, true) +
		util.stringPadded(data.query, 2) +
		util.stringPadded(data.queryOp, 3);
		lines.push(sdtLine);
		var sddLine = 'M  SDD ' + idstr +
			' ' + util.paddedFloat(pp.x, 10, 4) + util.paddedFloat(-pp.y, 10, 4) +
			'    ' + // ' eee'
			(data.attached ? 'A' : 'D') + // f
			(data.absolute ? 'A' : 'R') + // g
			(data.showUnits ? 'U' : ' ') + // h
			'   ' + //  i
			(data.nCharnCharsToDisplay >= 0 ? util.paddedInt(data.nCharnCharsToDisplay, 3) : 'ALL') + // jjj
			'  1   ' + // 'kkk ll '
		util.stringPadded(data.tagChar, 1) + // m
			'  ' + util.paddedInt(data.daspPos, 1) + // n
			'  '; // oo
			lines.push(sddLine);
		var val = util.normalizeNewlines(data.fieldValue).replace(/\n*$/, '');
		var charsPerLine = 69;
		val.split('\n').each(function (chars) {
			while (chars.length > charsPerLine) {
				lines.push('M  SCD ' + idstr + ' ' + chars.slice(0, charsPerLine));
				chars = chars.slice(charsPerLine);
			}
			lines.push('M  SED ' + idstr + ' ' + chars);
		});
		return lines.join('\n');
	},

	prepareForSaving: function (mol) {
		this.atoms = SGroup.getAtoms(mol, this);
	},

	postLoad: function (mol, atomMap) {
		if (!this.data.absolute)
			this.pp = this.pp.add(SGroup.getMassCentre(mol, this.atoms));
		// [NK] Temporary comment incoplete 'allAtoms' behavior
		// TODO: need ether remove 'allAtoms' flag or hadle it
		// consistently (other flags: *_KEY, *_RADICAL?)
		// var allAtomsInGroup = this.atoms.length == mol.atoms.count();
		// if (allAtomsInGroup &&
		//     (this.data.fieldName == 'MDLBG_FRAGMENT_STEREO' ||
		//      this.data.fieldName == 'MDLBG_FRAGMENT_COEFFICIENT' ||
		//      this.data.fieldName == 'MDLBG_FRAGMENT_CHARGE')) {
		// 	this.atoms = [];
		// 	this.allAtoms = true;
		// }
	}
};

SGroup.TYPES = {
	'MUL': GroupMul,
	'SRU': GroupSru,
	'SUP': GroupSup,
	'DAT': GroupDat,
	'GEN': GroupGen
};

module.exports = SGroup;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../util":40,"../util/box2abs":39,"../util/set":43,"../util/vec2":44,"./atom":8,"./bond":9}],16:[function(require,module,exports){
var Set = require('../util/set');
var Atom = require('./atom');
var Bond = require('./bond');
var CisTrans = require('./cis_trans');
var Dfs = require('./dfs');
var Stereocenters = require('./stereocenters');

var util = require('../util');

var Smiles = function ()
{
	this.smiles = '';
	this._written_atoms = [];
	this._written_components = 0;

	this.ignore_errors = false;
};

function _Atom(h_count) {
    return {
        neighbours: [],  // Array of integer pairs {a, b}
        aromatic:false,          // has aromatic bond
        lowercase:false,         // aromatic and has to be written lowercase
        chirality: 0,             // 0 means no chirality, 1 means CCW pyramid, 2 means CW pyramid
        branch_cnt: 0,            // runs from 0 to (branches - 1)
        paren_written:false,
        h_count:h_count,
        parent: 1
    };
};

// NB: only loops of length up to 6 are included here
Smiles.prototype.isBondInRing = function (bid) {
	if (util.isUndefined(this.inLoop) || util.isNull(this.inLoop))
		throw new Error('Init this.inLoop prior to calling this method');
	return this.inLoop[bid];
};

Smiles.prototype.saveMolecule = function (molecule, ignore_errors)
{
	var i, j, k;

	if (!Object.isUndefined(ignore_errors))
		this.ignore_errors = ignore_errors;

	//[RB]: KETCHER-498 (Incorrect smile-string for multiple Sgroup)
	//TODO the fix is temporary, still need to implement error handling/reporting
	//BEGIN
//    if (molecule.sgroups.count() > 0 && !this.ignore_errors)
//        throw new Error("SMILES doesn't support s-groups");
	molecule = molecule.clone();
	molecule.initHalfBonds();
	molecule.initNeighbors();
	molecule.sortNeighbors();
	molecule.setImplicitHydrogen();
	molecule.sgroups.each(function (sgid, sg) {
		if (sg.type == 'MUL') {
			try {
				sg.prepareForSaving(molecule);
			} catch(ex) {
					throw { message: 'Bad s-group (' + ex.message + ')' };
				}
		} else if (!this.ignore_errors) {
			throw new Error('SMILES data format doesn\'t support s-groups');
		}
	}, this);
	//END

	this.atoms = new Array(molecule.atoms.count());

	molecule.atoms.each(function (aid, atom)
	{
		this.atoms[aid] = _Atom(atom.implicitH);
	}, this);

	// From the SMILES specification:
	// Please note that only atoms on the following list
	// can be considered aromatic: C, N, O, P, S, As, Se, and * (wildcard).
	var allowed_lowercase = ['B', 'C', 'N', 'O', 'P', 'S', 'Se', 'As'];

	// Detect atoms that have aromatic bonds and count neighbours
	molecule.bonds.each(function (bid, bond)
	{
		if (bond.type == Bond.PATTERN.TYPE.AROMATIC)
		{
			this.atoms[bond.begin].aromatic = true;
			if (allowed_lowercase.indexOf(molecule.atoms.get(bond.begin).label) != -1)
				this.atoms[bond.begin].lowercase = true;
			this.atoms[bond.end].aromatic = true;
			if (allowed_lowercase.indexOf(molecule.atoms.get(bond.end).label) != -1)
				this.atoms[bond.end].lowercase = true;
		}
		this.atoms[bond.begin].neighbours.push({aid: bond.end, bid: bid});
		this.atoms[bond.end].neighbours.push({aid: bond.begin, bid: bid});
	}, this);

	this.inLoop = (function () {
		molecule.prepareLoopStructure();
		var bondsInLoops = Set.empty();
		molecule.loops.each(function (lid, loop) {
			if (loop.hbs.length <= 6)
				Set.mergeIn(bondsInLoops, Set.fromList(util.map(loop.hbs, function (hbid) {
					return molecule.halfBonds.get(hbid).bid;
				}, this)));
		}, this);
		var inLoop = {};
		Set.each(bondsInLoops, function (bid) {
			inLoop[bid] = 1;
		}, this);
		return inLoop;
	})();

	this._touched_cistransbonds = 0;
	this._markCisTrans(molecule);

	var components = molecule.getComponents();
	var componentsAll = components.reactants.concat(components.products);

	var walk = new Dfs(molecule, this.atoms, componentsAll, components.reactants.length);

	walk.walk();

	this.atoms.each(function (atom)
	{
		atom.neighbours.clear();
	}, this);

	// fill up neighbor lists for the stereocenters calculation
	for (i = 0; i < walk.v_seq.length; i++)
	{
		var seq_el = walk.v_seq[i];
		var v_idx = seq_el.idx;
		var e_idx = seq_el.parent_edge;
		var v_prev_idx = seq_el.parent_vertex;

		if (e_idx >= 0)
		{
			var atom = this.atoms[v_idx];

			var opening_cycles = walk.numOpeningCycles(e_idx);

			for (j = 0; j < opening_cycles; j++)
				this.atoms[v_prev_idx].neighbours.push({aid: -1, bid: -1});

			if (walk.edgeClosingCycle(e_idx))
			{
				for (k = 0; k < atom.neighbours.length; k++)
				{
					if (atom.neighbours[k].aid == -1)
					{
						atom.neighbours[k].aid = v_prev_idx;
						atom.neighbours[k].bid = e_idx;
						break;
					}
				}
				if (k == atom.neighbours.length)
					throw new Error('internal: can not put closing bond to its place');
			}
			else
			{
				atom.neighbours.push({aid: v_prev_idx, bid: e_idx});
				atom.parent = v_prev_idx;
			}
			this.atoms[v_prev_idx].neighbours.push({aid: v_idx, bid: e_idx});
		}
	}

	try {
		// detect chiral configurations
		var stereocenters = new Stereocenters(molecule, function (idx)
		{
			return this.atoms[idx].neighbours;
		}, this);
		stereocenters.buildFromBonds(this.ignore_errors);

		stereocenters.each (function (atom_idx, sc)
		{
			//if (sc.type < MoleculeStereocenters::ATOM_AND)
			//    continue;

			var implicit_h_idx = -1;

			if (sc.pyramid[3] == -1)
				implicit_h_idx = 3;
			/*
            else for (j = 0; j < 4; j++)
                if (ignored_vertices[pyramid[j]])
                {
                    implicit_h_idx = j;
                    break;
                }
                */

			var pyramid_mapping = new Array(4);
			var counter = 0;

			var atom = this.atoms[atom_idx];

			if (atom.parent != -1)
				for (k = 0; k < 4; k++)
					if (sc.pyramid[k] == atom.parent)
					{
						pyramid_mapping[counter++] = k;
						break;
					}

			if (implicit_h_idx != -1)
				pyramid_mapping[counter++] = implicit_h_idx;

			for (j = 0; j != atom.neighbours.length; j++)
			{
				if (atom.neighbours[j].aid == atom.parent)
					continue;

				for (k = 0; k < 4; k++)
					if (atom.neighbours[j].aid == sc.pyramid[k])
					{
						if (counter >= 4)
							throw new Error('internal: pyramid overflow');
						pyramid_mapping[counter++] = k;
						break;
					}
			}

			if (counter == 4)
			{
				// move the 'from' atom to the end
				counter = pyramid_mapping[0];
				pyramid_mapping[0] = pyramid_mapping[1];
				pyramid_mapping[1] = pyramid_mapping[2];
				pyramid_mapping[2] = pyramid_mapping[3];
				pyramid_mapping[3] = counter;
			}
			else if (counter != 3)
				throw new Error('cannot calculate chirality');

			if (Stereocenters.isPyramidMappingRigid(pyramid_mapping))
				this.atoms[atom_idx].chirality = 1;
			else
				this.atoms[atom_idx].chirality = 2;
		}, this);
	} catch (ex) {
			alert('Warning: ' + ex.message);
		}

	// write the SMILES itself

	// cycle_numbers[i] == -1 means that the number is available
	// cycle_numbers[i] == n means that the number is used by vertex n
	var cycle_numbers = [];

	cycle_numbers.push(0); // never used

	var first_component = true;

	for (i = 0; i < walk.v_seq.length; i++)
	{
		seq_el = walk.v_seq[i];
		v_idx = seq_el.idx;
		e_idx = seq_el.parent_edge;
		v_prev_idx = seq_el.parent_vertex;
		var write_atom = true;

		if (v_prev_idx >= 0)
		{
			if (walk.numBranches(v_prev_idx) > 1)
			if (this.atoms[v_prev_idx].branch_cnt > 0 && this.atoms[v_prev_idx].paren_written)
				this.smiles += ')';

			opening_cycles = walk.numOpeningCycles(e_idx);

			for (j = 0; j < opening_cycles; j++)
			{
				for (k = 1; k < cycle_numbers.length; k++)
					if (cycle_numbers[k] == -1)
						break;
				if (k == cycle_numbers.length)
					cycle_numbers.push(v_prev_idx);
				else
					cycle_numbers[k] = v_prev_idx;

				this._writeCycleNumber(k);
			}

			if (v_prev_idx >= 0)
			{
				var branches = walk.numBranches(v_prev_idx);

				if (branches > 1)
				if (this.atoms[v_prev_idx].branch_cnt < branches - 1)
				{
					if (walk.edgeClosingCycle(e_idx))
						this.atoms[v_prev_idx].paren_written = false;
					else
					{
						this.smiles += '(';
						this.atoms[v_prev_idx].paren_written = true;
					}
				}

				this.atoms[v_prev_idx].branch_cnt++;

				if (this.atoms[v_prev_idx].branch_cnt > branches)
					throw new Error('unexpected branch');
			}

			var bond = molecule.bonds.get(e_idx);
			var bond_written = true;

			var dir = 0;

			if (bond.type == Bond.PATTERN.TYPE.SINGLE)
				dir = this._calcBondDirection(molecule, e_idx, v_prev_idx);

			if ((dir == 1 && v_idx == bond.end) || (dir == 2 && v_idx == bond.begin))
				this.smiles += '/';
			else if ((dir == 2 && v_idx == bond.end) || (dir == 1 && v_idx == bond.begin))
				this.smiles += '\\';
			else if (bond.type == Bond.PATTERN.TYPE.ANY)
				this.smiles += '~';
			else if (bond.type == Bond.PATTERN.TYPE.DOUBLE)
				this.smiles += '=';
			else if (bond.type == Bond.PATTERN.TYPE.TRIPLE)
				this.smiles += '#';
			else if (bond.type == Bond.PATTERN.TYPE.AROMATIC &&
			(!this.atoms[bond.begin].lowercase || !this.atoms[bond.end].lowercase || !this.isBondInRing(e_idx)))
				this.smiles += ':'; // TODO: Check if this : is needed
			else if (bond.type == Bond.PATTERN.TYPE.SINGLE && this.atoms[bond.begin].aromatic && this.atoms[bond.end].aromatic)
				this.smiles += '-';
			else
				bond_written = false;


			if (walk.edgeClosingCycle(e_idx))
			{
				for (j = 1; j < cycle_numbers.length; j++)
					if (cycle_numbers[j] == v_idx)
						break;

				if (j == cycle_numbers.length)
					throw new Error('cycle number not found');

				this._writeCycleNumber(j);

				cycle_numbers[j] = -1;
				write_atom = false;
			}
		}
		else
		{
			if (!first_component)
				this.smiles += (this._written_components == walk.nComponentsInReactants) ? '>>' : '.';
			first_component = false;
			this._written_components++;
		}
		if (write_atom) {
			this._writeAtom(molecule, v_idx, this.atoms[v_idx].aromatic, this.atoms[v_idx].lowercase, this.atoms[v_idx].chirality);
			this._written_atoms.push(seq_el.idx);
		}
	}

	this.comma = false;

	//this._writeStereogroups(mol, atoms);
	this._writeRadicals(molecule);
	//this._writePseudoAtoms(mol);
	//this._writeHighlighting();

	if (this.comma)
		this.smiles += '|';

	return this.smiles;

};

Smiles.prototype._writeCycleNumber = function (n)
{
	if (n > 0 && n < 10)
		this.smiles += n;
	else if (n >= 10 && n < 100)
		this.smiles += '%' + n;
	else if (n >= 100 && n < 1000)
		this.smiles += '%%' + n;
	else
		throw new Error('bad cycle number: ' + n);
};

Smiles.prototype._writeAtom = function (mol, idx, aromatic, lowercase, chirality)
{
	var atom = mol.atoms.get(idx);
	var i;
	var need_brackets = false;
	var hydro = -1;
	var aam = 0;

	/*
    if (mol.haveQueryAtoms())
    {
      query_atom = &mol.getQueryAtom(idx);

      if (query_atom->type == QUERY_ATOM_RGROUP)
      {
         if (mol.getRGroups()->isRGroupAtom(idx))
         {
            const Array<int> &rg = mol.getRGroups()->getSiteRGroups(idx);

            if (rg.size() != 1)
               throw Error("rgroup count %d", rg.size());

            _output.printf("[&%d]", rg[0] + 1);
         }
         else
            _output.printf("[&%d]", 1);

         return;
      }
    }
    */

	if (atom.label == 'A')
	{
		this.smiles += '*';
		return;
	}

	if (atom.label == 'R' || atom.label == 'R#')
	{
		this.smiles += '[*]';
		return;
	}

	//KETCHER-598 (Ketcher does not save AAM into reaction SMILES)
	//BEGIN
//    if (this.atom_atom_mapping)
//        aam = atom_atom_mapping[idx];
	aam = atom.aam;
	//END

	if (atom.label != 'C' && atom.label != 'P' &&
	atom.label != 'N' && atom.label != 'S' &&
	atom.label != 'O' && atom.label != 'Cl' &&
	atom.label != 'F' && atom.label != 'Br' &&
	atom.label != 'B' && atom.label != 'I')
		need_brackets = true;

	if (atom.explicitValence >= 0 || atom.radical != 0 || chirality > 0 ||
		(aromatic && atom.label != 'C' && atom.label != 'O') ||
	(aromatic && atom.label == 'C' && this.atoms[idx].neighbours.length < 3 && this.atoms[idx].h_count == 0))
		hydro = this.atoms[idx].h_count;

	var label = atom.label;
	if (atom.atomList && !atom.atomList.notList) {
		label = atom.atomList.label();
		need_brackets = false; // atom list label already has brackets
	} else if (atom.isPseudo() || (atom.atomList && atom.atomList.notList)) {
		label = '*';
		need_brackets = true;
	} else if (chirality || atom.charge != 0 || atom.isotope > 0 || hydro >= 0 || aam > 0) {
		need_brackets = true;
	}

	if (need_brackets)
	{
		if (hydro == -1)
			hydro = this.atoms[idx].h_count;
		this.smiles += '[';
	}

	if (atom.isotope > 0)
		this.smiles += atom.isotope;

	if (lowercase)
		this.smiles += label.toLowerCase();
	else
		this.smiles += label;

	if (chirality > 0)
	{
		if (chirality == 1)
			this.smiles += '@';
		else // chirality == 2
			this.smiles += '@@';

		if (atom.implicitH > 1)
			throw new Error(atom.implicitH + ' implicit H near stereocenter');
	}

	if (atom.label != 'H') {
		if (hydro > 1 || (hydro == 0 && !need_brackets))
			this.smiles += 'H' + hydro;
		else if (hydro == 1)
			this.smiles += 'H';
	}

	if (atom.charge > 1)
		this.smiles += '+' + atom.charge;
	else if (atom.charge < -1)
		this.smiles += atom.charge;
	else if (atom.charge == 1)
		this.smiles += '+';
	else if (atom.charge == -1)
		this.smiles += '-';

	if (aam > 0)
		this.smiles += ':' + aam;

	if (need_brackets)
		this.smiles += ']';

	/*
    if (mol.getRGroupFragment() != 0)
    {
      for (i = 0; i < 2; i++)
      {
         int j;

         for (j = 0; mol.getRGroupFragment()->getAttachmentPoint(i, j) != -1; j++)
            if (idx == mol.getRGroupFragment()->getAttachmentPoint(i, j))
            {
               _output.printf("([*])");
               break;
            }

         if (mol.getRGroupFragment()->getAttachmentPoint(i, j) != -1)
            break;
      }
    }
    */
};

Smiles.prototype._markCisTrans = function (mol)
{
	this.cis_trans = new CisTrans (mol, function (idx)
	{
		return this.atoms[idx].neighbours;
	}, this);
	this.cis_trans.build();
	this._dbonds = new Array(mol.bonds.count());

	mol.bonds.each(function (bid)
	{
		this._dbonds[bid] =
		{
			ctbond_beg: -1,
			ctbond_end: -1,
			saved: 0
		}
	}, this);

	this.cis_trans.each(function (bid, ct)
	{
		var bond = mol.bonds.get(bid);

		if (ct.parity != 0 && !this.isBondInRing(bid))
		{
			var nei_beg = this.atoms[bond.begin].neighbours;
			var nei_end = this.atoms[bond.end].neighbours;
			var arom_fail_beg = true, arom_fail_end = true;

			nei_beg.each(function (nei)
			{
				if (nei.bid != bid && mol.bonds.get(nei.bid).type == Bond.PATTERN.TYPE.SINGLE)
					arom_fail_beg = false;
			}, this);

			nei_end.each(function (nei)
			{
				if (nei.bid != bid && mol.bonds.get(nei.bid).type == Bond.PATTERN.TYPE.SINGLE)
					arom_fail_end = false;
			}, this);

			if (arom_fail_beg || arom_fail_end)
				return;

			nei_beg.each(function (nei)
			{
				if (nei.bid != bid)
				{
					if (mol.bonds.get(nei.bid).begin == bond.begin)
						this._dbonds[nei.bid].ctbond_beg = bid;
					else
						this._dbonds[nei.bid].ctbond_end = bid;
				}
			}, this);

			nei_end.each(function (nei)
			{
				if (nei.bid != bid)
				{
					if (mol.bonds.get(nei.bid).begin == bond.end)
						this._dbonds[nei.bid].ctbond_beg = bid;
					else
						this._dbonds[nei.bid].ctbond_end = bid;
				}
			}, this);
		}
	}, this);
};

Smiles.prototype._updateSideBonds = function (mol, bond_idx)
{
	var bond = mol.bonds.get(bond_idx);
	var subst = this.cis_trans.getSubstituents(bond_idx);
	var parity = this.cis_trans.getParity(bond_idx);

	var sidebonds = [-1, -1, -1, -1];

	sidebonds[0] = mol.findBondId(subst[0], bond.begin);
	if (subst[1] != -1)
		sidebonds[1] = mol.findBondId(subst[1], bond.begin);

	sidebonds[2] = mol.findBondId(subst[2], bond.end);
	if (subst[3] != -1)
		sidebonds[3] = mol.findBondId(subst[3], bond.end);

	var n1 = 0, n2 = 0, n3 = 0, n4 = 0;

	if (this._dbonds[sidebonds[0]].saved != 0)
	{
		if ((this._dbonds[sidebonds[0]].saved == 1 && mol.bonds.get(sidebonds[0]).begin == bond.begin) ||
		(this._dbonds[sidebonds[0]].saved == 2 && mol.bonds.get(sidebonds[0]).end == bond.begin))
			n1++;
		else
			n2++;
	}
	if (sidebonds[1] != -1 && this._dbonds[sidebonds[1]].saved != 0)
	{
		if ((this._dbonds[sidebonds[1]].saved == 2 && mol.bonds.get(sidebonds[1]).begin == bond.begin) ||
		(this._dbonds[sidebonds[1]].saved == 1 && mol.bonds.get(sidebonds[1]).end == bond.begin))
			n1++;
		else
			n2++;
	}
	if (this._dbonds[sidebonds[2]].saved != 0)
	{
		if ((this._dbonds[sidebonds[2]].saved == 1 && mol.bonds.get(sidebonds[2]).begin == bond.end) ||
		(this._dbonds[sidebonds[2]].saved == 2 && mol.bonds.get(sidebonds[2]).end == bond.end))
			n3++;
		else
			n4++;
	}
	if (sidebonds[3] != -1 && this._dbonds[sidebonds[3]].saved != 0)
	{
		if ((this._dbonds[sidebonds[3]].saved == 2 && mol.bonds.get(sidebonds[3]).begin == bond.end) ||
		(this._dbonds[sidebonds[3]].saved == 1 && mol.bonds.get(sidebonds[3]).end == bond.end))
			n3++;
		else
			n4++;
	}

	if (parity == CisTrans.PARITY.CIS)
	{
		n1 += n3;
		n2 += n4;
	}
	else
	{
		n1 += n4;
		n2 += n3;
	}

	if (n1 > 0 && n2 > 0)
		throw new Error('incompatible cis-trans configuration');

	if (n1 == 0 && n2 == 0)
		return false;

	if (n1 > 0)
	{
		this._dbonds[sidebonds[0]].saved =
			(mol.bonds.get(sidebonds[0]).begin == bond.begin) ? 1 : 2;
		if (sidebonds[1] != -1)
			this._dbonds[sidebonds[1]].saved =
				(mol.bonds.get(sidebonds[1]).begin == bond.begin) ? 2 : 1;

		this._dbonds[sidebonds[2]].saved =
			((mol.bonds.get(sidebonds[2]).begin == bond.end) == (parity == CisTrans.PARITY.CIS)) ? 1 : 2;
		if (sidebonds[3] != -1)
			this._dbonds[sidebonds[3]].saved =
				((mol.bonds.get(sidebonds[3]).begin == bond.end) == (parity == CisTrans.PARITY.CIS)) ? 2 : 1;
	}
	if (n2 > 0)
	{
		this._dbonds[sidebonds[0]].saved =
			(mol.bonds.get(sidebonds[0]).begin == bond.begin) ? 2 : 1;
		if (sidebonds[1] != -1)
			this._dbonds[sidebonds[1]].saved =
				(mol.bonds.get(sidebonds[1]).begin == bond.begin) ? 1 : 2;

		this._dbonds[sidebonds[2]].saved =
			((mol.bonds.get(sidebonds[2]).begin == bond.end) == (parity == CisTrans.PARITY.CIS)) ? 2 : 1;
		if (sidebonds[3] != -1)
			this._dbonds[sidebonds[3]].saved =
				((mol.bonds.get(sidebonds[3]).begin == bond.end) == (parity == CisTrans.PARITY.CIS)) ? 1 : 2;
	}

	return true;
};

Smiles.prototype._calcBondDirection = function (mol, idx, vprev)
{
	var ntouched;

	if (this._dbonds[idx].ctbond_beg == -1 && this._dbonds[idx].ctbond_end == -1)
		return 0;

	if (mol.bonds.get(idx).type != Bond.PATTERN.TYPE.SINGLE)
		throw new Error('internal: directed bond type ' + mol.bonds.get(idx).type);

	while (true)
	{
		ntouched = 0;
		this.cis_trans.each(function (bid, ct)
		{
			if (ct.parity != 0 && !this.isBondInRing(bid))
			{
				if (this._updateSideBonds(mol, bid))
					ntouched++;
			}
		}, this);
		if (ntouched == this._touched_cistransbonds)
			break;
		this._touched_cistransbonds = ntouched;
	}

	if (this._dbonds[idx].saved == 0)
	{
		if (vprev == mol.bonds.get(idx).begin)
			this._dbonds[idx].saved = 1;
		else
			this._dbonds[idx].saved = 2;
	}

	return this._dbonds[idx].saved;
};

Smiles.prototype._writeRadicals = function (mol)
{
	var marked = new Array(this._written_atoms.length);
	var i, j;

	for (i = 0; i < this._written_atoms.size(); i++)
	{
		if (marked[i])
			continue;

		var radical = mol.atoms.get(this._written_atoms[i]).radical;

		if (radical == 0)
			continue;

		if (this.comma)
			this.smiles += ',';
		else
		{
			this.smiles += ' |';
			this.comma = true;
		}

		if (radical == Atom.PATTERN.RADICAL.SINGLET)
			this.smiles += '^3:';
		else if (radical == Atom.PATTERN.RADICAL.DOUPLET)
			this.smiles += '^1:';
		else // RADICAL_TRIPLET
			this.smiles += '^4:';

		this.smiles += i;

		for (j = i + 1; j < this._written_atoms.length; j++)
			if (mol.atoms.get(this._written_atoms[j]).radical == radical)
			{
				marked[j] = true;
				this.smiles += ',' + j;
			}
	}
};

/*
void Smiles::_writeStereogroups (const Struct &mol, const Array<_Atom> &atoms)
{
   MoleculeStereocenters &stereocenters = mol.getStereocenters();
   int i, j;
   int single_and_group = -1;

   for (i = stereocenters.begin(); i != stereocenters.end(); i = stereocenters.next(i))
   {
      int idx, type, group;

      stereocenters.get(i, idx, type, group, 0);

      if (type < MoleculeStereocenters::ATOM_ANY)
         continue;
      if (type != MoleculeStereocenters::ATOM_AND)
         break;
      if (single_and_group == -1)
         single_and_group = group;
      else if (single_and_group != group)
         break;
   }

   if (i == stereocenters.end())
      return;

   int and_group_idx = 1;
   int or_group_idx = 1;

   QS_DEF(Array<int>, marked);

   marked.clear_resize(_written_atoms.size());
   marked.zerofill();

   for (i = 0; i < _written_atoms.size(); i++)
   {
      if (marked[i])
         continue;

      int type = stereocenters.getType(_written_atoms[i]);

      if (type > 0)
      {
         if (_comma)
            _output.writeChar(',');
         else
         {
            _output.writeString(" |");
            _comma = true;
         }
      }

      if (type == MoleculeStereocenters::ATOM_ANY)
      {
         _output.printf("w:%d", i);

         for (j = i + 1; j < _written_atoms.size(); j++)
            if (stereocenters.getType(_written_atoms[j]) == MoleculeStereocenters::ATOM_ANY)
            {
               marked[j] = 1;
               _output.printf(",%d", j);
            }
      }
      else if (type == MoleculeStereocenters::ATOM_ABS)
      {
         _output.printf("a:%d", i);

         for (j = i + 1; j < _written_atoms.size(); j++)
            if (stereocenters.getType(_written_atoms[j]) == MoleculeStereocenters::ATOM_ABS)
            {
               marked[j] = 1;
               _output.printf(",%d", j);
            }
      }
      else if (type == MoleculeStereocenters::ATOM_AND)
      {
         int group = stereocenters.getGroup(_written_atoms[i]);

         _output.printf("&%d:%d", and_group_idx++, i);
         for (j = i + 1; j < _written_atoms.size(); j++)
            if (stereocenters.getType(_written_atoms[j]) == MoleculeStereocenters::ATOM_AND &&
                stereocenters.getGroup(_written_atoms[j]) == group)
            {
               marked[j] = 1;
               _output.printf(",%d", j);
            }
      }
      else if (type == MoleculeStereocenters::ATOM_OR)
      {
         int group = stereocenters.getGroup(_written_atoms[i]);

         _output.printf("o%d:%d", or_group_idx++, i);
         for (j = i + 1; j < _written_atoms.size(); j++)
            if (stereocenters.getType(_written_atoms[j]) == MoleculeStereocenters::ATOM_OR &&
                stereocenters.getGroup(_written_atoms[j]) == group)
            {
               marked[j] = 1;
               _output.printf(",%d", j);
            }
      }
   }
}
*/

module.exports = {
	stringify: function (molecule, options) {
		var opts = options || {};
		return new Smiles().saveMolecule(molecule, opts.ignoreErrors);
	}
};

},{"../util":40,"../util/set":43,"./atom":8,"./bond":9,"./cis_trans":10,"./dfs":11,"./stereocenters":17}],17:[function(require,module,exports){
var Map = require('../util/map');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');
var Bond = require('./bond');

var Stereocenters = function (mol, neighbors_func, context)
{
	this.molecule = mol;
	this.atoms = new Map();
	this.getNeighbors = neighbors_func;
	this.context = context;
};

Stereocenters.prototype.each = function (func, context)
{
	this.atoms.each(func, context);
};

Stereocenters.prototype.buildFromBonds = function (/*const int *atom_types, const int *atom_groups, const int *bond_orientations, */ignore_errors)
{
	var atoms = this.molecule.atoms;
	var bonds = this.molecule.bonds;

	// this is a set of atoms that are likely to belong to allene structures and
	//  therefore should not be considered as potential stereocenters in the code below,
	//  as allenes cannot be encoded in the SMILES notation
	var alleneMask = Set.empty();
	atoms.each(function (aid, atom) {
		var nei_list = this.getNeighbors.call(this.context, aid);
		if (nei_list.length != 2)
			return false;
		var nei1 = nei_list[0];
		var nei2 = nei_list[1];
		// check atom labels
		if (util.findIndex([aid, nei1.aid, nei2.aid], function (aid) {
			return ['C', 'Si'].indexOf(atoms.get(aid).label) < 0;
		}, this) >= 0)
			return false;

		// check adjacent bond types
		if (util.findIndex([nei1.bid, nei2.bid], function (bid) {
			return bonds.get(bid).type != Bond.PATTERN.TYPE.DOUBLE;
		}, this) >= 0)
			return false;

		// get the other neighbors of the two adjacent atoms except for the central atom
		var nei1nei = util.findAll(this.getNeighbors.call(this.context, nei1.aid), function (nei) {
			return nei.aid != aid;
		}, this);
		var nei2nei = util.findAll(this.getNeighbors.call(this.context, nei2.aid), function (nei) {
			return nei.aid != aid;
		}, this);
		if (nei1nei.length < 1 || nei1nei.length > 2 || nei2nei.length < 1 || nei2nei.length > 2)
			return false;

		if (util.findIndex(nei1nei.concat(nei2nei), function (nei) {
			return bonds.get(nei.bid).type != Bond.PATTERN.TYPE.SINGLE;
		}, this) >= 0)
			return false;

		if (util.findIndex(nei1nei.concat(nei2nei), function (nei) {
			return bonds.get(nei.bid).stereo == Bond.PATTERN.STEREO.EITHER;
		}, this) >= 0)
			return false;
		Set.add(alleneMask, nei1.aid);
		Set.add(alleneMask, nei2.aid);
	}, this);

	if (Set.size(alleneMask) > 0)
		alert('This structure may contain allenes, which cannot be represented in the SMILES notation. Relevant stereo-information will be discarded.');

	atoms.each(function (aid)
	{
		if (Set.contains(alleneMask, aid))
			return;
		/*
      if (atom_types[atom_idx] == 0)
         continue;
         */
		var nei_list = this.getNeighbors.call(this.context, aid);
		var stereocenter = false;

		nei_list.find(function (nei)
		{
			var bond = this.molecule.bonds.get(nei.bid);

			if (bond.type == Bond.PATTERN.TYPE.SINGLE && bond.begin == aid)
			if (bond.stereo == Bond.PATTERN.STEREO.UP || bond.stereo == Bond.PATTERN.STEREO.DOWN)
			{
				stereocenter = true;
				return true;
			}
			return false;
		}, this);

		if (!stereocenter)
			return;

		if (ignore_errors)
		{
//         try
//         {
			this._buildOneCenter(aid/*, atom_groups[atom_idx], atom_types[atom_idx], bond_orientations*/);
//         }
//         catch (er)
//         {
//         }
		}
		else
			this._buildOneCenter(aid/*, atom_groups[atom_idx], atom_types[atom_idx], bond_orientations*/);
	}, this);
};

Stereocenters.allowed_stereocenters =
	[
	{elem: 'C',  charge: 0, degree: 3, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'C',  charge: 0, degree: 4, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'Si', charge: 0, degree: 3, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'Si', charge: 0, degree: 4, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'N',  charge: 1, degree: 3, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'N',  charge: 1, degree: 4, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'N',  charge: 0, degree: 3, n_double_bonds: 0, implicit_degree: 3},
	{elem: 'S',  charge: 0, degree: 4, n_double_bonds: 2, implicit_degree: 4},
	{elem: 'S',  charge: 1, degree: 3, n_double_bonds: 0, implicit_degree: 3},
	{elem: 'S',  charge: 0, degree: 3, n_double_bonds: 1, implicit_degree: 3},
	{elem: 'P',  charge: 0, degree: 3, n_double_bonds: 0, implicit_degree: 3},
	{elem: 'P',  charge: 1, degree: 4, n_double_bonds: 0, implicit_degree: 4},
	{elem: 'P',  charge: 0, degree: 4, n_double_bonds: 1, implicit_degree: 4}
	];


Stereocenters.prototype._buildOneCenter = function (atom_idx/*, int group, int type, const int *bond_orientations*/)
{
	var atom = this.molecule.atoms.get(atom_idx);

	var nei_list = this.getNeighbors.call(this.context, atom_idx);
	var degree = nei_list.length;
	var implicit_degree = -1;

	var stereocenter =
	{
		group: 0, // = group;
		type: 0, // = type;
		pyramid: new Array(4)
	};

	var nei_idx = 0;
	var edge_ids = new Array(4);

	var last_atom_dir = 0;
	var n_double_bonds = 0;

	stereocenter.pyramid[0] = -1;
	stereocenter.pyramid[1] = -1;
	stereocenter.pyramid[2] = -1;
	stereocenter.pyramid[3] = -1;

	var n_pure_hydrogens = 0;

	if (degree > 4)
		throw new Error('stereocenter with %d bonds are not supported' + degree);

	nei_list.each(function (nei)
	{
		var nei_atom = this.molecule.atoms.get(nei.aid);
		var bond = this.molecule.bonds.get(nei.bid);

		edge_ids[nei_idx] =
		{
			edge_idx: nei.bid,
			nei_idx: nei.aid,
			rank: nei.aid,
			vec: Vec2.diff(nei_atom.pp, atom.pp).yComplement()
		};

		if (nei_atom.pureHydrogen())
		{
			n_pure_hydrogens++;
			edge_ids[nei_idx].rank = 10000;
		} else if (nei_atom.label == 'H')
			edge_ids[nei_idx].rank = 5000;

		if (!edge_ids[nei_idx].vec.normalize())
			throw new Error('zero bond length');

		if (bond.type == Bond.PATTERN.TYPE.TRIPLE)
			throw new Error('non-single bonds not allowed near stereocenter');
		else if (bond.type == Bond.PATTERN.TYPE.AROMATIC)
			throw new Error('aromatic bonds not allowed near stereocenter');
		else if (bond.type == Bond.PATTERN.TYPE.DOUBLE)
			n_double_bonds++;

		nei_idx++;
	}, this);

	Stereocenters.allowed_stereocenters.find(function (as)
	{
		if (as.elem == atom.label && as.charge == atom.charge &&
		as.degree == degree && as.n_double_bonds == n_double_bonds)
		{
			implicit_degree = as.implicit_degree;
			return true;
		}
		return false;
	}, this);

	if (implicit_degree == -1)
		throw new Error('unknown stereocenter configuration: ' + atom.label + ', charge ' + atom.charge + ', ' + degree + ' bonds (' + n_double_bonds + ' double)');

	if (degree == 4 && n_pure_hydrogens > 1)
		throw new Error(n_pure_hydrogens + ' hydrogens near stereocenter');

	if (degree == 3 && implicit_degree == 4 && n_pure_hydrogens > 0)
		throw new Error('have hydrogen(s) besides implicit hydrogen near stereocenter');

	/*
   if (stereocenter.type == ATOM_ANY)
   {
      _stereocenters.insert(atom_idx, stereocenter);
      return;
   }
   */

	if (degree == 4)
	{
		// sort by neighbor atom index (ascending)
		if (edge_ids[0].rank > edge_ids[1].rank)
			edge_ids.swap(0, 1);
		if (edge_ids[1].rank > edge_ids[2].rank)
			edge_ids.swap(1, 2);
		if (edge_ids[2].rank > edge_ids[3].rank)
			edge_ids.swap(2, 3);
		if (edge_ids[1].rank > edge_ids[2].rank)
			edge_ids.swap(1, 2);
		if (edge_ids[0].rank > edge_ids[1].rank)
			edge_ids.swap(0, 1);
		if (edge_ids[1].rank > edge_ids[2].rank)
			edge_ids.swap(1, 2);

		var main1 = -1, main2 = -1, side1 = -1, side2 = -1;
		var main_dir = 0;

		for (nei_idx = 0; nei_idx < 4; nei_idx++)
		{
			var stereo = this._getBondStereo(atom_idx, edge_ids[nei_idx].edge_idx);

			if (stereo == Bond.PATTERN.STEREO.UP || stereo == Bond.PATTERN.STEREO.DOWN)
			{
				main1 = nei_idx;
				main_dir = stereo;
				break;
			}
		}

		if (main1 == -1)
			throw new Error('none of 4 bonds going from stereocenter is stereobond');

		var xyz1, xyz2;

		// find main2 as opposite to main1
		if (main2 == -1)
		{
			xyz1 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 1) % 4].vec, edge_ids[(main1 + 2) % 4].vec);
			xyz2 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 1) % 4].vec, edge_ids[(main1 + 3) % 4].vec);

			if (xyz1 + xyz2 == 3 || xyz1 + xyz2 == 12)
			{
				main2 = (main1 + 1) % 4;
				side1 = (main1 + 2) % 4;
				side2 = (main1 + 3) % 4;
			}
		}
		if (main2 == -1)
		{
			xyz1 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 2) % 4].vec, edge_ids[(main1 + 1) % 4].vec);
			xyz2 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 2) % 4].vec, edge_ids[(main1 + 3) % 4].vec);

			if (xyz1 + xyz2 == 3 || xyz1 + xyz2 == 12)
			{
				main2 = (main1 + 2) % 4;
				side1 = (main1 + 1) % 4;
				side2 = (main1 + 3) % 4;
			}
		}
		if (main2 == -1)
		{
			xyz1 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 3) % 4].vec, edge_ids[(main1 + 1) % 4].vec);
			xyz2 = Stereocenters._xyzzy(edge_ids[main1].vec, edge_ids[(main1 + 3) % 4].vec, edge_ids[(main1 + 2) % 4].vec);

			if (xyz1 + xyz2 == 3 || xyz1 + xyz2 == 12)
			{
				main2 = (main1 + 3) % 4;
				side1 = (main1 + 2) % 4;
				side2 = (main1 + 1) % 4;
			}
		}

		if (main2 == -1)
			throw new Error('internal error: can not find opposite bond');

		if (main_dir == Bond.PATTERN.STEREO.UP && this._getBondStereo(atom_idx, edge_ids[main2].edge_idx) == Bond.PATTERN.STEREO.DOWN)
			throw new Error('stereo types of the opposite bonds mismatch');
		if (main_dir == Bond.PATTERN.STEREO.DOWN && this._getBondStereo(atom_idx, edge_ids[main2].edge_idx) == Bond.PATTERN.STEREO.UP)
			throw new Error('stereo types of the opposite bonds mismatch');

		if (main_dir == this._getBondStereo(atom_idx, edge_ids[side1].edge_idx))
			throw new Error('stereo types of non-opposite bonds match');
		if (main_dir == this._getBondStereo(atom_idx, edge_ids[side2].edge_idx))
			throw new Error('stereo types of non-opposite bonds match');

		if (main1 == 3 || main2 == 3)
			last_atom_dir = main_dir;
		else
			last_atom_dir = (main_dir == Bond.PATTERN.STEREO.UP ? Bond.PATTERN.STEREO.DOWN : Bond.PATTERN.STEREO.UP);

		sign = Stereocenters._sign(edge_ids[0].vec, edge_ids[1].vec, edge_ids[2].vec);

		if ((last_atom_dir == Bond.PATTERN.STEREO.UP && sign > 0) ||
		(last_atom_dir == Bond.PATTERN.STEREO.DOWN && sign < 0))
		{
			stereocenter.pyramid[0] = edge_ids[0].nei_idx;
			stereocenter.pyramid[1] = edge_ids[1].nei_idx;
			stereocenter.pyramid[2] = edge_ids[2].nei_idx;
		}
		else
		{
			stereocenter.pyramid[0] = edge_ids[0].nei_idx;
			stereocenter.pyramid[1] = edge_ids[2].nei_idx;
			stereocenter.pyramid[2] = edge_ids[1].nei_idx;
		}

		stereocenter.pyramid[3] = edge_ids[3].nei_idx;
	}
	else if (degree == 3)
	{
		// sort by neighbor atom index (ascending)
		if (edge_ids[0].rank > edge_ids[1].rank)
			edge_ids.swap(0, 1);
		if (edge_ids[1].rank > edge_ids[2].rank)
			edge_ids.swap(1, 2);
		if (edge_ids[0].rank > edge_ids[1].rank)
			edge_ids.swap(0, 1);

		var stereo0 = this._getBondStereo(atom_idx, edge_ids[0].edge_idx);
		var stereo1 = this._getBondStereo(atom_idx, edge_ids[1].edge_idx);
		var stereo2 = this._getBondStereo(atom_idx, edge_ids[2].edge_idx);

		var n_up = 0, n_down = 0;

		n_up += ((stereo0 == Bond.PATTERN.STEREO.UP) ? 1 : 0);
		n_up += ((stereo1 == Bond.PATTERN.STEREO.UP) ? 1 : 0);
		n_up += ((stereo2 == Bond.PATTERN.STEREO.UP) ? 1 : 0);

		n_down += ((stereo0 == Bond.PATTERN.STEREO.DOWN) ? 1 : 0);
		n_down += ((stereo1 == Bond.PATTERN.STEREO.DOWN) ? 1 : 0);
		n_down += ((stereo2 == Bond.PATTERN.STEREO.DOWN) ? 1 : 0);

		if (implicit_degree == 4) // have implicit hydrogen
		{
			if (n_up == 3)
				throw new Error('all 3 bonds up near stereoatom');
			if (n_down == 3)
				throw new Error('all 3 bonds down near stereoatom');

			if (n_up == 0 && n_down == 0)
				throw new Error('no up/down bonds near stereoatom -- indefinite case');
			if (n_up == 1 && n_down == 1)
				throw new Error('one bond up, one bond down -- indefinite case');

			main_dir = 0;

			if (n_up == 2)
				last_atom_dir = Bond.PATTERN.STEREO.DOWN;
			else if (n_down == 2)
				last_atom_dir = Bond.PATTERN.STEREO.UP;
			else
			{
				main1 = -1;
				side1 = -1;
				side2 = -1;

				for (nei_idx = 0; nei_idx < 3; nei_idx++)
				{
					dir = this._getBondStereo(atom_idx, edge_ids[nei_idx].edge_idx);

					if (dir == Bond.PATTERN.STEREO.UP || dir == Bond.PATTERN.STEREO.DOWN)
					{
						main1 = nei_idx;
						main_dir = dir;
						side1 = (nei_idx + 1) % 3;
						side2 = (nei_idx + 2) % 3;
						break;
					}
				}

				if (main1 == -1)
					throw new Error('internal error: can not find up or down bond');

				var xyz = Stereocenters._xyzzy(edge_ids[side1].vec, edge_ids[side2].vec, edge_ids[main1].vec);

				if (xyz == 3 || xyz == 4)
					throw new Error('degenerate case for 3 bonds near stereoatom');

				if (xyz == 1)
					last_atom_dir = main_dir;
				else
					last_atom_dir = (main_dir == Bond.PATTERN.STEREO.UP ? Bond.PATTERN.STEREO.DOWN : Bond.PATTERN.STEREO.UP);
			}

			var sign = Stereocenters._sign(edge_ids[0].vec, edge_ids[1].vec, edge_ids[2].vec);

			if ((last_atom_dir == Bond.PATTERN.STEREO.UP && sign > 0) ||
			(last_atom_dir == Bond.PATTERN.STEREO.DOWN && sign < 0))
			{
				stereocenter.pyramid[0] = edge_ids[0].nei_idx;
				stereocenter.pyramid[1] = edge_ids[1].nei_idx;
				stereocenter.pyramid[2] = edge_ids[2].nei_idx;
			}
			else
			{
				stereocenter.pyramid[0] = edge_ids[0].nei_idx;
				stereocenter.pyramid[1] = edge_ids[2].nei_idx;
				stereocenter.pyramid[2] = edge_ids[1].nei_idx;
			}

			stereocenter.pyramid[3] = -1;
		}
		else // 3-connected P, N or S; no implicit hydrogens
		{
			var dir;

			if (n_down > 0 && n_up > 0)
				throw new Error('one bond up, one bond down -- indefinite case');
			else if (n_down == 0 && n_up == 0)
				throw new Error('no up-down bonds attached to stereocenter');
			else if (n_up > 0)
				dir = 1;
			else
				dir = -1;

			if (Stereocenters._xyzzy(edge_ids[0].vec, edge_ids[1].vec, edge_ids[2].vec) == 1 ||
			Stereocenters._xyzzy(edge_ids[0].vec, edge_ids[2].vec, edge_ids[1].vec) == 1 ||
			Stereocenters._xyzzy(edge_ids[2].vec, edge_ids[1].vec, edge_ids[0].vec) == 1)
				// all bonds belong to the same half-plane
				dir = -dir;

			sign = Stereocenters._sign(edge_ids[0].vec, edge_ids[1].vec, edge_ids[2].vec);

			if (sign == dir)
			{
				stereocenter.pyramid[0] = edge_ids[0].nei_idx;
				stereocenter.pyramid[1] = edge_ids[2].nei_idx;
				stereocenter.pyramid[2] = edge_ids[1].nei_idx;
			}
			else
			{
				stereocenter.pyramid[0] = edge_ids[0].nei_idx;
				stereocenter.pyramid[1] = edge_ids[1].nei_idx;
				stereocenter.pyramid[2] = edge_ids[2].nei_idx;
			}
			stereocenter.pyramid[3] = -1;
		}
	}

	this.atoms.set(atom_idx, stereocenter);
};

Stereocenters.prototype._getBondStereo = function (center_idx, edge_idx)
{
	var bond = this.molecule.bonds.get(edge_idx);

	if (center_idx != bond.begin) // TODO: check this
		return 0;

	return bond.stereo;
};

// 1 -- in the smaller angle, 2 -- in the bigger angle,
// 4 -- in the 'positive' straight angle, 8 -- in the 'negative' straight angle
Stereocenters._xyzzy = function (v1, v2, u)
{
	var eps = 0.001;

	var sine1 = Vec2.cross(v1, v2);
	var cosine1 = Vec2.dot(v1, v2);

	var sine2 = Vec2.cross(v1, u);
	var cosine2 = Vec2.dot(v1, u);

	if (Math.abs(sine1) < eps)
	{
		if (Math.abs(sine2) < eps)
			throw new Error('degenerate case -- bonds overlap');

		return (sine2 > 0) ? 4 : 8;
	}

	if (sine1 * sine2 < -eps * eps)
		return 2;

	if (cosine2 < cosine1)
		return 2;

	return 1;
};

Stereocenters._sign = function (v1, v2, v3)
{
	var res = (v1.x - v3.x) * (v2.y - v3.y) - (v1.y - v3.y) * (v2.x - v3.x);
	var eps = 0.001;

	if (res > eps)
		return 1;
	if (res < -eps)
		return -1;

	throw new Error('degenerate triangle');
};

Stereocenters.isPyramidMappingRigid = function (mapping)
{
	var arr = mapping.clone();
	var rigid = true;

	if (arr[0] > arr[1])
		arr.swap(0, 1), rigid = !rigid;
	if (arr[1] > arr[2])
		arr.swap(1, 2), rigid = !rigid;
	if (arr[2] > arr[3])
		arr.swap(2, 3), rigid = !rigid;
	if (arr[1] > arr[2])
		arr.swap(1, 2), rigid = !rigid;
	if (arr[0] > arr[1])
		arr.swap(0, 1), rigid = !rigid;
	if (arr[1] > arr[2])
		arr.swap(1, 2), rigid = !rigid;

	return rigid;
};

module.exports = Stereocenters;

},{"../util":40,"../util/map":41,"../util/set":43,"../util/vec2":44,"./bond":9}],18:[function(require,module,exports){
var Map = require('../util/map');
var Pool = require('../util/pool');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');

var element = require('./element');
var Bond = require('./bond');
var SGroup = require('./sgroup');
var SGroupForest = require('./sgforest');

var Struct = function () {
	this.atoms = new Pool();
	this.bonds = new Pool();
	this.sgroups = new Pool();
	this.halfBonds = new Map();
	this.loops = new Pool();
	this.isChiral = false;
	this.isReaction = false;
	this.rxnArrows = new Pool();
	this.rxnPluses = new Pool();
	this.frags = new Pool();
	this.rgroups = new Map();
	this.name = '';
	this.sGroupForest = new SGroupForest(this);
};

Struct.prototype.hasRxnProps = function () {
	return this.atoms.find(function (aid, atom) {
		return atom.hasRxnProps();
	}, this) >= 0 || this.bonds.find(function (bid, bond) {
		return bond.hasRxnProps();
	}, this) >= 0;
};

Struct.prototype.hasRxnArrow = function () {
	return this.rxnArrows.count() > 0;
};

Struct.prototype.addRxnArrowIfNecessary = function () {
	var implicitReaction = !this.hasRxnArrow() && this.hasRxnProps();
	if (implicitReaction) {
		this.rxnArrows.add(new Struct.RxnArrow());
	}
	return implicitReaction;
};

// returns a list of id's of s-groups, which contain only atoms in the given list
Struct.prototype.getSGroupsInAtomSet = function (atoms/*Array*/) {
	var sgroupCounts = new Hash();

	util.each(atoms, function (aid) {
		var sg = Set.list(this.atoms.get(aid).sgs);

		sg.each(function (sid) {
			var n = sgroupCounts.get(sid);
			if (Object.isUndefined(n)) {
				n = 1;
			} else {
				n++;
			}
			sgroupCounts.set(sid, n);
		}, this);
	}, this);

	var sgroupList = [];
	sgroupCounts.each(function (sg) {
		var sid = parseInt(sg.key, 10);
		var sgroup = this.sgroups.get(sid);
		var sgAtoms = SGroup.getAtoms(this, sgroup);
		if (sg.value == sgAtoms.length) {
			sgroupList.push(sid);
		}
	}, this);
	return sgroupList;
};

Struct.prototype.isBlank = function () {
	return this.atoms.count() === 0 &&
	this.rxnArrows.count() === 0 &&
	this.rxnPluses.count() === 0 && !this.isChiral;
};

Struct.prototype.toLists = function () {
	var aidMap = {};
	var atomList = [];
	this.atoms.each(function (aid, atom) {
		aidMap[aid] = atomList.length;
		atomList.push(atom);
	});

	var bondList = [];
	this.bonds.each(function (bid, bond) {
		var b = new Bond(bond);
		b.begin = aidMap[bond.begin];
		b.end = aidMap[bond.end];
		bondList.push(b);
	});

	return {
		'atoms': atomList,
		'bonds': bondList
	};
};

Struct.prototype.clone = function (atomSet, bondSet, dropRxnSymbols, aidMap) {
	var cp = new Struct();
	return this.mergeInto(cp, atomSet, bondSet, dropRxnSymbols, false, aidMap);
};

Struct.prototype.getScaffold = function () {
	var atomSet = Set.empty();
	this.atoms.each(function (aid) {
		Set.add(atomSet, aid);
	}, this);
	this.rgroups.each(function (rgid, rg) {
		rg.frags.each(function (fnum, fid) {
			this.atoms.each(function (aid, atom) {
				if (atom.fragment == fid) {
					Set.remove(atomSet, aid);
				}
			}, this);
		}, this);
	}, this);
	return this.clone(atomSet);
};

Struct.prototype.getFragmentIds = function (fid) {
	var atomSet = Set.empty();
	this.atoms.each(function (aid, atom) {
		if (atom.fragment == fid) {
			Set.add(atomSet, aid);
		}
	}, this);
	return atomSet;
};

Struct.prototype.getFragment = function (fid) {
	return this.clone(this.getFragmentIds(fid));
};

Struct.prototype.mergeInto = function (cp, atomSet, bondSet, dropRxnSymbols, keepAllRGroups, aidMap) {
	atomSet = atomSet || Set.keySetInt(this.atoms);
	bondSet = bondSet || Set.keySetInt(this.bonds);
	bondSet = Set.filter(bondSet, function (bid){
		var bond = this.bonds.get(bid);
		return Set.contains(atomSet, bond.begin) && Set.contains(atomSet, bond.end);
	}, this);

	var fidMask = {};
	this.atoms.each(function (aid, atom) {
		if (Set.contains(atomSet, aid))
			fidMask[atom.fragment] = 1;
	});
	var fidMap = {};
	this.frags.each(function (fid, frag) {
		if (fidMask[fid])
			fidMap[fid] = cp.frags.add(frag.clone());
	});

	this.rgroups.each(function (rgid, rgroup) {
		var keepGroup = keepAllRGroups;
		if (!keepGroup) {
			rgroup.frags.each(function (fnum, fid) {
				if (fidMask[fid])
					keepGroup = true;
			});
			if (!keepGroup)
				return;
		}
		var rg = cp.rgroups.get(rgid);
		if (rg) {
			rgroup.frags.each(function (fnum, fid) {
				if (fidMask[fid])
					rg.frags.add(fidMap[fid]);
			});
		} else {
			cp.rgroups.set(rgid, rgroup.clone(fidMap));
		}
	});

	if (typeof aidMap === 'undefined' || aidMap === null)
		aidMap = {};
	this.atoms.each(function (aid, atom) {
		if (Set.contains(atomSet, aid))
			aidMap[aid] = cp.atoms.add(atom.clone(fidMap));
	});

	var bidMap = {};
	this.bonds.each(function (bid, bond) {
		if (Set.contains(bondSet, bid))
			bidMap[bid] = cp.bonds.add(bond.clone(aidMap));
	});

	this.sgroups.each(function (sid, sg) {
		var i;
		for (i = 0; i < sg.atoms.length; ++i)
			if (!Set.contains(atomSet, sg.atoms[i]))
				return;
		sg = SGroup.clone(sg, aidMap, bidMap);
		var id = cp.sgroups.add(sg);
		sg.id = id;
		for (i = 0; i < sg.atoms.length; ++i) {
			Set.add(cp.atoms.get(sg.atoms[i]).sgs, id);
		}
		cp.sGroupForest.insert(sg.id);
	});
	cp.isChiral = this.isChiral;
	if (!dropRxnSymbols) {
		cp.isReaction = this.isReaction;
		this.rxnArrows.each(function (id, item) {
			cp.rxnArrows.add(item.clone());
		});
		this.rxnPluses.each(function (id, item) {
			cp.rxnPluses.add(item.clone());
		});
	}
	return cp;
};

Struct.prototype.findBondId = function (begin, end)
{
	var id = -1;

	this.bonds.find(function (bid, bond)
	{
		if ((bond.begin == begin && bond.end == end) ||
		(bond.begin == end && bond.end == begin))
		{
			id = bid;
			return true;
		}
		return false;
	}, this);

	return id;
};

var HalfBond = function (/*num*/begin, /*num*/end, /*num*/bid)
{
	if (arguments.length != 3)
		throw new Error('Invalid parameter number!');

	this.begin = begin - 0;
	this.end = end - 0;
	this.bid = bid - 0;

	// rendering properties
	this.dir = new Vec2(); // direction
	this.norm = new Vec2(); // left normal
	this.ang = 0; // angle to (1,0), used for sorting the bonds
	this.p = new Vec2(); // corrected origin position
	this.loop = -1; // left loop id if the half-bond is in a loop, otherwise -1
	this.contra = -1; // the half bond contrary to this one
	this.next = -1; // the half-bond next ot this one in CCW order
	this.leftSin = 0;
	this.leftCos = 0;
	this.leftNeighbor = 0;
	this.rightSin = 0;
	this.rightCos = 0;
	this.rightNeighbor = 0;
};

Struct.prototype.initNeighbors = function ()
{
	this.atoms.each(function (aid, atom){
		atom.neighbors = [];
	});
	this.bonds.each(function (bid, bond){
		var a1 = this.atoms.get(bond.begin);
		var a2 = this.atoms.get(bond.end);
		a1.neighbors.push(bond.hb1);
		a2.neighbors.push(bond.hb2);
	}, this);
};

Struct.prototype.bondInitHalfBonds = function (bid, /*opt*/ bond)
{
	bond = bond || this.bonds.get(bid);
	bond.hb1 = 2 * bid;
	bond.hb2 = 2 * bid + 1;
	this.halfBonds.set(bond.hb1, new HalfBond(bond.begin, bond.end, bid));
	this.halfBonds.set(bond.hb2, new HalfBond(bond.end, bond.begin, bid));
	var hb1 = this.halfBonds.get(bond.hb1);
	var hb2 = this.halfBonds.get(bond.hb2);
	hb1.contra = bond.hb2;
	hb2.contra = bond.hb1;
};

Struct.prototype.halfBondUpdate = function (hbid)
{
	var hb = this.halfBonds.get(hbid);
	var p1 = this.atoms.get(hb.begin).pp;
	var p2 = this.atoms.get(hb.end).pp;
	var d = Vec2.diff(p2, p1).normalized();
	hb.dir = Vec2.dist(p2, p1) > 1e-4 ? d : new Vec2(1, 0);
	hb.norm = hb.dir.turnLeft();
	hb.ang = hb.dir.oxAngle();
	if (hb.loop < 0)
		hb.loop = -1;
};

Struct.prototype.initHalfBonds = function ()
{
	this.halfBonds.clear();
	this.bonds.each(this.bondInitHalfBonds, this);
};

Struct.prototype.setHbNext = function (hbid, next)
{
	this.halfBonds.get(this.halfBonds.get(hbid).contra).next = next;
};

Struct.prototype.halfBondSetAngle = function (hbid, left)
{
	var hb = this.halfBonds.get(hbid);
	var hbl = this.halfBonds.get(left);
	hbl.rightCos = hb.leftCos = Vec2.dot(hbl.dir, hb.dir);
	hbl.rightSin = hb.leftSin = Vec2.cross(hbl.dir, hb.dir);
	hb.leftNeighbor = left;
	hbl.rightNeighbor = hbid;
};

Struct.prototype.atomAddNeighbor = function (hbid)
{
	var hb = this.halfBonds.get(hbid);
	var atom = this.atoms.get(hb.begin);
	var i = 0;
	for (i = 0; i < atom.neighbors.length; ++i)
		if (this.halfBonds.get(atom.neighbors[i]).ang > hb.ang)
			break;
	atom.neighbors.splice(i, 0, hbid);
	var ir = atom.neighbors[(i + 1) % atom.neighbors.length];
	var il = atom.neighbors[(i + atom.neighbors.length - 1)
			 % atom.neighbors.length];
	this.setHbNext(il, hbid);
	this.setHbNext(hbid, ir);
	this.halfBondSetAngle(hbid, il);
	this.halfBondSetAngle(ir, hbid);
};

Struct.prototype.atomSortNeighbors = function (aid) {
	var atom = this.atoms.get(aid);
	atom.neighbors = atom.neighbors.sortBy(function (nei){
		return this.halfBonds.get(nei).ang;
	}, this);

	var i;
	for (i = 0; i < atom.neighbors.length; ++i)
		this.halfBonds.get(this.halfBonds.get(atom.neighbors[i]).contra).next =
			atom.neighbors[(i + 1) % atom.neighbors.length];
	for (i = 0; i < atom.neighbors.length; ++i)
		this.halfBondSetAngle(atom.neighbors[(i + 1) % atom.neighbors.length],
			atom.neighbors[i]);
};

Struct.prototype.sortNeighbors = function (list) {
	var f = function (aid) { this.atomSortNeighbors(aid); };
	if (util.isNullOrUndefined(list))
		this.atoms.each(f, this);
	else
		util.each(list, f, this);
};

Struct.prototype.atomUpdateHalfBonds = function (aid) {
	var nei = this.atoms.get(aid).neighbors;
	for (var i = 0; i < nei.length; ++i) {
		var hbid = nei[i];
		this.halfBondUpdate(hbid);
		this.halfBondUpdate(this.halfBonds.get(hbid).contra);
	}
};

Struct.prototype.updateHalfBonds = function (list) {
	var f = function (aid) { this.atomUpdateHalfBonds(aid); };
	if (util.isNullOrUndefined(list))
		this.atoms.each(f, this);
	else
		util.each(list, f, this);
};

Struct.prototype.sGroupsRecalcCrossBonds = function () {
	this.sgroups.each(function (sgid, sg){
		sg.xBonds = [];
		sg.neiAtoms = [];
	},this);
	this.bonds.each(function (bid, bond){
		var a1 = this.atoms.get(bond.begin);
		var a2 = this.atoms.get(bond.end);
		Set.each(a1.sgs, function (sgid){
			if (!Set.contains(a2.sgs, sgid)) {
				var sg = this.sgroups.get(sgid);
				sg.xBonds.push(bid);
				util.arrayAddIfMissing(sg.neiAtoms, bond.end);
			}
		}, this);
		Set.each(a2.sgs, function (sgid){
			if (!Set.contains(a1.sgs, sgid)) {
				var sg = this.sgroups.get(sgid);
				sg.xBonds.push(bid);
				util.arrayAddIfMissing(sg.neiAtoms, bond.begin);
			}
		}, this);
	},this);
};

Struct.prototype.sGroupDelete = function (sgid)
{
	var sg = this.sgroups.get(sgid);
	for (var i = 0; i < sg.atoms.length; ++i) {
		Set.remove(this.atoms.get(sg.atoms[i]).sgs, sgid);
	}
	this.sGroupForest.remove(sgid);
	this.sgroups.remove(sgid);
};

Struct.itemSetPos = function (item, pp) // TODO: remove
{
	item.pp = pp;
};

Struct.prototype._itemSetPos = function (map, id, pp, scaleFactor)
{
	Struct.itemSetPos(this[map].get(id), pp, scaleFactor);
};

Struct.prototype._atomSetPos = function (id, pp, scaleFactor)
{
	this._itemSetPos('atoms', id, pp, scaleFactor);
};

Struct.prototype._rxnPlusSetPos = function (id, pp, scaleFactor)
{
	this._itemSetPos('rxnPluses', id, pp, scaleFactor);
};

Struct.prototype._rxnArrowSetPos = function (id, pp, scaleFactor)
{
	this._itemSetPos('rxnArrows', id, pp, scaleFactor);
};

Struct.prototype.getCoordBoundingBox = function (atomSet)
{
	var bb = null;
	var extend = function (pp) {
		if (!bb)
			bb = {
				min: pp,
				max: pp
			};
		else {
			bb.min = Vec2.min(bb.min, pp);
			bb.max = Vec2.max(bb.max, pp);
		}
	};

	var global = typeof(atomSet) == 'undefined';

	this.atoms.each(function (aid, atom) {
		if (global || Set.contains(atomSet, aid))
			extend(atom.pp);
	});
	if (global) {
		this.rxnPluses.each(function (id, item) {
			extend(item.pp);
		});
		this.rxnArrows.each(function (id, item) {
			extend(item.pp);
		});
	}
	if (!bb && global)
		bb = {
			min: new Vec2(0, 0),
			max: new Vec2(1, 1)
		};
	return bb;
};

Struct.prototype.getCoordBoundingBoxObj = function ()
{
	var bb = null;
	var extend = function (pp) {
		if (!bb)
			bb = {
				min: new Vec2(pp),
				max: new Vec2(pp)
			};
		else {
			bb.min = Vec2.min(bb.min, pp);
			bb.max = Vec2.max(bb.max, pp);
		}
	};

	this.atoms.each(function (aid, atom) {
		extend(atom.pp);
	});
	return bb;
};

Struct.prototype.getBondLengthData = function ()
{
	var totalLength = 0;
	var cnt = 0;
	this.bonds.each(function (bid, bond){
		totalLength += Vec2.dist(
			this.atoms.get(bond.begin).pp,
			this.atoms.get(bond.end).pp);
		cnt++;
	}, this);
	return {cnt:cnt, totalLength:totalLength};
};

Struct.prototype.getAvgBondLength = function ()
{
	var bld = this.getBondLengthData();
	return bld.cnt > 0 ? bld.totalLength / bld.cnt : -1;
};

Struct.prototype.getAvgClosestAtomDistance = function ()
{
	var totalDist = 0, minDist, dist = 0;
	var keys = this.atoms.keys(), k, j;
	for (k = 0; k < keys.length; ++k) {
		minDist = -1;
		for (j = 0; j < keys.length; ++j) {
			if (j == k)
				continue;
			dist = Vec2.dist(this.atoms.get(keys[j]).pp, this.atoms.get(keys[k]).pp);
			if (minDist < 0 || minDist > dist)
				minDist = dist;
		}
		totalDist += minDist;
	}

	return keys.length > 0 ? totalDist / keys.length : -1;
};

Struct.prototype.checkBondExists = function (begin, end)
{
	var bondExists = false;
	this.bonds.each(function (bid, bond){
		if ((bond.begin == begin && bond.end == end) ||
		(bond.end == begin && bond.begin == end))
			bondExists = true;
	}, this);
	return bondExists;
};

var Loop = function (/*Array of num*/hbs, /*Struct*/struct, /*bool*/convex)
{
	this.hbs = hbs; // set of half-bonds involved
	this.dblBonds = 0; // number of double bonds in the loop
	this.aromatic = true;
	this.convex = convex || false;

	hbs.each(function (hb){
		var bond = struct.bonds.get(struct.halfBonds.get(hb).bid);
		if (bond.type != Bond.PATTERN.TYPE.AROMATIC)
			this.aromatic = false;
		if (bond.type == Bond.PATTERN.TYPE.DOUBLE)
			this.dblBonds++;
	}, this);
};

Struct.RxnPlus = function (params)
{
	params = params || {};
	this.pp = params.pp ? new Vec2(params.pp) : new Vec2();
};

Struct.RxnPlus.prototype.clone = function ()
{
	return new Struct.RxnPlus(this);
};

Struct.RxnArrow = function (params)
{
	params = params || {};
	this.pp = params.pp ? new Vec2(params.pp) : new Vec2();
};

Struct.RxnArrow.prototype.clone = function ()
{
	return new Struct.RxnArrow(this);
};

Struct.prototype.findConnectedComponent = function (aid) {
	var map = {};
	var list = [aid];
	var ids = Set.empty();
	while (list.length > 0) {
		(function () {
			var aid = list.pop();
			map[aid] = 1;
			Set.add(ids, aid);
			var atom = this.atoms.get(aid);
			for (var i = 0; i < atom.neighbors.length; ++i) {
				var neiId = this.halfBonds.get(atom.neighbors[i]).end;
				if (!Set.contains(ids, neiId))
					list.push(neiId);
			}
		}).apply(this);
	}
	return ids;
};

Struct.prototype.findConnectedComponents = function (discardExistingFragments) {
	// NB: this is a hack
	// TODO: need to maintain half-bond and neighbor structure permanently
	if (!this.halfBonds.count()) {
		this.initHalfBonds();
		this.initNeighbors();
		this.updateHalfBonds(this.atoms.keys());
		this.sortNeighbors(this.atoms.keys());
	}

	var map = {};
	this.atoms.each(function (aid) {
		map[aid] = -1;
	}, this);
	var components = [];
	this.atoms.each(function (aid,atom){
		if ((discardExistingFragments || atom.fragment < 0) && map[aid] < 0) {
			var component = this.findConnectedComponent(aid);
			components.push(component);
			Set.each(component, function (aid){
				map[aid] = 1;
			}, this);
		}
	}, this);
	return components;
};

Struct.prototype.markFragment = function (ids) {
	var fid = this.frags.add(new Struct.Fragment());
	Set.each(ids, function (aid){
		this.atoms.get(aid).fragment = fid;
	}, this);
};

Struct.prototype.markFragmentByAtomId = function (aid) {
	this.markFragment(this.findConnectedComponent(aid));
};

Struct.prototype.markFragments = function () {
	var components = this.findConnectedComponents();
	for (var i = 0; i < components.length; ++i) {
		this.markFragment(components[i]);
	}
};

Struct.Fragment = function () {
};
Struct.Fragment.prototype.clone = function () {
	return Object.clone(this);
};

Struct.Fragment.getAtoms = function (struct, frid) {
	var atoms = [];
	struct.atoms.each(function (aid, atom) {
		if (atom.fragment == frid)
			atoms.push(aid);
	}, this);
	return atoms;
}

Struct.RGroup = function (logic) {
	logic = logic || {};
	this.frags = new Pool();
	this.resth = logic.resth || false;
	this.range = logic.range || '';
	this.ifthen = logic.ifthen || 0;
};

Struct.RGroup.prototype.getAttrs = function () {
	return {
		resth: this.resth,
		range: this.range,
		ifthen: this.ifthen
	};
};

Struct.RGroup.findRGroupByFragment = function (rgroups, frid) {
	var ret;
	rgroups.each(function (rgid, rgroup) {
		if (!Object.isUndefined(rgroup.frags.keyOf(frid))) ret = rgid;
	});
	return ret;
};
Struct.RGroup.prototype.clone = function (fidMap) {
	var ret = new Struct.RGroup(this);
	this.frags.each(function (fnum, fid) {
		ret.frags.add(fidMap ? fidMap[fid] : fid);
	});
	return ret;
};

Struct.prototype.scale = function (scale)
{
	if (scale != 1) {
		this.atoms.each(function (aid, atom){
			atom.pp = atom.pp.scaled(scale);
		}, this);
		this.rxnPluses.each(function (id, item){
			item.pp = item.pp.scaled(scale);
		}, this);
		this.rxnArrows.each(function (id, item){
			item.pp = item.pp.scaled(scale);
		}, this);
		this.sgroups.each(function (id, item){
			item.pp = item.pp ? item.pp.scaled(scale) : null;
		}, this);
	}
};

Struct.prototype.rescale = function ()
{
	var avg = this.getAvgBondLength();
	if (avg < 0 && !this.isReaction) // TODO [MK] this doesn't work well for reactions as the distances between
		// the atoms in different components are generally larger than those between atoms of a single component
		// (KETCHER-341)
		avg = this.getAvgClosestAtomDistance();
	if (avg < 1e-3)
		avg = 1;
	var scale = 1 / avg;
	this.scale(scale);
};

Struct.prototype.loopHasSelfIntersections = function (hbs)
{
	for (var i = 0; i < hbs.length; ++i) {
		var hbi = this.halfBonds.get(hbs[i]);
		var ai = this.atoms.get(hbi.begin).pp;
		var bi = this.atoms.get(hbi.end).pp;
		var set = Set.fromList([hbi.begin, hbi.end]);
		for (var j = i + 2; j < hbs.length; ++j) {
			var hbj = this.halfBonds.get(hbs[j]);
			if (Set.contains(set, hbj.begin) || Set.contains(set, hbj.end))
				continue; // skip edges sharing an atom
			var aj = this.atoms.get(hbj.begin).pp;
			var bj = this.atoms.get(hbj.end).pp;
			if (Vec2.segmentIntersection(ai, bi, aj, bj)) {
				return true;
			}
		}
	}
	return false;
}

// partition a cycle into simple cycles
// TODO: [MK] rewrite the detection algorithm to only find simple ones right away?
Struct.prototype.partitionLoop = function (loop) {
	var subloops = [];
	var continueFlag = true;
	search: while (continueFlag) {
			var atomToHalfBond = {}; // map from every atom in the loop to the index of the first half-bond starting from that atom in the uniqHb array
			for (var l = 0; l < loop.length; ++l) {
				var hbid = loop[l];
				var aid1 = this.halfBonds.get(hbid).begin;
				var aid2 = this.halfBonds.get(hbid).end;
				if (aid2 in atomToHalfBond) { // subloop found
					var s = atomToHalfBond[aid2]; // where the subloop begins
					var subloop = loop.slice(s, l + 1);
					subloops.push(subloop);
					if (l < loop.length) // remove half-bonds corresponding to the subloop
						loop.splice(s, l - s + 1);
					continue search;
				}
				atomToHalfBond[aid1] = l;
			}
			continueFlag = false; // we're done, no more subloops found
			subloops.push(loop);
		}
	return subloops;
}

Struct.prototype.halfBondAngle = function (hbid1, hbid2) {
	var hba = this.halfBonds.get(hbid1);
	var hbb = this.halfBonds.get(hbid2);
	return Math.atan2(
	Vec2.cross(hba.dir, hbb.dir),
	Vec2.dot(hba.dir, hbb.dir));
}

Struct.prototype.loopIsConvex = function (loop) {
	for (var k = 0; k < loop.length; ++k) {
		var angle = this.halfBondAngle(loop[k], loop[(k + 1) % loop.length]);
		if (angle > 0)
			return false;
	}
	return true;
}

// check whether a loop is on the inner or outer side of the polygon
//  by measuring the total angle between bonds
Struct.prototype.loopIsInner = function (loop) {
	var totalAngle = 2 * Math.PI;
	for (var k = 0; k < loop.length; ++k) {
		var hbida = loop[k];
		var hbidb = loop[(k + 1) % loop.length];
		var hbb = this.halfBonds.get(hbidb);
		var angle = this.halfBondAngle(hbida, hbidb);
		if (hbb.contra == loop[k]) // back and forth along the same edge
			totalAngle += Math.PI;
		else
			totalAngle += angle;
	}
	return Math.abs(totalAngle) < Math.PI;
}

Struct.prototype.findLoops = function ()
{
	var newLoops = [];
	var bondsToMark = Set.empty();

	// Starting from each half-bond not known to be in a loop yet,
	//  follow the 'next' links until the initial half-bond is reached or
	//  the length of the sequence exceeds the number of half-bonds available.
	// In a planar graph, as long as every bond is a part of some "loop" -
	//  either an outer or an inner one - every iteration either yields a loop
	//  or doesn't start at all. Thus this has linear complexity in the number
	//  of bonds for planar graphs.
	var j, c, loop, loopId;
	this.halfBonds.each(function (i, hb) {
		if (hb.loop == -1) {
			for (j = i, c = 0, loop = [];
				c <= this.halfBonds.count();
				j = this.halfBonds.get(j).next, ++c) {
				if (c > 0 && j == i) { // loop found
					var subloops = this.partitionLoop(loop);
					util.each(subloops, function (loop) {
						if (this.loopIsInner(loop) && !this.loopHasSelfIntersections(loop)) { // loop is internal
							// use lowest half-bond id in the loop as the loop id
							// this ensures that the loop gets the same id if it is discarded and then recreated,
							// which in turn is required to enable redrawing while dragging, as actions store item id's
							loopId = util.arrayMin(loop);
							this.loops.set(loopId, new Loop(loop, this, this.loopIsConvex(loop)));
						} else {
							loopId = -2;
						}
						loop.each(function (hbid){
							this.halfBonds.get(hbid).loop = loopId;
							Set.add(bondsToMark, this.halfBonds.get(hbid).bid);
						}, this);
						if (loopId >= 0) {
							newLoops.push(loopId);
						}
					}, this);
					break;
				} else {
					loop.push(j);
				}
			}
		}
	}, this);
	return {
		newLoops: newLoops,
		bondsToMark: Set.list(bondsToMark)
	};
};

// NB: this updates the structure without modifying the corresponding ReStruct.
//  To be applied to standalone structures only.
Struct.prototype.prepareLoopStructure = function () {
    this.initHalfBonds();
    this.initNeighbors();
    this.updateHalfBonds(this.atoms.keys());
    this.sortNeighbors(this.atoms.keys());
    this.findLoops();
};

Struct.prototype.atomAddToSGroup = function (sgid, aid) {
    // TODO: [MK] make sure the addition does not break the hierarchy?
    SGroup.addAtom(this.sgroups.get(sgid), aid);
    Set.add(this.atoms.get(aid).sgs, sgid);
};

Struct.prototype.calcConn = function (aid) {
    var conn = 0;
    var atom = this.atoms.get(aid);
    var hasAromatic = false;
    for (var i = 0; i < atom.neighbors.length; ++i) {
        var hb = this.halfBonds.get(atom.neighbors[i]);
        var bond = this.bonds.get(hb.bid);
        switch (bond.type) {
            case Bond.PATTERN.TYPE.SINGLE:
                conn += 1;
                break;
            case Bond.PATTERN.TYPE.DOUBLE:
                conn += 2;
                break;
            case Bond.PATTERN.TYPE.TRIPLE:
                conn += 3;
                break;
            case Bond.PATTERN.TYPE.AROMATIC:
                conn += 1;
                hasAromatic = true;
                break;
            default:
                return -1;
        }
    }
    if (hasAromatic)
        conn += 1;
    return conn;
};

Struct.prototype.calcImplicitHydrogen = function (aid) {
    var conn = this.calcConn(aid);
    var atom = this.atoms.get(aid);
    atom.badConn = false;
    if (conn < 0 || atom.isQuery()) {
        atom.implicitH = 0;
        return;
    }
    if (atom.explicitValence >= 0) {
        var elem = element.getElementByLabel(atom.label);
        atom.implicitH = 0;
        if (elem != null) {
            atom.implicitH = atom.explicitValence - atom.calcValenceMinusHyd(conn);
            if (atom.implicitH < 0) {
                atom.implicitH = 0;
                atom.badConn = true;
            }
        }
    } else {
        atom.calcValence(conn);
    }
};

Struct.prototype.setImplicitHydrogen = function (list) {
    var f = function (aid) { this.calcImplicitHydrogen(aid); };
    if (util.isNullOrUndefined(list))
        this.atoms.each(f, this);
    else
        util.each(list, f, this);
};

Struct.prototype.getComponents = function () {
    /* saver */
    var ccs = this.findConnectedComponents(true);
    var submols = [];
    var barriers = [];
    var arrowPos = null;
    this.rxnArrows.each(function (id, item) { // there's just one arrow
        arrowPos = item.pp.x;
    });
    this.rxnPluses.each(function (id, item) {
        barriers.push(item.pp.x);
    });
    if (arrowPos != null)
        barriers.push(arrowPos);
    barriers.sort(function (a, b) { return a - b; });
    var components = [];

    var i;
    for (i = 0; i < ccs.length; ++i) {
        var bb = this.getCoordBoundingBox(ccs[i]);
        var c = Vec2.lc2(bb.min, 0.5, bb.max, 0.5);
        var j = 0;
        while (c.x > barriers[j])
            ++j;
        components[j] = components[j] || {};
        Set.mergeIn(components[j], ccs[i]);
    }
    var submolTexts = [];
    var reactants = [], products = [];
    for (i = 0; i < components.length; ++i) {
        if (!components[i]) {
            submolTexts.push('');
            continue;
        }
        bb = this.getCoordBoundingBox(components[i]);
        c = Vec2.lc2(bb.min, 0.5, bb.max, 0.5);
        if (c.x < arrowPos)
            reactants.push(components[i]);
        else
            products.push(components[i]);
    }

    return {
        'reactants': reactants,
        'products': products
    };
};

module.exports = Struct;

},{"../util":40,"../util/map":41,"../util/pool":42,"../util/set":43,"../util/vec2":44,"./bond":9,"./element":12,"./sgforest":14,"./sgroup":15}],19:[function(require,module,exports){
(function (global){
var queryString = require('query-string');

var util = require('./util');
var api = require('./api.js');

require('./ui');
var molfile = require('./chem/molfile');
var smiles = require('./chem/smiles');

require('./rnd');

var ui = global.ui;
var rnd = global.rnd;

function getSmiles() {
	return smiles.stringify(ui.ctab, { ignoreErrors: true });
};

function getMolfile() {
	return molfile.stringify(ui.ctab, { ignoreErrors: true });
};

function setMolecule(molString) {
	if (!Object.isString(molString)) {
		return;
	}
	ui.loadMolecule(molString);
};

function addFragment(molString) {
	if (!Object.isString(molString)) {
		return;
	}
	ui.loadFragment(molString);
};

function showMolfile(clientArea, molString, options) {
	var opts = util.extend({
		bondLength: 75,
		showSelectionRegions: false,
		showBondIds: false,
		showHalfBondIds: false,
		showLoopIds: false,
		showAtomIds: false,
		autoScale: false,
		autoScaleMargin: 4,
		hideImplicitHydrogen: false
	}, options);
	var render = new rnd.Render(clientArea, opts.bondLength, opts);
	if (molString) {
		var mol = molfile.parse(molString);
		render.setMolecule(mol);
	}
	render.update();
	// not sure we need to expose guts
	return render;
};

function onStructChange(handler) {
	util.assert(handler);
	ui.render.addStructChangeHandler(handler);
};

// TODO: replace window.onload with something like <https://github.com/ded/domready>
// to start early
window.onload = function () {
	var params = queryString.parse(document.location.search);
	if (params.api_path)
		ketcher.api_path = params.api_path;
	ketcher.server = api(ketcher.api_path);
	ui.init(util.extend({}, params), ketcher.server);
};

var ketcher = module.exports = {
	version: '2.0.0-alpha.3+r27',
	api_path: '',
	build_date: '2015-12-08 09-14-33',
	build_number: '' || null,
	build_options: '__BUILD_OPTIONS__',

	getSmiles: getSmiles,
	getMolfile: getMolfile,
	setMolecule: setMolecule,
	addFragment: addFragment,
	showMolfile: showMolfile,
	onStructChange: onStructChange
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./api.js":7,"./chem/molfile":13,"./chem/smiles":16,"./rnd":22,"./ui":35,"./util":40,"query-string":4}],20:[function(require,module,exports){
(function (global){
// Single entry point to Raphaël library

var Raphael = (typeof window !== "undefined" ? window['Raphael'] : typeof global !== "undefined" ? global['Raphael'] : null);
var Vec2 = require('./util/vec2');

// TODO: refactor ugly prototype extensions to plain old functions
Raphael.el.translateAbs = function (x,y) {
	this.delta = this.delta || new Vec2();
	this.delta.x += x - 0;
	this.delta.y += y - 0;
	this.transform('t' + this.delta.x.toString() + ',' + this.delta.y.toString());
};

Raphael.st.translateAbs = function (x,y) {
	this.forEach(function (el) {
		el.translateAbs(x,y);
	});
};

module.exports = Raphael;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./util/vec2":44}],21:[function(require,module,exports){
(function (global){
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var Action = require('../ui/action');

var element = require('../chem/element');
var Struct = require('../chem/struct');
var Atom = require('../chem/atom');
var Bond = require('../chem/bond');
var molfile = require('../chem/molfile');
var SGroup = require('../chem/sgroup');

require('./restruct');

var rnd = global.rnd = global.rnd || {}; // jshint ignore:line
var ui = global.ui;

var Editor = function (render)
{
	this.render = render;
	this._selectionHelper = new Editor.SelectionHelper(this);
};

Editor.prototype.selectAll = function () {
	var selection = {};
	for (var map in rnd.ReStruct.maps) {
		selection[map] = ui.render.ctab[map].ikeys();
	}
	this._selectionHelper.setSelection(selection);
};
Editor.prototype.deselectAll = function () {
	this._selectionHelper.setSelection();
};
Editor.prototype.hasSelection = function (copyable) {
	if ('selection' in this._selectionHelper)
		for (var map in this._selectionHelper.selection)
			if (this._selectionHelper.selection[map].length > 0)
			if (!copyable || map !== 'sgroupData')
				return true;
	return false;
};
Editor.prototype.getSelection = function (explicit) {
	var selection = {};
	if ('selection' in this._selectionHelper) {
		for (var map in this._selectionHelper.selection) {
			selection[map] = this._selectionHelper.selection[map].slice(0);
		}
	}
	if (explicit) {
		var struct = this.render.ctab.molecule;
		// "auto-select" the atoms for the bonds in selection
		if ('bonds' in selection) {
			selection.bonds.each(
			function (bid) {
				var bond = struct.bonds.get(bid);
				selection.atoms = selection.atoms || [];
				if (selection.atoms.indexOf(bond.begin) < 0) selection.atoms.push(bond.begin);
				if (selection.atoms.indexOf(bond.end) < 0) selection.atoms.push(bond.end);
			},
				this
			);
		}
		// "auto-select" the bonds with both atoms selected
		if ('atoms' in selection && 'bonds' in selection) {
			struct.bonds.each(
			function (bid) {
				if (!('bonds' in selection) || selection.bonds.indexOf(bid) < 0) {
					var bond = struct.bonds.get(bid);
					if (selection.atoms.indexOf(bond.begin) >= 0 && selection.atoms.indexOf(bond.end) >= 0) {
						selection.bonds = selection.bonds || [];
						selection.bonds.push(bid);
					}
				}
			},
				this
			);
		}
	}
	return selection;
};

Editor.prototype.getSelectionStruct = function () {
	console.assert(ui.ctab == this.render.ctab.molecule,
	               'Another ctab');
	var src = ui.ctab;
	var selection = this.getSelection(true);
	var dst = src.clone(Set.fromList(selection.atoms),
	                    Set.fromList(selection.bonds), true);

	// Copy by its own as Struct.clone doesn't support
	// arrows/pluses id sets
	src.rxnArrows.each(function (id, item) {
		if (selection.rxnArrows.indexOf(id) != -1)
			dst.rxnArrows.add(item.clone());
	});
	src.rxnPluses.each(function (id, item) {
		if (selection.rxnPluses.indexOf(id) != -1)
			dst.rxnPluses.add(item.clone());
	});

	// TODO: should be reaction only if arrwos? check this logic
	dst.isReaction = src.isReaction &&
		(dst.rxnArrows.count() || dst.rxnPluses.count());

	return dst;
};

Editor.SelectionHelper = function (editor) {
	this.editor = editor;
};
Editor.SelectionHelper.prototype.setSelection = function (selection, add) {
	if (!('selection' in this) || !add) {
		this.selection = {};
		for (var map1 in rnd.ReStruct.maps) this.selection[map1] = []; // TODO it should NOT be mandatory
	}
	if (selection && 'id' in selection && 'map' in selection) {
		(selection[selection.map] = selection[selection.map] || []).push(selection.id);
	}
	if (selection) {
		for (var map2 in this.selection) {
			if (map2 in selection) {
				for (var i = 0; i < selection[map2].length; i++) {
					if (this.selection[map2].indexOf(selection[map2][i]) < 0) {
						this.selection[map2].push(selection[map2][i]);
					}
				}
			}
		}
	}
	this.editor.render.setSelection(this.selection);
	this.editor.render.update();

	ui.updateClipboardButtons(); // TODO notify ui about selection
};
Editor.SelectionHelper.prototype.isSelected = function (item) {
	var render = this.editor.render;
	var ctab = render.ctab;
	if (item.map == 'frags' || item.map == 'rgroups') {
		var atoms = item.map == 'frags' ?
			ctab.frags.get(item.id).fragGetAtoms(render, item.id) :
			ctab.rgroups.get(item.id).getAtoms(render);
		return !Object.isUndefined(this.selection['atoms'])
			 && Set.subset(Set.fromList(atoms), Set.fromList(this.selection['atoms']));
	}
	return 'selection' in this && !Object.isUndefined(this.selection[item.map]) &&
	this.selection[item.map].indexOf(item.id) > -1;
};


Editor.EditorTool = function (editor) {
	this.editor = editor;
};
Editor.EditorTool.prototype.processEvent = function (name, event, action) {
	if (!('touches' in event) || event.touches.length == 1) {
		if (name + '0' in this)
			return this[name + '0'](event, action);
		else if (name in this)
			return this[name](event, action);
		console.log('EditorTool.dispatchEvent: event \'' + name + '\' is not handled.');
	} else if ('lastEvent' in this.OnMouseDown0) {
		// here we finish previous MouseDown and MouseMoves with simulated MouseUp
		// before gesture (canvas zoom, scroll, rotate) started
		return this.OnMouseUp0(event, action);
	}
};
Editor.EditorTool.prototype.OnMouseDown = function () {};
Editor.EditorTool.prototype.OnMouseMove = function () {};
Editor.EditorTool.prototype.OnMouseUp = function () {};
Editor.EditorTool.prototype.OnClick = function () {};
Editor.EditorTool.prototype.OnDblClick = function () {};
Editor.EditorTool.prototype.OnMouseLeave = function () { this.OnCancel();};
Editor.EditorTool.prototype.OnKeyPress = function () {};
Editor.EditorTool.prototype.OnCancel = function () {}; // called when we abandon the tool
Editor.EditorTool.prototype.OnMouseDown0 = function (event) {
	if (ui.hideBlurredControls()) return true; // TODO review (don't stop propagation to handle dropdown closing)

	this.OnMouseDown0.lastEvent = event;
	this.OnMouseMove0.lastEvent = event;

	if ('OnMouseDown' in this) return this.OnMouseDown(event);
};
Editor.EditorTool.prototype.OnMouseMove0 = function (event) {
	this.OnMouseMove0.lastEvent = event;

	if ('OnMouseMove' in this) return this.OnMouseMove(event);
};
Editor.EditorTool.prototype.OnMouseUp0 = function (event) {
	// here we suppress event we got when second touch released in guesture
	if (!('lastEvent' in this.OnMouseDown0)) return true;

	if ('lastEvent' in this.OnMouseMove0) {
		// this data is missing for 'touchend' event when last finger is out
		event = Object.clone(event); // pageX & pageY properties are readonly in Opera
		event.pageX = this.OnMouseMove0.lastEvent.pageX;
		event.pageY = this.OnMouseMove0.lastEvent.pageY;
	}

	try {
		if ('OnMouseUp' in this) return this.OnMouseUp(event);
	} finally {
		delete this.OnMouseDown0.lastEvent;
	}
};

Editor.EditorTool.atom_label_map = {
	atom_tool_any: 'A',
	atom_tool_h: 'H',
	atom_tool_c: 'C',
	atom_tool_n: 'N',
	atom_tool_o: 'O',
	atom_tool_s: 'S',
	atom_tool_p: 'P',
	atom_tool_f: 'F',
	atom_tool_br: 'Br',
	atom_tool_cl: 'Cl',
	atom_tool_i: 'I'
};

Editor.EditorTool.prototype.OnKeyPress0 = function (event, action) {
	if (action === 'rgroup_tool_label' && 'lastEvent' in this.OnMouseMove0) {
		return Editor.RGroupAtomTool.prototype.OnMouseUp.call(this,
			this.OnMouseMove0.lastEvent);
	} else if (action in Editor.EditorTool.atom_label_map) {
		var label = Editor.EditorTool.atom_label_map[action];
		var selection = this.editor.getSelection();
		if (selection && 'atoms' in selection && selection.atoms.length > 0) {
			ui.addUndoAction(Action.fromAtomsAttrs(
				selection.atoms, {label: label}, true), true);
			ui.render.update();
			return true;
		} else {
			var ci = this.editor.render.findItem(this.OnMouseMove0.lastEvent);
			if (ci) {
				ci.label = {label: label};
				if (ci.map === 'atoms') {
					ui.addUndoAction(Action.fromAtomsAttrs(
						ci.id, ci.label, true), true);
				} else if (ci.id == -1) {
					ui.addUndoAction(
					Action.fromAtomAddition(
					ui.page2obj(
						this.OnMouseMove0.lastEvent), ci.label), true);
				}
				ui.render.update();
				return true;
			}
		}
	}
	if ('OnKeyPress' in this)
		return this.OnKeyPress(event);
	return false;
};

Editor.EditorTool.prototype._calcAngle = function (pos0, pos1) {
	var v = Vec2.diff(pos1, pos0);
	var angle = Math.atan2(v.y, v.x);
	var sign = angle < 0 ? -1 : 1;
	var floor = Math.floor(Math.abs(angle) / (Math.PI / 12)) * (Math.PI / 12);
	angle = sign * (floor + ((Math.abs(angle) - floor < Math.PI / 24) ? 0 : Math.PI / 12));
	return angle;
};
Editor.EditorTool.prototype._calcNewAtomPos = function (pos0, pos1) {
	var v = new Vec2(1, 0).rotate(this._calcAngle(pos0, pos1));
	v.add_(pos0);
	return v;
};


Editor.EditorTool.HoverHelper = function (editorTool) {
	this.editorTool = editorTool;
};
Editor.EditorTool.HoverHelper.prototype.hover = function (ci) {
	if (ci && ci.type == 'Canvas')
		ci = null;
	// TODO add custom highlight style parameter, to be used when fusing atoms, sgroup children highlighting, etc
	if ('ci' in this && (!ci || this.ci.type != ci.type || this.ci.id != ci.id)) {
		this.editorTool.editor.render.highlightObject(this.ci, false);
		delete this.ci;
	}
	if (ci && this.editorTool.editor.render.highlightObject(ci, true)) {
		this.ci = ci;
	}
};

Editor.LassoTool = function (editor, mode, fragment) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
	this._lassoHelper = new Editor.LassoTool.LassoHelper(mode || 0, editor, fragment);
	this._sGroupHelper = new Editor.SGroupTool.SGroupHelper(editor);
};
Editor.LassoTool.prototype = new Editor.EditorTool();
Editor.LassoTool.prototype.OnMouseDown = function (event) {
	var render = this.editor.render;
	var ctab = render.ctab, mol = ctab.molecule;
	this._hoverHelper.hover(null); // TODO review hovering for touch devices
	var selectFragment = (this._lassoHelper.fragment || event.ctrlKey);
	var ci = this.editor.render.findItem(
		event,
		selectFragment ?
			['frags', 'sgroups', 'sgroupData', 'rgroups', 'rxnArrows', 'rxnPluses', 'chiralFlags'] :
			['atoms', 'bonds', 'sgroups', 'sgroupData', 'rgroups', 'rxnArrows', 'rxnPluses', 'chiralFlags']
	);
	if (!ci || ci.type == 'Canvas') {
		if (!this._lassoHelper.fragment)
			this._lassoHelper.begin(event);
	} else {
		this._hoverHelper.hover(null);
		if ('onShowLoupe' in this.editor.render)
			this.editor.render.onShowLoupe(true);
		if (!this.editor._selectionHelper.isSelected(ci)) {
			if (ci.map == 'frags') {
				var frag = ctab.frags.get(ci.id);
				this.editor._selectionHelper.setSelection(
				{ 'atoms': frag.fragGetAtoms(render, ci.id), 'bonds': frag.fragGetBonds(render, ci.id) },
					event.shiftKey
				);
			} else if (ci.map == 'sgroups') {
				var sgroup = ctab.sgroups.get(ci.id).item;
				this.editor._selectionHelper.setSelection(
				{ 'atoms': SGroup.getAtoms(mol, sgroup), 'bonds': SGroup.getBonds(mol, sgroup) },
					event.shiftKey
				);
			} else if (ci.map == 'rgroups') {
				var rgroup = ctab.rgroups.get(ci.id);
				this.editor._selectionHelper.setSelection(
				{ 'atoms': rgroup.getAtoms(render), 'bonds': rgroup.getBonds(render) },
					event.shiftKey
				);
			} else {
				this.editor._selectionHelper.setSelection(ci, event.shiftKey);
			}
		}
		this.dragCtx = {
			item: ci,
			xy0: ui.page2obj(event)
		};
		if (ci.map == 'atoms' && !ui.is_touch) {
			var self = this;
			this.dragCtx.timeout = setTimeout(
			function () {
				delete self.dragCtx;
				self.editor._selectionHelper.setSelection(null);
				ui.showLabelEditor(ci.id);
			},
				750
			);
			this.dragCtx.stopTapping = function () {
				if ('timeout' in self.dragCtx) {
					clearTimeout(self.dragCtx.timeout);
					delete self.dragCtx.timeout;
				}
			};
		}
	}
	return true;
};

Editor.LassoTool.prototype.OnMouseMove = function (event) {
	if ('dragCtx' in this) {
		if ('stopTapping' in this.dragCtx) this.dragCtx.stopTapping();
		// moving selected objects
		if (this.dragCtx.action) {
			this.dragCtx.action.perform();
			this.editor.render.update(); // redraw the elements in unshifted position, lest the have different offset
		}
		this.dragCtx.action = Action.fromMultipleMove(
		this.editor.getSelection(true),
		ui.page2obj(event).sub(this.dragCtx.xy0));
		// finding & highlighting object to stick to
		if (['atoms'/*, 'bonds'*/].indexOf(this.dragCtx.item.map) >= 0) {
			// TODO add bond-to-bond fusing
			var ci = this.editor.render.findItem(event, [this.dragCtx.item.map], this.dragCtx.item);
			this._hoverHelper.hover(ci.map == this.dragCtx.item.map ? ci : null);
		}
		this.editor.render.update();
	} else if (this._lassoHelper.running()) {
		this.editor._selectionHelper.setSelection(this._lassoHelper.addPoint(event), event.shiftKey);
	} else {
		this._hoverHelper.hover(
		this.editor.render.findItem(
			event,
			(this._lassoHelper.fragment || event.ctrlKey) ?
				['frags', 'sgroups', 'sgroupData', 'rgroups', 'rxnArrows', 'rxnPluses', 'chiralFlags'] :
				['atoms', 'bonds', 'sgroups', 'sgroupData', 'rgroups', 'rxnArrows', 'rxnPluses', 'chiralFlags']
		)
		);
	}
	return true;
};
Editor.LassoTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		if ('stopTapping' in this.dragCtx) this.dragCtx.stopTapping();
		if (['atoms'/*, 'bonds'*/].indexOf(this.dragCtx.item.map) >= 0) {
			// TODO add bond-to-bond fusing
			var ci = this.editor.render.findItem(event, [this.dragCtx.item.map], this.dragCtx.item);
			if (ci.map == this.dragCtx.item.map) {
				this._hoverHelper.hover(null);
				this.editor._selectionHelper.setSelection();
				this.dragCtx.action = this.dragCtx.action
						 ? Action.fromAtomMerge(this.dragCtx.item.id, ci.id).mergeWith(this.dragCtx.action)
						 : Action.fromAtomMerge(this.dragCtx.item.id, ci.id);
			}
		}
		ui.addUndoAction(this.dragCtx.action, true);
		this.editor.render.update();
		delete this.dragCtx;
	} else {
		if (this._lassoHelper.running()) { // TODO it catches more events than needed, to be re-factored
			this.editor._selectionHelper.setSelection(this._lassoHelper.end(), event.shiftKey);
		} else if (this._lassoHelper.fragment) {
			this.editor._selectionHelper.setSelection();
		}
	}
	return true;
};
Editor.LassoTool.prototype.OnDblClick = function (event) {
	var ci = this.editor.render.findItem(event);
	if (ci.map == 'atoms') {
		this.editor._selectionHelper.setSelection(ci);
		// TODO [RB] re-factoring needed. we probably need to intoduce "custom" element sets, some of them might be "special" (lists, r-groups), some of them might be "pluggable" (reaxys generics)
		var atom = ui.ctab.atoms.get(ci.id);
		if (atom.label == 'R#') {
			Editor.RGroupAtomTool.prototype.OnMouseUp.call(this, event);
		} else if (atom.label == 'L#') {
			ui.showElemTable({
				selection: atom,
				onOk: function (attrs) {
					if (atom.label != attrs.label || !atom.atomList.equals(attrs.atomList)) {
						ui.addUndoAction(Action.fromAtomsAttrs(ci.id, attrs));
						ui.render.update();
					}
					return true;
				}.bind(this)
			});
		} else if ((element.getElementByLabel(atom.label) || 121) < 120) {
			ui.showAtomProperties(ci.id);
		} else {
			ui.showReaGenericsTable({
				values: [atom.label],
				onOk: function (res) {
					var label = res.values[0];
					if (atom.label != label) {
						ui.addUndoAction(Action.fromAtomsAttrs(ci.id, {label: label}));
						ui.render.update();
					}
					return true;
				}.bind(this)
			});
		}
	} else if (ci.map == 'bonds') {
		this.editor._selectionHelper.setSelection(ci);
		ui.showBondProperties(ci.id);
	} else if (ci.map == 'sgroups') {
		this.editor._selectionHelper.setSelection(ci);
		this._sGroupHelper.showPropertiesDialog(ci.id);
//    } else if (ci.map == 'sgroupData') {
//        this._sGroupHelper.showPropertiesDialog(ci.sgid);
	}
	return true;
};
Editor.LassoTool.prototype.OnCancel = function () {
	if ('dragCtx' in this) {
		if ('stopTapping' in this.dragCtx) this.dragCtx.stopTapping();
		ui.addUndoAction(this.dragCtx.action, true);
		this.editor.render.update();
		delete this.dragCtx;
	} else if (this._lassoHelper.running()) {
		this.editor._selectionHelper.setSelection(this._lassoHelper.end());
	}
	this._hoverHelper.hover(null);
};


Editor.LassoTool.LassoHelper = function (mode, editor, fragment) {
	this.mode = mode;
	this.fragment = fragment;
	this.editor = editor;
};
Editor.LassoTool.LassoHelper.prototype.getSelection = function () {
	if (this.mode == 0) {
		return ui.render.getElementsInPolygon(this.points);
	} else if (this.mode == 1) {
		return ui.render.getElementsInRectangle(this.points[0], this.points[1]);
	} else {
		throw new Error('Selector mode unknown');
	}
};
Editor.LassoTool.LassoHelper.prototype.begin = function (event) {
	this.points = [ ui.page2obj(event) ];
	if (this.mode == 1) {
		this.points.push(this.points[0]);
	}
};
Editor.LassoTool.LassoHelper.prototype.running = function () {
	return 'points' in this;
};
Editor.LassoTool.LassoHelper.prototype.addPoint = function (event) {
	if (!this.running()) return false;
	if (this.mode == 0) {
		this.points.push(ui.page2obj(event));
		this.editor.render.drawSelectionPolygon(this.points);
	} else if (this.mode == 1) {
		this.points = [ this.points[0], ui.page2obj(event) ];
		this.editor.render.drawSelectionRectangle(this.points[0], this.points[1]);
	}
	return this.getSelection();
};
Editor.LassoTool.LassoHelper.prototype.end = function () {
	var ret = this.getSelection();
	if ('points' in this) {
		this.editor.render.drawSelectionPolygon(null);
		delete this.points;
	}
	return ret;
};


Editor.EraserTool = function (editor, mode) {
	this.editor = editor;

	this.maps = ['atoms', 'bonds', 'rxnArrows', 'rxnPluses', 'sgroups', 'sgroupData', 'chiralFlags'];
	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
	this._lassoHelper = new Editor.LassoTool.LassoHelper(mode || 0, editor);
};
Editor.EraserTool.prototype = new Editor.EditorTool();
Editor.EraserTool.prototype.OnMouseDown = function (event) {
	var ci = this.editor.render.findItem(event, this.maps);
	if (!ci || ci.type == 'Canvas') {
		this._lassoHelper.begin(event);
	}
};
Editor.EraserTool.prototype.OnMouseMove = function (event) {
	if (this._lassoHelper.running()) {
		this.editor._selectionHelper.setSelection(
		this._lassoHelper.addPoint(event)
		);
	} else {
		this._hoverHelper.hover(this.editor.render.findItem(event, this.maps));
	}
};
Editor.EraserTool.prototype.OnMouseUp = function (event) {
	if (this._lassoHelper.running()) { // TODO it catches more events than needed, to be re-factored
		ui.addUndoAction(Action.fromFragmentDeletion(this._lassoHelper.end(event)));
		this.editor.deselectAll();
		ui.render.update();
	} else {
		var ci = this.editor.render.findItem(event, this.maps);
		if (ci && ci.type != 'Canvas') {
			this._hoverHelper.hover(null);
			if (ci.map == 'atoms') {
				ui.addUndoAction(Action.fromAtomDeletion(ci.id));
			} else if (ci.map == 'bonds') {
				ui.addUndoAction(Action.fromBondDeletion(ci.id));
			} else if (ci.map == 'sgroups' || ci.map == 'sgroupData') {
				ui.addUndoAction(Action.fromSgroupDeletion(ci.id));
			} else if (ci.map == 'rxnArrows') {
				ui.addUndoAction(Action.fromArrowDeletion(ci.id));
			} else if (ci.map == 'rxnPluses') {
				ui.addUndoAction(Action.fromPlusDeletion(ci.id));
			} else if (ci.map == 'chiralFlags') {
				ui.addUndoAction(Action.fromChiralFlagDeletion());
			} else {
				// TODO re-factoring needed - should be "map-independent"
				console.log('EraserTool: unable to delete the object ' + ci.map + '[' + ci.id + ']');
				return;
			}
			this.editor.deselectAll();
			ui.render.update();
		}
	}
};


Editor.AtomTool = function (editor, atomProps) {
	this.editor = editor;
	this.atomProps = atomProps;
	this.bondProps = { type: 1, stereo: Bond.PATTERN.STEREO.NONE };

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.AtomTool.prototype = new Editor.EditorTool();
Editor.AtomTool.prototype.OnMouseDown = function (event) {
	this._hoverHelper.hover(null);
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (!ci || ci.type == 'Canvas') {
		this.dragCtx = {
			xy0: ui.page2obj(event)
		};
	} else if (ci.map == 'atoms') {
		this.dragCtx = {
			item: ci,
			xy0: ui.page2obj(event)
		};
	}
};
Editor.AtomTool.prototype.OnMouseMove = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	if ('dragCtx' in this && 'item' in this.dragCtx) {
		var _DC_ = this.dragCtx;
		var newAtomPos = this._calcNewAtomPos(
		_R_.atomGetPos(_DC_.item.id), ui.page2obj(event)
		);
		if ('action' in _DC_) {
			_DC_.action.perform();
		}
		// TODO [RB] kludge fix for KETCHER-560. need to review
		//BEGIN
		/*
         var action_ret = Action.fromBondAddition(
         this.bondProps, _DC_.item.id, this.atomProps, newAtomPos, newAtomPos
         );
         */
		var action_ret = Action.fromBondAddition(
			this.bondProps, _DC_.item.id, Object.clone(this.atomProps), newAtomPos, newAtomPos
		);
		//END
		_DC_.action = action_ret[0];
		_DC_.aid2 = action_ret[2];
		_R_.update();
	} else {
		this._hoverHelper.hover(_R_.findItem(event, ['atoms']));
	}
};
Editor.AtomTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		ui.addUndoAction(
				'action' in _DC_
				 ? _DC_.action
				 : 'item' in _DC_
					 ? Action.fromAtomsAttrs(_DC_.item.id, this.atomProps, true)
					 : Action.fromAtomAddition(ui.page2obj(event), this.atomProps),
			true
		);
		this.editor.render.update();
		delete this.dragCtx;
	}
};


Editor.BondTool = function (editor, bondProps) {
	this.editor = editor;
	this.atomProps = { label: 'C' };
	this.bondProps = bondProps;
	this.plainBondTypes = [
			Bond.PATTERN.TYPE.SINGLE,
			Bond.PATTERN.TYPE.DOUBLE,
			Bond.PATTERN.TYPE.TRIPLE];

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.BondTool.prototype = new Editor.EditorTool();

Editor.BondTool.prototype.OnMouseDown = function (event) {
	this._hoverHelper.hover(null);
	this.dragCtx = {
		xy0: ui.page2obj(event),
		item: this.editor.render.findItem(event, ['atoms', 'bonds'])
	};
	if (!this.dragCtx.item || this.dragCtx.item.type == 'Canvas') delete this.dragCtx.item;
	return true;
};

Editor.BondTool.prototype.OnMouseMove = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		if (!('item' in _DC_) || _DC_.item.map == 'atoms') {
			if ('action' in _DC_) _DC_.action.perform();
			var i1, i2, p1, p2;
			if (('item' in _DC_ && _DC_.item.map == 'atoms')) {
				i1 = _DC_.item.id;
				i2 = _R_.findItem(event, ['atoms'], _DC_.item);
			} else {
				i1 = this.atomProps;
				p1 = _DC_.xy0;
				i2 = _R_.findItem(event, ['atoms']);
			}
			var dist = Number.MAX_VALUE;
			if (i2 && i2.map == 'atoms') {
				i2 = i2.id;
			} else {
				i2 = this.atomProps;
				var xy1 = ui.page2obj(event);
				dist = Vec2.dist(_DC_.xy0, xy1);
				if (p1) {
					p2 = this._calcNewAtomPos(p1, xy1);
				} else {
					p1 = this._calcNewAtomPos(_R_.atomGetPos(i1), xy1);
				}
			}
			// don't rotate the bond if the distance between the start and end point is too small
			if (dist > 0.3) {
				_DC_.action = Action.fromBondAddition(this.bondProps, i1, i2, p1, p2)[0];
			} else {
				delete _DC_.action;
			}
			_R_.update();
			return true;
		}
	}
	this._hoverHelper.hover(_R_.findItem(event, ['atoms', 'bonds']));
	return true;
};

Editor.BondTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		if ('action' in _DC_) {
			ui.addUndoAction(_DC_.action);
		} else if (!('item' in _DC_)) {
			var xy = ui.page2obj(event);
			var v = new Vec2(1.0 / 2, 0).rotate(
				this.bondProps.type == Bond.PATTERN.TYPE.SINGLE ? -Math.PI / 6 : 0
			);
			var bondAddition = Action.fromBondAddition(
				this.bondProps,
			{ label: 'C' },
			{ label: 'C' },
			{ x: xy.x - v.x, y: xy.y - v.y},
			{ x: xy.x + v.x, y: xy.y + v.y}
			);
			ui.addUndoAction(bondAddition[0]);
		} else if (_DC_.item.map == 'atoms') {
			ui.addUndoAction(Action.fromBondAddition(this.bondProps, _DC_.item.id)[0]);
		} else if (_DC_.item.map == 'bonds') {
			var bondProps = Object.clone(this.bondProps);
			var bond = ui.ctab.bonds.get(_DC_.item.id);

			if (
			bondProps.stereo != Bond.PATTERN.STEREO.NONE &&
			bond.type == Bond.PATTERN.TYPE.SINGLE &&
			bondProps.type == Bond.PATTERN.TYPE.SINGLE &&
			bond.stereo == bondProps.stereo
			) {
				ui.addUndoAction(Action.fromBondFlipping(_DC_.item.id));
			} else {
				if (
				bondProps.type === Bond.PATTERN.TYPE.SINGLE &&
				bond.stereo === Bond.PATTERN.STEREO.NONE &&
				bondProps.stereo === Bond.PATTERN.STEREO.NONE
				) {
					var loop = this.plainBondTypes.indexOf(bondProps.type) >= 0 ? this.plainBondTypes : null;
					if (loop) {
						bondProps.type = loop[(loop.indexOf(bond.type) + 1) % loop.length];
					}
				}
				ui.addUndoAction(
				Action.fromBondAttrs(_DC_.item.id, bondProps, bondFlipRequired(bond, bondProps)),
					true
				);
			}
		}
		this.editor.render.update();
		delete this.dragCtx;
	}
	return true;
};

Editor.ChainTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.ChainTool.prototype = new Editor.EditorTool();
Editor.ChainTool.prototype.OnMouseDown = function (event) {
	this._hoverHelper.hover(null);
	this.dragCtx = {
		xy0: ui.page2obj(event),
		item: this.editor.render.findItem(event, ['atoms'])
	};
	if (!this.dragCtx.item || this.dragCtx.item.type == 'Canvas') delete this.dragCtx.item;
	return true;
};
Editor.ChainTool.prototype.OnMouseMove = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		if ('action' in _DC_) _DC_.action.perform();
		var pos0 = 'item' in _DC_ ? _R_.atomGetPos(_DC_.item.id) : _DC_.xy0;
		var pos1 = ui.page2obj(event);
		_DC_.action = Action.fromChain(
			pos0,
		this._calcAngle(pos0, pos1),
		Math.ceil(Vec2.diff(pos1, pos0).length()),
				'item' in _DC_ ? _DC_.item.id : null
		);
		_R_.update();
		return true;
	}
	this._hoverHelper.hover(_R_.findItem(event, ['atoms']));
	return true;
};
Editor.ChainTool.prototype.OnMouseUp = function () {
	if ('dragCtx' in this) {
		if ('action' in this.dragCtx) {
			ui.addUndoAction(this.dragCtx.action);
		}
		delete this.dragCtx;
	}
	return true;
};
Editor.ChainTool.prototype.OnCancel = function () {
	this.OnMouseUp();
};


Editor.TemplateTool = function (editor, template) {
	this.editor = editor;
	this.template = template;

	// load template molfile in advance
	if (!this.template.molecule) {
		var frag = molfile.parse(this.template.molfile);
		frag.rescale();

		var xy0 = new Vec2();

		frag.atoms.each(function (aid, atom) {
			xy0.add_(atom.pp);
		});

		this.template.molecule = frag; // preloaded struct
		this.template.xy0 = xy0.scaled(1 / frag.atoms.count()); // template center
		this.template.angle0 = this._calcAngle(frag.atoms.get(this.template.aid).pp, this.template.xy0); // center tilt

		var bond = frag.bonds.get(this.template.bid);
		this.template.sign = this._getSign(frag, bond, this.template.xy0); // template location sign against attachment bond
	}

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.TemplateTool.prototype = new Editor.EditorTool();
Editor.TemplateTool.prototype._getSign = function (molecule, bond, v) {
	var begin = molecule.atoms.get(bond.begin).pp;
	var end = molecule.atoms.get(bond.end).pp;

	var sign = Vec2.cross(Vec2.diff(begin, end), Vec2.diff(v, end));

	if (sign > 0) return 1;
	if (sign < 0) return -1;
	return 0;
};
Editor.TemplateTool.prototype.OnMouseDown = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	this._hoverHelper.hover(null);
	this.dragCtx = {
		xy0: ui.page2obj(event),
		item: _R_.findItem(event, ['atoms', 'bonds'])
	};
	var _DC_ = this.dragCtx;
	var ci = _DC_.item;
	if (!ci || ci.type == 'Canvas') {
		delete _DC_.item;
	} else if (ci.map == 'bonds') {
		// calculate fragment center
		var molecule = _R_.ctab.molecule;
		var xy0 = new Vec2();
		var bond = molecule.bonds.get(ci.id);
		var frid = _R_.atomGetAttr(bond.begin, 'fragment');
		var fr_ids = molecule.getFragmentIds(frid);
		var count = 0;

		var loop = molecule.halfBonds.get(bond.hb1).loop;

		if (loop < 0) {
			loop = molecule.halfBonds.get(bond.hb2).loop;
		}

		if (loop >= 0) {
			var loop_hbs = molecule.loops.get(loop).hbs;
			loop_hbs.each(function (hb) {
				xy0.add_(molecule.atoms.get(molecule.halfBonds.get(hb).begin).pp);
				count++;
			});
		} else {
			Set.each(fr_ids, function (id) {
				xy0.add_(molecule.atoms.get(id).pp);
				count++;
			});
		}

		_DC_.v0 = xy0.scaled(1 / count);

		var sign = this._getSign(molecule, bond, _DC_.v0);

		// calculate default template flip
		_DC_.sign1 = sign || 1;
		_DC_.sign2 = this.template.sign;
	}
	return true;
};
Editor.TemplateTool.prototype.OnMouseMove = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		var ci = _DC_.item;
		var pos0;
		var pos1 = ui.page2obj(event);
		var angle, extra_bond;
		var self = this;

		_DC_.mouse_moved = true;

		// calc initial pos and is extra bond needed
		if (!ci || ci.type == 'Canvas') {
			pos0 = _DC_.xy0;
		} else if (ci.map == 'atoms') {
			pos0 = _R_.atomGetPos(ci.id);
			extra_bond = Vec2.dist(pos0, pos1) > 1;
		} else if (ci.map == 'bonds') {
			var molecule = _R_.ctab.molecule;
			var bond = molecule.bonds.get(ci.id);
			var sign = this._getSign(molecule, bond, pos1);

			if (_DC_.sign1 * this.template.sign > 0) {
				sign = -sign;
			}

			if (sign != _DC_.sign2 || !_DC_.action) {
				// undo previous action
				if ('action' in _DC_) _DC_.action.perform();
				_DC_.sign2 = sign;
				_DC_.action = Action.fromTemplateOnBond(ci.id, this.template, this._calcAngle, _DC_.sign1 * _DC_.sign2 > 0);
				_R_.update();
			}

			return true;
		}

		angle = this._calcAngle(pos0, pos1);
		var degrees = Math.round(180 / Math.PI * angle);
		// check if anything changed since last time
		if ('angle' in _DC_ && _DC_.angle == degrees) {
			if ('extra_bond' in _DC_) {
				if (_DC_.extra_bond == extra_bond)
					return true;
			} else {
				return true;
			}
		}
		// undo previous action
		if ('action' in _DC_) _DC_.action.perform();
		// create new action
		_DC_.angle = degrees;
		if (!ci || ci.type == 'Canvas') {
			_DC_.action = Action.fromTemplateOnCanvas(
				pos0,
				angle,
				this.template
			);
		} else if (ci.map == 'atoms') {
			_DC_.action = Action.fromTemplateOnAtom(
				ci.id,
				angle,
				extra_bond,
				this.template,
				this._calcAngle
			);
			_DC_.extra_bond = extra_bond;
		}
		_R_.update();
		return true;
	}
	this._hoverHelper.hover(_R_.findItem(event, ['atoms', 'bonds']));
	return true;
};
Editor.TemplateTool.prototype.OnMouseUp = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	if ('dragCtx' in this) {
		var _DC_ = this.dragCtx;
		var ci = _DC_.item;

		if (!_DC_.action) {
			if (!ci || ci.type == 'Canvas') {
				_DC_.action = Action.fromTemplateOnCanvas(_DC_.xy0, 0, this.template);
			} else if (ci.map == 'atoms') {
				var degree = _R_.atomGetDegree(ci.id);

				if (degree > 1) { // common case
					_DC_.action = Action.fromTemplateOnAtom(
						ci.id,
						null,
						true,
						this.template,
						this._calcAngle
					);
				} else if (degree == 1) { // on chain end
					var molecule = _R_.ctab.molecule;
					var nei_id = molecule.halfBonds.get(molecule.atoms.get(ci.id).neighbors[0]).end;
					var atom = molecule.atoms.get(ci.id);
					var nei = molecule.atoms.get(nei_id);

					_DC_.action = Action.fromTemplateOnAtom(
						ci.id,
					this._calcAngle(nei.pp, atom.pp),
						false,
						this.template,
						this._calcAngle
					);
				} else { // on single atom
					_DC_.action = Action.fromTemplateOnAtom(
						ci.id,
						0,
						false,
						this.template,
						this._calcAngle
					);
				}
			} else if (ci.map == 'bonds') {
				_DC_.action = Action.fromTemplateOnBond(ci.id, this.template, this._calcAngle, _DC_.sign1 * _DC_.sign2 > 0);
			}

			_R_.update();
		}

		if ('action' in this.dragCtx) {
			if (!this.dragCtx.action.isDummy())
				ui.addUndoAction(this.dragCtx.action);
		}
		delete this.dragCtx;
	}
};
Editor.TemplateTool.prototype.OnCancel = function () {
	this.OnMouseUp();
};

Editor.ChargeTool = function (editor, charge) { // TODO [RB] should be "pluggable"
	this.editor = editor;
	this.charge = charge;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.ChargeTool.prototype = new Editor.EditorTool();
Editor.ChargeTool.prototype.OnMouseMove = function (event) {
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (ci && ci.map == 'atoms' && element.getElementByLabel(ui.ctab.atoms.get(ci.id).label) != null) {
		this._hoverHelper.hover(ci);
	} else {
		this._hoverHelper.hover(null);
	}
	return true;
};
Editor.ChargeTool.prototype.OnMouseUp = function (event) {
	var _E_ = this.editor, _R_ = _E_.render;
	var ci = _R_.findItem(event, ['atoms']);
	if (ci && ci.map == 'atoms' && element.getElementByLabel(ui.ctab.atoms.get(ci.id).label) != null) {
		this._hoverHelper.hover(null);
		ui.addUndoAction(
		Action.fromAtomsAttrs(ci.id, { charge: _R_.ctab.molecule.atoms.get(ci.id).charge + this.charge })
		);
		_R_.update();
	}
	return true;
};


Editor.RGroupAtomTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.RGroupAtomTool.prototype = new Editor.EditorTool();
Editor.RGroupAtomTool.prototype.OnMouseMove = function (event) {
	this._hoverHelper.hover(this.editor.render.findItem(event, ['atoms']));
};
Editor.RGroupAtomTool.prototype.OnMouseUp = function (event) {
	function sel2Values(rg) {
		var res = [];
		for (var rgi = 0; rgi < 32; rgi++)
			if (rg & (1 << rgi)) {
				var val = 'R' + (rgi + 1);
				res.push(val); // push the string
			}
		return res;
	}
	function values2Sel(vals) {
		var res = 0;
		vals.values.forEach(function (val) {
			var rgi = val.substr(1) - 1;
			res |= 1 << rgi;
		});
		return res;
	}
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (!ci || ci.type == 'Canvas') {
		this._hoverHelper.hover(null);
		ui.showRGroupTable({
			mode: 'multiple',
			onOk: function (rgNew) {
				rgNew = values2Sel(rgNew);
				if (rgNew) {
					ui.addUndoAction(
					Action.fromAtomAddition(
					ui.page2obj(this.OnMouseMove0.lastEvent),
					{ label: 'R#', rglabel: rgNew}
					),
						true
					);
					ui.render.update();
				}
			}.bind(this)
		});
		return true;
	} else if (ci && ci.map == 'atoms') {
		this._hoverHelper.hover(null);
		var atom = this.editor.render.ctab.molecule.atoms.get(ci.id);
		var lbOld = atom.label;
		var rgOld = atom.rglabel;
		ui.showRGroupTable({
			mode: 'multiple',
			values: sel2Values(rgOld),
			onOk: function (rgNew) {
				rgNew = values2Sel(rgNew);
				if (rgOld != rgNew || lbOld != 'R#') {
					var newProps = Object.clone(Atom.attrlist); // TODO review: using Atom.attrlist as a source of default property values
					if (rgNew) {
						newProps.label = 'R#';
						newProps.rglabel = rgNew;
						newProps.aam = atom.aam;
					} else {
						newProps.label = 'C';
						newProps.aam = atom.aam;
					}
					ui.addUndoAction(Action.fromAtomsAttrs(ci.id, newProps), true);
					ui.render.update();
				}
			}.bind(this)
		});
		return true;
	}
};


Editor.RGroupFragmentTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};

Editor.RGroupFragmentTool.prototype = new Editor.EditorTool();
Editor.RGroupFragmentTool.prototype.OnMouseMove = function (event) {
	this._hoverHelper.hover(this.editor.render.findItem(event, ['frags', 'rgroups']));
};

Editor.RGroupFragmentTool.prototype.OnMouseUp = function (event) {
	var ci = this.editor.render.findItem(event, ['frags', 'rgroups']);
	if (ci && ci.map == 'frags') {
		this._hoverHelper.hover(null);
		var rgOld = Struct.RGroup.findRGroupByFragment(this.editor.render.ctab.molecule.rgroups, ci.id);
		ui.showRGroupTable({
			values: rgOld && ['R' + rgOld],
			onOk: function (rgNew) {
				console.assert(rgNew.values.length <= 1, 'Too much elements');
				rgNew = rgNew.values.length ? rgNew.values[0].substr(1) - 0 : 0;
				if (rgOld != rgNew) {
					ui.addUndoAction(
					Action.fromRGroupFragment(rgNew, ci.id),
						true
					);
					ui.render.update();
				}
			}.bind(this)
		});
		return true;
	}
	else if (ci && ci.map == 'rgroups') {
		this._hoverHelper.hover(null);
		var rg = this.editor.render.ctab.molecule.rgroups.get(ci.id);
		var rgmask = 0; this.editor.render.ctab.molecule.rgroups.each(function (rgid) { rgmask |= (1 << (rgid - 1)); });
		var oldLogic = {
			occurrence: rg.range,
			resth: rg.resth,
			ifthen: rg.ifthen
		};
		ui.showRLogicTable({
			rgid: ci.id,
			rlogic: oldLogic,
			rgmask: rgmask,
			onOk: function (newLogic) {
				var props = {};
				if (oldLogic.occurrence != newLogic.occurrence) {
					var isValid = newLogic.occurrence.split(',').all(function (s){
						return s.match(/^[>,<,=]?[0-9]+$/g) || s.match(/^[0-9]+\-[0-9]+$/g);
					});
					if (!isValid) {
						alert('Bad occurrence value');
						return false;
					}
					props.range = newLogic.occurrence;
				}
				if (oldLogic.resth != newLogic.resth) props.resth = newLogic.resth;
				if (oldLogic.ifthen != newLogic.ifthen) props.ifthen = newLogic.ifthen;
				if ('range' in props || 'resth' in props || 'ifthen' in props) {
					ui.addUndoAction(Action.fromRGroupAttrs(ci.id, props));
					this.editor.render.update();
				}
				return true;
			}.bind(this)
		});
		return true;
	}
};

Editor.APointTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.APointTool.prototype = new Editor.EditorTool();
Editor.APointTool.prototype.OnMouseMove = function (event) {
	this._hoverHelper.hover(this.editor.render.findItem(event, ['atoms']));
};
Editor.APointTool.prototype.OnMouseUp = function (event) {
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (ci && ci.map == 'atoms') {
		this._hoverHelper.hover(null);
		var apOld = this.editor.render.ctab.molecule.atoms.get(ci.id).attpnt;
		ui.showAtomAttachmentPoints({
			selection: apOld,
			onOk: function (apNew) {
				if (apOld != apNew) {
					ui.addUndoAction(Action.fromAtomsAttrs(ci.id, { attpnt: apNew }), true);
					ui.render.update();
				}
			}.bind(this)
		});
		return true;
	}
};


Editor.ReactionArrowTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.ReactionArrowTool.prototype = new Editor.EditorTool();
Editor.ReactionArrowTool.prototype.OnMouseDown = function (event) {
	var ci = this.editor.render.findItem(event, ['rxnArrows']);
	if (ci && ci.map == 'rxnArrows') {
		this._hoverHelper.hover(null);
		this.editor._selectionHelper.setSelection(ci);
		this.dragCtx = {
			xy0: ui.page2obj(event)
		};
	}
};
Editor.ReactionArrowTool.prototype.OnMouseMove = function (event) {
	if ('dragCtx' in this) {
		if (this.dragCtx.action)
			this.dragCtx.action.perform();
		this.dragCtx.action = Action.fromMultipleMove(
			this.editor._selectionHelper.selection,
		ui.page2obj(event).sub(this.dragCtx.xy0)
		);
		ui.render.update();
	} else {
		this._hoverHelper.hover(this.editor.render.findItem(event, ['rxnArrows']));
	}
};
Editor.ReactionArrowTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		ui.addUndoAction(this.dragCtx.action, false); // TODO investigate, subsequent undo/redo fails
		this.editor.render.update();
		delete this.dragCtx;
	} else if (this.editor.render.ctab.molecule.rxnArrows.count() < 1) {
		ui.addUndoAction(Action.fromArrowAddition(ui.page2obj(event)));
		this.editor.render.update();
	}
};


Editor.ReactionPlusTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
};
Editor.ReactionPlusTool.prototype = new Editor.EditorTool();
Editor.ReactionPlusTool.prototype.OnMouseDown = function (event) {
	var ci = this.editor.render.findItem(event, ['rxnPluses']);
	if (ci && ci.map == 'rxnPluses') {
		this._hoverHelper.hover(null);
		this.editor._selectionHelper.setSelection(ci);
		this.dragCtx = {
			xy0: ui.page2obj(event)
		};
	}
};
Editor.ReactionPlusTool.prototype.OnMouseMove = function (event) {
	if ('dragCtx' in this) {
		if (this.dragCtx.action)
			this.dragCtx.action.perform();
		this.dragCtx.action = Action.fromMultipleMove(
			this.editor._selectionHelper.selection,
		ui.page2obj(event).sub(this.dragCtx.xy0)
		);
		ui.render.update();
	} else {
		this._hoverHelper.hover(this.editor.render.findItem(event, ['rxnPluses']));
	}
};
Editor.ReactionPlusTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		ui.addUndoAction(this.dragCtx.action, false); // TODO investigate, subsequent undo/redo fails
		this.editor.render.update();
		delete this.dragCtx;
	} else {
		ui.addUndoAction(Action.fromPlusAddition(ui.page2obj(event)));
		this.editor.render.update();
	}
};


Editor.ReactionMapTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);

	this.editor._selectionHelper.setSelection(null);

	this.rcs = this.editor.render.ctab.molecule.getComponents();
};
Editor.ReactionMapTool.prototype = new Editor.EditorTool();
Editor.ReactionMapTool.prototype.OnMouseDown = function (event) {
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (ci && ci.map == 'atoms') {
		this._hoverHelper.hover(null);
		this.dragCtx = {
			item: ci,
			xy0: ui.page2obj(event)
		}
	}
};
Editor.ReactionMapTool.prototype.OnMouseMove = function (event) {
	var rnd = this.editor.render;
	if ('dragCtx' in this) {
		var ci = rnd.findItem(event, ['atoms'], this.dragCtx.item);
		if (ci && ci.map == 'atoms' && this._isValidMap(this.dragCtx.item.id, ci.id)) {
			this._hoverHelper.hover(ci);
			rnd.drawSelectionLine(rnd.atomGetPos(this.dragCtx.item.id), rnd.atomGetPos(ci.id));
		} else {
			this._hoverHelper.hover(null);
			rnd.drawSelectionLine(rnd.atomGetPos(this.dragCtx.item.id), ui.page2obj(event));
		}
	} else {
		this._hoverHelper.hover(rnd.findItem(event, ['atoms']));
	}
};
Editor.ReactionMapTool.prototype.OnMouseUp = function (event) {
	if ('dragCtx' in this) {
		var rnd = this.editor.render;
		var ci = rnd.findItem(event, ['atoms'], this.dragCtx.item);
		if (ci && ci.map == 'atoms' && this._isValidMap(this.dragCtx.item.id, ci.id)) {
			var action = new Action();
			var atoms = rnd.ctab.molecule.atoms;
			var atom1 = atoms.get(this.dragCtx.item.id), atom2 = atoms.get(ci.id);
			var aam1 = atom1.aam, aam2 = atom2.aam;
			if (!aam1 || aam1 != aam2) {
				if (aam1 && aam1 != aam2 || !aam1 && aam2) {
					atoms.each(
					function (aid, atom) {
						if (aid != this.dragCtx.item.id && (aam1 && atom.aam == aam1 || aam2 && atom.aam == aam2)) {
							action.mergeWith(Action.fromAtomsAttrs(aid, { aam: 0 }));
						}
					},
						this
					);
				}
				if (aam1) {
					action.mergeWith(Action.fromAtomsAttrs(ci.id, { aam: aam1 }));
				} else {
					var aam = 0; atoms.each(function (aid, atom) { aam = Math.max(aam, atom.aam || 0); });
					action.mergeWith(Action.fromAtomsAttrs(this.dragCtx.item.id, { aam: aam + 1 }));
					action.mergeWith(Action.fromAtomsAttrs(ci.id, { aam: aam + 1 }));
				}
				ui.addUndoAction(action, true);
				rnd.update();
			}
		}
		rnd.drawSelectionLine(null);
		delete this.dragCtx;
	}
	this._hoverHelper.hover(null);
};

Editor.ReactionMapTool.prototype._isValidMap = function (aid1, aid2) {
	var t1, t2;
	for (var ri = 0; (!t1 || !t2) && ri < this.rcs.reactants.length; ri++) {
		var ro = Set.list(this.rcs.reactants[ri]);
		if (!t1 && ro.indexOf(aid1) >= 0) t1 = 'r';
		if (!t2 && ro.indexOf(aid2) >= 0) t2 = 'r';
	}
	for (var pi = 0; (!t1 || !t2) && pi < this.rcs.products.length; pi++) {
		var po = Set.list(this.rcs.products[pi]);
		if (!t1 && po.indexOf(aid1) >= 0) t1 = 'p';
		if (!t2 && po.indexOf(aid2) >= 0) t2 = 'p';
	}
	return t1 && t2 && t1 != t2;
};


Editor.ReactionUnmapTool = function (editor) {
	this.editor = editor;

	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);

	this.editor._selectionHelper.setSelection(null);
};
Editor.ReactionUnmapTool.prototype = new Editor.EditorTool();
Editor.ReactionUnmapTool.prototype.OnMouseMove = function (event) {
	var ci = this.editor.render.findItem(event, ['atoms']);
	if (ci && ci.map == 'atoms') {
		this._hoverHelper.hover(this.editor.render.ctab.molecule.atoms.get(ci.id).aam ? ci : null);
	} else {
		this._hoverHelper.hover(null);
	}
};
Editor.ReactionUnmapTool.prototype.OnMouseUp = function (event) {
	var ci = this.editor.render.findItem(event, ['atoms']);
	var atoms = this.editor.render.ctab.molecule.atoms;
	if (ci && ci.map == 'atoms' && atoms.get(ci.id).aam) {
		var action = new Action();
		var aam = atoms.get(ci.id).aam;
		atoms.each(
		function (aid, atom) {
			if (atom.aam == aam) {
				action.mergeWith(Action.fromAtomsAttrs(aid, { aam: 0 }));
			}
		},
			this
		);
		ui.addUndoAction(action, true);
		this.editor.render.update();
	}
	this._hoverHelper.hover(null);
};

Editor.SGroupTool = function (editor) {
	this.editor = editor;

	this.maps = ['atoms', 'bonds', 'sgroups', 'sgroupData'];
	this._hoverHelper = new Editor.EditorTool.HoverHelper(this);
	this._lassoHelper = new Editor.LassoTool.LassoHelper(1, editor);
	this._sGroupHelper = new Editor.SGroupTool.SGroupHelper(editor);

	var selection = this.editor.getSelection();
	if (selection.atoms && selection.atoms.length > 0) {
		// if the selection contains atoms, create an s-group out of those
		this._sGroupHelper.showPropertiesDialog(null, selection);
	} else {
		// otherwise, clear selection
		this.editor.deselectAll();
	}
};
Editor.SGroupTool.prototype = new Editor.EditorTool();
Editor.SGroupTool.prototype.OnMouseDown = function (event) {
	var ci = this.editor.render.findItem(event, this.maps);
	if (!ci || ci.type == 'Canvas') {
		this._lassoHelper.begin(event);
	}
};
Editor.SGroupTool.prototype.OnMouseMove = function (event) {
	if (this._lassoHelper.running()) {
		this.editor._selectionHelper.setSelection(
		this._lassoHelper.addPoint(event)
		);
	} else {
		this._hoverHelper.hover(this.editor.render.findItem(event, this.maps));
	}
};

Editor.SGroupTool.SGroupHelper = function (editor) {
	this.editor = editor;
	this.selection = null;
};

Editor.SGroupTool.SGroupHelper.prototype.showPropertiesDialog = function (id, selection) {
	this.selection = selection;

	var render = this.editor.render;
	// check s-group overlappings
	if (id == null)
	{
		var verified = {};
		var atoms_hash = {};

		selection.atoms.each(function (id)
		{
			atoms_hash[id] = true;
		}, this);

		if (!Object.isUndefined(selection.atoms.detect(function (id)
		{
			var sgroups = render.atomGetSGroups(id);

			return !Object.isUndefined(sgroups.detect(function (sid)
			{
				if (sid in verified)
					return false;

				var sg_atoms = render.sGroupGetAtoms(sid);

				if (sg_atoms.length < selection.atoms.length)
				{
					if (!Object.isUndefined(sg_atoms.detect(function (aid)
					{
						return !(aid in atoms_hash);
					}, this)))
					{
						return true;
					}
				} else if (!Object.isUndefined(selection.atoms.detect(function (aid)
				{
					return (sg_atoms.indexOf(aid) == -1);
				}, this)))
				{
					return true;
				}

				return false;
			}, this));
		}, this)))
		{
			alert('Partial S-group overlapping is not allowed.');
			return;
		}
	}

	ui.showSGroupProperties({
		type: id !== null ? ui.render.sGroupGetType(id) : null,
		attrs: id !== null ? ui.render.sGroupGetAttrs(id) : {},
		onCancel: function () {
			this.editor.deselectAll();
		}.bind(this),
		onOk: function (params) {
			if (id == null) {
				id = ui.render.ctab.molecule.sgroups.newId();
				ui.addUndoAction(Action.fromSgroupAddition(params.type, this.selection.atoms,
				                                           params.attrs, id), true);
			} else {
				ui.addUndoAction(Action.fromSgroupType(id, params.type)
				                 .mergeWith(Action.fromSgroupAttrs(id, params.attrs)), true);
			}
			this.editor.deselectAll();
			this.editor.render.update();

		}.bind(this)
	});
};

Editor.SGroupTool.prototype.OnMouseUp = function (event) {
	var id = null; // id of an existing group, if we're editing one
	var selection = null; // atoms to include in a newly created group
	if (this._lassoHelper.running()) { // TODO it catches more events than needed, to be re-factored
		selection = this._lassoHelper.end(event);
	} else {
		var ci = this.editor.render.findItem(event, this.maps);
		if (!ci || ci.type == 'Canvas')
			return;
		this._hoverHelper.hover(null);

		if (ci.map == 'atoms') {
			// if we click the SGroup tool on a single atom or bond, make a group out of those
			selection = {'atoms': [ci.id]};
		} else if (ci.map == 'bonds') {
			var bond = this.editor.render.ctab.bonds.get(ci.id);
			selection = {'atoms': [bond.b.begin, bond.b.end]};
		} else if (ci.map == 'sgroups') {
			id = ci.id;
		} else {
			return;
		}
	}
	// TODO: handle click on an existing group?
	if (id != null || (selection && selection.atoms && selection.atoms.length > 0))
		this._sGroupHelper.showPropertiesDialog(id, selection);
};

Editor.PasteTool = function (editor, struct) {
	this.editor = editor;
	this.struct = struct;
	this.action = Action.fromPaste(
		this.struct, 'lastEvent' in this.OnMouseMove0 ?
			ui.page2obj(this.OnMouseMove0.lastEvent) : undefined);
	this.editor.render.update();
};
Editor.PasteTool.prototype = new Editor.EditorTool();
Editor.PasteTool.prototype.OnMouseMove = function (event) {
	if ('action' in this) {
		this.action.perform(this.editor);
	}
	this.action = Action.fromPaste(this.struct, ui.page2obj(event));
	this.editor.render.update();
};
Editor.PasteTool.prototype.OnMouseUp = function () {
	ui.addUndoAction(this.action);
	delete this.action;
	ui.selectAction(null);
};
Editor.PasteTool.prototype.OnCancel = function () {
	if ('action' in this) {
		this.action.perform(this.editor);
		delete this.action;
	}
};

Editor.RotateTool = function (editor) {
	this.editor = editor;
	this._lassoHelper = new Editor.LassoTool.LassoHelper(1, editor);

	var selection = this.editor._selectionHelper.selection;
	if (!selection.atoms || !selection.atoms.length) {
		// otherwise, clear selection
		this.editor._selectionHelper.setSelection(null);
	}
};
Editor.RotateTool.prototype = new Editor.EditorTool();

Editor.RotateTool.prototype.OnMouseDown = function (event) {

	var selection = this.editor._selectionHelper.selection;
	if (selection.atoms && selection.atoms.length) {
		var molecule = this.editor.render.ctab.molecule;
		var xy0 = new Vec2();

		if (!selection.atoms || !selection.atoms.length) {
			return true;
		}

		var rot_id = null, rot_all = false;

		selection.atoms.each(function (aid) {
			var atom = molecule.atoms.get(aid);

			xy0.add_(atom.pp);

			if (rot_all) {
				return;
			}

			atom.neighbors.find(function (nei) {
				var hb = molecule.halfBonds.get(nei);

				if (selection.atoms.indexOf(hb.end) == -1) {
					if (hb.loop >= 0) {
						var nei_atom = molecule.atoms.get(aid);
						if (!Object.isUndefined(nei_atom.neighbors.find(function (nei_nei) {
							var nei_hb = molecule.halfBonds.get(nei_nei);
							return nei_hb.loop >= 0 && selection.atoms.indexOf(nei_hb.end) != -1;
						}))) {
							rot_all = true;
							return true;
						}
					}
					if (rot_id == null) {
						rot_id = aid;
					} else if (rot_id != aid) {
						rot_all = true;
						return true;
					}
				}
				return false;
			});
		});

		if (!rot_all && rot_id != null) {
			xy0 = molecule.atoms.get(rot_id).pp;
		} else {
			xy0 = xy0.scaled(1 / selection.atoms.length);
		}

		this.dragCtx = {
			xy0: xy0,
			angle1: this._calcAngle(xy0, ui.page2obj(event)),
			all: rot_all
		};
	} else {
		this._lassoHelper.begin(event);
	}
	return true;
};
Editor.RotateTool.prototype.OnMouseMove = function (event) {
	if (this._lassoHelper.running()) {
		this.editor._selectionHelper.setSelection(
		this._lassoHelper.addPoint(event)
		);
	} else if ('dragCtx' in this) {
		var _E_ = this.editor, _R_ = _E_.render;
		var _DC_ = this.dragCtx;

		var pos = ui.page2obj(event);
		var angle = this._calcAngle(_DC_.xy0, pos) - _DC_.angle1;

		var degrees = Math.round(angle / Math.PI * 180);

		if (degrees > 180) {
			degrees -= 360;
		} else if (degrees <= -180) {
			degrees += 360;
		}

		if ('angle' in _DC_ && _DC_.angle == degrees) return true;
		if ('action' in _DC_) _DC_.action.perform();

		_DC_.angle = degrees;
		_DC_.action = Action.fromRotate(
			_DC_.all ? _R_.ctab.molecule : this.editor.getSelection(),
			_DC_.xy0,
			angle
		);

		$('toolText').update(degrees + 'º');

		_R_.update();
	}
	return true;
};

Editor.RotateTool.prototype.OnMouseUp = function (event) {
	var id = null; // id of an existing group, if we're editing one
	var selection = null; // atoms to include in a newly created group
	if (this._lassoHelper.running()) { // TODO it catches more events than needed, to be re-factored
		selection = this._lassoHelper.end(event);
	} else if ('dragCtx' in this) {
		if ('action' in this.dragCtx) {
			ui.addUndoAction(this.dragCtx.action, true);
			$('toolText').update('');
		} else {
			this.editor._selectionHelper.setSelection();
		}
		delete this.dragCtx;
	}
	return true;
};

Editor.RotateTool.prototype.OnCancel = function () {
	if ('dragCtx' in this) {
		if ('action' in this.dragCtx) {
			ui.addUndoAction(this.dragCtx.action, true);
			$('toolText').update('');
		}
		delete this.dragCtx;
	}

	// don't reset the selection when leaving the canvas, see KETCHER-632
	// this.editor._selectionHelper.setSelection();
};

function bondFlipRequired (bond, attrs) {
	return attrs.type == Bond.PATTERN.TYPE.SINGLE &&
	       bond.stereo == Bond.PATTERN.STEREO.NONE &&
	       attrs.stereo != Bond.PATTERN.STEREO.NONE &&
	       ui.ctab.atoms.get(bond.begin).neighbors.length <
	       ui.ctab.atoms.get(bond.end).neighbors.length;
}

module.exports = Editor;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/atom":8,"../chem/bond":9,"../chem/element":12,"../chem/molfile":13,"../chem/sgroup":15,"../chem/struct":18,"../ui/action":27,"../util/set":43,"../util/vec2":44,"./restruct":24}],22:[function(require,module,exports){
(function (global){
require('./restruct');
require('./render');
require('./restruct_rendering');

global.rnd = global.rnd || {};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./render":23,"./restruct":24,"./restruct_rendering":25}],23:[function(require,module,exports){
(function (global){
var Raphael = require('../raphael-ext.js');
var Box2Abs = require('../util/box2abs');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');

var Struct = require('../chem/struct');
var SGroup = require('../chem/sgroup');

require('./restruct');
require('./restruct_rendering');

var rnd = global.rnd = global.rnd || {}; // jshint ignore:line
var ui = global.ui;
var tfx = util.tfx;

rnd.DEBUG = false;

rnd.logcnt = 0;
rnd.logmouse = false;
rnd.hl = false;

var EventMap = {
	mousemove: 'mousemove',
	mousedown: 'mousedown',
	mouseup: 'mouseup'
};

rnd.logMethod = function () { };
//rnd.logMethod = function (method) {console.log("METHOD: " + method);}

rnd.RenderOptions = function (opt)
{
	opt = opt || {};

	// flags for debugging
	this.showSelectionRegions = opt.showSelectionRegions || false;
	this.showAtomIds = opt.showAtomIds || false;
	this.showBondIds = opt.showBondIds || false;
	this.showHalfBondIds = opt.showHalfBondIds || false;
	this.showLoopIds = opt.showLoopIds || false;
	this.hideChiralFlag = opt.hideChiralFlag || false;

	// rendering customization flags
	this.showValenceWarnings = !Object.isUndefined(opt.showValenceWarnings) ? opt.showValenceWarnings : true;
	this.autoScale = opt.autoScale || false; // scale structure to fit into the given view box, used in view mode
	this.autoScaleMargin = opt.autoScaleMargin || 0;
	this.maxBondLength = opt.maxBondLength || 0; // 0 stands for "not specified"
	this.atomColoring = opt.atomColoring || 0;
	this.hideImplicitHydrogen = opt.hideImplicitHydrogen || false;
	this.hideTerminalLabels = opt.hideTerminalLabels || false;
	this.ignoreMouseEvents = opt.ignoreMouseEvents || false; // for view mode
	this.selectionDistanceCoefficient = (opt.selectionDistanceCoefficient || 0.4) - 0;
};

rnd.Render = function (clientArea, scale, opt, viewSz)
{
	this.opt = new rnd.RenderOptions(opt);

	this.useOldZoom = Prototype.Browser.IE;
	this.scale = scale || 100;
	this.baseScale = this.scale;
	this.offset = new Vec2();
	this.clientArea = clientArea = $(clientArea);
	clientArea.innerHTML = '';
	this.paper = new Raphael(clientArea);
	this.size = new Vec2();
	this.viewSz = viewSz || new Vec2(clientArea['clientWidth'] || 100, clientArea['clientHeight'] || 100);
	this.bb = new Box2Abs(new Vec2(), this.viewSz);
	this.dirty = true;
	this.selectionRect = null;
	this.rxnArrow = null;
	this.rxnMode = false;
	this.zoom = 1.0;
	this.structChangeHandlers = [];

	var render = this;
	var valueT = 0, valueL = 0;
	var element = clientArea;
	do {
		valueT += element.offsetTop  || 0;
		valueL += element.offsetLeft || 0;
		element = element.offsetParent;
	} while (element);

	this.clientAreaPos = new Vec2(valueL, valueT);

	// rbalabanov: two-fingers scrolling & zooming for iPad
	// TODO should be moved to touch.js module, re-factoring needed
	//BEGIN
	var self = this;
	self.longTapFlag = false;
	self.longTapTimeout = null;
	self.longTapTouchstart = null;

	self.setLongTapTimeout = function (event) {
		self.longTapFlag = false;
		self.longTapTouchstart = event;
		self.longTapTimeout = setTimeout(function () {
			self.longTapFlag = true;
			self.longTapTimeout = null;
		}, 500);
	};

	self.resetLongTapTimeout = function (resetFlag) {
		clearTimeout(self.longTapTimeout);
		self.longTapTimeout = null;
		if (resetFlag) {
			self.longTapTouchstart = null;
			self.longTapFlag = false;
		}
	};
	//END

	// rbalabanov: here is temporary fix for "drag issue" on iPad
	//BEGIN
	if ('hiddenPaths' in rnd.ReStruct.prototype) {
		clientArea.observe('touchend', function (event) {
			if (event.touches.length == 0) {
				while (rnd.ReStruct.prototype.hiddenPaths.length > 0) rnd.ReStruct.prototype.hiddenPaths.pop().remove();
			}
		});
	}
	//END

	if (!this.opt.ignoreMouseEvents) {
		// [RB] KETCHER-396 (Main toolbar is grayed after the Shift-selection of some atoms/bonds)
		// here we prevent that freaking "accelerators menu" on IE8
		//BEGIN
		clientArea.observe('selectstart', function (event) {
			util.stopEventPropagation(event);
			return util.preventDefault(event);
		});
		//END

		clientArea.observe('touchstart', function (event) {
			self.resetLongTapTimeout(true);
			if (event.touches.length == 2) {
				this._tui = this._tui || {};
				this._tui.center = {
					pageX: (event.touches[0].pageX + event.touches[1].pageX) / 2,
					pageY: (event.touches[0].pageY + event.touches[1].pageY) / 2
				};
				ui.setZoomStaticPointInit(ui.page2obj(this._tui.center));
			} else if (event.touches.length == 1) {
				self.setLongTapTimeout(event);
			}
		});
		clientArea.observe('touchmove', function (event) {
			self.resetLongTapTimeout(true);
			if ('_tui' in this && event.touches.length == 2) {
				this._tui.center = {
					pageX: (event.touches[0].pageX + event.touches[1].pageX) / 2,
					pageY: (event.touches[0].pageY + event.touches[1].pageY) / 2
				};
			}
		});
		clientArea.observe('gesturestart', function (event) {
			this._tui = this._tui || {};
			this._tui.scale0 = ui.render.zoom;
			event.preventDefault();
		});
		clientArea.observe('gesturechange', function (event) {
			ui.setZoomStaticPoint(this._tui.scale0 * event.scale, ui.page2canvas2(this._tui.center));
			ui.render.update();
			event.preventDefault();
		});
		clientArea.observe('gestureend', function (event) {
			delete this._tui;
			event.preventDefault();
		});
		//END

		clientArea.observe('onresize', function (event) {
			render.onResize();
		});

		// assign canvas events handlers
		['Click', 'DblClick', 'MouseDown', 'MouseMove', 'MouseUp', 'MouseLeave'].each(function (eventName){
			var bindEventName = eventName.toLowerCase();
			bindEventName = EventMap[bindEventName] || bindEventName;
			clientArea.observe(bindEventName, function (event) {
				if (eventName != 'MouseLeave') if (!ui || !ui.is_touch) {
					// TODO: karulin: fix this on touch devices if needed
					var co = clientArea.cumulativeOffset();
					co = new Vec2(co[0], co[1]);
					var vp = new Vec2(event.clientX, event.clientY).sub(co);
					var sz = new Vec2(clientArea.clientWidth, clientArea.clientHeight);
					if (!(vp.x > 0 && vp.y > 0 && vp.x < sz.x && vp.y < sz.y)) {// ignore events on the hidden part of the canvas
						if (eventName == 'MouseMove') {
							// [RB] here we alse emulate mouseleave when user drags mouse over toolbar (see KETCHER-433)
							ui.render.current_tool.processEvent('OnMouseLeave', event);
						}
						return util.preventDefault(event);
					}
				}

				ui.render.current_tool.processEvent('On' + eventName, event);
				if (eventName != 'MouseUp') {
					// [NK] do not stop mouseup propagation
					// to maintain cliparea focus.
					// Do we really need total stop here?
					util.stopEventPropagation(event);
				}
				if (bindEventName != 'touchstart' && (bindEventName != 'touchmove' || event.touches.length != 2))
					return util.preventDefault(event);
			});
		}, this);
	}

	this.ctab = new rnd.ReStruct(new Struct(), this);
	this.settings = null;
	this.styles = null;

	this.onCanvasOffsetChanged = null; //function(newOffset, oldOffset){};
	this.onCanvasSizeChanged = null; //function(newSize, oldSize){};
};

rnd.Render.prototype.addStructChangeHandler = function (handler)
{
	if (handler in this.structChangeHandlers)
		throw new Error('handler already present');
	this.structChangeHandlers.push(handler);
};

rnd.Render.prototype.view2scaled = function (p, isRelative) {
	var scroll = ui.scrollPos();
	if (!this.useOldZoom) {
		p = p.scaled(1 / this.zoom);
		scroll = scroll.scaled(1 / this.zoom);
	}
	p = isRelative ? p : p.add(scroll).sub(this.offset);
	return p;
};

rnd.Render.prototype.scaled2view = function (p, isRelative) {
	p = isRelative ? p : p.add(this.offset).sub(ui.scrollPos().scaled(1 / this.zoom));
	if (!this.useOldZoom)
		p = p.scaled(this.zoom);
	return p;
};

rnd.Render.prototype.scaled2obj = function (v) {
	return v.scaled(1 / this.settings.scaleFactor);
};

rnd.Render.prototype.obj2scaled = function (v) {
	return v.scaled(this.settings.scaleFactor);
};

rnd.Render.prototype.view2obj = function (v, isRelative) {
	return this.scaled2obj(this.view2scaled(v, isRelative));
};

rnd.Render.prototype.obj2view = function (v, isRelative) {
	return this.scaled2view(this.obj2scaled(v, isRelative));
};

rnd.Render.prototype.findItem = function (event, maps, skip) {
	var ci = this.findClosestItem(
			'ui' in window && 'page2obj' in ui ? new Vec2(ui.page2obj(event)) :
		new Vec2(event.pageX, event.pageY).sub(this.clientAreaPos),
		maps,
		skip
	);
	//rbalabanov: let it be this way at the moment
	if (ci.type == 'Atom') ci.map = 'atoms';
	else if (ci.type == 'Bond') ci.map = 'bonds';
	else if (ci.type == 'SGroup') ci.map = 'sgroups';
	else if (ci.type == 'DataSGroupData') ci.map = 'sgroupData';
	else if (ci.type == 'RxnArrow') ci.map = 'rxnArrows';
	else if (ci.type == 'RxnPlus') ci.map = 'rxnPluses';
	else if (ci.type == 'Fragment') ci.map = 'frags';
	else if (ci.type == 'RGroup') ci.map = 'rgroups';
	else if (ci.type == 'ChiralFlag') ci.map = 'chiralFlags';
	return ci;
};

rnd.Render.prototype.client2Obj = function (clientPos) {
	return new Vec2(clientPos).sub(this.offset);
};

rnd.Render.prototype.setMolecule = function (ctab, norescale)
{
	rnd.logMethod('setMolecule');
	this.paper.clear();
	this.ctab = new rnd.ReStruct(ctab, this, norescale);
	this.offset = null;
	this.size = null;
	this.bb = null;
	this.rxnMode = ctab.isReaction;
};

// molecule manipulation interface
rnd.Render.prototype.atomGetAttr = function (aid, name)
{
	rnd.logMethod('atomGetAttr');
	// TODO: check attribute names
	return this.ctab.molecule.atoms.get(aid)[name];
};

rnd.Render.prototype.invalidateAtom = function (aid, level)
{
	var atom = this.ctab.atoms.get(aid);
	this.ctab.markAtom(aid, level ? 1 : 0);
	var hbs = this.ctab.molecule.halfBonds;
	for (var i = 0; i < atom.a.neighbors.length; ++i) {
		var hbid = atom.a.neighbors[i];
		if (hbs.has(hbid)) {
			var hb = hbs.get(hbid);
			this.ctab.markBond(hb.bid, 1);
			this.ctab.markAtom(hb.end, 0);
			if (level)
				this.invalidateLoop(hb.bid);
		}
	}
};

rnd.Render.prototype.invalidateLoop = function (bid)
{
	var bond = this.ctab.bonds.get(bid);
	var lid1 = this.ctab.molecule.halfBonds.get(bond.b.hb1).loop;
	var lid2 = this.ctab.molecule.halfBonds.get(bond.b.hb2).loop;
	if (lid1 >= 0)
		this.ctab.loopRemove(lid1);
	if (lid2 >= 0)
		this.ctab.loopRemove(lid2);
};

rnd.Render.prototype.invalidateBond = function (bid)
{
	var bond = this.ctab.bonds.get(bid);
	this.invalidateLoop(bid);
	this.invalidateAtom(bond.b.begin, 0);
	this.invalidateAtom(bond.b.end, 0);
};

rnd.Render.prototype.invalidateItem = function (map, id, level)
{
	if (map == 'atoms') {
		this.invalidateAtom(id, level);
	} else if (map == 'bonds') {
		this.invalidateBond(id);
		if (level > 0)
			this.invalidateLoop(id);
	} else {
		this.ctab.markItem(map, id, level);
	}
};

rnd.Render.prototype.atomGetDegree = function (aid)
{
	rnd.logMethod('atomGetDegree');
	return this.ctab.atoms.get(aid).a.neighbors.length;
};

rnd.Render.prototype.isBondInRing = function (bid) {
	var bond = this.ctab.bonds.get(bid);
	return this.ctab.molecule.halfBonds.get(bond.b.hb1).loop >= 0 ||
	this.ctab.molecule.halfBonds.get(bond.b.hb2).loop >= 0;
};

rnd.Render.prototype.atomGetNeighbors = function (aid)
{
	var atom = this.ctab.atoms.get(aid);
	var neiAtoms = [];
	for (var i = 0; i < atom.a.neighbors.length; ++i) {
		var hb = this.ctab.molecule.halfBonds.get(atom.a.neighbors[i]);
		neiAtoms.push({
			'aid': hb.end - 0,
			'bid': hb.bid - 0
		});
	}
	return neiAtoms;
};

// returns an array of s-group id's
rnd.Render.prototype.atomGetSGroups = function (aid)
{
	rnd.logMethod('atomGetSGroups');
	var atom = this.ctab.atoms.get(aid);
	return Set.list(atom.a.sgs);
};

rnd.Render.prototype.sGroupGetAttr = function (sgid, name)
{
	rnd.logMethod('sGroupGetAttr');
	return this.ctab.sgroups.get(sgid).item.getAttr(name);
};

rnd.Render.prototype.sGroupGetAttrs = function (sgid)
{
	rnd.logMethod('sGroupGetAttrs');
	return this.ctab.sgroups.get(sgid).item.getAttrs();
};

// TODO: move to SGroup
rnd.Render.prototype.sGroupGetAtoms = function (sgid)
{
	rnd.logMethod('sGroupGetAtoms');
	var sg = this.ctab.sgroups.get(sgid).item;
	return SGroup.getAtoms(this.ctab.molecule, sg);
};

rnd.Render.prototype.sGroupGetType = function (sgid)
{
	rnd.logMethod('sGroupGetType');
	var sg = this.ctab.sgroups.get(sgid).item;
	return sg.type;
};

rnd.Render.prototype.sGroupsFindCrossBonds = function ()
{
	rnd.logMethod('sGroupsFindCrossBonds');
	this.ctab.molecule.sGroupsRecalcCrossBonds();
};

// TODO: move to ReStruct
rnd.Render.prototype.sGroupGetNeighborAtoms = function (sgid)
{
	rnd.logMethod('sGroupGetNeighborAtoms');
	var sg = this.ctab.sgroups.get(sgid).item;
	return sg.neiAtoms;
};

// TODO: move to ReStruct
rnd.Render.prototype.atomIsPlainCarbon = function (aid)
{
	rnd.logMethod('atomIsPlainCarbon');
	return this.ctab.atoms.get(aid).a.isPlainCarbon();
};

rnd.Render.prototype.highlightObject = function (obj, visible) {
	if (['atoms', 'bonds', 'rxnArrows', 'rxnPluses', 'chiralFlags', 'frags', 'rgroups', 'sgroups', 'sgroupData'].indexOf(obj.map) > -1) {
		var item = this.ctab[obj.map].get(obj.id);
		if (item == null)
			return true; // TODO: fix, attempt to highlight a deleted item
		if ((obj.map == 'sgroups' && item.item.type == 'DAT') || obj.map == 'sgroupData') {
			// set highlight for both the group and the data item
			var item1 = this.ctab.sgroups.get(obj.id);
			var item2 = this.ctab.sgroupData.get(obj.id);
			if (item1 != null)
				item1.setHighlight(visible, this);
			if (item2 != null)
				item2.setHighlight(visible, this);
		} else {
			item.setHighlight(visible, this);
		}
	} else {
		return false;
	}
	return true;
};

rnd.Render.prototype.itemGetPos = function (map, id)
{
	return this.ctab.molecule[map].get(id).pp;
};

rnd.Render.prototype.atomGetPos = function (id)
{
	rnd.logMethod('atomGetPos');
	return this.itemGetPos('atoms', id);
};

rnd.Render.prototype.rxnArrowGetPos = function (id)
{
	rnd.logMethod('rxnArrowGetPos');
	return this.itemGetPos('rxnArrows', id);
};

rnd.Render.prototype.rxnPlusGetPos = function (id)
{
	rnd.logMethod('rxnPlusGetPos');
	return this.itemGetPos('rxnPluses', id);
};

rnd.Render.prototype.getAdjacentBonds = function (atoms) {
	var aidSet = Set.fromList(atoms);
	var bidSetInner = Set.empty(), bidSetCross = Set.empty();
	for (var i = 0; i < atoms.length; ++i) {
		var aid = atoms[i];
		var atom = this.ctab.atoms.get(aid);
		for (var j = 0; j < atom.a.neighbors.length; ++j) {
			var hbid = atom.a.neighbors[j];
			var hb = this.ctab.molecule.halfBonds.get(hbid);
			var endId = hb.end;
			var set = Set.contains(aidSet, endId) ?
					bidSetInner : bidSetCross;
			Set.add(set, hb.bid);
		}
	}
	return {'inner': bidSetInner, 'cross': bidSetCross};
};

rnd.Render.prototype.bondGetAttr = function (bid, name)
{
	rnd.logMethod('bondGetAttr');
	return this.ctab.bonds.get(bid).b[name];
};

rnd.Render.prototype.setSelection = function (selection)
{
	rnd.logMethod('setSelection');
	for (var map in rnd.ReStruct.maps) {
		if (!rnd.ReStruct.maps[map].isSelectable())
			continue;
		var set = selection ? (selection[map] ? util.identityMap(selection[map]) : {}) : null;
		this.ctab[map].each(function (id, item){
			var selected = set ? set[id] === id : item.selected;
			item.selected = selected;
			this.ctab.showItemSelection(id, item, selected);
		}, this);
	}
};

rnd.Render.prototype.initStyles = function ()
{
	// TODO move fonts, dashed lines, etc. here
	var settings = this.settings;
	this.styles = {};
	this.styles.lineattr = {
		stroke: '#000',
		'stroke-width': settings.lineWidth,
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round'
	};
	this.styles.selectionStyle = {
		'fill':'#7f7',
		'stroke':'none'
	};
	this.styles.selectionZoneStyle = {
		'fill':'#000',
		'stroke':'none',
		'opacity':0.0
	};
	this.styles.highlightStyle = {
		'stroke':'#0c0',
		'stroke-width':0.6 * settings.lineWidth
	};
	this.styles.sGroupHighlightStyle = {
		'stroke':'#9900ff',
		'stroke-width':0.6 * settings.lineWidth
	};
	this.styles.sgroupBracketStyle = {
		'stroke':'darkgray',
		'stroke-width':0.5 * settings.lineWidth
	};
	this.styles.atomSelectionPlateRadius = settings.labelFontSize * 1.2 ;
};

rnd.Render.prototype.initSettings = function ()
{
	var settings = this.settings = {};
	settings.delta = this.ctab.molecule.getCoordBoundingBox();
	settings.margin = 0.1;
	settings.scaleFactor = this.scale;
	settings.lineWidth = settings.scaleFactor / 20;
	settings.bondShift = settings.scaleFactor / 6;
	settings.bondSpace = settings.scaleFactor / 7;
	settings.labelFontSize = Math.ceil(1.9 * (settings.scaleFactor / 6)); // TODO: don't round?
	settings.subFontSize = Math.ceil(0.7 * settings.labelFontSize);
	// font size is not determined by the number in this string,
	//  but by the 'font-size' property
	settings.font = '30px "Arial"';
	settings.fontsz = this.settings.labelFontSize;
	settings.fontszsub = this.settings.subFontSize;
	settings.fontRLabel = this.settings.labelFontSize * 1.2;
	settings.fontRLogic = this.settings.labelFontSize * 0.7;
};

rnd.Render.prototype.getStructCenter = function (selection)
{
	var bb = this.ctab.getVBoxObj(selection);
	return Vec2.lc2(bb.p0, 0.5, bb.p1, 0.5);
};

rnd.Render.prototype.onResize = function ()
{
	this.setViewSize(new Vec2(this.clientArea['clientWidth'], this.clientArea['clientHeight']));
};

rnd.Render.prototype.setViewSize = function (viewSz)
{
	this.viewSz = new Vec2(viewSz);
};

rnd.Render.prototype._setPaperSize = function (sz)
{
	var z = this.zoom;
	this.paper.setSize(sz.x * z, sz.y * z);
	this.setViewBox(z);
};

rnd.Render.prototype.setPaperSize = function (sz)
{
	rnd.logMethod('setPaperSize');
	var oldSz = this.sz;
	this.sz = sz;
	this._setPaperSize(sz);
	if (this.onCanvasSizeChanged)
		this.onCanvasSizeChanged(sz, oldSz);
};

rnd.Render.prototype.setOffset = function (newoffset)
{
	rnd.logMethod('setOffset');
	if (this.onCanvasOffsetChanged) this.onCanvasOffsetChanged(newoffset, this.offset);
	this.offset = newoffset;
};

rnd.Render.prototype.getElementPos = function (obj)
{
	var curleft = 0, curtop = 0;

	if (obj.offsetParent) {
		do {
			curleft += obj.offsetLeft;
			curtop += obj.offsetTop;
		} while ((obj = obj.offsetParent));
	}
	return new Vec2(curleft,curtop);
};

rnd.Render.prototype.drawSelectionLine = function (p0, p1) {
	rnd.logMethod('drawSelectionLine');
	if (this.selectionRect) {
		this.selectionRect.remove();
		this.selectionRect = null;
	}
	if (p0 && p1) {
		p0 = this.obj2scaled(p0).add(this.offset);
		p1 = this.obj2scaled(p1).add(this.offset);
		this.selectionRect = this.paper.path(
		rnd.ReStruct.makeStroke(p0, p1)
		).attr({'stroke':'gray', 'stroke-width':'1px'});
	}
};

rnd.Render.prototype.drawSelectionRectangle = function (p0, p1) {
	rnd.logMethod('drawSelectionRectangle');
	if (this.selectionRect) {
		this.selectionRect.remove();
		this.selectionRect = null;
	}
	if (p0 && p1) {
		p0 = this.obj2scaled(p0).add(this.offset);
		p1 = this.obj2scaled(p1).add(this.offset);
		this.selectionRect = this.paper.rect(
		Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)
		).attr({'stroke':'gray', 'stroke-width':'1px'});
	}
};

rnd.Render.prototype.getElementsInRectangle = function (p0,p1) {
	rnd.logMethod('getElementsInRectangle');
	var bondList = [];
	var atomList = [];

	var x0 = Math.min(p0.x, p1.x), x1 = Math.max(p0.x, p1.x), y0 = Math.min(p0.y, p1.y), y1 = Math.max(p0.y, p1.y);
	this.ctab.bonds.each(function (bid, bond){
		var centre = Vec2.lc2(this.ctab.atoms.get(bond.b.begin).a.pp, 0.5,
			this.ctab.atoms.get(bond.b.end).a.pp, 0.5);
		if (centre.x > x0 && centre.x < x1 && centre.y > y0 && centre.y < y1)
			bondList.push(bid);
	}, this);
	this.ctab.atoms.each(function (aid, atom) {
		if (atom.a.pp.x > x0 && atom.a.pp.x < x1 && atom.a.pp.y > y0 && atom.a.pp.y < y1)
			atomList.push(aid);
	}, this);
	var rxnArrowsList = [];
	var rxnPlusesList = [];
	this.ctab.rxnArrows.each(function (id, item){
		if (item.item.pp.x > x0 && item.item.pp.x < x1 && item.item.pp.y > y0 && item.item.pp.y < y1)
			rxnArrowsList.push(id);
	}, this);
	this.ctab.rxnPluses.each(function (id, item){
		if (item.item.pp.x > x0 && item.item.pp.x < x1 && item.item.pp.y > y0 && item.item.pp.y < y1)
			rxnPlusesList.push(id);
	}, this);
	var chiralFlagList = [];
	this.ctab.chiralFlags.each(function (id, item){
		if (item.pp.x > x0 && item.pp.x < x1 && item.pp.y > y0 && item.pp.y < y1)
			chiralFlagList.push(id);
	}, this);
	var sgroupDataList = [];
	this.ctab.sgroupData.each(function (id, item){
		if (item.sgroup.pp.x > x0 && item.sgroup.pp.x < x1 && item.sgroup.pp.y > y0 && item.sgroup.pp.y < y1)
			sgroupDataList.push(id);
	}, this);
	return {
		'atoms':atomList,
		'bonds':bondList,
		'rxnArrows':rxnArrowsList,
		'rxnPluses':rxnPlusesList,
		'chiralFlags':chiralFlagList,
		'sgroupData':sgroupDataList
	};
};

rnd.Render.prototype.drawSelectionPolygon = function (r) {
	rnd.logMethod('drawSelectionPolygon');
	if (this.selectionRect) {
		this.selectionRect.remove();
		this.selectionRect = null;
	}
	if (r && r.length > 1) {
		var v = this.obj2scaled(r[r.length - 1]).add(this.offset);
		var pstr = 'M' + tfx(v.x) + ',' + tfx(v.y);
		for (var i = 0; i < r.length; ++i) {
			v = this.obj2scaled(r[i]).add(this.offset);
			pstr += 'L' + tfx(v.x) + ',' + tfx(v.y);
		}
		this.selectionRect = this.paper.path(pstr).attr({'stroke':'gray', 'stroke-width':'1px'});
	}
};

rnd.Render.prototype.isPointInPolygon = function (r, p) {
	var d = new Vec2(0, 1);
	var n = d.rotate(Math.PI / 2);
	var v0 = Vec2.diff(r[r.length - 1], p);
	var n0 = Vec2.dot(n, v0);
	var d0 = Vec2.dot(d, v0);
	var w0 = null;
	var counter = 0;
	var eps = 1e-5;
	var flag1 = false, flag0 = false;

	for (var i = 0; i < r.length; ++i) {
		var v1 = Vec2.diff(r[i], p);
		var w1 = Vec2.diff(v1, v0);
		var n1 = Vec2.dot(n, v1);
		var d1 = Vec2.dot(d, v1);
		flag1 = false;
		if (n1 * n0 < 0)
		{
			if (d1 * d0 > -eps) {
				if (d0 > -eps)
					flag1 = true;
			} else if ((Math.abs(n0) * Math.abs(d1) - Math.abs(n1) * Math.abs(d0)) * d1 > 0) {
				flag1 = true;
			}
		}
		if (flag1 && flag0 && Vec2.dot(w1, n) * Vec2(w0, n) >= 0)
			flag1 = false;
		if (flag1)
			counter++;
		v0 = v1;
		n0 = n1;
		d0 = d1;
		w0 = w1;
		flag0 = flag1;
	}
	return (counter % 2) != 0;
};

rnd.Render.prototype.ps = function (pp) {
	return pp.scaled(this.settings.scaleFactor);
};

rnd.Render.prototype.getElementsInPolygon = function (rr) {
	rnd.logMethod('getElementsInPolygon');
	var bondList = [];
	var atomList = [];
	var r = [];
	for (var i = 0; i < rr.length; ++i) {
		r[i] = new Vec2(rr[i].x, rr[i].y);
	}
	this.ctab.bonds.each(function (bid, bond){
		var centre = Vec2.lc2(this.ctab.atoms.get(bond.b.begin).a.pp, 0.5,
			this.ctab.atoms.get(bond.b.end).a.pp, 0.5);
		if (this.isPointInPolygon(r, centre))
			bondList.push(bid);
	}, this);
	this.ctab.atoms.each(function (aid, atom){
		if (this.isPointInPolygon(r, atom.a.pp))
			atomList.push(aid);
	}, this);
	var rxnArrowsList = [];
	var rxnPlusesList = [];
	this.ctab.rxnArrows.each(function (id, item){
		if (this.isPointInPolygon(r, item.item.pp))
			rxnArrowsList.push(id);
	}, this);
	this.ctab.rxnPluses.each(function (id, item){
		if (this.isPointInPolygon(r, item.item.pp))
			rxnPlusesList.push(id);
	}, this);
	var chiralFlagList = [];
	this.ctab.chiralFlags.each(function (id, item){
		if (this.isPointInPolygon(r, item.pp))
			chiralFlagList.push(id);
	}, this);
	var sgroupDataList = [];
	this.ctab.sgroupData.each(function (id, item){
		if (this.isPointInPolygon(r, item.sgroup.pp))
			sgroupDataList.push(id);
	}, this);

	return {
		'atoms':atomList,
		'bonds':bondList,
		'rxnArrows':rxnArrowsList,
		'rxnPluses':rxnPlusesList,
		'chiralFlags':chiralFlagList,
		'sgroupData':sgroupDataList
	};
};

rnd.Render.prototype.testPolygon = function (rr) {
	rr = rr || [
	{
		x:50,
		y:10
	},

	{
		x:20,
		y:90
	},

	{
		x:90,
		y:30
	},

	{
		x:10,
		y:30
	},

	{
		x:90,
		y:80
	}
		];
	if (rr.length < 3)
		return;
	var min = rr[0], max = rr[0];
	for (var j = 1; j < rr.length; ++j) {
		min = Vec2.min(min, rr[j]);
		max = Vec2.max(max, rr[j]);
	}
	this.drawSelectionPolygon(rr);
	var zz = 10;
	for (var k = 0; k < 1000; ++k) {
		var p = new Vec2(Math.random() * zz, Math.random() * zz);
		var isin = this.isPointInPolygon(rr, p);
		var color = isin ? '#0f0' : '#f00';
		this.paper.circle(p.x, p.y, 2).attr({
			'fill':color,
			'stroke':'none'
		});
	}
	this.drawSelectionPolygon(rr);
};

rnd.Render.prototype.update = function (force)
{
	rnd.logMethod('update');

	if (!this.settings || this.dirty) {
		if (this.opt.autoScale) {
			var cbb = this.ctab.molecule.getCoordBoundingBox();
			// this is only an approximation to select some scale that's close enough to the target one
			var sy = cbb.max.y - cbb.min.y > 0 ? 0.8 * this.viewSz.y / (cbb.max.y - cbb.min.y) : 100;
			var sx = cbb.max.x - cbb.min.x > 0 ? 0.8 * this.viewSz.x / (cbb.max.x - cbb.min.x) : 100;
			this.scale = Math.min(sy, sx);
			if (this.opt.maxBondLength > 0 && this.scale > this.opt.maxBondLength)
				this.scale = this.opt.maxBondLength;
		}
		this.initSettings();
		this.initStyles();
		this.dirty = false;
		force = true;
	}

	var start = (new Date()).getTime();
	var changes = this.ctab.update(force);
	this.setSelection(null); // [MK] redraw the selection bits where necessary
	var time = (new Date()).getTime() - start;
	if (force && $('log'))
		$('log').innerHTML = time.toString() + '\n';
	if (changes) {
		var sf = this.settings.scaleFactor;
		var bb = this.ctab.getVBoxObj().transform(this.obj2scaled, this).translate(this.offset || new Vec2());

		if (!this.opt.autoScale) {
			var ext = Vec2.UNIT.scaled(sf);
			var eb = bb.sz().length() > 0 ? bb.extend(ext, ext) : bb;
			// The only reference to ui.zoom
			console.assert(ui.zoom == this.zoom);
			var vb = new Box2Abs(ui.scrollPos(), this.viewSz.scaled(1 / ui.zoom).sub(Vec2.UNIT.scaled(20)));
			var cb = Box2Abs.union(vb, eb);
			if (!this.oldCb)
				this.oldCb = new Box2Abs();

			var sz = cb.sz().floor();
			var delta = this.oldCb.p0.sub(cb.p0).ceil();
			this.oldBb = bb;
			if (!this.sz || sz.x != this.sz.x || sz.y != this.sz.y)
				this.setPaperSize(sz);

			this.offset = this.offset || new Vec2();
			if (delta.x != 0 || delta.y != 0) {
				this.setOffset(this.offset.add(delta));
				this.ctab.translate(delta);
			}
		} else {
			var sz1 = bb.sz();
			var marg = this.opt.autoScaleMargin;
			var mv = new Vec2(marg, marg);
			var csz = this.viewSz;
			if (csz.x < 2 * marg + 1 || csz.y < 2 * marg + 1)
				throw new Error('View box too small for the given margin');
			var rescale = Math.max(sz1.x / (csz.x - 2 * marg), sz1.y / (csz.y - 2 * marg));
			if (this.opt.maxBondLength / rescale > 1.0)
				rescale = 1.0;
			var sz2 = sz1.add(mv.scaled(2 * rescale));
			this.paper.setViewBox(bb.pos().x - marg * rescale - (csz.x * rescale - sz2.x) / 2, bb.pos().y - marg * rescale - (csz.y * rescale - sz2.y) / 2, csz.x * rescale, csz.y * rescale);
		}
	}
};

rnd.Render.prototype.checkBondExists = function (begin, end) {
	return this.ctab.molecule.checkBondExists(begin, end);
};

var findClosestChiralFlag = function (render, p) {
    var minDist;
    var ret;
    
    // there is only one chiral flag, but we treat it as a "map" for convenience
    render.ctab.chiralFlags.each(function (id, item) {
        var pos = item.pp;
        if (Math.abs(p.x - pos.x) < 1.0) {
            var dist = Math.abs(p.y - pos.y);
            if (dist < 0.3 && (!ret || dist < minDist)) {
                minDist = dist;
                ret = { 'id': id, 'dist': minDist };
            }
        }
    });
    return ret;
};

var findClosestSGroup = function (render, p) {
    var ret = null;
    var minDist = render.opt.selectionDistanceCoefficient;
    render.ctab.molecule.sgroups.each(function (sgid, sg) {
        var d = sg.bracketDir, n = d.rotateSC(1, 0);
        var pg = new Vec2(Vec2.dot(p, d), Vec2.dot(p, n));
        for (var i = 0; i < sg.areas.length; ++i) {
            var box = sg.areas[i];
            var inBox = box.p0.y < pg.y && box.p1.y > pg.y && box.p0.x < pg.x && box.p1.x > pg.x;
            var xDist = Math.min(Math.abs(box.p0.x - pg.x), Math.abs(box.p1.x - pg.x));
            if (inBox && (ret == null || xDist < minDist)) {
                ret = sgid;
                minDist = xDist;
            }
        }
    }, this);
    if (ret != null)
        return {
            'id': ret,
            'dist': minDist
        };
    return null;
};

var findClosestRxnArrow = function (render, p) {
    var minDist;
    var ret;
    
    render.ctab.rxnArrows.each(function (id, arrow) {
        var pos = arrow.item.pp;
        if (Math.abs(p.x - pos.x) < 1.0) {
            var dist = Math.abs(p.y - pos.y);
            if (dist < 0.3 && (!ret || dist < minDist)) {
                minDist = dist;
                ret = { 'id': id, 'dist': minDist };
            }
        }
    });
    return ret;
};

var findClosestSGroupData = function (render, p) {
    var minDist = null;
    var ret = null;
    
    render.ctab.sgroupData.each(function (id, item) {
        if (item.sgroup.type != 'DAT')
            throw new Error('Data group expected');
        var box = item.sgroup.dataArea;
        var inBox = box.p0.y < p.y && box.p1.y > p.y && box.p0.x < p.x && box.p1.x > p.x;
        var xDist = Math.min(Math.abs(box.p0.x - p.x), Math.abs(box.p1.x - p.x));
        if (inBox && (ret == null || xDist < minDist)) {
            ret = { 'id': id, 'dist': xDist };
            minDist = xDist;
        }
    });
    return ret;
};


var findClosestRxnPlus = function (render, p) {
    var minDist;
    var ret;
    
    render.ctab.rxnPluses.each(function (id, plus) {
        var pos = plus.item.pp;
        var dist = Math.max(Math.abs(p.x - pos.x), Math.abs(p.y - pos.y));
        if (dist < 0.5 && (!ret || dist < minDist)) {
            minDist = dist;
            ret = { 'id': id, 'dist': minDist };
        }
    });
    return ret;
};
var findClosestFrag = function (render, p, skip, minDist) {
    minDist = Math.min(minDist || render.opt.selectionDistanceCoefficient, render.opt.selectionDistanceCoefficient);
    var ret;
    render.ctab.frags.each(function (fid, frag) {
        if (fid != skip) {
            var bb = frag.calcBBox(render, fid); // TODO any faster way to obtain bb?
            if (bb.p0.y < p.y && bb.p1.y > p.y && bb.p0.x < p.x && bb.p1.x > p.x) {
                var xDist = Math.min(Math.abs(bb.p0.x - p.x), Math.abs(bb.p1.x - p.x));
                if (!ret || xDist < minDist) {
                    minDist = xDist;
                    ret = { 'id': fid, 'dist': minDist };
                }
            }
        }
    });
    return ret;
};

var findClosestRGroup = function (render, p, skip, minDist) {
    minDist = Math.min(minDist || render.opt.selectionDistanceCoefficient, render.opt.selectionDistanceCoefficient);
    var ret;
    render.ctab.rgroups.each(function (rgid, rgroup) {
        if (rgid != skip) {
            if (rgroup.labelBox) { // should be true at this stage, as the label is visible
                if (rgroup.labelBox.contains(p, 0.5)) { // inside the box or within 0.5 units from the edge
                    var dist = Vec2.dist(rgroup.labelBox.centre(), p);
                    if (!ret || dist < minDist) {
                        minDist = dist;
                        ret = { 'id': rgid, 'dist': minDist };
                    }
                }
            }
        }
    });
    return ret;
};

rnd.Render.prototype.findClosestAtom = function (pos, minDist, skip) { // TODO should be a member of ReAtom (see ReFrag)
	var closestAtom = null;
	var maxMinDist = this.opt.selectionDistanceCoefficient;
	minDist = minDist || maxMinDist;
	minDist	 = Math.min(minDist, maxMinDist);
	this.ctab.atoms.each(function (aid, atom){
		if (aid != skip) {
			var dist = Vec2.dist(pos, atom.a.pp);
			if (dist < minDist) {
				closestAtom = aid;
				minDist = dist;
			}
		}
	}, this);
	if (closestAtom != null)
		return {
			'id':closestAtom,
			'dist':minDist
		};
	return null;
};

var findClosestBond = function (render, pos, minDist) { // TODO should be a member of ReBond (see ReFrag)
	var closestBond = null;
	var closestBondCenter = null;
	var maxMinDist = render.opt.selectionDistanceCoefficient;
	minDist = minDist || maxMinDist;
	minDist = Math.min(minDist, maxMinDist);
	var minCDist = minDist;
    render.ctab.bonds.each(function (bid, bond){
		var p1 = render.ctab.atoms.get(bond.b.begin).a.pp,
		p2 = render.ctab.atoms.get(bond.b.end).a.pp;
		var mid = Vec2.lc2(p1, 0.5, p2, 0.5);
		var cdist = Vec2.dist(pos, mid);
		if (cdist < minCDist) {
			minCDist = cdist;
			closestBondCenter = bid;
		}
	}, render);
    render.ctab.bonds.each(function (bid, bond){
		var hb = render.ctab.molecule.halfBonds.get(bond.b.hb1);
		var d = hb.dir;
		var n = hb.norm;
		var p1 = render.ctab.atoms.get(bond.b.begin).a.pp,
		p2 = render.ctab.atoms.get(bond.b.end).a.pp;

		var inStripe = Vec2.dot(pos.sub(p1),d) * Vec2.dot(pos.sub(p2),d) < 0;
		if (inStripe) {
			var dist = Math.abs(Vec2.dot(pos.sub(p1),n));
			if (dist < minDist) {
				closestBond = bid;
				minDist = dist;
			}
		}
	}, render);
	if (closestBond !== null || closestBondCenter !== null)
		return {
			'id': closestBond,
			'dist': minDist,
			'cid': closestBondCenter,
			'cdist': minCDist
		};
	return null;
};

rnd.Render.prototype.findClosestItem = function (pos, maps, skip) {
	var ret = null;
	var updret = function (type, item, force) {
		if (item != null && (ret == null || ret.dist > item.dist || force)) {
			ret = {
				'type':type,
				'id':item.id,
				'dist':item.dist
			};
		}
	};

	// TODO make it "map-independent", each object should be able to "report" its distance to point (something like ReAtom.dist(point))
	if (!maps || maps.indexOf('atoms') >= 0) {
		var atom = this.findClosestAtom(
			pos, undefined, !Object.isUndefined(skip) && skip.map == 'atoms' ? skip.id : undefined
		);
		updret('Atom', atom);
	}
	if (!maps || maps.indexOf('bonds') >= 0) {
		var bond = findClosestBond(this, pos);
		if (bond) {
			if (bond.cid !== null)
				updret('Bond', {'id': bond.cid, 'dist': bond.cdist});
			if (ret == null || ret.dist > 0.4 * this.scale) // hack
				updret('Bond', bond);
		}
	}
	if (!maps || maps.indexOf('chiralFlags') >= 0) {
		var flag = findClosestChiralFlag(this, pos);
		updret('ChiralFlag', flag); // [MK] TODO: replace this with map name, 'ChiralFlag' -> 'chiralFlags', to avoid the extra mapping "if (ci.type == 'ChiralFlag') ci.map = 'chiralFlags';"
	}
	if (!maps || maps.indexOf('sgroupData') >= 0) {
		var sgd = findClosestSGroupData(this, pos);
		updret('DataSGroupData', sgd);
	}
	if (!maps || maps.indexOf('sgroups') >= 0) {
		var sg = findClosestSGroup(this, pos);
		updret('SGroup', sg);
	}
	if (!maps || maps.indexOf('rxnArrows') >= 0) {
		var arrow = findClosestRxnArrow(this, pos);
		updret('RxnArrow',arrow);
	}
	if (!maps || maps.indexOf('rxnPluses') >= 0) {
		var plus = findClosestRxnPlus(this, pos);
		updret('RxnPlus',plus);
	}
	if (!maps || maps.indexOf('frags') >= 0) {
		var frag = findClosestFrag(this, pos, skip && skip.map == 'atoms' ? skip.id : undefined);
		updret('Fragment', frag);
	}
	if (!maps || maps.indexOf('rgroups') >= 0) {
		var rgroup = findClosestRGroup(this, pos);
		updret('RGroup', rgroup);
	}

	ret = ret || {
		'type':'Canvas',
		'id':-1
		};
	return ret;
};

rnd.Render.prototype.setZoom = function (zoom) {
	this.zoom = zoom;
	this._setPaperSize(this.sz);
};

rnd.Render.prototype.extendCanvas = function (x0, y0, x1, y1) {
	var ex = 0, ey = 0, dx = 0, dy = 0;
	x0 = x0 - 0;
	x1 = x1 - 0;
	y0 = y0 - 0;
	y1 = y1 - 0;

	if (x0 < 0) {
		ex += -x0;
		dx += -x0;
	}
	if (y0 < 0) {
		ey += -y0;
		dy += -y0;
	}

	var szx = this.sz.x * this.zoom, szy = this.sz.y * this.zoom;
	if (szx < x1) {
		ex += x1 - szx;
	}
	if (szy < y1) {
		ey += y1 - szy;
	}

	var d = new Vec2(dx, dy).scaled(1 / this.zoom);
	if (ey > 0 || ex > 0) {
		var e = new Vec2(ex, ey).scaled(1 / this.zoom);
		var sz = this.sz.add(e);

		this.setPaperSize(sz);
		if (d.x > 0 || d.y > 0) {
			this.ctab.translate(d);
			this.setOffset(this.offset.add(d));
		}
	}
	return d;
};

rnd.Render.prototype.setScale = function (z) {
	if (this.offset)
		this.offset = this.offset.scaled(1 / z).scaled(this.zoom);
	this.scale = this.baseScale * this.zoom;
	this.settings = null;
	this.update(true);
};

rnd.Render.prototype.setViewBox = function (z) {
	if (!this.useOldZoom)
		this.paper.canvas.setAttribute('viewBox', '0 0 ' + this.sz.x + ' ' + this.sz.y);
	else
		this.setScale(z);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/sgroup":15,"../chem/struct":18,"../raphael-ext.js":20,"../util":40,"../util/box2abs":39,"../util/set":43,"../util/vec2":44,"./restruct":24,"./restruct_rendering":25}],24:[function(require,module,exports){
(function (global){
// ReStruct is to store all the auxiliary information for
// Struct while rendering
var Box2Abs = require('../util/box2abs');
var Map = require('../util/map');
var Pool = require('../util/pool');
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');

var element = require('../chem/element');
var Struct = require('../chem/struct');
var SGroup = require('../chem/sgroup');
var Bond = require('../chem/bond');

var Visel = require('./visel');

var rnd = global.rnd = global.rnd || {};
var tfx = util.tfx;

rnd.ReObject = function ()  // TODO ??? should it be in ReStruct namespace
{
	this.__ext = new Vec2(0.05 * 3, 0.05 * 3);
};

rnd.ReObject.prototype.init = function (viselType)
{
	this.visel = new Visel(viselType);

	this.highlight = false;
	this.highlighting = null;
	this.selected = false;
	this.selectionPlate = null;
};

// returns the bounding box of a ReObject in the object coordinates
rnd.ReObject.prototype.getVBoxObj = function (render) {
	var vbox = this.visel.boundingBox;
	if (util.isNull(vbox))
		return null;
	if (render.offset)
		vbox = vbox.translate(render.offset.negated());
	return vbox.transform(render.scaled2obj, render);
};

rnd.ReObject.prototype.drawHighlight = function (render) {
	console.log('ReObject.drawHighlight is not overridden');
};

rnd.ReObject.prototype.setHighlight = function (highLight, render) { // TODO render should be field
	if (highLight) {
		var noredraw = 'highlighting' in this && this.highlighting != null;// && !this.highlighting.removed;
		if (noredraw) {
			if (this.highlighting.type == 'set') {
				noredraw = !this.highlighting[0].removed;
			} else {
				noredraw = !this.highlighting.removed;
			}
		}
		// rbalabanov: here is temporary fix for "drag issue" on iPad
		//BEGIN
		noredraw = noredraw && (!('hiddenPaths' in rnd.ReStruct.prototype) || rnd.ReStruct.prototype.hiddenPaths.indexOf(this.highlighting) < 0);
		//END
		if (noredraw) {
			this.highlighting.show();
		}
		else {
			render.paper.setStart();
			this.drawHighlight(render);
			this.highlighting = render.paper.setFinish();
		}
	} else {
		if (this.highlighting) this.highlighting.hide();
	}
	this.highlight = highLight;
};

rnd.ReObject.prototype.makeSelectionPlate = function (render) {
	console.log('ReObject.makeSelectionPlate is not overridden');
};

var ReAtom = function (/*chem.Atom*/atom)
{
	this.init(Visel.TYPE.ATOM);

	this.a = atom; // TODO rename a to item
	this.showLabel = false;

	this.hydrogenOnTheLeft = false;

	this.component = -1;
};
ReAtom.prototype = new rnd.ReObject();
ReAtom.isSelectable = function () { return true; }

ReAtom.prototype.getVBoxObj = function (render) {
	if (this.visel.boundingBox)
		return rnd.ReObject.prototype.getVBoxObj.call(this, render);
	return new Box2Abs(this.a.pp, this.a.pp);
};

ReAtom.prototype.drawHighlight = function (render) {
	var ret = this.makeHighlightPlate(render);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

ReAtom.prototype.makeHighlightPlate = function (render) {
	var paper = render.paper;
	var styles = render.styles;
	var ps = render.ps(this.a.pp);
	return paper.circle(ps.x, ps.y, styles.atomSelectionPlateRadius)
	.attr(styles.highlightStyle);
};

ReAtom.prototype.makeSelectionPlate = function (restruct, paper, styles) {
	var ps = restruct.render.ps(this.a.pp);
	return paper.circle(ps.x, ps.y, styles.atomSelectionPlateRadius)
	.attr(styles.selectionStyle);
};

var ReBond = function (/*chem.Bond*/bond)
{
	this.init(Visel.TYPE.BOND);

	this.b = bond; // TODO rename b to item
	this.doubleBondShift = 0;
};
ReBond.prototype = new rnd.ReObject();
ReBond.isSelectable = function () { return true; }

ReBond.prototype.drawHighlight = function (render) {
	var ret = this.makeHighlightPlate(render);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

ReBond.prototype.makeHighlightPlate = function (render) {
	render.ctab.bondRecalc(render.settings, this);
	var c = render.ps(this.b.center);
	return render.paper.circle(c.x, c.y, 0.8 * render.styles.atomSelectionPlateRadius)
	.attr(render.styles.highlightStyle);
};

ReBond.prototype.makeSelectionPlate = function (restruct, paper, styles) {
	restruct.bondRecalc(restruct.render.settings, this);
	var c = restruct.render.ps(this.b.center);
	return paper.circle(c.x, c.y, 0.8 * styles.atomSelectionPlateRadius)
	.attr(styles.selectionStyle);
};

rnd.ReStruct = function (molecule, render, norescale)
{
	this.render = render;
	this.atoms = new Map();
	this.bonds = new Map();
	this.reloops = new Map();
	this.rxnPluses = new Map();
	this.rxnArrows = new Map();
	this.frags = new Map();
	this.rgroups = new Map();
	this.sgroups = new Map();
	this.sgroupData = new Map();
	this.chiralFlags = new Map();
	this.molecule = molecule || new Struct();
	this.initialized = false;
	this.layers = [];
	this.initLayers();

	this.connectedComponents = new Pool();
	this.ccFragmentType = new Map();

	for (var map in rnd.ReStruct.maps) {
		this[map + 'Changed'] = {};
	}
	this.structChanged = false;

	molecule.atoms.each(function (aid, atom){
		this.atoms.set(aid, new ReAtom(atom));
	}, this);

	molecule.bonds.each(function (bid, bond){
		this.bonds.set(bid, new ReBond(bond));
	}, this);

	molecule.loops.each(function (lid, loop){
		this.reloops.set(lid, new rnd.ReLoop(loop));
	}, this);

	molecule.rxnPluses.each(function (id, item){
		this.rxnPluses.set(id, new rnd.ReRxnPlus(item));
	}, this);

	molecule.rxnArrows.each(function (id, item){
		this.rxnArrows.set(id, new rnd.ReRxnArrow(item));
	}, this);

	molecule.frags.each(function (id, item) {
		this.frags.set(id, new rnd.ReFrag(item));
	}, this);

	molecule.rgroups.each(function (id, item) {
		this.rgroups.set(id, new rnd.ReRGroup(item));
	}, this);

	molecule.sgroups.each(function (id, item) {
		this.sgroups.set(id, new rnd.ReSGroup(item));
		if (item.type == 'DAT' && !item.data.attached) {
			this.sgroupData.set(id, new rnd.ReDataSGroupData(item)); // [MK] sort of a hack, we use the SGroup id for the data field id
		}
	}, this);

	if (molecule.isChiral && !this.render.opt.hideChiralFlag) {
		var bb = molecule.getCoordBoundingBox();
		this.chiralFlags.set(0,new rnd.ReChiralFlag(new Vec2(bb.max.x, bb.min.y - 1)));
	}

	this.coordProcess(norescale);
};

rnd.ReStruct.prototype.connectedComponentRemoveAtom = function (aid, atom) {
	atom = atom || this.atoms.get(aid);
	if (atom.component < 0)
		return;
	var cc = this.connectedComponents.get(atom.component);
	Set.remove(cc, aid);
	if (Set.size(cc) < 1)
		this.connectedComponents.remove(atom.component);

	atom.component = -1;
};

rnd.ReStruct.prototype.printConnectedComponents = function () {
	var strs = [];
	this.connectedComponents.each(function (ccid, cc){
		strs.push(' ' + ccid + ':[' + Set.list(cc).toString() + '].' + Set.size(cc).toString());
	}, this);
	console.log(strs.toString());
};

rnd.ReStruct.prototype.clearConnectedComponents = function () {
	this.connectedComponents.clear();
	this.atoms.each(function (aid, atom) {
		atom.component = -1;
	});
};

rnd.ReStruct.prototype.getConnectedComponent = function (aid, adjacentComponents) {
	var list = (typeof(aid['length']) == 'number') ? util.array(aid) : [aid];
	var ids = Set.empty();

	while (list.length > 0) {
		(function () {
			var aid = list.pop();
			Set.add(ids, aid);
			var atom = this.atoms.get(aid);
			if (atom.component >= 0) {
				Set.add(adjacentComponents, atom.component);
			}
			for (var i = 0; i < atom.a.neighbors.length; ++i) {
				var neiId = this.molecule.halfBonds.get(atom.a.neighbors[i]).end;
				if (!Set.contains(ids, neiId))
					list.push(neiId);
			}
		}).apply(this);
	}

	return ids;
};

rnd.ReStruct.prototype.addConnectedComponent = function (ids) {
	var compId = this.connectedComponents.add(ids);
	var adjacentComponents = Set.empty();
	var atomIds = this.getConnectedComponent(Set.list(ids), adjacentComponents);
	Set.remove(adjacentComponents, compId);
	var type = -1;
	Set.each(atomIds, function (aid) {
		var atom = this.atoms.get(aid);
		atom.component = compId;
		if (atom.a.rxnFragmentType != -1) {
			if (type != -1 && atom.a.rxnFragmentType != type)
				throw new Error('reaction fragment type mismatch');
			type = atom.a.rxnFragmentType;
		}
	}, this);

	this.ccFragmentType.set(compId, type);
	return compId;
};

rnd.ReStruct.prototype.removeConnectedComponent = function (ccid) {
	Set.each(this.connectedComponents.get(ccid), function (aid) {
		this.atoms.get(aid).component = -1;
	}, this);
	return this.connectedComponents.remove(ccid);
};

rnd.ReStruct.prototype.connectedComponentMergeIn = function (ccid, set) {
	Set.each(set, function (aid) {
		this.atoms.get(aid).component = ccid;
	}, this);
	Set.mergeIn(this.connectedComponents.get(ccid), set);
};

rnd.ReStruct.prototype.assignConnectedComponents = function () {
	this.atoms.each(function (aid,atom){
		if (atom.component >= 0)
			return;
		var adjacentComponents = Set.empty();
		var ids = this.getConnectedComponent(aid, adjacentComponents);
		Set.each(adjacentComponents, function (ccid){
			this.removeConnectedComponent(ccid);
		}, this);
		this.addConnectedComponent(ids);
	}, this);
};

rnd.ReStruct.prototype.connectedComponentGetBoundingBox = function (ccid, cc, bb) {
	cc = cc || this.connectedComponents.get(ccid);
	bb = bb || {'min':null, 'max':null};
	Set.each(cc, function (aid) {
		var ps = this.render.ps(this.atoms.get(aid).a.pp);
		if (bb.min == null) {
			bb.min = bb.max = ps;
		} else {
			bb.min = bb.min.min(ps);
			bb.max = bb.max.max(ps);
		}
	}, this);
	return bb;
};

rnd.ReStruct.prototype.initLayers = function () {
	for (var group in rnd.ReStruct.layerMap)
		this.layers[rnd.ReStruct.layerMap[group]] =
		this.render.paper.rect(0, 0, 10, 10)
		.attr({
			'fill':'#000',
			'opacity':'0.0'
		}).toFront();
};

rnd.ReStruct.prototype.insertInLayer = function (lid, path) {
	path.insertBefore(this.layers[lid]);
};

rnd.ReStruct.prototype.clearMarks = function () {
	for (var map in rnd.ReStruct.maps) {
		this[map + 'Changed'] = {};
	}
	this.structChanged = false;
};

rnd.ReStruct.prototype.markItemRemoved = function () {
	this.structChanged = true;
};

rnd.ReStruct.prototype.markBond = function (bid, mark) {
	this.markItem('bonds', bid, mark);
};

rnd.ReStruct.prototype.markAtom = function (aid, mark) {
	this.markItem('atoms', aid, mark);
};

rnd.ReStruct.prototype.markItem = function (map, id, mark) {
	var mapChanged = this[map + 'Changed'];
	mapChanged[id] = (typeof(mapChanged[id]) != 'undefined') ?
		Math.max(mark, mapChanged[id]) : mark;
	if (this[map].has(id))
		this.clearVisel(this[map].get(id).visel);
};

rnd.ReStruct.prototype.eachVisel = function (func, context) {
	for (var map in rnd.ReStruct.maps) {
		this[map].each(function (id, item) {
			func.call(context, item.visel);
		}, this);
	}
};

rnd.ReStruct.prototype.getVBoxObj = function (selection)
{
	selection = selection || {};
	if (this.selectionIsEmpty(selection)) {
		for (var map in rnd.ReStruct.maps) {
			selection[map] = this[map].keys();
		}
	}
	var vbox = null;
	for (var map in rnd.ReStruct.maps) {
		if (selection[map]) {
			util.each(selection[map], function (id) {
				var box = this[map].get(id).getVBoxObj(this.render);
				if (box)
					vbox = vbox ? Box2Abs.union(vbox, box) : box.clone();
			}, this);
		}
	}
	vbox = vbox || new Box2Abs(0, 0, 0, 0);
	return vbox;
};

rnd.ReStruct.prototype.selectionIsEmpty = function (selection) {
	util.assert(!util.isUndefined(selection), '\'selection\' is not defined');
	if (util.isNull(selection))
		return true;
	for (var map in rnd.ReStruct.maps)
		if (selection[map] && selection[map].length > 0)
			return false;
	return true;
}

rnd.ReStruct.prototype.translate = function (d) {
	this.eachVisel(function (visel){
		visel.translate(d);
	}, this);
};

rnd.ReStruct.prototype.scale = function (s) {
	// NOTE: bounding boxes are not valid after scaling
	this.eachVisel(function (visel){
		this.scaleVisel(visel, s);
	}, this);
};

rnd.ReStruct.prototype.scaleRPath = function (path, s) {
	if (path.type == 'set') { // TODO: rework scaling
		for (var i = 0; i < path.length; ++i)
			this.scaleRPath(path[i], s);
	} else {
		if (!Object.isUndefined(path.attrs)) {
			if ('font-size' in path.attrs)
				path.attr('font-size', path.attrs['font-size'] * s);
			else if ('stroke-width' in path.attrs)
				path.attr('stroke-width', path.attrs['stroke-width'] * s);
		}
		path.scale(s, s, 0, 0);
	}
};

rnd.ReStruct.prototype.scaleVisel = function (visel, s) {
	for (var i = 0; i < visel.paths.length; ++i)
		this.scaleRPath(visel.paths[i], s);
};

rnd.ReStruct.prototype.clearVisels = function () {
	this.eachVisel(function (visel){
		this.clearVisel(visel);
	}, this);
};

rnd.ReStruct.prototype.findIncomingStereoUpBond = function (atom, bid0, includeBoldStereoBond) {
	return util.findIndex(atom.neighbors, function (hbid) {
		var hb = this.molecule.halfBonds.get(hbid);
		var bid = hb.bid;
		if (bid === bid0)
			return false;
		var neibond = this.bonds.get(bid);
		if (neibond.b.type === Bond.PATTERN.TYPE.SINGLE && neibond.b.stereo === Bond.PATTERN.STEREO.UP)
			return neibond.b.end === hb.begin || (neibond.boldStereo && includeBoldStereoBond);
		if (neibond.b.type === Bond.PATTERN.TYPE.DOUBLE && neibond.b.stereo === Bond.PATTERN.STEREO.NONE && includeBoldStereoBond && neibond.boldStereo)
			return true;
		return false;
	}, this);
}

rnd.ReStruct.prototype.checkStereoBold = function (bid0, bond) {
	var halfbonds = util.map([bond.b.begin, bond.b.end], function (aid) {
		var atom = this.molecule.atoms.get(aid);
		var pos =  this.findIncomingStereoUpBond(atom, bid0, false);
		return pos < 0 ? -1 : atom.neighbors[pos];
	}, this);
	util.assert(halfbonds.length === 2);
	bond.boldStereo = halfbonds[0] >= 0 && halfbonds[1] >= 0;
};

rnd.ReStruct.prototype.findIncomingUpBonds = function (bid0, bond) {
	var halfbonds = util.map([bond.b.begin, bond.b.end], function (aid) {
		var atom = this.molecule.atoms.get(aid);
		var pos =  this.findIncomingStereoUpBond(atom, bid0, true);
		return pos < 0 ? -1 : atom.neighbors[pos];
	}, this);
	util.assert(halfbonds.length === 2);
	bond.neihbid1 = this.atoms.get(bond.b.begin).showLabel ? -1 : halfbonds[0];
	bond.neihbid2 = this.atoms.get(bond.b.end).showLabel ? -1 : halfbonds[1];
};

rnd.ReStruct.prototype.checkStereoBoldBonds = function () {
	this.bonds.each(this.checkStereoBold, this);
};

rnd.ReStruct.prototype.update = function (force)
{
	force = force || !this.initialized;

	// check items to update
	var id;
	if (force) {
		(function (){
			for (var map in rnd.ReStruct.maps) {
				var mapChanged = this[map + 'Changed'];
				this[map].each(function (id){
					mapChanged[id] = 1;
				}, this);
			}
		}).call(this);
	} else {
		// check if some of the items marked are already gone
		(function (){
			for (var map in rnd.ReStruct.maps) {
				var mapChanged = this[map + 'Changed'];
				for (id in mapChanged)
					if (!this[map].has(id))
						delete mapChanged[id];
			}
		}).call(this);
	}
	for (id in this.atomsChanged)
		this.connectedComponentRemoveAtom(id);

	// clean up empty fragments
	// TODO: fragment removal should be triggered by the action responsible for the fragment contents removal and form an operation of its own
	var emptyFrags = this.frags.findAll(function (fid, frag) {
		return !frag.calcBBox(this.render, fid);
	}, this);
	for (var j = 0; j < emptyFrags.length; ++j) {
		var fid = emptyFrags[j];
		this.clearVisel(this.frags.get(fid).visel);
		this.frags.unset(fid);
		this.molecule.frags.remove(fid);
	}

	(function (){
		for (var map in rnd.ReStruct.maps) {
			var mapChanged = this[map + 'Changed'];
			for (id in mapChanged) {
				this.clearVisel(this[map].get(id).visel);
				this.structChanged |= mapChanged[id] > 0;
			}
		}
	}).call(this);
	if (this.structChanged)
		util.each(this.render.structChangeHandlers, function (handler){handler.call();});

	// TODO: when to update sgroup?
	this.sgroups.each(function (sid, sgroup){
		this.clearVisel(sgroup.visel);
		sgroup.highlighting = null;
		sgroup.selectionPlate = null;
	}, this);

	// TODO [RB] need to implement update-on-demand for fragments and r-groups
	this.frags.each(function (frid, frag) {
		this.clearVisel(frag.visel);
	}, this);
	this.rgroups.each(function (rgid, rgroup) {
		this.clearVisel(rgroup.visel);
	}, this);

	if (force) { // clear and recreate all half-bonds
		this.clearConnectedComponents();
		this.molecule.initHalfBonds();
		this.molecule.initNeighbors();
	}

	// only update half-bonds adjacent to atoms that have moved
	this.molecule.updateHalfBonds(new Map(this.atomsChanged).findAll(function (aid, status){ return status >= 0; }, this));
	this.molecule.sortNeighbors(new Map(this.atomsChanged).findAll(function (aid, status){ return status >= 1; }, this));
	this.assignConnectedComponents();
	this.setImplicitHydrogen();
	this.setHydrogenPos();
	this.initialized = true;

	this.verifyLoops();
	var updLoops = force || this.structChanged;
	if (updLoops)
		this.updateLoops();
	this.setDoubleBondShift();
	this.checkLabelsToShow();
	this.checkStereoBoldBonds();
	this.showLabels();
	this.showBonds();
	if (updLoops)
		this.renderLoops();
	this.drawReactionSymbols();
	this.drawSGroups();
	this.drawFragments();
	this.drawRGroups();
	this.chiralFlags.each(function (id, item) {
		if (this.chiralFlagsChanged[id] > 0)
			item.draw(this.render);
	}, this);
	this.clearMarks();
	return true;
};

rnd.ReStruct.prototype.drawReactionSymbols = function ()
{
	var item;
	var id;
	for (id in this.rxnArrowsChanged) {
		item = this.rxnArrows.get(id);
		this.drawReactionArrow(id, item);
	}
	for (id in this.rxnPlusesChanged) {
		item = this.rxnPluses.get(id);
		this.drawReactionPlus(id, item);
	}
};

rnd.ReStruct.prototype.drawReactionArrow = function (id, item)
{
	var centre = this.render.ps(item.item.pp);
	var path = this.drawArrow(new Vec2(centre.x - this.render.scale, centre.y), new Vec2(centre.x + this.render.scale, centre.y));
	item.visel.add(path, Box2Abs.fromRelBox(util.relBox(path.getBBox())));
	var offset = this.render.offset;
	if (offset != null)
		path.translateAbs(offset.x, offset.y);
};

rnd.ReStruct.prototype.drawReactionPlus = function (id, item)
{
	var centre = this.render.ps(item.item.pp);
	var path = this.drawPlus(centre);
	item.visel.add(path, Box2Abs.fromRelBox(util.relBox(path.getBBox())));
	var offset = this.render.offset;
	if (offset != null)
		path.translateAbs(offset.x, offset.y);
};

rnd.ReStruct.prototype.drawSGroups = function ()
{
	util.each(this.molecule.sGroupForest.getSGroupsBFS().reverse(), function (id) {
		var sgroup = this.sgroups.get(id);
		var path = sgroup.draw(this.render);
		this.addReObjectPath('data', sgroup.visel, path, null, true);
		sgroup.setHighlight(sgroup.highlight, this.render); // TODO: fix this
	}, this);
};

rnd.ReStruct.prototype.drawFragments = function () {
	this.frags.each(function (id, frag) {
		var path = frag.draw(this.render, id);
		if (path) this.addReObjectPath('data', frag.visel, path, null, true);
		// TODO fragment selection & highlighting
	}, this);
};

rnd.ReStruct.prototype.drawRGroups = function () {
	this.rgroups.each(function (id, rgroup) {
		var drawing = rgroup.draw(this.render);
		for (var group in drawing) {
			while (drawing[group].length > 0) {
				this.addReObjectPath(group, rgroup.visel, drawing[group].shift(), null, true);
			}
		}
		// TODO rgroup selection & highlighting
	}, this);
};

rnd.ReStruct.prototype.eachCC = function (func, type, context) {
	this.connectedComponents.each(function (ccid, cc) {
		if (!type || this.ccFragmentType.get(ccid) == type)
			func.call(context || this, ccid, cc);
	}, this);
};

rnd.ReStruct.prototype.getGroupBB = function (type)
{
	var bb = {'min':null, 'max':null};

	this.eachCC(function (ccid, cc) {
		bb = this.connectedComponentGetBoundingBox(ccid, cc, bb);
	}, type, this);

	return bb;
};

rnd.ReStruct.prototype.setHydrogenPos = function () {
	// check where should the hydrogen be put on the left of the label
	for (var aid in this.atomsChanged) {
		var atom = this.atoms.get(aid);

		if (atom.a.neighbors.length == 0) {
			var elem = element.getElementByLabel(atom.a.label);
			if (elem != null) {
				atom.hydrogenOnTheLeft = element.get(elem).putHydrogenOnTheLeft;
			}
			continue;
		}
		var yl = 1, yr = 1, nl = 0, nr = 0;
		for (var i = 0; i < atom.a.neighbors.length; ++i) {
			var d = this.molecule.halfBonds.get(atom.a.neighbors[i]).dir;
			if (d.x <= 0) {
				yl = Math.min(yl, Math.abs(d.y));
				nl++;
			} else {
				yr = Math.min(yr, Math.abs(d.y));
				nr++;
			}
		}
		if (yl < 0.51 || yr < 0.51)
			atom.hydrogenOnTheLeft = yr < yl;
		else
			atom.hydrogenOnTheLeft = nr > nl;
	}
};

rnd.ReStruct.prototype.setImplicitHydrogen = function () {
	// calculate implicit hydrogens for atoms that have been modified
	this.molecule.setImplicitHydrogen(util.idList(this.atomsChanged));
};

rnd.ReLoop = function (loop)
{
	this.loop = loop;
	this.visel = new Visel(Visel.TYPE.LOOP);
	this.centre = new Vec2();
	this.radius = new Vec2();
};
rnd.ReLoop.prototype = new rnd.ReObject();
rnd.ReLoop.isSelectable = function () { return false; }

rnd.ReStruct.prototype.coordProcess = function (norescale)
{
	if (!norescale) {
		this.molecule.rescale();
	}
};

rnd.ReStruct.prototype.notifyAtomAdded = function (aid) {
	var atomData = new ReAtom(this.molecule.atoms.get(aid));
	atomData.component = this.connectedComponents.add(Set.single(aid));
	this.atoms.set(aid, atomData);
	this.markAtom(aid, 1);
};

rnd.ReStruct.prototype.notifyRxnPlusAdded = function (plid) {
	this.rxnPluses.set(plid, new rnd.ReRxnPlus(this.molecule.rxnPluses.get(plid)));
};

rnd.ReStruct.prototype.notifyRxnArrowAdded = function (arid) {
	this.rxnArrows.set(arid, new rnd.ReRxnArrow(this.molecule.rxnArrows.get(arid)));
};

rnd.ReStruct.prototype.notifyRxnArrowRemoved = function (arid) {
	this.markItemRemoved();
	this.clearVisel(this.rxnArrows.get(arid).visel);
	this.rxnArrows.unset(arid);
};

rnd.ReStruct.prototype.notifyRxnPlusRemoved = function (plid) {
	this.markItemRemoved();
	this.clearVisel(this.rxnPluses.get(plid).visel);
	this.rxnPluses.unset(plid);
};

rnd.ReStruct.prototype.notifyBondAdded = function (bid) {
	this.bonds.set(bid, new ReBond(this.molecule.bonds.get(bid)));
	this.markBond(bid, 1);
};

rnd.ReStruct.prototype.notifyAtomRemoved = function (aid) {
	var atom = this.atoms.get(aid);
	var set = this.connectedComponents.get(atom.component);
	Set.remove(set, aid);
	if (Set.size(set) == 0) {
		this.connectedComponents.remove(atom.component);
	}
	this.clearVisel(atom.visel);
	this.atoms.unset(aid);
	this.markItemRemoved();
};

rnd.ReStruct.prototype.notifyBondRemoved = function (bid) {
	var bond = this.bonds.get(bid);
	[bond.b.hb1, bond.b.hb2].each(function (hbid) {
		var hb = this.molecule.halfBonds.get(hbid);
		if (hb.loop >= 0)
			this.loopRemove(hb.loop);
	}, this);
	this.clearVisel(bond.visel);
	this.bonds.unset(bid);
	this.markItemRemoved();
};

rnd.ReStruct.prototype.loopRemove = function (loopId)
{
	if (!this.reloops.has(loopId))
		return;
	var reloop = this.reloops.get(loopId);
	this.clearVisel(reloop.visel);
	var bondlist = [];
	for (var i = 0; i < reloop.loop.hbs.length; ++i) {
		var hbid = reloop.loop.hbs[i];
		if (!this.molecule.halfBonds.has(hbid))
			continue;
		var hb = this.molecule.halfBonds.get(hbid);
		hb.loop = -1;
		this.markBond(hb.bid, 1);
		this.markAtom(hb.begin, 1);
		bondlist.push(hb.bid);
	}
	this.reloops.unset(loopId);
	this.molecule.loops.remove(loopId);
};

rnd.ReStruct.prototype.loopIsValid = function (rlid, reloop) {
	var halfBonds = this.molecule.halfBonds;
	var loop = reloop.loop;
	var bad = false;
	loop.hbs.each(function (hbid){
		if (!halfBonds.has(hbid) || halfBonds.get(hbid).loop !== rlid) {
			bad = true;
		}
	}, this);
	return !bad;
};

rnd.ReStruct.prototype.verifyLoops = function ()
{
	var toRemove = [];
	this.reloops.each(function (rlid, reloop){
		if (!this.loopIsValid(rlid, reloop)) {
			toRemove.push(rlid);
		}
	}, this);
	for (var i = 0; i < toRemove.length; ++i) {
		this.loopRemove(toRemove[i]);
	}
};

rnd.ReStruct.prototype.BFS = function (onAtom, orig, context) {
	orig = orig - 0;
	var queue = new Array();
	var mask = {};
	queue.push(orig);
	mask[orig] = 1;
	while (queue.length > 0) {
		var aid = queue.shift();
		onAtom.call(context, aid);
		var atom = this.atoms.get(aid);
		for (var i = 0; i < atom.a.neighbors.length; ++i) {
			var nei = atom.a.neighbors[i];
			var hb = this.molecule.halfBonds.get(nei);
			if (!mask[hb.end]) {
				mask[hb.end] = 1;
				queue.push(hb.end);
			}
		}
	}
};

rnd.ReRxnPlus = function (/*chem.RxnPlus*/plus)
{
	this.init(Visel.TYPE.PLUS);

	this.item = plus;
};
rnd.ReRxnPlus.prototype = new rnd.ReObject();
rnd.ReRxnPlus.isSelectable = function () { return true; }

rnd.ReRxnPlus.prototype.highlightPath = function (render) {
	var p = render.ps(this.item.pp);
	var s = render.settings.scaleFactor;
	return render.paper.rect(p.x - s / 4, p.y - s / 4, s / 2, s / 2, s / 8);
};

rnd.ReRxnPlus.prototype.drawHighlight = function (render) {
	var ret = this.highlightPath(render).attr(render.styles.highlightStyle);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

rnd.ReRxnPlus.prototype.makeSelectionPlate = function (restruct, paper, styles) { // TODO [MK] review parameters
	return this.highlightPath(restruct.render).attr(styles.selectionStyle);
};

rnd.ReRxnArrow = function (/*chem.RxnArrow*/arrow)
{
	this.init(Visel.TYPE.ARROW);

	this.item = arrow;
};
rnd.ReRxnArrow.prototype = new rnd.ReObject();
rnd.ReRxnArrow.isSelectable = function () { return true; }

rnd.ReRxnArrow.prototype.highlightPath = function (render) {
	var p = render.ps(this.item.pp);
	var s = render.settings.scaleFactor;
	return render.paper.rect(p.x - s, p.y - s / 4, 2 * s, s / 2, s / 8);
};

rnd.ReRxnArrow.prototype.drawHighlight = function (render) {
	var ret = this.highlightPath(render).attr(render.styles.highlightStyle);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

rnd.ReRxnArrow.prototype.makeSelectionPlate = function (restruct, paper, styles) {
	return this.highlightPath(restruct.render).attr(styles.selectionStyle);
};

rnd.ReFrag = function (/*Struct.Fragment*/frag) {
	this.init(Visel.TYPE.FRAGMENT);

	this.item = frag;
};
rnd.ReFrag.prototype = new rnd.ReObject();
rnd.ReFrag.isSelectable = function () { return false; };


rnd.ReFrag.prototype.fragGetAtoms = function (render, fid) {
	var ret = [];
	render.ctab.atoms.each(function (aid, atom) {
		if (atom.a.fragment == fid) {
			ret.push(aid);
		}
	}, this);
	return ret;
};

rnd.ReFrag.prototype.fragGetBonds = function (render, fid) {
	var ret = [];
	render.ctab.bonds.each(function (bid, bond) {
		if (render.ctab.atoms.get(bond.b.begin).a.fragment == fid &&
		render.ctab.atoms.get(bond.b.end).a.fragment == fid) {
			ret.push(bid);
		}
	}, this);
	return ret;
};

rnd.ReFrag.prototype.calcBBox = function (render, fid) { // TODO need to review parameter list
	var ret;
	render.ctab.atoms.each(function (aid, atom) {
		if (atom.a.fragment == fid) {
			// TODO ReObject.calcBBox to be used instead
			var bba = atom.visel.boundingBox;
			if (!bba) {
				bba = new Box2Abs(atom.a.pp, atom.a.pp);
				var ext = new Vec2(0.05 * 3, 0.05 * 3);
				bba = bba.extend(ext, ext);
			} else {
				bba = bba.translate((render.offset || new Vec2()).negated()).transform(render.scaled2obj, render);
			}
			ret = (ret ? Box2Abs.union(ret, bba) : bba);
		}
	}, this);
	return ret;
};

rnd.ReFrag.prototype._draw = function (render, fid, attrs) { // TODO need to review parameter list
	var bb = this.calcBBox(render, fid);
	if (bb) {
		var p0 = render.obj2scaled(new Vec2(bb.p0.x, bb.p0.y));
		var p1 = render.obj2scaled(new Vec2(bb.p1.x, bb.p1.y));
		return render.paper.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y, 0).attr(attrs);
	} else {
		// TODO abnormal situation, empty fragments must be destroyed by tools
	}
};

rnd.ReFrag.prototype.draw = function (render) {
	return null;//this._draw(render, fid, { 'stroke' : 'lightgray' }); // [RB] for debugging only
};

rnd.ReFrag.prototype.drawHighlight = function (render) {
	// Do nothing. This method shouldn't actually be called.
}

rnd.ReFrag.prototype.setHighlight = function (highLight, render) {
	var fid = render.ctab.frags.keyOf(this);
	if (!Object.isUndefined(fid)) {
		render.ctab.atoms.each(function (aid, atom) {
			if (atom.a.fragment == fid) {
				atom.setHighlight(highLight, render);
			}
		}, this);
		render.ctab.bonds.each(function (bid, bond) {
			if (render.ctab.atoms.get(bond.b.begin).a.fragment == fid)
				bond.setHighlight(highLight, render);
		}, this);
	} else {
		// TODO abnormal situation, fragment does not belong to the render
	}
};

rnd.ReRGroup = function (/*Struct.RGroup*/rgroup) {
	this.init(Visel.TYPE.RGROUP);

	this.labelBox = null;
	this.item = rgroup;
};
rnd.ReRGroup.prototype = new rnd.ReObject();
rnd.ReRGroup.isSelectable = function () { return false; }

rnd.ReRGroup.prototype.getAtoms = function (render) {
	var ret = [];
	this.item.frags.each(function (fnum, fid) {
		ret = ret.concat(render.ctab.frags.get(fid).fragGetAtoms(render, fid));
	});
	return ret;
};

rnd.ReRGroup.prototype.getBonds = function (render) {
	var ret = [];
	this.item.frags.each(function (fnum, fid) {
		ret = ret.concat(render.ctab.frags.get(fid).fragGetBonds(render, fid));
	});
	return ret;
};

rnd.ReRGroup.prototype.calcBBox = function (render) {
	var ret;
	this.item.frags.each(function (fnum, fid) {
		var bbf = render.ctab.frags.get(fid).calcBBox(render, fid);
		if (bbf) {
			ret = (ret ? Box2Abs.union(ret, bbf) : bbf);
		}
	});
	ret = ret.extend(this.__ext, this.__ext);
	return ret;
};

rnd.ReRGroup.drawBrackets = function (set, render, bb, d, n) {
	d = d || new Vec2(1, 0);
	var bracketWidth = Math.min(0.25, bb.sz().x * 0.3);
	var height = bb.p1.y - bb.p0.y;
	var cy = 0.5 * (bb.p1.y + bb.p0.y);
	var leftBracket = SGroup.drawBracket(render, render.paper, render.styles, d.negated(), d.negated().rotateSC(1, 0), new Vec2(bb.p0.x, cy), bracketWidth, height);
	var rightBracket = SGroup.drawBracket(render, render.paper, render.styles, d, d.rotateSC(1, 0), new Vec2(bb.p1.x, cy), bracketWidth, height);
	set.push(leftBracket, rightBracket);
};

rnd.ReRGroup.prototype.draw = function (render) { // TODO need to review parameter list
	var bb = this.calcBBox(render);
	var settings = render.settings;
	if (bb) {
		var ret = { 'data': [] };
		var p0 = render.obj2scaled(bb.p0);
		var p1 = render.obj2scaled(bb.p1);
		var brackets = render.paper.set();
		rnd.ReRGroup.drawBrackets(brackets, render, bb);
		ret.data.push(brackets);
		var key = render.ctab.rgroups.keyOf(this);
		var labelSet = render.paper.set();
		var label = render.paper.text(p0.x, (p0.y + p1.y) / 2, 'R' + key + '=')
		.attr({
			'font': settings.font,
			'font-size': settings.fontRLabel,
			'fill': 'black'
		});
		var labelBox = util.relBox(label.getBBox());
		label.translateAbs(-labelBox.width / 2 - settings.lineWidth, 0);
		labelSet.push(label);
		var logicStyle = {
			'font': settings.font,
			'font-size': settings.fontRLogic,
			'fill': 'black'
		};

		var logic = [];
		// TODO [RB] temporary solution, need to review
		//BEGIN
		/*
         if (this.item.range.length > 0)
         logic.push(this.item.range);
         if (this.item.resth)
         logic.push("RestH");
         if (this.item.ifthen > 0)
         logic.push("IF R" + key.toString() + " THEN R" + this.item.ifthen.toString());
         */
		logic.push(
			(this.item.ifthen > 0 ? 'IF ' : '')
			 + 'R' + key.toString()
			 + (this.item.range.length > 0
			 ? this.item.range.startsWith('>') || this.item.range.startsWith('<') || this.item.range.startsWith('=')
				 ? this.item.range
				 : '=' + this.item.range
			 : '>0')
			 + (this.item.resth ? ' (RestH)' : '')
			 + (this.item.ifthen > 0 ? '\nTHEN R' + this.item.ifthen.toString() : '')
		);
		//END
		var shift = labelBox.height / 2 + settings.lineWidth / 2;
		for (var i = 0; i < logic.length; ++i) {
			var logicPath = render.paper.text(p0.x, (p0.y + p1.y) / 2, logic[i]).attr(logicStyle);
			var logicBox = util.relBox(logicPath.getBBox());
			shift += logicBox.height / 2;
			logicPath.translateAbs(-logicBox.width / 2 - 6 * settings.lineWidth, shift);
			shift += logicBox.height / 2 + settings.lineWidth / 2;
			ret.data.push(logicPath);
			labelSet.push(logicPath);
		}
		ret.data.push(label);
		this.labelBox = Box2Abs.fromRelBox(labelSet.getBBox()).transform(render.scaled2obj, render);
		return ret;
	} else {
		// TODO abnormal situation, empty fragments must be destroyed by tools
		return {};
	}
};

rnd.ReRGroup.prototype._draw = function (render, rgid, attrs) { // TODO need to review parameter list
	var bb = this.getVBoxObj(render).extend(this.__ext, this.__ext);
	if (bb) {
		var p0 = render.obj2scaled(bb.p0);
		var p1 = render.obj2scaled(bb.p1);
		return render.paper.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y, 0).attr(attrs);
	}
};

rnd.ReRGroup.prototype.drawHighlight = function (render) {
	var rgid = render.ctab.rgroups.keyOf(this);
	if (!Object.isUndefined(rgid)) {
		var ret = this._draw(render, rgid, render.styles.highlightStyle/*{ 'fill' : 'red' }*/);
		render.ctab.addReObjectPath('highlighting', this.visel, ret);
		/*
         this.getAtoms(render).each(function(aid) {
         render.ctab.atoms.get(aid).drawHighlight(render);
         }, this);
         */
		this.item.frags.each(function (fnum, fid) {
			render.ctab.frags.get(fid).drawHighlight(render);
		}, this);
		return ret;
	} else {
		// TODO abnormal situation, fragment does not belong to the render
	}
};

rnd.ReSGroup = function (sgroup) {
	this.init(Visel.TYPE.SGROUP);

	this.item = sgroup;
};
rnd.ReSGroup.prototype = new rnd.ReObject();
rnd.ReSGroup.isSelectable = function () { return false; }

rnd.ReSGroup.prototype.draw = function (render) { // TODO need to review parameter list
	return this.item.draw(render.ctab);
};

rnd.ReSGroup.prototype.drawHighlight = function (render) {
	var styles = render.styles;
	var settings = render.settings;
	var paper = render.paper;
	var sg = this.item;
	var bb = sg.bracketBox.transform(render.obj2scaled, render);
	var lw = settings.lineWidth;
	var vext = new Vec2(lw * 4, lw * 6);
	bb = bb.extend(vext, vext);
	var d = sg.bracketDir, n = d.rotateSC(1,0);
	var a0 = Vec2.lc2(d, bb.p0.x, n, bb.p0.y);
	var a1 = Vec2.lc2(d, bb.p0.x, n, bb.p1.y);
	var b0 = Vec2.lc2(d, bb.p1.x, n, bb.p0.y);
	var b1 = Vec2.lc2(d, bb.p1.x, n, bb.p1.y);

	var set = paper.set();
	sg.highlighting = paper
	.path('M{0},{1}L{2},{3}L{4},{5}L{6},{7}L{0},{1}', tfx(a0.x), tfx(a0.y), tfx(a1.x), tfx(a1.y), tfx(b1.x), tfx(b1.y), tfx(b0.x), tfx(b0.y))
	.attr(styles.highlightStyle);
	set.push(sg.highlighting);

	SGroup.getAtoms(render.ctab.molecule, sg).each(function (aid) {
		set.push(render.ctab.atoms.get(aid).makeHighlightPlate(render));
	}, this);
	SGroup.getBonds(render.ctab.molecule, sg).each(function (bid) {
		set.push(render.ctab.bonds.get(bid).makeHighlightPlate(render));
	}, this);
	render.ctab.addReObjectPath('highlighting', this.visel, set);
};

rnd.ReDataSGroupData = function (sgroup)
{
	this.init(Visel.TYPE.SGROUP_DATA);

	this.sgroup = sgroup;
};

rnd.ReDataSGroupData.prototype = new rnd.ReObject();
rnd.ReDataSGroupData.isSelectable = function () { return true; }

rnd.ReDataSGroupData.prototype.highlightPath = function (render) {
	var box = this.sgroup.dataArea;
	var p0 = render.obj2scaled(box.p0);
	var sz = render.obj2scaled(box.p1).sub(p0);
	return render.paper.rect(p0.x, p0.y, sz.x, sz.y);
};

rnd.ReDataSGroupData.prototype.drawHighlight = function (render) {
	var ret = this.highlightPath(render).attr(render.styles.highlightStyle);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

rnd.ReDataSGroupData.prototype.makeSelectionPlate = function (restruct, paper, styles) { // TODO [MK] review parameters
	return this.highlightPath(restruct.render).attr(styles.selectionStyle);
};

rnd.ReChiralFlag = function (pos)
{
	this.init(Visel.TYPE.CHIRAL_FLAG);

	this.pp = pos;
};
rnd.ReChiralFlag.prototype = new rnd.ReObject();
rnd.ReChiralFlag.isSelectable = function () { return true; }

rnd.ReChiralFlag.prototype.highlightPath = function (render) {
	var box = Box2Abs.fromRelBox(this.path.getBBox());
	var sz = box.p1.sub(box.p0);
	var p0 = box.p0.sub(render.offset);
	return render.paper.rect(p0.x, p0.y, sz.x, sz.y);
};

rnd.ReChiralFlag.prototype.drawHighlight = function (render) {
	var ret = this.highlightPath(render).attr(render.styles.highlightStyle);
	render.ctab.addReObjectPath('highlighting', this.visel, ret);
	return ret;
};

rnd.ReChiralFlag.prototype.makeSelectionPlate = function (restruct, paper, styles) {
	return this.highlightPath(restruct.render).attr(styles.selectionStyle);
};

rnd.ReChiralFlag.prototype.draw = function (render) {
	var paper = render.paper;
	var settings = render.settings;
	var ps = render.ps(this.pp);
	this.path = paper.text(ps.x, ps.y, 'Chiral')
	.attr({
		'font': settings.font,
		'font-size': settings.fontsz,
		'fill': '#000'
	});
	render.ctab.addReObjectPath('data', this.visel, this.path, null, true);
};

rnd.ReStruct.maps = {
	'atoms':       ReAtom,
	'bonds':       ReBond,
	'rxnPluses':   rnd.ReRxnPlus,
	'rxnArrows':   rnd.ReRxnArrow,
	'frags':       rnd.ReFrag,
	'rgroups':     rnd.ReRGroup,
	'sgroupData':  rnd.ReDataSGroupData,
	'chiralFlags': rnd.ReChiralFlag,
	'sgroups':     rnd.ReSGroup,
	'reloops':     rnd.ReLoop
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/bond":9,"../chem/element":12,"../chem/sgroup":15,"../chem/struct":18,"../util":40,"../util/box2abs":39,"../util/map":41,"../util/pool":42,"../util/set":43,"../util/vec2":44,"./visel":26}],25:[function(require,module,exports){
(function (global){
var Box2Abs = require('../util/box2abs');
var Vec2 = require('../util/vec2');
var util = require('../util');
var element = require('../chem/element');
var Bond = require('../chem/bond');

require('./restruct');
var rnd = global.rnd = global.rnd || {}; // jshint ignore:line
var tfx = util.tfx;

rnd.ReStruct.prototype.drawArrow = function (a, b)
{
	var width = 5, length = 7;
	var paper = this.render.paper;
	var styles = this.render.styles;
	return paper.path('M{0},{1}L{2},{3}L{4},{5}M{2},{3}L{4},{6}', tfx(a.x), tfx(a.y), tfx(b.x), tfx(b.y), tfx(b.x - length), tfx(b.y - width), tfx(b.y + width))
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawPlus = function (c)
{
	var s = this.render.scale / 5;
	var paper = this.render.paper;
	var styles = this.render.styles;
	return paper.path('M{0},{4}L{0},{5}M{2},{1}L{3},{1}', tfx(c.x), tfx(c.y), tfx(c.x - s), tfx(c.x + s), tfx(c.y - s), tfx(c.y + s))
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawBondSingle = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p;
	var paper = this.render.paper;
	var styles = this.render.styles;
	return paper.path(rnd.ReStruct.makeStroke(a, b))
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawBondSingleUp = function (hb1, hb2, bond)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var bsp = 0.7 * settings.bondSpace;
	var b2 = b.addScaled(n, bsp);
	var b3 = b.addScaled(n, -bsp);
	if (bond.neihbid2 >= 0) { // if the end is shared with another up-bond heading this way
		var coords = this.stereoUpBondGetCoordinates(hb2, bond.neihbid2);
		b2 = coords[0];
		b3 = coords[1];
	}
	return paper.path('M{0},{1}L{2},{3}L{4},{5}Z',
	tfx(a.x), tfx(a.y), tfx(b2.x), tfx(b2.y), tfx(b3.x), tfx(b3.y))
	.attr(styles.lineattr).attr({
		'fill':'#000'
	});
};

rnd.ReStruct.prototype.drawVec = function (a, dir, color, len) {
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var bsp = settings.bondSpace;
	var b = a.addScaled(dir, len || 3 * bsp);
	return paper.path('M{0},{1}L{2},{3}',
	tfx(a.x), tfx(a.y), tfx(b.x), tfx(b.y))
	.attr(styles.lineattr).attr({
		'stroke':(color || '#0F0')
	});
};

rnd.ReStruct.prototype.stereoUpBondGetCoordinates = function (hb, neihbid)
{
	var bsp = this.render.settings.bondSpace;
	var neihb = this.molecule.halfBonds.get(neihbid);
	var cos = Vec2.dot(hb.dir, neihb.dir);
	var sin = Vec2.cross(hb.dir, neihb.dir);
	var cosHalf = Math.sqrt(0.5 * (1 - cos));
	var biss = neihb.dir.rotateSC((sin >= 0 ? -1 : 1) * cosHalf, Math.sqrt(0.5 * (1 + cos)));

	var denom_add = 0.3;
	var scale = 0.7;
	var a1 = hb.p.addScaled(biss, scale * bsp / (cosHalf + denom_add));
	var a2 = hb.p.addScaled(biss.negated(), scale * bsp / (cosHalf + denom_add));
	return sin > 0 ? [a1, a2] : [a2, a1];
};

rnd.ReStruct.prototype.drawBondSingleStereoBold = function (hb1, hb2, bond, isDouble)
{
	var paper = this.render.paper;
	var settings = this.render.settings;
	var styles = this.render.styles;
	var coords1 = this.stereoUpBondGetCoordinates(hb1, bond.neihbid1);
	var coords2 = this.stereoUpBondGetCoordinates(hb2, bond.neihbid2);
	var a1 = coords1[0];
	var a2 = coords1[1];
	var a3 = coords2[0];
	var a4 = coords2[1];
	var pathMain = paper.path('M{0},{1}L{2},{3}L{4},{5}L{6},{7}Z',
	tfx(a1.x), tfx(a1.y), tfx(a2.x), tfx(a2.y), tfx(a3.x), tfx(a3.y), tfx(a4.x), tfx(a4.y))
	.attr(styles.lineattr).attr({
		'stroke': '#000',
		'fill': '#000'
	});
	if (isDouble) {
		var a = hb1.p, b = hb2.p, n = hb1.norm, shift = bond.doubleBondShift;
		var bsp = 1.5 * settings.bondSpace;
		var b1 = a.addScaled(n, bsp * shift);
		var b2 = b.addScaled(n, bsp * shift);
		var shiftA = !this.atoms.get(hb1.begin).showLabel;
		var shiftB = !this.atoms.get(hb2.begin).showLabel;
		if (shift > 0) {
			if (shiftA)
				b1 = b1.addScaled(hb1.dir, bsp * this.getBondLineShift(hb1.rightCos, hb1.rightSin));
			if (shiftB)
				b2 = b2.addScaled(hb1.dir, -bsp * this.getBondLineShift(hb2.leftCos, hb2.leftSin));
		} else if (shift < 0) {
			if (shiftA)
				b1 = b1.addScaled(hb1.dir, bsp * this.getBondLineShift(hb1.leftCos, hb1.leftSin));
			if (shiftB)
				b2 = b2.addScaled(hb1.dir, -bsp * this.getBondLineShift(hb2.rightCos, hb2.rightSin));
		}

		return paper.set([pathMain, paper.path(
				'M{0},{1}L{2},{3}', tfx(b1.x), tfx(b1.y), tfx(b2.x), tfx(b2.y))
			.attr(styles.lineattr)]);
	}
	return pathMain;
};

rnd.ReStruct.prototype.drawBondSingleDown = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var bsp = 0.7 * settings.bondSpace;
	var d = b.sub(a);
	var len = d.length() + 0.2;
	d = d.normalized();
	var interval = 1.2 * settings.lineWidth;
	var nlines = Math.max(Math.floor((len - settings.lineWidth) /
	(settings.lineWidth + interval)),0) + 2;
	var step = len / (nlines - 1);

	var path = '', p, q, r = a;
	for (var i = 0; i < nlines; ++i) {
		r = a.addScaled(d, step * i);
		p = r.addScaled(n, bsp * (i + 0.5) / (nlines - 0.5));
		q = r.addScaled(n, -bsp * (i + 0.5) / (nlines - 0.5));
		path += rnd.ReStruct.makeStroke(p, q);
	}
	return paper.path(path)
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawBondSingleEither = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var bsp = 0.7 * settings.bondSpace;
	var d = b.sub(a);
	var len = d.length();
	d = d.normalized();
	var interval = 0.6 * settings.lineWidth;
	var nlines = Math.max(Math.floor((len - settings.lineWidth) /
	(settings.lineWidth + interval)),0) + 2;
	var step = len / (nlines - 0.5);

	var path = 'M' + tfx(a.x) + ',' + tfx(a.y), r = a;
	for (var i = 0; i < nlines; ++i) {
		r = a.addScaled(d, step * (i + 0.5)).addScaled(n,
			((i & 1) ? -1 : +1) * bsp * (i + 0.5) / (nlines - 0.5));
		path += 'L' + tfx(r.x) + ',' + tfx(r.y);
	}
	return paper.path(path)
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.getBondLineShift = function (cos, sin)
{
	if (sin < 0 || Math.abs(cos) > 0.9)
		return 0;
	return sin / (1 - cos);
};

rnd.ReStruct.prototype.drawBondDouble = function (hb1, hb2, bond, cis_trans)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm, shift = cis_trans ? 0 : bond.doubleBondShift;
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var bsp = settings.bondSpace / 2;
	var s1 = bsp, s2 = -bsp;
	s1 += shift * bsp;
	s2 += shift * bsp;
	var a2 = a.addScaled(n, s1);
	var b2 = b.addScaled(n, s1);
	var a3 = a.addScaled(n, s2);
	var b3 = b.addScaled(n, s2);

	var shiftA = !this.atoms.get(hb1.begin).showLabel;
	var shiftB = !this.atoms.get(hb2.begin).showLabel;
	if (shift > 0) {
		if (shiftA)
			a2 = a2.addScaled(hb1.dir, settings.bondSpace *
			this.getBondLineShift(hb1.rightCos, hb1.rightSin));
		if (shiftB)
			b2 = b2.addScaled(hb1.dir, -settings.bondSpace *
			this.getBondLineShift(hb2.leftCos, hb2.leftSin));
	} else if (shift < 0) {
		if (shiftA)
			a3 = a3.addScaled(hb1.dir, settings.bondSpace *
			this.getBondLineShift(hb1.leftCos, hb1.leftSin));
		if (shiftB)
			b3 = b3.addScaled(hb1.dir, -settings.bondSpace *
			this.getBondLineShift(hb2.rightCos, hb2.rightSin));
	}

	return paper.path(cis_trans ?
			'M{0},{1}L{6},{7}M{4},{5}L{2},{3}' :
			'M{0},{1}L{2},{3}M{4},{5}L{6},{7}',
	tfx(a2.x), tfx(a2.y), tfx(b2.x), tfx(b2.y), tfx(a3.x), tfx(a3.y), tfx(b3.x), tfx(b3.y))
	.attr(styles.lineattr);
};

rnd.ReStruct.makeStroke = function (a, b) {
	return 'M' + tfx(a.x) + ',' + tfx(a.y) +
		'L' + tfx(b.x) + ',' + tfx(b.y) + '	';
};

rnd.ReStruct.prototype.drawBondSingleOrDouble = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var render = this.render;
	var settings = render.settings;
	var paper = render.paper;
	var styles = render.styles;
	var bsp = settings.bondSpace / 2;

	var nSect = (Vec2.dist(a, b) / (settings.bondSpace + settings.lineWidth)).toFixed() - 0;
	if (!(nSect & 1))
		nSect += 1;
	var path = '', pp = a;

	for (var i = 1; i <= nSect; ++i) {
		var pi = Vec2.lc2(a, (nSect - i) / nSect, b, i / nSect);
		if (i & 1) {
			path += rnd.ReStruct.makeStroke(pp, pi);
		} else {
			path += rnd.ReStruct.makeStroke(pp.addScaled(n, bsp), pi.addScaled(n, bsp));
			path += rnd.ReStruct.makeStroke(pp.addScaled(n, -bsp), pi.addScaled(n, -bsp));
		}
		pp = pi;
	}

	return paper.path(path)
	.attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawBondTriple = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var render = this.render;
	var settings = render.settings;
	var paper = render.paper;
	var styles = render.styles;
	var a2 = a.addScaled(n, settings.bondSpace);
	var b2 = b.addScaled(n, settings.bondSpace);
	var a3 = a.addScaled(n, -settings.bondSpace);
	var b3 = b.addScaled(n, -settings.bondSpace);
	return paper.path(rnd.ReStruct.makeStroke(a,b) + rnd.ReStruct.makeStroke(a2,b2) + rnd.ReStruct.makeStroke(a3,b3))
	.attr(styles.lineattr);
};

rnd.dashedPath = function (p0, p1, dash) {
	var t0 = 0;
	var t1 = Vec2.dist(p0, p1);
	var d = Vec2.diff(p1, p0).normalized();
	var black = true;
	var path = '';
	var i = 0;

	while (t0 < t1) {
		var len = dash[i % dash.length];
		var t2 = t0 + Math.min(len, t1 - t0);
		if (black)
			path += 'M ' + p0.addScaled(d, t0).coordStr() + ' L ' + p0.addScaled(d, t2).coordStr();
		t0 += len;
		black = !black;
		i++;
	}
	return path;
}

rnd.ReStruct.prototype.drawBondAromatic = function (hb1, hb2, bond, drawDashLine)
{
	if (!drawDashLine) {
		return this.drawBondSingle(hb1, hb2);
	}
	var shift = bond.doubleBondShift;
	var paper = this.render.paper;
	var paths = this.preparePathsForAromaticBond(hb1, hb2, shift);
	var l1 = paths[0], l2 = paths[1];
	(shift > 0 ? l1 : l2).attr({
		'stroke-dasharray':'- '
	});
	return paper.set([l1,l2]);
};

rnd.dashdotPattern = [0.125,0.125,0.005,0.125];

rnd.ReStruct.prototype.drawBondSingleOrAromatic = function (hb1, hb2, bond)
{
	var shift = bond.doubleBondShift;
	var paper = this.render.paper;
	var scale = this.render.settings.scaleFactor;
	var dash = util.map(rnd.dashdotPattern, function (v){ return v * scale; });
	var paths = this.preparePathsForAromaticBond(hb1, hb2, shift, shift > 0 ? 1 : 2, dash);
	var l1 = paths[0], l2 = paths[1];
// dotted line doesn't work in Chrome, render manually instead (see rnd.dashedPath)
//	(shift > 0 ? l1 : l2).attr({
//		'stroke-dasharray':'-.'
//	});
	return paper.set([l1,l2]);
};

rnd.ReStruct.prototype.preparePathsForAromaticBond = function (hb1, hb2, shift, mask, dash)
{
	var settings = this.render.settings;
	var paper = this.render.paper;
	var styles = this.render.styles;
	var a = hb1.p, b = hb2.p, n = hb1.norm;
	var bsp = settings.bondSpace / 2;
	var s1 = bsp, s2 = -bsp;
	s1 += shift * bsp;
	s2 += shift * bsp;
	var a2 = a.addScaled(n, s1);
	var b2 = b.addScaled(n, s1);
	var a3 = a.addScaled(n, s2);
	var b3 = b.addScaled(n, s2);
	var shiftA = !this.atoms.get(hb1.begin).showLabel;
	var shiftB = !this.atoms.get(hb2.begin).showLabel;
	if (shift > 0) {
		if (shiftA)
			a2 = a2.addScaled(hb1.dir, settings.bondSpace *
			this.getBondLineShift(hb1.rightCos, hb1.rightSin));
		if (shiftB)
			b2 = b2.addScaled(hb1.dir, -settings.bondSpace *
			this.getBondLineShift(hb2.leftCos, hb2.leftSin));
	} else if (shift < 0) {
		if (shiftA)
			a3 = a3.addScaled(hb1.dir, settings.bondSpace *
			this.getBondLineShift(hb1.leftCos, hb1.leftSin));
		if (shiftB)
			b3 = b3.addScaled(hb1.dir, -settings.bondSpace *
			this.getBondLineShift(hb2.rightCos, hb2.rightSin));
	}
	var l1 = paper.path(dash && (mask & 1) ? rnd.dashedPath(a2, b2, dash) : rnd.ReStruct.makeStroke(a2, b2)).attr(styles.lineattr);
	var l2 = paper.path(dash && (mask & 2) ? rnd.dashedPath(a3, b3, dash) : rnd.ReStruct.makeStroke(a3, b3)).attr(styles.lineattr);
	return [l1, l2];
};


rnd.ReStruct.prototype.drawBondDoubleOrAromatic = function (hb1, hb2, bond)
{
	var shift = bond.doubleBondShift;
	var paper = this.render.paper;
	var scale = this.render.settings.scaleFactor;
	var dash = util.map(rnd.dashdotPattern, function (v){ return v * scale; });
	var paths = this.preparePathsForAromaticBond(hb1, hb2, shift, 3, dash);
	var l1 = paths[0], l2 = paths[1];
// dotted line doesn't work in Chrome, render manually instead (see rnd.dashedPath)
//	l1.attr({'stroke-dasharray':'-.'});
//	l2.attr({'stroke-dasharray':'-.'});
	return paper.set([l1,l2]);
};

rnd.ReStruct.prototype.drawBondAny = function (hb1, hb2)
{
	var a = hb1.p, b = hb2.p;
	var paper = this.render.paper;
	var styles = this.render.styles;
	return paper.path(rnd.ReStruct.makeStroke(a,b))
	.attr(styles.lineattr).attr({
		'stroke-dasharray':'- '
	});
};

rnd.ReStruct.prototype.drawReactingCenter = function (bond, hb1, hb2)
{
	var a = hb1.p, b = hb2.p;
	var c = b.add(a).scaled(0.5);
	var d = b.sub(a).normalized();
	var n = d.rotateSC(1, 0);

	var paper = this.render.paper;
	var styles = this.render.styles;
	var settings = this.render.settings;

	var p = [];

	var lw = settings.lineWidth, bs = settings.bondSpace / 2;
	var alongIntRc = lw, // half interval along for CENTER
	alongIntMadeBroken = 2 * lw, // half interval between along for MADE_OR_BROKEN
	alongSz = 1.5 * bs, // half size along for CENTER
	acrossInt = 1.5 * bs, // half interval across for CENTER
	acrossSz = 3.0 * bs, // half size across for all
	tiltTan = 0.2; // tangent of the tilt angle

	switch (bond.b.reactingCenterStatus)
		{
		case Bond.PATTERN.REACTING_CENTER.NOT_CENTER: // X
			p.push(c.addScaled(n, acrossSz).addScaled(d, tiltTan * acrossSz));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, -tiltTan * acrossSz));
			p.push(c.addScaled(n, acrossSz).addScaled(d, -tiltTan * acrossSz));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, tiltTan * acrossSz));
			break;
		case Bond.PATTERN.REACTING_CENTER.CENTER:  // #
			p.push(c.addScaled(n, acrossSz).addScaled(d, tiltTan * acrossSz).addScaled(d, alongIntRc));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, -tiltTan * acrossSz).addScaled(d, alongIntRc));
			p.push(c.addScaled(n, acrossSz).addScaled(d, tiltTan * acrossSz).addScaled(d, -alongIntRc));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, -tiltTan * acrossSz).addScaled(d, -alongIntRc));
			p.push(c.addScaled(d, alongSz).addScaled(n, acrossInt));
			p.push(c.addScaled(d, -alongSz).addScaled(n, acrossInt));
			p.push(c.addScaled(d, alongSz).addScaled(n, -acrossInt));
			p.push(c.addScaled(d, -alongSz).addScaled(n, -acrossInt));
			break;
//	case Bond.PATTERN.REACTING_CENTER.UNCHANGED:  // o
//		//draw a circle
//		break;
		case Bond.PATTERN.REACTING_CENTER.MADE_OR_BROKEN:
			p.push(c.addScaled(n, acrossSz).addScaled(d, alongIntMadeBroken));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, alongIntMadeBroken));
			p.push(c.addScaled(n, acrossSz).addScaled(d, -alongIntMadeBroken));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, -alongIntMadeBroken));
			break;
		case Bond.PATTERN.REACTING_CENTER.ORDER_CHANGED:
			p.push(c.addScaled(n, acrossSz));
			p.push(c.addScaled(n, -acrossSz));
			break;
		case Bond.PATTERN.REACTING_CENTER.MADE_OR_BROKEN_AND_CHANGED:
			p.push(c.addScaled(n, acrossSz).addScaled(d, alongIntMadeBroken));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, alongIntMadeBroken));
			p.push(c.addScaled(n, acrossSz).addScaled(d, -alongIntMadeBroken));
			p.push(c.addScaled(n, -acrossSz).addScaled(d, -alongIntMadeBroken));
			p.push(c.addScaled(n, acrossSz));
			p.push(c.addScaled(n, -acrossSz));
			break;
		default:
			return null;
	}

	var pathdesc = '';
	for (var i = 0; i < p.length / 2; ++i)
		pathdesc += rnd.ReStruct.makeStroke(p[2 * i], p[2 * i + 1]);
	return paper.path(pathdesc).attr(styles.lineattr);
};

rnd.ReStruct.prototype.drawTopologyMark = function (bond, hb1, hb2)
{
	var topologyMark = null;

	if (bond.b.topology == Bond.PATTERN.TOPOLOGY.RING)
		topologyMark = 'rng';
	else if (bond.b.topology == Bond.PATTERN.TOPOLOGY.CHAIN)
		topologyMark = 'chn';
	else
		return null;

	var paper = this.render.paper;
	var settings = this.render.settings;

	var a = hb1.p, b = hb2.p;
	var c = b.add(a).scaled(0.5);
	var d = b.sub(a).normalized();
	var n = d.rotateSC(1, 0);
	var fixed = settings.lineWidth;
	if (bond.doubleBondShift > 0)
		n = n.scaled(-bond.doubleBondShift);
	else if (bond.doubleBondShift == 0)
		fixed += settings.bondSpace / 2;

	var s = new Vec2(2, 1).scaled(settings.bondSpace);
	if (bond.b.type == Bond.PATTERN.TYPE.TRIPLE)
		fixed += settings.bondSpace;
	var p = c.add(new Vec2(n.x * (s.x + fixed), n.y * (s.y + fixed)));
	var path = paper.text(p.x, p.y, topologyMark)
	.attr({
		'font': settings.font,
		'font-size': settings.fontszsub,
		'fill': '#000'
	});
	var rbb = util.relBox(path.getBBox());
	this.centerText(path, rbb);
	return path;
};

rnd.ReStruct.prototype.drawBond = function (bond, hb1, hb2)
{
	var path = null;
	var molecule = this.molecule;
	switch (bond.b.type)
		{
		case Bond.PATTERN.TYPE.SINGLE:
			switch (bond.b.stereo) {
				case Bond.PATTERN.STEREO.UP:
					this.findIncomingUpBonds(hb1.bid, bond);
					if (bond.boldStereo && bond.neihbid1 >= 0 && bond.neihbid2 >= 0)
						path = this.drawBondSingleStereoBold(hb1, hb2, bond);
					else
						path = this.drawBondSingleUp(hb1, hb2, bond);
					break;
				case Bond.PATTERN.STEREO.DOWN:
					path = this.drawBondSingleDown(hb1, hb2, bond);
					break;
				case Bond.PATTERN.STEREO.EITHER:
					path = this.drawBondSingleEither(hb1, hb2, bond);
					break;
				default:
					path = this.drawBondSingle(hb1, hb2);
					break;
			}
			break;
		case Bond.PATTERN.TYPE.DOUBLE:
			this.findIncomingUpBonds(hb1.bid, bond);
			if (bond.b.stereo === Bond.PATTERN.STEREO.NONE && bond.boldStereo
				 && bond.neihbid1 >= 0 && bond.neihbid2 >= 0)
				path = this.drawBondSingleStereoBold(hb1, hb2, bond, true);
			else
				path = this.drawBondDouble(hb1, hb2, bond,
				bond.b.stereo === Bond.PATTERN.STEREO.CIS_TRANS);
			break;
		case Bond.PATTERN.TYPE.TRIPLE:
			path = this.drawBondTriple(hb1, hb2, bond);
			break;
		case Bond.PATTERN.TYPE.AROMATIC:
			var inAromaticLoop = (hb1.loop >= 0 && molecule.loops.get(hb1.loop).aromatic) ||
			(hb2.loop >= 0 && molecule.loops.get(hb2.loop).aromatic);
			path = this.drawBondAromatic(hb1, hb2, bond, !inAromaticLoop);
			break;
		case Bond.PATTERN.TYPE.SINGLE_OR_DOUBLE:
			path = this.drawBondSingleOrDouble(hb1, hb2, bond);
			break;
		case Bond.PATTERN.TYPE.SINGLE_OR_AROMATIC:
			path = this.drawBondSingleOrAromatic(hb1, hb2, bond);
			break;
		case Bond.PATTERN.TYPE.DOUBLE_OR_AROMATIC:
			path = this.drawBondDoubleOrAromatic(hb1, hb2, bond);
			break;
		case Bond.PATTERN.TYPE.ANY:
			path = this.drawBondAny(hb1, hb2, bond);
			break;
		default:
			throw new Error('Bond type ' + bond.b.type + ' not supported');
	}
	return path;
};

rnd.ReStruct.prototype.radicalCap = function (p)
{
	var settings = this.render.settings;
	var paper = this.render.paper;
	var s = settings.lineWidth * 0.9;
	var dw = s, dh = 2 * s;
	return paper.path('M{0},{1}L{2},{3}L{4},{5}',
	tfx(p.x - dw), tfx(p.y + dh), tfx(p.x), tfx(p.y), tfx(p.x + dw), tfx(p.y + dh))
	.attr({
		'stroke': '#000',
		'stroke-width': settings.lineWidth * 0.7,
		'stroke-linecap': 'square',
		'stroke-linejoin': 'miter'
	});
};

rnd.ReStruct.prototype.radicalBullet = function (p)
{
	var settings = this.render.settings;
	var paper = this.render.paper;
	return paper.circle(p.x, p.y, settings.lineWidth)
	.attr({
		stroke: null,
		fill: '#000'
	});
};

rnd.ReStruct.prototype.centerText = function (path, rbb)
{
	// TODO: find a better way
	if (this.render.paper.raphael.vml) {
		this.pathAndRBoxTranslate(path, rbb, 0, rbb.height * 0.16); // dirty hack
	}
};

rnd.ReStruct.prototype.showItemSelection = function (id, item, visible)
{
	var exists = (item.selectionPlate != null) && !item.selectionPlate.removed;
	// rbalabanov: here is temporary fix for "drag issue" on iPad
	//BEGIN
	exists = exists && (!('hiddenPaths' in rnd.ReStruct.prototype) || rnd.ReStruct.prototype.hiddenPaths.indexOf(item.selectionPlate) < 0);
	//END
	if (visible) {
		if (!exists) {
			var render = this.render;
			var styles = render.styles;
			var paper = render.paper;
			item.selectionPlate = item.makeSelectionPlate(this, paper, styles);
			this.addReObjectPath('selection-plate', item.visel, item.selectionPlate);
		}
		if (item.selectionPlate) item.selectionPlate.show(); // TODO [RB] review
	} else {
		if (exists)
		if (item.selectionPlate) item.selectionPlate.hide(); // TODO [RB] review
	}
};

rnd.ReStruct.prototype.pathAndRBoxTranslate = function (path, rbb, x, y)
{
	path.translateAbs(x, y);
	rbb.x += x;
	rbb.y += y;
};

var markerColors = ['black', 'cyan', 'magenta', 'red', 'green', 'blue', 'green'];

rnd.ReStruct.prototype.showLabels = function ()
{
	var render = this.render;
	var settings = render.settings;
	var styles = render.styles;
	var opt = render.opt;
	var paper = render.paper;
	var delta = 0.5 * settings.lineWidth;
	for (var aid in this.atomsChanged) {
		var atom = this.atoms.get(aid);

		var ps = render.ps(atom.a.pp);
		var index = null;
		if (opt.showAtomIds) {
			index = {};
			index.text = aid.toString();
			index.path = paper.text(ps.x, ps.y, index.text)
			.attr({
				'font': settings.font,
				'font-size': settings.fontszsub,
				'fill': '#070'
			});
			index.rbb = util.relBox(index.path.getBBox());
			this.centerText(index.path, index.rbb);
			this.addReObjectPath('indices', atom.visel, index.path, ps);
		}
		atom.setHighlight(atom.highlight, render);

		var color = '#000000';
		if (atom.showLabel)
		{
			var rightMargin = 0, leftMargin = 0;
			// label
			var label = {};
			if (atom.a.atomList != null) {
				label.text = atom.a.atomList.label();
			} else if (atom.a.label == 'R#' && atom.a.rglabel != null) {
				label.text = '';
				for (var rgi = 0; rgi < 32; rgi++) {
					if (atom.a.rglabel & (1 << rgi)) label.text += ('R' + (rgi + 1).toString());
				}
				if (label.text == '') label = 'R#'; // for structures that missed 'M  RGP' tag in molfile
			} else {
				label.text = atom.a.label;
				if (opt.atomColoring) {
					var elem = element.getElementByLabel(label.text);
					if (elem)
						color = element.get(elem).color;
				}
			}
			label.path = paper.text(ps.x, ps.y, label.text)
			.attr({
				'font': settings.font,
				'font-size': settings.fontsz,
				'fill': color
			});
			label.rbb = util.relBox(label.path.getBBox());
			this.centerText(label.path, label.rbb);
			if (atom.a.atomList != null)
				this.pathAndRBoxTranslate(label.path, label.rbb, (atom.hydrogenOnTheLeft ? -1 : 1) * (label.rbb.width - label.rbb.height) / 2, 0);
			this.addReObjectPath('data', atom.visel, label.path, ps, true);
			rightMargin = label.rbb.width / 2;
			leftMargin = -label.rbb.width / 2;
			var implh = Math.floor(atom.a.implicitH);
			var isHydrogen = label.text == 'H';
			var hydrogen = {}, hydroIndex = null;
			var hydrogenLeft = atom.hydrogenOnTheLeft;
			if (isHydrogen && implh > 0) {
				hydroIndex = {};
				hydroIndex.text = (implh + 1).toString();
				hydroIndex.path =
				paper.text(ps.x, ps.y, hydroIndex.text)
				.attr({
					'font': settings.font,
					'font-size': settings.fontszsub,
					'fill': color
				});
				hydroIndex.rbb = util.relBox(hydroIndex.path.getBBox());
				this.centerText(hydroIndex.path, hydroIndex.rbb);
				this.pathAndRBoxTranslate(hydroIndex.path, hydroIndex.rbb,
					rightMargin + 0.5 * hydroIndex.rbb.width + delta,
					0.2 * label.rbb.height);
				rightMargin += hydroIndex.rbb.width + delta;
				this.addReObjectPath('data',atom.visel, hydroIndex.path, ps, true);
			}

			var radical = {};
			if (atom.a.radical != 0)
			{
				var hshift;
				switch (atom.a.radical)
					{
					case 1:
						radical.path = paper.set();
						hshift = 1.6 * settings.lineWidth;
						radical.path.push(
						this.radicalBullet(ps.add(new Vec2(-hshift, 0))),
						this.radicalBullet(ps.add(new Vec2(hshift, 0))));
						radical.path.attr('fill', color);
						break;
					case 2:
						radical.path = this.radicalBullet(ps)
						.attr('fill', color);
						break;
					case 3:
						radical.path = paper.set();
						hshift = 1.6 * settings.lineWidth;
						radical.path.push(
						this.radicalCap(ps.add(new Vec2(-hshift, 0))),
						this.radicalCap(ps.add(new Vec2(hshift, 0))));
						radical.path.attr('stroke', color);
						break;
				}
				radical.rbb = util.relBox(radical.path.getBBox());
				var vshift = -0.5 * (label.rbb.height + radical.rbb.height);
				if (atom.a.radical == 3)
					vshift -= settings.lineWidth / 2;
				this.pathAndRBoxTranslate(radical.path, radical.rbb,
					0, vshift);
				this.addReObjectPath('data', atom.visel, radical.path, ps, true);
			}

			var isotope = {};
			if (atom.a.isotope != 0)
			{
				isotope.text = atom.a.isotope.toString();
				isotope.path = paper.text(ps.x, ps.y, isotope.text)
				.attr({
					'font': settings.font,
					'font-size': settings.fontszsub,
					'fill': color
				});
				isotope.rbb = util.relBox(isotope.path.getBBox());
				this.centerText(isotope.path, isotope.rbb);
				this.pathAndRBoxTranslate(isotope.path, isotope.rbb,
					leftMargin - 0.5 * isotope.rbb.width - delta,
					-0.3 * label.rbb.height);
				leftMargin -= isotope.rbb.width + delta;
				this.addReObjectPath('data', atom.visel, isotope.path, ps, true);
			}
			if (!isHydrogen && implh > 0 && !render.opt.hideImplicitHydrogen)
			{
				hydrogen.text = 'H';
				hydrogen.path = paper.text(ps.x, ps.y, hydrogen.text)
				.attr({
					'font': settings.font,
					'font-size': settings.fontsz,
					'fill': color
				});
				hydrogen.rbb = util.relBox(hydrogen.path.getBBox());
				this.centerText(hydrogen.path, hydrogen.rbb);
				if (!hydrogenLeft) {
					this.pathAndRBoxTranslate(hydrogen.path, hydrogen.rbb,
						rightMargin + 0.5 * hydrogen.rbb.width + delta, 0);
					rightMargin += hydrogen.rbb.width + delta;
				}
				if (implh > 1) {
					hydroIndex = {};
					hydroIndex.text = implh.toString();
					hydroIndex.path =
					paper.text(ps.x, ps.y, hydroIndex.text)
					.attr({
						'font': settings.font,
						'font-size': settings.fontszsub,
						'fill': color
					});
					hydroIndex.rbb = util.relBox(hydroIndex.path.getBBox());
					this.centerText(hydroIndex.path, hydroIndex.rbb);
					if (!hydrogenLeft) {
						this.pathAndRBoxTranslate(hydroIndex.path, hydroIndex.rbb,
							rightMargin + 0.5 * hydroIndex.rbb.width + delta,
							0.2 * label.rbb.height);
						rightMargin += hydroIndex.rbb.width + delta;
					}
				}
				if (hydrogenLeft) {
					if (hydroIndex != null) {
						this.pathAndRBoxTranslate(hydroIndex.path, hydroIndex.rbb,
							leftMargin - 0.5 * hydroIndex.rbb.width - delta,
							0.2 * label.rbb.height);
						leftMargin -= hydroIndex.rbb.width + delta;
					}
					this.pathAndRBoxTranslate(hydrogen.path, hydrogen.rbb,
						leftMargin - 0.5 * hydrogen.rbb.width - delta, 0);
					leftMargin -= hydrogen.rbb.width + delta;
				}
				this.addReObjectPath('data', atom.visel, hydrogen.path, ps, true);
				if (hydroIndex != null)
					this.addReObjectPath('data', atom.visel, hydroIndex.path, ps, true);
			}

			var charge = {};
			if (atom.a.charge != 0)
			{
				charge.text = '';
				var absCharge = Math.abs(atom.a.charge);
				if (absCharge != 1)
					charge.text = absCharge.toString();
				if (atom.a.charge < 0)
					charge.text += '\u2013';
				else
					charge.text += '+';

				charge.path = paper.text(ps.x, ps.y, charge.text)
				.attr({
					'font': settings.font,
					'font-size': settings.fontszsub,
					'fill': color
				});
				charge.rbb = util.relBox(charge.path.getBBox());
				this.centerText(charge.path, charge.rbb);
				this.pathAndRBoxTranslate(charge.path, charge.rbb,
					rightMargin + 0.5 * charge.rbb.width + delta,
					-0.3 * label.rbb.height);
				rightMargin += charge.rbb.width + delta;
				this.addReObjectPath('data', atom.visel, charge.path, ps, true);
			}

			var valence = {};
			var mapValence = {
				0: '0',
				1: 'I',
				2: 'II',
				3: 'III',
				4: 'IV',
				5: 'V',
				6: 'VI',
				7: 'VII',
				8: 'VIII',
				9: 'IX',
				10: 'X',
				11: 'XI',
				12: 'XII',
				13: 'XIII',
				14: 'XIV'
			};
			if (atom.a.explicitValence >= 0)
			{
				valence.text = mapValence[atom.a.explicitValence];
				if (!valence.text)
					throw new Error('invalid valence ' + atom.a.explicitValence.toString());
				valence.text = '(' + valence.text + ')';
				valence.path = paper.text(ps.x, ps.y, valence.text)
				.attr({
					'font': settings.font,
					'font-size': settings.fontszsub,
					'fill': color
				});
				valence.rbb = util.relBox(valence.path.getBBox());
				this.centerText(valence.path, valence.rbb);
				this.pathAndRBoxTranslate(valence.path, valence.rbb,
					rightMargin + 0.5 * valence.rbb.width + delta,
					-0.3 * label.rbb.height);
				rightMargin += valence.rbb.width + delta;
				this.addReObjectPath('data', atom.visel, valence.path, ps, true);
			}

			if (atom.a.badConn && opt.showValenceWarnings) {
				var warning = {};
				var y = ps.y + label.rbb.height / 2 + delta;
				warning.path = paper.path('M{0},{1}L{2},{3}',
				tfx(ps.x + leftMargin), tfx(y), tfx(ps.x + rightMargin), tfx(y))
				.attr(this.render.styles.lineattr)
				.attr({
					'stroke':'#F00'
				});
				warning.rbb = util.relBox(warning.path.getBBox());
				this.addReObjectPath('warnings', atom.visel, warning.path, ps, true);
			}
			if (index)
				this.pathAndRBoxTranslate(index.path, index.rbb,
					-0.5 * label.rbb.width - 0.5 * index.rbb.width - delta,
					0.3 * label.rbb.height);
		}

		var lsb = this.bisectLargestSector(atom);

		var asterisk = Prototype.Browser.IE ? '*' : '∗';
		if (atom.a.attpnt) {
			var i, c, j;
			for (i = 0, c = 0; i < 4; ++i) {
				var attpntText = '';
				if (atom.a.attpnt & (1 << i)) {
					if (attpntText.length > 0)
						attpntText += ' ';
					attpntText += asterisk;
					for (j = 0; j < (i == 0 ? 0 : (i + 1)); ++j) {
						attpntText += '\'';
					}
					var pos0 = new Vec2(ps);
					var pos1 = ps.addScaled(lsb, 0.7 * settings.scaleFactor);

					var attpntPath1 = paper.text(pos1.x, pos1.y, attpntText)
					.attr({
						'font': settings.font,
						'font-size': settings.fontsz,
						'fill': color
					});
					var attpntRbb = util.relBox(attpntPath1.getBBox());
					this.centerText(attpntPath1, attpntRbb);

					var lsbn = lsb.negated();
					pos1 = pos1.addScaled(lsbn, Vec2.shiftRayBox(pos1, lsbn, Box2Abs.fromRelBox(attpntRbb)) + settings.lineWidth / 2);
					pos0 = this.shiftBondEnd(atom, pos0, lsb, settings.lineWidth);
					var n = lsb.rotateSC(1, 0);
					var arrowLeft = pos1.addScaled(n, 0.05 * settings.scaleFactor).addScaled(lsbn, 0.09 * settings.scaleFactor);
					var arrowRight = pos1.addScaled(n, -0.05 * settings.scaleFactor).addScaled(lsbn, 0.09 * settings.scaleFactor);
					var attpntPath = paper.set();
					attpntPath.push(
						attpntPath1,
					paper.path('M{0},{1}L{2},{3}M{4},{5}L{2},{3}L{6},{7}', tfx(pos0.x), tfx(pos0.y), tfx(pos1.x), tfx(pos1.y), tfx(arrowLeft.x), tfx(arrowLeft.y), tfx(arrowRight.x), tfx(arrowRight.y))
					.attr(styles.lineattr).attr({'stroke-width': settings.lineWidth / 2})
					);
					this.addReObjectPath('indices', atom.visel, attpntPath, ps);
					lsb = lsb.rotate(Math.PI / 6);
				}
			}
		}

		var aamText = '';
		if (atom.a.aam > 0) {
			aamText += atom.a.aam;
		}
		if (atom.a.invRet > 0) {
			if (aamText.length > 0)
				aamText += ',';
			if (atom.a.invRet == 1)
				aamText += 'Inv';
			else if (atom.a.invRet == 2)
				aamText += 'Ret';
			else
				throw new Error('Invalid value for the invert/retain flag');
		}

		var queryAttrsText = '';
		if (atom.a.ringBondCount != 0) {
			if (atom.a.ringBondCount > 0)
				queryAttrsText += 'rb' + atom.a.ringBondCount.toString();
			else if (atom.a.ringBondCount == -1)
				queryAttrsText += 'rb0';
			else if (atom.a.ringBondCount == -2)
				queryAttrsText += 'rb*';
			else
				throw new Error('Ring bond count invalid');
		}
		if (atom.a.substitutionCount != 0) {
			if (queryAttrsText.length > 0)
				queryAttrsText += ',';

			if (atom.a.substitutionCount > 0)
				queryAttrsText += 's' + atom.a.substitutionCount.toString();
			else if (atom.a.substitutionCount == -1)
				queryAttrsText += 's0';
			else if (atom.a.substitutionCount == -2)
				queryAttrsText += 's*';
			else
				throw new Error('Substitution count invalid');
		}
		if (atom.a.unsaturatedAtom > 0) {
			if (queryAttrsText.length > 0)
				queryAttrsText += ',';

			if (atom.a.unsaturatedAtom == 1)
				queryAttrsText += 'u';
			else
				throw new Error('Unsaturated atom invalid value');
		}
		if (atom.a.hCount > 0) {
			if (queryAttrsText.length > 0)
				queryAttrsText += ',';

			queryAttrsText += 'H' + (atom.a.hCount - 1).toString();
		}


		if (atom.a.exactChangeFlag > 0) {
			if (aamText.length > 0)
				aamText += ',';
			if (atom.a.exactChangeFlag == 1)
				aamText += 'ext';
			else
				throw new Error('Invalid value for the exact change flag');
		}

		// this includes both aam flags, if any, and query features, if any
		// we render them together to avoid possible collisions
		aamText = (queryAttrsText.length > 0 ? queryAttrsText + '\n' : '') + (aamText.length > 0 ? '.' + aamText + '.' : '');
		if (aamText.length > 0) {
			var aamPath = paper.text(ps.x, ps.y, aamText)
			.attr({
				'font': settings.font,
				'font-size': settings.fontszsub,
				'fill': color
			});
			var aamBox = util.relBox(aamPath.getBBox());
			this.centerText(aamPath, aamBox);
			var dir = this.bisectLargestSector(atom);
			var visel = atom.visel;
			var t = 3;
			// estimate the shift to clear the atom label
			for (i = 0; i < visel.exts.length; ++i)
				t = Math.max(t, Vec2.shiftRayBox(ps, dir, visel.exts[i].translate(ps)));
			// estimate the shift backwards to account for the size of the aam/query text box itself
			t += Vec2.shiftRayBox(ps, dir.negated(), Box2Abs.fromRelBox(aamBox))
			dir = dir.scaled(8 + t);
			this.pathAndRBoxTranslate(aamPath, aamBox, dir.x, dir.y);
			this.addReObjectPath('data', atom.visel, aamPath, ps, true);
		}
	}
};

rnd.ReStruct.prototype.shiftBondEnd = function (atom, pos0, dir, margin){
	var t = 0;
	var visel = atom.visel;
	for (var k = 0; k < visel.exts.length; ++k) {
		var box = visel.exts[k].translate(pos0);
		t = Math.max(t, Vec2.shiftRayBox(pos0, dir, box));
	}
	if (t > 0)
		pos0 = pos0.addScaled(dir, t + margin);
	return pos0;
};

rnd.ReStruct.prototype.bisectLargestSector = function (atom)
{
	var angles = [];
	atom.a.neighbors.each( function (hbid) {
		var hb = this.molecule.halfBonds.get(hbid);
		angles.push(hb.ang);
	}, this);
	angles = angles.sort(function (a,b){return a - b;});
	var da = [];
	for (var i = 0; i < angles.length - 1; ++i) {
		da.push(angles[(i + 1) % angles.length] - angles[i]);
	}
	da.push(angles[0] - angles[angles.length - 1] + 2 * Math.PI);
	var daMax = 0;
	var ang = -Math.PI / 2;
	for (i = 0; i < angles.length; ++i) {
		if (da[i] > daMax) {
			daMax = da[i];
			ang = angles[i] + da[i] / 2;
		}
	}
	return new Vec2(Math.cos(ang), Math.sin(ang));
};

rnd.ReStruct.prototype.bondRecalc = function (settings, bond) {

	var render = this.render;
	var atom1 = this.atoms.get(bond.b.begin);
	var atom2 = this.atoms.get(bond.b.end);
	var p1 = render.ps(atom1.a.pp);
	var p2 = render.ps(atom2.a.pp);
	var hb1 = this.molecule.halfBonds.get(bond.b.hb1);
	var hb2 = this.molecule.halfBonds.get(bond.b.hb2);
	hb1.p = this.shiftBondEnd(atom1, p1, hb1.dir, 2 * settings.lineWidth);
	hb2.p = this.shiftBondEnd(atom2, p2, hb2.dir, 2 * settings.lineWidth);
	bond.b.center = Vec2.lc2(atom1.a.pp, 0.5, atom2.a.pp, 0.5);
	bond.b.len = Vec2.dist(p1, p2);
	bond.b.sb = settings.lineWidth * 5;
	bond.b.sa = Math.max(bond.b.sb,  bond.b.len / 2 - settings.lineWidth * 2);
	bond.b.angle = Math.atan2(hb1.dir.y, hb1.dir.x) * 180 / Math.PI;
};

rnd.ReStruct.prototype.showBonds = function ()
{
	var render = this.render;
	var settings = render.settings;
	var paper = render.paper;
	var opt = render.opt;
	for (var bid in this.bondsChanged) {
		var bond = this.bonds.get(bid);
		var hb1 = this.molecule.halfBonds.get(bond.b.hb1),
		hb2 = this.molecule.halfBonds.get(bond.b.hb2);
		this.bondRecalc(settings, bond);
		bond.path = this.drawBond(bond, hb1, hb2);
		bond.rbb = util.relBox(bond.path.getBBox());
		this.addReObjectPath('data', bond.visel, bond.path, null, true);
		var reactingCenter = {};
		reactingCenter.path = this.drawReactingCenter(bond, hb1, hb2);
		if (reactingCenter.path) {
			reactingCenter.rbb = util.relBox(reactingCenter.path.getBBox());
			this.addReObjectPath('data', bond.visel, reactingCenter.path, null, true);
		}
		var topology = {};
		topology.path = this.drawTopologyMark(bond, hb1, hb2);
		if (topology.path) {
			topology.rbb = util.relBox(topology.path.getBBox());
			this.addReObjectPath('data', bond.visel, topology.path, null, true);
		}
		bond.setHighlight(bond.highlight, render);
		var bondIdxOff = settings.subFontSize * 0.6;
		var ipath = null, irbb = null;
		if (opt.showBondIds) {
			var pb = Vec2.lc(hb1.p, 0.5, hb2.p, 0.5, hb1.norm, bondIdxOff);
			ipath = paper.text(pb.x, pb.y, bid.toString());
			irbb = util.relBox(ipath.getBBox());
			this.centerText(ipath, irbb);
			this.addReObjectPath('indices', bond.visel, ipath);
		}
		if (opt.showHalfBondIds) {
			var phb1 = Vec2.lc(hb1.p, 0.8, hb2.p, 0.2, hb1.norm, bondIdxOff);
			ipath = paper.text(phb1.x, phb1.y, bond.b.hb1.toString());
			irbb = util.relBox(ipath.getBBox());
			this.centerText(ipath, irbb);
			this.addReObjectPath('indices', bond.visel, ipath);
			var phb2 = Vec2.lc(hb1.p, 0.2, hb2.p, 0.8, hb2.norm, bondIdxOff);
			ipath = paper.text(phb2.x, phb2.y, bond.b.hb2.toString());
			irbb = util.relBox(ipath.getBBox());
			this.centerText(ipath, irbb);
			this.addReObjectPath('indices', bond.visel, ipath);
		}
		if (opt.showLoopIds && !opt.showBondIds) {
			var pl1 = Vec2.lc(hb1.p, 0.5, hb2.p, 0.5, hb2.norm, bondIdxOff);
			ipath = paper.text(pl1.x, pl1.y, hb1.loop.toString());
			irbb = util.relBox(ipath.getBBox());
			this.centerText(ipath, irbb);
			this.addReObjectPath('indices', bond.visel, ipath);
			var pl2 = Vec2.lc(hb1.p, 0.5, hb2.p, 0.5, hb1.norm, bondIdxOff);
			ipath = paper.text(pl2.x, pl2.y, hb2.loop.toString());
			irbb = util.relBox(ipath.getBBox());
			this.centerText(ipath, irbb);
			this.addReObjectPath('indices', bond.visel, ipath);
		}
	}
};

rnd.ReStruct.prototype.labelIsVisible = function (aid, atom)
{
	if (atom.a.neighbors.length == 0 ||
		(atom.a.neighbors.length < 2 && !this.render.opt.hideTerminalLabels) ||
	atom.a.label.toLowerCase() != 'c' ||
		(atom.a.badConn && this.render.opt.showValenceWarnings) ||
	atom.a.isotope != 0 ||
	atom.a.radical != 0 ||
	atom.a.charge != 0 ||
	atom.a.explicitValence >= 0 ||
	atom.a.atomList != null ||
	atom.a.rglabel != null)
		return true;
	if (atom.a.neighbors.length == 2) {
		var n1 = atom.a.neighbors[0];
		var n2 = atom.a.neighbors[1];
		var hb1 = this.molecule.halfBonds.get(n1);
		var hb2 = this.molecule.halfBonds.get(n2);
		var b1 = this.bonds.get(hb1.bid);
		var b2 = this.bonds.get(hb2.bid);
		if (b1.b.type == b2.b.type && b1.b.stereo == Bond.PATTERN.STEREO.NONE && b2.b.stereo == Bond.PATTERN.STEREO.NONE)
		if (Math.abs(Vec2.cross(hb1.dir, hb2.dir)) < 0.2)
			return true;
	}
	return false;
};

rnd.ReStruct.prototype.checkLabelsToShow = function ()
{
	for (var aid in this.atomsChanged) {
		var atom = this.atoms.get(aid);
		atom.showLabel = this.labelIsVisible(aid, atom);
	}
};

rnd.ReStruct.layerMap = {
	'background': 0,
	'selection-plate': 1,
	'highlighting': 2,
	'warnings': 3,
	'data': 4,
	'indices': 5
};

rnd.ReStruct.prototype.addReObjectPath = function (group, visel, path, pos, visible) {
	if (!path)
		return;
	var offset = this.render.offset;
	var bb = visible ? Box2Abs.fromRelBox(util.relBox(path.getBBox())) : null;
	var ext = pos && bb ? bb.translate(pos.negated()) : null;
	if (offset !== null) {
		path.translateAbs(offset.x, offset.y);
		bb = bb ? bb.translate(offset) : null;
	}
	visel.add(path, bb, ext);
	this.insertInLayer(rnd.ReStruct.layerMap[group], path);
};

rnd.ReStruct.prototype.clearVisel = function (visel)
{
	for (var i = 0; i < visel.paths.length; ++i)
		visel.paths[i].remove();
	visel.clear();
};

rnd.ReStruct.prototype.selectDoubleBondShift = function (n1, n2, d1, d2) {
	if (n1 == 6 && n2 != 6 && (d1 > 1 || d2 == 1))
		return -1;
	if (n2 == 6 && n1 != 6 && (d2 > 1 || d1 == 1))
		return 1;
	if (n2 * d1 > n1 * d2)
		return -1;
	if (n2 * d1 < n1 * d2)
		return 1;
	if (n2 > n1)
		return -1;
	return 1;
};

rnd.ReStruct.prototype.selectDoubleBondShift_Chain = function (bond) {
	var struct = this.molecule;
	var hb1 = struct.halfBonds.get(bond.b.hb1);
	var hb2 = struct.halfBonds.get(bond.b.hb2);
	var nLeft = (hb1.leftSin > 0.3 ? 1 : 0) + (hb2.rightSin > 0.3 ? 1 : 0);
	var nRight = (hb2.leftSin > 0.3 ? 1 : 0) + (hb1.rightSin > 0.3 ? 1 : 0);
	if (nLeft > nRight)
		return -1;
	if (nLeft < nRight)
		return 1;
	if ((hb1.leftSin > 0.3 ? 1 : 0) + (hb1.rightSin > 0.3 ? 1 : 0) == 1)
		return 1;
	return 0;
};

rnd.ReStruct.prototype.setDoubleBondShift = function ()
{
	var struct = this.molecule;
	// double bonds in loops
	for (var bid in this.bondsChanged) {
		var bond = this.bonds.get(bid);
		var loop1, loop2;
		loop1 = struct.halfBonds.get(bond.b.hb1).loop;
		loop2 = struct.halfBonds.get(bond.b.hb2).loop;
		if (loop1 >= 0 && loop2 >= 0) {
			var d1 = struct.loops.get(loop1).dblBonds;
			var d2 = struct.loops.get(loop2).dblBonds;
			var n1 = struct.loops.get(loop1).hbs.length;
			var n2 = struct.loops.get(loop2).hbs.length;
			bond.doubleBondShift = this.selectDoubleBondShift(n1, n2, d1, d2);
		} else if (loop1 >= 0) {
			bond.doubleBondShift = -1;
		} else if (loop2 >= 0) {
			bond.doubleBondShift = 1;
		} else {
			bond.doubleBondShift = this.selectDoubleBondShift_Chain(bond);
		}
	}
};

rnd.ReStruct.prototype.updateLoops = function ()
{
	this.reloops.each(function (rlid, reloop){
		this.clearVisel(reloop.visel);
	}, this);
	var ret = this.molecule.findLoops();
	util.each(ret.bondsToMark, function (bid) {
		this.markBond(bid, 1);
	}, this);
	util.each(ret.newLoops, function (loopId) {
		this.reloops.set(loopId, new rnd.ReLoop(this.molecule.loops.get(loopId)));
	}, this);
};

rnd.ReStruct.prototype.renderLoops = function ()
{
	var render = this.render;
	var settings = render.settings;
	var paper = render.paper;
	var molecule = this.molecule;
	this.reloops.each(function (rlid, reloop){
		var loop = reloop.loop;
		reloop.centre = new Vec2();
		loop.hbs.each(function (hbid){
			var hb = molecule.halfBonds.get(hbid);
			var bond = this.bonds.get(hb.bid);
			var apos = render.ps(this.atoms.get(hb.begin).a.pp);
			if (bond.b.type != Bond.PATTERN.TYPE.AROMATIC)
				loop.aromatic = false;
			reloop.centre.add_(apos);
		}, this);
		loop.convex = true;
		for (var k = 0; k < reloop.loop.hbs.length; ++k)
		{
			var hba = molecule.halfBonds.get(loop.hbs[k]);
			var hbb = molecule.halfBonds.get(loop.hbs[(k + 1) % loop.hbs.length]);
			var angle = Math.atan2(
			Vec2.cross(hba.dir, hbb.dir),
			Vec2.dot(hba.dir, hbb.dir));
			if (angle > 0)
				loop.convex = false;
		}

		reloop.centre = reloop.centre.scaled(1.0 / loop.hbs.length);
		reloop.radius = -1;
		loop.hbs.each(function (hbid){
			var hb = molecule.halfBonds.get(hbid);
			var apos = render.ps(this.atoms.get(hb.begin).a.pp);
			var bpos = render.ps(this.atoms.get(hb.end).a.pp);
			var n = Vec2.diff(bpos, apos).rotateSC(1, 0).normalized();
			var dist = Vec2.dot(Vec2.diff(apos, reloop.centre), n);
			if (reloop.radius < 0) {
				reloop.radius = dist;
			} else {
				reloop.radius = Math.min(reloop.radius, dist);
			}
		}, this);
		reloop.radius *= 0.7;
		if (!loop.aromatic)
			return;
		var path = null;
		if (loop.convex) {
			path = paper.circle(reloop.centre.x, reloop.centre.y, reloop.radius)
			.attr({
				'stroke': '#000',
				'stroke-width': settings.lineWidth
			});
		} else {
			var pathStr = '';
			for (k = 0; k < loop.hbs.length; ++k)
			{
				hba = molecule.halfBonds.get(loop.hbs[k]);
				hbb = molecule.halfBonds.get(loop.hbs[(k + 1) % loop.hbs.length]);
				angle = Math.atan2(
				Vec2.cross(hba.dir, hbb.dir),
				Vec2.dot(hba.dir, hbb.dir));
				var halfAngle = (Math.PI - angle) / 2;
				var dir = hbb.dir.rotate(halfAngle);
				var pi = render.ps(this.atoms.get(hbb.begin).a.pp);
				var sin = Math.sin(halfAngle);
				var minSin = 0.1;
				if (Math.abs(sin) < minSin)
					sin = sin * minSin / Math.abs(sin);
				var offset = settings.bondSpace / sin;
				var qi = pi.addScaled(dir, -offset);
				pathStr += (k == 0 ? 'M' : 'L');
				pathStr += tfx(qi.x) + ',' + tfx(qi.y);
			}
			pathStr += 'Z';
			path = paper.path(pathStr)
			.attr({
				'stroke': '#000',
				'stroke-width': settings.lineWidth,
				'stroke-dasharray':'- '
			});
		}
		this.addReObjectPath('data', reloop.visel, path, null, true);
	}, this);
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/bond":9,"../chem/element":12,"../util":40,"../util/box2abs":39,"../util/vec2":44,"./restruct":24}],26:[function(require,module,exports){
// Visel is a shorthand for VISual ELement
// It corresponds to a visualization (i.e. set of paths) of an atom or a bond.

var Box2Abs = require('../util/box2abs');
var Vec2 = require('../util/vec2');

var Visel = function (type) {
	this.type = type;
	this.paths = [];
	this.boxes = [];
	this.boundingBox = null;
};

Visel.TYPE = {
	'ATOM': 1,
	'BOND': 2,
	'LOOP': 3,
	'ARROW': 4,
	'PLUS': 5,
	'SGROUP': 6,
	'TMP': 7, // [MK] TODO: do we still need it?
	'FRAGMENT': 8,
	'RGROUP': 9,
	'CHIRAL_FLAG': 10
};

Visel.prototype.add = function (path, bb, ext) {
	this.paths.push(path);
	if (bb) {
		this.boxes.push(bb);
		this.boundingBox = this.boundingBox == null ? bb : Box2Abs.union(this.boundingBox, bb);
	}
	if (ext) {
		this.exts.push(ext);
	}
};

Visel.prototype.clear = function () {
	this.paths = [];
	this.boxes = [];
	this.exts = [];
	this.boundingBox = null;
};

Visel.prototype.translate = function (x, y) {
	if (arguments.length > 2) {    // TODO: replace to debug time assert
		throw new Error('One vector or two scalar arguments expected');
	}
	if (y === undefined) {
		this.translate(x.x, x.y);
	} else {
		var delta = new Vec2(x, y);
		for (var i = 0; i < this.paths.length; ++i) {
			this.paths[i].translateAbs(x, y);
		}
		for (var j = 0; j < this.boxes.length; ++j) {
			this.boxes[j] = this.boxes[j].translate(delta);
		}
		if (this.boundingBox !== null) {
			this.boundingBox = this.boundingBox.translate(delta);
		}
	}
};

module.exports = Visel;
},{"../util/box2abs":39,"../util/vec2":44}],27:[function(require,module,exports){
(function (global){
var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');
var op = require('./op');

var Struct = require('../chem/struct');
var Atom = require('../chem/atom');
var Bond = require('../chem/bond');
var SGroup = require('../chem/sgroup');

var ui = global.ui;

//
// Undo/redo actions
//
function Action ()
{
	this.operations = [];
};

Action.prototype.addOp = function (operation) {
	if (!operation.isDummy(ui.editor))
		this.operations.push(operation);
	return operation;
};

Action.prototype.mergeWith = function (action)
{
	this.operations = this.operations.concat(action.operations);
	return this;
};

// Perform action and return inverted one
Action.prototype.perform = function ()
{
	var action = new Action();
	var idx = 0;

	this.operations.each(function (operation) {
		action.addOp(operation.perform(ui.editor));
		idx++;
	}, this);

	action.operations.reverse();
	return action;
};

Action.prototype.isDummy = function ()
{
	return this.operations.detect(function (operation) {
		return !operation.isDummy(ui.editor); // TODO [RB] the condition is always true for op.* operations
	}, this) == null;
};

// Add action operation to remove atom from s-group if needed
Action.prototype.removeAtomFromSgroupIfNeeded = function (id)
{
	var sgroups = ui.render.atomGetSGroups(id);

	if (sgroups.length > 0)
	{
		sgroups.each(function (sid)
		{
			this.addOp(new op.SGroupAtomRemove(sid, id));
		}, this);

		return true;
	}

	return false;
};

// Add action operations to remove whole s-group if needed
Action.prototype.removeSgroupIfNeeded = function (atoms)
{
	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;
	var sg_counts = new Hash();

	atoms.each(function (id)
	{
		var sgroups = ui.render.atomGetSGroups(id);

		sgroups.each(function (sid)
		{
			var n = sg_counts.get(sid);
			if (Object.isUndefined(n))
				n = 1;
			else
				n++;
			sg_counts.set(sid, n);
		}, this);
	}, this);

	sg_counts.each(function (sg)
	{
		var sid = parseInt(sg.key);
		var sg_atoms = ui.render.sGroupGetAtoms(sid);

		if (sg_atoms.length == sg.value)
		{ // delete whole s-group
			var sgroup = DS.sgroups.get(sid);
			this.mergeWith(sGroupAttributeAction(sid, sgroup.getAttrs()));
			this.addOp(new op.SGroupRemoveFromHierarchy(sid));
			this.addOp(new op.SGroupDelete(sid));
		}
	}, this);
};

function fromMultipleMove (lists, d)
{
	d = new Vec2(d);

	var action = new Action();
	var i;

	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;
	var bondlist = [];
	var loops = Set.empty();
	var atomsToInvalidate = Set.empty();

	if (lists.atoms) {
		var atomSet = Set.fromList(lists.atoms);
		RS.bonds.each(function (bid, bond){

			if (Set.contains(atomSet, bond.b.begin) && Set.contains(atomSet, bond.b.end)) {
				bondlist.push(bid);
				// add all adjacent loops
				// those that are not completely inside the structure will get redrawn anyway
				util.each(['hb1','hb2'], function (hb){
					var loop = DS.halfBonds.get(bond.b[hb]).loop;
					if (loop >= 0)
						Set.add(loops, loop);
				}, this);
			}
			else if (Set.contains(atomSet, bond.b.begin))
				Set.add(atomsToInvalidate, bond.b.begin);
			else if (Set.contains(atomSet, bond.b.end))
				Set.add(atomsToInvalidate, bond.b.end);
		}, this);
		for (i = 0; i < bondlist.length; ++i) {
			action.addOp(new op.BondMove(bondlist[i], d));
		}
		Set.each(loops, function (loopId){
			if (RS.reloops.get(loopId) && RS.reloops.get(loopId).visel) // hack
				action.addOp(new op.LoopMove(loopId, d));
		}, this);
		for (i = 0; i < lists.atoms.length; ++i) {
			var aid = lists.atoms[i];
			action.addOp(new op.AtomMove(aid, d, !Set.contains(atomsToInvalidate, aid)));
		}
	}

	if (lists.rxnArrows)
		for (i = 0; i < lists.rxnArrows.length; ++i)
			action.addOp(new op.RxnArrowMove(lists.rxnArrows[i], d, true));

	if (lists.rxnPluses)
		for (i = 0; i < lists.rxnPluses.length; ++i)
			action.addOp(new op.RxnPlusMove(lists.rxnPluses[i], d, true));

	if (lists.sgroupData)
		for (i = 0; i < lists.sgroupData.length; ++i)
			action.addOp(new op.SGroupDataMove(lists.sgroupData[i], d));

	if (lists.chiralFlags)
		for (i = 0; i < lists.chiralFlags.length; ++i)
			action.addOp(new op.ChiralFlagMove(d));

	return action.perform();
};

function fromAtomsAttrs (ids, attrs, reset)
{
	var action = new Action();
	(typeof(ids) == 'number' ? [ids] : ids).each(function (id) {
		for (var key in Atom.attrlist) {
			var value;
			if (key in attrs)
				value = attrs[key];
			else if (reset)
				value = Atom.attrGetDefault(key);
			else
				continue;
			action.addOp(new op.AtomAttr(id, key, value));
		}
		if (!reset && 'label' in attrs && attrs.label != null && attrs.label != 'L#' && !attrs['atomList']) {
			action.addOp(new op.AtomAttr(id, 'atomList', null));
		}
	}, this);
	return action.perform();
};

function fromBondAttrs (id, attrs, flip, reset)
{
	var action = new Action();

	for (var key in Bond.PATTERN.attrlist) {
		var value;
		if (key in attrs)
			value = attrs[key];
		else if (reset)
			value = Bond.PATTERN.attrGetDefault(key);
		else
			continue;
		action.addOp(new op.BondAttr(id, key, value));
	}
	if (flip)
		action.mergeWith(toBondFlipping(id));
	return action.perform();
};

function fromSelectedBondsAttrs (attrs, flips)
{
	var action = new Action();

	attrs = new Hash(attrs);

	ui.editor.getSelection().bonds.each(function (id) {
		attrs.each(function (attr) {
			action.addOp(new op.BondAttr(id, attr.key, attr.value));
		}, this);
	}, this);
	if (flips)
		flips.each(function (id) {
			action.mergeWith(toBondFlipping(id));
		}, this);
	return action.perform();
};

function fromAtomAddition (pos, atom)
{
	atom = Object.clone(atom);
	var action = new Action();
	atom.fragment = action.addOp(new op.FragmentAdd().perform(ui.editor)).frid;
	action.addOp(new op.AtomAdd(atom, pos).perform(ui.editor));
	return action;
};

function mergeFragments (action, frid, frid2) {
	if (frid2 != frid && Object.isNumber(frid2)) {
		var rgid = Struct.RGroup.findRGroupByFragment(ui.render.ctab.molecule.rgroups, frid2);
		if (!Object.isUndefined(rgid)) {
			action.mergeWith(fromRGroupFragment(null, frid2));
		}
		ui.render.ctab.molecule.atoms.each(function (aid, atom) {
			if (atom.fragment == frid2) {
				action.addOp(new op.AtomAttr(aid, 'fragment', frid).perform(ui.editor));
			}
		});
		action.addOp(new op.FragmentDelete(frid2).perform(ui.editor));
	}
};

// Get new atom id/label and pos for bond being added to existing atom
function atomForNewBond (id)
{
	var neighbours = [];
	var pos = ui.render.atomGetPos(id);

	ui.render.atomGetNeighbors(id).each(function (nei)
	{
		var nei_pos = ui.render.atomGetPos(nei.aid);

		if (Vec2.dist(pos, nei_pos) < 0.1)
			return;

		neighbours.push({id: nei.aid, v: Vec2.diff(nei_pos, pos)});
	});

	neighbours.sort(function (nei1, nei2)
	{
		return Math.atan2(nei1.v.y, nei1.v.x) - Math.atan2(nei2.v.y, nei2.v.x);
	});

	var i, max_i = 0;
	var angle, max_angle = 0;

	// TODO: impove layout: tree, ...

	for (i = 0; i < neighbours.length; i++) {
		angle = Vec2.angle(neighbours[i].v, neighbours[(i + 1) % neighbours.length].v);

		if (angle < 0)
			angle += 2 * Math.PI;

		if (angle > max_angle)
			max_i = i, max_angle = angle;
	}

	var v = new Vec2(1, 0);

	if (neighbours.length > 0) {
		if (neighbours.length == 1) {
			max_angle = -(4 * Math.PI / 3);

			// zig-zag
			var nei = ui.render.atomGetNeighbors(id)[0];
			if (ui.render.atomGetDegree(nei.aid) > 1) {
				var nei_neighbours = [];
				var nei_pos = ui.render.atomGetPos(nei.aid);
				var nei_v = Vec2.diff(pos, nei_pos);
				var nei_angle = Math.atan2(nei_v.y, nei_v.x);

				ui.render.atomGetNeighbors(nei.aid).each(function (nei_nei) {
					var nei_nei_pos = ui.render.atomGetPos(nei_nei.aid);

					if (nei_nei.bid == nei.bid || Vec2.dist(nei_pos, nei_nei_pos) < 0.1)
						return;

					var v_diff = Vec2.diff(nei_nei_pos, nei_pos);
					var ang = Math.atan2(v_diff.y, v_diff.x) - nei_angle;

					if (ang < 0)
						ang += 2 * Math.PI;

					nei_neighbours.push(ang);
				});
				nei_neighbours.sort(function (nei1, nei2) {
					return nei1 - nei2;
				});

				if (nei_neighbours[0] <= Math.PI * 1.01 && nei_neighbours[nei_neighbours.length - 1] <= 1.01 * Math.PI)
					max_angle *= -1;

			}
		}

		angle = (max_angle / 2) + Math.atan2(neighbours[max_i].v.y, neighbours[max_i].v.x);

		v = v.rotate(angle);
	}

	v.add_(pos);

	var a = ui.render.findClosestAtom(v, 0.1);

	if (a == null)
		a = {label: 'C'};
	else
		a = a.id;

	return {atom: a, pos: v};
};

function fromBondAddition (bond, begin, end, pos, pos2)
{
	if (end === undefined) {
		var atom = atomForNewBond(begin);
		end = atom.atom;
		pos = atom.pos;
	}
	var action = new Action();

	var frid = null;
	if (!Object.isNumber(begin)) {
		if (Object.isNumber(end)) {
			frid = ui.render.atomGetAttr(end, 'fragment');
		}
	}
	else {
		frid = ui.render.atomGetAttr(begin, 'fragment');
		if (Object.isNumber(end)) {
			var frid2 = ui.render.atomGetAttr(end, 'fragment');
			mergeFragments(action, frid, frid2);
		}
	}
	if (frid == null) {
		frid = action.addOp(new op.FragmentAdd().perform(ui.editor)).frid;
	}

	if (!Object.isNumber(begin)) {
		begin.fragment = frid;
		begin = action.addOp(new op.AtomAdd(begin, pos).perform(ui.editor)).data.aid;

		pos = pos2;
	}
	else {
		if (ui.render.atomGetAttr(begin, 'label') == '*') {
			action.addOp(new op.AtomAttr(begin, 'label', 'C').perform(ui.editor));
		}
	}


	if (!Object.isNumber(end)) {
		end.fragment = frid;
		// TODO: <op>.data.aid here is a hack, need a better way to access the id of a newly created atom
		end = action.addOp(new op.AtomAdd(end, pos).perform(ui.editor)).data.aid;
		if (Object.isNumber(begin)) {
			ui.render.atomGetSGroups(begin).each(function (sid) {
				action.addOp(new op.SGroupAtomAdd(sid, end).perform(ui.editor));
			}, this);
		}
	}
	else {
		if (ui.render.atomGetAttr(end, 'label') == '*') {
			action.addOp(new op.AtomAttr(end, 'label', 'C').perform(ui.editor));
		}
	}

	var bid = action.addOp(new op.BondAdd(begin, end, bond).perform(ui.editor)).data.bid;

	action.operations.reverse();

	return [action, begin, end, bid];
};

function fromArrowAddition (pos)
{
	var action = new Action();
	if (ui.ctab.rxnArrows.count() < 1) {
		action.addOp(new op.RxnArrowAdd(pos).perform(ui.editor));
	}
	return action;
};

function fromArrowDeletion (id)
{
	var action = new Action();
	action.addOp(new op.RxnArrowDelete(id));
	return action.perform();
};

function fromChiralFlagAddition (pos)
{
	var action = new Action();
	if (ui.render.ctab.chiralFlags.count() < 1) {
		action.addOp(new op.ChiralFlagAdd(pos).perform(ui.editor));
	}
	return action;
};

function fromChiralFlagDeletion ()
{
	var action = new Action();
	action.addOp(new op.ChiralFlagDelete());
	return action.perform();
};

function fromPlusAddition (pos)
{
	var action = new Action();
	action.addOp(new op.RxnPlusAdd(pos).perform(ui.editor));
	return action;
};

function fromPlusDeletion (id)
{
	var action = new Action();
	action.addOp(new op.RxnPlusDelete(id));
	return action.perform();
};

function fromAtomDeletion (id)
{
	var action = new Action();
	var atoms_to_remove = new Array();

	var frid = ui.ctab.atoms.get(id).fragment;

	ui.render.atomGetNeighbors(id).each(function (nei)
	{
		action.addOp(new op.BondDelete(nei.bid));// [RB] !!
		if (ui.render.atomGetDegree(nei.aid) == 1)
		{
			if (action.removeAtomFromSgroupIfNeeded(nei.aid))
				atoms_to_remove.push(nei.aid);

			action.addOp(new op.AtomDelete(nei.aid));
		}
	}, this);

	if (action.removeAtomFromSgroupIfNeeded(id))
		atoms_to_remove.push(id);

	action.addOp(new op.AtomDelete(id));

	action.removeSgroupIfNeeded(atoms_to_remove);

	action = action.perform();

	action.mergeWith(fromFragmentSplit(frid));

	return action;
};

function fromBondDeletion (id)
{
	var action = new Action();
	var bond = ui.ctab.bonds.get(id);
	var frid = ui.ctab.atoms.get(bond.begin).fragment;
	var atoms_to_remove = new Array();

	action.addOp(new op.BondDelete(id));

	if (ui.render.atomGetDegree(bond.begin) == 1)
	{
		if (action.removeAtomFromSgroupIfNeeded(bond.begin))
			atoms_to_remove.push(bond.begin);

		action.addOp(new op.AtomDelete(bond.begin));
	}

	if (ui.render.atomGetDegree(bond.end) == 1)
	{
		if (action.removeAtomFromSgroupIfNeeded(bond.end))
			atoms_to_remove.push(bond.end);

		action.addOp(new op.AtomDelete(bond.end));
	}

	action.removeSgroupIfNeeded(atoms_to_remove);

	action = action.perform();

	action.mergeWith(fromFragmentSplit(frid));

	return action;
};

function fromFragmentSplit (frid) { // TODO [RB] the thing is too tricky :) need something else in future
	var action = new Action();
	var rgid = Struct.RGroup.findRGroupByFragment(ui.ctab.rgroups, frid);
	ui.ctab.atoms.each(function (aid, atom) {
		if (atom.fragment == frid) {
			var newfrid = action.addOp(new op.FragmentAdd().perform(ui.editor)).frid;
			var processAtom = function (aid1) {
				action.addOp(new op.AtomAttr(aid1, 'fragment', newfrid).perform(ui.editor));
				ui.render.atomGetNeighbors(aid1).each(function (nei) {
					if (ui.ctab.atoms.get(nei.aid).fragment == frid) {
						processAtom(nei.aid);
					}
				});
			};
			processAtom(aid);
			if (rgid) {
				action.mergeWith(fromRGroupFragment(rgid, newfrid));
			}
		}
	});
	if (frid != -1) {
		action.mergeWith(fromRGroupFragment(0, frid));
		action.addOp(new op.FragmentDelete(frid).perform(ui.editor));
	}
	return action;
};

function fromFragmentAddition (atoms, bonds, sgroups, rxnArrows, rxnPluses)
{
	var action = new Action();

	/*
     atoms.each(function (aid)
     {
     ui.render.atomGetNeighbors(aid).each(function (nei)
     {
     if (ui.selection.bonds.indexOf(nei.bid) == -1)
     ui.selection.bonds = ui.selection.bonds.concat([nei.bid]);
     }, this);
     }, this);
     */

	// TODO: merge close atoms and bonds

	sgroups.each(function (sid)
	{
		action.addOp(new op.SGroupRemoveFromHierarchy(sid));
		action.addOp(new op.SGroupDelete(sid));
	}, this);


	bonds.each(function (bid) {
		action.addOp(new op.BondDelete(bid));
	}, this);


	atoms.each(function (aid) {
		action.addOp(new op.AtomDelete(aid));
	}, this);

	rxnArrows.each(function (id) {
		action.addOp(new op.RxnArrowDelete(id));
	}, this);

	rxnPluses.each(function (id) {
		action.addOp(new op.RxnPlusDelete(id));
	}, this);

	action.mergeWith(new fromFragmentSplit(-1));

	return action;
};

function fromFragmentDeletion (selection)
{
	selection = selection || ui.editor.getSelection();

	var action = new Action();
	var atoms_to_remove = new Array();

	var frids = [];

	var actionRemoveDataSGroups = new Action();
	if (selection.sgroupData) {
		selection.sgroupData.each(function (id) {
			actionRemoveDataSGroups.mergeWith(fromSgroupDeletion(id));
		}, this);
	}

	selection.atoms.each(function (aid)
	{
		ui.render.atomGetNeighbors(aid).each(function (nei)
		{
			if (selection.bonds.indexOf(nei.bid) == -1)
				selection.bonds = selection.bonds.concat([nei.bid]);
		}, this);
	}, this);

	selection.bonds.each(function (bid)
	{
		action.addOp(new op.BondDelete(bid));

		var bond = ui.ctab.bonds.get(bid);

		if (selection.atoms.indexOf(bond.begin) == -1 && ui.render.atomGetDegree(bond.begin) == 1)
		{
			var frid1 = ui.ctab.atoms.get(bond.begin).fragment;
			if (frids.indexOf(frid1) < 0)
				frids.push(frid1);

			if (action.removeAtomFromSgroupIfNeeded(bond.begin))
				atoms_to_remove.push(bond.begin);

			action.addOp(new op.AtomDelete(bond.begin));
		}
		if (selection.atoms.indexOf(bond.end) == -1 && ui.render.atomGetDegree(bond.end) == 1)
		{
			var frid2 = ui.ctab.atoms.get(bond.end).fragment;
			if (frids.indexOf(frid2) < 0)
				frids.push(frid2);

			if (action.removeAtomFromSgroupIfNeeded(bond.end))
				atoms_to_remove.push(bond.end);

			action.addOp(new op.AtomDelete(bond.end));
		}
	}, this);


	selection.atoms.each(function (aid)
	{
		var frid3 = ui.ctab.atoms.get(aid).fragment;
		if (frids.indexOf(frid3) < 0)
			frids.push(frid3);

		if (action.removeAtomFromSgroupIfNeeded(aid))
			atoms_to_remove.push(aid);

		action.addOp(new op.AtomDelete(aid));
	}, this);

	action.removeSgroupIfNeeded(atoms_to_remove);

	selection.rxnArrows.each(function (id) {
		action.addOp(new op.RxnArrowDelete(id));
	}, this);

	selection.rxnPluses.each(function (id) {
		action.addOp(new op.RxnPlusDelete(id));
	}, this);

	selection.chiralFlags.each(function (id) {
		action.addOp(new op.ChiralFlagDelete(id));
	}, this);

	action = action.perform();

	while (frids.length > 0) action.mergeWith(new fromFragmentSplit(frids.pop()));

	action.mergeWith(actionRemoveDataSGroups);

	return action;
};

function fromAtomMerge (src_id, dst_id)
{
	var fragAction = new Action();
	var src_frid = ui.render.atomGetAttr(src_id, 'fragment'), dst_frid = ui.render.atomGetAttr(dst_id, 'fragment');
	if (src_frid != dst_frid) {
		mergeFragments(fragAction, src_frid, dst_frid);
	}

	var action = new Action();

	ui.render.atomGetNeighbors(src_id).each(function (nei)
	{
		var bond = ui.ctab.bonds.get(nei.bid);
		var begin, end;

		if (bond.begin == nei.aid) {
			begin = nei.aid;
			end = dst_id;
		} else {
			begin = dst_id;
			end = nei.aid;
		}
		if (dst_id != bond.begin && dst_id != bond.end && ui.ctab.findBondId(begin, end) == -1) // TODO: improve this
		{
			action.addOp(new op.BondAdd(begin, end, bond));
		}
		action.addOp(new op.BondDelete(nei.bid));
	}, this);

	var attrs = Atom.getAttrHash(ui.ctab.atoms.get(src_id));

	if (ui.render.atomGetDegree(src_id) == 1 && attrs.get('label') == '*')
		attrs.set('label', 'C');

	attrs.each(function (attr) {
		action.addOp(new op.AtomAttr(dst_id, attr.key, attr.value));
	}, this);

	var sg_changed = action.removeAtomFromSgroupIfNeeded(src_id);

	action.addOp(new op.AtomDelete(src_id));

	if (sg_changed)
		action.removeSgroupIfNeeded([src_id]);

	return action.perform().mergeWith(fragAction);
};

function toBondFlipping (id)
{
	var bond = ui.ctab.bonds.get(id);

	var action = new Action();
	action.addOp(new op.BondDelete(id));
	action.addOp(new op.BondAdd(bond.end, bond.begin, bond)).data.bid = id;
	return action;
};

function fromBondFlipping (bid) {
	return toBondFlipping(bid).perform();
};

function fromTemplateOnCanvas (pos, angle, template)
{
	var action = new Action();
	var frag = template.molecule;

	var fragAction = new op.FragmentAdd().perform(ui.editor);

	var map = {};

	// Only template atom label matters for now
	frag.atoms.each(function (aid, atom) {
		var operation;
		var attrs = Atom.getAttrHash(atom).toObject();
		attrs.fragment = fragAction.frid;

		action.addOp(
			operation = new op.AtomAdd(
				attrs,
			Vec2.diff(atom.pp, template.xy0).rotate(angle).add(pos)
			).perform(ui.editor)
		);

		map[aid] = operation.data.aid;
	});

	frag.bonds.each(function (bid, bond) {
		action.addOp(
		new op.BondAdd(
			map[bond.begin],
			map[bond.end],
			bond
		).perform(ui.editor)
		);
	});

	action.operations.reverse();
	action.addOp(fragAction);

	return action;
};

function atomAddToSGroups (sgroups, aid) {
	var action = new Action();
	util.each(sgroups, function (sid){
		action.addOp(new op.SGroupAtomAdd(sid, aid).perform(ui.editor));
	}, this);
	return action;
}

function fromTemplateOnAtom (aid, angle, extra_bond, template, calcAngle)
{
	var action = new Action();
	var frag = template.molecule;
	var R = ui.render;
	var RS = R.ctab;
	var molecule = RS.molecule;
	var atom = molecule.atoms.get(aid);
	var aid0 = aid; // the atom that was clicked on
	var aid1 = null; // the atom on the other end of the extra bond, if any
	var sgroups = ui.render.atomGetSGroups(aid);

	var frid = R.atomGetAttr(aid, 'fragment');

	var map = {};
	var xy0 = frag.atoms.get(template.aid).pp;

	if (extra_bond) {
		// create extra bond after click on atom
		if (angle == null)
		{
			var middle_atom = atomForNewBond(aid);
			var action_res = fromBondAddition({type: 1}, aid, middle_atom.atom, middle_atom.pos);
			action = action_res[0];
			action.operations.reverse();
			aid1 = aid = action_res[2];
		} else {
			var operation;

			action.addOp(
				operation = new op.AtomAdd(
				{ label: 'C', fragment: frid },
				(new Vec2(1, 0)).rotate(angle).add(atom.pp)
				).perform(ui.editor)
			);

			action.addOp(
			new op.BondAdd(
				aid,
				operation.data.aid,
			{ type: 1 }
			).perform(ui.editor)
			);

			aid1 = aid = operation.data.aid;
			action.mergeWith(atomAddToSGroups(sgroups, aid));
		}

		var atom0 = atom;
		atom = molecule.atoms.get(aid);
		var delta = calcAngle(atom0.pp, atom.pp) - template.angle0;
	} else {
		if (angle == null) {
			middle_atom = atomForNewBond(aid);
			angle = calcAngle(atom.pp, middle_atom.pos);
		}
		delta = angle - template.angle0;
	}

	frag.atoms.each(function (id, a) {
		var attrs = Atom.getAttrHash(a).toObject();
		attrs.fragment = frid;
		if (id == template.aid) {
			action.mergeWith(fromAtomsAttrs(aid, attrs, true));
			map[id] = aid;
		} else {
			var v;

			v = Vec2.diff(a.pp, xy0).rotate(delta).add(atom.pp);

			action.addOp(
				operation = new op.AtomAdd(
					attrs,
					v
				).perform(ui.editor)
			);
			map[id] = operation.data.aid;
		}
		if (map[id] - 0 !== aid0 - 0 && map[id] - 0 !== aid1 - 0)
			action.mergeWith(atomAddToSGroups(sgroups, map[id]));
	});

	frag.bonds.each(function (bid, bond) {
		action.addOp(
		new op.BondAdd(
			map[bond.begin],
			map[bond.end],
			bond
		).perform(ui.editor)
		);
	});

	action.operations.reverse();

	return action;
};

function fromTemplateOnBond (bid, template, calcAngle, flip)
{
	var action = new Action();
	var frag = template.molecule;
	var R = ui.render;
	var RS = R.ctab;
	var molecule = RS.molecule;

	var bond = molecule.bonds.get(bid);
	var begin = molecule.atoms.get(bond.begin);
	var end = molecule.atoms.get(bond.end);
	var sgroups = Set.list(Set.intersection(
	Set.fromList(ui.render.atomGetSGroups(bond.begin)),
	Set.fromList(ui.render.atomGetSGroups(bond.end))));

	var fr_bond = frag.bonds.get(template.bid);
	var fr_begin;
	var fr_end;

	var frid = R.atomGetAttr(bond.begin, 'fragment');

	var map = {};

	if (flip) {
		fr_begin = frag.atoms.get(fr_bond.end);
		fr_end = frag.atoms.get(fr_bond.begin);
		map[fr_bond.end] = bond.begin;
		map[fr_bond.begin] = bond.end;
	} else {
		fr_begin = frag.atoms.get(fr_bond.begin);
		fr_end = frag.atoms.get(fr_bond.end);
		map[fr_bond.begin] = bond.begin;
		map[fr_bond.end] = bond.end;
	}

	// calc angle
	var angle = calcAngle(begin.pp, end.pp) - calcAngle(fr_begin.pp, fr_end.pp);
	var scale = Vec2.dist(begin.pp, end.pp) / Vec2.dist(fr_begin.pp, fr_end.pp);

	var xy0 = fr_begin.pp;

	frag.atoms.each(function (id, a) {
		var attrs = Atom.getAttrHash(a).toObject();
		attrs.fragment = frid;
		if (id == fr_bond.begin || id == fr_bond.end) {
			action.mergeWith(fromAtomsAttrs(map[id], attrs, true));
			return;
		}

		var v;

		v = Vec2.diff(a.pp, fr_begin.pp).rotate(angle).scaled(scale).add(begin.pp);

		var merge_a = R.findClosestAtom(v, 0.1);

		if (merge_a == null) {
			var operation;
			action.addOp(
				operation = new op.AtomAdd(
					attrs,
					v
				).perform(ui.editor)
			);

			map[id] = operation.data.aid;
			action.mergeWith(atomAddToSGroups(sgroups, map[id]));
		} else {
			map[id] = merge_a.id;
			action.mergeWith(fromAtomsAttrs(map[id], attrs, true));
			// TODO [RB] need to merge fragments?
		}
	});

	frag.bonds.each(function (id, bond) {
		var exist_id = molecule.findBondId(map[bond.begin], map[bond.end]);
		if (exist_id == -1) {
			action.addOp(
			new op.BondAdd(
				map[bond.begin],
				map[bond.end],
				bond
			).perform(ui.editor));
		} else {
			action.mergeWith(fromBondAttrs(exist_id, fr_bond, false, true));
		}
	});

	action.operations.reverse();

	return action;
}

function fromChain (p0, v, nSect, atom_id)
{
	var angle = Math.PI / 6;
	var dx = Math.cos(angle), dy = Math.sin(angle);

	var action = new Action();

	var frid;
	if (atom_id != null) {
		frid = ui.render.atomGetAttr(atom_id, 'fragment');
	} else {
		frid = action.addOp(new op.FragmentAdd().perform(ui.editor)).frid;
	}

	var id0 = -1;
	if (atom_id != null) {
		id0 = atom_id;
	} else {
		id0 = action.addOp(new op.AtomAdd({label: 'C', fragment: frid}, p0).perform(ui.editor)).data.aid;
	}

	action.operations.reverse();

	nSect.times(function (i) {
		var pos = new Vec2(dx * (i + 1), i & 1 ? 0 : dy).rotate(v).add(p0);

		var a = ui.render.findClosestAtom(pos, 0.1);

		var ret = fromBondAddition({}, id0, a ? a.id : {}, pos);
		action = ret[0].mergeWith(action);
		id0 = ret[2];
	}, this);

	return action;
};

function fromNewCanvas (ctab)
{
	var action = new Action();

	action.addOp(new op.CanvasLoad(ctab));
	return action.perform();
};

function fromSgroupType (id, type)
{
	var R = ui.render;
	var cur_type = R.sGroupGetType(id);
	if (type && type != cur_type) {
		var atoms = util.array(R.sGroupGetAtoms(id));
		var attrs = R.sGroupGetAttrs(id);
		var actionDeletion = fromSgroupDeletion(id); // [MK] order of execution is important, first delete then recreate
		var actionAddition = fromSgroupAddition(type, atoms, attrs, id);
		return actionAddition.mergeWith(actionDeletion); // the actions are already performed and reversed, so we merge them backwards
	}
	return new Action();
};

function fromSgroupAttrs (id, attrs)
{
	var action = new Action();
	var R = ui.render;
	var RS = R.ctab;
	var sg = RS.sgroups.get(id).item;

	new Hash(attrs).each(function (attr) {
		action.addOp(new op.SGroupAttr(id, attr.key, attr.value));
	}, this);

	return action.perform();
};

function sGroupAttributeAction (id, attrs)
{
	var action = new Action();

	new Hash(attrs).each(function (attr) { // store the attribute assignment
		action.addOp(new op.SGroupAttr(id, attr.key, attr.value));
	}, this);

	return action;
};

function fromSgroupDeletion (id)
{
	var action = new Action();
	var R = ui.render;
	var RS = R.ctab;
	var DS = RS.molecule;

	if (ui.render.sGroupGetType(id) == 'SRU') {
		ui.render.sGroupsFindCrossBonds();
		var nei_atoms = ui.render.sGroupGetNeighborAtoms(id);

		nei_atoms.each(function (aid) {
			if (ui.render.atomGetAttr(aid, 'label') == '*') {
				action.addOp(new op.AtomAttr(aid, 'label', 'C'));
			}
		}, this);
	}

	var sg = DS.sgroups.get(id);
	var atoms = SGroup.getAtoms(DS, sg);
	var attrs = sg.getAttrs();
	action.addOp(new op.SGroupRemoveFromHierarchy(id));
	for (var i = 0; i < atoms.length; ++i) {
		action.addOp(new op.SGroupAtomRemove(id, atoms[i]));
	}
	action.addOp(new op.SGroupDelete(id));

	action = action.perform();

	action.mergeWith(sGroupAttributeAction(id, attrs));

	return action;
};

function fromSgroupAddition (type, atoms, attrs, sgid, pp)
{
	var action = new Action();
	var i;

	// TODO: shoud the id be generated when OpSGroupCreate is executed?
	//      if yes, how to pass it to the following operations?
	sgid = sgid - 0 === sgid ? sgid : ui.render.ctab.molecule.sgroups.newId();

	action.addOp(new op.SGroupCreate(sgid, type, pp));
	for (i = 0; i < atoms.length; i++)
		action.addOp(new op.SGroupAtomAdd(sgid, atoms[i]));
	action.addOp(new op.SGroupAddToHierarchy(sgid));

	action = action.perform();

	if (type == 'SRU') {
		ui.render.sGroupsFindCrossBonds();
		var asterisk_action = new Action();
		ui.render.sGroupGetNeighborAtoms(sgid).each(function (aid) {
			if (ui.render.atomGetDegree(aid) == 1 && ui.render.atomIsPlainCarbon(aid)) {
				asterisk_action.addOp(new op.AtomAttr(aid, 'label', '*'));
			}
		}, this);

		asterisk_action = asterisk_action.perform();
		asterisk_action.mergeWith(action);
		action = asterisk_action;
	}

	return fromSgroupAttrs(sgid, attrs).mergeWith(action);
};

function fromRGroupAttrs (id, attrs) {
	var action = new Action();
	new Hash(attrs).each(function (attr) {
		action.addOp(new op.RGroupAttr(id, attr.key, attr.value));
	}, this);
	return action.perform();
};

function fromRGroupFragment (rgidNew, frid) {
	var action = new Action();
	action.addOp(new op.RGroupFragment(rgidNew, frid));
	return action.perform();
};

// Should it be named structCenter?
function getAnchorPosition(clipboard) {
	if (clipboard.atoms.length) {
		var xmin = 1e50, ymin = xmin, xmax = -xmin, ymax = -ymin;
		for (var i = 0; i < clipboard.atoms.length; i++) {
			xmin = Math.min(xmin, clipboard.atoms[i].pp.x);
			ymin = Math.min(ymin, clipboard.atoms[i].pp.y);
			xmax = Math.max(xmax, clipboard.atoms[i].pp.x);
			ymax = Math.max(ymax, clipboard.atoms[i].pp.y);
		}
		return new Vec2((xmin + xmax) / 2, (ymin + ymax) / 2); // TODO: check
	} else if (clipboard.rxnArrows.length) {
		return clipboard.rxnArrows[0].pp;
	} else if (clipboard.rxnPluses.length) {
		return clipboard.rxnPluses[0].pp;
	} else if (clipboard.chiralFlags.length) {
		return clipboard.chiralFlags[0].pp;
	} else {
		return null;
	}
}

// TODO: merge to bellow
function struct2Clipboard(struct) {
	console.assert(!struct.isBlank(), 'Empty struct');

	var selection = {
		atoms: struct.atoms.keys(),
		bonds: struct.bonds.keys(),
		rxnArrows: struct.rxnArrows.keys(),
		rxnPluses: struct.rxnPluses.keys()
	};

	var clipboard = {
		atoms: [],
		bonds: [],
		sgroups: [],
		rxnArrows: [],
		rxnPluses: [],
		chiralFlags: [],
		rgmap: {},
		rgroups: {}
	};

	var mapping = {};
	selection.atoms.each(function (id)
	{
		var new_atom = new Atom(struct.atoms.get(id));
		new_atom.pos = new_atom.pp;
		mapping[id] = clipboard.atoms.push(new Atom(new_atom)) - 1;
	});

	selection.bonds.each(function (id)
	{
		var new_bond = new Bond(struct.bonds.get(id));
		new_bond.begin = mapping[new_bond.begin];
		new_bond.end = mapping[new_bond.end];
		clipboard.bonds.push(new Bond(new_bond));
	});

	var sgroup_list = struct.getSGroupsInAtomSet(selection.atoms);

	util.each(sgroup_list, function (sid){
		var sgroup = struct.sgroups.get(sid);
		var sgAtoms = SGroup.getAtoms(struct, sgroup);
		var sgroup_info = {
			type: sgroup.type,
			attrs: sgroup.getAttrs(),
			atoms: util.array(sgAtoms),
			pp: sgroup.pp
		};

		for (var i = 0; i < sgroup_info.atoms.length; i++)
			sgroup_info.atoms[i] = mapping[sgroup_info.atoms[i]];

		clipboard.sgroups.push(sgroup_info);
	}, this);

	selection.rxnArrows.each(function (id)
	{
		var arrow = new Struct.RxnArrow(struct.rxnArrows.get(id));
		arrow.pos = arrow.pp;
		clipboard.rxnArrows.push(arrow);
	});

	selection.rxnPluses.each(function (id)
	{
		var plus = new Struct.RxnPlus(struct.rxnPluses.get(id));
		plus.pos = plus.pp;
		clipboard.rxnPluses.push(plus);
	});

	// r-groups
	var atomFragments = {};
	var fragments = Set.empty();
	selection.atoms.each(function (id) {
		var atom = struct.atoms.get(id);
		var frag = atom.fragment;
		atomFragments[id] = frag;
		Set.add(fragments, frag);
	});

	var rgids = Set.empty();
	Set.each(fragments, function (frid){
		var atoms = Struct.Fragment.getAtoms(struct, frid);
		for (var i = 0; i < atoms.length; ++i)
			if (!Set.contains(atomFragments, atoms[i]))
				return;
		var rgid = Struct.RGroup.findRGroupByFragment(struct.rgroups, frid);
		clipboard.rgmap[frid] = rgid;
		Set.add(rgids, rgid);
	}, this);

	Set.each(rgids, function (id){
		clipboard.rgroups[id] = struct.rgroups.get(id).getAttrs();
	}, this);

	return clipboard;
}

function fromPaste (struct, point) {
	var clipboard = struct2Clipboard(struct);
	var offset = point ? Vec2.diff(point, getAnchorPosition(clipboard)) : new Vec2();
	var action = new Action(), amap = {}, fmap = {};
	// atoms
	for (var aid = 0; aid < clipboard.atoms.length; aid++) {
		var atom = Object.clone(clipboard.atoms[aid]);
		if (!(atom.fragment in fmap)) {
			fmap[atom.fragment] = action.addOp(new op.FragmentAdd().perform(ui.editor)).frid;
		}
		atom.fragment = fmap[atom.fragment];
		amap[aid] = action.addOp(new op.AtomAdd(atom, atom.pp.add(offset)).perform(ui.editor)).data.aid;
	}

	var rgnew = [];
	for (var rgid in clipboard.rgroups) {
		if (!ui.ctab.rgroups.has(rgid)) {
			rgnew.push(rgid);
		}
	}

	// assign fragments to r-groups
	for (var frid in clipboard.rgmap) {
		action.addOp(new op.RGroupFragment(clipboard.rgmap[frid], fmap[frid]).perform(ui.editor));
	}

	for (var i = 0; i < rgnew.length; ++i) {
		action.mergeWith(fromRGroupAttrs(rgnew[i], clipboard.rgroups[rgnew[i]]));
	}

	//bonds
	for (var bid = 0; bid < clipboard.bonds.length; bid++) {
		var bond = Object.clone(clipboard.bonds[bid]);
		action.addOp(new op.BondAdd(amap[bond.begin], amap[bond.end], bond).perform(ui.editor));
	}
	//sgroups
	for (var sgid = 0; sgid < clipboard.sgroups.length; sgid++) {
		var sgroup_info = clipboard.sgroups[sgid];
		var atoms = sgroup_info.atoms;
		var sgatoms = [];
		for (var sgaid = 0; sgaid < atoms.length; sgaid++) {
			sgatoms.push(amap[atoms[sgaid]]);
		}
		var newsgid = ui.render.ctab.molecule.sgroups.newId();
		var sgaction = fromSgroupAddition(sgroup_info.type, sgatoms, sgroup_info.attrs, newsgid, sgroup_info.pp ? sgroup_info.pp.add(offset) : null);
		for (var iop = sgaction.operations.length - 1; iop >= 0; iop--) {
			action.addOp(sgaction.operations[iop]);
		}
	}
	//reaction arrows
	if (ui.editor.render.ctab.rxnArrows.count() < 1) {
		for (var raid = 0; raid < clipboard.rxnArrows.length; raid++) {
			action.addOp(new op.RxnArrowAdd(clipboard.rxnArrows[raid].pp.add(offset)).perform(ui.editor));
		}
	}
	//reaction pluses
	for (var rpid = 0; rpid < clipboard.rxnPluses.length; rpid++) {
		action.addOp(new op.RxnPlusAdd(clipboard.rxnPluses[rpid].pp.add(offset)).perform(ui.editor));
	}
	//thats all
	action.operations.reverse();
	return action;
};

function fromFlip (objects, flip) {
	var render = ui.render;
	var ctab = render.ctab;
	var molecule = ctab.molecule;

	var action = new Action();
	var i;
	var fids = {};

	if (objects.atoms) {
		for (i = 0; i < objects.atoms.length; i++) {
			var aid = objects.atoms[i];
			var atom = molecule.atoms.get(aid);
			if (!(atom.fragment in fids)) {
				fids[atom.fragment] = [aid];
			} else {
				fids[atom.fragment].push(aid);
			}
		}

		fids = new Hash(fids);

		if (fids.detect(function (frag) {
			return !Set.eq(molecule.getFragmentIds(frag[0]), Set.fromList(frag[1]));
		})) {
			return action; // empty action
		}

		fids.each(function (frag) {
			var fragment = Set.fromList(frag[1]);
			//var x1 = 100500, x2 = -100500, y1 = 100500, y2 = -100500;
			var bbox = molecule.getCoordBoundingBox(fragment);

			Set.each(fragment, function (aid) {
				var atom = molecule.atoms.get(aid);
				var d = new Vec2();

				if (flip == 'horizontal') {
					d.x = bbox.min.x + bbox.max.x - 2 * atom.pp.x;
				} else { // 'vertical'
					d.y = bbox.min.y + bbox.max.y - 2 * atom.pp.y;
				}

				action.addOp(new op.AtomMove(aid, d));
			});
		});

		if (objects.bonds) {
			for (i = 0; i < objects.bonds.length; i++) {
				var bid = objects.bonds[i];
				var bond = molecule.bonds.get(bid);

				if (bond.type == Bond.PATTERN.TYPE.SINGLE) {
					if (bond.stereo == Bond.PATTERN.STEREO.UP) {
						action.addOp(new op.BondAttr(bid, 'stereo', Bond.PATTERN.STEREO.DOWN));
					} else if (bond.stereo == Bond.PATTERN.STEREO.DOWN) {
						action.addOp(new op.BondAttr(bid, 'stereo', Bond.PATTERN.STEREO.UP));
					}
				}
			}
		}
	}

	return action.perform();
};

function fromRotate (objects, pos, angle) {
	var render = ui.render;
	var ctab = render.ctab;
	var molecule = ctab.molecule;

	var action = new Action();
	var i;
	var fids = {};

	function rotateDelta(v)
	{
		var v1 = v.sub(pos);
		v1 = v1.rotate(angle);
		v1.add_(pos);
		return v1.sub(v);
	}

	if (objects.atoms) {
		objects.atoms.each(function (aid) {
			var atom = molecule.atoms.get(aid);
			action.addOp(new op.AtomMove(aid, rotateDelta(atom.pp)));
		});
	}

	if (objects.rxnArrows) {
		objects.rxnArrows.each(function (aid) {
			var arrow = molecule.rxnArrows.get(aid);
			action.addOp(new op.RxnArrowMove(aid, rotateDelta(arrow.pp)));
		});
	}

	if (objects.rxnPluses) {
		objects.rxnPluses.each(function (pid) {
			var plus = molecule.rxnPluses.get(pid);
			action.addOp(new op.RxnPlusMove(pid, rotateDelta(plus.pp)));
		});
	}

	if (objects.sgroupData) {
		objects.sgroupData.each(function (did) {
			var data = molecule.sgroups.get(did);
			action.addOp(new op.SGroupDataMove(did, rotateDelta(data.pp)));
		});
	}

	if (objects.chiralFlags) {
		objects.chiralFlags.each(function (fid) {
			var flag = molecule.chiralFlags.get(fid);
			action.addOp(new op.ChiralFlagMove(fid, rotateDelta(flag.pp)));
		});
	}

	return action.perform();
};

module.exports = util.extend(Action, {
	fromMultipleMove: fromMultipleMove,
	fromAtomAddition: fromAtomAddition,
	fromArrowAddition: fromArrowAddition,
	fromArrowDeletion: fromArrowDeletion,
	fromChiralFlagDeletion: fromChiralFlagDeletion,
	fromPlusAddition: fromPlusAddition,
	fromPlusDeletion: fromPlusDeletion,
	fromAtomDeletion: fromAtomDeletion,
	fromBondDeletion: fromBondDeletion,
	fromFragmentDeletion: fromFragmentDeletion,
	fromAtomMerge: fromAtomMerge,
	fromBondFlipping: fromBondFlipping,
	fromTemplateOnCanvas: fromTemplateOnCanvas,
	fromTemplateOnAtom: fromTemplateOnAtom,
	fromTemplateOnBond: fromTemplateOnBond,
	fromAtomsAttrs: fromAtomsAttrs,
	fromBondAttrs: fromBondAttrs,
	fromChain: fromChain,
	fromBondAddition: fromBondAddition,
	fromNewCanvas: fromNewCanvas,
	fromSgroupType: fromSgroupType,
	fromSgroupDeletion: fromSgroupDeletion,
	fromSgroupAttrs: fromSgroupAttrs,
	fromRGroupFragment: fromRGroupFragment,
	fromPaste: fromPaste,
	fromRGroupAttrs: fromRGroupAttrs,
	fromSgroupAddition: fromSgroupAddition,
	fromFlip: fromFlip,
	fromRotate: fromRotate
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/atom":8,"../chem/bond":9,"../chem/sgroup":15,"../chem/struct":18,"../util":40,"../util/set":43,"../util/vec2":44,"./op":36}],28:[function(require,module,exports){
(function (global){
var keymage = require('keymage');
var element = require('../../chem/element');
var util = require('../../util');
var Action = require('../action');

var ui = global.ui;

function initDialogs () {
	// Label input events
	$('input_label').observe('blur', function () {
		keymage.setScope('editor');
		this.hide();
	});
	$('input_label').observe('keypress', onKeyPress_InputLabel);
	$('input_label').observe('keyup', onKeyUp_InputLabel);

	// Atom properties dialog events
	$('atom_label').observe('change', onChange_AtomLabel);
	$('atom_charge').observe('change', onChange_AtomCharge);
	$('atom_isotope').observe('change', onChange_AtomIsotope);
	$('atom_valence').observe('change', onChange_AtomValence);
	$('atom_prop_cancel').observe('click', function () {
		ui.hideDialog('atom_properties');
	});
	$('atom_prop_ok').observe('click', function () {
		applyAtomProperties();
	});
	$('bond_prop_cancel').observe('click', function () {
		ui.hideDialog('bond_properties');
	});
	$('bond_prop_ok').observe('click', function () {
		applyBondProperties();
	});
};

//
// Atom attachment points dialog
//
function showAtomAttachmentPoints (params) {
	$('atom_ap1').checked = ((params.selection || 0) & 1) > 0;
	$('atom_ap2').checked = ((params.selection || 0) & 2) > 0;
	ui.showDialog('atom_attpoints');
	var _onOk = new Event.Handler('atom_attpoints_ok', 'click', undefined, function () {
		_onOk.stop();
		_onCancel.stop();
		ui.hideDialog('atom_attpoints');
		if ('onOk' in params) {
			params.onOk(($('atom_ap1').checked ? 1 : 0) + ($('atom_ap2').checked ? 2 : 0));
		}
	}).start();
	var _onCancel = new Event.Handler('atom_attpoints_cancel', 'click', undefined, function () {
		_onOk.stop();
		_onCancel.stop();
		ui.hideDialog('atom_attpoints');
		if ('onCancel' in params) {
			params.onCancel();
		}
	}).start();
	$('atom_attpoints_ok').focus();
};

//
// Atom properties dialog
//
function showAtomProperties (id) {
	$('atom_properties').atom_id = id;
	$('atom_label').value = ui.render.atomGetAttr(id, 'label');
	onChange_AtomLabel.call($('atom_label'));
	var value = ui.render.atomGetAttr(id, 'charge') - 0;
	$('atom_charge').value = (value == 0 ? '' : value);
	value = ui.render.atomGetAttr(id, 'isotope') - 0;
	$('atom_isotope').value = (value == 0 ? '' : value);
	value = ui.render.atomGetAttr(id, 'explicitValence') - 0;
	$('atom_valence').value = value < 0 ? '' : value;
	$('atom_radical').value = ui.render.atomGetAttr(id, 'radical');

	$('atom_inversion').value = ui.render.atomGetAttr(id, 'invRet');
	$('atom_exactchange').value = ui.render.atomGetAttr(id, 'exactChangeFlag') ? 1 : 0;
	$('atom_ringcount').value = ui.render.atomGetAttr(id, 'ringBondCount');
	$('atom_substitution').value = ui.render.atomGetAttr(id, 'substitutionCount');
	$('atom_unsaturation').value = ui.render.atomGetAttr(id, 'unsaturatedAtom');
	$('atom_hcount').value = ui.render.atomGetAttr(id, 'hCount');

	ui.showDialog('atom_properties');
	$('atom_label').activate();
};

function applyAtomProperties () {
	ui.hideDialog('atom_properties');

	var id = $('atom_properties').atom_id;

	ui.addUndoAction(Action.fromAtomsAttrs(id,
	{
		label: $('atom_label').value,
		charge: $('atom_charge').value == '' ? 0 : parseInt($('atom_charge').value, 10),
		isotope: $('atom_isotope').value == '' ? 0 : parseInt($('atom_isotope').value, 10),
		explicitValence: $('atom_valence').value == '' ? -1 : parseInt($('atom_valence').value, 10),
		radical: parseInt($('atom_radical').value, 10),
		// reaction flags
		invRet: parseInt($('atom_inversion').value, 10),
		exactChangeFlag: parseInt($('atom_exactchange').value, 10) ? true : false,
		// query flags
		ringBondCount: parseInt($('atom_ringcount').value, 10),
		substitutionCount: parseInt($('atom_substitution').value, 10),
		unsaturatedAtom: parseInt($('atom_unsaturation').value, 10),
		hCount: parseInt($('atom_hcount').value, 10)
	}), true);

	ui.render.update();
};

function onChange_AtomLabel () {
	this.value = this.value.strip().capitalize();

	var elem = element.getElementByLabel(this.value);

	if (
		elem == null && this.value !== 'A' &&
	this.value !== '*' && this.value !== 'Q' && this.value !== 'X' &&
	this.value !== 'R'
	) {
		this.value = ui.render.atomGetAttr($('atom_properties').atom_id, 'label');

		if (this.value !== 'A' && this.value !== '*') {
			elem = element.getElementByLabel(this.value);
		}
	}

	if (this.value == 'A' || this.value == '*') {
		$('atom_number').value = 'any';
	} else if (!elem) {
		$('atom_number').value = '';
	} else {
		$('atom_number').value = elem.toString();
	}
};

function onChange_AtomCharge () {
	if (this.value.strip() === '' || this.value == '0') {
		this.value = '';
	} else if (this.value.match(/^[1-9][0-9]{0,1}[-+]$/)) {
		this.value = (this.value.endsWith('-') ? '-' : '') + this.value.substr(0, this.value.length - 1);
	} else if (!this.value.match(/^[+-]?[1-9][0-9]{0,1}$/)) {
		this.value = ui.render.atomGetAttr($('atom_properties').atom_id, 'charge');
	}
};

function onChange_AtomIsotope () {
	if (this.value == util.getElementTextContent($('atom_number')) || this.value.strip() == '' || this.value == '0') {
		this.value = '';
	} else if (!this.value.match(/^[1-9][0-9]{0,2}$/)) {
		this.value = ui.render.atomGetAttr($('atom_properties').atom_id, 'isotope');
	}
};

function onChange_AtomValence () {
	/*
     if (this.value.strip() == '')
     this.value = '';
     else if (!this.value.match(/^[0-9]$/))
     this.value = ui.render.atomGetAttr($('atom_properties').atom_id, 'valence');
     */
};

//
// Bond properties dialog
//
function showBondProperties (id) {
	var bond;
	$('bond_properties').bond_id = id;

	var type = ui.render.bondGetAttr(id, 'type');
	var stereo = ui.render.bondGetAttr(id, 'stereo');

	for (bond in ui.bondTypeMap) {
		if (ui.bondTypeMap[bond].type == type && ui.bondTypeMap[bond].stereo == stereo) {
			break;
		}
	}

	$('bond_type').value = bond;
	$('bond_topology').value = ui.render.bondGetAttr(id, 'topology') || 0;
	$('bond_center').value = ui.render.bondGetAttr(id, 'reactingCenterStatus') || 0;

	ui.showDialog('bond_properties');
	$('bond_type').activate();
};

function applyBondProperties () {
	ui.hideDialog('bond_properties');

	var id = $('bond_properties').bond_id;
	var bond = Object.clone(ui.bondTypeMap[$('bond_type').value]);

	bond.topology = parseInt($('bond_topology').value, 10);
	bond.reactingCenterStatus = parseInt($('bond_center').value, 10);

	ui.addUndoAction(Action.fromBondAttrs(id, bond), true);

	ui.render.update();
};

//
// Reaction auto-mapping
//

function showAutomapProperties (params) {
	ui.showDialog('automap_properties');
	var _onOk;
	var _onCancel;

	_onOk = new Event.Handler('automap_ok', 'click', undefined, function () {
		_onOk.stop();
		_onCancel.stop();
		if (params && 'onOk' in params) params['onOk']($('automap_mode').value);
		ui.hideDialog('automap_properties');
	}).start();

	_onCancel = new Event.Handler('automap_cancel', 'click', undefined, function () {
		_onOk.stop();
		_onCancel.stop();
		ui.hideDialog('automap_properties');
		if (params && 'onCancel' in params) params['onCancel']();
	}).start();

	$('automap_mode').activate();
};

function showRLogicTable (args) {
	var params = args || {};
	params.rlogic = params.rlogic || {};
	$('rlogic_occurrence').value = params.rlogic.occurrence || '>0';
	$('rlogic_resth').value = params.rlogic.resth ? '1' : '0';
	var ifOptHtml = '<option value="0">Always</option>';
	for (var r = 1; r <= 32; r++) {
		if (r != params.rgid && (params.rgmask & (1 << (r - 1))) != 0) {
			ifOptHtml += '<option value="' + r + '">IF R' + params.rgid + ' THEN R' + r + '</option>';
		}
	}
	$('rlogic_if').outerHTML = '<select id="rlogic_if">' + ifOptHtml + '</select>'; // [RB] thats tricky because IE8 fails to set innerHTML
	$('rlogic_if').value = params.rlogic.ifthen;
	ui.showDialog('rlogic_table');

	var _onOk = new Event.Handler('rlogic_ok', 'click', undefined, function () {
		var result = {
			'occurrence': $('rlogic_occurrence').value
			.replace(/\s*/g, '').replace(/,+/g, ',').replace(/^,/, '').replace(/,$/, ''),
			'resth': $('rlogic_resth').value == '1',
			'ifthen': parseInt($('rlogic_if').value, 10)
		};
		if (!params || !('onOk' in params) || params.onOk(result)) {
			_onOk.stop();
			_onCancel.stop();
			ui.hideDialog('rlogic_table');
		}
	}).start();
	var _onCancel = new Event.Handler('rlogic_cancel', 'click', undefined, function () {
		_onOk.stop();
		_onCancel.stop();
		ui.hideDialog('rlogic_table');
		if (params && 'onCancel' in params) params['onCancel']();
	}).start();

	$('rlogic_occurrence').activate();
};

function onKeyPress_Dialog (event)
{
	util.stopEventPropagation(event);
	if (event.keyCode === 27) {
		ui.hideDialog(this.id);
		return util.preventDefault(event);
	}
};

function onKeyPress_InputLabel (event)
{
	util.stopEventPropagation(event);
	if (event.keyCode == 13) {
		keymage.setScope('editor');
		this.hide();

		var label = '';
		var charge = 0;
		var value_arr = this.value.toArray();

		if (this.value == '*') {
			label = 'A';
		}
		else if (this.value.match(/^[*][1-9]?[+-]$/i)) {
			label = 'A';

			if (this.value.length == 2)
				charge = 1;
			else
				charge = parseInt(value_arr[1]);

			if (value_arr[2] == '-')
				charge *= -1;
		}
		else if (this.value.match(/^[A-Z]{1,2}$/i)) {
			label = this.value.capitalize();
		}
		else if (this.value.match(/^[A-Z]{1,2}[0][+-]?$/i)) {
			if (this.value.match(/^[A-Z]{2}/i))
				label = this.value.substr(0, 2).capitalize();
			else
				label = value_arr[0].capitalize();
		}
		else if (this.value.match(/^[A-Z]{1,2}[1-9]?[+-]$/i)) {
			if (this.value.match(/^[A-Z]{2}/i))
				label = this.value.substr(0, 2).capitalize();
			else
				label = value_arr[0].capitalize();

			var match = this.value.match(/[0-9]/i);

			if (match != null)
				charge = parseInt(match[0]);
			else
				charge = 1;

			if (value_arr[this.value.length - 1] == '-')
				charge *= -1;
		}

		if (label == 'A' || label == 'Q' || label == 'X' || label == 'R' || element.getElementByLabel(label) != null) {
			ui.addUndoAction(Action.fromAtomsAttrs(this.atom_id, {label: label, charge: charge}), true);
			ui.render.update();
		}
		return util.preventDefault(event);
	}
	if (event.keyCode == 27) {
		this.hide();
		keymage.setScope('editor');
		return util.preventDefault(event);
	}
};

function onKeyUp_InputLabel (event)
{
	util.stopEventPropagation(event);
	if (event.keyCode == 27) {
		this.hide();
		keymage.setScope('editor');
		return util.preventDefault(event);
	}
};

function showLabelEditor (aid)
{
	// TODO: RB: to be refactored later, need to attach/detach listeners here as anon-functions, not on global scope (onKeyPress_InputLabel, onBlur, etc)
	var input_el = $('input_label');
	keymage.setScope('label');

	var offset = Math.min(7 * ui.render.zoom, 16);

	input_el.atom_id = aid;
	input_el.value = ui.render.atomGetAttr(aid, 'label');
	input_el.style.fontSize = offset * 2 + 'px';

	input_el.show();

	var atom_pos = ui.render.obj2view(ui.render.atomGetPos(aid));
	// TODO: some other way to handle pos
	//var offset_client = ui.client_area.cumulativeOffset();
	var offset_client = {left: 0, top: 0};
	var offset_parent = Element.cumulativeOffset(input_el.offsetParent);
	var d = 0; // TODO: fix/Math.ceil(4 * ui.abl() / 100);
	input_el.style.left = (atom_pos.x + offset_client.left - offset_parent.left - offset - d) + 'px';
	input_el.style.top = (atom_pos.y + offset_client.top - offset_parent.top - offset - d) + 'px';

	input_el.activate();
};

module.exports = {
	initDialogs: initDialogs,
	showAtomAttachmentPoints: showAtomAttachmentPoints,
	showAtomProperties: showAtomProperties,
	showBondProperties: showBondProperties,
	showAutomapProperties: showAutomapProperties,
	showRLogicTable: showRLogicTable,
	showLabelEditor: showLabelEditor
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../../chem/element":12,"../../util":40,"../action":27,"keymage":2}],29:[function(require,module,exports){
(function (global){
var Promise = require('promise-polyfill');
// var base64 = require('base64-js');

var ui = global.ui;

function dialog (params) {
	var dlg = ui.showDialog('open-file');
	var okButton = dlg.select('input[value=OK]')[0];
	var textInput = dlg.select('textarea')[0];
	var fileInput = dlg.select('input[type=file]')[0];
	var fragmentInput = dlg.select('input[name=fragment]')[0];
	var readFile;
	var handlers = [];

	handlers[0] = dlg.on('click', 'input[type=button]', function (_, button) {
		handlers.forEach(function (h) { h.stop(); });
		ui.hideDialog('open-file');

		var key = 'on' + button.value.capitalize();
		if (params && key in params) {
			// TODO: generalize to form serialization
			params[key]({
				fragment: fragmentInput.checked,
				value: textInput.value
			});
		}
	});

	handlers[1] = fileInput.on('change', function (_, input) {
		console.assert(readFile, 'No valid file opener');
		if (input.files.length) {
			dlg.select('input').each(function (el) {
				el.disabled = true;
			});
			readFile(input.files[0]).then(function (content) {
				textInput.value = content;
				dlg.select('input').each(function (el) {
					el.disabled = false;
				});
			}, ui.echo);
		}
	});

	handlers[2] = textInput.on('input', function (_, input) {
		var text = textInput.value.trim();
		okButton.disabled = !text;
	});

	textInput.value = '';
	fragmentInput.checked = false;
	okButton.disabled = true;

	fileInput.disabled = true;
	fileInput.parentNode.addClassName('disabled');
	fileOpener().then(function (f) {
		readFile = f;
		fileInput.disabled = false;
		fileInput.parentNode.removeClassName('disabled');
	});
};

function fileOpener () {
	function throughFileReader(file) {
		return new Promise(function (resolve, reject) {
			var rd = new FileReader();
			rd.onload = function (event) {
				resolve(event.target.result);
			};
			rd.onerror = function (event) {
				reject(event);
			};
			rd.readAsText(file, 'UTF-8');
		});
	}
	function throughFileSystemObject(fso, file) {
		// IE9 and below
		var fd =  fso.OpenTextFile(file.name, 1),
		content = fd.ReadAll();
		fd.Close();
		return content;
	}
	function throughForm2IframePosting(file) {
	}
	return new Promise(function (resolve, reject) {
		// TODO: refactor return
		if (global.FileReader)
			return resolve(throughFileReader);

		if (global.ActiveXObject) {
			try {
				var fso = new global.ActiveXObject('Scripting.FileSystemObject');
				return resolve(function (file) {
					return Promise.resolve(throughFileSystemObject(fso, file));
				});
			} catch (e) {
				}
		}

		if (ui.standalone)
			return reject('Standalone mode!');
		return resolve(throughForm2IframePosting);
	});
}

function loadHook() {
	// Called from iframe's 'onload'
}

// basicaly hack to export just the dialog func
dialog.loadHook = loadHook;
module.exports = dialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"promise-polyfill":3}],30:[function(require,module,exports){
(function (global){
var Promise = require('promise-polyfill');
var fs = require('filesaver.js');

var molfile = require('../../chem/molfile');
var smiles = require('../../chem/smiles');

var ui = global.ui;

function saveDialog (params, server) {
	var dlg = ui.showDialog('save-file'),
	output = dlg.select('textarea')[0],
	formatInput = dlg.select('select')[0],
	saveButton = dlg.select('.save')[0],
	saveFile,
	handlers = [];

	function outputMolecule(text, format) {
		format = format || 'mol';
		output.value = text;
		output.className = format;
		output.activate();
	}

	handlers[0] = dlg.on('click', 'input[type=button]', function (_, button) {
		handlers.forEach(function (h) { h.stop(); });
		ui.hideDialog('save-file');

		var key = 'on' + button.value.capitalize();
		if (params && key in params) {
			params[key]({});
		}
	});

	handlers[1] = formatInput.on('change', function (_, input) {
		var format = formatInput.value;
		convertMolecule(server, params.molecule, format).then(function (res) {
			outputMolecule(res, format);
		}, ui.echo);
	});

	handlers[2] = saveButton.on('click', function (event) {
		if (saveFile) {
			saveFile(output.value, formatInput.value);
			dlg.select('input[type=button]')[0].click();
		}
		event.preventDefault();
	});

	outputMolecule(molfile.stringify(params.molecule));
	saveButton.addClassName('disabled');
	fileSaver(server).then(function (f) {
		saveFile = f;
		saveButton.removeClassName('disabled');
	});
	formatInput.select('[value=inchi]')[0].disabled = ui.standalone;
};

function fileSaver (server) {
	var mimemap = {
		'smi': 'chemical/x-daylight-smiles',
		'mol': 'chemical/x-mdl-molfile',
		'rxn': 'chemical/x-mdl-rxnfile',
		'inchi': 'chemical/x-inchi'
	};
	return new Promise(function (resolve, reject) {
		if (global.Blob && fs.saveAs)
			resolve(function (data, type) {
				if (type == 'mol' && data.indexOf('$RXN') == 0)
					type = 'rxn';
				console.assert(mimemap[type], 'Unknown chemical file type');
				var blob = new Blob([data], {type: mimemap[type] });
				fs.saveAs(blob, 'ketcher.' + type);
			});
		else if (ui.standalone)
			reject('Standalone mode!');
		else
			resolve(function (data, type) {
				server.save({filedata: [type, data].join('\n')});
			});
	});
};

function convertMolecule (server, molecule, format) {
	return new Promise(function (resolve, reject) {
		var moldata = molfile.stringify(molecule);
		if (format == 'mol') {
			resolve(moldata);
		}
		else if (format == 'smi') {
			resolve(smiles.stringify(molecule));
		}
		else if (format == 'inchi') {
			if (ui.standalone)
				throw Error('InChI is not supported in the standalone mode');

			if (molecule.rgroups.count() !== 0)
				ui.echo('R-group fragments are not supported and will be discarded');
			molecule = molecule.getScaffold();
			if (molecule.atoms.count() === 0)
				resolve('');
			else {
				molecule = molecule.clone();
				molecule.sgroups.each(function (sgid, sg) {
					// ? Not sure we should check it client side
					if (sg.type != 'MUL' && !/^INDIGO_.+_DESC$/i.test(sg.data.fieldName))
						throw Error('InChi data format doesn\'t support s-groups');
				});

				resolve(server.inchi({ moldata: moldata }));
			}
		}
	});
}

module.exports = saveDialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../../chem/molfile":13,"../../chem/smiles":16,"filesaver.js":1,"promise-polyfill":3}],31:[function(require,module,exports){
(function (global){
var ui = global.ui;

function dialog (name, params) {
	var dlg = ui.showDialog(name);
	var okButton = dlg.select('input[value=OK]')[0];
	var mode = params.mode || 'single';
	var handlers = [];

	function setSelected(values) {
		dlg.select('.selected').each(function (button) {
			button.removeClassName('selected');
		});
		if (values) {
			dlg.select('button').each(function (button) {
				var value = button.value || button.textContent || button.innerText;
				if (values.indexOf(value) >= 0) {
					button.addClassName('selected');
				}
			});
		} else if (params.required) {
			okButton.disabled = true;
		}
	}

	function getSelected() {
		var values = [];
		dlg.select('.selected').each(function (button) {
			var value = button.value || button.textContent || button.innerText;
			values.push(value);
		});
		return values;
	}

	handlers[0] = dlg.on('click', 'input[type=button]', function (_, button) {
		handlers.forEach(function (h) { h.stop(); });
		ui.hideDialog(name);

		var key = 'on' + button.value.capitalize();

		console.assert(key != 'onOk' || !params.required ||
		               getSelected().length != 0,
		               'No elements selected');
		if (params && key in params) {
			params[key]({
				mode: mode,
				values: getSelected()
			});
		}
	});

	handlers[1] = dlg.on('click', 'button', function (event, button) {
		if (mode === 'single') {
			if (!button.hasClassName('selected')) {
				setSelected(null);
			} else if (params.required) {
				okButton.click();
			}
		}

		button.toggleClassName('selected');
		if (params.required) {
			okButton.disabled = dlg.select('.selected').length === 0;
		}
		event.stop();
	});

	handlers[2] = dlg.on('click', 'input[name=mode]', function (_, radio) {
		if (radio.value != mode) {
			if (radio.value == 'single') {
				setSelected(null);
			}
			mode = radio.value;
		}
	});

	setSelected(params.values);
	dlg.select('input[name=mode]').each(function (radio) {
		if (radio.value == mode) {
			radio.checked = true;
		}
	});
}

module.exports = dialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],32:[function(require,module,exports){
(function (global){
var util = require('../../util');

var ui = global.ui;

function dialog (params) {
	var dlg = ui.showDialog('sgroup_special');
	var cache = {};
	var handlers = [];

	console.assert(!params.type || params.type == 'DAT');
	console.assert(!params.type || params.attrs.fieldName);

	var context = params.type && matchContext(params.attrs.fieldName, params.attrs.fieldValue) ||
		          params.context || 'Fragment';
	setContext(context, cache, true);
	if (params.attrs.fieldName)
		setField(params.attrs.fieldName, cache, true);

	$('sgroup_special_value').value = params.attrs.fieldValue;
	if (params.attrs.attached)
		$('sgroup_special_attached').checked = true;
	else if (params.attrs.absolute)
		$('sgroup_special_absolute').checked = true;
	else
		$('sgroup_special_relative').checked = true;

	handlers[0] = dlg.on('click', 'input[type=button]', function (_, button) {
		var key = 'on' + button.value.capitalize();
		var res = key != 'onOk' || getValidateAttrs();
		if (res) {
			handlers.forEach(function (h) { h.stop(); });
			ui.hideDialog('sgroup_special');
			if (key in params && res)
				params[key](res);
		}
	});

	handlers[1] = dlg.on('change', 'select', function (_, select) {
		if (select.id == 'sgroup_context')
			setContext($('sgroup_context').value, cache);
		if (select.id == 'sgroup_special_name')
			setField($('sgroup_special_name').value, cache);
	});
};

function getValidateAttrs() {
	var attrs = {
		mul: null,
		connectivity: '',
		name: '',
		subscript: ''
	};

	attrs.fieldName = $('sgroup_special_name').value.strip();
	attrs.fieldValue = $('sgroup_special_value').value.strip();
	attrs.absolute = $('sgroup_special_absolute').checked;
	attrs.attached = $('sgroup_special_attached').checked;

	if (attrs.fieldValue == '') {
		alert('Please, specify data field value.');
		return null;
	}

	return { type: 'DAT',
	         attrs: attrs };
};

function setContext(context, cache, force) {
	console.info('set context:', context, cache);
	console.assert(cache.context || force, 'Field setup should be forced');
	if (force || context != cache.context.name) {
		cache.context = util.find(special_choices, function (opt) {
			return opt.name == context;
		});
		console.assert(cache.context, 'Can\'t find such context');
		var str = cache.context.value.reduce(function (res, opt) {
			return res + '<option value="' + opt.name + '">' + opt.name + "</option>";
		}, '');
		$('sgroup_special_name').update(str);
		setField(cache.context.value[0].name, cache, true);
		if (force)
			$('sgroup_context').value = context;
	}
}

function setField(field, cache, force) {
	console.info('set field:', field, cache);
	console.assert(cache.field || force, 'Field setup should be forced');
	if (field || field != cache.field.name) {
		cache.field = util.find(cache.context.value, function (opt) {
			return opt.name == field;
		});
		console.assert(cache.field, 'Can\'t find such field');
		if (!cache.field.value)
			$('sgroup_special_value').outerHTML = '<textarea id="sgroup_special_value"></textarea>';
		else {
			var str = cache.field.value.reduce(function (res, opt) {
				return res + '<option value="' + opt + '">' + opt + "</option>";
			}, '');
			$('sgroup_special_value').outerHTML = '<select size="10" id="sgroup_special_value">' + str + '</select>';
		}
		$('sgroup_special_name').value = field;
	}
}

function matchContext(field, value) {
	console.info('search:', util.unicodeLiteral(field), util.unicodeLiteral(value));
	var c = util.find(special_choices, function(c) {
		var f = util.find(c.value, function(f) {
			return f.name == field;
		});
		if (!f)
			return false;
		return !value || !f.value || !!util.find(f.value, function(v) {
			return v == value;
		});
	});
	return c && c.name;
}

var special_choices = [
	{ name: 'Fragment',
	  value: [
		  { name: 'MDLBG_FRAGMENT_STEREO',
		    value: [
			'abs',
			'(+)-enantiomer',
			'(-)-enantiomer',
			'steric',
			'rel',
			'R(a)',
			'S(a)',
			'R(p)',
			'S(p)'
		    ]},
		  { name: 'MDLBG_FRAGMENT_COEFFICIENT',
		    value: null},
		  { name: 'MDLBG_FRAGMENT_CHARGE',
		    value: null },
		  { name: 'MDLBG_FRAGMENT_RADICALS',
		    value: null },
	]},
	{ name: 'Single Bond',
	  value: [
		  { name: 'MDLBG_STEREO_KEY',
		    value: [
			'erythro',
			'threo',
			'alpha',
			'beta',
			'endo',
			'exo',
			'anti',
			'syn',
			'ECL',
			'STG'
		    ]},
		  { name: 'MDLBG_BOND_KEY',
		    value: [
			    'Value=4'
		    ]},
	]},
	{ name: 'Atom',
	  value: [
		  { name: 'MDLBG_STEREO_KEY',
		    value: [
			'RS',
			'SR',
			'P-3',
			'P-3-PI',
			'SP-4',
			'SP-4-PI',
			'T-4',
			'T-4-PI',
			'SP-5',
			'SP-5-PI',
			'TB-5',
			'TB-5-PI',
			'OC-6',
			'TB-5-PI',
			'TP-6',
			'PB-7',
			'CU-8',
			'SA-8',
			'DD-8',
			'HB-9',
			'TPS-9',
			'HB-9'
		]}
	]},
	{ name: 'Group',
	  value: [
		  { name: 'MDLBG_STEREO_KEY',
		    value: [
			'cis',
			'trans'
		    ]}
	  ]}
];

dialog.match = function (params) {
	return !params.type ||
		params.type == 'DAT' && !!matchContext(params.attrs.fieldName, params.attrs.fieldValue);
};

module.exports = dialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../../util":40}],33:[function(require,module,exports){
(function (global){
// TODO: exclude from no-groups build
var ui = global.ui;

function dialog (params) {
	var dlg = ui.showDialog('sgroup_properties');
	var type = params.type || 'GEN';

	$('sgroup_type').value = type;
	$('sgroup_type').activate();
	onChange_SGroupType.call($('sgroup_type'));

	switch (type) {
	case 'SRU':
		$('sgroup_connection').value = params.attrs.connectivity;
		$('sgroup_label').value = params.attrs.subscript;
		break;
	case 'MUL':
		$('sgroup_label').value = params.attrs.mul;
		break;
	case 'SUP':
		$('sgroup_label').value = params.attrs.name;
		break;
	case 'DAT':
		$('sgroup_field_name').value = params.attrs.fieldName;
		$('sgroup_field_value').value = params.attrs.fieldValue;
		if (params.attrs.attached)
			$('sgroup_pos_attached').checked = true;
		else if (params.attrs.absolute)
			$('sgroup_pos_absolute').checked = true;
		else
			$('sgroup_pos_relative').checked = true;
			break;
		default:
			break;
	}

	if (type != 'DAT') {
		$('sgroup_field_name').value = '';
		$('sgroup_field_value').value = '';
	}

	var handlers = [];
	handlers[0] = dlg.on('click', 'input[type=button]', function (_, button) {
		var key = 'on' + button.value.capitalize();
		var res = key != 'onOk' || getValidateAttrs();
		if (res) {
			handlers.forEach(function (h) { h.stop(); });
			ui.hideDialog('sgroup_properties');
			if (key in params && res)
				params[key](res);
		}
	});

	handlers[1] = $('sgroup_type').on('change', onChange_SGroupType);
	handlers[2] = $('sgroup_label').on('change', onChange_SGroupLabel);
};

function getValidateAttrs() {
	var type = $('sgroup_type').value;
	var attrs = {
		mul: null,
		connectivity: '',
		name: '',
		subscript: '',
		fieldName: '',
		fieldValue: '',
		attached: false,
		absolute: false
	};

	switch (type) {
	case 'SRU':
		attrs.connectivity = $('sgroup_connection').value.strip();
		attrs.subscript = $('sgroup_label').value.strip();
		if (attrs.subscript.length != 1 || !attrs.subscript.match(/^[a-zA-Z]$/)) {
			alert(attrs.subscript.length ? 'SRU subscript should consist of a single letter.' : 'Please provide an SRU subscript.');
			return null;
		}
		break;
	case 'MUL':
		attrs.mul = parseInt($('sgroup_label').value);
		break;
	case 'SUP':
		attrs.name = $('sgroup_label').value.strip();
		if (!attrs.name) {
			alert('Please provide a name for the superatom.');
			return null;
		}
		break;
	case 'DAT':
		attrs.fieldName = $('sgroup_field_name').value.strip();
		attrs.fieldValue = $('sgroup_field_value').value.strip();
		attrs.absolute = $('sgroup_pos_absolute').checked;
		attrs.attached = $('sgroup_pos_attached').checked;

		if (attrs.fieldName == '' || attrs.fieldValue == '') {
			alert('Please, specify data field name and value.');
			return null;
		}
		break;
	}
	return { type: type,
	         attrs: attrs };
};

function onChange_SGroupLabel ()
{
	if ($('sgroup_type').value == 'MUL' && !this.value.match(/^[1-9][0-9]{0,2}$/))
		this.value = '1';
};

function onChange_SGroupType ()
{
	var type = $('sgroup_type').value;
	if (type == 'DAT') {
		$$('#sgroup_properties .base')[0].hide();
		$$('#sgroup_properties .data')[0].show();
		return;
	}
	$$('#sgroup_properties .base')[0].show();
	$$('#sgroup_properties .data')[0].hide();

	$('sgroup_label').disabled = (type != 'SRU') && (type != 'MUL') && (type != 'SUP');
	$('sgroup_connection').disabled = (type != 'SRU');

	if (type == 'MUL' && !$('sgroup_label').value.match(/^[1-9][0-9]{0,2}$/))
		$('sgroup_label').value = '1';
	else if (type == 'SRU')
		$('sgroup_label').value = 'n';
	else if (type == 'GEN' || type == 'SUP')
		$('sgroup_label').value = '';
}

module.exports = dialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],34:[function(require,module,exports){
(function (global){
var Promise = require('promise-polyfill');
require('../../rnd');

var ajax = require('../../util/ajax.js');
var molfile = require('../../chem/molfile');

var ui = global.ui;
var rnd = global.rnd;

// TODO: move to Molfile
function parseSdf (sdf) {
	var items = sdf.split(/^[$][$][$][$]$/m);
	var parsed = [];

	items.each(function (item) {
		item = item.replace(/\r/g, '');
		item = item.strip();
		var end_idx = item.indexOf('M  END');

		if (end_idx == -1) {
			return;
		}

		var iparsed = {};

		iparsed.molfile = item.substring(0, end_idx + 6);
		iparsed.name = item.substring(0, item.indexOf('\n')).strip();
		item = item.substr(end_idx + 7).strip();

		var entries = item.split(/^$/m);

		entries.each(function (entry) {
			entry = entry.strip();
			if (!entry.startsWith('> <')) {
				return;
			}
			var lines = entry.split('\n');
			var field = lines[0].strip().substring(3, lines[0].lastIndexOf('>')).strip();

			iparsed[field] = parseInt(lines[1].strip()) || lines[1].strip();
		});
		parsed.push(iparsed);
	});

	return parsed;
}

function fetchTemplateCustom (base_url) {
	return ajax(base_url + 'templates.sdf').then(function (xhr) {
		//headers: {Accept: 'application/octet-stream'}
		var items = parseSdf(xhr.responseText);

		var templates = [];
		var i = 0;
		items.each(function (item) {
			templates.push({
				name: (item.name || ('customtemplate ' + (++i))).capitalize(),
				molfile: item.molfile,
				aid: (item.atomid || 1) - 1,
				bid: (item.bondid || 1) - 1
			});
		});

		return templates;
	});
};

var custom_templates;
function initTemplateCustom (el, base_url) {
	return fetchTemplateCustom(base_url).then(function (templates) {
		custom_templates = templates;
		return eachAsync(templates, function (tmpl, _) {
			var li =  new Element('li');
			li.title = tmpl.name;
			el.insert({ bottom: li });
			var mol = molfile.parse(tmpl.molfile),
			render = new rnd.Render(li, 0, {
				'autoScale': true,
				'autoScaleMargin': 0,
				//'debug': true,
				'ignoreMouseEvents': true,
				'hideChiralFlag': true,
				'maxBondLength': 30
			});
			render.setMolecule(mol);
			render.update();
		}, 50);
	});
}

function eachAsync(list, process, timeGap, startTimeGap) {
	return new Promise(function (resolve) {
		var i = 0;
		var n = list.length;
		function iterate() {
			if (i < n) {
				process(list[i], i++);
				setTimeout(iterate, timeGap);
			} else {
				resolve();
			}
		}
		setTimeout(iterate, startTimeGap || timeGap);
	});
};

function dialog (base_url, params) {
	var dlg = ui.showDialog('custom_templates'),
	selectedLi = dlg.select('.selected')[0],
	okButton = dlg.select('[value=OK]')[0],
	ul = dlg.select('ul')[0];

	if (ul.children.length === 0) { // first time
		$('loading').style.display = '';
		dlg.addClassName('loading');
		var loading = initTemplateCustom(ul, base_url).then(function () {
			$('loading').style.display = 'none';
			dlg.removeClassName('loading');
		});

		loading.then(function () {
			okButton.disabled = true;
			dlg.on('click', 'li', function (_, li) {
				if (selectedLi == li)
					okButton.click();
				else {
					if (selectedLi)
						selectedLi.removeClassName('selected');
					else
						okButton.disabled = false;
					li.addClassName('selected');
					selectedLi = li;
				}
			});
			dlg.on('click', 'input', function (_, input) {
				var mode = input.value,
				key = 'on' + input.value.capitalize(),
				res;
				if (mode == 'OK') {
					console.assert(selectedLi, 'No element selected');
					var ind = selectedLi.previousSiblings().size();
					res = custom_templates[ind];
				}
				ui.hideDialog('custom_templates');
				if (params && key in params)
					params[key](res);
			});
		});
	}
};

module.exports = dialog;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../../chem/molfile":13,"../../rnd":22,"../../util/ajax.js":38,"promise-polyfill":3}],35:[function(require,module,exports){
(function (global){
var ui = global.ui = {};

require('../rnd');

var rnd = global.rnd;

var Promise = require('promise-polyfill');
var keymage = require('keymage');

var Set = require('../util/set');
var Vec2 = require('../util/vec2');
var util = require('../util');
var Action = require('./action.js');

var templates = require('./templates');

var element = require('../chem/element');
var Struct = require('../chem/struct');
var Atom = require('../chem/atom');
var Bond = require('../chem/bond');
var molfile = require('../chem/molfile');
var smiles = require('../chem/smiles');
var SGroup = require('../chem/sgroup');

var Editor = require('../rnd/editor');

var openDialog = require('./dialog/open.js');
var saveDialog = require('./dialog/save.js');
var selectDialog = require('./dialog/select');
var templatesDialog = require('./dialog/templates');
var sgroupDialog = require('./dialog/sgroup');
var sgroupSpecialDialog = require('./dialog/sgroup-special');
var obsolete = require('./dialog/obsolete');

var SCALE = 40;  // const
var HISTORY_LENGTH = 32;

var undoStack = [];
var redoStack = [];

var ketcherWindow;
var toolbar;
var lastSelected;
var clientArea = null;
var dropdownOpened;
var zspObj;
var server;

var serverActions = ['cleanup', 'arom', 'dearom', 'calc-cip',
                     'reaction-automap', 'template-custom'];
var clipActions = ['cut', 'copy', 'paste'];

function init (options, apiServer) {
	ketcherWindow = $$('[role=application]')[0] || $$('body')[0];
	toolbar = ketcherWindow.select('[role=toolbar]')[0];
	clientArea = $('canvas');
	server = apiServer;

	updateServerButtons();
	if (server) { // && ['http:', 'https:'].indexOf(window.location.protocol) >= 0) {
		// don't try to knock if the file is opened locally ("file:" protocol)
		// TODO: check when this is nesessary
		server.knocknock().then(function (res) {
			ui.standalone = false;
			updateServerButtons();
		}, function (val) {
			document.title += ' (standalone)';
			// TODO: echo instead
		}).then(function () {
			// TODO: move it out there as server incapsulates
			// standalone
			if (options.mol) {
				loadMolecule(options.mol);
			}
		});
	}

	obsolete.initDialogs();

	// Button events
	var keyMap = {};
	toolbar.select('button').each(function (el) {
		// window.status onhover?
		var caption =  el.textContent || el.innerText;
		var kd = el.dataset ? el.dataset.keys : el.getAttribute('data-keys');
		if (!kd)
			el.title = el.title || caption;
		else {
			var keys = kd.split(',').map(function (s) { return s.strip(); });
			var mk = shortcutStr(keys[0]);
			var action = el.parentNode.id;
			el.title = (el.title || caption) + ' (' + mk + ')';
			el.innerHTML += ' <kbd>' + mk + '</kbd>';

			keys.forEach(function (kb) {
				var nk = kb.toLowerCase();
				if (Array.isArray(keyMap[nk]))
				    keyMap[nk].push(action);
				else
					keyMap[nk] = [action];
			});
		}
	});
	keyMap = util.extend(keyMap, {
		'a': ['atom-any'],
		'defmod-a': ['select-all'],
		'defmod-shift-a': ['deselect-all'],
		'ctrl-alt-r': ['force-update']
	});

	Object.keys(keyMap).forEach(function (key) {
		keymage('editor', key, keyMap[key].length == 1 ? function (event) {
			// TODO: handle disabled
			var action = keyMap[key][0];
			if (clipActions.indexOf(action) == -1) {
				// else delegate to cliparea
				selectAction(keyMap[key][0]);
				event.preventDefault();
			}
		} : function () {
			console.info('actions', keyMap[key]);
		});
	});
	keymage.setScope('editor');

	toolbar.select('li').each(function (el) {
		el.on('click', function (event) {
			if (event.target.tagName == 'BUTTON' &&
			    event.target.parentNode == this) {
				if (!this.hasClassName('selected')) {
					event.stop();
				}
				selectAction(this.id);
			}

			if (hideBlurredControls()) {
				event.stop();
			}
			else if (this.getStyle('overflow') == 'hidden') {
				this.addClassName('opened');
				dropdownOpened = this;
				event.stop();
			}
		});
	});

	initCliparea(ketcherWindow);
	initZoom();
	updateHistoryButtons();

	clientArea.on('scroll', onScroll_ClientArea);
	clientArea.on('mousedown', function () {
		keymage.setScope('editor');
	});

	// Init renderer
	var opts = new rnd.RenderOptions(options);
	opts.atomColoring = true;
	ui.render =  new rnd.Render(clientArea, SCALE, opts);
	ui.editor = new Editor(ui.render);

	ui.render.onCanvasOffsetChanged = onOffsetChanged;

	selectAction('select-lasso');
	setScrollOffset(0, 0);

	ui.render.setMolecule(ui.ctab);
	ui.render.update();
};

function shortcutStr(key) {
	var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
	return key.replace(/Defmod/g, isMac ? '⌘' : 'Ctrl')
		      .replace(/-(?!$)/g, '+');
}

function subEl (id) {
	return $(id).children[0];
};

function hideBlurredControls () {
	if (!dropdownOpened) {
		return false;
	}

	dropdownOpened.removeClassName('opened');
	var sel = dropdownOpened.select('.selected');
	if (sel.length == 1) {
		//var index = sel[0].previousSiblings().size();
		var menu = subEl(dropdownOpened);
		menu.style.marginTop = (-sel[0].offsetTop + menu.offsetTop) + 'px';
	}

	// FIX: Quick fix of Chrome (Webkit probably) box-shadow
	// repaint bug: http://bit.ly/1iiSMgy
	// needs investigation, performance
	clientArea.style.visibility = 'hidden';
	setTimeout(function () {
		clientArea.style.visibility = 'visible';
	}, 0);
	// ?? ui.render.update(true);
	// END
	dropdownOpened = null;
	return true;
};

function selectAction (action) {
	// TODO: lastSelected -> prevtool_id
	action = action || lastSelected;
	var el = $(action);
	var args = [].slice.call(arguments, 1);
	console.assert(action.startsWith, 'id is not a string', action);

	if (clipActions.indexOf(action) != -1 && args.length == 0)
		return delegateCliparea(action);

	// TODO: refactor !el - case when there are no such id
	if (!el || !subEl(el).disabled) {
		args.unshift(action);
		var tool = mapTool.apply(null, args);
		if (tool instanceof Editor.EditorTool) {
			var oldel = toolbar.select('.selected')[0];
			//console.assert(!lastSelected || oldel,
			//               "No last mode selected!");

			if (el != oldel || !el) { // tool canceling needed when dialog opens
				// if el.selected not changed
				if (ui.render.current_tool) {
					ui.render.current_tool.OnCancel();
				}
				ui.render.current_tool = tool;

				if (action.startsWith('select-')) {
					lastSelected = action;
				}
				if (el) {
					el.addClassName('selected');
				}
				if (oldel) {
					oldel.removeClassName('selected');
				}
			}
		}
		return tool;
	}
	return null;
};

function delegateCliparea(action) {
	var enabled = document.queryCommandSupported(action);
	if (enabled) try {
		document.execCommand(action);
	} catch (ex) {
		// FF < 41
		enabled = false;
	}
	if (!enabled) {
		var el = subEl(action);
		var key = el.dataset ? el.dataset.keys : el.getAttribute('data-keys');
		echo('These action is unavailble via menu.\n' +
		     'Instead, use ' + shortcutStr(key) + ' to ' + action + '.');
	}
	return null;
}

function initCliparea(parent) {
	var cliparea = new Element('input', { type: 'text', 'class': 'cliparea', autofocus: true});
	var ieCb = window.clipboardData;
	var pasteFormats = [
		'chemical/x-mdl-molfile',
		'chemical/x-mdl-rxnfile',
		'chemical/x-cml',
		'text/plain',
		'chemical/x-daylight-smiles',
		'chemical/x-inchi'
	];
	var autofocus = function() {
		if (keymage.getScope() == 'editor') {
			cliparea.value = ' ';
			cliparea.focus();
			cliparea.select();
			return true;
		}
		return false;
	};
	var copyCut = function (struct, cb) {
		var moldata = molfile.stringify(struct);
		if (!cb && ieCb) {
			ieCb.setData('text', moldata);
		} else {
			cb.setData('text/plain', moldata);
			try {
				cb.setData(!struct.isReaction ?
				           'chemical/x-mdl-molfile': 'chemical/x-mdl-rxnfile',
				           moldata);
				cb.setData('chemical/x-daylight-smiles',
				           smiles.stringify(struct));
			} catch (ex) {
				console.info('Could not write exact type', ex);
			}
		}
	};
	var paste = function (cb) {
		var data = '';
		if (!cb && ieCb) {
			data = ieCb.getData('text');
		} else {
			for (var i = 0; i < pasteFormats.length; i++) {
				data = cb.getData(pasteFormats[i]);
				if (data)
					break;
			}
		}
		console.info('paste', i >= 0 && pasteFormats[i], data.slice(0, 50), '..');
		return data;
	};

	parent.insert(cliparea);
	parent.on('mouseup', autofocus);

	// ? events should be attached to document
	['copy', 'cut'].forEach(function (action) {
		parent.on(action, function (event) {
			if (autofocus()) {
				var struct = selectAction(action, true);
				if (struct)
					copyCut(struct, event.clipboardData);
				event.preventDefault();
			}
		});
	});
	parent.on('paste', function (event) {
		if (autofocus()) {
			var data = paste(event.clipboardData);
			if (data)
				loadFragment(data);
			event.preventDefault();
		}
	});
}

function updateClipboardButtons () {
	subEl('copy').disabled = subEl('cut').disabled = !ui.editor.hasSelection(true);
};

function updateHistoryButtons () {
	subEl('undo').disabled = (undoStack.length == 0);
	subEl('redo').disabled = (redoStack.length == 0);
};

function updateServerButtons () {
	serverActions.forEach(function (action) {
		subEl(action).disabled = ui.standalone;
	});
};

function transitionEndEvent () {
	var el = document.createElement('transitionTest'),
	transEndEventNames = {
		'WebkitTransition': 'webkitTransitionEnd',
		'MozTransition': 'transitionend',
		'OTransition': 'oTransitionEnd otransitionend',
		'transition': 'transitionend'
	},
	name;
	for (name in transEndEventNames) {
		if (el.style[name] !== undefined)
			return transEndEventNames[name];
	}
	return false;
};

function animateToggle (el, callback) {
	ketcherWindow.addClassName('animate');
	var transitionEnd = transitionEndEvent(),
	animateStop = function (cb) {
		setTimeout(function () {
			cb && cb();
			ketcherWindow.removeClassName('animate');
		}, 0);
	};

	if (!callback || !transitionEnd) {
		animateStop(callback);
			callback || el();
	}
	else {
		var fireOne = function () {
			animateStop(callback);
			el.removeEventListener(transitionEnd, fireOne, false);
		};
		el.addEventListener(transitionEnd, fireOne, false);
	}
};

function showDialog (name) {
	var dialog = $(name);
	keymage.setScope('dialog');
	animateToggle(function () {
		$$('.overlay')[0].show();
		// dialog.show();
		dialog.style.display = '';
	});
	return dialog;
};

function hideDialog (name) {
	var cover = $$('.overlay')[0];
	animateToggle(cover, function () {
		// $(name).hide();
		$(name).style.display = 'none';
		cover.hide();
		keymage.setScope('editor');
	});
};

function showElemTable (params) {
	params.required = true;
	selectDialog('elem-table', params);
};

function showRGroupTable (params) {
	selectDialog('rgroup-table', params);
};

function showReaGenericsTable (params) {
	params.required = true;
	selectDialog('generics-table', params);
};

function echo (message) {
	// TODO: make special area for messages
	alert(message);
};

//
// Main section
//
function updateMolecule (mol) {
	if (typeof(mol) == 'undefined' || mol == null)
		return;

	ui.editor.deselectAll();
	addUndoAction(Action.fromNewCanvas(mol));
	showDialog('loading');
	// setTimeout(function ()
	// {
	try {
		ui.render.onResize(); // TODO: this methods should be called in the resize-event handler
		ui.render.update();
		setZoomCentered(null, ui.render.getStructCenter());
	}
	catch (er) {
		alert(er.message);
	}
	finally {
		hideDialog('loading');
	}
//    }, 50);
};


function addUndoAction (action, check_dummy)
{
	if (action == null)
		return;

	if (check_dummy != true || !action.isDummy())
	{
		undoStack.push(action);
		redoStack.clear();
		if (undoStack.length > HISTORY_LENGTH)
			undoStack.splice(0, 1);
		updateHistoryButtons();
	}
};

//
// New document
//
function onClick_NewFile ()
{
	selectAction(null);

	if (!ui.ctab.isBlank()) {
		addUndoAction(Action.fromNewCanvas(new Struct()));
		ui.render.update();
	}
}

function onClick_OpenFile ()
{
	openDialog({
		onOk: function (res) {
			if (res.fragment)
				loadFragment(res.value, true);
			else
				loadMolecule(res.value, true);
		}
	});
}

function onClick_SaveFile ()
{
	saveDialog({molecule: ui.ctab}, server);
}

function aromatize(mol, arom)
{
	mol = mol.clone();
	var implicitReaction = mol.addRxnArrowIfNecessary();
	var mol_string = molfile.stringify(mol);

	if (!ui.standalone) {
		var method = arom ? 'aromatize' : 'dearomatize',
		request = server[method]({moldata: mol_string});
		request.then(function (data) {
			var resmol = parseMayBeCorruptedCTFile(data);
			if (implicitReaction)
				resmol.rxnArrows.clear();
			updateMolecule(resmol);
		}, echo);
	} else {
		throw new Error('Aromatization and dearomatization are not supported in the standalone mode.');
	}
};

// TODO: merge with arom/dearom + spinner
function calculateCip() {
	util.assert(!ui.standalone, 'Can\'t calculate in standalone mode!'); // it's assert error now
	var mol = ui.ctab.clone();
	var implicitReaction = mol.addRxnArrowIfNecessary();
	var mol_string = molfile.stringify(mol);

	var request = server.calculateCip({moldata: mol_string});
	request.then(function (data) {
		var resmol = parseMayBeCorruptedCTFile(data);
		if (implicitReaction)
			resmol.rxnArrows.clear();
		updateMolecule(resmol);
	}).then(null, echo);
};

//
// Zoom section
//
function initZoom() {
	var zoomSelect = subEl('zoom-list');
	zoomSelect.on('focus', function () {
		keymage.pushScope('zoom');
	});
	zoomSelect.on('blur', function () {
		keymage.popScope('zoom');
	});
	zoomSelect.on('change', updateZoom);
	updateZoom(true);
}

function onClick_ZoomIn () {
	subEl('zoom-list').selectedIndex++;
	updateZoom();
};

function onClick_ZoomOut () {
	subEl('zoom-list').selectedIndex--;
	updateZoom();
};

function updateZoom (noRefresh) {
	var zoomSelect = subEl('zoom-list');
	var i = zoomSelect.selectedIndex,
	    len = zoomSelect.length;
	console.assert(0 <= i && i < len, 'Zoom out of range');

	subEl('zoom-in').disabled = (i == len - 1);
	subEl('zoom-out').disabled = (i == 0);

	var value = parseFloat(zoomSelect.options[i].innerHTML) / 100;
	// TODO: remove this shit (used in rnd.Render guts
	// only in dialog/crap and render one time
	ui.zoom = value;
	if (!noRefresh) {
		setZoomCentered(value,
		                ui.render.getStructCenter(ui.editor.getSelection()));
		ui.render.update();
	}
};

function setZoomRegular (zoom) {
	//mr: prevdent unbounded zooming
	//begin
	if (zoom < 0.1 || zoom > 10)
		return;
	//end
	ui.zoom = zoom;
	ui.render.setZoom(ui.zoom);
	// when scaling the canvas down it may happen that the scaled canvas is smaller than the view window
	// don't forget to call setScrollOffset after zooming (or use extendCanvas directly)
};

// get the size of the view window in pixels
function getViewSz () {
	return new Vec2(ui.render.viewSz);
};

// c is a point in scaled coordinates, which will be positioned in the center of the view area after zooming
function setZoomCentered (zoom, c) {
	if (!c)
		throw new Error('Center point not specified');
	if (zoom) {
		setZoomRegular(zoom);
	}
	setScrollOffset(0, 0);
	var sp = ui.render.obj2view(c).sub(ui.render.viewSz.scaled(0.5));
	setScrollOffset(sp.x, sp.y);
};

// set the reference point for the "static point" zoom (in object coordinates)
function setZoomStaticPointInit (s) {
	zspObj = new Vec2(s);
};

// vp is the point where the reference point should now be (in view coordinates)
function setZoomStaticPoint (zoom, vp) {
	setZoomRegular(zoom);
	setScrollOffset(0, 0);
	var avp = ui.render.obj2view(zspObj);
	var so = avp.sub(vp);
	setScrollOffset(so.x, so.y);
};

function setScrollOffset (x, y) {
	var cx = clientArea.clientWidth;
	var cy = clientArea.clientHeight;
	ui.render.extendCanvas(x, y, cx + x, cy + y);
	clientArea.scrollLeft = x;
	clientArea.scrollTop = y;
	scrollLeft = clientArea.scrollLeft; // TODO: store drag position in scaled systems
	scrollTop = clientArea.scrollTop;
};

function setScrollOffsetRel (dx, dy) {
	setScrollOffset(clientArea.scrollLeft + dx, clientArea.scrollTop + dy);
};

//
// Automatic layout
//
function onClick_CleanUp ()
{
	var atoms = util.array(ui.editor.getSelection(true).atoms);
	var selective = atoms.length > 0;
	if (selective) {
		var atomSet = Set.fromList(atoms);
		var atomSetExtended = Set.empty();
		ui.ctab.loops.each(function (lid, loop) {
			// if selection contains any of the atoms in this loop, add all the atoms in the loop to selection
			if (util.findIndex(loop.hbs, function (hbid) {
				return Set.contains(atomSet, ui.ctab.halfBonds.get(hbid).begin);
			}) >= 0)
				util.each(loop.hbs, function (hbid) {
					Set.add(atomSetExtended, ui.ctab.halfBonds.get(hbid).begin);
				}, this);
		}, this);
		Set.mergeIn(atomSetExtended, atomSet);
		atoms = Set.list(atomSetExtended);
	}
	ui.editor.deselectAll();
	try {
		var aidMap = {};
		var mol = ui.ctab.clone(null, null, false, aidMap);
		if (selective) {
			util.each(atoms, function (aid){
				aid = aidMap[aid];
				var dsg = new SGroup('DAT');
				var dsgid = mol.sgroups.add(dsg);
				dsg.id = dsgid;
				dsg.pp = new Vec2();
				dsg.data.fieldName = '_ketcher_selective_layout';
				dsg.data.fieldValue = '1';
				mol.atomAddToSGroup(dsgid, aid);
			}, this);
		}
		var implicitReaction = mol.addRxnArrowIfNecessary();
		var req = server.layout({
			moldata: molfile.stringify(mol)
		}, selective ? {'selective': 1} : null);
		req.then(function (res) {
			var struct = parseMayBeCorruptedCTFile(res);
			if (implicitReaction)
				struct.rxnArrows.clear();
			updateMolecule(struct);
		});
	} catch (er) {
			alert('ERROR: ' + er.message); // TODO [RB] ??? global re-factoring needed on error-reporting
		}
};

function onClick_Aromatize ()
{
	try {
		aromatize(ui.ctab, true);
	} catch (er) {
		alert('Molfile: ' + er.message);
	}
};

function onClick_Dearomatize ()
{
	try {
		aromatize(ui.ctab, false);
	} catch (er) {
		alert('Molfile: ' + er.message);
	}
};

function onClick_Automap () {
	obsolete.showAutomapProperties({
		onOk: function (mode) {
			var mol = ui.ctab;
			var implicitReaction = mol.addRxnArrowIfNecessary();
			if (mol.rxnArrows.count() == 0) {
				echo('Auto-Mapping can only be applied to reactions');
				return;
			}
			var moldata = molfile.stringify(mol, { ignoreErrors: true }),
			request = server.automap({
				moldata: moldata,
				mode: mode
			});

			request.then(function (res) {
				var mol = parseMayBeCorruptedCTFile(res);
				if (implicitReaction) {
					mol.rxnArrows.clear();
				}
				/*
                 var aam = parseCTFile(res.responseText);
                 var action = new Action();
                 for (var aid = aam.atoms.count() - 1; aid >= 0; aid--) {
                 action.mergeWith(Action.fromAtomAttrs(aid, { aam : aam.atoms.get(aid).aam }));
                 }
                 addUndoAction(action, true);
                 */
				updateMolecule(mol);
				/*
                 ui.render.update();
                 */

			}, echo);
		}
	});
};

function loadMolecule (mol, checkEmptyLine) {
	return getStruct(mol,
	                 checkEmptyLine).then(updateMolecule, function (err) {
		                 console.error('To DS:', err);
	                 });
}

function loadFragment (mol, checkEmptyLine) {
	return getStruct(mol, checkEmptyLine).then(function (struct) {
		struct.rescale();
		selectAction('paste', struct);
	});
}

function guessType(mol, strict) {
	// Mimic Indigo/molecule_auto_loader.cpp as much as possible
	var molStr = mol.trim();
	var molMatch = molStr.match(/^(M  END|\$END MOL)$/m);
	if (molMatch) {
		var end = molMatch.index + molMatch[0].length;
		if (end == molStr.length ||
		    molStr.slice(end, end + 20).search(/^\$(MOL|END CTAB)$/m) != -1)
			return 'mol';
	}
	if (molStr[0] == '<' && molStr.indexOf('<molecule') != -1)
		return 'cml';
	if (molStr.slice(0, 5) == 'InChI')
		return 'inchi';
	if (molStr.indexOf('\n') == -1)
		return 'smiles';
	// Molfile by default as Indigo does
	return strict ? null : 'mol';
}

function getStruct(mol, checkEmptyLine) {
	return new Promise(function (resolve, reject) {
		var type = guessType(mol);
		if (type == 'mol') {
			var struct = parseMayBeCorruptedCTFile(mol,
			                                       checkEmptyLine);
			resolve(struct);
		} else if (ui.standalone)
			throw type ? type.toUpperCase() : 'Format' +
			      ' is not supported in a standalone mode.';
		else {
			var req = (type == 'smiles') ?
			    server.layout_smiles(null, {smiles: mol.trim()}) :
			    server.molfile({moldata: mol});
			resolve(req.then(function (res) {
				return parseMayBeCorruptedCTFile(res);
			}));
		}
	});
};

function page2canvas2 (pos)
{
	var offset = clientArea.cumulativeOffset();
	return new Vec2(pos.pageX - offset.left, pos.pageY - offset.top);
};

function page2obj (pagePos)
{
	return ui.render.view2obj(page2canvas2(pagePos));
};

function scrollPos ()
{
	return new Vec2(clientArea.scrollLeft, clientArea.scrollTop);
};

//
// Scrolling
//
var scrollLeft = null;
var scrollTop = null;

function onScroll_ClientArea (event)
{
	// ! DIALOG ME
	// if ($('input_label').visible())
	//      $('input_label').hide();

	scrollLeft = clientArea.scrollLeft;
	scrollTop = clientArea.scrollTop;

	util.stopEventPropagation(event);
};

//
// Canvas size
//
function onOffsetChanged (newOffset, oldOffset)
{
	if (oldOffset == null)
		return;

	var delta = new Vec2(newOffset.x - oldOffset.x, newOffset.y - oldOffset.y);

	clientArea.scrollLeft += delta.x;
	clientArea.scrollTop += delta.y;
};

function removeSelected ()
{
	addUndoAction(Action.fromFragmentDeletion());
	ui.editor.deselectAll();
	ui.render.update();
};

function undo ()
{
	if (ui.render.current_tool)
		ui.render.current_tool.OnCancel();

	ui.editor.deselectAll();
	redoStack.push(undoStack.pop().perform());
	ui.render.update();
	updateHistoryButtons();
};

function redo ()
{
	if (ui.render.current_tool)
		ui.render.current_tool.OnCancel();

	ui.editor.deselectAll();
	undoStack.push(redoStack.pop().perform());
	ui.render.update();
	updateHistoryButtons();
};

var current_elemtable_props = null;
function onClick_ElemTableButton ()
{
	showElemTable({
		onOk: function (res) {
			var props;
			if (res.mode == 'single')
				props = {
					label: element.get(res.values[0]).label
				};
			else
				props = {
					label: 'L#',
					atomList: new Atom.List({
						notList: res.mode == 'not-list',
						ids: res.values
					})
				};
			current_elemtable_props = props;
			selectAction('atom-table');
			return true;
		},
		onCancel: function () {
			//ui.elem_table_obj.restore();
		}
	});
};

var current_reagenerics = null;
function onClick_ReaGenericsTableButton ()
{
	showReaGenericsTable({
		onOk: function (res) {
			current_reagenerics = {label: res.values[0]};
			selectAction('atom-reagenerics');
			return true;
		}
	});
};

// TODO: remove this crap (quick hack to pass parametr to selectAction)
var current_template_custom = null;
function onClick_TemplateCustom () {
	templatesDialog('', {
		onOk: function (tmpl) {
			current_template_custom = tmpl;
			selectAction('template-custom-select');
			return true;
		}
	});
};

function showSgroupDialog(params) {
	if (false && sgroupSpecialDialog.match(params))
		return sgroupSpecialDialog(params);
	return sgroupDialog(params);
};

// try to reconstruct molfile string instead parsing multiple times
// TODO: move this logic to Molfile
function parseMayBeCorruptedCTFile (mol, checkEmptyLine) {
	var lines = util.splitNewlines(mol);
	try {
		return molfile.parse(lines);
	} catch (ex) {
		if (checkEmptyLine) {
			try {
				// check whether there's an extra empty line on top
				// this often happens when molfile text is pasted into the dialog window
				return molfile.parse(lines.slice(1));
			} catch (ex1) {
			}
			try {
				// check for a missing first line
				// this sometimes happens when pasting
				return molfile.parse([''].concat(lines));
			} catch (ex2) {
			}
		}
		throw ex;
	}
};

var actionMap = {
	'new': onClick_NewFile,
	'open': onClick_OpenFile,
	'save': onClick_SaveFile,
	'undo': undo,
	'redo': redo,
	'zoom-in': onClick_ZoomIn,
	'zoom-out': onClick_ZoomOut,
	'cleanup': onClick_CleanUp,
	'arom': onClick_Aromatize,
	'dearom': onClick_Dearomatize,
	'period-table': onClick_ElemTableButton,
	'generic-groups': onClick_ReaGenericsTableButton,
	'template-custom': onClick_TemplateCustom,
	'cut': function () {
		var struct = ui.editor.getSelectionStruct();
		removeSelected();
		return struct.isBlank() ? null : struct;
	},
	'copy': function () {
		var struct = ui.editor.getSelectionStruct();
		ui.editor.deselectAll();
		return struct.isBlank() ? null : struct;
	},
	'paste': function (struct) {
		if (struct.isBlank())
			throw 'Not a valid structure to paste';
		ui.editor.deselectAll();
		return new Editor.PasteTool(ui.editor, struct);
	},
	'info': function (el) {
		showDialog('about_dialog');
	},
	'select-all': function () {
		ui.editor.selectAll();
	},
	'deselect-all': function () {
		ui.editor.deselectAll();
	},
	'force-update': function () {
		// original: for dev purposes
		ui.render.update(true);
	},
	'reaction-automap': onClick_Automap,
	'calc-cip': calculateCip
};

// TODO: rewrite declaratively, merge to actionMap
function mapTool (id) {

	console.assert(id, 'The null tool');

	var args = [].slice.call(arguments, 1);
	if (actionMap[id])
		return actionMap[id].apply(null, args);
	// special cases
	if (ui.editor.hasSelection()) {
		if (id == 'erase') {
			removeSelected();
			return null;
		}
		// BK: TODO: add this ability to mass-change atom labels to the keyboard handler
		if (id.startsWith('atom-')) {
			addUndoAction(Action.fromAtomsAttrs(ui.editor.getSelection().atoms, atomLabel(id)), true);
			ui.render.update();
			return null;
		}

		if (id.startsWith('transform-flip')) {
			addUndoAction(Action.fromFlip(ui.editor.getSelection(),
				id.endsWith('h') ? 'horizontal' :
					'vertical'),
				true);
			ui.render.update();
			return null;
		}

		/* BK: TODO: add this ability to change the bond under cursor to the editor tool
         else if (mode.startsWith('bond_')) {
         var cBond = ui.render.findClosestBond(page2obj(ui.cursorPos));
         if (cBond) {
         addUndoAction(Action.fromBondAttrs(cBond.id, { type: bondType(mode).type, stereo: Bond.PATTERN.STEREO.NONE }), true);
         ui.render.update();
         return;
         }
         } */
	}

	if (id != 'transform-rotate')
		ui.editor.deselectAll();

	if (id == 'select-lasso') {
		return new Editor.LassoTool(ui.editor, 0);
	} else if (id == 'select-rectangle') {
		return new Editor.LassoTool(ui.editor, 1);
	} else if (id == 'select-fragment') {
		return new Editor.LassoTool(ui.editor, 1, true);
	} else if (id == 'erase') {
		return new Editor.EraserTool(ui.editor, 1); // TODO last selector mode is better
	} else if (id.startsWith('atom-')) {
		return new Editor.AtomTool(ui.editor, atomLabel(id));
	} else if (id.startsWith('bond-')) {
		return new Editor.BondTool(ui.editor, bondType(id));
	} else if (id == 'chain') {
		return new Editor.ChainTool(ui.editor);
	} else if (id.startsWith('template-custom')) {
		return new Editor.TemplateTool(ui.editor, current_template_custom);
	} else if (id.startsWith('template')) {
		return new Editor.TemplateTool(ui.editor, templates[parseInt(id.split('-')[1])]);
	} else if (id == 'charge-plus') {
		return new Editor.ChargeTool(ui.editor, 1);
	} else if (id == 'charge-minus') {
		return new Editor.ChargeTool(ui.editor, -1);
	} else if (id == 'sgroup') {
		return new Editor.SGroupTool(ui.editor);
	} else if (id == 'reaction-arrow') {
		return new Editor.ReactionArrowTool(ui.editor);
	} else if (id == 'reaction-plus') {
		return new Editor.ReactionPlusTool(ui.editor);
	} else if (id == 'reaction-map') {
		return new Editor.ReactionMapTool(ui.editor);
	} else if (id == 'reaction-unmap') {
		return new Editor.ReactionUnmapTool(ui.editor);
	} else if (id == 'rgroup-label') {
		return new Editor.RGroupAtomTool(ui.editor);
	} else if (id == 'rgroup-fragment') {
		return new Editor.RGroupFragmentTool(ui.editor);
	} else if (id == 'rgroup-attpoints') {
		return new Editor.APointTool(ui.editor);
	} else if (id.startsWith('transform-rotate')) {
		return new Editor.RotateTool(ui.editor);
	}
	return null;
};

// TODO: remove. only in obsolete dialogs
var bondTypeMap = {
	'single': {type: 1, stereo: Bond.PATTERN.STEREO.NONE},
	'up': {type: 1, stereo: Bond.PATTERN.STEREO.UP},
	'down': {type: 1, stereo: Bond.PATTERN.STEREO.DOWN},
	'updown': {type: 1, stereo: Bond.PATTERN.STEREO.EITHER},
	'double': {type: 2, stereo: Bond.PATTERN.STEREO.NONE},
	'crossed': {type: 2, stereo: Bond.PATTERN.STEREO.CIS_TRANS},
	'triple': {type: 3, stereo: Bond.PATTERN.STEREO.NONE},
	'aromatic': {type: 4, stereo: Bond.PATTERN.STEREO.NONE},
	'singledouble': {type: 5, stereo: Bond.PATTERN.STEREO.NONE},
	'singlearomatic': {type: 6, stereo: Bond.PATTERN.STEREO.NONE},
	'doublearomatic': {type: 7, stereo: Bond.PATTERN.STEREO.NONE},
	'any':  {type: 8, stereo: Bond.PATTERN.STEREO.NONE}
};

function bondType (mode)
{
	var type_str = mode.substr(5);
	return bondTypeMap[type_str];
};

function atomLabel (mode) {
	var label = mode.substr(5);
	switch (label) {
	case 'table':
		return current_elemtable_props;
	case 'reagenerics':
		return current_reagenerics;
	case 'any':
		return {label:'A'};
	default:
		label = label.capitalize();
		console.assert(element.getElementByLabel(label),
		              "No such atom exist");
		return {label: label};
	}
};

function clean () {
	// latter if (initialized)
	Action.fromNewCanvas(new Struct());
	ui.render.update();
	undoStack.clear();
	redoStack.clear();
	updateHistoryButtons();
	selectAction(null);
}

// The expose guts two way
module.exports = {
	init: init,
	clean: clean,
	loadMolecule: loadMolecule,
	loadFragment: loadFragment
};

util.extend(ui, module.exports);

util.extend(ui, {
	standalone: true,
	ctab: new Struct(),
	render: null,
	editor: null,

	hideBlurredControls: hideBlurredControls,
	updateClipboardButtons: updateClipboardButtons,
	selectAction: selectAction,
	addUndoAction: addUndoAction,

	// TODO: remove me as we get better server API
	loadMoleculeFromFile: openDialog.loadHook,

	echo: echo,
	showDialog: showDialog,
	hideDialog: hideDialog,
	bondTypeMap: bondTypeMap,

	// TODO: move schrool/zoom machinery to render
	zoom: 1.0,
	setZoomStaticPointInit: setZoomStaticPointInit,
	setZoomStaticPoint: setZoomStaticPoint,
	page2canvas2: page2canvas2,
	scrollPos: scrollPos,
	page2obj: page2obj,

	// TODO: search a way to pass dialogs to editor
	showSGroupProperties: showSgroupDialog,
	showRGroupTable: showRGroupTable,
	showElemTable: showElemTable,
	showReaGenericsTable: showReaGenericsTable,
	showAtomAttachmentPoints: obsolete.showAtomAttachmentPoints,
	showAtomProperties: obsolete.showAtomProperties,
	showBondProperties: obsolete.showBondProperties,
	showRLogicTable: obsolete.showRLogicTable,
	showLabelEditor: obsolete.showLabelEditor
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/atom":8,"../chem/bond":9,"../chem/element":12,"../chem/molfile":13,"../chem/sgroup":15,"../chem/smiles":16,"../chem/struct":18,"../rnd":22,"../rnd/editor":21,"../util":40,"../util/set":43,"../util/vec2":44,"./action.js":27,"./dialog/obsolete":28,"./dialog/open.js":29,"./dialog/save.js":30,"./dialog/select":31,"./dialog/sgroup":33,"./dialog/sgroup-special":32,"./dialog/templates":34,"./templates":37,"keymage":2,"promise-polyfill":3}],36:[function(require,module,exports){
(function (global){
var Vec2 = require('../util/vec2');
var Set = require('../util/set');

var Struct = require('../chem/struct');
var Atom = require('../chem/atom');
var Bond = require('../chem/bond');
var SGroup = require('../chem/sgroup');

require('../rnd');

var ui = global.ui;
var rnd = global.rnd;

function Base () {
	this.type = 'OpBase';

	// assert here?
	this._execute = function () {
		throw new Error('Operation._execute() is not implemented');
	};
	this._invert = function () {
		throw new Error('Operation._invert() is not implemented');
	};

	this.perform = function (editor) {
		this._execute(editor);
		if (!this.__inverted) {
			this.__inverted = this._invert();
			this.__inverted.__inverted = this;
		}
		return this.__inverted;
	};
	this.isDummy = function (editor) {
		return this._isDummy ? this._isDummy(editor) : false;
	};
}

function AtomAdd (atom, pos) {
	this.data = { aid: null, atom: atom, pos: pos };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var pp = {};
		if (this.data.atom)
			for (var p in this.data.atom)
				pp[p] = this.data.atom[p];
		pp.label = pp.label || 'C';
		if (!Object.isNumber(this.data.aid)) {
			this.data.aid = DS.atoms.add(new Atom(pp));
		} else {
			DS.atoms.set(this.data.aid, new Atom(pp));
		}
		RS.notifyAtomAdded(this.data.aid);
		DS._atomSetPos(this.data.aid, new Vec2(this.data.pos));
	};
	this._invert = function () {
		var ret = new AtomDelete();
		ret.data = this.data;
		return ret;
	};
};
AtomAdd.prototype = new Base();

function AtomDelete (aid) {
	this.data = { aid: aid, atom: null, pos: null };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!this.data.atom) {
			this.data.atom = DS.atoms.get(this.data.aid);
			this.data.pos = R.atomGetPos(this.data.aid);
		}
		RS.notifyAtomRemoved(this.data.aid);
		DS.atoms.remove(this.data.aid);
	};
	this._invert = function () {
		var ret = new AtomAdd();
		ret.data = this.data;
		return ret;
	};
};
AtomDelete.prototype = new Base();

function AtomAttr (aid, attribute, value) {
	this.data = { aid: aid, attribute: attribute, value: value };
	this.data2 = null;
	this._execute = function (editor) {
		var atom = editor.render.ctab.molecule.atoms.get(this.data.aid);
		if (!this.data2) {
			this.data2 = { aid: this.data.aid, attribute: this.data.attribute, value: atom[this.data.attribute] };
		}
		atom[this.data.attribute] = this.data.value;
		editor.render.invalidateAtom(this.data.aid);
	};
	this._isDummy = function (editor) {
		return editor.render.ctab.molecule.atoms.get(this.data.aid)[this.data.attribute] == this.data.value;
	};
	this._invert = function () {
		var ret = new AtomAttr();
		ret.data = this.data2;
		ret.data2 = this.data;return ret;
	};
};
AtomAttr.prototype = new Base();

function AtomMove (aid, d, noinvalidate) {
	this.data = {aid: aid, d: d, noinvalidate: noinvalidate};
	this._execute = function (editor) {
		var R = editor.render;
		var RS = R.ctab;
		var DS = RS.molecule;
		var aid = this.data.aid;
		var d = this.data.d;
		DS.atoms.get(aid).pp.add_(d);
		RS.atoms.get(aid).visel.translate(R.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			R.invalidateAtom(aid, 1);
	};
	this._isDummy = function (editor) {
		return this.data.d.x == 0 && this.data.d.y == 0;
	};
	this._invert = function () {
		var ret = new AtomMove();
		ret.data = this.data;
		return ret;
	};
};
AtomMove.prototype = new Base();

function BondMove (bid, d) {
	this.data = {bid: bid, d: d};
	this._execute = function (editor) {
		var R = editor.render;
		var RS = R.ctab;
		RS.bonds.get(this.data.bid).visel.translate(R.ps(this.data.d));
		this.data.d = this.data.d.negated();
	};
	this._invert = function () {
		var ret = new BondMove();
		ret.data = this.data;
		return ret;
	};
};
BondMove.prototype = new Base();

function LoopMove (id, d) {
	this.data = {id: id, d: d};
	this._execute = function (editor) {
		var R = editor.render;
		var RS = R.ctab;
		// not sure if there should be an action to move a loop in the first place
		// but we have to somehow move the aromatic ring, which is associated with the loop, rather than with any of the bonds
		if (RS.reloops.get(this.data.id) && RS.reloops.get(this.data.id).visel)
			RS.reloops.get(this.data.id).visel.translate(R.ps(this.data.d));
		this.data.d = this.data.d.negated();
	};
	this._invert = function () {
		var ret = new LoopMove();
		ret.data = this.data;
		return ret;
	};
};
LoopMove.prototype = new Base();

function SGroupAtomAdd (sgid, aid) {
	this.type = 'OpSGroupAtomAdd';
	this.data = {'aid': aid, 'sgid': sgid};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var aid = this.data.aid;
		var sgid = this.data.sgid;
		var atom = DS.atoms.get(aid);
		var sg = DS.sgroups.get(sgid);
		if (sg.atoms.indexOf(aid) >= 0)
			throw new Error('The same atom cannot be added to an S-group more than once');
		if (!atom)
			throw new Error('OpSGroupAtomAdd: Atom ' + aid + ' not found');
		DS.atomAddToSGroup(sgid, aid);
		R.invalidateAtom(aid);
	};
	this._invert = function () {
		var ret = new SGroupAtomRemove();
		ret.data = this.data;
		return ret;
	};
};
SGroupAtomAdd.prototype = new Base();

function SGroupAtomRemove (sgid, aid) {
	this.type = 'OpSGroupAtomRemove';
	this.data = {'aid': aid, 'sgid': sgid};
	this._execute = function (editor) {
		var aid = this.data.aid;
		var sgid = this.data.sgid;
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var atom = DS.atoms.get(aid);
		var sg = DS.sgroups.get(sgid);
		SGroup.removeAtom(sg, aid);
		Set.remove(atom.sgs, sgid);
		R.invalidateAtom(aid);
	};
	this._invert = function () {
		var ret = new SGroupAtomAdd();
		ret.data = this.data;
		return ret;
	};
};
SGroupAtomRemove.prototype = new Base();

function SGroupAttr (sgid, attr, value) {
	this.type = 'OpSGroupAttr';
	this.data = {sgid: sgid, attr: attr, value: value};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var sgid = this.data.sgid;
		var sg = DS.sgroups.get(sgid);
		if (sg.type == 'DAT' && RS.sgroupData.has(sgid)) { // clean the stuff here, else it might be left behind if the sgroups is set to "attached"
			RS.clearVisel(RS.sgroupData.get(sgid).visel);
			RS.sgroupData.unset(sgid);
		}

		this.data.value = sg.setAttr(this.data.attr, this.data.value);
	};
	this._invert = function () {
		var ret = new SGroupAttr();
		ret.data = this.data;
		return ret;
	};
};
SGroupAttr.prototype = new Base();

function SGroupCreate (sgid, type, pp) {
	this.type = 'OpSGroupCreate';
	this.data = {'sgid': sgid, 'type': type, 'pp': pp};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var sg = new SGroup(this.data.type);
		var sgid = this.data.sgid;
		sg.id = sgid;
		DS.sgroups.set(sgid, sg);
		if (this.data.pp) {
			DS.sgroups.get(sgid).pp = new Vec2(this.data.pp);
		}
		RS.sgroups.set(sgid, new rnd.ReSGroup(DS.sgroups.get(sgid)));
		this.data.sgid = sgid;
	};
	this._invert = function () {
		var ret = new SGroupDelete();
		ret.data = this.data;
		return ret;
	};
};
SGroupCreate.prototype = new Base();

function SGroupDelete (sgid) {
	this.type = 'OpSGroupDelete';
	this.data = {'sgid': sgid};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var sgid = this.data.sgid;
		var sg = RS.sgroups.get(sgid);
		this.data.type = sg.item.type;
		this.data.pp = sg.item.pp;
		if (sg.item.type == 'DAT' && RS.sgroupData.has(sgid)) {
			RS.clearVisel(RS.sgroupData.get(sgid).visel);
			RS.sgroupData.unset(sgid);
		}

		RS.clearVisel(sg.visel);
		if (sg.item.atoms.length != 0)
			throw new Error('S-Group not empty!');
		RS.sgroups.unset(sgid);
		DS.sgroups.remove(sgid);
	};
	this._invert = function () {
		var ret = new SGroupCreate();
		ret.data = this.data;
		return ret;
	};
};
SGroupDelete.prototype = new Base();

function SGroupAddToHierarchy (sgid) {
	this.type = 'OpSGroupAddToHierarchy';
	this.data = {'sgid': sgid};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var sgid = this.data.sgid;
		var relations = DS.sGroupForest.insert(sgid, this.data.parent, this.data.children);
		this.data.parent = relations.parent;
		this.data.children = relations.children;
	};
	this._invert = function () {
		var ret = new SGroupRemoveFromHierarchy();
		ret.data = this.data;
		return ret;
	};
};
SGroupAddToHierarchy.prototype = new Base();

function SGroupRemoveFromHierarchy (sgid) {
	this.type = 'OpSGroupRemoveFromHierarchy';
	this.data = {'sgid': sgid};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		var sgid = this.data.sgid;
		this.data.parent = DS.sGroupForest.parent.get(sgid);
		this.data.children = DS.sGroupForest.children.get(sgid);
		DS.sGroupForest.remove(sgid);
	};
	this._invert = function () {
		var ret = new SGroupAddToHierarchy();
		ret.data = this.data;
		return ret;
	};
};
SGroupRemoveFromHierarchy.prototype = new Base();

function BondAdd (begin, end, bond) {
	this.data = { bid: null, bond: bond, begin: begin, end: end };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (this.data.begin == this.data.end)
			throw new Error('Distinct atoms expected');
		if (rnd.DEBUG && this.molecule.checkBondExists(this.data.begin, this.data.end))
			throw new Error('Bond already exists');

		R.invalidateAtom(this.data.begin, 1);
		R.invalidateAtom(this.data.end, 1);

		var pp = {};
		if (this.data.bond)
			for (var p in this.data.bond)
				pp[p] = this.data.bond[p];
		pp.type = pp.type || Bond.PATTERN.TYPE.SINGLE;
		pp.begin = this.data.begin;
		pp.end = this.data.end;

		if (!Object.isNumber(this.data.bid)) {
			this.data.bid = DS.bonds.add(new Bond(pp));
		} else {
			DS.bonds.set(this.data.bid, new Bond(pp));
		}
		DS.bondInitHalfBonds(this.data.bid);
		DS.atomAddNeighbor(DS.bonds.get(this.data.bid).hb1);
		DS.atomAddNeighbor(DS.bonds.get(this.data.bid).hb2);

		RS.notifyBondAdded(this.data.bid);
	};
	this._invert = function () {
		var ret = new BondDelete();
		ret.data = this.data;
		return ret;
	};
};
BondAdd.prototype = new Base();

function BondDelete (bid) {
	this.data = { bid: bid, bond: null, begin: null, end: null };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!this.data.bond) {
			this.data.bond = DS.bonds.get(this.data.bid);
			this.data.begin = this.data.bond.begin;
			this.data.end = this.data.bond.end;
		}

		R.invalidateBond(this.data.bid);

		RS.notifyBondRemoved(this.data.bid);

		var bond = DS.bonds.get(this.data.bid);
		[bond.hb1, bond.hb2].each(function (hbid) {
			var hb = DS.halfBonds.get(hbid);
			var atom = DS.atoms.get(hb.begin);
			var pos = atom.neighbors.indexOf(hbid);
			var prev = (pos + atom.neighbors.length - 1) % atom.neighbors.length;
			var next = (pos + 1) % atom.neighbors.length;
			DS.setHbNext(atom.neighbors[prev], atom.neighbors[next]);
			atom.neighbors.splice(pos, 1);
		}, this);
		DS.halfBonds.unset(bond.hb1);
		DS.halfBonds.unset(bond.hb2);

		DS.bonds.remove(this.data.bid);
	};
	this._invert = function () {
		var ret = new BondAdd();
		ret.data = this.data;
		return ret;
	};
};
BondDelete.prototype = new Base();

function BondAttr (bid, attribute, value) {
	this.data = { bid: bid, attribute: attribute, value: value };
	this.data2 = null;
	this._execute = function (editor) {
		var bond = editor.render.ctab.molecule.bonds.get(this.data.bid);
		if (!this.data2) {
			this.data2 = { bid: this.data.bid, attribute: this.data.attribute, value: bond[this.data.attribute] };
		}

		bond[this.data.attribute] = this.data.value;

		editor.render.invalidateBond(this.data.bid);
		if (this.data.attribute == 'type')
			editor.render.invalidateLoop(this.data.bid);
	};
	this._isDummy = function (editor) {
		return editor.render.ctab.molecule.bonds.get(this.data.bid)[this.data.attribute] == this.data.value;
	};
	this._invert = function () {
		var ret = new BondAttr();
		ret.data = this.data2;
		ret.data2 = this.data;
		return ret;
	};
};
BondAttr.prototype = new Base();

function FragmentAdd (frid) {
	this.frid = Object.isUndefined(frid) ? null : frid;
	this._execute = function (editor) {
		var RS = editor.render.ctab, DS = RS.molecule;
		var frag = new Struct.Fragment();
		if (this.frid == null) {
			this.frid = DS.frags.add(frag);
		} else {
			DS.frags.set(this.frid, frag);
		}
		RS.frags.set(this.frid, new rnd.ReFrag(frag)); // TODO add ReStruct.notifyFragmentAdded
	};
	this._invert = function () {
		return new FragmentDelete(this.frid);
	};
};
FragmentAdd.prototype = new Base();

function FragmentDelete (frid) {
	this.frid = frid;
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		R.invalidateItem('frags', this.frid, 1);
		RS.frags.unset(this.frid);
		DS.frags.remove(this.frid); // TODO add ReStruct.notifyFragmentRemoved
	};
	this._invert = function () {
		return new FragmentAdd(this.frid);
	};
};
FragmentDelete.prototype = new Base();

function RGroupAttr (rgid, attribute, value) {
	this.data = { rgid: rgid, attribute: attribute, value: value };
	this.data2 = null;
	this._execute = function (editor) {
		var rgp = editor.render.ctab.molecule.rgroups.get(this.data.rgid);
		if (!this.data2) {
			this.data2 = { rgid: this.data.rgid, attribute: this.data.attribute, value: rgp[this.data.attribute] };
		}

		rgp[this.data.attribute] = this.data.value;

		editor.render.invalidateItem('rgroups', this.data.rgid);
	};
	this._isDummy = function (editor) {
		return editor.render.ctab.molecule.rgroups.get(this.data.rgid)[this.data.attribute] == this.data.value;
	};
	this._invert = function () {
		var ret = new RGroupAttr();
		ret.data = this.data2;
		ret.data2 = this.data;
		return ret;
	};
};
RGroupAttr.prototype = new Base();

function RGroupFragment (rgid, frid, rg) {
	this.rgid_new = rgid;
	this.rg_new = rg;
	this.rgid_old = null;
	this.rg_old = null;
	this.frid = frid;
	this._execute = function (editor) {
		var RS = editor.render.ctab, DS = RS.molecule;
		this.rgid_old = this.rgid_old || Struct.RGroup.findRGroupByFragment(DS.rgroups, this.frid);
		this.rg_old = (this.rgid_old ? DS.rgroups.get(this.rgid_old) : null);
		if (this.rg_old) {
			this.rg_old.frags.remove(this.rg_old.frags.keyOf(this.frid));
			RS.clearVisel(RS.rgroups.get(this.rgid_old).visel);
			if (this.rg_old.frags.count() == 0) {
				RS.rgroups.unset(this.rgid_old);
				DS.rgroups.unset(this.rgid_old);
				RS.markItemRemoved();
			} else {
				RS.markItem('rgroups', this.rgid_old, 1);
			}
		}
		if (this.rgid_new) {
			var rgNew = DS.rgroups.get(this.rgid_new);
			if (!rgNew) {
				rgNew = this.rg_new || new Struct.RGroup();
				DS.rgroups.set(this.rgid_new, rgNew);
				RS.rgroups.set(this.rgid_new, new rnd.ReRGroup(rgNew));
			} else {
				RS.markItem('rgroups', this.rgid_new, 1);
			}
			rgNew.frags.add(this.frid);
		}
	};
	this._invert = function () {
		return new RGroupFragment(this.rgid_old, this.frid, this.rg_old);
	};
};
RGroupFragment.prototype = new Base();

function RxnArrowAdd (pos) {
	this.data = { arid: null, pos: pos };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!Object.isNumber(this.data.arid)) {
			this.data.arid = DS.rxnArrows.add(new Struct.RxnArrow());
		} else {
			DS.rxnArrows.set(this.data.arid, new Struct.RxnArrow());
		}
		RS.notifyRxnArrowAdded(this.data.arid);
		DS._rxnArrowSetPos(this.data.arid, new Vec2(this.data.pos));

		R.invalidateItem('rxnArrows', this.data.arid, 1);
	};
	this._invert = function () {
		var ret = new RxnArrowDelete();
		ret.data = this.data;
		return ret;
	};
};
RxnArrowAdd.prototype = new Base();

function RxnArrowDelete (arid) {
	this.data = { arid: arid, pos: null };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!this.data.pos) {
			this.data.pos = R.rxnArrowGetPos(this.data.arid);
		}
		RS.notifyRxnArrowRemoved(this.data.arid);
		DS.rxnArrows.remove(this.data.arid);
	};
	this._invert = function () {
		var ret = new RxnArrowAdd();
		ret.data = this.data;
		return ret;
	};
};
RxnArrowDelete.prototype = new Base();

function RxnArrowMove (id, d, noinvalidate) {
	this.data = {id: id, d: d, noinvalidate: noinvalidate};
	this._execute = function (editor) {
		var R = editor.render;
		var RS = R.ctab;
		var DS = RS.molecule;
		var id = this.data.id;
		var d = this.data.d;
		DS.rxnArrows.get(id).pp.add_(d);
		RS.rxnArrows.get(id).visel.translate(R.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			editor.render.invalidateItem('rxnArrows', id, 1);
	};
	this._invert = function () {
		var ret = new RxnArrowMove();
		ret.data = this.data;
		return ret;
	};
};
RxnArrowMove.prototype = new Base();

function RxnPlusAdd (pos) {
	this.data = { plid: null, pos: pos };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!Object.isNumber(this.data.plid)) {
			this.data.plid = DS.rxnPluses.add(new Struct.RxnPlus());
		} else {
			DS.rxnPluses.set(this.data.plid, new Struct.RxnPlus());
		}
		RS.notifyRxnPlusAdded(this.data.plid);
		DS._rxnPlusSetPos(this.data.plid, new Vec2(this.data.pos));

		R.invalidateItem('rxnPluses', this.data.plid, 1);
	};
	this._invert = function () {
		var ret = new RxnPlusDelete();
		ret.data = this.data;
		return ret;
	};
};
RxnPlusAdd.prototype = new Base();

function RxnPlusDelete (plid) {
	this.data = { plid: plid, pos: null };
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (!this.data.pos) {
			this.data.pos = R.rxnPlusGetPos(this.data.plid);
		}
		RS.notifyRxnPlusRemoved(this.data.plid);
		DS.rxnPluses.remove(this.data.plid);
	};
	this._invert = function () {
		var ret = new RxnPlusAdd();
		ret.data = this.data;
		return ret;
	};
};
RxnPlusDelete.prototype = new Base();

function RxnPlusMove (id, d, noinvalidate) {
	this.data = {id: id, d: d, noinvalidate: noinvalidate};
	this._execute = function (editor) {
		var R = editor.render;
		var RS = R.ctab;
		var DS = RS.molecule;
		var id = this.data.id;
		var d = this.data.d;
		DS.rxnPluses.get(id).pp.add_(d);
		RS.rxnPluses.get(id).visel.translate(R.ps(d));
		this.data.d = d.negated();
		if (!this.data.noinvalidate)
			editor.render.invalidateItem('rxnPluses', id, 1);
	};
	this._invert = function () {
		var ret = new RxnPlusMove();
		ret.data = this.data;
		return ret;
	};
};
RxnPlusMove.prototype = new Base();

function SGroupDataMove (id, d) {
	this.data = {id: id, d: d};
	this._execute = function (editor) {
		ui.ctab.sgroups.get(this.data.id).pp.add_(this.data.d);
		this.data.d = this.data.d.negated();
		editor.render.invalidateItem('sgroupData', this.data.id, 1); // [MK] this currently does nothing since the DataSGroupData Visel only contains the highlighting/selection and SGroups are redrawn every time anyway
	};
	this._invert = function () {
		var ret = new SGroupDataMove();
		ret.data = this.data;
		return ret;
	};
};
SGroupDataMove.prototype = new Base();

function CanvasLoad (ctab) {
	this.data = {ctab: ctab, norescale: false};
	this._execute = function (editor) {
		var R = editor.render;

		R.ctab.clearVisels();
		var oldCtab = ui.ctab;
		ui.ctab = this.data.ctab;
		R.setMolecule(ui.ctab, this.data.norescale);
		this.data.ctab = oldCtab;
		this.data.norescale = true;
	};

	this._invert = function () {
		var ret = new CanvasLoad();
		ret.data = this.data;
		return ret;
	};
};
CanvasLoad.prototype = new Base();

function ChiralFlagAdd (pos) {
	this.data = {pos: pos};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (RS.chiralFlags.count() > 0)
			throw new Error('Cannot add more than one Chiral flag');
		RS.chiralFlags.set(0, new rnd.ReChiralFlag(pos));
		DS.isChiral = true;
		R.invalidateItem('chiralFlags', 0, 1);
	};
	this._invert = function () {
		var ret = new ChiralFlagDelete();
		ret.data = this.data;
		return ret;
	};
};
ChiralFlagAdd.prototype = new Base();

function ChiralFlagDelete () {
	this.data = {pos: null};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab, DS = RS.molecule;
		if (RS.chiralFlags.count() < 1)
			throw new Error('Cannot remove chiral flag');
		RS.clearVisel(RS.chiralFlags.get(0).visel);
		this.data.pos = RS.chiralFlags.get(0).pp;
		RS.chiralFlags.unset(0);
		DS.isChiral = false;
	};
	this._invert = function () {
		var ret = new ChiralFlagAdd(this.data.pos);
		ret.data = this.data;
		return ret;
	};
};
ChiralFlagDelete.prototype = new Base();

function ChiralFlagMove (d) {
	this.data = {d: d};
	this._execute = function (editor) {
		var R = editor.render, RS = R.ctab;
		RS.chiralFlags.get(0).pp.add_(this.data.d);
		this.data.d = this.data.d.negated();
		R.invalidateItem('chiralFlags', 0, 1);
	};
	this._invert = function () {
		var ret = new ChiralFlagMove();
		ret.data = this.data;
		return ret;
	};
};
ChiralFlagMove.prototype = new Base();

module.exports = {
	AtomAdd: AtomAdd,
	AtomDelete: AtomDelete,
	AtomAttr: AtomAttr,
	AtomMove: AtomMove,
	BondMove: BondMove,
	LoopMove: LoopMove,
	SGroupAtomAdd: SGroupAtomAdd,
	SGroupAtomRemove: SGroupAtomRemove,
	SGroupAttr: SGroupAttr,
	SGroupCreate: SGroupCreate,
	SGroupDelete: SGroupDelete,
	SGroupAddToHierarchy: SGroupAddToHierarchy,
	SGroupRemoveFromHierarchy: SGroupRemoveFromHierarchy,
	BondAdd: BondAdd,
	BondDelete: BondDelete,
	BondAttr: BondAttr,
	FragmentAdd: FragmentAdd,
	FragmentDelete: FragmentDelete,
	RGroupAttr: RGroupAttr,
	RGroupFragment: RGroupFragment,
	RxnArrowAdd: RxnArrowAdd,
	RxnArrowDelete: RxnArrowDelete,
	RxnArrowMove: RxnArrowMove,
	RxnPlusAdd: RxnPlusAdd,
	RxnPlusDelete: RxnPlusDelete,
	RxnPlusMove: RxnPlusMove,
	SGroupDataMove: SGroupDataMove,
	CanvasLoad: CanvasLoad,
	ChiralFlagAdd: ChiralFlagAdd,
	ChiralFlagDelete: ChiralFlagDelete,
	ChiralFlagMove: ChiralFlagMove
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../chem/atom":8,"../chem/bond":9,"../chem/sgroup":15,"../chem/struct":18,"../rnd":22,"../util/set":43,"../util/vec2":44}],37:[function(require,module,exports){
module.exports = [
	{
		name: 'benzene',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  6  6  0     0  0            999 V2000\n' +
			'    0.8660    2.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7320    1.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7320    0.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.8660    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    0.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    1.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  2  3  2  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  4  5  2  0     0  0\n' +
			'  5  6  1  0     0  0\n' +
			'  6  1  2  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclopentadiene',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  5  5  0     0  0            999 V2000\n' +
			'    0.0000    1.4257    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.8090    0.8379    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.5000   -0.1132    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -0.5000   -0.1132    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -0.8090    0.8379    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  2  3  2  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  4  5  2  0     0  0\n' +
			'  5  1  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclohexane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  6  6  0     0  0            999 V2000\n' +
			'    0.8660    2.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7320    1.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7320    0.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.8660    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    0.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    1.5000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  2  3  1  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  4  5  1  0     0  0\n' +
			'  5  6  1  0     0  0\n' +
			'  6  1  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclopentane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  5  5  0     0  0            999 V2000\n' +
			'    0.8090    1.5389    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.6180    0.9511    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.3090    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.3090    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    0.9511    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  2  3  1  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  4  5  1  0     0  0\n' +
			'  5  1  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclopropane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  3  3  0     0  0            999 V2000\n' +
			'   -3.2250   -0.2750    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -2.2250   -0.2750    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -2.7250    0.5910    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  2  3  1  0     0  0\n' +
			'  1  3  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclobutane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  4  4  0     0  0            999 V2000\n' +
			'   -3.8250    1.5500    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -3.8250    0.5500    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -2.8250    1.5500    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'   -2.8250    0.5500    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  1  2  1  0     0  0\n' +
			'  1  3  1  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  4  2  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cycloheptane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  7  7  0     0  0            999 V2000\n' +
			'    0.0000    1.6293    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.7835    2.2465    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7559    2.0242    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    2.1897    1.1289    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    0.6228    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7566    0.2224    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.7835    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  6  7  1  0     0  0\n' +
			'  5  7  1  0     0  0\n' +
			'  1  5  1  0     0  0\n' +
			'  4  6  1  0     0  0\n' +
			'  3  4  1  0     0  0\n' +
			'  2  3  1  0     0  0\n' +
			'  1  2  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	},
	{
		name: 'cyclooctane',
		molfile:
		'\n' +
			'  Ketcher 11161218352D 1   1.00000     0.00000     0\n' +
			'\n' +
			'  8  8  0     0  0            999 V2000\n' +
			'    0.0000    0.7053    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.0000    1.7078    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.7053    2.4131    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    0.7056    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7079    0.0000    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    2.4133    0.7053    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    2.4133    1.7078    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'    1.7079    2.4131    0.0000 C   0  0  0  0  0  0        0  0  0\n' +
			'  8  3  1  0     0  0\n' +
			'  7  8  1  0     0  0\n' +
			'  6  7  1  0     0  0\n' +
			'  5  6  1  0     0  0\n' +
			'  4  5  1  0     0  0\n' +
			'  1  4  1  0     0  0\n' +
			'  2  3  1  0     0  0\n' +
			'  1  2  1  0     0  0\n' +
			'M  END\n',
		bid: 0,
		aid: 0
	}
];

},{}],38:[function(require,module,exports){
var getXHR = require('xhrpolyfill');
var Promise = require('promise-polyfill');
var util = require('./index.js');

function ajax(options, callback) {
	var xhr = getXHR();
	var headers = options.headers || {};

	xhr.open(options.method, options.url, !!callback, options.user, options.password);

	for (var k in headers) {
		if (headers.hasOwnProperty(k)) {
			xhr.setRequestHeader(k, headers[k]);
		}
	}
	if (typeof options.config === 'function') {
		var maybeXhr = options.config(xhr, options);
		if (maybeXhr !== undefined) {
			xhr = maybeXhr;
		}
	}
	if (options.timeout > 0) {
		setTimeout(function () {
			xhr.status = -1;
			xhr.abort();
		}, options.timeout);
	}
	if (callback) {
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				callback(xhr);
			}
		};
	}
	xhr.send(options.data);
	return xhr;
}

function successful(xhr) {
	return xhr.status >= 200 && xhr.status < 300;
}

function queryString(obj) {
	var str = [];
	for (var prop in obj) {
		if (obj.hasOwnProperty(prop)) { // don't handle nested objects
			str.push(encodeURIComponent(prop) + '=' +
			encodeURIComponent(obj[prop]));
		}
	}
	return str.join('&');
}

function request(opts) {
	var options = util.extend({
		method: 'GET',
		headers: {},
		timeout: 6000
	}, util.isObject(opts) ? opts : { url: opts });
	if (util.isObject(options.data)) {
		options.data = JSON.stringify(options.data);
		options.headers['Content-Type'] = 'application/json; charset=utf-8';
	}
	if (options.params) {
		options.url = options.url + (options.url.indexOf('?') < 0 ? '?' : '&') + queryString(options.params);
	}

	if (!options.sync) {
		return new Promise(function (resolve, reject) {
			ajax(options, function (xhr) {
				var complete = successful(xhr) ? resolve : reject;
				complete(xhr);
			});
		});
	}

	var xhr = ajax(options);
	if (!successful(xhr)) {
		throw xhr;
	}
	return xhr;
}

module.exports = request;

},{"./index.js":40,"promise-polyfill":3,"xhrpolyfill":6}],39:[function(require,module,exports){
var util = require('./index');
var Vec2 = require('./vec2');

var Box2Abs = function () {
	if (arguments.length == 1 && 'min' in arguments[0] && 'max' in arguments[0]) {
		this.p0 = arguments[0].min;
		this.p1 = arguments[0].max;
	}

	if (arguments.length == 2 && arguments[0] instanceof Vec2 && arguments[1] instanceof Vec2) {
		this.p0 = arguments[0];
		this.p1 = arguments[1];
	} else if (arguments.length == 4) {
		this.p0 = new Vec2(arguments[0], arguments[1]);
		this.p1 = new Vec2(arguments[2], arguments[3]);
	} else if (arguments.length == 0) {
		this.p0 = new Vec2();
		this.p1 = new Vec2();
	} else {
		new Error('Box2Abs constructor only accepts 4 numbers or 2 vectors or no arguments!');
	}
};

Box2Abs.prototype.toString = function () {
	return this.p0.toString() + ' ' + this.p1.toString();

};

Box2Abs.fromRelBox = function (relBox) {
	util.assertDefined(relBox);
	return new Box2Abs(relBox.x, relBox.y, relBox.x + relBox.width, relBox.y + relBox.height);
};

Box2Abs.prototype.clone = function () {
	return new Box2Abs(this.p0, this.p1);
};

Box2Abs.union = function (/*Box2Abs*/b1, /*Box2Abs*/b2) {
	util.assertDefined(b1);
	util.assertDefined(b2);
	return new Box2Abs(Vec2.min(b1.p0, b2.p0), Vec2.max(b1.p1, b2.p1));
};

Box2Abs.prototype.extend = function (/*Vec2*/lp, /*Vec2*/rb) {
	util.assertDefined(lp);
	rb = rb || lp;
	return new Box2Abs(this.p0.sub(lp), this.p1.add(rb));
};

Box2Abs.prototype.include = function (/*Vec2*/p) {
	util.assertDefined(p);
	return new Box2Abs(this.p0.min(p), this.p1.max(p));
};

Box2Abs.prototype.contains = function (/*Vec2*/p, /*float*/ext) {
	ext = (ext || 0) - 0;
	util.assertDefined(p);
	return p.x >= this.p0.x - ext && p.x <= this.p1.x + ext && p.y >= this.p0.y - ext && p.y <= this.p1.y + ext;
};

Box2Abs.prototype.translate = function (/*Vec2*/d) {
	util.assertDefined(d);
	return new Box2Abs(this.p0.add(d), this.p1.add(d));
};

Box2Abs.prototype.transform = function (/*function(Vec2):Vec2*/f, context) {
	util.assert(!util.isNullOrUndefined(f));
	return new Box2Abs(f.call(context, this.p0), f.call(context, this.p1));
};

Box2Abs.prototype.sz = function () {
	return this.p1.sub(this.p0);
};

Box2Abs.prototype.centre = function () {
	return Vec2.centre(this.p0, this.p1);
};

Box2Abs.prototype.pos = function () {
	return this.p0;
};

module.exports = Box2Abs;

},{"./index":40,"./vec2":44}],40:[function(require,module,exports){
Array.prototype.swap = function (i1, i2) { //eslint-disable-line
	var tmp = this[i1];
	this[i1] = this[i2];
	this[i2] = tmp;
};

var tfx = function (v) {
	return (v - 0).toFixed(8);
};

// "each" function for an array
var each = function (array, func, context) {
	assert(!isNullOrUndefined(array), 'array must be defined');
	for (var i = 0; i < array.length; ++i) {
		func.call(context, array[i], i);
	}
};

var map_each = function (map, func, context) {
	assert(!isNullOrUndefined(map), 'map must be defined');
	for (var key in map) {
		if (map.hasOwnProperty(key)) {
			func.call(context, key, map[key]);
		}
	}
};

function find(array, pred) {
	for (var i = 0; i < array.length; i++) {
		if (pred(array[i], i, array))
			return array[i];
	}
	return undefined;
}

function findIndex(array, func, context) {
	for (var i = 0; i < array.length; ++i) {
		if (func.call(context, array[i], i)) {
			return i;
		}
	}
	return -1;
};

var findAll = function (array, func, context) {
	var i;
	var ret = [];
	for (i = 0; i < array.length; ++i) {
		if (func.call(context, array[i], i)) {
			ret.push(array[i]);
		}
	}
	return ret;
};

var array = function (arrayLike) {
	var a = [];
	var i = arrayLike.length;
	while (--i >= 0) {
		a[i] = arrayLike[i];
	}
	return a;
};

var isEmpty = function (obj) {
	for (var v in obj) {
		if (obj.hasOwnProperty(v)) {
			return false;
		}
	}
	return true;
};

var stopEventPropagation = function (event) {
	if ('stopPropagation' in event) {// Mozilla, Opera, Safari
		event.stopPropagation();
	} else if ('cancelBubble' in event) {// IE
		event.cancelBubble = true;
	} else {
		throw Error('Browser unrecognized');
	}
};

var preventDefault = function (event) {
	if ('preventDefault' in event) {
		event.preventDefault();
	}
	if (Prototype.Browser.IE) {
		event.returnValue = false;
		event.keyCode = 0;
	}
	return false;
};

var setElementTextContent = function (element, text) {
	if ('textContent' in element) {// Mozilla, Opera, Safari
		element.textContent = text;
	} else if ('innerText' in element) {// IE and others (except Mozilla)
		element.innerText = text;
	} else {
		throw Error('Browser unrecognized');
	}
};

var getElementTextContent = function (element) {
	if ('textContent' in element) {// Mozilla, Opera, Safari
		return element.textContent;
	} else if ('innerText' in element) {// IE and others (except Mozilla)
		return element.innerText;
	}

	throw Error('Browser unrecognized');
};

var stringPadded = function (string, width, leftAligned) {
	var str = string + '';
	var space = '';
	while (str.length + space.length < width) {
		space += ' ';
	}

	return (leftAligned) ? string + space : space + string;
};


// According Unicode Consortium sould be
// nlRe = /\r\n|[\n\v\f\r\x85\u2028\u2029]/g;
// http://www.unicode.org/reports/tr18/#Line_Boundaries
var nlRe = /\r\n|[\n\r]/g;

function normalizeNewlines(str) {
	return str.replace(nlRe, '\n');
};
function splitNewlines(str) {
	return str.split(nlRe);
};

function unicodeLiteral(str){
	function fixedHex(number, length){
		var str = number.toString(16).toUpperCase();
		while(str.length < length)
			str = "0" + str;
		return str;
	}
	var i;
	var result = "";
	for( i = 0; i < str.length; ++i){
		if(str.charCodeAt(i) > 126 || str.charCodeAt(i) < 32)
			result += "\\u" + fixedHex(str.charCodeAt(i),4);
		else
			result += str[i];
	}
	return result;
}


var idList = function (object) {
	var list = [];
	for (var aid in object) {
		if (object.hasOwnProperty(aid)) {
			list.push(aid);
		}
	}
	return list;
};

var mapArray = function (src, map) {
	var dst = [];
	for (var i = 0; i < src.length; ++i) {
		dst.push(map[src[i]]);
	}
	return dst;
};

var arrayMax = function (array) {
	return Math.max.apply(Math, array);
};

var arrayMin = function (array) {
	return Math.min.apply(Math, array);
};

var map = function (src, func, context) {
	var dst = [];
	for (var i = 0; i < src.length; ++i) {
		dst.push(func.call(context, src[i]));
	}
	return dst;
};

var apply = function (array, func) {
	for (var i = 0; i < array.length; ++i) {
		array[i] = func(array[i]);
	}
};

var ifDef = function (dst, src, prop, def) {
	dst[prop] = !Object.isUndefined(src[prop]) ? src[prop] : def;
};

var ifDefList = function (dst, src, prop, def) {
	dst[prop] = !Object.isUndefined(src[prop]) && src[prop] !== null ? array(src[prop]) : def;
};

var identityMap = function (array) {
	var map = {};
	for (var i = 0; i < array.length; ++i) {
		map[array[i]] = array[i];
	}
	return map;
};

var strip = function (src) {
	return src.replace(/\s*$/, '').replace(/^\s*/, '');
};

var stripRight = function (src) {
	return src.replace(/\s*$/, '');
};

var stripQuotes = function (str) {
	if (str[0] === '"' && str[str.length - 1] === '"') {
		return str.substr(1, str.length - 2);
	}
	return str;
};

var paddedFloat = function (number, width, precision) {
	var numStr = number.toFixed(precision).replace(',', '.');
	if (numStr.length > width) {
		throw new Error('number does not fit');
	}
	return stringPadded(numStr, width);
};

var paddedInt = function (number, width) {
	var numStr = number.toFixed(0);
	if (numStr.length > width) {
		throw new Error('number does not fit');
	}
	return stringPadded(numStr, width);
};

var arrayAddIfMissing = function (array, item) {
	for (var i = 0; i < array.length; ++i) {
		if (array[i] === item) {
			return false;
		}
	}
	array.push(item);
	return true;
};

var assert = function (condition, comment) {
	if (!condition) {
		throw new Error(comment ? ('Assertion failed: ' + comment) : 'Assertion failed');
	}
};

var assertDefined = function(v) {
	assert(!isNullOrUndefined(v));
};

var isUndefined = function (variable) {
	return Object.isUndefined(variable); // use prototype.js method for now
};

var isNull = function (variable) {
	return variable === null;
};

var isNullOrUndefined = function (v) {
	return isUndefined(v) || isNull(v);
};

var arrayRemoveByValue = function (array, item) {
	assert(!isUndefined(array) && !isNull(array), 'array must be defined');
	var idx = array.indexOf(item);
	var cnt = 0;
	while (idx >= 0) {
		array.splice(idx, 1);
		cnt += 1;
		idx = array.indexOf(item);
	}
	return cnt;
};

var listNextRotate = function (list, value) {
	return list[(list.indexOf(value) + 1) % list.length];
};

// similar to Object.assign
// http://www.2ality.com/2014/01/object-assign.html
var extend = function (dest, src) {
	for (var prop in src) {
		if (src.hasOwnProperty(prop)) {
			dest[prop] = src[prop];
		}
	}
	return dest;
};

var isObject = function (obj) {
	return obj === Object(obj);
};

var relBox = function (box) {
    return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height
    };
};

module.exports = {
	tfx: tfx,
	each: each,
	find: find,
	findIndex: findIndex,
	findAll: findAll,
	array: array,
	isEmpty: isEmpty,
	stopEventPropagation: stopEventPropagation,
	preventDefault: preventDefault,
	setElementTextContent: setElementTextContent,
	getElementTextContent: getElementTextContent,
	stringPadded: stringPadded,
	normalizeNewlines: normalizeNewlines,
	splitNewlines: splitNewlines,
	unicodeLiteral: unicodeLiteral,
	idList: idList,
	mapArray: mapArray,
	arrayMax: arrayMax,
	arrayMin: arrayMin,
	map: map,
	apply: apply,
	ifDef: ifDef,
	ifDefList: ifDefList,
	identityMap: identityMap,
	strip: strip,
	stripRight: stripRight,
	stripQuotes: stripQuotes,
	paddedFloat: paddedFloat,
	paddedInt: paddedInt,
	arrayAddIfMissing: arrayAddIfMissing,
	assert: assert,
	assertDefined: assertDefined,
	isUndefined: isUndefined,
	isNull: isNull,
	isNullOrUndefined: isNullOrUndefined,
	arrayRemoveByValue: arrayRemoveByValue,
	listNextRotate: listNextRotate,
	extend: extend,
    isObject: isObject,
    relBox: relBox
};

},{}],41:[function(require,module,exports){
var util = require('./index');

var Map = function (obj) {
	if (typeof (obj) !== 'undefined' && obj.constructor !== Object) {
		throw Error('Passed object is not an instance of "Object"!');
	}
	this._obj = obj || {};
	this._count = 0;
};

Map.prototype.each = function (func, context) {
	var v;
	var value;
	var vInt;

	for (v in this._obj) {
		vInt = parseInt(v, 10);
		value = this._obj[v];

		if (!isNaN(vInt)) {
			v = vInt;
		}
		func.call(context, v, value);
	}
};

Map.prototype.map = function (func, context) {
	var ret = new Map();
	this.each(function (v, value) {
		ret.set(v, func.call(context, v, value));
	}, this);
	return ret;
};

Map.prototype.find = function (func, context) {
	var v;
	var vInt;
	var value;

	for (v in this._obj) {
		vInt = parseInt(v, 10);
		value = this._obj[v];

		if (!isNaN(vInt)) {
			v = vInt;
		}
		if (func.call(context, v, value)) {
			return v;
		}
	}
};

Map.prototype.findAll = function (func, context) {
	var v;
	var vInt;
	var value;
	var vv = [];

	for (v in this._obj) {
		vInt = parseInt(v, 10);
		value = this._obj[v];
		if (!isNaN(vInt)) {
			v = vInt;
		}
		if (func.call(context, v, value)) {
			vv.push(v);
		}
	}
	return vv;
};

Map.prototype.keys = function () {
	var keys = [];
	var v;
	for (v in this._obj) {
		keys.push(v);
	}
	return keys;
};

Map.prototype.ikeys = function () {
	var keys = [];
	for (var v in this._obj) {
		keys.push(v - 0);
	}
	return keys;
};

Map.prototype.set = function (key, value) {
	var val;
	this._count += (typeof value !== 'undefined' ? 1 : 0) - (typeof this._obj[key] !== 'undefined' ? 1 : 0);

	if (typeof value === 'undefined') {
		val = this._obj[key];
		delete this._obj[key];
		return val;
	}

	this._obj[key] = value;
	return value;
};

Map.prototype.get = function (key) {
	if (this._obj[key] !== Object.prototype[key]) {
		return this._obj[key];
	}
	return undefined;
};

Map.prototype.has = function (key) {
	return (this._obj[key] !== Object.prototype[key]);
};

Map.prototype.unset = function (key) {
	return this.set(key, undefined);
};

Map.prototype.update = function (object) {
	for (var v in object) {
		this.set(v, object[v]);
	}
};

Map.prototype.clear = function () {
	this._obj = {};
	this._count = 0;
};

Map.prototype.count = function () {
	return this._count;
};

Map.prototype.idList = function () {
	return util.idList(this._obj);
};

Map.prototype.keyOf = function (value) {
	for (var key in this._obj) {
		if (this._obj[key] === value) {
			return key;
		}
	}
};

module.exports = Map;

},{"./index":40}],42:[function(require,module,exports){
var Map = require('./map.js');

var Pool = function () {
	this._map = new Map();
	this._nextId = 0;
};

Pool.prototype.newId = function () {
	return this._nextId++;
};

Pool.prototype.add = function (obj) {
	var id = this._nextId++;
	this._map.set(id, obj);
	return id;
};

Pool.prototype.set = function (id, obj) {
	this._map.set(id, obj);
};

Pool.prototype.get = function (id) {
	return this._map.get(id);
};

Pool.prototype.has = function (id) {
	return this._map.has(id);
};

Pool.prototype.remove = function (id) {
	return this._map.unset(id);
};

Pool.prototype.clear = function () {
	this._map.clear();
};

Pool.prototype.keys = function () {
	return this._map.keys();
};

Pool.prototype.ikeys = function () {
	return this._map.ikeys();
};

Pool.prototype.each = function (func, context) {
	this._map.each(func, context);
};

Pool.prototype.map = function (func, context) {
	return this._map.map(func, context);
};

Pool.prototype.find = function (func, context) {
	return this._map.find(func, context);
};

Pool.prototype.count = function () {
	return this._map.count();
};

Pool.prototype.keyOf = function (value) {
	return this._map.keyOf(value);
};

module.exports = Pool;

},{"./map.js":41}],43:[function(require,module,exports){
var Set = {
	empty: function () {
		return {};
	},

	single: function (item) {
		var set = {};
		Set.add(set, item);
		return set;
	},

	size: function (set) {
		var cnt = 0;
		for (var id in set) {
			if (set[id] !== Object.prototype[id]) {
				cnt++;
			}
		}
		return cnt;
	},

	contains: function (set, v) {
		return typeof (set[v]) !== 'undefined' && set[v] !== Object.prototype[v];
	},

	subset: function (subset, superset) {
		for (var id in subset) {
			if (subset[id] !== Object.prototype[id]) {
				if (superset[id] !== subset[id]) {
					return false;
				}
			}
		}
		return true;
	},

	intersection: function (set1, set2) {
		var set = {};
		for (var id in set1) {
			if (set1[id] !== Object.prototype[id]) {
				if (set2[id] === set1[id]) {
					Set.add(set, id);
				}
			}
		}
		return set;
	},

	disjoint: function (set1, set2) {
		for (var id in set1) {
			if (set1[id] !== Object.prototype[id]) {
				if (set2[id] === set1[id]) {
					return false;
				}
			}
		}
		return true;
	},

	eq: function (set1, set2) {
		return Set.subset(set1, set2) && Set.subset(set2, set1);
	},

	each: function (set, func, context) {
		for (var v in set) {
			if (set[v] !== Object.prototype[v]) {
				func.call(context, set[v]);
			}
		}
	},

	filter: function (set, func, context) {
		var subset = {};
		for (var v in set) {
			if (set[v] !== Object.prototype[v]) {
				if (func.call(context, set[v])) {
					subset[set[v]] = set[v];
				}
			}
		}
		return subset;
	},

	pick: function (set) {
		for (var v in set) {
			if (set[v] !== Object.prototype[v]) {
				return set[v];
			}
		}
		return null;
	},

	list: function (set) {
		var list = [];
		for (var v in set) {
			if (set[v] !== Object.prototype[v]) {
				list.push(set[v]);
			}
		}
		return list;
	},

	add: function (set, item) {
		set[item] = item;
	},

	mergeIn: function (set, other) {
		Set.each(other, function (item) {
			Set.add(set, item);
		});
	},

	remove: function (set, item) {
		var v = set[item];
		delete set[item];
		return v;
	},

	clone: function (other) {
		var set = {};
		Set.mergeIn(set, other);
		return set;
	},

	fromList: function (list) {
		var set = {};
		if (list) {
			for (var i = 0; i < list.length; ++i) {
				set[list[i] - 0] = list[i] - 0;
			}
		}
		return set;
	},

	keySetInt: function (map) {
		var set = {};
		map.each(function (id) {
			set[id - 0] = id - 0;
		});
		return set;
	},

	find: function (set, func, context) {
		for (var v in set) {
			if (set[v] !== Object.prototype[v]) {
				if (func.call(context, set[v])) {
					return v;
				}
			}
		}
		return null;
	}
};

module.exports = Set;

},{}],44:[function(require,module,exports){
var util = require('./index');

var Vec2 = function (x, y)
{
	if (arguments.length == 0) {
		this.x = 0;
		this.y = 0;
	} else if (arguments.length == 1) {
		this.x = parseFloat(x.x);
		this.y = parseFloat(x.y);
	} else if (arguments.length == 2) {
		this.x = parseFloat(x);
		this.y = parseFloat(y);
	} else {
		throw new Error('Vec2(): invalid arguments');
	}
};

Vec2.ZERO = new Vec2(0, 0);
Vec2.UNIT = new Vec2(1, 1);

Vec2.segmentIntersection = function (a, b, c, d) {
	var dc = (a.x - c.x) * (b.y - c.y) - (a.y - c.y) * (b.x - c.x);
	var dd = (a.x - d.x) * (b.y - d.y) - (a.y - d.y) * (b.x - d.x);
	var da = (c.x - a.x) * (d.y - a.y) - (c.y - a.y) * (d.x - a.x);
	var db = (c.x - b.x) * (d.y - b.y) - (c.y - b.y) * (d.x - b.x);
	return dc * dd <= 0 && da * db <= 0;
};

Vec2.prototype.length = function () {
	return Math.sqrt(this.x * this.x + this.y * this.y);
};

Vec2.prototype.equals = function (v) {
	util.assertDefined(v);
	return this.x == v.x && this.y == v.y;
};

Vec2.prototype.add = function (v) {
	util.assertDefined(v);
	return new Vec2(this.x + v.x, this.y + v.y);
};

Vec2.prototype.add_ = function (v) {
	util.assertDefined(v);
	this.x += v.x;
	this.y += v.y;
};

Vec2.prototype.sub = function (v) {
	util.assertDefined(v);
	return new Vec2(this.x - v.x, this.y - v.y);
};

Vec2.prototype.scaled = function (s) {
	util.assertDefined(s);
	return new Vec2(this.x * s, this.y * s);
};

Vec2.prototype.negated = function () {
	return new Vec2(-this.x, -this.y);
};

Vec2.prototype.yComplement = function (y1) {
	y1 = y1 || 0;
	return new Vec2(this.x, y1 - this.y);
};

Vec2.prototype.addScaled = function (v, f) {
	util.assertDefined(v);
	util.assertDefined(f);
	return new Vec2(this.x + v.x * f, this.y + v.y * f);
};

Vec2.prototype.normalized = function () {
	return this.scaled(1 / this.length());
};

Vec2.prototype.normalize = function () {
	var l = this.length();

	if (l < 0.000001)
		return false;

	this.x /= l;
	this.y /= l;

	return true;
};

Vec2.prototype.turnLeft = function () {
	return new Vec2(-this.y, this.x);
};

Vec2.prototype.coordStr = function () {
	return this.x.toString() + ' , ' + this.y.toString();
};

Vec2.prototype.toString = function () {
	return '(' + this.x.toFixed(2) + ',' + this.y.toFixed(2) + ')';
};

Vec2.dist = function (a, b) {
	util.assertDefined(a);
	util.assertDefined(b);
	return Vec2.diff(a, b).length();
};

Vec2.max = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return new Vec2(Math.max(v1.x, v2.x), Math.max(v1.y, v2.y));
};

Vec2.min = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return new Vec2(Math.min(v1.x, v2.x), Math.min(v1.y, v2.y));
};

Vec2.prototype.max = function (v) {
	util.assertDefined(v);
	return new Vec2.max(this, v);
};

Vec2.prototype.min = function (v) {
	util.assertDefined(v);
	return new Vec2.min(this, v);
};

Vec2.prototype.ceil = function () {
	return new Vec2(Math.ceil(this.x), Math.ceil(this.y));
};

Vec2.prototype.floor = function () {
	return new Vec2(Math.floor(this.x), Math.floor(this.y));
};

Vec2.sum = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return new Vec2(v1.x + v2.x, v1.y + v2.y);
};

Vec2.dot = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return v1.x * v2.x + v1.y * v2.y;
};

Vec2.cross = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return v1.x * v2.y - v1.y * v2.x;
};

Vec2.prototype.rotate = function (angle) {
	util.assertDefined(angle);
	var si = Math.sin(angle);
	var co = Math.cos(angle);

	return this.rotateSC(si, co);
};

Vec2.prototype.rotateSC = function (si, co) {
	util.assertDefined(si);
	util.assertDefined(co);
	return new Vec2(this.x * co - this.y * si, this.x * si + this.y * co);
};

Vec2.angle = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return Math.atan2(Vec2.cross(v1, v2), Vec2.dot(v1, v2));
};

Vec2.prototype.oxAngle = function () {
	return Math.atan2(this.y, this.x);
};

Vec2.diff = function (v1, v2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	return new Vec2(v1.x - v2.x, v1.y - v2.y);
};

// assume arguments v1, f1, v2, f2, v3, f3, etc.
// where v[i] are vectors and f[i] are corresponding coefficients
Vec2.lc = function () {
	var v = new Vec2();
	for (var i = 0; i < arguments.length / 2; ++i)
		v = v.addScaled(arguments[2 * i], arguments[2 * i + 1]);
	return v;
};

Vec2.lc2 = function (v1, f1, v2, f2) {
	util.assertDefined(v1);
	util.assertDefined(v2);
	util.assertDefined(f1);
	util.assertDefined(f2);
	return new Vec2(v1.x * f1 + v2.x * f2, v1.y * f1 + v2.y * f2);
};

Vec2.centre = function (v1, v2) {
	return new Vec2.lc2(v1, 0.5, v2, 0.5);
};

// find intersection of a ray and a box and
//  return the shift magnitude to avoid it
Vec2.shiftRayBox = function (/*Vec2*/p, /*Vec2*/d, /*Box2Abs*/bb) {
	util.assertDefined(p);
	util.assertDefined(d);
	util.assertDefined(bb);
	// four corner points of the box
	var b = [bb.p0, new Vec2(bb.p1.x, bb.p0.y),
			bb.p1, new Vec2(bb.p0.x, bb.p1.y)];
	var r = b.map(function (v){return v.sub(p)}); // b relative to p
	d = d.normalized();
	var rc = r.map(function (v){return Vec2.cross(v, d)}); // cross prods
	var rd = r.map(function (v){return Vec2.dot(v, d)}); // dot prods

	// find foremost points on the right and on the left of the ray
	var pid = -1, nid = -1;
	for (var i = 0; i < 4; ++i)
		if (rc[i] > 0)  {if (pid < 0 || rd[pid] < rd[i]) pid = i;}
		else            {if (nid < 0 || rd[nid] < rd[i]) nid = i;}

	if (nid < 0 || pid < 0) // no intersection, no shift
		return 0;

	// check the order
	var id0, id1;
	if (rd[pid] > rd[nid])
		id0 = nid, id1 = pid;
	else
		id0 = pid, id1 = nid;

	// simple proportion to calculate the shift
	return rd[id0] + Math.abs(rc[id0]) * (rd[id1] - rd[id0])
		 / (Math.abs(rc[id0]) + Math.abs(rc[id1]));
};

module.exports = Vec2;

},{"./index":40}]},{},[19])(19)
});